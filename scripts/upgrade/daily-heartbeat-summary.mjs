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

function parseArgs(argv) {
  const args = { staleMinutes: 10, sendAlert: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--stale-minutes' && argv[i + 1]) args.staleMinutes = Number(argv[i + 1]);
    if (argv[i] === '--send-alert') args.sendAlert = true;
  }
  return args;
}

async function maybeSendAlert(message) {
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
  const opts = parseArgs(process.argv.slice(2));
  const cutoffMs = Date.now() - opts.staleMinutes * 60 * 1000;

  const { data: agents, error: agentError } = await supabase
    .from('agents')
    .select('agent_id,status,last_heartbeat_at')
    .eq('status', 'active');

  if (agentError) throw agentError;

  const staleAgents = (agents || []).filter((agent) => {
    if (!agent.last_heartbeat_at) return true;
    return new Date(agent.last_heartbeat_at).getTime() < cutoffMs;
  });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: failedEvents, error: eventError } = await supabase
    .from('agent_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', oneDayAgo);

  if (eventError) throw eventError;

  const summary = {
    action: 'daily-heartbeat-summary',
    generatedAt: new Date().toISOString(),
    staleThresholdMinutes: opts.staleMinutes,
    activeAgents: agents?.length || 0,
    staleAgents: staleAgents.map((agent) => ({
      agent_id: agent.agent_id,
      last_heartbeat_at: agent.last_heartbeat_at,
    })),
    failedEvents24h: failedEvents || 0,
  };

  let alertDelivered = false;
  if (opts.sendAlert) {
    const lines = [
      'Daily Heartbeat Exception Summary',
      `Active agents: ${summary.activeAgents}`,
      `Stale agents: ${summary.staleAgents.length}`,
      `Failed events (24h): ${summary.failedEvents24h}`,
    ];

    if (summary.staleAgents.length > 0) {
      lines.push(`Stale list: ${summary.staleAgents.map((a) => a.agent_id).join(', ')}`);
    }

    alertDelivered = await maybeSendAlert(lines.join('\n'));
  }

  console.log(JSON.stringify({ ...summary, alertDelivered }, null, 2));

  if (summary.staleAgents.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
