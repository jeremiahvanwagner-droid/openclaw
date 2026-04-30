/**
 * Audiovisual Script Formatting — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const SCRIPT_TABLE = 'brand_av_scripts';

export function parseConceptBrief(brief) {
  const beats = brief.split(/\n+/).filter(l => l.trim().length > 0).map((line, i) => ({ beat_number: i + 1, description: line.trim() }));
  return { beats, count: beats.length };
}

export function structureScript(beats, targetDurationSeconds) {
  const secondsPerBeat = Math.floor(targetDurationSeconds / beats.length);
  return beats.map((beat, i) => ({
    scene: i + 1,
    timestamp_start: `${String(Math.floor(i * secondsPerBeat / 60)).padStart(2, '0')}:${String((i * secondsPerBeat) % 60).padStart(2, '0')}`,
    timestamp_end: `${String(Math.floor((i + 1) * secondsPerBeat / 60)).padStart(2, '0')}:${String(((i + 1) * secondsPerBeat) % 60).padStart(2, '0')}`,
    beat: beat.description,
    shot_cue: `[SHOT: ${i === 0 ? 'FACE TO CAMERA' : i % 2 === 0 ? 'B-ROLL' : 'FACE TO CAMERA'}]`,
  }));
}

export function addDeliveryGuidance(scenes, tone = 'confident') {
  const toneMap = { confident: 'Speak clearly and at moderate pace.', energetic: 'Upbeat, fast delivery.', empathetic: 'Warm, slow, measured delivery.' };
  return scenes.map(s => ({ ...s, delivery_note: toneMap[tone] ?? toneMap.confident }));
}

export function insertBRollMarkers(scenes) {
  return scenes.map((s, i) => ({
    ...s,
    broll_cue: i % 3 === 1 ? '[B-ROLL: relevant product/environment footage]' : null,
    graphics_cue: i === 0 ? '[TEXT OVERLAY: key headline]' : null,
    transition: i < scenes.length - 1 ? 'CUT' : 'FADE OUT',
  }));
}

export function optimizeForRuntime(scenes, targetSeconds) {
  const approxWordsPerScene = Math.floor((targetSeconds * 2.5) / scenes.length);
  return scenes.map(s => ({ ...s, target_word_count: approxWordsPerScene }));
}

export function validatePlatformConstraints(scenes, platform) {
  const maxSeconds = { youtube: 3600, instagram_reel: 90, tiktok: 60, linkedin: 600 };
  const limit = maxSeconds[platform] ?? 600;
  const totalDuration = scenes.length * 15;
  return { platform, within_limit: totalDuration <= limit, total_seconds: totalDuration, max_seconds: limit };
}

export async function outputProductionScript(title, scenes) {
  const script = { title, scenes, scene_count: scenes.length, generated_at: new Date().toISOString() };
  await supabase.from(SCRIPT_TABLE).insert(script);
  return { script };
}
