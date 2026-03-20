#!/usr/bin/env node
/**
 * OpenClaw A/B Test Engine
 *
 * Features:
 *   - Create and manage A/B experiments
 *   - Automatic variant assignment
 *   - Conversion tracking
 *   - Statistical significance calculation
 *   - Auto-winner selection
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { openclawSend } from '../lib/safe-exec.mjs';
import { resolve as resolveTenant } from '../lib/ghl-tenant-resolver.mjs';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const EXPERIMENTS_FILE = path.join(DATA_DIR, 'ab-experiments.json');

const { token: GHL_API_KEY, locationId: GHL_LOCATION_ID } = resolveTenant();
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Significance level (95% confidence)
const SIGNIFICANCE_LEVEL = 0.95;
const MIN_SAMPLE_SIZE = 100; // Minimum samples per variant before declaring winner

/**
 * Make GHL API request
 */
function ghlRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'services.leadconnectorhq.com',
      port: 443,
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Send Telegram notification
 */
async function sendNotification(message) {
  try {
    await openclawSend({ agent: 'main', channel: 'telegram', to: TELEGRAM_CHAT_ID, message });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load experiments
 */
async function loadExperiments() {
  try {
    const data = await fs.readFile(EXPERIMENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { experiments: {}, assignments: {} };
  }
}

/**
 * Save experiments
 */
async function saveExperiments(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(EXPERIMENTS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Calculate Z-score for A/B comparison
 */
function calculateZScore(conversionsA, samplesA, conversionsB, samplesB) {
  if (samplesA === 0 || samplesB === 0) return 0;

  const pA = conversionsA / samplesA;
  const pB = conversionsB / samplesB;
  const pPooled = (conversionsA + conversionsB) / (samplesA + samplesB);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1/samplesA + 1/samplesB));

  if (se === 0) return 0;
  return (pB - pA) / se;
}

/**
 * Get p-value from Z-score (two-tailed)
 */
function zScoreToPValue(z) {
  // Approximation using error function
  const absZ = Math.abs(z);
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const t = 1.0 / (1.0 + p * absZ / Math.sqrt(2));
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ / 2);
  return 2 * (1 - y); // two-tailed
}

/**
 * Create a new experiment
 */
async function createExperiment(name, variants, goalTag, description = '') {
  const data = await loadExperiments();

  const experimentId = `exp_${Date.now()}`;

  data.experiments[experimentId] = {
    id: experimentId,
    name,
    description,
    variants: variants.map((v, i) => ({
      id: `v${i}`,
      name: v,
      traffic: 1 / variants.length, // Equal traffic split
      conversions: 0,
      samples: 0
    })),
    goalTag,
    status: 'running',
    createdAt: new Date().toISOString(),
    winner: null,
    significanceReached: false
  };

  await saveExperiments(data);

  console.log(`\n✅ Experiment created: ${name} (${experimentId})`);
  console.log(`   Variants: ${variants.join(' vs ')}`);
  console.log(`   Goal: Tag with "${goalTag}"`);

  return data.experiments[experimentId];
}

/**
 * Assign contact to experiment variant
 */
async function assignVariant(experimentId, contactId) {
  const data = await loadExperiments();
  const experiment = data.experiments[experimentId];

  if (!experiment || experiment.status !== 'running') {
    return { error: 'Experiment not found or not running' };
  }

  // Check if already assigned
  const assignmentKey = `${experimentId}:${contactId}`;
  if (data.assignments[assignmentKey]) {
    return { variant: data.assignments[assignmentKey], existing: true };
  }

  // Weighted random assignment based on traffic split
  const rand = Math.random();
  let cumulative = 0;
  let assignedVariant = experiment.variants[0];

  for (const variant of experiment.variants) {
    cumulative += variant.traffic;
    if (rand <= cumulative) {
      assignedVariant = variant;
      break;
    }
  }

  // Record assignment
  data.assignments[assignmentKey] = assignedVariant.id;
  assignedVariant.samples++;

  await saveExperiments(data);

  // Add GHL tag for variant
  try {
    await ghlRequest('PUT', `/contacts/${contactId}`, {
      locationId: GHL_LOCATION_ID,
      tags: [`ab:${experiment.name}:${assignedVariant.name}`]
    });
  } catch {}

  return {
    experimentId,
    experimentName: experiment.name,
    variant: assignedVariant.id,
    variantName: assignedVariant.name,
    existing: false
  };
}

/**
 * Record conversion
 */
async function recordConversion(experimentId, contactId) {
  const data = await loadExperiments();
  const experiment = data.experiments[experimentId];

  if (!experiment) {
    return { error: 'Experiment not found' };
  }

  // Get assigned variant
  const assignmentKey = `${experimentId}:${contactId}`;
  const variantId = data.assignments[assignmentKey];

  if (!variantId) {
    return { error: 'Contact not assigned to this experiment' };
  }

  // Find variant and increment conversions
  const variant = experiment.variants.find(v => v.id === variantId);
  if (variant) {
    variant.conversions++;
    await saveExperiments(data);

    console.log(`  📊 Conversion recorded: ${experiment.name} / ${variant.name}`);

    return {
      experimentId,
      variantId,
      variantName: variant.name,
      conversions: variant.conversions,
      samples: variant.samples,
      rate: ((variant.conversions / variant.samples) * 100).toFixed(2)
    };
  }

  return { error: 'Variant not found' };
}

/**
 * Check experiment status and significance
 */
async function checkExperiment(experimentId, autoEnd = false) {
  const data = await loadExperiments();
  const experiment = data.experiments[experimentId];

  if (!experiment) {
    return { error: 'Experiment not found' };
  }

  const variants = experiment.variants;

  // Need at least 2 variants
  if (variants.length < 2) {
    return { error: 'Need at least 2 variants' };
  }

  // Calculate stats for each variant
  const stats = variants.map(v => ({
    ...v,
    rate: v.samples > 0 ? (v.conversions / v.samples) : 0,
    ratePercent: v.samples > 0 ? ((v.conversions / v.samples) * 100).toFixed(2) : '0.00'
  }));

  // Sort by conversion rate
  stats.sort((a, b) => b.rate - a.rate);

  // Calculate significance between top 2
  const A = stats[1]; // Control (lower rate)
  const B = stats[0]; // Treatment (higher rate)

  const zScore = calculateZScore(A.conversions, A.samples, B.conversions, B.samples);
  const pValue = zScoreToPValue(zScore);
  const isSignificant = pValue < (1 - SIGNIFICANCE_LEVEL) && A.samples >= MIN_SAMPLE_SIZE && B.samples >= MIN_SAMPLE_SIZE;

  const result = {
    experimentId,
    name: experiment.name,
    status: experiment.status,
    variants: stats,
    leader: B,
    zScore: zScore.toFixed(2),
    pValue: pValue.toFixed(4),
    confidence: ((1 - pValue) * 100).toFixed(1),
    isSignificant,
    minSampleReached: A.samples >= MIN_SAMPLE_SIZE && B.samples >= MIN_SAMPLE_SIZE,
    recommendation: isSignificant ? `${B.name} is the winner!` : 'Keep running - more data needed'
  };

  // Auto-end if significant
  if (autoEnd && isSignificant && experiment.status === 'running') {
    experiment.status = 'completed';
    experiment.winner = B.id;
    experiment.significanceReached = true;
    experiment.completedAt = new Date().toISOString();
    await saveExperiments(data);

    result.status = 'completed';
    result.autoEnded = true;

    // Send notification
    await sendNotification(
      `🏆 A/B Test Winner!\n\n` +
      `Experiment: ${experiment.name}\n` +
      `Winner: ${B.name}\n` +
      `Rate: ${B.ratePercent}% vs ${A.ratePercent}%\n` +
      `Confidence: ${result.confidence}%`
    );
  }

  return result;
}

/**
 * List all experiments
 */
async function listExperiments(statusFilter = null) {
  const data = await loadExperiments();

  console.log('\n' + '═'.repeat(70));
  console.log('🧪 A/B EXPERIMENTS');
  console.log('═'.repeat(70) + '\n');

  const experiments = Object.values(data.experiments);

  if (experiments.length === 0) {
    console.log('No experiments found. Create one with: ab-testing.mjs create');
    return;
  }

  const filtered = statusFilter
    ? experiments.filter(e => e.status === statusFilter)
    : experiments;

  for (const exp of filtered) {
    const statusIcon = exp.status === 'running' ? '🔄' : exp.status === 'completed' ? '✅' : '⏸️';
    console.log(`${statusIcon} ${exp.name} (${exp.id})`);
    console.log(`   Status: ${exp.status} | Goal: ${exp.goalTag}`);

    for (const v of exp.variants) {
      const rate = v.samples > 0 ? ((v.conversions / v.samples) * 100).toFixed(2) : '0.00';
      const winnerMark = exp.winner === v.id ? ' 🏆' : '';
      console.log(`   • ${v.name}: ${v.conversions}/${v.samples} (${rate}%)${winnerMark}`);
    }
    console.log('');
  }
}

/**
 * End experiment manually
 */
async function endExperiment(experimentId, winnerId = null) {
  const data = await loadExperiments();
  const experiment = data.experiments[experimentId];

  if (!experiment) {
    console.log('Experiment not found');
    return;
  }

  // Determine winner
  let winner = winnerId;
  if (!winner) {
    // Auto-select based on highest conversion rate
    const sorted = [...experiment.variants].sort((a, b) => {
      const rateA = a.samples > 0 ? a.conversions / a.samples : 0;
      const rateB = b.samples > 0 ? b.conversions / b.samples : 0;
      return rateB - rateA;
    });
    winner = sorted[0].id;
  }

  experiment.status = 'completed';
  experiment.winner = winner;
  experiment.completedAt = new Date().toISOString();

  await saveExperiments(data);

  const winnerVariant = experiment.variants.find(v => v.id === winner);
  console.log(`\n✅ Experiment ended: ${experiment.name}`);
  console.log(`   Winner: ${winnerVariant?.name || winner}`);

  return experiment;
}

/**
 * Show detailed experiment report
 */
async function showReport(experimentId) {
  const result = await checkExperiment(experimentId);

  if (result.error) {
    console.log(result.error);
    return;
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`🧪 EXPERIMENT REPORT: ${result.name}`);
  console.log('═'.repeat(60) + '\n');

  console.log(`Status: ${result.status}`);
  console.log(`ID: ${result.experimentId}\n`);

  console.log('Variant'.padEnd(20) + 'Conversions'.padStart(12) + 'Samples'.padStart(10) + 'Rate'.padStart(10));
  console.log('─'.repeat(52));

  for (const v of result.variants) {
    const leader = v.id === result.leader.id ? ' ⭐' : '';
    console.log(
      (v.name + leader).padEnd(20) +
      v.conversions.toString().padStart(12) +
      v.samples.toString().padStart(10) +
      `${v.ratePercent}%`.padStart(10)
    );
  }

  console.log('\n📊 STATISTICAL ANALYSIS:\n');
  console.log(`  Z-Score: ${result.zScore}`);
  console.log(`  P-Value: ${result.pValue}`);
  console.log(`  Confidence: ${result.confidence}%`);
  console.log(`  Significant: ${result.isSignificant ? '✅ YES' : '❌ NO'}`);
  console.log(`  Min Sample Reached: ${result.minSampleReached ? '✅ YES' : `❌ NO (need ${MIN_SAMPLE_SIZE} per variant)`}`);

  console.log(`\n💡 Recommendation: ${result.recommendation}`);
  console.log('\n' + '═'.repeat(60));
}

/**
 * Get variant for contact (for use in workflows)
 */
async function getContactVariant(experimentId, contactId) {
  const data = await loadExperiments();
  const assignmentKey = `${experimentId}:${contactId}`;

  if (data.assignments[assignmentKey]) {
    const experiment = data.experiments[experimentId];
    const variant = experiment?.variants.find(v => v.id === data.assignments[assignmentKey]);
    return {
      assigned: true,
      variantId: data.assignments[assignmentKey],
      variantName: variant?.name || 'Unknown'
    };
  }

  return { assigned: false };
}

/**
 * Run daily significance check on all running experiments
 */
async function dailyCheck() {
  const data = await loadExperiments();
  const running = Object.values(data.experiments).filter(e => e.status === 'running');

  console.log(`\n🔬 Checking ${running.length} running experiments...\n`);

  for (const exp of running) {
    const result = await checkExperiment(exp.id, true);
    console.log(`  ${exp.name}: ${result.isSignificant ? '🏆 Winner found!' : `${result.confidence}% confidence`}`);
  }

  console.log('\n✅ Daily check complete');
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'create':
    if (args.length < 3) {
      console.log('Usage: ab-testing.mjs create "<name>" "<goal-tag>" variant1 variant2 ...');
      console.log('Example: ab-testing.mjs create "Email Subject Test" "ebook-purchased" "Short Subject" "Long Subject"');
    } else {
      const name = args[0];
      const goalTag = args[1];
      const variants = args.slice(2);
      createExperiment(name, variants, goalTag);
    }
    break;

  case 'assign':
    if (args.length < 2) {
      console.log('Usage: ab-testing.mjs assign <experimentId> <contactId>');
    } else {
      assignVariant(args[0], args[1]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;

  case 'convert':
    if (args.length < 2) {
      console.log('Usage: ab-testing.mjs convert <experimentId> <contactId>');
    } else {
      recordConversion(args[0], args[1]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;

  case 'check':
    if (!args[0]) {
      console.log('Usage: ab-testing.mjs check <experimentId>');
    } else {
      checkExperiment(args[0], args[1] === '--auto').then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;

  case 'report':
    if (!args[0]) {
      console.log('Usage: ab-testing.mjs report <experimentId>');
    } else {
      showReport(args[0]);
    }
    break;

  case 'list':
    listExperiments(args[0]);
    break;

  case 'end':
    if (!args[0]) {
      console.log('Usage: ab-testing.mjs end <experimentId> [winnerId]');
    } else {
      endExperiment(args[0], args[1]);
    }
    break;

  case 'daily':
    dailyCheck();
    break;

  case 'get-variant':
    if (args.length < 2) {
      console.log('Usage: ab-testing.mjs get-variant <experimentId> <contactId>');
    } else {
      getContactVariant(args[0], args[1]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;

  default:
    console.log(`
A/B Test Engine

Usage:
  ab-testing.mjs create "<name>" "<goal>" v1 v2   - Create experiment
  ab-testing.mjs assign <expId> <contactId>       - Assign contact to variant
  ab-testing.mjs convert <expId> <contactId>      - Record conversion
  ab-testing.mjs check <expId> [--auto]           - Check significance
  ab-testing.mjs report <expId>                   - Show detailed report
  ab-testing.mjs list [status]                    - List experiments
  ab-testing.mjs end <expId> [winnerId]           - End experiment
  ab-testing.mjs daily                            - Run daily significance check
  ab-testing.mjs get-variant <expId> <contactId>  - Get assigned variant

Workflow Integration:
  1. Create experiment with variants
  2. Assign contacts when they enter the test
  3. Record conversions when goal is achieved
  4. Check significance periodically (or use daily cron)
  5. Auto-end declares winner at ${SIGNIFICANCE_LEVEL * 100}% confidence

Example:
  ab-testing.mjs create "CTA Test" "course-buyer" "Buy Now" "Get Started" "Join Today"
`);
}

export { createExperiment, assignVariant, recordConversion, checkExperiment, getContactVariant, dailyCheck };
