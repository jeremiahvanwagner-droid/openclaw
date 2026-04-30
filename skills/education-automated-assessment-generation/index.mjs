import { supabase } from '../../lib/agent-memory.js';

const ASSESSMENT_TABLE = 'education_assessments';
const ITEM_TABLE       = 'education_assessment_items';

const COGNITIVE_LEVELS = { recall: 1, comprehension: 2, application: 3, analysis: 4, synthesis: 5 };
const FORMAT_BY_OBJECTIVE = { recall: 'multiple_choice', application: 'short_answer', synthesis: 'essay', analysis: 'case_study' };

export async function parseLearningObjectives(moduleId) {
  const { data } = await supabase.from('education_modules').select('objectives, competencies, scope').eq('id', moduleId).single();
  return { module_id: moduleId, objectives: data?.objectives ?? [], competencies: data?.competencies ?? [], scope: data?.scope ?? '' };
}

export function selectAssessmentFormats(objectives) {
  return objectives.map(o => ({ objective: o, format: FORMAT_BY_OBJECTIVE[o.type ?? 'recall'] ?? 'multiple_choice', cognitive_level: COGNITIVE_LEVELS[o.type ?? 'recall'] ?? 1 }));
}

export function generateItemPool(moduleScope, format, count = 5) {
  const items = Array.from({ length: count }, (_, i) => ({
    item_id: `item_${i + 1}`,
    format,
    question: `[${format.toUpperCase()}] Question ${i + 1} about ${moduleScope}`,
    correct_answer: format === 'multiple_choice' ? 'A' : '[model answer]',
    distractors: format === 'multiple_choice' ? ['B. [distractor 1]', 'C. [distractor 2]', 'D. [distractor 3]'] : [],
    difficulty: Math.ceil((i + 1) / 2),
  }));
  return items;
}

export function validateItems(items) {
  return items.map(item => {
    const issues = [];
    if (!item.correct_answer) issues.push('missing_answer_key');
    if (item.format === 'multiple_choice' && item.distractors.length < 3) issues.push('insufficient_distractors');
    return { ...item, valid: issues.length === 0, validation_issues: issues };
  });
}

export function tagByCompetency(items, competencies) {
  return items.map((item, i) => ({ ...item, competency: competencies[i % competencies.length] ?? 'general', cognitive_tag: Object.keys(COGNITIVE_LEVELS)[item.difficulty - 1] ?? 'recall' }));
}

export async function assembleAssessment(moduleId, taggedItems, timeLimitMinutes = 20) {
  const selected = taggedItems.filter(i => i.valid).slice(0, 10);
  const assessment = { module_id: moduleId, item_count: selected.length, time_limit_minutes: timeLimitMinutes, status: 'ready', created_at: new Date().toISOString() };
  const { data } = await supabase.from(ASSESSMENT_TABLE).insert(assessment).select('id').single();
  if (data?.id && selected.length) await supabase.from(ITEM_TABLE).insert(selected.map(i => ({ assessment_id: data.id, ...i })));
  return { assessment_id: data?.id, item_count: selected.length };
}

export async function outputAnswerKey(assessmentId) {
  const { data } = await supabase.from(ITEM_TABLE).select('item_id, correct_answer, competency, cognitive_tag').eq('assessment_id', assessmentId);
  const remediationMap = (data ?? []).reduce((acc, i) => { acc[i.item_id] = `Review ${i.competency} — ${i.cognitive_tag} level`; return acc; }, {});
  return { assessment_id: assessmentId, answer_key: data ?? [], remediation_mapping: remediationMap, generated_at: new Date().toISOString() };
}
