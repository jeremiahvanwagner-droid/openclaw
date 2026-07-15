# F2 — FB Inbound GHL Workflow (build sheet)

> Makes REGGIE hear Facebook Messenger DMs to the Ready-to-Launch My Business Page and
> reply on Facebook (not email). Companion to [rtl-ghl-fbig-connect.md](rtl-ghl-fbig-connect.md).
> **You build this in the Royal Results (RR) GHL UI** — the workflow builder is a cross-origin
> iframe I can't safely automate. Clone of the live **C5 "RTL — Reply Router"**
> ([rtl-ghl-loop-cvo-walkthrough.md §C5](rtl-ghl-loop-cvo-walkthrough.md)). **Everything stays
> DRAFT until F3.**

## How it connects to the code (already shipped, F1)
`resolveChannel()` in `skills/rtl-lead-engine.mjs` reads a **`channel`** key off the webhook
payload → `'FB' | 'IG' | 'Email'`. If a workflow doesn't send `channel`, it defaults to `Email`.
So the *only* new thing F2 adds vs. C5 is a hardcoded **`channel = FB`** and a **channel filter**.

## Reused wiring (identical to every RTL workflow)
- Custom Webhook · Method **POST** · URL **`https://webhook.truthjblue.dev/webhook/ghl`**
- Header **`Authorization` = `Bearer <token>`** — fetch into your own terminal, never store in GHL:
  ```powershell
  ssh root@srv1619751.hstgr.cloud "grep '^OPENCLAW_GATEWAY_AUTH_TOKEN=' /etc/openclaw/.env | cut -d= -f2-"
  ```
- Custom data keys (server accepts top-level or customData — both verified):

  | Key | Value |
  |---|---|
  | `type` | `rtl.inbound_message` |
  | `channel` | `FB`  ← **the new key** |
  | `locationId` | `0PFDiGrgne4sbE4dJEC6` |
  | `contactId` | `{{contact.id}}` |
  | `message` | `{{message.body}}` |
  | `first_name` / `email` / `phone` | `{{contact.first_name}}` / `{{contact.email}}` / `{{contact.phone}}` |

---

## ⚠️ Step 0 — Confirm scope before building (30 sec, prevents answering the client's DMs)
RR is a **live client CRM**. This workflow must only fire for the **Ready-to-Launch My Business**
Page. **Confirm the RTL page is the ONLY Facebook page connected to the RR location**
(Settings → Integrations → Facebook). 
- If **yes** (expected — RR's FB connection is the RTL page): a `Reply Channel = Facebook` filter is
  enough; all FB = RTL.
- If **the client's own FB page is also connected to RR**: stop — `Reply Channel` alone can't tell
  the pages apart. Ping me and we'll add page-scoping (e.g., an inbound tag step) before this goes live.

## Step 1 — Guard the existing C5 so it stays email-only (~1 min)
Open **`RTL — Reply Router`** (C5) → trigger card → **Add filter** → **Reply Channel** → **is** →
**Email** → Save. 
*Why:* C5 fires on "Customer Replied" for **any** channel today. Without this, an FB reply from a
tagged lead fires C5 (→ tries to send an **email** reply, wrong) **and** the new FB workflow
(→ FB reply, right) = double reply on the wrong channel. Narrowing C5 to Email is its intended scope.

## Step 2 — Build `RTL — Reply Router · Facebook` (DRAFT) (~5 min)
Automation → Create Workflow → Start from Scratch → name **`RTL — Reply Router · Facebook`**.
- **Trigger:** **Customer Replied** · filter **Reply Channel** = **Facebook**.
  - *No tag filter* — a DM to the dedicated RTL page **is** an RTL lead (cold DMers have no rtl-* tag
    yet, so a tag filter would wrongly exclude them). Scope comes from the page (Step 0).
- **Step (only one):** **Custom Webhook** with the wiring above (`type=rtl.inbound_message`,
  **`channel=FB`**, `locationId`, `contactId`, `message={{message.body}}`). No other actions —
  REGGIE handles the conversation.
- **Save — do NOT publish.**

## Step 3 — Instagram (later, when RTL connects IG)
Clone Step 2 → **`RTL — Reply Router · Instagram`** → Reply Channel = **Instagram** → **`channel=IG`**.
Nothing else changes; `resolveChannel` already maps `IG`.

---

## What happens at runtime (once F3 lifts DRY_RUN)
FB DM → C5-FB fires → webhook posts `{type: rtl.inbound_message, channel: FB, contactId, message}`
→ `handleRtlEvent` → `resolveChannel` = `FB` → REGGIE drafts a short DM → `sendLiveReply(..., 'FB')`
posts `type: FB` to `/conversations/messages` → reply lands in Messenger. Escalation
(refund/anger/legal) still short-circuits to a human alert before REGGIE; the reply also leaves the
`rtl-engaged` breadcrumb.

## Go-live is gated (F3)
Keep both C5 (now email-scoped) and C5-FB behavior verifiable in **DRY_RUN** first: deploy F1 to the
VPS, publish C5-FB, DM the page from a test account, and confirm REGGIE writes a `reggie-draft` with
`channel: FB` in `/opt/openclaw/logs/rtl/`. Only then lift `DRY_RUN=false`. Verify "Customer Replied"
actually fires on a **first-touch** DM (not only replies-to-outbound) during that test.
