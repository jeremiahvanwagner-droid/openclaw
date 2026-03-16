#!/usr/bin/env node
/**
 * OpenClaw Predictive Lead Scoring Engine
 * 
 * Advanced lead scoring using behavioral signals, engagement patterns,
 * and historical conversion data to predict purchase likelihood.
 * 
 * Scoring Factors:
 *   - Demographic fit (alignment tier, source quality)
 *   - Behavioral signals (page visits, time on site, email engagement)
 *   - Engagement velocity (speed of progression through funnel)
 *   - Historical patterns (similar leads who converted)
 */

import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { openclawSend } from '../lib/safe-exec.mjs';

// Configuration
const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SCORING_FILE = path.join(DATA_DIR, 'predictive-scores.json');

// Scoring weights (sum to ~100)
const SCORING_WEIGHTS = {
  alignmentTier: 25,        // Alignment assessment score
  sourceQuality: 15,        // Quality of lead source
  engagementLevel: 20,      // Email/SMS engagement
  velocityScore: 15,        // Speed through funnel
  behaviorSignals: 15,      // Page visits, clicks
  recency: 10               // Days since last activity
};

// Source quality scores
const SOURCE_QUALITY = {
  'organic': 80,
  'referral': 90,
  'affiliate': 75,
  'facebook': 60,
  'google': 70,
  'youtube': 75,
  'podcast': 85,
  'webinar': 90,
  'direct': 50,
  'unknown': 40
};

// Alignment tier base scores
const TIER_SCORES = {
  'transcendent-soul': 100,
  'empowered-soul': 80,
  'aligned-soul': 60,
  'awakening-soul': 40,
  'dormant-soul': 20
};

// Behavior signal weights
const BEHAVIOR_WEIGHTS = {
  'visited-sales-page': 15,
  'clicked-link': 10,
  'opened-email': 8,
  'replied': 20,
  'watched-video': 12,
  'downloaded-resource': 10,
  'attended-webinar': 25,
  'booked-call': 30,
  'added-to-cart': 25
};

/**
 * Make GHL API request
 */
function ghlRequest(method, urlPath, data = null) {
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
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Load scoring data
 */
async function loadScoringData() {
  try {
    const data = await fs.readFile(SCORING_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { 
      scores: {},
      conversions: [],
      patterns: {},
      lastUpdated: null
    };
  }
}

/**
 * Save scoring data
 */
async function saveScoringData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SCORING_FILE, JSON.stringify(data, null, 2));
}

/**
 * Calculate alignment tier score
 */
function calculateAlignmentScore(tags) {
  for (const [tier, score] of Object.entries(TIER_SCORES)) {
    if (tags.includes(tier)) {
      return score;
    }
  }
  return 30; // Default for unscored
}

/**
 * Calculate source quality score
 */
function calculateSourceScore(source) {
  const lowerSource = (source || 'unknown').toLowerCase();
  
  for (const [key, score] of Object.entries(SOURCE_QUALITY)) {
    if (lowerSource.includes(key)) {
      return score;
    }
  }
  
  return SOURCE_QUALITY['unknown'];
}

/**
 * Calculate engagement score from tags
 */
function calculateEngagementScore(tags) {
  let score = 0;
  
  for (const [behavior, weight] of Object.entries(BEHAVIOR_WEIGHTS)) {
    if (tags.some(t => t.toLowerCase().includes(behavior.replace('-', '')))) {
      score += weight;
    }
  }
  
  return Math.min(score, 100);
}

/**
 * Calculate velocity score (how fast they're moving through funnel)
 */
function calculateVelocityScore(contact) {
  const customFields = contact.customFields || [];
  
  // Get dates
  const createdAt = new Date(contact.dateAdded || contact.createdAt);
  const now = new Date();
  const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
  
  const tags = contact.tags || [];
  let funnelStages = 0;
  
  if (tags.includes('scorecard-complete')) funnelStages++;
  if (tags.includes('ebook-buyer')) funnelStages += 2;
  if (tags.includes('course-buyer')) funnelStages += 3;
  if (tags.includes('intensive-client')) funnelStages += 4;
  
  if (daysSinceCreation === 0 || funnelStages === 0) {
    return 50; // Default
  }
  
  // Ideal velocity: 1 stage per 3-5 days
  const velocity = funnelStages / daysSinceCreation;
  
  if (velocity > 0.3) return 100; // Very fast
  if (velocity > 0.2) return 85;
  if (velocity > 0.1) return 70;
  if (velocity > 0.05) return 55;
  return 40; // Slow
}

/**
 * Calculate recency score
 */
