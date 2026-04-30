import { supabase } from '../../lib/agent-memory.js';

const PRICING_TABLE = 'digital_pricing_history';

export async function gatherBaseline(productId) {
  const { data } = await supabase.from(PRICING_TABLE).select('*').eq('product_id', productId).order('recorded_at', { ascending: false }).limit(30);
  const rows = data ?? [];
  const avgConversion = rows.length > 0 ? rows.reduce((s, r) => s + (r.conversion_rate ?? 0), 0) / rows.length : 0;
  const avgRefundRate = rows.length > 0 ? rows.reduce((s, r) => s + (r.refund_rate ?? 0), 0) / rows.length : 0;
  return { product_id: productId, current_price: rows[0]?.price ?? 0, avg_conversion: avgConversion, avg_refund_rate: avgRefundRate, data_points: rows.length };
}

export function detectDemandRegime(trafficSignals) {
  const velocity = trafficSignals.sessions_last_24h / Math.max(trafficSignals.avg_daily_sessions, 1);
  const intentScore = trafficSignals.add_to_cart_rate ?? 0;
  if (velocity > 2 && intentScore > 0.05) return { regime: 'spike', confidence: 0.85 };
  if (velocity < 0.5) return { regime: 'trough', confidence: 0.75 };
  return { regime: 'normal', confidence: 0.9 };
}

export function modelPriceBands(currentPrice, constraints = {}) {
  const floor = constraints.floor ?? currentPrice * 0.7;
  const ceiling = constraints.ceiling ?? currentPrice * 1.5;
  const step = (ceiling - floor) / 4;
  return { floor, ceiling, bands: [floor, floor + step, currentPrice, ceiling - step, ceiling].map(p => Math.round(p / 5) * 5), brand_constraint: constraints.brand_constraint ?? null };
}

export function simulatePriceImpact(currentPrice, newPrice, baseline) {
  const priceChange = (newPrice - currentPrice) / currentPrice;
  const elasticity = -1.5;
  const newConversion = baseline.avg_conversion * (1 + elasticity * priceChange);
  const currentRevPerVisitor = currentPrice * baseline.avg_conversion;
  const newRevPerVisitor = newPrice * newConversion;
  return { new_price: newPrice, estimated_conversion: Math.round(newConversion * 1000) / 1000, revenue_per_visitor_change_pct: Math.round((newRevPerVisitor - currentRevPerVisitor) / currentRevPerVisitor * 100), net_impact: newRevPerVisitor > currentRevPerVisitor ? 'positive' : 'negative' };
}

export async function selectPriceAction(productId, regime, simulation) {
  const action = regime.regime === 'spike' && simulation.net_impact === 'positive' ? 'step_up' : regime.regime === 'trough' ? 'step_down' : 'hold';
  const record = { product_id: productId, regime: regime.regime, action, recommended_price: simulation.new_price, rationale: `Demand ${regime.regime}, simulation shows ${simulation.net_impact} revenue impact`, created_at: new Date().toISOString() };
  await supabase.from(PRICING_TABLE).insert(record);
  return record;
}

export async function schedulePricingWindow(productId, action, durationHours = 72) {
  const startAt = new Date().toISOString();
  const endAt = new Date(Date.now() + durationHours * 3600000).toISOString();
  const rollbackTrigger = 'conversion_drops_20pct';
  await supabase.from(PRICING_TABLE).update({ window_start: startAt, window_end: endAt, rollback_trigger: rollbackTrigger }).eq('product_id', productId).eq('action', action);
  return { product_id: productId, window_start: startAt, window_end: endAt, rollback_trigger: rollbackTrigger };
}

export async function outputPricingRecommendation(productId) {
  const { data } = await supabase.from(PRICING_TABLE).select('*').eq('product_id', productId).order('created_at', { ascending: false }).limit(1);
  const rec = (data ?? [])[0];
  return { product_id: productId, recommendation: rec, risk_note: 'Monitor conversion rate hourly for 24h post-change', monitoring_checklist: ['Check conversion rate vs baseline', 'Watch refund rate for spikes', 'Compare AOV before/after', 'Review support ticket volume'], generated_at: new Date().toISOString() };
}
