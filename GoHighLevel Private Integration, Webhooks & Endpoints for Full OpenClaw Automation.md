# GoHighLevel Private Integration, Webhooks & Endpoints to Fully Automate OpenClaw

## Executive Summary

OpenClaw is a locally-running AI agent that can operate directly through GoHighLevel's API v2, enabling autonomous CRM actions — sending SMS, WhatsApp and email, managing contacts, booking appointments, triggering workflows, and more. The bridge between OpenClaw and GHL is the **Private Integration Token (PIT)** — a static OAuth2 bearer token generated from your GHL Agency Settings that grants scoped API v2 access. This document covers the full stack: how to set up the Private Integration, which scopes to enable, the key API v2 endpoints OpenClaw will call, how to configure inbound and outbound webhooks, and an optional middleware pattern using n8n to fill the gaps where the GHL API is limited.[^1][^2][^3][^4]

***

## Part 1: GoHighLevel Private Integration — Setup

### What Is a Private Integration?

Private Integrations are secure, scope-restricted OAuth2 bearer tokens that give external apps (like OpenClaw) access to GHL API v2 endpoints. They differ from legacy API Keys (which were v1, unrestricted, and now end-of-life) and from standard OAuth2 tokens (which expire daily). A Private Integration Token is **static and does not auto-refresh** — it stays valid until you rotate it manually.[^2][^3]

| Feature | Private Integration Token | API Key (v1) | OAuth2 Access Token |
|---|---|---|---|
| API Version | v2 (current) [^2] | v1 (EOL) | v2 |
| Security | Scope-restricted [^3] | Unrestricted | Scope-restricted |
| Refresh | Manual rotation | N/A | Auto, daily |
| Best For | OpenClaw, custom integrations | Legacy only | Marketplace apps |

### Step-by-Step: Creating Your Private Integration Token

1. Log into your GHL Agency account.
2. Navigate to **Settings → Private Integrations** (enable via Labs if not visible).[^2]
3. Click **"Create New Integration"** and give it a descriptive name (e.g., "OpenClaw Automation").
4. Select the **scopes/permissions** required for your use case (see Scopes section below).[^3]
5. Click **Create** — **copy the token immediately**, as it cannot be retrieved again after closing.[^2]
6. Paste the token into OpenClaw's GHL configuration (or your environment variables).

> **Security Best Practice:** Rotate this token every 90 days. GHL provides a 7-day grace window where both the old and new tokens work simultaneously, giving you time to update your integration.[^2]

### Authentication Header Format

Every API v2 call must include the token in the Authorization header:

```bash
Authorization: Bearer <YOUR_PRIVATE_INTEGRATION_TOKEN>
Version: 2021-07-28
Content-Type: application/json
```

**Example — Fetch a sub-account's details:**

```bash
curl --request GET \
  --url https://services.leadconnectorhq.com/locations/{locationId} \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer <YOUR_PRIVATE_INTEGRATION_TOKEN>' \
  --header 'Version: 2021-07-28'
```


### Required Scopes for Full OpenClaw Automation

When creating your Private Integration, select all scopes that OpenClaw will need. Enabling only what is required improves security. For full CRM automation via OpenClaw, the recommended scopes are:[^5]

| Scope Category | What It Enables |
|---|---|
| Contacts (read/write) | Create, update, search, delete contacts, manage tags and custom fields |
| Conversations (read/write) | Read message threads, send SMS/email/WhatsApp |
| Opportunities (read/write) | Create and update pipeline deals, change stages |
| Calendars (read/write) | Read available slots, book/update/cancel appointments |
| Workflows (read/write) | Trigger workflow enrollments for contacts |
| Locations (read) | Fetch sub-account details and configuration |
| Calls / Messages (read) | Retrieve call logs and recordings via conversation message endpoints |
| Users (read) | Resolve user IDs for assignment |
| Forms (read) | Read form submission data |
| Payments (read/write) | Access invoices, orders, and transactions |

