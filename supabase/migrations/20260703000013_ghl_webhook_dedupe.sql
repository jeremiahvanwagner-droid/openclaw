-- ============================================================================
-- GHL Webhook Delivery Dedupe Ledger
-- Migration: 013_ghl_webhook_dedupe
-- Date: 2026-07-03 (Advancement 3, docs/advancements/03-advancement-ghl-webhook-hardening.md)
-- Partial unique index on agent_events.correlation_id for ghl-webhook ledger
-- rows only — other writers can reuse correlation_id for trace grouping.
-- Applied to DB1 (aagqvfwuixpxtdcrdxmv) via MCP on 2026-07-03.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS agent_events_ghl_dedupe_uniq
  ON agent_events (correlation_id)
  WHERE (metadata->>'source') = 'ghl-webhook';
