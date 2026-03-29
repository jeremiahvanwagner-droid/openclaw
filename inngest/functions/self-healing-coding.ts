/**
 * Self-Healing & Advanced Coding — Inngest Event Handlers
 * OpenClaw Multi-Agent Network
 *
 * Scheduled and event-driven functions for:
 *   - Autonomous self-healing loop (30-minute cron)
 *   - Integration health checks (5-minute cron)
 *   - GitHub CI fix on workflow failure events
 *   - On-demand healing run triggers
 */

import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../../lib/logger";
import {
  runHealingLoop,
  runIntegrationHealthCheck,
  runCiHealingCycle,
  collectRecentErrorLogs,
  type ErrorLogEntry,
  type CiFixResult,
} from "../../lib/self-healing-supervisor";

// ─────────────────────────────────────────────────────────────────
// CIRCUIT BREAKER — prevents runaway healing loops
// ─────────────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_TABLE = "healing_circuit_breaker";
const MAX_FAILURES = 3;
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

interface CircuitState {
  failures: number;
  last_failure_at: string | null;
  open_until: string | null;
}

async function getCircuitState(): Promise<CircuitState> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { failures: 0, last_failure_at: null, open_until: null };

  const sb = createClient(url, key);
  const { data } = await sb
    .from(CIRCUIT_BREAKER_TABLE)
    .select("*")
    .eq("circuit_key", "scheduled_healing")
    .maybeSingle();

  return (data as CircuitState | null) ?? { failures: 0, last_failure_at: null, open_until: null };
}

async function recordCircuitFailure(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const sb = createClient(url, key);
  const state = await getCircuitState();
  const newFailures = (state.failures ?? 0) + 1;
  const openUntil = newFailures >= MAX_FAILURES
    ? new Date(Date.now() + COOLDOWN_MS).toISOString()
    : state.open_until;

  await sb.from(CIRCUIT_BREAKER_TABLE).upsert({
    circuit_key: "scheduled_healing",
    failures: newFailures,
    last_failure_at: new Date().toISOString(),
    open_until: openUntil,
  }, { onConflict: "circuit_key" });
}

async function resetCircuit(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const sb = createClient(url, key);
  await sb.from(CIRCUIT_BREAKER_TABLE).upsert({
    circuit_key: "scheduled_healing",
    failures: 0,
    last_failure_at: null,
    open_until: null,
  }, { onConflict: "circuit_key" });
}

// ─────────────────────────────────────────────────────────────────
// SELF-HEALING LOOP — every 30 minutes
// ─────────────────────────────────────────────────────────────────

/**
 * Scheduled self-healing run.
 * Collects recent error logs from Supabase, runs the full healing loop,
 * and emits events for escalations and completed repairs.
 *
 * Protected by a circuit breaker: if the loop fails MAX_FAILURES times
 * within a 30-minute window, it trips open and skips runs until COOLDOWN_MS
 * has elapsed — preventing runaway restart cascades.
 */
