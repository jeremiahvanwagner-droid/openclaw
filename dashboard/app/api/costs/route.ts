import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseServer } from "../../supabase-server";
import { isUserAdmin } from "../../../lib/admin";

interface CostRecord {
  agent_id: string;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  recorded_at: string;
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabaseAuth = createSupabaseServer();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getServiceSupabase();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from("agent_costs")
    .select("agent_id, provider, tokens_in, tokens_out, cost_usd, recorded_at")
    .gte("recorded_at", thirtyDaysAgo.toISOString())
    .order("recorded_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const costs = (data ?? []) as CostRecord[];
  const dailyMap = new Map<string, number>();
  const divisionMap = new Map<string, { anthropic: number; openai: number }>();
  const agentMap = new Map<string, { cost: number; tokens: number }>();
  const today = new Date().toISOString().slice(0, 10);
  let totalToday = 0;

  for (const cost of costs) {
    const day = cost.recorded_at.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + cost.cost_usd);
    if (day === today) {
      totalToday += cost.cost_usd;
    }

    const division = cost.agent_id.startsWith("d")
      ? cost.agent_id.split("_")[0].toUpperCase()
      : "Shared";
    if (!divisionMap.has(division)) {
      divisionMap.set(division, { anthropic: 0, openai: 0 });
    }

    const divisionTotals = divisionMap.get(division)!;
    if (cost.provider === "anthropic") {
      divisionTotals.anthropic += cost.cost_usd;
    } else {
      divisionTotals.openai += cost.cost_usd;
    }

    if (!agentMap.has(cost.agent_id)) {
      agentMap.set(cost.agent_id, { cost: 0, tokens: 0 });
    }

    const agentTotals = agentMap.get(cost.agent_id)!;
    agentTotals.cost += cost.cost_usd;
    agentTotals.tokens += cost.tokens_in + cost.tokens_out;
  }

  return NextResponse.json({
    budgetCeiling: 120,
    totalToday,
    dailyBurn: Array.from(dailyMap.entries()).map(([date, cost]) => ({
      date,
      cost: Number(cost.toFixed(4)),
    })),
    divisionCosts: Array.from(divisionMap.entries()).map(([division, totals]) => ({
      division,
      anthropic: Number(totals.anthropic.toFixed(4)),
      openai: Number(totals.openai.toFixed(4)),
    })),
    topSpenders: Array.from(agentMap.entries())
      .map(([agent_id, totals]) => ({
        agent_id,
        total_cost: Number(totals.cost.toFixed(4)),
        total_tokens: totals.tokens,
      }))
      .sort((left, right) => right.total_cost - left.total_cost)
      .slice(0, 10),
  });
}
