/**
 * Self-Healing Supervisor
 * OpenClaw Multi-Agent Network
 *
 * Orchestrates the full self-healing and autonomous coding loop:
 *
 *   detect failures
 *     → diagnose root cause (autonomous-debugging skill)
 *     → generate patch proposals
 *     → validate + apply safe patches
 *     → monitor post-fix stability
 *     → escalate to human on persistent failures or low confidence
 *
 * Also drives the advanced coding loop:
 *   failing CI run detected
 *     → classify CI failure
 *     → generate + commit targeted fix
 *     → open pull request for review
 *
 * Used by the `inngest/functions/self-healing-coding.ts` Inngest functions
 * and the `skills/self-healing-integrations` health-check cron.
 */

import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const log = logger.child({ module: "self-healing-supervisor" });

// ── Preflight Check ───────────────────────────────────────────────

/**
 * Verify all critical environment variables and service reachability
 * before starting any healing cycle.
 *
 * Returns false if any critical check fails, preventing the healing
 * loop from running and potentially causing a crash-loop restart cascade.
 */
export async function preflightCheck(): Promise<boolean> {
  // 1. Verify ANTHROPIC_API_KEY is set
  if (!process.env.ANTHROPIC_API_KEY) {
    log.error("[OpenClaw] PREFLIGHT FAILED: ANTHROPIC_API_KEY not set");
    return false;
  }

  // 2. Verify Supabase credentials are set
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log.error("[OpenClaw] PREFLIGHT FAILED: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    return false;
  }

  // 3. Verify gateway is reachable (best-effort HTTP check)
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL
    ?? `http://127.0.0.1:${process.env.OPENCLAW_GATEWAY_PORT ?? "18789"}/health`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(gatewayUrl, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) {
      log.warn({ status: res.status }, "[OpenClaw] PREFLIGHT WARN: gateway returned non-200");
    }
  } catch {
    // Non-fatal: healing can still run if gateway is temporarily unavailable
    log.warn("[OpenClaw] PREFLIGHT WARN: gateway not reachable — proceeding anyway");
  }

  return true;
}

// ── Supabase singleton ────────────────────────────────────────────

function supabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// ── Types ─────────────────────────────────────────────────────────

export interface ErrorLogEntry {
  source: string;
  message: string;
  stack?: string;
  timestamp?: string;
}

export interface Incident {
  id: string;
  signature: string;
  severity: string;
  message: string;
  source: string;
  timestamp: string;
}

export interface IncidentCluster {
  signature: string;
  severity: string;
  count: number;
  incidents: string[];
  representative: string;
}

export interface PatchProposal {
  id: string;
  description: string;
  patch_hint: string;
  confidence: number;
  requires_human_review: boolean;
}

export interface PatchResult {
  proposal: PatchProposal;
  applied: boolean;
  patch_id: string;
  rollback_token: string;
  skip_reason?: string;
}

export interface StabilityResult {
  stable: boolean;
  recurrence_count: number;
  verdict: "stable" | "regressed" | "insufficient_data";
}

export interface HealingRunResult {
  run_id: string;
  started_at: string;
  completed_at: string;
  incidents_ingested: number;
  clusters_found: number;
  patches_applied: number;
  patches_skipped: number;
  stability: Record<string, StabilityResult>;
  report: string;
  escalations: string[];
}

export interface CiFixResult {
  owner: string;
  repo: string;
  run_id: number;
  category: string;
  pr_url?: string;
  pr_number?: number;
  skipped: boolean;
  reason?: string;
}

