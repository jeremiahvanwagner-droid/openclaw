import { supabase } from '../../lib/agent-memory.js';

const TAG_TABLE     = 'community_content_tags';
const CONTENT_TABLE = 'community_content_index';

const TAXONOMY = {
  questions:    /\?|how to|help with|does anyone|what is/i,
  wins:         /win|achievement|success|milestone|closed|landed|got/i,
  resources:    /resource|tool|template|checklist|guide|pdf/i,
  feedback:     /feedback|thoughts|opinion|review|rate/i,
  introductions:/introduce|new here|first post|hi everyone|hello/i,
};

export async function parseContent(contentId, text, attachments = []) {
  const signals = { has_links: /https?:\/\//.test(text), word_count: text.split(/\s+/).length, has_attachments: attachments.length > 0 };
  return { content_id: contentId, text_preview: text.slice(0, 200), signals };
}

export async function applyTaxonomy(contentId, text) {
  const labels = Object.entries(TAXONOMY).filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const primaryLabel = labels[0] ?? 'general';
  const confidence = labels.length > 0 ? 0.85 : 0.4;
  const needsReview = confidence < 0.6;
  const tag = { content_id: contentId, labels, primary_label: primaryLabel, confidence, needs_review: needsReview, tagged_at: new Date().toISOString() };
  await supabase.from(TAG_TABLE).upsert(tag, { onConflict: 'content_id' });
  return tag;
}

export async function resolveConflicts(contentId) {
  const { data } = await supabase.from(TAG_TABLE).select('labels').eq('content_id', contentId).single();
  const labels = data?.labels ?? [];
  const deduplicated = [...new Set(labels)];
  return { content_id: contentId, resolved_labels: deduplicated, conflicts_resolved: labels.length - deduplicated.length };
}

export async function updateSearchIndex(contentId, tags) {
  await supabase.from(CONTENT_TABLE).upsert({ content_id: contentId, search_labels: tags.labels, primary_label: tags.primary_label, indexed_at: new Date().toISOString() }, { onConflict: 'content_id' });
  return { indexed: true, content_id: contentId };
}

export async function retagStaleContent(cutoffDays = 90) {
  const cutoff = new Date(Date.now() - cutoffDays * 86400000).toISOString();
  const { data } = await supabase.from(TAG_TABLE).select('content_id').lt('tagged_at', cutoff);
  return { stale_count: (data ?? []).length, requeue_ids: (data ?? []).map(d => d.content_id) };
}

export async function outputIndexingHealth() {
  const { data: tags } = await supabase.from(TAG_TABLE).select('primary_label, needs_review');
  const rows = tags ?? [];
  const labelCounts = rows.reduce((acc, r) => { acc[r.primary_label] = (acc[r.primary_label] ?? 0) + 1; return acc; }, {});
  return { total_tagged: rows.length, needs_review: rows.filter(r => r.needs_review).length, label_distribution: labelCounts, generated_at: new Date().toISOString() };
}
