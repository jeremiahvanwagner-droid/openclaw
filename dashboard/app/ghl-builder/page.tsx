"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface BuildLog {
  id: string;
  entity_type: string;
  operation: string;
  status: string;
  agent_id: string;
  snapshot_id: string | null;
  created_at: string;
  entity_config: Record<string, unknown>;
}

interface Snapshot {
  id: string;
  entity_type: string;
  entity_id: string;
  snapshot_data: Record<string, unknown>;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    failed: "bg-red-900/40 text-red-300 border-red-700/50",
    pending: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
    rolled_back: "bg-purple-900/40 text-purple-300 border-purple-700/50",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[status] || "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {status}
    </span>
  );
}

export default function GhlBuilderPage() {
  const [builds, setBuilds] = useState<BuildLog[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    async function load() {
      const [buildRes, snapRes] = await Promise.all([
        supabase!.from("ghl_build_log").select("*").order("created_at", { ascending: false }).limit(50),
        supabase!.from("ghl_snapshots").select("*").order("created_at", { ascending: false }).limit(30),
      ]);
      setBuilds(buildRes.data || []);
      setSnapshots(snapRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const completedCount = builds.filter((b) => b.status === "completed").length;
  const failedCount = builds.filter((b) => b.status === "failed").length;
  const rollbackCount = builds.filter((b) => b.status === "rolled_back").length;

  if (!supabase) return <p className="text-slate-400 p-8">Supabase not configured.</p>;
  if (loading) return <p className="text-slate-400 p-8">Loading GHL builder data…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">GHL Builder</h1>
        <p className="text-slate-400 text-sm mt-1">Native build/refactor operations, snapshots & rollbacks</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Total Builds</p>
          <p className="text-2xl font-bold text-blue-400">{builds.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Completed</p>
          <p className="text-2xl font-bold text-emerald-400">{completedCount}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Failed</p>
          <p className="text-2xl font-bold text-red-400">{failedCount}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Rollbacks</p>
          <p className="text-2xl font-bold text-purple-400">{rollbackCount}</p>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Build History</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Entity Type</th>
              <th className="px-4 py-2 text-left">Operation</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Agent</th>
              <th className="px-4 py-2 text-left">Snapshot</th>
              <th className="px-4 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {builds.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No build operations yet</td></tr>
            ) : (
              builds.map((b) => (
                <tr key={b.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white">{b.entity_type}</td>
                  <td className="px-4 py-2 text-slate-300">{b.operation}</td>
                  <td className="px-4 py-2"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-2 text-slate-400 font-mono text-xs">{b.agent_id}</td>
                  <td className="px-4 py-2 text-slate-400 font-mono text-xs">{b.snapshot_id ? b.snapshot_id.slice(0, 8) : "—"}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(b.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Recent Snapshots</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Entity Type</th>
              <th className="px-4 py-2 text-left">Entity ID</th>
              <th className="px-4 py-2 text-left">Snapshot ID</th>
              <th className="px-4 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {snapshots.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No snapshots yet</td></tr>
            ) : (
              snapshots.map((s) => (
                <tr key={s.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white">{s.entity_type}</td>
                  <td className="px-4 py-2 text-slate-300 font-mono text-xs">{s.entity_id}</td>
                  <td className="px-4 py-2 text-slate-400 font-mono text-xs">{s.id.slice(0, 12)}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(s.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
