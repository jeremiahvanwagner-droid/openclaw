/**
 * Structured Logger
 * OpenClaw Multi-Agent Network
 *
 * JSON-native logging via Pino. All modules should import from here
 * instead of using console.* directly.
 */

import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/**
 * Create a child logger with additional context fields.
 * Use this to add agent_id, correlation_id, etc. to all log entries.
 *
 * @example
 * const log = childLogger({ agentId: "d1_ceo", correlationId: "cor-123" });
 * log.info("Processing task");
 */
export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
