-- ═══════════════════════════════════════════════════════════════════
-- fix-rls-policies.sql
-- OpenClaw Multi-Agent Network — RLS Policy Hardening
--
-- Fixes audit findings SEC-02 and DB-02:
--   SEC-02: "Anon read access" policies use USING (true) — any anonymous
--           caller with the leaked anon key can read all rows.
--   DB-02:  agent_costs has FOR ALL USING (true) — full read + write
--           for everyone, including unauthenticated callers.
--
-- Strategy after fix:
--   • service_role  → full access on all tables (backend writes)
--   • authenticated → SELECT-only on all operational tables (dashboard
--                     users who are signed in via Supabase Auth)
--   • anon          → NO access by default; dashboard reads must go
--                     through server-side authenticated routes
--
-- How to apply:
--   psql $DATABASE_URL -f fix-rls-policies.sql
--   OR via Supabase Dashboard → SQL Editor → run this file
--
-- After applying, update the dashboard to use server-side auth:
--   Replace direct anon-key client reads with authenticated SSR calls
--   (see dashboard/app/supabase-server.ts for the server client).
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 1. DROP DANGEROUS WIDE-OPEN POLICIES
--    These were created by migration 004_dashboard_rls_policies.sql
--    and 20260316_create_agent_costs.sql with USING (true) — meaning
--    any role, including unauthenticated anon, can read/write.
-- ──────────────────────────────────────────────────────────────────

-- agent_costs: was FOR ALL USING (true) WITH CHECK (true) — CRITICAL
DROP POLICY IF EXISTS "Service role full access"               ON agent_costs;
-- Belt-and-suspenders: drop any variant names that might exist
DROP POLICY IF EXISTS "service_role full access on agent_costs" ON agent_costs;
DROP POLICY IF EXISTS "Anon read access on agent_costs"        ON agent_costs;

-- agents: was FOR SELECT USING (true)
DROP POLICY IF EXISTS "Anon read access on agents"             ON agents;

-- agent_events: was FOR SELECT USING (true)
DROP POLICY IF EXISTS "Anon read access on agent_events"       ON agent_events;

-- agent_metrics: was FOR SELECT USING (true)
DROP POLICY IF EXISTS "Anon read access on agent_metrics"      ON agent_metrics;

-- ──────────────────────────────────────────────────────────────────
-- 2. AGENT_COSTS — service_role write + authenticated read
--    Cost data is sensitive (exposes LLM spend per agent per day).
--    Only the backend service account should insert/update rows.
--    Dashboard users (authenticated role) can read for the cost view.
--    Anonymous callers get nothing.
-- ──────────────────────────────────────────────────────────────────

-- Full CRUD for the backend service account
CREATE POLICY "Service role full access on agent_costs"
  ON agent_costs
  FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Read-only for signed-in dashboard users
CREATE POLICY "Authenticated read on agent_costs"
  ON agent_costs
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────────
-- 3. AGENTS — service_role write + authenticated read
--    The agents registry is operational data. Dashboard users need
--    SELECT to render the agents list. No anon access.
-- ──────────────────────────────────────────────────────────────────

-- Full CRUD for backend (seeding, status updates, config changes)
CREATE POLICY "Service role full access on agents"
  ON agents
  FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Read-only for signed-in dashboard users
CREATE POLICY "Authenticated read on agents"
  ON agents
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────────
-- 4. AGENT_EVENTS — service_role write + authenticated read
--    Event data drives the live feed and replay features.
--    Only backend should insert; dashboard users read.
-- ──────────────────────────────────────────────────────────────────

CREATE POLICY "Service role full access on agent_events"
  ON agent_events
  FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated read on agent_events"
  ON agent_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────────
-- 5. AGENT_METRICS — service_role write + authenticated read
--    Prometheus-style metric snapshots. Backend writes, dashboard reads.
-- ──────────────────────────────────────────────────────────────────

CREATE POLICY "Service role full access on agent_metrics"
  ON agent_metrics
  FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated read on agent_metrics"
  ON agent_metrics
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────────
-- 6. VERIFY RLS IS ENABLED ON ALL AFFECTED TABLES
--    These should already have RLS enabled from prior migrations,
--    but we re-assert to be safe.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE agent_costs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics  ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────
-- 7. SMOKE-TEST QUERY (run manually after applying)
--    Expected: no rows returned for anon role on any of these tables.
--
--    SET ROLE anon;
--    SELECT COUNT(*) FROM agent_costs;   -- should error or return 0
--    SELECT COUNT(*) FROM agents;        -- should error or return 0
--    RESET ROLE;
-- ──────────────────────────────────────────────────────────────────

COMMIT;

-- ──────────────────────────────────────────────────────────────────
-- POST-MIGRATION CHECKLIST
-- ──────────────────────────────────────────────────────────────────
-- [ ] Rotate the leaked Supabase anon key (project: aagqvfwuixpxtdcrdxmv)
--     via Supabase Dashboard → Settings → API → Regenerate anon key
-- [ ] Remove hardcoded keys from deploy/hostinger/deploy.sh (see fix-deploy-secrets.sh)
-- [ ] Update dashboard to use authenticated server-side Supabase client
--     for all reads — the anon client in dashboard/app/supabase.ts will
--     now receive empty result sets for all protected tables.
-- [ ] Confirm dashboard login flow works end-to-end after this migration.
