/**
 * Cost Guard — Dry-run wrapper for LLM calls.
 * When DRY_RUN=true, logs the call details instead of invoking the API.
 */

import { logger } from "./logger";

const log = logger.child({ module: "cost-guard" });

export function isDryRun(): boolean {
  return process.env.DRY_RUN === "true";
}

/**
 * Wrap an LLM call with dry-run gating.
 * If DRY_RUN=true, returns a stub result and logs what would have been called.
 * Otherwise, executes the call normally.
 */
export async function guardedLLMCall<T>(
  label: string,
  fn: () => Promise<T>,
  stubResult: T,
): Promise<T> {
  if (isDryRun()) {
    log.info({ label }, "[cost-guard] DRY_RUN active — skipping LLM call");
    return stubResult;
  }
  return fn();
}
