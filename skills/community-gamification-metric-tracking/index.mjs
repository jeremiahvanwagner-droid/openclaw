import { supabase } from '../../lib/agent-memory.js';

const POINTS_TABLE      = 'community_gamification_points';
const LEADERBOARD_TABLE = 'community_leaderboard';
const BADGE_TABLE       = 'community_badges';

const POINT_RULES = {
  post_created:    10,
  comment_posted:  5,
  post_liked:      2,
  comment_liked:   1,
  event_attended:  20,
  resource_shared: 15,
};

const BADGE_MILESTONES = [
  { id: 'first_post', label: 'First Post', threshold: 1, metric: 'post_count' },
  { id: 'power_poster', label: 'Power Poster', threshold: 10, metric: 'post_count' },
  { id: 'community_star', label: 'Community Star', threshold: 500, metric: 'total_points' },
];

export async function definePointRules() {
  return { rules: POINT_RULES, milestones: BADGE_MILESTONES };
}

export async function ingestActivityEvents(memberId, events) {
  const suspicious = events.filter(e => e.same_content_count > 3);
  const validEvents = events.filter(e => !suspicious.includes(e));
  const points = validEvents.reduce((sum, e) => sum + (POINT_RULES[e.type] ?? 0), 0);
  if (points > 0) {
    await supabase.from(POINTS_TABLE).insert({ member_id: memberId, points_earned: points, event_count: validEvents.length, recorded_at: new Date().toISOString() });
  }
  return { member_id: memberId, points_earned: points, flagged_events: suspicious.length };
}

export async function calculateMetrics(memberId) {
  const { data } = await supabase.from(POINTS_TABLE).select('points_earned').eq('member_id', memberId);
  const totalPoints = (data ?? []).reduce((sum, r) => sum + (r.points_earned ?? 0), 0);
  const streak = await computeStreak(memberId);
  const badges = BADGE_MILESTONES.filter(b => b.metric === 'total_points' && totalPoints >= b.threshold).map(b => b.id);
  return { member_id: memberId, total_points: totalPoints, streak_days: streak, earned_badges: badges };
}

async function computeStreak(memberId) {
  const { data } = await supabase.from(POINTS_TABLE).select('recorded_at').eq('member_id', memberId).order('recorded_at', { ascending: false }).limit(30);
  const dates = (data ?? []).map(r => r.recorded_at.slice(0, 10));
  let streak = 0;
  let current = new Date().toISOString().slice(0, 10);
  for (const d of dates) {
    if (d === current) { streak++; current = new Date(new Date(current).getTime() - 86400000).toISOString().slice(0, 10); }
    else break;
  }
  return streak;
}

export async function updateLeaderboard() {
  const { data } = await supabase.from(POINTS_TABLE).select('member_id, points_earned');
  const totals = (data ?? []).reduce((acc, r) => { acc[r.member_id] = (acc[r.member_id] ?? 0) + r.points_earned; return acc; }, {});
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 100).map(([memberId, pts], i) => ({ member_id: memberId, rank: i + 1, total_points: pts, updated_at: new Date().toISOString() }));
  if (ranked.length) await supabase.from(LEADERBOARD_TABLE).upsert(ranked, { onConflict: 'member_id' });
  return { leaderboard_updated: true, entries: ranked.length };
}

export async function triggerMilestoneNotifications(memberId, metrics) {
  const newBadges = metrics.earned_badges ?? [];
  if (newBadges.length) await supabase.from(BADGE_TABLE).upsert(newBadges.map(b => ({ member_id: memberId, badge_id: b, awarded_at: new Date().toISOString() })), { onConflict: 'member_id,badge_id' });
  return { member_id: memberId, notifications_sent: newBadges.length, badges_awarded: newBadges };
}

export async function detectGamingBehavior(memberId) {
  const { data } = await supabase.from(POINTS_TABLE).select('event_count, points_earned, recorded_at').eq('member_id', memberId).order('recorded_at', { ascending: false }).limit(5);
  const suspicious = (data ?? []).some(r => r.event_count > 50);
  return { member_id: memberId, suspicious, flagged: suspicious };
}

export async function outputParticipationAnalytics() {
  const { data: lb } = await supabase.from(LEADERBOARD_TABLE).select('*').order('rank').limit(10);
  const { data: badges } = await supabase.from(BADGE_TABLE).select('badge_id');
  const badgeDist = (badges ?? []).reduce((acc, b) => { acc[b.badge_id] = (acc[b.badge_id] ?? 0) + 1; return acc; }, {});
  return { top_10: lb ?? [], badge_distribution: badgeDist, generated_at: new Date().toISOString() };
}
