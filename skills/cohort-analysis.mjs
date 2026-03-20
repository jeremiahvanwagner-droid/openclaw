#!/usr/bin/env node
/**
 * OpenClaw Cohort Analysis Module
 *
 * Features:
 *   - Group contacts by acquisition month/source/tier
 *   - Calculate LTV per cohort
 *   - Generate retention curves
 *   - Identify best-converting tiers
 *   - Monthly cohort reports
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { openclawSend } from '../lib/safe-exec.mjs';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const COHORTS_DIR = path.join(DATA_DIR, 'cohorts');
const COHORT_FILE = path.join(DATA_DIR, 'cohort-data.json');

const { token: GHL_API_KEY, locationId: GHL_LOCATION_ID } = (await import('../lib/ghl-tenant-resolver.mjs')).resolve();
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Product values
const PRODUCT_VALUES = {
  'ebook': 9.95,
  'course': 297,
  'intensive': 2497,
  'operators-circle': 497  // monthly
};

// Source categories
const SOURCE_CATEGORIES = {
  'facebook': 'paid',
  'fb': 'paid',
  'instagram': 'paid',
  'ig': 'paid',
  'google': 'paid',
  'youtube': 'organic',
  'yt': 'organic',
  'tiktok': 'organic',
  'twitter': 'organic',
  'linkedin': 'organic',
  'email': 'owned',
  'sms': 'owned',
  'referral': 'referral',
  'affiliate': 'affiliate',
  'direct': 'direct',
  'organic': 'organic'
};

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
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
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
 * Load cohort data
 */
async function loadCohortData() {
  try {
    const data = await fs.readFile(COHORT_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      cohorts: {},
      lastSync: null,
      totalContacts: 0
    };
  }
}

/**
 * Save cohort data
 */
async function saveCohortData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  data.lastSync = new Date().toISOString();
  await fs.writeFile(COHORT_FILE, JSON.stringify(data, null, 2));
}

/**
 * Detect source from contact data
 */
function detectSource(contact) {
  // Check source field
  let source = (contact.source || '').toLowerCase();

  // Check UTM tags
  if (contact.customFields) {
    const utmSource = contact.customFields.find(f =>
      f.key?.toLowerCase().includes('utm_source') || f.id?.includes('utm_source')
    );
    if (utmSource?.value) {
      source = utmSource.value.toLowerCase();
    }
  }

  // Check tags for source hints
  for (const tag of (contact.tags || [])) {
    const tagLower = tag.toLowerCase();
    for (const [keyword, category] of Object.entries(SOURCE_CATEGORIES)) {
      if (tagLower.includes(keyword)) {
        return { source: keyword, category };
      }
    }
  }

  // Match source to category
  for (const [keyword, category] of Object.entries(SOURCE_CATEGORIES)) {
    if (source.includes(keyword)) {
      return { source: keyword, category };
    }
  }

  return { source: source || 'unknown', category: 'direct' };
}

/**
 * Detect alignment tier from tags
 */
function detectAlignmentTier(contact) {
  const tiers = ['transcendent', 'empowered', 'aligned', 'awakening', 'dormant'];

  for (const tag of (contact.tags || [])) {
    const tagLower = tag.toLowerCase();
    for (const tier of tiers) {
      if (tagLower.includes(tier)) {
        return tier;
      }
    }
  }

  return 'unknown';
}

/**
 * Calculate LTV for a contact
 */
function calculateLTV(contact) {
  let ltv = 0;
  const tags = (contact.tags || []).map(t => t.toLowerCase());

  if (tags.some(t => t.includes('ebook') || t.includes('e-book'))) {
    ltv += PRODUCT_VALUES.ebook;
  }

  if (tags.some(t => t.includes('course-buyer') || t.includes('course buyer'))) {
    ltv += PRODUCT_VALUES.course;
  }

  if (tags.some(t => t.includes('intensive'))) {
    ltv += PRODUCT_VALUES.intensive;
  }

  // Check for subscription (estimate months active)
  if (tags.some(t => t.includes('operators') || t.includes('circle'))) {
    const dateAdded = new Date(contact.dateAdded);
    const now = new Date();
    const monthsActive = Math.max(1, Math.floor((now - dateAdded) / (1000 * 60 * 60 * 24 * 30)));
    ltv += PRODUCT_VALUES['operators-circle'] * monthsActive;
  }

  return ltv;
}

/**
 * Sync contacts and build cohorts
 */
