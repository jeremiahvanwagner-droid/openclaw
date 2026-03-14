# Stack Setup — Open Claw 75-Agent Infrastructure

> **Truth J Blue LLC** | Environment & Infrastructure Configuration Guide

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TRUTH J BLUE LLC                            │
│                    Multi-Agent AI Infrastructure                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │   Telegram  │◄──►│  Open Claw  │◄──►│       Next.js App       │  │
│  │   Gateway   │    │   Runtime   │    │     (my-ai-engine)      │  │
│  └─────────────┘    └──────┬──────┘    └───────────┬─────────────┘  │
│                            │                       │                │
│                    ┌───────▼───────────────────────▼───────┐        │
│                    │            Inngest                     │        │
│                    │   (Event Orchestration & Scheduling)   │        │
│                    └────────────────────┬──────────────────┘        │
│                                         │                           │
│         ┌───────────────────────────────┼───────────────────────┐   │
│         │                               │                       │   │
│  ┌──────▼──────┐    ┌──────────────────▼────────┐    ┌─────────▼─┐ │
│  │  Supabase   │    │    LLM Providers          │    │    GHL    │ │
│  │  PostgreSQL │    │  (Anthropic + OpenAI)     │    │   CRM     │ │
│  │  + pgvector │    └───────────────────────────┘    └───────────┘ │
│  └─────────────┘                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 18.17+ | 22.x LTS |
| npm/pnpm | npm 9+ / pnpm 8+ | pnpm 9+ |
| Git | 2.40+ | Latest |
| Docker | 24+ (for local Supabase) | Latest |

### Required Accounts

| Service | Purpose | Signup URL |
|---------|---------|------------|
| Supabase | Database, pgvector, Auth | https://supabase.com |
| Inngest | Event orchestration | https://inngest.com (self-host optional) |
| Anthropic | Claude models | https://console.anthropic.com |
| OpenAI | GPT-4o + embeddings | https://platform.openai.com |
| GoHighLevel | CRM, pipelines, SMS | https://gohighlevel.com |
| Telegram | Bot delivery | https://t.me/BotFather |

---

## 2. Environment Variables

Create `.env.local` in project root:

```bash
# ═══════════════════════════════════════════════════════════════════
# SUPABASE — Database & Vector Storage
# ═══════════════════════════════════════════════════════════════════
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ═══════════════════════════════════════════════════════════════════
# INNGEST — Event Orchestration
# ═══════════════════════════════════════════════════════════════════
INNGEST_EVENT_KEY=your-event-key
INNGEST_SIGNING_KEY=your-signing-key

# ═══════════════════════════════════════════════════════════════════
# LLM PROVIDERS
# ═══════════════════════════════════════════════════════════════════

# Anthropic (Claude Opus 4 & Sonnet 4.5)
ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI (GPT-4o-mini & Embeddings)
OPENAI_API_KEY=sk-proj-...

# ═══════════════════════════════════════════════════════════════════
# GOHIGHLEVEL — CRM & Automations
# ═══════════════════════════════════════════════════════════════════
GHL_PRIVATE_INTEGRATION_TOKEN=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
GHL_LOCATION_ID=TW8JsPW5NMnA3tfK2XLn

# ═══════════════════════════════════════════════════════════════════
# TELEGRAM — Bot Delivery
# ═══════════════════════════════════════════════════════════════════
TELEGRAM_BOT_TOKEN=7123456789:AAH_your_bot_token_here
TELEGRAM_CHAT_ID=7737707872

# ═══════════════════════════════════════════════════════════════════
# DIVISION-SPECIFIC INTEGRATIONS
# ═══════════════════════════════════════════════════════════════════

# Division 2: eCommerce
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
META_ADS_ACCESS_TOKEN=EAAG...
META_ADS_ACCOUNT_ID=act_123456789
GOOGLE_SEARCH_CONSOLE_KEY=your-key

# Division 3: Consulting
STRIPE_SECRET_KEY=sk_live_... # (or sk_test_ for dev)
CALENDLY_API_KEY=...

# Division 4: Coaching
SKOOL_API_KEY=...
ZOOM_JWT_TOKEN=...

# Division 5: Publishing
KDP_ACCESS_KEY=...
INGRAMSPARK_API_KEY=...
BOOKFUNNEL_API_KEY=...

# Division 6: Nonprofit
DONOR_CRM_API_KEY=...

# ═══════════════════════════════════════════════════════════════════
# OPENCLAW RUNTIME
# ═══════════════════════════════════════════════════════════════════
OPENCLAW_WORKSPACE_ROOT=./.openclaw/workspaces
OPENCLAW_LOG_LEVEL=info
```

