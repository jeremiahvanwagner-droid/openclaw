/**
 * Agent Orchestrator Functions
 * Open Claw Multi-Agent Network
 *
 * Core Inngest functions for:
 * - Cross-division event routing
 * - Escalation handling
 * - Health monitoring
 * - Telegram alerting
 */

import { agentTaskName, getDivisionHead, getPodLead, inngest, podTaskName } from "../client";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { reportFailure as governorReportFailure } from "../../lib/api-rate-governor";
import { logger } from "../../lib/logger";

const log = logger.child({ module: "agent-orchestrator" });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ═══════════════════════════════════════════════════════════════════
// AGENT INVOKE ROUTER
// Routes tasks to specific agents or division heads
// ═══════════════════════════════════════════════════════════════════
export const agentInvoke = inngest.createFunction(
  {
    id: "agent-invoke",
    name: "Agent Invoke Router",
    retries: 3,
  },
  { event: "agent/invoke" },
  async ({ event, step }) => {
    const {
      source_agent,
      target_agent,
      target_division,
      payload,
      priority = "normal",
      correlation_id,
    } = event.data;

    // Generate or inherit trace_id for cross-division tracing
    const trace_id = (payload as Record<string, unknown>)?.trace_id as string || correlation_id || randomUUID();
    const fnLog = log.child({ trace_id, source_agent, target_agent });

    // Step 1: Log the event
    const eventId = await step.run("log-event", async () => {
      const { data, error } = await supabase
        .from("agent_events")
        .insert({
          event_name: "agent/invoke",
          source_agent,
          target_agent,
          target_division,
          payload,
          priority,
          correlation_id,
          metadata: { trace_id },
        })
        .select("id")
        .single();

      if (error) {
        log.error({ err: error }, "Failed to log event");
        throw error;
      }

      return data.id;
    });

    // Step 1.5: Update heartbeat for source_agent
    await step.run("update-heartbeat", async () => {
      const { error } = await supabase.rpc("update_agent_heartbeat", { p_agent_id: source_agent });
      if (error) {
        log.error({ agentId: source_agent, err: error }, "Failed to update heartbeat");
      }
    });

    // Step 1.7: Autonomy gating — check if this action requires escalation
    const actionDomain = (payload as Record<string, unknown>)?.action_domain as string | undefined;
    if (actionDomain) {
      const ESCALATE_DOMAINS = ["finance", "credential_changes", "destructive_actions", "legal_compliance", "irreversible_account_actions"];
      if (ESCALATE_DOMAINS.includes(actionDomain)) {
        // Route to shared_exec_orchestrator for approval instead of direct execution
        await step.run("log-gated-action", async () => {
          await supabase.from("agent_events").insert({
            event_name: "gated_action_request",
            source_agent,
            target_agent: target_agent || "unknown",
            payload: { action_domain: actionDomain, original_payload: payload, correlation_id },
            priority: "critical",
          });
        });

        await step.sendEvent("route-to-gating", {
          name: "agent/shared_exec_orchestrator/task",
          data: {
            type: "gated_action",
            source: source_agent,
            action_domain: actionDomain,
            original_target: target_agent,
            correlation_id: correlation_id || eventId,
            trace_id,
            ...payload,
          },
        });

        return {
          success: true,
          gated: true,
          routed_to: "shared_exec_orchestrator",
          action_domain: actionDomain,
          event_id: eventId,
        };
      }
    }

    // Step 1.8: Pod quarantine check — reject work for quarantined pods
    if (target_agent) {
      const quarantineStatus = await step.run("check-quarantine", async () => {
        const { data } = await supabase
          .from("agents")
          .select("status, pod_id")
          .eq("agent_id", target_agent)
          .single();
        return data;
      });

      if (quarantineStatus?.status === "quarantined") {
        await step.run("log-quarantine-reject", async () => {
          await supabase.from("agent_events").insert({
            event_name: "quarantine_reject",
            source_agent,
            target_agent,
            payload: { reason: "target pod is quarantined", pod_id: quarantineStatus.pod_id },
            priority: "high",
          });
        });

        return {
          success: false,
          rejected: true,
          reason: "quarantined",
          pod_id: quarantineStatus.pod_id,
          event_id: eventId,
        };
      }
    }

    // Step 2: Route to specific agent
    if (target_agent) {
      // Resolve pod_id from registry for pod-aware routing
      const agentPod = await step.run("resolve-pod", async () => {
        const { data } = await supabase
          .from("agents")
          .select("pod_id")
          .eq("agent_id", target_agent)
          .single();
        return data?.pod_id || null;
      });

      // If target is in a pod, route through pod lead
      if (agentPod && agentPod !== "shared" && getPodLead(agentPod)) {
        const podLead = getPodLead(agentPod)!;
        await step.sendEvent("route-via-pod", {
          name: podTaskName(agentPod),
          data: {
            type: "invoke",
            pod_id: agentPod,
            source: source_agent,
            queue_class: (priority === "critical" ? "P1" : "P2") as "P0" | "P1" | "P2" | "P3",
            correlation_id: correlation_id || eventId,
            trace_id,
            payload: { ...payload, target_agent, routed_through: podLead },
          },
        });

        return {
          success: true,
          routed_to: podLead,
          final_target: target_agent,
          pod_id: agentPod,
          event_id: eventId,
        };
      }

      // Direct routing for shared agents or agents without a pod
      await step.sendEvent("route-to-agent", {
        name: agentTaskName(target_agent),
        data: {
          type: "invoke",
          source: source_agent,
          correlation_id: correlation_id || eventId,
          trace_id,
          ...payload,
        },
      });

      return {
        success: true,
        routed_to: target_agent,
        event_id: eventId,
      };
    }

    // Step 3: Route to division head (legacy) or pod lead
    if (target_division) {
      const divisionHead = getDivisionHead(target_division);

      await step.sendEvent("route-to-division", {
        name: agentTaskName(divisionHead),
        data: {
          type: "division_invoke",
          source: source_agent,
          source_division: target_division,
          correlation_id: correlation_id || eventId,
          trace_id,
          ...payload,
        },
      });

      return {
        success: true,
        routed_to: divisionHead,
        target_division,
        event_id: eventId,
      };
    }

    throw new Error("Must specify either target_agent or target_division");
  }
);

