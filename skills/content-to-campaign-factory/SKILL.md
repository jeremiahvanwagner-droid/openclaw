---
skill_id: content-to-campaign-factory
owner: content-ops
risk_tier: write_safe
side_effects:
  - write_supabase
  - telegram_alert
  - ghl_workflow_trigger
  - llm_completion
external_systems:
  - supabase
  - ghl
  - telegram
  - llm
idempotency_key_strategy: "campaign_id + channel + asset_type"
approval_policy: "HITL for campaign publishing; auto for draft generation"
replay_policy: "generation is idempotent given same inputs; performance collection is append-only"
assigned_agents:
  - d1_cmo
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
  - campaign/idea.submitted
  - campaign/bundle.ready
  - campaign/approved
  - campaign/performance.collect
supabase_tables:
  - campaign_ideas
  - campaign_assets
  - campaign_performance
dashboard_page: /campaigns
---

# Content-to-Campaign Factory

Turn one core idea into full multi-channel assets (email, socials, landing copy, ads) aligned by business scope.

## Functions

| Function | Description |
|---|---|
| `atomizeIdea(coreIdea, businessId)` | Extract key message, audience, pain points, transformation, proof points |
| `generateAssetBundle(atomizedIdea, channels)` | Produce email, social, landing, ads, SMS assets per channel |
| `alignToBusinessScope(assetBundle, businessId)` | Validate brand voice and business-specific compliance |
| `scheduleDistribution(assetBundle, calendar)` | Push to GHL email sequences and content scheduler |
| `trackCampaignPerformance(campaignId)` | Collect open/click/conversion rates per asset |

## Dependencies

- Skill 3 (scope-aware business context)
- Skill 10 (brand compliance validation)
- Skill 4 (A/B test copy variants)
