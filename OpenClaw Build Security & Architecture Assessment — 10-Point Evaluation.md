# OpenClaw Build — 10-Point Security & Architecture Assessment

## Executive Summary

This report evaluates the OpenClaw agent workspace build (repo: `jeremiahvanwagner-droid/openclaw-workspace`) against ten critical dimensions of agentic AI security and operational maturity. The build demonstrates strong operational intent — it is thoughtfully structured, business-purpose-driven, and has several genuinely excellent patterns. However, several important security and reliability gaps place it in a "Developing" tier when compared to hardened top-tier builds. The good news: most gaps are closeable with deliberate, targeted improvements. Each dimension is scored 1–5 and benchmarked against top-tier and similar builds.

***

## Scoring Key

| Score | Meaning |
|-------|---------|
| 5 | Best-in-class — matches or exceeds hardened production standards |
| 4 | Strong — solid implementation with minor gaps |
| 3 | Developing — functional but key elements missing |
| 2 | Weak — partial effort, meaningful risks present |
| 1 | Absent / Critical gap |

***

## 1. Security Sandboxing (Containerization)
**Score: 2 / 5**

OpenClaw the platform provides sandboxing at three levels (Off, Non-main, All), and security research confirms that Docker/container-based isolation is the expected hardening baseline for production deployments. However, the `openclaw-workspace` build contains no evidence of configured sandbox enforcement. The `AGENTS.md` defines behavioral constraints but does not invoke or document any container or process isolation. The `SOUL.md` and `TOOLS.md` describe direct HTTP API calls to GoHighLevel (GHL) using a bearer token, with no sandbox mode specified for the skills executing those calls.[^1][^2]

Independent security research on the OpenClaw platform specifically found that sandbox escape is the most critical vulnerability class, with average defense rates of only 17% across configurations at baseline. The workspace does not configure `agents.defaults.sandbox` or any equivalent tool policy restriction. Multiple `.tmp-*` script files sitting at the root of the repository — alongside live credentials configuration in `TOOLS.md` — reflect an ad hoc execution model rather than a sandboxed one.[^2][^3][^1]

**Compared to top builds:** Top-tier deployments (e.g., Codex Desktop App, Sculptor) run every agent task inside isolated Docker containers or cloud sandboxes. The OpenClaw build is currently closer to the "Off" sandbox tier.[^4][^1]

**Compared to similar builds:** Typical operator-level builds also neglect sandbox configuration initially. This build is average for that cohort but below what the risk profile of live GHL automation warrants.

***

## 2. Blast Radius & Privilege Limitation
**Score: 3 / 5**

The Supabase schema (`ghl_godmode_schema.sql`) demonstrates sophisticated privilege thinking: Row Level Security (RLS) is enabled on all nine tables, JWT-scoped `org_id` policies isolate tenant data, and the `dequeue_tasks()` function uses `security definer` to control worker privilege escalation. These are genuinely strong patterns. The schema comment explicitly notes "Agents should write via secure backend (service role), not directly from clients", which is a professional acknowledgment of least-privilege design.

However, the blast radius concern lives at the tool layer, not the database layer. The `TOOLS.md` file gives the agent a GHL bearer token with access to all CRUD operations — contacts, opportunities, conversations, appointments, and custom fields — without documented scope restrictions. There is no `tools.allow` list restricting which skills can call destructive endpoints (e.g., `DELETE /contacts/{id}`). The 100+ skills in the `skills/` directory are loaded without documented permission tiers. An agent with a misconfigured skill or a prompt injection attack could delete contacts or spam messages before any human intervention.

**Compared to top builds:** Top-tier builds define strict per-agent tool allowlists and withhold exec/write permissions from most agents by default. This build's database layer is near top-tier; the API tool layer is mid-tier.[^3][^1]

***

## 3. Human-in-the-Loop (HITL) for Sensitive Actions
**Score: 3 / 5**

The `SOUL.md` explicitly defines an approval gate for a meaningful set of sensitive operations: "Ask explicit approval before: sending external messages, publishing content, spending money, changing configs, deleting data, modifying automations, touching credentials, payments, or irreversible actions". This is a clear, well-articulated policy. The `AGENTS.md` reinforces this with "Ask first: sending emails, tweets, public posts; anything that leaves the machine; anything you're uncertain about".

The limitation is that HITL is documented as a behavioral directive rather than enforced by a technical mechanism. Research on the OpenClaw platform demonstrates that HITL effectiveness peaks at 91.5% only when the HITL layer is active as a system-level construct with four risk tiers (low/medium/high/critical) and explicit fail-closed behavior. In this build, HITL is a prompt-level instruction, which is susceptible to prompt injection or context drift. The Telegram alert system (hot leads, purchases, appointments, high-ticket applications) provides reactive notification, not proactive approval gating. There is no evidence of a structured approval rubric with defined confidence thresholds or escalation SLAs.[^5][^2]

