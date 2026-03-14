#!/usr/bin/env node
/**
 * OpenClaw Anomaly Detection System
 * 
 * Features:
 *   - Rolling baseline calculation (14-day average + std dev)
 *   - Z-score computation for key metrics
 *   - Threshold alerts (>2σ deviation)
 *   - Auto-investigation of failure patterns
 *   - Historical anomaly tracking
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';

const execAsync = promisify(exec);

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const METRICS_FILE = path.join(DATA_DIR, 'anomaly-metrics.json');
const ANOMALIES_FILE = path.join(DATA_DIR, 'anomalies.json');

const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Detection configuration
const CONFIG = {
  baselineDays: 14,           // Days for rolling baseline
  zScoreThreshold: 2.0,       // Standard deviations for alert
  criticalThreshold: 3.0,     // Critical alert threshold
  minDataPoints: 5            // Minimum days for valid baseline
};

// Metrics to monitor
const MONITORED_METRICS = [
  { id: 'new_leads', name: 'New Leads', direction: 'both' },
  { id: 'scorecard_completions', name: 'Scorecard Completions', direction: 'both' },
  { id: 'ebook_purchases', name: 'eBook Purchases', direction: 'both' },
  { id: 'course_purchases', name: 'Course Purchases', direction: 'both' },
  { id: 'cart_abandonment_rate', name: 'Cart Abandonment Rate', direction: 'up' },
  { id: 'email_open_rate', name: 'Email Open Rate', direction: 'down' },
  { id: 'conversion_rate', name: 'Lead Conversion Rate', direction: 'down' }
];

/**
 * Make GHL API request
 */
function ghlRequest(method, urlPath) {
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
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Send Telegram alert
 */
async function sendAlert(message, critical = false) {
  try {
    const prefix = critical ? '🚨 CRITICAL' : '⚠️';
    const escaped = `${prefix} ${message}`.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await execAsync(`openclaw send --agent support --channel telegram --to ${TELEGRAM_CHAT_ID} "${escaped}"`);
    return true;
  } catch {
    console.error('Failed to send alert');
    return false;
  }
}

/**
 * Load metrics history
 */
async function loadMetricsHistory() {
  try {
    const data = await fs.readFile(METRICS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      metrics: {},
      lastUpdated: null
    };
  }
}

/**
 * Save metrics history
 */
async function saveMetricsHistory(history) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  history.lastUpdated = new Date().toISOString();
  await fs.writeFile(METRICS_FILE, JSON.stringify(history, null, 2));
}

/**
 * Load anomalies log
 */
async function loadAnomalies() {
  try {
    const data = await fs.readFile(ANOMALIES_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      anomalies: [],
      totalDetected: 0,
      lastCheck: null
    };
  }
}

/**
 * Save anomalies log
 */
async function saveAnomalies(log) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  log.lastCheck = new Date().toISOString();
  await fs.writeFile(ANOMALIES_FILE, JSON.stringify(log, null, 2));
}

/**
 * Calculate mean of array
 */
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate standard deviation
 */
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Calculate Z-score
 */
function zScore(value, avg, std) {
  if (std === 0) return 0;
  return (value - avg) / std;
}

/**
 * Collect current metrics from GHL
 */
async function collectCurrentMetrics() {
  console.log('\n📊 Collecting current metrics...\n');
  
  const today = new Date().toISOString().split('T')[0];
  const metrics = {};
  
  // Count contacts by tag
  const tags = [
    { tag: 'lead', metric: 'new_leads' },
    { tag: 'scorecard-complete', metric: 'scorecard_completions' },
    { tag: 'ebook-buyer', metric: 'ebook_purchases' },
    { tag: 'course-buyer', metric: 'course_purchases' }
  ];
  
  for (const { tag, metric } of tags) {
    try {
      const response = await ghlRequest('GET', 
        `/contacts/?locationId=${GHL_LOCATION_ID}&tags=${tag}&limit=1`
      );
      metrics[metric] = response.meta?.total || 0;
      console.log(`  ${metric}: ${metrics[metric]}`);
    } catch (error) {
      console.error(`  ❌ ${metric}: ${error.message}`);
      metrics[metric] = null;
    }
  }
  
  // Calculate rates
  if (metrics.new_leads && metrics.ebook_purchases) {
    metrics.conversion_rate = (metrics.ebook_purchases / metrics.new_leads * 100).toFixed(1);
  }
  
  // Get abandoned cart data
  try {
    const cartData = await fs.readFile(path.join(DATA_DIR, 'abandoned-carts.json'), 'utf8');
    const carts = JSON.parse(cartData);
    const pending = carts.carts?.filter(c => c.status === 'pending').length || 0;
    const total = carts.carts?.length || 1;
    metrics.cart_abandonment_rate = ((pending / total) * 100).toFixed(1);
  } catch {
    metrics.cart_abandonment_rate = 0;
  }
  
  console.log(`  cart_abandonment_rate: ${metrics.cart_abandonment_rate}%`);
  console.log(`  conversion_rate: ${metrics.conversion_rate || 0}%`);
  
  return { date: today, metrics };
}