export const selfHealingScheduled = inngest.createFunction(
  {
    id: "self-healing-scheduled",
    name: "Self-Healing — Scheduled 30-min Loop",
    retries: 1,
  },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    // ── Circuit Breaker Check ──────────────────────────────────
    const circuit = await step.run("circuit-breaker-check", async () => {
      return getCircuitState();
    });

    if (circuit.open_until && new Date(circuit.open_until) > new Date()) {
      logger.warn(
        { failures: circuit.failures, open_until: circuit.open_until },
        "[OpenClaw] Self-healing circuit OPEN — skipping this run."
      );
      return {
        status: "circuit_open",
        failures: circuit.failures,
        open_until: circuit.open_until,
      };
    }

    // ── Preflight: verify ANTHROPIC_API_KEY is set ─────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      await step.run("record-preflight-failure", async () => {
        return recordCircuitFailure();
      });
      logger.error("[OpenClaw] PREFLIGHT FAILED: ANTHROPIC_API_KEY not set — aborting healing run");
      return { status: "preflight_failed", reason: "ANTHROPIC_API_KEY_missing" };
    }

    try {
      // Step 1: Collect recent error logs
      const logs = await step.run("collect-error-logs", async () => {
        return collectRecentErrorLogs(30);
      });

      if (logs.length === 0) {
        await step.run("reset-circuit-on-clean", async () => resetCircuit());
        return { status: "no_errors", logs_collected: 0 };
      }

      // Step 2: Run the healing loop
      const result = await step.run("run-healing-loop", async () => {
        return runHealingLoop(logs as ErrorLogEntry[], { stabilityWindowMinutes: 30 });
      });

      // Step 3: Emit escalation events for unresolved failures
      if (result.escalations.length > 0) {
        await step.sendEvent("emit-healing-escalations", {
          name: "healing/escalation.needed",
          data: {
            run_id:      result.run_id,
            escalations: result.escalations,
            source:      "scheduled_healing_loop",
          },
        });
      }

      // Step 4: Emit completion event for downstream consumers
      await step.sendEvent("emit-healing-complete", {
        name: "healing/run.completed",
        data: {
          run_id:          result.run_id,
          patches_applied: result.patches_applied,
          patches_skipped: result.patches_skipped,
          clusters_found:  result.clusters_found,
          escalations:     result.escalations.length,
        },
      });

      // Step 5: Reset circuit on success
      await step.run("reset-circuit-on-success", async () => resetCircuit());

      return {
        status:          "completed",
        run_id:          result.run_id,
        logs_collected:  logs.length,
        patches_applied: result.patches_applied,
        escalations:     result.escalations.length,
      };
    } catch (err) {
      // Record failure and let circuit breaker accumulate
      await step.run("record-circuit-failure", async () => recordCircuitFailure());
      throw err;
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// ON-DEMAND HEALING TRIGGER
// ─────────────────────────────────────────────────────────────────

/**
 * Trigger an immediate healing run with a custom log payload.
 * Fired when the monitoring layer detects anomalies mid-cycle.
 *
 * Event: `healing/run.requested`
 * Data:  `{ logs: ErrorLogEntry[], model?: string }`
 */
export const selfHealingOnDemand = inngest.createFunction(
  {
    id: "self-healing-on-demand",
    name: "Self-Healing — On-Demand Run",
    retries: 2,
  },
  { event: "healing/run.requested" },
  async ({ event, step }) => {
    const { logs = [], model } = event.data;

    const result = await step.run("run-healing-loop", async () => {
      return runHealingLoop(logs, { model });
    });

    return {
      run_id:          result.run_id,
      patches_applied: result.patches_applied,
      escalations:     result.escalations.length,
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// INTEGRATION HEALTH CHECK — every 5 minutes (supplement to phase1)
// ─────────────────────────────────────────────────────────────────

/**
 * Supervisor-layer integration health check.
 * Complements the Phase 1 self-healing-integrations cron by adding
 * the orchestrated escalation and circuit-breaker-reset logic.
 *
 * Event: `healing/integration.health_check`  (also triggered on cron)
 */
export const supervisorIntegrationCheck = inngest.createFunction(
  {
    id: "supervisor-integration-check",
    name: "Supervisor — Integration Health Check",
    retries: 1,
  },
  { event: "healing/integration.health_check" },
  async ({ step }) => {
    const health = await step.run("run-integration-check", async () => {
      return runIntegrationHealthCheck();
    });

    if (Array.isArray(health.escalated) && health.escalated.length > 0) {
      await step.sendEvent("emit-integration-escalation", {
        name: "healing/escalation.needed",
        data: {
          source:    "integration_health_check",
          escalated: health.escalated,
          overall:   String(health.overall),
        },
      });
    }

    return {
      overall:   health.overall,
      healed:    Array.isArray(health.healed)    ? health.healed.length    : 0,
      escalated: Array.isArray(health.escalated) ? health.escalated.length : 0,
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// HEALING ESCALATION HANDLER
// ─────────────────────────────────────────────────────────────────

/**
 * Handle a healing escalation event — currently logs and forwards
 * to the agent-orchestrator for human-in-the-loop approval.
 *
 * Event: `healing/escalation.needed`
 * Data:  `{ run_id?: string, escalations?: string[], source?: string }`
 */
export const healingEscalationHandler = inngest.createFunction(
  {
    id: "healing-escalation-handler",
    name: "Self-Healing — Escalation Handler",
    retries: 1,
  },
  { event: "healing/escalation.needed" },
  async ({ event, step }) => {
    const data = event.data;

    // Forward to agent escalation flow using the existing agent/escalate event schema
    await step.sendEvent("forward-to-agent-escalate", {
      name: "agent/escalate",
      data: {
        source_agent:    "self_healing_supervisor",
        escalation_path: "d1_devops",
        reason:          "self_healing_escalation",
        payload:         data as Record<string, unknown>,
      },
    });

    return { forwarded: true, source: data.source ?? "unknown" };
  }
);

// ─────────────────────────────────────────────────────────────────
// GITHUB CI FIX — triggered on CI failure events
// ─────────────────────────────────────────────────────────────────

/**
 * Autonomous GitHub CI repair.
 * Triggered when a CI workflow run fails, or on a daily schedule
 * to catch any outstanding failures.
 *
 * Event: `ci/run.failed`
 * Data:  `{ owner: string, repo: string, branch?: string }`
 */
export const ciAutoFix = inngest.createFunction(
  {
    id: "ci-auto-fix",
    name: "CI — Autonomous Fix",
    retries: 1,
    // Debounce: at most one CI fix per repo per 10 minutes
    debounce: { period: "10m", key: "event.data.owner + '/' + event.data.repo" },
  },
  { event: "ci/run.failed" },
  async ({ event, step }) => {
    const { owner, repo, branch } = event.data;

    const result: CiFixResult = await step.run("run-ci-fix", async () => {
      return runCiHealingCycle(owner, repo, { branch });
    });

    if (!result.skipped && result.pr_url) {
      // Notify dev team via the agent escalation flow
      await step.sendEvent("notify-ci-fix-pr", {
        name: "agent/escalate",
        data: {
          source_agent:    "self_healing_supervisor",
          escalation_path: "d1_devops",
          reason:          "ci_fix_pr_opened",
          payload:         { owner, repo, pr_url: result.pr_url, category: result.category },
        },
      });
    }

    return {
      owner,
      repo,
      category:  result.category,
      pr_url:    result.pr_url,
      pr_number: result.pr_number,
      skipped:   result.skipped,
      reason:    result.reason,
    };
  }
);

/**
 * Daily scheduled CI check — scans for outstanding failures at 6 AM.
 * Reads target repositories from OPENCLAW_CI_REPOS env var
 * (comma-separated list of "owner/repo" entries).
 */
export const ciDailyCheck = inngest.createFunction(
  {
    id: "ci-daily-check",
    name: "CI — Daily Scheduled Check",
    retries: 1,
  },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const reposEnv = process.env.OPENCLAW_CI_REPOS ?? "";
    const repos = reposEnv
      .split(",")
      .map(r => r.trim())
      .filter(r => r.includes("/"))
      .map(r => { const [owner, repo] = r.split("/"); return { owner, repo }; });

    if (repos.length === 0) {
      return { status: "no_repos_configured" };
    }

    const results = [];
    for (const { owner, repo } of repos) {
      const result: CiFixResult = await step.run(`ci-fix-${owner}-${repo}`, async () => {
        return runCiHealingCycle(owner, repo);
      });
      results.push(result);
    }

    return {
      repos_checked: repos.length,
      prs_opened:    results.filter(r => !r.skipped && r.pr_url).length,
      skipped:       results.filter(r => r.skipped).length,
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export const selfHealingCodingFunctions = [
  selfHealingScheduled,
  selfHealingOnDemand,
  supervisorIntegrationCheck,
  healingEscalationHandler,
  ciAutoFix,
  ciDailyCheck,
];
