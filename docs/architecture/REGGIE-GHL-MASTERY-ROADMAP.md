# REGGIE x GHL — MASTERY ROADMAP

**Prepared for:** the CVO, Truth J Blue LLC
**Date:** 2026-07-15
**Sources:** six domain audits (agent/gateway architecture, GHL integration layer, skills & event automation, infrastructure/ops, vision-vs-reality, GHL universe surface map), reconciled against the operator's live-session context of 2026-07-15.
**Status in one line:** Wave 0 is live — RTL email + FB Messenger replies on tenant RR, social poster staged one flag from posting. Zero recorded sales. Everything else is either dark by doctrine or dark by neglect; this document says which is which, and in what order to light it.

---

## 1. Architecture in one screen

What REGGIE actually is today: an event-driven reply machine for one GHL sub-account, built on an integration layer that wraps essentially the entire published GHL API, surrounded by a 107-agent org chart that is almost entirely configuration.

| Component | What it is | Grade | Single biggest weakness |
|---|---|---|---|
| **GHL client layer** — `lib/ghl/` (35 namespaces, ~413 ops) + v1 client | Codegen'd wrap of GHL's OpenAPI with disciplined retry/throttle core | **A-** | No agency-level auth: snapshots/SaaS/companies are wrapped but uncallable |
| **Live revenue skills** — `skills/rtl-lead-engine.mjs` (live), `rtl-social-poster.mjs` (staged) | The proven loop: webhook → tenant guard → escalation regex → agent drafts text → engine writes → JSONL transcript | **A-** | Hardcoded pipeline/stage IDs; no STOP/opt-out handling in the reply path (M0-8); runs as the legacy `marketing` agent, outside the org and RBAC design |
| **Event plumbing** — `handlers/ghl-webhook-handler.mjs`, `lib/ghl-webhook.mjs` | 3 auth modes, idempotency ledger, Prometheus metrics, tri-channel alerts | **B+** | Inbound ceiling: PITs can't register platform webhooks, so all ingress is hand-built workflow Custom Webhooks |
| **Gateway + channels** — openclaw :18789, Telegram, email | Loopback-bound, token-auth'd, Telegram allowlisted post-incident | **B** | Single box; the alerting originates on the same box it monitors |
| **Multi-tenant routing** — `lib/ghl-tenant-resolver.mjs` | TJB/MSL/RR alias→token resolution; what the live loop actually uses | **C+** | Hardcoded aliases; an unknown locationId silently falls back to the TJB token |
| **RBAC / token governance** — `lib/ghl-scope-enforcer.mjs` + token groups | Real per-method enforcement via Proxy, unit-tested | **C-** | Protects nothing that runs: the live loop bypasses it; all 8 groups are TJB; TJB's PIT is dead (401); RR has no groups |
| **Agent org** — 107 agents in `config/openclaw.json` | 9 division lanes, 10 biz pods, shared services | **D** | ~7 agents have ever run; ~100 are unfilled template shells |
| **Orchestration** — `inngest/` (15 cron triggers, 911-line orchestrator, tests) | Invoke routing, escalation chains, weekly-meeting fan-out | **D** | Nothing serves it — zero imports of `inngest/serve.ts`; it writes to a dark database |
| **Data plane** — Supabase DB1/DB2 | Intended home of events, costs, governor state, approvals | **F** | 0 rows in every core table; the dashboard renders a static registry |
| **Infra / deploy** — Hostinger VPS, systemd, health cron | Hardened units (incident-annotated), 5-min health check with auto-restart | **C-** | Hand-deploy divergence: VPS git HEAD stale at a708285, live files untracked, `git pull` would clobber production; the documented backup script does not exist |
| **Docs / state ledger** — REGGIE-STATE.md, RUNBOOKS.md | 39 dated July entries prove the ledger discipline is real | **C** | The state file's header is two months stale and factually wrong; RUNBOOKS.md would actively mislead during an incident |

One concrete illustration of the deploy problem, because it recurs in every audit: the repo's webhook handler now has claim-before-ack idempotency, but the July-3 advancement audit found none — the fix landed later, and because the VPS is a hand-deploy with untracked files, **nobody can prove from the repo whether production dedupes events today.** M0 exists to make that class of question answerable again.

---

## 2. The GHL Universe scorecard

Legend: ✓ yes · ~ partial · ✗ no. "Live" means REGGIE operates the surface via API in a production loop right now.

