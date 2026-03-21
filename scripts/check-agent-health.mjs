#!/usr/bin/env node
/**
 * Agent Health Check Script
 * OpenClaw Multi-Agent Network - Phase 3
 *
 * Quick health status of the entire agent network
 *
 * Usage:
 *   node scripts/check-agent-health.mjs              # Full health check
 *   node scripts/check-agent-health.mjs --division d1  # Division only
 *   node scripts/check-agent-health.mjs --json         # JSON output
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) { console.error("❌ SUPABASE_URL environment variable is required"); process.exit(1); }
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse CLI arguments
const args = process.argv.slice(2);
const divisionFilter = args.includes("--division") 
  ? args[args.indexOf("--division") + 1] 
  : null;
const jsonOutput = args.includes("--json");

// Map org_unit to short division name
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

// Colors
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

  log("\n🦀 OpenClaw Agent Network Health Check", "bold");
  log("═".repeat(50));

  // Fetch agents
  let query = supabase.from("agents").select("*");
  if (divisionFilter) {
    // Map short filter to org_unit pattern
    const orgPattern = divisionFilter.startsWith("d") 
      ? `division_${divisionFilter.substring(1)}%`
      : `%${divisionFilter}%`;
    query = query.ilike("org_unit", orgPattern);
  }

  const { data: agents, error: agentsError } = await query;

  if (agentsError) {
    healthReport.status = "critical";
    healthReport.issues.push(`Database error: ${agentsError.message}`);
    log(`❌ Database error: ${agentsError.message}`, "red");
  } else if (agents) {
    healthReport.agents.total = agents.length;

    // Count by status
    agents.forEach((agent) => {
      const status = agent.status || "idle";
      healthReport.agents[status] = (healthReport.agents[status] || 0) + 1;

      // Group by division (use org_unit column)
      const div = getDivShort(agent.org_unit);
      if (!healthReport.divisions[div]) {
        healthReport.divisions[div] = { total: 0, active: 0, error: 0 };
      }
      healthReport.divisions[div].total++;
      if (status === "active") healthReport.divisions[div].active++;
      if (status === "error") healthReport.divisions[div].error++;

      // Check for stale heartbeats (use last_heartbeat_at column)
      if (agent.last_heartbeat_at) {
        const lastSeen = new Date(agent.last_heartbeat_at);
        const staleThreshold = Date.now() - 5 * 60 * 1000; // 5 minutes
        if (lastSeen.getTime() < staleThreshold && status === "active") {
          healthReport.issues.push(`Agent ${agent.agent_id} has stale heartbeat`);
        }
      }
    });

    log(`\n📊 Agent Status`, "cyan");
    log(`   Total:  ${healthReport.agents.total}`);
    log(`   ✅ Active: ${healthReport.agents.active}`, "green");
    log(`   ⏸️  Idle:   ${healthReport.agents.idle}`, "yellow");
    log(`   ⏹️  Paused: ${healthReport.agents.paused || 0}`, "dim");
    log(`   ❌ Error:  ${healthReport.agents.error}`, healthReport.agents.error > 0 ? "red" : "reset");

    // Division breakdown
    log(`\n📁 Division Status`, "cyan");
    for (const [div, stats] of Object.entries(healthReport.divisions)) {
      const statusIcon = stats.error > 0 ? "❌" : stats.active === stats.total ? "✅" : "⚠️";
      log(`   ${statusIcon} ${div}: ${stats.active}/${stats.total} active`);
    }
  }

  // Check pending events
  const { count: pendingCount } = await supabase
    .from("agent_events")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  healthReport.events.pending = pendingCount || 0;

  // Get oldest pending event
  const { data: oldestPending } = await supabase
    .from("agent_events")
    .select("created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (oldestPending) {
    healthReport.events.oldest_pending = oldestPending.created_at;
    const ageMinutes = Math.floor((Date.now() - new Date(oldestPending.created_at).getTime()) / 60000);
    if (ageMinutes > 30) {
      healthReport.issues.push(`Oldest pending event is ${ageMinutes} minutes old`);
    }
  }

  // Check failed events in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: failedCount } = await supabase
    .from("agent_events")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", oneDayAgo);

  healthReport.events.failed_24h = failedCount || 0;

  log(`\n📨 Event Queue`, "cyan");
  log(`   Pending:    ${healthReport.events.pending}`);
  log(`   Failed(24h): ${healthReport.events.failed_24h}`, healthReport.events.failed_24h > 0 ? "yellow" : "reset");
  if (healthReport.events.oldest_pending) {
    const age = Math.floor((Date.now() - new Date(healthReport.events.oldest_pending).getTime()) / 60000);
    log(`   Oldest:     ${age} minutes`);
  }

  // Determine overall status
  if (healthReport.agents.error > 5 || healthReport.events.pending > 500) {
    healthReport.status = "critical";
  } else if (healthReport.agents.error > 0 || healthReport.events.failed_24h > 10 || healthReport.issues.length > 0) {
    healthReport.status = "degraded";
  }

  // Summary
  log(`\n${"═".repeat(50)}`);
  const statusEmoji = healthReport.status === "healthy" ? "✅" : healthReport.status === "degraded" ? "⚠️" : "❌";
  const statusColor = healthReport.status === "healthy" ? "green" : healthReport.status === "degraded" ? "yellow" : "red";
  log(`${statusEmoji} Overall Status: ${healthReport.status.toUpperCase()}`, statusColor);

  if (healthReport.issues.length > 0) {
    log(`\n⚠️  Issues Detected:`, "yellow");
    healthReport.issues.forEach((issue) => log(`   • ${issue}`));
  }

  // JSON output
  if (jsonOutput) {
    console.log(JSON.stringify(healthReport, null, 2));
  }

  log("");
  process.exit(healthReport.status === "critical" ? 2 : healthReport.status === "degraded" ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  process.exit(1);
});
