#!/usr/bin/env node
/**
 * OpenClaw GHL Webhook Handler
 *
 * Receives webhook calls from GoHighLevel workflow webhooks and platform
 * webhook deliveries. Workflow webhooks are authenticated with either
 * Authorization: Bearer <token> or OpenClaw HMAC/shared-secret headers.
 * Platform webhooks are authenticated with GHL's Ed25519 signature header.
 */

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { listTenants } from '../lib/ghl-tenant-resolver.mjs';
import { authenticateGhlWebhookRequest, normalizeGhlWebhookPayload } from '../lib/ghl-webhook.mjs';
import { deliveryKey, claimEvent, settleEvent } from '../lib/ghl-event-ledger.mjs';
import { openclawSend, openclawMessage } from '../lib/safe-exec.mjs';
import { childLogger } from '../lib/logger.mjs';
import { registry, eventProcessedTotal, eventProcessingDuration } from '../lib/metrics.mjs';
import {
  parseTelegramApprovalCallback,
  verifyTelegramApprovalCallback,
  resolveHumanApproval,
  answerTelegramCallback,
} from '../lib/human-approval.mjs';
import { initAutoRefresh } from '../skills/ghl-oauth-manager.mjs';
import { validateGhlWebhookPayload } from '../lib/schemas/ghl-webhook.schema.mjs';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Toolkit entitlement writer — lazy admin client. Service role bypasses RLS
// for the server-side write. Null-safe: if the env vars are absent the
// entitlement write is skipped rather than crashing the handler.
const supaAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

const log = childLogger({ module: 'webhook-handler' });

