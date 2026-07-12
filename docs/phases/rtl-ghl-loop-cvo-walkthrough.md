# RTL × GHL — CVO Walkthrough (Your Part)
_Everything between here and first revenue that requires your hands. ~65 min total. Execute in order — Part 3 depends on 1 and 2. Written 2026-07-11; machine state as of audits 2026-07-11-001…-006._

**Where things stand:** fields/tags/calendar/pipeline are live in Royal Results; the webhook service is running on the VPS in DRY_RUN; ingestion code is on a branch. REGGIE cannot message a human until you flip the gate at the end of Part 3.

---

## PART 1 — GHL UI in Royal Results (~35 min)

### 1A · Protect the client's automations (3 filters, ~3 min) — DO THIS FIRST
An RTL Launch Consult booking currently fires the client's appointment automations. For each of these three **published** workflows: open it → click the **trigger card** → **Add filters** → field **In Calendar** → operator **is any of** → select **all 9 client calendars** (everything EXCEPT `Launch Consult (15 min)`) → **Save trigger**.

- [ ] `Review Request Workflow`
- [ ] `Post-Appointment Follow-Up`
- [ ] `Appointment Confirmation & Reminder`

The 9 client calendars: Event Planning Consultation · Automotive Consultation · Workshop/Event Registration · Counseling Follow-Up · Counseling Discovery Call · Group Mentorship · Digital Marketing Strategy · Mentorship Strategy Session · Mentorship Check-In.

