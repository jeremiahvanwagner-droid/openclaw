#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

const candidates = [
  { cmd: "pnpm", args },
  { cmd: "corepack", args: ["pnpm", ...args] },
];

for (const candidate of candidates) {
  const result = spawnSync(candidate.cmd, candidate.args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error && result.error.code === "ENOENT") {
    continue;
  }

  if (result.error) {
    console.error(`[pnpm-runner] Failed to execute ${candidate.cmd}:`, result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

console.error('[pnpm-runner] Neither "pnpm" nor "corepack" is available on PATH.');
console.error('[pnpm-runner] Install pnpm or enable Corepack, then retry.');
process.exit(1);
