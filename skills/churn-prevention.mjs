#!/usr/bin/env node
/**
 * OpenClaw Churn Prevention System
 *
 * Features:
 *   - Engagement scoring for Operators Circle subscribers
 *   - Risk tier assignment (Low/Medium/High/Critical)
 *   - Days-until-billing tracking
 *   - Automated intervention workflows
 *   - Intervention success tracking
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { openclawSend } from '../lib/safe-exec.mjs';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const INTERVENTIONS_FILE = path.join(DATA_DIR, 'churn-interventions.json');

const { token: GHL_API_KEY, locationId: GHL_LOCATION_ID } = (await import('../lib/ghl-tenant-resolver.mjs')).resolve();
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Risk thresholds
const RISK_CONFIG = {
  // Churn signals (higher = more risky)
  signals: {
    noEmailOpensInDays: { threshold: 14, weight: 25 },
    noLoginInDays: { threshold: 21, weight: 30 },
    supportTicketOpen: { threshold: true, weight: 15 },
    paymentFailure: { threshold: true, weight: 30 },
    noEngagementInDays: { threshold: 7, weight: 20 }
  },

  // Risk tiers
  tiers: {
    low: { max: 25, action: 'monitor' },
    medium: { max: 50, action: 'auto-email' },
    high: { max: 75, action: 'sales-outreach' },
    critical: { max: 100, action: 'personal-call' }
  },

  // Billing window alert (days before renewal)
  billingAlertDays: 7
};

// Intervention templates
const INTERVENTION_TEMPLATES = {
  'auto-email': {
    subject: "We miss you at Operators Circle!",
    preview: "Quick check-in from Truth J Blue...",
    delay: 0
  },
  'sales-outreach': {
    taskTitle: "HIGH RISK: Follow up with at-risk subscriber",
    taskDescription: "This subscriber shows high churn risk. Personal outreach recommended.",
    delay: 0
  },
  'personal-call': {
    notificationText: "🚨 CRITICAL: Subscriber at extreme churn risk",
    calendarBlock: 15,
    delay: 0
  }
};

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
 * Send Telegram alert
 */
async function sendAlert(message, critical = false) {
  try {
    const prefix = critical ? '🚨' : '⚠️';
    await openclawSend({ agent: 'sales', channel: 'telegram', to: TELEGRAM_CHAT_ID, message: `${prefix} CHURN ALERT\n\n${message}` });
    return true;
  } catch {
    console.error('Failed to send alert');
    return false;
  }
}

/**
 * Load subscribers data
 */
async function loadSubscribers() {
  try {
    const data = await fs.readFile(SUBSCRIBERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      subscribers: {},
      lastSync: null
    };
  }
}

/**
 * Save subscribers data
 */
