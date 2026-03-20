#!/usr/bin/env node
/**
 * OpenClaw Self-Healing Webhook System
 * 
 * Features:
 *   - Exponential backoff retry logic (1s → 2s → 4s → 8s → 16s max)
 *   - Dead-letter queue for persistent failures
 *   - Delivery tracking and health metrics
 *   - Auto-investigation of failure patterns
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { openclawSend } from '../lib/safe-exec.mjs';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const DEAD_LETTER_FILE = path.join(DATA_DIR, 'dead-letter-queue.json');
const DELIVERY_STATS_FILE = path.join(DATA_DIR, 'webhook-delivery-stats.json');
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 1000,          // 1 second
  maxDelayMs: 16000,          // 16 seconds
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
};

// Dead letter queue thresholds
const DLQ_ALERT_THRESHOLD = 10;  // Alert when queue exceeds this

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt) {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load or initialize delivery stats
 */
async function loadDeliveryStats() {
  try {
    const data = await fs.readFile(DELIVERY_STATS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      byEventType: {},
      byEndpoint: {},
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Save delivery stats
 */
async function saveDeliveryStats(stats) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  stats.lastUpdated = new Date().toISOString();
  await fs.writeFile(DELIVERY_STATS_FILE, JSON.stringify(stats, null, 2));
}

/**
 * Load dead letter queue
 */
async function loadDeadLetterQueue() {
  try {
    const data = await fs.readFile(DEAD_LETTER_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      entries: [],
      totalProcessed: 0,
      totalRecovered: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Save dead letter queue (with file size rotation)
 */
async function saveDeadLetterQueue(dlq) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  dlq.lastUpdated = new Date().toISOString();
  const content = JSON.stringify(dlq, null, 2);

  // Check if file would exceed 100 MB — rotate if so
  const DLQ_MAX_SIZE = 100 * 1024 * 1024;
  try {
    const stat = await fs.stat(DEAD_LETTER_FILE);
    if (stat.size >= DLQ_MAX_SIZE) {
      await rotateDLQ();
    }
  } catch {
    // File doesn't exist yet — that's fine
  }

  await fs.writeFile(DEAD_LETTER_FILE, content);
}

/**
 * Rotate the DLQ file: rename current → timestamped .old, prune excess files
 */
async function rotateDLQ() {
  const MAX_ROTATED = 3;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rotatedPath = path.join(DATA_DIR, `dead-letter-queue-${timestamp}.jsonl.old`);

  try {
    await fs.rename(DEAD_LETTER_FILE, rotatedPath);
  } catch {
    // If rename fails, just overwrite
    return;
  }

  // Prune excess rotated files (keep only MAX_ROTATED)
  try {
    const files = await fs.readdir(DATA_DIR);
    const rotatedFiles = files
      .filter(f => f.startsWith('dead-letter-queue-') && f.endsWith('.old'))
      .sort()
      .reverse();

    for (const old of rotatedFiles.slice(MAX_ROTATED)) {
      await fs.unlink(path.join(DATA_DIR, old));
    }
  } catch {
    // Pruning failure is non-fatal
  }
}

/**
 * Add entry to dead letter queue
 */
async function addToDeadLetterQueue(entry) {
  const dlq = await loadDeadLetterQueue();
  
  dlq.entries.push({
    id: `dlq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...entry,
    addedAt: new Date().toISOString(),
    retryCount: 0,
    status: 'pending'
  });
  
  dlq.totalProcessed++;
  await saveDeadLetterQueue(dlq);
  
  // Check if we need to alert
  const pendingCount = dlq.entries.filter(e => e.status === 'pending').length;
  if (pendingCount >= DLQ_ALERT_THRESHOLD) {
    await sendAlert(`⚠️ Dead Letter Queue Alert: ${pendingCount} failed webhooks pending review`);
  }
  
  return dlq.entries[dlq.entries.length - 1];
}

/**
 * Send Telegram alert
 */
async function sendAlert(message) {
  try {
    await openclawSend({ agent: 'support', channel: 'telegram', to: TELEGRAM_CHAT_ID, message });
    return true;
  } catch {
    console.error('Failed to send alert:', message);
    return false;
  }
}

/**
 * Execute webhook with retry logic
 * This wraps any async webhook handler function
 */
async function executeWithRetry(handler, payload, context = {}) {
  const stats = await loadDeliveryStats();
  const eventType = context.eventType || 'unknown';
  const endpoint = context.endpoint || 'internal';
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    stats.totalAttempts++;
    
    if (attempt > 0) {
      stats.retryCount++;
      const delay = calculateBackoff(attempt - 1);
      console.log(`  ↻ Retry ${attempt}/${RETRY_CONFIG.maxRetries} after ${delay}ms delay...`);
      await sleep(delay);
    }
    
    try {
      const result = await handler(payload);
      
      // Success
      stats.successCount++;
      stats.byEventType[eventType] = stats.byEventType[eventType] || { success: 0, failure: 0 };
      stats.byEventType[eventType].success++;
      stats.byEndpoint[endpoint] = stats.byEndpoint[endpoint] || { success: 0, failure: 0 };
      stats.byEndpoint[endpoint].success++;
      
      await saveDeliveryStats(stats);
      
      return {
        success: true,
        attempts: attempt + 1,
        result
      };
      
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const statusCode = error.statusCode || error.status || 0;
      const isRetryable = RETRY_CONFIG.retryableStatusCodes.includes(statusCode) ||
                          error.code === 'ECONNRESET' ||
                          error.code === 'ETIMEDOUT' ||
                          error.code === 'ENOTFOUND';
      
      if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
        // Permanent failure - add to dead letter queue
        stats.failureCount++;
        stats.byEventType[eventType] = stats.byEventType[eventType] || { success: 0, failure: 0 };
        stats.byEventType[eventType].failure++;
        stats.byEndpoint[endpoint] = stats.byEndpoint[endpoint] || { success: 0, failure: 0 };
        stats.byEndpoint[endpoint].failure++;
        
        await saveDeliveryStats(stats);
        
        await addToDeadLetterQueue({
          eventType,
          endpoint,
          payload,
          error: {
            message: error.message,
            code: error.code,
            statusCode: statusCode
          },
          attempts: attempt + 1,
          context
        });
        
        return {
          success: false,
          attempts: attempt + 1,
          error: lastError,
          addedToDeadLetter: true
        };
      }
      
      console.log(`  ⚠ Attempt ${attempt + 1} failed: ${error.message}`);
    }
  }
  
  return {
    success: false,
    attempts: RETRY_CONFIG.maxRetries + 1,
    error: lastError
  };
}

/**
 * HTTP request with retry
 */
async function httpRequestWithRetry(options, body = null, context = {}) {
  const handler = () => new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data, statusCode: res.statusCode });
          }
        } else {
          const error = new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`);
          error.statusCode = res.statusCode;
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      const error = new Error('Request timeout');
      error.code = 'ETIMEDOUT';
      reject(error);
    });
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
  
  return executeWithRetry(handler, { options, body }, {
    eventType: context.eventType || 'http-request',
    endpoint: `${options.hostname}${options.path}`
  });
}

/**
 * Retry failed entries from dead letter queue
 */
async function retryDeadLetterEntries(handler, maxEntries = 10) {
  const dlq = await loadDeadLetterQueue();
  const pendingEntries = dlq.entries.filter(e => e.status === 'pending').slice(0, maxEntries);
  
  console.log(`\n📬 Processing ${pendingEntries.length} dead letter entries...\n`);
  
  const results = {
    processed: 0,
    recovered: 0,
    failed: 0
  };
  
  for (const entry of pendingEntries) {
    console.log(`  Processing ${entry.id} (${entry.eventType})...`);
    
    try {
      await handler(entry.payload);
      
      // Success - mark as recovered
      entry.status = 'recovered';
      entry.recoveredAt = new Date().toISOString();
      dlq.totalRecovered++;
      results.recovered++;
      console.log(`    ✅ Recovered`);
      
    } catch (error) {
      entry.retryCount++;
      entry.lastRetryAt = new Date().toISOString();
      entry.lastError = error.message;
      
      if (entry.retryCount >= 3) {
        entry.status = 'abandoned';
        console.log(`    ❌ Abandoned after ${entry.retryCount} retry attempts`);
      } else {
        console.log(`    ⚠ Retry ${entry.retryCount}/3 failed: ${error.message}`);
      }
      
      results.failed++;
    }
    
    results.processed++;
  }
  
  await saveDeadLetterQueue(dlq);
  
  console.log(`\n📊 Results: ${results.recovered} recovered, ${results.failed} failed\n`);
  return results;
}

/**
 * Get webhook health status
 */
async function getWebhookHealth() {
  const stats = await loadDeliveryStats();
  const dlq = await loadDeadLetterQueue();
  
  const successRate = stats.totalAttempts > 0 
    ? ((stats.successCount / stats.totalAttempts) * 100).toFixed(1)
    : 100;
  
  const pendingDLQ = dlq.entries.filter(e => e.status === 'pending').length;
  const abandonedDLQ = dlq.entries.filter(e => e.status === 'abandoned').length;
  
  // Determine health status
  let status = 'healthy';
  let statusEmoji = '🟢';
  
  if (pendingDLQ > DLQ_ALERT_THRESHOLD || parseFloat(successRate) < 90) {
    status = 'degraded';
    statusEmoji = '🟡';
  }
  
  if (parseFloat(successRate) < 80 || abandonedDLQ > 5) {
    status = 'unhealthy';
    statusEmoji = '🔴';
  }
  
  return {
    status,
    statusEmoji,
    metrics: {
      totalAttempts: stats.totalAttempts,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      retryCount: stats.retryCount,
      successRate: `${successRate}%`
    },
    deadLetterQueue: {
      pending: pendingDLQ,
      recovered: dlq.totalRecovered,
      abandoned: abandonedDLQ,
      total: dlq.entries.length
    },
    byEventType: stats.byEventType,
    byEndpoint: stats.byEndpoint,
    lastUpdated: stats.lastUpdated
  };
}

/**
 * Display health report
 */
async function displayHealthReport() {
  const health = await getWebhookHealth();
  
  console.log('\n' + '═'.repeat(60));
  console.log(`${health.statusEmoji} WEBHOOK HEALTH: ${health.status.toUpperCase()}`);
  console.log('═'.repeat(60));
  
  console.log('\n📊 DELIVERY METRICS\n');
  console.log(`  Total Attempts:   ${health.metrics.totalAttempts}`);
  console.log(`  Successful:       ${health.metrics.successCount}`);
  console.log(`  Failed:           ${health.metrics.failureCount}`);
  console.log(`  Retry Attempts:   ${health.metrics.retryCount}`);
  console.log(`  Success Rate:     ${health.metrics.successRate}`);
  
  console.log('\n📬 DEAD LETTER QUEUE\n');
  console.log(`  Pending Review:   ${health.deadLetterQueue.pending}`);
  console.log(`  Recovered:        ${health.deadLetterQueue.recovered}`);
  console.log(`  Abandoned:        ${health.deadLetterQueue.abandoned}`);
  console.log(`  Total Entries:    ${health.deadLetterQueue.total}`);
  
  if (Object.keys(health.byEventType).length > 0) {
    console.log('\n📋 BY EVENT TYPE\n');
    for (const [eventType, data] of Object.entries(health.byEventType)) {
      const total = data.success + data.failure;
      const rate = total > 0 ? ((data.success / total) * 100).toFixed(0) : 100;
      console.log(`  ${eventType.padEnd(25)} ${data.success}/${total} (${rate}%)`);
    }
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log(`Last updated: ${health.lastUpdated}`);
  console.log('');
  
  return health;
}

/**
 * View dead letter queue entries
 */
async function viewDeadLetterQueue(status = 'pending') {
  const dlq = await loadDeadLetterQueue();
  const entries = status === 'all' 
    ? dlq.entries 
    : dlq.entries.filter(e => e.status === status);
  
  console.log(`\n📬 DEAD LETTER QUEUE (${status})\n`);
  console.log(`Found ${entries.length} entries\n`);
  
  for (const entry of entries.slice(0, 20)) {
    console.log(`  ${entry.id}`);
    console.log(`    Event: ${entry.eventType}`);
    console.log(`    Added: ${entry.addedAt}`);
    console.log(`    Status: ${entry.status}`);
    console.log(`    Attempts: ${entry.attempts} + ${entry.retryCount} retries`);
    if (entry.error) {
      console.log(`    Error: ${entry.error.message}`);
    }
    console.log('');
  }
  
  if (entries.length > 20) {
    console.log(`  ... and ${entries.length - 20} more entries`);
  }
  
  return entries;
}

/**
 * Purge old dead letter entries
 */
async function purgeDeadLetterQueue(daysOld = 7, status = 'recovered') {
  const dlq = await loadDeadLetterQueue();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  
  const originalCount = dlq.entries.length;
  
  dlq.entries = dlq.entries.filter(entry => {
    if (status !== 'all' && entry.status !== status) return true;
    const entryDate = new Date(entry.addedAt);
    return entryDate >= cutoff;
  });
  
  const purgedCount = originalCount - dlq.entries.length;
  await saveDeadLetterQueue(dlq);
  
  console.log(`\n🗑️ Purged ${purgedCount} entries older than ${daysOld} days (status: ${status})\n`);
  return purgedCount;
}

/**
 * Run daily dead letter queue review
 */
async function runDailyReview() {
  console.log('\n' + '═'.repeat(60));
  console.log('📬 DAILY DEAD LETTER QUEUE REVIEW');
  console.log('═'.repeat(60));
  console.log(`Date: ${new Date().toLocaleString()}\n`);
  
  const health = await getWebhookHealth();
  const dlq = await loadDeadLetterQueue();
  const pendingEntries = dlq.entries.filter(e => e.status === 'pending');
  
  // Summary
  console.log('📊 SUMMARY\n');
  console.log(`  Webhook Success Rate: ${health.metrics.successRate}`);
  console.log(`  Pending Entries:      ${pendingEntries.length}`);
  console.log(`  Abandoned Entries:    ${health.deadLetterQueue.abandoned}`);
  
  // Identify patterns
  if (pendingEntries.length > 0) {
    console.log('\n🔍 FAILURE PATTERNS\n');
    
    const byEventType = {};
    const byError = {};
    
    for (const entry of pendingEntries) {
      byEventType[entry.eventType] = (byEventType[entry.eventType] || 0) + 1;
      const errorMsg = entry.error?.message || 'Unknown';
      byError[errorMsg] = (byError[errorMsg] || 0) + 1;
    }
    
    console.log('  By Event Type:');
    for (const [type, count] of Object.entries(byEventType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type}: ${count}`);
    }
    
    console.log('\n  By Error:');
    for (const [error, count] of Object.entries(byError).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`    ${error.substring(0, 50)}: ${count}`);
    }
  }
  
  // Send alert if needed
  if (pendingEntries.length >= DLQ_ALERT_THRESHOLD) {
    await sendAlert(
      `📬 Daily DLQ Review\n\n` +
      `Pending: ${pendingEntries.length}\n` +
      `Success Rate: ${health.metrics.successRate}\n\n` +
      `Run: webhook-resilience.mjs retry`
    );
  }
  
  // Auto-purge old recovered entries
  await purgeDeadLetterQueue(7, 'recovered');
  
  console.log('═'.repeat(60));
  console.log('');
  
  return { health, pendingCount: pendingEntries.length };
}

/**
 * Reset stats (for testing)
 */
async function resetStats() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DELIVERY_STATS_FILE, JSON.stringify({
    totalAttempts: 0,
    successCount: 0,
    failureCount: 0,
    retryCount: 0,
    byEventType: {},
    byEndpoint: {},
    lastUpdated: new Date().toISOString()
  }, null, 2));
  console.log('✅ Stats reset');
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'health':
  case 'status':
    displayHealthReport();
    break;
    
  case 'dlq':
  case 'queue':
    viewDeadLetterQueue(args[0] || 'pending');
    break;
    
  case 'retry':
    retryDeadLetterEntries(async (payload) => {
      // Default handler - just log (Replace with actual handler in integration)
      console.log('    Would process:', JSON.stringify(payload).substring(0, 100));
    }, parseInt(args[0]) || 10);
    break;
    
  case 'review':
    runDailyReview();
    break;
    
  case 'purge':
    purgeDeadLetterQueue(parseInt(args[0]) || 7, args[1] || 'recovered');
    break;
    
  case 'reset':
    resetStats();
    break;
    
  default:
    console.log(`
Self-Healing Webhook System

Usage:
  webhook-resilience.mjs health              - Show webhook health status
  webhook-resilience.mjs dlq [status]        - View dead letter queue (pending|recovered|abandoned|all)
  webhook-resilience.mjs retry [count]       - Retry pending dead letter entries
  webhook-resilience.mjs review              - Run daily review (alerts + purge)
  webhook-resilience.mjs purge [days] [status] - Purge old entries
  webhook-resilience.mjs reset               - Reset stats (testing)

Integration:
  import { executeWithRetry, httpRequestWithRetry } from './webhook-resilience.mjs';
  
  // Wrap any handler
  const result = await executeWithRetry(myHandler, payload, { eventType: 'contact.new' });
  
  // HTTP with retry
  const result = await httpRequestWithRetry(options, body, { eventType: 'ghl-api' });
`);
}

export { 
  executeWithRetry, 
  httpRequestWithRetry, 
  getWebhookHealth, 
  retryDeadLetterEntries,
  addToDeadLetterQueue,
  loadDeliveryStats,
  runDailyReview
};
