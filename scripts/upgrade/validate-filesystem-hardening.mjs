#!/usr/bin/env node

import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';

function parseArgs(argv) {
  const args = { root: '/opt/openclaw/.openclaw', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') args.apply = true;
    if (token === '--root' && argv[i + 1]) args.root = argv[i + 1];
  }
  return args;
}

function toMode(octal) {
  return Number.parseInt(octal, 8);
}

function formatMode(mode) {
  return (mode & 0o777).toString(8).padStart(3, '0');
}

async function ensureReadable(pathname) {
  await fs.access(pathname, fsConstants.R_OK);
}

async function statMode(pathname) {
  const stat = await fs.stat(pathname);
  return formatMode(stat.mode);
}

async function enforceMode(pathname, expectedMode, apply) {
  const before = await statMode(pathname);
  let changed = false;

  if (before !== expectedMode && apply) {
    await fs.chmod(pathname, toMode(expectedMode));
    changed = true;
  }

  const after = await statMode(pathname);
  return {
    path: pathname,
    expected: expectedMode,
    before,
    after,
    compliant: after === expectedMode,
    changed,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cfgPath = `${opts.root}/openclaw.json`;

  const checks = [
    { path: opts.root, expected: '700' },
    { path: cfgPath, expected: '600' },
  ];

  const results = [];
  for (const check of checks) {
    try {
      await ensureReadable(check.path);
      const result = await enforceMode(check.path, check.expected, opts.apply);
      results.push({ ...result, exists: true });
    } catch (error) {
      results.push({
        path: check.path,
        expected: check.expected,
        exists: false,
        compliant: false,
        error: error.message,
      });
    }
  }

  const output = {
    action: 'validate-filesystem-hardening',
    root: opts.root,
    apply: opts.apply,
    allCompliant: results.every((entry) => entry.compliant),
    results,
    next: opts.apply
      ? 'If allCompliant=true, proceed to operator scope and token revalidation.'
      : 'Run with --apply in an approved maintenance window to enforce modes.',
  };

  console.log(JSON.stringify(output, null, 2));
  if (!output.allCompliant) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
