#!/usr/bin/env node
/**
 * OpenClaw eBook Buyer Automation
 * 
 * Triggers when eBook purchase is detected ($7-$27 products).
 * Manages nurture sequences, course upsell timing, and engagement tracking.
 * 
 * Funnel: Assessment → eBook ($9.95) → Course ($297) → Intensive ($2,497)
 */

import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Configuration
const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');

// Value Ladder Configuration
const VALUE_LADDER = {
  LEAD: {
    step: 0,
    name: 'Lead',
    value: 0,
    nextOffer: 'ebook',
    nurtureDays: 3
  },
  EBOOK_BUYER: {
    step: 1,
    name: 'eBook Buyer',
    value: 9.95,
    nextOffer: 'course',
    nurtureDays: 7,
    upsellTriggerDay: 5
  },
  COURSE_BUYER: {
    step: 2,
    name: 'Course Buyer',
    value: 297,
    nextOffer: 'intensive',
    nurtureDays: 14,
    upsellTriggerDay: 10
  },
  INTENSIVE_CLIENT: {
    step: 3,
    name: 'Implementation Intensive Client',
    value: 2497,
    nextOffer: 'operators-circle',
    nurtureDays: 30
  },
  OPERATORS_CIRCLE: {
    step: 4,
    name: 'Operators Circle Member',
    value: 497, // monthly
    nextOffer: 'referral',
    nurtureDays: 0 // ongoing
  }
};

// Nurture Sequence Templates
const NURTURE_SEQUENCES = {
  'ebook-day-0': {
    day: 0,
    delay: 0,
    type: 'sms',
    template: 'THANKS_EBOOK',
    subject: null
  },
  'ebook-day-1': {
    day: 1,
    delay: 24 * 60, // 24 hours in minutes
    type: 'email',
    template: 'START_READING',
    subject: "Here's how to get the most from your new guide"
  },
  'ebook-day-2': {
    day: 2,
    delay: 48 * 60,
    type: 'sms',
    template: 'DAY2_CHECKIN',
    subject: null
  },
  'ebook-day-3': {
    day: 3,
    delay: 72 * 60,
    type: 'email',
    template: 'FIRST_WIN',
    subject: 'What was your first insight?'
  },
  'ebook-day-5': {
    day: 5,
    delay: 120 * 60,
    type: 'email',
    template: 'COURSE_SOFT_INTRO',
    subject: 'When you\'re ready for the next step...'
  },
  'ebook-day-7': {
    day: 7,
    delay: 168 * 60,
    type: 'email',
    template: 'COURSE_OFFER',
    subject: 'Your invitation to go deeper'
  },
  'ebook-day-10': {
    day: 10,
    delay: 240 * 60,
    type: 'sms',
    template: 'COURSE_REMINDER',
    subject: null
  },
  'ebook-day-14': {
    day: 14,
    delay: 336 * 60,
    type: 'email',
    template: 'LAST_CHANCE_COURSE',
    subject: 'Still thinking about it?'
  }
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
 * Process eBook purchase
 */
async function processEbookPurchase(contactId, productName, amount) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📚 PROCESSING EBOOK PURCHASE');
  console.log('═'.repeat(60));
  
  // 1. Get contact info
  const response = await ghlRequest('GET', `/contacts/${contactId}`);
  const contact = response.contact || response;
  const name = contact.firstName || 'Valued Customer';
  const email = contact.email || '';
  const phone = contact.phone || '';
  
  console.log(`👤 Contact: ${name} (${email})`);
  console.log(`📚 Product: ${productName}`);
  console.log(`💵 Amount: $${amount}`);
  
  // 2. Update contact with purchase data
  const purchaseDate = new Date().toISOString();
  const updateData = {
    customFields: [
      { key: 'value_ladder_step', value: '1' },
      { key: 'ebook_purchase_date', value: purchaseDate },
      { key: 'ebook_product', value: productName },
      { key: 'ltv', value: amount.toString() },
      { key: 'nurture_day', value: '0' },
      { key: 'next_nurture_date', value: new Date(Date.now() + 24*60*60*1000).toISOString() }
    ],
    tags: ['ebook-buyer', 'customer', 'nurture-active']
  };
  
  // Remove lead-only tags
  const tagsToRemove = ['lead', 'scorecard-lead', 'new-lead'];
  
  await ghlRequest('PUT', `/contacts/${contactId}`, updateData);
  console.log('✅ Contact updated to eBook Buyer');
  
  // 3. Move to eBook Buyer pipeline stage
  const pipelines = await ghlRequest('GET', `/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`);
  const corePipeline = pipelines.pipelines?.find(p => p.name.includes('Core') || p.name.includes('Suite'));
  
  if (corePipeline) {
    const ebookStage = corePipeline.stages?.find(s => 
      s.name.toLowerCase().includes('ebook') || 
      s.name.toLowerCase().includes('buyer')
    );
    
    if (ebookStage) {
      // Check for existing opportunity
      const opps = await ghlRequest('GET', `/opportunities/?contact_id=${contactId}&locationId=${GHL_LOCATION_ID}`);
      const existingOpp = opps.opportunities?.[0];
      
      if (existingOpp) {
        await ghlRequest('PUT', `/opportunities/${existingOpp.id}`, {
          pipelineStageId: ebookStage.id,
          monetaryValue: parseFloat(amount)
        });
        console.log(`✅ Moved to pipeline stage: ${ebookStage.name}`);
      }
    }
  }
  
  // 4. Send immediate thank you SMS
  if (phone) {
    await triggerAgent('marketing',
      `EBOOK PURCHASE SMS: Send immediate thank you to ${name} at ${phone}. ` +
      `Product: ${productName}. Amount: $${amount}. ` +
      `Use THANKS_EBOOK template. Include access instructions.`
    );
  }
  
  // 5. Schedule nurture sequence
  await scheduleNurtureSequence(contactId, 'ebook');
  
  // 6. Send Telegram notification
  await notifyTelegram(
    `📚 eBook Purchase!\n` +
    `👤 ${name}\n` +
    `📧 ${email}\n` +
    `📖 ${productName}\n` +
    `💵 $${amount}\n` +
    `📅 Nurture sequence started`
  );
  
  // 7. Trigger marketing agent for onboarding
  await triggerAgent('marketing',
    `EBOOK ONBOARDING: ${name} (${email}) purchased ${productName} for $${amount}. ` +
    `Pipeline updated to eBook Buyer. ` +
    `Actions: ` +
    `1) Send purchase confirmation email with download link, ` +
    `2) Add to Day 0-14 nurture workflow, ` +
    `3) Schedule Day 5 course soft intro, ` +
    `4) Schedule Day 7 course offer.`
  );
  
  console.log('✅ Nurture sequence scheduled');
  console.log('═'.repeat(60));
  
  return {
    success: true,
    contactId,
    name,
    product: productName,
    amount,
    ladder: 'EBOOK_BUYER',
    nextOffer: 'course',
    upsellDay: 7
  };
}

