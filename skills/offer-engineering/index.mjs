/**
 * Offer Engineering — Core Logic
 * OpenClaw Phase 3 Execution Skill
 *
 * Pricing, packaging, upsells/downsells optimization
 * using Grand Slam offer framework and pricing psychology.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../../lib/agent-memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ── Config loading ─────────────────────────────────────────────

let _businessRegistry = null;
let _offerMatrix = null;

function loadJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf-8'));
}

function businessRegistry() {
  if (!_businessRegistry) _businessRegistry = loadJson('data/business-registry.json');
  return _businessRegistry;
}

function offerMatrix() {
  if (!_offerMatrix) _offerMatrix = loadJson('data/tjb-offer-matrix.json');
  return _offerMatrix;
}

export function resetCache() {
  _businessRegistry = null;
  _offerMatrix = null;
}

// ── Supabase client ────────────────────────────────────────────

// ── Pricing Psychology Principles ──────────────────────────────

const PRICING_PRINCIPLES = {
  anchoring: { name: 'Price Anchoring', multiplier: 3, description: 'Show high anchor before target price' },
  charm: { name: 'Charm Pricing', adjustment: -0.03, description: 'End prices in 7 or 9' },
  decoy: { name: 'Decoy Effect', description: 'Add asymmetric dominated option to steer choice' },
  bundling: { name: 'Bundle Discount', discount: 0.15, description: 'Combine products at perceived savings' },
  scarcity: { name: 'Scarcity Premium', premium: 0.10, description: 'Limited spots/time increases perceived value' },
  reciprocity: { name: 'Reciprocity Trigger', description: 'Give free value first to drive purchase motivation' },
  loss_aversion: { name: 'Loss Aversion Framing', description: 'Frame in terms of what they lose by not buying' },
  social_proof: { name: 'Social Proof Pricing', description: 'Show popularity and peer adoption signals' },
};

// ── Grand Slam Offer Components ────────────────────────────────

const OFFER_STACK_POSITIONS = ['front_end', 'core', 'upsell', 'downsell', 'order_bump'];

// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze all current offers for a business.
 */