> **Note on Calls:** GHL does not have a direct `/calls` endpoint in v2. Call data is retrieved by fetching messages from a conversation filtered by `TYPE_CALL`, then using the message ID to pull recordings and transcriptions.[^6]

***

## Part 2: Key API v2 Endpoints OpenClaw Needs

All endpoints use the base URL: `https://services.leadconnectorhq.com/`

The GHL developer portal at `https://marketplace.gohighlevel.com/docs/` is the canonical reference for all endpoints.[^7][^8]

### Contacts API

The Contacts API supports full CRUD operations, tagging, and custom field management.[^9]

| Action | Method | Endpoint |
|---|---|---|
| Search contacts | `GET` | `/contacts/?locationId={id}&query={term}` |
| Get contact by ID | `GET` | `/contacts/{contactId}` |
| Create contact | `POST` | `/contacts/` |
| Update contact | `PUT` | `/contacts/{contactId}` |
| Delete contact | `DELETE` | `/contacts/{contactId}` |
| Add tag | `POST` | `/contacts/{contactId}/tags` |
| Remove tag | `DELETE` | `/contacts/{contactId}/tags` |
| Get contact notes | `GET` | `/contacts/{contactId}/notes` |
| Add note | `POST` | `/contacts/{contactId}/notes` |
| Get contact tasks | `GET` | `/contacts/{contactId}/tasks` |
| Add task | `POST` | `/contacts/{contactId}/tasks` |

**Example — Create a contact:**

```bash
curl --request POST \
  --url https://services.leadconnectorhq.com/contacts/ \
  --header 'Authorization: Bearer <TOKEN>' \
  --header 'Content-Type: application/json' \
  --header 'Version: 2021-07-28' \
  --data '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "[email protected]",
    "phone": "+1234567890",
    "locationId": "YOUR_LOCATION_ID"
  }'
```


### Conversations & Messaging API

GHL's Conversations API handles all messaging channels — SMS, email, WhatsApp, Messenger, Instagram, and Web Chat.[^10]

| Action | Method | Endpoint |
|---|---|---|
| Get conversations | `GET` | `/conversations/?locationId={id}&contactId={id}` |
| Get conversation by ID | `GET` | `/conversations/{conversationId}` |
| Create conversation | `POST` | `/conversations/` |
| Get messages | `GET` | `/conversations/{conversationId}/messages` |
| Send a message | `POST` | `/conversations/messages` |
| Add inbound message | `POST` | `/conversations/messages/inbound` |
| Get message by ID | `GET` | `/conversations/messages/{messageId}` |
| Get call recording | `GET` | `/conversations/messages/{messageId}/recording` |
| Get call transcription | `GET` | `/conversations/messages/{messageId}/transcription` |

> **For call data retrieval:** Get messages from a conversation filtered for `TYPE_CALL`, grab the `messageId`, then call the recording/transcription endpoints. This is the GHL-supported workaround for the lack of a dedicated calls endpoint.[^6]

**Message types supported:** `SMS`, `Email`, `WhatsApp`, `FB_Messenger`, `Instagram`, `TYPE_CALL`.[^10]

### Opportunities (Pipeline) API

| Action | Method | Endpoint |
|---|---|---|
| Get opportunities | `GET` | `/opportunities/search?location_id={id}` |
| Get opportunity | `GET` | `/opportunities/{opportunityId}` |
| Create opportunity | `POST` | `/opportunities/` |
| Update opportunity | `PUT` | `/opportunities/{opportunityId}` |
| Update stage | `PUT` | `/opportunities/{opportunityId}` |
| Delete opportunity | `DELETE` | `/opportunities/{opportunityId}` |
| Get pipelines | `GET` | `/opportunities/pipelines?locationId={id}` |

### Calendar & Appointments API

