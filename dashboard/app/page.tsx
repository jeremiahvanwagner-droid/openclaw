"use client";

import { useEffect, useState } from "react";

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

interface PortfolioBusinessSummary {
  business_id: string;
  pod_id: string;
  business_name: string;
  brand_name: string;
  vertical: string;
  status: string;
  scope_family: string;
  resolved_ghl_scope_type: string;
  rollout_wave: number;
  automation_target_rate: number;
  blueprint_coverage_rate: number;
  membership_enabled: boolean;
  community_enabled: boolean;
  owner_pod: string;
}

interface PortfolioSummary {
  portfolio_name: string;
  total_businesses: number;
  dedicated_scopes: number;
  shared_scopes: number;
  internal_scopes: number;
  businesses_with_memberships: number;
  businesses_with_communities: number;
  automation_target_rate: number;
  blueprint_coverage_rate: number;
  rollout_wave_counts: Record<string, number>;
  businesses: PortfolioBusinessSummary[];
}

interface DashboardSummary {
  totalAgents: number;
  activeAgents: number;
  divisionStats: DivisionStats[];
  recentAgents: AgentSummary[];
  eventStats: EventStats;
}

const DIVISION_NAMES: Record<string, string> = {
  division_1_core_operations: "D1 - Core Operations",
  division_2_ecommerce: "D2 - eCommerce",
  division_3_consulting: "D3 - Consulting",
  division_4_coaching: "D4 - Coaching",
  division_5_publishing: "D5 - Publishing",
  division_6_nonprofit: "D6 - Nonprofit",
  division_7_shared_services: "D7 - Shared Services",
  division_8_saas_operations: "D8 - SaaS Ops",
  division_9_online_store: "D9 - Online Store",
};

function getDivKey(orgUnit: string): string {
  if (orgUnit?.includes("shared")) return "shared";
  const match = orgUnit?.match(/division_(\d+)/);
  return match ? `d${match[1]}` : "unknown";
}

function getScopeClasses(scopeFamily: string): string {
  switch (scopeFamily) {
    case "dedicated":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "shared":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    case "internal":
      return "border-sky-500/40 bg-sky-500/10 text-sky-100";
    default:
      return "border-slate-600 bg-slate-700/40 text-slate-200";
  }
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
      {trend ? (
        <div
          className={`mt-2 text-xs ${
            trendUp === undefined
              ? "text-slate-400"
              : trendUp
                ? "text-green-400"
                : "text-red-400"
          }`}
        >
          {trendUp === undefined ? "" : trendUp ? "+ " : "- "}
          {trend}
        </div>
      ) : null}
    </div>
  );
}

