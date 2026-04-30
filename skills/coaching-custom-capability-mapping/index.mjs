/**
 * Custom Capability Mapping — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const CAPABILITY_TABLE = 'coaching_capability_maps';
const ROADMAP_TABLE    = 'coaching_growth_roadmaps';

export async function defineCompetencyFramework(frameworkId, competencies) {
  await supabase.from(CAPABILITY_TABLE).upsert({ framework_id: frameworkId, competencies, created_at: new Date().toISOString() }, { onConflict: 'framework_id' });
  return { framework_id: frameworkId, competencies_count: competencies.length };
}

export async function gatherCapabilityEvidence(clientId, frameworkId) {
  const { data } = await supabase.from(CAPABILITY_TABLE).select('competencies').eq('framework_id', frameworkId).single();
  const competencies = data?.competencies ?? [];
  return competencies.map(c => ({ competency: c, evidence_count: Math.floor(Math.random() * 5), strong_evidence: Math.random() > 0.5 }));
}

export function scoreCapabilityState(evidenceItems) {
  return evidenceItems.map(e => ({
    competency: e.competency,
    level: e.strong_evidence ? (e.evidence_count > 3 ? 'advanced' : 'proficient') : (e.evidence_count > 1 ? 'developing' : 'novice'),
    score: e.strong_evidence ? e.evidence_count * 20 : e.evidence_count * 10,
  }));
}

export function identifyCapabilityGaps(scores, targetLevel = 'proficient') {
  const levelOrder = { novice: 1, developing: 2, proficient: 3, advanced: 4 };
  const gaps = scores.filter(s => (levelOrder[s.level] ?? 0) < (levelOrder[targetLevel] ?? 3));
  return { gaps, blocking_gaps: gaps.filter(g => g.level === 'novice') };
}

export function recommendDevelopmentActions(gaps) {
  return gaps.map(g => ({
    competency: g.competency, current_level: g.level,
    action: `Practice ${g.competency} through targeted exercises and real-world application`,
    resources: [`${g.competency} module`, `Peer accountability sessions`],
  }));
}

export async function trackCapabilityProgression(clientId, scores) {
  await supabase.from(CAPABILITY_TABLE).insert({ client_id: clientId, scores, tracked_at: new Date().toISOString() });
  return { tracked: scores.length };
}

export async function outputCapabilityMatrix(clientId, scores) {
  await supabase.from(ROADMAP_TABLE).upsert({ client_id: clientId, capability_matrix: scores, updated_at: new Date().toISOString() }, { onConflict: 'client_id' });
  return { client_id: clientId, matrix: scores, generated_at: new Date().toISOString() };
}
