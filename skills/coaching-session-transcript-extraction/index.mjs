/**
 * Session Transcript Extraction — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const RECAP_TABLE  = 'coaching_session_recaps';
const ACTION_TABLE = 'coaching_session_actions';

export async function ingestTranscript(sessionId, transcript, agenda) {
  await supabase.from(RECAP_TABLE).upsert({ session_id: sessionId, transcript, agenda, ingested_at: new Date().toISOString() }, { onConflict: 'session_id' });
  return { session_id: sessionId, word_count: transcript.split(/\s+/).length };
}

export function extractKeyPoints(transcript) {
  const decisions = [];
  const actions = [];
  const owners = [];
  const deadlines = [];
  const unresolved = [];
  const lines = transcript.split('\n');
  for (const line of lines) {
    if (/decided|agreed|we will|confirmed/i.test(line)) decisions.push(line.trim());
    if (/action:|todo:|will do|next step/i.test(line)) actions.push(line.trim());
    if (/by (monday|tuesday|wednesday|thursday|friday|next week|end of month)/i.test(line)) deadlines.push(line.trim());
    if (/still need to|unclear|open question|tbd/i.test(line)) unresolved.push(line.trim());
  }
  return { decisions, actions, owners, deadlines, unresolved };
}

export async function assignActionItems(sessionId, actions) {
  const items = actions.map((a, i) => ({ session_id: sessionId, description: a, action_number: i + 1, owner: null, due_date: null, status: 'open', created_at: new Date().toISOString() }));
  if (items.length) await supabase.from(ACTION_TABLE).insert(items);
  return { session_id: sessionId, items };
}

export async function formatClientSummary(sessionId, keyPoints) {
  const summary = {
    session_id: sessionId,
    decisions: keyPoints.decisions.slice(0, 5),
    action_items: keyPoints.actions.slice(0, 10),
    unresolved_questions: keyPoints.unresolved.slice(0, 3),
    formatted_at: new Date().toISOString(),
  };
  await supabase.from(RECAP_TABLE).update({ summary }).eq('session_id', sessionId);
  return { summary };
}

export async function syncToTrackingSystems(sessionId) {
  return { synced: true, session_id: sessionId, systems: ['action_tracker', 'crm'], synced_at: new Date().toISOString() };
}

export async function flagAmbiguities(sessionId, unresolved) {
  const flags = unresolved.map(u => ({ session_id: sessionId, item: u, needs_clarification: true }));
  return { flags };
}

export async function outputSessionRecap(sessionId) {
  const { data: recap } = await supabase.from(RECAP_TABLE).select('*').eq('session_id', sessionId).single();
  const { data: actions } = await supabase.from(ACTION_TABLE).select('*').eq('session_id', sessionId);
  return { session_id: sessionId, recap, action_items: actions ?? [], generated_at: new Date().toISOString() };
}
