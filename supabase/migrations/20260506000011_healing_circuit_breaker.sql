-- Migration: healing_circuit_breaker
-- Creates the circuit breaker table used by self-healing-coding.ts.
-- Column is named `circuit_key` to match the TypeScript code exactly.
-- NOTE: If you previously ran the manual SQL from DEPLOY-CHECKLIST.md (which
-- used `key` instead of `circuit_key`), run the ALTER TABLE statement at the
-- bottom of this file first, then apply this migration.

CREATE TABLE IF NOT EXISTS healing_circuit_breaker (
  circuit_key   TEXT        PRIMARY KEY,
  failure_count INTEGER     NOT NULL DEFAULT 0,
  last_failure  TIMESTAMPTZ,
  state         TEXT        NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open')),
  opened_at     TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup when checking state before each healing attempt
CREATE INDEX IF NOT EXISTS idx_hcb_state ON healing_circuit_breaker (state);

-- Automatically update `updated_at` on any row change
CREATE OR REPLACE FUNCTION set_hcb_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hcb_updated_at ON healing_circuit_breaker;
CREATE TRIGGER trg_hcb_updated_at
  BEFORE UPDATE ON healing_circuit_breaker
  FOR EACH ROW EXECUTE FUNCTION set_hcb_updated_at();

-- ---------------------------------------------------------------------------
-- If the table already exists with column name `key` (from the manual SQL in
-- DEPLOY-CHECKLIST.md), run this BEFORE applying the migration above:
--
--   ALTER TABLE healing_circuit_breaker RENAME COLUMN "key" TO circuit_key;
--
-- ---------------------------------------------------------------------------