function calculateRecencyScore(contact) {
  const lastActivity = new Date(contact.lastActivity || contact.updatedAt || contact.dateAdded);
  const now = new Date();
  const daysSince = (now - lastActivity) / (1000 * 60 * 60 * 24);
  
  if (daysSince < 1) return 100;
  if (daysSince < 3) return 90;
  if (daysSince < 7) return 75;
  if (daysSince < 14) return 60;
  if (daysSince < 30) return 45;
  if (daysSince < 60) return 30;
  return 15; // Cold lead
}

/**
 * Calculate predictive score for a contact
 */
async function calculatePredictiveScore(contactId) {
  const response = await ghlRequest('GET', `/contacts/${contactId}`);
  const contact = response.contact || response;
  
  if (!contact.id) {
    throw new Error('Contact not found');
  }
  
  const tags = contact.tags || [];
  const source = contact.source || 'unknown';
  
  // Calculate component scores
  const scores = {
    alignmentTier: calculateAlignmentScore(tags),
    sourceQuality: calculateSourceScore(source),
    engagementLevel: calculateEngagementScore(tags),
    velocityScore: calculateVelocityScore(contact),
    recency: calculateRecencyScore(contact)
  };
  
  // Calculate behavior signals from tags
  scores.behaviorSignals = 0;
  for (const [behavior, weight] of Object.entries(BEHAVIOR_WEIGHTS)) {
    const behaviorNormalized = behavior.replace(/-/g, '');
    if (tags.some(t => t.toLowerCase().replace(/-/g, '').includes(behaviorNormalized))) {
      scores.behaviorSignals += weight;
    }
  }
  scores.behaviorSignals = Math.min(scores.behaviorSignals, 100);
  
  // Calculate weighted total
  let totalScore = 0;
  for (const [factor, weight] of Object.entries(SCORING_WEIGHTS)) {
    totalScore += (scores[factor] || 0) * (weight / 100);
  }
  
  totalScore = Math.round(totalScore);
  
  // Determine grade
  let grade;
  if (totalScore >= 85) grade = 'A';
  else if (totalScore >= 70) grade = 'B';
  else if (totalScore >= 55) grade = 'C';
  else if (totalScore >= 40) grade = 'D';
  else grade = 'F';
  
  // Determine recommended action
  let recommendedAction;
  if (totalScore >= 85) {
    recommendedAction = 'IMMEDIATE FOLLOW-UP - High-ticket offer';
  } else if (totalScore >= 70) {
    recommendedAction = 'Schedule call - Course offer';
  } else if (totalScore >= 55) {
    recommendedAction = 'Continue nurture - eBook offer';
  } else if (totalScore >= 40) {
    recommendedAction = 'Re-engage with value content';
  } else {
    recommendedAction = 'Long-term nurture - Add to general list';
  }
  
  return {
    contactId,
    name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
    email: contact.email,
    totalScore,
    grade,
    components: scores,
    recommendedAction,
    tags,
    source,
    calculatedAt: new Date().toISOString()
  };
}

/**
 * Score all leads and identify hot leads
 */
async function scoreAllLeads() {
  console.log('⏳ Scoring all leads...\n');
  
  const response = await ghlRequest('GET', 
    `/contacts/?locationId=${GHL_LOCATION_ID}&limit=100`
  );
  
  const contacts = response.contacts || [];
  const scores = [];
  
  for (const contact of contacts) {
    try {
      const score = await calculatePredictiveScore(contact.id);
      scores.push(score);
      
      // Update contact with score
      await ghlRequest('PUT', `/contacts/${contact.id}`, {
        customFields: [
          { key: 'predictive_score', value: score.totalScore.toString() },
          { key: 'lead_grade', value: score.grade },
          { key: 'score_date', value: score.calculatedAt }
        ]
      });
      
      console.log(`  ${score.grade} ${score.name.padEnd(25)} ${score.totalScore}/100`);
    } catch (error) {
      console.log(`  ❌ Error scoring ${contact.firstName}: ${error.message}`);
    }
  }
  
  // Save scores
  const scoringData = await loadScoringData();
  for (const score of scores) {
    scoringData.scores[score.contactId] = score;
  }
  scoringData.lastUpdated = new Date().toISOString();
  await saveScoringData(scoringData);
  
  // Sort by score
  scores.sort((a, b) => b.totalScore - a.totalScore);
  
  // Report hot leads
  const hotLeads = scores.filter(s => s.totalScore >= 70);
  
  if (hotLeads.length > 0) {
    console.log(`\n🔥 HOT LEADS (${hotLeads.length}):\n`);
    for (const lead of hotLeads.slice(0, 10)) {
      console.log(`  ${lead.grade} ${lead.name.padEnd(20)} ${lead.totalScore}/100 - ${lead.recommendedAction}`);
    }
  }
  
  return { total: scores.length, hotLeads: hotLeads.length, scores };
}

