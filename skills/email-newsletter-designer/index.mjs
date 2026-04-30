import { supabase } from '../../lib/agent-memory.js';

const CAMPAIGN_TABLE = 'email_newsletter_campaigns';

const SUBJECT_VARIANTS = { newsletter: ['[Brand] Weekly: {headline}', 'This week in {topic}: {hook}', '{number} things you should know this week'], broadcast: ['[Action Required] {headline}', 'Heads up: {headline}', '{headline} — read this'], drip: ['Day {n}: {headline}', 'Your {step} resource is ready', 'Next up: {headline}'] };

function buildSubjectLines(campaignType, brand, contentBlocks, count = 3) {
  const heroBlock = contentBlocks.find(b => b.type === 'hero') ?? contentBlocks[0] ?? {};
  const headline = heroBlock.headline ?? `News from ${brand.name}`;
  return (SUBJECT_VARIANTS[campaignType] ?? SUBJECT_VARIANTS.newsletter).slice(0, count).map(t => t.replace('{headline}', headline.slice(0, 40)).replace('{brand}', brand.name).replace('{topic}', 'your industry').replace('{hook}', headline.slice(0, 30)).replace('{n}', '1').replace('{step}', 'first').replace('{number}', '3'));
}

function renderBlock(block, brand) {
  const p = brand.primary_color ?? '#1a1a2e';
  if (block.type === 'hero') return `<tr><td align="center" style="padding:40px 20px;background:${p}"><h1 style="color:#fff;font-family:Arial,sans-serif;font-size:28px;margin:0 0 12px">${block.headline ?? ''}</h1><p style="color:#eee;font-family:Arial,sans-serif;font-size:16px;margin:0 0 24px">${block.subheadline ?? ''}</p><a href="${block.cta_url ?? '#'}" style="display:inline-block;background:#fff;color:${p};font-family:Arial,sans-serif;font-size:15px;font-weight:700;padding:12px 30px;border-radius:4px;text-decoration:none">${block.cta_text ?? 'Learn More'}</a></td></tr>`;
  if (block.type === 'article') return `<tr><td style="padding:30px 24px;border-bottom:1px solid #eee"><h2 style="font-family:Arial,sans-serif;font-size:20px;color:#1a1a2e;margin:0 0 10px">${block.title ?? ''}</h2><p style="font-family:Arial,sans-serif;font-size:15px;color:#555;line-height:1.6;margin:0 0 15px">${block.body ?? ''}</p><a href="${block.read_more_url ?? '#'}" style="color:${p};font-family:Arial,sans-serif;font-size:14px">Read more →</a></td></tr>`;
  if (block.type === 'cta_button') return `<tr><td align="center" style="padding:30px 20px"><a href="${block.url ?? '#'}" style="display:inline-block;background:${block.color ?? p};color:#fff;font-family:Arial,sans-serif;font-size:16px;font-weight:700;padding:14px 36px;border-radius:4px;text-decoration:none">${block.text ?? 'Click Here'}</a></td></tr>`;
  if (block.type === 'testimonial') return `<tr><td style="padding:30px 24px;background:#f9f9f9"><blockquote style="font-family:Georgia,serif;font-size:17px;color:#333;font-style:italic;margin:0 0 12px">"${block.quote ?? ''}"</blockquote><p style="font-family:Arial,sans-serif;font-size:14px;color:#777;margin:0">— ${block.author ?? ''}, ${block.company ?? ''}</p></td></tr>`;
  if (block.type === 'footer') return `<tr><td align="center" style="padding:24px 20px;background:#f5f5f5"><p style="font-family:Arial,sans-serif;font-size:12px;color:#999;margin:0 0 8px">${block.company ?? brand.name} | ${block.address ?? '123 Main St, City, ST 00000'}</p><a href="${block.unsubscribe_url ?? '#'}" style="font-family:Arial,sans-serif;font-size:12px;color:#999">Unsubscribe</a></td></tr>`;
  return `<tr><td style="padding:20px 24px"><p style="font-family:Arial,sans-serif;font-size:15px;color:#555">[${block.type} block]</p></td></tr>`;
}

function buildHtml(brand, contentBlocks) {
  const rows = contentBlocks.map(b => renderBlock(b, brand)).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5"><tr><td align="center" style="padding:20px"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;max-width:600px">${rows}</table></td></tr></table></body></html>`;
}

function buildPlainText(contentBlocks) {
  return contentBlocks.map(b => {
    if (b.type === 'hero') return `${b.headline ?? ''}\n${b.subheadline ?? ''}\n${b.cta_url ?? ''}`;
    if (b.type === 'article') return `${b.title ?? ''}\n${b.body ?? ''}\nRead more: ${b.read_more_url ?? ''}`;
    if (b.type === 'cta_button') return `${b.text ?? ''}: ${b.url ?? ''}`;
    return '';
  }).filter(Boolean).join('\n\n');
}

export async function designNewsletter(campaignType, brand, contentBlocks, options = {}) {
  const { subjectLineCount = 3, previewText, tone = 'professional', audienceSegment } = options;
  const hasFooter = contentBlocks.some(b => b.type === 'footer');
  if (!hasFooter) contentBlocks.push({ type: 'footer', company: brand.name, address: brand.address ?? '123 Main St, City, ST 00000', unsubscribe_url: brand.website ? `${brand.website}/unsubscribe` : '#unsubscribe' });
  const subjectLines = buildSubjectLines(campaignType, brand, contentBlocks, subjectLineCount);
  const html = buildHtml(brand, contentBlocks);
  const plainText = buildPlainText(contentBlocks);
  const wordCount = plainText.split(/\s+/).length;
  const result = { campaign_type: campaignType, subject_lines: subjectLines, preview_text: previewText ?? subjectLines[0].slice(0, 90), html, plain_text: plainText, content_blocks_used: contentBlocks.length, estimated_read_time: `${Math.max(1, Math.round(wordCount / 200))} min`, compliance: { has_unsubscribe: true, has_address: true }, created_at: new Date().toISOString() };
  await supabase.from(CAMPAIGN_TABLE).insert({ brand_name: brand.name, campaign_type: campaignType, subject_lines: subjectLines, compliance: result.compliance, created_at: result.created_at });
  return result;
}
