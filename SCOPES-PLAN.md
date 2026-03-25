# OpenClaw × Truth J Blue — Business & GHL Scopes Plan

## 1. Purpose

This document defines **Business Scopes** (what each agent is allowed to do) and **GHL Scopes** (technical permissions for the GoHighLevel Private Integration token) for the current OpenClaw build serving Truth J Blue LLC.
It ensures least-privilege access, consistent behavior across 100+ agents/skills, and alignment with the existing GoHighLevel OpenClaw blueprint.

---

## 2. Scope Types

We distinguish three layers of scope:

- **Business Scope** – Human-readable description of what an agent/skill is allowed to do in the business.
- **GHL Scope** – The GoHighLevel API permissions actually granted via Private Integration.
- **Operational Boundaries** – Hard "never do this" constraints baked into SOUL/config for each agent.

Every agent or skill must be explicitly mapped to one or more Business Scopes, which in turn map to a fixed GHL Scope set.

---

## 3. Canonical GHL Scope Sets

These are the "building blocks" for tokens; we reuse them instead of inventing one-off permissions per agent.
Authoritative machine-readable definitions live in `config/ghl-scope-sets.json`.

### 3.1 Read-Only Insight

**Use for:** Analytics/reporting agents, main orchestrator read access.

- Contacts: Read
- Conversations: Read
- Calendars: Read
- Opportunities: Read
- Custom Fields: Read
- Forms: Read
- Transactions: Read
- Workflows: Read
- Funnels: Read (optional)
- Users: Read (optional)

### 3.2 Lead Nurture

**Use for:** Marketing/lead nurture agents, Divine Seeker nurture automation helpers.

- Contacts: Read/Write
- Conversations: Read/Write
- Custom Fields: Read/Write
- Workflows: Read/Write
- Forms: Read
- Funnels: Read
- Opportunities: Read

### 3.3 Sales & Pipeline

**Use for:** Pipeline management, discovery call prep, no-show handling.

- Contacts: Read/Write
- Opportunities: Read/Write
- Conversations: Read/Write
- Calendars: Read/Write
- Custom Fields: Read/Write
- Transactions: Read
- Workflows: Read
- Forms: Read

### 3.4 Support & Inbox

**Use for:** Support email/SMS drafters, low-risk auto-responses.

- Contacts: Read/Write
- Conversations: Read/Write
- Custom Fields: Read/Write
- Workflows: Read
- Forms: Read

### 3.5 Operations & Reporting

**Use for:** Daily briefings, weekly performance reports, token rotation reminders.

- Contacts: Read/Write (notes/log fields only)
- Opportunities: Read
- Funnels: Read
- Workflows: Read
- Transactions: Read
- Calendars: Read
- Forms: Read
- Users: Read

### 3.6 Re-engagement

**Use for:** Cold database reactivation, long-term nurture.

- Contacts: Read/Write
- Opportunities: Read/Write
- Conversations: Read/Write
- Custom Fields: Read/Write
- Workflows: Read/Write

### 3.7 Community Migration

**Use for:** Skool → GHL migration helper.

- Contacts: Read/Write
- Custom Fields: Read/Write
- Conversations: Read/Write
- Workflows: Read/Write

### 3.8 Value Ladder Ascension

**Use for:** Scorecard → Audit → Toolkit → Group → Coaching → BTV recommendations.

- Contacts: Read/Write
- Custom Fields: Read/Write
- Opportunities: Read/Write
- Workflows: Read/Write
- Forms: Read
- Transactions: Read

### 3.9 Payment Monitor (Read-Only Finance)

**Use for:** Revenue reporting, alerts, but no financial write-actions.

- Transactions: Read
- Contacts: Read/Write (revenue-related fields only)
- Opportunities: Read/Write
- Funnels: Read

> Note: Full financial write (invoice creation, refunds, coupons) should remain disabled until explicitly tested and documented separately.

---

## 4. Business Scope Archetypes

These are the "roles" you assign to agents/skills. Each archetype points to one or more of the GHL scope sets above.

### 4.1 Main Orchestrator

- **Role:** Central router for tasks between sub-agents; composes daily/weekly briefings; does not talk directly to leads/clients.
- **Business Scope:**
  - Can read CRM state across contacts, calendars, opportunities, workflows, funnels.
  - Can write internal notes/logs only (no outbound to contacts).
- **GHL Scopes:** Read-Only Insight + Operations & Reporting.
- **Operational Boundaries:**
  - Never send outbound messages to contacts.
  - Never move deals between pipeline stages.
  - Never change pricing, products, or funnel structure.

### 4.2 Marketing / Lead Nurture Agent

- **Role:** Speed-to-lead, Divine Seeker Nurture, campaign monitoring.
- **Business Scope:**
  - Detect new leads and respond within minutes via SMS/email.
  - Enroll/unenroll contacts into nurture workflows.
  - Update tags and alignment/engagement fields.