---

## 3. Database Setup

### 3.1 Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Create new project: `tjb-agent-network`
3. Select region: **US East (Virginia)** for lowest latency
4. Copy connection strings after project initializes

### 3.2 Enable pgvector Extension

In Supabase SQL Editor:

```sql
-- Enable vector extension (requires Supabase Pro or self-hosted)
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### 3.3 Run Agent Schema Migration

Create and run migration:

```bash
# Initialize Supabase CLI if not already
npx supabase init

# Create migration file
npx supabase migration new agent_tables
```

Copy the SQL from [build_phases.md](build_phases.md#task-11-supabase-database-schema) into the migration file, then:

```bash
# Apply to local (with Docker running)
npx supabase db reset

# Apply to production
npx supabase db push
```

### 3.4 Create RPC Functions

```sql
-- Semantic memory search function
CREATE OR REPLACE FUNCTION match_agent_memories(
  query_embedding vector(1536),
  agent_id_filter TEXT,
  division_filter TEXT,
  include_shared BOOLEAN DEFAULT TRUE,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB,
  memory_scope TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    am.content,
    1 - (am.embedding <=> query_embedding) AS similarity,
    am.metadata,
    am.memory_scope
  FROM agent_memory am
  WHERE 
    (am.agent_id = agent_id_filter AND am.memory_scope = 'private')
    OR (include_shared AND am.memory_scope = 'division' AND am.agent_id IN (
      SELECT a.agent_id FROM agents a WHERE a.org_unit = division_filter
    ))
    OR (include_shared AND am.memory_scope = 'global')
  ORDER BY am.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Agent health summary function
CREATE OR REPLACE FUNCTION get_agent_health_summary()
RETURNS TABLE (
  org_unit TEXT,
  total_agents BIGINT,
  active_count BIGINT,
  degraded_count BIGINT,
  error_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.org_unit,
    COUNT(*)::BIGINT AS total_agents,
    COUNT(*) FILTER (WHERE a.status = 'active')::BIGINT AS active_count,
    COUNT(*) FILTER (WHERE a.status = 'degraded')::BIGINT AS degraded_count,
    COUNT(*) FILTER (WHERE a.status = 'error')::BIGINT AS error_count
  FROM agents a
  GROUP BY a.org_unit
  ORDER BY a.org_unit;
END;
$$;
```

### 3.5 Set Up Row-Level Security (Optional but Recommended)

```sql
-- Enable RLS on agent tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for backend)
CREATE POLICY "Service role full access" ON agents
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON agent_memory
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON agent_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON agent_metrics
  FOR ALL USING (auth.role() = 'service_role');
```

---

## 4. Inngest Configuration

### 4.1 Install Inngest

```bash
pnpm add inngest
```

### 4.2 Create Inngest Client

Create `inngest/client.ts`:

```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "truth-j-blue-agents",
  // Event types for type safety
  schemas: new EventSchemas().fromRecord<{
    "agent/invoke": {
      data: {
        source_agent: string;
        target_agent?: string;
        target_division?: string;
        payload: Record<string, any>;
        priority?: "low" | "normal" | "high" | "critical";
        correlation_id?: string;
      };
    };
    "agent/escalate": {
      data: {
        source_agent: string;
        escalation_path?: string;
        payload: Record<string, any>;
        retry_count?: number;
      };
    };
    "agent/health.summary": {
      data: {
        total_agents: number;
        healthy: number;
        degraded: number;
        offline: number;
        divisions: Record<string, { healthy: number; degraded: number }>;
      };
    };
    "alert/telegram": {
      data: {
        channel: "ops" | "executive" | "all";
        message: string;
        priority?: "normal" | "urgent";
      };
    };
  }>(),
});

// Re-export types
export type { EventSchemas } from "inngest";
```

### 4.3 Register Functions

Create `inngest/functions/index.ts` to export all agent functions, then register in your API route:

```typescript
// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { agentInvoke, agentEscalate, agentHealthCheck } from "@/inngest/functions/agent-orchestrator";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    agentInvoke,
    agentEscalate,
    agentHealthCheck,
    // Add more agent functions as needed
  ],
});
```

### 4.4 Local Development

```bash
# Start Inngest Dev Server (separate terminal)
npx inngest-cli@latest dev

# Visit http://localhost:8288 to see dashboard
```

### 4.5 Production Deployment

For Vercel:
1. Add Inngest integration in Vercel dashboard
2. Environment variables auto-configured

For self-hosted:
```bash
# Set environment variables
INNGEST_EVENT_KEY=production-key
INNGEST_SIGNING_KEY=production-signing-key

