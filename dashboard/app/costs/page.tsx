"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DailyBurn {
  date: string;
  cost: number;
}

interface DivisionCost {
  division: string;
  anthropic: number;
  openai: number;
}

interface AgentSpend {
  agent_id: string;
  total_cost: number;
  total_tokens: number;
}

interface CostsResponse {
  budgetCeiling: number;
  totalToday: number;
  dailyBurn: DailyBurn[];
  divisionCosts: DivisionCost[];
  topSpenders: AgentSpend[];
}

export default function CostsPage() {
  const [dailyBurn, setDailyBurn] = useState<DailyBurn[]>([]);
  const [divisionCosts, setDivisionCosts] = useState<DivisionCost[]>([]);
  const [topSpenders, setTopSpenders] = useState<AgentSpend[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [budgetCeiling, setBudgetCeiling] = useState(120);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCosts() {
      const response = await fetch("/api/costs", { cache: "no-store" });
      if (!response.ok) {
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as CostsResponse;
      setBudgetCeiling(payload.budgetCeiling);
      setTotalToday(payload.totalToday);
      setDailyBurn(payload.dailyBurn);
      setDivisionCosts(payload.divisionCosts);
      setTopSpenders(payload.topSpenders);

      setLoading(false);
    }

    fetchCosts();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading cost data...</div>
      </div>
    );
  }

  const utilizationPct = budgetCeiling > 0 ? (totalToday / budgetCeiling) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Cost Tracking</h1>
        <p className="text-slate-400">LLM token usage and spend across the agent network</p>
      </div>

      {/* Budget utilization gauge */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Today&apos;s Budget Utilization
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="w-full bg-slate-700 rounded-full h-4">
              <div
                className={`h-4 rounded-full transition-all ${
                  utilizationPct > 90
                    ? "bg-red-500"
                    : utilizationPct > 75
                    ? "bg-yellow-500"
                    : "bg-green-500"
                }`}
                style={{ width: `${Math.min(utilizationPct, 100)}%` }}
              />
            </div>
          </div>
          <span className="text-white font-mono text-sm min-w-[120px] text-right">
            ${totalToday.toFixed(2)} / ${budgetCeiling}
          </span>
        </div>
      </div>

      {/* Daily burn rate chart */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Daily Cost Burn Rate</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={dailyBurn}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
              labelStyle={{ color: "#e2e8f0" }}
              formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
            />
            <Area
              type="monotone"
              dataKey="cost"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Division breakdown stacked bar */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Per-Division Cost Breakdown</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={divisionCosts}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="division" stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            <Legend />
            <Bar dataKey="anthropic" stackId="cost" fill="#a78bfa" name="Anthropic" />
            <Bar dataKey="openai" stackId="cost" fill="#34d399" name="OpenAI" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 10 spenders table */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Top 10 Agent Spenders (30d)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4 text-right">Total Cost</th>
                <th className="py-2 text-right">Total Tokens</th>
              </tr>
            </thead>
            <tbody>
              {topSpenders.map((agent, i) => (
                <tr key={agent.agent_id} className="border-b border-slate-700/50 text-slate-300">
                  <td className="py-2 pr-4 text-slate-500">{i + 1}</td>
                  <td className="py-2 pr-4 font-mono">{agent.agent_id}</td>
                  <td className="py-2 pr-4 text-right">${agent.total_cost.toFixed(4)}</td>
                  <td className="py-2 text-right">{agent.total_tokens.toLocaleString()}</td>
                </tr>
              ))}
              {topSpenders.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No cost data recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