- **GHL Scopes:** Lead Nurture.
- **Operational Boundaries:**
  - Never modify products, pricing, or payment links.
  - Never bulk-delete contacts, tags, or fields.
  - Never send financial details or links not whitelisted.

### 4.3 Sales / Pipeline Agent

- **Role:** Discovery call prep, pipeline health check, no-show recovery.
- **Business Scope:**
  - Move opportunities between stages based on clear triggers.
  - Send follow-up messages and rebooking links for no-shows.
  - Prepare pre-call briefings and send to Jeremiah internally.
- **GHL Scopes:** Sales & Pipeline.
- **Operational Boundaries:**
  - Never mark an opportunity "Closed Won" without explicit conditions.
  - Never alter product/pricing; only reference existing offers.
  - Escalate Beyond the Veil decisions to Jeremiah; do not auto-enroll.

### 4.4 Support / Inbox Agent

- **Role:** Helpdesk/light customer support, drafts and low-risk sends.
- **Business Scope:**
  - Draft replies to support questions using GHL history.
  - Auto-send only low-risk responses (access, password reset, FAQs).
  - Tag and route complex issues to human review.
- **GHL Scopes:** Support & Inbox.
- **Operational Boundaries:**
  - Never issue refunds or invoice changes.
  - Never promise custom pricing or contracts.
  - Complex or emotional topics stay in "draft for review" status.

### 4.5 Operations / Reporting Agent

- **Role:** Daily pipeline briefings, weekly performance reports, token rotation reminders.
- **Business Scope:**
  - Generate and send KPI reports to internal channels.
  - Flag anomalies: stale deals, no-contact leads, no-show trends.
  - Maintain log fields for internal diagnostics.
- **GHL Scopes:** Operations & Reporting.
- **Operational Boundaries:**
  - Never send messages to leads/clients.
  - Never modify workflows or funnels directly.

### 4.6 Re-engagement Agent

- **Role:** Work cold leads, reactivation, long-term nurture.
- **Business Scope:**
  - Identify inactive leads based on last activity.
  - Send personalized reactivation messages.
  - Move re-engaged contacts back into active pipeline.
- **GHL Scopes:** Re-engagement.
- **Operational Boundaries:**
  - Never message contacts marked "Do Not Contact".
  - Respect communication preferences and compliance tags.
  - No discounting or price promises beyond predefined offers.

### 4.7 Community Migration Agent

- **Role:** Skool → GHL Divine Path Walkers migration orchestration.
- **Business Scope:**
  - Track migration custom fields (status, dates).
  - Send migration instructions and nudges.
  - Report aggregate migration progress.
- **GHL Scopes:** Community Migration.
- **Operational Boundaries:**
  - Never remove someone from community access autonomously.
  - Never modify payment or subscription status.

### 4.8 Value Ladder Agent

- **Role:** Move contacts along the 7–9 tier value ladder based on behavior.
- **Business Scope:**
  - Recommend and tag "Next Best Offer" (Scorecard → Audit → Toolkit → Group → Coaching → BTV).
  - Enroll contacts into corresponding workflows when criteria met.
  - Update "Value Ladder Position" and "Next Step" fields.
- **GHL Scopes:** Value Ladder Ascension.
- **Operational Boundaries:**
  - Never bypass required application steps (e.g., BTV application).
  - Never take payment actions; redirect to existing checkout flows only.

### 4.9 Payment Monitor Agent

- **Role:** Monitor revenue, payment outcomes, and send **internal** alerts.
- **Business Scope:**
  - Read transactions, flag failed payments, and update fields.
  - Send internal Telegram/email summaries of revenue.
- **GHL Scopes:** Payment Monitor (Read-Only Finance).
- **Operational Boundaries:**
  - Never charge cards, create invoices, or issue refunds.
  - Never send payment links directly to contacts without explicit whitelisting.

---

## 5. Agent-to-Scope Classification

### 5.1 GHL-Touching Agents (TJB Sub-Account)

