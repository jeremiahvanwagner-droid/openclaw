# RTL × FB/IG — Full Status Audit (2026-07-15)

> Purpose: one honest source of truth so the CVO can direct accurately.
> **Headline: the GHL connections are done, but REGGIE cannot yet read or write
> Comments, Messenger, or Posts live.** Connection ≠ capability — code must be
> deployed and gates lifted, and "Comments" is not built at all.

## Capability truth table — REGGIE ↔ the RTL Facebook Page

| Capability | GHL connected | REGGIE code | Deployed to VPS | Trigger/route | Gate lifted | **LIVE?** |
|---|---|---|---|---|---|---|
| **Messenger DMs** (read + reply) | ✅ FB (user) | ✅ F1 (`0713e15`) channel-aware | ❌ **not deployed** | ⚠️ `RTL — Reply Router · Facebook` = **DRAFT** | ❌ `DRY_RUN` default true | **❌ NO** |
| **Posts** (publish/schedule) | ✅ Social Planner (user says done) | ✅ F4 (`5c15733`) poster | ❌ **not deployed** | n/a | ❌ `RTL_SOCIAL_DRY_RUN` true · no media-base · status `draft` | **❌ NO** |
| **Comments** (read + reply) | connection exists | ❌ **not built** | — | ❌ no comment path | — | **❌ NO (net-new)** |

**Bottom line:** nothing on FB is autonomous yet. The email reply loop (separate,
`RTL — Reply Router`, republished) is the only REGGIE↔GHL leg actually live.

## Phase status (from `rtl-ghl-fbig-connect.md`)

| Phase | State |
|---|---|
| F0 connect FB→RR (Conversations) | ✅ done (FB) · IG now set up + connected (user, 2026-07-15) |
| **F1** channel-aware engine | ✅ committed+pushed — **but not deployed to `/opt/openclaw`** |
| **F2** FB inbound workflow | ⚠️ built **DRAFT**, `channel:FB` stamped — not published |
| **F3** conversations go-live | ⛔ not started — needs: deploy F1 → restart webhook → publish F2 → test DM in DRY_RUN → lift `DRY_RUN=false` |
| **F4** posting engine | ✅ committed+pushed — not deployed |
| **F4b** hosted media | ✅ live + verified at `readytolaunchmybusiness.com/social/` |
| **F5** posting go-live | ⛔ needs: confirm RR PIT has `socialplanner/post.write` · set `RTL_SOCIAL_MEDIA_BASE` · dry-run `schedulePlan` · flip `RTL_SOCIAL_DRY_RUN=false` |
| **F6** comments (NEW, unbuilt) | ⛔ GHL FB/IG comment trigger → REGGIE reply path does not exist |

## The ad (flagged by CVO: "running somewhere, unattached to any of the socials")

- The **RTL Launch 30d** campaign runs in **Truth J Blue's ad account "The Movement
  2021"** (`129794992497735`), ~$7/day, live since ~2026-07-14 (Pixel `3ec53da` + CAPI
  `9ee0c87` deployed). It sends traffic to `readytolaunchmybusiness.com`.
- **Problem:** the ad's **Page/Instagram identity is not the RTL socials** — so paid
  engagement (comments, reactions, profile taps) does **not** accrue to the Ready-to-Launch
  My Business Page or its new IG. Social proof and retargeting audiences leak.
- **Action (CVO, Ads Manager):** set the ad set's **Facebook Page** = *Ready-to-Launch My
  Business* and **Instagram account** = the new IG, as the ad identity. Editing identity
  resets learning — do it as a deliberate relaunch, not mid-flight tweak.

## What is actually LIVE right now
- RTL **sales page** ($497) + **Meta Pixel** + **server-side CAPI Purchase** (Stripe webhook).
- RTL **email reply loop** (REGGIE drafts/sends email replies via RR — the original loop).
- The **FB Page** — rebranded, branded assets, first posts published + pinned (CVO, 2026-07-15).
- **IG account** — created, professional, linked to the Page, connected to RR GHL.
- **Hosted post media** at `/social/`.
- The **paid campaign** (TJB ad account) — but unattached to the socials.

## Make-it-live checklist (the real remaining work, in order)
1. **F3 — Messenger live:** SSH deploy F1 to `/opt/openclaw` (`git pull` + restart
   `openclaw-webhook`) → publish `RTL — Reply Router · Facebook` → test-DM the Page →
   confirm `reggie-draft channel:FB` in the transcript → lift `DRY_RUN=false`.
2. **F5 — Posts live:** confirm RR PIT `socialplanner/post.write` → set
   `RTL_SOCIAL_MEDIA_BASE=https://readytolaunchmybusiness.com/social` → dry-run
   `schedulePlan` (resolves the real FB account id) → `RTL_SOCIAL_DRY_RUN=false`
   (keep `status=draft` for first review, then `scheduled`).
3. **IG parity:** clone F2 workflow with `Reply channel=Instagram` + `channel:IG`;
   add the IG account id to the poster; adapt captions (IG allows more hashtags).
4. **Ad identity:** attach the RTL Page + IG to the ad set.
5. **F6 — Comments (new build):** GHL FB/IG comment trigger → webhook → a REGGIE
   comment-reply path (net-new; scope after DMs+Posts are proven).

## Recommended direction
Turn on **one lane at a time, DRY_RUN-first**: F3 (Messenger) → verify → F5 (Posts) →
verify → then IG parity, ad identity, and finally F6 (Comments) as a fresh build.
Don't dispatch REGGIE to "run the page" as if all three capabilities exist — it has
none of them live yet.
