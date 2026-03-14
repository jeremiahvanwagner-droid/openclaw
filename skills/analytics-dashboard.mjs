#!/usr/bin/env node
/**
 * OpenClaw GHL Analytics Dashboard
 * 
 * Real-time metrics aggregation for Truth J Blue GHL operations.
 * Provides KPIs, funnel metrics, revenue tracking, and trend analysis.
 * 
 * Metrics Tracked:
 *   - Lead flow (new, qualified, converted)
 *   - Revenue (daily, weekly, monthly, by product)
 *   - Conversion rates (lead→buyer, buyer→course, course→intensive)
 *   - Pipeline velocity (avg days per stage)
 *   - Agent performance (response time, resolution rate)
 */

import https from 'https';
import fs from 'fs/promises';
import path from 'path';

// Configuration
const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const METRICS_FILE = path.join(DATA_DIR, 'analytics-metrics.json');

// KPI Targets
const KPI_TARGETS = {
  leadConversionRate: 8,      // % of leads to eBook buyers
  ebookToCourseRate: 15,      // % of eBook buyers to course
  courseToIntensiveRate: 10,  // % of course to intensive
  avgResponseTime: 5,         // minutes to first response
  dailyLeadTarget: 10,        // new leads per day
  weeklyRevenueTarget: 2000,  // $ weekly revenue
  monthlyRevenueTarget: 10000 // $ monthly revenue
};

// Value ladder pricing
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
 * Load stored metrics
 */
