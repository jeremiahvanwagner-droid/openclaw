/**
 * Content Atomization — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const CONTENT_TABLE  = 'brand_atomized_content';
const CALENDAR_TABLE = 'brand_posting_calendar';

const CHANNEL_FORMATS = {
  twitter: { max_chars: 280, format: 'short_text' },
  linkedin: { max_chars: 3000, format: 'long_text' },
  instagram: { max_chars: 2200, format: 'visual_caption' },
  tiktok: { max_chars: 150, format: 'hook_caption' },
  email: { max_chars: 5000, format: 'newsletter_section' },
  youtube: { max_chars: 5000, format: 'description' },
};

export async function ingestSourceContent(contentId, content, contentType) {
  const words = content.split(/\s+/);
  const ideas = [];
  for (let i = 0; i < words.length; i += 100) ideas.push(words.slice(i, i + 100).join(' '));
  await supabase.from(CONTENT_TABLE).upsert({ content_id: contentId, source: content.slice(0, 500), content_type: contentType, core_ideas: ideas.length, ingested_at: new Date().toISOString() }, { onConflict: 'content_id' });
  return { content_id: contentId, ideas_found: ideas.length };
}

export function segmentIntoMicroUnits(content) {
  const paragraphs = content.split(/\n{2,}/).filter(p => p.trim().length > 30);
  return paragraphs.map((p, i) => ({ unit_id: i + 1, text: p.trim(), type: i === 0 ? 'hook' : i === paragraphs.length - 1 ? 'cta' : 'value' }));
}

export function mapUnitsToChannels(units) {
  return units.map(unit => ({
    ...unit,
    channels: unit.type === 'hook' ? ['twitter', 'tiktok'] : unit.type === 'cta' ? ['email', 'instagram'] : ['linkedin', 'twitter'],
  }));
}

export function generatePlatformVariants(unit, channels) {
  return channels.map(channel => {
    const config = CHANNEL_FORMATS[channel] ?? { max_chars: 280 };
    return { channel, unit_id: unit.unit_id, variant: unit.text.slice(0, config.max_chars - 20), format: config.format };
  });
}

export function addHooksAndCTAs(variants) {
  return variants.map(v => ({
    ...v,
    hook: v.channel === 'tiktok' || v.channel === 'twitter' ? '🔑 ' + v.variant.slice(0, 30) : null,
    cta: '→ Link in bio',
  }));
}

export function sequencePublicationTiming(variants, startDate = new Date()) {
  return variants.map((v, i) => ({
    ...v,
    scheduled_date: new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  }));
}

export async function outputRepurposingKit(contentId, variants) {
  const rows = variants.map(v => ({ content_id: contentId, ...v, created_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(CALENDAR_TABLE).insert(rows);
  return { content_id: contentId, total_variants: variants.length, channels: [...new Set(variants.map(v => v.channel))] };
}
