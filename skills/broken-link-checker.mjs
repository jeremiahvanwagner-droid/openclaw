#!/usr/bin/env node
/**
 * Broken Link Checker
 * Crawls GHL funnels and emails, extracts links, validates HTTP status
 *
 * Usage: node broken-link-checker.mjs <command> [args...]
 *
 * Commands:
 *   scan <location_id>                Scan all funnels for broken links
 *   check-url <url>                   Check a single URL
 *   report <location_id> [--days <n>] View scan history
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const REPORT_PATH = join(OPENCLAW_ROOT, 'data', 'broken-link-reports.json');
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
  if (!existsSync(REPORT_PATH)) return { scans: [] };
  return JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
}

function saveReports(data) {
  const dir = dirname(REPORT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(data, null, 2), 'utf-8');
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

function extractUrls(html) {
  const urlRegex = /https?:\/\/[^\s"'<>]+/g;
  const matches = html.match(urlRegex) || [];
  return [...new Set(matches)];
}

async function checkUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    return { url, status: response.status, ok: response.ok, redirected: response.redirected };
  } catch (error) {
    return { url, status: 0, ok: false, error: error.message };
  }
}

async function scanFunnels(locationId) {
  const token = findTokenForLocation(locationId);
  const funnels = await apiCall('GET', `/funnels/?locationId=${encodeURIComponent(locationId)}`, token);
  const funnelList = funnels.funnels || [];

  const results = { locationId, scannedAt: new Date().toISOString(), totalFunnels: funnelList.length, totalLinks: 0, broken: [], healthy: 0 };

  for (const funnel of funnelList) {
    const pages = funnel.steps || [];
    for (const page of pages) {
      if (!page.url) continue;
      try {
        const pageResult = await checkUrl(page.url);
        results.totalLinks++;
        if (pageResult.ok) {
          results.healthy++;
        } else {
          results.broken.push({
            funnelName: funnel.name, pageName: page.name || 'Unnamed',
            url: page.url, status: pageResult.status, error: pageResult.error || null
          });
        }
      } catch { /* skip unreachable */ }
    }
  }

  const reports = loadReports();
  reports.scans.push(results);
  if (reports.scans.length > 100) reports.scans = reports.scans.slice(-100);
  saveReports(reports);

  console.log(JSON.stringify({
    action: 'scan', locationId, totalFunnels: results.totalFunnels,
    totalLinks: results.totalLinks, brokenLinks: results.broken.length,
    healthyLinks: results.healthy,
    broken: results.broken,
    scannedAt: results.scannedAt
  }, null, 2));
}

async function checkSingleUrl(url) {
  const result = await checkUrl(url);
  console.log(JSON.stringify({ action: 'check-url', ...result }, null, 2));
}

function viewReports(locationId, args) {
  const opts = parseArgs(args);
  const days = parseInt(opts.days || '30', 10);
  const cutoff = new Date(Date.now() - days * 86400000);
  const reports = loadReports();
  const scans = reports.scans.filter(s => s.locationId === locationId && new Date(s.scannedAt) >= cutoff);
  console.log(JSON.stringify({
    action: 'report', locationId, days,
    totalScans: scans.length,
    scans: scans.map(s => ({
      scannedAt: s.scannedAt, totalLinks: s.totalLinks,
      broken: s.broken.length, healthy: s.healthy
    }))
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node broken-link-checker.mjs <command> [args...]'); console.log('Commands: scan, check-url, report'); process.exit(1); }
  try {
    switch (command) {
      case 'scan': if (!args[0]) throw new Error('Missing location_id'); await scanFunnels(args[0]); break;
      case 'check-url': if (!args[0]) throw new Error('Missing url'); await checkSingleUrl(args[0]); break;
      case 'report': if (!args[0]) throw new Error('Missing location_id'); viewReports(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
