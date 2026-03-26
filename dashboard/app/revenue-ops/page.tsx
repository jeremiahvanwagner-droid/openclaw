"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface DailyKPI {
  id: string;
  business_id: string;
  date: string;
  revenue: number;
  leads: number;
  conversions: number;
  churn_count: number;
  appointments: number;
  mrr: number;
}

interface Anomaly {
  id: string;
  business_id: string;
  kpi_name: string;
  severity: "warning" | "critical";
  z_score: number;
  current_value: number;
  baseline_avg: number;
  resolved: boolean;
  detected_at: string;
}

interface PlaybookExecution {
  id: string;
  playbook_id: string;
  business_id: string;
  status: string;
  actions_taken: string[];
  executed_at: string;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors =
    severity === "critical"
      ? "bg-red-900/40 text-red-300 border-red-700/50"
      : "bg-yellow-900/40 text-yellow-300 border-yellow-700/50";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors}`}>
      {severity}
    </span>
  );
}

export default function RevenueOpsPage() {
  const [kpis, setKpis] = useState<DailyKPI[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [executions, setExecutions] = useState<PlaybookExecution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    async function load() {
      const [kpiRes, anomRes, execRes] = await Promise.all([
        supabase!.from("daily_kpis").select("*").order("date", { ascending: false }).limit(50),
        supabase!.from("revenue_anomalies").select("*").order("detected_at", { ascending: false }).limit(30),
        supabase!.from("playbook_executions").select("*").order("executed_at", { ascending: false }).limit(20),
      ]);
      setKpis(kpiRes.data || []);
      setAnomalies(anomRes.data || []);
      setExecutions(execRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const totalRevenue = kpis.reduce((s, k) => s + (k.revenue || 0), 0);
  const totalLeads = kpis.reduce((s, k) => s + (k.leads || 0), 0);
  const activeAnomalies = anomalies.filter((a) => !a.resolved);
  const criticalCount = activeAnomalies.filter((a) => a.severity === "critical").length;

  if (!supabase) return <p className="text-slate-400 p-8">Supabase not configured.</p>;
  if (loading) return <p className="text-slate-400 p-8">Loading revenue data…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Revenue Ops</h1>
        <p className="text-slate-400 text-sm mt-1">Autonomous KPI tracking, anomaly detection & playbook execution</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Total Revenue</p>
          <p className="text-2xl font-bold text-emerald-400">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Total Leads</p>
          <p className="text-2xl font-bold text-blue-400">{totalLeads.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Active Anomalies</p>
          <p className="text-2xl font-bold text-yellow-400">{activeAnomalies.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Critical</p>
          <p className="text-2xl font-bold text-red-400">{criticalCount}</p>
        </div>
      </div>

      {/* Anomalies */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Active Anomalies</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Business</th>
              <th className="px-4 py-2 text-left">KPI</th>
              <th className="px-4 py-2 text-left">Severity</th>
              <th className="px-4 py-2 text-right">Z-Score</th>
              <th className="px-4 py-2 text-right">Current</th>
              <th className="px-4 py-2 text-right">Baseline</th>
              <th className="px-4 py-2 text-left">Detected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {activeAnomalies.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No active anomalies</td></tr>
            ) : (
              activeAnomalies.map((a) => (
                <tr key={a.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white font-mono text-xs">{a.business_id}</td>
                  <td className="px-4 py-2 text-slate-300">{a.kpi_name}</td>
                  <td className="px-4 py-2"><SeverityBadge severity={a.severity} /></td>
                  <td className="px-4 py-2 text-right text-slate-300">{a.z_score?.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-white">{a.current_value?.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-400">{a.baseline_avg?.toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{new Date(a.detected_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Playbook Executions */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Playbook Executions</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Playbook</th>
              <th className="px-4 py-2 text-left">Business</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Actions</th>
              <th className="px-4 py-2 text-left">Executed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {executions.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No playbook executions yet</td></tr>
            ) : (
              executions.map((e) => (
                <tr key={e.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white">{e.playbook_id}</td>
                  <td className="px-4 py-2 text-slate-300 font-mono text-xs">{e.business_id}</td>
                  <td className="px-4 py-2 text-slate-300">{e.status}</td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{(e.actions_taken || []).join(", ")}</td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{new Date(e.executed_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Latest KPIs */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Latest KPIs by Business</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Business</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-right">Revenue</th>
              <th className="px-4 py-2 text-right">MRR</th>
              <th className="px-4 py-2 text-right">Leads</th>
              <th className="px-4 py-2 text-right">Conversions</th>
              <th className="px-4 py-2 text-right">Churn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {kpis.slice(0, 20).map((k) => (
              <tr key={k.id} className="hover:bg-slate-700/20">
                <td className="px-4 py-2 text-white font-mono text-xs">{k.business_id}</td>
                <td className="px-4 py-2 text-slate-400 text-xs">{k.date}</td>
                <td className="px-4 py-2 text-right text-emerald-400">${k.revenue?.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-blue-400">${k.mrr?.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-slate-300">{k.leads}</td>
                <td className="px-4 py-2 text-right text-slate-300">{k.conversions}</td>
                <td className="px-4 py-2 text-right text-red-400">{k.churn_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
