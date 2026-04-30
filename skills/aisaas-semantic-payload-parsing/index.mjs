/**
 * Semantic Payload Parsing — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const SCHEMA_TABLE = 'aisaas_payload_schemas';
const PARSE_TABLE  = 'aisaas_parse_results';

export async function defineOutputSchema(schemaId, schema) {
  await supabase.from(SCHEMA_TABLE).upsert({ schema_id: schemaId, schema, created_at: new Date().toISOString() }, { onConflict: 'schema_id' });
  return { schema_id: schemaId, fields: Object.keys(schema.properties ?? schema) };
}

export function parseModelOutput(rawOutput, schema) {
  let parsed = {};
  try {
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch {
    const lines = rawOutput.split('\n');
    for (const line of lines) {
      const m = line.match(/^(\w+):\s*(.+)$/);
      if (m && schema[m[1]]) parsed[m[1]] = m[2].trim();
    }
  }
  return { parsed, fields_found: Object.keys(parsed).length };
}

export function validateParsedPayload(parsed, schema) {
  const required = schema.required ?? [];
  const missing = required.filter(r => parsed[r] === undefined || parsed[r] === null);
  const invalid = Object.entries(parsed).filter(([k, v]) => {
    const def = schema.properties?.[k] ?? schema[k];
    if (!def) return false;
    if (def.type === 'number' && typeof v !== 'number') return true;
    if (def.enum && !def.enum.includes(v)) return true;
    return false;
  });
  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid: invalid.map(([k]) => k) };
}

export async function repairOrReprompt(parsed, schema, validation) {
  if (validation.valid) return { repaired: false, parsed };
  const repaired = { ...parsed };
  for (const field of validation.missing) {
    const def = schema.properties?.[field] ?? schema[field];
    if (def?.default !== undefined) repaired[field] = def.default;
  }
  return { repaired: true, parsed: repaired, still_invalid: validation.invalid };
}

export function normalizePayload(parsed) {
  const normalized = {};
  for (const [k, v] of Object.entries(parsed)) {
    normalized[k.toLowerCase().replace(/[^a-z0-9_]/g, '_')] = v;
  }
  return { normalized };
}

export async function emitParseResult(requestId, result) {
  await supabase.from(PARSE_TABLE).insert({ request_id: requestId, ...result, emitted_at: new Date().toISOString() });
  return { emitted: true };
}

export async function outputStructuredResponse(requestId) {
  const { data } = await supabase.from(PARSE_TABLE).select('*').eq('request_id', requestId).single();
  return { request_id: requestId, result: data, generated_at: new Date().toISOString() };
}
