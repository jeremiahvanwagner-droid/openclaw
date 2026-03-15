#!/usr/bin/env node
/**
 * GHL Funnel Cloner
 * Copy funnel templates/pages between GHL sub-accounts
 *
 * Usage: node ghl-funnel-cloner.mjs <command> [args...]
 *
 * Commands:
 *   clone <source_location> <target_location> <funnel_id>    Clone full funnel
 *   list <location_id>                                         List funnels
 *   get <location_id> <funnel_id>                             Get funnel details
 *   clone-page <source_loc> <target_loc> <funnel_id> <page_id>  Clone single page
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

async function cloneFunnel(sourceLocation, targetLocation, funnelId) {
  const sourceToken = findTokenForLocation(sourceLocation);
  const targetToken = findTokenForLocation(targetLocation);

  // Get source funnel
  const funnel = await apiCall('GET', `/funnels/${funnelId}?locationId=${sourceLocation}`, sourceToken);
  const pages = funnel.pages || funnel.steps || [];

  // Create funnel in target
  const newFunnel = await apiCall('POST', '/funnels/', targetToken, {
    locationId: targetLocation,
    name: `${funnel.name} (cloned)`,
    type: funnel.type || 'funnel'
  });
  const newFunnelId = newFunnel.funnel?.id || newFunnel.id;

  let clonedPages = 0;
  for (const page of pages) {
    await apiCall('POST', `/funnels/${newFunnelId}/pages`, targetToken, {
      name: page.name,
      url: page.url || page.path,
      html: page.html,
      css: page.css
    });
    clonedPages++;
  }

  console.log(JSON.stringify({
    action: 'clone', sourceLocation, targetLocation,
    sourceFunnelId: funnelId, newFunnelId,
    name: funnel.name, pagesCloned: clonedPages,
    status: 'cloned'
  }, null, 2));
}

async function listFunnels(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/funnels/?locationId=${locationId}`, token);
  const funnels = (result.funnels || []).map(f => ({
    id: f.id, name: f.name, type: f.type,
    pageCount: (f.pages || f.steps || []).length,
    updatedAt: f.updatedAt
  }));
  console.log(JSON.stringify({ action: 'list', locationId, total: funnels.length, funnels }, null, 2));
}

async function getFunnel(locationId, funnelId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/funnels/${funnelId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, funnel: result }, null, 2));
}

async function clonePage(sourceLocation, targetLocation, funnelId, pageId) {
  const sourceToken = findTokenForLocation(sourceLocation);
  const targetToken = findTokenForLocation(targetLocation);

  const page = await apiCall('GET', `/funnels/${funnelId}/pages/${pageId}`, sourceToken);

  // Get target funnels to find where to put the page
  const targetFunnels = await apiCall('GET', `/funnels/?locationId=${targetLocation}`, targetToken);
  const targetFunnel = (targetFunnels.funnels || [])[0];

  if (!targetFunnel) throw new Error('No funnel found in target location to add page to');

  await apiCall('POST', `/funnels/${targetFunnel.id}/pages`, targetToken, {
    name: page.name,
    url: page.url || page.path,
    html: page.html,
    css: page.css
  });

  console.log(JSON.stringify({
    action: 'clone-page', sourceLocation, targetLocation,
    sourceFunnelId: funnelId, sourcePageId: pageId,
    targetFunnelId: targetFunnel.id,
    pageName: page.name, status: 'cloned'
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node ghl-funnel-cloner.mjs <command> [args...]'); console.log('Commands: clone, list, get, clone-page'); process.exit(1); }
  try {
    switch (command) {
      case 'clone': if (!args[0] || !args[1] || !args[2]) throw new Error('Usage: clone <source_loc> <target_loc> <funnel_id>'); await cloneFunnel(args[0], args[1], args[2]); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listFunnels(args[0]); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or funnel_id'); await getFunnel(args[0], args[1]); break;
      case 'clone-page': if (!args[0] || !args[1] || !args[2] || !args[3]) throw new Error('Usage: clone-page <src> <tgt> <funnel> <page>'); await clonePage(args[0], args[1], args[2], args[3]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
