-- Agent Costs Table
-- Tracks per-call LLM token usage and cost for the OpenClaw dashboard.

CREATE TABLE IF NOT EXISTS agent_costs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for dashboard queries
CREATE INDEX idx_agent_costs_recorded_at ON agent_costs (recorded_at DESC);
CREATE INDEX idx_agent_costs_agent_id    ON agent_costs (agent_id);
CREATE INDEX idx_agent_costs_provider    ON agent_costs (provider);

-- Enable RLS but allow service_role full access
ALTER TABLE agent_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON agent_costs
  FOR ALL
  USING (true)
  WITH CHECK (true);