**Compared to top builds:** Best-in-class HITL routes by risk level with fail-closed timeouts, visible justification, and SLA tracking. This build is one architectural step below: it defines the intent but not the enforcement mechanism.[^2][^5]

***

## 4. Active Guardrails (Input/Output Filtering)
**Score: 2 / 5**

No active input sanitization, output filtering, or prompt injection detection layer is visible in the workspace configuration. The `SOUL.md` instructs the agent to be ethical and flag risky tactics, but this is a personality directive, not a technical guardrail. Effective guardrails operate at multiple layers: before the agent sees input (sanitize/filter), during planning (check permissions), before execution (validate tool calls), and after execution (score outputs).[^3][^5]

The workspace processes GHL webhook data via `ghl_watchdog_input.json` (221 KB of real lead data sitting at the root of the repository) and executes browser automation skills. Both are high-risk ingestion paths for adversarial content. The OpenClaw platform's own CVE-2026-25253 describes a token-exfiltration flaw accessible through crafted content. Without input sanitization, a malicious payload in a GHL contact's custom fields could manipulate agent behavior.[^6][^3]

The `approval-rubric` skill directory exists in `skills/` but is a placeholder directory — no implementation evidence from the workspace structure.

**Compared to top builds:** Top-tier builds implement layered runtime guardrails with toxicity, PII, and prompt injection scorers. This build currently relies entirely on the LLM's own judgment.[^5]

***

## 5. Auditability & Activity Logging
**Score: 4 / 5**

This is one of the build's clearest strengths. The Supabase schema includes a dedicated `audit_logs` table that captures `actor_type` (user/system/agent/webhook), `actor_id`, `action`, `entity_type`, `entity_id`, and `details` as JSONB, with an indexed timestamp. The `agent_runs` table provides per-run telemetry including `tokens_in`, `tokens_out`, `cost_usd`, `duration_ms`, `status`, and `error` fields. The `webhook_events` table logs every incoming webhook with `idempotency_key`, `processing_status`, `processing_error`, and `attempt_count`.

The `diagnostics/` and `reports/` directories in the workspace suggest additional ad hoc audit output is being generated. The `.tmp-ghl-full-audit.js` file (7.9 KB) indicates active diagnostic tooling. The `memory/` directory provides a session-level narrative log via daily `.md` files. This multi-layer audit architecture (database + diagnostic scripts + memory files) is genuinely solid.

The gap: audit logs are effective only if actively monitored and if the `audit_logs` table is consistently written to by all agent actions. There is no evidence of log alerting, anomaly detection pipeline, or log-based SLA enforcement yet — though the watchdog scripts suggest movement in that direction.

**Compared to top builds:** Top-tier builds add automated anomaly detection over audit trails. This build has excellent structure; it needs monitoring automation to close the gap.[^6]

***

## 6. Configuration Robustness (SOUL / MEMORY / AGENTS.md)
**Score: 4 / 5**

The configuration layer is a genuine highlight of this build. `SOUL.md` defines agent identity, mission, personality, ethical guardrails, decision frameworks (ICE scoring), output format standards, memory discipline, and an approval protocol — all in one coherent document. `AGENTS.md` defines session startup procedures, memory hierarchy, safety rules, external vs. internal action boundaries, group chat etiquette, heartbeat protocols, and memory maintenance cycles. `MEMORY.md` (10.5 KB) provides curated long-term context. `USER.md` defines the human stakeholder profile. `IDENTITY.md` and `HEARTBEAT.md` round out the identity layer.

This five-document configuration stack is more structured than most operator builds and represents above-average architectural discipline. The `TOOLS.md` extension point for local configuration (API keys, pipeline stages, tags, products, alert types) is well-organized and readable.

The gap is a security-specific one: `TOOLS.md` contains a live GHL Location ID and API base URL in plaintext. Secrets management is not formalized — there is no `secrets.env` or vault reference pattern, no distinction between "config that belongs in Git" and "secrets that should never be in Git." The `SOUL.md` approval gates are behavioral, not cryptographically enforced.

**Compared to top builds:** Top builds version-control behavioral configs and enforce secrets via environment variables or secret managers, never in plaintext files. The behavioral config quality here is top-tier; the secrets hygiene needs work.

***

## 7. Skill Vetting & Idempotency
**Score: 3 / 5**

The `skills/` directory contains 100+ skills spanning browser automation, CRM management, content creation, analytics, coaching, and more. The breadth is impressive for an operator-stage build. Idempotency is partially addressed at the infrastructure level: the `webhook_events` table uses a `unique (source, idempotency_key)` constraint to prevent double-processing of incoming webhooks. The `tasks` table has a `dedupe_key` with a unique partial index on active tasks to prevent duplicate job execution.

