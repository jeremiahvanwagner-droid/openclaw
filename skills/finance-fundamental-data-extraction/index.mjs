import { supabase } from '../../lib/agent-memory.js';

const FILING_TABLE  = 'finance_filings';
const FEATURE_TABLE = 'finance_fundamental_features';

const FINANCIAL_FIELDS = ['revenue', 'net_income', 'ebitda', 'eps', 'total_assets', 'total_debt', 'cash', 'shares_outstanding', 'pe_ratio', 'price_to_book'];

export async function detectNewFilings(ticker, sources = ['sec_edgar', 'company_ir']) {
  const { data } = await supabase.from(FILING_TABLE).select('filing_id').eq('ticker', ticker).order('published_at', { ascending: false }).limit(1);
  return { ticker, latest_known_filing: (data ?? [])[0]?.filing_id ?? null, sources_checked: sources };
}

export function parseDocument(rawDocument) {
  const extracted = {};
  for (const field of FINANCIAL_FIELDS) {
    const pattern = new RegExp(`${field.replace(/_/g, '[\\s_-]')}[:\\s]+\\$?([0-9,.-]+)`, 'i');
    const match = rawDocument.match(pattern);
    if (match) extracted[field] = parseFloat(match[1].replace(/,/g, ''));
  }
  return { extracted_fields: extracted, field_count: Object.keys(extracted).length };
}

export function validateExtraction(extracted, schema) {
  const issues = [];
  for (const [field, value] of Object.entries(extracted)) {
    if (isNaN(value)) issues.push(`${field}: non-numeric value`);
    if (schema[field]?.min && value < schema[field].min) issues.push(`${field}: below minimum (${schema[field].min})`);
  }
  return { valid: issues.length === 0, issues };
}

export async function reconcileRevisions(ticker, period, newData) {
  const { data: prior } = await supabase.from(FEATURE_TABLE).select('*').eq('ticker', ticker).eq('period', period).single();
  const revisions = prior ? Object.keys(newData).filter(k => prior[k] !== undefined && Math.abs((newData[k] - prior[k]) / (prior[k] || 1)) > 0.05) : [];
  return { ticker, period, revisions, prior_version: prior?.source_version ?? null };
}

export function computeDerivedFeatures(extracted) {
  const features = { ...extracted };
  if (extracted.revenue && extracted.net_income) features.profit_margin = Math.round((extracted.net_income / extracted.revenue) * 10000) / 100;
  if (extracted.total_debt && extracted.ebitda) features.debt_to_ebitda = Math.round((extracted.total_debt / extracted.ebitda) * 100) / 100;
  if (extracted.cash && extracted.total_assets) features.cash_ratio = Math.round((extracted.cash / extracted.total_assets) * 10000) / 100;
  return features;
}

export async function publishFeatures(ticker, period, features, sourceVersion) {
  await supabase.from(FEATURE_TABLE).upsert({ ticker, period, ...features, source_version: sourceVersion, published_at: new Date().toISOString() }, { onConflict: 'ticker,period' });
  return { ticker, period, features_published: Object.keys(features).length };
}

export async function outputExtractionReport(ticker) {
  const { data } = await supabase.from(FEATURE_TABLE).select('period, field_count, published_at').eq('ticker', ticker).order('published_at', { ascending: false }).limit(10);
  return { ticker, extractions: data ?? [], total_periods: (data ?? []).length, generated_at: new Date().toISOString() };
}