*(The other 3 published workflows need nothing — Form Submitted / `new-lead` / `cold-lead` triggers can't fire on RTL leads.)*

### 1B · Build the 5 RTL workflows as DRAFTS (~30 min)
Automation → Create Workflow → Start from Scratch. Name it, build trigger + steps, **Save — do NOT publish** (Part 3 governs publishing).

**Webhook action used in every workflow** (Custom Webhook):
- Method `POST` · URL `https://webhook.truthjblue.dev/webhook/ghl`
- Header: `Authorization` = `Bearer <token>` — fetch the token into your own terminal (never store it in GHL notes/docs):
```powershell
ssh root@srv1619751.hstgr.cloud "grep '^OPENCLAW_GATEWAY_AUTH_TOKEN=' /etc/openclaw/.env | cut -d= -f2-"
```
- Custom data key/values (the server accepts these top-level or customData-nested — both verified):

| Key | Value |
|---|---|
| `type` | literal, per workflow below |
| `locationId` | `0PFDiGrgne4sbE4dJEC6` |
| `contactId` | `{{contact.id}}` |
| `first_name` | `{{contact.first_name}}` |
| `email` | `{{contact.email}}` |
| `phone` | `{{contact.phone}}` |
| `message` | `{{message.body}}` — **C5 only** |

---

#### ☐ C1 · `RTL — Instant Touch`  (`type: rtl.optin`)
**Triggers (2):** Contact Tag Added = `rtl-starter-guide` · Contact Tag Added = `rtl-landing`
**Steps:** If/Else on "phone is not empty":

*SMS branch (phone exists):*
```
{{contact.first_name}}, your Ready-to-Launch Starter Guide just landed in your inbox (check spam if it's hiding). What's the business you keep almost launching? Reply here — a real answer gets a real plan. Reply STOP to opt out.
```
*Email branch (no phone) — subject `Your Starter Guide — plus one question`:*
```
Your free Ready-to-Launch Starter Guide is in your inbox (search "Ready-to-Launch" if it's hiding).

One question while it's fresh: what's the business you keep almost launching? Hit reply and tell me the niche — I'll tell you exactly what the package would build for it.

If the build list is the wall, that's the thing we remove: course, eBook with a designed cover, five emails, a deployable site, and a launch plan. Five deliverables, $497 once, delivered same day — most orders within the hour.
```
Then both branches → **Custom Webhook** (`type: rtl.optin`).
**SMS prerequisites before this ever publishes:** A2P 10DLC registered on the Royal Results number · quiet hours ON (9:00–20:00 contact time) · STOP handling verified.

#### ☐ C2 · `RTL — Abandoned Checkout`  (`type: rtl.checkout_abandoned`)
**Trigger:** Opportunity stage changed → pipeline `RTL Launch Day`, stage `Checkout Sent`
**Steps:** Wait 1h → If/Else "stage is still Checkout Sent" →
*Email 1 — subject `Your package is still here`:*
```
Your Ready-to-Launch checkout is open where you left it.

One form in — course, eBook with a real designed cover, five sales emails, a website ready to deploy, and a launch plan out. All wearing one brand, because a machine checked that they match.

$497 once, delivered same day — most orders within the hour.

Finish checkout: {{payment link}}
```
→ Wait 23h → same stage check → *Email 2 — subject `The "will it sound like AI?" question`:*
```
Fair worry — you've tried the free tools.

Our engine rejects copy that reads like everyone else's. The word "game-changer" literally gets stamped REJECTED before anything ships. Covers get measured for legibility. The site passes an accessibility audit.

And you get three rounds of website copy revisions, so the words end up yours.

Finish checkout: {{payment link}}
```
→ **Custom Webhook** (`type: rtl.checkout_abandoned`).
*(Use the live Stripe Payment Link for `{{payment link}}` — `/checkout-link` on the API returns the current one.)*

#### ☐ C3 · `RTL — Testimonial Ask`  (`type: rtl.testimonial_asked`)
**Trigger:** Opportunity stage changed → `Delivered`
**Steps:** Wait 48h → *Email — subject `One small favor`:*
```
You've had the package for two days.

If it did what we said it would, a screenshot of your favorite piece plus two honest sentences would mean a lot — real proof from real builds is the only kind we use.

Just reply to this email with it.

If something's off instead, reply and tell me — that's what the revision rounds are for.
```
→ Move opportunity stage → `Testimonial Asked` → **Custom Webhook** (`type: rtl.testimonial_asked`).

#### ☐ C4 · `RTL — Day-7 Re-engage`  (`type: rtl.dormant7`)
**Trigger:** Contact Tag Added = `rtl-starter-guide`
**Steps:** Wait 7 days → If/Else "has tag `rtl-customer`" → YES: End. NO: *Email — subject `Still almost launching?`:*
```
A week ago you grabbed the Starter Guide.

If the build list is still the wall — course, eBook, emails, site, plan — those are exactly the five things the package builds from one form you can fill in ten minutes.

$497 once, delivered same day — most orders within the hour.

Start your build: https://readytolaunchmybusiness.com/pricing
```
→ **Custom Webhook** (`type: rtl.dormant7`).

#### ☐ C5 · `RTL — Reply Router`  (`type: rtl.inbound_message`) — REGGIE's inbound ear
**Trigger:** Customer Replied · filter: Tag includes `rtl-starter-guide` (add OR-triggers for `rtl-landing` and `rtl-customer`)
**Steps:** just the **Custom Webhook** (`type: rtl.inbound_message`, include the `message` = `{{message.body}}` key). No other actions — REGGIE handles the conversation.

---

## PART 2 — Merge + deploy ingestion — ✅ COMPLETE 2026-07-11 (audit 2026-07-11-007)
> Executed with corrections. Original draft had three errors, all fixed live: the deploy directory is **`/root/ready-to-launch-my-business`** (NOT `/root/mvp-generation-engine` — that was a v2 relic with a dead-remote clone, now retired via `compose down`); prod services are **`backend worker`** (no `frontend`); Caddy `api-mvp` now proxies **127.0.0.1:8001** (v3's port). Verified: `POST /lead-magnet` → `{"ok":true,"emailed":true,"crm":true}`; GHL shows tag + `RTL Launch Day → New Lead` + utm_source=test.
>
> **Canonical redeploy command from now on:**
> ```bash
> ssh root@srv1619751.hstgr.cloud
> cd /root/ready-to-launch-my-business && git pull && docker compose -f docker-compose.prod.yml up -d --build backend worker
> ```

<details><summary>Original (superseded) steps — kept for the record</summary>

- [ ] **Merge** (or PR first if you want the diff view):
```powershell
cd C:\Users\JeremiahVanWagner\rtl-biz-pkg-mvp-v3
git checkout main; git pull; git merge feature/ghl-ingestion; git push origin main
```
- [ ] **Env + rebuild on the VPS** (paste the PIT from GHL — same one you gave me, `pit-828c…`):
```bash
ssh root@srv1619751.hstgr.cloud
cd /root/mvp-generation-engine
cp .env .env.bak-ghl-$(date +%Y%m%dT%H%M)
nano .env    # add the two lines:
             # GHL_PRIVATE_INTEGRATION_TOKEN_RR=pit-…
             # GHL_LOCATION_ID_RR=0PFDiGrgne4sbE4dJEC6
git pull
docker compose -f docker-compose.prod.yml up -d --build backend worker frontend
```
- [ ] **Verify capture end-to-end** (your own email):
```bash
curl -s -X POST https://api-mvp.truthjblue.dev/lead-magnet -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","name":"Dry Run","phone":"+1YOURCELL","utm_source":"test"}'
```
Expect `{"ok":true,"emailed":true,"crm":true}` — then confirm in GHL: contact exists · tag `rtl-starter-guide` · `RTL Launch Day → New Lead` · UTM Source = test.
⚠️ Note: once deployed, the landing page captures **real** leads into the CRM (that's the point) — but nothing messages them until workflows publish.

</details>

## PART 3 — DRY_RUN rehearsal (~15 min, with me)
1. Publish **C1 + C5 only** (the lead-magnet segment). GHL's static touches in C1 go live for real opt-ins — the copy is compliant and that's the funnel working. **REGGIE's replies stay locked server-side** (DRY_RUN=true).
2. Opt in on the live site with your own email + cell → you should receive the C1 touch within a minute.
3. Reply to it with something a real lead would say ("what do I actually get for $497?") → C5 fires → REGGIE drafts (never sends) into the transcript.
4. Read the transcript:
```powershell
ssh root@srv1619751.hstgr.cloud "cat /opt/openclaw/logs/rtl/rtl-transcript-$(date +%F).jsonl"
```
5. Also send a poison test ("I want a refund") → confirm you get the escalation alert and REGGIE does **not** draft a reply.
6. **Sign-off checklist** — approve only if every draft: sounds like a builder (calm, specific, zero hype) · quotes the same-day promise exactly · makes no income claims, invents no proof · uses no banned phrases · pushes to checkout, not to a call.
7. **Tell me "transcripts approved"** → my side: Telegram `getMe` verification, the `ghl_write` HITL allowlist decision with you, then `DRY_RUN=false` (backup + audit entry) — lead-magnet segment first, widen after.

## PART 4 — Parking lot (not blocking)
- Rotate the RR PIT after go-live (it transited chat; GHL gives a 7-day dual-token grace) — then update both `.env`s on the VPS + workstation.
- Stale TJB token on the VPS (401) — rotate whenever.
- Publish C2/C3/C4 after the first week of clean C1/C5 operation.
- Phase D measurement (response-time, recovery rate, $/conversation) starts when live traffic exists — I build that when you say go.