function DivisionCard({ stats }: { stats: DivisionStats }) {
  const divisionKey = getDivKey(stats.division);
  const name = DIVISION_NAMES[stats.division] || stats.division;

  return (
    <div className={`card division-${divisionKey}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">{name}</h3>
        <span className="text-2xl font-bold text-white">{stats.total}</span>
      </div>
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-slate-400">{stats.active} active</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          <span className="text-slate-400">{stats.idle} idle</span>
        </div>
        {stats.error > 0 ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-red-400">{stats.error} error</span>
          </div>
        ) : null}
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
            className="flex items-center justify-between border-b border-slate-700/50 py-2 last:border-0"
          >
            <div className="flex items-center gap-3">
              <div
                className={`h-2 w-2 rounded-full ${
                  agent.status === "active"
                    ? "bg-green-500"
                    : agent.status === "idle"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              />
              <div>
                <div className="text-sm font-medium text-white">{agent.agent_id}</div>
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
                  : "n/a"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemHealth({ eventStats }: { eventStats: EventStats }) {
  const successRate =
    eventStats.total > 0
      ? (((eventStats.total - eventStats.failed) / eventStats.total) * 100).toFixed(1)
      : "100.0";

  const successClasses =
    Number.parseFloat(successRate) >= 99
      ? "text-green-400"
      : Number.parseFloat(successRate) >= 95
        ? "text-yellow-400"
        : "text-red-400";

  const successBarClasses =
    Number.parseFloat(successRate) >= 99
      ? "bg-green-500"
      : Number.parseFloat(successRate) >= 95
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="card">
      <h3 className="card-header">System Health</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Event Success Rate</span>
          <span className={`font-semibold ${successClasses}`}>{successRate}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-700">
          <div
            className={`h-2 rounded-full ${successBarClasses}`}
            style={{ width: `${successRate}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <div className="text-2xl font-bold text-white">{eventStats.last_hour}</div>
            <div className="text-xs text-slate-500">Events/hr</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{eventStats.failed}</div>
            <div className="text-xs text-slate-500">Failed (24h)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioScopeCard({ business }: { business: PortfolioBusinessSummary }) {
  return (
    <div className="card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{business.business_name}</h3>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
            {business.pod_id} - Wave {business.rollout_wave}
          </div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${getScopeClasses(
            business.scope_family,
          )}`}
        >
          {business.scope_family}
        </span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">GHL scope</span>
          <span className="text-slate-200">{business.resolved_ghl_scope_type}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Vertical</span>
          <span className="text-slate-200">{business.vertical}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Automation target</span>
          <span className="text-slate-200">
            {(business.automation_target_rate * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Blueprint coverage</span>
          <span className="text-slate-200">
            {(business.blueprint_coverage_rate * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Membership</span>
          <span className="text-slate-200">
            {business.membership_enabled ? "Enabled" : "Off"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Community</span>
          <span className="text-slate-200">
            {business.community_enabled ? "Enabled" : "Off"}
          </span>
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
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [dashboardResponse, portfolioResponse] = await Promise.all([
          fetch("/api/dashboard", { cache: "no-store" }),
          fetch("/api/portfolio", { cache: "no-store" }),
        ]);

        if (dashboardResponse.ok) {
          const dashboard = (await dashboardResponse.json()) as DashboardSummary;
          setTotalAgents(dashboard.totalAgents);
          setActiveAgents(dashboard.activeAgents);
          setDivisionStats(dashboard.divisionStats);
          setRecentAgents(dashboard.recentAgents);
          setEventStats(dashboard.eventStats);
        }

        if (portfolioResponse.ok) {
          const portfolio = (await portfolioResponse.json()) as PortfolioSummary;
          setPortfolioSummary(portfolio);
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Portfolio Operations Overview</h1>
        <p className="mt-1 text-slate-400">
          Truth J Blue LLC - {portfolioSummary?.total_businesses ?? 0} business scopes -{" "}
          {totalAgents} registered agents
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard value={totalAgents} label="Total Agents" />
        <MetricCard
          value={activeAgents}
          label="Active Agents"
          trend={
            totalAgents > 0
              ? `${((activeAgents / totalAgents) * 100).toFixed(0)}% healthy`
              : "n/a"
          }
          trendUp={totalAgents > 0 && activeAgents / totalAgents >= 0.9}
        />
        <MetricCard
          value={portfolioSummary?.total_businesses ?? 0}
          label="Business Scopes"
        />
        <MetricCard
          value={portfolioSummary?.dedicated_scopes ?? 0}
          label="Dedicated GHL Scopes"
        />
        <MetricCard
          value={`${((portfolioSummary?.automation_target_rate ?? 0) * 100).toFixed(0)}%`}
          label="Automation Target"
          trend="Portfolio target"
        />
        <MetricCard
          value={eventStats.last_hour}
          label="Events/Hour"
          trend="Last 60 min"
        />
      </div>

      {portfolioSummary ? (
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Business Scope Map</h2>
              <p className="mt-1 text-sm text-slate-400">
                Mixed GHL tenancy with dedicated, shared incubator, and internal portfolio
                control scopes.
              </p>
            </div>
            <div className="text-right text-sm text-slate-400">
              <div>
                Membership-enabled: {portfolioSummary.businesses_with_memberships}
              </div>
              <div>
                Community-enabled: {portfolioSummary.businesses_with_communities}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {portfolioSummary.businesses.map((business) => (
              <PortfolioScopeCard key={business.business_id} business={business} />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-4 text-xl font-semibold text-white">Division Status</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {divisionStats.map((stats) => (
            <DivisionCard key={stats.division} stats={stats} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentAgentActivity agents={recentAgents} />
        <SystemHealth eventStats={eventStats} />
      </div>
    </div>
  );
}
