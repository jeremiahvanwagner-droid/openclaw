#!/usr/bin/env node
/**
 * Load Testing Script
 * OpenClaw Multi-Agent Network - Phase 3
 *
 * Stress tests the agent network with configurable workloads
 *
 * Usage:
 *   node scripts/load-test.mjs                      # Default: 100 events, 10 concurrent
 *   node scripts/load-test.mjs --events 500         # Custom event count
 *   node scripts/load-test.mjs --concurrent 50      # Custom concurrency
 *   node scripts/load-test.mjs --duration 60        # Run for 60 seconds
 *   node scripts/load-test.mjs --profile spike      # Use spike test profile
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://aagqvfwuixpxtdcrdxmv.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse CLI arguments
const args = process.argv.slice(2);
const getArg = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
};

const config = {
  events: parseInt(getArg("events", "100")),
  concurrent: parseInt(getArg("concurrent", "10")),
  duration: parseInt(getArg("duration", "0")), // 0 = event count mode
  profile: getArg("profile", "steady"), // steady, spike, ramp
  verbose: args.includes("--verbose") || args.includes("-v"),
};

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

// ═══════════════════════════════════════════════════════════════════
// TEST EVENT GENERATORS
// ═══════════════════════════════════════════════════════════════════

const AGENTS = [
  "d1_fullstack_dev", "d1_devops", "d1_ux_designer", "d1_sales_manager",
  "d2_customer_service", "d2_inventory_specialist", "d2_digital_marketing",
  "d3_business_analyst", "d3_sales_closer", "d3_lead_strategist",
  "d4_client_experience", "d4_enrollment", "d4_lead_coach",
  "d5_author_relations", "d5_cover_artist", "d5_book_marketing",
  "d6_volunteer", "d6_grant_writer", "d6_finance",
  "shared_api_gateway", "shared_analytics", "shared_legal_compliance",
];

const EVENT_TYPES = [
  "agent/task",
  "agent/query",
  "lead/created",
  "customer/inquiry",
  "product/listing-sync",
  "metrics/log",
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomEvent() {
  const eventType = randomChoice(EVENT_TYPES);
  const sourceAgent = randomChoice(AGENTS);
  const targetAgent = randomChoice(AGENTS.filter(a => a !== sourceAgent));

  return {
    event_name: eventType,
    source_agent: sourceAgent,
    target_agent: targetAgent,
    payload: {
      test: true,
      load_test: true,
      timestamp: new Date().toISOString(),
      data: {
        random_id: crypto.randomUUID ? crypto.randomUUID() : `test-${Date.now()}-${Math.random()}`,
        value: Math.random() * 1000,
        message: "Load test event",
      },
    },
    priority: randomChoice(["low", "normal", "normal", "normal", "high"]),
    correlation_id: crypto.randomUUID ? crypto.randomUUID() : `test-${Date.now()}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// LOAD TEST EXECUTION
// ═══════════════════════════════════════════════════════════════════

class LoadTestResults {
  constructor() {
    this.started = Date.now();
    this.completed = 0;
    this.failed = 0;
    this.latencies = [];
    this.errors = [];
  }

  recordSuccess(latencyMs) {
    this.completed++;
    this.latencies.push(latencyMs);
  }

  recordFailure(error) {
    this.failed++;
    this.errors.push(error);
  }

  getStats() {
    const duration = (Date.now() - this.started) / 1000;
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    
    return {
      total: this.completed + this.failed,
      completed: this.completed,
      failed: this.failed,
      duration_s: duration.toFixed(2),
      events_per_sec: (this.completed / duration).toFixed(2),
      success_rate: ((this.completed / (this.completed + this.failed)) * 100).toFixed(1),
      latency: {
        min: Math.min(...this.latencies).toFixed(0),
        max: Math.max(...this.latencies).toFixed(0),
        avg: (this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length).toFixed(0),
        p50: sortedLatencies[Math.floor(sortedLatencies.length * 0.5)]?.toFixed(0) || 0,
        p95: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)]?.toFixed(0) || 0,
        p99: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)]?.toFixed(0) || 0,
      },
    };
  }
}

async function sendEvent(event, results) {
  const start = Date.now();
  
  try {
    const { data, error } = await supabase
      .from("agent_events")
      .insert(event)
      .select("id")
      .single();

    if (error) {
      results.recordFailure(error.message);
      return false;
    }

    results.recordSuccess(Date.now() - start);
    return true;
  } catch (err) {
    results.recordFailure(err.message);
    return false;
  }
}

async function runBatch(batchSize, results) {
  const events = Array.from({ length: batchSize }, generateRandomEvent);
  const promises = events.map(event => sendEvent(event, results));
  await Promise.all(promises);
}

// ═══════════════════════════════════════════════════════════════════
// TEST PROFILES
// ═══════════════════════════════════════════════════════════════════

async function steadyLoadTest(results) {
  log(`\n📊 Running STEADY load test`, "cyan");
  log(`   Events: ${config.events}, Concurrency: ${config.concurrent}`);
  
  const batches = Math.ceil(config.events / config.concurrent);
  let processed = 0;

  for (let i = 0; i < batches; i++) {
    const batchSize = Math.min(config.concurrent, config.events - processed);
    await runBatch(batchSize, results);
    processed += batchSize;

    // Progress update every 10 batches
    if (i % 10 === 0 || i === batches - 1) {
      const progress = ((processed / config.events) * 100).toFixed(0);
      process.stdout.write(`\r   Progress: ${progress}% (${processed}/${config.events})`);
    }
  }
  console.log();
}

async function spikeLoadTest(results) {
  log(`\n📊 Running SPIKE load test`, "cyan");
  log(`   Pattern: Low → Spike → Low`);

  const phases = [
    { name: "Warm-up", events: 20, concurrent: 5 },
    { name: "Spike", events: 200, concurrent: 50 },
    { name: "Cool-down", events: 20, concurrent: 5 },
  ];

  for (const phase of phases) {
    log(`\n   ${phase.name} phase (${phase.events} events @ ${phase.concurrent} concurrent)`, "dim");
    const batches = Math.ceil(phase.events / phase.concurrent);
    
    for (let i = 0; i < batches; i++) {
      await runBatch(phase.concurrent, results);
    }
  }
}

async function rampLoadTest(results) {
  log(`\n📊 Running RAMP load test`, "cyan");
  log(`   Pattern: Gradual increase in concurrency`);

  const steps = [2, 5, 10, 20, 30, 40, 50];
  const eventsPerStep = Math.floor(config.events / steps.length);

  for (const concurrent of steps) {
    log(`\n   Concurrency: ${concurrent}`, "dim");
    const batches = Math.ceil(eventsPerStep / concurrent);
    
    for (let i = 0; i < batches; i++) {
      await runBatch(concurrent, results);
    }
    
    // Brief pause between steps
    await new Promise(r => setTimeout(r, 500));
  }
}

async function durationLoadTest(results) {
  log(`\n📊 Running DURATION load test`, "cyan");
  log(`   Duration: ${config.duration}s, Concurrency: ${config.concurrent}`);

  const startTime = Date.now();
  const endTime = startTime + (config.duration * 1000);
  let batchNum = 0;

  while (Date.now() < endTime) {
    await runBatch(config.concurrent, results);
    batchNum++;

    if (batchNum % 10 === 0) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const stats = results.getStats();
      process.stdout.write(`\r   Elapsed: ${elapsed}s | Events: ${stats.completed} | Rate: ${stats.events_per_sec}/s`);
    }
  }
  console.log();
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════

async function main() {
  log("\n🔥 OpenClaw Load Test Suite", "bold");
  log("═".repeat(50));
  log(`   Profile: ${config.profile}`);
  log(`   Events: ${config.events}`);
  log(`   Concurrency: ${config.concurrent}`);
  if (config.duration > 0) {
    log(`   Duration: ${config.duration}s`);
  }

  const results = new LoadTestResults();

  // Run appropriate test profile
  if (config.duration > 0) {
    await durationLoadTest(results);
  } else {
    switch (config.profile) {
      case "spike":
        await spikeLoadTest(results);
        break;
      case "ramp":
        await rampLoadTest(results);
        break;
      default:
        await steadyLoadTest(results);
    }
  }

  // Print results
  const stats = results.getStats();

  log("\n" + "═".repeat(50));
  log("📊 RESULTS", "bold");
  log("─".repeat(30));
  log(`   Total Events:    ${stats.total}`);
  log(`   ✅ Completed:    ${stats.completed}`, "green");
  log(`   ❌ Failed:       ${stats.failed}`, stats.failed > 0 ? "red" : "reset");
  log(`   Success Rate:    ${stats.success_rate}%`);
  log(`   Duration:        ${stats.duration_s}s`);
  log(`   Throughput:      ${stats.events_per_sec} events/sec`);
  
  log("\n📏 LATENCY (ms)", "bold");
  log("─".repeat(30));
  log(`   Min:   ${stats.latency.min}ms`);
  log(`   Avg:   ${stats.latency.avg}ms`);
  log(`   Max:   ${stats.latency.max}ms`);
  log(`   p50:   ${stats.latency.p50}ms`);
  log(`   p95:   ${stats.latency.p95}ms`);
  log(`   p99:   ${stats.latency.p99}ms`);

  // Recommendations
  log("\n💡 ANALYSIS", "bold");
  log("─".repeat(30));
  
  if (parseFloat(stats.success_rate) < 99) {
    log(`   ⚠️  Success rate below 99% - investigate failures`, "yellow");
  } else {
    log(`   ✅ Success rate excellent (${stats.success_rate}%)`, "green");
  }

  if (parseInt(stats.latency.p95) > 1000) {
    log(`   ⚠️  p95 latency high (${stats.latency.p95}ms) - consider optimization`, "yellow");
  } else {
    log(`   ✅ Latency within acceptable range`, "green");
  }

  if (parseFloat(stats.events_per_sec) < 50) {
    log(`   ℹ️  Throughput: ${stats.events_per_sec}/s - baseline established`, "cyan");
  } else {
    log(`   ✅ High throughput achieved (${stats.events_per_sec}/s)`, "green");
  }

  // Clean up test events
  log("\n🧹 Cleaning up test events...", "dim");
  const { error: cleanupError } = await supabase
    .from("agent_events")
    .delete()
    .eq("payload->>load_test", "true");

  if (cleanupError) {
    log(`   ⚠️  Cleanup failed: ${cleanupError.message}`, "yellow");
  } else {
    log(`   ✅ Test events removed`, "green");
  }

  log("");
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`\n❌ Fatal error: ${err.message}`, "red");
  process.exit(1);
});
