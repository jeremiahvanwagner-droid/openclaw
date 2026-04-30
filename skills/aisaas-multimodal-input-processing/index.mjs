/**
 * Multimodal Input Processing — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const INPUT_TABLE  = 'aisaas_multimodal_inputs';
const OUTPUT_TABLE = 'aisaas_multimodal_outputs';

export async function detectModalityTypes(inputs) {
  const detected = inputs.map(input => ({
    ...input,
    modality: input.type ?? (input.base64 ? 'image' : input.audio_url ? 'audio' : 'text'),
    pipeline: input.base64 ? 'vision' : input.audio_url ? 'transcription' : 'nlp',
  }));
  return { inputs: detected };
}

export async function normalizeInputs(inputs) {
  const normalized = inputs.map(i => ({
    id: i.id ?? `input-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    modality: i.modality,
    content: i.text ?? i.base64 ?? i.audio_url ?? '',
    timestamp: i.timestamp ?? new Date().toISOString(),
    pipeline: i.pipeline,
  }));
  if (normalized.length) await supabase.from(INPUT_TABLE).insert(normalized);
  return { normalized };
}

export async function extractModalityFeatures(input) {
  const features = {};
  if (input.modality === 'text') features.word_count = input.content.split(/\s+/).length;
  if (input.modality === 'image') features.has_image = true;
  if (input.modality === 'audio') features.has_audio = true;
  return { input_id: input.id, features };
}

export async function fuseRepresentations(inputs, taskContext) {
  const fused = { task_context: taskContext, modalities: inputs.map(i => i.modality), inputs: inputs.map(i => ({ id: i.id, modality: i.modality })), fused_at: new Date().toISOString() };
  return { fused_context: fused };
}

export function routeToModels(fusedContext) {
  const routes = [];
  if (fusedContext.modalities.includes('image')) routes.push({ model: 'vision', reason: 'image input detected' });
  if (fusedContext.modalities.includes('audio')) routes.push({ model: 'speech_to_text', reason: 'audio input detected' });
  if (fusedContext.modalities.includes('text')) routes.push({ model: 'text_llm', reason: 'text input' });
  return { routes };
}

export async function validateOutputCoherence(outputs) {
  const coherent = outputs.every(o => o.content && o.content.length > 0);
  return { coherent, output_count: outputs.length };
}

export async function outputConsolidatedResponse(sessionId, outputs) {
  const response = { session_id: sessionId, outputs, modality_traces: outputs.map(o => o.modality), generated_at: new Date().toISOString() };
  await supabase.from(OUTPUT_TABLE).insert(response);
  return { response };
}
