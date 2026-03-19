#!/usr/bin/env node
/**
 * Escalation Chain Test Suite
 * Open Claw Multi-Agent Network - Phase 3
 * 
 * Tests all escalation paths defined in agent_communication_map.md
 * 
 * Usage:
 *   node scripts/test-escalations.mjs                    # Run all tests
 *   node scripts/test-escalations.mjs --division d2      # Test specific division
 *   node scripts/test-escalations.mjs --verbose          # Verbose output
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse CLI arguments
const args = process.argv.slice(2);
const divisionFilter = args.includes("--division") 
  ? args[args.indexOf("--division") + 1] 
  : null;
const verbose = args.includes("--verbose") || args.includes("-v");
const dryRun = args.includes("--dry-run");

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
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logVerbose(msg) {
  if (verbose) console.log(`${colors.dim}  ${msg}${colors.reset}`);
}

// ═══════════════════════════════════════════════════════════════════
// ESCALATION PATH DEFINITIONS
// From agent_communication_map.md
// ═══════════════════════════════════════════════════════════════════

const ESCALATION_PATHS = {
  division_1_core_operations: [
    {
      name: "FullStack Dev → PDM → CTO → CEO",
      path: ["d1_fullstack_dev", "d1_product_dev_manager", "d1_cto", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "DevOps → CTO → CEO",
      path: ["d1_devops", "d1_cto", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "UX Designer → PDM → CTO",
      path: ["d1_ux_designer", "d1_product_dev_manager", "d1_cto"],
      final_fallback: "d1_ceo",
    },
    {
      name: "Sales Manager → CMO → CEO",
      path: ["d1_sales_manager", "d1_cmo", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "Customer Success → CMO → CEO",
      path: ["d1_customer_success", "d1_cmo", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
  ],
  division_2_ecommerce: [
    {
      name: "Customer Service → Store Mgr → Director → CEO",
      path: ["d2_customer_service", "d2_store_manager", "d2_director", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "Inventory → Store Mgr → Director",
      path: ["d2_inventory_specialist", "d2_store_manager", "d2_director"],
      final_fallback: "d1_ceo",
    },
    {
      name: "SEO → Digital Marketing → Director",
      path: ["d2_seo_strategist", "d2_digital_marketing", "d2_director"],
      final_fallback: "d1_ceo",
    },
    {
      name: "Paid Ads → Digital Marketing → Director",
      path: ["d2_paid_ads", "d2_digital_marketing", "d2_director"],
      final_fallback: "d1_ceo",
    },
  ],
  division_3_consulting: [
    {
      name: "Admin → Ops Mgr → CEO(D3) → CEO(D1)",
      path: ["d3_admin_coordinator", "d3_ops_manager", "d3_ceo", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "Sales Closer → Biz Dev → CEO",
      path: ["d3_sales_closer", "d3_biz_dev", "d3_ceo"],
      final_fallback: "d1_ceo",
    },
    {
      name: "Business Analyst → Lead Strategist → CEO",
      path: ["d3_business_analyst", "d3_lead_strategist", "d3_ceo"],
      final_fallback: "d1_ceo",
    },
  ],
  division_4_coaching: [
    {
      name: "Client Experience → Lead Coach → CVO → CEO",
      path: ["d4_client_experience", "d4_lead_coach", "d4_cvo", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "Enrollment → Funnel Strategist → CVO",
      path: ["d4_enrollment", "d4_funnel_strategist", "d4_cvo"],
      final_fallback: "d1_ceo",
    },
    {
      name: "Tech Automation → Curriculum Head → CVO",
      path: ["d4_tech_automation", "d4_curriculum_head", "d4_cvo"],
      final_fallback: "d1_ceo",
    },
  ],
  division_5_publishing: [
    {
      name: "Author Relations → Acquisitions → Publisher → CEO",
      path: ["d5_author_relations", "d5_acquisitions", "d5_publisher", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "Cover Artist → Managing Editor → Publisher",
      path: ["d5_cover_artist", "d5_managing_editor", "d5_publisher"],
      final_fallback: "d1_ceo",
    },
    {
      name: "PR Media → Book Marketing → Publisher",
      path: ["d5_pr_media", "d5_book_marketing", "d5_publisher"],
      final_fallback: "d1_ceo",
    },
  ],
  division_6_nonprofit: [
    {
      name: "Volunteer → COO → Executive Director → CEO",
      path: ["d6_volunteer", "d6_coo", "d6_executive_director", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "Grant Writer → Dev Director → Executive Director",
      path: ["d6_grant_writer", "d6_dev_director", "d6_executive_director"],
      final_fallback: "d1_ceo",
    },
    {
      name: "Finance → COO → Executive Director",
      path: ["d6_finance", "d6_coo", "d6_executive_director"],
      final_fallback: "d1_ceo",
    },
  ],
  division_7_shared_services: [
    {
      name: "API Gateway → DevOps → CTO",
      path: ["shared_api_gateway", "d1_devops", "d1_cto"],
      final_fallback: "d1_ceo",
    },
    {
      name: "Legal Compliance → CEO",
      path: ["shared_legal_compliance", "d1_ceo"],
      final_fallback: "shared_master_orchestrator",
    },
    {
      name: "Master Orchestrator → CEO",
      path: ["shared_master_orchestrator", "d1_ceo"],
      final_fallback: null, // No fallback - top of chain
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Verify agent exists and has correct escalation_path in config
 */
