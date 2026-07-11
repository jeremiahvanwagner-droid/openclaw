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
import { resolve as resolveTenant } from '../lib/ghl-tenant-resolver.mjs';
import { openclawMessage } from '../lib/safe-exec.mjs';
import { childLogger } from '../lib/logger.mjs';

const log = childLogger({ module: 'rtl-lead-engine' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fail-safe default: dry-run unless explicitly disabled.
export const DRY_RUN = (process.env.DRY_RUN || 'true').toLowerCase() !== 'false';

const RTL_AGENT = process.env.RTL_AGENT_ID || 'marketing';
const TRANSCRIPT_DIR = process.env.RTL_TRANSCRIPT_DIR
  || path.join(process.cwd(), 'logs', 'rtl');

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

function contactSummary(payload) {
  const contact = payload.contact || {};
  return {
    id: contact.id || payload.contactId || null,
    name: contact.firstName || contact.name || payload.first_name || null,
    email: contact.email || payload.email || null,
    phone: contact.phone || payload.phone || null,
    tags: contact.tags || payload.tags || null,
  };
}

function detectEscalation(text) {
  if (!text) return null;
  const hit = ESCALATION_PATTERNS.find(pattern => pattern.test(text));
  return hit ? hit.source : null;
}

function agentInstruction(eventType, payload, transcriptFile) {
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
      'MODE: DRY_RUN — do NOT send any message to the lead by any channel.',
      `Draft your reply, then append it as a JSON line {"role":"reggie-draft","event":"${eventType}","contact":${JSON.stringify(contact.email || contact.id)},"draft":"<your reply>"} to: ${transcriptFile}`,
      'The CVO reviews these transcripts before anything goes live.',
    ].join('\n')
    : [
      'MODE: LIVE — send your reply through the GHL conversations API (ghl-api skill, tenant RR) so the thread lives in the CRM.',
      `Also append what you sent to: ${transcriptFile}`,
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

  if (!isRtlLocation(payload.locationId)) {
    log.warn({ eventType, locationId: payload.locationId || null }, 'rtl event from non-RR location ignored');
    return { handled: false, reason: 'not-rr-location' };
  }

  const contact = contactSummary(payload);
  const inboundText = payload.message?.body || payload.messageBody || payload.body || '';
  const transcriptFile = appendTranscript({
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

  try {
    await openclawMessage({
      agent: RTL_AGENT,
      message: agentInstruction(eventType, payload, transcriptFile),
    });
    log.info({ eventType, agent: RTL_AGENT, dryRun: DRY_RUN, contact: contact.email || contact.id }, 'RTL agent briefed');
    return { handled: true, escalated: false };
  } catch (error) {
    log.error({ eventType, err: error.message }, 'Failed to brief RTL agent');
    appendTranscript({ role: 'error', event: eventType, error: error.message });
    return { handled: false, reason: 'agent-brief-failed' };
  }
}

export const RTL_EVENT_TYPES = [
  'rtl.optin',
  'rtl.inbound_message',
  'rtl.checkout_abandoned',
  'rtl.testimonial_asked',
  'rtl.dormant7',
];
