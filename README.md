# Open Claw Multi-Agent Network

> **Truth J Blue LLC** | 75-Agent AI Infrastructure for Unified Business Operations

---

## Overview

The Open Claw Multi-Agent Network is a comprehensive AI agent infrastructure designed for Truth J Blue LLC — a spiritual personal development company operating across coaching, publishing, eCommerce, consulting, and nonprofit verticals.

This system deploys **75 specialized AI agents** across **7 organizational divisions**, orchestrated through a hybrid event-driven architecture using Inngest for cross-division communication and OpenClaw workspaces for agent-specific context.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OPEN CLAW NETWORK                            │
│                     75 Agents • 7 Divisions                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │   Core Ops   │ │   eCommerce  │ │  Consulting  │ │  Coaching  │  │
│  │  10 agents   │ │  10 agents   │ │  10 agents   │ │ 10 agents  │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────────┐  │
│  │  Publishing  │ │  Nonprofit   │ │      Shared Services        │  │
│  │  10 agents   │ │  10 agents   │ │       5 agents              │  │
│  └──────────────┘ └──────────────┘ └─────────────────────────────┘  │
│                                                                     │
│     Orchestration: Inngest + OpenClaw • Memory: Supabase pgvector   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start — Local Development

```bash
# 1. Clone the repository
git clone https://github.com/truthjblue/openclaw.git
cd openclaw

# 2. Configure environment
cp .env.example .env
# Edit .env with your actual API keys

# 3. Sync the primary runtime-facing GHL env from .env
powershell -ExecutionPolicy Bypass -File scripts/sync-local-ghl-env.ps1 -PrimaryTenant TJB

# 4. Verify GHL auth before boot
node scripts/check-ghl-auth.mjs

# 5. Run with Docker Compose
docker compose up

# Gateway available at http://localhost:18789
# Webhook handler at http://localhost:8788
```

### Without Docker

```bash
# 1. Install Node.js 22.x and OpenClaw CLI
npm install -g openclaw@latest

# 2. Configure environment
cp .env.example .env

# 3. Sync the primary runtime-facing GHL env from .env
powershell -ExecutionPolicy Bypass -File scripts/sync-local-ghl-env.ps1 -PrimaryTenant TJB

# 4. Verify GHL auth before boot
node scripts/check-ghl-auth.mjs

# 5. Initialize database
npx supabase db push

# 6. Generate agent workspaces
node scripts/generate-workspaces.mjs

# 7. Register agents
node scripts/register-agents.mjs

# 8. Start the gateway
powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1 -PrimaryTenant TJB

# Manual webhook-only restart if needed (separate terminal)
node --env-file=.env handlers/ghl-webhook-handler.mjs
```

---

## GHL Webhook Rollout

The GHL webhook handler now supports three auth modes:

- `X-GHL-Signature` for HighLevel platform webhooks using Ed25519 verification
- `Authorization: Bearer <OPENCLAW_GATEWAY_AUTH_TOKEN>` for GHL Workflow Custom Webhook actions
- `X-OpenClaw-Signature` as an OpenClaw HMAC fallback for local testing

Recommended rollout for the 10-business portfolio:

```bash
# 1. Generate the outbound webhook plan from the business registry
node scripts/bootstrap-ghl-workflow-webhooks.mjs --base-url https://agents.yourdomain.com

# 2. Smoke-test the handler before wiring GHL workflows
node scripts/smoke-test-ghl-webhook-handler.mjs --url https://agents.yourdomain.com/webhook/ghl --auth-mode bearer

# 3. After adding real ghl_location_id / ghl_location_selector values to data/business-registry.json,
#    write mapped outbound entries into the local workflow registry
node scripts/bootstrap-ghl-workflow-webhooks.mjs --base-url https://agents.yourdomain.com --register-mapped
```

Generated files:

- `~/.openclaw/data/generated-ghl-workflow-webhook-plan.json`: the full per-business webhook rollout plan
- `~/.openclaw/data/workflow-webhook-registry.json`: locally registered mapped workflow webhooks

Operational notes:

- Private Integration Tokens should use GHL Workflow Custom Webhook and Inbound Webhook actions, not direct `/webhooks` registration
- Keep `OPENCLAW_PUBLIC_WEBHOOK_BASE_URL`, `OPENCLAW_GATEWAY_AUTH_TOKEN`, and `OPENCLAW_GHL_WEBHOOK_SECRET` set in `.env`
- `OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY` is optional unless HighLevel rotates the Ed25519 signing key
- Use `node scripts/check-ghl-auth.mjs` to confirm both resolver-based tenant auth and primary runtime auth
- Use `powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1 -PrimaryTenant TJB` after rotating PITs so the gateway restarts against synced credentials