# Deploy and register with Inngest Cloud
# Visit https://app.inngest.com to sync
```

---

## 5. LLM Provider Setup

### 5.1 Model Routing Configuration

Create `lib/llm-router.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Initialize clients
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Model mapping
const MODEL_MAP = {
  "claude-opus-4": { provider: "anthropic", model: "claude-opus-4-20250514" },
  "claude-sonnet-4.5": { provider: "anthropic", model: "claude-sonnet-4-5-20250514" },
  "gpt-4o-mini": { provider: "openai", model: "gpt-4o-mini" },
};

type ModelKey = keyof typeof MODEL_MAP;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionOptions {
  model: ModelKey;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export async function complete({
  model,
  messages,
  maxTokens = 4096,
  temperature = 0.7,
}: CompletionOptions): Promise<string> {
  const config = MODEL_MAP[model];
  
  if (config.provider === "anthropic") {
    const systemMessage = messages.find(m => m.role === "system")?.content;
    const nonSystemMessages = messages.filter(m => m.role !== "system");
    
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage,
      messages: nonSystemMessages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });
    
    return response.content[0].type === "text" 
      ? response.content[0].text 
      : "";
  }
  
  if (config.provider === "openai") {
    const response = await openai.chat.completions.create({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature,
    });
    
    return response.choices[0].message.content || "";
  }
  
  throw new Error(`Unknown provider: ${config.provider}`);
}

// Embedding function (always uses OpenAI ada-002)
export async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}
```

### 5.2 Cost Estimation

| Model | Input Cost | Output Cost | Est. Monthly* |
|-------|-----------|-------------|---------------|
| Claude Opus 4 (3 executive agents) | $15/1M | $75/1M | ~$150 |
| Claude Sonnet 4.5 (47 manager/content agents) | $3/1M | $15/1M | ~$400 |
| GPT-4o-mini (25 routine agents) | $0.15/1M | $0.60/1M | ~$50 |
| ada-002 embeddings (all agents) | $0.10/1M | — | ~$30 |
| **Total Estimated** | | | **~$630/mo** |

*Assumes 10K interactions/day average across all agents

---

## 6. OpenClaw Workspace Configuration

### 6.1 Directory Structure

```
.openclaw/
├── openclaw.json           # Main runtime config
├── agents_config.json      # 75-agent master config
├── agent_communication_map.md
├── build_phases.md
├── stack_setup.md          # (this file)
├── README.md
├── cron/
│   └── jobs.json           # Scheduled tasks
├── workspaces/             # Auto-generated per agent
│   ├── d1_ceo/
│   │   ├── SOUL.md
│   │   ├── AGENTS.md
│   │   ├── TOOLS.md
│   │   ├── USER.md
│   │   ├── MEMORY.md
│   │   └── memory/
│   │       └── YYYY-MM-DD.md
│   ├── d1_cto/
│   │   └── ... 
│   └── ... (73 more)
├── templates/
│   ├── SOUL.md.template
│   ├── AGENTS.md.template
│   └── TOOLS.md.template
└── scripts/
    ├── generate-workspaces.mjs
    ├── register-agents.mjs
    └── configure-cron.mjs
