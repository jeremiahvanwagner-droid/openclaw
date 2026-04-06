#!/usr/bin/env node
/**
 * GHL API Coverage Report
 * Truth J Blue LLC — OpenClaw
 *
 * Compares generated client surface vs. official API surface.
 * Outputs a markdown report with coverage per namespace.
 *
 * Usage:
 *   node scripts/ghl-codegen/coverage-report.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_cr = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname_cr, '..', '..');
const SCHEMA_DIR = join(ROOT, 'data', 'ghl-api-schemas');
const GEN_DIR = join(ROOT, 'lib', 'ghl');
const SCOPE_FILE = join(ROOT, 'config', 'ghl-scopes.json');
const WEBHOOK_FILE = join(ROOT, 'lib', 'ghl-webhook.mjs');

function countSpecOperations(specFile) {
  const spec = JSON.parse(readFileSync(specFile, 'utf8'));
  let count = 0;
  for (const pathItem of Object.values(spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (pathItem[method]?.operationId) count++;
    }
  }
  return count;
}

function countGeneratedMethods(genFile) {
  if (!existsSync(genFile)) return 0;
  const code = readFileSync(genFile, 'utf8');
  return (code.match(/async \w+\(/g) || []).length;
}

function main() {
  console.log('# GHL API Coverage Report\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  const specFiles = readdirSync(SCHEMA_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'common-schemas.json' && f !== 'toc.json')
    .sort();

  let totalSpec = 0, totalGen = 0;
  const rows = [];

  for (const file of specFiles) {
    const service = file.replace('.json', '');
    const specOps = countSpecOperations(join(SCHEMA_DIR, file));
    const genFile = join(GEN_DIR, `${service}.mjs`);
    const genOps = countGeneratedMethods(genFile);
    const coverage = specOps === 0 ? 'N/A' : `${Math.round((genOps / specOps) * 100)}%`;
    const status = specOps === 0 ? '⊘' : genOps >= specOps ? '✅' : genOps > 0 ? '⚠️' : '❌';

    totalSpec += specOps;
    totalGen += genOps;

    rows.push({ service, specOps, genOps, coverage, status });
  }

  console.log('| Namespace | Spec Ops | Generated | Coverage | Status |');
  console.log('|-----------|----------|-----------|----------|--------|');
  for (const r of rows) {
    console.log(`| ${r.service.padEnd(24)} | ${String(r.specOps).padStart(8)} | ${String(r.genOps).padStart(9)} | ${r.coverage.padStart(8)} | ${r.status.padStart(6)} |`);
  }

  const totalPct = totalSpec === 0 ? 'N/A' : `${Math.round((totalGen / totalSpec) * 100)}%`;
  console.log(`| **TOTAL** | **${totalSpec}** | **${totalGen}** | **${totalPct}** | |`);

  // Webhook coverage
  console.log('\n## Webhook Event Coverage\n');
  if (existsSync(WEBHOOK_FILE)) {
    const webhookCode = readFileSync(WEBHOOK_FILE, 'utf8');
    const mappedEvents = (webhookCode.match(/\['.+?',\s*'.+?'\]/g) || []).length;
    console.log(`Mapped events in PLATFORM_EVENT_MAP: ${mappedEvents}`);
  }

  // Scope manifest
  console.log('\n## Scope Manifest\n');
  if (existsSync(SCOPE_FILE)) {
    const scopes = JSON.parse(readFileSync(SCOPE_FILE, 'utf8'));
    const nsCount = Object.keys(scopes.namespaces || {}).length;
    let totalScoped = 0;
    for (const ns of Object.values(scopes.namespaces || {})) {
      totalScoped += Object.keys(ns).length;
    }
    console.log(`Namespaces with scopes: ${nsCount}`);
    console.log(`Operations with scopes: ${totalScoped}`);
  }

  // Meta info
  const metaFile = join(SCHEMA_DIR, '_meta.json');
  if (existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    console.log(`\n## Schema Source\n`);
    console.log(`Fetched: ${meta.fetchedAt}`);
    console.log(`Commit SHA: ${meta.commitSha}`);
  }
}

main();
