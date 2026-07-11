# RTL × GHL Revenue Loop — Phase A Audit
_Audit date: 2026-07-10 · Session: Claude (Fable 5) · Source handoff: `HANDOFF-RTL-GHL-20260710.md`_
_Read-only audit. No production changes were made. All findings below verified live unless marked "assumed"._

## Verdict

Infrastructure is ~80% built and deployed but **0% of it is turned on for RTL**, and one P0 blocker gates everything:

> **P0 — The GHL Private Integration token on the VPS is INVALID.** `GET /locations/{id}` with the VPS token returns `401 "Invalid Private Integration token"`. The workstation `.env` holds **two different, both-valid tokens** (primary and `_TJB`, each HTTP 200 against the same location). The VPS pair is a single stale value. Nothing in Phase B/C can run from the VPS until this is synced/rotated.

Second structural finding: **there is no RTL GHL location.** Every configured location ID (VPS + workstation, suffixed and unsuffixed) resolves to one sub-account: **"Truth j Blue"** (website: jeremiahvanwagner.com). See Open Decision 1.

---

## 1. Webhook handler audit (`handlers/ghl-webhook-handler.mjs`)

### What it is
Standalone Node HTTP server (no framework). Default `0.0.0.0:8788`. Routes:

| Path | Purpose |
|---|---|
| `POST /webhook`, `/webhook/ghl`, `/webhooks/ghl` | GHL event ingestion |
| `POST /webhook/telegram` | Telegram approval-button callbacks (HMAC-verified, resolves human approvals) |
| `GET /health` | Status + active auth modes |
| `GET /metrics` | Prometheus (`eventProcessedTotal`, `eventProcessingDuration`) |

### Auth (three strategies, via `lib/ghl-webhook.mjs`)
1. `Authorization: Bearer` == `OPENCLAW_GATEWAY_AUTH_TOKEN` (GHL workflow Custom-Webhook actions)
2. OpenClaw HMAC/shared-secret headers == `OPENCLAW_GHL_WEBHOOK_SECRET` (**fatal at boot if unset**)
3. GHL platform Ed25519 signature == `OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY` (optional; **not set on VPS** — platform-signed webhooks would be rejected there)

### Hardening (all present and sound)
- **Idempotency ledger** (`lib/ghl-event-ledger.mjs`): claims each delivery in Supabase `agent_events` (partial unique index on `correlation_id`) *before* ack; duplicates ack'd but never re-dispatched. **Fail-soft**: Supabase down → in-process LRU (5k entries / 24h TTL) — a dark Supabase degrades dedupe, never drops webhooks.
- Zod schema validation per event type — non-fatal (logs, processes raw).
- 1 MB body cap, async processing after 200 ack (matches GHL retry semantics), trace IDs, structured logging, graceful shutdown.
- Multi-tenant via `lib/ghl-tenant-resolver.mjs`: registers `TJB` (default) and `MSL` (unset) from `_TJB`/`_MSL` env pairs; unsuffixed pair = `PRIMARY` fallback. Boot fails if zero tenants.

### Events handled (15) and what they do
`contact.created`, `contact.updated`, `contact.tag.added/updated`, `form.submitted`, `funnel.page.visited`, `payment.received`, `subscription.created/cancelled`, `appointment.created/cancelled/noshow`, `opportunity.created/stage.changed/status.changed`.

Each handler sends a natural-language instruction to a REGGIE agent (`marketing` / `sales` / `support`) via `openclawMessage` and/or fires alerts (Telegram/Teams/email via `openclawSend`). Three "Phase 3" skill modules are lazy-loaded: `assessment-handler`, `ebook-buyer-automation`, `abandoned-cart-recovery`.

### ⚠️ The business logic is 100% Truth-J-Blue-funnel-specific
Hardcoded throughout: Divine Alignment Scorecard, eBook price ladder ($7–$67), course-buyer threshold ($297+), Implementation Intensive ($997–$2,497), `truthjblue.com` cart URLs, `scorecard-lead` tags. **If RTL events hit this handler today, RTL leads would receive TJB-funnel instructions in the wrong voice with the wrong offers.** Phase C needs an RTL routing layer (by pipeline/tag/custom field) before any RTL traffic flows.

