# HANDOFF — TJB × AAMA Self-Liquidating Offer + Multi-Project Traffic

_Mission order for a fresh REGGIE/Claude Code session. Authored 2026-07-12 by the session that shipped the RTL revenue loop live. Self-contained: read this fully before acting. Everything here is grounded in the repo, the VPS, Supabase, and live sites as of 2026-07-12._

---

## 0 · The mission

Stand up **Truth J Blue's second revenue loop** — a self-liquidating offer built around the **AI Agentic Mastery Academy (AAMA)** course — the same way the RTL loop was built (that loop is LIVE; use it as the working template, not a theory). Then **turn on traffic to all four live properties**: IBM, IBM HUB, RTL, and AAMA.

Two-sentence version of "self-liquidating": a low-ticket front-end offer whose sales cover the ad spend that acquired the buyer, so customer acquisition pays for itself and every downstream sale is profit. AAMA already has the ingredients — a **$9.95 eBook order-bump** ("The AI Agent Blueprint") in front of a **$297 course** (compared at $997). The job is to wire it, reconcile what's real vs. marketing-complete, and drive qualified traffic.

**Do NOT boil the ocean.** One phase at a time, CVO confirmation between phases, exact next-step commands in code blocks. The CVO (Jeremiah Van Wagner) runs a phased, cashflow-funded playbook — see `docs/GROWTH-BY-CHOICE-FULL-SCOPE-PLAN.md`.

---

## 1 · What REGGIE is (the particulars — so you don't start cold)

**REGGIE** = Runtime Engine Governing Global Integrations & Execution — the OpenClaw gateway on a Hostinger VPS (`srv1619751.hstgr.cloud`) that orchestrates a portfolio of GoHighLevel-run businesses. GHL is the system of record (CRM, pipelines, calendars, checkout, email/SMS); OpenClaw is the orchestration plane (provisioning, QA, conversational agents, analytics). Boundary rule and the 12-business Scope Map live in Supabase `business_registry` (DB1 `aagqvfwuixpxtdcrdxmv`) and mirror to `data/business-registry.json` + `/opt/openclaw/data/`.

**Hard-won infrastructure facts (all proven the week of 2026-07-11/12 — do not relearn the painful way):**

