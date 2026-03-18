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
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolve as resolveTenant, listTenants } from '../lib/ghl-tenant-resolver.mjs';
import { openclawSend, openclawMessage } from '../lib/safe-exec.mjs';
import { childLogger } from '../lib/logger.mjs';
import { registry, eventProcessedTotal, eventProcessingDuration } from '../lib/metrics.mjs';

const log = childLogger({ module: 'webhook-handler' });

// Prevent unhandled errors from crashing the process
process.on('unhandledRejection', (reason, promise) => {
  log.error({ err: reason }, 'Unhandled Promise Rejection');
});
process.on('uncaughtException', (err) => {
  log.error({ err }, 'Uncaught Exception');
});

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
    log.warn({ label, searchPaths: skillsSearchPaths }, 'Skill module not found');
    return null;
  }

  try {
    return await import(pathToFileURL(resolved).href);
  } catch (error) {
    log.warn({ label, path: resolved, err: error.message }, 'Failed to load skill module');
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
    log.info('Phase 3 modules loaded (3/3)');
  } else {
    log.warn({ loaded }, 'Phase 3 modules partially loaded');
  }
}

// Configuration from environment — all secrets required at startup
const PORT = process.env.OPENCLAW_GHL_WEBHOOK_PORT || 8788;
const HOST = process.env.OPENCLAW_GHL_WEBHOOK_HOST || '127.0.0.1';

// Required environment variables — fail fast if missing
const REQUIRED_ENV = [
  'OPENCLAW_GHL_WEBHOOK_SECRET',
  'OPENCLAW_ALERT_TELEGRAM_CHAT_ID',
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  log.fatal({ missing: missingEnv }, 'Missing required environment variables');
  process.exit(1);
}

// Verify at least one GHL tenant is configured
const configuredTenants = listTenants();
if (configuredTenants.length === 0) {
  log.fatal('No GHL tenants configured — set GHL_PRIVATE_INTEGRATION_TOKEN_TJB + GHL_LOCATION_ID_TJB (and/or MSL)');
  process.exit(1);
}

const WEBHOOK_SECRET = process.env.OPENCLAW_GHL_WEBHOOK_SECRET;
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID;
const TEAMS_CHANNEL_ID = process.env.OPENCLAW_ALERT_TEAMS_CHANNEL_ID || '';
const M365_EMAIL_OWNER = process.env.M365_EMAIL_OWNER || '';
const GATEWAY_AUTH_TOKEN = process.env.OPENCLAW_GATEWAY_AUTH_TOKEN || '';

// Request body size limit (1 MB)
const MAX_BODY_SIZE = 1 * 1024 * 1024;

// Allowed GHL event types (whitelist)
const ALLOWED_EVENT_TYPES = new Set([
  'contact.created', 'contact.updated', 'contact.tag.added',
  'form.submitted', 'funnel.page.visited',
  'payment.received', 'subscription.created', 'subscription.cancelled',
  'appointment.created', 'appointment.cancelled', 'appointment.noshow',
  'opportunity.created', 'opportunity.stage.changed', 'opportunity.status.changed',
]);

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

// Send Telegram alert via OpenClaw (shell-injection safe)
async function sendTelegramAlert(message) {
  try {
    await openclawSend({ agent: 'main', channel: 'telegram', to: TELEGRAM_CHAT_ID, message });
  } catch (error) {
    log.error({ err: error.message }, 'Failed to send Telegram alert');
  }
}

// Send MS Teams alert via OpenClaw (shell-injection safe)
async function sendTeamsAlert(message) {
  if (!TEAMS_CHANNEL_ID) return;
  try {
    await openclawSend({ agent: 'main', channel: 'msteams', to: TEAMS_CHANNEL_ID, message });
  } catch (error) {
    log.error({ err: error.message }, 'Failed to send Teams alert');
  }
}

// Send Email alert via OpenClaw (Microsoft 365)
async function sendEmailAlert(message) {
  if (!M365_EMAIL_OWNER) return;
  try {
    await openclawSend({ agent: 'main', channel: 'email', to: M365_EMAIL_OWNER, message });
  } catch (error) {
    log.error({ err: error.message }, 'Failed to send Email alert');
  }
}

