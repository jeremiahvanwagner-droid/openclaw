"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

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
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${classes[status] || classes.idle}`}>
      {status}
    </span>
  );
}

function AgentCard({ agent, isUpdated }: { agent: Agent; isUpdated?: boolean }) {
  const router = useRouter();
  const timeSinceHeartbeat = agent.last_heartbeat_at
    ? formatTimeAgo(new Date(agent.last_heartbeat_at))
    : "Never";

  return (
    <div
      className={`card cursor-pointer hover:border-claw-500/50 transition-colors ${isUpdated ? "ring-2 ring-green-400/60 animate-pulse" : ""}`}
      onClick={() => router.push(`/agents/${agent.agent_id}`)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white">{agent.agent_id}</h3>
          <p className="text-sm text-slate-400">{agent.display_name || "Agent"}</p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-slate-500">Division:</span>
          <span className="text-slate-300 ml-1">{agent.org_unit?.replace(/_/g, " ")}</span>
        </div>
        <div>
          <span className="text-slate-500">Escalates to:</span>
          <span className="text-slate-300 ml-1">
            {agent.config?.escalation_path || "—"}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Events:</span>
          <span className="text-slate-300 ml-1">
            {agent.config?.metrics?.events_processed || 0}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Last seen:</span>
          <span className="text-slate-300 ml-1">{timeSinceHeartbeat}</span>
        </div>
      </div>

      {agent.config?.tools_required && agent.config.tools_required.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {agent.config.tools_required.slice(0, 3).map((cap) => (
            <span
              key={cap}
              className="px-2 py-0.5 bg-slate-700/50 text-slate-400 text-xs rounded"
            >
              {cap}
            </span>
          ))}
          {agent.config.tools_required.length > 3 && (
            <span className="px-2 py-0.5 text-slate-500 text-xs">
              +{agent.config.tools_required.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchAgents() {
      if (!supabase) { setLoading(false); return; }
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("org_unit", { ascending: true })
        .order("agent_id", { ascending: true });

      if (error) {
        console.error("Error fetching agents:", error);
      } else {
        setAgents(data || []);
      }
      setLoading(false);
    }

    fetchAgents();

    // Subscribe to real-time updates
    if (!supabase) return;
    const channel = supabase
      .channel("agents-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agents" },
        (payload) => {
          const updated = payload.new as Agent;
          setAgents((prev) =>
            prev.map((a) => (a.id === updated.id ? updated : a))
          );
          // Flash animation
          setRecentlyUpdated((prev) => new Set(prev).add(updated.id));
          setTimeout(() => {
            setRecentlyUpdated((prev) => {
              const next = new Set(prev);
              next.delete(updated.id);
              return next;
            });
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, []);

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
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
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-slate-400">
            {filteredAgents.length} of {agents.length} agents
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Search agents..."
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-claw-500 w-64"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-claw-500"
          value={selectedDivision}
          onChange={(e) => setSelectedDivision(e.target.value)}
        >
          {DIVISIONS.map((div) => (
            <option key={div.key} value={div.key}>
              {div.label}
            </option>
          ))}
        </select>
        <select
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-claw-500"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isUpdated={recentlyUpdated.has(agent.id)}
          />
        ))}
      </div>

      {filteredAgents.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No agents found matching your filters
        </div>
      )}
    </div>
  );
}
