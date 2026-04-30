/**
 * Dynamic Link Injection — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const ANCHOR_TABLE  = 'seo_affiliate_anchors';
const LINK_TABLE    = 'seo_injected_links';
const REPORT_TABLE  = 'seo_link_performance';

export async function parseContentForAnchors(content, url) {
  const segments = content.split(/[.!?]\s+/).filter(s => s.length > 20);
  return { url, monetizable_segments: segments.length, content_length: content.length };
}

export async function matchAnchorsToOffers(segments, offerCatalog) {
  const matches = segments.map((seg, i) => ({
    segment_index: i,
    segment_preview: seg.slice(0, 60),
    matched_offer: offerCatalog[i % offerCatalog.length] ?? null,
  })).filter(m => m.matched_offer);
  return { matches };
}

export async function applyPlacementRules(matches, url) {
  const MAX_DENSITY = 3;
  const limited = matches.slice(0, MAX_DENSITY);
  return { placements: limited, density: limited.length, url };
}

export async function insertLinksWithTracking(placements, url) {
  const links = placements.map(p => ({
    url,
    anchor_text: p.segment_preview,
    offer_id: p.matched_offer?.id,
    tracking_param: `?ref=openclaw&offer=${p.matched_offer?.id}`,
    injected_at: new Date().toISOString(),
  }));
  if (links.length) await supabase.from(LINK_TABLE).insert(links);
  return { injected: links.length, links };
}

export async function validateLinks(url) {
  const { data } = await supabase.from(LINK_TABLE).select('*').eq('url', url);
  const broken = (data ?? []).filter(l => !l.tracking_param);
  return { url, total_links: (data ?? []).length, broken_count: broken.length, valid: broken.length === 0 };
}

export async function abTestAnchors(linkIds) {
  const variants = linkIds.map(id => ({ link_id: id, variant: 'A', test_started_at: new Date().toISOString() }));
  return { test_variants: variants };
}

export async function outputLinkPerformanceReport(url) {
  const { data } = await supabase.from(LINK_TABLE).select('*').eq('url', url);
  return { url, links: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