/**
 * Schedule nurture sequence
 */
async function scheduleNurtureSequence(contactId, sequenceType) {
  const dataFile = path.join(DATA_DIR, 'nurture-queue.json');
  
  // Load existing queue
  let queue = [];
  try {
    const data = await fs.readFile(dataFile, 'utf8');
    queue = JSON.parse(data);
  } catch {
    // File doesn't exist, start fresh
  }
  
  // Remove existing entries for this contact
  queue = queue.filter(entry => entry.contactId !== contactId);
  
  // Add nurture sequence entries
  const now = Date.now();
  const sequence = Object.entries(NURTURE_SEQUENCES)
    .filter(([key]) => key.startsWith(sequenceType));
  
  for (const [key, config] of sequence) {
    queue.push({
      contactId,
      sequenceKey: key,
      type: config.type,
      template: config.template,
      subject: config.subject,
      scheduledTime: now + config.delay * 60 * 1000,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
  }
  
  // Ensure directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  // Save queue
  await fs.writeFile(dataFile, JSON.stringify(queue, null, 2));
  console.log(`📅 Scheduled ${sequence.length} nurture messages`);
}

/**
 * Process nurture queue (run by cron)
 */
async function processNurtureQueue() {
  const dataFile = path.join(DATA_DIR, 'nurture-queue.json');
  
  let queue = [];
  try {
    const data = await fs.readFile(dataFile, 'utf8');
    queue = JSON.parse(data);
  } catch {
    console.log('No nurture queue found');
    return;
  }
  
  const now = Date.now();
  let processed = 0;
  
  for (const entry of queue) {
    if (entry.status === 'pending' && entry.scheduledTime <= now) {
      console.log(`Processing: ${entry.sequenceKey} for ${entry.contactId}`);
      
      // Get contact info
      const response = await ghlRequest('GET', `/contacts/${entry.contactId}`);
      const contact = response.contact || response;
      
      if (entry.type === 'sms') {
        await triggerAgent('marketing',
          `NURTURE SMS: Send ${entry.template} to ${contact.firstName} at ${contact.phone}. ` +
          `Sequence: ${entry.sequenceKey}.`
        );
      } else {
        await triggerAgent('marketing',
          `NURTURE EMAIL: Send ${entry.template} to ${contact.firstName} at ${contact.email}. ` +
          `Subject: "${entry.subject}". Sequence: ${entry.sequenceKey}.`
        );
      }
      
      entry.status = 'sent';
      entry.sentAt = new Date().toISOString();
      processed++;
    }
  }
  
  // Save updated queue
  await fs.writeFile(dataFile, JSON.stringify(queue, null, 2));
  console.log(`✅ Processed ${processed} nurture messages`);
}

/**
 * Check for course upsell opportunities (run at Day 5 and Day 7)
 */
async function checkCourseUpsells() {
  console.log('🎯 Checking course upsell opportunities...');
  
  // Get eBook buyers from past 5-7 days
  const response = await ghlRequest('GET', 
    `/contacts/?locationId=${GHL_LOCATION_ID}&tags=ebook-buyer&limit=100`
  );
  
  const contacts = response.contacts || [];
  const now = Date.now();
  
  for (const contact of contacts) {
    const customFields = contact.customFields || [];
    const purchaseDate = customFields.find(f => f.key === 'ebook_purchase_date')?.value;
    const hasCourseBuyerTag = contact.tags?.includes('course-buyer');
    
    if (!purchaseDate || hasCourseBuyerTag) continue;
    
    const daysSincePurchase = Math.floor((now - new Date(purchaseDate).getTime()) / (24*60*60*1000));
    
    // Day 5: Soft intro
    if (daysSincePurchase === 5) {
      await triggerAgent('marketing',
        `DAY 5 COURSE INTRO: ${contact.firstName} is 5 days into eBook. ` +
        `Check engagement metrics: email opens, link clicks. ` +
        `If engaged (>50% open rate), send course soft intro. ` +
        `If not engaged, extend nurture with value content.`
      );
    }
    
    // Day 7: Course offer
    if (daysSincePurchase === 7) {
      // Check engagement score
      const engagementScore = await calculateEngagement(contact.id);
      
      if (engagementScore >= 50) {
        await triggerAgent('marketing',
          `DAY 7 COURSE OFFER: ${contact.firstName} has ${engagementScore}% engagement. ` +
          `Send full course offer with bonus stack. ` +
          `Offer: Agentic AI Mastery Course ($297). ` +
          `Include testimonials and fast-action bonus.`
        );
        
        await notifyTelegram(
          `📧 Course Offer Sent\n` +
          `👤 ${contact.firstName}\n` +
          `📊 Engagement: ${engagementScore}%\n` +
          `🎯 Day 7 of nurture`
        );
      } else {
        await triggerAgent('marketing',
          `LOW ENGAGEMENT: ${contact.firstName} has ${engagementScore}% engagement. ` +
          `Do not send course offer yet. ` +
          `Add to re-engagement sequence with fresh value content. ` +
          `Try course offer again at Day 14.`
        );
      }
    }
    
    // Day 14: Last chance
    if (daysSincePurchase === 14) {
      const hasOpenedEmails = await checkEmailOpens(contact.id);
      
      if (hasOpenedEmails) {
        await triggerAgent('marketing',
          `DAY 14 LAST CHANCE: ${contact.firstName} still on eBook nurture. ` +
          `Send final course offer with urgency. ` +
          `After this, move to long-term nurture (monthly touchpoints).`
        );
      }
    }
  }
}

/**
 * Calculate engagement score for a contact
 */
async function calculateEngagement(contactId) {
  // In a real implementation, this would check:
  // - Email open rates
  // - Link clicks
  // - Page visits
  // - Reply rates
  
  // For now, return a simulated score based on contact activity
  const response = await ghlRequest('GET', `/contacts/${contactId}`);
  const contact = response.contact || response;
  
  let score = 30; // Base score
  
  // Check for engagement indicators
  if (contact.tags?.includes('replied')) score += 30;
  if (contact.tags?.includes('clicked-link')) score += 20;
  if (contact.tags?.includes('opened-email')) score += 15;
  if (contact.tags?.includes('visited-sales-page')) score += 25;
  
  return Math.min(score, 100);
}

/**
 * Check if contact has opened emails
 */
async function checkEmailOpens(contactId) {
  const response = await ghlRequest('GET', `/contacts/${contactId}`);
  const contact = response.contact || response;
  return contact.tags?.includes('opened-email') || false;
}

/**
 * Get nurture status for a contact
 */
async function getNurtureStatus(contactId) {
  const response = await ghlRequest('GET', `/contacts/${contactId}`);
  const contact = response.contact || response;
  const customFields = contact.customFields || [];
  
  const purchaseDate = customFields.find(f => f.key === 'ebook_purchase_date')?.value;
  const ladderStep = customFields.find(f => f.key === 'value_ladder_step')?.value;
  const nurtureDay = customFields.find(f => f.key === 'nurture_day')?.value;
  
  let daysSincePurchase = 0;
  if (purchaseDate) {
    daysSincePurchase = Math.floor((Date.now() - new Date(purchaseDate).getTime()) / (24*60*60*1000));
  }
  
  const engagement = await calculateEngagement(contactId);
  
  return {
    contactId,
    name: contact.firstName,
    email: contact.email,
    ladderStep: parseInt(ladderStep) || 0,
    ladderName: Object.values(VALUE_LADDER).find(v => v.step === parseInt(ladderStep))?.name || 'Lead',
    purchaseDate,
    daysSincePurchase,
    nurtureDay: parseInt(nurtureDay) || 0,
    engagementScore: engagement,
    tags: contact.tags || [],
    readyForUpsell: engagement >= 50 && daysSincePurchase >= 5
  };
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'purchase':
    if (args.length < 3) {
      console.log('Usage: ebook-buyer-automation.mjs purchase <contactId> <productName> <amount>');
      process.exit(1);
    }
    processEbookPurchase(args[0], args[1], parseFloat(args[2]));
    break;
    
  case 'process-queue':
    processNurtureQueue();
    break;
    
  case 'check-upsells':
    checkCourseUpsells();
    break;
    
  case 'status':
    if (!args[0]) {
      console.log('Usage: ebook-buyer-automation.mjs status <contactId>');
      process.exit(1);
    }
    getNurtureStatus(args[0]).then(status => {
      console.log('\n📊 NURTURE STATUS\n');
      console.log(`Contact: ${status.name} (${status.email})`);
      console.log(`Value Ladder: ${status.ladderName} (Step ${status.ladderStep})`);
      console.log(`Days Since Purchase: ${status.daysSincePurchase}`);
      console.log(`Engagement Score: ${status.engagementScore}%`);
      console.log(`Ready for Upsell: ${status.readyForUpsell ? '✅ Yes' : '❌ Not yet'}`);
      console.log(`Tags: ${status.tags.join(', ')}`);
    });
    break;
    
  case 'ladder':
    console.log('\n📊 VALUE LADDER\n');
    for (const [key, config] of Object.entries(VALUE_LADDER)) {
      console.log(`Step ${config.step}: ${config.name}`);
      console.log(`  Value: $${config.value}`);
      console.log(`  Next Offer: ${config.nextOffer}`);
      console.log(`  Nurture Days: ${config.nurtureDays}\n`);
    }
    break;
    
  default:
    console.log(`
eBook Buyer Automation

Usage:
  ebook-buyer-automation.mjs purchase <contactId> <product> <amount>  - Process purchase
  ebook-buyer-automation.mjs process-queue                           - Process nurture queue
  ebook-buyer-automation.mjs check-upsells                           - Check for upsell opportunities
  ebook-buyer-automation.mjs status <contactId>                      - Get nurture status
  ebook-buyer-automation.mjs ladder                                  - Show value ladder
`);
}

export { 
  processEbookPurchase, 
  processNurtureQueue, 
  checkCourseUpsells, 
  getNurtureStatus,
  VALUE_LADDER,
  NURTURE_SEQUENCES
};
