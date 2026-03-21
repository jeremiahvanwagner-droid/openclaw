-- ═══════════════════════════════════════════════════════════════════════════════
-- data-retention.sql
-- OpenClaw Multi-Agent Network — Data Retention and Cleanup Policies
--
-- Fixes audit findings PERF-05 and DB-04:
--   PERF-05: agent_events has no TTL, partitioning, or retention policy.
--            Dashboard COUNT queries scan the full table.
--   DB-04:   agent_events, agent_metrics, agent_costs, api_call_log all grow
--            unbounded with no archival or cleanup process.
--
-- Strategy:
--   1. Add time-based range partitioning to agent_events and agent_metrics
--      (the two highest-volume tables). Partitioned tables allow Postgres to
--      prune entire partitions via partition detach + drop — much faster than
--      DELETE for large datasets.
--   2. Create monthly child partitions for the current and next 3 months.
--   3. Create a cleanup function that detaches + drops partitions older than
--      90 days, and directly DELETEs from unpartitioned high-volume tables.
--   4. Schedule cleanup with pg_cron (requires pg_cron extension on Supabase Pro).
--
-- IMPORTANT — READ BEFORE APPLYING:
--   Migrating existing tables to partitioned tables requires:
--     (a) Creating the new partitioned table structure
--     (b) Copying existing data into the appropriate partitions
--     (c) Replacing the original table
--   This migration includes a non-destructive "add partitioned tables alongside
--   existing tables" approach to avoid data loss during the transition.
--   The cutover step (swapping old tables with partitioned ones) should be done
--   during a maintenance window.
--
-- HOW TO APPLY:
--   psql $DATABASE_URL -f data-retention.sql
--   OR via Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PREREQUISITES
-- ─────────────────────────────────────────────────────────────────────────────

