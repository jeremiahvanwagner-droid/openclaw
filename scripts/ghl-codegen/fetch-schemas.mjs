#!/usr/bin/env node
/**
 * GHL API Schema Fetcher
 * Truth J Blue LLC — OpenClaw
 *
 * Downloads all OpenAPI JSON specs from GoHighLevel/highlevel-api-docs
 * and stores them locally for offline code generation.
 *
 * Usage:
 *   node scripts/ghl-codegen/fetch-schemas.mjs
 *   node scripts/ghl-codegen/fetch-schemas.mjs --force   # re-download even if cached
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_fc = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname_fc, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'ghl-api-schemas');

const GHL_REPO_RAW = 'https://raw.githubusercontent.com/GoHighLevel/highlevel-api-docs/main/apps';

// All 35 service spec files from the GHL docs repo
const SERVICE_SPECS = [
  'agencies',
  'associations',
  'blogs',
  'businesses',
  'calendars',
  'campaigns',
  'companies',
  'contacts',
  'conversations',
  'courses',
  'custom-fields',
  'custom-menus',
  'email-isv',
  'emails',
  'forms',
  'funnels',
  'invoices',
  'links',
  'locations',
  'marketplace',
  'medias',
  'oauth',
  'objects',
  'opportunities',
  'payments',
  'phone-system',
  'products',
  'proposals',
  'saas-api',
  'snapshots',
  'social-media-posting',
  'store',
  'surveys',
  'users',
  'voice-ai',
  'workflows',
];

const META_FILE = join(OUT_DIR, '_meta.json');

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null; // spec doesn't exist
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      const delay = 1000 * Math.pow(2, i);
      console.warn(`  Retry ${i + 1}/${retries} for ${url} (waiting ${delay}ms): ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function fetchCommitSha() {
  const url = 'https://api.github.com/repos/GoHighLevel/highlevel-api-docs/commits/main';
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    console.warn(`Could not fetch commit SHA (HTTP ${res.status}), using "unknown"`);
    return 'unknown';
  }
  const data = await res.json();
  return data.sha;
}

async function main() {
  const force = process.argv.includes('--force');

  mkdirSync(OUT_DIR, { recursive: true });

  // Check if we already have schemas cached
  if (!force && existsSync(META_FILE)) {
    const meta = JSON.parse(readFileSync(META_FILE, 'utf8'));
    const specCount = meta.specs?.length || 0;
    console.log(`Schemas already cached (${specCount} specs, fetched ${meta.fetchedAt}).`);
    console.log('Use --force to re-download.');
    return;
  }

  console.log('Fetching GHL API schemas...\n');

  const commitSha = await fetchCommitSha();
  console.log(`Repo commit SHA: ${commitSha}\n`);

  const results = { success: [], failed: [], notFound: [] };

  for (const service of SERVICE_SPECS) {
    const url = `${GHL_REPO_RAW}/${service}.json`;
    process.stdout.write(`  ${service.padEnd(25)}`);

    try {
      const body = await fetchWithRetry(url);
      if (body === null) {
        results.notFound.push(service);
        console.log('⚠ not found (404)');
        continue;
      }

      // Validate it's valid JSON
      JSON.parse(body);

      const outPath = join(OUT_DIR, `${service}.json`);
      writeFileSync(outPath, body);
      results.success.push(service);
      console.log('✓');
    } catch (err) {
      results.failed.push({ service, error: err.message });
      console.log(`✗ ${err.message}`);
    }
  }

  // Also fetch common schemas if available
  const commonUrls = [
    { name: 'common-schemas', url: `${GHL_REPO_RAW}/../common/common-schemas.json` },
    { name: 'toc', url: `${GHL_REPO_RAW}/../toc.json` },
  ];

  for (const { name, url } of commonUrls) {
    process.stdout.write(`  ${name.padEnd(25)}`);
    try {
      const body = await fetchWithRetry(url);
      if (body === null) {
        console.log('⚠ not found');
        continue;
      }
      JSON.parse(body);
      writeFileSync(join(OUT_DIR, `${name}.json`), body);
      console.log('✓');
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }
  }

  // Write metadata
  const meta = {
    fetchedAt: new Date().toISOString(),
    commitSha,
    specs: results.success,
    notFound: results.notFound,
    failed: results.failed.map(f => f.service),
  };
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

  console.log(`\n── Summary ──`);
  console.log(`  Downloaded: ${results.success.length}`);
  console.log(`  Not found:  ${results.notFound.length}`);
  console.log(`  Failed:     ${results.failed.length}`);
  console.log(`  Commit SHA: ${commitSha}`);
  console.log(`  Output dir: ${OUT_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
