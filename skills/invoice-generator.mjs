#!/usr/bin/env node
/**
 * Invoice Generator
 * Creates and sends GHL invoices triggered by pipeline stage changes
 *
 * Usage: node invoice-generator.mjs <command> [args...]
 *
 * Commands:
 *   create <location_id> <contact_id> --amount <n> --desc "<text>"   Create invoice
 *   send <location_id> <invoice_id>                                   Send invoice
 *   list <location_id> --status <draft|sent|paid|void>               List invoices
 *   get <location_id> <invoice_id>                                    Get invoice details
 *   void <location_id> <invoice_id>                                   Void invoice
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

async function createInvoice(locationId, contactId, args) {
  const opts = parseArgs(args);
  if (!opts.amount) throw new Error('Required: --amount <number>');
  const token = findTokenForLocation(locationId);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (parseInt(opts.due_days) || 30));

  const result = await apiCall('POST', '/invoices/', token, {
    locationId,
    contactId,
    name: opts.name || `Invoice - ${new Date().toISOString().split('T')[0]}`,
    description: opts.desc || '',
    items: [{
      name: opts.desc || 'Service',
      amount: parseFloat(opts.amount),
      quantity: parseInt(opts.qty) || 1
    }],
    dueDate: dueDate.toISOString(),
    currency: opts.currency || 'USD'
  });

  console.log(JSON.stringify({
    action: 'create', locationId, contactId,
    invoiceId: result.invoice?.id || result.id,
    amount: parseFloat(opts.amount),
    dueDate: dueDate.toISOString().split('T')[0],
    status: 'draft'
  }, null, 2));
}

async function sendInvoice(locationId, invoiceId) {
  const token = findTokenForLocation(locationId);
  await apiCall('POST', `/invoices/${invoiceId}/send`, token);
  console.log(JSON.stringify({ action: 'send', locationId, invoiceId, status: 'sent' }, null, 2));
}

async function listInvoices(locationId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  const params = new URLSearchParams({ locationId });
  if (opts.status) params.set('status', opts.status);
  const result = await apiCall('GET', `/invoices/?${params}`, token);
  const invoices = (result.invoices || []).map(i => ({
    id: i.id, name: i.name, contactId: i.contactId,
    total: i.total, status: i.status, dueDate: i.dueDate
  }));
  console.log(JSON.stringify({ action: 'list', locationId, total: invoices.length, invoices }, null, 2));
}

async function getInvoice(locationId, invoiceId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/invoices/${invoiceId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, invoice: result }, null, 2));
}

async function voidInvoice(locationId, invoiceId) {
  const token = findTokenForLocation(locationId);
  await apiCall('POST', `/invoices/${invoiceId}/void`, token);
  console.log(JSON.stringify({ action: 'void', locationId, invoiceId, status: 'voided' }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node invoice-generator.mjs <command> [args...]'); console.log('Commands: create, send, list, get, void'); process.exit(1); }
  try {
    switch (command) {
      case 'create': if (!args[0] || !args[1]) throw new Error('Missing location_id or contact_id'); await createInvoice(args[0], args[1], args.slice(2)); break;
      case 'send': if (!args[0] || !args[1]) throw new Error('Missing location_id or invoice_id'); await sendInvoice(args[0], args[1]); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listInvoices(args[0], args.slice(1)); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or invoice_id'); await getInvoice(args[0], args[1]); break;
      case 'void': if (!args[0] || !args[1]) throw new Error('Missing location_id or invoice_id'); await voidInvoice(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