// ═══════════════════════════════════════════════════════════════════
// AGENT ESCALATION HANDLER
// Manages escalation chains with retry logic and fallback to CEO
// ═══════════════════════════════════════════════════════════════════
export const agentEscalate = inngest.createFunction(
  {
    id: "agent-escalate",
    name: "Agent Escalation Handler",
    retries: 2,
  },
  { event: "agent/escalate" },
  async ({ event, step }) => {
    const {
      source_agent,
      escalation_path,
      payload,
      retry_count = 0,
      reason,
    } = event.data;

    const MAX_RETRIES = 3;
    const trace_id = (payload as Record<string, unknown>)?.trace_id as string || randomUUID();
    const escLog = log.child({ trace_id, source_agent, escalation_path });

    // Step 1: Log escalation event
    await step.run("log-escalation", async () => {
      await supabase.from("agent_events").insert({
        event_name: "agent/escalate",
        source_agent,
        target_agent: escalation_path,
        payload: { ...payload, reason, retry_count },
        priority: "high",
        metadata: { trace_id },
      });
    });

    // Step 2: Get agent's configured escalation path if not provided
    const nextAgent = await step.run("get-escalation-target", async () => {
      if (escalation_path) return escalation_path;

      const { data: agent } = await supabase
        .from("agents")
        .select("config")
        .eq("agent_id", source_agent)
        .single();

      return agent?.config?.escalation_path || "shared_exec_orchestrator";
    });

    // Step 3: Check if we've exceeded retry limit
    if (retry_count >= MAX_RETRIES) {
      // Final fallback to shared executive orchestrator
      await step.sendEvent("escalate-to-exec-fallback", {
        name: "agent/shared_exec_orchestrator/task",
        data: {
          type: "escalation_fallback",
          original_source: source_agent,
          attempted_path: nextAgent,
          retry_count,
          reason: `Escalation chain exhausted after ${MAX_RETRIES} retries`,
          payload,
        },
      });

      // Alert via Telegram
      await step.sendEvent("alert-escalation-fallback", {
        name: "alert/telegram",
        data: {
          channel: "ops",
          priority: "urgent",
          message: `🚨 ESCALATION FALLBACK\n\nAgent: ${source_agent}\nReason: ${reason || "Unknown"}\nAttempted path: ${nextAgent}\nRetries: ${retry_count}\n\nFallback to shared_exec_orchestrator triggered.`,
        },
      });

      return {
        success: false,
        fallback: true,
        routed_to: "shared_exec_orchestrator",
      };
    }

    // Step 4: Check if target agent is healthy (respects heartbeat_policy)
    const targetStatus = await step.run("check-target-health", async () => {
      const { data: targetAgent } = await supabase
        .from("agents")
        .select("status, last_heartbeat_at, heartbeat_policy, agent_class")
        .eq("agent_id", nextAgent)
        .single();

      if (!targetAgent) return "not_found";

      // Quarantined agents are never healthy
      if (targetAgent.status === "quarantined") return "quarantined";

      // Advisory agents with heartbeat_policy=none are considered available if status is active
      if (targetAgent.heartbeat_policy === "none") {
        return targetAgent.status === "active" ? "healthy" : "unhealthy";
      }

      const now = Date.now();
      const lastHeartbeat = targetAgent.last_heartbeat_at
        ? new Date(targetAgent.last_heartbeat_at).getTime()
        : 0;
      // 30 minutes for supervisors, 60 minutes for workers
      const staleThreshold = targetAgent.agent_class === "supervisor" ? 30 * 60 * 1000 : 60 * 60 * 1000;
      const isStale = now - lastHeartbeat > staleThreshold;

      if (targetAgent.status === "active" && !isStale) {
        return "healthy";
      }

      return "unhealthy";
    });

    // Step 5: Route based on target health
    if (targetStatus === "healthy") {
      await step.sendEvent("escalate-to-target", {
        name: agentTaskName(nextAgent),
        data: {
          type: "escalation",
          source: source_agent,
          reason,
          payload,
        },
      });

      return {
        success: true,
        routed_to: nextAgent,
      };
    }

    // Step 6: Target unhealthy, retry with incremented count
    await step.sendEvent("retry-escalation", {
      name: "agent/escalate",
      data: {
        source_agent,
        escalation_path: undefined, // Will fetch from agent config
        payload,
        retry_count: retry_count + 1,
        reason: `Previous target ${nextAgent} is ${targetStatus}`,
      },
    });

    return {
      success: false,
      retry: true,
      retry_count: retry_count + 1,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// HOURLY HEALTH CHECK
// Monitors all agents and reports summary
// ═══════════════════════════════════════════════════════════════════
export const agentHealthCheck = inngest.createFunction(
  {
    id: "agent-health-check",
    name: "Hourly Agent Health Check",
  },
  { cron: "0 * * * *" }, // Every hour
  async ({ step }) => {
    // Step 1: Fetch supervisors with always_on heartbeat policy
    const agents = await step.run("fetch-agents", async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("agent_id, org_unit, pod_id, status, last_heartbeat_at, display_name, agent_class, heartbeat_policy, criticality")
        .in("heartbeat_policy", ["always_on", "on_run"]);

      if (error) throw error;
      return data || [];
    });

    // Step 2: Calculate health summary (pod-aware)
    const healthSummary = await step.run("calculate-health", async () => {
      const summary = {
        total_agents: agents.length,
        healthy: 0,
        degraded: 0,
        offline: 0,
        pods: {} as Record<string, { healthy: number; degraded: number; pod_lead_status: string }>,
        unhealthy_supervisors: [] as string[],
        unhealthy_workers: [] as string[],
      };

      const now = Date.now();
      const SUPERVISOR_STALE = 30 * 60 * 1000; // 30 minutes for supervisors
      const WORKER_STALE = 60 * 60 * 1000; // 60 minutes for workers

      for (const agent of agents) {
        const staleThreshold = agent.agent_class === "supervisor" ? SUPERVISOR_STALE : WORKER_STALE;
        const isStale =
          !agent.last_heartbeat_at ||
          now - new Date(agent.last_heartbeat_at).getTime() > staleThreshold;

        const podId = agent.pod_id || "unassigned";
        if (!summary.pods[podId]) {
          summary.pods[podId] = { healthy: 0, degraded: 0, pod_lead_status: "unknown" };
        }

        if (agent.agent_class === "supervisor" && agent.agent_id.endsWith("_pod_lead")) {
          summary.pods[podId].pod_lead_status = isStale ? "stale" : (agent.status || "unknown");
        }

        if (agent.status === "active" && !isStale) {
          summary.healthy++;
          summary.pods[podId].healthy++;
        } else if (agent.status === "degraded" || isStale) {
          summary.degraded++;
          summary.pods[podId].degraded++;
          if (agent.agent_class === "supervisor") {
            summary.unhealthy_supervisors.push(agent.agent_id);
          } else {
            summary.unhealthy_workers.push(agent.agent_id);
          }
        } else {
          summary.offline++;
          if (agent.agent_class === "supervisor") {
            summary.unhealthy_supervisors.push(agent.agent_id);
          } else {
            summary.unhealthy_workers.push(agent.agent_id);
          }
        }
      }

      return summary;
    });

    // Step 3: Emit health summary event
    await step.sendEvent("emit-health-summary", {
      name: "agent/health.summary",
      data: {
        ...healthSummary,
        timestamp: new Date().toISOString(),
      },
    });

    // Step 4: Record metrics
    await step.run("record-metrics", async () => {
      await supabase.from("agent_metrics").insert([
        {
          agent_id: "shared_runtime_ops",
          metric_type: "health_check_total",
          metric_value: healthSummary.total_agents,
        },
        {
          agent_id: "shared_runtime_ops",
          metric_type: "health_check_healthy",
          metric_value: healthSummary.healthy,
        },
        {
          agent_id: "shared_runtime_ops",
          metric_type: "health_check_degraded",
          metric_value: healthSummary.degraded,
        },
        {
          agent_id: "shared_runtime_ops",
          metric_type: "health_check_offline",
          metric_value: healthSummary.offline,
        },
      ]);
    });

    // Step 5: Alert only for supervisor issues (workers are expected to be ephemeral)
    if (healthSummary.unhealthy_supervisors.length > 0) {
      await step.sendEvent("alert-health-issue", {
        name: "alert/telegram",
        data: {
          channel: "ops",
          priority: "urgent",
          message: `⚠️ Supervisor Health Alert\n\n📊 Summary:\n- Monitored: ${healthSummary.total_agents}\n- Healthy: ${healthSummary.healthy}\n- Degraded: ${healthSummary.degraded}\n- Offline: ${healthSummary.offline}\n\n🔴 Unhealthy supervisors:\n${healthSummary.unhealthy_supervisors.join("\n")}\n\n📦 Pod status:\n${Object.entries(healthSummary.pods).map(([p, s]) => `${p}: lead=${s.pod_lead_status} ok=${s.healthy} deg=${s.degraded}`).join("\n")}`,
        },
      });
    }

    return healthSummary;
  }
);

// ═══════════════════════════════════════════════════════════════════
// TELEGRAM ALERT HANDLER
// Sends formatted alerts to Telegram
// ═══════════════════════════════════════════════════════════════════
export const telegramAlert = inngest.createFunction(
  {
    id: "telegram-alert",
    name: "Telegram Alert Handler",
    retries: 2,
  },
  { event: "alert/telegram" },
  async ({ event, step }) => {
    const { channel, message, priority = "normal", agent_id } = event.data;

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      log.error("Telegram credentials not configured");
      return { success: false, error: "Missing credentials" };
    }

    // Format message
    const emoji = priority === "urgent" ? "🚨" : "🤖";
    const header = agent_id ? `${emoji} *${agent_id}*\n\n` : `${emoji} *System Alert*\n\n`;
    const formattedMessage = header + message;

    // Send to Telegram
    const result = await step.run("send-telegram", async () => {
      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: formattedMessage,
            parse_mode: "Markdown",
            disable_notification: priority === "normal",
          }),
        }
      );

      const data = await response.json();
      return data;
    });

    // Log the alert
    await step.run("log-alert", async () => {
      await supabase.from("agent_events").insert({
        event_name: "alert/telegram",
        source_agent: agent_id || "system",
        payload: { channel, message, priority },
        priority: priority === "urgent" ? "critical" : "normal",
      });
    });

    return {
      success: result.ok,
      message_id: result.result?.message_id,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// POD QUARANTINE HANDLER
// Quarantines a pod when its lead loses heartbeat or integration fails
// ═══════════════════════════════════════════════════════════════════
export const podQuarantine = inngest.createFunction(
  {
    id: "pod-quarantine",
    name: "Pod Quarantine Handler",
    retries: 1,
  },
  { event: "pod/*/quarantine" },
  async ({ event, step }) => {
    const { pod_id, reason, triggered_by } = event.data;

    // Step 1: Set pod lead to quarantined
    const podLead = `${pod_id}_pod_lead`;
    await step.run("quarantine-pod-lead", async () => {
      await supabase
        .from("agents")
        .update({ status: "quarantined", updated_at: new Date().toISOString() })
        .eq("agent_id", podLead);
    });

    // Step 2: Suspend all active workers in this pod
    const suspended = await step.run("suspend-pod-workers", async () => {
      const { data } = await supabase
        .from("agent_sessions")
        .update({ status: "suspended" })
        .eq("pod_id", pod_id)
        .eq("status", "active")
        .neq("agent_id", podLead)
        .select("agent_id");

      return data?.map((r: { agent_id: string }) => r.agent_id) || [];
    });

    // Step 3: Log the quarantine event
    await step.run("log-quarantine", async () => {
      await supabase.from("agent_events").insert({
        event_name: "pod/quarantine",
        source_agent: triggered_by,
        target_agent: podLead,
        payload: { pod_id, reason, suspended_workers: suspended },
        priority: "critical",
      });
    });

    // Step 4: Write health snapshot
    await step.run("write-health-snapshot", async () => {
      await supabase.from("health_snapshots").insert({
        snapshot_type: "pod",
        pod_id,
        status: "quarantined",
        summary: { reason, triggered_by, suspended_workers: suspended.length },
      });
    });

    // Step 5: Alert via Telegram
    await step.sendEvent("alert-quarantine", {
      name: "alert/telegram",
      data: {
        channel: "ops",
        priority: "urgent",
        message: `🔒 POD QUARANTINED\n\nPod: ${pod_id}\nPod Lead: ${podLead}\nReason: ${reason}\nTriggered by: ${triggered_by}\nWorkers suspended: ${suspended.length}\n\nAll outbound actions for this pod are halted.`,
      },
    });

    return {
      quarantined: true,
      pod_id,
      pod_lead: podLead,
      suspended_workers: suspended,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// POD RESTORE HANDLER
// Restores a quarantined pod after health is confirmed
// ═══════════════════════════════════════════════════════════════════
export const podRestore = inngest.createFunction(
  {
    id: "pod-restore",
    name: "Pod Restore Handler",
    retries: 1,
  },
  { event: "pod/*/restore" as any },
  async ({ event, step }) => {
    const { pod_id, restored_by } = event.data as { pod_id: string; restored_by: string };

    // Step 1: Restore pod lead
    const podLead = `${pod_id}_pod_lead`;
    await step.run("restore-pod-lead", async () => {
      await supabase
        .from("agents")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("agent_id", podLead)
        .eq("status", "quarantined");
    });

    // Step 2: Log restoration
    await step.run("log-restore", async () => {
      await supabase.from("agent_events").insert({
        event_name: "pod/restore",
        source_agent: restored_by,
        target_agent: podLead,
        payload: { pod_id },
        priority: "high",
      });
    });

    // Step 3: Write health snapshot
    await step.run("write-restore-snapshot", async () => {
      await supabase.from("health_snapshots").insert({
        snapshot_type: "pod",
        pod_id,
        status: "healthy",
        summary: { restored_by, restored_at: new Date().toISOString() },
      });
    });

    // Step 4: Alert
    await step.sendEvent("alert-restore", {
      name: "alert/telegram",
      data: {
        channel: "ops",
        priority: "normal",
        message: `✅ POD RESTORED\n\nPod: ${pod_id}\nRestored by: ${restored_by}\n\nOutbound actions resumed.`,
      },
    });

    return { restored: true, pod_id };
  }
);

// ═══════════════════════════════════════════════════════════════════
// CREDENTIAL HEALTH CHECK
// Verifies API tokens are still valid and alerts before expiration
// ═══════════════════════════════════════════════════════════════════
export const credentialHealthCheck = inngest.createFunction(
  {
    id: "credential-health-check",
    name: "Credential Health Check",
    retries: 1,
  },
  { event: "credential/health.check" },
  async ({ event, step }) => {
    // Step 1: Check GHL token validity with a lightweight API call
    const ghlStatus = await step.run("check-ghl-token", async () => {
      const token = process.env.GHL_ACCESS_TOKEN;
      if (!token) {
        return { service: "gohighlevel", status: "missing" as const, error: "GHL_ACCESS_TOKEN not set" };
      }

      try {
        const baseUrl = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
        const resp = await fetch(`${baseUrl}/locations/search?limit=1`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
        });

        if (resp.status === 401) {
          return { service: "gohighlevel", status: "expired" as const, error: "Token returned 401 Unauthorized" };
        }
        if (!resp.ok) {
          return { service: "gohighlevel", status: "error" as const, error: `HTTP ${resp.status}` };
        }
        return { service: "gohighlevel", status: "valid" as const };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { service: "gohighlevel", status: "error" as const, error: message };
      }
    });

    // Step 2: Update credential_registry in Supabase
    await step.run("update-credential-registry", async () => {
      await supabase
        .from("credential_registry")
        .update({
          last_verified_at: new Date().toISOString(),
          last_verified_status: ghlStatus.status === "missing" ? "error" : ghlStatus.status,
          updated_at: new Date().toISOString(),
        })
        .eq("credential_key", "GHL_ACCESS_TOKEN");
    });

    // Step 3: Check for credentials nearing expiration
    const expiring = await step.run("check-expiring-credentials", async () => {
      const { data } = await supabase.rpc("get_expiring_credentials", { p_days_ahead: 14 });
      return data || [];
    });

    // Step 4: Log event
    await step.run("log-credential-check", async () => {
      await supabase.from("agent_events").insert({
        event_name: "credential/health.check",
        source_agent: "shared_exec_orchestrator",
        payload: {
          checks: [ghlStatus],
          expiring_count: expiring.length,
        },
        priority: ghlStatus.status !== "valid" ? "critical" : "normal",
      });
    });

    // Step 5: Alert if any credential is expired, missing, or nearing expiration
    const problems: string[] = [];
    if (ghlStatus.status !== "valid") {
      problems.push(`GHL Token: ${ghlStatus.status.toUpperCase()} — ${ghlStatus.error || "unknown"}`);
    }
    for (const cred of expiring) {
      const days = Math.round(cred.days_remaining);
      problems.push(`${cred.display_name}: expires in ${days} days`);
    }

    if (problems.length > 0) {
      // Open GHL circuit breaker if token is expired/missing
      if (ghlStatus.status === "expired" || ghlStatus.status === "missing") {
        governorReportFailure("ghl", 401);
      }

      await step.sendEvent("alert-credential-issue", {
        name: "alert/telegram",
        data: {
          channel: "ops",
          priority: ghlStatus.status === "expired" || ghlStatus.status === "missing" ? "urgent" : "normal",
          message: `🔑 CREDENTIAL ALERT\n\n${problems.join("\n")}\n\nAction: Rotate affected tokens in their respective dashboards and update environment variables.`,
        },
      });
    }

    return {
      ghl: ghlStatus,
      expiring_credentials: expiring.length,
      alert_sent: problems.length > 0,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// CROSS-DIVISION: BOOK LAUNCH COORDINATOR
// Triggers cross-promotion when a book is ready for launch
// ═══════════════════════════════════════════════════════════════════
export const bookLaunchReady = inngest.createFunction(
  {
    id: "book-launch-ready",
    name: "Book Launch Cross-Promotion",
  },
  { event: "book.launch.ready" },
  async ({ event, step }) => {
    const { book_id, title, launch_date, author, description } = event.data;

    // Step 1: Notify eCommerce for product listing
    await step.sendEvent("notify-ecommerce", {
      name: "agent/d2_digital_marketing/task",
      data: {
        type: "cross_promote",
        source: "d5_publisher",
        book_id,
        title,
        launch_date,
        author,
        description,
      },
    });

    // Step 2: Notify coaching for community post
    await step.sendEvent("notify-coaching", {
      name: "agent/d4_social_creator/task",
      data: {
        type: "cross_promote",
        source: "d5_publisher",
        book_id,
        title,
        launch_date,
        description,
      },
    });

    // Step 3: Notify nonprofit if mission-aligned
    await step.sendEvent("notify-nonprofit", {
      name: "agent/d6_communications/task",
      data: {
        type: "cross_promote",
        source: "d5_publisher",
        book_id,
        title,
        launch_date,
        description,
      },
    });

    // Step 4: Log coordination
    await step.run("log-coordination", async () => {
      await supabase.from("agent_events").insert({
        event_name: "book.launch.ready",
        source_agent: "d5_publisher",
        target_division: "cross_division",
        payload: { book_id, title, launch_date, notified: ["d2", "d4", "d6"] },
        priority: "high",
      });
    });

    return {
      success: true,
      book_id,
      notified_divisions: ["ecommerce", "coaching", "nonprofit"],
    };
  }
);

// Export all functions
export const functions = [
  agentInvoke,
  agentEscalate,
  agentHealthCheck,
  telegramAlert,
  podQuarantine,
  podRestore,
  credentialHealthCheck,
  bookLaunchReady,
];