process.on('unhandledRejection', reason => {
  log.error({ err: reason }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', err => {
  log.error({ err }, 'Uncaught Exception');
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const skillsSearchPaths = [
  process.env.OPENCLAW_SKILLS_DIR,
  // canonical tree first (A5): repo skills/ is the only hand-edited source;
  // workspace/skills is a generated mirror (scripts/sync-canonical-config.mjs)
  path.join(__dirname, '..', 'skills'),
  path.join(__dirname, '..', 'workspace', 'skills'),
  path.join(process.cwd(), 'skills'),
  '/opt/openclaw/skills',
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

let assessmentHandler = null;
let ebookAutomation = null;
let cartRecovery = null;
let rtlLeadEngine = null;

async function loadPhase3Modules() {
  assessmentHandler = await importSkill('assessment-handler.mjs', 'assessment handler');
  ebookAutomation = await importSkill('ebook-buyer-automation.mjs', 'ebook automation');
  cartRecovery = await importSkill('abandoned-cart-recovery.mjs', 'abandoned cart recovery');
  // RTL revenue loop (Phase C) — routes rtl.* events from the Royal Results
  // tenant; DRY_RUN-gated inside the module (fail-safe default: dry-run).
  rtlLeadEngine = await importSkill('rtl-lead-engine.mjs', 'rtl lead engine');

  const loaded = [assessmentHandler, ebookAutomation, cartRecovery, rtlLeadEngine].filter(Boolean).length;
  if (loaded === 4) {
    log.info('Business modules loaded (4/4)');
  } else {
    log.warn({ loaded }, 'Business modules partially loaded');
  }
}

const PORT = process.env.OPENCLAW_GHL_WEBHOOK_PORT || 8788;
const HOST = process.env.OPENCLAW_GHL_WEBHOOK_HOST || '0.0.0.0';
const WEBHOOK_SECRET = process.env.OPENCLAW_GHL_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error('FATAL: OPENCLAW_GHL_WEBHOOK_SECRET is not set. Refusing to start.');
  process.exit(1);
}
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '';
const TEAMS_CHANNEL_ID = process.env.OPENCLAW_ALERT_TEAMS_CHANNEL_ID || '';
const M365_EMAIL_OWNER = process.env.M365_EMAIL_OWNER || '';
const GATEWAY_AUTH_TOKEN = process.env.OPENCLAW_GATEWAY_AUTH_TOKEN || '';
const GHL_WEBHOOK_PUBLIC_KEY = process.env.OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY || undefined;

const MAX_BODY_SIZE = 1 * 1024 * 1024;
const WEBHOOK_PATHS = new Set(['/webhook', '/webhook/ghl', '/webhooks/ghl']);
const TELEGRAM_CALLBACK_PATH = '/webhook/telegram';

const configuredTenants = listTenants();
if (configuredTenants.length === 0) {
  log.fatal('No GHL tenants configured - set GHL_PRIVATE_INTEGRATION_TOKEN_* and GHL_LOCATION_ID_*');
  process.exit(1);
}

// RTL revenue loop (Phase C): rtl.* events come from the Royal Results
// workflow Custom Webhooks; conversation.message.inbound covers replies. All
// of them route to the RTL engine, which enforces its own RR tenant guard —
// RTL leads must never hit the legacy TJB handlers below, and TJB events
// never reach the RTL engine (audit 2026-07-11-004).
async function handleRtl(data) {
  if (!rtlLeadEngine) {
    log.error({ eventType: data.eventType }, 'rtl event received but rtl-lead-engine is not loaded');
    await sendAlert(`RTL event ${data.eventType} arrived with no engine loaded — investigate.`);
    return;
  }
  await rtlLeadEngine.handleRtlEvent(data.eventType, data, { sendAlert });
}

const eventHandlers = {
  'rtl.optin': handleRtl,
  'rtl.inbound_message': handleRtl,
  'rtl.checkout_abandoned': handleRtl,
  'rtl.testimonial_asked': handleRtl,
  'rtl.dormant7': handleRtl,
  'rtl.comment': handleRtl,
  'conversation.message.inbound': handleRtl,
  'contact.created': handleNewContact,
  'contact.updated': handleContactUpdate,
  'contact.tag.added': handleTagAdded,
  'contact.tag.updated': handleTagAdded,
  'form.submitted': handleFormSubmission,
  'funnel.page.visited': handlePageVisit,
  'payment.received': handlePayment,
  'subscription.created': handleSubscription,
  'subscription.cancelled': handleSubscriptionCancelled,
  'appointment.created': handleAppointmentBooked,
  'appointment.cancelled': handleAppointmentCancelled,
  'appointment.noshow': handleNoShow,
  'opportunity.created': handleOpportunityCreated,
  'opportunity.stage.changed': handleStageChange,
  'opportunity.status.changed': handleStatusChange,
};

async function sendTelegramAlert(message) {
  if (!TELEGRAM_CHAT_ID) return;
  try {
    await openclawSend({ agent: 'main', channel: 'telegram', to: TELEGRAM_CHAT_ID, message });
  } catch (error) {
    log.error({ err: error.message }, 'Failed to send Telegram alert');
  }
}

async function sendTeamsAlert(message) {
  if (!TEAMS_CHANNEL_ID) return;
  try {
    await openclawSend({ agent: 'main', channel: 'msteams', to: TEAMS_CHANNEL_ID, message });
  } catch (error) {
    log.error({ err: error.message }, 'Failed to send Teams alert');
  }
}

async function sendEmailAlert(message) {
  if (!M365_EMAIL_OWNER) return;
  try {
    await openclawSend({ agent: 'main', channel: 'email', to: M365_EMAIL_OWNER, message });
  } catch (error) {
    log.error({ err: error.message }, 'Failed to send Email alert');
  }
}

async function sendAlert(message) {
  const results = await Promise.allSettled([
    sendTelegramAlert(message),
    sendTeamsAlert(message),
    sendEmailAlert(message),
  ]);
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length > 0) {
    log.error({ succeeded: results.length - failures.length, total: results.length }, 'Partial alert delivery failure');
  }
}

async function triggerAgentAction(agentId, message) {
  try {
    await openclawMessage({ agent: agentId, message });
  } catch (error) {
    log.error({ agentId, err: error.message }, 'Failed to trigger agent');
  }
}

async function handleNewContact(data) {
  const contact = data.contact || data;
  const name = contact.firstName || contact.name || 'Unknown';
  const email = contact.email || '';
  const phone = contact.phone || '';
  const source = contact.source || 'direct';

  log.info({ name, email, source }, 'New contact');

  await triggerAgentAction(
    'marketing',
    `NEW LEAD ALERT: ${name} entered via ${source}. Email: ${email}, Phone: ${phone}. Execute speed-to-lead sequence: send welcome SMS within 60 seconds, add scorecard-lead tag, update pipeline to New Lead stage.`,
  );

  await sendAlert(`New lead: ${name}\nEmail: ${email}\nPhone: ${phone}\nSource: ${source}`);
}

async function handleContactUpdate(data) {
  const contact = data.contact || data;
  const customFields = contact.customFields || {};

  if (customFields.lead_score) {
    const score = parseInt(customFields.lead_score, 10);
    if (score >= 90) {
      await sendAlert(`Hot lead: ${contact.firstName || 'Unknown'} scored ${score}/100. Immediate follow-up recommended.`);
    }
  }
}

async function handleTagAdded(data) {
  const contact = data.contact || data;
  const tag = data.tag || '';

  log.info({ contact: contact.firstName, tag }, 'Tag added');

  if (tag === 'high-alignment') {
    await triggerAgentAction(
      'marketing',
      `High-alignment contact detected: ${contact.firstName}. Accelerate nurture sequence and send the course offer within 3 days instead of 7.`,
    );
  }

  if (tag === 'high-ticket-prospect') {
    await triggerAgentAction(
      'sales',
      `New high-ticket prospect: ${contact.firstName} ${contact.lastName || ''}. Review contact history and prepare personalized outreach for Implementation Intensive.`,
    );
    await sendAlert(`High-ticket prospect: ${contact.firstName}\nPipeline value: $997-$2,497`);
  }
}

async function handleFormSubmission(data) {
  const formName = data.formName || data.form?.name || 'Unknown Form';
  const contact = data.contact || {};
  const fields = data.fields || data.formData || {};

  log.info({ formName, contact: contact.firstName }, 'Form submitted');

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

    const score = fields.alignment_score || fields.score || 0;
    await triggerAgentAction(
      'marketing',
      `SCORECARD SUBMISSION: ${contact.firstName} completed Divine Alignment Scorecard. Score: ${score}. Update alignment_score, add the correct alignment tag, route to the correct result page, and trigger the scorecard nurture sequence.`,
    );

    await sendAlert(`Scorecard completed\nContact: ${contact.firstName}\nScore: ${score}/100`);
  }

  if (formName.toLowerCase().includes('application') || formName.toLowerCase().includes('intensive')) {
    await triggerAgentAction(
      'sales',
      `HIGH-TICKET APPLICATION: ${contact.firstName} ${contact.lastName || ''} applied. Do not auto-approve. Generate an application summary and send it for review.`,
    );

    await sendAlert(
      `High-ticket application\nContact: ${contact.firstName} ${contact.lastName || ''}\nEmail: ${contact.email || ''}\nOffer: Implementation Intensive\nStatus: manual review required`,
    );
  }
}

async function handlePageVisit(data) {
  const page = data.page || data.pagePath || '';
  const contact = data.contact || {};

  if (!page.includes('/order') && !page.includes('/checkout')) {
    return;
  }

  log.info({ contact: contact.firstName, page }, 'Checkout page visit');

  if (cartRecovery && contact.id) {
    try {
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

async function handlePayment(data) {
  const amount = data.amount || data.payment?.amount || 0;
  const product = data.product?.name || data.productName || 'Unknown';
  const contact = data.contact || {};

  log.info({ amount, product, contact: contact.firstName }, 'Payment received');

  if (cartRecovery && contact.id) {
    try {
      await cartRecovery.markCartCompleted(contact.id);
      log.info({ contactId: contact.id }, 'Cart completed, abandoned recovery stopped');
    } catch {
      // Missing cart state is not fatal.
    }
  }

  // Toolkit entitlement — writes public.entitlements so the Toolkit app unlocks
  // the paid module routes for this buyer's email. Idempotent via the unique
  // (email, product_id) key. Non-fatal: any failure is logged, never thrown.
  try {
    const paymentLinkId =
      data.paymentLinkId ||
      data.payment?.paymentLinkId ||
      data.payment?.paymentLink ||
      data.payment_link_id ||
      '';
    const buyerEmail =
      data.contact?.email ||
      data.email ||
      data.customer?.email ||
      data.payment?.customer?.email;
    const isToolkit =
      product.toLowerCase().includes('purpose activation toolkit') ||
      paymentLinkId === '696ec80453f21b434dfae38d';

    if (isToolkit && buyerEmail && supaAdmin) {
      const { error } = await supaAdmin.from('entitlements').upsert(
        {
          email: String(buyerEmail).toLowerCase().trim(),
          product_id: 'purpose-activation-toolkit',
          source: `ghl:${paymentLinkId || 'unknown-link'}`,
          gross_amount: Number(amount) || null,
          contact_id: contact.id || null,
          raw: data,
        },
        { onConflict: 'email,product_id' },
      );
      if (error) {
        log.error({ err: error.message, email: buyerEmail }, 'Toolkit entitlement write failed');
      } else {
        log.info({ email: buyerEmail }, 'Toolkit entitlement granted');
      }
    }
  } catch (err) {
    log.error({ err: err.message }, 'Toolkit entitlement exception');
  }

  if (amount >= 7 && amount <= 67 && ebookAutomation && contact.id) {
    try {
      const result = await ebookAutomation.processEbookPurchase(contact.id, product, amount);
      log.info({ name: result.name, ladder: result.ladder }, 'eBook automation processed');
      return;
    } catch (error) {
      log.error({ err: error.message }, 'eBook automation error');
    }
  }

  let stage = 'eBook Buyer';
  let tag = 'ebook-buyer';
  if (amount >= 297) {
    stage = 'Course Buyer';
    tag = 'course-buyer';
  } else if (amount >= 67) {
    stage = 'Lite Buyer';
  }

  await triggerAgentAction(
    'marketing',
    `PAYMENT RECEIVED: $${amount} from ${contact.firstName} for ${product}. Add ${tag}, move to ${stage}, trigger the correct onboarding, and update value_ladder_step.`,
  );

  await sendAlert(`Payment received\nContact: ${contact.firstName}\nProduct: ${product}\nAmount: $${amount}`);
}

async function handleSubscription(data) {
  const plan = data.plan?.name || data.subscription?.name || 'Unknown';
  const amount = data.amount || data.subscription?.amount || 0;
  const contact = data.contact || {};

  log.info({ plan, contact: contact.firstName }, 'New subscription');

  await triggerAgentAction(
    'marketing',
    `NEW SUBSCRIPTION: ${contact.firstName} joined ${plan} at $${amount}/mo. Add membership-active, move to Membership Active, trigger onboarding, and grant community access.`,
  );

  await sendAlert(`New member\nContact: ${contact.firstName}\nPlan: ${plan}\nAmount: $${amount}/mo`);
}

async function handleSubscriptionCancelled(data) {
  const plan = data.plan?.name || 'Unknown';
  const contact = data.contact || {};
  const reason = data.reason || 'Not specified';

  log.info({ plan, contact: contact.firstName }, 'Subscription cancelled');

  await triggerAgentAction(
    'support',
    `SUBSCRIPTION CANCELLED: ${contact.firstName} cancelled ${plan}. Reason: ${reason}. Update membership_status, start the win-back sequence after 7 days, and log the cancellation reason.`,
  );

  await sendAlert(`Cancellation\nContact: ${contact.firstName}\nPlan: ${plan}\nReason: ${reason}`);
}

async function handleAppointmentBooked(data) {
  const appointmentTime = data.startTime || data.appointment?.startTime || 'Unknown';
  const contact = data.contact || {};
  const calendarName = data.calendar?.name || 'Discovery Call';

  log.info({ calendar: calendarName, contact: contact.firstName }, 'Appointment booked');

  await triggerAgentAction(
    'sales',
    `APPOINTMENT BOOKED: ${contact.firstName} scheduled ${calendarName} for ${appointmentTime}. Confirm by SMS, schedule a pre-call briefing, pull contact history and scorecard results, and send reminders at 24h and 1h.`,
  );

  await sendAlert(`Appointment booked\nContact: ${contact.firstName}\nCalendar: ${calendarName}\nTime: ${appointmentTime}`);
}

async function handleAppointmentCancelled(data) {
  const contact = data.contact || {};
  const calendarName = data.calendar?.name || 'Appointment';

  log.info({ calendar: calendarName, contact: contact.firstName }, 'Appointment cancelled');

  await triggerAgentAction(
    'sales',
    `APPOINTMENT CANCELLED: ${contact.firstName} cancelled ${calendarName}. Send a rebooking offer with the next 3 available slots. If there is no response within 24 hours, escalate to manual follow-up.`,
  );
}

async function handleNoShow(data) {
  const contact = data.contact || {};
  const calendarName = data.calendar?.name || 'Appointment';

  log.info({ calendar: calendarName, contact: contact.firstName }, 'No-show detected');

  await triggerAgentAction(
    'sales',
    `NO-SHOW DETECTED: ${contact.firstName} missed ${calendarName}. Wait 15 minutes, send a friendly SMS, offer rebooking with the next 3 slots, add the no-show tag, and alert the owner if there is no response within 24 hours.`,
  );

  await sendAlert(`No-show\nContact: ${contact.firstName}\nCalendar: ${calendarName}\nStatus: rebooking sequence triggered`);
}

async function handleOpportunityCreated(data) {
  const opportunity = data.opportunity || data;
  const contact = data.contact || {};
  const value = opportunity.monetaryValue || 0;

  log.info({ value, contact: contact.firstName }, 'Opportunity created');

  if (value >= 997) {
    await sendAlert(`High-value opportunity\nContact: ${contact.firstName}\nAmount: $${value}`);
  }
}

async function handleStageChange(data) {
  const opportunity = data.opportunity || data;
  const newStage = data.newStage || opportunity.pipelineStage || '';
  const contact = data.contact || {};

  log.info({ contact: contact.firstName, newStage }, 'Stage change');

  if (newStage.toLowerCase().includes('backend') || newStage.toLowerCase().includes('prospect')) {
    await triggerAgentAction(
      'sales',
      `BACKEND PROSPECT: ${contact.firstName} moved to ${newStage}. Send the Implementation Intensive intro email, schedule a discovery call invite, and add the high-ticket-prospect tag.`,
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
    await sendAlert(`Deal won\nContact: ${contact.firstName}\nAmount: $${value}`);
    return;
  }

  if (newStatus === 'lost') {
    await triggerAgentAction(
      'sales',
      `DEAL LOST: ${contact.firstName} - $${value}. Log the loss reason, schedule re-engagement in 30 days, and add the lost-deal tag.`,
    );
  }
}

function getPathname(url) {
  return new URL(url || '/', 'http://127.0.0.1').pathname;
}

function isWebhookPath(url) {
  return WEBHOOK_PATHS.has(getPathname(url));
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bodySize = 0;
    let settled = false;

    req.on('data', chunk => {
      if (settled) return;
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        settled = true;
        reject(Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });

    req.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

async function processEventAsync(eventType, payload, traceId, authStrategy, ledgerKey = null) {
  const stopTimer = eventProcessingDuration.startTimer({ event_type: eventType });
  const handler = eventHandlers[eventType];

  try {
    if (!handler) {
      eventProcessedTotal.inc({ event_type: eventType, status: 'ignored' });
      log.info({ trace_id: traceId, eventType, authStrategy }, 'Webhook received for unsupported event type');
      if (ledgerKey) await settleEvent(ledgerKey, true, 'no handler registered');
      return;
    }

    await handler(payload);
    eventProcessedTotal.inc({ event_type: eventType, status: 'success' });
    if (ledgerKey) await settleEvent(ledgerKey, true);
  } catch (error) {
    eventProcessedTotal.inc({ event_type: eventType, status: 'error' });
    log.error({ trace_id: traceId, eventType, authStrategy, err: error.message }, 'Webhook handler failed after acknowledgement');
    if (ledgerKey) await settleEvent(ledgerKey, false, error.message);
  } finally {
    stopTimer();
  }
}

async function handleTelegramCallback(req, res) {
  let body;
  try {
    const raw = await collectRequestBody(req);
    body = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    log.warn({ err: err.message }, 'Failed to parse Telegram callback body');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const callbackQuery = body?.callback_query;
  if (!callbackQuery) {
    // Not a callback query (e.g. a regular message update) — acknowledge silently
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const callbackData = callbackQuery.data || '';
  const callbackQueryId = callbackQuery.id;

  const parsed = parseTelegramApprovalCallback(callbackData);
  if (!parsed) {
    log.warn({ callbackData }, 'Received unknown Telegram callback data');
    await answerTelegramCallback(callbackQueryId, 'Unknown action').catch((err) => log.warn({ err: err.message }, 'Failed to answer unknown callback'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!verifyTelegramApprovalCallback(parsed)) {
    log.warn({ approvalId: parsed.approvalId }, 'Telegram approval callback HMAC verification failed');
    await answerTelegramCallback(callbackQueryId, 'Invalid signature').catch((err) => log.warn({ err: err.message }, 'Failed to answer invalid signature callback'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const fromUser = callbackQuery.from?.username || callbackQuery.from?.first_name || 'unknown';

  try {
    await resolveHumanApproval({
      approvalId: parsed.approvalId,
      decision: parsed.decision,
      resolvedBy: fromUser,
      channel: 'telegram',
    });

    const text = parsed.decision === 'approve' ? '✅ Approved' : '❌ Rejected';
    await answerTelegramCallback(callbackQueryId, text).catch((err) => log.warn({ err: err.message }, 'Failed to answer approval callback'));

    log.info({ approvalId: parsed.approvalId, decision: parsed.decision, resolvedBy: fromUser }, 'Telegram approval resolved');
  } catch (error) {
    log.error({ approvalId: parsed.approvalId, err: error.message }, 'Failed to resolve Telegram approval');
    await answerTelegramCallback(callbackQueryId, 'Error processing approval').catch((err) => log.warn({ err: err.message }, 'Failed to answer error callback'));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

const server = http.createServer(async (req, res) => {
  const pathname = getPathname(req.url);

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      telegramCallbackPath: TELEGRAM_CALLBACK_PATH,
      webhookAuthModes: {
        ghlEd25519: true,
        workflowBearer: Boolean(GATEWAY_AUTH_TOKEN),
        openclawHmac: Boolean(WEBHOOK_SECRET),
      },
    }));
    return;
  }

  if (req.method === 'GET' && pathname === '/metrics') {
    try {
      const metrics = await registry.metrics();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(metrics);
    } catch {
      res.writeHead(500);
      res.end('Error collecting metrics');
    }
    return;
  }

  if (!isWebhookPath(req.url) && pathname !== '/health' && pathname !== '/metrics') {
    if (GATEWAY_AUTH_TOKEN) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (token !== GATEWAY_AUTH_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }
  }

  if (req.method === 'POST' && pathname === TELEGRAM_CALLBACK_PATH) {
    await handleTelegramCallback(req, res);
    return;
  }

  if (req.method !== 'POST' || !isWebhookPath(req.url)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  try {
    const rawBody = await collectRequestBody(req);
    const auth = authenticateGhlWebhookRequest({
      headers: req.headers,
      rawBody,
      bearerToken: GATEWAY_AUTH_TOKEN,
      openclawSecret: WEBHOOK_SECRET,
      publicKey: GHL_WEBHOOK_PUBLIC_KEY,
    });

    if (!auth.ok) {
      log.warn({ reason: auth.reason, strategy: auth.strategy, path: pathname }, 'Rejected webhook request');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized webhook request', reason: auth.reason }));
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      return;
    }

    const traceId = crypto.randomUUID();
    const normalized = normalizeGhlWebhookPayload(payload);
    const eventType = normalized.eventType || 'unknown';

    // Validate payload shape against registered Zod schema (non-fatal — log and continue)
    const validation = validateGhlWebhookPayload(eventType, normalized.payload);
    if (!validation.success) {
      log.warn({
        trace_id: traceId,
        eventType,
        issues: validation.error?.issues?.map(i => `${i.path.join('.')}: ${i.message}`),
      }, 'Webhook payload failed schema validation — processing with raw payload');
    }

    // Idempotency (Advancement 3): claim this delivery BEFORE acknowledging.
    // GHL can double-deliver even on 2xx; duplicates are acknowledged so the
    // retry engine stops, but nothing dispatches twice. Claim rows live in
    // agent_events (partial unique index on correlation_id for ghl-webhook).
    const ledgerKey = deliveryKey(req.headers, rawBody, eventType, normalized.payload);
    const firstDelivery = await claimEvent(ledgerKey, eventType, {
      rawEventType: normalized.rawEventType,
      locationId: normalized.payload.locationId || null,
      contactId: normalized.payload.contact?.id || null,
      authStrategy: auth.strategy,
      traceId,
    });
    if (!firstDelivery) {
      eventProcessedTotal.inc({ event_type: eventType, status: 'duplicate' });
      log.info({ trace_id: traceId, eventType, ledgerKey }, 'Duplicate webhook delivery ignored');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, duplicate: true, eventType }));
      return;
    }

    const enrichedPayload = {
      ...normalized.payload,
      trace_id: traceId,
      webhook_auth_strategy: auth.strategy,
    };

    // PHASE 8 DEBUG: log payload shape (keys only, no values) to identify GHL Custom Data placement
    try {
      const topKeys = Object.keys(payload || {});
      const customDataKeys = payload && typeof payload.customData === 'object' && payload.customData ? Object.keys(payload.customData) : null;
      const customKeys = payload && typeof payload.custom === 'object' && payload.custom ? Object.keys(payload.custom) : null;
      const dataKeys = payload && typeof payload.data === 'object' && payload.data ? Object.keys(payload.data) : null;
      log.info({
        trace_id: traceId,
        topKeys,
        customDataKeys,
        customKeys,
        dataKeys,
        hasType: Boolean(payload && payload.type),
        hasEvent: Boolean(payload && payload.event),
        hasEventType: Boolean(payload && payload.eventType),
      }, 'PHASE8-DEBUG payload shape');
    } catch (e) {
      log.warn({ trace_id: traceId, err: e.message }, 'PHASE8-DEBUG failed');
    }

    log.info({
      trace_id: traceId,
      path: pathname,
      eventType,
      rawEventType: normalized.rawEventType,
      authStrategy: auth.strategy,
    }, 'Webhook received');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      traceId,
      eventType,
      rawEventType: normalized.rawEventType,
      handled: Boolean(eventHandlers[eventType]),
    }));

    setImmediate(() => {
      processEventAsync(eventType, enrichedPayload, traceId, auth.strategy, ledgerKey).catch(error => {
        log.error({ trace_id: traceId, eventType, err: error.message }, 'Unexpected webhook dispatch failure');
      });
    });
  } catch (error) {
    if (error.code === 'BODY_TOO_LARGE') {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large', maxBytes: MAX_BODY_SIZE }));
      return;
    }

    log.error({ err: error.message, path: pathname }, 'Webhook processing error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

server.listen(PORT, HOST, async () => {
  log.info({
    host: HOST,
    port: PORT,
    tenants: configuredTenants,
    webhookPaths: Array.from(WEBHOOK_PATHS),
    telegramCallbackPath: TELEGRAM_CALLBACK_PATH,
    webhookAuthModes: {
      ghlEd25519: true,
      workflowBearer: Boolean(GATEWAY_AUTH_TOKEN),
      openclawHmac: Boolean(WEBHOOK_SECRET),
    },
  }, 'OpenClaw GHL Webhook Handler started');

  try {
    await loadPhase3Modules();
  } catch (error) {
    log.error({ err: error.message }, 'Phase 3 module loading failed (non-fatal)');
  }

  try {
    initAutoRefresh();
    log.info('GHL OAuth auto-refresh initialized');
  } catch (error) {
    log.error({ err: error.message }, 'GHL OAuth auto-refresh initialization failed (non-fatal)');
  }
});

function gracefulShutdown() {
  log.info('Shutting down webhook handler');
  server.close(() => process.exit(0));
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
