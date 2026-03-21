/**
 * fix-budget-constants.ts
 * OpenClaw Multi-Agent Network — Unified Budget Constants
 *
 * Fixes audit finding PERF-01: "Budget Constants Drift"
 *
 * Root Cause:
 *   Two files define daily budget ceilings with conflicting values:
 *
 *   lib/constants.ts (DAILY_BUDGETS):
 *     openai-codex:  $50/day  (5000 cents)
 *     anthropic:     $40/day  (4000 cents)
 *     openai:        $30/day  (3000 cents)
 *
 *   lib/api-rate-governor.ts (providerConfig[].dailyBudgetCents):
 *     openai-codex:  $25/day  (2500 cents)  ← "reduced from $50" comment
 *     anthropic:     $20/day  (2000 cents)  ← "reduced from $40"
 *     openai:        $15/day  (1500 cents)  ← "reduced from $30"
 *
 *   The governor enforces the $25/$20/$15 values at runtime.
 *   lib/constants.ts declares $50/$40/$30 as the "source of truth."
 *   Result: the rate governor silently enforces HALF the declared limits.
 *   Tests and documentation disagree about what the actual limit is.
 *
 * Decision Required (CHOOSE ONE before applying this file):
 *   Option A: Raise runtime limits to match declared constants ($50/$40/$30)
 *             — Use if the lower limits were a temporary cost-control measure
 *               and you're confident spend is under control.
 *   Option B: Lower declared constants to match runtime enforcement ($25/$20/$15)
 *             — Use if the reduced limits are intentional business policy.
 *
 * This file implements Option B (conservative) by default and exports a
 * single BUDGET_CONFIG object. Both lib/constants.ts and api-rate-governor.ts
 * should import from here instead of defining their own values.
 *
 * Place this file at: lib/budget-constants.ts
 * Then update lib/constants.ts and lib/api-rate-governor.ts to import from it.
 */

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORITATIVE BUDGET CONFIGURATION
//
// These are the ENFORCED values. The rate governor reads dailyBudgetCents.
// Dashboard and alerts read dailyBudgetDollars. Both come from this file.
//
// To change limits: edit ONLY this file. Do not define budget values anywhere
// else in the codebase.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderBudget {
  /** Daily hard ceiling in cents (enforced by api-rate-governor.ts) */
  dailyBudgetCents: number;
  /** Daily hard ceiling in dollars (derived, for display and logging) */
  dailyBudgetDollars: number;
  /**
   * Warning threshold as a fraction of the daily budget.
   * e.g. 0.75 = alert when 75% of the daily budget is consumed.
   */
  warningThreshold: number;
}

/**
 * Per-provider daily budget configuration.
 *
 * CURRENT POLICY: Conservative limits at approximately half of maximum
 * provisioned capacity. Raised from these values requires explicit approval
 * and update to this file only.
 *
 * History:
 *   - 2026-03-14: Initial constants.ts defined $50/$40/$30 (declared limits)
 *   - 2026-03-15: api-rate-governor.ts implemented $25/$20/$15 (enforced limits)
 *   - 2026-03-20: This file resolves the drift — $25/$20/$15 is now canonical
 */
export const BUDGET_CONFIG: Record<string, ProviderBudget> = {
  /**
   * openai-codex: Used for code generation tasks (agent skill scaffolding).
   * Conservative limit — codex tasks are bursty and expensive.
   * Max provisioned: $50/day. Enforced at $25/day until spend baseline established.
   */
  'openai-codex': {
    dailyBudgetCents: 2500,   // $25.00/day — AUTHORITATIVE
    dailyBudgetDollars: 25,
    warningThreshold: 0.75,
  },

  /**
   * anthropic (Claude): Primary LLM for agent reasoning and orchestration.
   * Highest-priority provider — but also the most expensive per token.
   * Max provisioned: $40/day. Enforced at $20/day.
   */
  anthropic: {
    dailyBudgetCents: 2000,   // $20.00/day — AUTHORITATIVE
    dailyBudgetDollars: 20,
    warningThreshold: 0.75,
  },

  /**
   * openai (GPT-4o/GPT-4): Used for embeddings, some completion tasks.
   * Lower ceiling since most reasoning uses Anthropic.
   * Max provisioned: $30/day. Enforced at $15/day.
   */
  openai: {
    dailyBudgetCents: 1500,   // $15.00/day — AUTHORITATIVE
    dailyBudgetDollars: 15,
    warningThreshold: 0.75,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE EXPORTS
// These match the shape expected by existing call sites in the codebase.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for DAILY_BUDGETS in lib/constants.ts.
 * Maps provider name → daily budget in CENTS (matching original shape).
 *
 * Usage in lib/constants.ts:
 *   import { DAILY_BUDGETS } from './budget-constants';
 *   export { DAILY_BUDGETS }; // re-export for backward compat
 */
export const DAILY_BUDGETS: Record<string, number> = Object.fromEntries(
  Object.entries(BUDGET_CONFIG).map(([provider, cfg]) => [provider, cfg.dailyBudgetCents])
);

/**
 * Budget warning percentage — used in constants.ts as BUDGET_WARNING_PCT.
 * Single value since all providers use the same threshold.
 */
export const BUDGET_WARNING_PCT = 0.75;

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION GUIDE
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. REPLACE lib/constants.ts DAILY_BUDGETS:
//    Remove:
//      export const DAILY_BUDGETS = {
//        "openai-codex": 5000,  // $50/day
//        anthropic: 4000,       // $40/day
//        openai: 3000,          // $30/day
//      } as const;
//    Add:
//      export { DAILY_BUDGETS, BUDGET_WARNING_PCT } from './budget-constants';
//
// 2. REPLACE lib/api-rate-governor.ts providerConfig budget values:
//    Replace each `dailyBudgetCents: XXXX,` literal with:
//      import { BUDGET_CONFIG } from './budget-constants';
//      // ...
//      dailyBudgetCents: BUDGET_CONFIG['anthropic'].dailyBudgetCents,
//
//    Or use a helper:
//      function budgetCents(provider: string): number {
//        return BUDGET_CONFIG[provider]?.dailyBudgetCents ?? 1000; // $10 fallback
//      }
//
// 3. UPDATE TESTS:
//    Tests in tests/api-rate-governor.test.ts that assert specific budget
//    values should import from this file rather than hardcoding cents.
//
// 4. TO RAISE LIMITS (e.g., openai-codex to $50/day):
//    Edit ONLY this file:
//      'openai-codex': { dailyBudgetCents: 5000, dailyBudgetDollars: 50, ... }
//    No other file needs to change. Git diff will show exactly what changed.
