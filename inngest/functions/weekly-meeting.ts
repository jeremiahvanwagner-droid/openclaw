/**
 * Weekly Inter-Division Meeting
 * OpenClaw Multi-Agent Network
 * Truth J Blue LLC
 *
 * Runs every Friday at 4 PM ET.
 * - Fans out KPI collection to all 9 division heads
 * - Collects pod reports from 10 pod leads
 * - Synthesizes executive briefing
 * - Assigns cross-division tasks
 * - Delivers via Telegram
 */

import { DIVISION_HEADS, inngest, POD_LEADS } from "../client";
import { supabase } from "../../lib/agent-memory.js";
import { logger } from "../../lib/logger";

const log = logger.child({ module: "weekly-meeting" });

// Supabase singleton is imported from agent-memory.js

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface DivisionKPI {
  division: string;
  head: string;
  revenue: number;
  leads: number;
  conversions: number;
  active_tasks: number;
  completed_tasks: number;
  agent_health: { healthy: number; degraded: number; offline: number };
  highlights: string[];
  blockers: string[];
}

interface PodReport {
  pod_id: string;
  lead: string;
  tasks_completed: number;
  tasks_pending: number;
  escalations: number;
  cross_division_handoffs: number;
}

interface MeetingSummary {
  week_of: string;
  total_revenue: number;
  total_leads: number;
  total_conversions: number;
  division_kpis: DivisionKPI[];
  pod_reports: PodReport[];
  cross_division_tasks: CrossDivisionTask[];
  executive_highlights: string[];
  action_items: string[];
}

