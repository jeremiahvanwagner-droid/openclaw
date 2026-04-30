import { supabase } from '../../lib/agent-memory.js';

const DESCRIPTION_TABLE = 'ecommerce_product_descriptions';

export async function collectSkuData(sku, specs, useCases, brandVoice = 'professional') {
  return { sku, specs, use_cases: useCases, brand_voice: brandVoice };
}

export function buildKeywordIntentSet(specs, useCases, targetAudience) {
  const primary = useCases.slice(0, 3);
  const modifiers = ['best', 'buy', 'review', 'for'];
  const longtail = primary.flatMap(uc => modifiers.map(m => `${m} ${uc}`));
  return { primary_keywords: primary, longtail_keywords: longtail.slice(0, 10) };
}

export function draftBenefitLedCopy(skuData, keywords) {
  const { specs = {}, use_cases = [] } = skuData;
  const headline = `${use_cases[0] ?? 'The best solution'} — ${Object.values(specs)[0] ?? 'premium quality'}`;
  const paragraphs = [
    `Designed for ${use_cases[0] ?? 'everyday use'}, this product delivers ${use_cases[1] ?? 'outstanding results'} with ${Object.keys(specs)[0] ?? 'quality construction'} that lasts.`,
    `Whether you need ${use_cases[0] ?? 'reliable performance'} or ${use_cases[1] ?? 'ease of use'}, the ${Object.values(specs)[0] ?? 'superior design'} ensures you get the most out of every use.`,
  ];
  const bullets = Object.entries(specs).slice(0, 5).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
  return { headline, paragraphs, bullets };
}

export function generateMetadata(sku, copy, keywords) {
  const title = `${copy.headline.slice(0, 60)} | ${sku}`;
  const metaDescription = `${copy.paragraphs[0].slice(0, 155)}...`;
  const altText = `${sku} product image — ${keywords.primary_keywords[0] ?? 'product'}`;
  return { title, meta_description: metaDescription, alt_text: altText };
}

export function validateClaims(copy) {
  const issues = [];
  if (/best in the world|#1|guaranteed to|fastest ever/i.test(JSON.stringify(copy))) issues.push('Superlative claim requires substantiation');
  if (/cure|treat|diagnose|prevent disease/i.test(JSON.stringify(copy))) issues.push('Medical claim — add FDA disclaimer');
  const wordCount = copy.paragraphs.join(' ').split(/\s+/).length;
  const readabilityOk = wordCount < 300 && copy.bullets.length >= 3;
  return { valid: issues.length === 0, issues, readability_ok: readabilityOk };
}

export function generateVariantCopy(copy, locale) {
  const localeModifiers = { en_gb: 'colour', en_au: 'colour', fr_ca: '[FR-CA translation required]' };
  return { locale, adapted_copy: { ...copy, note: `Adapt spelling for ${locale}: ${localeModifiers[locale] ?? 'standard'}` } };
}

export async function outputDescriptionPackage(sku, skuData, options = {}) {
  const keywords = buildKeywordIntentSet(skuData.specs ?? {}, skuData.use_cases ?? [], options.targetAudience ?? 'general');
  const copy = draftBenefitLedCopy(skuData, keywords);
  const metadata = generateMetadata(sku, copy, keywords);
  const validation = validateClaims(copy);
  const pkg = { sku, copy, metadata, keywords, validation, seo_notes: `Target: ${keywords.primary_keywords[0]} (primary), ${keywords.longtail_keywords.slice(0, 3).join(', ')} (longtail)`, created_at: new Date().toISOString() };
  await supabase.from(DESCRIPTION_TABLE).upsert(pkg, { onConflict: 'sku' });
  return pkg;
}
