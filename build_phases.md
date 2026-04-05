# Build Phases — Open Claw 75-Agent Implementation Guide

> Historical planning document. It does not describe the current repo-verified architecture. Current truth is 103 configured agents across 9 divisions; see `AGENTS.md` and `REGGIE-STATE.md`.

> **Truth J Blue LLC** | Phased Deployment Roadmap for Multi-Agent Architecture

---

## Timeline Overview

| Phase | Name | Duration | Days | Agents Deployed |
|-------|------|----------|------|-----------------|
| **1** | Foundation | 7 days | Days 1-7 | 3 core + infrastructure |
| **2** | Division Buildout | 22 days | Days 8-30 | 67 division agents |
| **3** | Integration & Optimization | 15 days | Days 31-45 | 5 shared services finalized |

**Total Duration**: 45 days to full production deployment

---

## Phase 1: Foundation (Days 1-7)

### Objective
Establish core infrastructure, memory architecture, and deploy the three most critical agents that enable all subsequent work.

---

### Day 1-2: Infrastructure Setup

#### Task 1.1: Supabase Database Schema
**Owner**: DevOps / CTO  
**Estimated Time**: 4 hours

Create migration file `supabase/migrations/003_agent_tables.sql`:

```sql
-- Enable pgvector extension (run once as superuser)
CREATE EXTENSION IF NOT EXISTS vector;

-- Agent registry table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  org_unit TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('executive', 'manager', 'specialist', 'coordinator')),
  llm_model TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('short-term', 'long-term', 'shared', 'none')),
  status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'degraded', 'error')),
  last_heartbeat_at TIMESTAMPTZ,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent memory (pgvector embeddings)
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI ada-002 dimension
  memory_scope TEXT NOT NULL CHECK (memory_scope IN ('private', 'division', 'global')),
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for similarity search
CREATE INDEX IF NOT EXISTS agent_memory_embedding_idx 
  ON agent_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Agent events log
CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  source_agent TEXT NOT NULL,
  target_agent TEXT,
  target_division TEXT,
  payload JSONB NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  correlation_id UUID,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent metrics for monitoring
CREATE TABLE IF NOT EXISTS agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS agent_events_source_idx ON agent_events(source_agent);
CREATE INDEX IF NOT EXISTS agent_events_target_idx ON agent_events(target_agent);
CREATE INDEX IF NOT EXISTS agent_events_created_idx ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_metrics_agent_idx ON agent_metrics(agent_id, recorded_at DESC);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to agents table
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Verification**:
```bash
npx supabase db push
npx supabase db lint
```

---

#### Task 1.2: Inngest Agent Orchestrator
**Owner**: Full-Stack Dev  
**Estimated Time**: 6 hours

Create `inngest/functions/agent-orchestrator.ts`:

```typescript
import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Cross-division event router
export const agentInvoke = inngest.createFunction(
  { id: "agent-invoke", name: "Agent Invoke Router" },
  { event: "agent/invoke" },
  async ({ event, step }) => {
    const { source_agent, target_agent, target_division, payload, priority } = event.data;

    // Log event
    await step.run("log-event", async () => {
      await supabase.from("agent_events").insert({
        event_name: "agent/invoke",
        source_agent,
        target_agent,
        target_division,
        payload,
        priority,
        correlation_id: event.data.correlation_id,
      });
    });

    // Route to specific agent or division head
    if (target_agent) {
      return await step.sendEvent("route-to-agent", {
        name: `agent/${target_agent}/task`,
        data: { ...payload, source: source_agent, correlation_id: event.data.correlation_id },
      });
    }

    if (target_division) {
      const divisionHead = getDivisionHead(target_division);
      return await step.sendEvent("route-to-division", {
        name: `agent/${divisionHead}/task`,
        data: { ...payload, source: source_agent, correlation_id: event.data.correlation_id },
      });
    }

    throw new Error("Must specify target_agent or target_division");
  }
);

