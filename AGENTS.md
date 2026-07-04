# AGENTS

Generated from [config/agents_config.json](./config/agents_config.json). Do not edit manually.

## Canonical Config Rule (Advancement 5)

Hand-edit only `config/agents_config.json` and `skills/`. The root
`agents_config.json` and `workspace/skills/` are **generated mirrors** — after
canonical edits run `node scripts/sync-canonical-config.mjs --write`.
`pnpm config:check` (part of `pnpm validate`) fails CI on drift.

## Divisions

| Division | Name | Agent Count |
| --- | --- | --- |
| division_1_core_operations | Core Company Operations (Truth J Blue LLC HQ) | 10 |
| division_2_ecommerce | eCommerce Operations | 10 |
| division_3_consulting | Consulting Practice | 10 |
| division_4_coaching | Coaching & Community (Beyond the Veil / Divine Path Walkers) | 10 |
| division_5_publishing | Publishing (Books & Media) | 10 |
| division_6_nonprofit | Nonprofit Operations (Inspire Build Motivate, Inc.) | 10 |
| division_7_shared_services | Cross-Division Shared Services & Runtime Supervisors | 20 |
| division_8_saas_operations | SaaS Operations (Shared GHL Enablement) | 13 |
| division_9_online_store | Online Store Operations (store.truthjblue.com - Books & Merch) | 10 |

## Capability Snapshot

| Agent | Org Unit | Tools | Channels | Action Families |
| --- | --- | --- | --- | --- |
| biz_01_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_02_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_03_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_04_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_05_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_06_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_07_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_08_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_09_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| biz_10_pod_lead | division_7_shared_services | 7 | 1 | 1 |
| browser_primary | division_7_shared_services | 7 | 2 | 1 |
| browser_secondary | division_7_shared_services | 5 | 0 | 0 |
| d1_ceo | division_1_core_operations | 8 | 2 | 2 |
| d1_cmo | division_1_core_operations | 7 | 2 | 1 |
| d1_cto | division_1_core_operations | 7 | 2 | 0 |
| d1_customer_success | division_1_core_operations | 6 | 2 | 1 |
| d1_data_analyst | division_1_core_operations | 6 | 0 | 1 |
| d1_devops | division_1_core_operations | 7 | 2 | 0 |
| d1_fullstack_dev | division_1_core_operations | 7 | 0 | 0 |
| d1_product_dev_manager | division_1_core_operations | 6 | 0 | 0 |

Total configured agents: 103
