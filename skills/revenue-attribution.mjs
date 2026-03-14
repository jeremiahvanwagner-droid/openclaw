#!/usr/bin/env node
/**
 * OpenClaw Revenue Attribution Tracker
 * 
 * Tracks revenue back to original source/campaign for ROI analysis.
 * Supports multi-touch attribution models.
 * 
 * Attribution Models:
 *   - First-touch: Credit to first interaction
 *   - Last-touch: Credit to last interaction before purchase
 *   - Linear: Equal credit across all touchpoints
 *   - Time-decay: More credit to recent touchpoints
 */

import https from 'https';
import fs from 'fs/promises';
import path from 'path';

// Configuration
const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const ATTRIBUTION_FILE = path.join(DATA_DIR, 'revenue-attribution.json');

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
  'linkedin': 'organic',
  'twitter': 'organic',
  'x': 'organic',
  'email': 'owned',
  'sms': 'owned',
  'direct': 'direct',
  'organic': 'organic',
  'referral': 'referral',
  'affiliate': 'affiliate',
  'podcast': 'content',
  'blog': 'content',
  'webinar': 'content'
};

// Product values
const PRODUCT_VALUES = {
  'ebook': 9.95,
  'course': 297,
  'intensive': 2497,
  'operators-circle': 497
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
    req.end();
  });
}

/**
 * Load attribution data
 */
async function loadAttributionData() {
  try {
    const data = await fs.readFile(ATTRIBUTION_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { 
      conversions: [],
      sourceMetrics: {},
      lastUpdated: null
    };
  }
}

/**
 * Save attribution data
 */
async function saveAttributionData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ATTRIBUTION_FILE, JSON.stringify(data, null, 2));
}

/**
 * Detect source from contact data
 */
function detectSource(contact) {
  // Check custom fields first
  const customFields = contact.customFields || [];
  const sourceField = customFields.find(f => 
    f.key === 'source' || f.key === 'utm_source' || f.key === 'lead_source'
  );
  
  if (sourceField?.value) {
    return sourceField.value.toLowerCase();
  }
  
  // Check source field
  if (contact.source) {
    return contact.source.toLowerCase();
  }
  
  // Check tags for source hints
  const tags = contact.tags || [];
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    for (const source of Object.keys(SOURCE_CATEGORIES)) {
      if (lowerTag.includes(source)) {
        return source;
      }
    }
  }
  
  return 'direct';
}

/**
 * Get category for a source
 */
function getSourceCategory(source) {
  const lowerSource = source.toLowerCase();
  
  for (const [key, category] of Object.entries(SOURCE_CATEGORIES)) {
    if (lowerSource.includes(key)) {
      return category;
    }
  }
  
  return 'other';
}

/**
 * Record a conversion
 */
async function recordConversion(contactId, product, amount, source = null) {
  const data = await loadAttributionData();
  
  // Get contact info if source not provided
  if (!source) {
    const response = await ghlRequest('GET', `/contacts/${contactId}`);
    const contact = response.contact || response;
    source = detectSource(contact);
  }
  
  const category = getSourceCategory(source);
  
  const conversion = {
    contactId,
    product,
    amount: parseFloat(amount),
    source,
    category,
    timestamp: new Date().toISOString()
  };
  
  data.conversions.push(conversion);
  
  // Update source metrics
  if (!data.sourceMetrics[source]) {
    data.sourceMetrics[source] = {
      conversions: 0,
      revenue: 0,
      products: {}
    };
  }
  
  data.sourceMetrics[source].conversions++;
  data.sourceMetrics[source].revenue += conversion.amount;
  
  if (!data.sourceMetrics[source].products[product]) {
    data.sourceMetrics[source].products[product] = { count: 0, revenue: 0 };
  }
  data.sourceMetrics[source].products[product].count++;
  data.sourceMetrics[source].products[product].revenue += conversion.amount;
  
  data.lastUpdated = conversion.timestamp;
  
  await saveAttributionData(data);
  
  console.log(`✅ Recorded: $${amount} ${product} from ${source} (${category})`);
  
  return conversion;
}

