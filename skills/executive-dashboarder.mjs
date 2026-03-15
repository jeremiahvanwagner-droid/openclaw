#!/usr/bin/env node
/**
 * Executive Dashboarder
 * Compile daily SaaS portfolio metrics and deliver formatted executive summary
 *
 * Usage: node executive-dashboarder.mjs <command> [args...]
 *
 * Commands:
 *   generate [--days <1>]           Generate executive summary
 *   compare --period_a "<p>" --period_b "<p>"  Compare two periods
 *   deliver --channel "<telegram|sms>"         Send latest summary
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const INSTANCES_PATH = join(OPENCLAW_ROOT, 'data', 'saas-instances.json');
const REPORTS_PATH = join(OPENCLAW_ROOT, 'reports', 'executive-dashboards.json');
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
  return null;
}

async function apiCall(method, endpoint, token, body = null) {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) await new Promise(r => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
  lastCallAt = Date.now();
  const options = { method, headers: { 'Authorization': `Bearer ${token}`, 'Version': API_VERSION, 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${GHL_BASE}${endpoint}`, options);
  if (!response.ok) return null;
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

function loadReports() {
  if (!existsSync(REPORTS_PATH)) return { dashboards: [] };
  return JSON.parse(readFileSync(REPORTS_PATH, 'utf-8'));
}

function saveReports(data) {
  const dir = dirname(REPORTS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REPORTS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function loadInstances() {
  if (!existsSync(INSTANCES_PATH)) return { instances: [] };
  return JSON.parse(readFileSync(INSTANCES_PATH, 'utf-8'));
}

async function generateDashboard(args) {
  const opts = parseArgs(args);
  const days = parseInt(opts.days || '1', 10);
  const instances = loadInstances();

  const portfolioMetrics = {
    total_instances: instances.instances?.length || 0,
    active_instances: 0,
    total_contacts: 0,
    total_opportunities: 0,
    total_revenue: 0,
    new_leads_period: 0,
    appointments_booked: 0,
    per_instance: []
  };

  for (const instance of (instances.instances || [])) {
    if (instance.status !== 'active') continue;
    portfolioMetrics.active_instances++;

    const locationId = instance.ghl_location_id || instance.sub_accounts?.[0]?.location_id;
    if (!locationId) continue;

    const token = findTokenForLocation(locationId);
    if (!token) continue;

    const instanceMetrics = { brand: instance.brand_name, location_id: locationId, contacts: 0, opportunities: 0, appointments: 0 };

    // Fetch contacts count
    const contacts = await apiCall('GET', `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=1`, token);
    if (contacts) instanceMetrics.contacts = contacts.meta?.total || contacts.total || 0;

    // Fetch pipeline data
    const pipelines = await apiCall('GET', `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`, token);
    if (pipelines?.pipelines) {
      for (const pipeline of pipelines.pipelines) {
        const opps = await apiCall('GET', `/opportunities/?locationId=${encodeURIComponent(locationId)}&pipelineId=${pipeline.id}&limit=1`, token);
        if (opps) instanceMetrics.opportunities += opps.meta?.total || 0;
      }
    }

    // Fetch calendar appointments
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 86400000).toISOString();
    const calendars = await apiCall('GET', `/calendars/?locationId=${encodeURIComponent(locationId)}`, token);
    if (calendars?.calendars) {
      for (const cal of calendars.calendars) {
        const appts = await apiCall('GET', `/calendars/${cal.id}/appointments?locationId=${encodeURIComponent(locationId)}&startDate=${startDate}&endDate=${now.toISOString()}`, token);
        if (appts?.appointments) instanceMetrics.appointments += appts.appointments.length;
      }
    }

    portfolioMetrics.total_contacts += instanceMetrics.contacts;
    portfolioMetrics.total_opportunities += instanceMetrics.opportunities;
    portfolioMetrics.appointments_booked += instanceMetrics.appointments;
    portfolioMetrics.per_instance.push(instanceMetrics);
  }

  const dashboard = {
    generated_at: new Date().toISOString(),
    period_days: days,
    portfolio: portfolioMetrics,
    summary: formatSummary(portfolioMetrics, days)
  };

  const reports = loadReports();
  reports.dashboards.push(dashboard);
  if (reports.dashboards.length > 90) reports.dashboards = reports.dashboards.slice(-90);
  saveReports(reports);

  console.log(JSON.stringify(dashboard, null, 2));
}

function formatSummary(metrics, days) {
  const lines = [
    `📊 EXECUTIVE DASHBOARD (${days}d)`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `Active SaaS Instances: ${metrics.active_instances}/${metrics.total_instances}`,
    `Total Contacts: ${metrics.total_contacts.toLocaleString()}`,
    `Pipeline Opportunities: ${metrics.total_opportunities}`,
    `Appointments Booked: ${metrics.appointments_booked}`,
    ``,
    `PER INSTANCE:`,
    ...metrics.per_instance.map(i => `  ${i.brand}: ${i.contacts} contacts, ${i.opportunities} opps, ${i.appointments} appts`)
  ];
  return lines.join('\n');
}

function comparePeriods(args) {
  const opts = parseArgs(args);
  if (!opts.period_a || !opts.period_b) throw new Error('Required: --period_a "<date>" --period_b "<date>"');
  const reports = loadReports();
  const a = reports.dashboards.find(d => d.generated_at.startsWith(opts.period_a));
  const b = reports.dashboards.find(d => d.generated_at.startsWith(opts.period_b));
  if (!a || !b) throw new Error('One or both periods not found in dashboard history');

  const delta = (va, vb) => vb !== 0 ? (((va - vb) / vb) * 100).toFixed(1) + '%' : 'N/A';
  console.log(JSON.stringify({
    action: 'compare', period_a: opts.period_a, period_b: opts.period_b,
    contacts: { a: a.portfolio.total_contacts, b: b.portfolio.total_contacts, change: delta(a.portfolio.total_contacts, b.portfolio.total_contacts) },
    opportunities: { a: a.portfolio.total_opportunities, b: b.portfolio.total_opportunities, change: delta(a.portfolio.total_opportunities, b.portfolio.total_opportunities) },
    appointments: { a: a.portfolio.appointments_booked, b: b.portfolio.appointments_booked, change: delta(a.portfolio.appointments_booked, b.portfolio.appointments_booked) }
  }, null, 2));
}

function deliverSummary(args) {
  const opts = parseArgs(args);
  if (!opts.channel) throw new Error('Required: --channel "<telegram|sms>"');
  const reports = loadReports();
  const latest = reports.dashboards[reports.dashboards.length - 1];
  if (!latest) throw new Error('No dashboard generated yet — run generate first');

  // Output the delivery payload — actual sending handled by OpenClaw alert system
  console.log(JSON.stringify({
    action: 'deliver', channel: opts.channel,
    event: 'alert/telegram',
    payload: { message: latest.summary, priority: 'normal', source: 'd8_integration_engineer' },
    status: 'queued'
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node executive-dashboarder.mjs <command> [args...]'); console.log('Commands: generate, compare, deliver'); process.exit(1); }
  try {
    switch (command) {
      case 'generate': await generateDashboard(args); break;
      case 'compare': comparePeriods(args); break;
      case 'deliver': deliverSummary(args); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