| Action | Method | Endpoint |
|---|---|---|
| Get calendars | `GET` | `/calendars/?locationId={id}` |
| Get free slots | `GET` | `/calendars/{calendarId}/free-slots` |
| Get appointments | `GET` | `/calendars/events/appointments` |
| Create appointment | `POST` | `/calendars/events/appointments` |
| Get appointment | `GET` | `/calendars/events/appointments/{appointmentId}` |
| Update appointment | `PUT` | `/calendars/events/appointments/{appointmentId}` |
| Delete appointment | `DELETE` | `/calendars/events/appointments/{appointmentId}` |

### Workflows API

| Action | Method | Endpoint |
|---|---|---|
| Get workflows | `GET` | `/workflows/?locationId={id}` |
| Enroll contact in workflow | `POST` | `/contacts/{contactId}/workflow/{workflowId}` |
| Remove contact from workflow | `DELETE` | `/contacts/{contactId}/workflow/{workflowId}` |

### Sub-Account (Location) API

| Action | Method | Endpoint |
|---|---|---|
| Get sub-account details | `GET` | `/locations/{locationId}` |
| Get custom fields | `GET` | `/locations/{locationId}/customFields` |
| Create custom field | `POST` | `/locations/{locationId}/customFields` |
| Get custom values | `GET` | `/locations/{locationId}/customValues` |

***

## Part 3: Webhooks — Inbound and Outbound

### Inbound Webhooks (GHL → OpenClaw/Middleware)

GHL's **Inbound Webhook Workflow Trigger** generates a unique URL for each workflow. When an external system POSTs to this URL, the workflow fires. This allows OpenClaw or your middleware layer to push events into GHL automations.[^11]

**Setup steps:**
1. Go to **Automation → Workflows** and create or open a workflow.
2. Add Trigger → select **"Inbound Webhook"** (premium trigger).[^12]
3. GHL generates a unique webhook URL — copy it.
4. Point your external system or OpenClaw to POST JSON payloads to this URL.
5. Map incoming fields in the workflow to GHL contact/custom fields.[^12]

Supports `POST`, `GET`, and `PUT` requests with JSON payloads.[^11]

### Outbound Webhooks (GHL → OpenClaw/n8n)

The **Custom Webhook Workflow Action** lets GHL push data to any external endpoint when a workflow step executes.[^13]

**Supported HTTP methods:** `GET`, `POST`, `PUT`, `DELETE`[^13]

**Setup steps:**
1. Inside a workflow, add a new action → select **"Custom Webhook"**.
2. Choose the HTTP method and enter the target URL (your OpenClaw webhook endpoint or n8n webhook).
3. Add headers (include `Authorization: Bearer <TOKEN>` for secured endpoints).
4. Define the request body using merge fields from GHL contact/workflow data.[^13]

### GHL Platform Webhook Events (for OAuth Apps / Marketplace Integrations)

If you build an OAuth app (vs. just using a PIT), GHL can push real-time notifications for 50+ platform events to a registered webhook URL. These cover:[^8]

| Category | Events |
|---|---|
| **Contact** | ContactCreate, ContactUpdate, ContactDelete, ContactTagUpdate |
| **Opportunity** | OpportunityCreate, OpportunityUpdate, OpportunityStatusUpdate, OpportunityStageUpdate |
| **Appointment** | AppointmentCreate, AppointmentUpdate |
| **Task** | TaskCreate, TaskComplete, TaskDelete |
| **Invoice** | InvoiceCreate, InvoiceUpdate, InvoiceDelete, InvoicePaid |
| **Products** | ProductCreate, ProductUpdate, ProductDelete |
| **Location** | LocationCreate, LocationUpdate |
| **User** | UserCreate, UserUpdate |
| **Associations** | Association events across objects |
[^14]

**Webhook Signature Verification:** GHL signs all outbound webhooks. The current standard is Ed25519 (`X-GHL-Signature`); the legacy RSA header (`X-WH-Signature`) will be deprecated July 1, 2026. Always verify using the Ed25519 public key:[^14]

```
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----
```


