import { supabase } from '../../lib/agent-memory.js';

const MAPPING_TABLE = 'education_competency_mappings';
const AUDIT_TABLE   = 'education_mapping_audit';

export async function importFramework(frameworkId, definitions) {
  const rows = definitions.map(d => ({ framework_id: frameworkId, competency_id: d.id, statement: d.statement, version: d.version ?? '1.0', level: d.level ?? 'standard', imported_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(MAPPING_TABLE).upsert(rows, { onConflict: 'framework_id,competency_id' });
  return { framework_id: frameworkId, competencies_imported: rows.length };
}

export async function mapContentToCompetencies(curriculumId, contentItems) {
  const mappings = contentItems.map(item => ({ curriculum_id: curriculumId, content_id: item.id, content_type: item.type, mapped_competencies: item.competencies ?? [], confidence: item.competencies?.length > 0 ? 0.9 : 0.4, mapped_at: new Date().toISOString() }));
  if (mappings.length) await supabase.from(MAPPING_TABLE).insert(mappings);
  return { curriculum_id: curriculumId, items_mapped: mappings.length };
}

export async function detectCoverageGaps(curriculumId, frameworkId) {
  const { data: framework } = await supabase.from(MAPPING_TABLE).select('competency_id').eq('framework_id', frameworkId);
  const { data: curriculum } = await supabase.from(MAPPING_TABLE).select('mapped_competencies').eq('curriculum_id', curriculumId);
  const required = new Set((framework ?? []).map(r => r.competency_id));
  const covered = new Set((curriculum ?? []).flatMap(r => r.mapped_competencies ?? []));
  const gaps = [...required].filter(c => !covered.has(c));
  const overIndexed = [...covered].filter(c => !required.has(c));
  return { gaps, over_indexed: overIndexed, coverage_pct: required.size > 0 ? Math.round((required.size - gaps.length) / required.size * 100) : 0 };
}

export async function flagMisalignedContent(curriculumId) {
  const { data } = await supabase.from(MAPPING_TABLE).select('content_id, confidence').eq('curriculum_id', curriculumId).lt('confidence', 0.6);
  return { misaligned_content: (data ?? []).map(r => r.content_id), total: (data ?? []).length };
}

export async function recommendMappingUpdates(curriculumId, gaps) {
  return gaps.map(gap => ({ competency_id: gap, recommendation: `Add content module covering competency: ${gap}`, priority: 'high', evidence_required: true }));
}

export async function versionMappingChanges(curriculumId, changes) {
  await supabase.from(AUDIT_TABLE).insert({ curriculum_id: curriculumId, changes: JSON.stringify(changes), version: `v${Date.now()}`, created_at: new Date().toISOString() });
  return { versioned: true, curriculum_id: curriculumId };
}

export async function outputAlignmentMatrix(curriculumId, frameworkId) {
  const gap = await detectCoverageGaps(curriculumId, frameworkId);
  const { data: mappings } = await supabase.from(MAPPING_TABLE).select('content_id, mapped_competencies, confidence').eq('curriculum_id', curriculumId);
  return { curriculum_id: curriculumId, framework_id: frameworkId, coverage_pct: gap.coverage_pct, gaps: gap.gaps, over_indexed: gap.over_indexed, content_mappings: (mappings ?? []).length, generated_at: new Date().toISOString() };
}
