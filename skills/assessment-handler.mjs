#!/usr/bin/env node
/**
 * OpenClaw Divine Alignment Assessment Handler
 * 
 * Processes scorecard submissions, calculates alignment tier,
 * routes to results pages, and triggers appropriate nurture sequences.
 * 
 * Alignment Tiers:
 *   0-20:  DORMANT        — Needs awakening content
 *   21-40: AWAKENING      — Ready for foundational resources
 *   41-60: ALIGNED        — Primed for eBook offer
 *   61-80: EMPOWERED      — Ready for course offer
 *   81-100: TRANSCENDENT  — High-ticket candidate
 */

import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Configuration
const GHL_API_KEY = process.env.GHL_TOKEN || process.env.GHL_PRIVATE_INTEGRATION_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || process.env.GHL_LOCATION_ID_TJB || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ALERT_CHAT_ID || '7737707872';

// Alignment Tier Configuration
const ALIGNMENT_TIERS = {
  DORMANT: {
    range: [0, 20],
    tag: 'dormant-soul',
    resultPage: '/alignment-results/dormant',
    nurture: 'awakening-sequence',
    offer: 'free-content',
    description: 'Soul seeking first spark of awareness'
  },
  AWAKENING: {
    range: [21, 40],
    tag: 'awakening-soul',
    resultPage: '/alignment-results/awakening',
    nurture: 'foundation-sequence',
    offer: 'free-lead-magnet',
    description: 'Recognizing the path, beginning to walk'
  },
  ALIGNED: {
    range: [41, 60],
    tag: 'aligned-soul',
    resultPage: '/alignment-results/aligned',
    nurture: 'ebook-nurture',
    offer: 'ebook-offer',
    description: 'Walking in purpose, ready for deeper wisdom'
  },
  EMPOWERED: {
    range: [61, 80],
    tag: 'empowered-soul',
    resultPage: '/alignment-results/empowered',
    nurture: 'course-nurture',
    offer: 'course-offer',
    description: 'Operating in purpose, ready for mastery'
  },
  TRANSCENDENT: {
    range: [81, 100],
    tag: 'transcendent-soul',
    resultPage: '/alignment-results/transcendent',
    nurture: 'high-ticket-nurture',
    offer: 'implementation-intensive',
    description: 'Living in full alignment, ready for transformation'
  }
};

// Scoring weights for different question categories
const QUESTION_WEIGHTS = {
  purpose_clarity: 2.5,      // "I know my purpose"
  daily_alignment: 2.0,      // "My daily actions align with my purpose"
  spiritual_practice: 1.5,   // "I have a consistent spiritual practice"
  relationship_health: 1.5,  // "My relationships support my growth"
  financial_alignment: 2.0,  // "My income reflects my value"
  impact_feeling: 1.5,       // "I feel I'm making an impact"
  vision_clarity: 2.0,       // "I have a clear 3-year vision"
  action_consistency: 2.0,   // "I take consistent action on my goals"
  inner_peace: 1.5,          // "I feel peace about my direction"
  growth_commitment: 1.5     // "I'm committed to growth"
};

/**
 * Calculate alignment tier from raw score
 */
function calculateTier(score) {
  const numScore = parseInt(score) || 0;
  
  for (const [tier, config] of Object.entries(ALIGNMENT_TIERS)) {
    if (numScore >= config.range[0] && numScore <= config.range[1]) {
      return {
        tier,
        score: numScore,
        ...config
      };
    }
  }
  
  // Default to DORMANT if score is out of range
  return {
    tier: 'DORMANT',
    score: numScore,
    ...ALIGNMENT_TIERS.DORMANT
  };
}

/**
 * Calculate weighted score from individual question responses
 */
function calculateWeightedScore(responses) {
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const [question, weight] of Object.entries(QUESTION_WEIGHTS)) {
    if (responses[question] !== undefined) {
      const value = parseInt(responses[question]) || 0;
      weightedSum += value * weight;
      totalWeight += weight * 10; // Max 10 per question
    }
  }
  
  if (totalWeight === 0) return 0;
  
  // Normalize to 0-100 scale
  return Math.round((weightedSum / totalWeight) * 100);
}

