#!/usr/bin/env node
/**
 * OpenClaw Multi-Channel Orchestrator
 * 
 * Features:
 *   - Coordinate messages across email, SMS, Telegram
 *   - Smart channel selection based on engagement
 *   - Sequence management with delays
 *   - Channel fatigue prevention
 *   - Delivery optimization
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { openclawSend } from '../lib/safe-exec.mjs';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SEQUENCES_FILE = path.join(DATA_DIR, 'sequences.json');
const ENGAGEMENT_FILE = path.join(DATA_DIR, 'channel-engagement.json');

const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Channel configuration
const CHANNELS = {
  email: {
    priority: 2,
    costFactor: 1,
    fatigueHours: 24,
    bestHours: [8, 9, 10, 14, 15, 16] // 8-10 AM, 2-4 PM
  },
  sms: {
    priority: 1,
    costFactor: 5,
    fatigueHours: 48,
    bestHours: [10, 11, 12, 13, 14, 15, 16, 17] // 10 AM - 5 PM
  },
  telegram: {
    priority: 3,
    costFactor: 0,
    fatigueHours: 12,
    bestHours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] // 9 AM - 8 PM
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
 * Load sequences
 */
async function loadSequences() {
  try {
    const data = await fs.readFile(SEQUENCES_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { sequences: {}, enrollments: {} };
  }
}

/**
 * Save sequences
 */
async function saveSequences(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SEQUENCES_FILE, JSON.stringify(data, null, 2));
}

/**
 * Load engagement data
 */