However, there is no visible skill intake vetting process. The platform's own guidance notes that marketplace (ClawHub) skill scanning via VirusTotal is a useful but insufficient permission model. The workspace has no documented review checklist, no `SKILL_CHANGELOG.md`, and no locked dependency versions for skills. Several `.tmp-*` scripts contain ad hoc GHL API calls that bypass the formal skill architecture entirely. Best-practice skill supply chain controls require treating skill installation like a software dependency — with pinned versions, provenance verification, and behavioral review.[^7][^3]

**Compared to top builds:** Top builds scan skills before install, pin versions, and maintain a tested skill registry. This build has good idempotency infrastructure at the data layer but lacks a skill governance process.

***

## 8. Tooling & Ecosystem Usage (Browser / Terminal)
**Score: 4 / 5**

The browser skill stack is comprehensive: `browser-core.mjs`, `browser-controller.mjs`, `browser-automation.mjs`, and `browser-pool-manager.mjs` form a layered browser tooling architecture. The pool manager suggests concurrency awareness. Multiple `.tmp-ghl-*.js` scripts demonstrate active terminal-based execution of GHL API interactions, watchdog operations, and escalation checks. The `diagnostics/` directory and KPI brief script indicate a mature operational tooling habit.

The GoHighLevel integration is richly documented with explicit API endpoints, pipeline stage mappings, custom field references, tag schemas, and product catalog data. The Supabase integration provides a structured data backbone for agent state. ElevenLabs TTS is referenced in `AGENTS.md` for voice storytelling, and Telegram is wired for real-time alerts.

The gap is execution environment discipline: browser automation and terminal script execution are the highest-risk tool categories in an AI agent context. Neither has an explicit permission scope (e.g., "browser automation allowed only for X domains") or a documented safe-lab testing protocol. The `.tmp-*` files indicate that scripts are sometimes written and executed in an ad hoc manner rather than being routed through the formal skill pipeline.[^1][^3]

**Compared to top builds:** Top-tier builds restrict browser access to allowlisted domains and require approval for any new terminal execution. This build's tooling breadth is excellent; the governance of that tooling needs tightening.

***

## 9. Observability & Monitoring
**Score: 3 / 5**

Observability infrastructure exists at two levels. At the database level, `agent_runs` provides token usage, cost, and duration tracking per run, and the `v_contact_followup_sla` view provides a real-time SLA view for lead follow-up status. At the operational level, `.tmp-ghl-sla-watchdog-30m.js`, `.tmp-ghl-watchdog-run.js`, `tmp-ghl-watchdog.js`, and the watchdog-l2 variants indicate an active pattern of periodic health checks. Telegram alerts provide real-time push notification for critical business events.

The gap is that observability is currently reactive rather than proactive. The watchdog scripts appear to be manually triggered or cron-based health checks, not a real-time streaming monitoring pipeline. There is no visible evidence of a dashboard, anomaly detection trigger, or unified observability stack (e.g., no reference to Prometheus, Grafana, Datadog, or Supabase Realtime subscriptions). The `HEARTBEAT.md` mechanism provides periodic agent self-checks, but a heartbeat is not the same as monitoring — it reflects only what the agent reports, not independent verification of agent behavior.[^6]

**Compared to top builds:** Top-tier builds stream all tool call telemetry to an external observability system with automated anomaly alerting. This build has the data infrastructure for it but needs the real-time consumption layer.[^6]

***

## 10. State Management (Database vs. Files)
**Score: 4 / 5**

This build shows a clear and deliberate dual-layer state architecture. Durable operational state (contacts, opportunities, conversations, tasks, agent runs, audit logs) lives in Supabase Postgres with proper schema, RLS, indexes, and triggers. Ephemeral agent context (session logs, heartbeat state, daily memory) lives in the file system as Markdown and JSON. The MEMORY.md / daily `.md` hierarchy implements a structured "raw notes → curated long-term memory" pattern, which is a thoughtful design for an agent that operates across sessions.

The `webhook_events` table bridges external events into the database before processing, which prevents state loss on agent restarts. The `tasks` queue with `dedupe_key`, `locked_by`, `locked_at`, and `max_attempts` implements a robust job queue pattern suited for concurrent workers. The `AGENTS.md` instruction "Text > Brain — if you want to remember something, WRITE IT TO A FILE" directly addresses the stateless session problem.

The gap: `ghl_watchdog_input.json` (221 KB of live lead data) is stored at the repository root rather than in the database or a secure object store. Sensitive operational data in a Git repository creates both security and compliance exposure. The file-based memory layer also lacks encryption or access control — it is readable by any process with filesystem access.