/**
 * Get hot leads ready for action
 */
async function getHotLeads(minScore = 70) {
  const scoringData = await loadScoringData();
  
  const hotLeads = Object.values(scoringData.scores)
    .filter(s => s.totalScore >= minScore)
    .sort((a, b) => b.totalScore - a.totalScore);
  
  return hotLeads;
}

/**
 * Alert on high-score leads
 */
async function alertHotLeads() {
  const hotLeads = await getHotLeads(85);
  
  if (hotLeads.length === 0) {
    console.log('No hot leads found (85+ score)');
    return;
  }
  
  console.log(`🔥 ${hotLeads.length} HOT LEADS REQUIRING ATTENTION:\n`);
  
  let message = `🔥 HOT LEADS ALERT!\n\n`;
  
  for (const lead of hotLeads.slice(0, 5)) {
    const summary = `${lead.grade} ${lead.name} (${lead.totalScore}/100)`;
    console.log(`  ${summary}`);
    console.log(`     → ${lead.recommendedAction}`);
    message += `• ${lead.name}: ${lead.totalScore}/100\n  ${lead.recommendedAction}\n`;
  }
  
  if (hotLeads.length > 5) {
    message += `\n...and ${hotLeads.length - 5} more`;
  }
  
  // Send Telegram alert
  try {
    await openclawSend({ agent: 'main', channel: 'telegram', to: TELEGRAM_CHAT_ID, message });
    console.log('\n✅ Alert sent to Telegram');
  } catch (error) {
    console.log('\n⚠️ Failed to send Telegram alert');
  }
}

/**
 * Get score breakdown for a contact
 */
async function getScoreBreakdown(contactId) {
  const score = await calculatePredictiveScore(contactId);
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 PREDICTIVE SCORE BREAKDOWN');
  console.log('═'.repeat(60));
  console.log(`Contact: ${score.name} (${score.email})`);
  console.log(`Overall Score: ${score.totalScore}/100 (Grade: ${score.grade})`);
  console.log('─'.repeat(60));
  
  console.log('\n📈 COMPONENT SCORES:\n');
  
  for (const [component, value] of Object.entries(score.components)) {
    const weight = SCORING_WEIGHTS[component] || 0;
    const contribution = Math.round(value * (weight / 100));
    const bar = '█'.repeat(Math.round(value / 10)) + '░'.repeat(10 - Math.round(value / 10));
    
    console.log(`  ${component.padEnd(18)} ${bar} ${value}/100 (weight: ${weight}%, +${contribution})`);
  }
  
  console.log(`\n🎯 RECOMMENDED ACTION:\n  ${score.recommendedAction}`);
  
  console.log(`\n🏷️ TAGS: ${score.tags.join(', ') || 'None'}`);
  console.log(`📍 SOURCE: ${score.source}`);
  
  console.log('\n' + '═'.repeat(60));
  
  return score;
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'score':
    if (!args[0]) {
      console.log('Usage: predictive-scoring.mjs score <contactId>');
      process.exit(1);
    }
    getScoreBreakdown(args[0]);
    break;
    
  case 'all':
    scoreAllLeads();
    break;
    
  case 'hot':
    getHotLeads(parseInt(args[0]) || 70).then(leads => {
      console.log(`\n🔥 HOT LEADS (score >= ${args[0] || 70}):\n`);
      for (const lead of leads.slice(0, 20)) {
        console.log(`  ${lead.grade} ${lead.name.padEnd(20)} ${lead.totalScore}/100`);
        console.log(`     → ${lead.recommendedAction}`);
      }
      console.log(`\nTotal: ${leads.length} hot leads`);
    });
    break;
    
  case 'alert':
    alertHotLeads();
    break;
    
  case 'weights':
    console.log('\n📊 SCORING WEIGHTS:\n');
    for (const [factor, weight] of Object.entries(SCORING_WEIGHTS)) {
      console.log(`  ${factor.padEnd(20)} ${weight}%`);
    }
    break;
    
  default:
    console.log(`
Predictive Lead Scoring Engine

Usage:
  predictive-scoring.mjs score <contactId>   - Get detailed score breakdown
  predictive-scoring.mjs all                 - Score all leads
  predictive-scoring.mjs hot [minScore]      - List hot leads
  predictive-scoring.mjs alert               - Alert on hot leads
  predictive-scoring.mjs weights             - Show scoring weights
`);
}

export {
  calculatePredictiveScore,
  scoreAllLeads,
  getHotLeads,
  alertHotLeads,
  SCORING_WEIGHTS,
  SOURCE_QUALITY,
  TIER_SCORES
};
