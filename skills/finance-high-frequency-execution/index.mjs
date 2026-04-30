import { supabase } from '../../lib/agent-memory.js';

const ORDER_TABLE     = 'finance_hf_orders';
const TELEMETRY_TABLE = 'finance_hf_telemetry';

export async function ingestMarketData(feedId, tick) {
  const ts = Date.now();
  return { feed_id: feedId, price: tick.price, bid: tick.bid, ask: tick.ask, deterministic_ts: ts, latency_us: (ts - (tick.source_ts ?? ts)) * 1000 };
}

export function evaluateSignal(tick, strategy) {
  const signal = strategy.generate?.(tick) ?? null;
  const approved = strategy.approved_signals?.includes(signal) ?? false;
  return { signal, approved, tick_price: tick.price };
}

export async function runPreTradeChecks(strategyId, order) {
  const { data: state } = await supabase.from('finance_strategy_state').select('*').eq('strategy_id', strategyId).single();
  const checks = { kill_switch_active: state?.kill_switch ?? false, within_position_limit: (state?.open_position ?? 0) + (order.size ?? 0) <= (state?.position_limit ?? 1000), within_exposure_cap: true };
  const approved = !checks.kill_switch_active && checks.within_position_limit && checks.within_exposure_cap;
  return { approved, checks, reason: !approved ? Object.entries(checks).find(([, v]) => !v)?.[0] ?? 'unknown_check_failed' : null };
}

export async function submitOrder(strategyId, order, preTradeResult) {
  if (!preTradeResult.approved) return { submitted: false, reason: preTradeResult.reason };
  const orderId = `HF-${strategyId}-${Date.now()}`;
  await supabase.from(ORDER_TABLE).insert({ order_id: orderId, strategy_id: strategyId, ...order, status: 'submitted', submitted_at: new Date().toISOString() });
  return { submitted: true, order_id: orderId };
}

export async function enforceSlippageGuard(orderId, expectedPrice, fillPrice) {
  const slippageBps = Math.abs((fillPrice - expectedPrice) / expectedPrice * 10000);
  const excessive = slippageBps > 10;
  if (excessive) await supabase.from(ORDER_TABLE).update({ status: 'cancelled', cancel_reason: 'excessive_slippage' }).eq('order_id', orderId);
  return { order_id: orderId, slippage_bps: Math.round(slippageBps), cancelled: excessive };
}

export async function cancelStaleOrders(strategyId, maxAgeMs = 5000) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { data } = await supabase.from(ORDER_TABLE).select('order_id').eq('strategy_id', strategyId).eq('status', 'submitted').lt('submitted_at', cutoff);
  const ids = (data ?? []).map(r => r.order_id);
  if (ids.length) await supabase.from(ORDER_TABLE).update({ status: 'cancelled', cancel_reason: 'stale_timeout' }).in('order_id', ids);
  return { cancelled_count: ids.length };
}

export async function outputExecutionTelemetry(strategyId) {
  const { data } = await supabase.from(ORDER_TABLE).select('status, slippage_bps, submitted_at').eq('strategy_id', strategyId).order('submitted_at', { ascending: false }).limit(100);
  const rows = data ?? [];
  return { strategy_id: strategyId, total_orders: rows.length, filled: rows.filter(r => r.status === 'filled').length, cancelled: rows.filter(r => r.status === 'cancelled').length, avg_slippage_bps: rows.filter(r => r.slippage_bps).reduce((s, r) => s + r.slippage_bps, 0) / Math.max(rows.filter(r => r.slippage_bps).length, 1), generated_at: new Date().toISOString() };
}
