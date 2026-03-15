#!/usr/bin/env node
/**
 * Coupon & Promo Creator
 * Generate time-limited discount codes and inject into GHL funnels/emails
 *
 * Usage: node coupon-and-promo-creator.mjs <command> [args...]
 *
 * Commands:
 *   create <location_id> --code "<CODE>" --discount <n> --type <percent|fixed> --expires "<date>"
 *   list <location_id>                          List active coupons
 *   deactivate <location_id> <coupon_id>        Deactivate a coupon
 *   inject <location_id> --code "<CODE>" --custom_field "<field_key>"   Inject into custom value
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const COUPON_REGISTRY = join(OPENCLAW_ROOT, 'data', 'coupon-registry.json');
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

function loadCoupons() { return existsSync(COUPON_REGISTRY) ? JSON.parse(readFileSync(COUPON_REGISTRY, 'utf-8')) : { coupons: [] }; }
function saveCoupons(data) { writeFileSync(COUPON_REGISTRY, JSON.stringify(data, null, 2), 'utf-8'); }

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

async function createCoupon(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.code || !opts.discount) throw new Error('Required: --code "<CODE>" --discount <amount>');
  const type = opts.type || 'percent';

  const coupon = {
    id: `cpn_${Date.now()}`,
    locationId,
    code: opts.code.toUpperCase(),
    discount: parseFloat(opts.discount),
    type,
    expiresAt: opts.expires ? new Date(opts.expires).toISOString() : null,
    maxUses: opts.max_uses ? parseInt(opts.max_uses) : null,
    uses: 0,
    active: true,
    createdAt: new Date().toISOString()
  };

  const registry = loadCoupons();
  // Prevent duplicate codes per location
  if (registry.coupons.some(c => c.code === coupon.code && c.locationId === locationId && c.active)) {
    throw new Error(`Active coupon with code ${coupon.code} already exists for this location`);
  }
  registry.coupons.push(coupon);
  saveCoupons(registry);

  console.log(JSON.stringify({
    action: 'create', locationId,
    couponId: coupon.id,
    code: coupon.code,
    discount: `${coupon.discount}${type === 'percent' ? '%' : ' USD'}`,
    expiresAt: coupon.expiresAt,
    status: 'active'
  }, null, 2));
}

async function listCoupons(locationId) {
  const registry = loadCoupons();
  const coupons = registry.coupons.filter(c => c.locationId === locationId);
  // Auto-expire
  const now = new Date();
  for (const c of coupons) {
    if (c.expiresAt && new Date(c.expiresAt) < now && c.active) c.active = false;
  }
  saveCoupons(registry);

  console.log(JSON.stringify({
    action: 'list', locationId, total: coupons.length,
    coupons: coupons.map(c => ({
      id: c.id, code: c.code, discount: c.discount, type: c.type,
      active: c.active, uses: c.uses, expiresAt: c.expiresAt
    }))
  }, null, 2));
}

async function deactivateCoupon(locationId, couponId) {
  const registry = loadCoupons();
  const coupon = registry.coupons.find(c => c.id === couponId && c.locationId === locationId);
  if (!coupon) throw new Error('Coupon not found');
  coupon.active = false;
  saveCoupons(registry);
  console.log(JSON.stringify({ action: 'deactivate', locationId, couponId, status: 'deactivated' }, null, 2));
}

async function injectCoupon(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.code || !opts.custom_field) throw new Error('Required: --code "<CODE>" --custom_field "<field_key>"');
  const token = findTokenForLocation(locationId);

  // Set the coupon code as a GHL custom value
  await apiCall('PUT', `/locations/${locationId}/customValues`, token, {
    customValues: [{ fieldKey: opts.custom_field, value: opts.code.toUpperCase() }]
  });

  console.log(JSON.stringify({
    action: 'inject', locationId,
    code: opts.code.toUpperCase(),
    customField: opts.custom_field,
    note: 'Coupon code now available in funnels/emails via {{custom_field}}',
    status: 'injected'
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node coupon-and-promo-creator.mjs <command> [args...]'); console.log('Commands: create, list, deactivate, inject'); process.exit(1); }
  try {
    switch (command) {
      case 'create': if (!args[0]) throw new Error('Missing location_id'); await createCoupon(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listCoupons(args[0]); break;
      case 'deactivate': if (!args[0] || !args[1]) throw new Error('Missing location_id or coupon_id'); await deactivateCoupon(args[0], args[1]); break;
      case 'inject': if (!args[0]) throw new Error('Missing location_id'); await injectCoupon(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
