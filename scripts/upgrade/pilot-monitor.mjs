#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

import { loadLocalEnv } from '../../lib/load-local-env.mjs';

loadLocalEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and service/anon key are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseArgs(argv) {
  const args = {
    hours: 72,
    agents: ['biz_01_pod_lead', 'd8_revenue_ops', 'd8_funnel_engineer'],
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--hours' && argv[i + 1]) args.hours = Number(argv[i + 1]);
    if (argv[i] === '--agents' && argv[i + 1]) {
      args.agents = argv[i + 1].split(',').map((value) => value.trim()).filter(Boolean);
    }
  }

  return args;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - opts.hours * 60 * 60 * 1000).toISOString();

  const perAgent = [];
  for (const agentId of opts.agents) {
    const { count: totalEvents, error: totalError } = await supabase
      .from('agent_events')
      .select('*', { count: 'exact', head: true })
      .or(`source_agent.eq.${agentId},target_agent.eq.${agentId}`)
      .gte('created_at', since);

    if (totalError) throw totalError;

    const { count: failedEvents, error: failedError } = await supabase
      .from('agent_events')
      .select('*', { count: 'exact', head: true })
      .or(`source_agent.eq.${agentId},target_agent.eq.${agentId}`)
      .eq('status', 'failed')
      .gte('created_at', since);

    if (failedError) throw failedError;

    perAgent.push({
      agent_id: agentId,
      totalEvents: totalEvents || 0,
      failedEvents: failedEvents || 0,
      successRate: totalEvents ? (totalEvents - (failedEvents || 0)) / totalEvents : 0,
    });
  }

  const noTrafficAgents = perAgent.filter((item) => item.totalEvents === 0).map((item) => item.agent_id);
  const belowSloAgents = perAgent.filter((item) => item.successRate < 0.99).map((item) => item.agent_id);

  const ok = noTrafficAgents.length === 0 && belowSloAgents.length === 0;

  console.log(JSON.stringify({
    action: 'pilot-monitor',
    hours: opts.hours,
    since,
    agents: opts.agents,
    perAgent,
    noTrafficAgents,
    belowSloAgents,
    ok,
  }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
