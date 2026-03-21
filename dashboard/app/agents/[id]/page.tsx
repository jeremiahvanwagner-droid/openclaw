"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../supabase";

interface Agent {
  id: string;
  agent_id: string;
  org_unit: string;
  display_name: string;
  status: string;
  config: {
    role?: string;
    model?: string;
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

const MODELS = [
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
  "gpt-4o",
  "gpt-4o-mini",
];

const STATUSES = ["active", "idle", "paused", "quarantined", "error"];

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Editable fields
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [escalationPath, setEscalationPath] = useState("");

  useEffect(() => {
    async function fetchAgent() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("agent_id", agentId)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setAgent(data);
      setModel(data.config?.model || "");
      setStatus(data.status);
      setRole(data.config?.role || "");
      setEscalationPath(data.config?.escalation_path || "");
      setLoading(false);
    }

    fetchAgent();
  }, [agentId]);

  async function callApi(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, agent_id: agentId, ...extra }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await callApi("update", {
        config: {
          model,
          role,
          escalation_path: escalationPath,
        },
      });
      setMessage({ type: "success", text: "Agent config updated" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Update failed";
      setMessage({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action: string) {
    setActionLoading(action);
    setMessage(null);
    try {
      const result = await callApi(action);
      if (action === "quarantine" && result.status) {
        setStatus(result.status);
      }
      setMessage({
        type: "success",
        text: `${action} completed successfully`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${action} failed`;
      setMessage({ type: "error", text: msg });
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading agent...</div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Agent not found</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/agents")}
            className="text-slate-400 hover:text-white text-sm mb-2 block"
          >
            &larr; Back to agents
          </button>
          <h1 className="text-2xl font-bold text-white">{agent.agent_id}</h1>
          <p className="text-slate-400">{agent.display_name || agent.config?.role || "Agent"}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            status === "active"
              ? "bg-green-500/20 text-green-400"
              : status === "quarantined"
              ? "bg-red-500/20 text-red-400"
              : status === "error"
              ? "bg-red-500/20 text-red-400"
              : "bg-slate-500/20 text-slate-400"
          }`}
        >
          {status}
        </span>
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-500/10 border border-green-500/30 text-green-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Info section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Agent Info</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Division:</span>
            <span className="text-white ml-2">
              {agent.org_unit?.replace(/_/g, " ")}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Created:</span>
            <span className="text-white ml-2">
              {new Date(agent.created_at).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Last heartbeat:</span>
            <span className="text-white ml-2">
              {agent.last_heartbeat_at
                ? new Date(agent.last_heartbeat_at).toLocaleString()
                : "Never"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Events processed:</span>
            <span className="text-white ml-2">
              {agent.config?.metrics?.events_processed || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Configuration
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-claw-500"
            >
              <option value="">Default</option>
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Role</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-claw-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Escalation Path
            </label>
            <input
              value={escalationPath}
              onChange={(e) => setEscalationPath(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-claw-500"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-claw-500 hover:bg-claw-600 text-white rounded-lg transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Tools */}
      {agent.config?.tools_required &&
        agent.config.tools_required.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Tools</h2>
            <div className="flex flex-wrap gap-2">
              {agent.config.tools_required.map((tool) => (
                <span
                  key={tool}
                  className="px-2 py-1 bg-claw-500/20 text-claw-400 text-sm rounded border border-claw-500/30"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

      {/* Last Error */}
      {agent.config?.metrics?.last_error && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Last Error</h2>
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm font-mono">
            {agent.config.metrics.last_error}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>
        <div className="flex gap-3">
          <button
            onClick={() => handleAction("invoke")}
            disabled={actionLoading === "invoke"}
            className="px-4 py-2 bg-claw-500 hover:bg-claw-600 text-white rounded-lg transition disabled:opacity-50"
          >
            {actionLoading === "invoke" ? "Invoking..." : "Trigger Manual Run"}
          </button>
          <button
            onClick={() => handleAction("quarantine")}
            disabled={actionLoading === "quarantine"}
            className={`px-4 py-2 rounded-lg transition disabled:opacity-50 ${
              status === "quarantined"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {actionLoading === "quarantine"
              ? "..."
              : status === "quarantined"
              ? "Unquarantine"
              : "Quarantine"}
          </button>
        </div>
      </div>
    </div>
  );
}
