#!/usr/bin/env node
/**
 * Access Control Manager
 * Manage membership access levels, product grants, and revocations via GHL API
 *
 * Usage: node access-control-manager.mjs <command> [args...]
 *
 * Commands:
 *   grant <location_id> --contact_id "<c>" --product_id "<p>"     Grant access
 *   revoke <location_id> --contact_id "<c>" --product_id "<p>"    Revoke access
 *   check <location_id> --contact_id "<c>" --product_id "<p>"     Check access status
 *   list-members <location_id> --product_id "<p>"                 List product members
 *   bulk-grant <location_id> --product_id "<p>" --tag "<t>"       Grant to all tagged contacts
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

async function grantAccess(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id || !opts.product_id) throw new Error('Required: --contact_id "<id>" --product_id "<id>"');
  const token = findTokenForLocation(locationId);
  await apiCall('POST', `/membership/products/${opts.product_id}/members`, token, {
    contactId: opts.contact_id, locationId
  });
  console.log(JSON.stringify({ action: 'grant', locationId, contactId: opts.contact_id, productId: opts.product_id, status: 'granted' }, null, 2));
}

async function revokeAccess(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id || !opts.product_id) throw new Error('Required: --contact_id "<id>" --product_id "<id>"');
  const token = findTokenForLocation(locationId);
  await apiCall('DELETE', `/membership/products/${opts.product_id}/members/${opts.contact_id}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'revoke', locationId, contactId: opts.contact_id, productId: opts.product_id, status: 'revoked' }, null, 2));
}

async function checkAccess(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id || !opts.product_id) throw new Error('Required: --contact_id "<id>" --product_id "<id>"');
  const token = findTokenForLocation(locationId);
  try {
    const result = await apiCall('GET', `/membership/products/${opts.product_id}/members/${opts.contact_id}?locationId=${locationId}`, token);
    console.log(JSON.stringify({ action: 'check', locationId, contactId: opts.contact_id, productId: opts.product_id, hasAccess: true, member: result }, null, 2));
  } catch {
    console.log(JSON.stringify({ action: 'check', locationId, contactId: opts.contact_id, productId: opts.product_id, hasAccess: false }, null, 2));
  }
}

async function listMembers(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.product_id) throw new Error('Required: --product_id "<id>"');
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/membership/products/${opts.product_id}/members?locationId=${locationId}`, token);
  const members = (result.members || []).map(m => ({ contactId: m.contactId, name: m.name, email: m.email, grantedAt: m.createdAt }));
  console.log(JSON.stringify({ action: 'list-members', locationId, productId: opts.product_id, total: members.length, members }, null, 2));
}

async function bulkGrant(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.product_id || !opts.tag) throw new Error('Required: --product_id "<id>" --tag "<tag>"');
  const token = findTokenForLocation(locationId);

  // Get contacts by tag
  const contacts = await apiCall('GET', `/contacts/?locationId=${locationId}&tag=${encodeURIComponent(opts.tag)}&limit=100`, token);
  const contactList = contacts.contacts || [];

  let granted = 0;
  for (const contact of contactList) {
    try {
      await apiCall('POST', `/membership/products/${opts.product_id}/members`, token, {
        contactId: contact.id, locationId
      });
      granted++;
    } catch {
      // Already has access or other non-critical error
    }
  }

  console.log(JSON.stringify({
    action: 'bulk-grant', locationId, productId: opts.product_id,
    tag: opts.tag, contactsFound: contactList.length,
    granted, status: 'completed'
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node access-control-manager.mjs <command> [args...]'); console.log('Commands: grant, revoke, check, list-members, bulk-grant'); process.exit(1); }
  try {
    switch (command) {
      case 'grant': if (!args[0]) throw new Error('Missing location_id'); await grantAccess(args[0], args.slice(1)); break;
      case 'revoke': if (!args[0]) throw new Error('Missing location_id'); await revokeAccess(args[0], args.slice(1)); break;
      case 'check': if (!args[0]) throw new Error('Missing location_id'); await checkAccess(args[0], args.slice(1)); break;
      case 'list-members': if (!args[0]) throw new Error('Missing location_id'); await listMembers(args[0], args.slice(1)); break;
      case 'bulk-grant': if (!args[0]) throw new Error('Missing location_id'); await bulkGrant(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
