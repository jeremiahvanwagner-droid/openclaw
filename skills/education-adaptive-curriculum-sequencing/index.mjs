import { supabase } from '../../lib/agent-memory.js';

const SEQUENCE_TABLE = 'education_learner_sequences';
const OUTCOME_TABLE  = 'education_sequence_outcomes';

export async function readLearnerProfile(learnerId) {
  const { data: profile } = await supabase.from('education_learner_profiles').select('*').eq('learner_id', learnerId).single();
  const { data: scores } = await supabase.from('education_assessment_scores').select('module_id, score, completed_at').eq('learner_id', learnerId);
  return { learner_id: learnerId, profile: profile ?? {}, module_scores: scores ?? [] };
}

export function detectGaps(moduleScores, moduleGraph) {
  const mastered = new Set(moduleScores.filter(m => (m.score ?? 0) >= 0.8).map(m => m.module_id));
  const gaps = moduleGraph.filter(m => !mastered.has(m.id) && (m.prerequisites ?? []).every(p => mastered.has(p)));
  const unmetPrereqs = moduleGraph.filter(m => !mastered.has(m.id) && !(m.prerequisites ?? []).every(p => mastered.has(p)));
  return { gaps, unmet_prerequisites: unmetPrereqs };
}

export function rerankModules(modules, gaps, learnerProfile) {
  return modules.map(m => {
    const isGap = gaps.gaps.some(g => g.id === m.id);
    const urgency = isGap ? 20 : 0;
    const impact = m.weight ?? 5;
    return { ...m, sequence_score: urgency + impact };
  }).sort((a, b) => b.sequence_score - a.sequence_score);
}

export async function insertRemediationModules(learnerId, unmetPrereqs) {
  const remediation = unmetPrereqs.slice(0, 3).map(m => ({ learner_id: learnerId, module_id: m.id, type: 'remediation', inserted_at: new Date().toISOString() }));
  if (remediation.length) await supabase.from(SEQUENCE_TABLE).insert(remediation);
  return { inserted: remediation.length };
}

export async function publishSequence(learnerId, rankedModules) {
  const sequence = rankedModules.map((m, i) => ({ learner_id: learnerId, module_id: m.id, position: i + 1, rationale: m.sequence_score > 20 ? 'gap_remediation' : 'standard_progression', published_at: new Date().toISOString() }));
  await supabase.from(SEQUENCE_TABLE).upsert(sequence, { onConflict: 'learner_id,module_id' });
  return { learner_id: learnerId, modules_in_sequence: sequence.length };
}

export async function trackOutcomes(learnerId, moduleId, score) {
  await supabase.from(OUTCOME_TABLE).insert({ learner_id: learnerId, module_id: moduleId, score, recorded_at: new Date().toISOString() });
  return { outcome_recorded: true };
}

export async function outputSequenceSummary(learnerId) {
  const { data } = await supabase.from(SEQUENCE_TABLE).select('*').eq('learner_id', learnerId).order('position');
  return { learner_id: learnerId, sequence: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
