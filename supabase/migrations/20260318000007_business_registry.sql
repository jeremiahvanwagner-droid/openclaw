-- ============================================================================
-- OpenClaw Portfolio Registry
-- Migration: 007_business_registry
-- Date: 2026-03-18
-- Adds 10-business portfolio registry, daily scorecards, and approval queue.
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT UNIQUE NOT NULL,
  pod_id TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  legal_entity TEXT NOT NULL,
  domain TEXT,
  offer_model TEXT NOT NULL,
  vertical TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'incubating', 'internal')),
  ghl_scope_type TEXT NOT NULL CHECK (
    ghl_scope_type IN (
      'dedicated_subaccount',
      'shared_subaccount',
      'shared_incubator_subaccount',
      'internal_operations_subaccount'
    )
  ),
  owner_pod TEXT NOT NULL,
  payment_provider TEXT NOT NULL,
  calendar_model TEXT NOT NULL,
  pipeline_set JSONB NOT NULL DEFAULT '[]'::jsonb,
  membership_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  kpi_targets JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenancy JSONB NOT NULL DEFAULT '{}'::jsonb,
  automation_blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollout JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS business_registry_pod_idx ON business_registry(pod_id);
CREATE INDEX IF NOT EXISTS business_registry_scope_idx ON business_registry(ghl_scope_type);
CREATE INDEX IF NOT EXISTS business_registry_status_idx ON business_registry(status);

DROP TRIGGER IF EXISTS update_business_registry_updated_at ON business_registry;
CREATE TRIGGER update_business_registry_updated_at
  BEFORE UPDATE ON business_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS business_daily_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL REFERENCES business_registry(business_id) ON DELETE CASCADE,
  scorecard_date DATE NOT NULL DEFAULT CURRENT_DATE,
  automation_rate NUMERIC NOT NULL DEFAULT 0 CHECK (automation_rate >= 0 AND automation_rate <= 1),
  first_response_seconds NUMERIC,
  booking_autonomy_rate NUMERIC CHECK (booking_autonomy_rate IS NULL OR (booking_autonomy_rate >= 0 AND booking_autonomy_rate <= 1)),
  dunning_sla_minutes NUMERIC,
  access_event_coverage NUMERIC CHECK (access_event_coverage IS NULL OR (access_event_coverage >= 0 AND access_event_coverage <= 1)),
  human_queue_share NUMERIC CHECK (human_queue_share IS NULL OR (human_queue_share >= 0 AND human_queue_share <= 1)),
  dead_letter_count INTEGER NOT NULL DEFAULT 0,
  workflow_failure_count INTEGER NOT NULL DEFAULT 0,
  reputation_spike_count INTEGER NOT NULL DEFAULT 0,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT business_daily_scorecards_unique UNIQUE (business_id, scorecard_date)
);

CREATE INDEX IF NOT EXISTS business_daily_scorecards_date_idx
  ON business_daily_scorecards(scorecard_date DESC);

DROP TRIGGER IF EXISTS update_business_daily_scorecards_updated_at ON business_daily_scorecards;
CREATE TRIGGER update_business_daily_scorecards_updated_at
  BEFORE UPDATE ON business_daily_scorecards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS business_approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL REFERENCES business_registry(business_id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_by TEXT,
  approved_by TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS business_approval_queue_status_idx
  ON business_approval_queue(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS business_approval_queue_business_idx
  ON business_approval_queue(business_id, requested_at DESC);

ALTER TABLE business_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_daily_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_approval_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read access on business_registry" ON business_registry;
CREATE POLICY "Anon read access on business_registry" ON business_registry
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon read access on business_daily_scorecards" ON business_daily_scorecards;
CREATE POLICY "Anon read access on business_daily_scorecards" ON business_daily_scorecards
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access on business_registry" ON business_registry;
CREATE POLICY "Service role full access on business_registry" ON business_registry
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access on business_daily_scorecards" ON business_daily_scorecards;
CREATE POLICY "Service role full access on business_daily_scorecards" ON business_daily_scorecards
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access on business_approval_queue" ON business_approval_queue;
CREATE POLICY "Service role full access on business_approval_queue" ON business_approval_queue
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
