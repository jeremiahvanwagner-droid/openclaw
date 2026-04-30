import { supabase } from '../../lib/agent-memory.js';

const OUTPUT_TABLE = 'copywriting_outputs';

const FRAMEWORKS = { headline: 'PAS', body: 'AIDA', cta: 'action_verb', bullets: 'benefit_led', testimonial_block: 'social_proof', guarantee: 'risk_reversal', faq: 'objection_handler' };

const CTA_VERBS = { default: 'Get', high_ticket: 'Apply', digital: 'Unlock', service: 'Schedule', urgent: 'Claim' };

function buildHeadline(offer, niche, tone, framework = 'PAS') {
  const templates = {
    PAS: `Stop Struggling With [Problem] — Here's How ${niche} Professionals Finally ${offer}`,
    AIDA: `The Proven ${niche} System That Delivers ${offer} Without The Guesswork`,
    'Before/After/Bridge': `From Stuck to ${offer}: The ${niche} Blueprint That Changes Everything`,
    'How To': `How to ${offer} Without the ${niche} Overwhelm`,
    'Social Proof Lead': `Join 2,347 ${niche} Professionals Who Already ${offer}`,
  };
  return templates[framework] ?? templates.PAS;
}

function buildHtml(sectionType, content, brandColors = {}) {
  const primary = brandColors.primary ?? '#1a1a2e';
  const accent = brandColors.accent ?? '#e94560';
  const htmlMap = {
    headline: `<h1 style="font-family:sans-serif;font-size:2.5rem;font-weight:800;color:${primary};line-height:1.2;margin:0 0 1rem">${content}</h1>`,
    subheadline: `<h2 style="font-family:sans-serif;font-size:1.5rem;font-weight:600;color:${primary};margin:0 0 1.5rem">${content}</h2>`,
    body: `<p style="font-family:sans-serif;font-size:1.1rem;line-height:1.8;color:#333;max-width:640px">${content}</p>`,
    cta: `<a href="#" style="display:inline-block;background:${accent};color:#fff;font-family:sans-serif;font-size:1.1rem;font-weight:700;padding:1rem 2.5rem;border-radius:4px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em">${content}</a>`,
    bullets: `<ul style="font-family:sans-serif;font-size:1rem;line-height:2;color:#333;padding-left:1.5rem">${(Array.isArray(content) ? content : [content]).map(b => `<li>${b}</li>`).join('')}</ul>`,
    guarantee: `<div style="border:2px solid ${accent};padding:1.5rem;border-radius:8px;background:#fffdf0;font-family:sans-serif"><strong style="color:${primary}">Our Guarantee:</strong> ${content}</div>`,
  };
  return htmlMap[sectionType] ?? `<div style="font-family:sans-serif">${content}</div>`;
}

export async function generateCopy(sectionType, offer, niche, options = {}) {
  const { tone = 'professional', painPoints = [], desiredOutcomes = [], proofPoints = [], wordLimit, brandColors, avatar } = options;
  const framework = FRAMEWORKS[sectionType] ?? 'PAS';
  let plainText = '';
  let html = '';

  if (sectionType === 'headline') {
    plainText = buildHeadline(offer, niche, tone, 'PAS').replace(/\[Problem\]/g, painPoints[0] ?? `${niche} challenges`);
    html = buildHtml('headline', plainText, brandColors);
  } else if (sectionType === 'cta') {
    const verb = tone === 'urgent' ? CTA_VERBS.urgent : CTA_VERBS.default;
    plainText = `${verb} ${offer} Now`;
    if (tone === 'urgent') plainText += ' — Limited Spots';
    html = buildHtml('cta', plainText, brandColors);
  } else if (sectionType === 'bullets') {
    const bullets = desiredOutcomes.length ? desiredOutcomes.map(o => `✓ ${o}`) : [`✓ Achieve results in ${niche}`, `✓ Skip the trial and error`, `✓ Join a proven system`];
    plainText = bullets.join('\n');
    html = buildHtml('bullets', bullets, brandColors);
  } else if (sectionType === 'guarantee') {
    plainText = `If you don't see results in 30 days, we'll refund every penny. No questions asked.`;
    html = buildHtml('guarantee', plainText, brandColors);
  } else {
    plainText = `[${sectionType.toUpperCase()} for ${offer} in ${niche}]`;
    html = buildHtml(sectionType, plainText, brandColors);
  }

  if (wordLimit) plainText = plainText.split(' ').slice(0, wordLimit).join(' ');
  const output = { section_type: sectionType, html, plain_text: plainText, word_count: plainText.split(/\s+/).length, framework_used: framework, notes: `Generated for ${niche}: ${offer}`, created_at: new Date().toISOString() };
  await supabase.from(OUTPUT_TABLE).insert(output);
  return output;
}

export async function getOutputHistory(limit = 20) {
  const { data } = await supabase.from(OUTPUT_TABLE).select('*').order('created_at', { ascending: false }).limit(limit);
  return { outputs: data ?? [], total: (data ?? []).length };
}
