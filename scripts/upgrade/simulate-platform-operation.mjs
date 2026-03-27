#!/usr/bin/env node

import fs from "fs/promises";

import {
  evaluatePlatformOperation,
  loadPlatformOpsBundle,
  resetPlatformOpsLedgers,
} from "../../lib/platform-ops-governance.mjs";

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function resolvePayload() {
  const payloadInline = readArg("--payload");
  const payloadPath = readArg("--payload-file");

  if (payloadInline) {
    return JSON.parse(payloadInline);
  }

  if (payloadPath) {
    const raw = await fs.readFile(payloadPath, "utf8");
    return JSON.parse(raw);
  }

  return {};
}

async function main() {
  const lane = readArg("--lane", "");
  const action = readArg("--action", "");
  const source = readArg("--source", "manual");
  const profile = readArg("--profile");
  const agentId = readArg("--agent", "platform_simulator");
  const platform = readArg("--platform");
  const repeat = Number(readArg("--repeat", "1")) || 1;
  const persist = !hasFlag("--no-persist");
  const resetLedgers = hasFlag("--reset-ledgers");
  const dryRun = hasFlag("--dry-run");

  if (!lane || !action) {
    throw new Error("--lane and --action are required");
  }

  const payload = await resolvePayload();
  const bundle = await loadPlatformOpsBundle();

  if (resetLedgers) {
    await resetPlatformOpsLedgers({ bundle });
  }

  const decisions = [];
  for (let i = 0; i < repeat; i += 1) {
    const request = {
      lane,
      action,
      source,
      profile,
      platform,
      agentId,
      dryRun,
      payload,
    };

    const decision = await evaluatePlatformOperation(request, {
      bundle,
      persist,
    });

    decisions.push(decision);
  }

  const summary = {
    action: "simulate-platform-operation",
    timestamp: new Date().toISOString(),
    lane,
    operation: action,
    repeat,
    persist,
    decisions,
  };

  console.log(JSON.stringify(summary, null, 2));

  const failed = decisions.some((decision) => !decision.ok);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        action: "simulate-platform-operation",
        ok: false,
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
