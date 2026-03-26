"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface CampaignIdea {
  id: string;
  title: string;
  source_content: string;
  business_id: string;
  status: string;
  channels: string[];
  created_at: string;
}

interface CampaignAsset {
  id: string;
  idea_id: string;
  channel: string;
  asset_type: string;
  content: string;
  status: string;
  created_at: string;
}

interface CampaignPerformance {
  id: string;
  asset_id: string;
  channel: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  collected_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-slate-700/40 text-slate-300 border-slate-600/50",
    ready: "bg-blue-900/40 text-blue-300 border-blue-700/50",
    approved: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    distributed: "bg-purple-900/40 text-purple-300 border-purple-700/50",
    completed: "bg-slate-600/40 text-slate-300 border-slate-500/50",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[status] || "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {status}
    </span>
  );
}

export default function CampaignsPage() {
  const [ideas, setIdeas] = useState<CampaignIdea[]>([]);
  const [assets, setAssets] = useState<CampaignAsset[]>([]);
  const [performance, setPerformance] = useState<CampaignPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    async function load() {
      const [ideaRes, assetRes, perfRes] = await Promise.all([
        supabase!.from("campaign_ideas").select("*").order("created_at", { ascending: false }).limit(50),
        supabase!.from("campaign_assets").select("*").order("created_at", { ascending: false }).limit(100),
        supabase!.from("campaign_performance").select("*").order("collected_at", { ascending: false }).limit(100),
      ]);
      setIdeas(ideaRes.data || []);
      setAssets(assetRes.data || []);
      setPerformance(perfRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const totalRevenue = performance.reduce((s, p) => s + (p.revenue || 0), 0);
  const totalClicks = performance.reduce((s, p) => s + (p.clicks || 0), 0);
  const totalConversions = performance.reduce((s, p) => s + (p.conversions || 0), 0);

  if (!supabase) return <p className="text-slate-400 p-8">Supabase not configured.</p>;
  if (loading) return <p className="text-slate-400 p-8">Loading campaign data…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Campaigns</h1>
        <p className="text-slate-400 text-sm mt-1">Content-to-campaign factory: ideas, assets & performance tracking</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Campaign Ideas</p>
          <p className="text-2xl font-bold text-blue-400">{ideas.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Assets Generated</p>
          <p className="text-2xl font-bold text-purple-400">{assets.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Total Clicks</p>
          <p className="text-2xl font-bold text-slate-300">{totalClicks.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Campaign Revenue</p>
          <p className="text-2xl font-bold text-emerald-400">${totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Campaign Ideas</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Business</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Channels</th>
              <th className="px-4 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {ideas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No campaign ideas yet</td></tr>
            ) : (
              ideas.map((idea) => (
                <tr key={idea.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white font-medium">{idea.title}</td>
                  <td className="px-4 py-2 text-slate-300">{idea.business_id}</td>
                  <td className="px-4 py-2"><StatusBadge status={idea.status} /></td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{idea.channels?.join(", ") || "—"}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(idea.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Top Performing Assets</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Channel</th>
              <th className="px-4 py-2 text-right">Impressions</th>
              <th className="px-4 py-2 text-right">Clicks</th>
              <th className="px-4 py-2 text-right">Conversions</th>
              <th className="px-4 py-2 text-right">Revenue</th>
              <th className="px-4 py-2 text-left">Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {performance.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No performance data yet</td></tr>
            ) : (
              performance.slice(0, 20).map((p) => (
                <tr key={p.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white">{p.channel}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{p.impressions.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{p.clicks.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{p.conversions}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">${p.revenue.toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(p.collected_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
