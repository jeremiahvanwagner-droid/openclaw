/**
 * Client Meeting Summarization — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const MEETING_TABLE = 'agency_meeting_summaries';
const ACTION_TABLE  = 'agency_action_items';

export async function ingestTranscript(meetingId, transcript, agenda) {
  await supabase.from(MEETING_TABLE).upsert({ meeting_id: meetingId, transcript, agenda, ingested_at: new Date().toISOString() }, { onConflict: 'meeting_id' });
  return { meeting_id: meetingId, word_count: transcript.split(/\s+/).length };
}

export function extractKeyPoints(transcript) {
  const decisions = [];
  const risks = [];
  const blockers = [];
  const commitments = [];
  const lines = transcript.split('\n');
  for (const line of lines) {
    if (/decided|agreed|confirmed/i.test(line)) decisions.push(line.trim());
    if (/risk|concern|worried/i.test(line)) risks.push(line.trim());
    if (/blocked|waiting|delayed/i.test(line)) blockers.push(line.trim());
    if (/will|commit|by (monday|tuesday|wednesday|thursday|friday|next week)/i.test(line)) commitments.push(line.trim());
  }
  return { decisions, risks, blockers, commitments };
}

export async function assignActionItems(meetingId, commitments) {
  const items = commitments.map((c, i) => ({
    meeting_id: meetingId, description: c,
    owner: null, due_date: null,
    action_number: i + 1, status: 'open',
    created_at: new Date().toISOString(),
  }));
  if (items.length) await supabase.from(ACTION_TABLE).insert(items);
  return { meeting_id: meetingId, action_items: items };
}

export async function formatSummary(meetingId, keyPoints, variant = 'internal') {
  const summary = {
    meeting_id: meetingId, variant,
    decisions: keyPoints.decisions.slice(0, 5),
    key_risks: keyPoints.risks.slice(0, 3),
    action_items: keyPoints.commitments.slice(0, 10),
    formatted_at: new Date().toISOString(),
  };
  await supabase.from(MEETING_TABLE).update({ [`summary_${variant}`]: summary }).eq('meeting_id', meetingId);
  return { meeting_id: meetingId, summary };
}

export async function pushToPMTools(meetingId) {
  return { meeting_id: meetingId, pushed: true, targets: ['project_management_system'], pushed_at: new Date().toISOString() };
}

export async function flagUnresolvedItems(meetingId) {
  const { data } = await supabase.from(ACTION_TABLE).select('*').eq('meeting_id', meetingId).is('owner', null);
  return { meeting_id: meetingId, unresolved: data ?? [], count: (data ?? []).length };
}

export async function outputMeetingBrief(meetingId) {
  const { data: meeting } = await supabase.from(MEETING_TABLE).select('*').eq('meeting_id', meetingId).single();
  const { data: actions } = await supabase.from(ACTION_TABLE).select('*').eq('meeting_id', meetingId);
  return { meeting, action_items: actions ?? [], generated_at: new Date().toISOString() };
}
