-- Phase 1: Foundation Skills Tables
-- Skills 3 (Cross-Business Scope Governor), 6 (Self-Healing Integrations), 10 (Autonomous QA & Compliance)

-- ═══════════════════════════════════════════════════════════════════
-- SKILL 3: Cross-Business Scope Governor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scope_baselines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_json jsonb NOT NULL,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scope_baselines_created ON scope_baselines (created_at DESC);

CREATE TABLE IF NOT EXISTS scope_audit_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type     text NOT NULL CHECK (audit_type IN ('compliance', 'drift', 'isolation', 'policy')),
  findings_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity       text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  resolved       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scope_audit_severity ON scope_audit_results (severity, resolved);
CREATE INDEX idx_scope_audit_created ON scope_audit_results (created_at DESC);

CREATE TABLE IF NOT EXISTS scope_violations_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     text NOT NULL,
  resource     text NOT NULL,
  operation    text NOT NULL,
  business_id  text,
  blocked      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scope_violations_agent ON scope_violations_log (agent_id);
CREATE INDEX idx_scope_violations_created ON scope_violations_log (created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- SKILL 6: Self-Healing Integrations
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS integration_health_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL,
  endpoint    text NOT NULL,
  status      text NOT NULL CHECK (status IN ('healthy', 'degraded', 'dead')),
  latency_ms  integer,
  error       text,
  checked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_health_provider ON integration_health_log (provider, checked_at DESC);
CREATE INDEX idx_integration_health_status ON integration_health_log (status) WHERE status != 'healthy';

CREATE TABLE IF NOT EXISTS integration_heal_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  failure_type  text NOT NULL CHECK (failure_type IN ('transient', 'degraded', 'dead')),
  action_taken  text NOT NULL,
  result        text NOT NULL CHECK (result IN ('healed', 'failed', 'escalated')),
  details_json  jsonb DEFAULT '{}'::jsonb,
  healed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_heal_events_provider ON integration_heal_events (provider, healed_at DESC);
CREATE INDEX idx_heal_events_result ON integration_heal_events (result) WHERE result != 'healed';

-- ═══════════════════════════════════════════════════════════════════
-- SKILL 10: Autonomous QA & Compliance
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS qa_audit_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id    text NOT NULL,
  business_id    text NOT NULL,
  audit_type     text NOT NULL CHECK (audit_type IN ('funnel', 'tracking', 'brand', 'policy', 'mobile_ux')),
  score          integer CHECK (score >= 0 AND score <= 100),
  findings_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qa_audit_business ON qa_audit_results (business_id, created_at DESC);
CREATE INDEX idx_qa_audit_location ON qa_audit_results (location_id, audit_type);
CREATE INDEX idx_qa_audit_score ON qa_audit_results (score) WHERE score < 70;

CREATE TABLE IF NOT EXISTS compliance_scorecards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id           text NOT NULL,
  overall_score         integer NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  category_scores_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  period                text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_location ON compliance_scorecards (location_id, created_at DESC);
CREATE INDEX idx_compliance_period ON compliance_scorecards (period);
CREATE INDEX idx_compliance_score ON compliance_scorecards (overall_score) WHERE overall_score < 70;

-- ═══════════════════════════════════════════════════════════════════
-- RLS Policies (match existing security-hardening patterns)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE scope_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_audit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_violations_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_health_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_heal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_audit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_scorecards ENABLE ROW LEVEL SECURITY;

-- Service role has full access (all agent operations go through service role)
CREATE POLICY service_role_all ON scope_baselines FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON scope_audit_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON scope_violations_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON integration_health_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON integration_heal_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON qa_audit_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON compliance_scorecards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Dashboard read-only access for authenticated users
CREATE POLICY dashboard_read ON scope_baselines FOR SELECT TO authenticated USING (true);
CREATE POLICY dashboard_read ON scope_audit_results FOR SELECT TO authenticated USING (true);
CREATE POLICY dashboard_read ON scope_violations_log FOR SELECT TO authenticated USING (true);
CREATE POLICY dashboard_read ON integration_health_log FOR SELECT TO authenticated USING (true);
CREATE POLICY dashboard_read ON integration_heal_events FOR SELECT TO authenticated USING (true);
CREATE POLICY dashboard_read ON qa_audit_results FOR SELECT TO authenticated USING (true);
CREATE POLICY dashboard_read ON compliance_scorecards FOR SELECT TO authenticated USING (true);
