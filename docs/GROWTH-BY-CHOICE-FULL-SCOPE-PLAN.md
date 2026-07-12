# Growth by Choice — Full-Scope Activation Plan

_Version 1.0 · 2026-07-12 · CVO-accepted ("I agree and accept") · Grounded in audits 2026-07-11-001 → 2026-07-12-005_

**The mission:** one umbrella agency — 100+ digital employees designing, pitching, closing, optimizing, and teaching one another under REGGIE's command — **grown in the order the cashflow doctrine dictates**, never faster than revenue and never at idle cost.

---

## 0 · Doctrine (governs every phase)

1. **Wake-on-event, never idle-loop.** Agents run when reality calls (webhook, cron, CVO command) and sleep otherwise. "Around the clock" happens because customers act around the clock — not because agents burn tokens waiting.
2. **Dark until lit.** Every agent exists fully configured (identity, mission, skills, gates) at $0.00. Lighting a lane = a deliberate auth + budget decision by the CVO. Kill-switch = removing the auth profile.
3. **Cashflow funds waves.** MVP-Cashflow/RTL (Wave 0) is self-liquidating; each subsequent wave lights only when revenue supports its envelope.
4. **Hard gates are non-negotiable:** money, legal/compliance, destructive actions, and live messaging until DRY_RUN lift — human review always.
5. **Scope map is law:** Supabase `business_registry` first (dashboard truth), JSON mirrors second. Every business change lands in all three planes.
6. **One phase at a time.** Each phase ends with verified exit criteria and a REGGIE-STATE audit entry before the next begins.
7. **No new cron/heartbeat without CVO cost sign-off.** Verify provider endpoints before committing config (preflight aborts are silent and total).

## 1 · Honest baseline (2026-07-12)

**Working:** RTL revenue loop end-to-end in DRY_RUN (capture → CRM → workflows C1–C5 → webhook → REGGIE drafts → transcripts); Starter Guide PDF attached + hosted; `marketing` + `main` lanes lit on sonnet-5 (~3–11¢/event, prompt-cached); scope map reconciled across Supabase/repo/VPS (12 businesses); `pod_growth_by_choice` created with the fleet's first real mission file.

**Dark (by design):** 107 agents with no model auth.

**Gaps:** RTL frontend has **no opt-in form** (zero lead flow — the single biggest blocker to revenue); GHL SMS not provisioned (parked by CVO); alert channels unconfigured (Telegram getMe gate pending); OPENCLAW_GATEWAY_AUTH_TOKEN rotation due (transited a session transcript); 10 of 12 pods are stock shells; zero routing rules fleet-wide; VPS ceiling 15GiB/CPU (local models blocked → Phase 9 paused).

---

## 2 · Phase R — RTL to Revenue (Wave 0) — **priority: today/this week**

The shortest path to the capital that funds everything else. The loop is ~95% built.

| # | Step | Owner | Exit test |
|---|------|-------|-----------|
| R1 | **Opt-in form** on readytolaunchmybusiness.com posting to `/lead-magnet` (rtl-biz-pkg-mvp-v3 frontend) + frontend deploy (also heals the pretty PDF URL) | Claude builds, CVO deploys frontend | Real form submit → email w/ PDF + GHL contact |
| R2 | **Transcript sign-off** — CVO reads `/opt/openclaw/logs/rtl/` drafts, says "transcripts approved" | CVO | Verbal sign-off recorded |
| R3 | **Go-live gates:** Telegram `getMe` verification → alert channel env vars → `ghl_write` HITL allowlist decision → `DRY_RUN=false` (lead-magnet segment first) | Claude + CVO | REGGIE's first live reply to a real lead |
| R4 | **Token rotation** (gateway auth token + 6 GHL webhook headers + both env names + service restarts) | CVO pastes, Claude verifies | Old token rejected (401), new accepted |
| R5 | **Traffic on** — Launch Day marketing kit (already committed in RTL repo: FB/IG ads, posts, scripts) | CVO | First paid-traffic lead in pipeline |
| R6 | **Phase D measurement** — response time, checkout-recovery rate, $/conversation, wired to dashboard | Claude | Metrics visible on dashboard |

**Exit criteria: first $497 order attributable to the loop.** Blueprint booleans flip as built (forms → true at R1).

## 3 · Phase P — Pod Customization Sprint — **priority: today (IBM first) · cost: $0**

Every pod gets the Growth-by-Choice treatment: pre-filled IDENTITY.md + **Pod Mission** in AGENTS.md (businesses owned, operating facts, boundaries, hard gates, voice) + scoped skills + registry alignment. Writing workspaces costs no model spend.

