"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface QaAudit {
  id: string;
  location_id: string;
  business_id: string;
  audit_type: string;
  score: number;
  findings_json: Record<string, unknown>;
  created_at: string;
}

interface Scorecard {
  id: string;
  location_id: string;
  business_id: string;
  overall_score: number;
  category_scores_json: Record<string, number>;
  period: string;
  created_at: string;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90 ? "text-green-400" :
    score >= 70 ? "text-yellow-400" :
    score >= 50 ? "text-orange-400" :
    "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{score}</span>;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color =
    score >= 90 ? "bg-green-500" :
    score >= 70 ? "bg-yellow-500" :
    score >= 50 ? "bg-orange-500" :
    "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 text-sm w-32 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-700 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-slate-300 font-mono text-sm w-8 text-right">{score}</span>
    </div>
  );
}

export default function CompliancePage() {
  const [audits, setAudits] = useState<QaAudit[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!supabase) { setLoading(false); return; }

      const [auditRes, scorecardRes] = await Promise.all([
        supabase.from("qa_audit_results").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("compliance_scorecards").select("*").order("created_at", { ascending: false }).limit(30),
      ]);

      setAudits(auditRes.data ?? []);
      setScorecards(scorecardRes.data ?? []);
      setLoading(false);
    }

    fetchData();
  }, []);

  async function handleRerunAudit() {
    setRerunning(true);
    try {
      await fetch("/api/compliance/rerun-audit", { method: "POST" });
    } finally {
      setRerunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading compliance data...</div>
      </div>
    );
  }

  // Group scorecards by business
  const businessScores = new Map<string, Scorecard>();
  for (const sc of scorecards) {
    if (!businessScores.has(sc.business_id)) {
      businessScores.set(sc.business_id, sc);
    }
  }

  const avgScore = scorecards.length > 0
    ? Math.round(scorecards.reduce((s, sc) => s + sc.overall_score, 0) / scorecards.length)
    : 0;
  const failingCount = Array.from(businessScores.values()).filter((sc) => sc.overall_score < 70).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">QA &amp; Compliance</h1>
          <p className="text-slate-400">Funnel audits, tracking integrity, brand compliance &amp; scorecards</p>
        </div>
        <button
          onClick={handleRerunAudit}
          disabled={rerunning}
          className="px-4 py-2 bg-claw-600 hover:bg-claw-500 text-white text-sm rounded-lg transition disabled:opacity-50"
        >
          {rerunning ? "Running..." : "Re-run Audit"}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold"><ScoreBadge score={avgScore} /></p>
          <p className="text-slate-400 text-sm">Avg Compliance Score</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-slate-300">{businessScores.size}</p>
          <p className="text-slate-400 text-sm">Businesses Audited</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-400">{failingCount}</p>
          <p className="text-slate-400 text-sm">Below Threshold (&lt;70)</p>
        </div>
      </div>

      {/* Scorecard grid */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Business Scorecards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from(businessScores.entries()).map(([bizId, sc]) => (
            <div key={bizId} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white text-sm">{bizId}</h3>
                <ScoreBadge score={sc.overall_score} />
              </div>
              <div className="space-y-2">
                {Object.entries(sc.category_scores_json).map(([cat, score]) => (
                  <ScoreBar key={cat} label={cat} score={score as number} />
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-2">Period: {sc.period}</p>
            </div>
          ))}
          {businessScores.size === 0 && (
            <div className="col-span-2 text-center text-slate-500 py-8">
              No scorecards generated yet
            </div>
          )}
        </div>
      </div>

      {/* Recent audit findings */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Audit Results</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Business</th>
                <th className="py-2 pr-4">Location</th>
                <th className="py-2 pr-4">Audit Type</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit.id} className="border-b border-slate-700/50 text-slate-300">
                  <td className="py-2 pr-4">{audit.business_id}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{audit.location_id}</td>
                  <td className="py-2 pr-4">{audit.audit_type}</td>
                  <td className="py-2 pr-4"><ScoreBadge score={audit.score} /></td>
                  <td className="py-2 text-slate-500 text-xs">{new Date(audit.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {audits.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">No audit results yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
