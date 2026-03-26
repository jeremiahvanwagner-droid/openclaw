"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface ScopeAudit {
  id: string;
  audit_type: string;
  agent_id: string | null;
  business_id: string | null;
  findings_json: Record<string, unknown>;
  severity: string;
  resolved: boolean;
  created_at: string;
}

interface ScopeViolation {
  id: string;
  agent_id: string;
  resource: string;
  operation: string;
  business_id: string;
  blocked: boolean;
  reason: string | null;
  created_at: string;
}

interface ScopeBaseline {
  id: string;
  snapshot_json: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400",
    warning: "bg-yellow-500/20 text-yellow-400",
    info: "bg-blue-500/20 text-blue-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[severity] || colors.info}`}>
      {severity}
    </span>
  );
}

export default function ScopeGovernorPage() {
  const [audits, setAudits] = useState<ScopeAudit[]>([]);
  const [violations, setViolations] = useState<ScopeViolation[]>([]);
  const [baselines, setBaselines] = useState<ScopeBaseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockingBaseline, setLockingBaseline] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!supabase) { setLoading(false); return; }

      const [auditRes, violationRes, baselineRes] = await Promise.all([
        supabase.from("scope_audit_results").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("scope_violations_log").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("scope_baselines").select("*").order("created_at", { ascending: false }).limit(5),
      ]);

      setAudits(auditRes.data ?? []);
      setViolations(violationRes.data ?? []);
      setBaselines(baselineRes.data ?? []);
      setLoading(false);
    }

    fetchData();
  }, []);

  async function handleLockBaseline() {
    if (!supabase || lockingBaseline) return;
    setLockingBaseline(true);
    try {
      const res = await fetch("/api/scope-governor/lock-baseline", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBaselines((prev) => [data, ...prev].slice(0, 5));
      }
    } finally {
      setLockingBaseline(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading scope governor data...</div>
      </div>
    );
  }

  const criticalCount = audits.filter((a) => a.severity === "critical" && !a.resolved).length;
  const warningCount = audits.filter((a) => a.severity === "warning" && !a.resolved).length;
  const blockedViolations = violations.filter((v) => v.blocked).length;
  const lastBaseline = baselines[0];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Scope Governor</h1>
          <p className="text-slate-400">Cross-business scope compliance, drift detection &amp; violation log</p>
        </div>
        <button
          onClick={handleLockBaseline}
          disabled={lockingBaseline}
          className="px-4 py-2 bg-claw-600 hover:bg-claw-500 text-white text-sm rounded-lg transition disabled:opacity-50"
        >
          {lockingBaseline ? "Locking..." : "Lock Baseline"}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-400">{criticalCount}</p>
          <p className="text-slate-400 text-sm">Critical Findings</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-400">{warningCount}</p>
          <p className="text-slate-400 text-sm">Warnings</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-orange-400">{blockedViolations}</p>
          <p className="text-slate-400 text-sm">Blocked Violations</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-slate-300">{violations.length}</p>
          <p className="text-slate-400 text-sm">Total Violations</p>
        </div>
      </div>

      {/* Baseline info */}
      {lastBaseline && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-2">Current Baseline</h2>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>Locked by: <span className="text-slate-300">{lastBaseline.created_by}</span></span>
            <span>Date: <span className="text-slate-300">{new Date(lastBaseline.created_at).toLocaleString()}</span></span>
            <span>Agents: <span className="text-slate-300">{Object.keys(lastBaseline.snapshot_json).length}</span></span>
          </div>
        </div>
      )}

      {/* Compliance heatmap - audit results by type */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Audit Results</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">Business</th>
                <th className="py-2 pr-4">Severity</th>
                <th className="py-2 pr-4">Resolved</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit.id} className="border-b border-slate-700/50 text-slate-300">
                  <td className="py-2 pr-4 font-mono text-xs">{audit.audit_type}</td>
                  <td className="py-2 pr-4">{audit.agent_id || "—"}</td>
                  <td className="py-2 pr-4">{audit.business_id || "—"}</td>
                  <td className="py-2 pr-4"><SeverityBadge severity={audit.severity} /></td>
                  <td className="py-2 pr-4">
                    <span className={audit.resolved ? "text-green-400" : "text-red-400"}>
                      {audit.resolved ? "✓" : "✗"}
                    </span>
                  </td>
                  <td className="py-2 text-slate-500 text-xs">{new Date(audit.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {audits.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">No audit results yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Violation log */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Violation Log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">Resource</th>
                <th className="py-2 pr-4">Operation</th>
                <th className="py-2 pr-4">Business</th>
                <th className="py-2 pr-4">Blocked</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => (
                <tr key={v.id} className="border-b border-slate-700/50 text-slate-300">
                  <td className="py-2 pr-4 font-mono text-xs">{v.agent_id}</td>
                  <td className="py-2 pr-4">{v.resource}</td>
                  <td className="py-2 pr-4">{v.operation}</td>
                  <td className="py-2 pr-4">{v.business_id}</td>
                  <td className="py-2 pr-4">
                    <span className={v.blocked ? "text-green-400" : "text-red-400"}>
                      {v.blocked ? "Blocked" : "Allowed"}
                    </span>
                  </td>
                  <td className="py-2 text-slate-500 text-xs">{new Date(v.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {violations.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">No violations recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
