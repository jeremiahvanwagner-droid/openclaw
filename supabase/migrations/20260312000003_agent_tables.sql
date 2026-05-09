-- ═══════════════════════════════════════════════════════════════════
-- Open Claw Multi-Agent Network — Database Schema
-- Migration: 003_agent_tables
-- Date: 2026-03-12
-- ═══════════════════════════════════════════════════════════════════

-- Enable pgvector extension (requires Supabase Pro or self-hosted)
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════════
-- AGENT REGISTRY
-- Core table storing all 75 agents with their configuration
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  org_unit TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('executive', 'manager', 'specialist', 'coordinator')),
  llm_model TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('short-term', 'long-term', 'shared', 'none')),
  status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'degraded', 'error')),
  last_heartbeat_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast agent lookup
CREATE INDEX IF NOT EXISTS agents_agent_id_idx ON agents(agent_id);
CREATE INDEX IF NOT EXISTS agents_org_unit_idx ON agents(org_unit);
CREATE INDEX IF NOT EXISTS agents_status_idx ON agents(status);

-- ═══════════════════════════════════════════════════════════════════
-- AGENT MEMORY (pgvector embeddings)
-- Stores semantic memory with vector embeddings for similarity search
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-ada-002 dimension
  memory_scope TEXT NOT NULL CHECK (memory_scope IN ('private', 'division', 'global')),
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for similarity search using IVFFlat
CREATE INDEX IF NOT EXISTS agent_memory_embedding_idx 
  ON agent_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for agent-specific memory queries
CREATE INDEX IF NOT EXISTS agent_memory_agent_idx ON agent_memory(agent_id);
CREATE INDEX IF NOT EXISTS agent_memory_scope_idx ON agent_memory(memory_scope);

-- Partial indexes for scope filtering
CREATE INDEX IF NOT EXISTS agent_memory_private_idx 
  ON agent_memory(agent_id) 
  WHERE memory_scope = 'private';

CREATE INDEX IF NOT EXISTS agent_memory_division_idx 
  ON agent_memory(agent_id) 
  WHERE memory_scope = 'division';

-- ═══════════════════════════════════════════════════════════════════
-- AGENT EVENTS LOG
-- Records all inter-agent communication and events
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  source_agent TEXT NOT NULL,
  target_agent TEXT,
  target_division TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  correlation_id UUID,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for event querying
CREATE INDEX IF NOT EXISTS agent_events_source_idx ON agent_events(source_agent);
CREATE INDEX IF NOT EXISTS agent_events_target_idx ON agent_events(target_agent);
CREATE INDEX IF NOT EXISTS agent_events_target_division_idx ON agent_events(target_division);
CREATE INDEX IF NOT EXISTS agent_events_created_idx ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_events_correlation_idx ON agent_events(correlation_id);
CREATE INDEX IF NOT EXISTS agent_events_priority_idx ON agent_events(priority) WHERE priority IN ('high', 'critical');

