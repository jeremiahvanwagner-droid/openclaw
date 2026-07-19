# F6 — Comments: spec & build plan
**Program:** RTL × FB/IG (REGGIE ↔ GHL Royal Results, loc `0PFDiGrgne4sbE4dJEC6`)
**Status:** SPEC — nothing built. All GHL work ships DRAFT until F6d gates pass.
**Date:** 2026-07-19

---

## 1. Architecture decision

**REGGIE cannot post comments. Full stop.** The GHL public REST API (Social Media Posting API, confirmed as of 2026-07) has post CRUD, accounts/OAuth, tags, and categories — **no comment read or write endpoint**, and comments are not on the published API roadmap. Our PIT token also cannot register platform webhooks, so the engine can neither see nor answer comments through the API. Any design where REGGIE writes a public comment directly is off the table until GHL ships an endpoint or we do a direct Graph API integration (we are not doing that — see §4).

What GHL *does* have is UI-built workflow automation for comments: triggers `Facebook Comment(s) On A Post` / `Instagram Comment(s) On A Post`, a public `Reply In Comments` action, and a comment-to-DM private reply action. Workflows are CVO's lane (build sheets, same as F2). So F6 is three tiers:

- **Tier 1 — GHL-native comment→DM (keyword posts).** For each keyword post (LAUNCH, LIST, REAL, VOICE, SPEC, SWAP), a GHL workflow catches the keyword comment, posts a short varied public ack, and sends **one** private reply carrying the Starter Guide link. No engine involvement. **This is the tier that fulfills the 60-day calendar's "Comment X and I'll send the guide" promises — which currently nothing fulfills.** It is also the durable fix for the 2026-07-19 incident (9 published posts pitching the guide with no link): the link now travels in the DM, where it belongs, and the engine's linkless-caption refusal stays in place as the backstop. (The 9 already-published incident posts need their own disposition — that is §2.3, not an afterthought.)
- **Tier 2 — DM continuation lands in the LIVE F3 loop. Zero new engine surface.** When the commenter replies to the private DM, that reply is an inbound Facebook Messenger message on RR. The existing workflow "RTL — Reply Router · Facebook" triggers on *Customer Replied / channel = Facebook Messenger* with **no tag filter** — so the comment-sourced conversation flows into `handleRtlEvent` exactly like any other DM: tenant guard, transcript, escalation screen, REGGIE reply via `/conversations/messages`. We build nothing here; we verify it in F6d.
- **Tier 3 — REGGIE as comment concierge (advisory only).** A second workflow lane forwards comment events to the existing webhook endpoint. The engine transcripts them, runs the escalation regex, and for substantive comments drafts a *suggested* public reply delivered to CVO via Telegram for manual paste in the GHL UI. REGGIE never sends a public reply — there is no API path, and we would not want unsupervised public writes anyway (HITL on writes doctrine). Tier 3 is dark-until-lit: it can ship after Tier 1/2 are live without blocking them.

**Lane isolation is a design requirement, not a nicety.** F3 Messenger is a LIVE revenue surface gated by the global `DRY_RUN` flag (currently `false`). The comment lane therefore gets its **own** flag, `RTL_COMMENTS_ENABLED` (default **false** — dark-until-lit), so it can be soaked, lit, or killed without ever touching F3. See §3 for the gating semantics and §5.0 for the full kill path. Doctrine: every new surface starts dark, and every surface has a documented way back to dark.

Volume today is low (organic page, 56 scheduled posts). This design costs near-zero at idle — wake-on-event, one webhook per comment, one agent call per non-trivial comment — and §3 adds a daily ceiling and per-contact dedupe so "near-zero at idle" cannot become "unbounded under a pile-on" (March retry-storm rule: storms of small calls are the failure mode, not single big ones).

---

## 2. F6a build sheet (CVO, GHL UI)

Same discipline as F2: build in RR sub-account only, everything named `rtl-*` / "RTL —", **save as DRAFT**, do not publish until I say F6d gates passed.

**Workflows to build: six keyword workflows + one concierge lane.** The comment trigger is scoped page-then-post, so one workflow per keyword post keeps the post identity unambiguous (post ID is *not* a documented merge field — we hardcode it per workflow, see step 6).

