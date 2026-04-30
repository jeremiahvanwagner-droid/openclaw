/**
 * RAG Indexing and Retrieval — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const INDEX_TABLE     = 'aisaas_rag_index';
const RETRIEVAL_TABLE = 'aisaas_rag_retrievals';

export async function ingestDataSources(sources) {
  const rows = sources.map(s => ({ source_id: s.id ?? `src-${Date.now()}`, type: s.type, uri: s.uri, access_control: s.access_level ?? 'private', ingested_at: new Date().toISOString() }));
  await supabase.from(INDEX_TABLE).upsert(rows, { onConflict: 'source_id' });
  return { ingested: rows.length };
}

export async function chunkAndIndex(sourceId, content, chunkSize = 500) {
  const words = content.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push({ source_id: sourceId, chunk_index: Math.floor(i / chunkSize), text: words.slice(i, i + chunkSize).join(' '), indexed_at: new Date().toISOString() });
  }
  if (chunks.length) await supabase.from(INDEX_TABLE).insert(chunks);
  return { source_id: sourceId, chunks: chunks.length };
}

export async function validateIndexFreshness(sourceId) {
  const { data } = await supabase.from(INDEX_TABLE).select('indexed_at').eq('source_id', sourceId).order('indexed_at', { ascending: false }).limit(1).single();
  const ageHours = data ? (Date.now() - new Date(data.indexed_at).getTime()) / 3600000 : Infinity;
  return { source_id: sourceId, fresh: ageHours < 24, age_hours: ageHours };
}

export async function retrieveCandidates(query, filters = {}, limit = 10) {
  let q = supabase.from(INDEX_TABLE).select('*').limit(limit);
  if (filters.source_id) q = q.eq('source_id', filters.source_id);
  const { data } = await q;
  await supabase.from(RETRIEVAL_TABLE).insert({ query, filters, results_count: (data ?? []).length, retrieved_at: new Date().toISOString() });
  return { candidates: data ?? [], count: (data ?? []).length };
}

export function rerankCandidates(candidates, query) {
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  return [...candidates]
    .map(c => {
      const overlap = (c.text ?? '').toLowerCase().split(/\s+/).filter(w => queryWords.has(w)).length;
      return { ...c, relevance_score: overlap / queryWords.size };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score);
}

export function groundResponseWithCitations(modelResponse, retrievedChunks) {
  const citations = retrievedChunks.slice(0, 3).map((c, i) => ({ index: i + 1, source_id: c.source_id, preview: c.text?.slice(0, 100) }));
  return { response: modelResponse, citations, citation_count: citations.length };
}

export async function outputRetrievalDiagnostics() {
  const { data } = await supabase.from(RETRIEVAL_TABLE).select('*').order('retrieved_at', { ascending: false }).limit(50);
  return { retrievals: data ?? [], avg_results: (data ?? []).reduce((a, r) => a + (r.results_count ?? 0), 0) / ((data ?? []).length || 1), generated_at: new Date().toISOString() };
}
