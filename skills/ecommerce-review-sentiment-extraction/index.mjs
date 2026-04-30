import { supabase } from '../../lib/agent-memory.js';

const REVIEW_TABLE  = 'ecommerce_review_sentiments';
const DEFECT_TABLE  = 'ecommerce_defect_signals';

const ASPECT_PATTERNS = {
  quality:   /quality|material|build|durable|sturdy|cheap|flimsy/i,
  sizing:    /size|fit|small|large|measurements|tight|loose/i,
  shipping:  /shipping|delivery|arrived|packaging|late|fast/i,
  value:     /price|worth|value|expensive|cheap|overpriced/i,
  defect:    /broken|defective|damage|crack|missing|wrong/i,
};

function classifyAspect(text) {
  for (const [aspect, pattern] of Object.entries(ASPECT_PATTERNS)) {
    if (pattern.test(text)) return aspect;
  }
  return 'general';
}

function classifyIntensity(rating) {
  if (rating >= 4) return 'positive';
  if (rating >= 3) return 'neutral';
  return 'negative';
}

export async function ingestReviews(sku, reviews) {
  const rows = reviews.map(r => {
    const aspect = classifyAspect(r.text ?? '');
    const sentiment = classifyIntensity(r.rating ?? 3);
    const isDefect = aspect === 'defect' || r.rating === 1;
    return { sku, review_id: r.id, text_preview: (r.text ?? '').slice(0, 200), rating: r.rating, aspect, sentiment, is_defect: isDefect, ingested_at: new Date().toISOString() };
  });
  if (rows.length) await supabase.from(REVIEW_TABLE).insert(rows);
  return { sku, reviews_ingested: rows.length };
}

export async function extractDefectThemes(sku) {
  const { data } = await supabase.from(REVIEW_TABLE).select('aspect, text_preview, rating').eq('sku', sku).eq('is_defect', true);
  const themes = (data ?? []).reduce((acc, r) => { acc[r.aspect] = (acc[r.aspect] ?? 0) + 1; return acc; }, {});
  return { sku, defect_themes: themes, total_defect_mentions: (data ?? []).length };
}

export async function quantifyDefectTrends(sku) {
  const { data } = await supabase.from(REVIEW_TABLE).select('is_defect, ingested_at').eq('sku', sku);
  const total = (data ?? []).length;
  const defects = (data ?? []).filter(r => r.is_defect).length;
  const defectRate = total > 0 ? Math.round(defects / total * 100) : 0;
  return { sku, defect_rate_pct: defectRate, severity: defectRate > 20 ? 'critical' : defectRate > 10 ? 'high' : 'normal' };
}

export async function mapToVendor(sku) {
  const { data } = await supabase.from('ecommerce_inventory').select('vendor_id, vendor_name').eq('sku', sku).single();
  return { sku, vendor_id: data?.vendor_id ?? null, vendor_name: data?.vendor_name ?? 'Unknown' };
}

export async function alertSourcingTeam(sku, trend) {
  if (trend.severity === 'critical' || trend.severity === 'high') {
    await supabase.from(DEFECT_TABLE).insert({ sku, defect_rate_pct: trend.defect_rate_pct, severity: trend.severity, alert_sent: true, alerted_at: new Date().toISOString() });
    return { sku, alert_sent: true, severity: trend.severity };
  }
  return { sku, alert_sent: false };
}

export async function outputQualityBrief() {
  const { data } = await supabase.from(DEFECT_TABLE).select('sku, defect_rate_pct, severity').order('defect_rate_pct', { ascending: false }).limit(20);
  return { top_defect_skus: data ?? [], action_priorities: (data ?? []).filter(r => r.severity === 'critical').map(r => ({ sku: r.sku, action: 'Pull from sale and contact vendor' })), generated_at: new Date().toISOString() };
}
