# MEMORANDUM

**TO:** MIKE — Executive Systems Architect & Strategic Analyst, Truth J Blue LLC  
**FROM:** GitHub Copilot — WP-1 Execution Agent  
**DATE:** April 2, 2026  
**RE:** Work Package 1 (WP-1) — P0 Blocker Resolution — COMPLETE  
**Classification:** Internal Technical Update

---

## Executive Summary

All four P0 blockers identified in the April 1, 2026 Codex audit (commit `dc22a1e`) have been resolved in a single session on April 2, 2026. The platform exited the WP-1 gate with every validator green. There are no remaining P0 blockers. The deployment decision has advanced from ❌ NOT READY to ✅ DEPLOY WITH CONTROLS.

---

## Work Completed

### Issue 1.4 — Env Contract Normalization (resolved first per WP-1 order)

**Problem:** `.env.example` was missing required keys; `validate-env.mjs` still required the legacy single `ANTHROPIC_API_KEY`; `check-ghl-auth.mjs` issued a spurious drift warning when using the tenant-namespaced `GHL_LOCATION_ID_TJB` key.

**Changes made:**

| File | Change |
|---|---|
| `.env.example` | Added `GHL_LOCATION_ID`, `TELEGRAM_CHAT_ID`, `OPENCLAW_CAPABILITY_ENFORCEMENT_MODE=warn`, `OPENCLAW_SKILL_REGISTRY_ENFORCEMENT_MODE=warn`, `OPENCLAW_BROWSER_DATA_DIR`, `OPENCLAW_BROWSER_ALLOW_UNSAFE_NO_SANDBOX=false` |
| `scripts/validate-env.mjs` | Replaced `requireAny(["ANTHROPIC_API_KEY"])` with separate `requireAny` calls for `ANTHROPIC_API_KEY_SOVEREIGN` and `ANTHROPIC_API_KEY_SHARED`; added legacy key warning; added `GHL_LOCATION_ID` / `GHL_LOCATION_ID_TJB` required check; added `GHL_TOKEN` literal placeholder warning; promoted Telegram keys from optional to required |
| `scripts/check-ghl-auth.mjs` | Updated drift check to accept `GHL_LOCATION_ID_TJB` as valid fallback — no more false positive drift warning |

---

### Issue 1.1 — Legacy Anthropic API Key Path Removal

**Problem:** Five production files still read `process.env.ANTHROPIC_API_KEY` (the legacy single key), bypassing the split-key sovereign/shared isolation architecture established in `lib/claw-router.ts`. This meant sovereign agent calls (Opus tier) could silently fall back to the shared-account key, violating the isolation contract.

**Changes made:**

| File | Change |
|---|---|
| `lib/anthropic-client.ts` | Replaced single `anthropic` export with `anthropicSovereign`, `anthropicShared`, and `getAnthropicForTier(sovereign: boolean)` |
| `lib/llm-router.ts` | Replaced `getAnthropic()` singleton with `getAnthropicClient(sovereign: boolean)`; added `isSovereignRequest(tier, agentId?)` that reads `config/anthropic-tier-assignment.json` at runtime; `strategic` tier and any agent with `sovereign_isolation: true` automatically route to `ANTHROPIC_API_KEY_SOVEREIGN` |
| `lib/self-healing-supervisor.ts` | Preflight check updated to verify `ANTHROPIC_API_KEY_SOVEREIGN` (was `ANTHROPIC_API_KEY`) |
| `scripts/upgrade/probe-anthropic-key.mjs` | Refactored to probe both `ANTHROPIC_API_KEY_SOVEREIGN` and `ANTHROPIC_API_KEY_SHARED` independently; exit 1 if either fails; JSON report includes `all_ok` field |
| `lib/__tests__/llm-router.test.ts` | Test env updated to set both `ANTHROPIC_API_KEY_SOVEREIGN` and `ANTHROPIC_API_KEY_SHARED` |
| `lib/__tests__/self-healing-supervisor.test.ts` | Test env updated to set both split keys in `beforeEach` |

**Architecture note:** The existing `lib/claw-router.ts` already had a correct `getAnthropicClient(envVar: string)` implementation. The issue was that `llm-router.ts` was creating its own Anthropic client instance using the old single key, bypassing the routing layer entirely. The fix aligns `llm-router.ts` with the architecture that was already specified in claw-router.

---

### Issue 1.3 — Missing `security_policy` in `agents_config.json`

**Problem:** `validate-security-hardening.mjs` hard-fails if `security_policy` is absent from `config/agents_config.json`. The block was missing entirely, causing every run of the security hardening validator to exit non-zero.

**Changes made:**

| File | Change |
|---|---|
| `config/agents_config.json` | Added full `security_policy` block: `enforcement_modes` (capabilities: warn), `defaults.requires_hitl_for` (ghl_write, email_send, payment_action), `alias_agents` (main→d1_ceo, marketing→d1_cmo, sales→d1_sales_manager, support→d1_customer_success), `hard_limits`, `human_approval_required`, `sovereignIsolationPolicy` with the 5 sovereign agent IDs |
| `SOUL.md` | Regenerated via `generate-governance-docs.mjs` |
| `AGENTS.md` | Regenerated |
| `MEMORY.md` | Regenerated |
| `TOOLS.md` | Regenerated |