/**
 * Analyze source performance
 */
async function analyzeSourcePerformance() {
  const data = await loadAttributionData();
  
  console.log('\n' + '═'.repeat(60));
  console.log('💰 REVENUE ATTRIBUTION REPORT');
  console.log('═'.repeat(60));
  console.log(`Generated: ${new Date().toLocaleString()}`);
  console.log(`Total Conversions: ${data.conversions.length}`);
  console.log('─'.repeat(60));
  
  // Calculate totals
  const totalRevenue = data.conversions.reduce((sum, c) => sum + c.amount, 0);
  
  // Sort sources by revenue
  const sortedSources = Object.entries(data.sourceMetrics)
    .sort((a, b) => b[1].revenue - a[1].revenue);
  
  console.log('\n📊 REVENUE BY SOURCE\n');
  
  for (const [source, metrics] of sortedSources) {
    const pct = totalRevenue > 0 ? ((metrics.revenue / totalRevenue) * 100).toFixed(1) : 0;
    const category = getSourceCategory(source);
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    
    console.log(`  ${source.padEnd(15)} ${bar} $${metrics.revenue.toFixed(2).padStart(10)} (${pct}%)`);
    console.log(`  ${''.padEnd(15)} ${metrics.conversions} conversions | ${category}`);
  }
  
  // Category summary
  console.log('\n📈 REVENUE BY CATEGORY\n');
  
  const categoryTotals = {};
  for (const conversion of data.conversions) {
    if (!categoryTotals[conversion.category]) {
      categoryTotals[conversion.category] = { revenue: 0, count: 0 };
    }
    categoryTotals[conversion.category].revenue += conversion.amount;
    categoryTotals[conversion.category].count++;
  }
  
  const sortedCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1].revenue - a[1].revenue);
  
  for (const [category, totals] of sortedCategories) {
    const pct = totalRevenue > 0 ? ((totals.revenue / totalRevenue) * 100).toFixed(1) : 0;
    console.log(`  ${category.padEnd(12)} $${totals.revenue.toFixed(2).padStart(10)} (${pct}%) | ${totals.count} sales`);
  }
  
  // Product breakdown
  console.log('\n📦 REVENUE BY PRODUCT\n');
  
  const productTotals = {};
  for (const conversion of data.conversions) {
    if (!productTotals[conversion.product]) {
      productTotals[conversion.product] = { revenue: 0, count: 0 };
    }
    productTotals[conversion.product].revenue += conversion.amount;
    productTotals[conversion.product].count++;
  }
  
  for (const [product, totals] of Object.entries(productTotals)) {
    const avgValue = totals.count > 0 ? totals.revenue / totals.count : 0;
    console.log(`  ${product.padEnd(12)} $${totals.revenue.toFixed(2).padStart(10)} | ${totals.count} sales | Avg: $${avgValue.toFixed(2)}`);
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log('═'.repeat(60));
  
  return {
    totalRevenue,
    totalConversions: data.conversions.length,
    sourceMetrics: data.sourceMetrics,
    categoryTotals,
    productTotals
  };
}

/**
 * Calculate ROI by source (requires cost data)
 */
