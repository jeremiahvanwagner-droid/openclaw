#!/usr/bin/env node
/**
 * Deliverability Auditor
 * Monitor email deliverability metrics and suppress risky contacts
 *
 * Usage: node deliverability-auditor.mjs <command> [args...]
 *
 * Commands:
 *   audit <location_id> [--days <30>] [--auto_suppress]   Full deliverability audit
 *   suppress <location_id> --contact_id "<c>" --reason "<r>"  Manual suppress
 *   health <location_id>                                  Quick health score
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const AUDIT_PATH = join(OPENCLAW_ROOT, 'data', 'deliverability-audits.json');
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

function loadAudits() {
  if (!existsSync(AUDIT_PATH)) return { audits: [] };
  return JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'));
}

function saveAudits(data) {
  const dir = dirname(AUDIT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(AUDIT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function calcHealthScore(metrics) {
  const score = (component, value, goodThreshold, badThreshold, invert = false) => {
    if (invert) { const raw = value <= goodThreshold ? 100 : value >= badThreshold ? 0 : 100 * (badThreshold - value) / (badThreshold - goodThreshold); return raw * component; }
    const raw = value >= goodThreshold ? 100 : value <= badThreshold ? 0 : 100 * (value - badThreshold) / (goodThreshold - badThreshold);
    return raw * component;
  };

  return Math.round(
    score(0.30, metrics.delivery_rate, 98, 90) +
    score(0.25, metrics.open_rate, 25, 5) +
    score(0.20, metrics.bounce_rate, 1, 5, true) +
    score(0.15, metrics.complaint_rate, 0.05, 0.5, true) +
    score(0.10, metrics.unsubscribe_rate, 0.2, 2, true)
  );
}

function riskLevel(score) {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warning';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

function recommendations(level, metrics) {
  const recs = [];
  if (metrics.bounce_rate > 2) recs.push('Clean email list — remove all hard bounces immediately');
  if (metrics.complaint_rate > 0.1) recs.push('Review email content and frequency — complaint rate exceeds safe threshold');
  if (metrics.open_rate < 15) recs.push('Improve subject lines and send timing — open rate is below average');
  if (metrics.unsubscribe_rate > 1) recs.push('Reduce email frequency or improve segmentation — high unsubscribe rate');
  if (level === 'critical') recs.push('URGENT: Pause all email campaigns until list is fully audited');
  if (level === 'at_risk') recs.push('Pause cold outreach campaigns and warm up sending reputation');
  if (recs.length === 0) recs.push('Deliverability is healthy — continue current practices');
  return recs;
}

async function runAudit(locationId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);

  // Fetch campaign/email stats from GHL
  const campaigns = await apiCall('GET', `/campaigns/?locationId=${encodeURIComponent(locationId)}`, token);
  const campaignList = campaigns.campaigns || [];

  let totalSent = 0, totalDelivered = 0, totalBounced = 0, totalComplaints = 0, totalOpened = 0, totalUnsubscribed = 0;
  const campaignMetrics = [];

  for (const campaign of campaignList.slice(0, 50)) {
    const sent = campaign.statistics?.sent || campaign.sent || 0;
    const delivered = campaign.statistics?.delivered || campaign.delivered || sent;
    const bounced = campaign.statistics?.bounced || campaign.bounced || 0;
    const complaints = campaign.statistics?.complained || campaign.complaints || 0;
    const opened = campaign.statistics?.opened || campaign.opened || 0;
    const unsubs = campaign.statistics?.unsubscribed || campaign.unsubscribed || 0;

    totalSent += sent; totalDelivered += delivered; totalBounced += bounced;
    totalComplaints += complaints; totalOpened += opened; totalUnsubscribed += unsubs;

    if (sent > 0) {
      campaignMetrics.push({
        campaign_id: campaign.id, name: campaign.name || 'Unnamed',
        bounce_rate: parseFloat((bounced / sent * 100).toFixed(2)),
        complaint_rate: parseFloat((complaints / sent * 100).toFixed(3))
      });
    }
  }

  const metrics = {
    total_sent: totalSent,
    delivery_rate: totalSent > 0 ? parseFloat((totalDelivered / totalSent * 100).toFixed(2)) : 100,
    open_rate: totalDelivered > 0 ? parseFloat((totalOpened / totalDelivered * 100).toFixed(2)) : 0,
    bounce_rate: totalSent > 0 ? parseFloat((totalBounced / totalSent * 100).toFixed(2)) : 0,
    complaint_rate: totalSent > 0 ? parseFloat((totalComplaints / totalSent * 100).toFixed(3)) : 0,
    unsubscribe_rate: totalSent > 0 ? parseFloat((totalUnsubscribed / totalSent * 100).toFixed(2)) : 0
  };

  const healthScore = calcHealthScore(metrics);
  const level = riskLevel(healthScore);
  const worstCampaigns = campaignMetrics.sort((a, b) => (b.bounce_rate + b.complaint_rate) - (a.bounce_rate + a.complaint_rate)).slice(0, 5);

  const result = {
    action: 'audit', location_id: locationId,
    health_score: healthScore, risk_level: level,
    metrics, campaigns_analyzed: campaignList.length,
    worst_campaigns: worstCampaigns,
    recommendations: recommendations(level, metrics),
    audited_at: new Date().toISOString()
  };

  const audits = loadAudits();
  audits.audits.push(result);
  if (audits.audits.length > 100) audits.audits = audits.audits.slice(-100);
  saveAudits(audits);

  console.log(JSON.stringify(result, null, 2));
}

async function suppressContact(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id || !opts.reason) throw new Error('Required: --contact_id "<id>" --reason "<reason>"');
  const token = findTokenForLocation(locationId);
  await apiCall('PUT', `/contacts/${encodeURIComponent(opts.contact_id)}`, token, { dnd: true, tags: [`suppressed_${opts.reason}`] });
  console.log(JSON.stringify({ action: 'suppress', locationId, contactId: opts.contact_id, reason: opts.reason, status: 'suppressed' }, null, 2));
}

async function quickHealth(locationId) {
  const audits = loadAudits();
  const latest = audits.audits.filter(a => a.location_id === locationId).pop();
  if (!latest) { console.log(JSON.stringify({ action: 'health', locationId, message: 'No audit data — run audit first' }, null, 2)); return; }
  console.log(JSON.stringify({ action: 'health', locationId, health_score: latest.health_score, risk_level: latest.risk_level, last_audit: latest.audited_at }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node deliverability-auditor.mjs <command> [args...]'); console.log('Commands: audit, suppress, health'); process.exit(1); }
  try {
    switch (command) {
      case 'audit': if (!args[0]) throw new Error('Missing location_id'); await runAudit(args[0], args.slice(1)); break;
      case 'suppress': if (!args[0]) throw new Error('Missing location_id'); await suppressContact(args[0], args.slice(1)); break;
      case 'health': if (!args[0]) throw new Error('Missing location_id'); await quickHealth(args[0]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