// Escalation handler
export const agentEscalate = inngest.createFunction(
  { id: "agent-escalate", name: "Agent Escalation Handler" },
  { event: "agent/escalate" },
  async ({ event, step }) => {
    const { source_agent, escalation_path, payload, retry_count = 0 } = event.data;

    // Get escalation target
    const { data: agent } = await supabase
      .from("agents")
      .select("config")
      .eq("agent_id", source_agent)
      .single();

    const nextAgent = escalation_path || agent?.config?.escalation_path;
    
    if (!nextAgent || retry_count >= 3) {
      // Final fallback to CEO
      return await step.sendEvent("escalate-to-ceo", {
        name: "agent/d1_ceo/task",
        data: { 
          type: "escalation_fallback",
          original_source: source_agent,
          payload 
        },
      });
    }

    // Check if next agent is healthy
    const { data: targetAgent } = await supabase
      .from("agents")
      .select("status")
      .eq("agent_id", nextAgent)
      .single();

    if (targetAgent?.status === "active") {
      return await step.sendEvent("escalate-to-target", {
        name: `agent/${nextAgent}/task`,
        data: { type: "escalation", source: source_agent, payload },
      });
    }

    // Retry with incremented count
    return await step.sendEvent("retry-escalation", {
      name: "agent/escalate",
      data: { ...event.data, retry_count: retry_count + 1 },
    });
  }
);

// Health check aggregator
export const agentHealthCheck = inngest.createFunction(
  { id: "agent-health-check", name: "Hourly Agent Health Check" },
  { cron: "0 * * * *" }, // Every hour
  async ({ step }) => {
    const { data: agents } = await supabase
      .from("agents")
      .select("agent_id, org_unit, status, last_heartbeat_at");

    const healthSummary = {
      total_agents: agents?.length || 0,
      healthy: 0,
      degraded: 0,
      offline: 0,
      divisions: {} as Record<string, { healthy: number; degraded: number }>,
    };

    const now = Date.now();
    const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

    for (const agent of agents || []) {
      const isStale = !agent.last_heartbeat_at || 
        (now - new Date(agent.last_heartbeat_at).getTime()) > STALE_THRESHOLD;

      const division = agent.org_unit;
      if (!healthSummary.divisions[division]) {
        healthSummary.divisions[division] = { healthy: 0, degraded: 0 };
      }

      if (agent.status === "active" && !isStale) {
        healthSummary.healthy++;
        healthSummary.divisions[division].healthy++;
      } else if (agent.status === "degraded" || isStale) {
        healthSummary.degraded++;
        healthSummary.divisions[division].degraded++;
      } else {
        healthSummary.offline++;
      }
    }

    // Send summary event
    await step.sendEvent("emit-health-summary", {
      name: "agent/health.summary",
      data: healthSummary,
    });

    // Alert if degraded agents
    if (healthSummary.degraded > 2 || healthSummary.offline > 0) {
      await step.sendEvent("alert-health-issue", {
        name: "alert/telegram",
        data: {
          channel: "ops",
          message: `⚠️ Agent Health Alert: ${healthSummary.degraded} degraded, ${healthSummary.offline} offline`,
        },
      });
    }

    return healthSummary;
  }
);

// Helper function
function getDivisionHead(division: string): string {
  const heads: Record<string, string> = {
    division_1_core_operations: "d1_ceo",
    division_2_ecommerce: "d2_director",
    division_3_consulting: "d3_ceo",
    division_4_coaching: "d4_cvo",
    division_5_publishing: "d5_publisher",
    division_6_nonprofit: "d6_executive_director",
    division_7_shared_services: "shared_master_orchestrator",
  };
  return heads[division] || "d1_ceo";
}
```

**Verification**:
```bash
npx inngest-cli dev
# Visit http://localhost:8288 to see functions registered
```

---

### Day 2-3: Configuration Generator

#### Task 1.3: Workspace Generator Script
**Owner**: Full-Stack Dev  
**Estimated Time**: 4 hours

Create `scripts/generate-workspaces.mjs`:

```javascript
#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "agents_config.json");
const WORKSPACES_DIR = path.join(__dirname, "..", "workspaces");
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