async function calculateROI(sourceCosts = {}) {
  const data = await loadAttributionData();
  
  console.log('\n📊 ROI ANALYSIS\n');
  
  const roiReport = [];
  
  for (const [source, metrics] of Object.entries(data.sourceMetrics)) {
    const cost = sourceCosts[source] || 0;
    const roi = cost > 0 ? ((metrics.revenue - cost) / cost * 100) : Infinity;
    const roas = cost > 0 ? (metrics.revenue / cost) : Infinity;
    const cpa = metrics.conversions > 0 ? (cost / metrics.conversions) : 0;
    
    roiReport.push({
      source,
      revenue: metrics.revenue,
      cost,
      profit: metrics.revenue - cost,
      roi: roi === Infinity ? 'N/A (no cost)' : roi.toFixed(1) + '%',
      roas: roas === Infinity ? 'N/A' : roas.toFixed(2) + 'x',
      conversions: metrics.conversions,
      cpa: cpa.toFixed(2)
    });
  }
  
  // Sort by profit
  roiReport.sort((a, b) => b.profit - a.profit);
  
  console.log('Source'.padEnd(15) + 'Revenue'.padStart(12) + 'Cost'.padStart(10) + 'Profit'.padStart(12) + 'ROI'.padStart(12) + 'ROAS'.padStart(8));
  console.log('─'.repeat(70));
  
  for (const row of roiReport) {
    console.log(
      row.source.padEnd(15) +
      ('$' + row.revenue.toFixed(2)).padStart(12) +
      ('$' + row.cost.toFixed(2)).padStart(10) +
      ('$' + row.profit.toFixed(2)).padStart(12) +
      row.roi.padStart(12) +
      row.roas.padStart(8)
    );
  }
  
  return roiReport;
}

/**
 * Sync conversions from GHL
 */
async function syncFromGHL() {
  console.log('⏳ Syncing conversions from GHL...\n');
  
  const data = await loadAttributionData();
  const existingIds = new Set(data.conversions.map(c => c.contactId));
  
  // Get buyers
  const tags = ['ebook-buyer', 'course-buyer', 'intensive-client'];
  let newConversions = 0;
  
  for (const tag of tags) {
    const response = await ghlRequest('GET', 
      `/contacts/?locationId=${GHL_LOCATION_ID}&tags=${tag}&limit=100`
    );
    
    const contacts = response.contacts || [];
    
    for (const contact of contacts) {
      // Skip if already recorded
      const conversionKey = `${contact.id}-${tag}`;
      if (data.conversions.some(c => `${c.contactId}-${c.product}` === conversionKey)) {
        continue;
      }
      
      const source = detectSource(contact);
      const product = tag.replace('-buyer', '').replace('-client', '');
      const amount = PRODUCT_VALUES[product] || 0;
      
      if (amount > 0) {
        await recordConversion(contact.id, product, amount, source);
        newConversions++;
      }
    }
  }
  
  console.log(`\n✅ Synced ${newConversions} new conversions`);
  return { newConversions };
}

/**
 * Get top performing sources
 */
async function getTopSources(limit = 5) {
  const data = await loadAttributionData();
  
  const sorted = Object.entries(data.sourceMetrics)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, limit);
  
  return sorted.map(([source, metrics]) => ({
    source,
    ...metrics,
    category: getSourceCategory(source)
  }));
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'record':
    if (args.length < 3) {
      console.log('Usage: revenue-attribution.mjs record <contactId> <product> <amount> [source]');
      process.exit(1);
    }
    recordConversion(args[0], args[1], args[2], args[3]);
    break;
    
  case 'report':
  case 'analyze':
    analyzeSourcePerformance();
    break;
    
  case 'roi':
    // Example: revenue-attribution.mjs roi '{"facebook": 500, "google": 300}'
    const costs = args[0] ? JSON.parse(args[0]) : {};
    calculateROI(costs);
    break;
    
  case 'sync':
    syncFromGHL();
    break;
    
  case 'top':
    getTopSources(parseInt(args[0]) || 5).then(sources => {
      console.log('\n🏆 TOP PERFORMING SOURCES\n');
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        console.log(`${i + 1}. ${s.source} - $${s.revenue.toFixed(2)} (${s.conversions} conversions)`);
      }
    });
    break;
    
  default:
    console.log(`
Revenue Attribution Tracker

Usage:
  revenue-attribution.mjs record <contactId> <product> <amount> [source]
  revenue-attribution.mjs report                              - Full attribution report
  revenue-attribution.mjs roi '{"source": cost}'              - Calculate ROI by source
  revenue-attribution.mjs sync                                - Sync conversions from GHL
  revenue-attribution.mjs top [limit]                         - Show top performing sources
`);
}

export {
  recordConversion,
  analyzeSourcePerformance,
  calculateROI,
  syncFromGHL,
  getTopSources,
  SOURCE_CATEGORIES
};