/**
 * Update rolling baseline
 */
async function updateBaseline(currentMetrics) {
  const history = await loadMetricsHistory();
  const today = currentMetrics.date;
  
  // Initialize or update each metric
  for (const [metricId, value] of Object.entries(currentMetrics.metrics)) {
    if (value === null) continue;
    
    if (!history.metrics[metricId]) {
      history.metrics[metricId] = {
        history: [],
        baseline: { mean: 0, stdDev: 0 }
      };
    }
    
    const metric = history.metrics[metricId];
    
    // Add today's value (prevent duplicates)
    const existingIndex = metric.history.findIndex(h => h.date === today);
    if (existingIndex >= 0) {
      metric.history[existingIndex].value = parseFloat(value);
    } else {
      metric.history.push({ date: today, value: parseFloat(value) });
    }
    
    // Keep only last CONFIG.baselineDays
    metric.history = metric.history
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, CONFIG.baselineDays);
    
    // Calculate baseline
    const values = metric.history.map(h => h.value);
    metric.baseline = {
      mean: mean(values),
      stdDev: stdDev(values),
      dataPoints: values.length
    };
  }
  
  await saveMetricsHistory(history);
  return history;
}

/**
 * Detect anomalies
 */
async function detectAnomalies(currentMetrics) {
  const history = await loadMetricsHistory();
  const anomaliesLog = await loadAnomalies();
  const detected = [];
  
  console.log('\n🔍 Checking for anomalies...\n');
  
  for (const metricConfig of MONITORED_METRICS) {
    const metricId = metricConfig.id;
    const currentValue = parseFloat(currentMetrics.metrics[metricId]);
    
    if (isNaN(currentValue) || !history.metrics[metricId]) continue;
    
    const baseline = history.metrics[metricId].baseline;
    
    // Need minimum data points for valid detection
    if (baseline.dataPoints < CONFIG.minDataPoints) {
      console.log(`  ${metricConfig.name}: Insufficient data (${baseline.dataPoints}/${CONFIG.minDataPoints})`);
      continue;
    }
    
    const z = zScore(currentValue, baseline.mean, baseline.stdDev);
    const absZ = Math.abs(z);
    
    // Check direction-specific thresholds
    let isAnomaly = false;
    let direction = '';
    
    if (metricConfig.direction === 'both') {
      isAnomaly = absZ >= CONFIG.zScoreThreshold;
      direction = z > 0 ? 'HIGH' : 'LOW';
    } else if (metricConfig.direction === 'up' && z >= CONFIG.zScoreThreshold) {
      isAnomaly = true;
      direction = 'HIGH';
    } else if (metricConfig.direction === 'down' && z <= -CONFIG.zScoreThreshold) {
      isAnomaly = true;
      direction = 'LOW';
    }
    
    const status = isAnomaly ? (absZ >= CONFIG.criticalThreshold ? '🚨' : '⚠️') : '✅';
    
    console.log(
      `  ${status} ${metricConfig.name.padEnd(25)} ` +
      `Current: ${currentValue} | ` +
      `Baseline: ${baseline.mean.toFixed(1)} ± ${baseline.stdDev.toFixed(1)} | ` +
      `Z: ${z.toFixed(2)}`
    );
    
    if (isAnomaly) {
      const anomaly = {
        id: `anomaly-${Date.now()}-${metricId}`,
        metricId,
        metricName: metricConfig.name,
        detectedAt: new Date().toISOString(),
        currentValue,
        baselineMean: baseline.mean,
        baselineStdDev: baseline.stdDev,
        zScore: z,
        direction,
        severity: absZ >= CONFIG.criticalThreshold ? 'critical' : 'warning',
        status: 'active',
        investigation: null
      };
      
      detected.push(anomaly);
      anomaliesLog.anomalies.push(anomaly);
      anomaliesLog.totalDetected++;
    }
  }
  
  // Keep only last 100 anomalies
  anomaliesLog.anomalies = anomaliesLog.anomalies.slice(-100);
  await saveAnomalies(anomaliesLog);
  
  return detected;
}

