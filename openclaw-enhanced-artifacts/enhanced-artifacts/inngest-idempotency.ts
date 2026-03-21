/**
 * inngest-idempotency.ts
 * OpenClaw Multi-Agent Network — Idempotent Inngest Function Wrapper
 *
 * Fixes audit finding PERF-03: "No Idempotency Keys on Inngest Functions"
 *
 * Problem:
 *   agent-orchestrator.ts and d8-saas-operations.ts define Inngest functions
 *   without idempotency configuration. When Inngest retries a function (e.g.,
 *   after a transient network error), the same event fires again. Without
 *   idempotency, this causes:
 *     - Duplicate LLM completions (cost amplification under failures)
 *     - Duplicate Supabase inserts (double agent_events rows)
 *     - Duplicate GHL contact creation / SaaS signups (critical business error)
 *     - Duplicate Telegram alerts flooding the operations channel
 *
 * Solution:
 *   Use Inngest's built-in idempotency key expression. If an event carries a
 *   `correlation_id` (already present on most OpenClaw events per the schema
 *   in inngest/client.ts), that becomes the idempotency key. Inngest deduplicates
 *   runs with the same key within its deduplication window (24 hours by default).
 *
 * Usage:
 *   Replace direct inngest.createFunction() calls with createIdempotentFunction():
 *
 *   BEFORE (agent-orchestrator.ts):
 *     export const agentInvoke = inngest.createFunction(
 *       { id: 'agent-invoke', retries: 3 },
 *       { event: 'agent/invoke' },
 *       async ({ event, step }) => { ... }
 *     );
 *
 *   AFTER:
 *     export const agentInvoke = createIdempotentFunction(
 *       { id: 'agent-invoke', event: 'agent/invoke', concurrency: 10 },
 *       async ({ event, step }) => { ... }
 *     );
 *
 * Place this file at: inngest/idempotency.ts
 */

import { inngest } from './client';

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface IdempotentFunctionConfig {
  /** Unique function ID (must be stable across deployments) */
  id: string;
  /** Inngest event name that triggers this function */
  event: string;
  /**
   * Maximum concurrent executions of this function.
   * Defaults to 5. Set higher for high-throughput events (e.g., agent/invoke),
   * lower for expensive operations (e.g., LLM completions).
   */
  concurrency?: number;
  /**
   * Number of retries on failure.
   * Defaults to 3. Set to 0 for fire-and-forget operations.
   */
  retries?: number;
  /**
   * Custom idempotency key expression.
   * Defaults to `event.data.correlation_id`.
   * Use a different field if the event doesn't carry correlation_id.
   * Set to null to disable idempotency (not recommended for most functions).
   */
  idempotencyKey?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an Inngest function with automatic idempotency and concurrency limits.
 *
 * The idempotency key defaults to `event.data.correlation_id`. Ensure every
 * event you send includes a stable `correlation_id` (UUID) in its data payload.
 * If the event has no correlation_id, Inngest cannot deduplicate and will fall
 * back to executing multiple times on retry.
 *
 * @param config  Function configuration (id, event, concurrency, retries)
 * @param handler Async function that processes the event
 * @returns       Inngest function ready to be exported and registered
 */
export function createIdempotentFunction<T>(
  config: IdempotentFunctionConfig,
  handler: (args: any) => Promise<T>
) {
  const {
    id,
    event,
    concurrency = 5,
    retries = 3,
    idempotencyKey = 'event.data.correlation_id',
  } = config;

  // Build the function config — conditionally include idempotency
  const fnConfig: Record<string, unknown> = {
    id,
    retries,
    concurrency: { limit: concurrency },
  };

  if (idempotencyKey !== null) {
    fnConfig.idempotency = idempotencyKey;
  }

  return inngest.createFunction(
    fnConfig as any,
    { event },
    handler
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIALIZED VARIANTS
// Pre-configured wrappers for common patterns in the OpenClaw network.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-throughput agent task function.
 * Used for agent/invoke and pod/task events — many concurrent agents.
 * Concurrency: 10, Retries: 3
 */
export function createAgentTaskFunction<T>(
  config: Omit<IdempotentFunctionConfig, 'concurrency' | 'retries'>,
  handler: (args: any) => Promise<T>
) {
  return createIdempotentFunction({ ...config, concurrency: 10, retries: 3 }, handler);
}

/**
 * LLM-heavy function with lower concurrency to control API costs.
 * Used for training, content generation, and complex reasoning steps.
 * Concurrency: 3, Retries: 2
 */
export function createLlmFunction<T>(
  config: Omit<IdempotentFunctionConfig, 'concurrency' | 'retries'>,
  handler: (args: any) => Promise<T>
) {
  return createIdempotentFunction({ ...config, concurrency: 3, retries: 2 }, handler);
}

/**
 * SaaS operation function — business-critical, must not duplicate.
 * Used for saas/client.signup, saas/payment.failed, etc.
 * Concurrency: 5, Retries: 3, strict deduplication
 */
export function createSaasOperationFunction<T>(
  config: Omit<IdempotentFunctionConfig, 'concurrency' | 'retries'>,
  handler: (args: any) => Promise<T>
) {
  return createIdempotentFunction({ ...config, concurrency: 5, retries: 3 }, handler);
}

// ─────────────────────────────────────────────────────────────────────────────
// CORRELATION ID UTILITY
// Use this when sending events to ensure they always carry a correlation_id.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'crypto';

/**
 * Ensures an event data object has a correlation_id.
 * If one is already present, it passes through unchanged.
 * If absent, a new UUID is generated.
 *
 * @example
 * await inngest.send({
 *   name: 'agent/invoke',
 *   data: withCorrelationId({ source_agent: 'd1_ceo', payload: {} }),
 * });
 */
export function withCorrelationId<T extends Record<string, unknown>>(
  data: T
): T & { correlation_id: string } {
  return {
    ...data,
    correlation_id: (data.correlation_id as string) ?? randomUUID(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION GUIDE
// ─────────────────────────────────────────────────────────────────────────────
//
// inngest/functions/agent-orchestrator.ts:
//   Replace all inngest.createFunction() calls with createIdempotentFunction()
//   or the specialized variants above.
//
//   Example for agentInvoke:
//     export const agentInvoke = createAgentTaskFunction(
//       { id: 'agent-invoke', event: 'agent/invoke' },
//       async ({ event, step }) => { ... }
//     );
//
//   Example for escalationHandler:
//     export const escalationHandler = createAgentTaskFunction(
//       { id: 'agent-escalate', event: 'agent/escalate' },
//       async ({ event, step }) => { ... }
//     );
//
// inngest/functions/d8-saas-operations.ts:
//   SaaS signups and payment handlers must use createSaasOperationFunction()
//   to prevent duplicate client records.
//
//   export const saasClientSignup = createSaasOperationFunction(
//     { id: 'saas-client-signup', event: 'saas/client.signup' },
//     async ({ event, step }) => { ... }
//   );
//
// Ensure all inngest.send() calls include correlation_id in event.data.
// Use withCorrelationId() as a safety wrapper where unsure.
