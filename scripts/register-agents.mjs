#!/usr/bin/env node
/**
 * Agent Registration Script
 * Open Claw Multi-Agent Network
 * 
 * Registers agents in Supabase database from agents_config.json.
 * 
 * Usage:
 *   node scripts/register-agents.mjs                              # Register all
 *   node scripts/register-agents.mjs --division division_2_ecommerce  # Filter by division
 *   node scripts/register-agents.mjs --filter "d2_*"              # Filter by pattern
 *   node scripts/register-agents.mjs --update                     # Update existing
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Paths and config
const CONFIG_PATH = path.join(ROOT_DIR, "config", "agents_config.json");

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || "https://aagqvfwuixpxtdcrdxmv.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  console.log("   Set it with: $env:SUPABASE_SERVICE_ROLE_KEY = 'your-key'");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse CLI arguments
const args = process.argv.slice(2);
const divisionFilter = args.includes("--division")
  ? args[args.indexOf("--division") + 1]
  : null;
const filterPattern = args.includes("--filter")
  ? args[args.indexOf("--filter") + 1]
  : null;
const updateExisting = args.includes("--update");
const verbose = args.includes("--verbose") || args.includes("-v");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logVerbose(message) {
  if (verbose) {
    console.log(`${colors.dim}  ${message}${colors.reset}`);
  }
}

/**
 * Load and parse the agents configuration
 */
async function loadConfig() {
  try {
    const configRaw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(configRaw);
  } catch (error) {
    log(`❌ Failed to load config: ${error.message}`, "red");
    process.exit(1);
  }
}

/**
 * Match agent_id against glob-like pattern
 */
function matchPattern(agentId, pattern) {
  if (!pattern) return true;
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  return regex.test(agentId);
}

// ── 8-Pod Runtime Classification ──────────────────────────────────

const SUPERVISOR_IDS = new Set([
  "shared_runtime_ops",
  "shared_exec_orchestrator",
  "shared_data_control",
  "shared_master_orchestrator",
]);

const ADVISOR_IDS = new Set([
  "d1_ceo", "d1_cto", "d1_cmo",
  "d2_director", "d3_ceo", "d4_cvo",
  "d5_publisher", "d6_executive_director",
]);

function classifyAgentClass(agent) {
  if (/^biz_\d{2}_pod_lead$/.test(agent.agent_id)) return "supervisor";
  if (SUPERVISOR_IDS.has(agent.agent_id)) return "supervisor";
  if (ADVISOR_IDS.has(agent.agent_id)) return "advisor";
  return "worker";
}

function classifyCriticality(agentClass) {
  if (agentClass === "supervisor") return "critical";
  if (agentClass === "advisor") return "advisory";
  return "standard";
}

function classifyHeartbeatPolicy(agentClass) {
  if (agentClass === "supervisor") return "always_on";
  if (agentClass === "worker") return "on_run";
  return "none";
}

function classifyQueueClass(agentClass) {
  if (agentClass === "supervisor") return "P0";
  return "P3";
}

/**
 * Register a single agent in Supabase
 */
async function registerAgent(agent) {
  // Determine runtime classification from config or defaults
  const agentClass = agent.agent_class || classifyAgentClass(agent);
  const podId = agent.pod_id || null;
  const criticality = agent.criticality || classifyCriticality(agentClass);
  const heartbeatPolicy = agent.heartbeat_policy || classifyHeartbeatPolicy(agentClass);
  const queueClass = agent.queue_class || classifyQueueClass(agentClass);

  const agentRecord = {
    agent_id: agent.agent_id,
    display_name: agent.display_name,
    org_unit: agent.org_unit,
    role_type: agent.role_type,
    llm_model: agent.llm_model,
    memory_type: agent.memory_type,
    status: "active",
    config: {
      agent_class: agentClass,
      pod_id: podId,
      criticality: criticality,
      heartbeat_policy: heartbeatPolicy,
      queue_class: queueClass,
      reports_to: agent.reports_to || null,
      primary_responsibilities: agent.primary_responsibilities,
      tools_required: agent.tools_required,
      input_triggers: agent.input_triggers,
      output_format: agent.output_format,
      escalation_path: agent.escalation_path,
      inter_agent_dependencies: agent.inter_agent_dependencies,
      workspace_path: agent.workspace_path,
      cron_schedule: agent.cron_schedule || null,
      telegram_delivery: agent.telegram_delivery || false,
    },
  };

  if (updateExisting) {
    // Upsert - update if exists, insert if not
    const { data, error } = await supabase
      .from("agents")
      .upsert(agentRecord, { onConflict: "agent_id" })
      .select()
      .single();

    if (error) throw error;
    return { action: "upserted", data };
  } else {
    // Insert only - will fail if exists
    const { data, error } = await supabase
      .from("agents")
      .insert(agentRecord)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique constraint violation - already exists
        return { action: "skipped", reason: "already exists" };
      }
      throw error;
    }
    return { action: "inserted", data };
  }
}

/**
 * Main execution
 */
async function main() {
  log("\n🤖 Open Claw Agent Registration");
  log("========================================");

  // Load config
  const config = await loadConfig();
  logVerbose(`Loaded ${config.agents.length} agents from config`);

  // Filter agents
  let agents = config.agents;

  if (divisionFilter) {
    agents = agents.filter((a) => a.org_unit === divisionFilter);
    log(`🔍 Filtering by division: ${divisionFilter}`, "cyan");
  }

  if (filterPattern) {
    agents = agents.filter((a) => matchPattern(a.agent_id, filterPattern));
    log(`🔍 Filtering by pattern: ${filterPattern}`, "cyan");
  }

  log(`\n📊 Processing ${agents.length} agents...\n`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const agent of agents) {
    try {
      const result = await registerAgent(agent);

      if (result.action === "inserted") {
        log(`✅ Registered: ${agent.agent_id}`, "green");
        inserted++;
      } else if (result.action === "upserted") {
        log(`✅ Updated: ${agent.agent_id}`, "green");
        updated++;
      } else if (result.action === "skipped") {
        log(`⏭️  Skipped: ${agent.agent_id} (${result.reason})`, "yellow");
        skipped++;
      }

      logVerbose(`   Role: ${agent.role_type} | Division: ${agent.org_unit}`);
    } catch (error) {
      log(`❌ Failed: ${agent.agent_id} - ${error.message}`, "red");
      errors++;
    }
  }

  // Summary
  log("\n========================================");
  log("📊 Summary:");
  if (inserted > 0) log(`   ✅ Inserted: ${inserted}`, "green");
  if (updated > 0) log(`   ✅ Updated: ${updated}`, "green");
  if (skipped > 0) log(`   ⏭️  Skipped: ${skipped}`, "yellow");
  if (errors > 0) log(`   ❌ Errors: ${errors}`, "red");

  // Verify registration
  log("\n🔍 Verifying database state...");
  const { data: dbAgents, error: countError } = await supabase
    .from("agents")
    .select("agent_id, status, org_unit")
    .order("org_unit");

  if (countError) {
    log(`⚠️  Could not verify: ${countError.message}`, "yellow");
  } else {
    log(`   Total agents in database: ${dbAgents.length}`);

    // Group by division
    const byDivision = {};
    for (const a of dbAgents) {
      byDivision[a.org_unit] = (byDivision[a.org_unit] || 0) + 1;
    }

    for (const [div, count] of Object.entries(byDivision)) {
      log(`   ${div}: ${count} agents`, "dim");
    }
  }

  log("");
}

main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, "red");
  process.exit(1);
});