> **Private Integration Webhook Limitation:** As of early 2025, registering webhook subscriptions directly on Private Integration Tokens is not natively supported — webhooks for PIT-based integrations still require the automation builder triggers. A feature request to add webhook registration to private integrations is open on GHL's ideas board. The recommended workaround is using GHL Workflow Outbound Webhooks or an OAuth app for event subscriptions.[^15][^16]

***

## Part 4: Installing the Official ghl-crm Skill for OpenClaw

The official OpenClaw `ghl-crm` skill is the fastest path to GHL automation. It wraps the full GHL API v2 — contacts, pipelines, conversations, calendars, appointments, and workflows — into CLI-executable scripts that OpenClaw can invoke directly.[^17]

**Install command:**

```bash
# Register your agent first (if not already done)
npx -y @lobehub/market-cli register \
  --name "YourAgentName" \
  --description "Your agent description" \
  --source open-claw

# Install the ghl-crm skill
npx -y @lobehub/market-cli skills install openclaw-skills-ghl-crm --agent open-claw
```


The skill installs to `~/.openclaw/skills/` and requires two environment variables to be set:
- `GHL_PRIVATE_INTEGRATION_TOKEN` — your PIT token from Part 1
- `GHL_LOCATION_ID` — your sub-account location ID

After installation, read `SKILL.md` in the installed directory for field mappings and usage examples.[^17]

***

## Part 5: OpenClaw + n8n Middleware Architecture (Recommended for Complex Flows)

For retrieving data that OpenClaw cannot pull directly (such as structured call logs) or for complex conditional logic, using **n8n as a middleware layer** between OpenClaw and GHL is the professional-grade pattern.[^18][^19]

### Why n8n as Middleware?

- n8n has a native **HighLevel node** with all GHL API operations pre-built — no raw endpoint management.[^18]
- You give OpenClaw a single, stable webhook URL to send requests to.
- n8n translates those requests into proper GHL API calls and returns structured data.[^18]
- n8n handles retries, conditional branching, data transformation, and multi-system sync.[^19]

### Architecture Pattern

```
OpenClaw Agent
     │
     │  POST to webhook URL with task payload
     ▼
n8n Webhook Node (stable URL)
     │
     ├── HighLevel Node (Get Contacts, Send Message, etc.)
     ├── Conditional Logic (branching, filters)
     ├── Data Transform (format responses)
     └── Return data to OpenClaw
```

**How to set it up:**
1. In n8n, create a new workflow with a **Webhook trigger node** — this gives OpenClaw its stable endpoint.
2. Add a **HighLevel node** and select the operation (e.g., "Call → Get Many", "Contact → Update").[^18]
3. Authenticate the HighLevel node with your PIT token.
4. Use a **Respond to Webhook node** to return the result to OpenClaw.
5. Prompt OpenClaw to "send a request to [n8n webhook URL]" rather than referencing GHL endpoints directly.[^18]

### When to Use Direct GHL API vs. n8n

| Use Case | Direct GHL API via OpenClaw | n8n Middleware |
|---|---|---|
| Create/update a contact | ✅ Direct | Optional |
| Send SMS or email | ✅ Direct | Optional |
| Book appointment | ✅ Direct | Optional |
| Retrieve recent calls | ⚠️ Multi-step (conversation + message ID) | ✅ Recommended |
| Complex conditional logic | ❌ Not native | ✅ Best choice |
| Multi-system data sync | ❌ | ✅ Best choice |
| Real-time GHL event webhooks | ⚠️ Workflow triggers only | ✅ Recommended |

***

## Part 6: MoltClaw — OpenClaw Natively Inside GHL

In early 2026, GoHighLevel launched **MoltClaw** — an OpenClaw/MCP-powered AI agent built directly into GHL sub-accounts. MoltClaw operates with 40+ built-in CRM skills and access to more than 350 API endpoints, covering contacts, conversations, funnels, calendars, courses, workflows, invoices, and more.[^20][^21]

This means for Truth J Blue LLC's GHL sub-accounts, you can potentially run AI automation queries directly from inside GHL's Ask AI interface — no external OpenClaw install required for basic operations. MoltClaw is effectively OpenClaw's architecture operating with GHL-native permissions and context.[^21]

