import { supabase } from '../../lib/agent-memory.js';

const SHIPMENT_TABLE = 'ecommerce_shipment_plans';
const METRICS_TABLE  = 'ecommerce_route_metrics';

export function collectOrderProfile(order) {
  return { order_id: order.id, destination: order.shipping_address, weight_kg: order.weight_kg ?? 0.5, dimensions: order.dimensions ?? {}, sla_days: order.sla_days ?? 5, value: order.value ?? 0 };
}

export function scoreCarrierRoutes(carriers, profile) {
  return carriers.map(c => {
    const costScore = Math.max(0, 100 - (c.rate_usd ?? 10) * 3);
    const speedScore = Math.max(0, 100 - (c.transit_days ?? 5) * 10);
    const reliabilityScore = (c.on_time_pct ?? 0.9) * 100;
    const slaCompliant = (c.transit_days ?? 5) <= profile.sla_days;
    const finalScore = slaCompliant ? Math.round(costScore * 0.4 + speedScore * 0.3 + reliabilityScore * 0.3) : 0;
    return { carrier: c.name, rate_usd: c.rate_usd, transit_days: c.transit_days, reliability_pct: c.on_time_pct, sla_compliant: slaCompliant, score: finalScore };
  }).sort((a, b) => b.score - a.score);
}

export function selectBestRoute(scoredRoutes, constraints = {}) {
  const eligible = scoredRoutes.filter(r => r.sla_compliant && r.rate_usd <= (constraints.max_cost ?? Infinity));
  return eligible[0] ?? scoredRoutes[0] ?? null;
}

export function applyFallback(selectedRoute, allRoutes) {
  if (selectedRoute && selectedRoute.score > 0) return selectedRoute;
  const fallback = allRoutes.find(r => r.carrier !== selectedRoute?.carrier && r.sla_compliant);
  return fallback ?? allRoutes[0] ?? null;
}

export async function commitShipmentPlan(orderId, route) {
  const trackingId = `TRK-${orderId}-${Date.now()}`;
  const plan = { order_id: orderId, carrier: route.carrier, rate_usd: route.rate_usd, transit_days: route.transit_days, tracking_id: trackingId, status: 'committed', committed_at: new Date().toISOString() };
  await supabase.from(SHIPMENT_TABLE).insert(plan);
  return { ...plan, tracking_initialized: true };
}

export async function recordRouteOutcome(orderId, actualDeliveryDays, promisedDays) {
  const onTime = actualDeliveryDays <= promisedDays;
  await supabase.from(METRICS_TABLE).insert({ order_id: orderId, actual_days: actualDeliveryDays, promised_days: promisedDays, on_time: onTime, recorded_at: new Date().toISOString() });
  return { order_id: orderId, on_time };
}

export async function outputRoutePerformance() {
  const { data } = await supabase.from(METRICS_TABLE).select('carrier, on_time, actual_days, promised_days').order('recorded_at', { ascending: false }).limit(200);
  const rows = data ?? [];
  const byCarrier = rows.reduce((acc, r) => {
    if (!acc[r.carrier]) acc[r.carrier] = { total: 0, on_time: 0 };
    acc[r.carrier].total++;
    if (r.on_time) acc[r.carrier].on_time++;
    return acc;
  }, {});
  return { carrier_performance: Object.entries(byCarrier).map(([c, v]) => ({ carrier: c, on_time_pct: Math.round(v.on_time / v.total * 100), total_shipments: v.total })), generated_at: new Date().toISOString() };
}
