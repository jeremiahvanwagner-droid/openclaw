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
CREATE POLICY "Anon read access on agents" ON agents
  FOR SELECT USING (true);

-- Allow anon role to read agent_events (dashboard metrics)
CREATE POLICY "Anon read access on agent_events" ON agent_events
  FOR SELECT USING (true);

-- Allow anon role to read agent_metrics (dashboard charts)
CREATE POLICY "Anon read access on agent_metrics" ON agent_metrics
  FOR SELECT USING (true);
