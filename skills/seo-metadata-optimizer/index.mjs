import { supabase } from '../../lib/agent-memory.js';

const META_TABLE = 'seo_metadata_outputs';

const SCHEMA_TEMPLATES = {
  landing_page: (data) => ({ '@context': 'https://schema.org', '@type': 'WebPage', 'name': data.title, 'description': data.description, 'url': data.url }),
  blog_post:    (data) => ({ '@context': 'https://schema.org', '@type': 'Article', 'headline': data.title, 'description': data.description, 'url': data.url, 'datePublished': new Date().toISOString().slice(0, 10) }),
  service_page: (data) => ({ '@context': 'https://schema.org', '@type': 'LocalBusiness', 'name': data.brand, 'description': data.description, 'url': data.url }),
  course_page:  (data) => ({ '@context': 'https://schema.org', '@type': 'Course', 'name': data.title, 'description': data.description, 'url': data.url, 'provider': { '@type': 'Organization', 'name': data.brand } }),
  homepage:     (data) => ({ '@context': 'https://schema.org', '@type': 'WebSite', 'name': data.brand, 'url': data.url }),
  about:        (data) => ({ '@context': 'https://schema.org', '@type': 'AboutPage', 'name': data.title, 'url': data.url }),
};

function buildMetaTitle(keyword, brandName, pageType, geoTarget) {
  const geo = geoTarget ? ` in ${geoTarget}` : '';
  const brand = brandName ? ` | ${brandName}` : '';
  const base = pageType === 'blog_post' ? `${keyword}${geo}: Complete Guide` : pageType === 'service_page' ? `${keyword} Services${geo}` : `${keyword}${geo}`;
  const candidate = `${base}${brand}`;
  return candidate.length > 60 ? candidate.slice(0, 57) + '...' : candidate;
}

function buildMetaDescription(keyword, summary, pageType) {
  const ctas = { landing_page: 'Start today →', service_page: 'Get a free quote.', course_page: 'Enroll now.', blog_post: 'Read the full guide.', homepage: 'Learn more.', about: 'Meet the team.' };
  const cta = ctas[pageType] ?? 'Learn more.';
  const base = `${summary.slice(0, 120)} ${cta}`;
  return base.length > 160 ? base.slice(0, 157) + '...' : base;
}

export async function generateMetadata(pageUrl, pageType, primaryKeyword, contentSummary, options = {}) {
  const { secondaryKeywords = [], brandName = '', geoTarget = '', imageUrl = '', competitorTitles = [] } = options;
  const title = buildMetaTitle(primaryKeyword, brandName, pageType, geoTarget);
  const description = buildMetaDescription(primaryKeyword, contentSummary, pageType);
  const schemaData = { title, description, url: pageUrl, brand: brandName };
  const schema = (SCHEMA_TEMPLATES[pageType] ?? SCHEMA_TEMPLATES.landing_page)(schemaData);

  const result = {
    meta_title: title,
    meta_description: description,
    open_graph: { 'og:title': title, 'og:description': description, 'og:image': imageUrl || 'https://example.com/og-default.jpg', 'og:type': pageType === 'blog_post' ? 'article' : 'website', 'og:url': pageUrl },
    twitter_card: { card: 'summary_large_image', title, description },
    schema_json_ld: schema,
    html_head_block: `<title>${title}</title>\n<meta name="description" content="${description}">\n<meta property="og:title" content="${title}">\n<meta property="og:description" content="${description}">\n<meta property="og:image" content="${imageUrl || ''}">\n<meta property="og:type" content="${pageType === 'blog_post' ? 'article' : 'website'}">\n<meta name="twitter:card" content="summary_large_image">\n<script type="application/ld+json">${JSON.stringify(schema)}</script>`,
    keyword_analysis: { primary: primaryKeyword, density_recommendation: '1-2%', secondary_placements: secondaryKeywords.slice(0, 3).map(k => `Use "${k}" in H2 or body copy`) },
    created_at: new Date().toISOString(),
  };

  await supabase.from(META_TABLE).insert({ page_url: pageUrl, page_type: pageType, ...result });
  return result;
}

export async function getMetadataHistory(limit = 10) {
  const { data } = await supabase.from(META_TABLE).select('page_url, page_type, meta_title, created_at').order('created_at', { ascending: false }).limit(limit);
  return { history: data ?? [] };
}