/**
 * Make GHL API request
 */
function ghlRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'services.leadconnectorhq.com',
      port: 443,
      path: path,
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
 * Send Telegram notification
 */
async function notifyTelegram(message) {
  try {
    const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await execAsync(`openclaw send --agent main --channel telegram --to ${TELEGRAM_CHAT_ID} "${escaped}"`);
  } catch (error) {
    console.error('Telegram notification failed:', error.message);
  }
}

/**
 * Trigger OpenClaw agent action
 */
async function triggerAgent(agentId, message) {
  try {
    const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await execAsync(`openclaw message --agent ${agentId} "${escaped}"`);
  } catch (error) {
    console.error(`Agent trigger failed (${agentId}):`, error.message);
  }
}

/**
 * Process assessment submission
 */
async function processAssessment(contactId, formData) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 PROCESSING DIVINE ALIGNMENT ASSESSMENT');
  console.log('═'.repeat(60));
  
  // 1. Get contact info
  const contact = await ghlRequest('GET', `/contacts/${contactId}`);
  const name = contact.contact?.firstName || 'Unknown';
  const email = contact.contact?.email || '';
  
  console.log(`👤 Contact: ${name} (${email})`);
  
  // 2. Calculate score (use provided score or calculate from responses)
  let score;
  if (formData.alignment_score !== undefined) {
    score = parseInt(formData.alignment_score);
  } else if (formData.total_score !== undefined) {
    score = parseInt(formData.total_score);
  } else {
    // Calculate from individual responses
    score = calculateWeightedScore(formData);
  }
  
  // 3. Determine tier
  const tierInfo = calculateTier(score);
  
  console.log(`🎯 Score: ${score}/100`);
  console.log(`📍 Tier: ${tierInfo.tier}`);
  console.log(`📝 ${tierInfo.description}`);
  
  // 4. Update contact in GHL
  const updateData = {
    customFields: [
      { key: 'alignment_score', value: score.toString() },
      { key: 'alignment_tier', value: tierInfo.tier },
      { key: 'alignment_date', value: new Date().toISOString() },
      { key: 'recommended_offer', value: tierInfo.offer }
    ],
    tags: [tierInfo.tag, 'scorecard-complete']
  };
  
  await ghlRequest('PUT', `/contacts/${contactId}`, updateData);
  console.log('✅ Contact updated with alignment data');
  
  // 5. Add to appropriate nurture workflow
  await triggerAgent('marketing', 
    `ASSESSMENT COMPLETE: ${name} scored ${score}/100 (${tierInfo.tier}). ` +
    `Actions: ` +
    `1) Confirm ${tierInfo.tag} tag is applied, ` +
    `2) Enroll in ${tierInfo.nurture} workflow, ` +
    `3) Send personalized results email with ${tierInfo.offer} CTA, ` +
    `4) Schedule Day 1 nurture SMS for tomorrow 10am.`
  );
  
  // 6. Send Telegram notification
  const tierEmoji = {
    DORMANT: '🌑',
    AWAKENING: '🌱',
    ALIGNED: '⭐',
    EMPOWERED: '🔥',
    TRANSCENDENT: '👑'
  };
  
  await notifyTelegram(
    `${tierEmoji[tierInfo.tier]} Alignment Scorecard Complete\n` +
    `👤 ${name}\n` +
    `📊 Score: ${score}/100\n` +
    `🏆 Tier: ${tierInfo.tier}\n` +
    `🎯 Offer: ${tierInfo.offer}`
  );
  
  // 7. High-value leads get special handling
  if (tierInfo.tier === 'TRANSCENDENT') {
    await triggerAgent('sales',
      `HIGH-ALIGNMENT LEAD: ${name} scored ${score}/100 (TRANSCENDENT tier). ` +
      `This contact is ready for Implementation Intensive offer. ` +
      `Generate pre-call briefing and prepare personalized outreach.`
    );
    
    await notifyTelegram(
      `🚨 HIGH-VALUE LEAD ALERT!\n` +
      `👤 ${name}\n` +
      `📊 TRANSCENDENT tier (${score}/100)\n` +
      `💰 Ready for high-ticket offer\n` +
      `⚡ Priority follow-up recommended`
    );
  }
  
  // 8. Return result page URL
  const resultUrl = `https://truthjblue.com${tierInfo.resultPage}?score=${score}&name=${encodeURIComponent(name)}`;
  
  console.log(`\n🔗 Result Page: ${resultUrl}`);
  console.log('═'.repeat(60));
  
  return {
    success: true,
    contactId,
    name,
    score,
    tier: tierInfo.tier,
    resultUrl,
    offer: tierInfo.offer,
    nurture: tierInfo.nurture
  };
}

