#!/usr/bin/env node

import fs from 'fs/promises';

function parseArgs(argv) {
  const args = {
    config: 'config/openclaw.prod.json',
    requireWhen: 'reverse-proxy',
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config' && argv[i + 1]) args.config = argv[i + 1];
    if (argv[i] === '--require-when' && argv[i + 1]) args.requireWhen = argv[i + 1];
  }

  return args;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(opts.config, 'utf8');
  const config = JSON.parse(raw);

  const gateway = config.gateway || {};
  const trustedProxies = gateway.trustedProxies;
  const caddyDetected = Boolean(config?.meta) || Boolean(config?.gateway);

  const configured = Array.isArray(trustedProxies) && trustedProxies.length > 0;

  console.log(JSON.stringify({
    action: 'check-trusted-proxies',
    config: opts.config,
    requireWhen: opts.requireWhen,
    caddyDetected,
    trustedProxies: trustedProxies || [],
    status: configured ? 'ok' : 'warning',
    next: configured
      ? 'trustedProxies configured.'
      : 'Add gateway.trustedProxies for reverse-proxy deployments before enabling strict client-IP controls.',
  }, null, 2));

  if (!configured) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
