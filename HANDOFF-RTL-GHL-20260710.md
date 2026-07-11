# HANDOFF — REGGIE'S FIRST REVENUE LOOP: GHL × READY-TO-LAUNCH BUSINESS PACKAGE
_Created 2026-07-10 by Claude (Fable 5) session | Authoritative state handoff — read fully before acting_

## Operating Context
You are a new Claude Code session working in `C:\Users\JeremiahVanWagner\.openclaw` — the ops repo for **R.E.G.G.I.E.**, the primary OpenClaw Sovereign Agent. Treat this file as the mission order. Store outputs as files, not chat text. Update `REGGIE-STATE.md` with an audit entry for any production change (follow the existing entry format in that file).

## User
- Jeremiah Van Wagner · Truth J Blue LLC · CVO/operator · advanced systems architect
- Expectations: no wasted time, no Docker/GHL basics explained, no repetitive questions, concise and corrective. Verify before asserting.

## System State (as of 2026-07-10, all verified live)
| Fact | Value |
|---|---|
| REGGIE production | Hostinger VPS `srv1619751.hstgr.cloud` (SSH `root@` — key auth works) |
| Live deployment path | `/opt/openclaw/.openclaw/` (systemd `openclaw.service`, user `openclaw`, HOME=/opt/openclaw, env `/etc/openclaw/.env`). **`/home/openclaw/.openclaw` is a stale stub — do not edit it.** |
| Gateway | `wss://api.truthjblue.dev` (Caddy → 127.0.0.1:18789), health `{"ok":true,"status":"live"}` |
| Agent model | `anthropic/claude-sonnet-5` primary (fixed 2026-07-10: registered opus-4-8 / sonnet-5 / haiku-4-5 under `models.providers.anthropic.models`; backup `openclaw.json.bak-providers-20260710T2151`) |
| Cost posture | Cron storms + auto-health loops fixed (were burning $100s/week). Do NOT add recurring/heartbeat jobs without explicit CVO approval and cost math. |
| Device auth | ENFORCED (good). CLI actions need an approved operator device. Pending approvals live in the Control UI (operator's desktop browser at https://api.truthjblue.dev). If CLI ops fail with "scope upgrade pending approval," the operator must approve in the UI — do not attempt bypasses. |
| Secondary stack | `C:\Users\JeremiahVanWagner\openclaw-docker` = TruthClaw sandbox (port **18790**) + `openclaw-reggie-node` (workstation node paired to REGGIE, may still be pending approval). **Not REGGIE. Port 18789 on this workstation is reserved for REGGIE. Never conflate the two.** |
| GHL wiring | `handlers/ghl-webhook-handler.mjs` (29KB, exists, audit needed). Env keys on VPS + workstation: `GHL_PRIVATE_INTEGRATION_TOKEN`(+`_TJB`), `GHL_LOCATION_ID`(+`_TJB`), `OPENCLAW_GHL_WEBHOOK_*`, `DRY_RUN`. Reference docs: `GoHighLevel Private Integration, Webhooks & Endpoints for Full OpenClaw Automation.md` (this folder) and `OpenClaw × GoHighLevel Master of HighLevel Universe Mode` (this folder). |
| Secrets | Live in `/etc/openclaw/.env` (VPS) and local `.env` files. NEVER print values. |

## Mission
Deploy REGGIE's **first income-producing loop**: GoHighLevel as the CRM + automation layer for the **Ready-to-Launch Business Package** — `https://readytolaunchmybusiness.com` — with REGGIE as the conversational engine that converts leads to checkouts.

### Why this loop (recommendation carried over from prior session)
REGGIE is infrastructure-complete but has never been pointed at a revenue process. The highest-probability first loop is instant lead follow-up: it uses wiring that already exists (GHL private integration, webhook handler, Stripe), it's measurable in one number, and once it runs on Jeremiah's own funnel it becomes the demo for the productized "AI employee for GHL businesses" offer (see `OpenClaw GHL Onboarding Blueprint`).

### The offer (facts — source: `C:\Users\JeremiahVanWagner\rtl-biz-pkg-mvp-v3\docs\marketing\`)
- **$497 one-time, self-serve Stripe checkout.** Five deliverables (course, eBook w/ designed cover, 5-email sequence, deployable landing page, strategy doc), same-day delivery, most within the hour. Plus 3 rounds of website copy revisions.
- Funnel: cold FB/IG ads → landing page → checkout; lead-magnet path = free **Ready-to-Launch Starter Guide** (existing `/lead-magnet` endpoint, Resend email nurture); retargeting; post-purchase testimonial ask.
- Avatars: **Stuck Expert** ("I know my stuff, I just never finish the build") and **Side-Hustler** ("By the time I build all this, I'll have talked myself out of it").
- KPIs: CAC < $150 · landing CVR 1.5–3% · cost per opt-in < $5.
- **Because this is self-serve, "speed-to-lead" here means:** REGGIE instantly engages every opt-in and abandoned checkout, answers objections in the brand voice, and drives to completed checkout — NOT booking sales calls. (Optionally offer a "launch consult" calendar slot only for visibly hesitant leads.)

### Compliance guardrails (NON-NEGOTIABLE — bake into REGGIE's prompt-set)
1. No fabricated proof: no invented testimonials, income numbers, client counts, star ratings.
2. No income claims ("make $10k/mo") — not the promise, and Meta flags it.
3. Voice: "a builder showing their work — calm, specific, zero hype" (see `SALES_SCRIPTS.md`).
4. SMS: honor STOP/opt-out, quiet hours, A2P compliance.

## Development Scope (execute in order)

### Phase A — Audit (read-only, no approvals needed)
1. Read `handlers/ghl-webhook-handler.mjs` end-to-end: what events it handles, what it does with them, which env vars it needs, whether it runs on the VPS today (check `/opt/openclaw/` for it + any systemd/process references).
2. Read the two GHL reference docs in this folder. Determine which GHL location is RTL's (`GHL_LOCATION_ID` vs `GHL_LOCATION_ID_TJB`) — ask the CVO once if ambiguous.
3. Map the RTL app's current lead flow: `C:\Users\JeremiahVanWagner\rtl-biz-pkg-mvp-v3` (Next.js frontend + `/lead-magnet` endpoint + Resend + Stripe). Identify where a GHL contact-create call belongs.
4. Deliverable: `docs/phases/rtl-ghl-loop-phase-A-audit.md` — gap list between current state and the target build below.

### Phase B — GHL CRM build (in GHL, via Private Integration API; DRY_RUN concepts first where destructive)
1. **Pipeline** `RTL Launch Day`: `New Lead → Engaged → Qualified → Checkout Sent → Purchased → Delivered → Testimonial Asked`.
2. **Custom fields**: `rtl_niche`, `rtl_audience`, `rtl_transformation`, `rtl_urgency`, `utm_source/medium/campaign` (match the UTM scheme in `CAMPAIGN_KIT.md`).
3. **Ingestion**: lead-magnet opt-in → GHL contact + tag `rtl-starter-guide` + pipeline entry; landing form → tag `rtl-landing`; Stripe purchase (webhook) → `Purchased` stage + tag `rtl-customer`.
4. **Automations**: (a) new-lead instant touch (<60s) — SMS if number, email otherwise, from REGGIE; (b) abandoned-checkout follow-up at +1h/+24h; (c) post-delivery testimonial ask at +48h (per `MARKETING_PLAN.md` §3 testimonial engine); (d) dormant-lead re-engage at day 7.
5. **Calendar**: one "Launch Consult (15 min)" calendar, used sparingly per the self-serve note above.

### Phase C — REGGIE wiring
1. Wire GHL webhooks (InboundMessage, ContactCreate, OpportunityStageUpdate) → `ghl-webhook-handler.mjs` → REGGIE agent session; REGGIE replies through the GHL conversations API so all threads live in the CRM.
2. Author REGGIE's RTL prompt-set: goal = qualified checkout; qualification = the three intake facts (niche, audience, transformation) which double as their intake-form answers; objection handling grounded ONLY in real product facts (from `MARKETING_PLAN.md` + `SALES_SCRIPTS.md`); compliance guardrails above; escalate to human (Telegram alert if channel configured, else email) on refund requests, anger, or anything outside product scope.
3. **DRY_RUN=true first**: full simulated conversation transcripts reviewed by CVO before any live message. Then go live on the lead-magnet segment only, then widen.
4. Every production config change: backup with existing `bak-` convention + `REGGIE-STATE.md` audit entry + rollback path.

### Phase D — Measurement (the only proof that matters)
- Track: median first-response time (target <60s), opt-in→checkout rate before/after, abandoned-checkout recovery rate, REGGIE cost per conversation (watch the cost posture — alert if projected > $5/day).
- Weekly one-pager to CVO. After 2 clean weeks: this loop becomes the demo for the productized GHL offer (that's a separate future phase — do not scope it now).

## First Actions (exact)
```powershell
# 1. Confirm REGGIE is live
curl https://api.truthjblue.dev/health
# 2. Confirm device approvals are done (if this fails with scope-upgrade, stop and ask CVO to approve in Control UI)
ssh root@srv1619751.hstgr.cloud ". /etc/openclaw/.env; sudo -u openclaw -H env HOME=/opt/openclaw OPENCLAW_CONFIG_DIR=/opt/openclaw/.openclaw openclaw devices list --token \"$OPENCLAW_GATEWAY_AUTH_TOKEN\""
# 3. Begin Phase A audit
```

## Out of Scope (do not touch)
- REGGIE's model routing / agents_config.json pod bindings (Anthropic-primary is settled; cost controls are in place)
- The secondary TruthClaw Docker stack (port 18790) except the already-configured `openclaw-reggie-node`
- New cron/heartbeat jobs without CVO cost sign-off
- Any marketing claim not sourced from the `rtl-biz-pkg-mvp-v3\docs\marketing\` docs