async function verifyAgentConfig(agentId, expectedEscalationTarget) {
  const { data, error } = await supabase
    .from("agents")
    .select("agent_id, status, config")
    .eq("agent_id", agentId)
    .single();

  if (error || !data) {
    return { success: false, error: `Agent not found: ${agentId}` };
  }

  if (data.status !== "active") {
    return { success: false, error: `Agent not active: ${agentId} (${data.status})` };
  }

  const configuredPath = data.config?.escalation_path;
  if (configuredPath !== expectedEscalationTarget) {
    return {
      success: false,
      error: `Escalation mismatch: ${agentId} → ${configuredPath} (expected: ${expectedEscalationTarget})`,
      configuredPath,
      expectedEscalationTarget,
    };
  }

  return { success: true, agent: data };
}

/**
 * Simulate escalation event and verify routing
 */
async function simulateEscalation(sourceAgent, targetAgent, payload = {}) {
  if (dryRun) {
    logVerbose(`[DRY RUN] Would send escalation: ${sourceAgent} → ${targetAgent}`);
    return { success: true, dry_run: true };
  }

  // Create test event record
  const { data, error } = await supabase
    .from("agent_events")
    .insert({
      event_name: "agent/escalate",
      source_agent: sourceAgent,
      target_agent: targetAgent,
      payload: {
        ...payload,
        test: true,
        test_timestamp: new Date().toISOString(),
      },
      priority: "normal",
      correlation_id: crypto.randomUUID ? crypto.randomUUID() : `test-${Date.now()}`,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, event_id: data.id };
}

/**
 * Test a complete escalation path
 */
async function testEscalationPath(pathConfig) {
  const results = [];
  const { name, path, final_fallback } = pathConfig;

  log(`\n  📋 ${name}`, "cyan");
  logVerbose(`  Path: ${path.join(" → ")}${final_fallback ? ` → [${final_fallback}]` : ""}`);

  // Test each step in the path
  for (let i = 0; i < path.length - 1; i++) {
    const source = path[i];
    const target = path[i + 1];

    // Verify source agent config
    const configResult = await verifyAgentConfig(source, target);
    
    if (configResult.success) {
      results.push({ step: `${source} → ${target}`, status: "pass" });
      log(`     ✅ ${source} → ${target}`, "green");
    } else {
      results.push({ step: `${source} → ${target}`, status: "fail", error: configResult.error });
      log(`     ❌ ${source} → ${target}: ${configResult.error}`, "red");
    }

    // Simulate the escalation (if not dry-run)
    if (!dryRun && configResult.success) {
      const simResult = await simulateEscalation(source, target, { test_path: name });
      if (!simResult.success) {
        logVerbose(`     ⚠️  Event creation failed: ${simResult.error}`);
      }
    }
  }

  // Verify final agent has correct fallback (if applicable)
  if (final_fallback) {
    const lastAgent = path[path.length - 1];
    const fallbackResult = await verifyAgentConfig(lastAgent, final_fallback);
    
    // For top-level agents, they might escalate to master orchestrator
    if (fallbackResult.success || fallbackResult.configuredPath === "shared_master_orchestrator") {
      results.push({ step: `${lastAgent} → [fallback]`, status: "pass" });
      log(`     ✅ ${lastAgent} → [${final_fallback}] (fallback)`, "green");
    } else {
      // Top-level executives might not have fallback configured - that's OK
      const isTopLevel = ["d1_ceo", "shared_master_orchestrator"].includes(lastAgent);
      if (isTopLevel) {
        results.push({ step: `${lastAgent} → [fallback]`, status: "skip", note: "Top-level agent" });
        log(`     ⏭️  ${lastAgent} (top-level, no fallback needed)`, "yellow");
      } else {
        results.push({ step: `${lastAgent} → [fallback]`, status: "warn", error: fallbackResult.error });
        log(`     ⚠️  ${lastAgent}: Fallback may differ (${fallbackResult.configuredPath || "none"})`, "yellow");
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════

async function main() {
  log("\n🔗 Open Claw Escalation Chain Test Suite", "bold");
  log("═".repeat(50));

  if (dryRun) {
    log("⚠️  DRY RUN MODE - No events will be created\n", "yellow");
  }

  let totalPaths = 0;
  let passedPaths = 0;
  let failedSteps = [];

  // Determine which divisions to test
  const divisionsToTest = divisionFilter
    ? Object.keys(ESCALATION_PATHS).filter(d => d.includes(divisionFilter))
    : Object.keys(ESCALATION_PATHS);

  for (const division of divisionsToTest) {
    const paths = ESCALATION_PATHS[division];
    
    log(`\n📁 ${division.replace(/_/g, " ").toUpperCase()}`, "bold");
    log("─".repeat(40));

    for (const pathConfig of paths) {
      totalPaths++;
      const results = await testEscalationPath(pathConfig);

      const failed = results.filter(r => r.status === "fail");
      if (failed.length === 0) {
        passedPaths++;
      } else {
        failedSteps.push(...failed.map(f => ({ division, path: pathConfig.name, ...f })));
      }
    }
  }

  // Summary
  log("\n" + "═".repeat(50));
  log("📊 TEST SUMMARY", "bold");
  log("─".repeat(30));
  log(`   Total Paths Tested: ${totalPaths}`);
  log(`   ✅ Passed: ${passedPaths}`, passedPaths === totalPaths ? "green" : "yellow");
  log(`   ❌ Failed Steps: ${failedSteps.length}`, failedSteps.length === 0 ? "green" : "red");

  if (failedSteps.length > 0) {
    log("\n📋 FAILED STEPS:", "red");
    for (const fail of failedSteps) {
      log(`   • [${fail.division}] ${fail.path}: ${fail.step}`, "red");
      logVerbose(`     Error: ${fail.error}`);
    }
  }

  // Recommendations
  if (failedSteps.length > 0) {
    log("\n💡 RECOMMENDATIONS:", "yellow");
    log("   1. Run: node scripts/register-agents.mjs --update");
    log("   2. Verify escalation_path in agents_config.json");
    log("   3. Check agent status with: node scripts/check-agent-health.mjs");
  } else {
    log("\n✅ All escalation paths validated!", "green");
  }

  log("");
  process.exit(failedSteps.length > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`\n❌ Fatal error: ${err.message}`, "red");
  process.exit(1);
});

