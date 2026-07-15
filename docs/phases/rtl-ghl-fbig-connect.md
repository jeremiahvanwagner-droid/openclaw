# Connect REGGIE to Facebook & Instagram — Phase Plan (F0–F5)

> Objective: REGGIE **runs the Ready-to-Launch My Business Page** on Facebook + Instagram —
> both **inbound conversations** (Messenger + IG DMs/comments) and **outbound posting**
> (the 60-day content calendar) — through the **Royal Results (RR)** GoHighLevel sub-account.
> Doctrine: Supabase-first map · **DRY_RUN-first** · hard gates · one phase at a time ·
> RR is a LIVE client CRM → everything RTL stays namespaced `rtl-*`, no edits to client objects.

## Architecture (why GHL is the bridge)

openclaw has **no native Meta channel** — only Telegram. So Facebook + Instagram reach
REGGIE the same way the live RTL email loop does: **through GHL Conversations (RR tenant)**.

```
INBOUND   FB Messenger / IG DM ─▶ GHL Conversations (RR) ─▶ workflow Custom Webhook (Bearer)
          ─▶ openclaw-webhook ─▶ handleRtlEvent() ─▶ REGGIE (agent) ─▶ channel-aware send
          via POST /conversations/messages  (type: FB | IG)  ─▶ back to the user
OUTBOUND  REGGIE ─▶ GHL Social Planner  POST /social-media-posting/{loc}/posts (createPost)
          ─▶ scheduled/published to the FB Page + IG
```

Facts that shape the build:
- **PIT tokens cannot register GHL platform webhooks** → FB/IG inbound must be a **workflow
  Custom Webhook action** (Bearer auth), exactly like the live `rtl.inbound_message` wiring.
- **Meta 24-hour messaging window**: free-form replies to FB/IG only send within 24h of the
  user's last message. Outside it, GHL/Meta reject the send → the engine must fail LOUD and
  alert the operator (no silent drop).
- **RR PIT scopes**: Conversations send is already proven (`conversations/message.write`,
  the email loop). Posting additionally needs **`socialplanner/post.write`** (+
  `socialplanner/oauth.readonly`) on the RR Private Integration Token.

## Phase map

| Phase | What | Owner | Gate |
|---|---|---|---|
| **F0** | Connect FB Page + IG to RR (OAuth, both Conversations **and** Social Planner) | **You** (GHL/Meta UI) | OAuth is a consent action — only you can do it |
| **F1** | ✅ **DONE** — channel-aware sender + inbound-channel capture in `rtl-lead-engine.mjs` | REGGIE-code | Shipped DRY_RUN; email byte-identical; 265/265 tests |
| **F2** | GHL workflow: FB/IG inbound → Custom Webhook → REGGIE | **You** (GHL UI) | Stays **DRAFT** until F3 |
| **F3** | Conversations go-live | Gated | Transcript review · DRY_RUN lift (FB/IG only) · `ghl_write` HITL · real-DM test |
| **F4** | Posting: map the 43-post calendar → Social Planner `createPost` | REGGIE-code | Preview/DRY_RUN first; needs F0-B + socialplanner scope |
| **F5** | Posting go-live + measurement | Gated | Schedule the real 60-day calendar |

---

## F0 — Connection runbook (do this first)

### Prerequisites
- **P1 · Instagram must exist as a Professional account linked to the Page.** GHL can only
  connect an **Instagram Business/Creator** account that is **linked to the Ready-to-Launch My
  Business Facebook Page**. If there's no IG account yet: create one → switch to Professional →
  in Meta Business/Accounts Center, link it to the Page. *(No IG account has surfaced in the
  repo — confirm whether one exists; if not, this is the true first task.)*
- **P2 · Roles**: you are **Admin** of the FB Page + the Meta Business Portfolio, **and** Admin
  in the Royal Results GHL location.
- **P3 · Page published** (not the draft shell) — done in the rebrand.

### Connection A — Conversations (messaging INTO GHL)
1. Royal Results GHL → **Settings → Integrations** (a.k.a. "My Integrations").
2. **Facebook → Connect** → sign in with the FB account that admins the Page → **grant every
   requested permission** (declining messaging scopes silently breaks sync) → select
   **Ready-to-Launch My Business** → Save.
3. **Instagram → Connect** → select the linked IG professional account → Save.
4. Confirm Facebook + Instagram show **Connected** and are enabled for Conversations.

### Connection B — Social Planner (posting OUT of GHL)
> This is a **separate** OAuth from Conversations — GHL treats messaging vs. social posting
> as different connections.
1. Royal Results GHL → **Marketing → Social Planner** → first-run **Connect accounts** / Settings.
2. **Add Facebook** → select the Page. **Add Instagram** → select the IG professional account.
3. Confirm both appear as selectable posting destinations.

