#!/usr/bin/env node

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || process.env.OPENCLAW_REMOTE_URL
      ? `${process.env.OPENCLAW_REMOTE_URL}/health`
      : 'http://127.0.0.1:18789/health',
    webhookAuthMode: 'bearer',
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--gateway-url' && argv[i + 1]) args.gatewayUrl = argv[i + 1];
    if (argv[i] === '--webhook-auth-mode' && argv[i + 1]) args.webhookAuthMode = argv[i + 1];
  }

  return args;
}

async function runCommand(cmd, cmdArgs) {
  const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
    maxBuffer: 1024 * 1024,
    timeout: 60_000,
  });
  return { stdout, stderr };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const checks = [];

  const gateway = await fetch(opts.gatewayUrl);
  checks.push({
    check: 'gateway-health',
    ok: gateway.ok,
    status: gateway.status,
    url: opts.gatewayUrl,
  });

  const webhookSmoke = await runCommand('node', [
    'scripts/smoke-test-ghl-webhook-handler.mjs',
    '--auth-mode',
    opts.webhookAuthMode,
  ]);

  let webhookParsed = null;
  try {
    webhookParsed = JSON.parse(webhookSmoke.stdout);
  } catch {
    webhookParsed = null;
  }

  checks.push({
    check: 'webhook-smoke',
    ok: Boolean(webhookParsed?.health?.ok && webhookParsed?.webhook?.ok),
    healthStatus: webhookParsed?.health?.status || null,
    webhookStatus: webhookParsed?.webhook?.status || null,
  });

  const healthReport = await runCommand('node', ['scripts/check-agent-health.mjs', '--json']);
  let healthParsed = null;
  try {
    healthParsed = JSON.parse(healthReport.stdout);
  } catch {
    healthParsed = null;
  }

  checks.push({
    check: 'agent-health',
    ok: Boolean(healthParsed?.status && healthParsed.status !== 'critical'),
    networkStatus: healthParsed?.status || 'unknown',
    activeAgents: healthParsed?.agents?.active || 0,
    pendingEvents: healthParsed?.events?.pending || 0,
  });

  const allPassed = checks.every((entry) => entry.ok);

  console.log(JSON.stringify({
    action: 'post-update-smoke',
    allPassed,
    checks,
    next: allPassed
      ? 'Smoke checks passed. Proceed to runtime dashboard/alert rollout.'
      : 'Stop rollout and execute rollback checklist.',
  }, null, 2));

  if (!allPassed) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
