import { supabase } from '../../lib/agent-memory.js';

const LESSON_TABLE = 'education_micro_lessons';

export function segmentLecture(transcript, minWordsPerSegment = 100) {
  const sentences = transcript.split(/(?<=[.!?])\s+/);
  const segments = [];
  let current = [];
  let wordCount = 0;
  for (const s of sentences) {
    current.push(s);
    wordCount += s.split(/\s+/).length;
    if (wordCount >= minWordsPerSegment && /first|next|now|moving on|finally|in summary|key point/i.test(s)) {
      segments.push(current.join(' '));
      current = [];
      wordCount = 0;
    }
  }
  if (current.length) segments.push(current.join(' '));
  return segments;
}

export function extractOutcomePerSegment(segment) {
  const match = segment.match(/by the end|you will|you'll|students will|after this|key takeaway[:\s]+(.*?)[.!]/i);
  const outcome = match?.[1]?.trim() ?? segment.split('.')[0].replace(/^(today |we |in this )/i, '').trim();
  return { outcome: outcome.slice(0, 120), word_count: segment.split(/\s+/).length };
}

export function rewriteAsInstructionalUnit(segment, outcome) {
  const words = segment.split(/\s+/);
  const condensed = words.slice(0, Math.min(200, words.length)).join(' ');
  return { content: condensed, learning_outcome: outcome, estimated_minutes: Math.ceil(words.length / 130) };
}

export function attachQuickCheck(unit) {
  return { ...unit, quick_check: `Quick check: In your own words, explain "${unit.learning_outcome.slice(0, 60)}..."`, action_prompt: `Try applying this concept to one example from your own work before moving on.` };
}

export function sequenceByPrerequisites(units) {
  return units.map((u, i) => ({ ...u, position: i + 1, prerequisite: i > 0 ? i : null }));
}

export async function tagAndPublish(courseId, sequencedUnits) {
  const rows = sequencedUnits.map(u => ({ course_id: courseId, ...u, tags: [u.learning_outcome.split(' ').slice(0, 3).join('_').toLowerCase()], published_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(LESSON_TABLE).insert(rows);
  return { course_id: courseId, lessons_published: rows.length };
}

export async function outputMicroLessonBundle(courseId) {
  const { data } = await supabase.from(LESSON_TABLE).select('*').eq('course_id', courseId).order('position');
  return { course_id: courseId, micro_lessons: data ?? [], total: (data ?? []).length, total_estimated_minutes: (data ?? []).reduce((s, l) => s + (l.estimated_minutes ?? 0), 0), generated_at: new Date().toISOString() };
}