---

## Production Deployment (24/7)

The bot runs on a **Hetzner VPS** with systemd for auto-restart, Caddy for TLS, and GitHub Actions for CI/CD. The Next.js dashboard deploys separately to **Vercel**.

```
┌──────────────┐     ┌─────────────────────────────────────────────┐
│   Telegram   │◄───►│        Hetzner VPS (24/7)                   │
└──────────────┘     │  Caddy (auto-TLS) → Gateway :18789          │
┌──────────────┐     │                   → Webhook :8788           │
│  GHL CRM     │────►│                                             │
└──────────────┘     └──────────────────┬──────────────────────────┘
                                        │
                   Supabase ◄───────────┼──────────► LLM APIs
                     ▲                  └──────────► Inngest
                   Vercel (Dashboard)
```

See [docs/deployment.md](docs/deployment.md) for the full production setup guide.

### CI/CD

| Trigger | Target | Action |
|---------|--------|--------|
| Push to `main` (non-dashboard) | Hetzner VPS | Auto-deploy bot via SSH |
| Push to `main` (`dashboard/**`) | Vercel | Auto-deploy dashboard |
| Manual dispatch | Either | Deploy with optional CLI upgrade |

---

## Project Structure

```
openclaw/
├── .github/workflows/     # CI/CD (deploy-bot.yml, deploy-dashboard.yml)
├── config/                # Version-controlled configuration
│   ├── openclaw.json      # Main runtime config (sanitized)
│   ├── agents_config.json # 77-agent architecture definitions
│   └── cron/              # Scheduled job definitions
├── agents/                # Agent workspace definitions (14 agents)
├── inngest/               # Event orchestration (3 functions)
├── lib/                   # Core libraries (rate governor, LLM router, memory)
├── skills/                # 200+ skill modules (.mjs)
├── handlers/              # Webhook handlers (GHL)
├── scripts/               # Operational scripts
├── templates/             # Agent bootstrap templates
├── training/              # Training system + cards
├── dashboard/             # Next.js 14 dashboard (→ Vercel)
├── supabase/              # Database migrations
├── deploy/                # Deployment configs
│   └── hetzner/           # VPS: systemd, Caddy, provision, deploy scripts
├── docs/                  # Documentation
└── assets/                # Brand assets
```

---

## Organizational Structure

### Division 1: Core Operations (10 agents)
The executive and operational backbone of Truth J Blue LLC.

| Agent ID | Role | Primary Function |
|----------|------|------------------|
| `d1_ceo` | CEO | Strategic decisions, executive oversight |
| `d1_coo` | COO | Daily operations, cross-division coordination |
| `d1_cfo` | CFO | Financial strategy, cash flow management |
| `d1_cto` | CTO | Technology strategy, AI infrastructure |
| `d1_cmo` | CMO | Marketing strategy, brand consistency |
| `d1_product_dev_manager` | Product Development Manager | Product roadmap, feature prioritization |
| `d1_fullstack_dev` | Full-Stack Developer | Code implementation, technical execution |
| `d1_ux_designer` | UX Designer | User experience, interface design |
| `d1_sales_manager` | Sales Manager | Sales team coordination, pipeline management |
| `d1_customer_success` | Customer Success Manager | Client retention, satisfaction |

### Division 2: eCommerce Operations (10 agents)
Digital product sales through online stores.

| Agent ID | Role | Primary Function |
|----------|------|------------------|
| `d2_director` | eCommerce Director | Revenue targets, strategy |
| `d2_store_manager` | Store Manager | Product listings, inventory |
| `d2_inventory_specialist` | Inventory Specialist | Stock monitoring, reorder |
| `d2_digital_marketing` | Digital Marketing Coordinator | Campaigns, SEO |
| `d2_paid_ads` | Paid Ads Specialist | Meta, Google Ads |
| `d2_customer_service` | Customer Service Rep | Support, refunds |
| `d2_analytics` | Analytics Specialist | Revenue metrics |
| `d2_email_marketing` | Email Marketing Specialist | Sequences, segmentation |
| `d2_product_launch` | Product Launch Coordinator | Launch campaigns |
| `d2_conversion_optimizer` | Conversion Optimizer | A/B testing, optimization |

### Division 3: Consulting Services (10 agents)
B2B consulting for business development, AI adoption, and spiritual entrepreneurship.

