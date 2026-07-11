# RTL × GHL Revenue Loop — Phase B Build
_Executed 2026-07-11 · Session: Claude (Fable 5) · Target: **Royal Results** sub-account (tenant `RR`) · Prior: `rtl-ghl-loop-phase-A-audit.md`_

Royal Results is an **active client CRM**. Rule for everything in this phase: **additive and namespaced only** — `RTL Launch Day` pipeline, `rtl_*` fields, `rtl-*` tags. Nothing existing gets edited.

---

## 1. APPLIED via API — 2026-07-11 (audit entry 2026-07-11-002)

### Custom fields (8 × HTTP 201, verified by re-fetch)
| Field name | fieldKey | Type |
|---|---|---|
| RTL Niche | `contact.rtl_niche` | TEXT |
| RTL Audience | `contact.rtl_audience` | TEXT |
| RTL Transformation | `contact.rtl_transformation` | LARGE_TEXT |
| RTL Urgency | `contact.rtl_urgency` | TEXT |
| UTM Source | `contact.utm_source` | TEXT |
| UTM Medium | `contact.utm_medium` | TEXT |
| UTM Campaign | `contact.utm_campaign` | TEXT |
| UTM Content | `contact.utm_content` | TEXT |

UTM values follow CAMPAIGN_KIT.md: source `{facebook|instagram}` · medium `{paid|organic|boosted}` · campaign `{launchday-cold|launchday-retarget|launchday-leadmagnet}` · content `{angle}-{variant}`.

### Tags (3 × HTTP 201, verified)
`rtl-starter-guide` (lead-magnet opt-in) · `rtl-landing` (landing form) · `rtl-customer` (paid).

**Rollback:** `DELETE /locations/{RR}/customFields/{id}` and `DELETE /locations/{RR}/tags/{tagId}` — IDs resolvable anytime by fieldKey/name. Zero contacts reference these yet, so deletion is loss-free today.

**Operational note for future GHL scripting:** Cloudflare in front of `services.leadconnectorhq.com` blocks Python's default urllib user-agent with **error 1010 (HTTP 403 on every route)**. Set any curl-like `User-Agent`. The 403s look identical to scope failures — check UA before suspecting the token.

### Calendar — CREATED 2026-07-11 (audit entry 2026-07-11-003)
CVO added himself to the location (Jeremiah Van Wagner, Account Admin, user `wRSsxg7QtbtDH7QrG2C3`), resolving the owner question. Created via API (HTTP 201, verified active):
- **Launch Consult (15 min)** · id `FxvoiD98eoUnV5yzqJyc` · slug `rtl-launch-consult` · round-robin w/ single member (Jeremiah, primary)
- Defaults (deliberately tight — consult is for hesitant leads only; adjust in UI): **Tue + Thu 13:00–16:00** account TZ · 15-min slots · 5-min buffer · max 4/day · 4h min notice · 2-week booking window · auto-confirm · reschedule/cancel allowed · meeting location "phone call — we call you"
- Booking widget: `https://api.leadconnectorhq.com/widget/booking/FxvoiD98eoUnV5yzqJyc`
- API quirk (recorded): `openHours[]` entries must contain exactly ONE day each — `daysOfTheWeek: [2,4]` in one entry → 422 "must be a valid day of week".

### Deferred from the API batch
- **Workflow trigger audit via API: not possible** — `GET /workflows/` exposes only id/name/status/version. Moved to the UI checklist below (item B).

---

## 2. UI BUILD SHEET (CVO — ~30 min total; GHL v2 API cannot create pipelines or workflows)

> ⚠️ **Build every workflow as DRAFT.** Nothing gets published until Phase C's DRY_RUN transcripts are approved (handoff Phase C §3). Publishing order is defined in §4 below.

### A. Pipeline — `RTL Launch Day` (~3 min)
Settings → Pipelines → **+ Create Pipeline** → name `RTL Launch Day` → stages, in order:
1. `New Lead` 2. `Engaged` 3. `Qualified` 4. `Checkout Sent` 5. `Purchased` 6. `Delivered` 7. `Testimonial Asked`
Leave "visible in funnel/pie chart" defaults. Do not touch the 6 existing pipelines.

