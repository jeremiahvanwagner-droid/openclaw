#!/usr/bin/env node
/**
 * GHL Speed to Lead
 * Contact new leads within 5 minutes of entry via SMS and email.
 *
 * Usage: node ghl-speed-to-lead.mjs <command> [args...]
 *
 * Commands:
 *   respond <location_id> <contact_id> [--message "<sms>"] [--subject "<email subject>"]
 *       Fetch contact, send SMS + email, apply speed-to-lead-sent tag
 *
 *   check-pending <location_id>
 *       List contacts created in last 30 min without "speed-to-lead-sent" tag
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

function buildSmsBody(firstName, customMessage) {
  if (customMessage) return customMessage.replace('{firstName}', firstName);
  return `Hey ${firstName}, this is Truth J Blue. I saw you reached out — I'm here. Let's connect when you're ready. No rush, no pressure. Just a conversation about where you are and where God is taking you.`;
}

function buildEmailSubject(firstName, customSubject) {
  if (customSubject) return customSubject.replace('{firstName}', firstName);
  return `You reached out — I'm here, ${firstName}`;
}

async function respond(locationId, contactId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  const startMs = Date.now();

  const contactData = await apiCall('GET', `/contacts/${contactId}`, token);
  const contact = contactData.contact || contactData;
  const firstName = contact.firstName || contact.firstNameLowerCase || 'friend';
  const phone = contact.phone;
  const email = contact.email;

  let smsSent = false;
  let emailSent = false;

  if (phone) {
    const smsBody = buildSmsBody(firstName, opts.message || null);
    await apiCall('POST', '/conversations/messages', token, {
      type: 'SMS',
      contactId,
      locationId,
      message: smsBody
    });
    smsSent = true;
  }

  if (email) {
    const subject = buildEmailSubject(firstName, opts.subject || null);
    await apiCall('POST', '/conversations/messages', token, {
      type: 'Email',
      contactId,
      locationId,
      subject,
      html: `<p>${buildSmsBody(firstName, opts.message || null)}</p>`
    });
    emailSent = true;
  }

  const currentTags = contact.tags || [];
  if (!currentTags.includes('speed-to-lead-sent')) {
    await apiCall('PUT', `/contacts/${contactId}`, token, {
      tags: [...currentTags, 'speed-to-lead-sent']
    });
  }

  console.log(JSON.stringify({
    action: 'respond',
    contactId,
    smsSent,
    emailSent,
    responseTimeMs: Date.now() - startMs,
    timestamp: new Date().toISOString()
  }, null, 2));
}

async function checkPending(locationId) {
  const token = findTokenForLocation(locationId);
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const result = await apiCall(
    'GET',
    `/contacts/?locationId=${locationId}&startAfter=${encodeURIComponent(since)}&limit=100`,
    token
  );

  const contacts = result.contacts || [];
  const now = Date.now();

  const pending = contacts
    .filter(c => !(c.tags || []).includes('speed-to-lead-sent'))
    .map(c => ({
      contactId: c.id,
      name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
      createdAt: c.dateAdded || c.createdAt,
      minutesSinceCreation: Math.floor((now - new Date(c.dateAdded || c.createdAt).getTime()) / 60000)
    }));

  console.log(JSON.stringify({
    action: 'check-pending',
    locationId,
    windowMinutes: 30,
    total: pending.length,
    contacts: pending
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) {
    console.log('Usage: node ghl-speed-to-lead.mjs <command> [args...]');
    console.log('Commands: respond, check-pending');
    process.exit(1);
  }
  try {
    switch (command) {
      case 'respond':
        if (!args[0] || !args[1]) throw new Error('Usage: respond <location_id> <contact_id>');
        await respond(args[0], args[1], args.slice(2));
        break;
      case 'check-pending':
        if (!args[0]) throw new Error('Missing location_id');
        await checkPending(args[0]);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
