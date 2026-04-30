import { supabase } from '../../lib/agent-memory.js';

const PROFILE_TABLE = 'community_match_profiles';
const MATCH_TABLE   = 'community_matches';

const WEIGHTS = { goals: 0.4, interests: 0.3, skill_level: 0.2, availability: 0.1 };

export async function collectProfiles(memberId, profile) {
  await supabase.from(PROFILE_TABLE).upsert({ member_id: memberId, ...profile, updated_at: new Date().toISOString() }, { onConflict: 'member_id' });
  return { member_id: memberId, profile_saved: true };
}

export function computeCompatibilityScore(profileA, profileB) {
  const goalOverlap = (profileA.goals ?? []).filter(g => (profileB.goals ?? []).includes(g)).length / Math.max((profileA.goals ?? []).length, 1);
  const interestOverlap = (profileA.interests ?? []).filter(i => (profileB.interests ?? []).includes(i)).length / Math.max((profileA.interests ?? []).length, 1);
  const skillMatch = profileA.skill_level === profileB.skill_level ? 1 : 0.5;
  const availMatch = (profileA.availability ?? []).some(a => (profileB.availability ?? []).includes(a)) ? 1 : 0;
  const score = goalOverlap * WEIGHTS.goals + interestOverlap * WEIGHTS.interests + skillMatch * WEIGHTS.skill_level + availMatch * WEIGHTS.availability;
  return Math.round(score * 100);
}

export async function filterIneligiblePairings(candidates) {
  const { data: existing } = await supabase.from(MATCH_TABLE).select('member_a, member_b');
  const existingPairs = new Set((existing ?? []).map(m => `${m.member_a}-${m.member_b}`));
  return candidates.filter(p => !existingPairs.has(`${p.member_a}-${p.member_b}`) && !existingPairs.has(`${p.member_b}-${p.member_a}`));
}

export async function generateMatches(memberId, minScore = 60) {
  const { data: profiles } = await supabase.from(PROFILE_TABLE).select('*').neq('member_id', memberId);
  const { data: myProfile } = await supabase.from(PROFILE_TABLE).select('*').eq('member_id', memberId).single();
  if (!myProfile) return { matches: [] };
  const scored = (profiles ?? []).map(p => ({ member_id: p.member_id, score: computeCompatibilityScore(myProfile, p) })).filter(m => m.score >= minScore).sort((a, b) => b.score - a.score).slice(0, 5);
  return { member_id: memberId, matches: scored };
}

export async function createIntroductionPrompts(matchId, memberA, memberB) {
  const intro = { match_id: matchId, member_a: memberA, member_b: memberB, prompt: `Hi! Based on your shared goals, you two might make great accountability partners. Consider scheduling a 30-minute intro call this week.`, created_at: new Date().toISOString() };
  await supabase.from(MATCH_TABLE).insert(intro);
  return intro;
}

export async function trackMatchEngagement(matchId, signals) {
  await supabase.from(MATCH_TABLE).update({ engagement_signals: signals, last_signal_at: new Date().toISOString() }).eq('match_id', matchId);
  return { match_id: matchId, tracked: true };
}

export async function recycleUnmatched() {
  const { data } = await supabase.from(PROFILE_TABLE).select('member_id').not('member_id', 'in', (await supabase.from(MATCH_TABLE).select('member_a')).data?.map(m => m.member_a) ?? []);
  return { unmatched_count: (data ?? []).length, requeued_ids: (data ?? []).map(d => d.member_id) };
}
