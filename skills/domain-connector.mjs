#!/usr/bin/env node
/**
 * Domain Connector
 * Configure DNS records for custom domains pointing to GHL funnels
 * Shared between d8_funnel_engineer and d8_integration_engineer
 *
 * Usage: node domain-connector.mjs <command> [args...]
 *
 * Commands:
 *   setup <location_id> --domain "<d>" --funnel_id "<f>"    Configure domain for funnel
 *   verify <location_id> --domain "<d>"                     Check DNS propagation
 *   list <location_id>                                       List connected domains
 *   remove <location_id> --domain "<d>"                     Remove domain connection
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const DOMAIN_REGISTRY = join(OPENCLAW_ROOT, 'data', 'domain-registry.json');
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

function loadDomains() { return existsSync(DOMAIN_REGISTRY) ? JSON.parse(readFileSync(DOMAIN_REGISTRY, 'utf-8')) : { domains: [] }; }
function saveDomains(data) { writeFileSync(DOMAIN_REGISTRY, JSON.stringify(data, null, 2), 'utf-8'); }

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

async function setupDomain(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.domain) throw new Error('Required: --domain "<domain.com>"');
  const token = findTokenForLocation(locationId);

  // Register domain with GHL
  await apiCall('POST', `/locations/${locationId}/customDomains`, token, {
    domain: opts.domain
  });

  // Store in local registry
  const registry = loadDomains();
  registry.domains.push({
    locationId,
    domain: opts.domain,
    funnelId: opts.funnel_id || null,
    status: 'pending_verification',
    createdAt: new Date().toISOString()
  });
  saveDomains(registry);

  console.log(JSON.stringify({
    action: 'setup', locationId, domain: opts.domain,
    funnelId: opts.funnel_id || 'none',
    status: 'pending_verification',
    dns_instructions: {
      type: 'CNAME',
      name: opts.domain,
      value: 'preview.msgsndr.com',
      note: 'Add this CNAME record in your DNS provider. Propagation may take up to 48 hours.'
    }
  }, null, 2));
}

async function verifyDomain(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.domain) throw new Error('Required: --domain "<domain.com>"');

  // DNS lookup
  const dnsCheck = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(opts.domain)}&type=CNAME`);
  const dnsResult = await dnsCheck.json();
  const hasCname = (dnsResult.Answer || []).some(a => a.data?.includes('msgsndr.com'));

  const registry = loadDomains();
  const entry = registry.domains.find(d => d.domain === opts.domain && d.locationId === locationId);
  if (entry && hasCname) {
    entry.status = 'verified';
    saveDomains(registry);
  }

  console.log(JSON.stringify({
    action: 'verify', locationId, domain: opts.domain,
    dnsConfigured: hasCname,
    status: hasCname ? 'verified' : 'pending',
    dnsRecords: dnsResult.Answer || []
  }, null, 2));
}

async function listDomains(locationId) {
  const registry = loadDomains();
  const domains = registry.domains.filter(d => d.locationId === locationId);
  console.log(JSON.stringify({ action: 'list', locationId, total: domains.length, domains }, null, 2));
}

async function removeDomain(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.domain) throw new Error('Required: --domain "<domain.com>"');

  const registry = loadDomains();
  registry.domains = registry.domains.filter(d => !(d.domain === opts.domain && d.locationId === locationId));
  saveDomains(registry);

  console.log(JSON.stringify({ action: 'remove', locationId, domain: opts.domain, status: 'removed' }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node domain-connector.mjs <command> [args...]'); console.log('Commands: setup, verify, list, remove'); process.exit(1); }
  try {
    switch (command) {
      case 'setup': if (!args[0]) throw new Error('Missing location_id'); await setupDomain(args[0], args.slice(1)); break;
      case 'verify': if (!args[0]) throw new Error('Missing location_id'); await verifyDomain(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listDomains(args[0]); break;
      case 'remove': if (!args[0]) throw new Error('Missing location_id'); await removeDomain(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
