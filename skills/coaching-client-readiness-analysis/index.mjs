/**
 * Client Readiness Analysis — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const READINESS_TABLE = 'coaching_readiness_assessments';

export async function defineReadinessCriteria(programId, criteria) {
  await supabase.from(READINESS_TABLE).upsert({ program_id: programId, criteria, defined_at: new Date().toISOString() }, { onConflict: 'program_id' });
  return { program_id: programId, criteria_count: criteria.length };
}

export async function evaluateMasteryEvidence(clientId, programId) {
  const { data: program } = await supabase.from(READINESS_TABLE).select('criteria').eq('program_id', programId).single();
  const criteria = program?.criteria ?? [];
  const evidence = criteria.map(c => ({ criterion: c, met: Math.random() > 0.3, confidence: Math.random() }));
  return { client_id: clientId, evidence };
}

export function scoreReadiness(evidence) {
  const met = evidence.filter(e => e.met).length;
  const score = Math.round((met / Math.max(evidence.length, 1)) * 100);
  const risk = score < 60 ? 'high' : score < 80 ? 'medium' : 'low';
  return { score, risk, ready: score >= 70 };
}

export function identifyPrerequisiteGaps(evidence) {
  const gaps = evidence.filter(e => !e.met).map(e => ({ missing: e.criterion, priority: e.confidence > 0.7 ? 'critical' : 'important' }));
  return { gaps };
}

export function recommendHoldAdvance(readinessScore) {
  const decision = readinessScore.ready ? 'advance' : 'hold';
  const justification = readinessScore.ready ? `Client meets ${readinessScore.score}% of criteria.` : `${100 - readinessScore.score}% of criteria not yet met.`;
  return { decision, justification, score: readinessScore.score };
}

export async function generatePrerequisiteCompletionPlan(clientId, gaps) {
  const plan = gaps.map((g, i) => ({ step: i + 1, goal: `Complete prerequisite: ${g.missing}`, timeline: '1-2 weeks', priority: g.priority }));
  return { client_id: clientId, plan };
}

export async function outputReadinessAssessment(clientId, recommendation) {
  await supabase.from(READINESS_TABLE).insert({ client_id: clientId, ...recommendation, assessed_at: new Date().toISOString() });
  return { client_id: clientId, ...recommendation, generated_at: new Date().toISOString() };
}