/**
 * Investigate anomaly causes
 */
async function investigateAnomaly(anomaly) {
  console.log(`\n🔬 Investigating: ${anomaly.metricName}...\n`);
  
  const findings = [];
  
  // Check GHL API health
  const apiStartTime = Date.now();
  try {
    await ghlRequest('GET', `/contacts/?locationId=${GHL_LOCATION_ID}&limit=1`);
    const apiTime = Date.now() - apiStartTime;
    
    if (apiTime > 5000) {
      findings.push(`GHL API slow response: ${apiTime}ms`);
    } else {
      findings.push(`GHL API healthy: ${apiTime}ms`);
    }
  } catch (error) {
    findings.push(`GHL API error: ${error.message}`);
  }
  
  // Check webhook health
  try {
    const webhookStats = await fs.readFile(
      path.join(DATA_DIR, 'webhook-delivery-stats.json'), 'utf8'
    );
    const stats = JSON.parse(webhookStats);
    const successRate = stats.totalAttempts > 0 
      ? (stats.successCount / stats.totalAttempts * 100).toFixed(1)
      : 100;
    
    if (parseFloat(successRate) < 95) {
      findings.push(`Webhook delivery degraded: ${successRate}% success`);
    } else {
      findings.push(`Webhook delivery healthy: ${successRate}% success`);
    }
  } catch {
    findings.push('Webhook stats unavailable');
  }
  
  // Check for specific metric patterns
  if (anomaly.direction === 'LOW') {
    if (['new_leads', 'scorecard_completions'].includes(anomaly.metricId)) {
      findings.push('Possible causes: Traffic drop, form issue, landing page down');
      findings.push('Recommended: Check Google Analytics, verify form submissions');
    }
    if (anomaly.metricId === 'conversion_rate') {
      findings.push('Possible causes: Offer change, pricing issue, competitor activity');
      findings.push('Recommended: Review recent funnel changes, check competitor pricing');
    }
  }
  
  if (anomaly.direction === 'HIGH') {
    if (anomaly.metricId === 'cart_abandonment_rate') {
      findings.push('Possible causes: Payment processor issue, checkout bug, price concern');
      findings.push('Recommended: Test checkout flow, verify Stripe/payment status');
    }
  }
  
  return findings;
}

/**
 * Run anomaly check
 */
async function runAnomalyCheck() {
  console.log('\n' + '═'.repeat(60));
  console.log('🔍 ANOMALY DETECTION CHECK');
  console.log('═'.repeat(60));
  console.log(`Date: ${new Date().toLocaleString()}`);
  console.log(`Baseline Period: ${CONFIG.baselineDays} days`);
  console.log(`Alert Threshold: ${CONFIG.zScoreThreshold}σ`);
  
  // Collect current metrics
  const currentMetrics = await collectCurrentMetrics();
  
  // Update baseline
  await updateBaseline(currentMetrics);
  
  // Detect anomalies
  const detected = await detectAnomalies(currentMetrics);
  
  // If anomalies found, investigate and alert
  if (detected.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log(`🚨 ${detected.length} ANOMALIES DETECTED\n`);
    
    for (const anomaly of detected) {
      const findings = await investigateAnomaly(anomaly);
      
      // Update anomaly with investigation
      const anomaliesLog = await loadAnomalies();
      const idx = anomaliesLog.anomalies.findIndex(a => a.id === anomaly.id);
      if (idx >= 0) {
        anomaliesLog.anomalies[idx].investigation = {
          completedAt: new Date().toISOString(),
          findings
        };
        await saveAnomalies(anomaliesLog);
      }
      
      // Send alert
      const alertMsg = 
        `${anomaly.metricName} ANOMALY\n\n` +
        `Current: ${anomaly.currentValue}\n` +
        `Expected: ${anomaly.baselineMean.toFixed(1)} ± ${anomaly.baselineStdDev.toFixed(1)}\n` +
        `Direction: ${anomaly.direction}\n` +
        `Z-Score: ${anomaly.zScore.toFixed(2)}σ\n\n` +
        `Investigation:\n${findings.join('\n')}`;
      
      await sendAlert(alertMsg, anomaly.severity === 'critical');
    }
  } else {
    console.log('\n✅ No anomalies detected');
  }
  
  console.log('\n' + '═'.repeat(60));
  
  return detected;
}

