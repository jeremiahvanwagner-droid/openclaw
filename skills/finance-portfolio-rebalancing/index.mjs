import { supabase } from '../../lib/agent-memory.js';

const REBALANCE_TABLE = 'finance_rebalance_records';
const TRADE_TABLE     = 'finance_rebalance_trades';

export async function compareHoldings(portfolioId, targetAllocation) {
  const { data: holdings } = await supabase.from('finance_portfolio_holdings').select('*').eq('portfolio_id', portfolioId);
  const totalValue = (holdings ?? []).reduce((s, h) => s + (h.market_value ?? 0), 0);
  const current = (holdings ?? []).reduce((acc, h) => { acc[h.asset_id] = (h.market_value ?? 0) / Math.max(totalValue, 1); return acc; }, {});
  const drifts = Object.entries(targetAllocation).map(([asset, target]) => ({ asset_id: asset, current_pct: Math.round((current[asset] ?? 0) * 10000) / 100, target_pct: target * 100, drift_pct: Math.round(((current[asset] ?? 0) - target) * 10000) / 100 }));
  return { portfolio_id: portfolioId, total_value: totalValue, drifts };
}

export function identifyBreaches(drifts, tolerance = 2.0) {
  const breached = drifts.filter(d => Math.abs(d.drift_pct) > tolerance);
  return { breached, concentration_risk: breached.some(d => d.current_pct > 40) };
}

export function generateTradeSet(drifts, totalValue) {
  return drifts.filter(d => Math.abs(d.drift_pct) > 0.5).map(d => {
    const targetValue = (d.target_pct / 100) * totalValue;
    const currentValue = (d.current_pct / 100) * totalValue;
    const delta = targetValue - currentValue;
    return { asset_id: d.asset_id, action: delta > 0 ? 'buy' : 'sell', amount: Math.abs(Math.round(delta)), estimated_cost: Math.abs(Math.round(delta)) * 0.001 };
  });
}

export function enforceConstraints(trades, constraints = {}) {
  const { maxTurnover = 0.1, minLiquidity = 10000 } = constraints;
  return trades.filter(t => t.amount >= minLiquidity).map(t => ({ ...t, constrained_amount: Math.min(t.amount, maxTurnover * 1000000) }));
}

export function sequenceOrders(trades) {
  return trades.sort((a, b) => b.constrained_amount - a.constrained_amount).map((t, i) => ({ ...t, execution_sequence: i + 1, delay_ms: i * 500 }));
}

export async function verifyPostTrade(portfolioId, targetAllocation) {
  const { drifts } = await compareHoldings(portfolioId, targetAllocation);
  const residualDrift = drifts.reduce((s, d) => s + Math.abs(d.drift_pct), 0) / Math.max(drifts.length, 1);
  return { portfolio_id: portfolioId, post_trade_avg_drift_pct: Math.round(residualDrift * 100) / 100, on_target: residualDrift < 2.0 };
}

export async function outputRebalanceReport(portfolioId, trades) {
  const rows = trades.map(t => ({ portfolio_id: portfolioId, ...t, executed_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(TRADE_TABLE).insert(rows);
  return { portfolio_id: portfolioId, trades_executed: trades.length, total_trade_value: trades.reduce((s, t) => s + (t.constrained_amount ?? t.amount ?? 0), 0), generated_at: new Date().toISOString() };
}
