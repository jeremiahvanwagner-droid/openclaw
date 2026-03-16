"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";
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

interface CostRecord {
  agent_id: string;
  provider: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  recorded_at: string;
}

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

export default function CostsPage() {
  const [dailyBurn, setDailyBurn] = useState<DailyBurn[]>([]);
  const [divisionCosts, setDivisionCosts] = useState<DivisionCost[]>([]);
  const [topSpenders, setTopSpenders] = useState<AgentSpend[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [budgetCeiling] = useState(120); // $120/day total across providers
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCosts() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: costs } = await supabase
        .from("agent_costs")
        .select("*")
        .gte("recorded_at", thirtyDaysAgo.toISOString())
        .order("recorded_at", { ascending: true });

      if (!costs || costs.length === 0) {
        setLoading(false);
        return;
      }

      // Daily burn rate
      const dailyMap = new Map<string, number>();
      const todayStr = new Date().toISOString().slice(0, 10);
      let todayTotal = 0;

      for (const c of costs as CostRecord[]) {
        const day = c.recorded_at.slice(0, 10);
        dailyMap.set(day, (dailyMap.get(day) || 0) + c.cost_usd);
        if (day === todayStr) todayTotal += c.cost_usd;
      }

      setDailyBurn(
        Array.from(dailyMap.entries()).map(([date, cost]) => ({ date, cost: +cost.toFixed(4) }))
      );
      setTotalToday(todayTotal);

      // Per-division cost breakdown
      const divMap = new Map<string, { anthropic: number; openai: number }>();
      for (const c of costs as CostRecord[]) {
        const div = c.agent_id.startsWith("d")
          ? c.agent_id.split("_")[0].toUpperCase()
          : "Shared";
        if (!divMap.has(div)) divMap.set(div, { anthropic: 0, openai: 0 });
        const entry = divMap.get(div)!;
        if (c.provider === "anthropic") entry.anthropic += c.cost_usd;
        else entry.openai += c.cost_usd;
      }
      setDivisionCosts(
        Array.from(divMap.entries()).map(([division, costs]) => ({
          division,
          anthropic: +costs.anthropic.toFixed(4),
          openai: +costs.openai.toFixed(4),
        }))
      );

      // Top 10 spenders
      const agentMap = new Map<string, { cost: number; tokens: number }>();
      for (const c of costs as CostRecord[]) {
        if (!agentMap.has(c.agent_id)) agentMap.set(c.agent_id, { cost: 0, tokens: 0 });
        const e = agentMap.get(c.agent_id)!;
        e.cost += c.cost_usd;
        e.tokens += c.tokens_in + c.tokens_out;
      }

      setTopSpenders(
        Array.from(agentMap.entries())
          .map(([agent_id, v]) => ({
            agent_id,
            total_cost: +v.cost.toFixed(4),
            total_tokens: v.tokens,
          }))
          .sort((a, b) => b.total_cost - a.total_cost)
          .slice(0, 10)
      );

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
