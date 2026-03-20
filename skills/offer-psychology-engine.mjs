#!/usr/bin/env node
/**
 * OpenClaw Offer Psychology Engine Skill
 *
 * Division 9 — Online Store (store.truthjblue.com)
 *
 * Applies marketing psychology principles to craft compelling offers
 * for books and merchandise. Designs discount structures, bundles,
 * and promotional campaigns that align products with customer
 * transformation journeys.
 *
 * Features:
 *   - Buyer psychology frameworks (scarcity, anchoring, reciprocity)
 *   - Cross-division bundle design (books + coaching, merch + courses)
 *   - Discount strategy generation with margin protection
 *   - Seasonal/launch promotion calendars
 *   - A/B test recommendation engine
 *   - Customer segment-aligned offer matching
 *
 * Usage: node offer-psychology-engine.mjs <command> [args...]
 *
 * Commands:
 *   bundle design <context-json>        Design a cross-product bundle
 *   discount plan <context-json>        Generate discount strategy
 *   promotion calendar <quarter>        Plan seasonal promotions
 *   psychology audit <product-json>     Audit a product page for psychology gaps
 *   segment offers <segment>            Generate segment-specific offers
 *   ab-test suggest <offer-json>        Suggest A/B test variants
 */

import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.OPENCLAW_DATA_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const OFFERS_FILE = path.join(DATA_DIR, 'offer-history.json');

// ─── Psychology Frameworks ──────────────────────────────────

const PSYCHOLOGY_PRINCIPLES = {
  scarcity: {
    name: 'Scarcity',
    description: 'Limited availability increases perceived value',
    tactics: [
      'Limited-time discount (48h flash sale)',
      'Limited quantity ("Only 50 signed copies")',
      'Seasonal exclusivity ("Holiday collection")',
      'Early-bird pricing for launches'
    ],
    best_for: ['book launches', 'limited merch drops', 'holiday promotions']
  },
  anchoring: {
    name: 'Price Anchoring',
    description: 'Showing higher reference price makes offer feel like a deal',
    tactics: [
      'Show original price crossed out next to sale price',
      'Bundle value display ("$147 value for $79")',
      'Compare to competitor/alternative cost',
      'Tiered pricing with premium option as anchor'
    ],
    best_for: ['bundles', 'course + book combos', 'premium merch']
  },
  reciprocity: {
    name: 'Reciprocity',
    description: 'Giving something free creates obligation to buy',
    tactics: [
      'Free chapter download before purchase',
      'Free shipping threshold',
      'Bonus digital guide with merch purchase',
      'Free coaching session with book bundle'
    ],
    best_for: ['lead generation', 'cart value increase', 'book funnels']
  },
  social_proof: {
    name: 'Social Proof',
    description: 'Others buying/reviewing validates purchase decision',
    tactics: [
      'Display review count and star ratings prominently',
      '"X people bought this today" counter',
      'Testimonial carousels on product pages',
      'User-generated content showcasing merch'
    ],
    best_for: ['new products', 'high-consideration items', 'merch']
  },
  commitment_consistency: {
    name: 'Commitment & Consistency',
    description: 'Small initial commitment leads to larger purchases',
    tactics: [
      'Low-price entry product → upsell to bundle',
      'Free quiz → recommended reading path → purchase',
      'Newsletter signup → exclusive first-buyer discount',
      'Challenge participation → merch/book combo offer'
    ],
    best_for: ['funnel entry', 'upsells', 'coaching → book cross-sell']
  },
  loss_aversion: {
    name: 'Loss Aversion',
    description: 'People feel losses more strongly than equivalent gains',
    tactics: [
      '"Don\'t miss out" framing on expiring offers',
      'Cart abandonment emails highlighting what they\'ll lose',
      'Expiring bonus content with purchase',
      '"Price increases in X hours" countdown'
    ],
    best_for: ['abandoned cart recovery', 'launch urgency', 'time-limited bundles']
  }
};

// ─── Bundle Design ──────────────────────────────────────────