async function loadEngagement() {
  try {
    const data = await fs.readFile(ENGAGEMENT_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save engagement data
 */
async function saveEngagement(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ENGAGEMENT_FILE, JSON.stringify(data, null, 2));
}

/**
 * Record channel engagement
 */
async function recordEngagement(contactId, channel, engaged = true) {
  const data = await loadEngagement();
  
  if (!data[contactId]) {
    data[contactId] = {
      email: { sent: 0, engaged: 0, lastSent: null },
      sms: { sent: 0, engaged: 0, lastSent: null },
      telegram: { sent: 0, engaged: 0, lastSent: null }
    };
  }
  
  if (engaged) {
    data[contactId][channel].engaged++;
  }
  data[contactId][channel].sent++;
  data[contactId][channel].lastSent = new Date().toISOString();
  
  await saveEngagement(data);
  return data[contactId][channel];
}

/**
 * Get best channel for contact
 */
async function getBestChannel(contactId, excludeChannels = []) {
  const engagement = await loadEngagement();
  const contactData = engagement[contactId];
  
  // Available channels
  const available = Object.keys(CHANNELS).filter(c => !excludeChannels.includes(c));
  
  if (!contactData) {
    // New contact - use default priority
    return available.sort((a, b) => CHANNELS[a].priority - CHANNELS[b].priority)[0];
  }
  
  // Score each channel
  const scores = available.map(channel => {
    const stats = contactData[channel];
    const config = CHANNELS[channel];
    
    // Engagement rate
    const engagementRate = stats.sent > 0 ? stats.engaged / stats.sent : 0.5;
    
    // Fatigue check
    const hoursSinceLastSent = stats.lastSent 
      ? (Date.now() - new Date(stats.lastSent).getTime()) / (1000 * 60 * 60)
      : 999;
    const fatiguePenalty = hoursSinceLastSent < config.fatigueHours ? -0.5 : 0;
    
    // Time of day bonus
    const currentHour = new Date().getHours();
    const timeBonus = config.bestHours.includes(currentHour) ? 0.2 : 0;
    
    // Calculate score
    const score = engagementRate + fatiguePenalty + timeBonus - (config.costFactor * 0.01);
    
    return { channel, score, engagementRate, hoursSinceLastSent };
  });
  
  scores.sort((a, b) => b.score - a.score);
  
  return scores[0].channel;
}

/**
 * Send message via channel
 */
async function sendMessage(contactId, channel, content) {
  console.log(`\n📨 Sending via ${channel.toUpperCase()}`);
  console.log(`   To: ${contactId}`);
  console.log(`   Content: "${content.subject || content.body?.substring(0, 50)}..."`);
  
  try {
    switch (channel) {
      case 'email':
        // Use GHL to send email
        const emailResult = await ghlRequest('POST', `/contacts/${contactId}/emails`, {
          locationId: GHL_LOCATION_ID,
          subject: content.subject,
          body: content.body,
          emailFrom: content.from || 'default'
        });
        
        await recordEngagement(contactId, 'email', false);
        return { success: true, channel, messageId: emailResult.id || 'sent' };
        
      case 'sms':
        // Use GHL to send SMS
        const smsResult = await ghlRequest('POST', `/contacts/${contactId}/sms`, {
          locationId: GHL_LOCATION_ID,
          body: content.body
        });
        
        await recordEngagement(contactId, 'sms', false);
        return { success: true, channel, messageId: smsResult.id || 'sent' };
        
      case 'telegram':
        // Use OpenClaw to send Telegram (if contact has Telegram)
        const contact = await ghlRequest('GET', `/contacts/${contactId}?locationId=${GHL_LOCATION_ID}`);
        const telegramId = contact.customFields?.find(f => f.key?.includes('telegram'))?.value;
        
        if (telegramId) {
          await openclawSend({ agent: 'main', channel: 'telegram', to: telegramId, message: content.body });
          await recordEngagement(contactId, 'telegram', false);
          return { success: true, channel };
        }
        return { success: false, channel, error: 'No Telegram ID' };
        
      default:
        return { success: false, error: 'Unknown channel' };
    }
  } catch (error) {
    return { success: false, channel, error: error.message };
  }
}

/**
 * Create a sequence
 */
async function createSequence(name, steps, description = '') {
  const data = await loadSequences();
  
  const sequenceId = `seq_${Date.now()}`;
  
  data.sequences[sequenceId] = {
    id: sequenceId,
    name,
    description,
    steps: steps.map((step, i) => ({
      id: `step_${i}`,
      order: i,
      channel: step.channel || 'auto',
      delayMinutes: step.delay || 0,
      content: step.content,
      condition: step.condition || null,
      fallbackChannel: step.fallback || null
    })),
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  await saveSequences(data);
  
  console.log(`\n✅ Sequence created: ${name} (${sequenceId})`);
  console.log(`   Steps: ${steps.length}`);
  
  return data.sequences[sequenceId];
}

/**
 * Enroll contact in sequence
 */
async function enrollContact(sequenceId, contactId) {
  const data = await loadSequences();
  const sequence = data.sequences[sequenceId];
  
  if (!sequence) {
    return { error: 'Sequence not found' };
  }
  
  const enrollmentId = `enr_${Date.now()}_${contactId}`;
  
  data.enrollments[enrollmentId] = {
    id: enrollmentId,
    sequenceId,
    contactId,
    currentStep: 0,
    status: 'active',
    enrolledAt: new Date().toISOString(),
    nextRunAt: new Date().toISOString(),
    completedSteps: [],
    skippedSteps: []
  };
  
  await saveSequences(data);
  
  console.log(`\n✅ Contact enrolled: ${contactId} → ${sequence.name}`);
  
  // Execute first step immediately if no delay
  if (sequence.steps[0]?.delayMinutes === 0) {
    await executeStep(enrollmentId);
  }
  
  return data.enrollments[enrollmentId];
}

/**
 * Execute next step for enrollment
 */
async function executeStep(enrollmentId) {
  const data = await loadSequences();
  const enrollment = data.enrollments[enrollmentId];
  
  if (!enrollment || enrollment.status !== 'active') {
    return { error: 'Enrollment not found or inactive' };
  }
  
  const sequence = data.sequences[enrollment.sequenceId];
  if (!sequence) {
    return { error: 'Sequence not found' };
  }
  
  const step = sequence.steps[enrollment.currentStep];
  if (!step) {
    // Sequence complete
    enrollment.status = 'completed';
    enrollment.completedAt = new Date().toISOString();
    await saveSequences(data);
    return { status: 'completed', message: 'Sequence finished' };
  }
  
  // Determine channel
  let channel = step.channel;
  if (channel === 'auto') {
    channel = await getBestChannel(enrollment.contactId, []);
  }
  
  // Send message
  const result = await sendMessage(enrollment.contactId, channel, step.content);
  
  if (!result.success && step.fallbackChannel) {
    // Try fallback
    const fallbackResult = await sendMessage(enrollment.contactId, step.fallbackChannel, step.content);
    if (fallbackResult.success) {
      result.success = true;
      result.usedFallback = true;
      result.channel = step.fallbackChannel;
    }
  }
  
  // Update enrollment
  enrollment.completedSteps.push({
    stepId: step.id,
    channel: result.channel || channel,
    sentAt: new Date().toISOString(),
    success: result.success,
    usedFallback: result.usedFallback || false
  });
  
  enrollment.currentStep++;
  
  // Schedule next step
  const nextStep = sequence.steps[enrollment.currentStep];
  if (nextStep) {
    const nextRunTime = new Date(Date.now() + nextStep.delayMinutes * 60 * 1000);
    enrollment.nextRunAt = nextRunTime.toISOString();
  } else {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date().toISOString();
  }
  
  await saveSequences(data);
  
  return {
    stepId: step.id,
    channel: result.channel || channel,
    success: result.success,
    nextStep: nextStep ? enrollment.currentStep : null,
    nextRunAt: enrollment.nextRunAt
  };
}

/**
 * Process due sequence steps
 */
async function processDueSteps() {
  const data = await loadSequences();
  const now = new Date();
  
  let processed = 0;
  
  for (const enrollment of Object.values(data.enrollments)) {
    if (enrollment.status !== 'active') continue;
    
    const nextRun = new Date(enrollment.nextRunAt);
    if (nextRun <= now) {
      console.log(`\n⏰ Processing: ${enrollment.id}`);
      await executeStep(enrollment.id);
      processed++;
    }
  }
  
  console.log(`\n✅ Processed ${processed} due steps`);
  return processed;
}

/**
 * Get contact's channel preferences
 */
async function getChannelPreferences(contactId) {
  const engagement = await loadEngagement();
  const contactData = engagement[contactId];
  
  if (!contactData) {
    return {
      contactId,
      hasData: false,
      recommended: 'email',
      message: 'No engagement data - starting with email'
    };
  }
  
  // Calculate rates
  const rates = {};
  for (const [channel, stats] of Object.entries(contactData)) {
    rates[channel] = {
      sent: stats.sent,
      engaged: stats.engaged,
      rate: stats.sent > 0 ? ((stats.engaged / stats.sent) * 100).toFixed(1) : 0,
      lastSent: stats.lastSent
    };
  }
  
  // Sort by engagement rate
  const sorted = Object.entries(rates)
    .filter(([_, s]) => s.sent > 0)
    .sort((a, b) => parseFloat(b[1].rate) - parseFloat(a[1].rate));
  
  return {
    contactId,
    hasData: true,
    channels: rates,
    recommended: sorted[0]?.[0] || 'email',
    ranking: sorted.map(([c, s]) => `${c}: ${s.rate}%`)
  };
}

/**
 * Unenroll contact from sequence
 */
async function unenrollContact(contactId, sequenceId = null) {
  const data = await loadSequences();
  
  let unenrolled = 0;
  
  for (const enrollment of Object.values(data.enrollments)) {
    if (enrollment.contactId === contactId && enrollment.status === 'active') {
      if (!sequenceId || enrollment.sequenceId === sequenceId) {
        enrollment.status = 'unenrolled';
        enrollment.unenrolledAt = new Date().toISOString();
        unenrolled++;
      }
    }
  }
  
  await saveSequences(data);
  return { unenrolled };
}

/**
 * List sequences
 */
async function listSequences() {
  const data = await loadSequences();
  
  console.log('\n' + '═'.repeat(60));
  console.log('📋 SEQUENCES');
  console.log('═'.repeat(60) + '\n');
  
  const sequences = Object.values(data.sequences);
  
  if (sequences.length === 0) {
    console.log('No sequences found.');
    return;
  }
  
  for (const seq of sequences) {
    // Count enrollments
    const enrollments = Object.values(data.enrollments)
      .filter(e => e.sequenceId === seq.id);
    const active = enrollments.filter(e => e.status === 'active').length;
    const completed = enrollments.filter(e => e.status === 'completed').length;
    
    console.log(`📨 ${seq.name} (${seq.id})`);
    console.log(`   Steps: ${seq.steps.length} | Active: ${active} | Completed: ${completed}`);
    
    for (const step of seq.steps) {
      const channelIcon = step.channel === 'email' ? '📧' : step.channel === 'sms' ? '💬' : step.channel === 'telegram' ? '📱' : '🔀';
      console.log(`   ${step.order + 1}. ${channelIcon} ${step.channel} (${step.delayMinutes}m delay)`);
    }
    console.log('');
  }
}

/**
 * Show enrollment status
 */
async function showEnrollment(enrollmentId) {
  const data = await loadSequences();
  const enrollment = data.enrollments[enrollmentId];
  
  if (!enrollment) {
    console.log('Enrollment not found');
    return;
  }
  
  const sequence = data.sequences[enrollment.sequenceId];
  
  console.log('\n' + '═'.repeat(50));
  console.log('📋 ENROLLMENT STATUS');
  console.log('═'.repeat(50) + '\n');
  
  console.log(`Sequence: ${sequence?.name || enrollment.sequenceId}`);
  console.log(`Contact: ${enrollment.contactId}`);
  console.log(`Status: ${enrollment.status}`);
  console.log(`Current Step: ${enrollment.currentStep + 1} of ${sequence?.steps.length || '?'}`);
  console.log(`Next Run: ${enrollment.nextRunAt}`);
  console.log('');
  
  console.log('Completed Steps:');
  for (const step of enrollment.completedSteps) {
    const fallback = step.usedFallback ? ' (fallback)' : '';
    console.log(`  ✅ ${step.stepId} via ${step.channel}${fallback} at ${step.sentAt}`);
  }
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'create':
    console.log('Use the API to create sequences:');
    console.log('  createSequence(name, steps, description)');
    console.log('  steps: [{ channel, delay, content: { subject, body }, fallback }]');
    break;
    
  case 'enroll':
    if (args.length < 2) {
      console.log('Usage: sequence-orchestrator.mjs enroll <sequenceId> <contactId>');
    } else {
      enrollContact(args[0], args[1]);
    }
    break;
    
  case 'process':
    processDueSteps();
    break;
    
  case 'list':
    listSequences();
    break;
    
  case 'status':
    if (!args[0]) {
      console.log('Usage: sequence-orchestrator.mjs status <enrollmentId>');
    } else {
      showEnrollment(args[0]);
    }
    break;
    
  case 'preferences':
    if (!args[0]) {
      console.log('Usage: sequence-orchestrator.mjs preferences <contactId>');
    } else {
      getChannelPreferences(args[0]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;
    
  case 'best-channel':
    if (!args[0]) {
      console.log('Usage: sequence-orchestrator.mjs best-channel <contactId>');
    } else {
      getBestChannel(args[0]).then(c => console.log(`Best channel for ${args[0]}: ${c}`));
    }
    break;
    
  case 'send':
    if (args.length < 3) {
      console.log('Usage: sequence-orchestrator.mjs send <contactId> <channel> "<message>"');
    } else {
      sendMessage(args[0], args[1], { body: args.slice(2).join(' ') });
    }
    break;
    
  case 'unenroll':
    if (!args[0]) {
      console.log('Usage: sequence-orchestrator.mjs unenroll <contactId> [sequenceId]');
    } else {
      unenrollContact(args[0], args[1]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;
    
  default:
    console.log(`
Multi-Channel Orchestrator

Usage:
  sequence-orchestrator.mjs create              - Create sequence (use API)
  sequence-orchestrator.mjs enroll <seq> <id>   - Enroll contact in sequence
  sequence-orchestrator.mjs process             - Process due sequence steps
  sequence-orchestrator.mjs list                - List all sequences
  sequence-orchestrator.mjs status <enrollment> - Show enrollment status
  sequence-orchestrator.mjs preferences <id>    - Get channel preferences
  sequence-orchestrator.mjs best-channel <id>   - Get best channel for contact
  sequence-orchestrator.mjs send <id> <ch> <m>  - Send single message
  sequence-orchestrator.mjs unenroll <id>       - Unenroll from all sequences

Channels:
  email     - Email (via GHL)
  sms       - SMS (via GHL)
  telegram  - Telegram (via OpenClaw)
  auto      - Auto-select best channel

Channel Selection Factors:
  - Past engagement rate
  - Time since last message (fatigue prevention)
  - Time of day
  - Cost factor
`);
}

export { 
  createSequence, 
  enrollContact, 
  executeStep, 
  processDueSteps, 
  getBestChannel, 
  sendMessage,
  recordEngagement,
  getChannelPreferences 
};
