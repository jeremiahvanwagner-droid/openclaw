#!/usr/bin/env node
/**
 * Webhook Listener Config
 * Generates and registers custom webhooks inside GHL workflows for OpenClaw event routing
 *
 * Usage: node webhook-listener-config.mjs <command> [args...]
 *
 * Commands:
 *   register <location_id> --event "<event_type>" --url "<callback>"   Register webhook
 *   list <location_id>                                                   List registered webhooks
 *   test <location_id> <webhook_id>                                     Send test payload
 *   delete <location_id> <webhook_id>                                   Remove webhook
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHmac } from 'crypto';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const WEBHOOK_REGISTRY = join(OPENCLAW_ROOT, 'data', 'webhook-registry.json');
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

function loadRegistry() {
  if (!existsSync(WEBHOOK_REGISTRY)) return { webhooks: [] };
  return JSON.parse(readFileSync(WEBHOOK_REGISTRY, 'utf-8'));
}

function saveRegistry(registry) {
  writeFileSync(WEBHOOK_REGISTRY, JSON.stringify(registry, null, 2), 'utf-8');
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

function generateSigningSecret() {
  return createHmac('sha256', Date.now().toString()).update(Math.random().toString()).digest('hex').slice(0, 32);
}

async function registerWebhook(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.event) throw new Error('Required: --event "<event_type>"');
  if (!opts.url) throw new Error('Required: --url "<callback_url>"');
  const token = findTokenForLocation(locationId);

  const signingSecret = generateSigningSecret();

  // Register with GHL
  const result = await apiCall('POST', '/webhooks/', token, {
    locationId,
    url: opts.url,
    events: [opts.event]
  });

  // Store in local registry with signing secret
  const registry = loadRegistry();
  const entry = {
    id: result.id || `wh_${Date.now()}`,
    locationId,
    event: opts.event,
    url: opts.url,
    signingSecret,
    createdAt: new Date().toISOString(),
    active: true
  };
  registry.webhooks.push(entry);
  saveRegistry(registry);

  console.log(JSON.stringify({
    action: 'register', locationId,
    webhookId: entry.id,
    event: opts.event,
    url: opts.url,
    signingSecret: `${signingSecret.slice(0, 8)}...`,
    note: 'Use signingSecret for HMAC-SHA256 verification in your handler',
    status: 'registered'
  }, null, 2));
}

async function listWebhooks(locationId) {
  const registry = loadRegistry();
  const webhooks = registry.webhooks.filter(w => w.locationId === locationId);

  console.log(JSON.stringify({
    action: 'list', locationId,
    total: webhooks.length,
    webhooks: webhooks.map(w => ({
      id: w.id, event: w.event, url: w.url, active: w.active, createdAt: w.createdAt
    }))
  }, null, 2));
}

async function testWebhook(locationId, webhookId) {
  const registry = loadRegistry();
  const webhook = registry.webhooks.find(w => w.id === webhookId && w.locationId === locationId);
  if (!webhook) throw new Error(`Webhook ${webhookId} not found for location ${locationId}`);

  const testPayload = {
    type: webhook.event,
    locationId,
    timestamp: new Date().toISOString(),
    data: { test: true, message: 'OpenClaw webhook test' }
  };

  const signature = createHmac('sha256', webhook.signingSecret).update(JSON.stringify(testPayload)).digest('hex');

  const response = await fetch(webhook.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OpenClaw-Signature': signature },
    body: JSON.stringify(testPayload)
  });

  console.log(JSON.stringify({
    action: 'test', locationId, webhookId,
    url: webhook.url,
    responseStatus: response.status,
    success: response.ok
  }, null, 2));
}

async function deleteWebhook(locationId, webhookId) {
  const token = findTokenForLocation(locationId);
  try { await apiCall('DELETE', `/webhooks/${webhookId}`, token); } catch { /* may not exist on GHL side */ }

  const registry = loadRegistry();
  registry.webhooks = registry.webhooks.filter(w => !(w.id === webhookId && w.locationId === locationId));
  saveRegistry(registry);

  console.log(JSON.stringify({ action: 'delete', locationId, webhookId, status: 'deleted' }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node webhook-listener-config.mjs <command> [args...]'); console.log('Commands: register, list, test, delete'); process.exit(1); }
  try {
    switch (command) {
      case 'register': if (!args[0]) throw new Error('Missing location_id'); await registerWebhook(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listWebhooks(args[0]); break;
      case 'test': if (!args[0] || !args[1]) throw new Error('Missing location_id or webhook_id'); await testWebhook(args[0], args[1]); break;
      case 'delete': if (!args[0] || !args[1]) throw new Error('Missing location_id or webhook_id'); await deleteWebhook(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
