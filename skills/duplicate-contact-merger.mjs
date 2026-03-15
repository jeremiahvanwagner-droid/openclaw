#!/usr/bin/env node
/**
 * Duplicate Contact Merger
 * Scan GHL CRM for duplicate contacts and merge them safely
 *
 * Usage: node duplicate-contact-merger.mjs <command> [args...]
 *
 * Commands:
 *   scan <location_id> [--field "email|phone"] Find duplicates
 *   preview <location_id> --group_id "<g>"     Preview merge result
 *   merge <location_id> --group_id "<g>"       Execute merge
 *   report <location_id>                       Merge history
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const DUPES_PATH = join(OPENCLAW_ROOT, 'data', 'duplicate-contacts.json');
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

function loadDupes() {
  if (!existsSync(DUPES_PATH)) return { groups: [], merges: [] };
  return JSON.parse(readFileSync(DUPES_PATH, 'utf-8'));
}

function saveDupes(data) {
  const dir = dirname(DUPES_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(DUPES_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function scanDuplicates(locationId, args) {
  const opts = parseArgs(args);
  const matchField = opts.field || 'email';
  const token = findTokenForLocation(locationId);

  let contacts = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100;

  while (hasMore && offset < 5000) {
    const result = await apiCall('GET', `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=${limit}&offset=${offset}`, token);
    const batch = result.contacts || [];
    contacts = contacts.concat(batch);
    hasMore = batch.length === limit;
    offset += limit;
  }

  // Group by match field
  const groups = {};
  for (const contact of contacts) {
    const key = (matchField === 'email' ? contact.email : contact.phone || '').toLowerCase().trim();
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      id: contact.id, name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      email: contact.email, phone: contact.phone,
      tags: contact.tags || [], createdAt: contact.dateAdded || contact.createdAt
    });
  }

  const duplicateGroups = Object.entries(groups)
    .filter(([, g]) => g.length > 1)
    .map(([key, members], idx) => ({
      group_id: `dup_${idx}_${Date.now().toString(36)}`,
      match_field: matchField, match_value: key,
      count: members.length, contacts: members
    }));

  const dupes = loadDupes();
  dupes.groups = duplicateGroups;
  dupes.scannedAt = new Date().toISOString();
  saveDupes(dupes);

  console.log(JSON.stringify({
    action: 'scan', locationId, matchField,
    totalContacts: contacts.length,
    duplicateGroups: duplicateGroups.length,
    totalDuplicates: duplicateGroups.reduce((s, g) => s + g.count, 0),
    groups: duplicateGroups.slice(0, 20)
  }, null, 2));
}

function previewMerge(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.group_id) throw new Error('Required: --group_id "<id>"');
  const dupes = loadDupes();
  const group = dupes.groups.find(g => g.group_id === opts.group_id);
  if (!group) throw new Error(`Group not found: ${opts.group_id}`);

  // Merge strategy: keep most recent, combine tags
  const sorted = [...group.contacts].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const primary = sorted[0];
  const merged = {
    keep: primary.id,
    name: primary.name,
    email: primary.email || sorted.find(c => c.email)?.email,
    phone: primary.phone || sorted.find(c => c.phone)?.phone,
    tags: [...new Set(sorted.flatMap(c => c.tags))],
    deleteIds: sorted.slice(1).map(c => c.id)
  };

  console.log(JSON.stringify({ action: 'preview', group_id: opts.group_id, merged, originalContacts: group.contacts }, null, 2));
}

async function executeMerge(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.group_id) throw new Error('Required: --group_id "<id>"');
  const dupes = loadDupes();
  const group = dupes.groups.find(g => g.group_id === opts.group_id);
  if (!group) throw new Error(`Group not found: ${opts.group_id}`);

  const token = findTokenForLocation(locationId);
  const sorted = [...group.contacts].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const primary = sorted[0];
  const combinedTags = [...new Set(sorted.flatMap(c => c.tags))];

  // Update primary with combined data
  const updateBody = { tags: combinedTags };
  if (!primary.email) { const withEmail = sorted.find(c => c.email); if (withEmail) updateBody.email = withEmail.email; }
  if (!primary.phone) { const withPhone = sorted.find(c => c.phone); if (withPhone) updateBody.phone = withPhone.phone; }
  await apiCall('PUT', `/contacts/${encodeURIComponent(primary.id)}`, token, updateBody);

  // Delete duplicates
  const deleted = [];
  for (const contact of sorted.slice(1)) {
    await apiCall('DELETE', `/contacts/${encodeURIComponent(contact.id)}`, token);
    deleted.push(contact.id);
  }

  // Record merge
  dupes.merges.push({
    group_id: opts.group_id, primaryId: primary.id,
    deletedIds: deleted, mergedAt: new Date().toISOString()
  });
  dupes.groups = dupes.groups.filter(g => g.group_id !== opts.group_id);
  saveDupes(dupes);

  console.log(JSON.stringify({ action: 'merge', group_id: opts.group_id, primaryId: primary.id, deleted: deleted.length, status: 'merged' }, null, 2));
}

function mergeReport(locationId) {
  const dupes = loadDupes();
  console.log(JSON.stringify({
    action: 'report', locationId,
    pendingGroups: dupes.groups.length,
    completedMerges: dupes.merges.length,
    lastScan: dupes.scannedAt || 'never',
    recentMerges: dupes.merges.slice(-10)
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node duplicate-contact-merger.mjs <command> [args...]'); console.log('Commands: scan, preview, merge, report'); process.exit(1); }
  try {
    switch (command) {
      case 'scan': if (!args[0]) throw new Error('Missing location_id'); await scanDuplicates(args[0], args.slice(1)); break;
      case 'preview': if (!args[0]) throw new Error('Missing location_id'); previewMerge(args[0], args.slice(1)); break;
      case 'merge': if (!args[0]) throw new Error('Missing location_id'); await executeMerge(args[0], args.slice(1)); break;
      case 'report': if (!args[0]) throw new Error('Missing location_id'); mergeReport(args[0]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
