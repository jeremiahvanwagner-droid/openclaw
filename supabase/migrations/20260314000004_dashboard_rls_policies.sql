-- ═══════════════════════════════════════════════════════════════════
-- Dashboard Read Access — RLS Policies for Anon Key
-- Migration: 004_dashboard_rls_policies
-- Date: 2026-03-14
-- 
-- Adds SELECT policies so the dashboard (using anon key) can read
-- agent registry and event data. Write access remains restricted
-- to service_role only.
-- ═══════════════════════════════════════════════════════════════════

-- Allow anon role to read the agents table (dashboard overview)
DROP POLICY IF EXISTS "Anon read access on agents" ON agents;
CREATE POLICY "Anon read access on agents" ON agents
  FOR SELECT USING (true);

-- Allow anon role to read agent_events (dashboard metrics)
DROP POLICY IF EXISTS "Anon read access on agent_events" ON agent_events;
CREATE POLICY "Anon read access on agent_events" ON agent_events
  FOR SELECT USING (true);

-- Allow anon role to read agent_metrics (dashboard charts)
DROP POLICY IF EXISTS "Anon read access on agent_metrics" ON agent_metrics;
CREATE POLICY "Anon read access on agent_metrics" ON agent_metrics
  FOR SELECT USING (true);
