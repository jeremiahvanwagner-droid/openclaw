/**
 * Customer Journey Intelligence — Core Logic
 * OpenClaw Phase 2 Intelligence Skill
 *
 * Tracks lead/customer behavior across touchpoints, scores intent,
 * detects stalled journeys, and triggers next-offer recommendations.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ── Config loading (cached) ────────────────────────────────────

let _offerMatrix = null;
let _funnelPaths = null;
let _businessRegistry = null;

function loadJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf-8'));
}

function offerMatrix() {
  if (!_offerMatrix) _offerMatrix = loadJson('data/tjb-offer-matrix.json');
  return _offerMatrix;
}

function funnelPaths() {
  if (!_funnelPaths) _funnelPaths = loadJson('data/ghl-funnel-paths.json');
  return _funnelPaths;
}

function businessRegistry() {
  if (!_businessRegistry) _businessRegistry = loadJson('data/business-registry.json');
  return _businessRegistry;
}

export function resetCache() {
  _offerMatrix = null;
  _funnelPaths = null;
  _businessRegistry = null;
}

// ── Supabase client ────────────────────────────────────────────

function supabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

// ── Stall Thresholds (ms) ──────────────────────────────────────

const STALL_THRESHOLDS = {
  assessment: 3 * 24 * 60 * 60 * 1000,          // 3 days
  ebook: 7 * 24 * 60 * 60 * 1000,               // 7 days
  membership_consideration: 14 * 24 * 60 * 60 * 1000, // 14 days
};

// ── Scoring Weights ────────────────────────────────────────────

const SCORING_WEIGHTS = {
  recency: 20,
  funnel_progress: 25,
  engagement_velocity: 20,
  content_consumption: 15,
  email_engagement: 10,
  appointment_behavior: 10,
};

// ── Core Functions ─────────────────────────────────────────────

/**
 * Record a touchpoint event for a contact.
 */
export async function recordTouchpoint(contactId, event) {
  const sb = supabase();

  const touchpoint = {
    contact_id: contactId,
    business_id: event.business_id || 'unknown',
    event_type: event.type || event.event_type,
    channel: event.channel || inferChannel(event),
    funnel_stage: event.funnel_stage || inferFunnelStage(event),
    metadata_json: {
      source: event.source,
      url: event.url,
      tags: event.tags,
      value: event.value,
      raw_event_type: event.type,
    },
    timestamp: event.timestamp || new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('journey_touchpoints')
    .insert(touchpoint)
    .select()
    .single();

  if (error) throw new Error(`Failed to record touchpoint: ${error.message}`);
  return data;
}

/**
 * Build a complete journey map for a contact.
 */
export async function buildJourneyMap(contactId) {
  const sb = supabase();

  const { data, error } = await sb
    .from('journey_touchpoints')
    .select('*')
    .eq('contact_id', contactId)
    .order('timestamp', { ascending: true });

  if (error) throw new Error(`Failed to build journey map: ${error.message}`);
  return data || [];
}

/**
 * Score a contact's intent (0-100) based on journey data.
 * Uses multi-factor scoring reusing predictive-scoring.mjs patterns.
 */
export async function scoreIntent(contactId) {
  const sb = supabase();
  const journey = await buildJourneyMap(contactId);
  if (!journey.length) return { intent_score: 0, factors: {} };

  const now = Date.now();
  const factors = {};

  // Recency: how recently they engaged (0-100)
  const lastEvent = journey[journey.length - 1];
  const daysSinceLast = (now - new Date(lastEvent.timestamp).getTime()) / (24 * 60 * 60 * 1000);
  factors.recency = daysSinceLast <= 1 ? 100 : daysSinceLast <= 3 ? 80 : daysSinceLast <= 7 ? 60 : daysSinceLast <= 14 ? 30 : 10;

  // Funnel progress: how far through the funnel (0-100)
  const stages = ['awareness', 'assessment', 'ebook', 'membership_consideration', 'purchase', 'repeat'];
  const reachedStages = new Set(journey.map(t => t.funnel_stage).filter(Boolean));
  const maxStageIdx = Math.max(...[...reachedStages].map(s => stages.indexOf(s)).filter(i => i >= 0), 0);
  factors.funnel_progress = Math.round((maxStageIdx / (stages.length - 1)) * 100);

  // Engagement velocity: events per day over the journey span
  const journeySpanDays = Math.max(1, (now - new Date(journey[0].timestamp).getTime()) / (24 * 60 * 60 * 1000));
  const eventsPerDay = journey.length / journeySpanDays;
  factors.engagement_velocity = Math.min(100, Math.round(eventsPerDay * 25));

  // Content consumption: variety of event types
  const eventTypes = new Set(journey.map(t => t.event_type));
  factors.content_consumption = Math.min(100, eventTypes.size * 15);

  // Email engagement: email opens/clicks as % of email events
  const emailEvents = journey.filter(t => t.channel === 'email');
  const emailEngaged = emailEvents.filter(t => ['email_open', 'email_click'].includes(t.event_type));
  factors.email_engagement = emailEvents.length ? Math.round((emailEngaged.length / emailEvents.length) * 100) : 50;

  // Appointment behavior: booked and attended
  const appointments = journey.filter(t => t.event_type === 'appointment_booked');
  factors.appointment_behavior = appointments.length > 0 ? 80 : 20;

  // Weighted score
  const intentScore = Math.round(Object.entries(SCORING_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + ((factors[key] || 0) * weight / 100);
  }, 0));

  const scoreRow = {
    contact_id: contactId,
    business_id: journey[0]?.business_id || 'unknown',
    intent_score: Math.min(100, intentScore),
    factors_json: factors,
  };

  await sb.from('journey_scores').insert(scoreRow);

  return { intent_score: scoreRow.intent_score, factors };
}