**Note:** Governance docs are generated artifacts. Running `generate-governance-docs.mjs` after adding `security_policy` was required for `validateGeneratedDocs()` inside the hardening validator to pass.

---

### Issue 1.2 — GHL OAuth Auto-Refresh

**Problem:** `skills/ghl-oauth-manager.mjs` was a pure CLI script with no exported API. No code in the runtime called token refresh automatically. 36 downstream skills depend on a valid GHL OAuth access token; on expiry they would fail silently. There was also no mechanism to signal rate-gated GHL calls that a token refresh was in progress.

**Changes made:**

| File | Change |
|---|---|
| `skills/ghl-oauth-manager.mjs` | Added three exports: `getTokenExpiryMs(instanceId)`, `scheduleAutoRefresh(instanceId)` (fires at 80% of token lifetime; 3 retries at 5-minute intervals; sends Telegram alert after retry exhaustion), `initAutoRefresh()` (calls `scheduleAutoRefresh` for every registered instance with an active token); converted script to conditional CLI execution (`process.argv[1] === fileURLToPath(import.meta.url)`) so it can be imported as a module without side effects |
| `lib/api-rate-governor.ts` | Added `ghlTokenStale: Map<string, boolean>`, exported `setGhlTokenStale(tenant, stale)` and `isGhlTokenStale(tenant)` — callers can gate GHL API calls on token freshness |
| `handlers/ghl-webhook-handler.mjs` | Imported `initAutoRefresh` from `skills/ghl-oauth-manager.mjs`; called at the end of the `server.listen` startup callback alongside `loadPhase3Modules()` |

**Architecture note:** The WP-1 prompt referenced `lib/agent-orchestrator.ts` as the wiring point for `initAutoRefresh()`. That file does not exist in this repo. The gateway entry point `handlers/ghl-webhook-handler.mjs` is the correct equivalent — it is the process that runs continuously and manages the GHL connection lifecycle.

---

## Exit Gate Results

All 7 validators checked post-implementation:

| Validator | Result |
|---|---|
| `tsc --noEmit` | ✅ Exit 0 — no type errors |
| `vitest run` | ✅ 197/197 tests passed (up from 117 pre-WP-1) |
| `validate-security-hardening.mjs` | ✅ Exit 0 — was failing before WP-1 |
| `validate-env.mjs` | ✅ "OK All required environment variables are set." |
| `check-ghl-auth.mjs` | ✅ Healthy — GHL_LOCATION_ID drift warning gone |
| `lint:ci` (baseline check) | ✅ 57 warnings / 59 max baseline |
| `check-governance-drift.mjs` | ✅ `ok: true`, 0 missing mappings/policies |

---

## Files Modified Summary

| File | Issue |
|---|---|
| `.env.example` | 1.4 |
| `scripts/validate-env.mjs` | 1.4 + 1.1 |
| `scripts/check-ghl-auth.mjs` | 1.4 |
| `lib/anthropic-client.ts` | 1.1 |
| `lib/llm-router.ts` | 1.1 |
| `lib/self-healing-supervisor.ts` | 1.1 |
| `scripts/upgrade/probe-anthropic-key.mjs` | 1.1 |
| `lib/__tests__/llm-router.test.ts` | 1.1 |
| `lib/__tests__/self-healing-supervisor.test.ts` | 1.1 |
| `config/agents_config.json` | 1.3 |
| `SOUL.md` / `AGENTS.md` / `MEMORY.md` / `TOOLS.md` | 1.3 |
| `skills/ghl-oauth-manager.mjs` | 1.2 |
| `lib/api-rate-governor.ts` | 1.2 |
| `handlers/ghl-webhook-handler.mjs` | 1.2 |

**15 files changed. 0 files deleted. 0 regressions.**

---

## REGGIE-STATE.md

Updated in the same session to reflect:
- All 4 P0 blockers struck through and marked RESOLVED
- LLM routing section updated with split-key resolution details
- Green section updated with 6 new confirmed-working items
- Deployment history row added: April 2, 2026 — WP-1 exit gate passed
- Test count updated: 117 → 197
- Verified date advanced to April 2, 2026

---

## Recommended Next Actions (WP-2 Scope)

The following items are the highest-priority P1 gaps remaining. MIKE should schedule WP-2 to address at minimum items 1–3 before a full production declaration:

1. **Hardcoded Telegram chat ID fallback** — present in `ab-testing.mjs`, `predictive-scoring.mjs`, `webhook-resilience.mjs`; causes alert misdelivery
2. **5-tier Anthropic assignment incomplete** — 89 of 103 agents still on fallback tier; `sovereign_isolation_verified` still false; completes the split-key architecture
3. **OpenAI embedding still active** — `memorySearch` in `openclaw.json` still calls `text-embedding-3-small`; blocks full OpenAI removal
4. **Supabase client not singleton in all callsites** — connection exhaustion risk under load
5. **Inngest idempotency keys absent** — duplicate GHL webhooks will cause duplicate task execution

---

*Memo prepared by GitHub Copilot — WP-1 Execution  
April 2, 2026 | Truth J Blue LLC | OpenClaw Platform*
