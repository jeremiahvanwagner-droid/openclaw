# TOOLS

Generated from [config/agents_config.json](./config/agents_config.json) and [config/skills-registry.json](./config/skills-registry.json).

## Tool to Channel Map

| Tool | Channel |
| --- | --- |
| telegram_alerts | telegram |
| telegram_master_channel | telegram |
| telegram_broadcast | telegram |
| msteams_delivery | msteams |
| teams_delivery | msteams |
| email_broadcaster | email |
| email_dispatcher | email |
| email_marketing | email |
| m365_email | email |
| ghl_speed_to_lead | ghl |
| btv_discovery_call_prep | ghl |
| divine_path_walkers_welcome | ghl |

## Tool to Action Family Map

| Tool | Action Family |
| --- | --- |
| ghl | ghl_write |
| ghl_contacts | ghl_write |
| ghl_contact | ghl_write |
| ghl_workflows | ghl_write |
| ghl_pipeline_view | ghl_write |
| approval_queue | ghl_write |
| email_broadcaster | email_send |
| email_dispatcher | email_send |
| email_marketing | email_send |
| stripe_dashboard | payment_action |
| checkout_integrator | payment_action |
| payment_plans | payment_action |
| refunds | payment_action |
| ghl_speed_to_lead | ghl_write |
| btv_discovery_call_prep | ghl_write |
| divine_path_walkers_welcome | ghl_write |

## Risky Skills

| Skill | Risk Tier | External Systems | Idempotency |
| --- | --- | --- | --- |
| abandoned-cart-recovery | write_safe | telegram, openclaw-agent | cart_id + workflow_step |
| assessment-handler | write_safe | telegram, openclaw-agent | assessment_id + action |
| browser-controller | irreversible | browser | session_name + target_url + action |
| browser-core | write_safe | browser | platform + session_name + command |
| browser-pool-manager | write_safe | browser | task_id |
| design-generator | write_safe | browser | design_request_id + variant |
| ebook-buyer-automation | write_safe | telegram, openclaw-agent | buyer_id + book_id + lifecycle_step |
| ghl-browser-control | irreversible | browser | location_id + workflow_action + entity_id |
| sequence-orchestrator | write_safe | email, telegram | sequence_id + recipient + step |
| social-media-publisher | irreversible | browser | platform + asset_hash + scheduled_at |
| ghl-speed-to-lead | write_safe | ghl | location_id + contact_id |
| btv-discovery-call-prep | read_only | ghl | location_id + contact_id |
| divine-path-walkers-welcome | write_safe | ghl | location_id + contact_id |

## New Skills — Truth J Blue Ecosystem

| Skill | File | Agent Alias | Purpose |
| --- | --- | --- | --- |
| ghl-speed-to-lead | skills/ghl-speed-to-lead.mjs | sales | Contact new leads within 5 min via SMS + email |
| btv-discovery-call-prep | skills/btv-discovery-call-prep.mjs | sales | Pre-call intelligence brief for BTV discovery calls |
| divine-path-walkers-welcome | skills/divine-path-walkers-welcome.mjs | support | Welcome sequence for new DPW community members |
