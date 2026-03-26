---
name: executive-command-center
description: >
  One-glance portfolio briefing across all 10 businesses — revenue movement,
  bottlenecks, risks, and next best actions. Aggregates data from all Phase 1
  and Phase 2 skills (daily KPIs, anomalies, compliance scores, integration
  health, journey data) into a single command center view. Delivers daily
  and weekly briefings via Telegram and dashboard.
owner: ops-ops
risk_tier: draft_only
divisions:
  - division_1_core_operations
  - division_7_shared_services
agents:
  - d1_ceo
  - shared_exec_orchestrator
external_systems:
  - supabase
  - telegram
side_effects:
  - telegram_alert
triggers:
  - command-center/daily.briefing (cron: 0 7 * * *)
  - command-center/weekly.digest (cron: 0 8 * * 1)
  - command-center/alert.critical
---

# Executive Command Center

## Purpose
The CEO's primary view into the entire OpenClaw portfolio. Aggregates
metrics, anomalies, risks, and recommendations from every skill into a
single unified briefing. Surfaces the most important information first
and recommends concrete next actions per business.

## Functions
| Function | Input | Output |
|---|---|---|
| `generatePortfolioBriefing()` | None | Full portfolio briefing object |
| `identifyBottlenecks()` | None | Array of bottleneck findings |
| `surfaceRisks()` | None | Aggregated risk report |
| `recommendNextActions(businessId)` | Business ID | Top 3 recommended actions |
| `deliverBriefing(channel)` | Channel name | Delivery confirmation |

## Data Sources
- `daily_kpis` — from Skill 2 (Revenue Ops)
- `revenue_anomalies` — from Skill 2 (Revenue Ops)
- `compliance_scorecards` — from Skill 10 (QA & Compliance)
- `integration_health_log` — from Skill 6 (Self-Healing Integrations)
- `journey_scores` — from Skill 8 (Journey Intelligence)
- `scope_violations_log` — from Skill 3 (Scope Governor)

## Dependencies
All Phase 1 + Phase 2 skills (read-only aggregation)
