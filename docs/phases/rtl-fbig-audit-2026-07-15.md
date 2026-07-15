# RTL × FB/IG — Full Status Audit (2026-07-15)

> Purpose: one honest source of truth so the CVO can direct accurately.
> **Headline: the GHL connections are done, but REGGIE cannot yet read or write
> Comments, Messenger, or Posts live.** Connection ≠ capability — code must be
> deployed and gates lifted, and "Comments" is not built at all.

## Capability truth table — REGGIE ↔ the RTL Facebook Page

| Capability | GHL connected | REGGIE code | Deployed to VPS | Trigger/route | Gate lifted | **LIVE?** |
|---|---|---|---|---|---|---|
| **Messenger DMs** (read + reply) | ✅ FB | ✅ F1 (`0713e15`) | ✅ **deployed (surgical swap 07-15)** | ✅ **PUBLISHED** | ✅ `DRY_RUN=false` | **✅ LIVE (2026-07-15)** |
| **Posts** (publish/schedule) | ✅ Social Planner (user says done) | ✅ F4 (`5c15733`) poster | ❌ **not deployed** | n/a | ❌ `RTL_SOCIAL_DRY_RUN` true · no media-base · status `draft` | **❌ NO** |
| **Comments** (read + reply) | connection exists | ❌ **not built** | — | ❌ no comment path | — | **❌ NO (net-new)** |

**Bottom line:** **Messenger is LIVE** — a real test DM routed as `channel:FB` and REGGIE
replied on Messenger end-to-end (2026-07-15). The live legs are now **email + FB Messenger**.
Posts and Comments remain staged/unbuilt.

> ⚠️ **Open risk (Step 0):** the FB workflow fires on **any** FB DM to RR (no page filter). Confirm
> the RTL page is the **only** FB page connected to Royal Results, or REGGIE will also answer a
> client's DMs. Not yet confirmed.
> ⚠️ **Verify `DRY_RUN=false`** on the box — if a dry-run test flipped it to `true`, the live email
> loop is stuck draft-only until flipped back.

## Phase status (from `rtl-ghl-fbig-connect.md`)

| Phase | State |
|---|---|
| F0 connect FB→RR (Conversations) | ✅ done (FB) · IG now set up + connected (user, 2026-07-15) |
| **F1** channel-aware engine | ✅ committed+pushed + **deployed to `/opt/openclaw` (surgical single-file swap 07-15)** |
| **F2** FB inbound workflow | ✅ built + **PUBLISHED**, `channel:FB` stamped |
| **F3** conversations go-live | ✅ **DONE 2026-07-15** — F1 deployed, webhook restarted clean (pid 724956), F2 published, real DM → REGGIE replied on Messenger end-to-end |
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
- 🆕 **FB Messenger reply loop** — REGGIE answers FB DMs live via RR (F3 done 2026-07-15).
- The **FB Page** — rebranded, branded assets, first posts published + pinned (CVO, 2026-07-15).
- **IG account** — created, professional, linked to the Page, connected to RR GHL.
- **Hosted post media** at `/social/`.
- The **paid campaign** (TJB ad account) — but unattached to the socials.

## ⚠️ VPS deploy reality (tech-debt)
`/opt/openclaw` is a **hand-deployment**: git HEAD is stale at `a708285` (Jul 4), while the live
RTL loop is untracked/modified files edited directly on the box (`rtl-lead-engine.mjs` untracked,
`ghl-webhook-handler.mjs`/`ghl-tenant-resolver.mjs`/`safe-exec.mjs` modified, `agents/*/models.json`
= Ollama remap). **A `git pull` would abort/clobber** — so F1 was deployed by a **surgical single-file
swap** (`git show origin/main:…rtl-lead-engine.mjs` → file, backup `…bak-preF1-*`, restart). Future
`/opt/openclaw` deploys must use the same surgical pattern until the box is properly reconciled to `main`.

## Make-it-live checklist (the real remaining work, in order)
1. ~~**F3 — Messenger live**~~ ✅ **DONE 2026-07-15.** Remaining: confirm the RTL page is the
   only FB page on RR (Step 0), and verify `DRY_RUN=false` on the box.
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
**F3 (Messenger) ✅ done.** Next, one lane at a time: close Step 0 → **F5 (Posts)** → verify →
then IG parity, ad identity, and finally F6 (Comments) as a fresh build. REGGIE now has one of
its three FB capabilities live (Messenger); it does not yet have Posts or Comments.