### ❌ No conversation events
No `InboundMessage` / `conversation.*` handling exists. The entire "REGGIE converses with the lead and replies through the GHL conversations API" loop (Phase C §1) is **net-new work**, not a wire-up. (Client libs exist: `lib/ghl-client.mjs`, `lib/ghl-client-v2.mjs`, plus 13 `ghl-*` skills incl. `ghl-speed-to-lead.mjs`, `ghl-workflow-builder.mjs`, `ghl-setup-validator.mjs` — audit their conversation-send coverage at Phase C start.)

### Env vars the handler consumes
Required: `OPENCLAW_GHL_WEBHOOK_SECRET`, ≥1 tenant pair (`GHL_PRIVATE_INTEGRATION_TOKEN[_X]` + `GHL_LOCATION_ID[_X]`).
Optional: `OPENCLAW_GHL_WEBHOOK_PORT/HOST`, `OPENCLAW_GATEWAY_AUTH_TOKEN`, `OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY`, `OPENCLAW_ALERT_TELEGRAM_CHAT_ID`, `OPENCLAW_ALERT_TEAMS_CHANNEL_ID`, `M365_EMAIL_OWNER`, `OPENCLAW_SKILLS_DIR`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (ledger).

### Deployment state on VPS (verified 2026-07-10)
| Item | State |
|---|---|
| `/opt/openclaw/handlers/ghl-webhook-handler.mjs` | ✅ deployed (29,026 B, Jul 4 — matches repo) |
| `/opt/openclaw/lib/` (all ghl-* deps, schemas) | ✅ present |
| `/opt/openclaw/skills/` (Phase 3 modules + 13 ghl skills) | ✅ present |
| `node_modules` (`@supabase` confirmed), Node | ✅ v22.22.2 |
| `openclaw-webhook.service` | ⛔ exists, well-formed (EnvironmentFile=/etc/openclaw/.env, hardened) but **disabled + inactive** |
| Port 8788 | ⛔ nothing listening |
| Public route | ✅ Caddy already proxies `webhook.truthjblue.dev` → `localhost:8788` |

**Conclusion:** the handler has never been (or is no longer) running in production. Bring-up is: fix token → `systemctl enable --now openclaw-webhook` → verify `https://webhook.truthjblue.dev/health`.

### VPS env gaps vs workstation `.env` (names compared, values never read)
Missing on VPS: `DRY_RUN` ⚠️ (Phase C requires DRY_RUN=true first), `M365_EMAIL_OWNER`, `OPENCLAW_ALERT_TEAMS_CHANNEL_ID`, `OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY`, `OPENCLAW_PUBLIC_WEBHOOK_BASE_URL`, `OPENCLAW_TELEGRAM_WEBHOOK_SECRET`, `RESEND_*` (n/a — RTL app owns Resend).
Note: `openclaw` CLI runs on the VPS emit "Missing env var TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID / OPENCLAW_GATEWAY_AUTH_TOKEN" config warnings even though those keys exist in `/etc/openclaw/.env` — the vars aren't exported into the CLI's environment (dot-sourcing without `set -a`). systemd's `EnvironmentFile=` is unaffected. Worth one look during Phase C bring-up; per standing guidance, verify the Telegram token via `getMe` before enabling any TG alerting.

---

## 2. GHL location determination

| Check | Result |
|---|---|
| VPS: `GHL_LOCATION_ID` vs `GHL_LOCATION_ID_TJB` | **identical** (tokens also identical) |
| Workstation: location IDs | **identical** to each other |
| Workstation: primary vs `_TJB` token | different tokens, **both valid**, both resolve the same location |
| Location name via API | **"Truth j Blue"**, website jeremiahvanwagner.com |
| VPS token validity | **401 Invalid Private Integration token** |

**Answer to the handoff question:** neither env var "is RTL's" — an RTL location does not exist. → Open Decision 1.

---

## 3. RTL app lead-flow map (`rtl-biz-pkg-mvp-v3`)