### 2.1 Workflow set A: "RTL — Comment Gate · \<KEYWORD\>" (×6: LAUNCH, LIST, REAL, VOICE, SPEC, SWAP)

1. **Trigger:** `Facebook Comment(s) On A Post` (Automations → Workflows → Triggers → Facebook/Instagram Events category).
   - Page: **Ready-to-Launch My Business** (the only FB page on RR — Step 0 already verified).
   - Post Type: **Published Post** → select the specific keyword post for this workflow. (Note: whether one trigger can watch ALL page posts is not clearly documented — assume post-scoped; verify in UI.)
   - Keyword filter: **Contains Phrase** = the keyword (people will type "LAUNCH!!" or "launch please" — Exact Match would drop those). Confirm the filter is case-insensitive when testing (verify in UI).
   - **Track First Level Comments Only: ON.** Nested reply threads should not re-fire the funnel.
2. **Action — `Reply In Comments`** (public ack). Load **6–8 varied templates** (max 10 supported, used randomly). Short, no link, no keyword-echo spam. Examples:
   - "Sent! Check your DMs 📬"
   - "On it — look for a message from us."
   - "Just messaged you the guide."
   - "Check your inbox — it's on the way."
   Enable the optional auto-like of the commenter's comment. **Do not use one static template**: FB spam detection hides identical replies posted in rapid succession and can restrict the Page's ability to comment — variation is the mitigation (operator-reported behavior, not published Meta thresholds; verify by watching visibility during F6d).
3. **Action — Facebook/Instagram Interactive Messenger, reply type "Reply to comment via DM"** (the private reply). Keep the default ~1-minute wait before send (human pacing). Message copy — must invite a reply, because only their reply opens the 24-hour window for F3 (see §4):
   > Hey {{contact.first_name}} — here's the free Starter Guide you asked for: https://readytolaunchmybusiness.com/?utm_source=facebook&utm_medium=organic&utm_campaign=launchday-leadmagnet&utm_content=comment-dm
   > Quick question so I can point you at the right section — what stage is your business at right now: idea, side-hustle, or already selling?
   Optionally add 1 website-link button to the same URL (3-button max; skip Call buttons — no actions run after them).
4. **Action — Add Tag:** `rtl-comment-lead`. (Also add the keyword-specific tag `rtl-comment-<keyword>` if tag creation is cheap — useful for per-post attribution; optional.)
5. **Action — Custom Webhook** (LC Premium action — metered/rebillable executions; volume is low, but note it on the RR bill):
   - Method POST, URL `https://webhook.truthjblue.dev/webhook/ghl`
   - Header: `Authorization: Bearer <OPENCLAW_GATEWAY_AUTH_TOKEN value>` — same as the F3 router webhook; copy the configuration from "RTL — Reply Router · Facebook" rather than retyping.
   - RAW JSON body:
     ```json
     {
       "type": "rtl.comment",
       "channel": "FB",
       "locationId": "0PFDiGrgne4sbE4dJEC6",
       "id": "{{contact.id}}",
       "message": "<comment body merge field>",
       "post": "<KEYWORD>-post",
       "keyword": "<KEYWORD>",
       "first_name": "{{contact.first_name}}"
     }
     ```
   - For the comment body: in the custom-value picker, look for ~"Facebook or Instagram Comment body" (that field is confirmed to exist for AI actions; its exact merge-tag key is undocumented — use the autocomplete picker, verify in UI). If it does not appear in the webhook picker, tell me — Tier 3 degrades but Tier 1 still works.
   - `post` is **hardcoded** per workflow (e.g. `"LAUNCH-post"`), since post ID/permalink is not a documented merge field (verify in UI whether a real post ref is selectable; if yes, use it).
6. **Save as DRAFT.** Name exactly: `RTL — Comment Gate · LAUNCH` etc.

### 2.2 Workflow B: "RTL — Comment Concierge · Facebook" (Tier 3, build after set A)

Same trigger, **no keyword filter**, scoped to the highest-traffic non-keyword posts (start with 3–5, and include the top 2–3 of the 2026-07-19 incident posts — see §2.3; the all-posts question from §2.1 step 1 applies — if the UI allows page-wide, use it and tell me).

