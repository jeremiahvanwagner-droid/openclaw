#!/usr/bin/env node
/**
 * Division 8 — SaaS Operations Integration Test Suite
 * Open Claw Multi-Agent Network
 *
 * End-to-end integration tests for Division 8 SaaS agent workflows.
 *
 * Usage:
 *   node scripts/test-d8-saas-integration.mjs                   # Run all tests
 *   node scripts/test-d8-saas-integration.mjs --test 1          # Run specific test
 *   node scripts/test-d8-saas-integration.mjs --dry-run         # Validate without executing
 *   node scripts/test-d8-saas-integration.mjs --verbose         # Verbose output
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) { console.error("❌ SUPABASE_URL environment variable is required"); process.exit(1); }
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY;
const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || "", ".openclaw");

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse CLI arguments
const args = process.argv.slice(2);
const testFilter = args.includes("--test")
  ? parseInt(args[args.indexOf("--test") + 1])
  : null;
const verbose = args.includes("--verbose") || args.includes("-v");
const dryRun = args.includes("--dry-run");

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(msg, color = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logVerbose(msg) {
  if (verbose) console.log(`${colors.dim}  ${msg}${colors.reset}`);
}

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, label) {
  if (condition) {
    log(`  ✅ ${label}`, "green");
    passed++;
  } else {
    log(`  ❌ ${label}`, "red");
    failed++;
  }
}

function skip(label, reason) {
  log(`  ⏭️  ${label} — ${reason}`, "yellow");
  skipped++;
}

// ════════════════════════════════════════════════════════════════
// TEST 1: New SaaS Client Onboarding Flow
// ════════════════════════════════════════════════════════════════
async function test1_newSaaSClientFlow() {
  log("\n═══ Test 1: New SaaS Client Onboarding Flow ═══", "cyan");

  // 1a. Verify d8_platform_architect is registered
  const { data: architect } = await supabase
    .from("agents")
    .select("agent_id, status, config")
    .eq("agent_id", "d8_platform_architect")
    .single();
  assert(!!architect, "d8_platform_architect registered in Supabase");

  // 1b. Verify saas-instances.json exists and is valid
  const instancesPath = join(OPENCLAW_ROOT, "data", "saas-instances.json");
  const instancesExist = existsSync(instancesPath);
  assert(instancesExist, "data/saas-instances.json exists");

  if (instancesExist) {
    const instances = JSON.parse(readFileSync(instancesPath, "utf-8"));
    assert(Array.isArray(instances.instances), "saas-instances.json has valid instances array");
    assert(instances.instances.length > 0, "At least one SaaS instance configured");

    const first = instances.instances[0];
    assert(!!first.saas_instance_id, "Instance has saas_instance_id");
    assert(!!first.brand_name, "Instance has brand_name");
    assert(Array.isArray(first.pricing_tiers), "Instance has pricing_tiers");
  }

  // 1c. Simulate saas/client.signup event (dry-run check)
  if (dryRun) {
    skip("Event dispatch", "dry-run mode");
  } else if (INNGEST_EVENT_KEY) {
    logVerbose("Sending test saas/client.signup event...");
    const { data: eventResult } = await supabase.from("agent_events").insert({
      event_type: "saas/client.signup",
      source_agent: "test-suite",
      payload: {
        contact: { firstName: "Test", lastName: "Client", email: "test@example.com" },
        saas_instance_id: "test-instance-001",
        plan: { name: "Growth" },
      },
    }).select();
    assert(!!eventResult, "saas/client.signup event logged to agent_events");
  } else {
    skip("Event dispatch", "INNGEST_EVENT_KEY not set");
  }

  // 1d. Verify webhook handler has saas/client.signup route
  const webhookPath = join(OPENCLAW_ROOT, "ghl-webhook-handler.mjs");
  if (existsSync(webhookPath)) {
    const webhookSrc = readFileSync(webhookPath, "utf-8");
    assert(webhookSrc.includes("'saas/client.signup'"), "Webhook handler routes saas/client.signup");
    assert(webhookSrc.includes("d8_platform_architect"), "Webhook routes to d8_platform_architect");
  }
}

// ════════════════════════════════════════════════════════════════
// TEST 2: Payment Failure Recovery Flow
// ════════════════════════════════════════════════════════════════
async function test2_paymentFailureFlow() {
  log("\n═══ Test 2: Payment Failure Recovery Flow ═══", "cyan");

  // 2a. Verify d8_revenue_ops and d8_customer_success are registered
  const { data: revenueOps } = await supabase
    .from("agents")
    .select("agent_id")
    .eq("agent_id", "d8_revenue_ops")
    .single();
  assert(!!revenueOps, "d8_revenue_ops registered in Supabase");

  const { data: customerSuccess } = await supabase
    .from("agents")
    .select("agent_id")
    .eq("agent_id", "d8_customer_success")
    .single();
  assert(!!customerSuccess, "d8_customer_success registered in Supabase");

  // 2b. Verify webhook handler has payment failure route
  const webhookPath = join(OPENCLAW_ROOT, "ghl-webhook-handler.mjs");
  if (existsSync(webhookPath)) {
    const webhookSrc = readFileSync(webhookPath, "utf-8");
    assert(webhookSrc.includes("'saas/payment.failed'"), "Webhook handler routes saas/payment.failed");
    assert(webhookSrc.includes("handleSaaSPaymentFailed"), "handleSaaSPaymentFailed handler exists");
  }

  // 2c. Verify SMS compliance checker skill exists
  const smsSkillPath = join(OPENCLAW_ROOT, "skills", "sms-compliance-checker", "SKILL.md");
  assert(existsSync(smsSkillPath), "sms-compliance-checker skill exists");

  // 2d. Verify dunning-related cron job
  const cronPath = join(OPENCLAW_ROOT, "cron", "jobs.json");
  if (existsSync(cronPath)) {
    const cron = JSON.parse(readFileSync(cronPath, "utf-8"));
    const sentimentJob = cron.jobs.find(j => j.id === "d8-sentiment-analyzer-4h");
    assert(!!sentimentJob, "d8-sentiment-analyzer cron job exists");
    assert(sentimentJob?.enabled === true, "Sentiment analyzer cron is enabled");
  }
}

// ════════════════════════════════════════════════════════════════
// TEST 3: Funnel Build & Validation Flow
// ════════════════════════════════════════════════════════════════
async function test3_funnelBuildFlow() {
  log("\n═══ Test 3: Funnel Build & Validation Flow ═══", "cyan");

  // 3a. Verify funnel skills exist
  const funnelSkills = [
    "funnel-blueprint-generator",
    "funnel-cloner",
    "page-builder",
    "form-field-mapper",
  ];
  for (const skill of funnelSkills) {
    const skillPath = join(OPENCLAW_ROOT, "skills", skill, "SKILL.md");
    const cliPath = join(OPENCLAW_ROOT, "skills", `${skill}.mjs`);
    const exists = existsSync(skillPath) || existsSync(cliPath);
    assert(exists, `${skill} skill/tool exists`);
  }

  // 3b. Verify broken-link-checker tool
  const blcPath = join(OPENCLAW_ROOT, "skills", "broken-link-checker.mjs");
  assert(existsSync(blcPath), "broken-link-checker.mjs exists");

  // 3c. Verify broken-link-checker cron is configured
  const cronPath = join(OPENCLAW_ROOT, "cron", "jobs.json");
  if (existsSync(cronPath)) {
    const cron = JSON.parse(readFileSync(cronPath, "utf-8"));
    const blcJob = cron.jobs.find(j => j.id === "d8-broken-link-checker-daily");
    assert(!!blcJob, "d8-broken-link-checker cron job exists");
    assert(blcJob?.schedule?.expr === "0 6 * * *", "Broken link checker runs daily at 6am");
  }

  // 3d. Verify d8_funnel_engineer registered
  const { data: funnelEng } = await supabase
    .from("agents")
    .select("agent_id")
    .eq("agent_id", "d8_funnel_engineer")
    .single();
  assert(!!funnelEng, "d8_funnel_engineer registered in Supabase");
}

// ════════════════════════════════════════════════════════════════
// TEST 4: Multi-SaaS Instance Isolation
// ════════════════════════════════════════════════════════════════
async function test4_multiSaaSIsolation() {
  log("\n═══ Test 4: Multi-SaaS Instance Isolation ═══", "cyan");

  // 4a. Verify saas-instances.json schema supports multiple instances
  const instancesPath = join(OPENCLAW_ROOT, "data", "saas-instances.json");
  if (existsSync(instancesPath)) {
    const instances = JSON.parse(readFileSync(instancesPath, "utf-8"));
    const first = instances.instances[0];

    assert(!!first.saas_instance_id, "Instance has unique saas_instance_id");
    assert(!!first.ghl_agency_account_id, "Instance has ghl_agency_account_id");
    assert(Array.isArray(first.sub_accounts), "Instance has sub_accounts array");
    assert(typeof first.settings === "object", "Instance has settings object");
    assert(typeof first.metrics === "object", "Instance has metrics object");

    logVerbose("Schema supports per-instance isolation via saas_instance_id filtering");
  }

  // 4b. Verify webhook handler passes saas_instance_id
  const webhookPath = join(OPENCLAW_ROOT, "ghl-webhook-handler.mjs");
  if (existsSync(webhookPath)) {
    const webhookSrc = readFileSync(webhookPath, "utf-8");
    assert(webhookSrc.includes("saas_instance_id"), "Webhook handler references saas_instance_id");
  }

  // 4c. Verify agent memory has division scope
  const { data: divMemory } = await supabase
    .from("agent_memory")
    .select("id, agent_id, memory_scope")
    .eq("memory_scope", "division")
    .like("agent_id", "d8_%")
    .limit(1);
  if (divMemory && divMemory.length > 0) {
    assert(true, "D8 agents have division-scoped memory entries");
  } else {
    skip("Division memory check", "No D8 memory entries yet (run migration first)");
  }
}

// ════════════════════════════════════════════════════════════════
// TEST 5: Escalation Chain Validation
// ════════════════════════════════════════════════════════════════
async function test5_escalationChain() {
  log("\n═══ Test 5: D8 Escalation Chain ═══", "cyan");

  // 5a. Verify all 13 D8 agents are registered
  const { data: d8Agents } = await supabase
    .from("agents")
    .select("agent_id, config")
    .eq("org_unit", "division_8_saas_operations");

  assert(d8Agents?.length === 13, `All 13 D8 agents registered (found ${d8Agents?.length || 0})`);

  // 5b. Verify escalation chain: specialist → manager → director → CEO
  if (d8Agents) {
    const agentMap = Object.fromEntries(d8Agents.map(a => [a.agent_id, a.config]));

    // Check specialist reports_to manager
    const funnelConfig = agentMap["d8_funnel_engineer"];
    assert(
      funnelConfig?.reports_to === "d8_platform_architect",
      "d8_funnel_engineer escalates to d8_platform_architect"
    );

    // Check manager reports_to director
    const platformConfig = agentMap["d8_platform_architect"];
    assert(
      platformConfig?.reports_to === "d8_saas_director",
      "d8_platform_architect escalates to d8_saas_director"
    );

    // Check director reports_to master orchestrator
    const directorConfig = agentMap["d8_saas_director"];
    assert(
      directorConfig?.reports_to === "shared_master_orchestrator",
      "d8_saas_director escalates to shared_master_orchestrator"
    );
  }

  // 5c. Verify communication map includes D8
  const commMapPath = join(OPENCLAW_ROOT, "agent_communication_map.md");
  if (existsSync(commMapPath)) {
    const commMap = readFileSync(commMapPath, "utf-8");
    assert(commMap.includes("Division 8"), "Communication map includes Division 8");
    assert(commMap.includes("d8_saas_director"), "Communication map includes d8_saas_director");
    assert(commMap.includes("90-Agent"), "Communication map updated to 90-Agent");
  }

  // 5d. Verify cross-division wiring in communication map
  if (existsSync(commMapPath)) {
    const commMap = readFileSync(commMapPath, "utf-8");
    assert(commMap.includes("D8_DIR --> D1_CEO"), "D8 → D1 CEO escalation wired");
    assert(commMap.includes("D8_CA --> SH_LC"), "D8 Compliance → Shared Legal wired");
    assert(commMap.includes("D8_CO --> D5_PUB"), "D8 Content → D5 Publisher wired");
  }
}

// ════════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════════

const tests = [
  { id: 1, name: "New SaaS Client Flow", fn: test1_newSaaSClientFlow },
  { id: 2, name: "Payment Failure Flow", fn: test2_paymentFailureFlow },
  { id: 3, name: "Funnel Build Flow", fn: test3_funnelBuildFlow },
  { id: 4, name: "Multi-SaaS Isolation", fn: test4_multiSaaSIsolation },
  { id: 5, name: "Escalation Chain", fn: test5_escalationChain },
];

log("\n╔══════════════════════════════════════════════════════════════╗", "cyan");
log("║     Division 8 — SaaS Operations Integration Tests         ║", "cyan");
log("╚══════════════════════════════════════════════════════════════╝", "cyan");

if (dryRun) log("  🏃 DRY RUN MODE — no events dispatched\n", "yellow");

for (const test of tests) {
  if (testFilter && test.id !== testFilter) continue;
  try {
    await test.fn();
  } catch (error) {
    log(`  💥 Test ${test.id} crashed: ${error.message}`, "red");
    failed++;
  }
}

log("\n═══════════════════════════════════════════════", "cyan");
log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`, passed > 0 && failed === 0 ? "green" : "red");
log("═══════════════════════════════════════════════\n", "cyan");

process.exit(failed > 0 ? 1 : 0);