// ── Skill loaders (lazy — avoids import errors in test environments) ─

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadAutonomousDebugging(): Promise<any> {
  // @ts-expect-error — .mjs skills are untyped by design
  return import("../skills/aisaas-autonomous-debugging/index.mjs");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadGhFixCi(): Promise<any> {
  // @ts-expect-error — .mjs skills are untyped by design
  return import("../skills/gh-fix-ci/index.mjs");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSelfHealingIntegrations(): Promise<any> {
  // @ts-expect-error — .mjs skills are untyped by design
  return import("../skills/self-healing-integrations/index.mjs");
}

// ── Escalation helper ─────────────────────────────────────────────

/**
 * Persist an escalation record and (optionally) send a Telegram alert.
 */
async function escalate(reason: string, context: Record<string, unknown>): Promise<void> {
  const db = supabase();
  try {
    await db.from("healing_escalations").insert({
      reason,
      context_json: context,
      escalated_at: new Date().toISOString(),
    });
  } catch {
    // Non-critical — best-effort persistence
  }

  log.warn({ reason, context }, "Self-healing escalation");

  // Best-effort Telegram alert
  try {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId        = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID;
    if (telegramToken && chatId) {
      // Escape Markdown special characters to prevent formatting injection
      const safeReason = reason.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&");
      const text = `⚠️ *OpenClaw Self\\-Healing Escalation*\n\n${safeReason}`;
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
      });
    }
  } catch {
    // Non-critical — escalation already persisted to DB
  }
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC SURFACE
// ─────────────────────────────────────────────────────────────────

/**
 * Run the full self-healing loop for a batch of error logs.
 *
 * Steps:
 *   1. Ingest logs → extract incidents
 *   2. Cluster by root-cause signature
 *   3. For each cluster: generate, validate, and apply safe patches
 *   4. Monitor post-fix stability
 *   5. Escalate unresolved clusters
 *   6. Persist and return a resolution report
 *
 * @param logs   Raw error log entries to process
 * @param opts   Optional model override and post-fix stability window
 */
export async function runHealingLoop(
  logs: ErrorLogEntry[],
  opts: { model?: string; stabilityWindowMinutes?: number } = {}
): Promise<HealingRunResult> {
  const runId     = `heal-${Date.now()}`;
  const startedAt = new Date().toISOString();

  // Preflight: abort early if critical env vars are missing
  const ready = await preflightCheck();
  if (!ready) {
    log.error({ run_id: runId }, "Healing loop aborted — preflight check failed");
    return {
      run_id:             runId,
      started_at:         startedAt,
      completed_at:       new Date().toISOString(),
      incidents_ingested: 0,
      clusters_found:     0,
      patches_applied:    0,
      patches_skipped:    0,
      stability:          {},
      report:             "Healing loop aborted: preflight check failed (see logs)",
      escalations:        ["preflight_check_failed"],
    };
  }

  const dbg = await loadAutonomousDebugging();

  // 1. Ingest
  const { incidents }: { incidents: Incident[] } = await dbg.ingestErrorLogs(logs);

  // 2. Cluster
  const { clusters }: { clusters: Record<string, IncidentCluster> } = dbg.clusterIncidents(incidents);
  const clusterList = Object.values(clusters) as IncidentCluster[];

  // 3. Patch loop
  const patchResults: PatchResult[] = [];
  const escalations: string[] = [];

  for (const cluster of clusterList) {
    const { proposals }: { proposals: PatchProposal[] } = await dbg.generatePatchProposals(cluster, { model: opts.model });

    for (const proposal of proposals) {
      const validation: { valid: boolean; safe_to_apply: boolean; reason: string } =
        dbg.validatePatch(proposal);

      if (!validation.safe_to_apply) {
        patchResults.push({
          proposal,
          applied: false,
          patch_id: "",
          rollback_token: "",
          skip_reason: validation.reason,
        });

        if (proposal.requires_human_review) {
          escalations.push(
            `Cluster "${cluster.signature}" (${cluster.count} incidents): ${proposal.description} — ${validation.reason}`
          );
        }
        continue;
      }

      const { applied, patch_id, rollback_token } = await dbg.applyPatch(proposal, cluster.signature);
      patchResults.push({ proposal, applied, patch_id, rollback_token });
    }
  }

  // 4. Stability monitoring
  const stability: Record<string, StabilityResult> = {};
  for (const cluster of clusterList) {
    stability[cluster.signature] = await dbg.monitorPostFixStability(
      cluster.signature,
      { windowMinutes: opts.stabilityWindowMinutes ?? 30 }
    );

    if (stability[cluster.signature].verdict === "regressed") {
      escalations.push(
        `Regression detected for "${cluster.signature}" — ${stability[cluster.signature].recurrence_count} new occurrences`
      );
    }
  }

  // 5. Escalate
  for (const reason of escalations) {
    await escalate(reason, { run_id: runId, cluster_signatures: Object.keys(clusters) });
  }

  // 6. Report
  const clustersRecord: Record<string, IncidentCluster> = clusters;
  const { report }: { report: string } = dbg.generateResolutionReport({
    clusters: clustersRecord,
    patches: patchResults.map(r => ({
      description: r.proposal.description,
      applied: r.applied,
      rollback_token: r.rollback_token,
    })),
    stability,
  });

  const completedAt = new Date().toISOString();
  const result: HealingRunResult = {
    run_id:             runId,
    started_at:         startedAt,
    completed_at:       completedAt,
    incidents_ingested: incidents.length,
    clusters_found:     clusterList.length,
    patches_applied:    patchResults.filter(r => r.applied).length,
    patches_skipped:    patchResults.filter(r => !r.applied).length,
    stability,
    report,
    escalations,
  };

  // Persist run summary to Supabase
  const db = supabase();
  try {
    await db.from("healing_run_log").insert({
      run_id:             result.run_id,
      started_at:         result.started_at,
      completed_at:       result.completed_at,
      incidents_ingested: result.incidents_ingested,
      clusters_found:     result.clusters_found,
      patches_applied:    result.patches_applied,
      patches_skipped:    result.patches_skipped,
      escalation_count:   result.escalations.length,
    });
  } catch {
    // Non-critical — best-effort persistence
  }

  log.info(
    { run_id: runId, patches_applied: result.patches_applied, escalations: escalations.length },
    "Healing loop complete"
  );

  return result;
}

/**
 * Run a single integration health check and auto-heal any transient failures.
 * Thin orchestration wrapper around the self-healing-integrations skill.
 *
 * @returns Integration health report + any healing actions taken
 */
export async function runIntegrationHealthCheck(): Promise<{
  overall: string;
  healed: string[];
  escalated: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  report: any;
}> {
  const skill = await loadSelfHealingIntegrations();

  // Probe all endpoints
  const { results: probeResults } = await skill.probeAllWebhooks();

  // Detect broken integrations
  const { broken } = await skill.detectBrokenIntegrations();

  const healed: string[] = [];
  const escalated: string[] = [];

  for (const item of broken) {
    if (item.failure_type === "transient") {
      // Auto-retry transient failures
      await skill.autoRetryTransient([{ id: `dlq-${item.provider}`, payload: {}, provider: item.provider }]);
      healed.push(item.provider);
    } else if (item.failure_type === "degraded") {
      // Attempt circuit breaker reset
      const { reset } = await skill.selfHealCircuitBreaker(item.provider);
      if (reset) {
        healed.push(item.provider);
      } else {
        escalated.push(item.provider);
        await escalate(`Integration "${item.provider}" is degraded and could not self-heal`, { reason: item.reason });
      }
    } else {
      // Dead — escalate immediately
      escalated.push(item.provider);
      await escalate(`Integration "${item.provider}" is dead`, { reason: item.reason });
    }
  }

  const report = await skill.generateHealthReport();

  log.info(
    { overall: report.overall, healed: healed.length, escalated: escalated.length, probes: probeResults.length },
    "Integration health check complete"
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { overall: report.overall, healed, escalated, report: report as any };
}

/**
 * Trigger an autonomous CI fix for a GitHub repository.
 * Wraps the `gh-fix-ci` skill with logging and escalation.
 *
 * @param owner   GitHub owner (org or user)
 * @param repo    Repository name
 * @param opts    Optional branch and model overrides
 */
export async function runCiHealingCycle(
  owner: string,
  repo: string,
  opts: { branch?: string; model?: string } = {}
): Promise<CiFixResult> {
  const skill = await loadGhFixCi();
  const result = await skill.runCiFixWorkflow(owner, repo, opts);

  if (result.skipped) {
    log.info({ owner, repo, reason: result.reason }, "CI fix skipped");
  } else if (result.pr_url) {
    log.info({ owner, repo, pr_url: result.pr_url }, "CI fix PR opened");
  } else {
    await escalate(`CI fix for ${owner}/${repo} failed — no PR created`, { result });
  }

  return result as CiFixResult;
}

/**
 * Collect error logs from the Supabase incident table for the last N minutes.
 * Convenience helper for the Inngest cron function.
 *
 * @param windowMinutes   Look-back window in minutes (default: 30)
 */
export async function collectRecentErrorLogs(windowMinutes = 30): Promise<ErrorLogEntry[]> {
  const db = supabase();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { data } = await db
    .from("error_logs")
    .select("source, message, stack, timestamp")
    .gte("timestamp", since)
    .order("timestamp", { ascending: false })
    .limit(500);

  return (data ?? []) as ErrorLogEntry[];
}
