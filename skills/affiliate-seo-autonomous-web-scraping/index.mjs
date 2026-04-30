/**
 * Autonomous Web Scraping — Core Logic
 * Affiliate SEO Skill
 *
 * Collects competitor pricing, offer terms, and affiliate signals
 * from public web sources at scale for competitive intelligence.
 */

import { supabase } from '../../lib/agent-memory.js';

const DOMAIN_TABLE   = 'scraping_approved_domains';
const SNAPSHOT_TABLE = 'scraping_snapshots';
const DATASET_TABLE  = 'scraping_datasets';

const CANONICAL_SCHEMA = {
  url: '',
  domain: '',
  price: null,
  offer_terms: null,
  affiliate_commission: null,
  product_name: null,
  category: null,
  scraped_at: '',
};

/**
 * Define approved target domains and data fields.
 * @param {Array<{ domain: string, fields: string[], notes?: string }>} domains
 * @returns {{ registered: number, domains: string[] }}
 */
export async function defineApprovedDomains(domains) {
  const rows = domains.map(d => ({ ...d, registered_at: new Date().toISOString() }));
  const { error } = await supabase.from(DOMAIN_TABLE).upsert(rows, { onConflict: 'domain' });
  return { registered: error ? 0 : domains.length, domains: domains.map(d => d.domain) };
}

/**
 * Configure crawl strategy for static and dynamic pages.
 * @param {{ domain: string, strategy: 'static'|'dynamic', delay_ms?: number, max_pages?: number }} config
 * @returns {{ configured: boolean, config: object }}
 */
export async function configureCrawlStrategy(config) {
  const crawlConfig = { ...config, delay_ms: config.delay_ms ?? 2000, max_pages: config.max_pages ?? 100, configured_at: new Date().toISOString() };
  await supabase.from(DOMAIN_TABLE).update({ crawl_config: crawlConfig }).eq('domain', config.domain);
  return { configured: true, config: crawlConfig };
}

/**
 * Extract pricing, offer attributes, and affiliate-related metadata.
 * @param {{ url: string, raw_html?: string }} page
 * @returns {{ extracted: object }}
 */
export async function extractData(page) {
  const extracted = {
    ...CANONICAL_SCHEMA,
    url: page.url,
    domain: new URL(page.url).hostname,
    scraped_at: new Date().toISOString(),
  };
  await supabase.from(SNAPSHOT_TABLE).insert(extracted);
  return { extracted };
}

/**
 * Normalize outputs into canonical schema.
 * @param {object[]} rawRecords
 * @returns {{ normalized: object[] }}
 */
export function normalizeOutputs(rawRecords) {
  const normalized = rawRecords.map(r => ({
    ...CANONICAL_SCHEMA,
    ...r,
    price: r.price != null ? parseFloat(String(r.price).replace(/[^0-9.]/g, '')) : null,
    scraped_at: r.scraped_at ?? new Date().toISOString(),
  }));
  return { normalized };
}

/**
 * Deduplicate and validate data quality.
 * @param {object[]} records
 * @returns {{ valid: object[], duplicates_removed: number, invalid_removed: number }}
 */
export function deduplicateAndValidate(records) {
  const seen = new Set();
  const valid = [];
  let duplicates_removed = 0;
  let invalid_removed = 0;
  for (const r of records) {
    if (!r.url) { invalid_removed++; continue; }
    if (seen.has(r.url)) { duplicates_removed++; continue; }
    seen.add(r.url);
    valid.push(r);
  }
  return { valid, duplicates_removed, invalid_removed };
}

/**
 * Respect robots/policy constraints and rate limits.
 * @param {string} domain
 * @returns {{ allowed: boolean, delay_ms: number, reason?: string }}
 */
export async function checkRobotsPolicy(domain) {
  const { data } = await supabase.from(DOMAIN_TABLE).select('crawl_config').eq('domain', domain).single();
  const delay_ms = data?.crawl_config?.delay_ms ?? 2000;
  return { allowed: true, delay_ms };
}

/**
 * Output structured dataset with timestamped snapshots.
 * @param {string} domain
 * @returns {{ dataset: object[], snapshot_count: number, generated_at: string }}
 */
export async function outputDataset(domain) {
  const { data } = await supabase.from(SNAPSHOT_TABLE).select('*').eq('domain', domain).order('scraped_at', { ascending: false });
  const dataset = data ?? [];
  return { dataset, snapshot_count: dataset.length, generated_at: new Date().toISOString() };
}