async function syncCohorts() {
  console.log('\n📊 Syncing contacts and building cohorts...\n');

  const cohortData = await loadCohortData();
  cohortData.cohorts = {};
  cohortData.totalContacts = 0;

  // Fetch all contacts (paginated)
  let allContacts = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100;

  while (hasMore) {
    try {
      const response = await ghlRequest('GET',
        `/contacts/?locationId=${GHL_LOCATION_ID}&limit=${limit}&skip=${offset}`
      );

      const contacts = response.contacts || [];
      allContacts.push(...contacts);

      console.log(`  Fetched ${allContacts.length} contacts...`);

      hasMore = contacts.length === limit;
      offset += limit;

      await new Promise(r => setTimeout(r, 200));

    } catch (error) {
      console.error(`  Error at offset ${offset}: ${error.message}`);
      break;
    }
  }

  cohortData.totalContacts = allContacts.length;
  console.log(`\n  Processing ${allContacts.length} contacts into cohorts...\n`);

  // Process each contact
  for (const contact of allContacts) {
    const dateAdded = new Date(contact.dateAdded);
    const cohortMonth = `${dateAdded.getFullYear()}-${String(dateAdded.getMonth() + 1).padStart(2, '0')}`;
    const { source, category } = detectSource(contact);
    const tier = detectAlignmentTier(contact);
    const ltv = calculateLTV(contact);

    // Build cohort keys
    const keys = [
      `month:${cohortMonth}`,
      `source:${source}`,
      `category:${category}`,
      `tier:${tier}`,
      `month-source:${cohortMonth}-${source}`
    ];

    for (const key of keys) {
      if (!cohortData.cohorts[key]) {
        cohortData.cohorts[key] = {
          key,
          count: 0,
          totalLTV: 0,
          conversions: { ebook: 0, course: 0, intensive: 0, circle: 0 },
          contacts: []
        };
      }

      const cohort = cohortData.cohorts[key];
      cohort.count++;
      cohort.totalLTV += ltv;

      // Track conversions
      const tags = (contact.tags || []).map(t => t.toLowerCase());
      if (tags.some(t => t.includes('ebook'))) cohort.conversions.ebook++;
      if (tags.some(t => t.includes('course-buyer'))) cohort.conversions.course++;
      if (tags.some(t => t.includes('intensive'))) cohort.conversions.intensive++;
      if (tags.some(t => t.includes('operators') || t.includes('circle'))) cohort.conversions.circle++;

      // Store contact reference (ID only for efficiency)
      cohort.contacts.push({
        id: contact.id,
        dateAdded: contact.dateAdded,
        ltv
      });
    }
  }

  // Calculate averages
  for (const cohort of Object.values(cohortData.cohorts)) {
    cohort.avgLTV = cohort.count > 0 ? (cohort.totalLTV / cohort.count).toFixed(2) : 0;
    cohort.conversionRates = {
      ebook: cohort.count > 0 ? ((cohort.conversions.ebook / cohort.count) * 100).toFixed(1) : 0,
      course: cohort.count > 0 ? ((cohort.conversions.course / cohort.count) * 100).toFixed(1) : 0,
      intensive: cohort.count > 0 ? ((cohort.conversions.intensive / cohort.count) * 100).toFixed(1) : 0,
      circle: cohort.count > 0 ? ((cohort.conversions.circle / cohort.count) * 100).toFixed(1) : 0
    };
  }

  await saveCohortData(cohortData);
  console.log(`  ✅ Built ${Object.keys(cohortData.cohorts).length} cohort segments`);

  return cohortData;
}

/**
 * Calculate retention curve
 */
async function calculateRetention(cohortKey) {
  const cohortData = await loadCohortData();
  const cohort = cohortData.cohorts[cohortKey];

  if (!cohort) {
    console.log(`Cohort ${cohortKey} not found`);
    return null;
  }

  const retention = {
    cohort: cohortKey,
    initialCount: cohort.count,
    retentionDays: [30, 60, 90, 180, 365],
    retentionRates: {}
  };

  const now = new Date();

  for (const days of retention.retentionDays) {
    const activeCount = cohort.contacts.filter(c => {
      const dateAdded = new Date(c.dateAdded);
      const daysSinceJoin = (now - dateAdded) / (1000 * 60 * 60 * 24);
      // Consider retained if they have any LTV or if joined within the period
      return daysSinceJoin >= days ? c.ltv > 0 : daysSinceJoin < days;
    }).length;

    retention.retentionRates[days] = {
      count: activeCount,
      rate: ((activeCount / cohort.count) * 100).toFixed(1)
    };
  }

  return retention;
}

/**
 * Generate cohort report
 */
