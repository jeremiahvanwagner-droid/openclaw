"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface PortfolioRow {
  business_id: string;
  revenue: number;
  mrr: number;
  leads: number;
  conversions: number;
  churn_count: number;
  date: string;
}

interface AnomalyRow {
  id: string;
  business_id: string;
  kpi_name: string;
  severity: string;
  resolved: boolean;
  detected_at: string;
}

interface HealthRow {
  id: string;
  provider: string;
  status: string;
  last_check: string;
}

interface RiskItem {
  type: string;
  source: string;
  detail: string;
}

export default function CommandCenterPage() {
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [health, setHealth] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const [portRes, anomRes, healthRes] = await Promise.all([
        supabase!.from("daily_kpis").select("*").eq("date", today).order("business_id"),
        supabase!.from("revenue_anomalies").select("*").eq("resolved", false).order("detected_at", { ascending: false }).limit(20),
        supabase!.from("integration_health_log").select("*").order("last_check", { ascending: false }).limit(20),
      ]);
      setPortfolio(portRes.data || []);
      setAnomalies(anomRes.data || []);
      setHealth(healthRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  // Derive risks from anomalies and health
  const risks: RiskItem[] = [
    ...anomalies
      .filter((a) => a.severity === "critical")
      .map((a) => ({ type: "anomaly", source: a.business_id, detail: `Critical: ${a.kpi_name}` })),
    ...health
      .filter((h) => h.status === "down" || h.status === "degraded")
      .map((h) => ({ type: "integration", source: h.provider, detail: `Status: ${h.status}` })),
  ];

  const totalRevenue = portfolio.reduce((s, p) => s + (p.revenue || 0), 0);
  const totalMRR = portfolio.reduce((s, p) => s + (p.mrr || 0), 0);
  const totalLeads = portfolio.reduce((s, p) => s + (p.leads || 0), 0);
  const healthyIntegrations = health.filter((h) => h.status === "healthy").length;

  if (!supabase) return <p className="text-slate-400 p-8">Supabase not configured.</p>;
  if (loading) return <p className="text-slate-400 p-8">Loading command center…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Executive Command Center</h1>
        <p className="text-slate-400 text-sm mt-1">Portfolio-wide CEO briefing — revenue, health, risks & actions</p>
      </div>

      {/* Top-Level KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Today Revenue</p>
          <p className="text-2xl font-bold text-emerald-400">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Portfolio MRR</p>
          <p className="text-2xl font-bold text-blue-400">${totalMRR.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Today Leads</p>
          <p className="text-2xl font-bold text-white">{totalLeads}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Integrations OK</p>
          <p className="text-2xl font-bold text-emerald-400">{healthyIntegrations}/{health.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Active Risks</p>
          <p className="text-2xl font-bold text-red-400">{risks.length}</p>
        </div>
      </div>

      {/* Risk Alerts */}
      {risks.length > 0 && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-red-300 mb-3">Active Risks</h2>
          <div className="space-y-2">
            {risks.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${r.type === "anomaly" ? "bg-red-900/40 text-red-300 border-red-700/50" : "bg-yellow-900/40 text-yellow-300 border-yellow-700/50"}`}>
                  {r.type}
                </span>
                <span className="text-white font-mono text-xs">{r.source}</span>
                <span className="text-slate-400">{r.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio Business Cards */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Business Portfolio</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {portfolio.length === 0 ? (
            <p className="text-slate-500 text-sm col-span-5">No KPI data for today</p>
          ) : (
            portfolio.map((p) => {
              const bizAnomalies = anomalies.filter((a) => a.business_id === p.business_id);
              const hasCritical = bizAnomalies.some((a) => a.severity === "critical");
              return (
                <div
                  key={p.business_id}
                  className={`rounded-lg p-3 border ${hasCritical ? "bg-red-950/20 border-red-900/50" : "bg-slate-800/60 border-slate-700/50"}`}
                >
                  <p className="text-white font-mono text-xs font-bold">{p.business_id}</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Revenue</span>
                      <span className="text-emerald-400">${p.revenue?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">MRR</span>
                      <span className="text-blue-400">${p.mrr?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Leads</span>
                      <span className="text-white">{p.leads}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Churn</span>
                      <span className={p.churn_count > 0 ? "text-red-400" : "text-slate-500"}>{p.churn_count}</span>
                    </div>
                  </div>
                  {bizAnomalies.length > 0 && (
                    <p className="mt-2 text-xs text-yellow-400">{bizAnomalies.length} anomal{bizAnomalies.length === 1 ? "y" : "ies"}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Integration Health */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Integration Health</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Provider</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Last Check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {health.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">No health data</td></tr>
            ) : (
              health.map((h) => (
                <tr key={h.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white">{h.provider}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${h.status === "healthy" ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" : h.status === "degraded" ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/50" : "bg-red-900/40 text-red-300 border-red-700/50"}`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{new Date(h.last_check).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
