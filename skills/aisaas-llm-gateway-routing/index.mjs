/**
 * LLM Gateway Routing — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const ROUTING_TABLE  = 'aisaas_routing_decisions';
const OUTCOME_TABLE  = 'aisaas_routing_outcomes';

const MODEL_TIERS = {
  fast:    { model: 'claude-haiku-4-5-20251001', max_tokens: 1024,  cost_per_1k: 0.001, latency_ms: 500  },
  balanced:{ model: 'claude-sonnet-4-6',         max_tokens: 8192,  cost_per_1k: 0.003, latency_ms: 2000 },
  powerful:{ model: 'claude-opus-4-7',           max_tokens: 32768, cost_per_1k: 0.015, latency_ms: 5000 },
};

export function classifyRequest(request) {
  const tokenEstimate = Math.ceil((request.prompt ?? '').split(/\s+/).length * 1.3);
  const isComplex = tokenEstimate > 2000 || (request.requires_reasoning ?? false);
  const isLong = tokenEstimate > 500;
  const tier = isComplex ? 'powerful' : isLong ? 'balanced' : 'fast';
  return { tier, estimated_tokens: tokenEstimate, complex: isComplex };
}

export function mapRequestToTier(classification, constraints = {}) {
  const tier = MODEL_TIERS[classification.tier] ?? MODEL_TIERS.balanced;
  if (constraints.max_cost_per_1k && tier.cost_per_1k > constraints.max_cost_per_1k) {
    return { ...MODEL_TIERS.fast, tier: 'fast', downgraded: true };
  }
  return { ...tier, tier: classification.tier, downgraded: false };
}

export async function enforceConstraints(tenantId, requestedTier) {
  const { data } = await supabase.from('aisaas_tenant_budgets').select('*').eq('tenant_id', tenantId).single();
  const budget_ok = !data || (data.used_tokens ?? 0) < (data.token_limit ?? Infinity);
  return { tenant_id: tenantId, allowed_tier: budget_ok ? requestedTier : 'fast', budget_ok };
}

export async function dispatchQuery(request, tier, metadata = {}) {
  const decision = { request_id: request.id ?? `req-${Date.now()}`, tier, model: tier.model, metadata, dispatched_at: new Date().toISOString() };
  await supabase.from(ROUTING_TABLE).insert(decision);
  return decision;
}

export async function escalateOnLowConfidence(requestId, confidence, threshold = 0.7) {
  if (confidence >= threshold) return { escalated: false };
  await supabase.from(ROUTING_TABLE).update({ escalated: true, confidence }).eq('request_id', requestId);
  return { escalated: true, new_tier: 'powerful' };
}

export async function captureOutcome(requestId, outcome) {
  await supabase.from(OUTCOME_TABLE).insert({ request_id: requestId, ...outcome, captured_at: new Date().toISOString() });
  return { captured: true };
}

export async function outputRoutingReport() {
  const { data } = await supabase.from(ROUTING_TABLE).select('*').order('dispatched_at', { ascending: false }).limit(100);
  return { decisions: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
