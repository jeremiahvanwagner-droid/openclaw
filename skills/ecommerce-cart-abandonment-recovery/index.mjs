import { supabase } from '../../lib/agent-memory.js';

const CART_TABLE     = 'ecommerce_abandoned_carts';
const RECOVERY_TABLE = 'ecommerce_recovery_sequences';

export async function detectAbandonments(carts) {
  const abandoned = carts.filter(c => c.status === 'abandoned' || (Date.now() - new Date(c.last_activity_at).getTime()) > 3600000);
  const classified = abandoned.map(c => ({ ...c, value_tier: (c.cart_value ?? 0) > 200 ? 'high' : (c.cart_value ?? 0) > 50 ? 'medium' : 'low', intent_score: c.items_count > 2 ? 'high' : 'medium' }));
  if (classified.length) await supabase.from(CART_TABLE).insert(classified.map(c => ({ ...c, detected_at: new Date().toISOString() })));
  return { detected: classified.length };
}

export async function segmentUsers(userId) {
  const { data: orders } = await supabase.from('ecommerce_orders').select('id, total').eq('customer_id', userId).order('created_at', { ascending: false }).limit(5);
  const priorPurchases = (orders ?? []).length;
  const avgOrder = priorPurchases > 0 ? (orders ?? []).reduce((s, o) => s + (o.total ?? 0), 0) / priorPurchases : 0;
  const segment = priorPurchases > 3 ? 'loyal' : priorPurchases > 0 ? 'returning' : 'new';
  return { user_id: userId, segment, prior_purchases: priorPurchases, avg_order_value: Math.round(avgOrder), price_sensitive: avgOrder < 50 };
}

export function selectRecoveryTiming(context) {
  const timings = {
    high_value: [1, 24, 72],
    medium_value: [1, 48],
    low_value: [24],
  };
  return timings[context.value_tier + '_value'] ?? timings.medium_value;
}

export function personalizeContent(userId, cartItems, userSegment) {
  const topItem = cartItems[0] ?? {};
  const urgency = userSegment.price_sensitive ? '' : ' — Only a few left!';
  return { subject: `You left ${topItem.name ?? 'something great'} behind${urgency}`, body: `Hi there! Your cart is still saved. ${topItem.name ?? 'Your item'} is waiting for you.`, product_spotlight: topItem };
}

export function applyIncentiveRules(cart, marginThreshold = 0.25) {
  const eligible = (cart.margin_pct ?? 0.3) > marginThreshold && cart.value_tier !== 'high';
  return { incentive_eligible: eligible, discount_pct: eligible ? 10 : 0, incentive_note: eligible ? '10% off if recovered in 24h' : null };
}

export async function trackRecoveryOutcome(cartId, recovered) {
  await supabase.from(CART_TABLE).update({ recovered, outcome_recorded_at: new Date().toISOString() }).eq('id', cartId);
  return { cart_id: cartId, recovered };
}

export async function outputRecoveryReport() {
  const { data } = await supabase.from(CART_TABLE).select('recovered, cart_value, value_tier');
  const rows = data ?? [];
  const recovered = rows.filter(r => r.recovered);
  const recoveredRevenue = recovered.reduce((s, r) => s + (r.cart_value ?? 0), 0);
  return { total_abandoned: rows.length, total_recovered: recovered.length, recovery_rate: rows.length > 0 ? Math.round(recovered.length / rows.length * 100) : 0, recovered_revenue: Math.round(recoveredRevenue), generated_at: new Date().toISOString() };
}