- **Track First Level Comments Only: ON — mandatory, same as set A.** This is the primary loop guard: concierge replies that CVO pastes must never re-enter the funnel. Belt-and-suspenders on top of this: the engine drops Page-authored comment events (§3 step 1a), and CVO's standing rule is to paste concierge replies as **nested replies to the commenter, never as new top-level comments** (see §3 step 1a for why this rule exists even with the trigger setting ON).
- Single action: the same Custom Webhook, `"post"` hardcoded per selected post, no public reply, no DM, no tag. Because Workflow B has **no keyword filter and no GHL-side dedupe**, all volume/spam protection for this lane lives engine-side (§3: daily cap + per-contact dedupe) — do not publish B before those guards are deployed and smoke-tested (G0.5).
- **Scope overlap rule:** a post is in set A **or** in B, never both. Tier-1 public acks are posted by the Page itself; if a keyword post were also Concierge-scoped, the ack could fire B. Keeping the scopes disjoint plus the engine's Page-author drop (§3) closes that path from both ends.
- DRAFT until Tier 1 is live and stable.

### 2.3 Pre-existing comments & the 9 incident posts (backfill)

Two questions the trigger docs do not answer, so we answer them explicitly:

1. **Does the trigger fire retroactively?** GHL does not document whether `Facebook Comment(s) On A Post` processes comments that predate workflow publish. **Working assumption: new-comments-only after publish** — design and G1 verification proceed on that basis. **UI-verify item (G1):** before publishing `RTL — Comment Gate · LAUNCH`, leave one test comment on the post, then publish, and confirm whether that pre-publish comment is (a) ignored — assumption holds — or (b) processed — in which case tell me before publishing the other five, because retroactive firing on the older keyword posts would blast DMs at stale commenters and we would want the ~1-minute waits and scoping reviewed first.
2. **Who fulfills the people who already commented?** The F6 justification incident — 9 published posts pitching the guide with no link — has real commenters who asked for the guide and got nothing. Set A does not cover those posts, and even if the trigger fired retroactively, Meta's private-reply window is 7 days from the comment (§4), so most are already un-DM-able. Disposition, both parts:
   - **One-time manual sweep — owner: CVO, deadline: 2026-07-23.** CVO goes through the 9 incident posts in the GHL/FB UI and replies (nested, under each guide-requesting comment) with the Starter Guide link using `utm_content=comment-backfill` so backfill conversions are separable from the live funnel. Human-pasted and paced — no automation, no spam-pattern risk. Report the count of replies posted in that week's readout line.
   - **Forward coverage:** the top 2–3 highest-traffic incident posts join Workflow B's Concierge scope (§2.2), so *future* comments on them at least reach the engine and get a drafted reply. They do not get Comment Gate workflows — the keyword mechanic was never on those posts and we are not retrofitting it.

---

## 3. F6b engine changes (REGGIE-code, `skills/rtl-lead-engine.mjs`)

Small, additive, no new send paths.

- **`RTL_EVENT_TYPES`:** add `"rtl.comment"`.
- **Lane gating — two flags, distinct jobs.** The global `DRY_RUN` (line 32, one shared env var) gates the LIVE F3 loop and cannot be repurposed for this lane — flipping it would silently draft-only live Messenger revenue. So:

  | Flag | Scope | `false` / unset | `true` |
  |---|---|---|---|
  | `RTL_COMMENTS_ENABLED` | `rtl.comment` branch only | **Default. Soak/dark mode:** tenant guard + transcript + log only. No agent call, no Telegram, no caps consumed. | Full Tier-3 behavior (escalation screen, drafts, Telegram). |
  | `DRY_RUN` | Global, unchanged | Normal operation everywhere. | Existing global behavior; also forces the comment lane to soak mode regardless of `RTL_COMMENTS_ENABLED`. |

  `RTL_COMMENTS_ENABLED` is checked at the **top** of the `rtl.comment` branch, immediately after the tenant guard. It is the lane's soak switch (§5 G1/G2 run with it false), its independent kill switch (§5.0), and the reason F3 never has to notice this lane exists. Ship with **both** states verified: soak mode produces transcript lines and nothing else; enabled mode produces exactly the behavior below.