async function loadMetrics() {
  try {
    const data = await fs.readFile(METRICS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { 
      snapshots: [], 
      lastUpdated: null,
      historicalRevenue: [],
      historicalLeads: []
    };
  }
}

/**
 * Save metrics
 */
async function saveMetrics(metrics) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

/**
 * Get contact counts by tag
 */
async function getContactMetrics() {
  const tags = [
    'lead', 'scorecard-complete', 'ebook-buyer', 'course-buyer',
    'high-ticket-prospect', 'intensive-client', 'membership-active',
    'dormant-soul', 'awakening-soul', 'aligned-soul', 'empowered-soul', 'transcendent-soul'
  ];
  
  const counts = {};
  
  for (const tag of tags) {
    try {
      const response = await ghlRequest('GET', 
        `/contacts/?locationId=${GHL_LOCATION_ID}&tags=${tag}&limit=1`
      );
      counts[tag] = response.meta?.total || response.contacts?.length || 0;
    } catch {
      counts[tag] = 0;
    }
  }
  
  return counts;
}

/**
 * Get pipeline metrics
 */
async function getPipelineMetrics() {
  const response = await ghlRequest('GET', 
    `/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`
  );
  
  const pipelines = response.pipelines || [];
  const metrics = [];
  
  for (const pipeline of pipelines) {
    const pipelineMetrics = {
      id: pipeline.id,
      name: pipeline.name,
      stages: [],
      totalValue: 0,
      totalOpportunities: 0
    };
    
    // Get opportunities for this pipeline
    try {
      const opps = await ghlRequest('GET', 
        `/opportunities/?locationId=${GHL_LOCATION_ID}&pipelineId=${pipeline.id}&limit=100`
      );
      
      const opportunities = opps.opportunities || [];
      pipelineMetrics.totalOpportunities = opportunities.length;
      pipelineMetrics.totalValue = opportunities.reduce((sum, o) => sum + (o.monetaryValue || 0), 0);
      
      // Count by stage
      const stageCounts = {};
      for (const opp of opportunities) {
        const stageId = opp.pipelineStageId;
        stageCounts[stageId] = (stageCounts[stageId] || 0) + 1;
      }
      
      for (const stage of pipeline.stages || []) {
        pipelineMetrics.stages.push({
          id: stage.id,
          name: stage.name,
          count: stageCounts[stage.id] || 0
        });
      }
    } catch {
      // Pipeline may be empty
    }
    
    metrics.push(pipelineMetrics);
  }
  
  return metrics;
}

/**
 * Calculate conversion rates
 */
function calculateConversionRates(contactCounts) {
  const leads = contactCounts['lead'] || 0;
  const scorecardComplete = contactCounts['scorecard-complete'] || 0;
  const ebookBuyers = contactCounts['ebook-buyer'] || 0;
  const courseBuyers = contactCounts['course-buyer'] || 0;
  const intensiveClients = contactCounts['intensive-client'] || 0;
  
  return {
    leadToScorecard: leads > 0 ? ((scorecardComplete / leads) * 100).toFixed(1) : 0,
    leadToEbook: leads > 0 ? ((ebookBuyers / leads) * 100).toFixed(1) : 0,
    scorecardToEbook: scorecardComplete > 0 ? ((ebookBuyers / scorecardComplete) * 100).toFixed(1) : 0,
    ebookToCourse: ebookBuyers > 0 ? ((courseBuyers / ebookBuyers) * 100).toFixed(1) : 0,
    courseToIntensive: courseBuyers > 0 ? ((intensiveClients / courseBuyers) * 100).toFixed(1) : 0,
    overallConversion: leads > 0 ? ((ebookBuyers / leads) * 100).toFixed(1) : 0
  };
}

/**
 * Calculate alignment tier distribution
 */
function calculateTierDistribution(contactCounts) {
  const tiers = ['dormant-soul', 'awakening-soul', 'aligned-soul', 'empowered-soul', 'transcendent-soul'];
  const total = tiers.reduce((sum, tier) => sum + (contactCounts[tier] || 0), 0);
  
  return {
    dormant: { count: contactCounts['dormant-soul'] || 0, pct: total > 0 ? ((contactCounts['dormant-soul'] || 0) / total * 100).toFixed(1) : 0 },
    awakening: { count: contactCounts['awakening-soul'] || 0, pct: total > 0 ? ((contactCounts['awakening-soul'] || 0) / total * 100).toFixed(1) : 0 },
    aligned: { count: contactCounts['aligned-soul'] || 0, pct: total > 0 ? ((contactCounts['aligned-soul'] || 0) / total * 100).toFixed(1) : 0 },
    empowered: { count: contactCounts['empowered-soul'] || 0, pct: total > 0 ? ((contactCounts['empowered-soul'] || 0) / total * 100).toFixed(1) : 0 },
    transcendent: { count: contactCounts['transcendent-soul'] || 0, pct: total > 0 ? ((contactCounts['transcendent-soul'] || 0) / total * 100).toFixed(1) : 0 },
    total
  };
}

/**
 * Estimate revenue from contact counts
 */
function estimateRevenue(contactCounts) {
  const ebookRevenue = (contactCounts['ebook-buyer'] || 0) * PRODUCT_VALUES['ebook'];
  const courseRevenue = (contactCounts['course-buyer'] || 0) * PRODUCT_VALUES['course'];
  const intensiveRevenue = (contactCounts['intensive-client'] || 0) * PRODUCT_VALUES['intensive'];
  const membershipRevenue = (contactCounts['membership-active'] || 0) * PRODUCT_VALUES['operators-circle'];
  
  return {
    ebook: ebookRevenue,
    course: courseRevenue,
    intensive: intensiveRevenue,
    membership: membershipRevenue,
    total: ebookRevenue + courseRevenue + intensiveRevenue + membershipRevenue,
    mrr: membershipRevenue // Monthly Recurring Revenue
  };
}

/**
 * Compare metrics to KPI targets
 */
function evaluateKPIs(conversionRates, revenue) {
  return {
    leadConversion: {
      actual: parseFloat(conversionRates.leadToEbook),
      target: KPI_TARGETS.leadConversionRate,
      status: parseFloat(conversionRates.leadToEbook) >= KPI_TARGETS.leadConversionRate ? '✅' : '⚠️'
    },
    ebookToCourse: {
      actual: parseFloat(conversionRates.ebookToCourse),
      target: KPI_TARGETS.ebookToCourseRate,
      status: parseFloat(conversionRates.ebookToCourse) >= KPI_TARGETS.ebookToCourseRate ? '✅' : '⚠️'
    },
    monthlyRevenue: {
      actual: revenue.total,
      target: KPI_TARGETS.monthlyRevenueTarget,
      status: revenue.total >= KPI_TARGETS.monthlyRevenueTarget ? '✅' : '⚠️'
    }
  };
}

/**
 * Generate full dashboard snapshot
 */
async function generateDashboard() {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 OPENCLAW GHL ANALYTICS DASHBOARD');
  console.log('═'.repeat(70));
  console.log(`Generated: ${new Date().toLocaleString()}`);
  console.log('─'.repeat(70));
  
  // Fetch all metrics
  console.log('\n⏳ Fetching metrics from GHL...\n');
  
  const contactCounts = await getContactMetrics();
  const pipelineMetrics = await getPipelineMetrics();
  const conversionRates = calculateConversionRates(contactCounts);
  const tierDistribution = calculateTierDistribution(contactCounts);
  const revenueEstimate = estimateRevenue(contactCounts);
  const kpiStatus = evaluateKPIs(conversionRates, revenueEstimate);
  
  // Contact Overview
  console.log('👥 CONTACT FUNNEL');
  console.log('─'.repeat(40));
  console.log(`  Total Leads:        ${contactCounts['lead'] || 0}`);
  console.log(`  Scorecard Complete: ${contactCounts['scorecard-complete'] || 0}`);
  console.log(`  eBook Buyers:       ${contactCounts['ebook-buyer'] || 0}`);
  console.log(`  Course Buyers:      ${contactCounts['course-buyer'] || 0}`);
  console.log(`  Intensive Clients:  ${contactCounts['intensive-client'] || 0}`);
  console.log(`  Active Members:     ${contactCounts['membership-active'] || 0}`);
  
  // Alignment Tier Distribution
  console.log('\n🎯 ALIGNMENT TIER DISTRIBUTION');
  console.log('─'.repeat(40));
  console.log(`  🌑 Dormant:      ${tierDistribution.dormant.count} (${tierDistribution.dormant.pct}%)`);
  console.log(`  🌱 Awakening:    ${tierDistribution.awakening.count} (${tierDistribution.awakening.pct}%)`);
  console.log(`  ⭐ Aligned:      ${tierDistribution.aligned.count} (${tierDistribution.aligned.pct}%)`);
  console.log(`  🔥 Empowered:    ${tierDistribution.empowered.count} (${tierDistribution.empowered.pct}%)`);
  console.log(`  👑 Transcendent: ${tierDistribution.transcendent.count} (${tierDistribution.transcendent.pct}%)`);
  
  // Conversion Rates
  console.log('\n📈 CONVERSION RATES');
  console.log('─'.repeat(40));
  console.log(`  Lead → Scorecard:    ${conversionRates.leadToScorecard}%`);
  console.log(`  Lead → eBook:        ${conversionRates.leadToEbook}%`);
  console.log(`  Scorecard → eBook:   ${conversionRates.scorecardToEbook}%`);
  console.log(`  eBook → Course:      ${conversionRates.ebookToCourse}%`);
  console.log(`  Course → Intensive:  ${conversionRates.courseToIntensive}%`);
  
  // Revenue
  console.log('\n💰 REVENUE ESTIMATE (Lifetime)');
  console.log('─'.repeat(40));
  console.log(`  eBook Revenue:       $${revenueEstimate.ebook.toFixed(2)}`);
  console.log(`  Course Revenue:      $${revenueEstimate.course.toFixed(2)}`);
  console.log(`  Intensive Revenue:   $${revenueEstimate.intensive.toFixed(2)}`);
  console.log(`  Membership MRR:      $${revenueEstimate.mrr.toFixed(2)}/mo`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Total Lifetime:      $${revenueEstimate.total.toFixed(2)}`);
  
  // KPI Status
  console.log('\n🎯 KPI STATUS');
  console.log('─'.repeat(40));
  console.log(`  ${kpiStatus.leadConversion.status} Lead Conversion: ${kpiStatus.leadConversion.actual}% (target: ${kpiStatus.leadConversion.target}%)`);
  console.log(`  ${kpiStatus.ebookToCourse.status} eBook→Course: ${kpiStatus.ebookToCourse.actual}% (target: ${kpiStatus.ebookToCourse.target}%)`);
  console.log(`  ${kpiStatus.monthlyRevenue.status} Revenue: $${kpiStatus.monthlyRevenue.actual.toFixed(0)} (target: $${kpiStatus.monthlyRevenue.target})`);
  
  // Pipeline Summary
  console.log('\n📊 PIPELINE SUMMARY');
  console.log('─'.repeat(40));
  for (const pipeline of pipelineMetrics) {
    console.log(`  ${pipeline.name}:`);
    console.log(`    Opportunities: ${pipeline.totalOpportunities}`);
    console.log(`    Total Value:   $${pipeline.totalValue.toFixed(2)}`);
    if (pipeline.stages.length > 0) {
      const topStages = pipeline.stages.filter(s => s.count > 0).slice(0, 3);
      for (const stage of topStages) {
        console.log(`      - ${stage.name}: ${stage.count}`);
      }
    }
  }
  
  console.log('\n' + '═'.repeat(70));
  
  // Save snapshot
  const metrics = await loadMetrics();
  const snapshot = {
    timestamp: new Date().toISOString(),
    contactCounts,
    conversionRates,
    tierDistribution,
    revenueEstimate,
    pipelineMetrics,
    kpiStatus
  };
  
  metrics.snapshots.unshift(snapshot);
  metrics.snapshots = metrics.snapshots.slice(0, 100); // Keep last 100 snapshots
  metrics.lastUpdated = snapshot.timestamp;
  
  await saveMetrics(metrics);
  
  return snapshot;
}

/**
 * Get trend analysis
 */
async function getTrends(days = 7) {
  const metrics = await loadMetrics();
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const recentSnapshots = metrics.snapshots.filter(s => 
    new Date(s.timestamp).getTime() > cutoff
  );
  
  if (recentSnapshots.length < 2) {
    console.log('Not enough data for trend analysis. Need at least 2 snapshots.');
    return null;
  }
  
  const oldest = recentSnapshots[recentSnapshots.length - 1];
  const newest = recentSnapshots[0];
  
  console.log('\n📈 TREND ANALYSIS (' + days + ' days)');
  console.log('═'.repeat(50));
  
  // Contact growth
  const leadGrowth = (newest.contactCounts['lead'] || 0) - (oldest.contactCounts['lead'] || 0);
  const buyerGrowth = (newest.contactCounts['ebook-buyer'] || 0) - (oldest.contactCounts['ebook-buyer'] || 0);
  const courseGrowth = (newest.contactCounts['course-buyer'] || 0) - (oldest.contactCounts['course-buyer'] || 0);
  
  console.log(`\n👥 Contact Growth:`);
  console.log(`  Leads:        ${leadGrowth >= 0 ? '+' : ''}${leadGrowth}`);
  console.log(`  eBook Buyers: ${buyerGrowth >= 0 ? '+' : ''}${buyerGrowth}`);
  console.log(`  Course Buyers: ${courseGrowth >= 0 ? '+' : ''}${courseGrowth}`);
  
  // Revenue growth
  const revenueGrowth = newest.revenueEstimate.total - oldest.revenueEstimate.total;
  console.log(`\n💰 Revenue Growth: ${revenueGrowth >= 0 ? '+' : ''}$${revenueGrowth.toFixed(2)}`);
  
  // Conversion rate changes
  const convGrowth = parseFloat(newest.conversionRates.leadToEbook) - parseFloat(oldest.conversionRates.leadToEbook);
  console.log(`\n📊 Conversion Rate: ${convGrowth >= 0 ? '+' : ''}${convGrowth.toFixed(1)}%`);
  
  return {
    period: days,
    leadGrowth,
    buyerGrowth,
    courseGrowth,
    revenueGrowth,
    conversionChange: convGrowth
  };
}

/**
 * Export metrics as JSON
 */
async function exportMetrics() {
  const snapshot = await generateDashboard();
  console.log('\n📤 JSON Export:');
  console.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'dashboard':
  case 'dash':
    generateDashboard();
    break;
    
  case 'trends':
    getTrends(parseInt(args[0]) || 7);
    break;
    
  case 'export':
    exportMetrics();
    break;
    
  case 'kpis':
    generateDashboard().then(snapshot => {
      console.log('\n🎯 KPI DETAILS:');
      console.log(JSON.stringify(snapshot.kpiStatus, null, 2));
    });
    break;
    
  default:
    console.log(`
GHL Analytics Dashboard

Usage:
  analytics-dashboard.mjs dashboard     - Generate full dashboard
  analytics-dashboard.mjs dash          - Alias for dashboard
  analytics-dashboard.mjs trends [days] - Show trend analysis
  analytics-dashboard.mjs export        - Export metrics as JSON
  analytics-dashboard.mjs kpis          - Show KPI status
`);
}

export { 
  generateDashboard, 
  getTrends, 
  getContactMetrics, 
  getPipelineMetrics,
  KPI_TARGETS,
  PRODUCT_VALUES
};