```

### 6.2 Update openclaw.json

Merge new configuration into existing `.openclaw/openclaw.json`:

```json
{
  "agentId": "shared_master_orchestrator",
  "version": "2026.3.8",
  "secretProviders": [
    {
      "kind": "env",
      "secrets": {
        "GHL_PRIVATE_INTEGRATION_TOKEN": "GHL_PRIVATE_INTEGRATION_TOKEN",
        "TELEGRAM_BOT_TOKEN": "TELEGRAM_BOT_TOKEN",
        "OPENAI_API_KEY": "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY": "ANTHROPIC_API_KEY",
        "SUPABASE_SERVICE_KEY": "SUPABASE_SERVICE_KEY",
        "INNGEST_EVENT_KEY": "INNGEST_EVENT_KEY"
      }
    }
  ],
  "ghlAuthProfile": {
    "kind": "privateIntegrationToken",
    "secret": "GHL_PRIVATE_INTEGRATION_TOKEN",
    "locationId": "TW8JsPW5NMnA3tfK2XLn"
  },
  "delivery": {
    "mode": "announce",
    "channel": "telegram",
    "to": "7737707872",
    "bestEffort": true
  },
  "multiAgent": {
    "enabled": true,
    "orchestrator": "shared_master_orchestrator",
    "divisions": [
      "division_1_core_operations",
      "division_2_ecommerce",
      "division_3_consulting",
      "division_4_coaching",
      "division_5_publishing",
      "division_6_nonprofit",
      "division_7_shared_services"
    ],
    "eventBus": "inngest",
    "memoryBackend": "supabase-pgvector"
  },
  "workspace": {
    "root": ".openclaw/workspaces",
    "promptFiles": ["SOUL.md", "AGENTS.md", "USER.md", "MEMORY.md", "TOOLS.md"]
  }
}
```

### 6.3 Cron Jobs Configuration

Add to `.openclaw/cron/jobs.json`:

```json
{
  "jobs": [
    {
      "id": "master-health-check",
      "agentId": "shared_master_orchestrator",
      "name": "hourly-health-check",
      "description": "Check agent health across all divisions",
      "enabled": true,
      "schedule": { "kind": "cron", "expr": "0 * * * *", "tz": "America/Chicago" },
      "sessionTarget": "isolated",
      "payload": {
        "kind": "agentTurn",
        "message": "Run health check. Query agent statuses, report issues via Telegram."
      }
    },
    {
      "id": "d1-ceo-morning-briefing",
      "agentId": "d1_ceo",
      "name": "daily-morning-briefing",
      "description": "CEO daily morning briefing",
      "enabled": true,
      "schedule": { "kind": "cron", "expr": "0 7 * * *", "tz": "America/Chicago" },
      "sessionTarget": "isolated",
      "payload": {
        "kind": "agentTurn",
        "message": "Good morning. Prepare executive briefing: overnight metrics, critical alerts, today's priorities."
      },
      "delivery": {
        "mode": "announce",
        "channel": "telegram",
        "to": "7737707872"
      }
    },
    {
      "id": "d2-ecommerce-daily-report",
      "agentId": "d2_director",
      "name": "daily-ecommerce-report",
      "description": "Daily eCommerce metrics summary",
      "enabled": true,
      "schedule": { "kind": "cron", "expr": "0 8 * * *", "tz": "America/Chicago" },
      "sessionTarget": "isolated",
      "payload": {
        "kind": "agentTurn",
        "message": "Generate daily eCommerce report: revenue, orders, top products, inventory alerts."
      }
    },
    {
      "id": "d4-coaching-engagement-check",
      "agentId": "d4_community_manager",
      "name": "bi-weekly-engagement-check",
      "description": "Check community engagement metrics",
      "enabled": true,
      "schedule": { "kind": "cron", "expr": "0 10 * * 1,4", "tz": "America/Chicago" },
      "sessionTarget": "isolated",
      "payload": {
        "kind": "agentTurn",
        "message": "Analyze community engagement: active members, post frequency, at-risk members."
      }
    }
  ]
}
```

---

## 7. GHL Integration

### 7.1 Required Scopes

Ensure your GHL Private Integration Token has these scopes:

- `contacts.readonly` / `contacts.write`
- `conversations.readonly` / `conversations.write`
- `opportunities.readonly` / `opportunities.write`
- `workflows.readonly`
- `locations.readonly`

### 7.2 Pipeline Configuration

Create pipelines for each division in GHL:

| Division | Pipeline Name | Stages |
|----------|--------------|--------|
| eCommerce | Product Sales | Lead → Browsed → Cart → Purchased → Review |
| Consulting | B2B Sales | Discovery → Proposal → Negotiation → Closed |
| Coaching | Enrollment | Inquiry → Application → Discovery Call → Enrolled |
| Publishing | Author Outreach | Contact → Proposal → Contract → Production → Published |
| Nonprofit | Donor Journey | Awareness → First Gift → Repeat → Major |

### 7.3 Webhook Setup

Configure webhooks in GHL to trigger agent events:

```
Webhook URL: https://your-app.vercel.app/api/webhooks/ghl
Events:
- contact.created
- contact.updated
- opportunity.stage_changed
- appointment.scheduled
- conversation.message_received
```

Create webhook handler:

```typescript
// app/api/webhooks/ghl/route.ts
import { inngest } from "@/inngest/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const eventType = payload.type;

  // Map GHL events to agent events
  const eventMappings: Record<string, { agent: string; type: string }> = {
    "contact.created": { agent: "d1_coo", type: "new_contact" },
    "opportunity.stage_changed": { agent: "d1_sales_manager", type: "pipeline_update" },
    "appointment.scheduled": { agent: "d4_lead_coach", type: "session_scheduled" },
    "conversation.message_received": { agent: "d2_customer_service", type: "incoming_message" },
  };

  const mapping = eventMappings[eventType];
  if (mapping) {
    await inngest.send({
      name: `agent/${mapping.agent}/task`,
      data: {
        type: mapping.type,
        ghl_event: eventType,
        payload: payload.data,
      },
    });
  }

  return NextResponse.json({ received: true });
}
```

---

## 8. Telegram Configuration

### 8.1 Bot Setup

1. Message @BotFather on Telegram
2. Create new bot: `/newbot`
3. Name: `Truth J Blue Agent Network`
4. Username: `tjb_agent_network_bot`
5. Save the token to `TELEGRAM_BOT_TOKEN`

### 8.2 Get Chat ID

```bash
# Send a message to your bot, then:
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
# Find your chat ID in the response
```

### 8.3 Telegram Delivery Service

Create `lib/telegram.ts`:

```typescript
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

