#!/usr/bin/env node
/**
 * Subscription Dunning Manager (Tool Component)
 * Executes dunning recovery sequences for failed SaaS subscription payments
 *
 * Usage: node subscription-dunning-manager.mjs <command> [args...]
 *
 * Commands:
 *   start <location_id> <contact_id> --amount <n> --reason "<r>"   Start dunning sequence
 *   status <location_id> <contact_id>                               Check dunning status
 *   pause <location_id> <contact_id>                                Pause sequence
 *   cancel <location_id> <contact_id>                               Cancel (payment received)
 *   list <location_id> --status <active|paused|completed|cancelled> List dunning contacts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const DUNNING_STATE = join(OPENCLAW_ROOT, 'data', 'dunning-state.json');
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

function loadState() { return existsSync(DUNNING_STATE) ? JSON.parse(readFileSync(DUNNING_STATE, 'utf-8')) : { sequences: {} }; }
function saveState(state) { writeFileSync(DUNNING_STATE, JSON.stringify(state, null, 2), 'utf-8'); }

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

async function startDunning(locationId, contactId, args) {
  const opts = parseArgs(args);
  if (!opts.amount) throw new Error('Required: --amount <number>');
  const token = findTokenForLocation(locationId);
  const state = loadState();
  const key = `${locationId}:${contactId}`;

  if (state.sequences[key]?.status === 'active') {
    console.log(JSON.stringify({ error: 'Dunning already active for this contact', existing: state.sequences[key] }, null, 2));
    return;
  }

  // Tag the contact
  await apiCall('POST', `/contacts/${contactId}/tags`, token, { tags: ['dunning_day_1'] });

  const now = new Date();
  state.sequences[key] = {
    locationId, contactId,
    amount: parseFloat(opts.amount),
    reason: opts.reason || 'unknown',
    plan: opts.plan || 'default',
    status: 'active',
    currentDay: 1,
    startedAt: now.toISOString(),
    nextAction: new Date(now.getTime() + 2 * 86400000).toISOString(), // Day 3
    history: [{ day: 1, action: 'sms_sent', timestamp: now.toISOString() }]
  };
  saveState(state);

  console.log(JSON.stringify({
    action: 'start', locationId, contactId,
    amount: parseFloat(opts.amount), reason: opts.reason,
    currentDay: 1, nextActionDate: state.sequences[key].nextAction,
    status: 'active'
  }, null, 2));
}

async function checkStatus(locationId, contactId) {
  const state = loadState();
  const key = `${locationId}:${contactId}`;
  const seq = state.sequences[key];
  if (!seq) { console.log(JSON.stringify({ error: 'No dunning sequence found' }, null, 2)); return; }
  console.log(JSON.stringify({ action: 'status', ...seq }, null, 2));
}

async function pauseDunning(locationId, contactId) {
  const state = loadState();
  const key = `${locationId}:${contactId}`;
  if (!state.sequences[key]) throw new Error('No dunning sequence found');
  state.sequences[key].status = 'paused';
  state.sequences[key].history.push({ day: state.sequences[key].currentDay, action: 'paused', timestamp: new Date().toISOString() });
  saveState(state);
  console.log(JSON.stringify({ action: 'pause', locationId, contactId, status: 'paused' }, null, 2));
}

async function cancelDunning(locationId, contactId) {
  const state = loadState();
  const key = `${locationId}:${contactId}`;
  if (!state.sequences[key]) throw new Error('No dunning sequence found');
  const token = findTokenForLocation(locationId);

  // Remove dunning tags, add recovery tag
  const dunningTags = ['dunning_day_1', 'dunning_day_3', 'dunning_day_7'];
  await apiCall('DELETE', `/contacts/${contactId}/tags`, token, { tags: dunningTags });
  await apiCall('POST', `/contacts/${contactId}/tags`, token, { tags: ['dunning_recovered'] });

  state.sequences[key].status = 'cancelled';
  state.sequences[key].history.push({ day: state.sequences[key].currentDay, action: 'cancelled_payment_received', timestamp: new Date().toISOString() });
  saveState(state);

  console.log(JSON.stringify({ action: 'cancel', locationId, contactId, status: 'cancelled', reason: 'payment_received' }, null, 2));
}

async function listDunning(locationId, args) {
  const opts = parseArgs(args);
  const state = loadState();
  let sequences = Object.values(state.sequences).filter(s => s.locationId === locationId);
  if (opts.status) sequences = sequences.filter(s => s.status === opts.status);

  console.log(JSON.stringify({
    action: 'list', locationId,
    total: sequences.length,
    sequences: sequences.map(s => ({
      contactId: s.contactId, amount: s.amount, reason: s.reason,
      currentDay: s.currentDay, status: s.status, startedAt: s.startedAt
    }))
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node subscription-dunning-manager.mjs <command> [args...]'); console.log('Commands: start, status, pause, cancel, list'); process.exit(1); }
  try {
    switch (command) {
      case 'start': if (!args[0] || !args[1]) throw new Error('Missing location_id or contact_id'); await startDunning(args[0], args[1], args.slice(2)); break;
      case 'status': if (!args[0] || !args[1]) throw new Error('Missing location_id or contact_id'); await checkStatus(args[0], args[1]); break;
      case 'pause': if (!args[0] || !args[1]) throw new Error('Missing location_id or contact_id'); await pauseDunning(args[0], args[1]); break;
      case 'cancel': if (!args[0] || !args[1]) throw new Error('Missing location_id or contact_id'); await cancelDunning(args[0], args[1]); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listDunning(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
