import { supabase } from '../../lib/agent-memory.js';

const BLUEPRINT_TABLE = 'funnel_blueprints';

const ARCHETYPE_MAP = {
  high_ticket:  'Application',
  service:      'Application',
  course:       'Webinar',
  membership:   'Challenge',
  saas:         'SaaS Trial',
  ecommerce:    'Tripwire',
};

const ARCHETYPE_PAGES = {
  Application:  ['Landing', 'Application Form', 'Calendar', 'Thank You'],
  Webinar:      ['Registration', 'Confirmation', 'Replay', 'Offer', 'Order', 'Thank You'],
  Challenge:    ['Registration', 'Day 1', 'Day 2', 'Day 3', 'Offer', 'Thank You'],
  VSL:          ['Landing', 'VSL Sales Page', 'Order', 'Upsell', 'Thank You'],
  'Lead Magnet':['Opt-in', 'Thank You'],
  Tripwire:     ['Opt-in', 'Tripwire Offer', 'Upsell', 'Thank You'],
  'SaaS Trial': ['Landing', 'Sign-up', 'Onboarding', 'Trial Dashboard'],
};

function buildPage(step, name, niche, offerType, avatar) {
  const typeMap = { Landing: 'sales', 'Opt-in': 'opt_in', 'Thank You': 'thank_you', 'Order': 'order', 'Upsell': 'upsell', 'Application Form': 'application', 'Registration': 'opt_in', 'Calendar': 'application', 'Sign-up': 'opt_in' };
  const type = typeMap[name] ?? 'sales';
  const pain = avatar?.pain_points?.[0] ?? `${niche} challenges`;
  return {
    step, name, type,
    headline: `Finally: The ${niche} Solution That Actually Works`,
    subheadline: `Stop struggling with ${pain} — here's the proven system`,
    copy_angles: [`Pain point: "${pain}"`, `Desired outcome: "${avatar?.desired_outcomes?.[0] ?? 'results'}"`, `Urgency: limited spots`],
    cta_primary: type === 'opt_in' ? 'Get Instant Access' : type === 'application' ? 'Apply Now' : type === 'order' ? 'Yes, I Want This!' : 'Learn More',
    cta_fallback: 'See How It Works',
    form_fields: type === 'opt_in' ? ['first_name', 'email'] : type === 'application' ? ['first_name', 'email', 'phone', 'biggest_challenge'] : [],
    social_proof: ['testimonial', 'stat'],
    media: type === 'sales' ? ['video', 'countdown_timer'] : ['image'],
  };
}

export async function designBlueprint(niche, offerType, saasInstanceId, options = {}) {
  const { avatar, pricePoint, brandVoice = 'professional' } = options;
  const archetype = pricePoint > 2000 ? 'Application' : ARCHETYPE_MAP[offerType] ?? 'Lead Magnet';
  const pageNames = ARCHETYPE_PAGES[archetype] ?? ARCHETYPE_PAGES['Lead Magnet'];
  const pages = pageNames.map((name, i) => buildPage(i + 1, name, niche, offerType, avatar));

  const blueprint = {
    funnel_name: `${niche} ${archetype} Funnel`,
    archetype,
    niche,
    pages,
    pipeline_mapping: { pipeline_name: `${niche} Pipeline`, stages: pageNames.filter(p => !['Thank You', 'Confirmation'].includes(p)) },
    tracking: { conversion_events: ['opt_in_complete', 'application_submitted', 'purchase_complete'], utm_parameters: { utm_source: 'funnel', utm_medium: 'paid', utm_campaign: niche.toLowerCase().replace(/\s+/g, '_') } },
    ab_test_suggestions: [{ page: pageNames[0], variant: 'Social proof headline', hypothesis: 'Lead with number of clients served instead of pain point' }, { page: pageNames[1] ?? pageNames[0], variant: 'CTA color test', hypothesis: 'Green vs orange CTA button' }],
    saas_instance_id: saasInstanceId,
    created_at: new Date().toISOString(),
  };

  await supabase.from(BLUEPRINT_TABLE).insert(blueprint);
  return blueprint;
}

export async function getBlueprintHistory(limit = 10) {
  const { data } = await supabase.from(BLUEPRINT_TABLE).select('funnel_name, archetype, niche, created_at').order('created_at', { ascending: false }).limit(limit);
  return { blueprints: data ?? [], total: (data ?? []).length };
}
