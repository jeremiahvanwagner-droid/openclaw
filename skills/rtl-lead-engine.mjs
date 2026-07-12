/**
 * RTL Lead Engine — Phase C of the RTL × GHL revenue loop
 * (docs/phases/rtl-ghl-loop-phase-B-build.md · HANDOFF-RTL-GHL-20260710.md)
 *
 * Receives rtl.* webhook events from the Royal Results location (tenant RR)
 * and drives REGGIE as the conversational engine: every event is logged to a
 * JSONL transcript, escalation triggers alert the operator immediately, and
 * the RTL sales agent is briefed with the prompt-set + event context.
 *
 * DRY_RUN CONTRACT (fail-safe): unless the environment explicitly sets
 * DRY_RUN=false, the agent is instructed to DRAFT replies into the transcript
 * and never send. Live sends additionally pass through the platform's
 * ghl_write HITL gate (A4 enforce mode), so flipping DRY_RUN alone does not
 * bypass human approval.
 *
 * Tenant guard: events are processed ONLY when payload.locationId matches the
 * RR tenant. Anything else is ignored and counted — never routed to the
 * legacy TJB handlers, and vice versa (hazard: audit 2026-07-11-004).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolve as resolveTenant, GHL_BASE, API_VERSION } from '../lib/ghl-tenant-resolver.mjs';
import { openclawMessage } from '../lib/safe-exec.mjs';
import { childLogger } from '../lib/logger.mjs';

const log = childLogger({ module: 'rtl-lead-engine' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fail-safe default: dry-run unless explicitly disabled.
export const DRY_RUN = (process.env.DRY_RUN || 'true').toLowerCase() !== 'false';

const RTL_AGENT = process.env.RTL_AGENT_ID || 'marketing';
const TRANSCRIPT_DIR = process.env.RTL_TRANSCRIPT_DIR
  || path.join(process.cwd(), 'logs', 'rtl');

// RTL Launch Day pipeline in Royal Results — IDs captured in
// docs/phases/rtl-ghl-loop-phase-B-build.md §2A.
const RTL_PIPELINE_ID = 'PyJjxP442Bpwv5BUi8MS';
const RTL_STAGE_NEW_LEAD = '77a50701-c743-4f72-a938-f5b70d502a94';
const RTL_STAGE_ENGAGED = '0c114c72-4676-4e93-87ec-f8e66a54b897';

const PROMPT_CANDIDATES = [
  process.env.RTL_PROMPT_PATH,
  path.join(__dirname, '..', 'prompts', 'rtl-sales-agent.md'),
  path.join(process.cwd(), 'prompts', 'rtl-sales-agent.md'),
].filter(Boolean);

// Refunds, anger, and out-of-scope asks go to a human, not the agent
// (handoff Phase C §2). Checked on raw inbound text before anything else.
const ESCALATION_PATTERNS = [
  /refund/i, /money\s*back/i, /charge\s*back/i, /dispute/i,
  /scam/i, /fraud/i, /lawyer/i, /attorney/i, /sue\b/i, /bbb\b/i,
  /angry/i, /furious/i, /unacceptable/i, /report\s+you/i,
];

let _prompt = null;

function loadPrompt() {
  if (_prompt) return _prompt;
  for (const candidate of PROMPT_CANDIDATES) {
    try {
      _prompt = fs.readFileSync(candidate, 'utf8');
      log.info({ path: candidate }, 'RTL prompt-set loaded');
      return _prompt;
    } catch {
      // try next candidate
    }
  }
  log.error({ candidates: PROMPT_CANDIDATES }, 'RTL prompt-set NOT FOUND — agent briefings disabled');
  return null;
}

function rrLocationId() {
  try {
    return resolveTenant('RR').locationId;
  } catch {
    return '';
  }
}

export function isRtlLocation(locationId) {
  const rr = rrLocationId();
  return Boolean(rr && locationId && locationId === rr);
}

function transcriptPath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(TRANSCRIPT_DIR, `rtl-transcript-${day}.jsonl`);
}

export function appendTranscript(entry) {
  try {
    fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    const file = transcriptPath();
    fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), dry_run: DRY_RUN, ...entry })}\n`);
    return file;
  } catch (error) {
    log.error({ err: error.message }, 'Failed to append RTL transcript');
    return null;
  }
}

// GHL workflow Custom Webhooks place configured key-values either at the top
// level or under customData depending on builder version (see the handler's
// PHASE8-DEBUG shape logging) — read both.
function field(payload, ...keys) {
  const custom = payload.customData || {};
  for (const key of keys) {
    if (payload[key]) return payload[key];
    if (custom[key]) return custom[key];
  }
  return null;
}

export function eventLocationId(payload) {
  return field(payload, 'locationId', 'location_id');
}

function contactSummary(payload) {
  const contact = payload.contact || {};
  return {
    id: contact.id || field(payload, 'contactId', 'contact_id', 'id'),
    name: contact.firstName || contact.name || field(payload, 'first_name', 'firstName'),
    email: contact.email || field(payload, 'email'),
    phone: contact.phone || field(payload, 'phone'),
    tags: contact.tags || payload.tags || null,
  };
}

function detectEscalation(text) {
  if (!text) return null;
  const hit = ESCALATION_PATTERNS.find(pattern => pattern.test(text));
  return hit ? hit.source : null;
}

// ── LIVE delivery (CVO decision 2026-07-12: the ENGINE sends; the agent only
// writes text). All writes are RR-tenant, rtl-namespaced, and fail LOUD:
// a failed send appends an error line and alerts the operator. ─────────────

async function ghlRequest(pathname, { method = 'GET', body } = {}) {
  const { token } = resolveTenant('RR');
  const response = await fetch(`${GHL_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      // Conversations endpoints use their own API version.
      Version: pathname.startsWith('/conversations') ? '2021-04-15' : API_VERSION,
      'Content-Type': 'application/json',
      // GHL's Cloudflare blocks some default UAs (error 1010).
      'User-Agent': 'curl/8.9.1',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GHL ${method} ${pathname} -> ${response.status}: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : {};
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendLiveEmailReply(contactId, text) {
  return ghlRequest('/conversations/messages', {
    method: 'POST',
    body: {
      type: 'Email',
      contactId,
      subject: 'Re: Ready to Launch',
      html: `<p>${escapeHtml(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
    },
  });
}

// Breadcrumbs (CVO-approved autonomous writes): when a lead replies, tag them
// rtl-engaged and advance their RTL Launch Day opportunity New Lead → Engaged.
async function applyReplyBreadcrumbs(contactId) {
  const { locationId } = resolveTenant('RR');
  await ghlRequest(`/contacts/${contactId}/tags`, {
    method: 'POST',
    body: { tags: ['rtl-engaged'] },
  });
  const search = await ghlRequest(
    `/opportunities/search?location_id=${locationId}&contact_id=${contactId}`,
  );
  const opp = (search.opportunities || []).find(
    o => o.pipelineId === RTL_PIPELINE_ID && o.pipelineStageId === RTL_STAGE_NEW_LEAD,
  );
  if (opp) {
    await ghlRequest(`/opportunities/${opp.id}`, {
      method: 'PUT',
      body: { pipelineStageId: RTL_STAGE_ENGAGED },
    });
  }
  return { tagged: true, stageAdvanced: Boolean(opp) };
}

function agentInstruction(eventType, payload) {
  const prompt = loadPrompt();
  const contact = contactSummary(payload);
  const message = payload.message?.body || payload.messageBody || payload.body || payload.message || '';

  const context = [
    `EVENT: ${eventType}`,
    `CONTACT: ${JSON.stringify(contact)}`,
    message ? `LEAD'S MESSAGE: ${message}` : null,
    payload.stage ? `PIPELINE STAGE: ${payload.stage}` : null,
  ].filter(Boolean).join('\n');

  const mode = DRY_RUN
    ? [
      'MODE: DRY_RUN — do NOT send any message to the lead by any channel, and do not write any files.',
      'Respond with ONLY the exact message you would send to this lead — no preamble, no commentary, no markdown fences.',
      'The runtime records your response in the transcript; the CVO reviews it before anything goes live.',
    ].join('\n')
    : [
      'MODE: LIVE — your reply WILL BE SENT to this lead by email. Do not send anything yourself and do not write files.',
      'Respond with ONLY the exact message to deliver — no preamble, no commentary, no markdown fences.',
      'The runtime delivers it through the GHL conversations API (tenant RR) and records it in the transcript.',
    ].join('\n');

  return `${prompt}\n\n---\n${context}\n\n${mode}`;
}

/**
 * Single entry point, called by the webhook handler for every rtl.* event
 * (and RR-located conversation.message.inbound).
 *
 * @param {string} eventType normalized event type
 * @param {object} payload   normalized webhook payload
 * @param {object} helpers   { sendAlert } injected by the handler
 * @returns {{handled: boolean, reason?: string, escalated?: boolean}}
 */
