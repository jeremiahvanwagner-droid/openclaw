import { supabase } from '../../lib/agent-memory.js';

const ARTICLE_TABLE = 'knowledge_base_articles';

let articleCounter = 1000;

function structureContent(rawContent, sourceType) {
  const lines = rawContent.split('\n').filter(l => l.trim());
  const steps = lines.filter((_, i) => i < 10).map((l, i) => `${i + 1}. ${l.trim()}`);
  const issues = [{ issue: 'Nothing happens after completing the steps', solution: 'Refresh the page and try again. If the issue persists, contact support.' }];
  return { steps, common_issues: issues };
}

function buildHtml(title, summary, structured, relatedArticles = [], audience = 'end_user') {
  const stepsHtml = structured.steps.map(s => `<li>${s}</li>`).join('');
  const issuesHtml = structured.common_issues.map(i => `<dt><strong>${i.issue}</strong></dt><dd>${i.solution}</dd>`).join('');
  const relatedHtml = relatedArticles.map(a => `<li><a href="#">${a}</a></li>`).join('');
  return `<article><h1>${title}</h1><section class="summary"><p>${summary}</p></section><section class="steps"><h2>Step-by-Step Instructions</h2><ol>${stepsHtml}</ol></section><section class="issues"><h2>Common Issues</h2><dl>${issuesHtml}</dl></section>${relatedArticles.length ? `<section class="related"><h2>Related Articles</h2><ul>${relatedHtml}</ul></section>` : ''}<section class="support"><p>Still need help? <a href="#support">Contact support</a></p></section></article>`;
}

export async function buildArticle(sourceType, topic, content, options = {}) {
  const { category = 'General', audience = 'end_user', relatedArticles = [], tags = [], difficulty = 'beginner' } = options;
  const titleIsQuestion = /^(how|what|why|when|where|can)/i.test(topic) ? topic : `How do I ${topic}?`;
  const structured = structureContent(content, sourceType);
  const summary = content.split('.')[0].trim().slice(0, 200) + '.';
  const html = buildHtml(titleIsQuestion, summary, structured, relatedArticles, audience);
  const plain = `${titleIsQuestion}\n\n${summary}\n\n${structured.steps.join('\n')}\n\nCommon Issues:\n${structured.common_issues.map(i => `- ${i.issue}: ${i.solution}`).join('\n')}`;
  const wordCount = plain.split(/\s+/).length;
  const articleId = `kb-${++articleCounter}`;
  const article = {
    article_id: articleId, title: titleIsQuestion, category, difficulty, summary,
    html_content: html, plain_text: plain, word_count: wordCount,
    search_tags: [...tags, topic.toLowerCase().replace(/\s+/g, '_'), sourceType],
    related_articles: relatedArticles,
    metadata: { source_type: sourceType, created_at: new Date().toISOString(), reading_time: `${Math.max(1, Math.round(wordCount / 200))} min`, audience },
  };
  await supabase.from(ARTICLE_TABLE).insert(article);
  return article;
}

export async function searchArticles(query, limit = 10) {
  const { data } = await supabase.from(ARTICLE_TABLE).select('article_id, title, category, summary').ilike('title', `%${query}%`).limit(limit);
  return { results: data ?? [], total: (data ?? []).length };
}

export async function getArticle(articleId) {
  const { data } = await supabase.from(ARTICLE_TABLE).select('*').eq('article_id', articleId).single();
  return data ?? null;
}
