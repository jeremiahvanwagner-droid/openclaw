#!/usr/bin/env node

import fs from 'fs/promises';

function parseArgs(argv) {
  const args = {
    file: 'data/worker-environment-map.json',
    expected: 'production',
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--file' && argv[i + 1]) args.file = argv[i + 1];
    if (argv[i] === '--expected' && argv[i + 1]) args.expected = argv[i + 1];
  }

  return args;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(opts.file, 'utf8');
  const payload = JSON.parse(raw);
  const workers = Array.isArray(payload.workers) ? payload.workers : [];

  const allowedEnvironments = new Set(['production', 'staging', 'development']);
  const seen = new Set();

  const duplicateWorkers = [];
  const invalidEnvironments = [];
  const mismatchedWorkers = [];

  for (const worker of workers) {
    if (seen.has(worker.worker_id)) {
      duplicateWorkers.push(worker.worker_id);
    }
    seen.add(worker.worker_id);

    if (!allowedEnvironments.has(worker.environment)) {
      invalidEnvironments.push({ worker_id: worker.worker_id, environment: worker.environment });
    }

    if (worker.environment !== opts.expected) {
      mismatchedWorkers.push({ worker_id: worker.worker_id, environment: worker.environment });
    }
  }

  const ok = duplicateWorkers.length === 0
    && invalidEnvironments.length === 0
    && mismatchedWorkers.length === 0;

  console.log(JSON.stringify({
    action: 'validate-worker-env',
    file: opts.file,
    expectedEnvironment: opts.expected,
    workerCount: workers.length,
    duplicateWorkers,
    invalidEnvironments,
    mismatchedWorkers,
    ok,
  }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