// Send alert to all configured channels, log failures
async function sendAlert(message) {
  const results = await Promise.allSettled([
    sendTelegramAlert(message),
    sendTeamsAlert(message),
    sendEmailAlert(message)
  ]);
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    log.error({ succeeded: results.length - failures.length, total: results.length }, 'Partial alert delivery failure');
  }
}

// Trigger OpenClaw agent action (shell-injection safe)
async function triggerAgentAction(agentId, message) {
  try {
    await openclawMessage({ agent: agentId, message });
  } catch (error) {
    log.error({ agentId, err: error.message }, 'Failed to trigger agent');
  }
}

// Event Handlers
async function handleNewContact(data) {
  const contact = data.contact || data;
  const name = contact.firstName || contact.name || 'Unknown';
  const email = contact.email || '';
  const phone = contact.phone || '';
  const source = contact.source || 'direct';

  log.info({ name, email, source }, 'New contact');

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

  log.info({ contact: contact.firstName, tag }, 'Tag added');

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

  log.info({ formName, contact: contact.firstName }, 'Form submitted');

  // Divine Alignment Scorecard submission - Use Phase 3 Assessment Handler
  if (formName.toLowerCase().includes('scorecard') || formName.toLowerCase().includes('alignment')) {
    if (assessmentHandler && contact.id) {
      try {
        const result = await assessmentHandler.processAssessment(contact.id, fields);
        log.info({ tier: result.tier, score: result.score }, 'Assessment processed');
        return;
      } catch (error) {
        log.error({ err: error.message }, 'Assessment error');
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
    log.info({ contact: contact.firstName }, 'Checkout page visit');

    if (cartRecovery && contact.id) {
      try {
        // Determine product from URL
        let product = 'eBook';
        if (page.includes('course')) product = 'Agentic AI Mastery Course';
        if (page.includes('intensive')) product = 'Implementation Intensive';

        const cartUrl = `https://truthjblue.com${page}`;
        await cartRecovery.trackCheckoutVisit(contact.id, product, cartUrl);
        log.info({ contact: contact.firstName, product }, 'Cart tracked');
      } catch (error) {
        log.error({ err: error.message }, 'Cart tracking error');
      }
    }
  }
}

async function handlePayment(data) {
  const amount = data.amount || data.payment?.amount || 0;
  const product = data.product?.name || data.productName || 'Unknown';
  const contact = data.contact || {};

  log.info({ amount, product, contact: contact.firstName }, 'Payment received');

  // Mark abandoned cart as completed if exists
  if (cartRecovery && contact.id) {
    try {
      await cartRecovery.markCartCompleted(contact.id);
      log.info({ contactId: contact.id }, 'Cart completed, abandoned recovery stopped');
    } catch (error) {
      // Cart may not exist, that's OK
    }
  }

  // Use Phase 3 eBook automation for $7-$67 purchases
  if (amount >= 7 && amount <= 67 && ebookAutomation && contact.id) {
    try {
      const result = await ebookAutomation.processEbookPurchase(contact.id, product, amount);
      log.info({ name: result.name, ladder: result.ladder }, 'eBook automation processed');
      return;
    } catch (error) {
      log.error({ err: error.message }, 'eBook automation error');
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

  log.info({ plan, contact: contact.firstName }, 'New subscription');

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

  log.info({ plan, contact: contact.firstName }, 'Subscription cancelled');

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

  log.info({ calendar: calendarName, contact: contact.firstName }, 'Appointment booked');

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

  log.info({ calendar: calendarName, contact: contact.firstName }, 'Appointment cancelled');

  await triggerAgentAction('sales',
    `APPOINTMENT CANCELLED: ${contact.firstName} cancelled ${calendarName}. ` +
    `Actions: 1) Send rebooking offer with next 3 available slots, ` +
    `2) If no response in 24h, escalate to manual follow-up.`
  );
}

async function handleNoShow(data) {
  const contact = data.contact || {};
  const calendarName = data.calendar?.name || 'Appointment';

  log.info({ calendar: calendarName, contact: contact.firstName }, 'No-show detected');

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

  log.info({ value, contact: contact.firstName }, 'Opportunity created');

  if (value >= 997) {
    await sendAlert(`💼 High-Value Opportunity\n👤 ${contact.firstName}\n💰 $${value}`);
  }
}

async function handleStageChange(data) {
  const opportunity = data.opportunity || data;
  const newStage = data.newStage || opportunity.pipelineStage || '';
  const contact = data.contact || {};

  log.info({ contact: contact.firstName, newStage }, 'Stage change');

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

  log.info({ contact: contact.firstName, newStatus }, 'Status change');

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
  // Health check — public, no auth required
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Prometheus metrics — public for scraping
  if (req.method === 'GET' && req.url === '/metrics') {
    try {
      const metrics = await registry.metrics();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(metrics);
    } catch (err) {
      res.writeHead(500);
      res.end('Error collecting metrics');
    }
    return;
  }

  // Gateway API auth for non-webhook, non-health endpoints
  if (!req.url.startsWith('/webhook') && req.url !== '/health' && req.url !== '/metrics') {
    if (GATEWAY_AUTH_TOKEN) {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (token !== GATEWAY_AUTH_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }
  }

  // Only accept POST to /webhook
  if (req.method !== 'POST' || !req.url.startsWith('/webhook')) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Collect body with size limit
  let body = '';
  let bodySize = 0;
  let sizeLimitExceeded = false;

  req.on('data', chunk => {
    bodySize += chunk.length;
    if (bodySize > MAX_BODY_SIZE) {
      sizeLimitExceeded = true;
      req.destroy();
      return;
    }
    body += chunk;
  });

  req.on('end', async () => {
    if (sizeLimitExceeded) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large', maxBytes: MAX_BODY_SIZE }));
      return;
    }

    // Verify HMAC signature (always enforced)
    const signature = req.headers['x-ghl-signature'] || req.headers['x-openclaw-secret'];
    if (!verifySignature(body, signature)) {
      log.warn('Invalid or missing webhook signature');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }

    try {
      const payload = JSON.parse(body);
      const eventType = payload.type || payload.event || payload.eventType || 'unknown';
      const traceId = crypto.randomUUID();

      // Validate event type against whitelist
      if (!ALLOWED_EVENT_TYPES.has(eventType)) {
        log.warn({ eventType, trace_id: traceId }, 'Rejected unknown event type');
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown event type', eventType }));
        return;
      }

      // Attach trace_id to payload for downstream propagation
      payload.trace_id = traceId;

      const reqLog = log.child({ trace_id: traceId, eventType });
      reqLog.info('Webhook received');

      // Route to handler
      const handler = eventHandlers[eventType];
      if (handler) {
        const stopTimer = eventProcessingDuration.startTimer({ event_type: eventType });
        try {
          await handler(payload);
          stopTimer();
          eventProcessedTotal.inc({ event_type: eventType, status: 'success' });
          res.writeHead(200);
          res.end('OK');
        } catch (handlerErr) {
          stopTimer();
          eventProcessedTotal.inc({ event_type: eventType, status: 'error' });
          throw handlerErr;
        }
      } else {
        log.warn({ eventType }, 'Unhandled event type');
        res.writeHead(200);
        res.end('Event received but no handler');
      }
    } catch (error) {
      log.error({ err: error.message }, 'Webhook processing error');
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });
});

server.listen(PORT, HOST, async () => {
  log.info({ host: HOST, port: PORT, tenants: configuredTenants }, 'OpenClaw GHL Webhook Handler v2.1 started (multi-tenant)');

  // Load Phase 3 modules — non-fatal on failure
  try {
    await loadPhase3Modules();
  } catch (err) {
    log.error({ err: err.message }, 'Phase 3 module loading failed (non-fatal)');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  log.info('Shutting down webhook handler');
  server.close(() => process.exit(0));
});