> **Current MoltClaw limitation:** Not all API endpoints are exposed yet. Operations like renaming pipeline stages or certain custom object manipulations are still limited by what the platform's API exposes — the agent will tell you when it hits a ceiling.[^21]

***

## Part 7: Comprehensive API Endpoint Quick Reference

### Base URL
`https://services.leadconnectorhq.com/`

### Required Headers (All Requests)
```
Authorization: Bearer <PRIVATE_INTEGRATION_TOKEN>
Version: 2021-07-28
Content-Type: application/json
```

### Calls/Recordings (Multi-Step Workaround)
Since there is no dedicated `/calls` endpoint in GHL API v2, retrieving call data requires two steps:[^6]

```
Step 1: GET /conversations/{conversationId}/messages
         → filter for messages where type = "TYPE_CALL"
         → extract {messageId}

Step 2a: GET /conversations/messages/{messageId}/recording
         → returns call audio recording

Step 2b: GET /conversations/messages/{messageId}/transcription
         → returns call transcript
```

### Rate Limits & Retry Behavior
- GHL webhooks only retry on `429` (rate limit) responses.[^14]
- Retry interval: 10 minutes with jitter, up to 6 retries (~70 minutes total).[^14]
- On `5xx` errors, GHL does **not** retry — treat these as permanent failures.[^14]
- Always return `200 OK` to acknowledge webhook receipt; process asynchronously if needed.[^14]

### Official Documentation References
- **API Docs:** `https://marketplace.gohighlevel.com/docs/`[^8]
- **Developer Portal:** `https://developers.gohighlevel.com`[^2]
- **Stoplight (Interactive Docs):** `https://highlevel.stoplight.io/docs/integrations/`[^6]
- **Webhook Integration Guide:** `https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/`[^14]

***

## Conclusion & Action Plan

To fully automate OpenClaw against GHL, the recommended implementation sequence is:

1. **Create a Private Integration Token** in GHL Agency Settings with all required scopes.[^3][^2]
2. **Install the `ghl-crm` skill** in OpenClaw via the LobeHub marketplace CLI.[^17]
3. **Set your environment variables** (`GHL_PRIVATE_INTEGRATION_TOKEN`, `GHL_LOCATION_ID`) in OpenClaw's config.
4. **Build outbound webhook workflows** in GHL to push real-time events (contact updates, pipeline stage changes) to your OpenClaw or n8n endpoint.[^13]
5. **Set up n8n as middleware** for complex data retrieval (call logs, multi-step logic, conditional branching).[^19][^18]
6. **Explore MoltClaw** inside your GHL sub-account for in-platform AI actions that don't require an external agent.[^21]
7. **Plan for webhook signature migration** — switch to `X-GHL-Signature` (Ed25519) before the legacy RSA header is deprecated on July 1, 2026.[^14]

---

## References

