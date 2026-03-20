/**
 * Metrics wrapper for .mjs modules
 * Re-exports prom-client registry + metrics for non-TypeScript consumers.
 */

import client from "prom-client";

// Create a dedicated registry (mirrors metrics.ts)
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

// ── Event Processing Metrics ──
export const eventProcessedTotal = new client.Counter({
  name: "openclaw_event_processed_total",
  help: "Total webhook/inngest events processed",
  labelNames: ["event_type", "status"],
  registers: [registry],
});

export const eventProcessingDuration = new client.Histogram({
  name: "openclaw_event_processing_duration_seconds",
  help: "Duration of event processing in seconds",
  labelNames: ["event_type"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export { registry };
