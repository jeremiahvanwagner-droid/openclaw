#!/usr/bin/env node
/**
 * Ad Audience Sync
 * Sync CRM contact segments to Facebook/Google ad audiences via GHL API
 *
 * Usage: node ad-audience-sync.mjs <command> [args...]
 *
 * Commands:
 *   sync <location_id> --tag "<tag>" --platform "<facebook|google>" --audience "<name>"
 *   list <location_id> --platform "<facebook|google>"
 *   create-audience <location_id> --name "<n>" --platform "<p>"
 *   status <location_id> --audience_id "<id>"
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
  const options = { method, headers: { 'Authorization': `Bearer ${token}`, 'Version': API_VERSION, 'Content-Type': 'application/json' } };
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

async function syncAudience(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.tag || !opts.platform) throw new Error('Required: --tag "<tag>" --platform "<facebook|google>"');
  const token = findTokenForLocation(locationId);

  // Fetch contacts by tag
  const contacts = await apiCall('GET', `/contacts/?locationId=${locationId}&tag=${encodeURIComponent(opts.tag)}&limit=100`, token);
  const contactList = contacts.contacts || [];

  // Extract hashed identifiers for audience matching
  const audience_data = contactList.map(c => ({
    email: c.email,
    phone: c.phone,
    firstName: c.firstName,
    lastName: c.lastName
  })).filter(c => c.email || c.phone);

  // Push to ad platform audience via GHL integration
  const result = await apiCall('POST', `/integrations/audiences/sync`, token, {
    locationId,
    platform: opts.platform,
    audienceName: opts.audience || `${opts.tag}_audience`,
    contacts: audience_data
  });

  console.log(JSON.stringify({
    action: 'sync', locationId, platform: opts.platform,
    tag: opts.tag, contactsSynced: audience_data.length,
    audienceId: result.audienceId,
    status: 'synced'
  }, null, 2));
}

async function listAudiences(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.platform) throw new Error('Required: --platform "<facebook|google>"');
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/integrations/audiences?locationId=${locationId}&platform=${opts.platform}`, token);
  const audiences = (result.audiences || []).map(a => ({ id: a.id, name: a.name, size: a.size, platform: opts.platform }));
  console.log(JSON.stringify({ action: 'list', locationId, platform: opts.platform, total: audiences.length, audiences }, null, 2));
}

async function createAudience(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name || !opts.platform) throw new Error('Required: --name "<name>" --platform "<facebook|google>"');
  const token = findTokenForLocation(locationId);
  const result = await apiCall('POST', `/integrations/audiences`, token, {
    locationId, name: opts.name, platform: opts.platform
  });
  console.log(JSON.stringify({ action: 'create-audience', locationId, audienceId: result.audienceId || result.id, name: opts.name, platform: opts.platform, status: 'created' }, null, 2));
}

async function audienceStatus(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.audience_id) throw new Error('Required: --audience_id "<id>"');
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/integrations/audiences/${opts.audience_id}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'status', locationId, audience: result }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node ad-audience-sync.mjs <command> [args...]'); console.log('Commands: sync, list, create-audience, status'); process.exit(1); }
  try {
    switch (command) {
      case 'sync': if (!args[0]) throw new Error('Missing location_id'); await syncAudience(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listAudiences(args[0], args.slice(1)); break;
      case 'create-audience': if (!args[0]) throw new Error('Missing location_id'); await createAudience(args[0], args.slice(1)); break;
      case 'status': if (!args[0]) throw new Error('Missing location_id'); await audienceStatus(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
