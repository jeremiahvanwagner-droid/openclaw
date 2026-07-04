# TOOLS

Generated from [config/agents_config.json](./config/agents_config.json) and [config/skills-registry.json](./config/skills-registry.json). Do not edit manually.

## Tool to Channel Map

| Tool | Channel |
| --- | --- |

## Tool to Action Family Map

| Tool | Action Family |
| --- | --- |

## Risky Skills

| Skill | Risk Tier | External Systems | Idempotency |
| --- | --- | --- | --- |
| abandoned-cart-recovery | write_safe | telegram, openclaw-agent | cart_id + workflow_step |
| access-control-manager | write_safe |  | access-control-manager_id + timestamp |
| agent-coordinator | write_safe |  | agent-coordinator_id + timestamp |
| agent-performance | write_safe |  | agent-performance_id + timestamp |
| aisaas-api-rate-limit-handling | write_safe |  | aisaas-api-rate-limit-handling_id + timestamp |
| aisaas-autonomous-debugging | write_safe |  | aisaas-autonomous-debugging_id + timestamp |
| aisaas-cicd-execution | write_safe |  | aisaas-cicd-execution_id + timestamp |
| aisaas-codebase-dependency-resolution | write_safe |  | aisaas-codebase-dependency-resolution_id + timestamp |
| aisaas-llm-gateway-routing | write_safe |  | aisaas-llm-gateway-routing_id + timestamp |
| aisaas-model-context-protocol-management | write_safe |  | aisaas-model-context-protocol-management_id + timestamp |
| aisaas-multimodal-input-processing | write_safe |  | aisaas-multimodal-input-processing_id + timestamp |
| aisaas-prompt-caching-optimization | write_safe |  | aisaas-prompt-caching-optimization_id + timestamp |
| aisaas-rag-indexing-retrieval | write_safe |  | aisaas-rag-indexing-retrieval_id + timestamp |
| aisaas-semantic-payload-parsing | write_safe |  | aisaas-semantic-payload-parsing_id + timestamp |
| aisaas-system-state-persistence | write_safe |  | aisaas-system-state-persistence_id + timestamp |
| aisaas-token-expenditure-tracking | write_safe |  | aisaas-token-expenditure-tracking_id + timestamp |
| assessment-handler | write_safe | telegram, openclaw-agent | assessment_id + action |
| automation-logic-designer | write_safe |  | automation-logic-designer_id + timestamp |
| browser-automation | write_safe |  | browser-automation_id + timestamp |
| browser-controller | irreversible | browser | session_name + target_url + action |
| browser-core | write_safe | browser | platform + session_name + command |
| browser-pool-manager | write_safe | browser | task_id |
| browser-security | write_safe |  | browser-security_id + timestamp |
| checkout-integrator | write_safe |  | checkout-integrator_id + timestamp |
| churn-predictor | write_safe |  | churn-predictor_id + timestamp |
| contact-synchronizer | write_safe |  | contact-synchronizer_id + timestamp |
| coupon-and-promo-creator | write_safe |  | coupon-and-promo-creator_id + timestamp |
| custom-value-manager | write_safe |  | custom-value-manager_id + timestamp |
| deliverability-auditor | write_safe |  | deliverability-auditor_id + timestamp |
| design-generator | write_safe | browser | design_request_id + variant |
| digital-checkout-friction-reduction | write_safe |  | digital-checkout-friction-reduction_id + timestamp |
| digital-funnel-conversion-rate-calibration | write_safe |  | digital-funnel-conversion-rate-calibration_id + timestamp |
| domain-connector | write_safe |  | domain-connector_id + timestamp |
| duplicate-contact-merger | write_safe |  | duplicate-contact-merger_id + timestamp |
| ebook-buyer-automation | write_safe | telegram, openclaw-agent | buyer_id + book_id + lifecycle_step |
| ecommerce-algorithmic-cross-selling | write_safe |  | ecommerce-algorithmic-cross-selling_id + timestamp |
| ecommerce-cart-abandonment-recovery | write_safe |  | ecommerce-cart-abandonment-recovery_id + timestamp |
| ecommerce-dynamic-description-generation | write_safe |  | ecommerce-dynamic-description-generation_id + timestamp |
| ecommerce-fraudulent-transaction-flagging | write_safe |  | ecommerce-fraudulent-transaction-flagging_id + timestamp |
| ecommerce-multilingual-support-resolution | write_safe |  | ecommerce-multilingual-support-resolution_id + timestamp |
| ecommerce-predictive-inventory-restocking | write_safe |  | ecommerce-predictive-inventory-restocking_id + timestamp |
| ecommerce-return-refund-authorization | write_safe |  | ecommerce-return-refund-authorization_id + timestamp |
| ecommerce-review-sentiment-extraction | write_safe |  | ecommerce-review-sentiment-extraction_id + timestamp |
| ecommerce-shipping-route-optimization | write_safe |  | ecommerce-shipping-route-optimization_id + timestamp |
| ecommerce-supply-chain-anomaly-detection | write_safe |  | ecommerce-supply-chain-anomaly-detection_id + timestamp |
| ecommerce-visual-search-processing | write_safe |  | ecommerce-visual-search-processing_id + timestamp |
| ecommerce-voice-commerce-processing | write_safe |  | ecommerce-voice-commerce-processing_id + timestamp |
| email-broadcaster | write_safe |  | email-broadcaster_id + timestamp |
| email-newsletter-designer | write_safe |  | email-newsletter-designer_id + timestamp |
| email-sequence | write_safe |  | email-sequence_id + timestamp |
| finance-anomaly-pattern-detection | irreversible |  | finance-anomaly-pattern-detection_id + timestamp |
| finance-autonomous-quality-assurance | irreversible |  | finance-autonomous-quality-assurance_id + timestamp |
| finance-distributed-event-polling | irreversible |  | finance-distributed-event-polling_id + timestamp |
| finance-fundamental-data-extraction | irreversible |  | finance-fundamental-data-extraction_id + timestamp |
| finance-hierarchical-consensus-building | irreversible |  | finance-hierarchical-consensus-building_id + timestamp |
| finance-high-frequency-execution | irreversible |  | finance-high-frequency-execution_id + timestamp |
| finance-multi-model-execution | irreversible |  | finance-multi-model-execution_id + timestamp |
| finance-portfolio-rebalancing | irreversible |  | finance-portfolio-rebalancing_id + timestamp |
| finance-real-time-liquidity-positioning | irreversible |  | finance-real-time-liquidity-positioning_id + timestamp |
| finance-regulatory-enforcement | irreversible |  | finance-regulatory-enforcement_id + timestamp |
| finance-smart-contract-triggering | irreversible |  | finance-smart-contract-triggering_id + timestamp |
| finance-volatility-stress-testing | irreversible |  | finance-volatility-stress-testing_id + timestamp |
| form-and-survey-builder | write_safe |  | form-and-survey-builder_id + timestamp |
| form-field-mapper | write_safe |  | form-field-mapper_id + timestamp |
| funnel-blueprint-architect | write_safe |  | funnel-blueprint-architect_id + timestamp |
| funnel-blueprint-generator | write_safe |  | funnel-blueprint-generator_id + timestamp |
| funnel-builder | write_safe |  | funnel-builder_id + timestamp |
| funnel-cloner | write_safe |  | funnel-cloner_id + timestamp |
| funnel-qa-checklist | write_safe |  | funnel-qa-checklist_id + timestamp |
| ghl-api | write_safe | ghl | location_id + resource + action + entity_id |
| ghl-browser-control | irreversible | browser | location_id + workflow_action + entity_id |
| ghl-course-manager | write_safe |  | ghl-course-manager_id + timestamp |
| ghl-email-service | write_safe |  | ghl-email-service_id + timestamp |
| ghl-funnel-cloner | write_safe |  | ghl-funnel-cloner_id + timestamp |
| ghl-media-manager | write_safe |  | ghl-media-manager_id + timestamp |
| ghl-oauth-manager | write_safe |  | ghl-oauth-manager_id + timestamp |
| ghl-offer-creator | write_safe |  | ghl-offer-creator_id + timestamp |
| ghl-saas-manager | write_safe |  | ghl-saas-manager_id + timestamp |
| ghl-setup-validator | write_safe |  | ghl-setup-validator_id + timestamp |
| ghl-social-planner | write_safe |  | ghl-social-planner_id + timestamp |
| ghl-workflow-builder | write_safe |  | ghl-workflow-builder_id + timestamp |
| google-drive-manager | write_safe |  | google-drive-manager_id + timestamp |
| hubspot-contact-updater | write_safe |  | hubspot-contact-updater_id + timestamp |
| idempotency-practices | write_safe |  | idempotency-practices_id + timestamp |
| invoice-generator | write_safe |  | invoice-generator_id + timestamp |
| knowledge-base-builder | write_safe |  | knowledge-base-builder_id + timestamp |
| landing-page-builder | write_safe |  | landing-page-builder_id + timestamp |
| mailchimp-campaign-drafter | write_safe |  | mailchimp-campaign-drafter_id + timestamp |
| notion-workspace-synchronizer | write_safe |  | notion-workspace-synchronizer_id + timestamp |
| opportunity-mover | write_safe |  | opportunity-mover_id + timestamp |
| page-builder | write_safe |  | page-builder_id + timestamp |
| pipeline-manager | write_safe |  | pipeline-manager_id + timestamp |
| retry-backoff-wrapper | write_safe |  | retry-backoff-wrapper_id + timestamp |
| salesforce-lead-creator | write_safe |  | salesforce-lead-creator_id + timestamp |
| sequence-orchestrator | write_safe | telegram, email | sequence_id + recipient + step |
| slack-channel-broadcaster | write_safe |  | slack-channel-broadcaster_id + timestamp |
| snapshot-deployer | write_safe |  | snapshot-deployer_id + timestamp |
| social-content | write_safe |  | social-content_id + timestamp |
| social-distributor | write_safe |  | social-distributor_id + timestamp |
| social-media-publisher | irreversible | browser | platform + asset_hash + scheduled_at |
| social-poster | write_safe |  | social-poster_id + timestamp |
| stripe-transaction-exporter | write_safe |  | stripe-transaction-exporter_id + timestamp |
| subaccount-provisioner | write_safe |  | subaccount-provisioner_id + timestamp |
| subscription-dunning-manager | write_safe |  | subscription-dunning-manager_id + timestamp |
| tagging-engine | write_safe |  | tagging-engine_id + timestamp |
| webhook-listener-config | write_safe | ghl | location_id + webhook_url |
| webhook-payload-formatter | write_safe |  | webhook-payload-formatter_id + timestamp |
| webhook-replay-tooling | write_safe |  | webhook-replay-tooling_id + timestamp |
| woocommerce-manager | write_safe |  | woocommerce-manager_id + timestamp |
| wordpress-divi-manager | write_safe |  | wordpress-divi-manager_id + timestamp |
| workflow-loop-detector | write_safe |  | workflow-loop-detector_id + timestamp |
| youtube-manager | write_safe |  | youtube-manager_id + timestamp |
| cross-business-scope-governor | write_safe | supabase | audit_type + date |
| self-healing-integrations | write_safe | supabase, ghl, telegram | provider + check_timestamp |
| autonomous-revenue-ops | write_safe | supabase, ghl, telegram | business_id + date |
| customer-journey-intelligence | write_safe | supabase, ghl, telegram | contact_id + event_type + timestamp |
| native-ghl-build-refactor | irreversible | supabase, ghl, telegram | entity_type + entity_id + operation |
| experiment-engine | write_safe | supabase, telegram | experiment_id + variant + contact_id |
| content-to-campaign-factory | write_safe | supabase, telegram | idea_id + channel + asset_type |
| offer-engineering | write_safe | supabase, telegram | offer_id + analysis_date |