- **`handleRtlEvent` branch for `rtl.comment`:**
  1. RR tenant guard — identical to `rtl.inbound_message`.
  1a. **Page-author guard.** If the event's commenter is identifiable as the Page itself (Ready-to-Launch My Business), log and drop — the engine must never draft a reply to REGGIE's/CVO's own pasted words (that is the concierge feedback loop: CVO pastes a suggested reply → trigger fires on the Page's comment → new draft → paste → loop). **Verify in G3 whether the webhook payload identifies the comment author** (contact resolution for a Page comment is undocumented). If the payload *cannot* distinguish the Page's comments, the guard degrades to the operational rule already mandated in §2.2 — CVO pastes concierge replies **only as nested replies, never top-level** — and Track First Level Comments Only = ON makes nested replies invisible to the trigger. Document which mitigation is load-bearing in the G3 result.
  2. **Transcript:** append to the contact's JSONL with a distinct role, e.g. `{role: "fb_comment", post, keyword, text}`. When the same contact later arrives via F3, their comment context is already in the transcript — REGGIE knows why they're in the DM. (This step runs in soak mode too — the transcript is the soak evidence.)
  3. **Escalation screen:** reuse the existing regex (refund/anger/legal). On match → Telegram alert (`@truthjblue_bot`) flagged `ESCALATION (public comment)`, **no draft generated**. A hostile public comment gets a human, not a bot suggestion.
  4. **Trivial filter — before any agent call.** Emoji-only, ≤2 words, bare thanks, or a comment that already matched a Tier-1 keyword (GHL handled it; the webhook is just the record) → log and stop. This is the cheap-first gate; the honored `NO_REPLY` sentinel remains the agent-side backstop for comments that pass the filter but merit no reply.
  5. **Aggregate cost ceilings — between the trivial filter and the agent call.** Per-comment cost is bounded; these bound the *sum* (Workflow B has no keyword filter, so a semi-viral post, a ratio pile-on, or a looping spam bot is otherwise one agent call + one Telegram per comment, unbounded — exactly the March small-calls-storm shape):
     - **Daily cap: 20 agent calls per UTC day** on the `rtl.comment` lane (simple in-engine counter). At the cap: log-and-drop every further comment, and send **one** summary Telegram alert (`COMMENT LANE CAPPED: <n> comments dropped today`) — one alert per day, not per drop. 20 is reviewable and deliberately ~4× expected organic volume ("single digits per day at most"); raise it only with a spec edit.
     - **Per-contact dedupe: max 1 draft per contact per 24h.** A contact's second-and-later comments inside the window still get transcripted (context is cheap) but produce no agent call and no Telegram. Kills spam-bot loops and enthusiastic repeat commenters at zero token cost.
  6. **Non-trivial comments (under cap, past dedupe):** one agent call drafts a suggested public reply (page voice, no link unless it's the Starter Guide URL, ≤2 sentences). Then Telegram:
     `COMMENT on <post>: "<text>" → suggested reply: "<draft>"`
     CVO pastes manually in the GHL/FB UI — as a **nested reply** per §2.2 — or ignores. **The engine never sends** — no API path exists and none should be faked.
- **Cost note:** one agent call per non-trivial, non-keyword, non-deduped comment, hard-ceilinged at 20/day. At current organic volume that is single digits per day at most; the trivial filter fires before tokens are spent. No retry loops on Telegram failures — log and drop (March incident rule).

---

## 4. Meta-policy guardrails

- **One shot per comment.** A Page may send exactly **one** private reply per user comment, within **7 days** of the comment. If they don't answer, that thread is done — no follow-up DM is permitted. This is why the DM copy in §2 step 3 ends with a question: their reply is the only thing that opens the standard **24-hour messaging window**, and only inside that window does F3/REGGIE legitimately converse (each new user message resets it). It is also why the §2.3 backfill uses public nested replies, not DMs — the incident commenters are mostly past the 7-day window.
- **Public reply hygiene.** No Meta rule bans auto-replies, but identical text in rapid succession gets replies hidden and can restrict the Page's commenting. Mitigations: 6–8 rotated variants, no link in the public ack, the built-in delay before the DM, and Tier 3 replies are human-pasted (inherently paced).
- **Rate ceilings** (third-party-reported, verify against Meta docs before any paid-traffic scale-up): ~750 private replies/hour on FB comments; IG automated DMs capped at ~200/hour since Oct 2024. Organic RTL volume is orders of magnitude below both.
- **What we will NOT do:** no direct Graph API side-channel around GHL; no message tags or `HUMAN_AGENT` tag automation (legacy tags deprecate 2026-04-27 anyway); no re-DMing non-responders; no marketing blasts into Messenger (Recurring Notifications sunset 2026-02-10; Marketing Messages requires explicit opt-in we have not built); no automated public replies from the engine even if a hack made it possible.

---

## 5. F6d rollout gates

### 5.0 Kill path (documented before anything is lit)

The funnel has two halves and each has its own off-switch. Neither touches F3.

- **Engine half (Tier 3):** set `RTL_COMMENTS_ENABLED=false` (or unset) in the VPS env and restart the engine service. The lane reverts to transcript-and-log soak mode: no agent calls, no Telegram, no spend. `DRY_RUN` is **not** the comment kill switch and must not be flipped for this lane — it would draft-only the live F3 Messenger loop. **Executor:** Jeremiah (SSH to the VPS). **Target time-to-dark: ≤15 minutes.**
- **GHL half (Tiers 1–2 entry):** unpublish (set to Draft) these workflows in RR → Automations → Workflows — exact names:
  1. `RTL — Comment Gate · LAUNCH`
  2. `RTL — Comment Gate · LIST`
  3. `RTL — Comment Gate · REAL`
  4. `RTL — Comment Gate · VOICE`
  5. `RTL — Comment Gate · SPEC`
  6. `RTL — Comment Gate · SWAP`
  7. `RTL — Comment Concierge · Facebook`
  Unpublishing stops new triggers immediately; in-flight executions (the ~1-min DM wait) drain within minutes. **Executor: CVO primary, Jeremiah backup** — both must have working RR logins, verified as part of G0 (if Jeremiah cannot reach the workflow list in RR today, fixing that access is a G0 blocker). **Target time-to-dark: ≤30 minutes** from the decision, either operator, no coordination required.
- Killing the comment funnel does **not** require touching "RTL — Reply Router · Facebook" — comment-sourced contacts already in Messenger conversations keep flowing through the live F3 loop, which is correct (they are real DM conversations now).

### 5.1 Gates — sequential; stop at any failure

1. **G0 — build review.** All six Comment Gate workflows + Workflow B in DRAFT; I review screenshots/config against §2 (especially webhook body, Bearer header, and Track First Level Comments Only = ON on **all seven** workflows). Verify both kill-path operators have RR access (§5.0). Confirm `RTL_COMMENTS_ENABLED` is absent/false in the VPS env.
2. **G0.5 — engine deploy + synthetic smoke test.** G1 needs engine logs, so F6b ships **before** any workflow is published — and the VPS is a hand-deploy where `git pull` clobbers (git HEAD is Jul 4; established rule from the RTL-FBIG audit). Deploy `skills/rtl-lead-engine.mjs` via the documented **surgical single-file swap only** — no pull, no multi-file sync. Then smoke-test with a synthetic POST (curl to `https://webhook.truthjblue.dev/webhook/ghl` with the Bearer token) and verify in the logs, with `RTL_COMMENTS_ENABLED` still false:
   - a well-formed `rtl.comment` for the RR location → tenant guard passes, transcript line written, **and nothing else happens** (soak mode: no agent call, no Telegram);
   - a wrong-`locationId` payload → tenant guard rejects;
   - a keyword-matching comment body → trivial filter suppression logged.
   Then set `RTL_COMMENTS_ENABLED=true` briefly and re-POST one non-trivial synthetic comment to verify the full path (draft + Telegram + cap counter increments), then set it back to **false** for the G1/G2 soak. No GHL workflow is published until G0.5 passes.
3. **G1 — controlled test, one workflow (LAUNCH), engine in soak.** `RTL_COMMENTS_ENABLED` stays **false** — the comment lane runs transcript+log-only through G1 and G2 (24–48h minimum soak before it is lit; dark-until-lit doctrine). First, the retroactivity check from §2.3: leave a pre-publish test comment, publish `RTL — Comment Gate · LAUNCH` only, confirm whether the old comment fires (expected: no; if yes, stop and tell me). Then comment `LAUNCH` on the post from a test/personal profile. Verify, in order:
   - public ack appears and is one of the variants; comment auto-liked;
   - DM lands with the guide link, `utm_content=comment-dm` intact, within ~2 min;
   - `rtl-comment-lead` tag on the contact in RR;
   - webhook received: engine log shows `rtl.comment`, transcript line written, and — because the lane is in soak — **no agent call and no Telegram** (the trivial filter question is moot here; soak suppresses everything past the transcript).
4. **G2 — F3 continuation.** Reply to the DM from the test profile ("side-hustle"). Verify "RTL — Reply Router · Facebook" fires, REGGIE answers in-thread, transcript shows the comment context preceding the DM turn, and **no double-fire** (the comment workflow must not re-trigger on the DM, and F3 must not have processed the comment event). Note: this proves F3 works for comment-sourced leads *while the comment lane is dark* — the two lanes are demonstrably independent.
5. **G3 — light the lane, then escalation + concierge.** After the 24–48h soak is clean (transcript lines present, zero unexpected agent calls or Telegram messages in the logs), set `RTL_COMMENTS_ENABLED=true`. Post a non-keyword test comment on a Concierge-scoped post (Workflow B in test-publish): verify transcript + Telegram draft alert format, and check the log for whether the payload identified the comment author — this answers the §3 step 1a question (engine-side Page-author guard viable, or the nested-reply-only CVO rule is the load-bearing mitigation; record which). Have CVO paste the suggested reply **as a nested reply** and confirm no re-trigger. Post one regex-tripping comment: verify escalation alert, no draft. Post the same non-trivial comment twice from one profile: verify the second is dedupe-suppressed (§3 step 5).
6. **G4 — publish the remaining five keyword workflows.** Watch 48h: public-ack visibility (spam-hiding check), DM delivery rate, Telegram noise level, and the daily-cap counter (should be nowhere near 20; if it caps on organic volume, something is looping — kill per §5.0 and diagnose). Then publish Workflow B for real. Confirm the §2.3 backfill sweep is done (or has a date) before calling F6 complete.
7. **IG parity — deferred.** Clone the set when IG lanes go live (F-later). IG private replies carry extra requirements (Advanced Access, `instagram_manage_comments`, feed/ads/Reels only, Live-comment exception) — treat as its own mini-audit, not a copy-paste.

---

## 6. Metrics

- **Funnel:** comments (per keyword) → DMs delivered → DM replies (F3 conversations opened) → site opt-ins attributed to `utm_content=comment-dm`. Opt-in attribution comes from the existing opt-in form's UTM capture; comment-sourced leads are separable from post-caption clicks (`utm_content=<slot>`) by that one value. Backfill-sweep conversions show up separately as `utm_content=comment-backfill` (§2.3).
- **RR-side counts:** `rtl-comment-lead` tag total (and per-keyword tags if built) — weekly delta is the top-of-funnel number.
- **Weekly readout line** (append to the existing GROWTH-MACHINE readout):
  `F6: <n> keyword comments → <n> DMs → <n> replies → <n> opt-ins (comment-dm) | concierge: <n> drafts, <n> pasted, <n> escalations, <n> capped/deduped`
- **Health checks:** DM-delivery/comment ratio well under 1.0 means the private-reply action is failing or the 7-day window logic is off — alert-worthy. Zero concierge drafts for a week with nonzero comments means the webhook or comment-body merge field broke — *unless* the lane is deliberately dark (`RTL_COMMENTS_ENABLED=false`), which the readout should note. A nonzero capped/deduped count on organic volume is a looping-source flag, not a scale signal.
- Ties into the Agency Pro gate math: comment-dm opt-ins are the first organic conversion channel with a full closed loop, so this line is the earliest honest read on whether the 60-day calendar earns its ad-spend ladder.