export async function analyzeCurrentOffers(businessId) {
  const matrix = offerMatrix();
  const businessOffers = matrix.offers?.filter(o => o.business_id === businessId) || [];

  if (!businessOffers.length) {
    return { business_id: businessId, offers: [], message: 'No offers found in matrix' };
  }

  const db = supabase;

  // Get recent analytics if available
  const { data: existingAnalytics } = await db.from('offer_analytics')
    .select('*')
    .eq('business_id', businessId)
    .order('calculated_at', { ascending: false })
    .limit(businessOffers.length);

  const analyticsMap = {};
  for (const a of existingAnalytics || []) {
    if (!analyticsMap[a.offer_id]) analyticsMap[a.offer_id] = a;
  }

  const analyzed = businessOffers.map(offer => {
    const existing = analyticsMap[offer.offer_id] || {};
    return {
      offer_id: offer.offer_id,
      name: offer.name || offer.offer_id,
      price: offer.price,
      funnel_stage: offer.funnel_stage,
      conversion_rate: existing.conversion_rate ?? null,
      aov: existing.aov ?? offer.price,
      ltv: existing.ltv ?? null,
      refund_rate: existing.refund_rate ?? null,
      health: classifyOfferHealth(existing),
    };
  });

  return {
    business_id: businessId,
    total_offers: analyzed.length,
    offers: analyzed,
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Design a complete offer stack using Grand Slam framework.
 */
export async function designOfferStack(businessId, config = {}) {
  const registry = businessRegistry();
  const business = registry.businesses?.find(b => b.business_id === businessId);
  if (!business) throw new Error(`Business ${businessId} not found`);

  const corePrice = config.core_price || 997;
  const niche = business.niche || config.niche || 'business';

  const stack = {
    front_end: {
      position: 'front_end',
      name: `${niche} Quick-Start Guide`,
      type: 'lead_magnet',
      price: 0,
      value_perception: corePrice * 0.2,
      purpose: 'Acquire lead and demonstrate expertise',
      components: ['PDF/Video guide', 'Worksheet', 'Resource list'],
      psychology: [PRICING_PRINCIPLES.reciprocity],
    },
    core: {
      position: 'core',
      name: config.core_name || `${niche} Mastery Program`,
      type: 'program',
      price: corePrice,
      value_perception: corePrice * PRICING_PRINCIPLES.anchoring.multiplier,
      purpose: 'Primary revenue driver with full transformation',
      components: [
        'Core training modules',
        'Community access',
        'Weekly coaching calls',
        'Implementation templates',
      ],
      bonuses: generateBonuses(corePrice, niche),
      psychology: [PRICING_PRINCIPLES.anchoring, PRICING_PRINCIPLES.scarcity, PRICING_PRINCIPLES.social_proof],
    },
    upsell: {
      position: 'upsell',
      name: `${niche} VIP Accelerator`,
      type: 'premium_add_on',
      price: Math.round(corePrice * 0.5),
      value_perception: corePrice * 1.5,
      purpose: 'Increase AOV with premium support',
      components: ['1-on-1 coaching session', 'Priority support', 'Done-for-you templates'],
      psychology: [PRICING_PRINCIPLES.bundling],
    },
    downsell: {
      position: 'downsell',
      name: `${niche} Essentials`,
      type: 'entry_level',
      price: Math.round(corePrice * 0.2),
      value_perception: corePrice * 0.4,
      purpose: 'Capture revenue from price-sensitive prospects',
      components: ['Core training only', 'Self-paced', 'Community access'],
      psychology: [PRICING_PRINCIPLES.charm, PRICING_PRINCIPLES.loss_aversion],
    },
    order_bump: {
      position: 'order_bump',
      name: `${niche} Resource Toolkit`,
      type: 'add_on',
      price: Math.round(corePrice * 0.05),
      value_perception: corePrice * 0.3,
      purpose: 'Low-friction AOV increase at checkout',
      components: ['Swipe files', 'Templates', 'Checklists'],
      psychology: [PRICING_PRINCIPLES.bundling],
    },
  };

  // Apply charm pricing
  for (const pos of OFFER_STACK_POSITIONS) {
    if (stack[pos].price > 0) {
      stack[pos].charm_price = applyCharmPricing(stack[pos].price);
    }
  }

  // Store in Supabase
  const db = supabase;
  const { data } = await db.from('offer_stacks').insert({
    business_id: businessId,
    stack_json: stack,
    simulation_json: {},
    status: 'draft',
  }).select('id').single();

  return {
    business_id: businessId,
    stack_id: data?.id,
    stack,
    total_value_perception: Object.values(stack).reduce((s, o) => s + (o.value_perception || 0), 0),
    total_revenue_potential: Object.values(stack).reduce((s, o) => s + (o.price || 0), 0),
  };
}

/**
 * Optimize pricing for a specific offer.
 */
export async function optimizePricing(offerId, strategy = 'balanced') {
  const matrix = offerMatrix();
  const offer = matrix.offers?.find(o => o.offer_id === offerId);
  if (!offer) throw new Error(`Offer ${offerId} not found in matrix`);

  const currentPrice = offer.price;
  const recommendations = [];

  // Apply relevant pricing principles based on strategy
  if (strategy === 'maximize_aov' || strategy === 'balanced') {
    recommendations.push({
      principle: 'anchoring',
      suggestion: `Show value at $${currentPrice * 3} before revealing price of $${currentPrice}`,
      expected_lift: '15-25% conversion improvement',
    });
  }

  if (strategy === 'maximize_conversion' || strategy === 'balanced') {
    const charmPrice = applyCharmPricing(currentPrice);
    if (charmPrice !== currentPrice) {
      recommendations.push({
        principle: 'charm_pricing',
        suggestion: `Change from $${currentPrice} to $${charmPrice}`,
        expected_lift: '5-10% conversion improvement',
      });
    }
  }

  if (strategy === 'maximize_ltv' || strategy === 'balanced') {
    recommendations.push({
      principle: 'bundling',
      suggestion: `Create bundle with 15% discount vs individual purchase`,
      bundle_price: Math.round(currentPrice * 1.5 * 0.85),
      expected_lift: '20-30% AOV increase',
    });
  }

  recommendations.push({
    principle: 'scarcity',
    suggestion: 'Add limited-time or limited-spots messaging',
    expected_lift: '10-15% urgency-driven conversions',
  });

  return {
    offer_id: offerId,
    current_price: currentPrice,
    strategy,
    recommendations,
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Design a post-purchase upsell/downsell sequence.
 */
export async function designUpsellSequence(primaryOfferId) {
  const matrix = offerMatrix();
  const primaryOffer = matrix.offers?.find(o => o.offer_id === primaryOfferId);
  if (!primaryOffer) throw new Error(`Offer ${primaryOfferId} not found`);

  const basePrice = primaryOffer.price;

  return {
    primary_offer_id: primaryOfferId,
    primary_price: basePrice,
    sequence: [
      {
        step: 1,
        type: 'order_bump',
        timing: 'checkout_page',
        price: Math.round(basePrice * 0.05),
        description: 'Low-friction add-on shown on checkout page',
        acceptance_rate_target: 0.35,
      },
      {
        step: 2,
        type: 'upsell_1',
        timing: 'post_purchase_immediate',
        price: Math.round(basePrice * 0.5),
        description: 'Premium upgrade offered immediately after purchase',
        acceptance_rate_target: 0.15,
      },
      {
        step: 3,
        type: 'downsell_1',
        timing: 'on_upsell_decline',
        price: Math.round(basePrice * 0.15),
        description: 'Lighter alternative when upsell is declined',
        acceptance_rate_target: 0.25,
      },
      {
        step: 4,
        type: 'upsell_2',
        timing: 'day_3_email',
        price: Math.round(basePrice * 0.3),
        description: 'Delayed upsell via email after initial consumption',
        acceptance_rate_target: 0.08,
      },
    ],
    max_aov: basePrice + Math.round(basePrice * 0.05) + Math.round(basePrice * 0.5),
    designed_at: new Date().toISOString(),
  };
}

/**
 * Simulate revenue from an offer stack given traffic estimates.
 */
export async function simulateRevenue(offerStack, trafficEstimate) {
  const monthlyTraffic = trafficEstimate.monthly_visitors || 1000;
  const optInRate = trafficEstimate.opt_in_rate || 0.30;
  const salesConversion = trafficEstimate.sales_conversion || 0.03;

  const leads = Math.round(monthlyTraffic * optInRate);
  const buyers = Math.round(leads * salesConversion);

  const stack = offerStack.stack || offerStack;
  const simulation = {
    monthly_traffic: monthlyTraffic,
    leads_generated: leads,
    core_buyers: buyers,
    revenue_breakdown: {},
    total_monthly_revenue: 0,
  };

  // Core revenue
  const corePrice = stack.core?.price || 0;
  simulation.revenue_breakdown.core = {
    units: buyers,
    price: corePrice,
    revenue: buyers * corePrice,
  };

  // Order bump (35% of buyers)
  const bumpPrice = stack.order_bump?.price || 0;
  const bumpBuyers = Math.round(buyers * 0.35);
  simulation.revenue_breakdown.order_bump = {
    units: bumpBuyers,
    price: bumpPrice,
    revenue: bumpBuyers * bumpPrice,
  };

  // Upsell (15% of buyers)
  const upsellPrice = stack.upsell?.price || 0;
  const upsellBuyers = Math.round(buyers * 0.15);
  simulation.revenue_breakdown.upsell = {
    units: upsellBuyers,
    price: upsellPrice,
    revenue: upsellBuyers * upsellPrice,
  };

  // Downsell (25% of non-upsell buyers)
  const downsellPrice = stack.downsell?.price || 0;
  const downsellBuyers = Math.round((buyers - upsellBuyers) * 0.25);
  simulation.revenue_breakdown.downsell = {
    units: downsellBuyers,
    price: downsellPrice,
    revenue: downsellBuyers * downsellPrice,
  };

  simulation.total_monthly_revenue = Object.values(simulation.revenue_breakdown)
    .reduce((s, r) => s + r.revenue, 0);
  simulation.effective_aov = buyers > 0 ? Math.round(simulation.total_monthly_revenue / buyers) : 0;
  simulation.annual_projection = simulation.total_monthly_revenue * 12;

  // Store simulation
  if (offerStack.stack_id) {
    const db = supabase;
    await db.from('offer_stacks')
      .update({ simulation_json: simulation })
      .eq('id', offerStack.stack_id);
  }

  return simulation;
}

/**
 * Track offer performance metrics over a period.
 */
export async function trackOfferPerformance(offerId, period = 'daily') {
  const db = supabase;

  // Get historical analytics
  const { data: history } = await db.from('offer_analytics')
    .select('*')
    .eq('offer_id', offerId)
    .eq('period', period)
    .order('calculated_at', { ascending: false })
    .limit(30);

  // Calculate trends
  const latest = history?.[0];
  const previous = history?.[1];

  const trends = {};
  if (latest && previous) {
    for (const metric of ['conversion_rate', 'aov', 'ltv', 'refund_rate']) {
      const curr = latest[metric] || 0;
      const prev = previous[metric] || 0;
      trends[metric] = {
        current: curr,
        previous: prev,
        change: prev > 0 ? ((curr - prev) / prev) * 100 : 0,
        direction: curr > prev ? 'up' : curr < prev ? 'down' : 'flat',
      };
    }
  }

  return {
    offer_id: offerId,
    period,
    history_count: history?.length || 0,
    latest: latest || null,
    trends,
  };
}

/**
 * Generate AI-powered optimization recommendations.
 */
export async function recommendOptimizations(businessId) {
  const analysis = await analyzeCurrentOffers(businessId);
  const recommendations = [];

  for (const offer of analysis.offers) {
    // Low conversion rate
    if (offer.conversion_rate !== null && offer.conversion_rate < 0.02) {
      recommendations.push({
        offer_id: offer.offer_id,
        type: 'conversion',
        priority: 'high',
        recommendation: `Conversion rate (${(offer.conversion_rate * 100).toFixed(1)}%) is below 2% threshold. Consider A/B testing price point or sales page copy.`,
        expected_impact: { metric: 'conversion_rate', lift: '50-100%' },
      });
    }

    // High refund rate
    if (offer.refund_rate !== null && offer.refund_rate > 0.10) {
      recommendations.push({
        offer_id: offer.offer_id,
        type: 'retention',
        priority: 'critical',
        recommendation: `Refund rate (${(offer.refund_rate * 100).toFixed(1)}%) exceeds 10%. Investigate product-market fit and onboarding experience.`,
        expected_impact: { metric: 'refund_rate', reduction: '30-50%' },
      });
    }

    // Missing upsell/downsell
    if (offer.funnel_stage === 'core' && !analysis.offers.some(o => o.funnel_stage === 'upsell')) {
      recommendations.push({
        offer_id: offer.offer_id,
        type: 'aov',
        priority: 'medium',
        recommendation: 'No upsell detected. Adding a post-purchase upsell typically increases AOV by 15-30%.',
        expected_impact: { metric: 'aov', lift: '15-30%' },
      });
    }
  }

  // Store recommendations
  if (recommendations.length) {
    const db = supabase;
    await db.from('offer_optimizations').insert(
      recommendations.map(r => ({
        business_id: businessId,
        offer_id: r.offer_id,
        recommendation: r.recommendation,
        expected_impact: r.expected_impact,
        status: 'pending',
      }))
    );
  }

  return {
    business_id: businessId,
    total_recommendations: recommendations.length,
    recommendations,
    analyzed_at: new Date().toISOString(),
  };
}

// ── Helpers ────────────────────────────────────────────────────

function classifyOfferHealth(analytics) {
  if (!analytics.conversion_rate) return 'unknown';
  if (analytics.refund_rate > 0.10) return 'critical';
  if (analytics.conversion_rate < 0.01) return 'poor';
  if (analytics.conversion_rate < 0.03) return 'fair';
  return 'healthy';
}

function applyCharmPricing(price) {
  if (price <= 0) return price;
  if (price < 10) return Math.ceil(price) - 0.03;
  if (price < 100) return Math.round(price / 10) * 10 - 3;
  return Math.round(price / 100) * 100 - 3;
}

function generateBonuses(corePrice, niche) {
  return [
    {
      name: `${niche} Implementation Toolkit`,
      value: Math.round(corePrice * 0.3),
      description: 'Templates, checklists, and SOPs',
    },
    {
      name: 'Private Community Access',
      value: Math.round(corePrice * 0.2),
      description: 'Network with like-minded professionals',
    },
    {
      name: 'Bonus Training Module',
      value: Math.round(corePrice * 0.15),
      description: 'Advanced strategies for accelerated results',
    },
  ];
}
