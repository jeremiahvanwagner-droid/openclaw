---
name: customer-journey-intelligence
description: >
  Tracks lead/customer behavior across touchpoints, scores intent in real time,
  detects stalled journeys, and triggers the right next offer automatically.
  Records every contact interaction (page visits, form submissions, email opens,
  payments, appointments) into a unified journey timeline. Uses multi-factor
  scoring (recency, funnel stage, engagement velocity, content consumption)
  to produce a 0-100 intent score, then recommends the optimal next offer from
  the offer matrix based on journey position and purchase history.
owner: growth-ops
risk_tier: write_safe
divisions:
  - division_2_ecommerce
  - division_4_coaching
  - division_7_shared_services
  - division_8_saas_operations
agents:
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
external_systems:
  - supabase
  - ghl
side_effects:
  - write_supabase
  - ghl_workflow_enroll
  - telegram_alert
triggers:
  - journey/touchpoint.recorded
  - journey/stall.detected (cron: 0 4 * * *)
  - journey/intent.high
  - journey/next-offer.triggered
---

# Customer Journey Intelligence

## Purpose
Creates a unified view of each contact's journey across all touchpoints —
from first page visit through purchase and beyond. Enables automated
re-engagement for stalled journeys and intelligent next-offer recommendations
based on real behavior patterns.

## Functions
| Function | Input | Output |
|---|---|---|
| `recordTouchpoint(contactId, event)` | Contact ID, event object | Stored touchpoint |
| `buildJourneyMap(contactId)` | Contact ID | Ordered timeline array |
| `scoreIntent(contactId)` | Contact ID | Intent score 0-100 + factors |
| `detectJourneyStall(contactId)` | Contact ID | Stall info or null |
| `recommendNextOffer(contactId)` | Contact ID | Offer recommendation |
| `triggerNextAction(contactId, recommendation)` | Contact ID, recommendation | Enrollment result |
| `segmentByJourneyStage(businessId)` | Business ID | Grouped contact segments |

## Stall Thresholds
| Funnel Stage | Max Dwell Time |
|---|---|
| Assessment | 3 days |
| eBook | 7 days |
| Membership consideration | 14 days |

## Dependencies
- Skill 3 (Cross-Business Scope Governor) for cross-business contact access
- Skill 10 (Autonomous QA) for tracking integrity
