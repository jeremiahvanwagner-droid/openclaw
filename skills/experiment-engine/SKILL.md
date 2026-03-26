---
skill_id: experiment-engine
owner: growth-ops
risk_tier: write_safe
side_effects:
  - write_supabase
  - telegram_alert
  - ghl_workflow_trigger
external_systems:
  - supabase
  - ghl
  - telegram
idempotency_key_strategy: "experiment_id + action"
approval_policy: "auto for copy/offer metadata promotion; HITL for page/automation changes"
replay_policy: "assignments are deterministic (hash-based); conversions are append-only"
assigned_agents:
  - d1_cmo
  - d8_revenue_ops
  - biz_01_pod_lead
  - biz_02_pod_lead
  - biz_03_pod_lead
  - biz_04_pod_lead
  - biz_05_pod_lead
  - biz_06_pod_lead
  - biz_07_pod_lead
  - biz_08_pod_lead
  - biz_09_pod_lead
  - biz_10_pod_lead
inngest_events:
  - experiment/created
  - experiment/evaluation.scheduled
  - experiment/significant
  - experiment/promoted
supabase_tables:
  - experiments
  - experiment_assignments
  - experiment_conversions
  - experiment_results
dashboard_page: /experiments
---

# Experiment Engine

Launch, track, and auto-promote A/B tests across offers, copy, pages, automations, and prompts.

## Functions

| Function | Description |
|---|---|
| `createExperiment(config)` | Define experiment with type, variants, traffic split, success metric, sample size |
| `assignVariant(experimentId, subjectId)` | Deterministic variant assignment via hash |
| `recordConversion(experimentId, subjectId, metric, value)` | Track outcome per variant |
| `evaluateSignificance(experimentId)` | Z-score + chi-squared significance testing |
| `autoPromoteWinner(experimentId)` | Apply winning variant when significant + minimum sample reached |
| `archiveExperiment(experimentId)` | Store results and learnings |
| `listActiveExperiments(businessId)` | Dashboard feed of active experiments |

## Dependencies

- Skill 1 (for page variant creation)
- Skill 2 (for revenue metric tracking)
- Skill 8 (for journey-based segmentation)
