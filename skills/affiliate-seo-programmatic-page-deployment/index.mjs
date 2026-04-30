/**
 * Programmatic Page Deployment — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PAGE_TABLE   = 'seo_programmatic_pages';
const LAUNCH_TABLE = 'seo_page_launches';

export async function defineTemplateModel(template) {
  await supabase.from(PAGE_TABLE).upsert({ template_id: template.id, ...template, defined_at: new Date().toISOString() }, { onConflict: 'template_id' });
  return { template_id: template.id, quality_threshold: template.quality_threshold ?? 0.8 };
}

export async function generatePageVariants(templateId, dataFeed) {
  const variants = dataFeed.map((row, i) => ({
    template_id: templateId,
    variant_key: row.key ?? `variant-${i}`,
    title: row.title ?? `Page ${i + 1}`,
    url_slug: row.slug ?? `page-${i + 1}`,
    generated_at: new Date().toISOString(),
    status: 'pending',
  }));
  if (variants.length) await supabase.from(PAGE_TABLE).insert(variants);
  return { generated: variants.length, variants };
}

export async function validateDuplicationRisk(templateId) {
  const { data } = await supabase.from(PAGE_TABLE).select('url_slug').eq('template_id', templateId);
  const slugs = (data ?? []).map(d => d.url_slug);
  const unique = new Set(slugs);
  const duplicates = slugs.length - unique.size;
  return { total: slugs.length, duplicates, thin_content_risk: duplicates > 0 };
}

export async function buildUrlMaps(templateId) {
  const { data } = await supabase.from(PAGE_TABLE).select('url_slug, title').eq('template_id', templateId);
  const urlMap = (data ?? []).map(p => ({ slug: p.url_slug, title: p.title, sitemap_priority: 0.6 }));
  return { url_map: urlMap, sitemap_entries: urlMap.length };
}

export async function queueStagedPublishing(templateId, batchSize = 20) {
  const { data } = await supabase.from(PAGE_TABLE).select('*').eq('template_id', templateId).eq('status', 'pending').limit(batchSize);
  if (data?.length) {
    await supabase.from(PAGE_TABLE).update({ status: 'queued' }).in('variant_key', data.map(d => d.variant_key));
  }
  return { queued: (data ?? []).length };
}

export async function verifyIndexingReadiness(templateId) {
  const { data } = await supabase.from(PAGE_TABLE).select('*').eq('template_id', templateId).eq('status', 'queued');
  const ready = (data ?? []).filter(p => p.url_slug && p.title);
  return { ready_count: ready.length, not_ready_count: (data ?? []).length - ready.length };
}

export async function outputLaunchReport(templateId) {
  const { data } = await supabase.from(PAGE_TABLE).select('*').eq('template_id', templateId);
  const report = { template_id: templateId, total_pages: (data ?? []).length, by_status: {}, generated_at: new Date().toISOString() };
  for (const p of (data ?? [])) report.by_status[p.status] = (report.by_status[p.status] ?? 0) + 1;
  return { report };
}
