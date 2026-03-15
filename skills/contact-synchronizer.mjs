#!/usr/bin/env node
/**
 * Contact Synchronizer
 * Synchronizes contacts across GHL sub-accounts with deduplication and merge logic
 *
 * Usage: node contact-synchronizer.mjs <command> [args...]
 *
 * Commands:
 *   sync <saas_instance_id> <source_location> <target_location>  Sync contacts
 *   dedupe <location_id>                                          Find duplicates
 *   import <location_id> --file "<csv_path>"                     Import from CSV
 *   export <location_id> --format <csv|json>                     Export contacts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const REGISTRY_PATH = join(OPENCLAW_ROOT, 'data', 'saas-instances.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

function findTokenForLocation(locationId) {
  if (!existsSync(TOKENS_PATH)) throw new Error('No OAuth tokens found.');
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  for (const [id, entry] of Object.entries(tokens.instances || {})) {
    if (entry.location_id === locationId) return { instanceId: id, token: entry.access_token };
  }
  if (existsSync(REGISTRY_PATH)) {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
    for (const [id, inst] of Object.entries(registry.instances || {})) {
      if (inst.locations?.includes(locationId)) {
        const tokenEntry = tokens.instances?.[id];
        if (tokenEntry?.access_token) return { instanceId: id, token: tokenEntry.access_token };
      }
    }
  }
  throw new Error(`No token found for location ${locationId}`);
}

function getToken(instanceId) {
  if (!existsSync(TOKENS_PATH)) throw new Error('No OAuth tokens found.');
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  const entry = tokens.instances?.[instanceId];
  if (!entry?.access_token) throw new Error(`No token for instance ${instanceId}`);
  return entry;
}

async function apiCall(method, endpoint, token, body = null) {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) await new Promise(r => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
  lastCallAt = Date.now();
  const url = `${GHL_BASE}${endpoint}`;
  const options = { method, headers: { 'Authorization': `Bearer ${token}`, 'Version': API_VERSION, 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  if (!response.ok) { const err = await response.text(); throw new Error(`GHL API error (${response.status}): ${err}`); }
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

async function sync(instanceId, sourceLocation, targetLocation) {
  const tokenEntry = getToken(instanceId);
  const token = tokenEntry.access_token;

  // Fetch contacts from source
  const sourceContacts = await apiCall('GET', `/contacts/?locationId=${sourceLocation}&limit=100`, token);
  const targetContacts = await apiCall('GET', `/contacts/?locationId=${targetLocation}&limit=100`, token);

  const targetEmails = new Set((targetContacts.contacts || []).map(c => c.email?.toLowerCase()).filter(Boolean));
  const toSync = (sourceContacts.contacts || []).filter(c => c.email && !targetEmails.has(c.email.toLowerCase()));

  let synced = 0;
  for (const contact of toSync) {
    await apiCall('POST', '/contacts/', token, {
      locationId: targetLocation,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags,
      source: 'OpenClaw Sync'
    });
    synced++;
  }

  console.log(JSON.stringify({
    action: 'sync', instanceId, sourceLocation, targetLocation,
    sourceTotal: (sourceContacts.contacts || []).length,
    targetExisting: (targetContacts.contacts || []).length,
    newlySynced: synced,
    skippedDuplicates: (sourceContacts.contacts || []).length - synced
  }, null, 2));
}

async function dedupe(locationId) {
  const { token } = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/contacts/?locationId=${locationId}&limit=100`, token);
  const contacts = result.contacts || [];

  // Group by normalized email
  const emailGroups = {};
  for (const c of contacts) {
    const email = c.email?.toLowerCase();
    if (!email) continue;
    if (!emailGroups[email]) emailGroups[email] = [];
    emailGroups[email].push({ id: c.id, name: `${c.firstName || ''} ${c.lastName || ''}`.trim(), email: c.email, phone: c.phone });
  }

  const duplicates = Object.entries(emailGroups).filter(([, group]) => group.length > 1);

  console.log(JSON.stringify({
    action: 'dedupe', locationId,
    totalContacts: contacts.length,
    duplicateGroups: duplicates.length,
    duplicates: duplicates.map(([email, group]) => ({ email, count: group.length, contacts: group }))
  }, null, 2));
}

async function importContacts(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.file) throw new Error('Required: --file "<csv_path>"');
  const filePath = join(OPENCLAW_ROOT, opts.file);
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const { token } = findTokenForLocation(locationId);

  let imported = 0, errors = 0;
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    try {
      await apiCall('POST', '/contacts/', token, {
        locationId,
        firstName: row.firstname || row.first_name || '',
        lastName: row.lastname || row.last_name || '',
        email: row.email || '',
        phone: row.phone || '',
        source: 'CSV Import'
      });
      imported++;
    } catch { errors++; }
  }

  console.log(JSON.stringify({ action: 'import', locationId, total: lines.length - 1, imported, errors }, null, 2));
}

async function exportContacts(locationId, args) {
  const opts = parseArgs(args);
  const format = opts.format || 'json';
  const { token } = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/contacts/?locationId=${locationId}&limit=100`, token);
  const contacts = (result.contacts || []).map(c => ({
    id: c.id, firstName: c.firstName, lastName: c.lastName,
    email: c.email, phone: c.phone, tags: c.tags, dateAdded: c.dateAdded
  }));

  if (format === 'csv') {
    const csvHeaders = 'id,firstName,lastName,email,phone,tags,dateAdded';
    const csvRows = contacts.map(c => `${c.id},${c.firstName},${c.lastName},${c.email},${c.phone},"${(c.tags || []).join(';')}",${c.dateAdded}`);
    const output = [csvHeaders, ...csvRows].join('\n');
    const outPath = join(OPENCLAW_ROOT, 'data', `contacts-export-${locationId}.csv`);
    writeFileSync(outPath, output, 'utf-8');
    console.log(JSON.stringify({ action: 'export', locationId, format: 'csv', total: contacts.length, file: outPath }, null, 2));
  } else {
    console.log(JSON.stringify({ action: 'export', locationId, format: 'json', total: contacts.length, contacts }, null, 2));
  }
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node contact-synchronizer.mjs <command> [args...]'); console.log('Commands: sync, dedupe, import, export'); process.exit(1); }
  try {
    switch (command) {
      case 'sync': if (!args[0] || !args[1] || !args[2]) throw new Error('Usage: sync <saas_instance_id> <source> <target>'); await sync(args[0], args[1], args[2]); break;
      case 'dedupe': if (!args[0]) throw new Error('Missing location_id'); await dedupe(args[0]); break;
      case 'import': if (!args[0]) throw new Error('Missing location_id'); await importContacts(args[0], args.slice(1)); break;
      case 'export': if (!args[0]) throw new Error('Missing location_id'); await exportContacts(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
