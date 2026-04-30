import { supabase } from '../../lib/agent-memory.js';

const PROPOSITION_TABLE = 'digital_value_propositions';

export async function captureCurrentProposition(productId, offerStatement, icp, promisedOutcome) {
  await supabase.from(PROPOSITION_TABLE).upsert({ product_id: productId, offer_statement: offerStatement, icp, promised_outcome: promisedOutcome, status: 'current', updated_at: new Date().toISOString() }, { onConflict: 'product_id' });
  return { product_id: productId, captured: true };
}

export function extractCustomerInsights(evidence) {
  const pains = evidence.filter(e => /struggle|problem|hard|fail|can't|frustrated/i.test(e.text ?? '')).map(e => e.text);
  const gains = evidence.filter(e => /want|wish|goal|love|dream|finally/i.test(e.text ?? '')).map(e => e.text);
  const objections = evidence.filter(e => /but|however|worried|not sure|expensive|trust/i.test(e.text ?? '')).map(e => e.text);
  return { top_pains: pains.slice(0, 5), top_gains: gains.slice(0, 5), top_objections: objections.slice(0, 5) };
}

export function compareAlternatives(currentProp, competitors) {
  const undifferentiated = competitors.filter(c => c.claims?.some(claim => currentProp.promised_outcome?.toLowerCase().includes(claim?.toLowerCase() ?? ''))).map(c => c.name);
  return { undifferentiated_against: undifferentiated, differentiation_needed: undifferentiated.length > 0 };
}

export function generatePositioningVariants(insights, currentProp) {
  const { top_pains, top_gains } = insights;
  return [
    { variant: 'A', focus: 'pain_relief', statement: `Stop ${top_pains[0] ?? 'struggling'} — ${currentProp.promised_outcome} in 30 days or less`, hook: top_pains[0] },
    { variant: 'B', focus: 'outcome_speed', statement: `The fastest way to ${top_gains[0] ?? currentProp.promised_outcome} for ${currentProp.icp}`, hook: top_gains[0] },
    { variant: 'C', focus: 'differentiation', statement: `Unlike everything else, ${currentProp.offer_statement?.split(' ')[0] ?? 'this'} actually delivers ${currentProp.promised_outcome} because [unique mechanism]`, hook: 'unique_mechanism' },
    { variant: 'D', focus: 'specificity', statement: `How ${currentProp.icp} achieves ${currentProp.promised_outcome} without [main objection]`, hook: 'without_objection' },
  ];
}

export function scoreVariants(variants, criteria = { relevance: 0.4, uniqueness: 0.3, credibility: 0.2, conversion_potential: 0.1 }) {
  return variants.map(v => {
    const scores = { relevance: v.focus === 'pain_relief' ? 90 : 75, uniqueness: v.focus === 'differentiation' ? 90 : 60, credibility: v.focus === 'outcome_speed' ? 70 : 80, conversion_potential: v.focus === 'pain_relief' ? 85 : 70 };
    const total = Object.entries(criteria).reduce((sum, [k, w]) => sum + (scores[k] ?? 70) * w, 0);
    return { ...v, scores, total_score: Math.round(total) };
  }).sort((a, b) => b.total_score - a.total_score);
}

export async function selectTestCandidates(productId, scoredVariants) {
  const top2 = scoredVariants.slice(0, 2);
  await supabase.from(PROPOSITION_TABLE).insert(top2.map(v => ({ product_id: productId, offer_statement: v.statement, status: 'test_candidate', variant: v.variant, score: v.total_score, created_at: new Date().toISOString() })));
  return { product_id: productId, test_candidates: top2 };
}

export async function outputPropositionReport(productId) {
  const { data } = await supabase.from(PROPOSITION_TABLE).select('*').eq('product_id', productId).order('created_at', { ascending: false });
  const current = (data ?? []).find(r => r.status === 'current');
  const candidates = (data ?? []).filter(r => r.status === 'test_candidate');
  return { product_id: productId, current_proposition: current, test_candidates: candidates, deployment_locations: ['Landing page H1', 'Meta ad primary text', 'Email subject line', 'LinkedIn bio'], generated_at: new Date().toISOString() };
}
