/**
 * Schema Markup Generation — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const SCHEMA_TABLE = 'seo_schema_deployments';

const PAGE_TYPE_SCHEMA_MAP = {
  article: 'Article',
  product: 'Product',
  faq: 'FAQPage',
  review: 'Review',
  organization: 'Organization',
  local_business: 'LocalBusiness',
  course: 'Course',
};

export function detectPageTypeAndSchema(url, pageType) {
  const schemaClass = PAGE_TYPE_SCHEMA_MAP[pageType] ?? 'WebPage';
  return { url, page_type: pageType, schema_class: schemaClass, applicable_schemas: [schemaClass] };
}

export function buildJsonLdBlock(schemaClass, contentMeta) {
  const block = {
    '@context': 'https://schema.org',
    '@type': schemaClass,
    name: contentMeta.title ?? '',
    description: contentMeta.description ?? '',
    url: contentMeta.url ?? '',
    dateModified: new Date().toISOString(),
  };
  return { schema_class: schemaClass, json_ld: JSON.stringify(block, null, 2) };
}

export function validateSchemaProperties(schemaClass, jsonLd) {
  const required = { Article: ['headline', 'author'], Product: ['name', 'description'], FAQPage: ['mainEntity'] };
  const requiredProps = required[schemaClass] ?? [];
  const parsed = JSON.parse(jsonLd);
  const missing = requiredProps.filter(p => !parsed[p]);
  return { valid: missing.length === 0, missing_properties: missing, schema_class: schemaClass };
}

export function ensureContentConsistency(visibleContent, jsonLd) {
  const parsed = JSON.parse(jsonLd);
  const titleMatch = !parsed.name || visibleContent.includes(parsed.name);
  return { consistent: titleMatch, warnings: titleMatch ? [] : ['Schema name does not appear in visible content'] };
}

export async function injectIntoPublishPipeline(url, jsonLd) {
  const entry = { url, json_ld: jsonLd, injected_at: new Date().toISOString(), status: 'injected' };
  await supabase.from(SCHEMA_TABLE).upsert(entry, { onConflict: 'url' });
  return { url, injected: true };
}

export async function runValidationChecks(url) {
  const { data } = await supabase.from(SCHEMA_TABLE).select('*').eq('url', url).single();
  if (!data) return { url, valid: false, errors: ['No schema found'] };
  try { JSON.parse(data.json_ld); return { url, valid: true, errors: [] }; }
  catch { return { url, valid: false, errors: ['Invalid JSON'] }; }
}

export async function outputDeploymentLog() {
  const { data } = await supabase.from(SCHEMA_TABLE).select('*').order('injected_at', { ascending: false }).limit(100);
  return { deployments: data ?? [], coverage: (data ?? []).length, generated_at: new Date().toISOString() };
}