| GHL surface | API-drivable | Wrapped in `lib/` | Skill exists | Live in loop | Gate / note |
|---|---|---|---|---|---|
| Conversations (email/SMS/FB/IG/WA) | ✓ | ✓ | ✓ | **✓ LIVE** | email + FB Messenger on RR; channel *provisioning* is UI-only |
| Contacts / CRM | ✓ | ✓ (32 ops) | ✓ | **✓ LIVE** | tags + breadcrumbs; smart lists UI-only |
| Opportunities | ✓ | ✓ | ✓ | **✓ LIVE** | stage advance New Lead → Engaged |
| Inbound events (workflow Custom Webhooks) | ~ | ✓ | ✓ | **✓ LIVE** | the only ingress possible under PIT auth |
| Social Planner posting | ✓ | ✓ (40 ops) | ✓ | ~ staged | `RTL_SOCIAL_DRY_RUN=true`; account connect UI-only |
| Pipeline authoring | ✗ UI-only | read-only | build sheets | ✗ | must ship inside snapshots |
| Workflow authoring | ✗ UI-only | list-only | build sheets (F2) | ✗ | contact enrollment IS API-drivable |
| Calendars / appointments | ✓ | ✓ (34 ops) | ✗ | ✗ | one of GHL's best APIs, unused |
| Forms / surveys | ~ submissions read | ✓ | ✗ | ✗ | building UI-only; the live opt-in form was UI-built |
| Funnels / pages | ~ read + URL redirects | ✓ | scaffolding only | ✗ | page creation UI-only |
| Invoices | ✓ | ✓ (41 ops) | ✗ | ✗ | create/send/Text2Pay all API |
| Payments / transactions / subs | ~ read-only | ✓ (24 ops) | ✗ | ✗ | the raw material for R6 measurement |
| Products / prices | ✓ | ✓ (27 ops) | ✗ | ✗ | |
| Store | ~ | ✓ (18 ops) | ✗ | ✗ | |
| Email builder (templates) | ✓ | ✓ | ✓ | ✗ | bulk campaign SEND is UI/workflow-only |
| Blogs | ✓ | ✓ | ✗ | ✗ | |
| Media library | ✓ | ✓ | ✓ | ✗ | F4b media currently hosted off-GHL |
| Custom objects / fields / associations | ✓ | ✓ (27 ops) | ✗ | ✗ | the API-native substitute for the missing reporting API |
| Trigger links | ✓ | ✓ | ✗ | ✗ | attribution without a reporting API |
| Courses / memberships | ~ import-only | ✓ | ✓ | ✗ | offer management UI-only |
| Voice AI | ~ | ✓ (11 ops) | ✓ | ✗ | config UI-heavy, call logs readable |
| LC-Phone / A2P | ~ | ✓ | ✗ | ✗ | A2P/TCR registration UI-only — and a legal prerequisite with multi-week lead time; a named M2 runbook step, not a footnote |
| Custom menus | ✓ | ✓ | ✗ | ✗ | |
| Snapshots | ~ list/share only | ✓ | ✗ | ✗ | **agency token required**; authoring UI-only |
| Locations (create w/ snapshotId) | ✓ | ✓ (29 ops) | ✗ | ✗ | **agency token required** — the tenant-stamping lever |
| SaaS mode / rebilling | ✓ | ✓ (22 ops) | ✓ | ✗ | **Agency Pro ($497/mo) required** — the wave gate itself |
| Companies / users (agency tier) | ✓ | ✓ | ✗ | ✗ | agency token required |
| OAuth / marketplace app | ✓ | ✓ | ✗ | ✗ | no app registered; **only route to platform webhooks** |
| Reputation / reviews | ✗ no public API | ✗ | ✗ | ✗ | UI or browser lane only |
| Affiliate manager | ✗ no public API | ✗ | ✗ | ✗ | |
| Reporting / attribution | ✗ no public API | ✗ | ✗ | ✗ | must be derived from objects + transactions + trigger links |

**Coverage summary:** 31 surfaces mapped. 17 fully API-drivable, 9 partially, 5 with no meaningful write API (2 of those have no API at all). `lib/` wraps 28 of 28 wrappable surfaces — ~413 operations across 35 namespaces, **effectively 100% of the published GHL API is already in the codebase.** Skills exist for 10 surfaces (~32%). Live in a revenue loop: 4 (~13%), plus one staged.

