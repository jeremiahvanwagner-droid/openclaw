#!/usr/bin/env node
/**
 * OpenClaw Weekly Performance Report Generator
 * 
 * Comprehensive weekly report combining:
 *   - GHL metrics (contacts, conversion, revenue)
 *   - Attribution analysis
 *   - Agent performance
 *   - Lead scoring insights
 *   - Recommendations for next week
 */

import path from 'path';
import fs from 'fs/promises';
import https from 'https';
import { openclawSend } from '../lib/safe-exec.mjs';

// Configuration
const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SKILLS_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'workspace', 'skills');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

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
 * Load data from skill modules
 */
async function loadSkillData(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    const data = await fs.readFile(filepath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Send Telegram message
 */
async function sendTelegram(message) {
  try {
    await openclawSend({ agent: 'main', channel: 'telegram', to: TELEGRAM_CHAT_ID, message });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate weekly report
 */
async function generateWeeklyReport() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  
  console.log('\n' + '═'.repeat(80));
  console.log('📊 TRUTH J BLUE LLC - WEEKLY PERFORMANCE REPORT');
  console.log('═'.repeat(80));
  console.log(`Report Period: ${weekStart.toLocaleDateString()} - ${now.toLocaleDateString()}`);
  console.log(`Generated: ${now.toLocaleString()}`);
  console.log('─'.repeat(80));
  
  const report = {
    generatedAt: now.toISOString(),
    periodStart: weekStart.toISOString(),
    periodEnd: now.toISOString(),
    sections: {}
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: FUNNEL METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n📈 FUNNEL METRICS\n');
  
  const tags = ['lead', 'scorecard-complete', 'ebook-buyer', 'course-buyer', 'intensive-client'];
  const contactCounts = {};
  
  for (const tag of tags) {
    try {
      const response = await ghlRequest('GET', 
        `/contacts/?locationId=${GHL_LOCATION_ID}&tags=${tag}&limit=1`
      );
      contactCounts[tag] = response.meta?.total || 0;
    } catch {
      contactCounts[tag] = 0;
    }
  }
  
  const funnel = {
    leads: contactCounts['lead'] || 0,
    scorecardComplete: contactCounts['scorecard-complete'] || 0,
    ebookBuyers: contactCounts['ebook-buyer'] || 0,
    courseBuyers: contactCounts['course-buyer'] || 0,
    intensiveClients: contactCounts['intensive-client'] || 0
  };
  
  console.log(`  Total Leads:           ${funnel.leads}`);
  console.log(`  Scorecard Completions: ${funnel.scorecardComplete}`);
  console.log(`  eBook Buyers:          ${funnel.ebookBuyers}`);
  console.log(`  Course Buyers:         ${funnel.courseBuyers}`);
  console.log(`  Intensive Clients:     ${funnel.intensiveClients}`);
  
  // Conversion rates
  const conversionRates = {
    leadToScorecard: funnel.leads > 0 ? (funnel.scorecardComplete / funnel.leads * 100).toFixed(1) : 0,
    scorecardToEbook: funnel.scorecardComplete > 0 ? (funnel.ebookBuyers / funnel.scorecardComplete * 100).toFixed(1) : 0,
    ebookToCourse: funnel.ebookBuyers > 0 ? (funnel.courseBuyers / funnel.ebookBuyers * 100).toFixed(1) : 0,
    courseToIntensive: funnel.courseBuyers > 0 ? (funnel.intensiveClients / funnel.courseBuyers * 100).toFixed(1) : 0
  };
  
  console.log('\n  CONVERSION RATES:');
  console.log(`    Lead → Scorecard:     ${conversionRates.leadToScorecard}%`);
  console.log(`    Scorecard → eBook:    ${conversionRates.scorecardToEbook}%`);
  console.log(`    eBook → Course:       ${conversionRates.ebookToCourse}%`);
  console.log(`    Course → Intensive:   ${conversionRates.courseToIntensive}%`);
  
  report.sections.funnel = { ...funnel, conversionRates };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: REVENUE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n💰 REVENUE ANALYSIS\n');
  
  const revenue = {
    ebook: funnel.ebookBuyers * 9.95,
    course: funnel.courseBuyers * 297,
    intensive: funnel.intensiveClients * 2497,
    total: 0
  };
  revenue.total = revenue.ebook + revenue.course + revenue.intensive;
  
  console.log(`  eBook Revenue:      $${revenue.ebook.toFixed(2)}`);
  console.log(`  Course Revenue:     $${revenue.course.toFixed(2)}`);
  console.log(`  Intensive Revenue:  $${revenue.intensive.toFixed(2)}`);
  console.log(`  ─────────────────────────`);
  console.log(`  TOTAL LIFETIME:     $${revenue.total.toFixed(2)}`);
  
  // Revenue attribution data
  const attributionData = await loadSkillData('revenue-attribution.json');
  if (attributionData?.sourceMetrics) {
    console.log('\n  TOP REVENUE SOURCES:');
    const sources = Object.entries(attributionData.sourceMetrics)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);
    
    for (const [source, metrics] of sources) {
      console.log(`    ${source.padEnd(15)} $${metrics.revenue.toFixed(2)} (${metrics.conversions} conversions)`);
    }
    
    report.sections.attribution = attributionData.sourceMetrics;
  }
  
  report.sections.revenue = revenue;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: PIPELINE HEALTH
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n📊 PIPELINE HEALTH\n');
  
  const pipelinesResponse = await ghlRequest('GET', 
    `/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`
  );
  
  const pipelineHealth = [];
  
  for (const pipeline of pipelinesResponse.pipelines || []) {
    const oppsResponse = await ghlRequest('GET', 
      `/opportunities/?locationId=${GHL_LOCATION_ID}&pipelineId=${pipeline.id}&limit=100`
    );
    
    const opportunities = oppsResponse.opportunities || [];
    const totalValue = opportunities.reduce((sum, o) => sum + (o.monetaryValue || 0), 0);
    
    const pipelineData = {
      name: pipeline.name,
      opportunities: opportunities.length,
      totalValue,
      stages: {}
    };
    
    // Count by stage
    for (const opp of opportunities) {
      const stageName = pipeline.stages?.find(s => s.id === opp.pipelineStageId)?.name || 'Unknown';
      pipelineData.stages[stageName] = (pipelineData.stages[stageName] || 0) + 1;
    }
    
    pipelineHealth.push(pipelineData);
    
    console.log(`  ${pipeline.name}:`);
    console.log(`    Opportunities: ${opportunities.length}`);
    console.log(`    Total Value:   $${totalValue.toFixed(2)}`);
  }
  
  report.sections.pipelineHealth = pipelineHealth;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: AGENT PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🤖 AGENT PERFORMANCE\n');
  
  const perfData = await loadSkillData('agent-performance.json');
  
  if (perfData?.agents) {
    console.log('  Agent'.padEnd(14) + 'Sessions'.padStart(10) + 'Turns'.padStart(10) + 'Success'.padStart(10) + 'Avg Time'.padStart(12));
    console.log('  ' + '─'.repeat(54));
    
    for (const [agentId, metrics] of Object.entries(perfData.agents)) {
      console.log(
        '  ' + agentId.padEnd(12) +
        (metrics.sessions || 0).toString().padStart(10) +
        (metrics.turns || 0).toString().padStart(10) +
        ((metrics.successRate || '100') + '%').padStart(10) +
        ((metrics.avgResponseTime || 0) + 'ms').padStart(12)
      );
    }
    
    report.sections.agentPerformance = perfData.agents;
  } else {
    console.log('  No agent performance data available. Run: agent-performance.mjs collect');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: HOT LEADS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🔥 HOT LEADS (Predictive Score 70+)\n');
  
  const scoringData = await loadSkillData('predictive-scores.json');
  
  if (scoringData?.scores) {
    const hotLeads = Object.values(scoringData.scores)
      .filter(s => s.totalScore >= 70)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
    
    if (hotLeads.length > 0) {
      for (const lead of hotLeads) {
        console.log(`  ${lead.grade} ${lead.name.padEnd(25)} ${lead.totalScore}/100`);
        console.log(`     → ${lead.recommendedAction}`);
      }
      
      report.sections.hotLeads = hotLeads;
    } else {
      console.log('  No hot leads found. Run: predictive-scoring.mjs all');
    }
  } else {
    console.log('  No scoring data available. Run: predictive-scoring.mjs all');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: CRON JOB STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n⏰ AUTOMATION STATUS\n');
  
  try {
    const { stdout } = await execAsync('openclaw cron list 2>&1');
    const cronLines = stdout.split('\n').filter(line => 
      line.includes('every') || line.includes('cron')
    );
    
    const activeCrons = cronLines.length;
    console.log(`  Active Cron Jobs: ${activeCrons}`);
    
    // Check for failed jobs (would contain 'error' or 'fail')
    const failedJobs = cronLines.filter(l => l.toLowerCase().includes('error')).length;
    console.log(`  Failed Jobs: ${failedJobs}`);
    
    report.sections.automation = { activeCrons, failedJobs };
  } catch {
    console.log('  Unable to fetch cron status');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n💡 RECOMMENDATIONS FOR NEXT WEEK\n');
  
  const recommendations = [];
  
  // Conversion rate recommendations
  if (parseFloat(conversionRates.leadToScorecard) < 30) {
    recommendations.push('📊 Low scorecard completion rate. Optimize lead magnet and CTA placement.');
  }
  
  if (parseFloat(conversionRates.scorecardToEbook) < 10) {
    recommendations.push('📚 Low scorecard-to-eBook conversion. Review result pages and offer presentation.');
  }
  
  if (parseFloat(conversionRates.ebookToCourse) < 5) {
    recommendations.push('🎓 Low eBook-to-Course conversion. Extend nurture sequence or add testimonials.');
  }
  
  // Revenue recommendations
  if (revenue.intensive === 0) {
    recommendations.push('💰 No intensive sales. Focus on qualifying course buyers for high-ticket.');
  }
  
  // Hot lead recommendations
  if (scoringData?.scores) {
    const urgentLeads = Object.values(scoringData.scores).filter(s => s.totalScore >= 85).length;
    if (urgentLeads > 0) {
      recommendations.push(`🔥 ${urgentLeads} leads with 85+ score need immediate follow-up!`);
    }
  }
  
  // Default recommendation if all is well
  if (recommendations.length === 0) {
    recommendations.push('✅ All metrics healthy. Continue current strategies.');
    recommendations.push('📈 Consider testing new traffic source or offer variation.');
  }
  
  for (const rec of recommendations) {
    console.log(`  ${rec}`);
  }
  
  report.sections.recommendations = recommendations;
  
  console.log('\n' + '═'.repeat(80));
  
  // Save report
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const reportFile = path.join(REPORTS_DIR, `weekly-report-${now.toISOString().split('T')[0]}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  
  console.log(`\n📄 Report saved: ${reportFile}`);
  
  return report;
}

/**
 * Generate summary for Telegram
 */
async function generateTelegramSummary() {
  const report = await generateWeeklyReport();
  
  const funnel = report.sections.funnel;
  const revenue = report.sections.revenue;
  const hotLeads = report.sections.hotLeads?.length || 0;
  const recs = report.sections.recommendations?.slice(0, 3) || [];
  
  let message = `📊 WEEKLY PERFORMANCE REPORT\n`;
  message += `${new Date().toLocaleDateString()}\n\n`;
  
  message += `📈 FUNNEL\n`;
  message += `• Leads: ${funnel.leads}\n`;
  message += `• eBook Buyers: ${funnel.ebookBuyers}\n`;
  message += `• Course Buyers: ${funnel.courseBuyers}\n\n`;
  
  message += `💰 REVENUE\n`;
  message += `• Total: $${revenue.total.toFixed(2)}\n\n`;
  
  if (hotLeads > 0) {
    message += `🔥 ${hotLeads} hot leads need follow-up!\n\n`;
  }
  
  message += `💡 TOP ACTIONS\n`;
  for (const rec of recs) {
    message += `${rec}\n`;
  }
  
  // Send to Telegram
  const sent = await sendTelegram(message);
  
  if (sent) {
    console.log('\n✅ Summary sent to Telegram');
  } else {
    console.log('\n⚠️ Failed to send to Telegram');
  }
  
  return message;
}

/**
 * List previous reports
 */
async function listReports() {
  try {
    const files = await fs.readdir(REPORTS_DIR);
    const reports = files.filter(f => f.startsWith('weekly-report'));
    
    console.log('\n📁 PREVIOUS REPORTS\n');
    
    for (const file of reports.sort().reverse().slice(0, 10)) {
      console.log(`  ${file}`);
    }
    
    return reports;
  } catch {
    console.log('No previous reports found.');
    return [];
  }
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'generate':
  case 'report':
    generateWeeklyReport();
    break;
    
  case 'telegram':
  case 'summary':
    generateTelegramSummary();
    break;
    
  case 'list':
    listReports();
    break;
    
  default:
    console.log(`
Weekly Performance Report Generator

Usage:
  weekly-report.mjs generate          - Generate full weekly report
  weekly-report.mjs telegram          - Generate and send summary to Telegram
  weekly-report.mjs list              - List previous reports
`);
}

export { generateWeeklyReport, generateTelegramSummary };
