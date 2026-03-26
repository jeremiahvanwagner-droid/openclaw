"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface HealthEntry {
  id: string;
  provider: string;
  endpoint: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
}

interface HealEvent {
  id: string;
  provider: string;
  failure_type: string;
  action_taken: string;
  result: string;
  details_json: Record<string, unknown>;
  created_at: string;
}

interface ProviderSummary {
  provider: string;
  uptime: number;
  avgLatency: number;
  lastStatus: string;
  healthyCount: number;
  totalCount: number;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-green-400",
    degraded: "bg-yellow-400",
    down: "bg-red-400",
  };
  return <span className={`inline-block w-3 h-3 rounded-full ${colors[status] || colors.down}`} />;
}

function ResultBadge({ result }: { result: string }) {
  const colors: Record<string, string> = {
    success: "bg-green-500/20 text-green-400",
    partial: "bg-yellow-500/20 text-yellow-400",
    failed: "bg-red-500/20 text-red-400",
    skipped: "bg-slate-500/20 text-slate-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[result] || colors.failed}`}>
      {result}
    </span>
  );
}

export default function IntegrationsPage() {
  const [health, setHealth] = useState<HealthEntry[]>([]);
  const [heals, setHeals] = useState<HealEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!supabase) { setLoading(false); return; }

      const [healthRes, healRes] = await Promise.all([
        supabase.from("integration_health_log").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("integration_heal_events").select("*").order("created_at", { ascending: false }).limit(50),
      ]);

      setHealth(healthRes.data ?? []);
      setHeals(healRes.data ?? []);
      setLoading(false);
    }

    fetchData();
  }, []);

  // Compute per-provider summaries
  const providers: ProviderSummary[] = (() => {
    const grouped = new Map<string, HealthEntry[]>();
    for (const h of health) {
      const arr = grouped.get(h.provider) || [];
      arr.push(h);
      grouped.set(h.provider, arr);
    }

    return Array.from(grouped.entries()).map(([provider, entries]) => {
      const healthyCount = entries.filter((e) => e.status === "healthy").length;
      const latencies = entries.filter((e) => e.latency_ms != null).map((e) => e.latency_ms!);
      return {
        provider,
        uptime: entries.length > 0 ? (healthyCount / entries.length) * 100 : 0,
        avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        lastStatus: entries[0]?.status || "unknown",
        healthyCount,
        totalCount: entries.length,
      };
    });
  })();

  async function handleForceRetry(provider: string) {
    setRetrying(provider);
    try {
      await fetch("/api/integrations/force-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
    } finally {
      setRetrying(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading integration health data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Integration Health</h1>
        <p className="text-slate-400">Self-healing integrations — provider health, circuit breakers &amp; heal timeline</p>
      </div>

      {/* Provider health cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {providers.map((p) => (
          <div key={p.provider} className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white capitalize">{p.provider}</h3>
              <StatusDot status={p.lastStatus} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Uptime</span>
                <span className={`font-mono ${p.uptime >= 99 ? "text-green-400" : p.uptime >= 95 ? "text-yellow-400" : "text-red-400"}`}>
                  {p.uptime.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Avg Latency</span>
                <span className="text-slate-300 font-mono">{p.avgLatency.toFixed(0)}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Checks</span>
                <span className="text-slate-300">{p.healthyCount}/{p.totalCount}</span>
              </div>
            </div>
            <button
              onClick={() => handleForceRetry(p.provider)}
              disabled={retrying === p.provider}
              className="mt-3 w-full px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition disabled:opacity-50"
            >
              {retrying === p.provider ? "Retrying..." : "Force Retry"}
            </button>
          </div>
        ))}
        {providers.length === 0 && (
          <div className="col-span-4 card text-center text-slate-500 py-8">
            No health data recorded yet
          </div>
        )}
      </div>

      {/* Heal timeline */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Heal Timeline</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Failure Type</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Result</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {heals.map((heal) => (
                <tr key={heal.id} className="border-b border-slate-700/50 text-slate-300">
                  <td className="py-2 pr-4 capitalize">{heal.provider}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{heal.failure_type}</td>
                  <td className="py-2 pr-4 text-xs">{heal.action_taken}</td>
                  <td className="py-2 pr-4"><ResultBadge result={heal.result} /></td>
                  <td className="py-2 text-slate-500 text-xs">{new Date(heal.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {heals.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">No heal events yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent health checks */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Health Checks</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Endpoint</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Latency</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {health.slice(0, 20).map((h) => (
                <tr key={h.id} className="border-b border-slate-700/50 text-slate-300">
                  <td className="py-2 pr-4 capitalize">{h.provider}</td>
                  <td className="py-2 pr-4 font-mono text-xs truncate max-w-[200px]">{h.endpoint}</td>
                  <td className="py-2 pr-4">
                    <StatusDot status={h.status} />
                    <span className="ml-2 text-xs">{h.status}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono">{h.latency_ms != null ? `${h.latency_ms}ms` : "—"}</td>
                  <td className="py-2 text-slate-500 text-xs">{new Date(h.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {health.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">No health checks recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
