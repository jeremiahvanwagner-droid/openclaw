/**
 * Semantic Keyword Clustering — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const KEYWORD_TABLE = 'seo_keyword_corpus';
const CLUSTER_TABLE = 'seo_keyword_clusters';
const ARCH_TABLE    = 'seo_site_architecture';

export async function ingestKeywordCorpus(keywords) {
  const rows = keywords.map(k => ({
    keyword: k.keyword, volume: k.volume ?? 0, intent: k.intent ?? 'informational',
    difficulty: k.difficulty ?? 50, ingested_at: new Date().toISOString(),
  }));
  await supabase.from(KEYWORD_TABLE).upsert(rows, { onConflict: 'keyword' });
  return { ingested: rows.length };
}

export async function generateSemanticClusters(corpusId) {
  const { data } = await supabase.from(KEYWORD_TABLE).select('*');
  const byIntent = {};
  for (const kw of (data ?? [])) {
    const key = kw.intent;
    if (!byIntent[key]) byIntent[key] = { intent: key, keywords: [], total_volume: 0 };
    byIntent[key].keywords.push(kw.keyword);
    byIntent[key].total_volume += kw.volume ?? 0;
  }
  const clusters = Object.values(byIntent);
  if (clusters.length) await supabase.from(CLUSTER_TABLE).insert(clusters.map(c => ({ ...c, created_at: new Date().toISOString() })));
  return { clusters, cluster_count: clusters.length };
}

export function mapClustersToHierarchy(clusters) {
  const pillars = clusters.filter(c => c.total_volume > 1000);
  const supporting = clusters.filter(c => c.total_volume <= 1000);
  return { pillar_pages: pillars.length, supporting_articles: supporting.length, hierarchy: { pillars, supporting } };
}

export function detectCannibalization(clusters) {
  const seen = new Map();
  const risks = [];
  for (const cluster of clusters) {
    for (const kw of cluster.keywords ?? []) {
      if (seen.has(kw)) risks.push({ keyword: kw, clusters: [seen.get(kw), cluster.intent] });
      else seen.set(kw, cluster.intent);
    }
  }
  return { cannibalization_risks: risks, count: risks.length };
}

export function recommendUrlStructure(clusters) {
  const structure = clusters.map(c => ({
    cluster: c.intent,
    suggested_url: `/topics/${c.intent.replace(/\s+/g, '-').toLowerCase()}/`,
    internal_links: c.keywords?.slice(0, 3).map(kw => `/${kw.replace(/\s+/g, '-').toLowerCase()}/`) ?? [],
  }));
  return { url_structure: structure };
}

export async function outputArchitectureBlueprint() {
  const { data: clusters } = await supabase.from(CLUSTER_TABLE).select('*');
  const blueprint = { clusters: data ?? clusters ?? [], total_clusters: (clusters ?? []).length, generated_at: new Date().toISOString() };
  await supabase.from(ARCH_TABLE).insert(blueprint);
  return { blueprint };
}
