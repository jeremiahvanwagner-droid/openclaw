-- ════════════════════════════════════════════════════════════════
-- Phase 3: Execution Layer — Skills 1, 4, 7, 9
-- 13 tables for GHL Build/Refactor, Experiment Engine,
-- Content-to-Campaign Factory, and Offer Engineering
-- ════════════════════════════════════════════════════════════════

-- ── Skill 1: Native GHL Build / Refactor ──────────────────────

CREATE TABLE IF NOT EXISTS ghl_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   text NOT NULL,
  entity_type   text NOT NULL,         -- funnel, workflow, page, custom_field
  entity_id     text NOT NULL,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    text NOT NULL,         -- agent_id
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ghl_snapshots_location ON ghl_snapshots (location_id, entity_type);
CREATE INDEX idx_ghl_snapshots_entity   ON ghl_snapshots (entity_id);

CREATE TABLE IF NOT EXISTS ghl_build_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   text NOT NULL,
  action        text NOT NULL,         -- create, refactor, rollback
  entity_type   text NOT NULL,
  entity_id     text,
  agent_id      text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  snapshot_id   uuid REFERENCES ghl_snapshots (id),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ghl_build_log_location ON ghl_build_log (location_id, created_at DESC);

-- ── Skill 4: Experiment Engine ────────────────────────────────

CREATE TABLE IF NOT EXISTS experiments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       text NOT NULL,
  type              text NOT NULL,     -- offer, copy, page, automation, prompt
  name              text NOT NULL,
  variants_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  traffic_split     jsonb NOT NULL DEFAULT '{"A":50,"B":50}'::jsonb,
  success_metric    text NOT NULL,
  min_sample        int NOT NULL DEFAULT 100,
  max_duration_days int NOT NULL DEFAULT 30,
  status            text NOT NULL DEFAULT 'active',  -- active, paused, significant, completed
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_experiments_business ON experiments (business_id, status);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES experiments (id),
  subject_id    text NOT NULL,
  variant       text NOT NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, subject_id)
);
CREATE INDEX idx_exp_assignments_experiment ON experiment_assignments (experiment_id, variant);

CREATE TABLE IF NOT EXISTS experiment_conversions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES experiments (id),
  subject_id    text NOT NULL,
  variant       text NOT NULL,
  metric        text NOT NULL,
  value         double precision NOT NULL DEFAULT 1,
  converted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exp_conversions_experiment ON experiment_conversions (experiment_id, variant);

CREATE TABLE IF NOT EXISTS experiment_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id     uuid NOT NULL REFERENCES experiments (id) UNIQUE,
  variant_stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  significance      text NOT NULL DEFAULT 'inconclusive', -- inconclusive, trending, significant, highly_significant
  winner_variant    text,
  promoted_at       timestamptz
);

-- ── Skill 7: Content-to-Campaign Factory ──────────────────────

CREATE TABLE IF NOT EXISTS campaign_ideas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    text NOT NULL,
  core_idea      text NOT NULL,
  atomized_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'draft',  -- draft, generating, review, approved, scheduled, live
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_ideas_business ON campaign_ideas (business_id, status);

CREATE TABLE IF NOT EXISTS campaign_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaign_ideas (id),
  channel      text NOT NULL,   -- email, linkedin, instagram, facebook, x, sms, landing_page, ads
  asset_type   text NOT NULL,   -- sequence, post, hero_copy, ad_variant, sms_message
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'draft',  -- draft, approved, scheduled, published
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_assets_campaign ON campaign_assets (campaign_id, channel);

CREATE TABLE IF NOT EXISTS campaign_performance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaign_ideas (id),
  asset_id     uuid REFERENCES campaign_assets (id),
  metric       text NOT NULL,   -- open_rate, click_rate, conversion_rate, impressions, engagement
  value        double precision NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_perf_campaign ON campaign_performance (campaign_id, collected_at DESC);

-- ── Skill 9: Offer Engineering ────────────────────────────────

CREATE TABLE IF NOT EXISTS offer_analytics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     text NOT NULL,
  offer_id        text NOT NULL,
  conversion_rate double precision,
  aov             double precision,
  ltv             double precision,
  refund_rate     double precision,
  period          text NOT NULL,      -- daily, weekly, monthly
  calculated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_analytics_business ON offer_analytics (business_id, offer_id, calculated_at DESC);

CREATE TABLE IF NOT EXISTS offer_stacks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     text NOT NULL,
  stack_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  simulation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'draft',  -- draft, active, archived
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_stacks_business ON offer_stacks (business_id, status);

CREATE TABLE IF NOT EXISTS offer_optimizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     text NOT NULL,
  offer_id        text NOT NULL,
  recommendation  text NOT NULL,
  expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected, implemented
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_opts_business ON offer_optimizations (business_id, status);

-- ── Row-Level Security ────────────────────────────────────────

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'ghl_snapshots', 'ghl_build_log',
      'experiments', 'experiment_assignments', 'experiment_conversions', 'experiment_results',
      'campaign_ideas', 'campaign_assets', 'campaign_performance',
      'offer_analytics', 'offer_stacks', 'offer_optimizations'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl || '_service_all', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      tbl || '_auth_read', tbl
    );
  END LOOP;
END
$$;