Read the columns left to right: API knowledge is total, the skill layer is a third built, production is one tenant and three surfaces. The distance between column 2 and column 4 *is* this roadmap.

---

## 3. Gap analysis — the honest distance to the vision

The accepted vision (GROWTH-BY-CHOICE plan, 2026-07-12): morning commands to 100+ digital employees operating ~12 businesses, lit wave-by-wave from RTL cashflow. The distance, grouped:

**Platform gaps (GHL layer)**
- **No agency auth lane.** Everything runs on location-scoped PITs. Snapshots, location provisioning, SaaS/rebilling, companies — the entire wave-replication vertical — are wrapped but uncallable. No agency token exists anywhere in the codebase, and no marketplace OAuth app is registered (the only route to real platform webhooks).
- **Tenant onboarding is a code edit.** The resolver hardcodes three aliases and never consults `data/business-registry.json`. A 12-business portfolio cannot run on a file you edit per tenant.
- **Silent cross-tenant fallback.** An unknown locationId resolves to the TJB token — wrong-tenant writes are possible by omission (`ghl-tenant-resolver.mjs:141-144`).
- **Governance inverted, and token lifecycle ends at a one-time event.** The scope enforcer protects only the dark 100-agent org; the live loop uses a full-power PIT directly. The one governed tenant (TJB) has a dead token; the live tenant (RR) has no token groups. And nothing monitors token health — no rotation cadence, no expiry watch; the dead TJB PIT was discovered by accident via 401s, not by an alert.
- **No lane for the UI-only residue.** Workflow/pipeline/funnel authoring, A2P, snapshot authoring, reputation, affiliate — no snapshot inventory, no browser-automation lane, only RTL's build sheets.
- **Plumbing debt:** duplicated v1/v2 request core, no User-Agent set in either client (the Cloudflare 1010 mitigation lives in the skills, not the clients), per-namespace API-version override not modeled.

**Operational gaps (deploy / observability / data plane)**
- **P0 — repo ≠ production.** VPS HEAD stale at a708285 (Jul 4) with the live loop files untracked on-box. Every audit finding about "what's running" is an inference.
- **P0 — silent-death exposure.** All alerting originates on the VPS; a dead box alerts no one. No off-box monitor exists.
- **P0 — the backup is fictional, and even a real one would be unproven.** `docs/deployment.md` cites a `backup.sh` that does not exist; the RR PIT and every webhook secret live in one un-backed-up `.env` on one box. No restore has ever been rehearsed and no RPO is stated — and copying that `.env` somewhere unencrypted would just put every secret in two places.
- **P0 — no kill switch, no rollback story.** Exactly two skills carry DRY_RUN flags, and flipping either means an SSH session and a service restart. Nothing halts all outbound sends in one action, nothing pauses a single tenant, and no procedure answers "the engine is sending wrong messages to live leads right now — what do you do?" The March 2026 doctrine is preventive only; it never wrote the during-incident page.
- **P0 — compliance is absent on a live channel.** The live reply engine has no opt-out or consent handling (the sms-compliance-checker skill exists only as an unfilled template), and nothing verifies Meta's 24-hour messaging window or automated-experience disclosure on the FB loop running today — a policy strike takes down the same Page R5 traffic depends on. TCPA ($500–$1,500 per message), A2P registration lead time, and CAN-SPAM footers appear nowhere, while M1–M2 walk straight toward SMS reminders and API-managed email.
- **Supabase dark (0 rows):** no cost truth, no persisted event ledger, no KPI source for any future digest.
- **Tenant data commingles by default.** JSONL transcripts, the shared Supabase plane, and the planned custom-object rollups all mix tenant records with no `tenant_id` partitioning, no retention/deletion procedure, and no access story. Tolerable while every tenant is owned; a contractual and legal exposure the day M2 stamps anything client-shaped — and far cheaper to design in at M1 than to retrofit into a running data plane at M3.
- **Inngest dark and rotting silently:** 15 crons defined, nothing mounts them; undocumented whether that is doctrine or neglect.
- **The legacy TJB webhook lane has no DRY_RUN, no tenant guard, and 2025-era prompts** — safe today only because the TJB PIT is dead. A fresh PIT makes it hot as-is.

