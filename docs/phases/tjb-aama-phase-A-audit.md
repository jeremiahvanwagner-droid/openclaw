# TJB × AAMA Self-Liquidating Offer — Phase A Audit
_Audit date: 2026-07-12 · Session: Claude (Opus 4.8) · Source handoff: `HANDOFF-TJB-AAMA-20260712.md`_
_Read-only audit. No production changes were made. All findings verified live (repo / VPS / Stripe / live sites) unless marked "assumed" or "PENDING PIT"._

> **UPDATE 2026-07-12 (post-CVO redirect):** The CVO clarified the mission — the AAMA fulfillment system is its **own code-complete Next.js/Supabase/Stripe LMS** (`ai-agentic-mastery-academy` repo), not a GHL build; GHL is only marketing/drip. Decisions: **text-first launch now** (video later), **eBook = lead-magnet front door**, backend = **DFY $999 / DFY+Mgmt $497+$197 mo**. Current status + the remaining launch punch-list now live in the LMS repo at **`docs/LAUNCH-READY-STATUS-2026-07-12.md`**. Sections 1–2 below (offer/platform/IBM HUB) remain accurate; §3 (TJB GHL inventory) is still PIT-blocked and now lower-priority than the LMS launch. See REGGIE-STATE 2026-07-12-014.

## Verdict

The offer assets are **real and live** — AAMA sells today through hosted Stripe — but three things gate the build:

1. **P0 — TJB Private Integration Token is DEAD (401).** Verified live on the VPS: `/etc/openclaw/.env` holds a correctly-formed 40-char PIT (not a double-paste) for location `TW8JsPW5NMnA3tfK2XLn`, but `GET /locations/{id}` returns **HTTP 401** → the token was revoked/expired server-side. **Nothing can read or write the TJB sub-account until the CVO issues a fresh PIT.** This is the RTL-Phase-A parallel (there the fix was the RR PIT). Until it's replaced, the TJB inventory + product reconciliation below stay **PENDING**.

2. **Structural — the "$9.95 order-bump in front of $297" described in the handoff does not match the live page.** The live sales page **leads with the $297** course and presents the **$9.95 "AI Agent Blueprint" eBook as a *downsell*** ("Not ready for the full program? … Get The AI Agent Blueprint eBook — $9.95") — not as an order-bump checkbox on the $297 checkout, and not as a front-door tripwire. A true self-liquidating funnel does the opposite: lead with the low-ticket (or a free lead magnet), then upsell the core. **The self-liquidating mechanic has to be *built*, not just wired.** See §2 and Open Decision 1.

3. **Fulfillment reality is unverified.** The sales page is marketing-complete and the student area (`(student)` route group) is built into the app, but whether the 25 video lessons + toolkit actually exist behind `/login` cannot be seen from outside. The CVO says the course is **incomplete**. Confirming what a buyer receives today needs student-area access or a direct CVO answer. See §2 and Open Decision 2.

---

## 1. AAMA platform & checkout (verified in-browser, live)

**Property:** https://ai.agenticmastery.academy/ · author/brand "Truth J Blue" · built by Truth J Blue LLC "as part of the Growth by Choice movement" (page copy).

| Check | Result |
|---|---|
| Framework | **Next.js 14** (`/_next/static/...`), route groups `app/(public)/page` + **`app/(student)/layout`** — fulfillment is built into the *same* app |
| Hosting | **Vercel** (`?dpl=dpl_...` deploy fingerprint on every asset) |
| Course platform | **None** — not Kajabi, not Teachable, not GHL. Bespoke app. Same architectural family as IBM / IBM HUB. |
| Checkout ($297) | Clicking "Enroll for $297" → **`https://checkout.stripe.com/c/pay/cs_live_…`** — hosted **Stripe Checkout**, live session |
| Stripe account | Displays as **"Truth j Blue"** — the shared TJB Stripe entity (same one behind the rest of the portfolio) |
| Order-bump / eBook | $9.95 eBook is a **separate CTA / downsell**, not a line item or checkbox on the $297 session |
| GHL touch | **None detected** — no LeadConnector/GHL calls on load or at checkout. Checkout + fulfillment live entirely in the Vercel app + Stripe. |
| Auth / student area | `/login` (SPA), account "dashboard" + "downloads vault" per page copy; `(student)` route group present |

