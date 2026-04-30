/**
 * Model Context Protocol Management — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const CONTEXT_TABLE = 'aisaas_context_layers';
const AUDIT_TABLE   = 'aisaas_context_audit';

export async function defineContextLayers(sessionId) {
  const layers = [
    { layer: 'session', ttl_minutes: 30, priority: 1 },
    { layer: 'user', ttl_minutes: 1440, priority: 2 },
    { layer: 'workspace', ttl_minutes: 10080, priority: 3 },
    { layer: 'durable_memory', ttl_minutes: null, priority: 4 },
  ];
  await supabase.from(CONTEXT_TABLE).upsert(layers.map(l => ({ session_id: sessionId, ...l, defined_at: new Date().toISOString() })), { onConflict: 'session_id,layer' });
  return { session_id: sessionId, layers };
}

export async function setRetentionPolicies(sessionId, policies) {
  await supabase.from(CONTEXT_TABLE).update({ policies }).eq('session_id', sessionId);
  return { session_id: sessionId, policies_set: policies.length };
}

export async function segmentContext(sessionId, items) {
  const chunks = items.map((item, i) => ({ session_id: sessionId, chunk_id: `${sessionId}-${i}`, content: item.content, metadata: item.metadata ?? {}, relevance: item.relevance ?? 0.5 }));
  if (chunks.length) await supabase.from(CONTEXT_TABLE).insert(chunks);
  return { session_id: sessionId, chunks: chunks.length };
}

export async function compactContext(sessionId, tokenBudget) {
  const { data } = await supabase.from(CONTEXT_TABLE).select('*').eq('session_id', sessionId).order('relevance', { ascending: false });
  let cumTokens = 0;
  const retained = (data ?? []).filter(chunk => {
    const t = Math.ceil((chunk.content ?? '').split(/\s+/).length * 1.3);
    if (cumTokens + t > tokenBudget) return false;
    cumTokens += t;
    return true;
  });
  return { session_id: sessionId, retained: retained.length, total: (data ?? []).length, tokens_used: cumTokens };
}

export async function rehydrateContext(sessionId, taskType) {
  const { data } = await supabase.from(CONTEXT_TABLE).select('*').eq('session_id', sessionId).gte('relevance', 0.6).order('priority', { ascending: false }).limit(20);
  await supabase.from(AUDIT_TABLE).insert({ session_id: sessionId, task_type: taskType, chunks_loaded: (data ?? []).length, rehydrated_at: new Date().toISOString() });
  return { session_id: sessionId, context: data ?? [], loaded: (data ?? []).length };
}

export async function logContextDecisions(sessionId, decisions) {
  const entries = decisions.map(d => ({ session_id: sessionId, ...d, logged_at: new Date().toISOString() }));
  if (entries.length) await supabase.from(AUDIT_TABLE).insert(entries);
  return { logged: entries.length };
}

export async function outputContextHealthMetrics(sessionId) {
  const { data } = await supabase.from(CONTEXT_TABLE).select('*').eq('session_id', sessionId);
  return { session_id: sessionId, chunk_count: (data ?? []).length, avg_relevance: (data ?? []).reduce((a, d) => a + (d.relevance ?? 0), 0) / ((data ?? []).length || 1), generated_at: new Date().toISOString() };
}
