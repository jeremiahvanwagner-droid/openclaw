-- Phase 2: Intelligence Layer Tables
-- Skills 2 (Autonomous Revenue Ops), 8 (Customer Journey Intelligence), 5 (Executive Command Center)

-- ═══════════════════════════════════════════════════════════════════
-- Skill 2: Autonomous Revenue Ops
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_kpis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NOT NULL,
  date        date NOT NULL,
  revenue     numeric(12,2) DEFAULT 0,
  leads       integer DEFAULT 0,
  conversions integer DEFAULT 0,
  appointments integer DEFAULT 0,
  churn       numeric(5,4) DEFAULT 0,
  aov         numeric(10,2) DEFAULT 0,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(business_id, date)
);

CREATE INDEX idx_daily_kpis_business_date ON daily_kpis(business_id, date DESC);

CREATE TABLE IF NOT EXISTS revenue_anomalies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    text NOT NULL,
  kpi_name       text NOT NULL,
  expected_value numeric(12,2),
  actual_value   numeric(12,2),
  z_score        numeric(6,3),
  severity       text NOT NULL CHECK (severity IN ('normal', 'warning', 'critical')),
  playbook_id    text,
  resolved       boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_revenue_anomalies_business ON revenue_anomalies(business_id, created_at DESC);
CREATE INDEX idx_revenue_anomalies_unresolved ON revenue_anomalies(resolved) WHERE NOT resolved;

CREATE TABLE IF NOT EXISTS playbook_executions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id text NOT NULL,
  business_id text NOT NULL,
  anomaly_id  uuid REFERENCES revenue_anomalies(id),
  actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome     text CHECK (outcome IN ('success', 'partial', 'failed', 'escalated')),
  executed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_playbook_exec_business ON playbook_executions(business_id, executed_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- Skill 8: Customer Journey Intelligence
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS journey_touchpoints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    text NOT NULL,
  business_id   text NOT NULL,
  event_type    text NOT NULL,
  channel       text,
  funnel_stage  text,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  timestamp     timestamptz DEFAULT now()
);

CREATE INDEX idx_journey_tp_contact ON journey_touchpoints(contact_id, timestamp DESC);
CREATE INDEX idx_journey_tp_business ON journey_touchpoints(business_id, timestamp DESC);
CREATE INDEX idx_journey_tp_stage ON journey_touchpoints(funnel_stage, business_id);

CREATE TABLE IF NOT EXISTS journey_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   text NOT NULL,
  business_id  text NOT NULL,
  intent_score integer NOT NULL CHECK (intent_score BETWEEN 0 AND 100),
  factors_json jsonb DEFAULT '{}'::jsonb,
  scored_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_journey_scores_contact ON journey_scores(contact_id, scored_at DESC);
CREATE INDEX idx_journey_scores_high ON journey_scores(intent_score DESC) WHERE intent_score >= 80;

CREATE TABLE IF NOT EXISTS journey_recommendations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id           text NOT NULL,
  business_id          text NOT NULL,
  recommended_offer_id text,
  reason               text,
  acted_on             boolean DEFAULT false,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX idx_journey_rec_contact ON journey_recommendations(contact_id, created_at DESC);
CREATE INDEX idx_journey_rec_pending ON journey_recommendations(acted_on) WHERE NOT acted_on;

-- ═══════════════════════════════════════════════════════════════════
-- Row-Level Security
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE daily_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_recommendations ENABLE ROW LEVEL SECURITY;

-- Service role: full CRUD
CREATE POLICY "service_role_all_daily_kpis" ON daily_kpis FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_revenue_anomalies" ON revenue_anomalies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_playbook_executions" ON playbook_executions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_journey_touchpoints" ON journey_touchpoints FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_journey_scores" ON journey_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_journey_recommendations" ON journey_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated: read-only
CREATE POLICY "authenticated_read_daily_kpis" ON daily_kpis FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_revenue_anomalies" ON revenue_anomalies FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_playbook_executions" ON playbook_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_journey_touchpoints" ON journey_touchpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_journey_scores" ON journey_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_journey_recommendations" ON journey_recommendations FOR SELECT TO authenticated USING (true);