/**
 * Recalculate scores for existing contacts (batch operation)
 */
async function batchRecalculate() {
  console.log('🔄 Batch recalculating alignment scores...');
  
  // Get contacts with scorecard-complete tag but missing tier
  const response = await ghlRequest('GET', 
    `/contacts/?locationId=${GHL_LOCATION_ID}&tags=scorecard-complete&limit=100`
  );
  
  const contacts = response.contacts || [];
  let updated = 0;
  
  for (const contact of contacts) {
    const customFields = contact.customFields || [];
    const scoreField = customFields.find(f => f.key === 'alignment_score');
    const tierField = customFields.find(f => f.key === 'alignment_tier');
    
    if (scoreField && !tierField) {
      const tierInfo = calculateTier(scoreField.value);
      
      await ghlRequest('PUT', `/contacts/${contact.id}`, {
        customFields: [
          { key: 'alignment_tier', value: tierInfo.tier },
          { key: 'recommended_offer', value: tierInfo.offer }
        ],
        tags: [tierInfo.tag]
      });
      
      updated++;
      console.log(`  ✅ ${contact.firstName}: ${scoreField.value} → ${tierInfo.tier}`);
    }
  }
  
  console.log(`\n📊 Updated ${updated} contacts`);
}

// CLI Interface — only run when executed directly, not when imported
const __skillFilename = fileURLToPath(import.meta.url);
if (process.argv[1] === __skillFilename) {
  const [,, command, ...args] = process.argv;

  switch (command) {

  case 'process':
    if (args.length < 1) {
      console.log('Usage: assessment-handler.mjs process <contactId> [score]');
      process.exit(1);
    }
    const formData = args[1] ? { alignment_score: args[1] } : {};
    processAssessment(args[0], formData);
    break;
    
  case 'calculate':
    if (args.length < 1) {
      console.log('Usage: assessment-handler.mjs calculate <score>');
      process.exit(1);
    }
    const result = calculateTier(args[0]);
    console.log(JSON.stringify(result, null, 2));
    break;
    
  case 'batch':
    batchRecalculate();
    break;
    
  case 'tiers':
    console.log('\n📊 DIVINE ALIGNMENT TIER SYSTEM\n');
    for (const [tier, config] of Object.entries(ALIGNMENT_TIERS)) {
      console.log(`${tier} (${config.range[0]}-${config.range[1]})`);
      console.log(`  Tag: ${config.tag}`);
      console.log(`  Offer: ${config.offer}`);
      console.log(`  Nurture: ${config.nurture}`);
      console.log(`  ${config.description}\n`);
    }
    break;
    
  default:
    console.log(`
Divine Alignment Assessment Handler

Usage:
  assessment-handler.mjs process <contactId> [score]  - Process assessment for contact
  assessment-handler.mjs calculate <score>            - Calculate tier from score
  assessment-handler.mjs batch                        - Recalculate tiers for all contacts
  assessment-handler.mjs tiers                        - Show tier configuration
`);
 }
}

export { processAssessment, calculateTier, calculateWeightedScore, ALIGNMENT_TIERS };