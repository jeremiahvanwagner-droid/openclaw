"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface Experiment {
  id: string;
  name: string;
  entity_type: string;
  entity_id: string;
  status: string;
  traffic_split: Record<string, number>;
  significance_level: string | null;
  winning_variant: string | null;
  created_at: string;
}

interface ExperimentResult {
  id: string;
  experiment_id: string;
  variant: string;
  impressions: number;
  conversions: number;
  conversion_rate: number;
  confidence: number;
  evaluated_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    paused: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
    completed: "bg-blue-900/40 text-blue-300 border-blue-700/50",
    archived: "bg-slate-700/40 text-slate-300 border-slate-600/50",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[status] || "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {status}
    </span>
  );
}

function SignificanceBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-slate-500 text-xs">—</span>;
  const colors: Record<string, string> = {
    highly_significant: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    significant: "bg-blue-900/40 text-blue-300 border-blue-700/50",
    trending: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
    not_significant: "bg-slate-700/40 text-slate-300 border-slate-600/50",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[level] || "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {level.replace(/_/g, " ")}
    </span>
  );
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [results, setResults] = useState<ExperimentResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    async function load() {
      const [expRes, resRes] = await Promise.all([
        supabase!.from("experiments").select("*").order("created_at", { ascending: false }).limit(50),
        supabase!.from("experiment_results").select("*").order("evaluated_at", { ascending: false }).limit(100),
      ]);
      setExperiments(expRes.data || []);
      setResults(resRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const activeCount = experiments.filter((e) => e.status === "active").length;
  const completedCount = experiments.filter((e) => e.status === "completed").length;
  const significantCount = experiments.filter((e) => e.significance_level === "significant" || e.significance_level === "highly_significant").length;

  if (!supabase) return <p className="text-slate-400 p-8">Supabase not configured.</p>;
  if (loading) return <p className="text-slate-400 p-8">Loading experiment data…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Experiments</h1>
        <p className="text-slate-400 text-sm mt-1">A/B testing, variant assignment & statistical significance tracking</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Total Experiments</p>
          <p className="text-2xl font-bold text-blue-400">{experiments.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Active</p>
          <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Completed</p>
          <p className="text-2xl font-bold text-slate-300">{completedCount}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Significant</p>
          <p className="text-2xl font-bold text-yellow-400">{significantCount}</p>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Experiments</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Entity</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Significance</th>
              <th className="px-4 py-2 text-left">Winner</th>
              <th className="px-4 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {experiments.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No experiments yet</td></tr>
            ) : (
              experiments.map((e) => (
                <tr key={e.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white font-medium">{e.name}</td>
                  <td className="px-4 py-2 text-slate-300">{e.entity_type}</td>
                  <td className="px-4 py-2"><StatusBadge status={e.status} /></td>
                  <td className="px-4 py-2"><SignificanceBadge level={e.significance_level} /></td>
                  <td className="px-4 py-2 text-slate-300">{e.winning_variant || "—"}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Latest Results</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Experiment</th>
              <th className="px-4 py-2 text-left">Variant</th>
              <th className="px-4 py-2 text-right">Impressions</th>
              <th className="px-4 py-2 text-right">Conversions</th>
              <th className="px-4 py-2 text-right">Rate</th>
              <th className="px-4 py-2 text-right">Confidence</th>
              <th className="px-4 py-2 text-left">Evaluated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {results.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No results yet</td></tr>
            ) : (
              results.slice(0, 20).map((r) => (
                <tr key={r.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-slate-300 font-mono text-xs">{r.experiment_id.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-white">{r.variant}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{r.impressions.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{r.conversions.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{(r.conversion_rate * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right text-blue-400">{(r.confidence * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(r.evaluated_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
