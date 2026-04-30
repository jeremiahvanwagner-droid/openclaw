/**
 * Newsletter Template Population — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const NEWSLETTER_TABLE = 'brand_newsletters';

export async function gatherWeeklyHighlights(creatorId) {
  const { data } = await supabase.from('brand_weekly_highlights').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(10);
  return { creator_id: creatorId, highlights: data ?? [] };
}

export function mapContentBlocks(highlights, template) {
  const sections = template.sections ?? ['hero', 'insights', 'cta', 'footer'];
  return sections.map((section, i) => ({
    section,
    content: highlights[i]?.content ?? `[Default ${section} content]`,
    highlight_id: highlights[i]?.id,
  }));
}

export function draftNewsletterVariants(contentBlocks, brand) {
  const primary = {
    variant: 'primary',
    subject_line: `This week: ${contentBlocks[0]?.content?.slice(0, 40)}...`,
    preview_text: contentBlocks[1]?.content?.slice(0, 90) ?? 'Read our latest insights inside.',
    body: contentBlocks.map(b => `## ${b.section}\n${b.content}`).join('\n\n'),
  };
  const short = {
    variant: 'short',
    subject_line: primary.subject_line,
    preview_text: primary.preview_text,
    body: contentBlocks.slice(0, 2).map(b => b.content).join('\n\n'),
  };
  return { primary, short };
}

export function insertCTAs(variants, ctaUrl) {
  for (const [, v] of Object.entries(variants)) {
    v.body += `\n\n[${ctaUrl ? '→ Click here' : 'Read more'}](${ctaUrl ?? '#'})`;
  }
  return variants;
}

export async function validateVoiceAndCompliance(variants, voiceProfile) {
  const issues = [];
  for (const [k, v] of Object.entries(variants)) {
    if (v.body.length < 100) issues.push(`${k} variant is too short`);
    if (/guaranteed|risk.?free/i.test(v.body)) issues.push(`${k} contains prohibited claims`);
  }
  return { valid: issues.length === 0, issues };
}

export function prepareSubjectLineOptions(topic, count = 3) {
  const templates = [`This week in ${topic}: what you need to know`, `Your ${topic} update is ready`, `${topic} insights: don't miss this`];
  return templates.slice(0, count);
}

export async function outputNewsletter(creatorId, variants) {
  await supabase.from(NEWSLETTER_TABLE).insert({ creator_id: creatorId, ...variants, generated_at: new Date().toISOString() });
  return { creator_id: creatorId, variants: Object.keys(variants), generated_at: new Date().toISOString() };
}
