#!/usr/bin/env node
/**
 * Split Test Monitor
 * Analyze GHL funnel A/B tests for statistical significance
 *
 * Usage: node split-test-monitor.mjs <command> [args...]
 *
 * Commands:
 *   analyze <location_id> --funnel_id "<f>" [--confidence <0.95>] [--min_sample <100>]
 *   list <location_id>                     List active A/B tests
 *   history <location_id> [--days <n>]     Past test results
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const HISTORY_PATH = join(OPENCLAW_ROOT, 'data', 'split-test-history.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

const CHI_SQUARED_CRITICAL = { 0.90: 2.706, 0.95: 3.841, 0.99: 6.635 };

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

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return { tests: [] };
  return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
}

function saveHistory(data) {
  const dir = dirname(HISTORY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function chiSquared(variants) {
  const totalVisitors = variants.reduce((s, v) => s + v.visitors, 0);
  const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);
  const overallRate = totalConversions / totalVisitors;
  let chi2 = 0;

  for (const v of variants) {
    const expectedConversions = v.visitors * overallRate;
    const expectedNonConversions = v.visitors * (1 - overallRate);
    if (expectedConversions > 0) chi2 += Math.pow(v.conversions - expectedConversions, 2) / expectedConversions;
    if (expectedNonConversions > 0) chi2 += Math.pow((v.visitors - v.conversions) - expectedNonConversions, 2) / expectedNonConversions;
  }

  return chi2;
}

async function analyzeTest(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.funnel_id) throw new Error('Required: --funnel_id "<id>"');

  const confidence = parseFloat(opts.confidence || '0.95');
  const minSample = parseInt(opts.min_sample || '100', 10);
  const critical = CHI_SQUARED_CRITICAL[confidence] || CHI_SQUARED_CRITICAL[0.95];

  const token = findTokenForLocation(locationId);
  const funnel = await apiCall('GET', `/funnels/${encodeURIComponent(opts.funnel_id)}?locationId=${encodeURIComponent(locationId)}`, token);
  const pages = funnel.steps || funnel.pages || [];

  // Build variant data from funnel steps with split test info
  const variants = pages.filter(p => p.splitTestVariant || p.variant).map(p => ({
    variant_id: p.id,
    name: p.splitTestVariant || p.variant || p.name || 'Unknown',
    visitors: p.views || p.visitors || 0,
    conversions: p.conversions || p.optIns || 0,
    conversion_rate: 0
  }));

  if (variants.length < 2) {
    console.log(JSON.stringify({ action: 'analyze', funnel_id: opts.funnel_id, test_status: 'no_test_found', message: 'No A/B test variants detected' }, null, 2));
    return;
  }

  variants.forEach(v => { v.conversion_rate = v.visitors > 0 ? v.conversions / v.visitors : 0; });
  const insufficientData = variants.some(v => v.visitors < minSample);

  if (insufficientData) {
    console.log(JSON.stringify({
      action: 'analyze', funnel_id: opts.funnel_id, test_status: 'insufficient_data',
      variants, recommendation: 'continue', min_sample: minSample
    }, null, 2));
    return;
  }

  const chi2 = chiSquared(variants);
  const isSignificant = chi2 > critical;
  const sorted = [...variants].sort((a, b) => b.conversion_rate - a.conversion_rate);
  const best = sorted[0];
  const runner = sorted[1];
  const relativeImprovement = runner.conversion_rate > 0
    ? ((best.conversion_rate - runner.conversion_rate) / runner.conversion_rate * 100).toFixed(1) + '%'
    : 'N/A';

  const result = {
    action: 'analyze', funnel_id: opts.funnel_id,
    test_status: isSignificant ? 'significant' : 'not_significant',
    variants: variants.map(v => ({ ...v, is_winner: isSignificant && v.variant_id === best.variant_id, conversion_rate: (v.conversion_rate * 100).toFixed(2) + '%' })),
    statistics: { chi_squared: parseFloat(chi2.toFixed(4)), confidence, critical_value: critical, is_significant: isSignificant, relative_improvement: relativeImprovement },
    recommendation: isSignificant ? 'declare_winner' : 'continue',
    recommendation_strength: isSignificant ? (parseFloat(relativeImprovement) > 20 ? 'strong' : 'marginal') : 'none',
    analyzed_at: new Date().toISOString()
  };

  // Check for sample size bias
  const maxV = Math.max(...variants.map(v => v.visitors));
  const minV = Math.min(...variants.map(v => v.visitors));
  if (maxV > minV * 3) result.bias_warning = 'Asymmetric sample sizes detected (>3x difference)';

  const history = loadHistory();
  history.tests.push(result);
  if (history.tests.length > 200) history.tests = history.tests.slice(-200);
  saveHistory(history);

  console.log(JSON.stringify(result, null, 2));
}

async function listTests(locationId) {
  const token = findTokenForLocation(locationId);
  const funnels = await apiCall('GET', `/funnels/?locationId=${encodeURIComponent(locationId)}`, token);
  const funnelList = funnels.funnels || [];
  const withTests = funnelList.filter(f => (f.steps || []).some(s => s.splitTestVariant || s.variant));
  console.log(JSON.stringify({
    action: 'list', locationId, total: withTests.length,
    funnels: withTests.map(f => ({ id: f.id, name: f.name, steps: (f.steps || []).length }))
  }, null, 2));
}

function viewHistory(locationId, args) {
  const opts = parseArgs(args);
  const days = parseInt(opts.days || '30', 10);
  const cutoff = new Date(Date.now() - days * 86400000);
  const history = loadHistory();
  const tests = history.tests.filter(t => new Date(t.analyzed_at) >= cutoff);
  console.log(JSON.stringify({ action: 'history', locationId, days, total: tests.length, tests }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node split-test-monitor.mjs <command> [args...]'); console.log('Commands: analyze, list, history'); process.exit(1); }
  try {
    switch (command) {
      case 'analyze': if (!args[0]) throw new Error('Missing location_id'); await analyzeTest(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listTests(args[0]); break;
      case 'history': if (!args[0]) throw new Error('Missing location_id'); viewHistory(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
