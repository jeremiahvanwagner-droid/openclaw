"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface OfferAnalytics {
  id: string;
  offer_id: string;
  offer_name: string;
  revenue: number;
  units_sold: number;
  conversion_rate: number;
  avg_order_value: number;
  refund_rate: number;
  health_score: string;
  analyzed_at: string;
}

interface OfferStack {
  id: string;
  name: string;
  business_id: string;
  stack_type: string;
  components: Record<string, unknown>[];
  total_value: number;
  price_point: number;
  created_at: string;
}

interface OfferOptimization {
  id: string;
  offer_id: string;
  optimization_type: string;
  recommendation: string;
  estimated_impact: string;
  status: string;
  created_at: string;
}

function HealthBadge({ score }: { score: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    fair: "bg-blue-900/40 text-blue-300 border-blue-700/50",
    poor: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
    critical: "bg-red-900/40 text-red-300 border-red-700/50",
    unknown: "bg-slate-700/40 text-slate-300 border-slate-600/50",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[score] || "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {score}
    </span>
  );
}

export default function OffersPage() {
  const [analytics, setAnalytics] = useState<OfferAnalytics[]>([]);
  const [stacks, setStacks] = useState<OfferStack[]>([]);
  const [optimizations, setOptimizations] = useState<OfferOptimization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    async function load() {
      const [anaRes, stackRes, optRes] = await Promise.all([
        supabase!.from("offer_analytics").select("*").order("analyzed_at", { ascending: false }).limit(50),
        supabase!.from("offer_stacks").select("*").order("created_at", { ascending: false }).limit(30),
        supabase!.from("offer_optimizations").select("*").order("created_at", { ascending: false }).limit(30),
      ]);
      setAnalytics(anaRes.data || []);
      setStacks(stackRes.data || []);
      setOptimizations(optRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const totalRevenue = analytics.reduce((s, a) => s + (a.revenue || 0), 0);
  const totalUnits = analytics.reduce((s, a) => s + (a.units_sold || 0), 0);
  const healthyCount = analytics.filter((a) => a.health_score === "healthy").length;
  const criticalCount = analytics.filter((a) => a.health_score === "critical" || a.health_score === "poor").length;

  if (!supabase) return <p className="text-slate-400 p-8">Supabase not configured.</p>;
  if (loading) return <p className="text-slate-400 p-8">Loading offer data…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Offers</h1>
        <p className="text-slate-400 text-sm mt-1">Offer engineering, value stacks, pricing optimization & performance</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Offer Revenue</p>
          <p className="text-2xl font-bold text-emerald-400">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Units Sold</p>
          <p className="text-2xl font-bold text-blue-400">{totalUnits.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Healthy Offers</p>
          <p className="text-2xl font-bold text-emerald-400">{healthyCount}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Need Attention</p>
          <p className="text-2xl font-bold text-red-400">{criticalCount}</p>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Offer Performance</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Offer</th>
              <th className="px-4 py-2 text-right">Revenue</th>
              <th className="px-4 py-2 text-right">Units</th>
              <th className="px-4 py-2 text-right">Conv. Rate</th>
              <th className="px-4 py-2 text-right">AOV</th>
              <th className="px-4 py-2 text-right">Refund %</th>
              <th className="px-4 py-2 text-left">Health</th>
              <th className="px-4 py-2 text-left">Analyzed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {analytics.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No offer analytics yet</td></tr>
            ) : (
              analytics.map((a) => (
                <tr key={a.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white font-medium">{a.offer_name}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">${a.revenue.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{a.units_sold}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{(a.conversion_rate * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right text-slate-300">${a.avg_order_value.toFixed(0)}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{(a.refund_rate * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2"><HealthBadge score={a.health_score} /></td>
                  <td className="px-4 py-2 text-slate-400">{new Date(a.analyzed_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50">
            <h2 className="text-lg font-semibold text-white">Value Stacks</h2>
          </div>
          <div className="divide-y divide-slate-700/30">
            {stacks.length === 0 ? (
              <p className="px-4 py-6 text-center text-slate-500">No offer stacks yet</p>
            ) : (
              stacks.map((s) => (
                <div key={s.id} className="px-4 py-3 hover:bg-slate-700/20">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-medium">{s.name}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{s.stack_type} &middot; {s.business_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-emerald-400 font-bold">${s.price_point.toLocaleString()}</p>
                      <p className="text-slate-400 text-xs">${s.total_value.toLocaleString()} value</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50">
            <h2 className="text-lg font-semibold text-white">Optimization Recommendations</h2>
          </div>
          <div className="divide-y divide-slate-700/30">
            {optimizations.length === 0 ? (
              <p className="px-4 py-6 text-center text-slate-500">No optimizations yet</p>
            ) : (
              optimizations.map((o) => (
                <div key={o.id} className="px-4 py-3 hover:bg-slate-700/20">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white text-sm">{o.recommendation}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{o.optimization_type} &middot; {o.estimated_impact}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs border ${o.status === "applied" ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" : "bg-slate-700 text-slate-300 border-slate-600"}`}>
                      {o.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
