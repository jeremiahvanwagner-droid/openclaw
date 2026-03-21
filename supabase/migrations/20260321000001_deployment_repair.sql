-- ═══════════════════════════════════════════════════════════════════
-- OpenClaw Deployment Repair Migration
-- Date: 2026-03-21
-- Fixes: CRIT-06, CRIT-07
-- Adds missing tables, columns, and constraints required by the
-- agent orchestrator, pod quarantine, and credential health features.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. Add missing columns to agents table
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS pod_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_class TEXT DEFAULT 'worker',
  ADD COLUMN IF NOT EXISTS heartbeat_policy TEXT DEFAULT 'on_run'
    CHECK (heartbeat_policy IN ('always_on', 'on_run', 'none')),
  ADD COLUMN IF NOT EXISTS criticality TEXT DEFAULT 'normal'
    CHECK (criticality IN ('critical', 'high', 'normal', 'low'));

CREATE INDEX IF NOT EXISTS agents_pod_id_idx ON agents(pod_id);
CREATE INDEX IF NOT EXISTS agents_agent_class_idx ON agents(agent_class);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Drop and recreate agents status CHECK constraint to include 'quarantined'
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_status_check;
ALTER TABLE agents ADD CONSTRAINT agents_status_check
  CHECK (status IN ('active', 'inactive', 'degraded', 'error', 'quarantined'));

-- ═══════════════════════════════════════════════════════════════════
-- 3. Add missing columns to agent_sessions table
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS pod_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS agent_sessions_pod_id_idx ON agent_sessions(pod_id);

-- ═══════════════════════════════════════════════════════════════════
-- 4. Create health_snapshots table
-- Used by pod quarantine/restore to record health state transitions
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('pod', 'division', 'system')),
  pod_id TEXT,
  status TEXT NOT NULL,
  summary JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS health_snapshots_type_idx ON health_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS health_snapshots_pod_idx ON health_snapshots(pod_id);
CREATE INDEX IF NOT EXISTS health_snapshots_created_idx ON health_snapshots(created_at DESC);

ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on health_snapshots" ON health_snapshots
  FOR ALL USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════
-- 5. Create credential_registry table
-- Tracks API credentials, their rotation status, and health checks
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS credential_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  service TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  last_verified_status TEXT DEFAULT 'unknown'
    CHECK (last_verified_status IN ('valid', 'expired', 'error', 'unknown')),
  rotation_interval_days INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credential_registry_key_idx ON credential_registry(credential_key);
CREATE INDEX IF NOT EXISTS credential_registry_expires_idx ON credential_registry(expires_at);

ALTER TABLE credential_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on credential_registry" ON credential_registry
  FOR ALL USING (auth.role() = 'service_role');

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_credential_registry_updated_at ON credential_registry;
CREATE TRIGGER update_credential_registry_updated_at
  BEFORE UPDATE ON credential_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- 6. Create agent_performance table
-- Stores performance metrics for training and review cycles
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  tasks_completed INT DEFAULT 0,
  tasks_failed INT DEFAULT 0,
  avg_response_time_ms NUMERIC,
  quality_score NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_performance_agent_idx ON agent_performance(agent_id);
CREATE INDEX IF NOT EXISTS agent_performance_period_idx ON agent_performance(period_start, period_end);

ALTER TABLE agent_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_performance" ON agent_performance
  FOR ALL USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════
-- 7. Create get_expiring_credentials RPC function
-- Returns credentials expiring within the next N days
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_expiring_credentials(p_days_ahead INT DEFAULT 14)
RETURNS TABLE (
  credential_key TEXT,
  display_name TEXT,
  service TEXT,
  expires_at TIMESTAMPTZ,
  days_remaining NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.credential_key,
    cr.display_name,
    cr.service,
    cr.expires_at,
    EXTRACT(EPOCH FROM (cr.expires_at - NOW())) / 86400.0 AS days_remaining
  FROM credential_registry cr
  WHERE cr.expires_at IS NOT NULL
    AND cr.expires_at <= NOW() + (p_days_ahead || ' days')::INTERVAL
  ORDER BY cr.expires_at ASC;
END;
$$;
