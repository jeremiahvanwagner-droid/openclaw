/**
 * Voice Consistency Enforcement — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const VOICE_TABLE = 'brand_voice_profiles';
const SCORE_TABLE = 'brand_voice_scores';

export async function loadVoiceProfile(brandId) {
  const { data } = await supabase.from(VOICE_TABLE).select('*').eq('brand_id', brandId).single();
  return { brand_id: brandId, profile: data ?? { tone: 'professional', prohibited_phrases: [], signature_patterns: [] } };
}

export function analyzeContentTone(content, voiceProfile) {
  const prohibited = voiceProfile.prohibited_phrases ?? [];
  const violations = prohibited.filter(p => new RegExp(p, 'i').test(content));
  const toneSignals = { professional: /therefore|furthermore|however/i.test(content), casual: /hey|yo|btw/i.test(content), urgent: /now|today|immediately/i.test(content) };
  return { violations, tone_signals: toneSignals, violation_count: violations.length };
}

export function detectVoiceDeviations(content, profile) {
  const signaturePatterns = profile.signature_patterns ?? [];
  const matched = signaturePatterns.filter(p => new RegExp(p, 'i').test(content));
  const deviations = signaturePatterns.filter(p => !new RegExp(p, 'i').test(content));
  return { matched_patterns: matched.length, missing_patterns: deviations, deviation_score: deviations.length / Math.max(signaturePatterns.length, 1) };
}

export async function rewriteForVoice(content, voiceProfile) {
  let rewritten = content;
  for (const phrase of (voiceProfile.prohibited_phrases ?? [])) {
    rewritten = rewritten.replace(new RegExp(phrase, 'gi'), voiceProfile.replacements?.[phrase] ?? '');
  }
  return { rewritten: rewritten.trim(), changed: rewritten !== content };
}

export function validateEmotionalTone(content, intent) {
  const intentMap = { persuasive: /you can|imagine|transform/i, educational: /learn|understand|discover/i, urgent: /now|today|limited/i };
  const matches = intentMap[intent]?.test(content) ?? false;
  return { matches_intent: matches, intent };
}

export async function scoreVoiceFidelity(content, profile) {
  const { violation_count } = analyzeContentTone(content, profile);
  const { deviation_score } = detectVoiceDeviations(content, profile);
  const score = Math.max(0, Math.round(100 - violation_count * 10 - deviation_score * 50));
  await supabase.from(SCORE_TABLE).insert({ profile_id: profile.brand_id, score, scored_at: new Date().toISOString() });
  return { score, tier: score > 80 ? 'excellent' : score > 60 ? 'acceptable' : 'needs_work' };
}

export async function outputFinalCopy(content, voiceScore) {
  return { content, voice_fidelity_score: voiceScore.score, tier: voiceScore.tier, approved: voiceScore.score >= 60, generated_at: new Date().toISOString() };
}
