#!/usr/bin/env node
/**
 * Proposal & Contract Sender
 * Generate and send GHL Proposals/Estimates for high-ticket leads
 *
 * Usage: node proposal-and-contract-sender.mjs <command> [args...]
 *
 * Commands:
 *   create <location_id> <contact_id> --title "<t>" --items "<json>"  Create proposal
 *   send <location_id> <proposal_id>                                   Send to client
 *   list <location_id> --status <draft|sent|accepted|declined>        List proposals
 *   get <location_id> <proposal_id>                                    Get details
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

async function createProposal(locationId, contactId, args) {
  const opts = parseArgs(args);
  if (!opts.title) throw new Error('Required: --title "<proposal_title>"');
  const token = findTokenForLocation(locationId);

  let items = [{ name: 'Service', amount: 0, quantity: 1 }];
  if (opts.items) {
    items = JSON.parse(opts.items);
  }

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + (parseInt(opts.valid_days) || 14));

  const result = await apiCall('POST', '/invoices/', token, {
    locationId, contactId,
    name: opts.title,
    businessDetails: opts.business || '',
    items: items.map(i => ({ name: i.name, amount: parseFloat(i.amount), quantity: parseInt(i.quantity) || 1, description: i.description || '' })),
    dueDate: validUntil.toISOString(),
    currency: opts.currency || 'USD',
    terms: opts.terms || 'Payment due upon acceptance. All work begins after signed agreement.',
    notes: opts.notes || ''
  });

  const total = items.reduce((sum, i) => sum + (parseFloat(i.amount) * (parseInt(i.quantity) || 1)), 0);

  console.log(JSON.stringify({
    action: 'create', locationId, contactId,
    proposalId: result.invoice?.id || result.id,
    title: opts.title,
    total,
    itemCount: items.length,
    validUntil: validUntil.toISOString().split('T')[0],
    status: 'draft'
  }, null, 2));
}

async function sendProposal(locationId, proposalId) {
  const token = findTokenForLocation(locationId);
  await apiCall('POST', `/invoices/${proposalId}/send`, token);
  console.log(JSON.stringify({ action: 'send', locationId, proposalId, status: 'sent' }, null, 2));
}

async function listProposals(locationId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  const params = new URLSearchParams({ locationId });
  if (opts.status) params.set('status', opts.status);
  const result = await apiCall('GET', `/invoices/?${params}`, token);
  const proposals = (result.invoices || []).map(p => ({
    id: p.id, name: p.name, contactId: p.contactId,
    total: p.total, status: p.status, dueDate: p.dueDate
  }));
  console.log(JSON.stringify({ action: 'list', locationId, total: proposals.length, proposals }, null, 2));
}

async function getProposal(locationId, proposalId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/invoices/${proposalId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, proposal: result }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node proposal-and-contract-sender.mjs <command> [args...]'); console.log('Commands: create, send, list, get'); process.exit(1); }
  try {
    switch (command) {
      case 'create': if (!args[0] || !args[1]) throw new Error('Missing location_id or contact_id'); await createProposal(args[0], args[1], args.slice(2)); break;
      case 'send': if (!args[0] || !args[1]) throw new Error('Missing location_id or proposal_id'); await sendProposal(args[0], args[1]); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listProposals(args[0], args.slice(1)); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or proposal_id'); await getProposal(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