| Agent ID | Role | Primary Function |
|----------|------|------------------|
| `d3_ceo` | Consulting CEO | Client relationships, strategy |
| `d3_lead_strategist` | Lead Strategist | Strategic analysis, recommendations |
| `d3_project_manager` | Project Manager | Engagement delivery |
| `d3_sales_closer` | Sales Closer | High-ticket closing |
| `d3_business_analyst` | Business Analyst | Assessments, ROI modeling |
| `d3_ai_consultant` | AI Implementation Consultant | AI workflow design |
| `d3_proposal_writer` | Proposal Writer | RFP responses, proposals |
| `d3_client_success` | Client Success Manager | Ongoing relationships |
| `d3_operations` | Operations Coordinator | Scheduling, logistics |
| `d3_finance` | Finance Coordinator | Invoicing, payments |

### Division 4: Coaching & Community (10 agents)
Beyond the Veil Mentorship Program and spiritual transformation coaching.

| Agent ID | Role | Primary Function |
|----------|------|------------------|
| `d4_cvo` | Chief Visionary Officer | Curriculum vision, brand |
| `d4_program_director` | Program Director | Program operations |
| `d4_lead_coach` | Lead Coach | Session facilitation |
| `d4_community_manager` | Community Manager | Skool engagement |
| `d4_enrollment` | Enrollment Specialist | Application processing |
| `d4_client_experience` | Client Experience Manager | Onboarding, satisfaction |
| `d4_content_creator` | Content Creator | Coaching materials |
| `d4_marketing` | Marketing Coordinator | Organic marketing |
| `d4_tech_support` | Tech Support Specialist | Platform support |
| `d4_social_creator` | Social Media Creator | Social content |

### Division 5: Publishing (10 agents)
Books, digital publications, and content distribution.

| Agent ID | Role | Primary Function |
|----------|------|------------------|
| `d5_publisher` | Publisher | Editorial calendar, strategy |
| `d5_editor_in_chief` | Editor-in-Chief | Editorial quality |
| `d5_author_liaison` | Author Liaison | Author relationships |
| `d5_digital_distribution` | Digital Distribution Manager | KDP, IngramSpark |
| `d5_marketing` | Book Marketing Specialist | Launch campaigns |
| `d5_audiobook` | Audiobook Producer | Audio production |
| `d5_grant_writer` | Grant Writer | Publishing grants |
| `d5_rights_manager` | Rights Manager | Licensing, permissions |
| `d5_designer` | Cover Designer | Visual design |
| `d5_assistant_editor` | Assistant Editor | Copyediting, formatting |

### Division 6: Nonprofit — Inspire Build Motivate, Inc. (10 agents)
501(c)(3) operations for community impact.

| Agent ID | Role | Primary Function |
|----------|------|------------------|
| `d6_executive_director` | Executive Director | Mission leadership |
| `d6_program_manager` | Program Manager | Program delivery |
| `d6_development_director` | Development Director | Fundraising strategy |
| `d6_grant_writer` | Grant Writer | Grant applications |
| `d6_volunteer_coordinator` | Volunteer Coordinator | Volunteer management |
| `d6_communications` | Communications Manager | External messaging |
| `d6_events` | Events Coordinator | Event planning |
| `d6_finance` | Finance Manager | Compliance, reporting |
| `d6_impact` | Impact Analyst | Outcome measurement |
| `d6_board_liaison` | Board Liaison | Board communications |

### Division 7: Shared Services (5 agents)
Cross-functional agents serving all divisions.

| Agent ID | Role | Primary Function |
|----------|------|------------------|
| `shared_master_orchestrator` | Master Orchestrator | System health, coordination |
| `shared_legal` | Legal Coordinator | Compliance, contracts |
| `shared_hr` | HR Representative | People operations |
| `shared_it_support` | IT Support Specialist | Technical support |
| `shared_facilities` | Facilities Coordinator | Physical/virtual spaces |

---

## Architecture

### Hybrid Orchestration Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         INNGEST                                 │
│              (Cross-Division Event Bus)                         │
│                                                                 │
│  Events: agent/invoke, agent/escalate, book.launch.ready        │
│         contact.created, pipeline.stage_changed                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Division 1   │    │  Division 2   │    │  Division 3   │
│   Workspace   │    │   Workspace   │    │   Workspace   │
│  (10 agents)  │    │  (10 agents)  │    │  (10 agents)  │
└───────────────┘    └───────────────┘    └───────────────┘

        Within each division:
        ┌────────────────────────────────┐
        │       OPENCLAW RUNTIME         │
        │   (Workspace-Based Context)    │
        │                                │
        │  SOUL.md → Agent Identity      │
        │  AGENTS.md → Operating Rules   │
        │  MEMORY.md → Long-Term Memory  │
        │  USER.md → Human Context       │
        └────────────────────────────────┘
