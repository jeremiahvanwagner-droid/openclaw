#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

import { loadLocalEnv } from '../../lib/load-local-env.mjs';
import { openclawSend } from '../../lib/safe-exec.mjs';

loadLocalEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and service/anon key are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function maybeAlert(message) {
  const chatId = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID;
  if (!chatId) return false;

  try {
    await openclawSend({
      agent: 'shared_runtime_ops',
      channel: 'telegram',
      to: chatId,
      message,
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: activeAgents, error: activeError } = await supabase
    .from('agents')
    .select('agent_id')
    .eq('status', 'active');

  if (activeError) throw activeError;

  const { count: recentEvents, error: eventError } = await supabase
    .from('agent_events')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo);

  if (eventError) throw eventError;

  const activeCount = activeAgents?.length || 0;
  const eventCount = recentEvents || 0;
  const trigger = activeCount > 0 && eventCount === 0;

  let alertDelivered = false;
  if (trigger) {
    alertDelivered = await maybeAlert(
      `Runtime Alert: ${activeCount} active agents but zero events in the last hour.`,
    );
  }

  console.log(JSON.stringify({
    action: 'active-agents-zero-events-alert',
    activeAgents: activeCount,
    eventsLastHour: eventCount,
    triggered: trigger,
    alertDelivered,
    windowStart: oneHourAgo,
  }, null, 2));

  if (trigger) process.exit(2);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
