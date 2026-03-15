#!/usr/bin/env node
/**
 * Campaign Analyst (CLI)
 * Pull and analyze marketing campaign data from GHL
 *
 * Usage: node campaign-analyst.mjs <command> [args...]
 *
 * Commands:
 *   report <location_id> [--campaign_id "<id>"] [--days <n>]    Campaign performance report
 *   funnel <location_id> <funnel_id> [--days <n>]               Funnel conversion analysis
 *   emails <location_id> [--days <n>]                            Email campaign metrics
 *   compare <location_id> --a "<campaign_a>" --b "<campaign_b>"  A/B comparison
 *   health <location_id>                                         Overall marketing health score
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

function benchmark(value, good, great) {
  if (value >= great) return 'great';
  if (value >= good) return 'good';
  return 'below';
}

async function campaignReport(locationId, args) {
  const opts = parseArgs(args);
  const days = parseInt(opts.days || '30', 10);
  const token = findTokenForLocation(locationId);
  const startDate = new Date(Date.now() - days * 86400000).toISOString();

  // Pull campaigns
  let endpoint = `/campaigns/?locationId=${locationId}`;
  if (opts.campaign_id) endpoint = `/campaigns/${opts.campaign_id}?locationId=${locationId}`;
  const result = await apiCall('GET', endpoint, token);
  const campaigns = opts.campaign_id ? [result] : (result.campaigns || []);

  const report = campaigns.map(c => ({
    id: c.id, name: c.name, type: c.type,
    stats: {
      sent: c.sent || 0, delivered: c.delivered || 0,
      opened: c.opened || 0, clicked: c.clicked || 0,
      unsubscribed: c.unsubscribed || 0, bounced: c.bounced || 0
    },
    kpis: {
      open_rate: { value: c.delivered ? ((c.opened || 0) / c.delivered * 100).toFixed(1) + '%' : 'N/A', benchmark: c.delivered ? benchmark((c.opened || 0) / c.delivered * 100, 20, 35) : 'N/A' },
      click_rate: { value: c.delivered ? ((c.clicked || 0) / c.delivered * 100).toFixed(1) + '%' : 'N/A', benchmark: c.delivered ? benchmark((c.clicked || 0) / c.delivered * 100, 2.5, 5) : 'N/A' },
      bounce_rate: { value: c.sent ? ((c.bounced || 0) / c.sent * 100).toFixed(1) + '%' : 'N/A' }
    }
  }));

  console.log(JSON.stringify({ action: 'report', locationId, days, total: report.length, campaigns: report }, null, 2));
}

async function funnelAnalysis(locationId, funnelId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  const funnel = await apiCall('GET', `/funnels/${funnelId}?locationId=${locationId}`, token);
  const pages = funnel.pages || funnel.steps || [];

  const analysis = pages.map((p, i) => ({
    step: i + 1, name: p.name,
    visitors: p.visitors || 0, conversions: p.conversions || 0,
    conversion_rate: p.visitors ? ((p.conversions || 0) / p.visitors * 100).toFixed(1) + '%' : 'N/A',
    drop_off: i > 0 && pages[i - 1].visitors ? ((1 - (p.visitors || 0) / pages[i - 1].visitors) * 100).toFixed(1) + '%' : 'N/A'
  }));

  const totalVisitors = pages[0]?.visitors || 0;
  const totalConversions = pages[pages.length - 1]?.conversions || 0;

  console.log(JSON.stringify({
    action: 'funnel', locationId, funnelId, funnelName: funnel.name,
    overall_conversion: totalVisitors ? (totalConversions / totalVisitors * 100).toFixed(1) + '%' : 'N/A',
    steps: analysis,
    bottleneck: analysis.reduce((worst, s) => (!worst || parseFloat(s.drop_off) > parseFloat(worst.drop_off || '0')) ? s : worst, null)
  }, null, 2));
}

async function emailMetrics(locationId, args) {
  const opts = parseArgs(args);
  const days = parseInt(opts.days || '30', 10);
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/campaigns/?locationId=${locationId}&type=email`, token);
  const campaigns = result.campaigns || [];

  let totalSent = 0, totalDelivered = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0, totalUnsubs = 0;
  campaigns.forEach(c => {
    totalSent += c.sent || 0; totalDelivered += c.delivered || 0;
    totalOpened += c.opened || 0; totalClicked += c.clicked || 0;
    totalBounced += c.bounced || 0; totalUnsubs += c.unsubscribed || 0;
  });

  console.log(JSON.stringify({
    action: 'emails', locationId, days, campaignCount: campaigns.length,
    aggregate: { totalSent, totalDelivered, totalOpened, totalClicked, totalBounced, totalUnsubs },
    rates: {
      open_rate: totalDelivered ? (totalOpened / totalDelivered * 100).toFixed(1) + '%' : 'N/A',
      click_rate: totalDelivered ? (totalClicked / totalDelivered * 100).toFixed(1) + '%' : 'N/A',
      bounce_rate: totalSent ? (totalBounced / totalSent * 100).toFixed(1) + '%' : 'N/A',
      unsub_rate: totalDelivered ? (totalUnsubs / totalDelivered * 100).toFixed(1) + '%' : 'N/A'
    }
  }, null, 2));
}

async function compareCampaigns(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.a || !opts.b) throw new Error('Required: --a "<campaign_a_id>" --b "<campaign_b_id>"');
  const token = findTokenForLocation(locationId);
  const [a, b] = await Promise.all([
    apiCall('GET', `/campaigns/${opts.a}?locationId=${locationId}`, token),
    apiCall('GET', `/campaigns/${opts.b}?locationId=${locationId}`, token)
  ]);

  const metrics = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed'];
  const comparison = {};
  metrics.forEach(m => {
    comparison[m] = { a: a[m] || 0, b: b[m] || 0, winner: (a[m] || 0) > (b[m] || 0) ? 'A' : 'B' };
  });

  const openRateA = a.delivered ? (a.opened || 0) / a.delivered : 0;
  const openRateB = b.delivered ? (b.opened || 0) / b.delivered : 0;

  console.log(JSON.stringify({
    action: 'compare', locationId,
    campaign_a: { id: opts.a, name: a.name }, campaign_b: { id: opts.b, name: b.name },
    comparison,
    winner: openRateA > openRateB ? 'A' : 'B',
    recommendation: openRateA > openRateB ? `Scale campaign A (${a.name})` : `Scale campaign B (${b.name})`
  }, null, 2));
}

async function healthScore(locationId) {
  const token = findTokenForLocation(locationId);
  const campaigns = await apiCall('GET', `/campaigns/?locationId=${locationId}`, token);
  const contacts = await apiCall('GET', `/contacts/?locationId=${locationId}&limit=1`, token);

  const totalCampaigns = (campaigns.campaigns || []).length;
  const totalContacts = contacts.total || contacts.meta?.total || 0;
  let score = 5;
  if (totalCampaigns > 5) score += 1;
  if (totalCampaigns > 10) score += 1;
  if (totalContacts > 100) score += 1;
  if (totalContacts > 1000) score += 1;
  if (totalContacts > 5000) score += 1;
  score = Math.min(score, 10);

  console.log(JSON.stringify({
    action: 'health', locationId,
    health_score: score,
    metrics: { totalCampaigns, totalContacts },
    recommendations: score < 7 ? ['Increase campaign frequency', 'Grow contact list', 'Implement lead scoring'] : ['Maintain current pace', 'Explore new channels']
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node campaign-analyst.mjs <command> [args...]'); console.log('Commands: report, funnel, emails, compare, health'); process.exit(1); }
  try {
    switch (command) {
      case 'report': if (!args[0]) throw new Error('Missing location_id'); await campaignReport(args[0], args.slice(1)); break;
      case 'funnel': if (!args[0] || !args[1]) throw new Error('Missing location_id or funnel_id'); await funnelAnalysis(args[0], args[1], args.slice(2)); break;
      case 'emails': if (!args[0]) throw new Error('Missing location_id'); await emailMetrics(args[0], args.slice(1)); break;
      case 'compare': if (!args[0]) throw new Error('Missing location_id'); await compareCampaigns(args[0], args.slice(1)); break;
      case 'health': if (!args[0]) throw new Error('Missing location_id'); await healthScore(args[0]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
