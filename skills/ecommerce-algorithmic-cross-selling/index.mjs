import { supabase } from '../../lib/agent-memory.js';

const AFFINITY_TABLE = 'ecommerce_product_affinity';
const RECO_TABLE     = 'ecommerce_cross_sell_recommendations';

export async function buildAffinityGraph(orderHistory) {
  const pairs = {};
  for (const order of orderHistory) {
    const items = order.items ?? [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const key = [items[i].sku, items[j].sku].sort().join('::');
        pairs[key] = (pairs[key] ?? 0) + 1;
      }
    }
  }
  const rows = Object.entries(pairs).map(([pair, count]) => { const [sku_a, sku_b] = pair.split('::'); return { sku_a, sku_b, co_purchase_count: count, affinity_score: Math.min(100, count * 10), updated_at: new Date().toISOString() }; });
  if (rows.length) await supabase.from(AFFINITY_TABLE).upsert(rows, { onConflict: 'sku_a,sku_b' });
  return { pairs_indexed: rows.length };
}

export async function detectShopperIntent(cartItems, sessionData) {
  const categories = cartItems.map(i => i.category ?? 'general');
  const primaryCategory = categories[0] ?? 'general';
  const intentSignals = { primary_category: primaryCategory, cart_value: cartItems.reduce((s, i) => s + (i.price ?? 0), 0), browsed_categories: sessionData.viewed_categories ?? [], high_intent: (sessionData.time_on_site_seconds ?? 0) > 120 };
  return intentSignals;
}

export async function selectCandidates(cartSkus, intent) {
  const { data } = await supabase.from(AFFINITY_TABLE).select('*').in('sku_a', cartSkus).gte('affinity_score', 30).order('affinity_score', { ascending: false }).limit(20);
  const candidates = (data ?? []).filter(r => !cartSkus.includes(r.sku_b));
  return { candidates: candidates.map(c => ({ sku: c.sku_b, affinity_score: c.affinity_score })) };
}

export function rerankCandidates(candidates, products) {
  return candidates.map(c => {
    const product = products.find(p => p.sku === c.sku) ?? {};
    const marginScore = (product.margin_pct ?? 0.3) * 40;
    const conversionScore = (product.conversion_rate ?? 0.05) * 200;
    return { ...c, margin_score: Math.round(marginScore), conversion_score: Math.round(conversionScore), final_score: Math.round(c.affinity_score * 0.5 + marginScore + conversionScore) };
  }).sort((a, b) => b.final_score - a.final_score);
}

export function suppressLowQuality(rankedCandidates, shownHistory = []) {
  return rankedCandidates.filter(c => !shownHistory.includes(c.sku) && c.final_score > 40).slice(0, 5);
}

export async function deliverRecommendations(customerId, placement, recommendations) {
  const rows = recommendations.map(r => ({ customer_id: customerId, placement, sku: r.sku, score: r.final_score, shown_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(RECO_TABLE).insert(rows);
  return { customer_id: customerId, placement, recommendations_shown: rows.length, skus: recommendations.map(r => r.sku) };
}

export async function outputUpliftMetrics() {
  const { data } = await supabase.from(RECO_TABLE).select('placement, converted');
  const rows = data ?? [];
  const conversions = rows.filter(r => r.converted).length;
  return { total_recommendations: rows.length, conversions, conversion_rate: rows.length > 0 ? Math.round(conversions / rows.length * 100) : 0, generated_at: new Date().toISOString() };
}
