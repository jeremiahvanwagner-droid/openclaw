#!/usr/bin/env node

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    cmd: 'openclaw',
    subcommand: ['diagnostics', '--json'],
    requireScope: 'operator.read',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--cmd' && argv[i + 1]) args.cmd = argv[i + 1];
    if (token === '--args' && argv[i + 1]) {
      args.subcommand = argv[i + 1].split(',').map((item) => item.trim()).filter(Boolean);
    }
    if (token === '--scope' && argv[i + 1]) args.requireScope = argv[i + 1];
  }

  return args;
}

function detectScopeError(text, requiredScope) {
  const lowered = String(text || '').toLowerCase();
  const marker = `missing scope ${requiredScope}`.toLowerCase();
  return lowered.includes(marker) || (lowered.includes('missing scope') && lowered.includes(requiredScope.toLowerCase()));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  try {
    const { stdout, stderr } = await execFileAsync(opts.cmd, opts.subcommand, {
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });

    const combined = `${stdout || ''}\n${stderr || ''}`;
    const scopeMissing = detectScopeError(combined, opts.requireScope);

    let diagnostics = null;
    try {
      diagnostics = JSON.parse(stdout);
    } catch {
      diagnostics = null;
    }

    console.log(JSON.stringify({
      action: 'check-operator-scope',
      command: [opts.cmd, ...opts.subcommand],
      requiredScope: opts.requireScope,
      scopeMissing,
      diagnosticsParsed: Boolean(diagnostics),
      status: scopeMissing ? 'blocked' : 'ok',
      next: scopeMissing
        ? `Grant ${opts.requireScope} to the operator profile, then rerun this check.`
        : 'Operator scope check passed.',
    }, null, 2));

    if (scopeMissing) process.exit(1);
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}`;
    const scopeMissing = detectScopeError(output, opts.requireScope);

    console.log(JSON.stringify({
      action: 'check-operator-scope',
      command: [opts.cmd, ...opts.subcommand],
      requiredScope: opts.requireScope,
      status: scopeMissing ? 'blocked' : 'error',
      scopeMissing,
      error: error.message,
      next: scopeMissing
        ? `Grant ${opts.requireScope} to the operator profile and rerun this command.`
        : 'Verify OpenClaw CLI availability and diagnostics command arguments.',
    }, null, 2));

    process.exit(1);
  }
}

main();
