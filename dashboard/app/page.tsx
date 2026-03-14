"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

interface DivisionStats {
  division: string;
  total: number;
  active: number;
  idle: number;
  error: number;
}

interface AgentSummary {
  agent_id: string;
  division: string;
  role: string;
  status: string;
  last_heartbeat: string;
  metrics: {
    events_processed?: number;
    avg_latency_ms?: number;
  };
}

interface EventStats {
  total: number;
  last_hour: number;
  failed: number;
}

const DIVISION_NAMES: Record<string, string> = {
  division_1_core_operations: "D1 • Core Operations",
  division_2_ecommerce: "D2 • eCommerce",
  division_3_consulting: "D3 • Consulting",
  division_4_coaching: "D4 • Coaching",
  division_5_publishing: "D5 • Publishing",
  division_6_nonprofit: "D6 • Nonprofit",
  division_7_shared_services: "D7 • Shared Services",
};

const DIVISION_COLORS: Record<string, string> = {
  division_1_core_operations: "blue",
  division_2_ecommerce: "purple",
  division_3_consulting: "orange",
  division_4_coaching: "pink",
  division_5_publishing: "emerald",
  division_6_nonprofit: "cyan",
  division_7_shared_services: "yellow",
};

function getDivKey(orgUnit: string): string {
  if (orgUnit?.includes("shared")) return "shared";
  const match = orgUnit?.match(/division_(\d)/);
  return match ? `d${match[1]}` : "unknown";
}

function MetricCard({
  value,
  label,
  trend,
  trendUp,
}: {
  value: string | number;
  label: string;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <div className="card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {trend && (
        <div
          className={`text-xs mt-2 ${
            trendUp ? "text-green-400" : "text-red-400"
          }`}
        >
          {trendUp ? "↑" : "↓"} {trend}
        </div>
      )}
    </div>
  );
}

function DivisionCard({ stats }: { stats: DivisionStats }) {
  const divisionKey = getDivKey(stats.division);
  const color = DIVISION_COLORS[stats.division] || "gray";
  const name = DIVISION_NAMES[stats.division] || stats.division;

  return (
    <div className={`card division-${divisionKey}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white">{name}</h3>
        <span className="text-2xl font-bold text-white">{stats.total}</span>
      </div>
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-slate-400">{stats.active} active</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
          <span className="text-slate-400">{stats.idle} idle</span>
        </div>
        {stats.error > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-red-400">{stats.error} error</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentAgentActivity({ agents }: { agents: AgentSummary[] }) {
  return (
    <div className="card">
      <h3 className="card-header">Recent Agent Activity</h3>
      <div className="space-y-3">
        {agents.slice(0, 8).map((agent) => (
          <div
            key={agent.agent_id}
            className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  agent.status === "active"
                    ? "bg-green-500"
                    : agent.status === "idle"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
              ></div>
              <div>
                <div className="text-sm text-white font-medium">
                  {agent.agent_id}
                </div>
                <div className="text-xs text-slate-500">{agent.role}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-400">
                {agent.metrics?.events_processed ?? 0} events
              </div>
              <div className="text-xs text-slate-500">
                {agent.metrics?.avg_latency_ms
                  ? `${agent.metrics.avg_latency_ms}ms avg`
                  : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemHealth({
  eventStats,
}: {
  eventStats: EventStats;
}) {
  const successRate =
    eventStats.total > 0
      ? (((eventStats.total - eventStats.failed) / eventStats.total) * 100).toFixed(1)
      : "100.0";

  return (
    <div className="card">
      <h3 className="card-header">System Health</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Event Success Rate</span>
          <span
            className={`font-semibold ${
              parseFloat(successRate) >= 99
                ? "text-green-400"
                : parseFloat(successRate) >= 95
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {successRate}%
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${
              parseFloat(successRate) >= 99
                ? "bg-green-500"
                : parseFloat(successRate) >= 95
                ? "bg-yellow-500"
                : "bg-red-500"
            }`}
            style={{ width: `${successRate}%` }}
          ></div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <div className="text-2xl font-bold text-white">
              {eventStats.last_hour}
            </div>
            <div className="text-xs text-slate-500">Events/hr</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {eventStats.failed}
            </div>
            <div className="text-xs text-slate-500">Failed (24h)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [totalAgents, setTotalAgents] = useState(0);
  const [activeAgents, setActiveAgents] = useState(0);
  const [divisionStats, setDivisionStats] = useState<DivisionStats[]>([]);
  const [recentAgents, setRecentAgents] = useState<AgentSummary[]>([]);
  const [eventStats, setEventStats] = useState<EventStats>({
    total: 0,
    last_hour: 0,
    failed: 0,
  });

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all agents
        const { data: agents, error: agentsError } = await supabase
          .from("agents")
          .select("*");

        if (agentsError) throw agentsError;

        if (agents) {
          setTotalAgents(agents.length);
          setActiveAgents(agents.filter((a) => a.status === "active").length);

          // Calculate division stats (use org_unit column)
          const divStats: Record<string, DivisionStats> = {};
          agents.forEach((agent) => {
            const div = agent.org_unit || "unknown";
            if (!divStats[div]) {
              divStats[div] = { division: div, total: 0, active: 0, idle: 0, error: 0 };
            }
            divStats[div].total++;
            if (agent.status === "active") divStats[div].active++;
            else if (agent.status === "idle") divStats[div].idle++;
            else if (agent.status === "error") divStats[div].error++;
          });
          setDivisionStats(Object.values(divStats).sort((a, b) => a.division.localeCompare(b.division)));

          // Recent agents with activity (use last_heartbeat_at column)
          const agentSummaries: AgentSummary[] = agents
            .map((a) => ({
              agent_id: a.agent_id,
              division: a.org_unit,
              role: a.display_name || a.config?.role || "Agent",
              status: a.status,
              last_heartbeat: a.last_heartbeat_at,
              metrics: a.config?.metrics || {},
            }))
            .sort(
              (a, b) =>
                new Date(b.last_heartbeat || 0).getTime() -
                new Date(a.last_heartbeat || 0).getTime()
            );
          setRecentAgents(agentSummaries);
        }

        // Fetch event stats
        const { count: totalEvents } = await supabase
          .from("agent_events")
          .select("*", { count: "exact", head: true });

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: recentEvents } = await supabase
          .from("agent_events")
          .select("*", { count: "exact", head: true })
          .gte("created_at", oneHourAgo);

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: failedEvents } = await supabase
          .from("agent_events")
          .select("*", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("created_at", oneDayAgo);

        setEventStats({
          total: totalEvents || 0,
          last_hour: recentEvents || 0,
          failed: failedEvents || 0,
        });
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Agent Network Overview</h1>
        <p className="text-slate-400 mt-1">
          Truth J Blue LLC • 7 Divisions • {totalAgents} Agents
        </p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard value={totalAgents} label="Total Agents" />
        <MetricCard
          value={activeAgents}
          label="Active Agents"
          trend={`${((activeAgents / totalAgents) * 100).toFixed(0)}% healthy`}
          trendUp={activeAgents / totalAgents >= 0.9}
        />
        <MetricCard
          value={eventStats.total.toLocaleString()}
          label="Total Events"
        />
        <MetricCard
          value={eventStats.last_hour}
          label="Events/Hour"
          trend="Last 60 min"
        />
      </div>

      {/* Division grid */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Division Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {divisionStats.map((stats) => (
            <DivisionCard key={stats.division} stats={stats} />
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentAgentActivity agents={recentAgents} />
        <SystemHealth eventStats={eventStats} />
      </div>
    </div>
  );
}