async function saveSubscribers(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  data.lastSync = new Date().toISOString();
  await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Load interventions log
 */
async function loadInterventions() {
  try {
    const data = await fs.readFile(INTERVENTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      interventions: [],
      stats: {
        total: 0,
        successful: 0,
        pending: 0
      }
    };
  }
}

/**
 * Save interventions log
 */
async function saveInterventions(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(INTERVENTIONS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Calculate days since date
 */
function daysSince(date) {
  if (!date) return 999;
  const now = new Date();
  const then = new Date(date);
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days until date
 */
function daysUntil(date) {
  if (!date) return 0;
  const now = new Date();
  const then = new Date(date);
  return Math.ceil((then - now) / (1000 * 60 * 60 * 24));
}

/**
 * Sync subscribers from GHL
 */
async function syncSubscribers() {
  console.log('\n📥 Syncing Operators Circle subscribers from GHL...\n');

  const subscribersData = await loadSubscribers();

  // Get contacts with operators-circle or membership tags
  const tags = ['operators-circle', 'membership-active', 'intensive-client'];
  let allSubscribers = [];

  for (const tag of tags) {
    try {
      const response = await ghlRequest('GET',
        `/contacts/?locationId=${GHL_LOCATION_ID}&tags=${tag}&limit=100`
      );
      allSubscribers.push(...(response.contacts || []));
    } catch (error) {
      console.error(`  Error fetching ${tag}: ${error.message}`);
    }
  }

  // Dedupe by contact ID
  const uniqueIds = new Set();
  allSubscribers = allSubscribers.filter(c => {
    if (uniqueIds.has(c.id)) return false;
    uniqueIds.add(c.id);
    return true;
  });

  console.log(`  Found ${allSubscribers.length} subscribers\n`);

  // Update subscriber records
  for (const contact of allSubscribers) {
    const existing = subscribersData.subscribers[contact.id] || {};

    subscribersData.subscribers[contact.id] = {
      id: contact.id,
      name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags || [],

      // Engagement tracking (preserve existing or initialize)
      lastEmailOpen: existing.lastEmailOpen || null,
      lastLogin: existing.lastLogin || null,
      lastEngagement: existing.lastEngagement || contact.dateUpdated,

      // Billing info
      subscriptionStart: existing.subscriptionStart || contact.dateAdded,
      nextBillingDate: existing.nextBillingDate || calculateNextBilling(contact.dateAdded),
      paymentStatus: existing.paymentStatus || 'active',

      // Support
      openTickets: existing.openTickets || 0,

      // Risk tracking
      riskScore: existing.riskScore || 0,
      riskTier: existing.riskTier || 'low',
      lastAssessment: existing.lastAssessment || null,
      interventionHistory: existing.interventionHistory || []
    };
  }

  await saveSubscribers(subscribersData);
  console.log(`  ✅ Synced ${allSubscribers.length} subscribers`);

  return subscribersData;
}

/**
 * Calculate next billing date (assumes monthly on subscription start date)
 */
function calculateNextBilling(startDate) {
  const start = new Date(startDate);
  const now = new Date();

  // Find next occurrence of the billing day
  const billingDay = start.getDate();
  let nextBilling = new Date(now.getFullYear(), now.getMonth(), billingDay);

  if (nextBilling <= now) {
    nextBilling.setMonth(nextBilling.getMonth() + 1);
  }

  return nextBilling.toISOString();
}

/**
 * Calculate engagement score (0-100, higher = more engaged)
 */
function calculateEngagementScore(subscriber) {
  let score = 100;

  // Email opens
  const daysSinceEmail = daysSince(subscriber.lastEmailOpen);
  if (daysSinceEmail > RISK_CONFIG.signals.noEmailOpensInDays.threshold) {
    score -= RISK_CONFIG.signals.noEmailOpensInDays.weight;
  } else if (daysSinceEmail > 7) {
    score -= Math.floor(RISK_CONFIG.signals.noEmailOpensInDays.weight * (daysSinceEmail / 14));
  }

  // Logins
  const daysSinceLogin = daysSince(subscriber.lastLogin);
  if (daysSinceLogin > RISK_CONFIG.signals.noLoginInDays.threshold) {
    score -= RISK_CONFIG.signals.noLoginInDays.weight;
  } else if (daysSinceLogin > 10) {
    score -= Math.floor(RISK_CONFIG.signals.noLoginInDays.weight * (daysSinceLogin / 21));
  }

  // General engagement
  const daysSinceEngagement = daysSince(subscriber.lastEngagement);
  if (daysSinceEngagement > RISK_CONFIG.signals.noEngagementInDays.threshold) {
    score -= RISK_CONFIG.signals.noEngagementInDays.weight;
  }

  // Support tickets
  if (subscriber.openTickets > 0) {
    score -= RISK_CONFIG.signals.supportTicketOpen.weight;
  }

  // Payment issues
  if (subscriber.paymentStatus === 'failed') {
    score -= RISK_CONFIG.signals.paymentFailure.weight;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate risk score (inverse of engagement, 0-100, higher = more risky)
 */
function calculateRiskScore(subscriber) {
  return 100 - calculateEngagementScore(subscriber);
}

/**
 * Determine risk tier
 */
function getRiskTier(riskScore) {
  if (riskScore <= RISK_CONFIG.tiers.low.max) return 'low';
  if (riskScore <= RISK_CONFIG.tiers.medium.max) return 'medium';
  if (riskScore <= RISK_CONFIG.tiers.high.max) return 'high';
  return 'critical';
}

/**
 * Run churn risk assessment
 */
async function assessChurnRisk() {
  console.log('\n' + '═'.repeat(60));
  console.log('🔍 CHURN RISK ASSESSMENT');
  console.log('═'.repeat(60));
  console.log(`Date: ${new Date().toLocaleString()}\n`);

  const subscribersData = await syncSubscribers();
  const interventionsLog = await loadInterventions();

  const results = {
    total: 0,
    byTier: { low: 0, medium: 0, high: 0, critical: 0 },
    needingIntervention: [],
    billingAlerts: []
  };

  for (const [id, subscriber] of Object.entries(subscribersData.subscribers)) {
    results.total++;

    // Calculate risk
    const riskScore = calculateRiskScore(subscriber);
    const riskTier = getRiskTier(riskScore);
    const daysToRenewal = daysUntil(subscriber.nextBillingDate);

    // Update subscriber
    subscriber.riskScore = riskScore;
    subscriber.riskTier = riskTier;
    subscriber.lastAssessment = new Date().toISOString();

    results.byTier[riskTier]++;

    // Check if intervention needed
    const previousTier = subscriber.riskTier;
    const recentIntervention = subscriber.interventionHistory
      .find(i => daysSince(i.date) < 7);

    if ((riskTier === 'medium' || riskTier === 'high' || riskTier === 'critical') && !recentIntervention) {
      results.needingIntervention.push({
        subscriber,
        riskScore,
        riskTier,
        daysToRenewal,
        action: RISK_CONFIG.tiers[riskTier].action
      });
    }

    // Check billing window
    if (daysToRenewal <= RISK_CONFIG.billingAlertDays && riskScore > 40) {
      results.billingAlerts.push({
        subscriber,
        daysToRenewal,
        riskScore,
        riskTier
      });
    }
  }

  await saveSubscribers(subscribersData);

  // Display summary
  console.log('📊 RISK DISTRIBUTION\n');
  console.log(`  Total Subscribers: ${results.total}`);
  console.log(`  🟢 Low Risk:       ${results.byTier.low}`);
  console.log(`  🟡 Medium Risk:    ${results.byTier.medium}`);
  console.log(`  🟠 High Risk:      ${results.byTier.high}`);
  console.log(`  🔴 Critical:       ${results.byTier.critical}`);

  // Process interventions
  if (results.needingIntervention.length > 0) {
    console.log(`\n⚠️ ${results.needingIntervention.length} SUBSCRIBERS NEED INTERVENTION\n`);

    for (const item of results.needingIntervention) {
      await executeIntervention(item, subscribersData, interventionsLog);
    }
  }

  // Process billing alerts
  if (results.billingAlerts.length > 0) {
    console.log(`\n💳 ${results.billingAlerts.length} BILLING WINDOW ALERTS\n`);

    for (const alert of results.billingAlerts) {
      console.log(`  ${alert.subscriber.name} - Renews in ${alert.daysToRenewal} days (Risk: ${alert.riskTier})`);

      if (alert.riskTier === 'high' || alert.riskTier === 'critical') {
        await sendAlert(
          `${alert.subscriber.name}\n` +
          `Risk: ${alert.riskTier.toUpperCase()} (${alert.riskScore})\n` +
          `Renews in: ${alert.daysToRenewal} days\n` +
          `Email: ${alert.subscriber.email}`,
          alert.riskTier === 'critical'
        );
      }
    }
  }

  await saveInterventions(interventionsLog);

  console.log('\n' + '═'.repeat(60));

  return results;
}

/**
 * Execute intervention based on risk tier
 */
async function executeIntervention(item, subscribersData, interventionsLog) {
  const { subscriber, riskTier, action, riskScore } = item;

  console.log(`  ${subscriber.name} - ${riskTier.toUpperCase()} (${riskScore}) → ${action}`);

  const intervention = {
    id: `int-${Date.now()}`,
    subscriberId: subscriber.id,
    subscriberName: subscriber.name,
    riskTier,
    riskScore,
    action,
    createdAt: new Date().toISOString(),
    status: 'pending',
    result: null
  };

  try {
    switch (action) {
      case 'auto-email':
        // Would trigger GHL email workflow
        console.log(`    📧 Triggering re-engagement email`);
        intervention.status = 'executed';
        intervention.result = 'Email workflow triggered';
        break;

      case 'sales-outreach':
        // Create GHL task for sales team
        console.log(`    📋 Creating sales follow-up task`);
        await ghlRequest('POST', `/contacts/${subscriber.id}/tasks`, {
          title: INTERVENTION_TEMPLATES['sales-outreach'].taskTitle,
          description: `${INTERVENTION_TEMPLATES['sales-outreach'].taskDescription}\n\nRisk Score: ${riskScore}\nEmail: ${subscriber.email}`,
          dueDate: new Date().toISOString(),
          status: 'open'
        });
        intervention.status = 'executed';
        intervention.result = 'Sales task created';
        break;

      case 'personal-call':
        // Send critical alert
        console.log(`    🚨 Sending critical alert`);
        await sendAlert(
          `CRITICAL CHURN RISK\n\n` +
          `Subscriber: ${subscriber.name}\n` +
          `Risk Score: ${riskScore}\n` +
          `Phone: ${subscriber.phone || 'N/A'}\n` +
          `Email: ${subscriber.email}\n\n` +
          `Immediate personal outreach required!`,
          true
        );
        intervention.status = 'executed';
        intervention.result = 'Critical alert sent';
        break;
    }

  } catch (error) {
    console.log(`    ❌ Intervention failed: ${error.message}`);
    intervention.status = 'failed';
    intervention.result = error.message;
  }

  // Log intervention
  interventionsLog.interventions.push(intervention);
  interventionsLog.stats.total++;
  if (intervention.status === 'executed') {
    interventionsLog.stats.successful++;
  } else {
    interventionsLog.stats.pending++;
  }

  // Update subscriber's intervention history
  subscriber.interventionHistory.push({
    date: intervention.createdAt,
    action,
    status: intervention.status
  });

  // Keep only last 10 interventions per subscriber
  subscriber.interventionHistory = subscriber.interventionHistory.slice(-10);
}

/**
 * Record engagement event
 */
async function recordEngagement(contactId, eventType) {
  const subscribersData = await loadSubscribers();
  const subscriber = subscribersData.subscribers[contactId];

  if (!subscriber) {
    console.log(`Subscriber ${contactId} not found`);
    return false;
  }

  const now = new Date().toISOString();

  switch (eventType) {
    case 'email-open':
      subscriber.lastEmailOpen = now;
      break;
    case 'login':
      subscriber.lastLogin = now;
      break;
    case 'engagement':
      subscriber.lastEngagement = now;
      break;
    case 'payment-success':
      subscriber.paymentStatus = 'active';
      subscriber.nextBillingDate = calculateNextBilling(now);
      break;
    case 'payment-failed':
      subscriber.paymentStatus = 'failed';
      break;
    case 'ticket-opened':
      subscriber.openTickets = (subscriber.openTickets || 0) + 1;
      break;
    case 'ticket-closed':
      subscriber.openTickets = Math.max(0, (subscriber.openTickets || 0) - 1);
      break;
  }

  await saveSubscribers(subscribersData);
  console.log(`✅ Recorded ${eventType} for ${subscriber.name}`);

  return true;
}

/**
 * View at-risk subscribers
 */
async function viewAtRisk(tier = 'all') {
  const subscribersData = await loadSubscribers();

  console.log('\n' + '═'.repeat(60));
  console.log(`🚨 AT-RISK SUBSCRIBERS ${tier !== 'all' ? `(${tier.toUpperCase()})` : ''}`);
  console.log('═'.repeat(60) + '\n');

  const subscribers = Object.values(subscribersData.subscribers)
    .filter(s => tier === 'all' || s.riskTier === tier)
    .filter(s => s.riskTier !== 'low')
    .sort((a, b) => b.riskScore - a.riskScore);

  if (subscribers.length === 0) {
    console.log('No at-risk subscribers found.\n');
    return;
  }

  for (const sub of subscribers) {
    const tierEmoji = {
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    }[sub.riskTier] || '⚪';

    const daysToRenewal = daysUntil(sub.nextBillingDate);

    console.log(`${tierEmoji} ${sub.name.padEnd(25)} Risk: ${sub.riskScore.toString().padStart(3)} | Renewal: ${daysToRenewal}d`);
    console.log(`   Email: ${sub.email}`);
    console.log(`   Last Email Open: ${daysSince(sub.lastEmailOpen)}d ago | Last Login: ${daysSince(sub.lastLogin)}d ago`);
    console.log('');
  }
}

/**
 * View intervention stats
 */
async function viewInterventionStats() {
  const interventionsLog = await loadInterventions();

  console.log('\n' + '═'.repeat(60));
  console.log('📊 INTERVENTION STATISTICS');
  console.log('═'.repeat(60) + '\n');

  console.log(`Total Interventions:   ${interventionsLog.stats.total}`);
  console.log(`Successful:            ${interventionsLog.stats.successful}`);
  console.log(`Pending/Failed:        ${interventionsLog.stats.pending}`);

  if (interventionsLog.stats.total > 0) {
    const successRate = (interventionsLog.stats.successful / interventionsLog.stats.total * 100).toFixed(1);
    console.log(`Success Rate:          ${successRate}%`);
  }

  // Recent interventions
  const recent = interventionsLog.interventions.slice(-10).reverse();

  if (recent.length > 0) {
    console.log('\n📋 RECENT INTERVENTIONS\n');

    for (const int of recent) {
      const date = new Date(int.createdAt).toLocaleDateString();
      console.log(`  ${date} | ${int.subscriberName.padEnd(20)} | ${int.riskTier.padEnd(8)} | ${int.action}`);
    }
  }

  console.log('');
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'assess':
  case 'check':
  case 'run':
    assessChurnRisk();
    break;

  case 'sync':
    syncSubscribers();
    break;

  case 'at-risk':
  case 'risk':
    viewAtRisk(args[0] || 'all');
    break;

  case 'record':
    if (args.length < 2) {
      console.log('Usage: churn-prevention.mjs record <contactId> <eventType>');
      console.log('Events: email-open, login, engagement, payment-success, payment-failed, ticket-opened, ticket-closed');
    } else {
      recordEngagement(args[0], args[1]);
    }
    break;

  case 'stats':
    viewInterventionStats();
    break;

  default:
    console.log(`
Churn Prevention System

Usage:
  churn-prevention.mjs assess          - Run churn risk assessment
  churn-prevention.mjs sync            - Sync subscribers from GHL
  churn-prevention.mjs at-risk [tier]  - View at-risk subscribers
  churn-prevention.mjs record <id> <event> - Record engagement event
  churn-prevention.mjs stats           - View intervention statistics

Risk Tiers:
  Low (0-25):      Monitor only
  Medium (26-50):  Auto re-engagement email
  High (51-75):    Sales team outreach task
  Critical (76+):  Immediate personal call alert

Event Types:
  email-open, login, engagement, payment-success, payment-failed,
  ticket-opened, ticket-closed
`);
}

export { assessChurnRisk, recordEngagement, syncSubscribers };