**Implication for Phase B/C:** AAMA is architecturally like RTL — a self-serve app with **hosted Stripe** and **no native GHL**. The GHL sub-account (TJB) is where REGGIE's CRM/pipeline/conversation layer must be *added around* the existing Stripe checkout (contact capture, tags, pipeline, lead engine), exactly as RTL added GHL around the RTL app's Stripe link. The webhook signal for "purchased" will come from **Stripe** (or an app-side hook), **not** from a GHL order.

## 1a. AAMA offer inventory (from the live sales page — marketing claims, not fulfillment-verified)

- **Core:** **$297** "Complete Program" (compare at **$997**), 30-day money-back guarantee.
- **Downsell:** **$9.95** "The AI Agent Blueprint" eBook ("start with the foundation").
- **Structure:** 6 modules · 25 lessons · 5.5 hrs · "$1,200+ in included tools." One module/week over 6 weeks; Module 1 unlocks at purchase.
  - M1 AI Agents Decoded (4 · 40m) · M2 Finding Your Automation Gold Mines (4 · 49m) · M3 Building Your First AI Agent (4 · 55m) · M4 Advanced Agent Patterns (4 · 45m) · M5 Guardrails, Governance & Safety (4 · 47m) · M6 Scaling Your Agent Workforce (5 · 55m).
- **Included:** 50+ prompts, Business Process Audit Template, ROI Calculator, Terminology Glossary, Platform Selection Matrix, integration guides (10 tools), multi-agent templates, ReAct guide, risk/guardrails checklists, monitoring dashboard, exec ROI report, 90-day roadmap, **2 live Q&A Zoom sessions**, verifiable Certificate (80% on a 20-question final), lifetime access.
- **Audience framing:** online business owners · brick-and-mortar owners · consultants/solo operators. Voice is precise and outcome-careful (good compliance posture; no income claims on the page).

---

## 2. IBM HUB classification (verified, live)

**Property:** https://hub.inspirebuildmotivate.com/ — **NOT** previously audited.

| Check | Result |
|---|---|
| What it is | **Name-your-price, donation-gated content-bundle portal** for the 501(c)(3). "Name your gift — every dollar funds the compound." |
| Framework | **Next.js** (`/_next/image`), custom-built — same stack/family as the IBM main site |
| Platform | No third-party course/community platform (no Kajabi/Circle/Skool/GHL) |
| Offers | No fixed prices — **pay-what-you-want donations** unlock bundles. CTAs "Give & unlock" → `/bundles/[series]` (four variants) |
| Auth | `/auth` login; `/donate` donation route |
| Relation to IBM main | Subdomain of inspirebuildmotivate.com; footer confirms operator "Inspire Build Motivate, Inc." (501(c)(3), EIN 46-2696332) |
| Traffic nature (Phase D) | **Donation / compliance-sensitive** — same money-gate + donor-privacy rules as IBM main. Not a commercial funnel. |

---

## 3. TJB sub-account inventory — **PENDING fresh PIT** (blocked by P0)

Cannot be run until the TJB PIT is replaced. On unblock, verify with the valid token (`User-Agent: curl/8.9.1`, `Version: 2021-07-28`):
- `GET /opportunities/pipelines?locationId=…` — existing pipelines/stages (must not collide with AAMA `aama-*`)
- `GET /locations/{id}/customFields` — existing custom fields (namespace check for `aama_*`)
- `GET /locations/{id}/tags` — existing tags (namespace check for `aama-*`)
- `GET /calendars/?locationId=…` — existing calendars
- `GET /products?locationId=…` (+ prices) — existing GHL products/offers (for the "current products" reconciliation)
- `GET /workflows/?locationId=…` — existing published workflows (trigger-collision check before any AAMA workflow, per the RR lesson)

