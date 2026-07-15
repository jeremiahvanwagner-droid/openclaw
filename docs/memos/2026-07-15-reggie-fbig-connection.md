# MEMO → REGGIE — 2026-07-15
## Subject: GHL → Facebook (Ready-to-Launch My Business) is connected. Here's exactly what you may do.

REGGIE — a status update and standing orders for the RTL Facebook Page. Read this against
your operating prompt (`prompts/rtl-fb-page-operator.md`).

### What changed
The **Ready-to-Launch My Business Facebook Page** — and now a linked **Instagram Business
account** — are connected to the **Royal Results (RR)** GHL sub-account, for both
**Conversations** (messaging) and **Social Planner** (posting).

### What that does — and does NOT — authorize you to do
**Connection is not capability.** As of this memo, you may **not** autonomously act on FB/IG.
Hold to this until the CVO lifts each gate:

- **Messenger DMs — STAGED, NOT LIVE.** The channel-aware engine (F1) is committed but **not
  deployed to `/opt/openclaw`**, and the FB inbound workflow is **DRAFT**. FB messages are not
  being routed to you yet. Do not attempt to send an FB reply. When the CVO completes F3
  (deploy + publish + `DRY_RUN` lift), you will reply **on Facebook** via the engine —
  **DRY_RUN-first**, HITL on sends, refunds/anger/legal escalated before you reply.
- **Posts — STAGED, NOT LIVE.** The `rtl-social-poster` skill can map the 60-day plan to GHL
  Social Planner, but it is gated (`RTL_SOCIAL_DRY_RUN=true`, no media base). **Preview only.**
  Do not publish or schedule live until the CVO completes F5.
- **Comments — NOT AVAILABLE.** There is no comment read/reply path built. Do not claim or
  attempt comment actions. This is future work (F6).

### Standing orders (in effect now)
1. Treat every rail above as **dark-until-lit**: where asked to act on FB/IG, **stage in
   DRY_RUN and surface the gate** with the exact next step — never force it.
2. Keep tenants clean: this Page = **RR**; the RTL **ads run in Truth J Blue's ad account**
   (*The Movement 2021*), not RR; IBM/TJB stay separate.
3. Alerts → Telegram (`@truthjblue_bot` → CVO): failed sends, escalations, gate-blocks, loud
   with the reason.
4. When the CVO checks in, report per your operating prompt — and name any rail still dark.

### One thing for the CVO's attention (surface it)
The live ad campaign in the TJB ad account is **not attached to the RTL Page/IG identity**, so
paid engagement isn't building the socials. Flag this whenever page-growth or retargeting comes up.

— End memo. Full state: `docs/phases/rtl-fbig-audit-2026-07-15.md`.