interface CrossDivisionTask {
  id: string;
  from_division: string;
  to_division: string;
  description: string;
  priority: "low" | "normal" | "high" | "critical";
  assigned_agent: string;
  due_by: string;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Collect Division KPIs from Supabase
// ═══════════════════════════════════════════════════════════════════

async function collectDivisionKPI(division: string, head: string, weekStart: string): Promise<DivisionKPI> {
  const fnLog = log.child({ division, head });

  // Query agent events for this division in the past week
  const { data: events, error: eventsErr } = await supabase
    .from("agent_events")
    .select("event_name, source_agent, payload, created_at")
    .gte("created_at", weekStart)
    .or(`source_agent.like.${division.split("_")[1]}_%,target_division.eq.${division}`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (eventsErr) {
    fnLog.error({ err: eventsErr }, "Failed to query division events");
  }

  const eventsList = events ?? [];

  // Query agent health for this division
  const { data: health } = await supabase
    .from("agent_heartbeats")
    .select("agent_id, status")
    .like("agent_id", `${division.split("_")[1]}_%`);

  const healthList = health ?? [];
  const agentHealth = {
    healthy: healthList.filter(h => h.status === "alive").length,
    degraded: healthList.filter(h => h.status === "degraded").length,
    offline: healthList.filter(h => h.status !== "alive" && h.status !== "degraded").length,
  };

  // Count completed tasks (agent/invoke events with success)
  const completedTasks = eventsList.filter(e => e.event_name === "task_completed").length;
  const activeTasks = eventsList.filter(e => e.event_name === "agent/invoke").length;

  // Revenue events
  const revenueEvents = eventsList.filter(e =>
    e.event_name === "revenue.milestone" ||
    (e.payload as Record<string, unknown>)?.amount !== undefined
  );
  const revenue = revenueEvents.reduce((sum, e) => sum + (Number((e.payload as Record<string, unknown>)?.amount) || 0), 0);

  // Lead events
  const leads = eventsList.filter(e => e.event_name === "lead.qualified").length;

  // Conversion events
  const conversions = eventsList.filter(e =>
    e.event_name === "ghl/opportunity.stage_changed" &&
    (e.payload as Record<string, unknown>)?.new_stage === "won"
  ).length;

  // Extract highlights and blockers from escalation events
  const escalations = eventsList.filter(e => e.event_name === "agent/escalate");
  const blockers = escalations.slice(0, 3).map(e =>
    String((e.payload as Record<string, unknown>)?.reason || "Escalation logged")
  );

  const highlights: string[] = [];
  if (revenue > 0) highlights.push(`Revenue: $${revenue.toLocaleString()}`);
  if (leads > 0) highlights.push(`${leads} qualified leads`);
  if (conversions > 0) highlights.push(`${conversions} conversions`);
  if (completedTasks > 0) highlights.push(`${completedTasks} tasks completed`);

  return {
    division,
    head,
    revenue,
    leads,
    conversions,
    active_tasks: activeTasks,
    completed_tasks: completedTasks,
    agent_health: agentHealth,
    highlights,
    blockers,
  };
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Collect Pod Report
// ═══════════════════════════════════════════════════════════════════

async function collectPodReport(podId: string, lead: string, weekStart: string): Promise<PodReport> {
  const { data: events } = await supabase
    .from("agent_events")
    .select("event_name, payload")
    .gte("created_at", weekStart)
    .eq("source_agent", lead)
    .limit(200);

  const eventsList = events ?? [];

  return {
    pod_id: podId,
    lead,
    tasks_completed: eventsList.filter(e => e.event_name === "task_completed").length,
    tasks_pending: eventsList.filter(e => e.event_name === "agent/invoke").length,
    escalations: eventsList.filter(e => e.event_name === "agent/escalate").length,
    cross_division_handoffs: eventsList.filter(e =>
      (e.payload as Record<string, unknown>)?.target_division !== undefined
    ).length,
  };
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Format executive briefing for Telegram
// ═══════════════════════════════════════════════════════════════════

function formatExecutiveBriefing(summary: MeetingSummary): string {
  const lines: string[] = [
    `📊 *WEEKLY EXECUTIVE BRIEFING*`,
    `Week of ${summary.week_of}`,
    ``,
    `💰 *Revenue:* $${summary.total_revenue.toLocaleString()}`,
    `📈 *Leads:* ${summary.total_leads}`,
    `✅ *Conversions:* ${summary.total_conversions}`,
    ``,
    `*── Division Reports ──*`,
  ];

  for (const kpi of summary.division_kpis) {
    const divName = kpi.division.replace(/^division_\d+_/, "").replaceAll("_", " ");
    const healthIcon = kpi.agent_health.offline > 0 ? "🔴" : kpi.agent_health.degraded > 0 ? "🟡" : "🟢";
    lines.push(`${healthIcon} *${divName}*`);
    if (kpi.highlights.length > 0) {
      lines.push(`  ${kpi.highlights.join(" | ")}`);
    }
    if (kpi.blockers.length > 0) {
      lines.push(`  ⚠️ ${kpi.blockers[0]}`);
    }
  }

  if (summary.cross_division_tasks.length > 0) {
    lines.push(``, `*── Cross-Division Tasks ──*`);
    for (const task of summary.cross_division_tasks) {
      lines.push(`• [${task.priority.toUpperCase()}] ${task.description}`);
      lines.push(`  ${task.from_division.replace(/^division_\d+_/, "")} → ${task.to_division.replace(/^division_\d+_/, "")} (${task.assigned_agent})`);
    }
  }

  if (summary.action_items.length > 0) {
    lines.push(``, `*── Action Items ──*`);
    for (const item of summary.action_items) {
      lines.push(`• ${item}`);
    }
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// WEEKLY MEETING — Cron: Every Friday at 4 PM ET (UTC-5 = 21:00 UTC)
// ═══════════════════════════════════════════════════════════════════

export const weeklyInterDivisionMeeting = inngest.createFunction(
  {
    id: "weekly-interdivision-meeting",
    name: "Weekly Inter-Division Executive Meeting",
    retries: 2,
    triggers: [{ cron: "0 21 * * 5" }], // Friday 4 PM ET (21:00 UTC)
  },
  async ({ step }) => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartISO = weekStart.toISOString();
    const weekOfStr = now.toISOString().split("T")[0];

    log.info({ week_of: weekOfStr }, "Starting weekly inter-division meeting");

    // ── Step 1: Fan out KPI collection to all 9 divisions ──
    const divisionKPIs = await step.run("collect-division-kpis", async () => {
      const results: DivisionKPI[] = [];
      for (const [division, head] of Object.entries(DIVISION_HEADS)) {
        const kpi = await collectDivisionKPI(division, head, weekStartISO);
        results.push(kpi);
      }
      return results;
    });

    // ── Step 2: Collect pod reports from all 10 pod leads ──
    const podReports = await step.run("collect-pod-reports", async () => {
      const results: PodReport[] = [];
      for (const [podId, lead] of Object.entries(POD_LEADS)) {
        const report = await collectPodReport(podId, lead, weekStartISO);
        results.push(report);
      }
      return results;
    });

    // ── Step 3: Identify cross-division tasks ──
    const crossDivisionTasks = await step.run("identify-cross-division-tasks", async () => {
      const { data: pendingTasks } = await supabase
        .from("agent_events")
        .select("*")
        .gte("created_at", weekStartISO)
        .not("target_division", "is", null)
        .order("created_at", { ascending: false })
        .limit(20);

      const tasks: CrossDivisionTask[] = (pendingTasks ?? []).map((t, i) => ({
        id: `task-${weekOfStr}-${i + 1}`,
        from_division: String((t.payload as Record<string, unknown>)?.source_division || t.source_agent?.split("_")[0] || "unknown"),
        to_division: String(t.target_division),
        description: String((t.payload as Record<string, unknown>)?.description || t.event_name),
        priority: (t.priority as CrossDivisionTask["priority"]) || "normal",
        assigned_agent: String(t.target_agent || "unassigned"),
        due_by: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      }));

      return tasks;
    });

    // ── Step 4: Synthesize executive summary ──
    const summary = await step.run("synthesize-summary", async () => {
      const totalRevenue = divisionKPIs.reduce((s: number, d: DivisionKPI) => s + d.revenue, 0);
      const totalLeads = divisionKPIs.reduce((s: number, d: DivisionKPI) => s + d.leads, 0);
      const totalConversions = divisionKPIs.reduce((s: number, d: DivisionKPI) => s + d.conversions, 0);

      const executiveHighlights: string[] = [];
      const actionItems: string[] = [];

      // Identify top performing division
      const topDiv = [...divisionKPIs].sort((a, b) => b.revenue - a.revenue)[0];
      if (topDiv && topDiv.revenue > 0) {
        executiveHighlights.push(
          `Top revenue: ${topDiv.division.replace(/^division_\d+_/, "")} ($${topDiv.revenue.toLocaleString()})`
        );
      }

      // Identify divisions with offline agents
      for (const kpi of divisionKPIs) {
        if (kpi.agent_health.offline > 0) {
          actionItems.push(
            `Investigate ${kpi.agent_health.offline} offline agents in ${kpi.division.replace(/^division_\d+_/, "")}`
          );
        }
      }

      // Identify divisions with blockers
      for (const kpi of divisionKPIs) {
        if (kpi.blockers.length > 0) {
          actionItems.push(
            `Resolve blockers in ${kpi.division.replace(/^division_\d+_/, "")}: ${kpi.blockers[0]}`
          );
        }
      }

      // Pod health check
      const totalPodEscalations = podReports.reduce((s: number, p: PodReport) => s + p.escalations, 0);
      if (totalPodEscalations > 5) {
        actionItems.push(`${totalPodEscalations} pod escalations this week — review escalation patterns`);
      }

      const meetingSummary: MeetingSummary = {
        week_of: weekOfStr,
        total_revenue: totalRevenue,
        total_leads: totalLeads,
        total_conversions: totalConversions,
        division_kpis: divisionKPIs,
        pod_reports: podReports,
        cross_division_tasks: crossDivisionTasks,
        executive_highlights: executiveHighlights,
        action_items: actionItems,
      };

      return meetingSummary;
    });

    // ── Step 5: Store meeting record ──
    await step.run("store-meeting-record", async () => {
      const { error } = await supabase.from("agent_events").insert({
        event_name: "weekly_meeting.completed",
        source_agent: "shared_exec_orchestrator",
        payload: summary,
        priority: "high",
        metadata: { week_of: weekOfStr, type: "executive_briefing" },
      });

      if (error) {
        log.error({ err: error }, "Failed to store meeting record");
      }
    });

    // ── Step 6: Send executive briefing via Telegram ──
    await step.sendEvent("send-executive-briefing", {
      name: "alert/telegram",
      data: {
        channel: "executive",
        message: formatExecutiveBriefing(summary),
        priority: "normal",
        agent_id: "shared_exec_orchestrator",
      },
    });

    // ── Step 7: Dispatch cross-division tasks to assigned agents ──
    if (crossDivisionTasks.length > 0) {
      await step.run("dispatch-cross-division-tasks", async () => {
        for (const task of crossDivisionTasks) {
          if (task.assigned_agent !== "unassigned") {
            await supabase.from("agent_events").insert({
              event_name: "cross_division_task.assigned",
              source_agent: "shared_exec_orchestrator",
              target_agent: task.assigned_agent,
              target_division: task.to_division,
              payload: task,
              priority: task.priority,
            });
          }
        }
      });
    }

    log.info(
      {
        week_of: weekOfStr,
        divisions: divisionKPIs.length,
        pods: podReports.length,
        cross_tasks: crossDivisionTasks.length,
        revenue: summary.total_revenue,
      },
      "Weekly meeting completed"
    );

    return {
      status: "completed",
      week_of: weekOfStr,
      divisions_reported: divisionKPIs.length,
      pods_reported: podReports.length,
      cross_division_tasks: crossDivisionTasks.length,
      total_revenue: summary.total_revenue,
      total_leads: summary.total_leads,
    };
  },
);

// ═══════════════════════════════════════════════════════════════════
// ON-DEMAND MEETING — Trigger via event for ad-hoc executive review
// ═══════════════════════════════════════════════════════════════════

export const onDemandMeeting = inngest.createFunction(
  {
    id: "on-demand-meeting",
    name: "On-Demand Executive Meeting",
    retries: 1,
    idempotency: "event.id",
    triggers: [{ event: "meeting/executive.request" }],
  },
  async ({ event, step }) => {
    const { requested_by, focus_divisions, lookback_days = 7 } = event.data;

    log.info({ requested_by, focus_divisions, lookback_days }, "On-demand meeting requested");

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - lookback_days);
    const weekStartISO = weekStart.toISOString();

    const divisions = focus_divisions ?? Object.keys(DIVISION_HEADS);

    const kpis = await step.run("collect-kpis", async () => {
      const results: DivisionKPI[] = [];
      for (const div of divisions) {
        const head = DIVISION_HEADS[div] ?? "shared_exec_orchestrator";
        results.push(await collectDivisionKPI(div, head, weekStartISO));
      }
      return results;
    });

    const totalRevenue = kpis.reduce((s: number, d: DivisionKPI) => s + d.revenue, 0);

    await step.sendEvent("send-briefing", {
      name: "alert/telegram",
      data: {
        channel: "executive",
        message: formatExecutiveBriefing({
          week_of: now.toISOString().split("T")[0],
          total_revenue: totalRevenue,
          total_leads: kpis.reduce((s: number, d: DivisionKPI) => s + d.leads, 0),
          total_conversions: kpis.reduce((s: number, d: DivisionKPI) => s + d.conversions, 0),
          division_kpis: kpis,
          pod_reports: [],
          cross_division_tasks: [],
          executive_highlights: [`On-demand report requested by ${requested_by}`],
          action_items: [],
        }),
        priority: "normal",
        agent_id: requested_by,
      },
    });

    return { status: "completed", divisions: kpis.length, revenue: totalRevenue };
  },
);