async function generateReport(groupBy = 'month') {
  const cohortData = await loadCohortData();

  console.log('\n' + '═'.repeat(70));
  console.log(`📊 COHORT ANALYSIS REPORT (By ${groupBy.toUpperCase()})`);
  console.log('═'.repeat(70));
  console.log(`Generated: ${new Date().toLocaleString()}`);
  console.log(`Total Contacts: ${cohortData.totalContacts}\n`);

  // Filter cohorts by grouping
  const prefix = `${groupBy}:`;
  const relevantCohorts = Object.values(cohortData.cohorts)
    .filter(c => c.key.startsWith(prefix))
    .sort((a, b) => b.totalLTV - a.totalLTV);

  if (relevantCohorts.length === 0) {
    console.log('No cohort data available. Run: cohort-analysis.mjs sync');
    return;
  }

  // Summary table
  console.log('Cohort'.padEnd(20) + 'Count'.padStart(8) + 'Avg LTV'.padStart(12) + 'Total LTV'.padStart(12) +
              'eBook %'.padStart(10) + 'Course %'.padStart(10));
  console.log('─'.repeat(70));

  for (const cohort of relevantCohorts.slice(0, 15)) {
    const label = cohort.key.replace(prefix, '');
    console.log(
      label.padEnd(20) +
      cohort.count.toString().padStart(8) +
      `$${cohort.avgLTV}`.padStart(12) +
      `$${cohort.totalLTV.toFixed(0)}`.padStart(12) +
      `${cohort.conversionRates.ebook}%`.padStart(10) +
      `${cohort.conversionRates.course}%`.padStart(10)
    );
  }

  // Best performing cohorts
  console.log('\n📈 TOP PERFORMING COHORTS (By Avg LTV)\n');

  const byAvgLTV = [...relevantCohorts].sort((a, b) => parseFloat(b.avgLTV) - parseFloat(a.avgLTV));

  for (const cohort of byAvgLTV.slice(0, 5)) {
    const label = cohort.key.replace(prefix, '');
    console.log(`  ${label}: $${cohort.avgLTV} avg LTV (${cohort.count} contacts)`);
  }

  // Worst performing (for improvement)
  console.log('\n📉 LOWEST PERFORMING COHORTS\n');

  for (const cohort of byAvgLTV.slice(-5).reverse()) {
    const label = cohort.key.replace(prefix, '');
    console.log(`  ${label}: $${cohort.avgLTV} avg LTV (${cohort.count} contacts)`);
  }

  console.log('\n' + '═'.repeat(70));

  return relevantCohorts;
}

/**
 * Compare two cohorts
 */