### B. Co-tenancy trigger audit (~5 min — REQUIRED before any RTL traffic)
Automation → Workflows → open each **published** workflow → check its **trigger**:
| Workflow | Risk to check |
|---|---|
| New Lead Welcome Sequence | If trigger is location-wide (Contact Created, or any-form-submitted): add trigger filter **"Tag → Doesn't include → rtl-starter-guide"** + same for `rtl-landing`, `rtl-customer` |
| Lead Nurture Drip Sequence | same check |
| Unresponsive Lead Re-Engagement | same check |
| Appointment Confirmation & Reminder | OK if calendar-scoped to the client's 9 calendars; verify it's not "any calendar" (the future Launch Consult calendar must not trigger it) |
| Post-Appointment Follow-Up | same calendar-scope check |
| Review Request Workflow | check trigger; exclude `rtl-*` tags if location-wide |

Goal: an RTL lead must never receive the client's generic sequences (two voices messaging one lead).

### C. Workflow drafts (4) — copy is pre-checked against MARKETING_PLAN.md §6 + CAMPAIGN_KIT voice
All sends "from" the Ready-to-Launch brand identity. No income claims, no invented proof, same-day promise quoted exactly as **"delivered same day — most orders within the hour."**

**Webhook action (used in each workflow):** action type **Custom Webhook** → `POST https://webhook.truthjblue.dev/webhook/ghl` → Header `Authorization: Bearer <OPENCLAW_GATEWAY_AUTH_TOKEN>` (copy the value from `/etc/openclaw/.env` on the VPS — do not store it in this doc or in GHL notes) → Body: include `type` (literal, e.g. `rtl.optin`), `locationId`, contact merge fields (id, first_name, email, phone), and the stage/tag that fired.

#### C1 · `RTL — Instant Touch` (speed-to-lead, <60s)
- **Trigger:** Contact Tag Added = `rtl-starter-guide` (add 2nd trigger: Tag Added = `rtl-landing`)
- **Steps:** If/Else on phone exists →
  - **SMS (phone):** `{{contact.first_name}}, your Ready-to-Launch Starter Guide just landed in your inbox (check spam if it's hiding). What's the business you keep almost launching? Reply here — a real answer gets a real plan. Reply STOP to opt out.`
  - **Email (no phone):** Subject `Your Starter Guide — plus one question` · Body: guide re-link + `What's the business you keep almost launching? Hit reply and tell me the niche — I'll tell you exactly what the package would build for it. Five deliverables, $497 once, delivered same day — most orders within the hour.`
- Then: **Custom Webhook** (`type: rtl.optin`) → move opportunity to `Engaged` on reply (GHL "customer replied" trigger branch or leave to Phase C).
- **SMS prerequisites (checklist):** A2P 10DLC registration status on Royal Results number · quiet hours ON (9:00–20:00 contact local) · STOP handling verified. Per SMS guardrail in the handoff — no SMS until these check out.

#### C2 · `RTL — Abandoned Checkout`
- **Trigger:** Opportunity stage changed → `Checkout Sent` (pipeline `RTL Launch Day`)
- **Steps:** Wait 1h → If stage still `Checkout Sent` (not `Purchased`):
  - **Email 1 (+1h):** Subject `Your package is still here` · `Your Ready-to-Launch checkout is open. One form in — course, eBook with a designed cover, five emails, a deployable site, and a launch plan out. $497 once, delivered same day — most orders within the hour. [Finish checkout]`
  - Wait 23h → same stage check → **Email 2 (+24h):** Subject `The "will it sound like AI?" question` · `Fair worry. Our engine rejects copy that reads like everyone else's — "game-changer" gets stamped REJECTED before anything ships. And you get three rounds of website copy revisions, so the words end up yours. [Finish checkout]`