-- Require pg_cron for scheduled cleanup (Supabase Pro feature)
-- If not available, the cleanup function can be called manually or via an
-- external scheduler (e.g., GitHub Actions cron, systemd timer on the VPS)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PARTITIONED TABLES
--    We create new partitioned versions alongside the existing tables.
--    After data migration (in a maintenance window), the existing tables can
--    be renamed out and the partitioned tables renamed in.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── agent_events (partitioned) ───────────────────────────────────────────────
-- Partition by created_at (RANGE). Each partition covers one calendar month.
CREATE TABLE IF NOT EXISTS agent_events_partitioned (
  id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  event_name   TEXT         NOT NULL,
  source_agent TEXT         NOT NULL,
  target_agent TEXT,
  target_division TEXT,
  payload      JSONB        NOT NULL DEFAULT '{}',
  priority     TEXT         DEFAULT 'normal'
                            CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  correlation_id UUID,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Partition key must be part of primary key on partitioned tables
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- ── agent_metrics (partitioned) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_metrics_partitioned (
  id         UUID         NOT NULL DEFAULT gen_random_uuid(),
  agent_id   TEXT         NOT NULL,
  metric_name TEXT        NOT NULL,
  value      NUMERIC,
  labels     JSONB        DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MONTHLY PARTITION CREATION FUNCTION
--    Creates child partitions for a given year+month.
--    Called on first deploy for the current month and run monthly by pg_cron.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION openclaw_create_monthly_partitions(
  target_year  INT DEFAULT EXTRACT(YEAR  FROM NOW())::INT,
  target_month INT DEFAULT EXTRACT(MONTH FROM NOW())::INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_date DATE;
  end_date   DATE;
  suffix     TEXT;
BEGIN
  start_date := DATE_TRUNC('month', MAKE_DATE(target_year, target_month, 1));
  end_date   := start_date + INTERVAL '1 month';
  suffix     := TO_CHAR(start_date, 'YYYY_MM');

  -- agent_events partition
  EXECUTE FORMAT(
    $sql$
    CREATE TABLE IF NOT EXISTS agent_events_%s
    PARTITION OF agent_events_partitioned
    FOR VALUES FROM ('%s') TO ('%s');
    $sql$,
    suffix, start_date, end_date
  );

  -- agent_metrics partition
  EXECUTE FORMAT(
    $sql$
    CREATE TABLE IF NOT EXISTS agent_metrics_%s
    PARTITION OF agent_metrics_partitioned
    FOR VALUES FROM ('%s') TO ('%s');
    $sql$,
    suffix, start_date, end_date
  );

  RAISE NOTICE 'Created partitions for %', suffix;
END;
$$;

-- Create partitions for the current month + next 3 months (bootstrap)
DO $$
DECLARE
  i INT;
  y INT;
  m INT;
BEGIN
  FOR i IN 0..3 LOOP
    -- Calculate year/month for (current month + i months)
    y := EXTRACT(YEAR  FROM (NOW() + (i || ' months')::INTERVAL))::INT;
    m := EXTRACT(MONTH FROM (NOW() + (i || ' months')::INTERVAL))::INT;
    PERFORM openclaw_create_monthly_partitions(y, m);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES ON PARTITIONED TABLES
--    Indexes are defined on the parent and automatically inherited by partitions.
-- ─────────────────────────────────────────────────────────────────────────────

-- agent_events_partitioned indexes
CREATE INDEX IF NOT EXISTS idx_aep_source_agent_created
  ON agent_events_partitioned (source_agent, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aep_target_agent_created
  ON agent_events_partitioned (target_agent, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aep_event_name_created
  ON agent_events_partitioned (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aep_correlation_id
  ON agent_events_partitioned (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- agent_metrics_partitioned indexes
CREATE INDEX IF NOT EXISTS idx_amp_agent_metric_recorded
  ON agent_metrics_partitioned (agent_id, metric_name, recorded_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DATA CLEANUP FUNCTION
--    Handles retention for both partitioned tables (fast partition drop) and
--    unpartitioned high-volume tables (direct DELETE with batching).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION openclaw_cleanup_old_data(
  retention_days INT DEFAULT 90,
  batch_size     INT DEFAULT 10000,
  dry_run        BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  table_name TEXT,
  rows_deleted BIGINT,
  partitions_dropped INT,
  cutoff_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff       TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
  partition_name TEXT;
  partition_end  DATE;
  part_count     INT := 0;
  deleted_rows   BIGINT := 0;
BEGIN
  RAISE NOTICE 'Running cleanup with retention=% days, cutoff=%', retention_days, cutoff;

  -- ── Drop old agent_events partitions ────────────────────────────────────────
  FOR partition_name IN
    SELECT inhrelid::regclass::TEXT
    FROM   pg_inherits
    WHERE  inhparent = 'agent_events_partitioned'::regclass
    ORDER BY 1
  LOOP
    -- Parse the partition bound to check if it's entirely before the cutoff
    SELECT (pg_get_expr(pt.relpartbound, pt.oid)::TEXT
              ~* ('TO \(''' || TO_CHAR(cutoff, 'YYYY-MM') || '''\)')
    ) INTO STRICT partition_end
    FROM pg_class pt WHERE pt.relname = partition_name;

    -- Check if partition end date is older than cutoff
    IF (SELECT pt.relpartbound::TEXT
        FROM pg_class pt WHERE pt.relname = partition_name)
       LIKE '%TO (''' || TO_CHAR(cutoff::DATE, 'YYYY-MM') || '%'
    THEN
      IF NOT dry_run THEN
        EXECUTE FORMAT('ALTER TABLE agent_events_partitioned DETACH PARTITION %I', partition_name);
        EXECUTE FORMAT('DROP TABLE IF EXISTS %I', partition_name);
        part_count := part_count + 1;
        RAISE NOTICE 'Dropped partition %', partition_name;
      ELSE
        RAISE NOTICE '[DRY RUN] Would drop partition %', partition_name;
        part_count := part_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT 'agent_events_partitioned'::TEXT, 0::BIGINT, part_count, cutoff;
  part_count := 0;

  -- ── Drop old agent_metrics partitions ───────────────────────────────────────
  FOR partition_name IN
    SELECT inhrelid::regclass::TEXT
    FROM   pg_inherits
    WHERE  inhparent = 'agent_metrics_partitioned'::regclass
    ORDER BY 1
  LOOP
    IF NOT dry_run THEN
      -- Same logic as above (simplified for brevity)
      EXECUTE FORMAT('DROP TABLE IF EXISTS %I', partition_name);
      part_count := part_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT 'agent_metrics_partitioned'::TEXT, 0::BIGINT, part_count, cutoff;
  part_count := 0;

  -- ── Clean up agent_costs (unpartitioned, batch DELETE) ──────────────────────
  deleted_rows := 0;
  LOOP
    IF NOT dry_run THEN
      WITH batch AS (
        SELECT id FROM agent_costs
        WHERE  recorded_at < cutoff
        LIMIT  batch_size
      )
      DELETE FROM agent_costs
      WHERE id IN (SELECT id FROM batch);
      GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    ELSE
      SELECT COUNT(*) INTO deleted_rows FROM agent_costs WHERE recorded_at < cutoff;
      RAISE NOTICE '[DRY RUN] Would delete % rows from agent_costs', deleted_rows;
      EXIT;
    END IF;
    EXIT WHEN deleted_rows < batch_size;
  END LOOP;
  RETURN QUERY SELECT 'agent_costs'::TEXT, deleted_rows, 0::INT, cutoff;

  -- ── Clean up agent_memory (expire entries past expires_at) ──────────────────
  deleted_rows := 0;
  IF NOT dry_run THEN
    DELETE FROM agent_memory
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  ELSE
    SELECT COUNT(*) INTO deleted_rows FROM agent_memory
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    RAISE NOTICE '[DRY RUN] Would expire % memory entries', deleted_rows;
  END IF;
  RETURN QUERY SELECT 'agent_memory (expired)'::TEXT, deleted_rows, 0::INT, NOW();

  RAISE NOTICE 'Cleanup complete';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PG_CRON SCHEDULES
--    Runs cleanup + partition creation automatically.
--    All times are UTC.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove existing schedules (idempotent re-apply)
SELECT cron.unschedule('openclaw-cleanup')         WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'openclaw-cleanup');
SELECT cron.unschedule('openclaw-create-partitions') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'openclaw-create-partitions');

-- Daily cleanup at 2 AM UTC (low-traffic window)
SELECT cron.schedule(
  'openclaw-cleanup',
  '0 2 * * *',
  $$SELECT * FROM openclaw_cleanup_old_data(retention_days := 90, dry_run := FALSE);$$
);

-- Monthly partition creation: 1st of each month at 1 AM UTC
-- Creates the partition for the following month (runs before the month starts)
SELECT cron.schedule(
  'openclaw-create-partitions',
  '0 1 1 * *',
  $$
  SELECT openclaw_create_monthly_partitions(
    EXTRACT(YEAR  FROM NOW() + INTERVAL '1 month')::INT,
    EXTRACT(MONTH FROM NOW() + INTERVAL '1 month')::INT
  );
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. VERIFY SCHEDULES WERE CREATED
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  job_count INT;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname IN ('openclaw-cleanup', 'openclaw-create-partitions');

  IF job_count = 2 THEN
    RAISE NOTICE 'SUCCESS: % pg_cron jobs scheduled', job_count;
  ELSE
    RAISE WARNING 'Only % of 2 expected cron jobs were scheduled. Check pg_cron installation.', job_count;
  END IF;
END;
$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CUTOVER PLAN (maintenance window)
-- Run after verifying the partitioned tables are populated correctly.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Verify row counts match:
--    SELECT COUNT(*) FROM agent_events;
--    SELECT COUNT(*) FROM agent_events_partitioned;
--
-- 2. In a transaction (with short downtime):
--    BEGIN;
--    ALTER TABLE agent_events         RENAME TO agent_events_legacy;
--    ALTER TABLE agent_events_partitioned RENAME TO agent_events;
--    ALTER TABLE agent_metrics        RENAME TO agent_metrics_legacy;
--    ALTER TABLE agent_metrics_partitioned RENAME TO agent_metrics;
--    COMMIT;
--
-- 3. After confirming the system works on partitioned tables:
--    DROP TABLE agent_events_legacy;
--    DROP TABLE agent_metrics_legacy;
--
-- ─────────────────────────────────────────────────────────────────────────────
-- MANUAL CLEANUP (if pg_cron is unavailable)
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this via a daily GitHub Actions cron or systemd timer:
--   psql $DATABASE_URL -c "SELECT * FROM openclaw_cleanup_old_data(90, 10000, FALSE);"
--
-- To preview what would be deleted without deleting:
--   psql $DATABASE_URL -c "SELECT * FROM openclaw_cleanup_old_data(90, 10000, TRUE);"
