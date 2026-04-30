import { supabase } from '../../lib/agent-memory.js';

const SEARCH_TABLE = 'ecommerce_visual_searches';

export async function ingestImage(searchId, imageData) {
  const valid = imageData.size_bytes < 10 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(imageData.mime_type ?? '');
  await supabase.from(SEARCH_TABLE).insert({ search_id: searchId, image_url: imageData.url, valid, ingested_at: new Date().toISOString() });
  return { search_id: searchId, valid, reason: !valid ? 'image_too_large_or_unsupported_format' : null };
}

export function extractVisualFeatures(imageData) {
  return { dominant_colors: imageData.colors ?? ['unknown'], shape: imageData.shape ?? 'rectangular', texture: imageData.texture ?? 'smooth', style_cues: imageData.style_cues ?? [], confidence: imageData.feature_confidence ?? 0.75 };
}

export async function queryCatalogEmbeddings(features) {
  const { data } = await supabase.from('ecommerce_product_embeddings').select('sku, similarity_score, category, price, in_stock').gte('similarity_score', 0.6).order('similarity_score', { ascending: false }).limit(20);
  return { candidates: data ?? [] };
}

export function rerankCandidates(candidates, filters = {}) {
  return candidates.filter(c => {
    if (filters.category && c.category !== filters.category) return false;
    if (filters.max_price && (c.price ?? 0) > filters.max_price) return false;
    return true;
  }).sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0));
}

export function filterResults(reranked) {
  return reranked.filter(c => c.in_stock !== false && (c.similarity_score ?? 0) >= 0.65);
}

export async function returnMatches(searchId, matches) {
  const top = matches.slice(0, 8);
  const alternates = matches.slice(8, 12);
  await supabase.from(SEARCH_TABLE).update({ results_count: top.length, returned_at: new Date().toISOString() }).eq('search_id', searchId);
  return { search_id: searchId, top_matches: top.map(m => ({ sku: m.sku, confidence: m.similarity_score, price: m.price })), alternates: alternates.map(m => ({ sku: m.sku, confidence: m.similarity_score })) };
}

export async function logSearchOutcome(searchId, clickedSku) {
  await supabase.from(SEARCH_TABLE).update({ clicked_sku: clickedSku, outcome_logged_at: new Date().toISOString() }).eq('search_id', searchId);
  return { search_id: searchId, outcome_logged: true };
}
