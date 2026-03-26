---
skill_id: offer-engineering
owner: growth-ops
risk_tier: write_safe
side_effects:
  - write_supabase
  - telegram_alert
external_systems:
  - supabase
  - ghl
  - telegram
idempotency_key_strategy: "business_id + offer_id + period"
approval_policy: "auto for analysis & recommendations; HITL for price changes"
replay_policy: "analytics are idempotent; recommendations are append-only"
assigned_agents:
  - d8_revenue_ops
  - d1_ceo
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
  - offer/analysis.scheduled
  - offer/optimization.suggested
  - offer/performance.collected
supabase_tables:
  - offer_analytics
  - offer_stacks
  - offer_optimizations
dashboard_page: /offers
---

# Offer Engineering

Design and optimize pricing, packaging, upsells, and downsells to improve AOV, LTV, and conversion.

## Functions

| Function | Description |
|---|---|
| `analyzeCurrentOffers(businessId)` | Pull offers from GHL + offer-matrix; calculate conversion, AOV, LTV, refund rate |
| `designOfferStack(businessId, config)` | Generate front-end, core, upsell, downsell, order bump using Grand Slam framework |
| `optimizePricing(offerId, strategy)` | Run pricing analysis with psychology principles |
| `designUpsellSequence(primaryOfferId)` | Generate post-purchase upsell/downsell flow |
| `simulateRevenue(offerStack, trafficEstimate)` | Model expected revenue per funnel stage |
| `trackOfferPerformance(offerId, period)` | AOV, LTV, conversion rate, refund rate trending |
| `recommendOptimizations(businessId)` | AI-powered suggestions for offer improvements |

## Dependencies

- Skill 2 (revenue data)
- Skill 4 (price/offer A/B testing)
- Skill 8 (customer journey for offer timing)
