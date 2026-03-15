#!/usr/bin/env node
/**
 * UTM Tracking Generator (CLI companion)
 * Generate and register UTM-tagged URLs
 *
 * Usage: node utm-tracking-generator.mjs <command> [args...]
 *
 * Commands:
 *   generate --url "<u>" --source "<s>" --medium "<m>" --campaign "<c>" [--content "<v>"] [--term "<t>"]
 *   list [--campaign "<filter>"] [--source "<filter>"]
 *   lookup <registry_id>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const REGISTRY_PATH = join(OPENCLAW_ROOT, 'data', 'utm-registry.json');

function loadRegistry() { return existsSync(REGISTRY_PATH) ? JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')) : { entries: [] }; }
function saveRegistry(data) {
  const dir = dirname(REGISTRY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf-8');
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

function sanitizeCampaign(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function generateId() {
  return `utm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function generate(args) {
  const opts = parseArgs(args);
  if (!opts.url || !opts.source || !opts.medium || !opts.campaign) {
    throw new Error('Required: --url "<url>" --source "<source>" --medium "<medium>" --campaign "<campaign>"');
  }

  const params = {
    utm_source: opts.source.toLowerCase(),
    utm_medium: opts.medium.toLowerCase(),
    utm_campaign: sanitizeCampaign(opts.campaign)
  };
  if (opts.content) params.utm_content = opts.content;
  if (opts.term) params.utm_term = opts.term;

  const url = new URL(opts.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const registry = loadRegistry();
  const entry = {
    id: generateId(),
    full_url: url.toString(),
    base_url: opts.url,
    parameters: params,
    saas_instance_id: opts.instance || null,
    created_at: new Date().toISOString()
  };
  registry.entries.push(entry);
  saveRegistry(registry);

  console.log(JSON.stringify({ action: 'generate', ...entry }, null, 2));
}

function list(args) {
  const opts = parseArgs(args);
  const registry = loadRegistry();
  let entries = registry.entries;
  if (opts.campaign) entries = entries.filter(e => e.parameters.utm_campaign.includes(opts.campaign.toLowerCase()));
  if (opts.source) entries = entries.filter(e => e.parameters.utm_source === opts.source.toLowerCase());
  console.log(JSON.stringify({ action: 'list', total: entries.length, entries }, null, 2));
}

function lookup(registryId) {
  const registry = loadRegistry();
  const entry = registry.entries.find(e => e.id === registryId);
  if (!entry) throw new Error(`Registry entry not found: ${registryId}`);
  console.log(JSON.stringify({ action: 'lookup', entry }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node utm-tracking-generator.mjs <command> [args...]'); console.log('Commands: generate, list, lookup'); process.exit(1); }
  try {
    switch (command) {
      case 'generate': generate(args); break;
      case 'list': list(args); break;
      case 'lookup': if (!args[0]) throw new Error('Missing registry_id'); lookup(args[0]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