- Then: **Custom Webhook** (`type: rtl.checkout_abandoned`).

#### C3 · `RTL — Testimonial Ask`
- **Trigger:** Opportunity stage changed → `Delivered`
- **Steps:** Wait 48h → **Email:** Subject `One small favor` · `You've had the package for two days. If it did what we said it would, a screenshot of your favorite piece plus two honest sentences would mean a lot — real proof from real builds is the only kind we use. Reply with it here. If something's off instead, reply and we'll fix it — that's what the revisions are for.` → move stage to `Testimonial Asked` → **Custom Webhook** (`type: rtl.testimonial_asked`). (MARKETING_PLAN §3: screenshot + quote; never invented.)

#### C4 · `RTL — Day-7 Re-engage`
- **Trigger:** Contact Tag Added = `rtl-starter-guide`
- **Steps:** Wait 7 days → If/Else: has tag `rtl-customer` OR stage ≥ `Purchased` → **exit**. Else **Email:** Subject `Still almost launching?` · `A week ago you grabbed the Starter Guide. If the build list is still the wall — course, eBook, emails, site, plan — that's exactly the five things the package builds from one form. $497 once, delivered same day — most orders within the hour. When you're ready, the form takes ten minutes: [link]` → **Custom Webhook** (`type: rtl.dormant7`).

### D. Calendar — ✅ done via API (see §1). Optional UI polish: adjust availability windows, add a Google/Outlook connection for Jeremiah's user so booked slots sync, and confirm the calendar does NOT trigger the client's "Appointment Confirmation & Reminder" workflow (part of the §2B audit).

---

## 3. Ingestion spec — RTL app changes (Phase B §3; next work chunk, `rtl-biz-pkg-mvp-v3` repo)
| # | Change | Where |
|---|---|---|
| I1 | **Opt-in form on landing page** (email + name + optional phone) + UTM passthrough from query params — the funnel captures zero leads until this exists | `frontend/app/page.tsx` (+ small API helper) |
| I2 | `/lead-magnet` → GHL contact upsert + tag `rtl-starter-guide` + opportunity in `RTL Launch Day/New Lead` + UTM fields (fail-soft, mirroring `emailer.py`) | `backend/main.py:202` |
| I3 | Stripe `checkout.session.completed` → GHL upsert + tag `rtl-customer` + stage `Purchased` | `backend/payments.py:handle_event` |
| I4 | Intake submit → write `rtl_niche` / `rtl_audience` / `rtl_transformation` to GHL custom fields | `backend/main.py:169` |
| I5 | Handle Stripe `checkout.session.expired` → stage stays `Checkout Sent` signal (feeds C2) | `backend/payments.py` |
| I6 | "Checkout Sent" stage set when checkout link is issued/clicked | `/checkout-link` or frontend pricing CTA |

New env for the RTL backend: `GHL_PRIVATE_INTEGRATION_TOKEN_RR`, `GHL_LOCATION_ID_RR` (+ pipeline/stage IDs once the pipeline exists — capture them via `GET /opportunities/pipelines` after §2A).

## 4. Publishing order (gate: Phase C DRY_RUN sign-off)
1. Trigger audit (§2B) complete → 2. Pipeline live (§2A) → 3. Ingestion I1–I4 deployed → leads flow into CRM with **workflows still draft** → 4. Phase C: REGGIE prompt-set + DRY_RUN transcripts → CVO approval → 5. Publish C1 on the lead-magnet segment only → widen per handoff.

## 5. Phase B close checklist
- [x] Custom fields ×8 (API, verified)
- [x] Tags ×3 (API, verified)
- [ ] Pipeline `RTL Launch Day` (UI — §2A)
- [ ] Trigger audit of 6 published client workflows (UI — §2B)
- [ ] 4 workflow drafts (UI — §2C)
- [x] Calendar `Launch Consult (15 min)` (API, verified — id `FxvoiD98eoUnV5yzqJyc`)
- [ ] Ingestion I1–I6 (RTL repo)