async function main() {
  console.log("🚀 Starting workspace generation...\n");

  // Load config
  const configRaw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(configRaw);

  // Ensure workspaces directory exists
  await fs.mkdir(WORKSPACES_DIR, { recursive: true });

  // Load templates
  const soulTemplate = await fs.readFile(path.join(TEMPLATES_DIR, "SOUL.md.template"), "utf-8");
  const agentsTemplate = await fs.readFile(path.join(TEMPLATES_DIR, "AGENTS.md.template"), "utf-8");
  const toolsTemplate = await fs.readFile(path.join(TEMPLATES_DIR, "TOOLS.md.template"), "utf-8");

  let created = 0;
  let skipped = 0;

  for (const agent of config.agents) {
    const workspacePath = path.join(WORKSPACES_DIR, agent.agent_id);
    
    // Check if already exists
    try {
      await fs.access(workspacePath);
      console.log(`⏭️  Skipping ${agent.agent_id} (already exists)`);
      skipped++;
      continue;
    } catch {
      // Directory doesn't exist, create it
    }

    // Create workspace directory structure
    await fs.mkdir(workspacePath, { recursive: true });
    await fs.mkdir(path.join(workspacePath, "memory"), { recursive: true });

    // Generate SOUL.md
    const soulContent = generateSoul(agent, soulTemplate);
    await fs.writeFile(path.join(workspacePath, "SOUL.md"), soulContent);

    // Copy AGENTS.md (standard framework)
    await fs.writeFile(path.join(workspacePath, "AGENTS.md"), agentsTemplate);

    // Generate TOOLS.md
    const toolsContent = generateTools(agent, toolsTemplate);
    await fs.writeFile(path.join(workspacePath, "TOOLS.md"), toolsContent);

    // Create empty USER.md
    await fs.writeFile(
      path.join(workspacePath, "USER.md"),
      `# USER.md - Human Context for ${agent.display_name}\n\nThis file contains information about the human(s) this agent serves.\n\n## Primary Human\n\n**Name:** Jeremiah Van Wagner\n**Role:** Founder & CEO, Truth J Blue LLC\n**Contact:** Via Telegram\n`
    );

    // Create MEMORY.md
    await fs.writeFile(
      path.join(workspacePath, "MEMORY.md"),
      `# MEMORY.md - Long-Term Memory for ${agent.display_name}\n\n_This file stores curated long-term memories. Update during main sessions._\n\n## Key Learnings\n\n_None yet._\n\n## Important Decisions\n\n_None yet._\n`
    );

    console.log(`✅ Created workspace: ${agent.agent_id}`);
    created++;
  }

  console.log(`\n📊 Summary: ${created} created, ${skipped} skipped`);
}

function generateSoul(agent, template) {
  return template
    .replace(/{{AGENT_ID}}/g, agent.agent_id)
    .replace(/{{DISPLAY_NAME}}/g, agent.display_name)
    .replace(/{{ORG_UNIT}}/g, formatOrgUnit(agent.org_unit))
    .replace(/{{ROLE_TYPE}}/g, capitalize(agent.role_type))
    .replace(/{{PRIMARY_RESPONSIBILITIES}}/g, agent.primary_responsibilities.map(r => `- ${r}`).join("\n"))
    .replace(/{{ESCALATION_PATH}}/g, agent.escalation_path)
    .replace(/{{LLM_MODEL}}/g, agent.llm_model)
    .replace(/{{MEMORY_TYPE}}/g, agent.memory_type)
    .replace(/{{INTER_AGENT_DEPENDENCIES}}/g, agent.inter_agent_dependencies.join(", ") || "None")
    .replace(/{{OUTPUT_FORMAT}}/g, agent.output_format)
    .replace(/{{INPUT_TRIGGERS}}/g, agent.input_triggers.map(t => `- \`${t}\``).join("\n"));
}