- **Model routing:** the June `2026.6.11` upgrade left all ~109 gateway agents bound to Anthropic with EMPTY auth stores. Local Ollama is HARDWARE-BLOCKED on this VPS (15 GiB, CPU-only; qwen3.6 needs 24.3 GiB; even qwen3:14b times out on the ~35K-token agent bootstrap). **Doctrine: Anthropic laddered (opus execs / sonnet workhorses / haiku light), dark-until-lit.** Only `main`, `marketing`, and `pod_growth_by_choice`(dark) + `biz_06_pod_lead`(dark, IBM) have been touched. Light a lane with a MASKED `openclaw models auth paste-api-key --agent <id> --provider anthropic` (pipe the key from server env, never print it), then set routing.
- **openclaw CLI (v2026.6.11) verbs that actually exist:** agent turn = `openclaw agent --agent <id> --message <text> --json`; channel send = `openclaw message send --channel <ch> --target <id> --message <text>`. There is NO top-level `send` and `message` takes no `--agent`. The `--json` output is EITHER `{payloads:[...]}` OR `{runId,result:{payloads:[...]}}` — parse both; empty payloads means "no reply", never emit the raw envelope (it once got emailed to a lead). See `lib/safe-exec.mjs`.
- **CLI needs gateway creds in env:** `OPENCLAW_GATEWAY_TOKEN` (same value as `OPENCLAW_GATEWAY_AUTH_TOKEN`), plus `HOME=/opt/openclaw` and `OPENCLAW_CONFIG_DIR=/opt/openclaw/.openclaw`. The `openclaw-webhook.service` gets these via drop-in `/etc/systemd/system/openclaw-webhook.service.d/10-openclaw-state.conf`, which also needs `ReadWritePaths` for `.openclaw` and `agents` (ProtectSystem=strict otherwise blocks CLI/agent state writes).
- **Gateway config:** `/opt/openclaw/.openclaw/openclaw.json`. Secrets are `${ENV_VAR}` refs. `agents.list[]` has `id/name/workspace/model/skills`. Agent auth profiles are per-agent SQLite; create via the CLI, not by hand.
- **GHL API:** base `https://services.leadconnectorhq.com`, header `Version: 2021-07-28` (BUT conversations endpoints use `2021-04-15`). PIT (Private Integration Token) format is `pit-`+36-char-uuid = **40 chars exactly** — watch for double-paste (an 80-char paste 401'd on 2026-07-12). GHL's Cloudflare blocks default UAs → set `User-Agent: curl/8.9.1`. **PITs CANNOT register platform webhooks** → every GHL→REGGIE event is a workflow **Custom Webhook** action with `Authorization: Bearer <OPENCLAW_GATEWAY_AUTH_TOKEN>`.
- **Tenant resolver** (`lib/ghl-tenant-resolver.mjs`): aliases resolve token+locationId from env. Existing: **TJB** (`TW8JsPW5NMnA3tfK2XLn`), **MSL** (IBM), **RR** (Royal Results/RTL). `resolve('TJB')`, `headersFor('TJB')`, etc.
- **Webhook handler** (`handlers/ghl-webhook-handler.mjs`): 3 auth strategies (workflow Bearer / OpenClaw HMAC / GHL Ed25519), idempotency ledger, normalizer maps `type`/`customData.type` → eventType; custom data arrives top-level OR under `customData` (read both). Public route `https://webhook.truthjblue.dev/webhook/ghl` (Caddy → :8788; 405s on non-POST BY DESIGN).
- **RTL engine as the template** (`skills/rtl-lead-engine.mjs`): tenant guard, JSONL transcripts (`/opt/openclaw/logs/rtl/`), escalation regex (refund/anger/legal) checked BEFORE the agent, fail-safe `DRY_RUN` default true, engine-sends pattern (agent returns text, engine delivers via GHL conversations API + leaves tag/stage breadcrumbs), NO_REPLY sentinel, live-send failures alert the operator. Prompt-set at `prompts/rtl-sales-agent.md` (grounded facts only; escalate on unknowns). Copy this shape for AAMA — do not reinvent.
- **Branded sender pattern:** dedicated sending domain on a SUBDOMAIN (`lc.readytolaunchmybusiness.com`), env `RTL_EMAIL_FROM`/`RTL_EMAIL_FROM_NAME`. NEVER touch root `@` A-records (Vercel/site). DNS is on Hostinger — writable via the `hostinger-mcp` DNS tools; verify sacred records before any change.
- **Alerts + CVO line:** Telegram `@truthjblue_bot` → CVO's `@truthjblue` private chat. Outbound alerts AND inbound DMs both work (`channels.telegram.enabled: true`). This is the CVO's direct line to REGGIE and the morning-command channel.

**Standing constraints (NON-NEGOTIABLE):**
- Never print secret values. The CVO enters tokens/passwords/API keys into fields — you do not (fetch commands that print to the CVO's own terminal are fine).
- Every production change: `bak-<label>-<timestamp>` backup + REGGIE-STATE.md audit entry + a stated rollback path.
- No new cron/heartbeat without CVO cost sign-off (a bad endpoint silently aborts ALL crons; verify endpoints first). Heartbeat stays throttled (168h).
- Compliance guardrails: no fabricated proof, no income claims, "builder showing their work" voice, SMS STOP/quiet-hours/A2P. For IBM (charity, compliance_sensitive): every donation matter = money gate, grants/board comms = draft-never-submit, donor privacy absolute.
- Cost: verify `openclaw cron list` is clean before enabling any paid lane; each agent turn ≈ 3–11¢ on sonnet.

---

## 2 · Current state of each asset (verified 2026-07-12)

**TJB sub-account** — GHL location `TW8JsPW5NMnA3tfK2XLn` (alias TJB). ⚠️ **P0 BLOCKER: the TJB PIT is DEAD (401).** Both `GHL_PRIVATE_INTEGRATION_TOKEN_TJB` and the base `GHL_PRIVATE_INTEGRATION_TOKEN` on the VPS return 401. Nothing can read/write TJB until the CVO issues a fresh Private Integration Token in the TJB sub-account (same flow as the RR PIT). This is the RTL Phase A parallel — fix it first or nothing else works. Registry: `biz_01`, shared_tjb_subaccount, Wave 2, flagship_coaching, owner `biz_01_pod_lead` (stock shell — customize per the pod-mission template).

**AAMA — https://ai.agenticmastery.academy/** — the centerpiece. Offer: **$297** course (compared $997), 6-week / 6-module / 25-lesson / ~5.5h program on building AI agents no-code; **$9.95 order-bump eBook "The AI Agent Blueprint"**; 30-day guarantee; includes 50+ prompts, audit template, ROI calculator, monthly live Q&A, certificate. Platform looks custom/Kajabi-class, **NOT raw GHL** — reconcile where checkout, fulfillment, and student login actually live and how (if at all) they feed GHL. **CVO says the course is still INCOMPLETE** — the sales page reads finished, so a Phase-A audit must separate marketing-complete from fulfillment-complete (which lessons exist, where the video/content lives, what a buyer actually receives today). The self-liquidating mechanic to design: the $9.95 eBook (or a free lead magnet) as the front door → $297 as the core → identify the natural next rung (cohort/coaching/DFY) without inventing offers the CVO hasn't approved.

**IBM — https://inspirebuildmotivate.com/** — 501(c)(3) charity (EIN 46-2696332), Next.js site. "Fund the Compound" $3.6M capital campaign; one-time donations ($25–$1,000), recurring "Movement Builder" ($10–$100/mo); Stripe + PayPal + Truth Blue processor. Registry: `biz_06` (MSL tenant), Wave 5, pod `biz_06_pod_lead` already carries a nonprofit mission (audit 2026-07-12-002... see -006). Traffic target only for this mission — no new build unless the audit demands it.

**IBM HUB — https://hub.inspirebuildmotivate.com/** — NOT yet audited. First task when you reach it: fetch + classify (what it is, platform, what converts, how it relates to the IBM main site). Likely a community/membership or program hub.

**RTL — https://readytolaunchmybusiness.com/** — LIVE, do not disturb. Reference implementation. $497 self-serve package from the RR sub-account; opt-in form + branded PDF + REGGIE conversational engine live (DRY_RUN=false), branded sender `hello@readytolaunchmybusiness.com`, tokens freshly rotated. Everything you build for AAMA should rhyme with this.

---

## 3 · Phased plan (mirror the RTL cadence)

**Phase A — Audit & reconcile (read-only).** Fix the TJB PIT P0 first. Then inventory: TJB sub-account (pipelines, workflows, calendars, existing products/offers, existing traffic that RTL-style objects must not collide with — TJB is the flagship, treat additively); AAMA (real fulfillment state, platform, checkout, how/if it touches GHL); IBM HUB (classify). Deliver a gap list + a reconciliation of "current products" across TJB. Output: `docs/phases/tjb-aama-phase-A-audit.md`. **CVO reviews before Phase B.**

**Phase B — GHL build (additive, namespaced).** In the TJB sub-account build the AAMA funnel objects: pipeline + stages, custom fields (`aama_*`), tags (`aama-*`), lead-magnet/opt-in, the $9.95→$297 self-liquidating structure reconciled with wherever AAMA checkout actually lives, workflows as DRAFTS with Custom Webhook actions → REGGIE. Namespacing is mandatory — TJB is the active flagship. Draft copy stays compliance-clean (no income claims; it's an AI course, be precise about outcomes).

**Phase C — Wire REGGIE (DRY_RUN first).** Stand up an AAMA lead engine modeled on `rtl-lead-engine.mjs` (new tenant guard = TJB, its own transcripts, its own prompt-set grounded ONLY in verified AAMA facts). Rehearse in DRY_RUN, CVO reviews transcripts, THEN go-live gates (getMe already passed once; branded sender; auth; flip). Light the TJB/AAMA lane only with CVO cost sign-off.

**Phase D — Traffic to all four live projects.** Once AAMA is loop-complete: coordinate traffic to IBM, IBM HUB, RTL, and AAMA. Reconcile UTM/attribution so the dashboard measures each. Respect each property's nature (IBM = donations/compliance; RTL = $497 self-serve; AAMA = $9.95/$297 SLO; HUB = TBD). Traffic sources: the RTL Launch Day kit is a proven template in the RTL repo; adapt per property.

---

## 4 · First three moves (when the CVO says go)

1. **Unblock TJB:** ask the CVO to create a fresh Private Integration Token in the TJB sub-account (GHL → Settings → Private Integrations), then update `GHL_PRIVATE_INTEGRATION_TOKEN_TJB` on the VPS (masked, with backup) and verify 200 against location `TW8JsPW5NMnA3tfK2XLn`. Watch for double-paste (40 chars).
2. **Audit AAMA fulfillment reality** (WebFetch the site + student area if the CVO grants access) — produce the marketing-complete vs. actually-deliverable gap list. This is the crux; the SLO can't ship around a course that isn't there.
3. **Reconcile "current products"** across TJB into the Scope Map (Supabase first, mirrors second, CI pins updated — the registry has a test guardrail that fails the build if counts/fields drift).

---

## 5 · Where to look (repo)

- `REGGIE-STATE.md` — audit log; read entries 2026-07-11-001 → 2026-07-12-012 for the full RTL build + today's infra fixes.
- `docs/GROWTH-BY-CHOICE-FULL-SCOPE-PLAN.md` — the master plan (phases R/P/H/W, doctrine, wave lighting).
- `docs/reference/templates/POD-MISSION-template.md` — how to customize a pod.
- `skills/rtl-lead-engine.mjs`, `prompts/rtl-sales-agent.md`, `lib/safe-exec.mjs`, `lib/ghl-tenant-resolver.mjs`, `handlers/ghl-webhook-handler.mjs` — the working patterns to copy.
- `docs/phases/rtl-ghl-loop-*.md` — the RTL A/B/C build docs, as the shape for the AAMA equivalents.
- RTL app repo: `C:\Users\JeremiahVanWagner\rtl-biz-pkg-mvp-v3` (frontend on Vercel/GitHub auto-deploy; backend `/root/ready-to-launch-my-business` on the VPS, `backend worker`, Caddy `api-mvp`→:8001).

_Start by confirming scope with the CVO and executing Phase A move #1. One phase at a time._
