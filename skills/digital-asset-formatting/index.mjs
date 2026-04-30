import { supabase } from '../../lib/agent-memory.js';

const ASSET_TABLE   = 'digital_assets';
const BUNDLE_TABLE  = 'digital_asset_bundles';

const FORMAT_TEMPLATES = {
  guide:    { sections: ['Overview', 'Step-by-step Instructions', 'Examples', 'Common Mistakes', 'Next Steps'] },
  checklist:{ sections: ['Pre-flight', 'Core Steps', 'Quality Check', 'Sign-off'] },
  template: { sections: ['Instructions', 'Fill-in Sections', 'Examples', 'Notes'] },
  lesson:   { sections: ['Learning Objective', 'Context', 'Main Teaching', 'Practice Exercise', 'Summary'] },
};

export async function ingestSourceMaterial(bundleId, rawMaterials) {
  const classified = rawMaterials.map(m => ({ bundle_id: bundleId, title: m.title ?? 'Untitled', type: m.type ?? 'raw', content_preview: (m.content ?? '').slice(0, 300), word_count: (m.content ?? '').split(/\s+/).length, ingested_at: new Date().toISOString() }));
  if (classified.length) await supabase.from(ASSET_TABLE).insert(classified);
  return { bundle_id: bundleId, ingested: classified.length };
}

export function selectOutputFormats(productType) {
  const formatMap = { course: ['lesson', 'guide', 'checklist'], ebook: ['guide'], template_pack: ['template', 'checklist'], toolkit: ['guide', 'template', 'checklist'] };
  return formatMap[productType] ?? ['guide'];
}

export function transformContent(content, format) {
  const template = FORMAT_TEMPLATES[format] ?? FORMAT_TEMPLATES.guide;
  return { format, sections: template.sections.map(s => ({ section: s, content: `[${s} content from source material]` })) };
}

export function applyFormattingRules(asset, brandVoice = 'professional') {
  const voiceRules = { professional: { short_paragraphs: true, bold_headers: true }, casual: { conversational_tone: true, short_paragraphs: true } };
  return { ...asset, formatting_applied: voiceRules[brandVoice] ?? voiceRules.professional, version: '1.0', branded: true };
}

export async function validateCompleteness(bundleId, requiredFormats) {
  const { data } = await supabase.from(ASSET_TABLE).select('type').eq('bundle_id', bundleId);
  const present = new Set((data ?? []).map(a => a.type));
  const missing = requiredFormats.filter(f => !present.has(f));
  const invalid_links = [];
  return { bundle_id: bundleId, valid: missing.length === 0, missing_formats: missing, invalid_links };
}

export async function packageBundle(bundleId, assets, version = '1.0') {
  const bundle = { bundle_id: bundleId, assets: assets.length, version, status: 'ready', packaged_at: new Date().toISOString() };
  await supabase.from(BUNDLE_TABLE).upsert(bundle, { onConflict: 'bundle_id' });
  return bundle;
}

export async function outputBundleChecklist(bundleId) {
  const { data: bundle } = await supabase.from(BUNDLE_TABLE).select('*').eq('bundle_id', bundleId).single();
  const { data: assets } = await supabase.from(ASSET_TABLE).select('title, type').eq('bundle_id', bundleId);
  const missing = [];
  return { bundle_id: bundleId, status: bundle?.status ?? 'unknown', asset_count: (assets ?? []).length, assets: assets ?? [], missing_items: missing, generated_at: new Date().toISOString() };
}