interface SendOptions {
  chatId?: string;
  parseMode?: "Markdown" | "HTML";
  disableNotification?: boolean;
}

export async function sendTelegramMessage(
  message: string,
  options: SendOptions = {}
): Promise<boolean> {
  const { chatId = DEFAULT_CHAT_ID, parseMode = "Markdown", disableNotification = false } = options;

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
        disable_notification: disableNotification,
      }),
    }
  );

  const result = await response.json();
  return result.ok;
}

// Formatted agent notification
export async function sendAgentNotification(
  agentId: string,
  agentName: string,
  message: string,
  priority: "normal" | "urgent" = "normal"
): Promise<boolean> {
  const emoji = priority === "urgent" ? "🚨" : "🤖";
  const formatted = `${emoji} *${agentName}*\n\n${message}`;
  
  return sendTelegramMessage(formatted, {
    disableNotification: priority === "normal",
  });
}
```

---

## 9. Deployment

### 9.1 Vercel Deployment

```bash
# Install Vercel CLI
pnpm add -g vercel

# Link project
vercel link

# Add environment variables
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_KEY production
# ... (repeat for all env vars)

# Deploy
vercel --prod
```

### 9.2 Domain Configuration

1. Add custom domain in Vercel dashboard
2. Configure DNS:
   - `agents.truthjblue.com` → CNAME to `cname.vercel-dns.com`

### 9.3 CI/CD Pipeline

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Agent Network

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm test
      - run: pnpm lint

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: --prod

  sync-inngest:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx inngest-cli deploy --token ${{ secrets.INNGEST_SIGNING_KEY }}
```

---

## 10. Monitoring & Observability

### 10.1 Logging

Configure structured logging with Pino:

```typescript
// lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: "tjb-agent-network",
    environment: process.env.NODE_ENV,
  },
});

// Usage
logger.info({ agentId: "d1_ceo", event: "task_started" }, "Agent task initiated");
```

### 10.2 Metrics Dashboard

Create Supabase dashboard queries:

```sql
-- Active agents by division
SELECT org_unit, COUNT(*) as active
FROM agents WHERE status = 'active'
GROUP BY org_unit;

-- Events per hour
SELECT 
  date_trunc('hour', created_at) as hour,
  COUNT(*) as event_count
FROM agent_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

-- Memory usage by agent
SELECT 
  agent_id,
  COUNT(*) as memory_entries,
  pg_size_pretty(SUM(pg_column_size(embedding))) as embedding_size
FROM agent_memory
GROUP BY agent_id
ORDER BY memory_entries DESC;
```

### 10.3 Alerts

Configure Telegram alerts for:

| Alert | Condition | Priority |
|-------|-----------|----------|
| Agent Offline | No heartbeat > 15 min | High |
| Error Spike | Error rate > 5% | High |
| Escalation Fallback | CEO fallback triggered | Medium |
| Memory Full | > 10K entries per agent | Low |

---

## 11. Security Checklist

- [ ] All API keys stored as environment variables (never committed)
- [ ] Supabase RLS enabled on all tables
- [ ] Inngest signing key validated on all webhooks
- [ ] GHL webhook secrets verified
- [ ] Telegram bot token rotated quarterly
- [ ] Service role key restricted to backend only
- [ ] Rate limiting on all API endpoints
- [ ] Audit logging for sensitive operations

---

## 12. Quick Start Commands

```bash
# 1. Clone and install
git clone https://github.com/truthjblue/agent-network.git
cd agent-network
pnpm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your credentials

# 3. Initialize database
npx supabase db push

# 4. Generate workspaces
node scripts/generate-workspaces.mjs

# 5. Register agents
node scripts/register-agents.mjs

# 6. Start development
pnpm dev

# 7. Start Inngest dev server (separate terminal)
npx inngest-cli dev

# 8. Test an agent
curl -X POST http://localhost:3000/api/agents/d1_ceo/invoke \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, CEO agent!"}'
```

---

*Generated: 2026-03-12 | Version: 1.0.0 | Author: Open Claw Architecture Team*
