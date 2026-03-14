#!/usr/bin/env node
/**
 * OpenClaw GHL Webhook Handler
 * 
 * Receives webhooks from GoHighLevel and triggers OpenClaw agent actions.
 * Integrates Phase 3 automation: Assessment, eBook, Course, and Cart Recovery.
 * Run with: node ghl-webhook-handler.mjs
 */

import http from 'http';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const execAsync = promisify(exec);

// Import Phase 3 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple skills locations to support local and production layouts.
const skillsSearchPaths = [
  process.env.OPENCLAW_SKILLS_DIR,
  path.join(__dirname, 'workspace', 'skills'),          // legacy layout
  path.join(__dirname, '..', 'skills'),                 // current repo layout
  path.join(process.cwd(), 'skills'),                   // service working dir
  '/opt/openclaw/skills'                                // production fallback
].filter(Boolean);

function resolveSkillPath(fileName) {
  for (const base of skillsSearchPaths) {
    const candidate = path.join(base, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function importSkill(fileName, label) {
  const resolved = resolveSkillPath(fileName);
  if (!resolved) {
    console.warn(`⚠️ ${label} not found. Looked in: ${skillsSearchPaths.join(', ')}`);
    return null;
  }

  try {
    return await import(pathToFileURL(resolved).href);
  } catch (error) {
    console.warn(`⚠️ Failed to load ${label} from ${resolved}:`, error.message);
    return null;
  }
}

// Dynamic imports for Phase 3 handlers (loaded on demand)
let assessmentHandler = null;
let ebookAutomation = null;
let cartRecovery = null;

async function loadPhase3Modules() {
  assessmentHandler = await importSkill('assessment-handler.mjs', 'assessment handler');
  ebookAutomation = await importSkill('ebook-buyer-automation.mjs', 'ebook automation');
  cartRecovery = await importSkill('abandoned-cart-recovery.mjs', 'abandoned cart recovery');

  const loaded = [assessmentHandler, ebookAutomation, cartRecovery].filter(Boolean).length;
  if (loaded === 3) {
    console.log('✅ Phase 3 modules loaded (3/3)');
  } else {
    console.warn(`⚠️ Phase 3 modules partially loaded (${loaded}/3)`);
  }
}

// Configuration from environment
const PORT = process.env.OPENCLAW_GHL_WEBHOOK_PORT || 8788;
const HOST = process.env.OPENCLAW_GHL_WEBHOOK_HOST || '127.0.0.1';
const WEBHOOK_SECRET = process.env.OPENCLAW_GHL_WEBHOOK_SECRET || 'replace-with-32byte-random-secret';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';
const TEAMS_CHANNEL_ID = process.env.OPENCLAW_ALERT_TEAMS_CHANNEL_ID || '7737707872';

// Event handlers
const eventHandlers = {
  // Contact events
  'contact.created': handleNewContact,
  'contact.updated': handleContactUpdate,
  'contact.tag.added': handleTagAdded,
  
  // Form/Funnel events
  'form.submitted': handleFormSubmission,
  'funnel.page.visited': handlePageVisit,
  
  // Payment events
  'payment.received': handlePayment,
  'subscription.created': handleSubscription,
  'subscription.cancelled': handleSubscriptionCancelled,
  
  // Appointment events
  'appointment.created': handleAppointmentBooked,
  'appointment.cancelled': handleAppointmentCancelled,
  'appointment.noshow': handleNoShow,
  
  // Opportunity events
  'opportunity.created': handleOpportunityCreated,
  'opportunity.stage.changed': handleStageChange,
  'opportunity.status.changed': handleStatusChange
};

// Verify webhook signature
function verifySignature(payload, signature) {
  if (!signature) return false;
  const computed = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
}

// Send Telegram alert via OpenClaw
async function sendTelegramAlert(message) {
  const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  try {
    await execAsync(`openclaw send --agent main --channel telegram --to ${TELEGRAM_CHAT_ID} "${escapedMessage}"`);
  } catch (error) {
    console.error('Failed to send Telegram alert:', error.message);
  }
}

// Send MS Teams alert via OpenClaw
async function sendTeamsAlert(message) {
  const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  try {
    await execAsync(`openclaw send --agent main --channel msteams --to ${TEAMS_CHANNEL_ID} "${escapedMessage}"`);
  } catch (error) {
    console.error('Failed to send Teams alert:', error.message);
  }
}

// Send alert to all configured channels
async function sendAlert(message) {
  await Promise.allSettled([
    sendTelegramAlert(message),
    sendTeamsAlert(message)
  ]);
}

// Trigger OpenClaw agent action
async function triggerAgentAction(agentId, message) {
  const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  try {
    await execAsync(`openclaw message --agent ${agentId} "${escapedMessage}"`);
  } catch (error) {
    console.error(`Failed to trigger agent ${agentId}:`, error.message);
  }
}

// Event Handlers
async function handleNewContact(data) {
  const contact = data.contact || data;
  const name = contact.firstName || contact.name || 'Unknown';
  const email = contact.email || '';
  const phone = contact.phone || '';
  const source = contact.source || 'direct';
  
  console.log(`[NEW CONTACT] ${name} - ${email} - Source: ${source}`);
  
  // Trigger marketing agent for speed-to-lead
  await triggerAgentAction('marketing', 
    `NEW LEAD ALERT: ${name} just entered via ${source}. ` +
    `Email: ${email}, Phone: ${phone}. ` +
    `Execute speed-to-lead sequence: send welcome SMS within 60 seconds, ` +
    `add scorecard-lead tag, update pipeline to New Lead stage.`
  );
  
  // Alert owner
  await sendAlert(`🆕 New Lead: ${name}\n📧 ${email}\n📱 ${phone}\n📍 Source: ${source}`);
}

async function handleContactUpdate(data) {
  const contact = data.contact || data;
  const customFields = contact.customFields || {};
  
  // Check for lead score update
  if (customFields.lead_score) {
    const score = parseInt(customFields.lead_score);
    if (score >= 90) {
      await sendAlert(`🔥 HOT LEAD: ${contact.firstName} scored ${score}/100!\nImmediate follow-up recommended.`);
    }
  }
}

async function handleTagAdded(data) {
  const contact = data.contact || data;
  const tag = data.tag || '';
  
  console.log(`[TAG ADDED] ${contact.firstName}: ${tag}`);
  
  // High-alignment tag triggers accelerated nurture
  if (tag === 'high-alignment') {
    await triggerAgentAction('marketing',
      `High-alignment contact detected: ${contact.firstName}. ` +
      `Accelerate nurture sequence - send course offer within 3 days instead of 7.`
    );
  }
  
  // High-ticket prospect tag alerts sales
  if (tag === 'high-ticket-prospect') {
    await triggerAgentAction('sales',
      `New high-ticket prospect: ${contact.firstName} ${contact.lastName}. ` +
      `Review contact history and prepare personalized outreach for Implementation Intensive.`
    );
    await sendAlert(`💰 High-Ticket Prospect: ${contact.firstName}\nPipeline value: $997-$2,497`);
  }
}

async function handleFormSubmission(data) {
  const formName = data.formName || data.form?.name || 'Unknown Form';
  const contact = data.contact || {};
  const fields = data.fields || data.formData || {};
  
  console.log(`[FORM SUBMITTED] ${formName} by ${contact.firstName}`);
  
  // Divine Alignment Scorecard submission - Use Phase 3 Assessment Handler
  if (formName.toLowerCase().includes('scorecard') || formName.toLowerCase().includes('alignment')) {
    if (assessmentHandler && contact.id) {
      try {
        const result = await assessmentHandler.processAssessment(contact.id, fields);
        console.log(`[ASSESSMENT] Processed: ${result.tier} (${result.score}/100)`);
        return;
      } catch (error) {
        console.error('[ASSESSMENT ERROR]', error.message);
      }
    }
    
    // Fallback to legacy handling
    const score = fields.alignment_score || fields.score || 0;
    
    await triggerAgentAction('marketing',
      `SCORECARD SUBMISSION: ${contact.firstName} completed Divine Alignment Scorecard. ` +
      `Score: ${score}. ` +
      `Actions: 1) Update alignment_score custom field, ` +
      `2) Add appropriate tag (high/mid/low-alignment based on score), ` +
      `3) Route to correct result page, ` +
      `4) Trigger scorecard nurture sequence.`
    );
    
    await sendAlert(`📊 Scorecard Completed\n👤 ${contact.firstName}\n🎯 Score: ${score}/100`);
  }
  
  // High-ticket application
  if (formName.toLowerCase().includes('application') || formName.toLowerCase().includes('intensive')) {
    await triggerAgentAction('sales',
      `HIGH-TICKET APPLICATION: ${contact.firstName} ${contact.lastName} applied. ` +
      `DO NOT auto-approve. Generate application summary and send to Telegram for review.`
    );
    
    await sendAlert(
      `🚨 HIGH-TICKET APPLICATION\n` +
      `👤 ${contact.firstName} ${contact.lastName}\n` +
      `📧 ${contact.email}\n` +
      `💰 Implementation Intensive\n` +
      `⚠️ Requires manual review`
    );
  }
}

async function handlePageVisit(data) {
  const page = data.page || data.pagePath || '';
  const contact = data.contact || {};
  
  // Track checkout page visits for abandoned cart logic using Phase 3 Cart Recovery
  if (page.includes('/order') || page.includes('/checkout')) {
    console.log(`[CHECKOUT VISIT] ${contact.firstName} viewing checkout`);
    
    if (cartRecovery && contact.id) {
      try {
        // Determine product from URL
        let product = 'eBook';
        if (page.includes('course')) product = 'Agentic AI Mastery Course';
        if (page.includes('intensive')) product = 'Implementation Intensive';
        
        const cartUrl = `https://truthjblue.com${page}`;
        await cartRecovery.trackCheckoutVisit(contact.id, product, cartUrl);
        console.log(`[CART TRACKED] ${contact.firstName} - ${product}`);
      } catch (error) {
        console.error('[CART TRACKING ERROR]', error.message);
      }
    }
  }
}

async function handlePayment(data) {
  const amount = data.amount || data.payment?.amount || 0;
  const product = data.product?.name || data.productName || 'Unknown';
  const contact = data.contact || {};
  
  console.log(`[PAYMENT] $${amount} - ${product} - ${contact.firstName}`);
  
  // Mark abandoned cart as completed if exists
  if (cartRecovery && contact.id) {
    try {
      await cartRecovery.markCartCompleted(contact.id);
      console.log('[CART COMPLETED] Abandoned cart recovery stopped');
    } catch (error) {
      // Cart may not exist, that's OK
    }
  }
  
  // Use Phase 3 eBook automation for $7-$67 purchases
  if (amount >= 7 && amount <= 67 && ebookAutomation && contact.id) {
    try {
      const result = await ebookAutomation.processEbookPurchase(contact.id, product, amount);
      console.log(`[EBOOK AUTOMATION] Processed: ${result.name} → ${result.ladder}`);
      return;
    } catch (error) {
      console.error('[EBOOK AUTOMATION ERROR]', error.message);
    }
  }
  
  // Determine pipeline stage based on product
  let stage = 'eBook Buyer';
  let tag = 'ebook-buyer';
  
  if (amount >= 297) {
    stage = 'Course Buyer';
    tag = 'course-buyer';
  } else if (amount >= 67) {
    stage = 'Lite Buyer';
    tag = 'ebook-buyer';
  }
  
  await triggerAgentAction('marketing',
    `PAYMENT RECEIVED: $${amount} from ${contact.firstName} for ${product}. ` +
    `Actions: 1) Add ${tag} tag, ` +
    `2) Move to ${stage} pipeline stage, ` +
    `3) Trigger appropriate onboarding sequence, ` +
    `4) Update value_ladder_step custom field.`
  );
  
  await sendAlert(`💰 Payment Received!\n👤 ${contact.firstName}\n🛒 ${product}\n💵 $${amount}`);
}

async function handleSubscription(data) {
  const plan = data.plan?.name || data.subscription?.name || 'Unknown';
  const amount = data.amount || data.subscription?.amount || 0;
  const contact = data.contact || {};
  
  console.log(`[SUBSCRIPTION] ${plan} - ${contact.firstName}`);
  
  await triggerAgentAction('marketing',
    `NEW SUBSCRIPTION: ${contact.firstName} joined ${plan} at $${amount}/mo. ` +
    `Actions: 1) Add membership-active tag, ` +
    `2) Move to Membership Active stage, ` +
    `3) Trigger Operators Circle onboarding sequence, ` +
    `4) Grant community access.`
  );
  
  await sendAlert(`🎉 New Member!\n👤 ${contact.firstName}\n📦 ${plan}\n💵 $${amount}/mo`);
}

async function handleSubscriptionCancelled(data) {
  const plan = data.plan?.name || 'Unknown';
  const contact = data.contact || {};
  const reason = data.reason || 'Not specified';
  
  console.log(`[CANCELLATION] ${plan} - ${contact.firstName}`);
  
  await triggerAgentAction('support',
    `SUBSCRIPTION CANCELLED: ${contact.firstName} cancelled ${plan}. ` +
    `Reason: ${reason}. ` +
    `Actions: 1) Update membership_status to cancelled, ` +
    `2) Send win-back sequence after 7 days, ` +
    `3) Log cancellation reason for analysis.`
  );
  
  await sendAlert(`⚠️ Cancellation\n👤 ${contact.firstName}\n📦 ${plan}\n📝 Reason: ${reason}`);
}

async function handleAppointmentBooked(data) {
  const appointmentTime = data.startTime || data.appointment?.startTime || 'Unknown';
  const contact = data.contact || {};
  const calendarName = data.calendar?.name || 'Discovery Call';
  
  console.log(`[APPOINTMENT BOOKED] ${calendarName} - ${contact.firstName}`);
  
  // Schedule pre-call briefing
  await triggerAgentAction('sales',
    `APPOINTMENT BOOKED: ${contact.firstName} scheduled ${calendarName} for ${appointmentTime}. ` +
    `Actions: 1) Confirm appointment via SMS, ` +
    `2) Schedule pre-call briefing 30 minutes before, ` +
    `3) Pull contact history and scorecard results, ` +
    `4) Send reminder 24h and 1h before.`
  );
  
  await sendAlert(`📅 Appointment Booked\n👤 ${contact.firstName}\n📞 ${calendarName}\n🕐 ${appointmentTime}`);
}

async function handleAppointmentCancelled(data) {
  const contact = data.contact || {};
  const calendarName = data.calendar?.name || 'Appointment';
  
  console.log(`[APPOINTMENT CANCELLED] ${calendarName} - ${contact.firstName}`);
  
  await triggerAgentAction('sales',
    `APPOINTMENT CANCELLED: ${contact.firstName} cancelled ${calendarName}. ` +
    `Actions: 1) Send rebooking offer with next 3 available slots, ` +
    `2) If no response in 24h, escalate to manual follow-up.`
  );
}

async function handleNoShow(data) {
  const contact = data.contact || {};
  const calendarName = data.calendar?.name || 'Appointment';
  
  console.log(`[NO-SHOW] ${calendarName} - ${contact.firstName}`);
  
  await triggerAgentAction('sales',
    `NO-SHOW DETECTED: ${contact.firstName} missed ${calendarName}. ` +
    `Actions: 1) Wait 15 minutes then send friendly SMS, ` +
    `2) Offer rebooking with next 3 available slots, ` +
    `3) Add no-show tag, ` +
    `4) If no response in 24h, alert owner.`
  );
  
  await sendAlert(`⚠️ No-Show\n👤 ${contact.firstName}\n📞 ${calendarName}\nRebooking sequence triggered`);
}

async function handleOpportunityCreated(data) {
  const opportunity = data.opportunity || data;
  const contact = data.contact || {};
  const value = opportunity.monetaryValue || 0;
  
  console.log(`[OPPORTUNITY] $${value} - ${contact.firstName}`);
  
  if (value >= 997) {
    await sendAlert(`💼 High-Value Opportunity\n👤 ${contact.firstName}\n💰 $${value}`);
  }
}

async function handleStageChange(data) {
  const opportunity = data.opportunity || data;
  const newStage = data.newStage || opportunity.pipelineStage || '';
  const contact = data.contact || {};
  
  console.log(`[STAGE CHANGE] ${contact.firstName} → ${newStage}`);
  
  // Backend Prospect stage triggers high-ticket sequence
  if (newStage.toLowerCase().includes('backend') || newStage.toLowerCase().includes('prospect')) {
    await triggerAgentAction('sales',
      `BACKEND PROSPECT: ${contact.firstName} moved to Backend Prospect stage. ` +
      `Actions: 1) Send Implementation Intensive intro email, ` +
      `2) Schedule discovery call invite, ` +
      `3) Add high-ticket-prospect tag.`
    );
  }
}

async function handleStatusChange(data) {
  const opportunity = data.opportunity || data;
  const newStatus = data.newStatus || opportunity.status || '';
  const contact = data.contact || {};
  const value = opportunity.monetaryValue || 0;
  
  console.log(`[STATUS CHANGE] ${contact.firstName} → ${newStatus}`);
  
  if (newStatus === 'won') {
    await sendAlert(`🎉 DEAL WON!\n👤 ${contact.firstName}\n💰 $${value}`);
  } else if (newStatus === 'lost') {
    await triggerAgentAction('sales',
      `DEAL LOST: ${contact.firstName} - $${value}. ` +
      `Actions: 1) Log loss reason, ` +
      `2) Schedule re-engagement in 30 days, ` +
      `3) Add lost-deal tag.`
    );
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  
  // Only accept POST to /webhook
  if (req.method !== 'POST' || !req.url.startsWith('/webhook')) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  
  // Collect body
  let body = '';
  req.on('data', chunk => { body += chunk; });
  
  req.on('end', async () => {
    // Verify signature
    const signature = req.headers['x-ghl-signature'] || req.headers['x-openclaw-secret'];
    if (WEBHOOK_SECRET !== 'replace-with-32byte-random-secret' && !verifySignature(body, signature)) {
      console.warn('[WARN] Invalid webhook signature');
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }
    
    try {
      const payload = JSON.parse(body);
      const eventType = payload.type || payload.event || payload.eventType || 'unknown';
      
      console.log(`[WEBHOOK] ${eventType} received at ${new Date().toISOString()}`);
      
      // Route to handler
      const handler = eventHandlers[eventType];
      if (handler) {
        await handler(payload);
        res.writeHead(200);
        res.end('OK');
      } else {
        console.log(`[UNHANDLED] Event type: ${eventType}`);
        res.writeHead(200);
        res.end('Event received but no handler');
      }
    } catch (error) {
      console.error('[ERROR]', error.message);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });
});

server.listen(PORT, HOST, async () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     OpenClaw GHL Webhook Handler v2.0                        ║
║     Phase 3 Assessment → eBook → Course Automation           ║
║     Listening on http://${HOST}:${PORT}/webhook                 ║
║     Location: ${GHL_LOCATION_ID}                        ║
╚══════════════════════════════════════════════════════════════╝
  `);
  
  // Load Phase 3 modules
  await loadPhase3Modules();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down webhook handler...');
  server.close(() => process.exit(0));
});