async function compareCohorts(cohort1Key, cohort2Key) {
  const cohortData = await loadCohortData();

  const c1 = cohortData.cohorts[cohort1Key];
  const c2 = cohortData.cohorts[cohort2Key];

  if (!c1 || !c2) {
    console.log('One or both cohorts not found');
    return;
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 COHORT COMPARISON');
  console.log('═'.repeat(60) + '\n');

  console.log('Metric'.padEnd(25) + cohort1Key.padStart(17) + cohort2Key.padStart(17) + 'Diff'.padStart(10));
  console.log('─'.repeat(60));

  const metrics = [
    ['Count', c1.count, c2.count],
    ['Avg LTV', parseFloat(c1.avgLTV), parseFloat(c2.avgLTV), '$'],
    ['Total LTV', c1.totalLTV, c2.totalLTV, '$'],
    ['eBook Conv %', parseFloat(c1.conversionRates.ebook), parseFloat(c2.conversionRates.ebook), '%'],
    ['Course Conv %', parseFloat(c1.conversionRates.course), parseFloat(c2.conversionRates.course), '%'],
    ['Intensive Conv %', parseFloat(c1.conversionRates.intensive), parseFloat(c2.conversionRates.intensive), '%']
  ];

  for (const [name, v1, v2, unit = ''] of metrics) {
    const diff = v2 - v1;
    const diffStr = diff >= 0 ? `+${unit}${diff.toFixed(1)}` : `${unit}${diff.toFixed(1)}`;
    const color = diff > 0 ? '🟢' : diff < 0 ? '🔴' : '⚪';

    console.log(
      name.padEnd(25) +
      `${unit}${v1}`.padStart(17) +
      `${unit}${v2}`.padStart(17) +
      `${color} ${diffStr}`.padStart(12)
    );
  }

  console.log('');
}

/**
 * Find best converting alignment tier
 */
async function findBestTier() {
  const cohortData = await loadCohortData();

  console.log('\n' + '═'.repeat(60));
  console.log('🎯 ALIGNMENT TIER PERFORMANCE');
  console.log('═'.repeat(60) + '\n');

  const tiers = ['transcendent', 'empowered', 'aligned', 'awakening', 'dormant'];
  const tierData = [];

  for (const tier of tiers) {
    const cohort = cohortData.cohorts[`tier:${tier}`];
    if (cohort) {
      tierData.push({
        tier: tier.charAt(0).toUpperCase() + tier.slice(1),
        count: cohort.count,
        avgLTV: parseFloat(cohort.avgLTV),
        courseConv: parseFloat(cohort.conversionRates.course),
        intensiveConv: parseFloat(cohort.conversionRates.intensive)
      });
    }
  }

  // Sort by course conversion
  tierData.sort((a, b) => b.courseConv - a.courseConv);

  console.log('Tier'.padEnd(15) + 'Count'.padStart(8) + 'Avg LTV'.padStart(12) +
              'Course %'.padStart(10) + 'Intensive %'.padStart(12));
  console.log('─'.repeat(55));

  for (const tier of tierData) {
    console.log(
      tier.tier.padEnd(15) +
      tier.count.toString().padStart(8) +
      `$${tier.avgLTV}`.padStart(12) +
      `${tier.courseConv}%`.padStart(10) +
      `${tier.intensiveConv}%`.padStart(12)
    );
  }

  if (tierData.length > 0) {
    console.log(`\n✨ Best Converting Tier: ${tierData[0].tier} (${tierData[0].courseConv}% to course)`);

    const highestLTV = [...tierData].sort((a, b) => b.avgLTV - a.avgLTV)[0];
    console.log(`💰 Highest LTV Tier: ${highestLTV.tier} ($${highestLTV.avgLTV} avg)`);
  }

  console.log('');

  return tierData;
}

/**
 * Generate monthly snapshot report
 */
async function monthlySnapshot() {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 MONTHLY COHORT SNAPSHOT');
  console.log('═'.repeat(70));

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  console.log(`\nReport Period: ${lastMonthKey}\n`);

  // Sync latest data
  await syncCohorts();

  // Generate reports
  await generateReport('month');
  await findBestTier();

  // Compare this month to last month
  const cohortData = await loadCohortData();
  const thisMonthCohort = cohortData.cohorts[`month:${thisMonth}`];
  const lastMonthCohort = cohortData.cohorts[`month:${lastMonthKey}`];

  if (thisMonthCohort && lastMonthCohort) {
    console.log('\n📈 MONTH-OVER-MONTH COMPARISON\n');
    await compareCohorts(`month:${lastMonthKey}`, `month:${thisMonth}`);
  }

  // Save snapshot
  await fs.mkdir(COHORTS_DIR, { recursive: true });
  const snapshotFile = path.join(COHORTS_DIR, `snapshot-${thisMonth}.json`);
  await fs.writeFile(snapshotFile, JSON.stringify({
    generatedAt: now.toISOString(),
    period: thisMonth,
    data: cohortData
  }, null, 2));

  console.log(`\n📁 Snapshot saved: ${snapshotFile}`);

  // Send Telegram summary
  if (thisMonthCohort) {
    await sendNotification(
      `📊 Monthly Cohort Report - ${thisMonth}\n\n` +
      `New Contacts: ${thisMonthCohort.count}\n` +
      `Avg LTV: $${thisMonthCohort.avgLTV}\n` +
      `eBook Conv: ${thisMonthCohort.conversionRates.ebook}%\n` +
      `Course Conv: ${thisMonthCohort.conversionRates.course}%`
    );
  }

  console.log('═'.repeat(70) + '\n');
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'sync':
    syncCohorts();
    break;

  case 'report':
    generateReport(args[0] || 'month');
    break;

  case 'compare':
    if (args.length < 2) {
      console.log('Usage: cohort-analysis.mjs compare <cohort1> <cohort2>');
      console.log('Example: cohort-analysis.mjs compare month:2026-01 month:2026-02');
    } else {
      compareCohorts(args[0], args[1]);
    }
    break;

  case 'tiers':
  case 'best-tier':
    findBestTier();
    break;

  case 'retention':
    if (!args[0]) {
      console.log('Usage: cohort-analysis.mjs retention <cohort-key>');
    } else {
      calculateRetention(args[0]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;

  case 'monthly':
  case 'snapshot':
    monthlySnapshot();
    break;

  default:
    console.log(`
Cohort Analysis Module

Usage:
  cohort-analysis.mjs sync                 - Sync contacts and build cohorts
  cohort-analysis.mjs report [groupBy]     - Generate report (month/source/tier/category)
  cohort-analysis.mjs compare <c1> <c2>    - Compare two cohorts
  cohort-analysis.mjs tiers                - Show alignment tier performance
  cohort-analysis.mjs retention <cohort>   - Calculate retention curve
  cohort-analysis.mjs monthly              - Generate monthly snapshot report

Cohort Keys:
  month:YYYY-MM        - By acquisition month
  source:<source>      - By traffic source
  category:<category>  - By source category (paid/organic/owned)
  tier:<tier>          - By alignment tier

Examples:
  cohort-analysis.mjs report month
  cohort-analysis.mjs compare month:2026-01 month:2026-02
  cohort-analysis.mjs retention month:2026-01
`);
}

export { syncCohorts, generateReport, compareCohorts, findBestTier, monthlySnapshot };
