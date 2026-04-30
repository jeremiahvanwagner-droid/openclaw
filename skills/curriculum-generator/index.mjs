import { supabase } from '../../lib/agent-memory.js';

const CURRICULUM_TABLE = 'curriculum_designs';

const LENGTH_CONFIG = { mini: { modules: 1, lessons_per_module: [3, 5] }, standard: { modules: 8, lessons_per_module: [3, 6] }, comprehensive: { modules: 20, lessons_per_module: [3, 6] } };

function buildModule(num, topic, dripDay, lessonCount, drip = 'weekly') {
  const isFirst = num === 1;
  const title = isFirst ? `Module 1: Foundation & Getting Started` : `Module ${num}: ${topic} — Part ${num}`;
  const lessons = Array.from({ length: lessonCount }, (_, i) => ({
    number: parseFloat(`${num}.${i + 1}`),
    title: i === 0 ? `Introduction to ${topic}` : i === lessonCount - 1 ? `Putting It All Together` : `Core Concept ${i + 1}`,
    type: i === lessonCount - 1 ? 'assignment' : i % 3 === 2 ? 'quiz' : 'video',
    duration: '10 min',
    learning_outcome: `Students will understand and apply key ${topic} principles`,
    content_notes: `Cover ${topic} with practical examples`,
  }));
  return { number: num, title, description: `Deep dive into ${topic}`, drip_day: dripDay, lessons, assignment: { title: `${topic} Practice Exercise`, description: `Apply what you learned`, deliverable: 'Completed worksheet or implementation screenshot' }, resources: [`${topic} Checklist.pdf`, `${topic} Template.docx`] };
}

export async function generateCurriculum(courseTopic, targetAudience, courseLength, options = {}) {
  const { learningObjectives = [], drip_schedule = 'weekly', certification = false, niche = '', difficulty = 'intermediate' } = options;
  const config = LENGTH_CONFIG[courseLength] ?? LENGTH_CONFIG.standard;
  const moduleCount = config.modules;
  const [minLessons, maxLessons] = config.lessons_per_module;
  const modules = Array.from({ length: moduleCount }, (_, i) => {
    const lessonCount = Math.floor(Math.random() * (maxLessons - minLessons + 1)) + minLessons;
    return buildModule(i + 1, courseTopic, i * 7, lessonCount, drip_schedule);
  });
  if (modules.length > 1) modules[modules.length - 1].title = `Module ${moduleCount}: Next Steps & Implementation`;

  const curriculum = {
    course_name: `${courseTopic}: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Course`,
    tagline: `Everything ${targetAudience} needs to master ${courseTopic}`,
    target_audience: targetAudience,
    difficulty,
    estimated_duration: `${moduleCount} weeks`,
    modules,
    certification: { enabled: certification, requirements: certification ? 'Complete all modules + pass final quiz (80%)' : null },
    total_lessons: modules.reduce((sum, m) => sum + m.lessons.length, 0),
    total_assignments: moduleCount,
    created_at: new Date().toISOString(),
  };

  await supabase.from(CURRICULUM_TABLE).insert(curriculum);
  return curriculum;
}

export async function getCurriculumHistory(limit = 10) {
  const { data } = await supabase.from(CURRICULUM_TABLE).select('course_name, difficulty, total_lessons, created_at').order('created_at', { ascending: false }).limit(limit);
  return { curricula: data ?? [], total: (data ?? []).length };
}