Stack: Next.js frontend (routes: `/` landing, `/pricing`, `/intake`, `/dashboard`, `/operator`, `/auth`, `/login`) + FastAPI backend + Celery generation engine + Supabase + Stripe **hosted Payment Link** + Resend. Site is live (readytolaunchmybusiness.com → HTTP 200).

### Current flow (verified in code)
1. **Lead magnet:** `POST /lead-magnet` (`backend/main.py:202`) takes `{email, name?}` → sends the Starter Guide link via Resend (fail-soft) → **discards the lead. No DB row, no ESP list, no CRM.** Docstring: "Nurture-list forwarding to the ESP is wired when that account is set up."
2. **Worse: the frontend never calls `/lead-magnet`.** No opt-in form exists on any page (grep across `frontend/` — zero call sites). The lead-magnet path in `MARKETING_PLAN.md` is currently **dead end-to-end: zero opt-ins are being captured.**
3. **Checkout:** `GET /checkout-link` → returns hosted Stripe Payment Link (env-swappable). Stripe → `POST /stripe/webhook` → verifies signature → handles **`checkout.session.completed` only** → idempotent `paid` order upsert → Resend buyer-confirm + operator alert.
4. **Intake (post-purchase):** `POST /orders/{id}/intake` → `IntakeForm{niche, audience, transformation, business_name?, offer?, tone?, notes?}` → one-shot, paid-only → queues generation, advances status. *(The three qualification facts from the handoff are exactly these first three fields.)*
5. **Fulfillment:** operator console → deliver 30-day signed assets → Resend delivery email.

### GHL integration in the app: none (grep confirmed; only false-positive substring matches).

### Where GHL calls belong (Phase B/C insertion points)
| Insertion point | Call |
|---|---|
| `backend/main.py:202` `/lead-magnet` | GHL contact upsert + tag `rtl-starter-guide` + pipeline entry (fail-soft, mirroring `emailer.py` pattern) |
| **New** frontend opt-in form (landing) | capture email + name + **phone (optional)** + UTM params → `/lead-magnet` |
| `backend/payments.py:handle_event` (on `created`) | GHL contact upsert + tag `rtl-customer` + move to `Purchased` |
| `backend/main.py:169` `/orders/{id}/intake` | write `rtl_niche` / `rtl_audience` / `rtl_transformation` custom fields |
| `backend/payments.py` (new branch) | handle `checkout.session.expired` → abandoned-checkout signal to GHL/REGGIE |

### UTM scheme to mirror in GHL custom fields (CAMPAIGN_KIT.md:73)
`utm_source={facebook|instagram}` · `utm_medium={paid|organic|boosted}` · `utm_campaign={launchday-cold|launchday-retarget|launchday-leadmagnet}` · `utm_content={angle}-{variant}`

---

## 4. Gap list — current state → target build

Legend: **P0** blocks everything · **P1** blocks the phase · P2 in-phase work · P3 quality/optional

### Cross-cutting
| # | Gap | Priority | Fix |
|---|---|---|---|
| G1 | VPS GHL token invalid (401) | **P0** | Sync valid workstation token(s) into `/etc/openclaw/.env` (backup + `REGGIE-STATE.md` entry + rollback), or CVO rotates fresh in GHL. Confirm 200 from VPS afterward. |
| G2 | No RTL GHL location | **P0 (decision)** | Open Decision 1 — blocks all Phase B naming/scoping. |
| G3 | Webhook service disabled/inactive | P1 | After G1: `systemctl enable --now openclaw-webhook`; verify `/health` via public URL. Zero-cost when idle (event-driven; no polling — respects cost posture). |
| G4 | `DRY_RUN` absent on VPS | P1 (Phase C gate) | Add `DRY_RUN=true` to `/etc/openclaw/.env` before any REGGIE wiring. |