### RR PIT scope check (for posting)
- GHL → **Settings → Private Integrations** → the **RR** token → confirm scopes include
  **`socialplanner/post.write`** and **`socialplanner/oauth.readonly`**.
- If missing: add them / regenerate the PIT. **If the token value changes, that's a rotation** —
  re-paste into `/etc/openclaw/.env` as `GHL_PRIVATE_INTEGRATION_TOKEN_RR` and restart the
  services (follow the RTL rotation runbook; watch for the 40-char `pit-`+UUID double-paste trap).
- Conversations needs nothing new — `conversations/message.write` is already proven.

### Verify (prove the pipes — do NOT reply yet)
- **Inbound**: from a *different* personal account, DM the FB Page **and** the IG account. Within
  ~1 min each should appear in RR → **Conversations**. (REGGIE isn't wired yet — this just proves
  the connection. Don't reply manually in a way that trips an automation.)
- **Posting**: open the Social Planner composer and confirm the FB Page + IG are selectable
  (don't publish).

### Report back
Which connected cleanly · any permission errors · **whether an IG account had to be created** ·
whether the RR PIT already had the socialplanner scopes.

### Safety
RR is a live client CRM (6 pipelines, 6 workflows). Namespace all RTL objects (`rtl-*`), don't
touch existing client workflows, and keep any new workflow **DRAFT** until F3 sign-off.

---

## F1 — Channel-aware engine ✅ DONE

`skills/rtl-lead-engine.mjs` (DRY_RUN-safe; **email path byte-identical**):
- `resolveChannel(payload)` — reads a workflow `channel` field first, then GHL `messageType`;
  → `'FB' | 'IG' | 'Email'`; unknown/SMS/empty → `'Email'` (fail-safe, proven path).
- `buildReplyBody(contactId, text, channel)` — Email = original body (subject + HTML);
  FB/IG = `{ type, contactId, message }` plain text. Both exported + unit-tested.
- `handleRtlEvent` now threads `channel` through the agent brief (adds a "keep it a short DM"
  hint for FB/IG), the transcript (`channel` on every entry), the live send, and the failure
  alert (which flags the **24h window** as the likely cause on FB/IG).
- Tests: `skills/__tests__/rtl-lead-engine.test.ts` (7). Full suite **265/265 green**.
- **Not yet deployed to the VPS** — safe to deploy anytime (email-identical, DRY_RUN default);
  ships with the F2/F3 rollout.

## F2 — GHL inbound workflow (YOU · GHL UI · keep DRAFT)

Goal: when a lead DMs the Page/IG, GHL fires a Custom Webhook to REGGIE carrying the channel.
**Fastest path: duplicate the existing RTL inbound-message workflow** (the one that already
posts `rtl.inbound_message` for email) twice — once per channel:

1. Royal Results GHL → Automation → Workflows → duplicate the RTL inbound workflow → name it
   **"RTL Inbound — Facebook (DRAFT)"**.
2. **Trigger:** *Customer Replied* → filter **Reply Channel = Facebook** (add the trigger if the
   duplicate lost it). Repeat in a second copy with **Reply Channel = Instagram**.
3. **Action:** the existing **Custom Webhook** (POST, Bearer auth) to the same REGGIE endpoint the
   email workflow uses (`webhook.truthjblue.dev`, existing Authorization header). Add/confirm the
   payload fields:
   - `type` = `rtl.inbound_message`  *(reuse — keeps breadcrumbs + inbound handling)*
   - `channel` = `FB`  *(hardcode; `IG` in the Instagram copy — the engine reads this first)*
   - `locationId` = `{{location.id}}`  ·  `contactId` = `{{contact.id}}`  ·  `message` = `{{message.body}}`
4. **Leave both workflows DRAFT.** Do not publish until F3.

> Comments (FB/IG comment replies) are a *separate* GHL mechanism from Conversations DMs — out of
> scope for F2/F3, which cover DMs. Comment auto-reply is a clean follow-on once DMs are proven.

## F3 — Conversations go-live (gated)

1. Deploy F1 to the VPS (`/opt/openclaw`) + restart `openclaw-webhook`.
2. Publish the two F2 workflows.
3. With `DRY_RUN` still true, DM the Page + IG from a test account → confirm REGGIE **drafts** a
   channel-appropriate reply in the transcript (role `reggie-draft`, `channel: FB|IG`). Review voice.
4. Lift `DRY_RUN=false` for the RTL webhook service, keep the `ghl_write` HITL allowlist on.
5. Real-DM test end-to-end (within the 24h window) → verify delivery + `rtl-engaged`/stage breadcrumb.
