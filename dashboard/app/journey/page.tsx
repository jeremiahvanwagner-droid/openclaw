"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface JourneyScore {
  id: string;
  contact_id: string;
  business_id: string;
  intent_score: number;
  factors: Record<string, number>;
  scored_at: string;
}

interface Touchpoint {
  id: string;
  contact_id: string;
  business_id: string;
  event_type: string;
  channel: string;
  funnel_stage: string;
  timestamp: string;
}

interface Recommendation {
  id: string;
  contact_id: string;
  recommended_offer_id: string;
  reason: string;
  status: string;
  created_at: string;
}

function IntentBadge({ score }: { score: number }) {
  const colors =
    score >= 80
      ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50"
      : score >= 50
        ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/50"
        : "bg-slate-800/60 text-slate-400 border-slate-700/50";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors}`}>
      {score}
    </span>
  );
}

export default function JourneyPage() {
  const [scores, setScores] = useState<JourneyScore[]>([]);
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    async function load() {
      const [scoreRes, tpRes, recRes] = await Promise.all([
        supabase!.from("journey_scores").select("*").order("scored_at", { ascending: false }).limit(50),
        supabase!.from("journey_touchpoints").select("*").order("timestamp", { ascending: false }).limit(50),
        supabase!.from("journey_recommendations").select("*").order("created_at", { ascending: false }).limit(30),
      ]);
      setScores(scoreRes.data || []);
      setTouchpoints(tpRes.data || []);
      setRecommendations(recRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const highIntentCount = scores.filter((s) => s.intent_score >= 80).length;
  const avgScore = scores.length
    ? Math.round(scores.reduce((s, sc) => s + sc.intent_score, 0) / scores.length)
    : 0;
  const pendingRecs = recommendations.filter((r) => r.status === "pending").length;

  // Funnel stage distribution
  const stageCounts: Record<string, number> = {};
  touchpoints.forEach((tp) => {
    const stage = tp.funnel_stage || "unknown";
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });

  if (!supabase) return <p className="text-slate-400 p-8">Supabase not configured.</p>;
  if (loading) return <p className="text-slate-400 p-8">Loading journey data…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Customer Journey Intelligence</h1>
        <p className="text-slate-400 text-sm mt-1">Touchpoint tracking, intent scoring & next-offer recommendations</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Contacts Scored</p>
          <p className="text-2xl font-bold text-white">{scores.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Avg Intent Score</p>
          <p className="text-2xl font-bold text-blue-400">{avgScore}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">High Intent (80+)</p>
          <p className="text-2xl font-bold text-emerald-400">{highIntentCount}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase">Pending Offers</p>
          <p className="text-2xl font-bold text-yellow-400">{pendingRecs}</p>
        </div>
      </div>

      {/* Funnel Stage Distribution */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Funnel Stage Distribution</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(stageCounts).map(([stage, count]) => (
            <div key={stage} className="bg-slate-900/50 border border-slate-700/50 rounded px-3 py-2">
              <p className="text-slate-400 text-xs uppercase">{stage}</p>
              <p className="text-lg font-bold text-white">{count}</p>
            </div>
          ))}
          {Object.keys(stageCounts).length === 0 && (
            <p className="text-slate-500 text-sm">No touchpoint data yet</p>
          )}
        </div>
      </div>

      {/* High Intent Contacts */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Intent Scores</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Contact</th>
              <th className="px-4 py-2 text-left">Business</th>
              <th className="px-4 py-2 text-center">Score</th>
              <th className="px-4 py-2 text-left">Top Factors</th>
              <th className="px-4 py-2 text-left">Scored</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {scores.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No scores recorded yet</td></tr>
            ) : (
              scores.map((s) => (
                <tr key={s.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white font-mono text-xs">{s.contact_id?.slice(0, 12)}…</td>
                  <td className="px-4 py-2 text-slate-300 font-mono text-xs">{s.business_id}</td>
                  <td className="px-4 py-2 text-center"><IntentBadge score={s.intent_score} /></td>
                  <td className="px-4 py-2 text-slate-400 text-xs">
                    {Object.entries(s.factors || {})
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ")}
                  </td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{new Date(s.scored_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recommendations */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Next-Offer Recommendations</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Contact</th>
              <th className="px-4 py-2 text-left">Offer</th>
              <th className="px-4 py-2 text-left">Reason</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {recommendations.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No recommendations yet</td></tr>
            ) : (
              recommendations.map((r) => (
                <tr key={r.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-2 text-white font-mono text-xs">{r.contact_id?.slice(0, 12)}…</td>
                  <td className="px-4 py-2 text-slate-300">{r.recommended_offer_id}</td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{r.reason}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${r.status === "pending" ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/50" : "bg-emerald-900/40 text-emerald-300 border-emerald-700/50"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Touchpoints */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Recent Touchpoints</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Contact</th>
              <th className="px-4 py-2 text-left">Event</th>
              <th className="px-4 py-2 text-left">Channel</th>
              <th className="px-4 py-2 text-left">Stage</th>
              <th className="px-4 py-2 text-left">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {touchpoints.slice(0, 15).map((tp) => (
              <tr key={tp.id} className="hover:bg-slate-700/20">
                <td className="px-4 py-2 text-white font-mono text-xs">{tp.contact_id?.slice(0, 12)}…</td>
                <td className="px-4 py-2 text-slate-300">{tp.event_type}</td>
                <td className="px-4 py-2 text-slate-400">{tp.channel}</td>
                <td className="px-4 py-2 text-slate-400">{tp.funnel_stage}</td>
                <td className="px-4 py-2 text-slate-400 text-xs">{new Date(tp.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