**Organizational gaps (hierarchy / routing)**
- **Phase H is 0% built** and it is the headline promise: no `data/org-chart.json`, zero routing rules fleet-wide, no weekly digest, "Daily Prompt Guide" exists only inside the plan document. A morning command today reaches one agent about one business.
- **"100+ digital employees" = ~100 unfilled template shells.** Pod leads are single-file `SOUL.md` stubs; the claimed IBM pod (P2) is unverifiable in the repo.
- **Registry/config drift everywhere:** 107 agents (openclaw.json) vs 103 (agents_config.json, with stale model strings) vs 102 workspace dirs; registry says "10-Business" and lists 12. "Scope map is law" requires the law to agree with itself.
- **The one working employee is off-org:** the live loop runs as the legacy `marketing` agent, so operational boundaries and token groups govern nothing real.
- **One human gates every write, and no stage budgets their hours.** HITL approval is doctrine, and the CVO is the named owner of snapshot authoring, F2 builds, ad management, per-cron sign-offs, pod identity fills, and the approval queue. At 12 businesses, approval throughput *is* system throughput — and there is exactly one human in every escalation chain, including at 2am. Section 5 budgets this and defines the graduation rule off HITL.
- **No tenant relationship model.** Owned business, client, or SaaS sub? The plan never said — RR runs an AI agent on live leads with no authorization artifact, and SaaS mode explicitly monetizes third parties. The M2 runbook blocks any non-owned go-live on a signed artifact for exactly this reason.

**Economic gaps (the Agency Pro gate)**
- **Zero sales, and the instruments to detect one are unwired.** R5 traffic not launched; R6 measurement not built; the ladder's scale/kill rules have no numbers to act on.
- **The gate chain is long and every link unproven:** first $497 sale → ~1 sale/wk sustained across a trailing 30 days (≈$1,800/mo margin at $422/sale) → Agency Pro $497/mo → SaaS/snapshot surfaces exist at all → waves 3+ light. And A2P registration's multi-week lead time paces the first tenant lighting no matter when the money gate opens.
- **Every wave assumes a snapshot pack, and snapshot authoring is UI labor** no one has scheduled — once per business archetype, by the CVO.
- **All 107 agents bill Anthropic.** Fine while dark ($0 idle); a cost problem the day lanes light. The Phase 9 local-model remap is one orphaned client file, and the current VPS (15GiB) cannot host the designated model (24.3GiB).

---

## 4. THE MASTERY ROADMAP

Stages are anchored to the GROWTH-MACHINE cashflow gates, not dates. Effort: **S** = one focused session, **M** = 1–3 days, **L** = a week or more.

### M0 — Solidify Wave 0 *(entry gate: none — start now)*
Debt paydown on the machine that already runs, while traffic ramps.

**Builds**
1. **VPS reconcile (M):** tar the full on-box diff, copy untracked/modified files into a `vps-reconcile-2026-07` branch, fold into main, tag, `git reset --hard <tag>` on the VPS in a quiet window, re-enable the git deploy path as the *only* path — which also makes rollback a capability instead of a wish: git revert + redeploy in under 10 minutes, proven once during the quiet window.
2. **Off-box monitor + real backups + one rehearsed restore (S/M):** free external pinger on the public `/health` endpoints; scripted, **encrypted** backup of `/etc/openclaw/.env` and the runtime tree (unencrypted, a backup just puts every secret in two places); confirm Hostinger snapshot cadence; then rehearse one bare-VPS restore and write the measured time and the accepted RPO (how many minutes of webhook events we tolerate losing) into a DR runbook. An untested backup is a hope — this project has already shipped a fictional `backup.sh` once.
3. **R6 measurement (M):** deterministic nightly rollup — a plain node script on a **systemd timer on the VPS, never openclaw cron** (two documented scars rule that out: one bad provider endpoint silently aborts every openclaw cron platform-wide, and the local Windows gateway has fired duplicates) — payments/transactions + opportunities read → per-day funnel truth (spend, leads, sales, ROAS) written to Supabase and the transcript dir. The ladder's scale/kill rules start working.
4. **R4 completion + credential hygiene (S/M):** rotate GHL webhook headers, mint RR token groups in `config/ghl-token-groups.json`, retire or replace the dead TJB PIT — then make it a lifecycle, not an event: a quarterly rotation cadence, and a deterministic token-health check riding the existing health cron (a curl per tenant PIT; any 401 alerts tri-channel instead of silently falling back or waiting to be discovered by accident, which is how the TJB PIT died unnoticed).
5. **Disarm the legacy TJB lane (S):** gate `handleNewContact`/`handlePayment`/etc. behind the RTL pattern (DRY_RUN + tenant guard) *before* any fresh TJB PIT exists.
6. **Social lane completion (S):** verify page targeting post-Reality-Zone removal, flip `RTL_SOCIAL_DRY_RUN`, then `status=scheduled` (F5); CVO builds the F2 FB inbound workflow from its build sheet; then the engagement loop (F6).
7. **Global kill switch + per-tenant pause (S):** one flag, checked before every outbound write in every skill, flippable by a single Telegram command through the existing bot — plus a per-tenant pause in the resolver. Today the only stops are two per-skill DRY_RUN flags behind an SSH session and a restart. Ships with a "bad-send incident" entry in RUNBOOKS.md (which gets its stale content corrected in the same pass): the March 2026 doctrine prevents incidents but never answered the during-incident question. Cheap at one tenant; unbuildable-in-time at twelve.
8. **Compliance floor for the live channel (S/M):** verify the FB Messenger loop honors Meta's 24-hour messaging window and sends the automated-experience disclosure — this applies to the loop that is live *today*, and a policy strike takes down the same Page R5 traffic depends on. Add STOP/unsubscribe keyword handling to the reply engine (tag + suppress, failing closed at the same hard-gate tier as the tenant guard). SMS stays dark everywhere until the unfilled sms-compliance-checker skill is filled and A2P registration exists (a named M2 runbook step).

