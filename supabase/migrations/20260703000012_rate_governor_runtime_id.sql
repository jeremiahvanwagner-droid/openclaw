-- ============================================================================
-- OpenClaw Rate Governor — Cross-Runtime Ledger
-- Migration: 012_rate_governor_runtime_id
-- Date: 2026-07-03 (Advancement 1, docs/advancements/01-advancement-supabase-rate-governor.md)
-- Adds runtime_id so multiple runtimes (VPS gateway + workstation) keep
-- distinct daily rows in rate_governor_state, and rebuilds the upsert RPC
-- with a p_runtime_id parameter. Table had 0 rows at migration time
-- (verified live 2026-07-03), so the PK widening is trivially safe.
-- Applied to DB1 (aagqvfwuixpxtdcrdxmv) via MCP on 2026-07-03.
-- ============================================================================

ALTER TABLE rate_governor_state
  ADD COLUMN IF NOT EXISTS runtime_id TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE rate_governor_state DROP CONSTRAINT IF EXISTS rate_governor_state_pkey;
ALTER TABLE rate_governor_state ADD PRIMARY KEY (provider, state_day, runtime_id);

-- Signature change (new trailing parameter) — drop the old overload so RPC
-- name resolution stays unambiguous for PostgREST.
DROP FUNCTION IF EXISTS upsert_rate_governor_state(TEXT, DATE, INTEGER, INTEGER, BOOLEAN, TEXT, INTEGER, BIGINT, BIGINT, TIMESTAMPTZ);

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
  p_saved_at TIMESTAMPTZ DEFAULT NOW(),
  p_runtime_id TEXT DEFAULT 'unknown'
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
    runtime_id,
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
    COALESCE(p_runtime_id, 'unknown'),
    GREATEST(p_spent_cents_delta, 0),
    GREATEST(p_request_count_delta, 0),
    COALESCE(p_warning_emitted, FALSE),
    COALESCE(p_circuit_state, 'closed'),
    GREATEST(p_failures, 0),
    GREATEST(p_last_failure_at, 0),
    GREATEST(p_opened_at, 0),
    COALESCE(p_saved_at, NOW())
  )
  ON CONFLICT (provider, state_day, runtime_id) DO UPDATE
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