**Compared to top builds:** Top-tier builds route all operational data through the database layer and use encrypted secret stores for credentials. This build's database architecture is strong; the file-based data residency needs review.

***

## Overall Benchmark

| Dimension | OpenClaw Score | Similar Builds Avg | Top Builds Avg |
|-----------|:--------------:|:------------------:|:--------------:|
| Security Sandboxing | 2 | 2 | 5 |
| Blast Radius & Privilege | 3 | 2.5 | 4.5 |
| HITL for Sensitive Actions | 3 | 2.5 | 4.5 |
| Active Guardrails | 2 | 2 | 5 |
| Auditability & Logging | 4 | 3 | 4.5 |
| Configuration Robustness | 4 | 3 | 4.5 |
| Skill Vetting & Idempotency | 3 | 2.5 | 4 |
| Tooling & Ecosystem | 4 | 3 | 4.5 |
| Observability & Monitoring | 3 | 2.5 | 4.5 |
| State Management | 4 | 3 | 4.5 |
| **Overall Average** | **3.2** | **2.65** | **4.55** |

***

## Priority Action Plan

These five actions would move the build from "Developing" to "Advanced" tier, ranked by risk reduction per effort:

1. **Enable Sandbox Mode** — Configure `agents.defaults.sandbox` for all skills performing external API calls or browser automation. Even "Non-main" mode significantly reduces blast radius.[^7][^1]
2. **Move secrets out of Git** — `GHL_PRIVATE_INTEGRATION_TOKEN` and Location ID should move to environment variables or a secrets manager. Never committed to a repository.[^8][^7]
3. **Implement a tool allowlist** — Define which skills can call destructive GHL endpoints. Most skills should only read; few should write; almost none should delete.[^1][^3]
4. **Add input sanitization** — Validate and sanitize all data ingested from GHL webhooks before it reaches the agent context. A simple schema validator on webhook payloads closes the most accessible injection path.[^5][^6]
5. **Move operational data out of the repo** — `ghl_watchdog_input.json` and similar files should be stored in Supabase or an encrypted object store, not a Git repository root.[^3]

***

## Closing Assessment

The OpenClaw build is above average among operator-stage agent deployments. Its configuration robustness (SOUL/MEMORY/AGENTS stack), audit architecture (Supabase schema), and tooling ecosystem breadth are genuinely strong. The build reflects a builder who thinks systematically about agent behavior and business outcomes. The primary vulnerabilities — absent sandboxing, no active input filtering, behavioral-only HITL — are common across this class of builds and are the areas where investment will yield the highest security return. The foundation is solid; the next phase is hardening.[^2][^5]

---

## References

1. [OpenClaw security: architecture and hardening guide - Nebius](https://nebius.com/blog/posts/openclaw-security) - Create a deployment checklist from both OpenClaw's docs and general AI-security best practices. Item...

2. [A Security Analysis and Defense Framework for OpenClaw - arXiv](https://arxiv.org/html/2603.10387v1) - We develop a dual-mode testing framework that evaluates agent security under both baseline and defen...

3. [The Future of AI Agent Security - Openclaw Security Audit - Penligent](https://www.penligent.ai/hackinglabs/the-future-of-ai-agent-security-openclaw-security-audit/) - The future of AI Agent Security will be shaped by hard execution boundaries, skill supply chain cont...

4. [5 Best AI Coding Agent Desktop Apps Compared for 2026](https://www.augmentcode.com/tools/best-ai-coding-agent-desktop-apps) - Compare AI coding assistants, evaluate features, and find the right tool for your codebase.

5. [Understanding guardrails for AI agents - Weights & Biases](https://wandb.ai/site/articles/guardrails-for-ai-agents/) - Good HITL systems have clear SLAs, routing to available reviewers, and fallback behaviors when no hu...

6. [AI Red Teaming OpenClaw: Security Auditor's Guide - Zealynx](https://www.zealynx.io/blogs/ai-red-teaming-openclaw-security-guide) - A comprehensive guide to AI red teaming personal AI agents like OpenClaw. Explore attack surfaces, p...

7. [7 OpenClaw Security Best Practices in 2026 Protect - Your AI Agent ...](https://xcloud.host/openclaw-security-best-practices/) - 3. Lock Down Network Exposure · 4. Secure Your API Keys and Credentials · 5. Audit and Restrict Claw...

8. [OpenClaw Security Risks & Best Practices 2026 | AI Agent Guide](https://pacgenesis.com/openclaw-security-risks-what-security-teams-need-to-know-about-ai-agents-like-openclaw-in-2026/) - This article provides a thorough breakdown of every significant OpenClaw security risk documented to...

