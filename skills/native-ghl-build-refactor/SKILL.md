---
skill_id: native-ghl-build-refactor
owner: ops-ops
risk_tier: irreversible
side_effects:
  - ghl_api_write
  - write_supabase
  - telegram_alert
external_systems:
  - supabase
  - ghl
  - telegram
idempotency_key_strategy: "location_id + entity_type + entity_id + action"
approval_policy: "HITL required for rollback and production deploys; auto for snapshots and reads"
replay_policy: "snapshots are idempotent; builds are NOT idempotent — require dedup via build_log"
assigned_agents:
  - d8_funnel_engineer
  - d8_platform_architect
inngest_events:
  - ghl-build/create.requested
  - ghl-build/snapshot.created
  - ghl-build/rollback.requested
supabase_tables:
  - ghl_snapshots
  - ghl_build_log
dashboard_page: /ghl-builder
---

# Native GHL Build / Refactor

Full funnel, workflow, page, and payment-link creation plus safe refactors with rollback snapshots.

## Functions

| Function | Description |
|---|---|
| `createFunnel(businessId, template, customization)` | Generate funnel config from template and push to GHL via API |
| `createWorkflow(businessId, blueprint)` | Convert workflow blueprint JSON to GHL workflow |
| `createPaymentLink(businessId, offerConfig)` | Generate payment links tied to Stripe Connect via GHL |
| `snapshotCurrentState(locationId, entityType, entityId)` | Export current state to `ghl_snapshots` before any modification |
| `refactorEntity(locationId, entityId, changes)` | Apply changes with automatic pre-snapshot and QA validation |
| `rollback(snapshotId)` | Restore entity to snapshot state (requires HITL approval) |
| `diffSnapshot(snapshotA, snapshotB)` | Show what changed between two snapshots |

## Dependencies

- Skill 3 (scope enforcement for GHL API access)
- Skill 6 (API health check before writes)
- Skill 10 (pre-build QA validation)