function designBundle(context) {
  const { products = [], target_segment, theme, margin_floor = 0.3 } = context;

  const bundles = [
    {
      name: `${theme || 'Transformation'} Starter Bundle`,
      type: 'entry_level',
      components: products.slice(0, 2),
      discount_pct: 15,
      psychology: ['anchoring', 'reciprocity'],
      description: 'Entry bundle with price anchor showing individual-item total',
      cross_division_hook: 'Include free chapter from upcoming D5 book release'
    },
    {
      name: `${theme || 'Transformation'} Complete Collection`,
      type: 'premium',
      components: products,
      discount_pct: 25,
      psychology: ['anchoring', 'commitment_consistency', 'scarcity'],
      description: 'Full bundle at deepest discount — anchor against individual purchase total',
      cross_division_hook: 'Add one free D4 coaching intro session ($97 value)'
    },
    {
      name: `${theme || 'Transformation'} Book + Merch Combo`,
      type: 'cross_category',
      components: products.filter(p => p.type === 'book').slice(0, 1)
        .concat(products.filter(p => p.type === 'merch').slice(0, 1)),
      discount_pct: 20,
      psychology: ['reciprocity', 'social_proof'],
      description: 'Pair a book with aligned merch — "wear what you learn"',
      cross_division_hook: 'Feature customer photos wearing merch while reading (D4 community UGC)'
    }
  ];

  return {
    target_segment,
    theme,
    margin_floor,
    bundles,
    recommended_psychology: Object.keys(PSYCHOLOGY_PRINCIPLES)
      .filter(k => PSYCHOLOGY_PRINCIPLES[k].best_for.some(bf => bf.includes('bundle')))
  };
}

// ─── Discount Strategy ──────────────────────────────────────

function generateDiscountPlan(context) {
  const { product_type, current_price, cost, goal, segment } = context;
  const margin = (current_price - cost) / current_price;

  const strategies = [];

  // Tiered discounts
  if (margin > 0.5) {
    strategies.push({
      name: 'Tiered Volume Discount',
      tiers: [
        { qty: '1 item', discount: '0%', price: current_price },
        { qty: '2 items', discount: '10%', price: (current_price * 0.9).toFixed(2) },
        { qty: '3+ items', discount: '20%', price: (current_price * 0.8).toFixed(2) }
      ],
      psychology: 'commitment_consistency',
      projected_aov_lift: '+35%'
    });
  }

  // Flash sale
  strategies.push({
    name: '48h Flash Sale',
    discount: '25%',
    sale_price: (current_price * 0.75).toFixed(2),
    psychology: ['scarcity', 'loss_aversion'],
    recommended_timing: 'Mid-week (Tue-Wed) for best email open rates',
    margin_after: ((current_price * 0.75 - cost) / (current_price * 0.75) * 100).toFixed(1) + '%'
  });

  // Free shipping threshold
  strategies.push({
    name: 'Free Shipping Threshold',
    threshold: (current_price * 2.5).toFixed(2),
    psychology: 'reciprocity',
    description: `Free shipping on orders over $${(current_price * 2.5).toFixed(2)} — drives multi-item purchases`
  });

  // Loyalty/repeat buyer
  strategies.push({
    name: 'Repeat Buyer Reward',
    discount: '15%',
    conditions: 'Second purchase within 60 days',
    psychology: 'commitment_consistency',
    description: 'Post-purchase email with exclusive returning customer code'
  });

  return { product_type, current_price, cost, margin: (margin * 100).toFixed(1) + '%', goal, segment, strategies };
}

// ─── Promotion Calendar ─────────────────────────────────────

