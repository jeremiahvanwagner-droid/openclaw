"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Agent {
  id: string;
  agent_id: string;
  org_unit: string;
  display_name: string;
  status: string;
  config: {
    role?: string;
    escalation_path?: string;
    capabilities?: string[];
    tools_required?: string[];
    metrics?: {
      events_processed?: number;
      avg_latency_ms?: number;
      last_error?: string;
    };
  };
  last_heartbeat_at: string;
  created_at: string;
}

const DIVISIONS = [
  { key: "all", label: "All Divisions" },
  { key: "division_1", label: "D1 Core Operations" },
  { key: "division_2", label: "D2 eCommerce" },
  { key: "division_3", label: "D3 Consulting" },
  { key: "division_4", label: "D4 Coaching" },
  { key: "division_5", label: "D5 Publishing" },
  { key: "division_6", label: "D6 Nonprofit" },
  { key: "division_7", label: "D7 Shared Services" },
];

const STATUSES = [
  { key: "all", label: "All Statuses" },
  { key: "active", label: "Active" },
  { key: "idle", label: "Idle" },
  { key: "paused", label: "Paused" },
  { key: "error", label: "Error" },
];

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    active: "status-active",
    idle: "status-idle",
    paused: "status-paused",
    error: "status-error",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes[status] || classes.idle}`}>
      {status}
    </span>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function AgentCard({ agent, isUpdated }: { agent: Agent; isUpdated?: boolean }) {
  const router = useRouter();
  const timeSinceHeartbeat = agent.last_heartbeat_at
    ? formatTimeAgo(new Date(agent.last_heartbeat_at))
    : "Never";

  return (
    <div
      className={`card cursor-pointer transition-colors hover:border-claw-500/50 ${
        isUpdated ? "animate-pulse ring-2 ring-green-400/60" : ""
      }`}
      onClick={() => router.push(`/agents/${agent.agent_id}`)}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{agent.agent_id}</h3>
          <p className="text-sm text-slate-400">{agent.display_name || "Agent"}</p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-slate-500">Division:</span>
          <span className="ml-1 text-slate-300">{agent.org_unit?.replace(/_/g, " ")}</span>
        </div>
        <div>
          <span className="text-slate-500">Escalates to:</span>
          <span className="ml-1 text-slate-300">
            {agent.config?.escalation_path || "-"}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Events:</span>
          <span className="ml-1 text-slate-300">
            {agent.config?.metrics?.events_processed || 0}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Last seen:</span>
          <span className="ml-1 text-slate-300">{timeSinceHeartbeat}</span>
        </div>
      </div>

      {agent.config?.tools_required && agent.config.tools_required.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {agent.config.tools_required.slice(0, 3).map((tool) => (
            <span
              key={tool}
              className="rounded bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400"
            >
              {tool}
            </span>
          ))}
          {agent.config.tools_required.length > 3 ? (
            <span className="px-2 py-0.5 text-xs text-slate-500">
              +{agent.config.tools_required.length - 3} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());
  const previousAgentsRef = useRef<Agent[]>([]);

  useEffect(() => {
    function flashUpdated(agentIds: string[]) {
      if (agentIds.length === 0) return;

      setRecentlyUpdated((current) => {
        const updated = new Set(current);
        for (const agentId of agentIds) {
          updated.add(agentId);
        }
        return updated;
      });

      setTimeout(() => {
        setRecentlyUpdated((current) => {
          const updated = new Set(current);
          for (const agentId of agentIds) {
            updated.delete(agentId);
          }
          return updated;
        });
      }, 2000);
    }

    async function fetchAgents(isPolling = false) {
      try {
        const response = await fetch("/api/agents", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to fetch agents");
        }

        const data = (await response.json()) as { agents?: Agent[] };
        const nextAgents = data.agents || [];

        if (isPolling) {
          const previousMap = new Map(
            previousAgentsRef.current.map((agent) => [agent.id, JSON.stringify(agent)]),
          );
          const changedAgentIds = nextAgents
            .filter((agent) => previousMap.get(agent.id) !== JSON.stringify(agent))
            .map((agent) => agent.id);
          flashUpdated(changedAgentIds);
        }

        previousAgentsRef.current = nextAgents;
        setAgents(nextAgents);
      } catch (error) {
        console.error("Error fetching agents:", error);
        if (!isPolling) {
          setAgents([]);
        }
      } finally {
        if (!isPolling) {
          setLoading(false);
        }
      }
    }

    void fetchAgents(false);
    const interval = setInterval(() => {
      void fetchAgents(true);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        if (selectedDivision !== "all" && !agent.org_unit?.startsWith(selectedDivision)) {
          return false;
        }

        if (selectedStatus !== "all" && agent.status !== selectedStatus) {
          return false;
        }

        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            agent.agent_id.toLowerCase().includes(query) ||
            agent.display_name?.toLowerCase().includes(query)
          );
        }

        return true;
      }),
    [agents, searchQuery, selectedDivision, selectedStatus],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-slate-400">
            {filteredAgents.length} of {agents.length} agents
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Search agents..."
          className="w-64 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-claw-500 focus:outline-none"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white focus:border-claw-500 focus:outline-none"
          value={selectedDivision}
          onChange={(event) => setSelectedDivision(event.target.value)}
        >
          {DIVISIONS.map((division) => (
            <option key={division.key} value={division.key}>
              {division.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white focus:border-claw-500 focus:outline-none"
          value={selectedStatus}
          onChange={(event) => setSelectedStatus(event.target.value)}
        >
          {STATUSES.map((status) => (
            <option key={status.key} value={status.key}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isUpdated={recentlyUpdated.has(agent.id)}
          />
        ))}
      </div>

      {filteredAgents.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          No agents found matching your filters
        </div>
      ) : null}
    </div>
  );
}