- **P1 — Template codified** at `docs/reference/templates/POD-MISSION-template.md` (from the pod_growth_by_choice pattern, audit -005).
- **P2 — biz_06 IBM pod (TODAY):** nonprofit mission from registry; extra gates — donation/fund handling = money gate, `compliance_sensitive` posture, charity-voice rules; membership/community enabled per scope map (Wave 5 lighting, but **ready** today).
- **P3 — Remaining 10 pods batch:** biz_01–biz_10 missions written from their registry rows (offer model, pipelines, KPIs, lane maps, approval policies).
- **P4 — Division + shared lanes (d1–d9, shared_*):** mission stubs stating division charter, reporting line, and which pod leads they serve. Light-touch; deepen per wave.

**Exit criteria: every agent on the gateway boots knowing who it is, what it owns, and what it may never do.**

## 4 · Phase H — Hierarchy Runtime (the umbrella agency's nervous system)

- **H1 — Org chart codified** (`data/org-chart.json` + doc): CVO → REGGIE (`main`) → d1 executives → pod leads → division lanes → shared services. Dashboard widget later.
- **H2 — Routing + escalation:** routing rules per agent (today: 0 fleet-wide); escalation chains lane → pod lead → d1 exec → CVO; exceptions carry context, never raw threads.
- **H3 — Weekly All-Pods Meeting** *(cron — requires CVO cost sign-off, est. $1–3/week)*: pod leads briefed with real KPIs (GHL + Supabase + Stripe) → each writes minutes to its workspace → REGGIE synthesizes **one CVO digest**. This is the "weekly meeting" — an artifact you read with coffee, not a live token burn.
- **H4 — Teaching loop:** post-mortems and wins written to the shared knowledge base and injected into workspace memory — compounding skill, not agent-to-agent chatter.
- **H5 — Daily Prompt Guide (workstream #3):** the CVO's morning-command interface — quick prompts per subdivision, status/meeting/escalation commands, which lanes are lit and what each costs. Deliverable: one-page guide + repo doc.

**Exit criteria: a morning command produces cross-pod, KPI-grounded status without manual assembly; one weekly digest lands unprompted.**

## 5 · Phase W — Wave-Funded Lighting Schedule

Preparing a pod (Phase P) is free; **lighting** it is a per-wave capital decision. Procedure per lane: masked `openclaw models auth paste-api-key --agent <id>` → routing rules on → budget envelope recorded → REGGIE-STATE entry.

| Wave | Businesses (dashboard truth) | Lights when |
|------|------------------------------|-------------|
| 0 | MVP Cashflow + **Royal Results** (partially lit: marketing/main) | NOW — Phase R |
| 1 | biz_10 Portfolio Control | First revenue: internal ops lane gives REGGIE fleet eyes |
| 2 | biz_01 TJB Core Brand | Sustained Wave-0 cashflow |
| 3 | biz_02 Beyond the Veil · biz_03 Divine Path Walkers · biz_08 Primary SaaS | Capital + GHL **Agency Pro** upgrade |
| 4 | biz_04 Publishing · biz_05 Consulting · biz_07 Online Store | Prior waves KPI-green |
| 5 | **biz_06 IBM (charity)** — pod ready from day one (P2) | Per CVO; nonprofit ops funded by the for-profit stack |
| 6 | biz_09 Incubator Shared Brands | The empire incubates new brands |

## 6 · Cost Governance

- **Unit economics:** agent turn ≈ 35K-token bootstrap → ~3–11¢ on sonnet-5 (prompt-cached); haiku lanes cheaper; opus lanes (d1_ceo, d1_cto, d8_saas_director) reserved for judgment calls.
- **Envelopes:** each lit wave gets a monthly budget line the CVO sets at lighting time; weekly digest reports actuals vs envelope.
- **Standing protections:** no cron without sign-off · heartbeat stays throttled (168h) · new lanes start in DRY_RUN-equivalent (draft-only) where messaging is involved · preflight endpoint verification before any model-map edit · kill-switch = auth profile removal (instant, reversible).
- **Reference incidents:** Telegram 401 retry storm (hundreds of $) · heartbeat idle cost (~$150/mo) — the reasons this section exists.

## 7 · Infrastructure Runway

- **VPS (15GiB, CPU):** fine for the event-driven Anthropic architecture at Waves 0–2 volume. Not fine for local models (qwen3.6 needs 24.3GiB) or heavy concurrency.
- **Upgrade trigger:** when weekly model spend exceeds what a GPU server's amortized cost would cover, revive **Phase 9** (Ollama) for the workhorse tier — provider config + auth profiles already staged (audit -003). Until then, Anthropic laddered.
- **Also on runway:** alert channels (Telegram getMe first), SMS/A2P when texting matters, Supabase data-plane buildout for Phase D metrics, dashboard org-chart + envelope widgets.

## 8 · Sequence

**Today:** P1 template → **P2 IBM pod** → R1 opt-in form built.
**This week:** R2 sign-off → R3 go-live gates → R4 rotation → P3 all-pods batch → R5 traffic.
**This month:** R6 measurement → H1–H2 hierarchy config → H3 weekly meeting (sign-off) → H5 daily prompt guide → first Wave-1 lighting decision on revenue evidence.

_Execution stays one phase at a time; every production change gets backup + audit entry + rollback per standing protocol._
