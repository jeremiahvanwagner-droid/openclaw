#!/usr/bin/env node

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function runNodeScript(scriptPath) {
  const { stdout, stderr } = await execFileAsync('node', [scriptPath], {
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  return { stdout, stderr };
}

async function main() {
  const checks = [];

  try {
    const rotation = await runNodeScript('scripts/credential-rotation-check.mjs');
    checks.push({ check: 'credential-rotation-check', ok: true, output: rotation.stdout.trim() });
  } catch (error) {
    checks.push({
      check: 'credential-rotation-check',
      ok: false,
      error: error.message,
      output: `${error.stdout || ''}\n${error.stderr || ''}`.trim(),
    });
  }

  try {
    const auth = await runNodeScript('scripts/check-ghl-auth.mjs');
    checks.push({ check: 'ghl-auth-consistency', ok: true, output: auth.stdout.trim() });
  } catch (error) {
    checks.push({
      check: 'ghl-auth-consistency',
      ok: false,
      error: error.message,
      output: `${error.stdout || ''}\n${error.stderr || ''}`.trim(),
    });
  }

  const ok = checks.every((entry) => entry.ok);

  console.log(JSON.stringify({
    action: 'revalidate-sensitive-tokens',
    ok,
    checks,
    next: ok
      ? 'Token revalidation checks passed.'
      : 'Review failed checks, rotate or rebind affected credentials, then rerun.',
  }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