### Phase B (GHL build) — nothing exists yet; all assumed-absent, verify with valid token via `GET /opportunities/pipelines`, `GET /locations/{id}/customFields`, `GET /calendars/`
| # | Gap | Priority |
|---|---|---|
| G5 | Pipeline `RTL Launch Day` (7 stages) | P2 |
| G6 | Custom fields `rtl_niche/rtl_audience/rtl_transformation/rtl_urgency` + `utm_source/medium/campaign` | P2 |
| G7 | Ingestion: opt-in→contact+tag+pipeline; landing→`rtl-landing`; Stripe purchase→`Purchased`+`rtl-customer` | P2 |
| G8 | Automations: <60s first touch, +1h/+24h abandoned checkout, +48h testimonial ask, day-7 re-engage | P2 |
| G9 | "Launch Consult (15 min)" calendar | P3 |
| G10 | **PIT constraint** (ref doc 1): Private Integration tokens **cannot register platform webhook subscriptions** — every GHL→REGGIE event in Phase B must be built as a workflow **Custom Webhook action** POSTing to `https://webhook.truthjblue.dev/webhook/ghl` with the Bearer token. Ed25519 platform signing is irrelevant unless an OAuth app is built later. | P2 (design constraint) |

### Phase C (REGGIE wiring)
| # | Gap | Priority |
|---|---|---|
| G11 | No `InboundMessage`/conversation handling in handler — conversational loop is net-new | P2 |
| G12 | No GHL-conversations-API reply path wired for REGGIE agents (client libs/skills exist; coverage unaudited) | P2 |
| G13 | Handler prompts are TJB-funnel-specific — RTL routing layer required **before** RTL traffic flows, else RTL leads get TJB-voice instructions | **P1 for Phase C** |
| G14 | RTL prompt-set (goal/qualification/objections/compliance/escalation) doesn't exist | P2 |
| G15 | Escalation channel unverified (TG env-export quirk above; `M365_EMAIL_OWNER` missing on VPS) | P2 |

### RTL app
| # | Gap | Priority |
|---|---|---|
| G16 | **No opt-in form in frontend — zero leads captured today.** Highest-leverage single fix in the entire loop. | **P1** |
| G17 | Leads not persisted anywhere (`/lead-magnet` fire-and-forget) | P1 (fixed by G7 insertion) |
| G18 | No UTM capture (form → backend → GHL) | P2 |
| G19 | No phone capture → SMS-first speed-to-lead impossible for opt-ins | P2 |
| G20 | Stripe webhook ignores `checkout.session.expired` → no abandoned-checkout signal | P2 |

### Phase D (measurement)
| # | Gap | Priority |
|---|---|---|
| G21 | No first-response-time / recovery-rate / cost-per-conversation metrics. Handler's Prometheus registry is the natural extension point. | P3 (until go-live) |

---

## 5. Open decisions for CVO (asking once, per handoff)

> **RESOLVED 2026-07-11 (CVO):** RTL ships from the **Royal Results** client sub-account (co-owned; location `0PFDiGrgne4sbE4dJEC6`, royalresults.pro) with a fresh CVO-provided PIT. Wired as tenant alias **RR** on both hosts and verified (see `REGGIE-STATE.md` entry 2026-07-11-001). G1 (TJB VPS token 401) is therefore **non-blocking for RTL** and downgraded to a separate cleanup item; G2 is closed. New constraint discovered: Royal Results is an **active client CRM** (6 live pipelines, 6 published workflows incl. a generic "New Lead Welcome Sequence") — Phase B must be strictly additive/namespaced and must filter-check existing workflow triggers before RTL traffic flows.

1. ~~**RTL location:**~~ resolved above.
2. ~~**Token remediation:**~~ superseded for RTL by the RR PIT; TJB token rotation remains an open housekeeping item.

## 6. Recommended execution order (Phase B start)
1. CVO answers Decisions 1–2.
2. Sync/rotate token → VPS (backup + `REGGIE-STATE.md` audit entry) → verify 200.
3. Add `DRY_RUN=true` + missing alert vars to VPS env (same change window, one backup).
4. `systemctl enable --now openclaw-webhook` → verify `https://webhook.truthjblue.dev/health` shows all three auth modes.
5. Verify current GHL state with the valid token (pipelines/fields/calendars) — then build Phase B items G5→G9 via API, with workflow Custom-Webhook actions per G10.
6. G16 (frontend opt-in form) can proceed in parallel — it's pure RTL-app work and unblocks any lead capture at all.
