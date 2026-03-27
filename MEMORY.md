# MEMORY

Generated from [config/agents_config.json](./config/agents_config.json).

## Memory Model

- Primary operational state: Supabase tables for agents, events, approvals, metrics, and operation ledger.
- Local memory stores remain in place for workspace-bound context and should be treated as node-local state.
- Long-term governance and capability policy are version-controlled in config.

## Declared Memory Types

- `long-term` — persisted to Supabase; survives restarts and agent redeployment
- `shared` — readable by all agents within the same location context
- `short-term` — in-process only; cleared on agent restart
- `none` — stateless skill; no memory read or write

---

## Schema: Lead Memory

Tracks every person who enters the Truth J Blue ecosystem as a potential client
or community member before full onboarding.

```json
{
  "schema": "lead",
  "memory_type": "long-term",
  "fields": {
    "contactId": "GHL contact ID (primary key)",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "source": "string — e.g. 'instagram', 'book', 'referral', 'ad'",
    "firstTouchAt": "ISO timestamp — when they first entered GHL",
    "lastActivityAt": "ISO timestamp — most recent interaction",
    "speedToLeadSent": "boolean — was 5-min response triggered",
    "speedToLeadSentAt": "ISO timestamp",
    "pipelineStage": "string — current BTV pipeline stage name",
    "tags": "string[] — all GHL tags on this contact",
    "discoveryCallScheduled": "boolean",
    "discoveryCallAt": "ISO timestamp",
    "enrolledInBTV": "boolean",
    "notes": "string — agent-written observations"
  }
}
```

---

## Schema: Beyond the Veil Client Memory

Tracks every active and alumni Beyond the Veil mentorship client across
their full 12-week journey and beyond.

```json
{
  "schema": "btv_client",
  "memory_type": "long-term",
  "fields": {
    "contactId": "GHL contact ID (primary key)",
    "firstName": "string",
    "enrolledAt": "ISO timestamp",
    "cohort": "string — e.g. 'Q1-2026'",
    "status": "enum: active | paused | alumni | refunded",
    "currentWeek": "integer 1–12",
    "sessionsCompleted": "integer",
    "lastSessionAt": "ISO timestamp",
    "nextSessionAt": "ISO timestamp",
    "transformationMilestones": "string[] — key breakthroughs noted",
    "noShowCount": "integer",
    "paymentStatus": "enum: current | past-due | complete | refunded",
    "invoiceIds": "string[]",
    "graduatedAt": "ISO timestamp | null",
    "testimonialCollected": "boolean",
    "referralsGenerated": "integer",
    "notes": "string — agent-written session observations"
  }
}
```

---

## Schema: Divine Path Walkers Member Memory

Tracks every member of the Divine Path Walkers Skool community,
their engagement health, and their journey within the fellowship.

```json
{
  "schema": "dpw_member",
  "memory_type": "long-term",
  "fields": {
    "contactId": "GHL contact ID (primary key)",
    "skoolUsername": "string | null",
    "firstName": "string",
    "joinedAt": "ISO timestamp",
    "welcomeSequenceTriggered": "boolean",
    "welcomeSequenceTriggeredAt": "ISO timestamp | null",
    "lastEngagementAt": "ISO timestamp",
    "engagementScore": "integer 0–100 — calculated from activity frequency",
    "daysSinceLastEngagement": "integer — computed field",
    "atRisk": "boolean — true if daysSinceLastEngagement > 14",
    "tags": "string[]",
    "ascendedToBTV": "boolean — has this member become a BTV client",
    "ascendedAt": "ISO timestamp | null",
    "notes": "string"
  }
}
```

---

## Schema: Content Memory

Tracks every piece of content published across Truth J Blue platforms
to prevent duplication, enable repurposing, and measure performance.

```json
{
  "schema": "content",
  "memory_type": "long-term",
  "fields": {
    "contentId": "uuid (primary key)",
    "title": "string",
    "type": "enum: post | reel | email | sms | blog | book-excerpt | video | podcast",
    "sourceType": "enum: original | repurposed | atomized",
    "sourceId": "contentId of parent if repurposed | null",
    "platform": "string[] — e.g. ['instagram', 'tiktok', 'email']",
    "publishedAt": "ISO timestamp",
    "ghlSocialPlannerIds": "string[] — GHL scheduled post IDs",
    "scriptUsed": "string | null — which book or teaching it drew from",
    "performanceNotes": "string | null",
    "repurposedVersions": "contentId[] — child content derived from this"
  }
}
```

---

## Agent Memory Access Rules

| Agent Alias | Can Read | Can Write | Restricted From |
|-------------|----------|-----------|-----------------|
| `main` | All schemas | All schemas | None |
| `marketing` | `lead`, `content` | `content` | `btv_client` payment fields |
| `sales` | `lead`, `btv_client` | `lead`, `btv_client` | `dpw_member` engagementScore |
| `support` | `dpw_member`, `lead` | `dpw_member` | `btv_client` payment fields |

---

## Memory Retention Policy

| Schema | Retention | Archive Trigger |
|--------|-----------|-----------------|
| `lead` | Indefinite | Never deleted; archived after 12 months no activity |
| `btv_client` | Indefinite | Archived 90 days post-graduation |
| `dpw_member` | Indefinite | Archived if member leaves community |
| `content` | Indefinite | Never deleted |

---

## Supabase Table Mapping

| Schema | Supabase Table |
|--------|---------------|
| `lead` | `ghl_leads` |
| `btv_client` | `btv_clients` |
| `dpw_member` | `dpw_members` |
| `content` | `content_log` |

All tables use `contactId` as the foreign key linking to GHL.
The `content_log` table uses its own `contentId` UUID as primary key.

---

*Memory is not data collection. It is faithful stewardship of relationships.*
