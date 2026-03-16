/**
 * Prometheus Metrics
 * OpenClaw Multi-Agent Network
 *
 * Exposes application metrics in Prometheus exposition format via /metrics.
 * Instruments LLM calls, event processing, circuit breakers, budgets,
 * agent health, and memory queries.
 */

import client, {
  Registry,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";

// Create a dedicated registry (avoids global pollution)
export const registry = new Registry();

// Collect default Node.js metrics (GC, event loop, memory)
client.collectDefaultMetrics({ register: registry });

// ═══════════════════════════════════════════════════════════════════
// LLM REQUEST METRICS
// ═══════════════════════════════════════════════════════════════════

export const llmRequestDuration = new Histogram({
  name: "openclaw_llm_request_duration_seconds",
  help: "Duration of LLM API requests in seconds",
  labelNames: ["provider", "model", "agent"] as const,
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [registry],
});

export const llmRequestTotal = new Counter({
  name: "openclaw_llm_request_total",
  help: "Total number of LLM API requests",
  labelNames: ["provider", "model", "status"] as const,
  registers: [registry],
});

export const llmTokensUsed = new Counter({
  name: "openclaw_llm_tokens_total",
  help: "Total LLM tokens consumed",
  labelNames: ["provider", "model", "direction"] as const,
  registers: [registry],
});

// ═══════════════════════════════════════════════════════════════════
// EVENT PROCESSING METRICS
// ═══════════════════════════════════════════════════════════════════

export const eventProcessedTotal = new Counter({
  name: "openclaw_event_processed_total",
  help: "Total webhook/inngest events processed",
  labelNames: ["event_type", "status"] as const,
  registers: [registry],
});

export const eventProcessingDuration = new Histogram({
  name: "openclaw_event_processing_duration_seconds",
  help: "Duration of event processing in seconds",
  labelNames: ["event_type"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

// ═══════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER & RATE GOVERNOR
// ═══════════════════════════════════════════════════════════════════

export const circuitBreakerState = new Gauge({
  name: "openclaw_circuit_breaker_state",
  help: "Circuit breaker state (0=closed, 1=half-open, 2=open)",
  labelNames: ["provider"] as const,
  registers: [registry],
});

export const budgetUsedDollars = new Gauge({
  name: "openclaw_budget_used_dollars",
  help: "Daily budget consumed in USD",
  labelNames: ["provider"] as const,
  registers: [registry],
});

export const budgetCeilingDollars = new Gauge({
  name: "openclaw_budget_ceiling_dollars",
  help: "Daily budget ceiling in USD",
  labelNames: ["provider"] as const,
  registers: [registry],
});

export const concurrencyActive = new Gauge({
  name: "openclaw_concurrency_active",
  help: "Currently active concurrent requests per provider",
  labelNames: ["provider"] as const,
  registers: [registry],
});

// ═══════════════════════════════════════════════════════════════════
// AGENT HEALTH
// ═══════════════════════════════════════════════════════════════════

export const agentHealth = new Gauge({
  name: "openclaw_agent_health",
  help: "Agent health status (0=offline, 1=degraded, 2=active)",
  labelNames: ["agent_id", "pod_id", "division"] as const,
  registers: [registry],
});

// ═══════════════════════════════════════════════════════════════════
// MEMORY SUBSYSTEM
// ═══════════════════════════════════════════════════════════════════

export const memoryQueryDuration = new Histogram({
  name: "openclaw_memory_query_duration_seconds",
  help: "Duration of semantic memory queries",
  labelNames: ["agent_id"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [registry],
});

export const memoryStoreTotal = new Counter({
  name: "openclaw_memory_store_total",
  help: "Total memory store operations",
  labelNames: ["agent_id", "scope"] as const,
  registers: [registry],
});

// ═══════════════════════════════════════════════════════════════════
// ALERTING
// ═══════════════════════════════════════════════════════════════════

export const alertsSentTotal = new Counter({
  name: "openclaw_alerts_sent_total",
  help: "Total alerts sent/attempted",
  labelNames: ["channel", "status"] as const,
  registers: [registry],
});
