"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [escalationPath, setEscalationPath] = useState("");

  useEffect(() => {
    async function fetchAgent() {
      try {
        const response = await fetch(`/api/agents?agent_id=${encodeURIComponent(agentId)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Agent not found");
        }

        const data = (await response.json()) as { agent?: Agent };
        if (!data.agent) {
          throw new Error("Agent not found");
        }

        setAgent(data.agent);
        setModel(data.agent.config?.model || "");
        setStatus(data.agent.status);
        setRole(data.agent.config?.role || "");
        setEscalationPath(data.agent.config?.escalation_path || "");
      } catch {
        setAgent(null);
      } finally {
        setLoading(false);
      }
    }

    void fetchAgent();
  }, [agentId]);

  async function callApi(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, agent_id: agentId, ...extra }),
    });

    const data = (await response.json()) as { error?: string; status?: string };
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

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
    } catch (error) {
      const text = error instanceof Error ? error.message : "Update failed";
      setMessage({ type: "error", text });
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
      setMessage({ type: "success", text: `${action} completed successfully` });
    } catch (error) {
      const text = error instanceof Error ? error.message : `${action} failed`;
      setMessage({ type: "error", text });
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Loading agent...</div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Agent not found</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/agents")}
            className="mb-2 block text-sm text-slate-400 hover:text-white"
          >
            &larr; Back to agents
          </button>
          <h1 className="text-2xl font-bold text-white">{agent.agent_id}</h1>
          <p className="text-slate-400">{agent.display_name || agent.config?.role || "Agent"}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            status === "active"
              ? "bg-green-500/20 text-green-400"
              : status === "quarantined" || status === "error"
                ? "bg-red-500/20 text-red-400"
                : "bg-slate-500/20 text-slate-400"
          }`}
        >
          {status}
        </span>
      </div>

      {message ? (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "border border-green-500/30 bg-green-500/10 text-green-400"
              : "border border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-white">Agent Info</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Division:</span>
            <span className="ml-2 text-white">{agent.org_unit?.replace(/_/g, " ")}</span>
          </div>
          <div>
            <span className="text-slate-500">Created:</span>
            <span className="ml-2 text-white">
              {new Date(agent.created_at).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Last heartbeat:</span>
            <span className="ml-2 text-white">
              {agent.last_heartbeat_at
                ? new Date(agent.last_heartbeat_at).toLocaleString()
                : "Never"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Events processed:</span>
            <span className="ml-2 text-white">
              {agent.config?.metrics?.events_processed || 0}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-white">Configuration</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Model</label>
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-claw-500 focus:outline-none"
            >
              <option value="">Default</option>
              {MODELS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Role</label>
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-claw-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Escalation Path</label>
            <input
              value={escalationPath}
              onChange={(event) => setEscalationPath(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-claw-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-claw-500 px-4 py-2 text-white transition hover:bg-claw-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {agent.config?.tools_required && agent.config.tools_required.length > 0 ? (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">Tools</h2>
          <div className="flex flex-wrap gap-2">
            {agent.config.tools_required.map((tool) => (
              <span
                key={tool}
                className="rounded border border-claw-500/30 bg-claw-500/20 px-2 py-1 text-sm text-claw-400"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {agent.config?.metrics?.last_error ? (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">Last Error</h2>
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 font-mono text-sm text-red-400">
            {agent.config.metrics.last_error}
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-white">Actions</h2>
        <div className="flex gap-3">
          <button
            onClick={() => handleAction("invoke")}
            disabled={actionLoading === "invoke"}
            className="rounded-lg bg-claw-500 px-4 py-2 text-white transition hover:bg-claw-600 disabled:opacity-50"
          >
            {actionLoading === "invoke" ? "Invoking..." : "Trigger Manual Run"}
          </button>
          <button
            onClick={() => handleAction("quarantine")}
            disabled={actionLoading === "quarantine"}
            className={`rounded-lg px-4 py-2 text-white transition disabled:opacity-50 ${
              status === "quarantined"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-red-600 hover:bg-red-700"
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
