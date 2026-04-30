import { supabase } from '../../lib/agent-memory.js';

const PROPOSAL_TABLE  = 'finance_consensus_proposals';
const DECISION_TABLE  = 'finance_consensus_decisions';

const CONSENSUS_THRESHOLD = 0.67;

export async function collectProposals(decisionId, modelRecommendations) {
  const rows = modelRecommendations.map(r => ({ decision_id: decisionId, model_id: r.model_id, recommendation: r.recommendation, confidence: r.confidence ?? 0.5, rationale: r.rationale ?? '', submitted_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(PROPOSAL_TABLE).insert(rows);
  return { decision_id: decisionId, proposals_collected: rows.length };
}

export function applyRuleEngineValidation(proposals, rules) {
  return proposals.map(p => {
    const violations = (rules ?? []).filter(r => !r.test(p));
    return { ...p, rule_valid: violations.length === 0, rule_violations: violations.map(r => r.name) };
  });
}

export function reconcileDisagreements(validProposals) {
  const valid = validProposals.filter(p => p.rule_valid);
  const recommendations = valid.map(p => p.recommendation);
  const counts = recommendations.reduce((acc, r) => { acc[r] = (acc[r] ?? 0) + 1; return acc; }, {});
  const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const agreement = majority ? majority[1] / valid.length : 0;
  const consensus = agreement >= CONSENSUS_THRESHOLD;
  const tieBreakUsed = !consensus && valid.length > 0;
  const winner = tieBreakUsed ? valid.sort((a, b) => b.confidence - a.confidence)[0]?.recommendation : majority?.[0];
  return { consensus_reached: consensus || tieBreakUsed, recommendation: winner ?? null, agreement_rate: Math.round(agreement * 100), tie_break_used: tieBreakUsed };
}

export async function escalateConflicts(decisionId, reconciliation) {
  if (!reconciliation.consensus_reached || reconciliation.agreement_rate < 50) {
    await supabase.from(DECISION_TABLE).insert({ decision_id: decisionId, status: 'escalated', reason: 'consensus_not_reached', escalated_at: new Date().toISOString() });
    return { escalated: true, reason: 'consensus_not_reached' };
  }
  return { escalated: false };
}

export async function produceDecisionPacket(decisionId, reconciliation, proposals) {
  const packet = { decision_id: decisionId, recommendation: reconciliation.recommendation, agreement_rate: reconciliation.agreement_rate, rationale_trace: proposals.map(p => ({ model: p.model_id, recommendation: p.recommendation, confidence: p.confidence, rationale: p.rationale })), decided_at: new Date().toISOString() };
  await supabase.from(DECISION_TABLE).upsert(packet, { onConflict: 'decision_id' });
  return packet;
}

export async function blockIfBelowThreshold(decisionId, agreementRate) {
  if (agreementRate < CONSENSUS_THRESHOLD * 100) {
    await supabase.from(DECISION_TABLE).update({ status: 'blocked', blocked_at: new Date().toISOString() }).eq('decision_id', decisionId);
    return { blocked: true, agreement_rate: agreementRate, threshold: CONSENSUS_THRESHOLD * 100 };
  }
  return { blocked: false };
}

export async function outputDecisionPacket(decisionId) {
  const { data } = await supabase.from(DECISION_TABLE).select('*').eq('decision_id', decisionId).single();
  return { decision_id: decisionId, packet: data, generated_at: new Date().toISOString() };
}
