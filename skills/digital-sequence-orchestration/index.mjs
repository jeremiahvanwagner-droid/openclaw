import { supabase } from '../../lib/agent-memory.js';

const SEQUENCE_TABLE = 'digital_email_sequences';
const MESSAGE_TABLE  = 'digital_sequence_messages';

const LIFECYCLE_STAGES = ['welcome', 'nurture', 'activation', 'upsell', 'retention'];

export async function mapLifecycleStages(productId, stageConfig) {
  const stages = LIFECYCLE_STAGES.map(s => ({ product_id: productId, stage: s, ...stageConfig[s] ?? {}, mapped_at: new Date().toISOString() }));
  await supabase.from(SEQUENCE_TABLE).insert(stages);
  return { product_id: productId, stages_mapped: stages.length };
}

export async function defineTriggers(sequenceId, stage) {
  const triggerMap = {
    welcome:    { event: 'contact_created', entry_criteria: 'tag:new_lead', suppression: 'tag:customer' },
    nurture:    { event: 'lead_magnet_downloaded', entry_criteria: 'tag:lead', suppression: 'tag:customer' },
    activation: { event: 'purchase_completed', entry_criteria: 'tag:customer', suppression: 'tag:completed_onboarding' },
    upsell:     { event: 'onboarding_completed', entry_criteria: 'tag:completed_onboarding', suppression: 'tag:upsold' },
    retention:  { event: 'inactivity_30d', entry_criteria: 'tag:customer', suppression: 'tag:churned' },
  };
  const trigger = triggerMap[stage] ?? triggerMap.nurture;
  await supabase.from(SEQUENCE_TABLE).update({ triggers: trigger }).eq('id', sequenceId);
  return { sequence_id: sequenceId, ...trigger };
}

export async function draftMessageCadence(sequenceId, stage, messageCount = 5) {
  const cadenceMap = {
    welcome:    ['Welcome! Here\'s where to start', 'Your quick win is waiting', 'The #1 mistake new members make', 'Your success story starts here', 'What\'s next for you?'],
    nurture:    ['The truth about [topic]', 'How [customer name] did it', '3 things holding you back', 'Your free resource inside', 'Last chance: special offer'],
    activation: ['Your access is ready', 'First step: do this now', 'Common questions answered', 'Your 7-day checklist', 'How\'s it going so far?'],
    upsell:     ['You\'ve unlocked something special', 'The next level is here', 'Exclusive offer for members', 'What\'s possible from here', 'This offer expires soon'],
    retention:  ['We miss you', 'What happened?', 'New content you\'ll love', 'Your account is still active', 'Final check-in'],
  };
  const subjects = cadenceMap[stage] ?? cadenceMap.nurture;
  const messages = subjects.slice(0, messageCount).map((subject, i) => ({ sequence_id: sequenceId, step: i + 1, subject, delay_days: i * 2, stage, status: 'draft', created_at: new Date().toISOString() }));
  await supabase.from(MESSAGE_TABLE).insert(messages);
  return { sequence_id: sequenceId, messages_drafted: messages.length };
}

export async function personalizeMessages(sequenceId, segmentData) {
  await supabase.from(MESSAGE_TABLE).update({ personalization: segmentData, updated_at: new Date().toISOString() }).eq('sequence_id', sequenceId);
  return { sequence_id: sequenceId, personalized: true };
}

export async function addFailSafeLogic(sequenceId) {
  const failsafes = { on_unsubscribe: 'remove_from_all_sequences', on_bounce: 'suppress_contact', on_inactivity: 'reduce_cadence_to_weekly' };
  await supabase.from(SEQUENCE_TABLE).update({ failsafes }).eq('id', sequenceId);
  return { sequence_id: sequenceId, failsafes };
}

export async function measurePerformance(sequenceId) {
  const { data } = await supabase.from(MESSAGE_TABLE).select('step, open_rate, click_rate, reply_rate, conversion_rate').eq('sequence_id', sequenceId);
  return { sequence_id: sequenceId, step_metrics: data ?? [] };
}

export async function outputDeploymentPlan(productId) {
  const { data: sequences } = await supabase.from(SEQUENCE_TABLE).select('stage, triggers').eq('product_id', productId);
  const { data: messages } = await supabase.from(MESSAGE_TABLE).select('sequence_id, step, subject, delay_days').order('step');
  return { product_id: productId, sequences: sequences ?? [], messages: messages ?? [], optimization_backlog: ['Test subject line variations for welcome sequence', 'A/B test send time for nurture step 3', 'Improve upsell email CTA copy'], generated_at: new Date().toISOString() };
}