-- ═══════════════════════════════════════════════════════════════════
-- AGENT METRICS
-- Stores operational metrics for monitoring and dashboards
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for metrics queries
CREATE INDEX IF NOT EXISTS agent_metrics_agent_idx ON agent_metrics(agent_id);
CREATE INDEX IF NOT EXISTS agent_metrics_type_idx ON agent_metrics(metric_type);
CREATE INDEX IF NOT EXISTS agent_metrics_recorded_idx ON agent_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS agent_metrics_agent_time_idx ON agent_metrics(agent_id, recorded_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- AGENT SESSIONS
-- Tracks active agent sessions for concurrency control
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('main', 'isolated', 'cron')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  context JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_sessions_agent_idx ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS agent_sessions_active_idx ON agent_sessions(agent_id) WHERE ended_at IS NULL;
-- Partial unique index replacing the invalid WHERE clause in the original CONSTRAINT definition
CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_one_active_idx ON agent_sessions(agent_id, session_type) WHERE ended_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to agents table
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- SEMANTIC MEMORY SEARCH
-- RPC function for finding similar memories using pgvector
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION match_agent_memories(
  query_embedding vector(1536),
  agent_id_filter TEXT,
  division_filter TEXT,
  include_shared BOOLEAN DEFAULT TRUE,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB,
  memory_scope TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    am.content,
    1 - (am.embedding <=> query_embedding) AS similarity,
    am.metadata,
    am.memory_scope,
    am.created_at
  FROM agent_memory am
  WHERE 
    -- Private memories for the requesting agent
    (am.agent_id = agent_id_filter AND am.memory_scope = 'private')
    -- Division-shared memories from same division
    OR (include_shared AND am.memory_scope = 'division' AND am.agent_id IN (
      SELECT a.agent_id FROM agents a WHERE a.org_unit = division_filter
    ))
    -- Globally shared memories
    OR (include_shared AND am.memory_scope = 'global')
  -- Filter out expired memories
  AND (am.expires_at IS NULL OR am.expires_at > NOW())
  ORDER BY am.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- AGENT HEALTH SUMMARY
-- Aggregated health status by division
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_agent_health_summary()
RETURNS TABLE (
  org_unit TEXT,
  total_agents BIGINT,
  active_count BIGINT,
  inactive_count BIGINT,
  degraded_count BIGINT,
  error_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.org_unit,
    COUNT(*)::BIGINT AS total_agents,
    COUNT(*) FILTER (WHERE a.status = 'active')::BIGINT AS active_count,
    COUNT(*) FILTER (WHERE a.status = 'inactive')::BIGINT AS inactive_count,
    COUNT(*) FILTER (WHERE a.status = 'degraded')::BIGINT AS degraded_count,
    COUNT(*) FILTER (WHERE a.status = 'error')::BIGINT AS error_count
  FROM agents a
  GROUP BY a.org_unit
  ORDER BY a.org_unit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- UPDATE AGENT HEARTBEAT
-- Called by agents to report they are alive
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_agent_heartbeat(p_agent_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE agents 
  SET last_heartbeat_at = NOW(),
      status = CASE 
        WHEN status = 'error' THEN 'degraded'
        WHEN status = 'inactive' THEN 'active'
        ELSE status
      END
  WHERE agent_id = p_agent_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RECORD AGENT METRIC
-- Helper to insert metrics with automatic timestamp
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_agent_metric(
  p_agent_id TEXT,
  p_metric_type TEXT,
  p_metric_value NUMERIC,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO agent_metrics (agent_id, metric_type, metric_value, metadata)
  VALUES (p_agent_id, p_metric_type, p_metric_value, p_metadata)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (Optional - Enable in production)
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for backend)
CREATE POLICY "Service role full access on agents" ON agents
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on agent_memory" ON agent_memory
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on agent_events" ON agent_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on agent_metrics" ON agent_metrics
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on agent_sessions" ON agent_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════
-- SEED DATA: Foundation Agents (Phase 1)
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO agents (agent_id, display_name, org_unit, role_type, llm_model, memory_type, status, config)
VALUES 
  (
    'shared_master_orchestrator',
    'Master Orchestrator',
    'division_7_shared_services',
    'executive',
    'claude-sonnet-4.5',
    'shared',
    'active',
    '{"escalation_path": "d1_ceo", "tools_required": ["inngest_health_check", "supabase_agent_query", "telegram_alert"], "cron_schedule": "hourly"}'::JSONB
  ),
  (
    'd1_ceo',
    'CEO — Chief Executive Officer',
    'division_1_core_operations',
    'executive',
    'claude-opus-4',
    'long-term',
    'active',
    '{"escalation_path": "shared_master_orchestrator", "tools_required": ["ghl_pipeline_view", "stripe_dashboard", "telegram_send"], "cron_schedule": "daily"}'::JSONB
  ),
  (
    'd1_cto',
    'CTO — Chief Technology Officer',
    'division_1_core_operations',
    'executive',
    'claude-opus-4',
    'long-term',
    'active',
    '{"escalation_path": "d1_ceo", "tools_required": ["github_api", "vercel_api", "supabase_admin", "inngest_dashboard"], "cron_schedule": "daily"}'::JSONB
  )
ON CONFLICT (agent_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  org_unit = EXCLUDED.org_unit,
  role_type = EXCLUDED.role_type,
  llm_model = EXCLUDED.llm_model,
  memory_type = EXCLUDED.memory_type,
  config = EXCLUDED.config,
  updated_at = NOW();
