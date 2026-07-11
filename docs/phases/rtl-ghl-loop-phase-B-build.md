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

### A. Pipeline — `RTL Launch Day` — ✅ built by CVO 2026-07-11, IDs captured via API
Pipeline id `PyJjxP442Bpwv5BUi8MS`. Stage IDs (needed by ingestion I2/I3/I6 and workflows C2/C3):
| Stage | ID |
|---|---|
| New Lead | `77a50701-c743-4f72-a938-f5b70d502a94` |
| Engaged | `0c114c72-4676-4e93-87ec-f8e66a54b897` |
| Qualified | `73ea92f7-01bd-4000-844f-374680d7a278` |
| Checkout Sent | `4b02b1ad-ff4d-4ca9-9b61-c42fa0040216` (added by CVO, captured 2026-07-11) |
| Purchased | `8a3b673b-67da-40e8-a009-bb35e40a01e4` |
| Delivered | `80faf7c6-2925-4b3e-8277-aac5350d9457` |
| Testimonial Asked | `2b20f8e7-2a84-4378-8a5b-cbc2cd202fba` |

### B. Co-tenancy trigger audit (~5 min — REQUIRED before any RTL traffic)
**Mechanism (settled 2026-07-11):** exclusion filters on the client workflows' triggers, keyed on **tags** — NOT on RTL custom fields (field "Intent type" filters are AI content-classification and unreliable for this; client leads don't carry the fields at all). Tags are applied in the same API call that creates each RTL contact, so they're present when triggers evaluate. Recipe per location-wide trigger: add three filter rows `Tags → Doesn't include → rtl-starter-guide / rtl-landing / rtl-customer` (rows AND — contact passes only with none). **Form Submitted triggers need NO filter** (RTL leads arrive via REST API, never via a GHL form). Triggers needing the exclusions: Contact Created, generic Contact Tag Added, Customer Replied, un-scoped Opportunity triggers. Fallback where a trigger lacks a Tags filter: first workflow step = If/Else "Tags includes any rtl-*" → End.

**AUDITED 2026-07-11 via browser (read-only — no client workflows were modified).** All 6 published workflows show 0 total enrollments ever. Verdicts:

| Workflow | Trigger (observed) | Verdict |
|---|---|---|
| New Lead Welcome Sequence | Form Submitted — no filters | ✅ **SAFE** — RTL leads arrive via API, never a GHL form. (CVO's experimental "RTL Audience / Intent type" filter was never saved — nothing to clean.) |
| Lead Nurture Drip Sequence | Tag Added includes `new-lead` | ✅ **SAFE** — RTL applies only `rtl-*` tags. Ingestion rule: NEVER apply the literal tags `new-lead` / `cold-lead`. |
| Unresponsive Lead Re-Engagement | Tag Added includes `cold-lead` | ✅ **SAFE** — same reasoning |
| Appointment Confirmation & Reminder | Customer Booked Appointment — Contact Mode "contact", **no calendar filter** | ⚠️ **FIX** — fires on Launch Consult bookings |
| Post-Appointment Follow-Up | Appointment Status — Event "Normal", **no calendar filter** | ⚠️ **FIX** — same |
| Review Request Workflow | Appointment Status — Event "Normal", **no calendar filter** | ⚠️ **FIX** — same |

**The one fix, ×3 (CVO, ~1 min each; must land before the consult link is ever sent to a lead):** open the workflow → click the trigger card → **Add filters** → field **In Calendar** (or "Calendar") → operator **is any of** → select the client's 9 calendars (everything EXCEPT `Launch Consult (15 min)`) → **Save trigger**. This scopes each appointment workflow to the client's own calendars; tag exclusions are unnecessary for these three because the discriminator is the calendar itself.

Goal: an RTL lead must never receive the client's generic sequences (two voices messaging one lead).

> Note on automation feasibility: the workflow builder is a cross-origin iframe (`client-app-automation-workflows.leadconnectorhq.com`) with heavy renderer freezes; browser automation handled read-only auditing fine but precision form edits inside live published client workflows proved unsafe (coordinate drift, Delete adjacent to targets) — deliberately backed out without saving anything.

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
- [x] Pipeline `RTL Launch Day` (CVO via UI; id `PyJjxP442Bpwv5BUi8MS`) — all 7 stages live, IDs captured
- [x] Trigger audit of 6 published client workflows (browser, read-only) — 3 safe · 3 need the §2B calendar filter (CVO, ~3 min total)
- [ ] 4 workflow drafts (UI — §2C)
- [x] Calendar `Launch Consult (15 min)` (API, verified — id `FxvoiD98eoUnV5yzqJyc`)
- [ ] Ingestion I1–I6 (RTL repo)