**Exit criteria:** repo == VPS with git-based deploys restored and rollback rehearsed (git revert + redeploy in under 10 minutes); external monitor green and one bare-VPS restore performed, with time and RPO written into the DR runbook; measurement produces true CAC/ROAS daily; RR runs on scoped, rotated tokens with token-health alerting; one command halts all outbound sends; the live FB loop honors the 24-hour window, discloses automation, and suppresses on STOP; the 60-day calendar is posting.
**What REGGIE can newly do:** report real numbers every morning, survive a VPS loss (rehearsed, not presumed), stop every outbound send in one Telegram command, and ship — or revert — any future fix in one commit instead of one surgery.

### M1 — Full RTL-tenant mastery *(entry gate: R5 traffic live + first $497 sale recorded)*
Prove every surface one business needs, on governed rails.

**Builds**
1. **Registry-driven tenant resolver (M):** kill hardcoded aliases; `data/business-registry.json` becomes the source and gains a tenant classification field (`owned | client | saas-sub`) the M2 runbook will key on; unknown locationId **fails closed**; the M0 per-tenant pause flag lives here.
2. **Close the RBAC bypass (M):** route the live engine through `ghl-client-v2` + scope enforcer using the new RR token groups; hardcoded pipeline/stage IDs move to registry config.
3. **Calendars + invoices/payments for RTL (M):** booking offers and revenue truth handled in-loop. Booking reminders stay **email-only** until A2P/TCR registration and per-form consent capture exist and the sms-compliance-checker skill is filled and green — TCPA runs $500–$1,500 per message, per lead, and that multiplies across a portfolio.
4. **Derived reporting on custom objects (M/L):** nightly job — same pattern as M0-3: a deterministic script on a systemd timer on the VPS, never openclaw cron — rolls opportunities + transactions + trigger links into GHL custom objects and Supabase, with `tenant_id` a mandatory partition key on every table and transcript path and a per-tenant retention/deletion procedure written before M2 stamps its first non-owned tenant. The reporting API GHL refuses to ship, built from the surfaces it does — and built partitioned, because retrofitting isolation into a running data plane costs multiples of designing it in.
5. **Content surfaces adopted (S):** F4b media moved into the GHL media library; email templates managed via API for nurture — every template carries a CAN-SPAM-compliant footer (physical address + working unsubscribe) enforced as a template lint, not a memory item.
6. **Unify the v1/v2 request core (M):** one retry/UA/version-override path so fixes land once.
7. **Sandbox tenant + smoke suite (M):** a dedicated free GHL location under the agency becomes the standing integration-test tenant — because DRY_RUN by definition never exercises the write path, and without this the first real write against a newly stamped tenant is that write's first test. The suite covers every op the live loop uses (contact write, tag, stage move, conversation send, social post) and runs as a CI gate on the git deploy path M0 restored.