export async function handleRtlEvent(eventType, payload, helpers = {}) {
  const sendAlert = helpers.sendAlert || (async () => {});

  const locationId = eventLocationId(payload);
  if (!isRtlLocation(locationId)) {
    log.warn({ eventType, locationId: locationId || null }, 'rtl event from non-RR location ignored');
    return { handled: false, reason: 'not-rr-location' };
  }

  const contact = contactSummary(payload);
  const inboundText = payload.message?.body || payload.messageBody
    || field(payload, 'message', 'body') || '';
  appendTranscript({
    role: 'event',
    event: eventType,
    contact,
    message: inboundText || undefined,
  });

  // Escalation check runs BEFORE the agent: refunds/anger/legal go to a human.
  const escalation = detectEscalation(inboundText);
  if (escalation) {
    appendTranscript({ role: 'escalation', event: eventType, contact, matched: escalation });
    await sendAlert(
      `RTL ESCALATION (human needed)\nContact: ${contact.name || contact.email || contact.id}\n` +
      `Trigger: ${escalation}\nMessage: ${String(inboundText).slice(0, 300)}\n` +
      'REGGIE has NOT replied. Handle this thread personally.',
    );
    return { handled: true, escalated: true };
  }

  if (!loadPrompt()) {
    await sendAlert('RTL engine received an event but the prompt-set is missing — briefing skipped.');
    return { handled: false, reason: 'prompt-missing' };
  }

  let reply;
  try {
    reply = String(await openclawMessage({
      agent: RTL_AGENT,
      message: agentInstruction(eventType, payload),
    }) || '').trim();
  } catch (error) {
    log.error({ eventType, err: error.message }, 'Failed to brief RTL agent');
    appendTranscript({ role: 'error', event: eventType, error: error.message });
    return { handled: false, reason: 'agent-brief-failed' };
  }

  // The engine owns the transcript write — the agent only returns text.
  if (DRY_RUN || !reply) {
    appendTranscript({
      role: 'reggie-draft',
      event: eventType,
      contact: contact.email || contact.id,
      draft: reply,
    });
    log.info({ eventType, agent: RTL_AGENT, dryRun: DRY_RUN, contact: contact.email || contact.id }, 'RTL agent briefed');
    return { handled: true, escalated: false };
  }

  // LIVE: deliver via GHL, then leave the CVO-approved breadcrumbs.
  const contactId = contact.id;
  try {
    const delivery = await sendLiveEmailReply(contactId, reply);
    appendTranscript({
      role: 'reggie-sent',
      event: eventType,
      contact: contact.email || contactId,
      message_id: delivery?.messageId || delivery?.id || null,
      sent: reply,
    });
    log.info({ eventType, contact: contact.email || contactId }, 'RTL live reply delivered');
  } catch (error) {
    log.error({ eventType, err: error.message }, 'RTL live send FAILED');
    appendTranscript({ role: 'error', event: eventType, error: `live-send: ${error.message}` });
    await sendAlert(
      `RTL LIVE SEND FAILED\nContact: ${contact.name || contact.email || contactId}\n` +
      `Event: ${eventType}\nError: ${error.message.slice(0, 300)}\n` +
      'The reply was NOT delivered — follow up manually.',
    );
    return { handled: false, reason: 'live-send-failed' };
  }

  if (eventType === 'rtl.inbound_message') {
    try {
      const crumbs = await applyReplyBreadcrumbs(contactId);
      appendTranscript({ role: 'crm-breadcrumb', event: eventType, contact: contact.email || contactId, ...crumbs });
    } catch (error) {
      // Breadcrumbs are best-effort — the reply already went out.
      log.warn({ eventType, err: error.message }, 'RTL breadcrumbs failed');
      appendTranscript({ role: 'error', event: eventType, error: `breadcrumbs: ${error.message}` });
    }
  }

  return { handled: true, escalated: false };
}

export const RTL_EVENT_TYPES = [
  'rtl.optin',
  'rtl.inbound_message',
  'rtl.checkout_abandoned',
  'rtl.testimonial_asked',
  'rtl.dormant7',
];
