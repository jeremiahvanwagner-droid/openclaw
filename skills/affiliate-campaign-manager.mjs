#!/usr/bin/env node
/**
 * Affiliate Campaign Manager
 * Set up GHL affiliate campaigns, enroll partners, and manage tracking
 *
 * Usage: node affiliate-campaign-manager.mjs <command> [args...]
 *
 * Commands:
 *   create <location_id> --name "<name>" --commission <n> --type <percent|fixed>
 *   enroll <location_id> <campaign_id> <contact_id>
 *   get-link <location_id> <campaign_id> <affiliate_id>
 *   list <location_id>
 *   stats <location_id> <campaign_id>
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

async function createCampaign(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name || !opts.commission) throw new Error('Required: --name "<name>" --commission <amount>');
  const token = findTokenForLocation(locationId);

  const result = await apiCall('POST', '/affiliate/campaign/', token, {
    locationId,
    name: opts.name,
    commissionAmount: parseFloat(opts.commission),
    commissionType: opts.type || 'percent',
    cookieDuration: parseInt(opts.cookie_days) || 30,
    status: 'active'
  });

  console.log(JSON.stringify({
    action: 'create', locationId,
    campaignId: result.campaign?.id || result.id,
    name: opts.name,
    commission: `${opts.commission}${(opts.type || 'percent') === 'percent' ? '%' : ' USD'}`,
    status: 'created'
  }, null, 2));
}

async function enrollAffiliate(locationId, campaignId, contactId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('POST', `/affiliate/campaign/${campaignId}/affiliate`, token, {
    contactId
  });
  console.log(JSON.stringify({
    action: 'enroll', locationId, campaignId, contactId,
    affiliateId: result.affiliate?.id || result.id,
    status: 'enrolled'
  }, null, 2));
}

async function getLink(locationId, campaignId, affiliateId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/affiliate/campaign/${campaignId}/affiliate/${affiliateId}`, token);
  console.log(JSON.stringify({
    action: 'get-link', locationId, campaignId, affiliateId,
    trackingLink: result.trackingLink || result.affiliate?.trackingLink
  }, null, 2));
}

async function listCampaigns(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/affiliate/campaign/?locationId=${locationId}`, token);
  const campaigns = (result.campaigns || []).map(c => ({
    id: c.id, name: c.name, commission: c.commissionAmount,
    type: c.commissionType, status: c.status
  }));
  console.log(JSON.stringify({ action: 'list', locationId, total: campaigns.length, campaigns }, null, 2));
}

async function getCampaignStats(locationId, campaignId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/affiliate/campaign/${campaignId}/stats?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'stats', locationId, campaignId, stats: result }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node affiliate-campaign-manager.mjs <command> [args...]'); console.log('Commands: create, enroll, get-link, list, stats'); process.exit(1); }
  try {
    switch (command) {
      case 'create': if (!args[0]) throw new Error('Missing location_id'); await createCampaign(args[0], args.slice(1)); break;
      case 'enroll': if (!args[0] || !args[1] || !args[2]) throw new Error('Usage: enroll <location_id> <campaign_id> <contact_id>'); await enrollAffiliate(args[0], args[1], args[2]); break;
      case 'get-link': if (!args[0] || !args[1] || !args[2]) throw new Error('Usage: get-link <location_id> <campaign_id> <affiliate_id>'); await getLink(args[0], args[1], args[2]); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listCampaigns(args[0]); break;
      case 'stats': if (!args[0] || !args[1]) throw new Error('Missing location_id or campaign_id'); await getCampaignStats(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