| Agent ID | Business Scope Archetype | Token Group | GHL Tools |
|---|---|---|---|
| biz_01_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_02_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_03_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_04_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_05_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_06_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_07_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_08_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_09_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| biz_10_pod_lead | Main Orchestrator | token_insight_ops | ghl_contacts, ghl_workflows |
| browser_primary | Operations / Reporting | token_insight_ops | ghl_browser_control |
| d1_ceo | Operations / Reporting | token_insight_ops | ghl_contacts, ghl_opportunities |
| d1_cmo | Marketing / Lead Nurture | token_marketing_nurture | ghl_marketing |
| d1_customer_success | Support / Inbox | token_support_inbox | ghl_contacts, ghl_conversations |
| d1_sales_manager | Sales / Pipeline | token_sales_pipeline | ghl_opportunities, ghl_pipelines |
| d2_director | Operations / Reporting | token_insight_ops | ghl_ecommerce |
| d2_store_manager | Payment Monitor | token_payments_readonly | ghl_products |
| d3_biz_dev | Sales / Pipeline | token_sales_pipeline | ghl_opportunities |
| d4_enrollment | Sales / Pipeline | token_sales_pipeline | ghl_opportunities |
| d4_funnel_strategist | Marketing / Lead Nurture | token_marketing_nurture | ghl_funnels, ghl_workflows |
| d8_automation_architect | Operations / Reporting | token_insight_ops | ghl_workflow_builder |
| d8_crm_ops | Operations / Reporting | token_insight_ops | ghl_api |
| d8_funnel_engineer | Marketing / Lead Nurture | token_marketing_nurture | ghl_funnel_cloner |
| d8_membership_director | Value Ladder | token_value_ladder | ghl_offer_creator |
| d8_platform_architect | Operations / Reporting | token_insight_ops | ghl_oauth_manager, ghl_setup_validator |
| d8_revenue_ops | Payment Monitor | token_payments_readonly | ghl_api |
| d8_saas_director | Operations / Reporting | token_insight_ops | ghl_api |

### 5.2 Token Groups (TJB Sub-Account)

| Token Group | Env Var | Scope Sets | Agent Count |
|---|---|---|---|
| token_insight_ops | `GHL_TOKEN_INSIGHT_OPS_TJB` | Read-Only Insight + Operations & Reporting | 17 |
| token_marketing_nurture | `GHL_TOKEN_MARKETING_TJB` | Lead Nurture + Re-engagement | 3 |
| token_sales_pipeline | `GHL_TOKEN_SALES_TJB` | Sales & Pipeline | 3 |
| token_support_inbox | `GHL_TOKEN_SUPPORT_TJB` | Support & Inbox | 1 |
| token_value_ladder | `GHL_TOKEN_VALUE_LADDER_TJB` | Value Ladder Ascension + Community Migration | 1 |
| token_payments_readonly | `GHL_TOKEN_PAYMENTS_RO_TJB` | Payment Monitor (Read-Only Finance) | 2 |

---

## 6. Implementation

### 6.1 GHL Private Integrations

For each token group, create one Private Integration in GHL (Settings → Integrations → Private Integrations):

1. **OpenClaw – Insight & Ops** → scopes from §3.1 + §3.5
2. **OpenClaw – Marketing Nurture** → scopes from §3.2 + §3.6
3. **OpenClaw – Sales Pipeline** → scopes from §3.3
4. **OpenClaw – Support Inbox** → scopes from §3.4
5. **OpenClaw – Value Ladder** → scopes from §3.7 + §3.8
6. **OpenClaw – Payments ReadOnly** → scopes from §3.9

### 6.2 OpenClaw Config

1. Env vars set per token group (see §5.2 table).
2. Each agent entry in `config/agents_config.json` gets `business_scope`, `ghl_token_group`, and `operational_boundaries` fields.
3. The GHL client resolves tokens by `tokenGroup` via `lib/ghl-tenant-resolver.mjs`.
4. Per-agent deny-lists block risky operations even if the underlying token permits them.

### 6.3 Code Enforcement

- `lib/ghl-scope-enforcer.mjs` loads scope sets + token groups and computes per-agent deny-lists.
- `lib/ghl-client.mjs` accepts an optional `tokenGroup` parameter and wraps API methods with deny-list checks.
- `lib/security-governance.mjs` integrates GHL scope enforcement into `enforceAgentCapability()`.

---

## 7. Security & Audit

- **Minimal Scopes:** Never grant more scopes than the Business Scope requires.
- **Token Rotation:** Rotate every 90 days and after any suspected compromise.
- **Skill Hygiene:** Only use verified skills; re-scan after updates; avoid arbitrary HTTP skills tied to GHL tokens.
- **Change Log:** Maintain `SCOPES-CHANGELOG.md` recording all scope changes.
- **Fallback Chain:** If a scoped token env var is missing, the system falls back to the tenant-wide token (`GHL_PRIVATE_INTEGRATION_TOKEN_TJB`) for deployment safety.

---

## 8. Reference Files

| File | Purpose |
|---|---|
| `config/ghl-scope-sets.json` | Machine-readable canonical scope sets (§3) |
| `config/ghl-token-groups.json` | Token group → scope set → env var mapping (§5.2) |
| `config/agents_config.json` | Agent entries with `business_scope`, `ghl_token_group`, `operational_boundaries` |
| `config/governance/agent-scope-space-mapping.json` | Organizational scope + GHL token group linkage |
| `lib/ghl-scope-enforcer.mjs` | Runtime scope enforcement logic |
| `lib/ghl-tenant-resolver.mjs` | Token resolution by group with fallback chain |
| `lib/ghl-client.mjs` | GHL API client with deny-list enforcement |
| `SCOPES-CHANGELOG.md` | Audit trail for all scope changes |