function promotionCalendar(quarter) {
  const calendars = {
    Q1: [
      { month: 'January', theme: 'New Year New You', offer: 'Transformation book bundle 20% off', psychology: 'commitment_consistency', cross_div: 'D4 New Year coaching enrollment' },
      { month: 'February', theme: 'Self-Love Collection', offer: 'Spiritual wellness merch launch', psychology: 'social_proof', cross_div: 'D5 self-help book feature' },
      { month: 'March', theme: 'Spring Awakening', offer: 'Buy 2 books get 1 free', psychology: 'reciprocity', cross_div: 'D4 spring retreat promotion' }
    ],
    Q2: [
      { month: 'April', theme: 'Earth Day & Mindfulness', offer: 'Sustainable merch line launch', psychology: 'social_proof', cross_div: 'D6 nonprofit awareness tie-in' },
      { month: 'May', theme: 'Mother\'s Day Gifts', offer: 'Gift bundles — book + merch + card', psychology: 'anchoring', cross_div: 'D5 mother\'s day special edition' },
      { month: 'June', theme: 'Summer Reading', offer: 'Summer reading bundle 25% off', psychology: 'scarcity', cross_div: 'D4 summer mentorship enrollment' }
    ],
    Q3: [
      { month: 'July', theme: 'Mid-Year Reset', offer: 'Journal + workbook bundle', psychology: 'commitment_consistency', cross_div: 'D4 mid-year coaching check-in' },
      { month: 'August', theme: 'Back to Growth', offer: 'Student/teacher discount code', psychology: 'reciprocity', cross_div: 'D3 consulting workshop bundle' },
      { month: 'September', theme: 'Fall Collection Drop', offer: 'New merch line + book pairing', psychology: 'scarcity', cross_div: 'D5 fall book launch' }
    ],
    Q4: [
      { month: 'October', theme: 'Beyond the Veil Special', offer: 'Halloween-themed spiritual bundle', psychology: 'scarcity', cross_div: 'D4 special coaching event' },
      { month: 'November', theme: 'Black Friday / Giving Season', offer: 'Biggest sale — 30% sitewide + gift bundles', psychology: ['scarcity', 'loss_aversion', 'anchoring'], cross_div: 'D6 donate-with-purchase campaign' },
      { month: 'December', theme: 'Gift Giving & Year-End', offer: 'Gift card bundles + free wrapping', psychology: 'reciprocity', cross_div: 'D5 holiday special edition book' }
    ]
  };

  return calendars[quarter] || { error: 'Use Q1, Q2, Q3, or Q4' };
}

// ─── Psychology Audit ───────────────────────────────────────

function psychologyAudit(productPage) {
  const { title, description, price, has_reviews, has_urgency, has_social_proof, has_comparison } = productPage;
  const gaps = [];
  const strengths = [];

  if (!has_reviews) gaps.push({ principle: 'social_proof', fix: 'Add customer reviews/ratings section' });
  else strengths.push('Social proof: Reviews present');

  if (!has_urgency) gaps.push({ principle: 'scarcity', fix: 'Add urgency element — stock count, limited-time badge, or countdown' });
  else strengths.push('Scarcity: Urgency element present');

  if (!has_comparison) gaps.push({ principle: 'anchoring', fix: 'Show "compare at" or bundle value to anchor higher' });
  else strengths.push('Anchoring: Price comparison present');

  if (!has_social_proof) gaps.push({ principle: 'social_proof', fix: 'Add "X people bought today" or testimonial' });

  if (!description || description.length < 200) gaps.push({ principle: 'loss_aversion', fix: 'Expand description to highlight what buyer will miss without this product' });

  return { title, price, strengths, gaps, psychology_score: `${strengths.length}/${strengths.length + gaps.length}` };
}

// ─── CLI ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  try {
    switch (command) {
      case 'bundle':
        if (subcommand === 'design') {
          console.log(JSON.stringify(designBundle(JSON.parse(args[2])), null, 2));
        }
        break;
      case 'discount':
        if (subcommand === 'plan') {
          console.log(JSON.stringify(generateDiscountPlan(JSON.parse(args[2])), null, 2));
        }
        break;
      case 'promotion':
        if (subcommand === 'calendar') {
          console.log(JSON.stringify(promotionCalendar(args[2]), null, 2));
        }
        break;
      case 'psychology':
        if (subcommand === 'audit') {
          console.log(JSON.stringify(psychologyAudit(JSON.parse(args[2])), null, 2));
        }
        break;
      case 'principles':
        console.log(JSON.stringify(PSYCHOLOGY_PRINCIPLES, null, 2));
        break;
      case 'segment':
        if (subcommand === 'offers') {
          console.log(JSON.stringify({
            segment: args[2],
            offers: [
              { type: 'welcome', discount: '10%', trigger: 'First visit', psychology: 'reciprocity' },
              { type: 'returning', discount: '15%', trigger: 'Second purchase', psychology: 'commitment_consistency' },
              { type: 'vip', discount: '20% + free shipping', trigger: '3+ purchases', psychology: 'social_proof' },
              { type: 'win-back', discount: '25%', trigger: '90 days inactive', psychology: 'loss_aversion' }
            ]
          }, null, 2));
        }
        break;
      default:
        console.log('Usage: node offer-psychology-engine.mjs <command> [args...]');
        console.log('Commands: bundle, discount, promotion, psychology, principles, segment');
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