1. [OpenClaw API Integration | Voters | HighLevel - GoHighLevel](https://ideas.gohighlevel.com/apis/p/openclaw-api-integration) - OpenClaw AI enables fully autonomous AI employees that operate directly through GoHighLevel's API, a...

2. [Private Integrations: Everything you need to know](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know) - Private Integrations allows you to build powerful custom integrations between your HighLevel account...

3. [Private Integrations | HighLevel API - GoHighLevel Marketplace](https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/) - Private Integrations allow you to build powerful custom integrations between your HighLevel account ...

4. [APIs - GoHighLevel](https://ideas.gohighlevel.com/apis) - OpenClaw AI enables fully autonomous AI employees that operate directly through GoHighLevel's API, a...

5. [Private Integrations in GoHighLevel - - ConsultEvo](https://consultevo.com/gohighlevel-private-integrations-guide/) - Learn how to create, manage, and share private integrations in GoHighLevel, including scopes, approv...

6. [API endpoint for calls | Voters - HighLevel](https://ideas.gohighlevel.com/apis/p/api-endpoint-for-calls) - Pull Messages by Conversation ID that have TYPE=TYPE_CALL and then use these id's to obtain recordin...

7. [HighLevel API Documentation](https://help.gohighlevel.com/support/solutions/articles/48001060529-highlevel-api-documentation) - Please Note: Our API Docs list all available endpoints ... It provides REST endpoints for contacts, ...

8. [HighLevel API Documentation - Developer Portal](https://marketplace.gohighlevel.com/docs/) - Complete REST API documentation for HighLevel CRM platform. Build powerful integrations with contact...

9. [Contacts | HighLevel API - GoHighLevel Marketplace](https://marketplace.gohighlevel.com/docs/ghl/contacts/contacts) - If the setting is configured to check both Email and Phone, the API will attempt to identify an exis...

10. [Conversations API -Add Inbound Message (with Contact ID)](https://help.gohighlevel.com/support/solutions/articles/155000007340-conversations-api-add-inbound-message-with-contact-id-) - Post inbound messages using a Contact ID to auto-thread or auto-create conversations, reduce API cal...

11. [Workflow Trigger - Inbound Webhook - HighLevel Support Portal](https://help.gohighlevel.com/support/solutions/articles/155000003147-workflow-trigger-inbound-webhook) - The Inbound Webhook Trigger in HighLevel allows users to initiate workflows based on incoming data f...

12. [GoHighLevel Inbound Webhook Guide - - ConsultEvo](https://consultevo.com/gohighlevel-inbound-webhook-workflow-trigger/) - Learn how to configure and use the GoHighLevel inbound webhook workflow premium trigger to capture d...

13. [GoHighLevel Custom Webhook Guide - - ConsultEvo](https://consultevo.com/gohighlevel-custom-webhook-workflows/) - Learn how to configure the custom webhook action in GoHighLevel workflows to send data to external a...

14. [Webhook Integration Guide | HighLevel API](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html) - Getting Started​ · Step 1: Create Your Webhook Endpoint​ · Step 2: Create a Simple Webhook Handler​ ...

15. [Register webhook endpoints for private integrations | APIs - HighLevel](https://ideas.gohighlevel.com/apis/p/register-webhook-endpoints-for-private-integrations) - Right now there's no way to register webhook endpoints for the new private integrations. This limits...

16. [Private Integrations for Sub-accounts | HighLevel Changelog](https://ideas.gohighlevel.com/changelog/private-integrations-for-sub-accounts) - We are excited to announce a new feature, Private Integrations, that allows sub-accounts to build po...

17. [ghl-crm | Skills Marketplace - LobeHub](https://lobehub.com/skills/openclaw-skills-ghl-crm) - ghl-crm provides a complete GoHighLevel (GHL) CRM integration for OpenClaw, enabling programmatic ma...

18. [How to connect open claw to go high level ? : r/gohighlevel - Reddit](https://www.reddit.com/r/gohighlevel/comments/1rkpdv0/how_to_connect_open_claw_to_go_high_level/) - Set up an n8n webhook, this gives your OpenClaw agent one simple, stable URL to talk to. In n8n, use...

19. [GoHighLevel vs n8n (2026): Agency Automation Stack Compared](https://ghl-services-playbooks-automation-crm-marketing.ghost.io/gohighlevel-vs-n8n/) - GoHighLevel handles client-facing marketing automation out of the box. n8n handles complex backend l...

20. [OpenClaw Integration, Canva Sync & A2P SMS Changes - YouTube](https://www.youtube.com/watch?v=3wuAtszkjlM) - ... endpoints. This update positions GoHighLevel to compete with emerging AI-first CRM ... MoltClaw ...

21. [OpenClaw INSIDE GoHighLevel?! MoltClaw Demo + Real ...](https://www.youtube.com/watch?v=Ckj5xRotL-k) - ... API. ✓ What you'll learn: - What is MoltClaw by HighLevel ... endpoints roll out. Links (add you...

