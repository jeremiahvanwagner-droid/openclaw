-- ============================================================================
-- OpenClaw Human Approval + Governor State
-- Migration: 008_human_approval_and_governor_state
-- Date: 2026-03-19
-- Adds a generic HITL approval queue, shared governor persistence, and aligns
-- agent_events with the runtime fields already in use.
-- ============================================================================

ALTER TABLE agent_events
  ALTER COLUMN correlation_id TYPE TEXT USING correlation_id::text;

ALTER TABLE agent_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE agent_events
SET status = CASE
  WHEN error_message IS NOT NULL THEN 'failed'
  WHEN processed_at IS NOT NULL THEN 'completed'
  ELSE 'pending'
END
WHERE status IS NULL OR status = '' OR status = 'pending';

CREATE INDEX IF NOT EXISTS agent_events_status_idx ON agent_events(status);

CREATE TABLE IF NOT EXISTS human_approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL,
  action_family TEXT NOT NULL,
  source_agent TEXT,
  target_agent TEXT,
  correlation_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executing')),
  payload_preview TEXT,
  full_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by TEXT,
  resolved_by TEXT,
  resolution_channel TEXT,
  resolution_note TEXT,
  notification_chat_id TEXT,
  notification_message_id BIGINT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);

CREATE INDEX IF NOT EXISTS human_approval_queue_status_idx
  ON human_approval_queue(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS human_approval_queue_action_idx
  ON human_approval_queue(action_family, requested_at DESC);
CREATE INDEX IF NOT EXISTS human_approval_queue_correlation_idx
  ON human_approval_queue(correlation_id);

ALTER TABLE human_approval_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on human_approval_queue" ON human_approval_queue;
CREATE POLICY "Service role full access on human_approval_queue" ON human_approval_queue
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS rate_governor_state (
  provider TEXT NOT NULL,
  state_day DATE NOT NULL,
  spent_cents INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  warning_emitted BOOLEAN NOT NULL DEFAULT FALSE,
  circuit_state TEXT NOT NULL DEFAULT 'closed'
    CHECK (circuit_state IN ('closed', 'open', 'half-open')),
  failures INTEGER NOT NULL DEFAULT 0,
  last_failure_at BIGINT NOT NULL DEFAULT 0,
  opened_at BIGINT NOT NULL DEFAULT 0,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, state_day)
);

CREATE INDEX IF NOT EXISTS rate_governor_state_saved_at_idx
  ON rate_governor_state(saved_at DESC);

ALTER TABLE rate_governor_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on rate_governor_state" ON rate_governor_state;
CREATE POLICY "Service role full access on rate_governor_state" ON rate_governor_state
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION upsert_rate_governor_state(
  p_provider TEXT,
  p_state_day DATE,
  p_spent_cents_delta INTEGER DEFAULT 0,
  p_request_count_delta INTEGER DEFAULT 0,
  p_warning_emitted BOOLEAN DEFAULT FALSE,
  p_circuit_state TEXT DEFAULT 'closed',
  p_failures INTEGER DEFAULT 0,
  p_last_failure_at BIGINT DEFAULT 0,
  p_opened_at BIGINT DEFAULT 0,
  p_saved_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS rate_governor_state
LANGUAGE plpgsql
AS $$
DECLARE
  v_row rate_governor_state;
BEGIN
  INSERT INTO rate_governor_state (
    provider,
    state_day,
    spent_cents,
    request_count,
    warning_emitted,
    circuit_state,
    failures,
    last_failure_at,
    opened_at,
    saved_at
  )
  VALUES (
    p_provider,
    p_state_day,
    GREATEST(p_spent_cents_delta, 0),
    GREATEST(p_request_count_delta, 0),
    COALESCE(p_warning_emitted, FALSE),
    COALESCE(p_circuit_state, 'closed'),
    GREATEST(p_failures, 0),
    GREATEST(p_last_failure_at, 0),
    GREATEST(p_opened_at, 0),
    COALESCE(p_saved_at, NOW())
  )
  ON CONFLICT (provider, state_day) DO UPDATE
  SET
    spent_cents = rate_governor_state.spent_cents + GREATEST(COALESCE(p_spent_cents_delta, 0), 0),
    request_count = rate_governor_state.request_count + GREATEST(COALESCE(p_request_count_delta, 0), 0),
    warning_emitted = rate_governor_state.warning_emitted OR COALESCE(p_warning_emitted, FALSE),
    circuit_state = CASE
      WHEN COALESCE(p_circuit_state, 'closed') = 'open' THEN 'open'
      WHEN rate_governor_state.circuit_state = 'open' AND COALESCE(p_circuit_state, 'closed') = 'closed' THEN 'closed'
      WHEN COALESCE(p_circuit_state, 'closed') = 'half-open' THEN 'half-open'
      ELSE COALESCE(p_circuit_state, rate_governor_state.circuit_state)
    END,
    failures = CASE
      WHEN COALESCE(p_circuit_state, 'closed') = 'closed' THEN GREATEST(COALESCE(p_failures, 0), 0)
      ELSE GREATEST(rate_governor_state.failures, COALESCE(p_failures, 0))
    END,
    last_failure_at = GREATEST(rate_governor_state.last_failure_at, COALESCE(p_last_failure_at, 0)),
    opened_at = GREATEST(rate_governor_state.opened_at, COALESCE(p_opened_at, 0)),
    saved_at = COALESCE(p_saved_at, NOW())
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
