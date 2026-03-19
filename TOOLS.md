# TOOLS

Generated from [config/agents_config.json](./config/agents_config.json) and [config/skills-registry.json](./config/skills-registry.json). Do not edit manually.

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
| sequence-orchestrator | write_safe | telegram, email | sequence_id + recipient + step |
| social-media-publisher | irreversible | browser | platform + asset_hash + scheduled_at |
