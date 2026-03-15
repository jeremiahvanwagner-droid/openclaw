#!/usr/bin/env node
/**
 * GHL Offer Creator
 * Create and manage product offers, pricing tiers, and checkout pages via GHL API
 *
 * Usage: node ghl-offer-creator.mjs <command> [args...]
 *
 * Commands:
 *   create <location_id> --name "<n>" --price <cents> --type "<one_time|recurring>" [--interval "<monthly|yearly>"]
 *   list <location_id>
 *   get <location_id> <product_id>
 *   update <location_id> <product_id> --name "<n>" [--price <cents>]
 *   archive <location_id> <product_id>
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
  if (response.status === 204) return {};
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

async function createOffer(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name || !opts.price || !opts.type) throw new Error('Required: --name "<name>" --price <cents> --type "<one_time|recurring>"');
  const token = findTokenForLocation(locationId);

  const body = {
    locationId,
    name: opts.name,
    description: opts.description || '',
    amount: parseInt(opts.price, 10),
    currency: opts.currency || 'USD',
    type: opts.type
  };
  if (opts.type === 'recurring') {
    body.recurring = { interval: opts.interval || 'monthly', intervalCount: parseInt(opts.interval_count || '1', 10) };
  }
  if (opts.trial_days) body.trialDays = parseInt(opts.trial_days, 10);

  const result = await apiCall('POST', '/products/', token, body);

  console.log(JSON.stringify({
    action: 'create', locationId,
    productId: result.product?.id || result.id,
    name: opts.name,
    amount: parseInt(opts.price, 10),
    type: opts.type,
    interval: opts.interval || null,
    status: 'created'
  }, null, 2));
}

async function listOffers(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/products/?locationId=${locationId}`, token);
  const products = (result.products || []).map(p => ({
    id: p.id, name: p.name, amount: p.amount,
    type: p.type, status: p.status
  }));
  console.log(JSON.stringify({ action: 'list', locationId, total: products.length, products }, null, 2));
}

async function getOffer(locationId, productId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/products/${productId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, product: result }, null, 2));
}

async function updateOffer(locationId, productId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  const body = {};
  if (opts.name) body.name = opts.name;
  if (opts.price) body.amount = parseInt(opts.price, 10);
  if (opts.description) body.description = opts.description;
  await apiCall('PUT', `/products/${productId}`, token, body);
  console.log(JSON.stringify({ action: 'update', locationId, productId, updated: Object.keys(body), status: 'updated' }, null, 2));
}

async function archiveOffer(locationId, productId) {
  const token = findTokenForLocation(locationId);
  await apiCall('DELETE', `/products/${productId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'archive', locationId, productId, status: 'archived' }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node ghl-offer-creator.mjs <command> [args...]'); console.log('Commands: create, list, get, update, archive'); process.exit(1); }
  try {
    switch (command) {
      case 'create': if (!args[0]) throw new Error('Missing location_id'); await createOffer(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listOffers(args[0]); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or product_id'); await getOffer(args[0], args[1]); break;
      case 'update': if (!args[0] || !args[1]) throw new Error('Missing location_id or product_id'); await updateOffer(args[0], args[1], args.slice(2)); break;
      case 'archive': if (!args[0] || !args[1]) throw new Error('Missing location_id or product_id'); await archiveOffer(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