/**
 * View anomaly history
 */
async function viewAnomalyHistory(days = 7) {
  const anomaliesLog = await loadAnomalies();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  const recent = anomaliesLog.anomalies.filter(
    a => new Date(a.detectedAt) >= cutoff
  );
  
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 ANOMALY HISTORY (Last ${days} days)`);
  console.log('═'.repeat(60));
  console.log(`Total in period: ${recent.length}`);
  console.log(`Total all time: ${anomaliesLog.totalDetected}\n`);
  
  if (recent.length === 0) {
    console.log('No anomalies in this period.\n');
    return;
  }
  
  // Group by metric
  const byMetric = {};
  for (const anomaly of recent) {
    byMetric[anomaly.metricName] = byMetric[anomaly.metricName] || [];
    byMetric[anomaly.metricName].push(anomaly);
  }
  
  for (const [metric, anomalies] of Object.entries(byMetric)) {
    console.log(`\n${metric}:`);
    for (const a of anomalies.slice(0, 5)) {
      const date = new Date(a.detectedAt).toLocaleString();
      console.log(`  ${a.severity === 'critical' ? '🚨' : '⚠️'} ${date} | ${a.direction} | Z: ${a.zScore.toFixed(2)}`);
    }
    if (anomalies.length > 5) {
      console.log(`  ... and ${anomalies.length - 5} more`);
    }
  }
  
  console.log('');
}

/**
 * View current baselines
 */
async function viewBaselines() {
  const history = await loadMetricsHistory();
  
  console.log('\n' + '═'.repeat(60));
  console.log('📈 CURRENT BASELINES');
  console.log('═'.repeat(60));
  console.log(`Last Updated: ${history.lastUpdated || 'Never'}\n`);
  
  console.log('Metric'.padEnd(30) + 'Mean'.padStart(10) + 'Std Dev'.padStart(10) + 'Data Points'.padStart(12));
  console.log('─'.repeat(62));
  
  for (const config of MONITORED_METRICS) {
    const metric = history.metrics[config.id];
    if (metric) {
      console.log(
        config.name.padEnd(30) +
        metric.baseline.mean.toFixed(1).padStart(10) +
        metric.baseline.stdDev.toFixed(1).padStart(10) +
        metric.baseline.dataPoints.toString().padStart(12)
      );
    } else {
      console.log(config.name.padEnd(30) + 'No data'.padStart(32));
    }
  }
  
  console.log('');
}

/**
 * Reset all data (for testing)
 */
async function resetAll() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(METRICS_FILE, JSON.stringify({ metrics: {}, lastUpdated: null }, null, 2));
  await fs.writeFile(ANOMALIES_FILE, JSON.stringify({ anomalies: [], totalDetected: 0, lastCheck: null }, null, 2));
  console.log('✅ All anomaly data reset');
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'check':
  case 'detect':
  case 'run':
    runAnomalyCheck();
    break;
    
  case 'history':
    viewAnomalyHistory(parseInt(args[0]) || 7);
    break;
    
  case 'baselines':
  case 'baseline':
    viewBaselines();
    break;
    
  case 'reset':
    resetAll();
    break;
    
  default:
    console.log(`
Anomaly Detection System

Usage:
  anomaly-detection.mjs check           - Run anomaly detection
  anomaly-detection.mjs history [days]  - View anomaly history
  anomaly-detection.mjs baselines       - View current baselines
  anomaly-detection.mjs reset           - Reset all data (testing)

Monitored Metrics:
  - New leads (daily)
  - Scorecard completions
  - eBook purchases
  - Course purchases
  - Cart abandonment rate (alert on increase)
  - Email open rate (alert on decrease)
  - Conversion rate (alert on decrease)

Configuration:
  Baseline Period: ${CONFIG.baselineDays} days
  Alert Threshold: ${CONFIG.zScoreThreshold}σ
  Critical Threshold: ${CONFIG.criticalThreshold}σ
`);
}

export { runAnomalyCheck, detectAnomalies, viewBaselines };
