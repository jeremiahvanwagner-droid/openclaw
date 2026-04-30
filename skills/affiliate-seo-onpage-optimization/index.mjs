/**
 * On-page SEO Optimization — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const AUDIT_TABLE = 'seo_onpage_audits';

export async function auditOnPageElements(url, elements) {
  const audit = {
    url,
    title_length: elements.title?.length ?? 0,
    title_ok: (elements.title?.length ?? 0) >= 30 && (elements.title?.length ?? 0) <= 60,
    h1_count: elements.h1_count ?? 0,
    meta_desc_length: elements.meta_description?.length ?? 0,
    audited_at: new Date().toISOString(),
  };
  await supabase.from(AUDIT_TABLE).upsert(audit, { onConflict: 'url' });
  return { url, audit };
}

export function improveSemanticCoverage(content, targetKeywords) {
  const missing = targetKeywords.filter(kw => !content.toLowerCase().includes(kw.toLowerCase()));
  return { missing_keywords: missing, recommendations: missing.map(kw => `Add "${kw}" naturally in a relevant section.`) };
}

export function optimizeInternalLinks(links) {
  const optimized = links.map(l => ({
    ...l,
    anchor_quality: l.anchor_text?.length > 3 && l.anchor_text?.length < 50 ? 'good' : 'needs_work',
  }));
  return { optimized };
}

export function validateMediaAndAltText(mediaItems) {
  const issues = mediaItems.filter(m => !m.alt_text || m.alt_text.length < 5);
  return { total: mediaItems.length, missing_alt: issues.length, issues: issues.map(m => m.src) };
}

export function removeOverOptimization(content, keyword) {
  const occurrences = (content.match(new RegExp(keyword, 'gi')) ?? []).length;
  const word_count = content.split(/\s+/).length;
  const density = occurrences / word_count;
  return { keyword, occurrences, density, over_optimized: density > 0.03 };
}

export function alignCallsToAction(ctaElements, intentStage) {
  const aligned = ctaElements.map(cta => ({ ...cta, intent_aligned: cta.intent_stage === intentStage }));
  return { aligned, misaligned: aligned.filter(c => !c.intent_aligned).length };
}

export async function outputOptimizationChecklist(url) {
  const { data } = await supabase.from(AUDIT_TABLE).select('*').eq('url', url).single();
  return { url, checklist: data ?? {}, generated_at: new Date().toISOString() };
}
