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
    hours: 24,
    stages: ['assessment.completed', 'ebook.delivered', 'membership_or_course.enrolled'],
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--hours' && argv[i + 1]) args.hours = Number(argv[i + 1]);
    if (argv[i] === '--stages' && argv[i + 1]) {
      args.stages = argv[i + 1].split(',').map((value) => value.trim()).filter(Boolean);
    }
  }

  return args;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - opts.hours * 60 * 60 * 1000).toISOString();
  const stageCounts = [];

  for (const eventType of opts.stages) {
    const { count, error } = await supabase
      .from('agent_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', eventType)
      .gte('created_at', since);

    if (error) throw error;
    stageCounts.push({ event_type: eventType, count: count || 0 });
  }

  const missingStages = stageCounts.filter((item) => item.count === 0).map((item) => item.event_type);
  const completenessRate = stageCounts.length === 0
    ? 0
    : (stageCounts.length - missingStages.length) / stageCounts.length;

  const ok = completenessRate >= 0.98;

  console.log(JSON.stringify({
    action: 'validate-funnel-telemetry',
    hours: opts.hours,
    since,
    stageCounts,
    missingStages,
    completenessRate,
    ok,
  }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
