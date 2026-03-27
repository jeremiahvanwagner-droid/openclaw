#!/usr/bin/env node
/**
 * BTV Discovery Call Prep
 * Generate a pre-call intelligence brief for Beyond the Veil discovery calls.
 *
 * Usage: node btv-discovery-call-prep.mjs <command> [args...]
 *
 * Commands:
 *   brief <location_id> <contact_id>
 *       Build a structured pre-call brief: contact profile, conversation history,
 *       talking points, and risk flags
 *
 *   list-upcoming <location_id>
 *       List all appointments in the next 48 hours with contact info
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

function findTokenForLocation(locationId) {
  if (!existsSync(TOKENS_PATH)) throw new Error('No OAuth tokens found.');
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  for (const [, entry] of Object.entries(tokens.instances || {})) {
    if (entry.location_id === locationId) return entry.access_token;
  }
  throw new Error(`No token found for location ${locationId}`);
}

async function apiCall(method, endpoint, token, body = null) {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) await new Promise(r => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
  lastCallAt = Date.now();
  const options = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Version': API_VERSION, 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${GHL_BASE}${endpoint}`, options);
  if (!response.ok) { const err = await response.text(); throw new Error(`GHL API (${response.status}): ${err}`); }
  return response.json();
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = (i + 1 < args.length && !args[i + 1].startsWith('--')) ? args[++i] : true;
    }
  }
  return result;
}

function deriveTalkingPoints(tags, pipelineStage, daysSinceFirstTouch) {
  const points = [];
  const tagSet = new Set((tags || []).map(t => t.toLowerCase()));

  if (tagSet.has('coaching-interest') || tagSet.has('btv-interest')) {
    points.push('Explore what drew them to Beyond the Veil — what are they seeking spiritually or practically?');
  }
  if (pipelineStage && pipelineStage.toLowerCase().includes('discovery')) {
    points.push('This is a first-touch discovery — focus on listening, not pitching. Understand their story first.');
  }
  if (daysSinceFirstTouch > 30) {
    points.push(`They've been in the system ${daysSinceFirstTouch} days — acknowledge the journey and validate their timing.`);
  }
  if (tagSet.has('book-buyer') || tagSet.has('purchased')) {
    points.push('They've already invested in the vision — affirm that step and build from what they've already received.');
  }
  while (points.length < 3) {
    const fallbacks = [
      'Ask: "What does alignment look like for you right now?"',
      'Explore what they feel is blocking them from stepping fully into purpose.',
      'Invite them to describe where they sense God calling them — without filtering it.'
    ];
    const next = fallbacks[points.length] || `Explore their current season and what's stirring in them.`;
    if (!points.includes(next)) points.push(next);
  }
  return points.slice(0, 3);
}

function deriveRiskFlags(contact, lastActivityDate) {
  const flags = [];
  const tags = new Set((contact.tags || []).map(t => t.toLowerCase()));
  const now = Date.now();

  if (lastActivityDate) {
    const daysSince = Math.floor((now - new Date(lastActivityDate).getTime()) / 86400000);
    if (daysSince >= 14) flags.push(`No activity in ${daysSince} days`);
  }
  if (contact.dnd === true || tags.has('dnd')) {
    flags.push('Contact has Do Not Disturb enabled');
  }
  if (tags.has('unsubscribed') || contact.emailOptedOut === true) {
    flags.push('Unsubscribed from email');
  }
  if (!contact.phone) flags.push('No phone number on file');
  if (!contact.email) flags.push('No email on file');
  if (tags.has('refunded') || tags.has('chargeback')) {
    flags.push('Payment dispute or refund on record — approach with care');
  }
  return flags;
}

async function brief(locationId, contactId) {
  const token = findTokenForLocation(locationId);

  const contactData = await apiCall('GET', `/contacts/${contactId}`, token);
  const c = contactData.contact || contactData;

  const firstName = c.firstName || 'friend';
  const createdAt = c.dateAdded || c.createdAt;
  const daysSinceFirstTouch = createdAt
    ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
    : null;

  const pipelineStage = c.opportunities?.[0]?.stage?.name || c.pipelineStage || null;

  const convoResult = await apiCall(
    'GET',
    `/conversations/search?contactId=${contactId}&locationId=${locationId}&limit=1`,
    token
  );
  const conversations = convoResult.conversations || [];
  let conversationSummary = [];

  if (conversations.length > 0) {
    const convoId = conversations[0].id;
    const msgResult = await apiCall('GET', `/conversations/${convoId}/messages?limit=10`, token);
    const messages = msgResult.messages?.messages || msgResult.messages || [];
    conversationSummary = messages.map(m => ({
      direction: m.direction === 'inbound' ? 'contact' : 'team',
      type: m.type,
      body: m.body || m.text || '',
      date: m.dateAdded || m.createdAt
    }));
  }

  const lastActivityDate = conversationSummary[0]?.date || c.lastActivity || null;
  const callFocusPoints = deriveTalkingPoints(c.tags, pipelineStage, daysSinceFirstTouch);
  const riskFlags = deriveRiskFlags(c, lastActivityDate);

  console.log(JSON.stringify({
    action: 'brief',
    contact: {
      id: c.id,
      name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
      email: c.email || null,
      phone: c.phone || null,
      source: c.source || null,
      tags: c.tags || []
    },
    pipelineStage,
    daysSinceFirstTouch,
    lastActivity: lastActivityDate,
    conversationSummary,
    callFocusPoints,
    riskFlags
  }, null, 2));
}

async function listUpcoming(locationId) {
  const token = findTokenForLocation(locationId);
  const now = new Date();
  const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const result = await apiCall(
    'GET',
    `/calendars/events?locationId=${locationId}&startTime=${now.toISOString()}&endTime=${end.toISOString()}&limit=50`,
    token
  );

  const events = result.events || result.appointments || [];
  const appointments = events.map(e => ({
    appointmentId: e.id,
    contactId: e.contactId,
    contactName: e.contact?.name || `${e.contact?.firstName || ''} ${e.contact?.lastName || ''}`.trim() || 'Unknown',
    startTime: e.startTime,
    calendarId: e.calendarId
  }));

  console.log(JSON.stringify({
    action: 'list-upcoming',
    locationId,
    windowHours: 48,
    total: appointments.length,
    appointments
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) {
    console.log('Usage: node btv-discovery-call-prep.mjs <command> [args...]');
    console.log('Commands: brief, list-upcoming');
    process.exit(1);
  }
  try {
    switch (command) {
      case 'brief':
        if (!args[0] || !args[1]) throw new Error('Usage: brief <location_id> <contact_id>');
        await brief(args[0], args[1]);
        break;
      case 'list-upcoming':
        if (!args[0]) throw new Error('Missing location_id');
        await listUpcoming(args[0]);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