**Why it matters:** TJB is the **active flagship** sub-account (registry `biz_01`, plus biz_04/05/07/08/09/10 share it). Every AAMA object must be strictly **additive and namespaced** so it can't disturb live TJB funnels — the same discipline the RR audit forced for Royal Results.

---

## 4. Product / Scope-Map reconciliation

**Finding:** **AAMA is not in the business registry** (`data/business-registry.json`, 12 businesses). Neither is it in Supabase `business_registry` (assumed — mirror of the JSON). It is a live, revenue-generating TJB LLC product with its own domain and Stripe checkout.

- Closest existing entries: `biz_04` (Publishing/digital), `biz_08` ("Truth J Blue AI Platform"/SaaS), `biz_11` (MVP Cashflow / digital_products, owner `pod_growth_by_choice`), `biz_12` (Royal Results / RTL, owner `pod_growth_by_choice`).
- **Recommendation:** add AAMA as a new registry entry (proposed `biz_13_ai_agentic_mastery_academy`), vertical `digital_products` / `online_course`, `ghl_location_selector: "TJB"`, owner `pod_growth_by_choice` (it's Growth-by-Choice, like RTL/MVP-Cashflow), rollout_wave 2, checkout provider `stripe`. **Do not write yet** — (a) the registry has a **CI guardrail** that fails the build on count/field drift (Supabase-first, then JSON mirror, then CI pins), and (b) the "current products" half of the reconciliation needs the TJB inventory (§3), still PIT-blocked. Propose in Phase B, apply deliberately.

---

## 5. Gap list — current state → target build

Legend: **P0** blocks everything · **P1** blocks the phase · P2 in-phase work · P3 quality/optional

### Cross-cutting
| # | Gap | Priority | Fix |
|---|---|---|---|
| G1 | **TJB PIT invalid (401)** — 40-char token, correct format, revoked server-side | **P0** | CVO issues a fresh PIT in the TJB sub-account (scopes per §7). Then update `GHL_PRIVATE_INTEGRATION_TOKEN_TJB` in `/etc/openclaw/.env` (masked, `bak-*` backup, REGGIE-STATE entry, rollback) → verify 200 vs `TW8JsPW5NMnA3tfK2XLn`. |
| G2 | AAMA absent from Scope Map (registry + Supabase) | P1 | Add `biz_13` entry (§4) — Supabase → JSON mirror → CI pins, respecting the guardrail. Deferred until §3 inventory known. |

### Offer / funnel (the self-liquidating mechanic)
| # | Gap | Priority |
|---|---|---|
| G3 | **No true low-ticket front door.** Live page leads with $297; $9.95 eBook is a downsell, not a tripwire, and there is no free lead magnet opt-in. A self-liquidating funnel needs a low-friction entry (free lead magnet **or** the $9.95 as the *first* offer) whose captured leads REGGIE can nurture toward $297. | **P1 (design)** — Open Decision 1 |
| G4 | $9.95 → $297 relationship undefined in GHL (Stripe handles money; GHL must model the ladder: eBook-buyer tag → nurture → course-buyer). | P2 |
| G5 | No identified "next rung" above $297 (cohort / coaching / DFY). Do **not** invent one — confirm with CVO before modeling. | P3 (decision) |

### Fulfillment
| # | Gap | Priority |
|---|---|---|
| G6 | **Fulfillment completeness unverified** — 25 lessons/videos + toolkit claimed; CVO says course is incomplete. Need student-area access or CVO answer on what actually ships to a buyer today. The SLO cannot drive paid traffic to an offer that under-delivers. | **P1** — Open Decision 2 |

### Phase B (GHL build) — all assumed-absent; verify via §3 once PIT valid
| # | Gap | Priority |
|---|---|---|
| G7 | Pipeline `AAMA` (stages e.g. lead → engaged → eBook-buyer → checkout-sent → enrolled → delivered → testimonial) | P2 |
| G8 | Custom fields `aama_*` + UTM fields; tags `aama-*` | P2 |
| G9 | Lead-magnet / opt-in capture (front door for G3) | P2 |
| G10 | Ingestion: opt-in → contact+tag+pipeline; Stripe purchase ($9.95 / $297) → tag + stage move. **Signal source is Stripe/app, not a GHL order** (checkout is external). | P2 |
| G11 | Workflows as **DRAFTS** with Custom-Webhook actions → `https://webhook.truthjblue.dev/webhook/ghl` (Bearer `OPENCLAW_GATEWAY_AUTH_TOKEN`); PITs can't register platform webhooks. | P2 |

### Phase C (REGGIE wiring)
| # | Gap | Priority |
|---|---|---|
| G12 | AAMA lead engine (copy `skills/rtl-lead-engine.mjs`): tenant guard = **TJB**, own JSONL transcripts, own prompt-set grounded ONLY in verified AAMA facts, DRY_RUN default true, engine-sends pattern, escalation regex, NO_REPLY sentinel. | P2 |
| G13 | AAMA prompt-set (`prompts/aama-sales-agent.md`) — grounded facts only; escalate on unknowns; precise about outcomes (AI course — no income/results claims). | P2 |
| G14 | The existing webhook handler business logic is **100% TJB-funnel-specific** (Divine Alignment Scorecard, $7–$67 eBook ladder, truthjblue.com carts). An AAMA routing layer (by pipeline/tag/field) is required before AAMA traffic flows, or AAMA leads get the wrong offers. (Same finding the RTL audit made.) | **P1 for Phase C** |
| G15 | Branded sender for AAMA (subdomain sending domain; never touch root `@` records). Decide from-domain (e.g. `agenticmastery.academy` subdomain). | P2 |

### Phase D (traffic + measurement)
| # | Gap | Priority |
|---|---|---|
| G16 | UTM/attribution scheme unified across IBM (donations), IBM HUB (name-your-price donations), RTL ($497 self-serve), AAMA ($9.95/$297). Each property has a different money model — respect each. | P2 |
| G17 | Per-property dashboards / first-response + conversion + cost metrics. | P3 (until go-live) |

---

## 6. Open decisions for CVO (asking once, per handoff cadence)

1. **Self-liquidating shape (G3):** What is the intended *front door* — (a) a **free lead magnet** opt-in that nurtures to $297, (b) the **$9.95 eBook as the lead offer** (tripwire) with $297 as the upsell, or (c) keep the current "lead with $297, $9.95 as downsell" and self-liquidate purely on ad efficiency? This decides the entire Phase B funnel shape.
2. **Fulfillment truth (G6):** What does a buyer actually receive **today** — how many of the 25 lessons have real video/content, and does the toolkit exist? (Grant student-area access, or tell me which modules are live.) The SLO can't ship ahead of the product.
3. **Next rung (G5):** Is there an approved offer above $297 (cohort/coaching/DFY), or is $297 the ceiling for now?

## 7. Fresh-PIT scopes (so the CVO creates it once, correctly)

Grant the **same scope set as the RR PIT** — at minimum: **Contacts** (view+edit), **Custom Fields** & **Custom Values** (view+edit), **Opportunities/Pipelines** (view+edit), **Calendars & Calendar Events** (view+edit), **Conversations & Conversation Messages** (view+edit — REGGIE replies through this), **Workflows** (view), **Forms/Surveys** (view), **Tags** (view+edit), **Locations** (view — for the verify call), **Products/Prices** (view+edit). 40-char format = `pit-` + 36-char UUID; paste **once** (an 80-char double-paste 401'd on the RR token 2026-07-12).

## 8. Recommended execution order (into Phase B)
1. CVO answers Decisions 1–3 and issues the fresh TJB PIT (§7).
2. Update `GHL_PRIVATE_INTEGRATION_TOKEN_TJB` on VPS (backup + REGGIE-STATE entry) → verify 200.
3. Run the §3 TJB inventory → finalize the "current products" reconciliation and the `biz_13` registry entry (§4).
4. CVO reviews this audit + the completed inventory **before** any Phase B build (all objects additive/namespaced `aama-*`).
