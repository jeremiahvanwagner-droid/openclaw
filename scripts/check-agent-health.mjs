#!/usr/bin/env node
/**
 * Agent Health Check Script
 * OpenClaw Multi-Agent Network
 *
 * Usage:
 *   node scripts/check-agent-health.mjs
 *   node scripts/check-agent-health.mjs --division d1
 *   node scripts/check-agent-health.mjs --json
 */

import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../lib/load-local-env.mjs";

loadLocalEnv();

if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}
if (!process.env.SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

const SUPABASE_URL = process.env.SUPABASE_URL || "";
if (!SUPABASE_URL) {
  console.error("ERROR: SUPABASE_URL is required");
  process.exit(1);
}

const SUPABASE_KEY_CANDIDATES = Array.from(
  new Set(
    [
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.SUPABASE_SERVICE_KEY,
      process.env.SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ].filter(Boolean),
  ),
);

if (SUPABASE_KEY_CANDIDATES.length === 0) {
  console.error(
    "ERROR: Supabase key is required (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
  );
  process.exit(1);
}

const UNREGISTERED_API_KEY_PATTERN = /unregistered api key/i;

const args = process.argv.slice(2);
const divisionFilter = args.includes("--division")
  ? args[args.indexOf("--division") + 1]
  : null;
const jsonOutput = args.includes("--json");

const ORG_TO_DIV = {
  division_1_core_operations: "D1 Core",
  division_2_ecommerce: "D2 eCom",
  division_3_consulting: "D3 Consult",
  division_4_coaching: "D4 Coach",
  division_5_publishing: "D5 Publish",
  division_6_nonprofit: "D6 Nonprofit",
  division_7_shared_services: "D7 Shared",
};

function getDivShort(orgUnit) {
  return ORG_TO_DIV[orgUnit] || orgUnit || "Unknown";
}

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function log(msg, color = "reset") {
  if (!jsonOutput) {
    console.log(`${colors[color]}${msg}${colors.reset}`);
  }
}

function isUnregisteredKeyError(error) {
  return Boolean(error?.message && UNREGISTERED_API_KEY_PATTERN.test(error.message));
}

let activeKeyIndex = 0;
let supabase = createClient(SUPABASE_URL, SUPABASE_KEY_CANDIDATES[activeKeyIndex]);

async function switchToWorkingKey(startIndex = activeKeyIndex + 1) {
  for (let idx = startIndex; idx < SUPABASE_KEY_CANDIDATES.length; idx += 1) {
    const candidateClient = createClient(SUPABASE_URL, SUPABASE_KEY_CANDIDATES[idx]);
    const { error: probeError } = await candidateClient
      .from("agents")
      .select("agent_id", { count: "exact", head: true });

    if (!isUnregisteredKeyError(probeError)) {
      activeKeyIndex = idx;
      supabase = candidateClient;
      return true;
    }
  }

  return false;
}

async function runWithKeyFallback(queryFactory) {
  let result = await queryFactory(supabase);
  if (result?.error && isUnregisteredKeyError(result.error)) {
    const switched = await switchToWorkingKey();
    if (switched) {
      result = await queryFactory(supabase);
    }
  }
  return result;
}

async function main() {
  const healthReport = {
    timestamp: new Date().toISOString(),
    status: "healthy",
    agents: {
      total: 0,
      active: 0,
      idle: 0,
      paused: 0,
      error: 0,
    },
    divisions: {},
    events: {
      pending: 0,
      oldest_pending: null,
      failed_24h: 0,
    },
    issues: [],
  };

  log("\nOpenClaw Agent Network Health Check", "bold");
  log("=".repeat(50));

  const { data: agents, error: agentsError } = await runWithKeyFallback((db) => {
    let query = db.from("agents").select("*");
    if (divisionFilter) {
      const orgPattern = divisionFilter.startsWith("d")
        ? `division_${divisionFilter.substring(1)}%`
        : `%${divisionFilter}%`;
      query = query.ilike("org_unit", orgPattern);
    }
    return query;
  });

  if (agentsError) {
    healthReport.status = "critical";
    healthReport.issues.push(`Database error: ${agentsError.message}`);
    log(`ERROR Database error: ${agentsError.message}`, "red");
  } else if (agents) {
    healthReport.agents.total = agents.length;

    agents.forEach((agent) => {
      const status = agent.status || "idle";
      healthReport.agents[status] = (healthReport.agents[status] || 0) + 1;

      const div = getDivShort(agent.org_unit);
      if (!healthReport.divisions[div]) {
        healthReport.divisions[div] = { total: 0, active: 0, error: 0 };
      }
      healthReport.divisions[div].total += 1;
      if (status === "active") healthReport.divisions[div].active += 1;
      if (status === "error") healthReport.divisions[div].error += 1;

      if (agent.last_heartbeat_at) {
        const lastSeen = new Date(agent.last_heartbeat_at);
        const staleThreshold = Date.now() - 5 * 60 * 1000;
        if (lastSeen.getTime() < staleThreshold && status === "active") {
          healthReport.issues.push(`Agent ${agent.agent_id} has stale heartbeat`);
        }
      }
    });

    log("\nAgent Status", "cyan");
    log(`   Total:  ${healthReport.agents.total}`);
    log(`   Active: ${healthReport.agents.active}`, "green");
    log(`   Idle:   ${healthReport.agents.idle}`, "yellow");
    log(`   Paused: ${healthReport.agents.paused || 0}`, "dim");
    log(
      `   Error:  ${healthReport.agents.error}`,
      healthReport.agents.error > 0 ? "red" : "reset",
    );

    log("\nDivision Status", "cyan");
    for (const [div, stats] of Object.entries(healthReport.divisions)) {
      const statusIcon = stats.error > 0 ? "ERROR" : stats.active === stats.total ? "OK" : "WARN";
      log(`   ${statusIcon} ${div}: ${stats.active}/${stats.total} active`);
    }
  }

  const { count: pendingCount } = await runWithKeyFallback((db) =>
    db.from("agent_events").select("*", { count: "exact", head: true }).eq("status", "pending"),
  );
  healthReport.events.pending = pendingCount || 0;

  const { data: oldestPending } = await runWithKeyFallback((db) =>
    db
      .from("agent_events")
      .select("created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .single(),
  );

  if (oldestPending) {
    healthReport.events.oldest_pending = oldestPending.created_at;
    const ageMinutes = Math.floor(
      (Date.now() - new Date(oldestPending.created_at).getTime()) / 60000,
    );
    if (ageMinutes > 30) {
      healthReport.issues.push(`Oldest pending event is ${ageMinutes} minutes old`);
    }
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: failedCount } = await runWithKeyFallback((db) =>
    db
      .from("agent_events")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", oneDayAgo),
  );
  healthReport.events.failed_24h = failedCount || 0;

  log("\nEvent Queue", "cyan");
  log(`   Pending:    ${healthReport.events.pending}`);
  log(
    `   Failed(24h): ${healthReport.events.failed_24h}`,
    healthReport.events.failed_24h > 0 ? "yellow" : "reset",
  );
  if (healthReport.events.oldest_pending) {
    const age = Math.floor(
      (Date.now() - new Date(healthReport.events.oldest_pending).getTime()) / 60000,
    );
    log(`   Oldest:     ${age} minutes`);
  }

  if (healthReport.agents.error > 5 || healthReport.events.pending > 500) {
    healthReport.status = "critical";
  } else if (
    healthReport.agents.error > 0
    || healthReport.events.failed_24h > 10
    || healthReport.issues.length > 0
  ) {
    healthReport.status = "degraded";
  }

  log(`\n${"=".repeat(50)}`);
  const statusColor =
    healthReport.status === "healthy"
      ? "green"
      : healthReport.status === "degraded"
        ? "yellow"
        : "red";
  log(`Overall Status: ${healthReport.status.toUpperCase()}`, statusColor);

  if (healthReport.issues.length > 0) {
    log("\nIssues Detected:", "yellow");
    healthReport.issues.forEach((issue) => log(`   - ${issue}`));
  }

  if (jsonOutput) {
    console.log(JSON.stringify(healthReport, null, 2));
  }

  process.exit(healthReport.status === "critical" ? 2 : healthReport.status === "degraded" ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
