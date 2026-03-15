#!/usr/bin/env node
/**
 * GHL Agency Pro Setup Validator
 * Validates GHL SaaS Mode configuration prerequisites
 *
 * Usage: node ghl-setup-validator.mjs <command> [args...]
 *
 * Commands:
 *   validate <location_id>    Full setup validation checklist
 *   check <location_id> <item> Check a specific item (stripe|domain|phone|email|saas|rebilling)
 *   status <location_id>      Quick pass/fail summary
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const REPORT_PATH = join(OPENCLAW_ROOT, 'data', 'setup-validation-reports.json');
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

function loadReports() {
  if (!existsSync(REPORT_PATH)) return { validations: [] };
  return JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
}

function saveReports(data) {
  const dir = dirname(REPORT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Validation Checks ──

async function checkAgencyProSubscription(token, locationId) {
  try {
    const data = await apiCall('GET', `/locations/${locationId}`, token);
    const plan = data.location?.settings?.plan || data.location?.plan || '';
    const isAgencyPro = /agency.*(pro|unlimited)/i.test(plan) || /497|unlimited/i.test(plan);
    return {
      item: 'Agency Pro Subscription',
      passed: isAgencyPro,
      value: plan || 'Not detected',
      fix: isAgencyPro ? null : 'Upgrade to Agency Pro ($497/mo) or Agency Unlimited plan at https://app.gohighlevel.com/settings/billing'
    };
  } catch {
    return { item: 'Agency Pro Subscription', passed: false, value: 'API error', fix: 'Verify API access and location ID' };
  }
}

async function checkSaaSModeEnabled(token, locationId) {
  try {
    const data = await apiCall('GET', `/locations/${locationId}`, token);
    const saasEnabled = data.location?.settings?.saasMode === true || data.location?.saasEnabled === true;
    return {
      item: 'SaaS Mode Enabled',
      passed: saasEnabled,
      value: saasEnabled ? 'Enabled' : 'Disabled',
      fix: saasEnabled ? null : 'Enable SaaS Mode in Settings > Company > SaaS Configurator. Requires Agency Pro plan.'
    };
  } catch {
    return { item: 'SaaS Mode Enabled', passed: false, value: 'API error', fix: 'Verify API access' };
  }
}

async function checkStripeConnected(token, locationId) {
  try {
    const data = await apiCall('GET', `/payments/integrations/provider/stripe`, token);
    const connected = data.connected === true || data.stripe?.connected === true || !!data.accountId;
    return {
      item: 'Stripe Connected',
      passed: connected,
      value: connected ? `Connected (${data.accountId || 'active'})` : 'Not connected',
      fix: connected ? null : 'Connect Stripe at Settings > Payments > Integrations. Required for SaaS billing and sub-account rebilling.'
    };
  } catch {
    return { item: 'Stripe Connected', passed: false, value: 'Not detected', fix: 'Connect Stripe at Settings > Payments > Integrations' };
  }
}

async function checkCustomDomain(token, locationId) {
  try {
    const data = await apiCall('GET', `/locations/${locationId}`, token);
    const domain = data.location?.domain || data.location?.settings?.domain || '';
    const hasDomain = domain.length > 0 && !domain.includes('msgsndr.com') && !domain.includes('leadconnectorhq.com');
    return {
      item: 'Custom Domain Configured',
      passed: hasDomain,
      value: hasDomain ? domain : 'Using default GHL domain',
      fix: hasDomain ? null : 'Configure custom domain at Settings > Company > Custom Domain. Add CNAME record pointing to your GHL domain.'
    };
  } catch {
    return { item: 'Custom Domain Configured', passed: false, value: 'API error', fix: 'Verify API access' };
  }
}

async function checkLCPhoneEnabled(token, locationId) {
  try {
    const data = await apiCall('GET', `/locations/${locationId}`, token);
    const phoneEnabled = data.location?.settings?.phone?.lcPhone === true || data.location?.settings?.lcPhone === true;
    const phoneNumbers = data.location?.settings?.phone?.numbers || [];
    return {
      item: 'LC Phone Enabled',
      passed: phoneEnabled,
      value: phoneEnabled ? `Enabled (${phoneNumbers.length} numbers)` : 'Disabled',
      fix: phoneEnabled ? null : 'Enable LC Phone at Settings > Phone Numbers. Required for SMS/voice automation. Register for A2P 10DLC compliance.'
    };
  } catch {
    return { item: 'LC Phone Enabled', passed: false, value: 'Not detected', fix: 'Enable LC Phone at Settings > Phone Numbers' };
  }
}

async function checkLCEmailEnabled(token, locationId) {
  try {
    const data = await apiCall('GET', `/locations/${locationId}`, token);
    const emailEnabled = data.location?.settings?.email?.lcEmail === true || data.location?.settings?.lcEmail === true;
    return {
      item: 'LC Email Enabled',
      passed: emailEnabled,
      value: emailEnabled ? 'Enabled' : 'Disabled',
      fix: emailEnabled ? null : 'Enable LC Email at Settings > Email Services. Configure dedicated sending domain with DKIM/SPF/DMARC for optimal deliverability.'
    };
  } catch {
    return { item: 'LC Email Enabled', passed: false, value: 'Not detected', fix: 'Enable LC Email at Settings > Email Services' };
  }
}

async function checkRebillingConfigured(token, locationId) {
  try {
    const data = await apiCall('GET', `/locations/${locationId}`, token);
    const rebilling = data.location?.settings?.rebilling || {};
    const configured = rebilling.enabled === true || rebilling.active === true;
    return {
      item: 'Rebilling Configured',
      passed: configured,
      value: configured ? 'Active' : 'Not configured',
      fix: configured ? null : 'Configure Rebilling at Settings > Company > SaaS Configurator > Rebilling. Set markup percentages for SMS, Email, Phone to generate revenue from sub-account usage.'
    };
  } catch {
    return { item: 'Rebilling Configured', passed: false, value: 'Not detected', fix: 'Configure rebilling in SaaS Configurator' };
  }
}

// ── Main Commands ──

async function runFullValidation(locationId) {
  const token = findTokenForLocation(locationId);
  const checks = [
    checkAgencyProSubscription,
    checkSaaSModeEnabled,
    checkStripeConnected,
    checkCustomDomain,
    checkLCPhoneEnabled,
    checkLCEmailEnabled,
    checkRebillingConfigured
  ];

  const results = [];
  for (const check of checks) {
    results.push(await check(token, locationId));
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const report = {
    location_id: locationId,
    timestamp: new Date().toISOString(),
    passed,
    total,
    all_passed: passed === total,
    checks: results
  };

  // Save report
  const reports = loadReports();
  reports.validations.unshift(report);
  if (reports.validations.length > 50) reports.validations.length = 50;
  saveReports(reports);

  return report;
}

async function runSingleCheck(locationId, item) {
  const token = findTokenForLocation(locationId);
  const checkMap = {
    stripe: checkStripeConnected,
    domain: checkCustomDomain,
    phone: checkLCPhoneEnabled,
    email: checkLCEmailEnabled,
    saas: checkSaaSModeEnabled,
    rebilling: checkRebillingConfigured,
    subscription: checkAgencyProSubscription
  };

  const check = checkMap[item.toLowerCase()];
  if (!check) throw new Error(`Unknown check item: ${item}. Valid: ${Object.keys(checkMap).join(', ')}`);
  return check(token, locationId);
}

// ── CLI Entry ──

const [,, command, ...args] = process.argv;

try {
  switch (command) {
    case 'validate': {
      const locationId = args[0];
      if (!locationId) throw new Error('Usage: validate <location_id>');
      const report = await runFullValidation(locationId);
      console.log(JSON.stringify(report, null, 2));
      if (!report.all_passed) process.exit(1);
      break;
    }
    case 'check': {
      const [locationId, item] = args;
      if (!locationId || !item) throw new Error('Usage: check <location_id> <item>');
      const result = await runSingleCheck(locationId, item);
      console.log(JSON.stringify(result, null, 2));
      if (!result.passed) process.exit(1);
      break;
    }
    case 'status': {
      const locationId = args[0];
      if (!locationId) throw new Error('Usage: status <location_id>');
      const report = await runFullValidation(locationId);
      const summary = report.checks.map(c => `${c.passed ? '✅' : '❌'} ${c.item}: ${c.value}`).join('\n');
      console.log(`\nGHL Setup Validation — ${report.passed}/${report.total} passed\n${summary}\n`);
      if (!report.all_passed) process.exit(1);
      break;
    }
    default:
      console.error('Usage: node ghl-setup-validator.mjs <validate|check|status> <location_id> [item]');
      process.exit(1);
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
}