```

### LLM Model Routing

| Tier | Model | Usage | Cost |
|------|-------|-------|------|
| **Strategic** | Claude Opus 4 | CEO, CVO, Grant Writers | $$$$ |
| **Content** | Claude Sonnet 4.5 | Managers, Content Creators | $$$ |
| **Routine** | GPT-4o-mini | Specialists, Coordinators | $ |
| **Embeddings** | ada-002 | All semantic memory | $ |

### Memory Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   SUPABASE + PGVECTOR                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │    Private    │  │   Division    │  │   Global    │  │
│  │    Memory     │  │    Shared     │  │   Shared    │  │
│  │               │  │               │  │             │  │
│  │ Agent-only    │  │ Same division │  │ All agents  │  │
│  │ context       │  │ agents can    │  │ can query   │  │
│  │               │  │ query         │  │             │  │
│  └───────────────┘  └───────────────┘  └─────────────┘  │
│                                                         │
│  Similarity search via pgvector + RPC functions         │
└─────────────────────────────────────────────────────────┘
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/deployment.md](docs/deployment.md) | Production deployment guide (Hetzner + Vercel) |
| [config/agents_config.json](config/agents_config.json) | Master configuration for all 75 agents |
| [agent_communication_map.md](agent_communication_map.md) | Inter-agent routing diagrams and event flows |
| [build_phases.md](build_phases.md) | 45-day phased implementation guide |
| [stack_setup.md](stack_setup.md) | Environment and infrastructure setup |
| [docs/RUNBOOKS.md](docs/RUNBOOKS.md) | Operational runbooks |

---

## Key Integrations

| System | Purpose | Divisions |
|--------|---------|-----------|
| **GoHighLevel** | CRM, pipelines, SMS, automations | All |
| **Telegram** | Agent → Human delivery | All |
| **Shopify** | eCommerce storefront | D2 |
| **Skool** | Coaching community | D4 |
| **Calendly** | Appointment scheduling | D3, D4 |
| **Stripe** | Payment processing | D2, D3, D4 |
| **KDP/IngramSpark** | Book distribution | D5 |
| **Meta Ads** | Paid advertising | D2, D4 |

---

## Escalation Paths

Each agent has a defined escalation path for handling issues beyond their authority:

```
Specialist → Manager → Director → Division Head → CEO → Master Orchestrator
```

Division-specific escalation chains:

| Division | Path |
|----------|------|
| Core Ops | Specialists → Managers → d1_coo → d1_ceo |
| eCommerce | Specialists → d2_store_manager → d2_director → d1_ceo |
| Consulting | Specialists → d3_project_manager → d3_lead_strategist → d3_ceo → d1_ceo |
| Coaching | Specialists → d4_program_director → d4_cvo → d1_ceo |
| Publishing | Specialists → d5_editor_in_chief → d5_publisher → d1_ceo |
| Nonprofit | Specialists → d6_program_manager → d6_executive_director → d1_ceo |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. Required services:

| Service | Variables | Purpose |
|---------|-----------|--------|
| GoHighLevel | `GHL_PRIVATE_INTEGRATION_TOKEN*`, `GHL_LOCATION_ID*` | CRM, pipelines, SMS |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | Database + pgvector memory |
| Inngest | `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` | Event orchestration |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` | Agent delivery + alerts |
| OpenAI | `OPENAI_API_KEY` | GPT models + embeddings |
| MS Teams | `MSTEAMS_APP_ID`, `MSTEAMS_APP_PASSWORD` | Optional team notifications |

See [.env.example](.env.example) for the full list.

---

## Monitoring

### Health Dashboard

```bash
# Check agent health via API
curl https://agents.truthjblue.com/api/health

# Response:
{
  "total_agents": 75,
  "healthy": 72,
  "degraded": 2,
  "offline": 1,
  "divisions": {
    "division_1_core_operations": { "healthy": 10 },
    "division_2_ecommerce": { "healthy": 10 },
    ...
  }
}
```

### Telegram Alerts

Automated alerts for:
- Agent offline > 15 minutes
- Error rate > 5%
- Escalation fallback triggered
- Critical priority events

---

## Security

- All API keys stored as environment variables
- Supabase Row-Level Security enabled
- Inngest webhook signatures validated
- Service role keys restricted to backend
- Audit logging for sensitive operations

---

## Contributing

1. All agent changes require `SOUL.md` updates
2. New agents must be added to `agents_config.json`
3. Test escalation paths before deployment
4. Document integration changes in `stack_setup.md`

---

## Support

- **Technical Issues**: Escalate to `d1_cto` or `shared_it_support`
- **Operational Questions**: Contact `d1_coo`
- **Strategic Concerns**: Contact `d1_ceo`

---

## License

Proprietary — Truth J Blue LLC © 2026

---

*Generated: 2026-03-14 | Version: 2.0.0 | Architecture: Open Claw v2026.3.13*