**Exit criteria:** every surface RTL touches is API-operated, scope-enforced, and smoke-tested against the sandbox in CI; measurement is derived, not estimated, and partitioned by tenant_id; zero hardcoded tenant IDs in skills; no SMS surface lit (that unlock lives behind M2's A2P step); the <10-minute rollback bar held through every build.
**What REGGIE can newly do:** operate the entire RTL customer lifecycle — capture, converse, book, invoice-read, post, report — without the CVO opening the GHL UI, and prove any write works on a sandbox before a lead ever sees it.

### M2 — Agency Pro activation *(entry gate: ~1 sale/wk sustained across a trailing 30 days — ≈$1,800/mo margin at $422/sale, GROWTH-MACHINE's own criterion — → buy Agency Pro, $497/mo)*
The repeatable "light a business" capability. The gate is stated in GROWTH-MACHINE's terms deliberately — see Section 5 for why the tempting "covers-it-twice" shorthand is the wrong gate.

**Builds**
1. **Agency auth lane (L):** agency/company token handling in the resolver; decide and begin the marketplace OAuth app (the platform-webhook route).
2. **First archetype snapshot (M, mostly CVO UI labor):** hand-author the RTL-pattern snapshot once — pipelines, workflows, forms (each opt-in form carrying explicit consent language the runbook later verifies per tenant), calendar — spec'd by a build sheet, then verify `POST /locations` with `snapshotId` stamps a working tenant.
3. **"Light a business" runbook as code (L):** registry row, with its classification (`owned | client | saas-sub` — any non-owned tenant requires a signed artifact covering AI-messaging authorization, SLA terms (response time, uptime, incident-notice window), and data ownership/deletion, and the go-live flip stays blocked until it exists) → **A2P/TCR registration started day one** (multi-week lead time — it paces the calendar, so the gate math assumes it) → location create from snapshot → token-group mint checklist → workflow Custom Webhook bootstrap (`scripts/bootstrap-ghl-workflow-webhooks.mjs` hardened) → consent-capture verification on every opt-in form the snapshot stamped → **smoke suite green against the sandbox tenant** → DRY_RUN soak → go-live flip.
4. **SaaS day-one checklist (S/M):** rebilling config and first plan definitions executed the day Agency Pro activates — saas-sub tenants are third parties by definition, so the runbook's signed-artifact gate applies to every one.
5. **Wave-1 pilot (M):** stamp biz_10 (Portfolio Control) end-to-end through the runbook.

**Exit criteria:** a new tenant goes from registry row to live reply loop in under a day of labor (A2P runs in parallel from day one and paces the calendar), with one hand-built snapshot per archetype; smoke-suite green is a hard runbook gate; no non-owned tenant flips live without its signed artifact; kill-switch and per-tenant pause coverage extend to every stamped tenant by construction.
**What REGGIE can newly do:** provision businesses. The agency stops being one tenant.

### M3 — Multi-wave operation *(entry gate: 2–3 tenants live via the runbook; waves 2–3 funded per the waterfall; and the webhook-ingress durability decision made — once more than one tenant's revenue rides on one box's ingress, either a dumb always-up relay/queue fronts the VPS or the accepted event-loss RPO is re-signed in writing)*
The hierarchy becomes operations; the morning command becomes real.

**Builds**
1. **H1 org chart as data (S):** generate `data/org-chart.json` from a single reconciled agent registry (closes the 107-vs-103 drift while at it).
2. **Serve the Inngest layer deliberately (M):** mount `serve.ts` for the *event-triggered* functions only; crons stay off without per-cron CVO sign-off.
3. **Light the Supabase data plane (M):** agent_events, costs, governor state written for real — `tenant_id` a mandatory partition key on every table, matching the M1 reporting schema, with the per-tenant retention/deletion procedure carried forward; dashboard reads live data.
4. **Pod identities for lit pods only (S per pod):** POD-MISSION + IDENTITY filled at lighting time, never in bulk.
5. **Routing + escalation live (M):** the orchestrator's invoke path and escalation chains carrying real traffic with trace IDs. Every escalation carries a timeout whose default is **hold-and-notify** — a 2am lead waits for a human; nothing auto-sends because the one person in the chain was asleep.
6. **Morning-command console v1 + weekly digest (M/L):** one Telegram command fans out to lit pod leads and returns a synthesized brief; H3 weekly meeting on the plan's ~$1–3/week budget, CVO-signed.

**Exit criteria:** a morning command reaches every lit pod and comes back with real KPIs; exceptions escalate to the CVO and hold safely on timeout; nothing polls; the first write classes have graduated from HITL to sampled review under the Section 5 rule; a bad deploy anywhere still reverts in under ten minutes.
**What REGGIE can newly do:** let the CVO manage several businesses by command and exception instead of by session.

### M4 — The full universe *(entry gate: 3+ businesses profitable; waves 4–6 funded per the waterfall; single-box hosting formally retired or re-accepted in writing — twelve revenue loops on one VPS is a decision, not a default)*

**Builds**
1. **Marketplace OAuth app in production (L):** platform webhooks replace per-tenant hand-built workflow webhooks — the maintenance cliff at 12 businesses disappears.
2. **Governed browser-automation lane (L):** the UI-only residue (funnel builds, A2P, snapshot refresh, reputation) handled through one approval-gated lane instead of ad-hoc CVO labor.
3. **Portfolio reporting + auto stop-loss (M):** cross-tenant margin rollups, per-business kill/scale flags surfaced, not computed by hand.
4. **Model-tier cost migration where it pays (M/L):** haiku-tier volume moved to local/right-sized models once a hardware decision is made; opus stays on the 7 executive lanes.
5. **Autonomous weekly rhythm (M):** All-Pods meeting, teaching loop, registry-as-law reconciliation jobs — the reconciliations are deterministic scripts on systemd timers, same rule as every rollup; the only model-call schedule remains the digest.

**Exit criteria:** ~12 businesses operating on morning commands and a weekly rhythm; every API-operable GHL surface operated; UI-only residue routed through one governed lane; kill-switch and rollback bars holding at portfolio scale.
**What REGGIE can newly do:** the title of this document.

---

## 5. Doctrine guardrails

The doctrine — wake-on-event, dark-until-lit, hard gates, DRY_RUN-first — was bought with real money (the March 2026 Telegram 401 storm; the ~$150/mo idle heartbeat). Every stage above is designed to keep passing the same four tests: **no standing poll, no unverified channel token, no ungated write, no unstoppable send.**

- **Wake-on-event, at every stage.** Nothing new in M0–M4 polls. The orchestrator (M3) is HTTP-invoked Inngest functions — idle cost $0. The only standing **model-call** schedule ever added is the weekly digest, individually CVO-signed. Deterministic rollups (M0's R6, M1's derived reporting, M4's reconciliations) are plain node scripts on systemd timers on the VPS — never openclaw cron, which two scars rule out: a single bad provider endpoint silently aborts every openclaw cron platform-wide, and the local Windows gateway has fired duplicates. The health-check cron remains a curl, not a model call.
- **Dark-until-lit, enforced by sequencing.** Agents get identity, tokens, and envelopes only when their business lights (M3 build 4). The ~100 shells cost $0 today and continue to until a wave funds them. Nothing in this roadmap fills the fleet in bulk.
- **Hard gates, inherited not reinvented.** Every new skill copies the poster pattern: DRY_RUN default-true → draft-status → scheduled; HITL approval on writes; tenant guards that fail closed (M1 kills the silent TJB fallback); STOP-suppression and the M0 kill switch sitting upstream of all of it. New tenants soak in DRY_RUN before flipping (M2 runbook step), and every stage inherits the M0 rollback bar — any bad change reverts in under ten minutes, with the kill switch buying the calm to do it.
- **Approval throughput is modeled, because it is one person.** HITL-on-write makes the CVO's hours the system's true rate limit, so the doctrine gains two rules now rather than at M3 under pressure. *Graduation:* a write class moves from HITL to sampled review (1-in-10) only after 50 consecutive approved sends with zero corrections, and any correction resets the counter. *Timeout:* an unanswered approval holds-and-notifies — the safe failure is silence toward the lead, never an unreviewed send. The cost table carries a CVO-hours column for the same reason it carries dollars.
- **Financial gates govern the roadmap itself.** M2 does not begin until GROWTH-MACHINE's operative criterion holds: ~1 sale/wk sustained across a trailing 30 days — ≈$1,800/mo margin at $422/sale, covering Agency Pro ~3.6× with the new standing cost at ~27% of margin. (The tempting "covers-it-twice" shorthand of ~$1,000/mo fires at ~0.55 sales/wk — roughly 45% earlier — and lets the $497 eat half the margin the waterfall depends on. If that looser trade is ever wanted, amend GROWTH-MACHINE first so the two documents agree — "scope map is law" cuts both ways.) The GROWTH-MACHINE $500/0-sales cumulative stop-loss governs the traffic that feeds every gate.

**Cost model per stage**

| Stage | New standing cost | Variable cost | CVO hours (the real rate limit) | Why it stays event-driven |
|---|---|---|---|---|
| M0 | ~$0 (free pinger; encrypted backup storage pennies) | none | one quiet window, the F2 build, one restore drill — mostly one-time (~half a day total) | all builds are one-shot code sessions |
| M1 | ~$0 | reply-loop tokens scale with lead volume — cost arrives only attached to revenue events; the nightly rollup is deterministic code, no model call | ~1–2 hrs/wk approving a one-tenant loop | rollup is a systemd-timed script, not an agent |
| M2 | **+$497/mo Agency Pro** (paid by the gate that opens it) | provisioning runs are one-shot events | the spike: ~a week of UI labor per archetype snapshot (once each) + runbook sign-offs | the runbook fires on a CVO command, never on a timer |
| M3 | digest ~$1–3/wk (≤ ~$12/mo); Supabase within free/low tier | morning-command fan-outs are on-demand; per-pod monthly envelopes with hard caps | ~3–5 hrs/wk approvals + digest review, thinning as write classes graduate; timeouts hold-and-notify so 2am needs no one | orchestrator functions are invoked, not resident; the "always-on hierarchy" is actually always-*available*, billing $0 between events |
| M4 | browser lane per-action, behind the approval queue (the most expensive lane per unit, so it is the most gated) | model remap trades Anthropic spend for local compute where quality holds | bounded by the approval queue; graduation + sampling keep it flat as tenants multiply | platform webhooks push; nothing polls twelve tenants |

---

## 6. Do-first list — start this month

| # | Item | Owner | Why it compounds |
|---|---|---|---|
| 1 | **VPS reconcile to git** (M0-1) | REGGIE-code, with CVO holding a quiet window | Every later build ships through git or doesn't ship — and rollback becomes a <10-minute capability instead of a wish. Also settles the "does production dedupe events?" class of unknowns that currently taints every audit. |
| 2 | **Off-box monitor + encrypted backups + one rehearsed restore** of `/etc/openclaw/.env` and the runtime tree (M0-2) | CVO (10-minute pinger signup) + REGGIE-code (backup script, restore drill) | The live loop is the only revenue asset; today its failure is silent, its secrets exist in one file on one box, and no restore has ever been proven. Near-zero cost, permanent insurance — once the drill has actually run. |
| 3 | **Kill switch + compliance floor** (M0-7/8) | REGGIE-code (kill flag, STOP suppression) + CVO (verify Meta disclosure) | The engine messages real leads today with no one-command stop and no opt-out path — both are single-session builds now and incident retrofits later. A Meta policy strike would also take down the same Page every R5 dollar points at. |
| 4 | **R5 traffic on + R6 measurement wired** (M0-3) | CVO (ad spend, ladder budget) + REGGIE-code (rollup) | Starts the clock on every cashflow gate in this roadmap. Nothing downstream of M0 moves without true sales numbers, and the ladder's kill/scale rules are blind until this exists. |
| 5 | **Credential hygiene:** RR token groups, finish R4 rotation, disarm the legacy TJB lane (M0-4/5) | REGGIE-code (+ CVO minting PITs in the GHL UI) | Closes the two riskiest latent paths — a live tenant outside governance, and an undisciplined lane one fresh PIT away from going hot with 2025 prompts. Puts a 401 alert on every tenant token so the next dead PIT is a page, not an archaeology find. Makes M1's enforcer work a config change instead of a rescue. |
| 6 | **Flip the social poster** after page-targeting verification (M0-6) | CVO (verify RTL page, flip flags) + REGGIE-code (targeting assertion) | 43 posts and the hosting already exist; distribution feeds the same live loop at zero marginal build cost — the cheapest possible push toward the first sale that gates everything else. |

---

*Bottom line: the API layer earned an A- before a single dollar arrived, and one loop proves the whole operating pattern. The roadmap is not "build more" — it is close the gap between wrapped and live, one cashflow gate at a time, without ever violating the doctrine that keeps this affordable to run while it's small.*