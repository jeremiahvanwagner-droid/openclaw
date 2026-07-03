#!/usr/bin/env node
/**
 * Cron failureAlert Patcher — Advancement 2
 * (docs/advancements/02-advancement-provider-preflight-degrade.md)
 *
 * A cron tick that fails preflight dies silently unless the job carries a
 * failureAlert block (the 2026-05-14/-16 cron storms produced log spam, not
 * pages). This patcher adds the standard alert block to every job missing one,
 * so repeated failures become a Telegram page instead of silence.
 *
 * jobs.json is a per-machine live store (gitignored) — run this against each
 * runtime's own file:
 *   workstation: node scripts/patch-cron-failure-alerts.mjs --file cron/jobs.json --write
 *   VPS:         node scripts/patch-cron-failure-alerts.mjs --file /opt/openclaw/.openclaw/cron/jobs.json --write
 *
 * Dry-run by default; --write applies (with a timestamped .bak first).
 * The alert chat id is inferred from existing failureAlert blocks in the file;
 * override with --to <chatId>.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";

const argv = process.argv.slice(2);
function argValue(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
}
const file = argValue("--file");
const write = argv.includes("--write");
const toOverride = argValue("--to");

if (!file || !existsSync(file)) {
  console.error("Usage: node scripts/patch-cron-failure-alerts.mjs --file <jobs.json> [--write] [--to <chatId>]");
  process.exit(1);
}

const store = JSON.parse(readFileSync(file, "utf8"));
const jobs = store.jobs ?? [];

// Infer the alert recipient from the file's own existing convention.
const existingTos = jobs
  .map((j) => j.failureAlert?.to)
  .filter((t) => typeof t === "string" && t.length > 0);
const to = toOverride || existingTos[0];
if (!to) {
  console.error("No existing failureAlert.to found in file and no --to given — refusing to guess a chat id.");
  process.exit(1);
}

const missing = jobs.filter((j) => !j.failureAlert);
console.log(`${file}: ${jobs.length} jobs, ${missing.length} missing failureAlert (alert target: ${to})`);
for (const job of missing) {
  console.log(`  ${write ? "+ adding" : "would add"}: ${job.name ?? job.id}${job.enabled === false ? " (disabled)" : ""}`);
  job.failureAlert = {
    after: 2,
    channel: "telegram",
    to,
    cooldownMs: 21600000,
    mode: "announce",
  };
}

if (!write) {
  console.log("\nDry run — re-run with --write to apply.");
  process.exit(0);
}
if (missing.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}
const bak = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}`;
copyFileSync(file, bak);
writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
JSON.parse(readFileSync(file, "utf8")); // self-check: written file must re-parse
console.log(`\nApplied ${missing.length} failureAlert block(s). Backup: ${bak}`);
