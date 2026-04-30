import { supabase } from '../../lib/agent-memory.js';

const ONBOARDING_TABLE = 'community_onboarding_sequences';
const PROGRESS_TABLE   = 'community_onboarding_progress';

const SEQUENCE_STEPS = [
  { step: 1, delay_hours: 0,  type: 'welcome',      title: 'Welcome to the community!',             action: 'introduce_yourself' },
  { step: 2, delay_hours: 2,  type: 'orientation',  title: 'Here\'s how to navigate',                action: 'explore_channels' },
  { step: 3, delay_hours: 24, type: 'norms',        title: 'Community values and expectations',      action: 'read_guidelines' },
  { step: 4, delay_hours: 48, type: 'first_win',    title: 'Your first win is waiting',              action: 'complete_quick_task' },
  { step: 5, delay_hours: 72, type: 'routing',      title: 'Find your people',                       action: 'join_cohort_channel' },
];

export async function triggerOnboarding(memberId, activatedAt) {
  const steps = SEQUENCE_STEPS.map(s => ({ member_id: memberId, ...s, send_at: new Date(new Date(activatedAt).getTime() + s.delay_hours * 3600000).toISOString(), status: 'queued' }));
  await supabase.from(ONBOARDING_TABLE).insert(steps);
  await supabase.from(PROGRESS_TABLE).upsert({ member_id: memberId, current_step: 1, activated_at: activatedAt, status: 'active' }, { onConflict: 'member_id' });
  return { member_id: memberId, steps_queued: steps.length };
}

export async function deliverStep(memberId, step) {
  await supabase.from(ONBOARDING_TABLE).update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('member_id', memberId).eq('step', step);
  await supabase.from(PROGRESS_TABLE).update({ current_step: step, last_delivered_at: new Date().toISOString() }).eq('member_id', memberId);
  return { member_id: memberId, step_delivered: step };
}

export async function promptFirstWin(memberId) {
  const winTasks = ['Post a quick introduction', 'Drop a comment on someone\'s post', 'Share a resource you love', 'Ask a question you\'ve been wondering about'];
  const task = winTasks[Math.floor(Math.random() * winTasks.length)];
  return { member_id: memberId, first_win_task: task, prompt: `Your challenge: "${task}" — do it now and feel the momentum!` };
}

export async function routeToChannels(memberId, interests = []) {
  const channelMap = { questions: 'ask-anything', wins: 'wins-and-celebrations', resources: 'resources-and-tools', introductions: 'introductions' };
  const recommended = interests.map(i => channelMap[i] ?? 'general').filter(Boolean);
  return { member_id: memberId, recommended_channels: [...new Set(recommended)] };
}

export async function detectOnboardingStall(memberId) {
  const { data } = await supabase.from(PROGRESS_TABLE).select('current_step, last_delivered_at, status').eq('member_id', memberId).single();
  if (!data) return { stalled: false };
  const hoursSinceDelivery = (Date.now() - new Date(data.last_delivered_at).getTime()) / 3600000;
  const stalled = hoursSinceDelivery > 48 && data.status === 'active' && data.current_step < SEQUENCE_STEPS.length;
  if (stalled) await supabase.from(PROGRESS_TABLE).update({ status: 'stalled' }).eq('member_id', memberId);
  return { member_id: memberId, stalled, current_step: data.current_step, hours_inactive: Math.round(hoursSinceDelivery) };
}

export async function outputActivationMetrics() {
  const { data } = await supabase.from(PROGRESS_TABLE).select('status, current_step');
  const rows = data ?? [];
  const activated = rows.filter(r => r.current_step >= SEQUENCE_STEPS.length).length;
  const stalled = rows.filter(r => r.status === 'stalled').length;
  const bottleneck = rows.reduce((acc, r) => { acc[r.current_step] = (acc[r.current_step] ?? 0) + 1; return acc; }, {});
  return { total: rows.length, activated, stalled, activation_rate: rows.length > 0 ? Math.round(activated / rows.length * 100) : 0, step_distribution: bottleneck, generated_at: new Date().toISOString() };
}