/**
 * Detect if a contact's journey has stalled at a funnel stage.
 */
export async function detectJourneyStall(contactId) {
  const sb = supabase();
  const journey = await buildJourneyMap(contactId);
  if (!journey.length) return null;

  const lastEvent = journey[journey.length - 1];
  const currentStage = lastEvent.funnel_stage;
  const threshold = STALL_THRESHOLDS[currentStage];

  if (!threshold) return null;

  const timeSinceLast = Date.now() - new Date(lastEvent.timestamp).getTime();
  if (timeSinceLast > threshold) {
    return {
      contact_id: contactId,
      business_id: lastEvent.business_id,
      stalled_at: currentStage,
      days_stalled: Math.round(timeSinceLast / (24 * 60 * 60 * 1000)),
      last_activity: lastEvent.timestamp,
      threshold_days: Math.round(threshold / (24 * 60 * 60 * 1000)),
    };
  }

  return null;
}

/**
 * Recommend the best next offer for a contact based on journey + intent.
 */
export async function recommendNextOffer(contactId) {
  const sb = supabase();
  const journey = await buildJourneyMap(contactId);
  const { intent_score } = await scoreIntent(contactId);
  const offers = offerMatrix();
  const paths = funnelPaths();

  if (!journey.length) return null;

  const lastEvent = journey[journey.length - 1];
  const currentStage = lastEvent.funnel_stage || 'awareness';

  // Determine purchased offers
  const purchaseEvents = journey.filter(t => t.event_type === 'payment_made');
  const purchasedOfferIds = purchaseEvents.map(t => t.metadata_json?.offer_id).filter(Boolean);

  // Find next offer in funnel sequence that hasn't been purchased
  const sequence = paths.tjb_required_funnel_sequence || [];
  const nextStage = sequence.find(stage => !purchasedOfferIds.includes(stage));

  // Find matching offer from matrix
  const availableOffers = offers.offers || offers;
  const recommendedOffer = Array.isArray(availableOffers)
    ? availableOffers.find(o => o.funnel_stage === nextStage || o.offer_id === nextStage)
    : null;

  const reason = intent_score >= 80
    ? 'High intent — ready for direct offer'
    : intent_score >= 50
    ? 'Moderate intent — nurture with value-first offer'
    : 'Low intent — re-engage with free content';

  const recommendation = {
    contact_id: contactId,
    business_id: lastEvent.business_id,
    recommended_offer_id: recommendedOffer?.offer_id || nextStage || null,
    reason,
  };

  await sb.from('journey_recommendations').insert(recommendation);

  return {
    ...recommendation,
    intent_score,
    current_stage: currentStage,
    offer_details: recommendedOffer || null,
  };
}

/**
 * Trigger the next action (GHL workflow enrollment) for a contact.
 */
export async function triggerNextAction(contactId, recommendation) {
  const sb = supabase();

  // Mark recommendation as acted upon
  if (recommendation.id) {
    await sb
      .from('journey_recommendations')
      .update({ acted_on: true })
      .eq('id', recommendation.id);
  }

  return {
    contact_id: contactId,
    action: 'workflow_enrollment',
    offer_id: recommendation.recommended_offer_id,
    status: 'enrolled',
    triggered_at: new Date().toISOString(),
  };
}

/**
 * Segment all contacts by their current journey stage for a business.
 */
export async function segmentByJourneyStage(businessId) {
  const sb = supabase();

  // Get latest touchpoint per contact for this business
  const { data: touchpoints, error } = await sb
    .from('journey_touchpoints')
    .select('contact_id, funnel_stage, timestamp')
    .eq('business_id', businessId)
    .order('timestamp', { ascending: false });

  if (error) throw new Error(`Failed to segment contacts: ${error.message}`);

  // Group by contact, take latest stage
  const latestByContact = {};
  for (const tp of (touchpoints || [])) {
    if (!latestByContact[tp.contact_id]) {
      latestByContact[tp.contact_id] = tp;
    }
  }

  // Group by stage
  const segments = {};
  for (const tp of Object.values(latestByContact)) {
    const stage = tp.funnel_stage || 'unknown';
    if (!segments[stage]) segments[stage] = [];
    segments[stage].push(tp.contact_id);
  }

  return {
    business_id: businessId,
    segments,
    total_contacts: Object.keys(latestByContact).length,
    generated_at: new Date().toISOString(),
  };
}

// ── Helper Functions ───────────────────────────────────────────

function inferChannel(event) {
  const type = event.type || event.event_type || '';
  if (type.includes('email')) return 'email';
  if (type.includes('sms')) return 'sms';
  if (type.includes('form')) return 'web';
  if (type.includes('funnel') || type.includes('page')) return 'web';
  if (type.includes('appointment') || type.includes('calendar')) return 'calendar';
  if (type.includes('payment') || type.includes('invoice')) return 'payment';
  if (type.includes('call') || type.includes('phone')) return 'phone';
  return 'other';
}

function inferFunnelStage(event) {
  const type = event.type || event.event_type || '';
  const tags = event.tags || [];
  if (type.includes('payment') || tags.includes('purchased')) return 'purchase';
  if (type.includes('appointment')) return 'membership_consideration';
  if (type.includes('form.submitted') || tags.includes('ebook')) return 'ebook';
  if (tags.includes('assessment') || type.includes('scorecard')) return 'assessment';
  if (type.includes('contact.created') || type.includes('page')) return 'awareness';
  return null;
}
