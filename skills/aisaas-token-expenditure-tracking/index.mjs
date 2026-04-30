/**
 * Token Expenditure Tracking — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const USAGE_TABLE  = 'aisaas_token_usage';
const BUDGET_TABLE = 'aisaas_tenant_budgets';
const BILLING_TABLE = 'aisaas_billing_records';

const MODEL_COST_PER_1K = {
  'claude-haiku-4-5-20251001': 0.001,
  'claude-sonnet-4-6': 0.003,
  'claude-opus-4-7': 0.015,
};

export async function captureTokenUsage(requestId, model, inputTokens, outputTokens) {
  const cost_per_1k = MODEL_COST_PER_1K[model] ?? 0.003;
  const total_cost = ((inputTokens + outputTokens) / 1000) * cost_per_1k;
  const record = { request_id: requestId, model, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens, total_cost, recorded_at: new Date().toISOString() };
  await supabase.from(USAGE_TABLE).insert(record);
  return record;
}

export async function attributeCostByTenant(tenantId, usageRecords) {
  const totals = usageRecords.reduce((a, r) => ({ tokens: a.tokens + r.total_tokens, cost: a.cost + r.total_cost }), { tokens: 0, cost: 0 });
  return { tenant_id: tenantId, ...totals, by_model: groupByModel(usageRecords) };
}

function groupByModel(records) {
  const groups = {};
  for (const r of records) {
    if (!groups[r.model]) groups[r.model] = { tokens: 0, cost: 0 };
    groups[r.model].tokens += r.total_tokens;
    groups[r.model].cost += r.total_cost;
  }
  return groups;
}

export async function compareToBudget(tenantId) {
  const { data: budget } = await supabase.from(BUDGET_TABLE).select('*').eq('tenant_id', tenantId).single();
  const { data: usage } = await supabase.from(USAGE_TABLE).select('total_cost').eq('tenant_id', tenantId);
  const used = (usage ?? []).reduce((a, u) => a + (u.total_cost ?? 0), 0);
  const pct = budget?.monthly_budget ? used / budget.monthly_budget : null;
  return { tenant_id: tenantId, used, budget: budget?.monthly_budget, usage_pct: pct, over_budget: pct ? pct > 1 : false };
}

export async function enforceLimits(tenantId, hardLimit, softLimit) {
  const { used } = await compareToBudget(tenantId);
  if (used > hardLimit) return { action: 'block', reason: 'hard_limit_exceeded' };
  if (used > softLimit) return { action: 'alert', reason: 'soft_limit_exceeded' };
  return { action: 'allow' };
}

export async function alertOnAbuseSpikes(tenantId, thresholdPerHour = 100000) {
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data } = await supabase.from(USAGE_TABLE).select('total_tokens').eq('tenant_id', tenantId).gte('recorded_at', hourAgo);
  const hourly = (data ?? []).reduce((a, u) => a + (u.total_tokens ?? 0), 0);
  return { tenant_id: tenantId, hourly_tokens: hourly, spike_detected: hourly > thresholdPerHour };
}

export async function reconcileWithBilling(tenantId, billingPeriod) {
  const { data } = await supabase.from(USAGE_TABLE).select('*').eq('tenant_id', tenantId).gte('recorded_at', billingPeriod.start).lte('recorded_at', billingPeriod.end);
  const total = (data ?? []).reduce((a, u) => a + (u.total_cost ?? 0), 0);
  await supabase.from(BILLING_TABLE).upsert({ tenant_id: tenantId, period: billingPeriod.start, total_cost: total, reconciled_at: new Date().toISOString() }, { onConflict: 'tenant_id,period' });
  return { tenant_id: tenantId, period: billingPeriod, total_cost: total };
}

export async function outputProfitabilityDashboard(tenantId) {
  const { data } = await supabase.from(USAGE_TABLE).select('*').eq('tenant_id', tenantId).order('recorded_at', { ascending: false }).limit(100);
  return { tenant_id: tenantId, records: data ?? [], total_spent: (data ?? []).reduce((a, u) => a + (u.total_cost ?? 0), 0), generated_at: new Date().toISOString() };
}
