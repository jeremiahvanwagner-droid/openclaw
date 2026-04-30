import { supabase } from '../../lib/agent-memory.js';

const ROUTE_TABLE  = 'finance_model_routes';
const EXEC_TABLE   = 'finance_model_executions';

const AGREEMENT_THRESHOLD = 0.6;

export async function routeToModels(requestId, request, approvedModels) {
  const routes = approvedModels.map(m => ({ request_id: requestId, model_id: m.id, model_type: m.type, routed_at: new Date().toISOString() }));
  if (routes.length) await supabase.from(ROUTE_TABLE).insert(routes);
  return { request_id: requestId, models_routed: routes.length };
}

export function normalizeOutputs(modelResponses) {
  return modelResponses.map(r => ({ model_id: r.model_id, decision: r.output?.decision ?? r.output?.action ?? null, confidence: r.output?.confidence ?? r.confidence ?? 0.5, reasoning: r.output?.reasoning ?? r.reasoning ?? '', policy_aligned: r.output?.policy_aligned ?? true }));
}

export function compareAgreement(normalized) {
  const decisions = normalized.map(r => r.decision);
  const counts = decisions.reduce((acc, d) => { acc[d] = (acc[d] ?? 0) + 1; return acc; }, {});
  const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const agreementRate = majority ? majority[1] / normalized.length : 0;
  const avgConfidence = normalized.reduce((s, r) => s + r.confidence, 0) / Math.max(normalized.length, 1);
  return { majority_decision: majority?.[0] ?? null, agreement_rate: Math.round(agreementRate * 100), avg_confidence: Math.round(avgConfidence * 100) / 100, divergent: agreementRate < AGREEMENT_THRESHOLD };
}

export async function triggerAdjudication(requestId, divergent) {
  if (divergent) {
    await supabase.from(EXEC_TABLE).insert({ request_id: requestId, status: 'adjudication_required', triggered_at: new Date().toISOString() });
    return { adjudication_triggered: true };
  }
  return { adjudication_triggered: false };
}

export async function selectExecutionPath(requestId, agreement, adjudicationResult) {
  if (adjudicationResult.adjudication_triggered) return { path: 'blocked', reason: 'adjudication_required' };
  if (agreement.agreement_rate >= 60 && agreement.avg_confidence >= 0.6) return { path: 'proceed', decision: agreement.majority_decision };
  return { path: 'hold', reason: 'insufficient_confidence' };
}

export async function recordContributions(requestId, normalized) {
  await supabase.from(EXEC_TABLE).insert(normalized.map(r => ({ request_id: requestId, ...r, recorded_at: new Date().toISOString() })));
  return { recorded: normalized.length };
}

export async function outputRobustnessScore(requestId) {
  const { data } = await supabase.from(EXEC_TABLE).select('model_id, confidence, policy_aligned').eq('request_id', requestId);
  const rows = data ?? [];
  const aligned = rows.filter(r => r.policy_aligned).length;
  const robustness = rows.length > 0 ? Math.round((aligned / rows.length) * rows.reduce((s, r) => s + r.confidence, 0) / rows.length * 100) : 0;
  return { request_id: requestId, robustness_score: robustness, models_contributed: rows.length, policy_aligned: aligned, generated_at: new Date().toISOString() };
}
