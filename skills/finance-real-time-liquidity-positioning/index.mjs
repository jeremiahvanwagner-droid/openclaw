import { supabase } from '../../lib/agent-memory.js';

const POSITION_TABLE  = 'finance_liquidity_positions';
const ALLOCATION_TABLE = 'finance_liquidity_allocations';

const LIQUIDITY_TIERS = { immediate: { horizon_hours: 4, risk_tolerance: 'none' }, short: { horizon_hours: 24, risk_tolerance: 'low' }, medium: { horizon_hours: 168, risk_tolerance: 'moderate' } };

export async function aggregateBalances(entityId) {
  const { data } = await supabase.from('finance_cash_accounts').select('account_id, balance, currency, settlement_hours').eq('entity_id', entityId);
  const totalCash = (data ?? []).reduce((s, a) => s + (a.balance ?? 0), 0);
  return { entity_id: entityId, accounts: data ?? [], total_cash: totalCash };
}

export function classifyLiquidityTiers(accounts) {
  return accounts.map(a => ({ ...a, tier: (a.settlement_hours ?? 0) <= 4 ? 'immediate' : (a.settlement_hours ?? 0) <= 24 ? 'short' : 'medium' }));
}

export function forecastCashDemands(obligations, windowHours = 24) {
  const due = obligations.filter(o => (new Date(o.due_at).getTime() - Date.now()) / 3600000 <= windowHours);
  const totalDue = due.reduce((s, o) => s + (o.amount ?? 0), 0);
  return { total_due: totalDue, due_count: due.length, window_hours: windowHours, obligations: due };
}

export async function reallocateIdle(entityId, idleCash, venues) {
  const allocations = venues.slice(0, 3).map((v, i) => ({ entity_id: entityId, venue_id: v.id, allocated_amount: Math.round(idleCash * (v.weight ?? 0.33)), tier: v.tier ?? 'short', allocated_at: new Date().toISOString() }));
  if (allocations.length) await supabase.from(ALLOCATION_TABLE).insert(allocations);
  return { entity_id: entityId, total_reallocated: allocations.reduce((s, a) => s + a.allocated_amount, 0), venues_used: allocations.length };
}

export function enforceConcentrationLimits(allocations, maxConcentration = 0.5) {
  const total = allocations.reduce((s, a) => s + a.allocated_amount, 0);
  return allocations.map(a => {
    const pct = total > 0 ? a.allocated_amount / total : 0;
    if (pct > maxConcentration) return { ...a, allocated_amount: Math.round(total * maxConcentration), capped: true };
    return { ...a, capped: false };
  });
}

export async function recomputeAfterChanges(entityId) {
  const balances = await aggregateBalances(entityId);
  const { data: obligations } = await supabase.from('finance_obligations').select('*').eq('entity_id', entityId);
  const demands = forecastCashDemands(obligations ?? [], 24);
  const idle = balances.total_cash - demands.total_due;
  return { entity_id: entityId, total_cash: balances.total_cash, cash_demands_24h: demands.total_due, idle_cash: Math.max(0, idle), recomputed_at: new Date().toISOString() };
}

export async function outputLiquidityReport(entityId) {
  const posture = await recomputeAfterChanges(entityId);
  const { data: allocations } = await supabase.from(ALLOCATION_TABLE).select('venue_id, allocated_amount, tier').eq('entity_id', entityId);
  return { entity_id: entityId, posture, allocations: allocations ?? [], utilization_pct: posture.total_cash > 0 ? Math.round((posture.total_cash - posture.idle_cash) / posture.total_cash * 100) : 0, generated_at: new Date().toISOString() };
}