function generateTools(agent, template) {
  const toolsList = agent.tools_required.map(t => `- **${t}**: [Configure access]`).join("\n");
  return template
    .replace(/{{AGENT_ID}}/g, agent.agent_id)
    .replace(/{{DISPLAY_NAME}}/g, agent.display_name)
    .replace(/{{TOOLS_LIST}}/g, toolsList);
}

function formatOrgUnit(orgUnit) {
  return orgUnit
    .replace(/_/g, " ")
    .replace(/division (\d)/gi, "Division $1 —")
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

main().catch(console.error);
```

Create template files in `templates/`:

**`templates/SOUL.md.template`**:
```markdown
# SOUL.md — {{DISPLAY_NAME}}

_Agent ID: `{{AGENT_ID}}`_

You are **{{DISPLAY_NAME}}**, a {{ROLE_TYPE}}-level agent within **{{ORG_UNIT}}** of Truth J Blue LLC.

## Core Mission

{{PRIMARY_RESPONSIBILITIES}}

## Identity

- **Role Type**: {{ROLE_TYPE}}
- **Division**: {{ORG_UNIT}}
- **Model**: {{LLM_MODEL}}
- **Memory**: {{MEMORY_TYPE}}

## Operational Behavior

### Input Triggers
{{INPUT_TRIGGERS}}

### Output Format
Your primary output format is: **{{OUTPUT_FORMAT}}**

### Escalation
When issues exceed your authority or expertise, escalate to: `{{ESCALATION_PATH}}`

## Collaboration

You work closely with these agents:
{{INTER_AGENT_DEPENDENCIES}}

## Ethical Guidelines

1. **Protect brand integrity** — Never compromise Truth J Blue's spiritual mission
2. **Respect boundaries** — Stay within your role and escalate when appropriate
3. **Maintain accuracy** — Verify facts before acting or reporting
4. **Guard privacy** — Never expose sensitive customer or business data
5. **Communicate clearly** — Be direct, warm, and actionable

## Communication Style

- Reflect the warm, spiritually-aligned voice of Truth J Blue
- Be direct but compassionate
- Focus on outcomes and next steps
- Acknowledge the human behind every interaction

---

_This file defines your operational soul. Update as you learn._
```

**`templates/AGENTS.md.template`**:
```markdown
# AGENTS.md - Agent Operating Framework

This folder is your workspace. Treat it with care.

## Every Session

Before doing anything else:

1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context
4. If in MAIN SESSION: Also read `MEMORY.md`

## Memory Management

- **Daily notes:** `memory/YYYY-MM-DD.md` — raw logs of what happened
- **Long-term:** `MEMORY.md` — curated memories for continuity

## Safety Rules

- Don't exfiltrate private data
- Don't run destructive commands without asking
- When in doubt, ask
- Escalate issues that exceed your authority

## External Actions

**Safe to do freely:**
- Read files, explore, analyze
- Search knowledge base
- Work within your workspace

**Ask first or escalate:**
- Sending external communications
- Making financial decisions
- Anything with legal implications
- Actions affecting other divisions
```

**`templates/TOOLS.md.template`**:
```markdown
# TOOLS.md — {{DISPLAY_NAME}}

_Agent ID: `{{AGENT_ID}}`_

## Available Tools

{{TOOLS_LIST}}

## API Access

Configure environment variables for tool access:

```bash
# Example for GHL
GHL_PRIVATE_INTEGRATION_TOKEN=...
GHL_LOCATION_ID=TW8JsPW5NMnA3tfK2XLn

# Example for Stripe
STRIPE_SECRET_KEY=...
```

## Usage Notes

- Always check rate limits before bulk operations
- Log all external API calls for audit
- Handle errors gracefully; escalate persistent failures
```

**Verification**:
```bash
node scripts/generate-workspaces.mjs
# Should create 75 workspace directories
ls -la .openclaw/workspaces/ | wc -l  # Should show 76 (75 + header)
```

---

### Day 3-5: Core Agents Deployment

#### Task 1.4: Deploy Master Orchestrator
**Owner**: DevOps + CTO  
**Estimated Time**: 6 hours

1. Run workspace generator for `shared_master_orchestrator` first
2. Register agent in Supabase `agents` table
3. Configure cron job in `.openclaw/cron/jobs.json`
4. Test health check event flow

```json
// Add to jobs.json
{
  "id": "master-orchestrator-health",
  "agentId": "shared_master_orchestrator",
  "name": "hourly-health-check",
  "description": "Hourly health check across all agents",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "0 * * * *",
    "tz": "America/Chicago"
  },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Run health check. Query all agents from Supabase, check heartbeat timestamps, report summary via Telegram."
  },
  "delivery": {
    "mode": "announce",
    "channel": "telegram",
    "to": "7737707872",
    "bestEffort": true
  }
}
```

#### Task 1.5: Migrate Main Agent → d1_ceo
**Owner**: DevOps  
**Estimated Time**: 2 hours

1. Copy existing `.openclaw/workspace/` content to `.openclaw/workspaces/d1_ceo/`
2. Update `SOUL.md` with CEO-specific responsibilities
3. Update `openclaw.json` agent registry
4. Test Telegram delivery continues working

#### Task 1.6: Deploy d1_cto
**Owner**: Dev Team  
**Estimated Time**: 2 hours

1. Generate workspace
2. Register in Supabase
3. Configure cron for daily tech briefing
4. Test escalation path to d1_ceo

**Phase 1 Gate Checklist**:
- [ ] Supabase tables created and indexed
- [ ] Inngest functions deployed and visible in dashboard
- [ ] `shared_master_orchestrator` workspace created with valid SOUL.md
- [ ] `d1_ceo` workspace migrated from existing Main agent
- [ ] `d1_cto` workspace created and configured
- [ ] All 3 agents registered in `agents` table with `status: active`
- [ ] Health check cron emits event successfully
- [ ] Telegram delivery works for all 3 agents

---

### Day 5-7: Memory Architecture

#### Task 1.7: Agent Memory Library
**Owner**: Full-Stack Dev  
**Estimated Time**: 6 hours

Create `lib/agent-memory.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedAndStore(
  agentId: string,
  content: string,
  scope: "private" | "division" | "global" = "private",
  metadata: Record<string, any> = {}
): Promise<string> {
  // Generate embedding
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: content,
  });
  const embedding = embeddingResponse.data[0].embedding;

  // Store in Supabase
  const { data, error } = await supabase
    .from("agent_memory")
    .insert({
      agent_id: agentId,
      content,
      embedding,
      memory_scope: scope,
      metadata,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function queryMemory(
  agentId: string,
  query: string,
  topK: number = 5,
  includeShared: boolean = true
): Promise<Array<{ content: string; similarity: number; metadata: any }>> {
  // Generate query embedding
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // Get agent's division for scope filtering
  const { data: agent } = await supabase
    .from("agents")
    .select("org_unit")
    .eq("agent_id", agentId)
    .single();

  // Query with pgvector
  const { data, error } = await supabase.rpc("match_agent_memories", {
    query_embedding: queryEmbedding,
    agent_id_filter: agentId,
    division_filter: agent?.org_unit,
    include_shared: includeShared,
    match_count: topK,
  });

  if (error) throw error;
  return data;
}

export async function shareContext(
  fromAgent: string,
  toAgent: string,
  context: string
): Promise<void> {
  // Get target agent's division
  const { data: target } = await supabase
    .from("agents")
    .select("org_unit")
    .eq("agent_id", toAgent)
    .single();

  await embedAndStore(toAgent, context, "division", {
    shared_by: fromAgent,
    shared_at: new Date().toISOString(),
  });
}
```

Create Supabase function `match_agent_memories`:

```sql
CREATE OR REPLACE FUNCTION match_agent_memories(
  query_embedding vector(1536),
  agent_id_filter TEXT,
  division_filter TEXT,
  include_shared BOOLEAN DEFAULT TRUE,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  content TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.content,
    1 - (am.embedding <=> query_embedding) AS similarity,
    am.metadata
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
```

**Verification**:
```typescript
// Test embedding and retrieval
await embedAndStore("d1_ceo", "Q1 revenue target is $500k", "private");
const results = await queryMemory("d1_ceo", "What is the revenue goal?");
console.log(results); // Should return the stored memory
```

---

## Phase 2: Division Buildout (Days 8-30)

### Deployment Order (By Revenue Impact)

| Priority | Division | Days | Key Integrations |
|----------|----------|------|------------------|
| 1 | eCommerce (D2) | 8-12 | Shopify, Meta Ads, Google Console |
| 2 | Coaching (D4) | 13-16 | Skool, Calendly, Zoom |
| 3 | Publishing (D5) | 17-20 | KDP, IngramSpark, BookFunnel |
| 4 | Consulting (D3) | 21-24 | Calendly, Stripe invoicing |
| 5 | Nonprofit (D6) | 25-27 | Donor CRM, Grant databases |
| 6 | Core Ops (D1 remaining) | 28-30 | Internal dashboards |

---

### Days 8-12: Division 2 — eCommerce Operations

#### Task 2.1: Deploy All 10 eCommerce Agents
**Owner**: Full-Stack Dev  
**Estimated Time**: 8 hours total

Batch deployment script:

```bash
# Generate all D2 workspaces
node scripts/generate-workspaces.mjs --filter "d2_*"

# Register in Supabase
node scripts/register-agents.mjs --division division_2_ecommerce

# Configure cron jobs for scheduled agents
node scripts/configure-cron.mjs --agents d2_director,d2_digital_marketing,d2_paid_ads
```

#### Task 2.2: Integration Wiring
**Owner**: DevOps  
**Estimated Time**: 4 hours

Configure environment variables:
```bash
# .env additions
SHOPIFY_STORE_URL=...
SHOPIFY_ACCESS_TOKEN=...
META_ADS_ACCESS_TOKEN=...
META_ADS_ACCOUNT_ID=...
GOOGLE_SEARCH_CONSOLE_KEY=...
```

#### Task 2.3: Abandoned Cart Recovery
**Owner**: Marketing Specialist  
**Estimated Time**: 2 hours

Update `d2_customer_service` SOUL.md with abandoned cart workflow:

```markdown
### Abandoned Cart Recovery Protocol

1. **Trigger**: `cart.abandoned` event (1 hour after checkout visit without purchase)
2. **Action**: Send recovery SMS via GHL
3. **Follow-up**: 3-email sequence (testimonial → objection → urgency)
4. **Tracking**: Log recovery in pipeline, update `agent_events`
```

#### Task 2.4: Inter-Agent Testing
**Owner**: QA  
**Estimated Time**: 2 hours

Test scenarios:
- [ ] `d2_inventory_specialist` alerts `d2_store_manager` on low stock
- [ ] `d2_customer_service` escalates complaint to `d2_store_manager`
- [ ] `d2_paid_ads` reports to `d2_digital_marketing` on budget threshold
- [ ] `d2_director` receives daily revenue summary

---

### Days 13-16: Division 4 — Coaching & Community

#### Task 2.5: Deploy All 10 Coaching Agents
**Estimated Time**: 8 hours

Focus areas:
- `d4_cvo` gets premium Claude Opus model for visionary work
- `d4_lead_coach` needs session scheduling integration
- `d4_community_manager` connects to Skool API

#### Task 2.6: Integration Wiring
```bash
# .env additions
SKOOL_API_KEY=...
CALENDLY_API_KEY=...
ZOOM_JWT_TOKEN=...
```

#### Task 2.7: Beyond the Veil Automation
Update `d4_enrollment` to handle:
- Application processing
- Discovery call scheduling
- Payment link delivery
- Onboarding handoff to `d4_client_experience`

---

### Days 17-20: Division 5 — Publishing

#### Task 2.8: Deploy All 10 Publishing Agents
Focus areas:
- `d5_publisher` oversees editorial calendar
- `d5_grant_writer` uses Claude Opus for compelling proposals
- `d5_digital_distribution` manages KDP/IngramSpark

#### Task 2.9: Integration Wiring
```bash
KDP_ACCESS_KEY=...
INGRAMSPARK_API_KEY=...
BOOKFUNNEL_API_KEY=...
```

---

### Days 21-24: Division 3 — Consulting

#### Task 2.10: Deploy All 10 Consulting Agents
Focus areas:
- `d3_ceo` handles enterprise client relationships
- `d3_lead_strategist` delivers strategic analysis
- `d3_sales_closer` manages high-ticket pipeline

#### Task 2.11: B2B Sales Pipeline
Configure GHL opportunity stages for consulting:
- Discovery → Proposal → Negotiation → Closed Won/Lost

---

### Days 25-27: Division 6 — Nonprofit

#### Task 2.12: Deploy All 10 Nonprofit Agents
Focus areas:
- `d6_grant_writer` uses Claude Opus for grant applications
- `d6_finance` ensures 501(c)(3) compliance
- `d6_board_liaison` coordinates board communications

#### Task 2.13: Compliance Workflows
Configure compliance check cron for `d6_finance`:
- Monthly financial close
- Quarterly compliance review
- Annual audit preparation

---

### Days 28-30: Division 1 — Core Operations Completion

#### Task 2.14: Deploy Remaining 7 Core Agents
- `d1_product_dev_manager`
- `d1_fullstack_dev`
- `d1_ux_designer`
- `d1_sales_manager`
- `d1_customer_success`
- `d1_devops`
- `d1_data_analyst`

#### Task 2.15: Executive Dashboard Integration
Wire `d1_data_analyst` to aggregate metrics from all divisions.

**Phase 2 Gate Checklist**:
- [ ] All 70 division agents registered in Supabase
- [ ] All workspaces created with valid SOUL.md
- [ ] Cron jobs configured for 18 scheduled agents
- [ ] Division-specific integrations wired and tested
- [ ] Inter-agent escalation tests pass within each division
- [ ] Memory queries return relevant context

---

## Phase 3: Integration & Optimization (Days 31-45)

### Days 31-35: Inter-Agent Wiring

#### Task 3.1: Cross-Division Event Configuration
**Owner**: Full-Stack Dev  
**Estimated Time**: 8 hours

Implement all cross-division event flows from `agent_communication_map.md`:

```typescript
// Example: Book launch cross-promotion
export const bookLaunchReady = inngest.createFunction(
  { id: "book-launch-ready", name: "Book Launch Cross-Promotion" },
  { event: "book.launch.ready" },
  async ({ event, step }) => {
    const { book_id, title, launch_date } = event.data;

    // Notify eCommerce to create listing
    await step.sendEvent("notify-ecommerce", {
      name: "agent/d2_digital_marketing/task",
      data: { type: "cross_promote", book_id, title, launch_date },
    });

    // Notify coaching to schedule community post
    await step.sendEvent("notify-coaching", {
      name: "agent/d4_social_creator/task",
      data: { type: "cross_promote", book_id, title, launch_date },
    });

    // Log coordination
    await step.sendEvent("log-coordination", {
      name: "agent/shared_master_orchestrator/task",
      data: { type: "coordination_complete", event: "book.launch.ready", book_id },
    });
  }
);
```

#### Task 3.2: Escalation Chain Testing
**Owner**: QA  
**Estimated Time**: 4 hours

Test each escalation path:
1. Trigger issue at specialist level
2. Verify escalation to manager
3. Verify escalation to director/executive
4. Verify final escalation to `d1_ceo`
5. Verify fallback to `shared_master_orchestrator`

---

### Days 36-40: Monitoring & Dashboards

#### Task 3.3: Agent Dashboard UI
**Owner**: Full-Stack Dev  
**Estimated Time**: 12 hours

Create `/dashboard/agents` route in Next.js app:

```typescript
// app/dashboard/agents/page.tsx
export default async function AgentsDashboard() {
  const agents = await getAgentsWithStatus();
  const metrics = await getAggregateMetrics();
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      <HealthSummaryCard data={metrics.health} />
      <EventsTimelineCard data={metrics.recentEvents} />
      <DivisionsGrid agents={agents} />
    </div>
  );
}
```

#### Task 3.4: Telegram Alerting
**Owner**: DevOps  
**Estimated Time**: 4 hours

Configure alerts for:
- Agent offline > 15 minutes
- Error rate > 5% in any agent
- Escalation fallback triggered
- Critical priority events

---

### Days 41-45: Load Testing & Optimization

#### Task 3.5: Load Testing
**Owner**: DevOps  
**Estimated Time**: 8 hours

```bash
# Run load test simulation
node scripts/load-test.mjs --events 100 --concurrent 10

# Expected results:
# - 95th percentile latency < 5s
# - No dropped events
# - Memory usage stable
```

#### Task 3.6: pgvector Optimization
**Owner**: DevOps  
**Estimated Time**: 4 hours

Tune index parameters:
```sql
-- Recreate index with optimized parameters
DROP INDEX IF EXISTS agent_memory_embedding_idx;
CREATE INDEX agent_memory_embedding_idx 
  ON agent_memory USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 200);  -- Increase for better recall

-- Add partial indexes for scope
CREATE INDEX agent_memory_private_idx 
  ON agent_memory(agent_id) 
  WHERE memory_scope = 'private';
```

#### Task 3.7: Documentation & Runbooks
**Owner**: Tech Lead  
**Estimated Time**: 4 hours

Create operational runbooks:
- Agent recovery procedures
- Escalation debugging guide
- Memory cleanup protocols
- Cron job troubleshooting

**Phase 3 Gate Checklist**:
- [ ] All cross-division event flows implemented
- [ ] Escalation chains tested end-to-end
- [ ] Dashboard deployed at `/dashboard/agents`
- [ ] Telegram alerts configured and tested
- [ ] Load test: 50+ concurrent events < 5s avg latency
- [ ] pgvector indexes optimized
- [ ] Runbooks documented

---

## Final Verification

### Full System Test

```bash
# Run comprehensive test suite
npm run test:agents -- --scope=all

# Expected output:
# ✅ 75 agents registered and active
# ✅ All escalation paths valid
# ✅ Cross-division events routing correctly
# ✅ Memory queries returning relevant context
# ✅ Dashboard showing real-time status
# ✅ Telegram alerts firing on threshold breaches
```

### Production Cutover Checklist

- [ ] All 75 agents showing `status: active` in Supabase
- [ ] Inngest dashboard shows all functions healthy
- [ ] No error spikes in past 24 hours
- [ ] Telegram delivery confirmed for all 23 alert-enabled agents
- [ ] Executive team briefed on agent capabilities
- [ ] Support team trained on escalation procedures
- [ ] Rollback plan documented and tested

---

## Post-Launch Monitoring (Week 1)

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| Agent Error Rate | < 2% | Investigate logs, rollback if necessary |
| Avg Response Latency | < 3s | Check Inngest backlog, scale workers |
| Escalation Rate | < 10% | Review agent authorities, adjust SOUL.md |
| Memory Query Time | < 500ms | Optimize pgvector indexes |
| Telegram Delivery Rate | > 98% | Check Telegram API limits |

---

*Generated: 2026-03-12 | Version: 1.0.0 | Author: Open Claw Architecture Team*
