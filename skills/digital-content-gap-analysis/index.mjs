import { supabase } from '../../lib/agent-memory.js';

const INVENTORY_TABLE = 'digital_content_inventory';
const GAP_TABLE       = 'digital_content_gaps';

export async function inventoryProduct(productId, modules) {
  const rows = modules.map(m => ({ product_id: productId, module_title: m.title, promises: m.promises ?? [], outcomes: m.outcomes ?? [], lesson_count: m.lessons?.length ?? 0, inventoried_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(INVENTORY_TABLE).insert(rows);
  return { product_id: productId, modules_inventoried: rows.length };
}

export function compareJourneyVsContent(expectedSteps, existingModules) {
  const coveredSteps = expectedSteps.filter(step => existingModules.some(m => m.promises?.includes(step) || m.outcomes?.includes(step)));
  const missingSteps = expectedSteps.filter(step => !coveredSteps.includes(step));
  return { covered: coveredSteps, missing: missingSteps, coverage_pct: expectedSteps.length > 0 ? Math.round(coveredSteps.length / expectedSteps.length * 100) : 0 };
}

export function classifyGaps(missingSteps) {
  return missingSteps.map(step => {
    const type = /how to|step|implement|do/i.test(step) ? 'implementation_gap' : /why|proof|result|evidence/i.test(step) ? 'proof_gap' : 'clarity_gap';
    return { step, gap_type: type };
  });
}

export async function prioritizeGaps(productId, classifiedGaps) {
  const prioritized = classifiedGaps.map(g => ({ ...g, revenue_impact: g.gap_type === 'implementation_gap' ? 'high' : 'medium', support_burden: g.gap_type === 'clarity_gap' ? 'high' : 'low', completion_risk: g.gap_type === 'proof_gap' ? 'medium' : 'low', priority_score: g.gap_type === 'implementation_gap' ? 3 : 2 })).sort((a, b) => b.priority_score - a.priority_score);
  await supabase.from(GAP_TABLE).insert(prioritized.map(g => ({ product_id: productId, ...g, analyzed_at: new Date().toISOString() })));
  return { product_id: productId, prioritized_gaps: prioritized };
}

export function recommendUpdates(prioritizedGaps) {
  return prioritizedGaps.slice(0, 5).map(g => ({ gap: g.step, recommendation: `Add ${g.gap_type === 'implementation_gap' ? 'step-by-step walkthrough video' : g.gap_type === 'proof_gap' ? 'case study or result showcase' : 'plain-language explanation'} for: ${g.step}`, effort: g.priority_score >= 3 ? '3-5 hours' : '1-2 hours', timeline: '2 weeks' }));
}

export function mapSuccessCriteria(recommendations) {
  return recommendations.map(r => ({ ...r, success_metric: 'Completion rate increases by 10%+ for this module', measurement: 'Check LMS completion data 30 days post-update' }));
}

export async function outputGapBacklog(productId) {
  const { data } = await supabase.from(GAP_TABLE).select('*').eq('product_id', productId).order('priority_score', { ascending: false });
  return { product_id: productId, backlog: data ?? [], total_gaps: (data ?? []).length, generated_at: new Date().toISOString() };
}
