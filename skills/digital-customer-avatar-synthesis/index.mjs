import { supabase } from '../../lib/agent-memory.js';

const AVATAR_TABLE = 'digital_customer_avatars';

export async function compileEvidence(productId, sources) {
  const { reviews = [], supportLogs = [], conversionData = [], conversations = [] } = sources;
  const allText = [...reviews, ...supportLogs, ...conversations].map(s => (s.text ?? s.content ?? '').toLowerCase());
  return { product_id: productId, evidence_count: allText.length, raw_evidence: allText.slice(0, 50) };
}

export function segmentAudience(evidenceItems) {
  const segments = { goal_oriented: [], constraint_heavy: [], skeptics: [], ready_to_buy: [] };
  for (const text of evidenceItems) {
    if (/i want|my goal|hoping to|looking to/i.test(text)) segments.goal_oriented.push(text);
    else if (/can't afford|no time|too busy|not sure if/i.test(text)) segments.constraint_heavy.push(text);
    else if (/does this work|prove it|show me|skeptical/i.test(text)) segments.skeptics.push(text);
    else if (/ready to|let's start|sign me up|where do i/i.test(text)) segments.ready_to_buy.push(text);
  }
  return segments;
}

export async function buildAvatarProfiles(productId, segments) {
  const profiles = Object.entries(segments).filter(([, items]) => items.length > 0).map(([segment, items]) => {
    const phrases = items.slice(0, 5);
    return { product_id: productId, segment, pain_points: phrases.slice(0, 2), triggers: phrases.slice(2, 4), language_samples: phrases, decision_criteria: segment === 'skeptics' ? ['proof', 'guarantee'] : segment === 'constraint_heavy' ? ['time', 'cost'] : ['results', 'speed'], built_at: new Date().toISOString() };
  });
  if (profiles.length) await supabase.from(AVATAR_TABLE).insert(profiles);
  return { product_id: productId, profiles };
}

export function extractVoiceOfCustomer(evidenceItems) {
  const vocPhrases = evidenceItems.filter(t => t.length > 20 && t.length < 200).slice(0, 20);
  return { voc_phrases: vocPhrases, reusable_hooks: vocPhrases.slice(0, 5).map(p => `"${p.slice(0, 60)}..."`) };
}

export async function mapAvatarsToOffers(productId, offers) {
  const { data: profiles } = await supabase.from(AVATAR_TABLE).select('segment, decision_criteria').eq('product_id', productId);
  return (profiles ?? []).map(p => ({ segment: p.segment, best_fit_offer: offers.find(o => p.decision_criteria?.some(c => o.keywords?.includes(c)))?.name ?? offers[0]?.name ?? null }));
}

export function buildMessagingGuidelines(profiles) {
  return profiles.map(p => ({ segment: p.segment, hook: `Speak directly to "${p.pain_points?.[0] ?? 'your top challenge'}"`, promise: `Show clear path to ${p.decision_criteria?.[0] ?? 'results'}`, objection_handle: p.segment === 'skeptics' ? 'Lead with proof/testimonial' : 'Acknowledge constraint, show ROI' }));
}

export async function outputAvatarPack(productId) {
  const { data } = await supabase.from(AVATAR_TABLE).select('*').eq('product_id', productId);
  const doNotUse = ['obviously', 'simply', 'just', 'easy', 'anyone can'];
  return { product_id: productId, avatars: data ?? [], do_not_use_language: doNotUse, compliance_notes: 'Avoid income claims without substantiation; no guaranteed results language', generated_at: new Date().toISOString() };
}
