---
name: self-healing-integrations
description: >
  Monitors all external integrations (GHL, Stripe, Telegram, Supabase, Inngest)
  for health, detects broken webhooks and API failures, classifies failure type,
  and auto-heals transient issues. Escalates persistent failures to human
  operators with full diagnostic context.
owner: ops-ops
risk_tier: write_safe
divisions:
  - division_7_shared_services
  - division_1_core_operations
agents:
  - shared_runtime_ops
  - d1_devops
external_systems:
  - supabase
  - ghl
  - stripe
  - telegram
side_effects:
  - retry_failed_events
  - reset_circuit_breaker
  - write_supabase
triggers:
  - integration/health.check (cron: */5 * * * *)
  - integration/failure.detected
  - integration/healed
  - integration/escalation.needed
---

# Self-Healing Integrations

## Purpose
Provides autonomous integration health monitoring and recovery for the entire
OpenClaw platform. Probes webhook endpoints, monitors DLQ depth and circuit
breaker states, classifies failures, and auto-heals where safe.

## Key Functions
- `probeAllWebhooks()` — Synthetic health pings to all registered endpoints
- `detectBrokenIntegrations()` — Analyze DLQ growth, consecutive failures, circuit state
- `classifyFailure()` — Categorize as transient / degraded / dead
- `autoRetryTransient()` — Replay from DLQ with exponential backoff
- `remapEndpoint()` — Update webhook URL (HITL required for production)
- `selfHealCircuitBreaker()` — Reset breakers after successful probe
- `generateHealthReport()` — Aggregate provider health summary
