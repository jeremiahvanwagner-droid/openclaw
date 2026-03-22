import { NextResponse } from "next/server";

import { getServiceSupabase, requireAdminUser } from "../../../lib/server-auth";

interface AgentRow {
  agent_id: string;
  org_unit: string | null;
  display_name: string | null;
  status: string;
  last_heartbeat_at: string | null;
  config: {
    role?: string;
    metrics?: {
      events_processed?: number;
      avg_latency_ms?: number;
    };
  } | null;
}

export async function GET() {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await getServiceSupabase();
  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("agent_id, org_unit, display_name, status, last_heartbeat_at, config")
    .order("org_unit", { ascending: true })
    .order("agent_id", { ascending: true });

  if (agentsError) {
    return NextResponse.json({ error: "Failed to load agents" }, { status: 500 });
  }

  const typedAgents = (agents ?? []) as AgentRow[];
  const divisionStats = new Map<
    string,
    { division: string; total: number; active: number; idle: number; error: number }
  >();

  for (const agent of typedAgents) {
    const division = agent.org_unit || "unknown";
    if (!divisionStats.has(division)) {
      divisionStats.set(division, {
        division,
        total: 0,
        active: 0,
        idle: 0,
        error: 0,
      });
    }

    const current = divisionStats.get(division)!;
    current.total += 1;
    if (agent.status === "active") current.active += 1;
    else if (agent.status === "idle") current.idle += 1;
    else if (agent.status === "error") current.error += 1;
  }

  const totalAgents = typedAgents.length;
  const activeAgents = typedAgents.filter((agent) => agent.status === "active").length;
  const recentAgents = typedAgents
    .map((agent) => ({
      agent_id: agent.agent_id,
      division: agent.org_unit || "unknown",
      role: agent.display_name || agent.config?.role || "Agent",
      status: agent.status,
      last_heartbeat: agent.last_heartbeat_at,
      metrics: agent.config?.metrics || {},
    }))
    .sort(
      (left, right) =>
        new Date(right.last_heartbeat || 0).getTime() -
        new Date(left.last_heartbeat || 0).getTime(),
    );

  const { count: totalEvents, error: totalEventsError } = await supabase
    .from("agent_events")
    .select("*", { count: "exact", head: true });
  if (totalEventsError) {
    return NextResponse.json({ error: "Failed to load event totals" }, { status: 500 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentEvents, error: recentEventsError } = await supabase
    .from("agent_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", oneHourAgo);
  if (recentEventsError) {
    return NextResponse.json({ error: "Failed to load hourly events" }, { status: 500 });
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: failedEvents, error: failedEventsError } = await supabase
    .from("agent_events")
    .select("*", { count: "exact", head: true })
    .or("error_message.not.is.null,status.eq.failed")
    .gte("created_at", oneDayAgo);
  if (failedEventsError) {
    return NextResponse.json({ error: "Failed to load failed events" }, { status: 500 });
  }

  return NextResponse.json({
    totalAgents,
    activeAgents,
    divisionStats: Array.from(divisionStats.values()).sort((left, right) =>
      left.division.localeCompare(right.division),
    ),
    recentAgents,
    eventStats: {
      total: totalEvents || 0,
      last_hour: recentEvents || 0,
      failed: failedEvents || 0,
    },
  });
}
