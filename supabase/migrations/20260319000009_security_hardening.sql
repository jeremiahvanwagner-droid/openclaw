-- Security hardening follow-up
-- Removes anonymous dashboard access to raw audit tables and introduces
-- an operation ledger for replay/idempotency enforcement.

DROP POLICY IF EXISTS "Anon read access on agents" ON agents;
DROP POLICY IF EXISTS "Anon read access on agent_events" ON agent_events;
DROP POLICY IF EXISTS "Anon read access on agent_metrics" ON agent_metrics;

CREATE TABLE IF NOT EXISTS operation_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key TEXT NOT NULL UNIQUE,
  operation_type TEXT NOT NULL,
  actor TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  source_table TEXT,
  source_id UUID,
  correlation_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS operation_ledger_status_idx
  ON operation_ledger (status, created_at DESC);

ALTER TABLE operation_ledger ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE operation_ledger IS
  'Idempotency ledger for dashboard replays and other side-effectful control-plane operations.';
