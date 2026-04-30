import { supabase } from '../../lib/agent-memory.js';

const INVENTORY_TABLE = 'ecommerce_inventory_forecasts';
const PO_TABLE        = 'ecommerce_purchase_orders';

export async function collectSkuData(skus) {
  const { data } = await supabase.from('ecommerce_inventory').select('*').in('sku', skus);
  return { skus: data ?? [], count: (data ?? []).length };
}

export function forecastDemand(skuData) {
  const baseVelocity = (skuData.units_sold_30d ?? 0) / 30;
  const seasonalMultiplier = skuData.seasonality_factor ?? 1.0;
  const forecastedDaily = baseVelocity * seasonalMultiplier;
  const daysOfStock = (skuData.units_on_hand ?? 0) / Math.max(forecastedDaily, 0.01);
  return { sku: skuData.sku, forecasted_daily_units: Math.round(forecastedDaily * 100) / 100, days_of_stock: Math.round(daysOfStock), forecast_confidence: skuData.units_sold_30d > 10 ? 'high' : 'low' };
}

export function estimateStockoutRisk(forecast, leadTimeDays = 7) {
  const buffer = leadTimeDays + 7;
  const riskDays = forecast.days_of_stock - buffer;
  return { sku: forecast.sku, stockout_risk_date: new Date(Date.now() + forecast.days_of_stock * 86400000).toISOString().slice(0, 10), risk_level: riskDays < 0 ? 'critical' : riskDays < 7 ? 'high' : riskDays < 14 ? 'medium' : 'low' };
}

export function computeReorderPoint(forecast, safetyStockDays = 7, leadTimeDays = 7) {
  const reorderPoint = Math.ceil(forecast.forecasted_daily_units * (leadTimeDays + safetyStockDays));
  const orderQuantity = Math.ceil(forecast.forecasted_daily_units * 30);
  return { sku: forecast.sku, reorder_point: reorderPoint, recommended_order_qty: orderQuantity };
}

export async function generatePurchaseOrders(reorderItems, highRiskOnly = true) {
  const eligible = highRiskOnly ? reorderItems.filter(r => r.risk_level === 'critical' || r.risk_level === 'high') : reorderItems;
  const orders = eligible.map(r => ({ sku: r.sku, qty: r.recommended_order_qty, status: 'draft', created_at: new Date().toISOString() }));
  if (orders.length) await supabase.from(PO_TABLE).insert(orders);
  return { purchase_orders_created: orders.length, orders };
}

export function applySupplierConstraints(orders, supplierRules = {}) {
  return orders.map(o => {
    const supplier = supplierRules[o.sku] ?? {};
    const minQty = supplier.min_order_qty ?? 1;
    const adjustedQty = Math.max(o.qty, minQty);
    return { ...o, qty: adjustedQty, adjusted_for_minimum: adjustedQty > o.qty };
  });
}

export async function outputReplenishmentQueue() {
  const { data: pos } = await supabase.from(PO_TABLE).select('*').eq('status', 'draft').order('created_at', { ascending: false });
  return { replenishment_queue: pos ?? [], total_orders: (pos ?? []).length, estimated_eta: '3-5 business days', generated_at: new Date().toISOString() };
}
