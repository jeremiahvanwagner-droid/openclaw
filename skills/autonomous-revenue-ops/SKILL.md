---
name: autonomous-revenue-ops
description: >
  Daily KPI monitoring, anomaly detection, and auto-execution of approved
  playbooks with escalation only when needed. Collects revenue, leads,
  conversion rate, appointment rate, churn, and AOV from GHL + Stripe APIs;
  compares against 14-day rolling baselines using Z-score analysis; matches
  anomalies to approved playbooks; and executes corrective actions automatically
  for write_safe operations while routing irreversible actions through HITL.
owner: growth-ops
risk_tier: write_safe
divisions:
  - division_1_core_operations
  - division_8_saas_operations
  - division_7_shared_services
agents:
  - d1_ceo
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
external_systems:
  - supabase
  - ghl
  - stripe
  - telegram
side_effects:
  - write_supabase
  - ghl_workflow_enroll
  - ghl_contact_tag
  - telegram_alert
triggers:
  - revenue/daily.collection (cron: 0 6 * * *)
  - revenue/anomaly.detected
  - revenue/playbook.executed
  - revenue/briefing.ready
---

# Autonomous Revenue Ops

## Purpose
Continuously monitors KPIs across all 10 businesses. When metrics deviate
from rolling baselines, the system automatically matches anomalies to approved
playbooks and executes corrective actions — alerting the growth team, pausing
ad spend, activating win-back sequences, or escalating to the CEO depending
on severity and impact.

## Functions
| Function | Input | Output |
|---|---|---|
| `collectDailyKPIs(businessId)` | Business ID | KPI row stored in `daily_kpis` |
| `detectKPIAnomalies(businessId, period)` | Business ID, lookback days | Array of anomaly records |
| `matchPlaybook(anomaly)` | Anomaly object | Matched playbook config or null |
| `executePlaybook(playbook, context)` | Playbook + anomaly context | Execution outcome |
| `generateDailyBriefing(businessId)` | Business ID | Structured briefing object |
| `portfolioPulse()` | None | Aggregated 10-business summary |

## Playbook Config
Stored in `config/revenue-playbooks.json` — each playbook has:
- `trigger_kpi` — which KPI triggers it
- `trigger_severity` — minimum severity to fire
- `actions[]` — ordered list of actions with `auto_execute` / `requires_hitl` flags

## Dependencies
- Skill 3 (Cross-Business Scope Governor) for cross-business data access
- Skill 6 (Self-Healing Integrations) for data collection reliability
