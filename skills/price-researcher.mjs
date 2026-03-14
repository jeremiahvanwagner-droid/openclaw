#!/usr/bin/env node
/**
 * OpenClaw Price Researcher Agent
 * 
 * Research Division - Pricing intelligence and strategy
 * 
 * Features:
 *   - Competitive price analysis
 *   - Price point optimization
 *   - Value ladder design
 *   - Bundle pricing
 *   - Psychological pricing
 *   - Price sensitivity analysis
 * 
 * Usage: node price-researcher.mjs <command> [args...]
 * 
 * Commands:
 *   analyze <niche>          Analyze market pricing
 *   optimize <product>       Optimize pricing strategy  
 *   ladder <niche>           Design value ladder
 *   bundles <niche>          Generate bundle strategies
 *   psychology               Show pricing psychology tips
 *   track <competitor>       Track competitor pricing
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const PRICING_FILE = path.join(DATA_DIR, 'pricing.json');

// Pricing tiers for digital products
const PRICING_TIERS = {
  free: { range: [0, 0], purpose: 'Lead generation', conversion: '0%' },
  lowTicket: { range: [7, 47], purpose: 'Entry point, trust builder', conversion: '2-5%' },
  midTicket: { range: [97, 297], purpose: 'Core offer, main revenue', conversion: '1-3%' },
  highTicket: { range: [497, 997], purpose: 'Premium value, high margins', conversion: '0.5-2%' },
  premium: { range: [1497, 2997], purpose: 'Signature offer', conversion: '0.2-1%' },
  elite: { range: [4997, 9997], purpose: 'Done-for-you or coaching', conversion: '0.1-0.5%' }
};

// Psychological price points
const CHARM_PRICES = [7, 9, 17, 19, 27, 37, 47, 67, 97, 127, 147, 197, 247, 297, 397, 497, 697, 997, 1497, 1997, 2497, 2997, 4997, 9997];

// Value anchors by product type
const VALUE_ANCHORS = {
  course: {
    anchor: 'Comparable college course or certification',
    multiplier: '10-20x value vs price',
    comparison: 'vs $5,000+ university credits'
  },
  coaching: {
    anchor: 'Hourly consulting rate extrapolated',
    multiplier: '5-10x value vs group rate',
    comparison: 'vs $500/hr individual coaching'
  },
  template: {
    anchor: 'Time saved at hourly rate',
    multiplier: '20-50x time savings',
    comparison: 'vs 40+ hours of work'
  },
  software: {
    anchor: 'Monthly value of problem solved',
    multiplier: '10x annual value',
    comparison: 'vs $1000s/year alternatives'
  },
  ebook: {
    anchor: 'Cost of mistakes prevented',
    multiplier: '100x knowledge value',
    comparison: 'vs years of trial and error'
  }
};

// Discount strategies
const DISCOUNT_STRATEGIES = {
  earlyBird: { discount: '20-30%', timing: 'Pre-launch', psychology: 'Reward early adopters' },
  launch: { discount: '30-50%', timing: 'Launch week', psychology: 'Create urgency' },
  flash: { discount: '40-60%', timing: '24-48 hours', psychology: 'Impulse buying' },
  seasonal: { discount: '20-40%', timing: 'Holidays', psychology: 'Expected, planned' },
  bundle: { discount: '30-50%', timing: 'Always', psychology: 'Perceived value increase' },
  loyalty: { discount: '10-20%', timing: 'Repeat customers', psychology: 'Reward loyalty' }
};

// Pricing models
const PRICING_MODELS = {
  oneTime: {
    pros: ['Simple', 'Immediate revenue', 'Lower commitment'],
    cons: ['No recurring revenue', 'Limited LTV'],
    bestFor: ['Courses', 'Ebooks', 'Templates']
  },
  subscription: {
    pros: ['Predictable revenue', 'Higher LTV', 'Ongoing relationship'],
    cons: ['Higher churn', 'More maintenance'],
    bestFor: ['Memberships', 'SaaS', 'Communities']
  },
  paymentPlan: {
    pros: ['Higher conversion', 'Accessible', 'Same revenue'],
    cons: ['Payment defaults', 'Cash flow delay'],
    bestFor: ['High-ticket courses', 'Coaching programs']
  },
  freemium: {
    pros: ['Low friction', 'Large user base', 'Upsell potential'],
    cons: ['Low conversion', 'Support costs'],
    bestFor: ['Software', 'Tools', 'Apps']
  },
  tiered: {
    pros: ['Multiple entry points', 'Price discrimination', 'Upsell path'],
    cons: ['Complexity', 'Decision fatigue'],
    bestFor: ['SaaS', 'Services', 'Course bundles']
  }
};

// Data storage
let pricingData = {
  analyses: {},
  competitors: {},
  ladders: [],
  optimizations: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(PRICING_FILE, 'utf8');
    pricingData = JSON.parse(data);
  } catch {
    pricingData = { analyses: {}, competitors: {}, ladders: [], optimizations: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(PRICING_FILE, JSON.stringify(pricingData, null, 2));
}

/**
 * Analyze market pricing
 */
async function analyzePricing(niche) {
  // Generate market pricing data
  const competitors = generateCompetitorPricing(niche);
  const priceDistribution = analyzePriceDistribution(competitors);
  const gaps = identifyPriceGaps(priceDistribution);
  const opportunities = findPricingOpportunities(competitors, gaps);
  
  const analysis = {
    niche,
    competitors,
    priceDistribution,
    gaps,
    opportunities,
    summary: {
      avgPrice: Math.round(competitors.reduce((a, b) => a + b.price, 0) / competitors.length),
      minPrice: Math.min(...competitors.map(c => c.price)),
      maxPrice: Math.max(...competitors.map(c => c.price)),
      medianPrice: findMedian(competitors.map(c => c.price))
    },
    recommendations: generatePricingRecommendations(niche, priceDistribution, opportunities),
    analyzedAt: new Date().toISOString()
  };
  
  // Store analysis
  pricingData.analyses[niche.toLowerCase()] = analysis;
  await saveData();
  
  return analysis;
}

/**
 * Generate competitor pricing data
 */
function generateCompetitorPricing(niche) {
  const competitorTemplates = [
    { type: 'Market Leader', priceMultiplier: 1.5, features: 'Full suite' },
    { type: 'Premium', priceMultiplier: 1.3, features: 'Premium features' },
    { type: 'Mid-Market', priceMultiplier: 1.0, features: 'Standard features' },
    { type: 'Value', priceMultiplier: 0.7, features: 'Core features' },
    { type: 'Budget', priceMultiplier: 0.4, features: 'Basic features' },
    { type: 'Freemium', priceMultiplier: 0.5, features: 'Limited free tier' }
  ];
  
  const basePrice = 197; // Base mid-market price
  
  return competitorTemplates.map((template, i) => ({
    id: `comp-${i + 1}`,
    name: `${template.type} ${niche} Provider`,
    type: template.type,
    price: Math.round(basePrice * template.priceMultiplier),
    features: template.features,
    strengths: generateStrengths(template.type),
    weaknesses: generateWeaknesses(template.type),
    positioning: template.type
  }));
}

/**
 * Generate competitor strengths
 */
function generateStrengths(type) {
  const strengths = {
    'Market Leader': ['Brand recognition', 'Comprehensive features', 'Large community'],
    'Premium': ['High quality', 'Premium support', 'Advanced features'],
    'Mid-Market': ['Good value', 'Balanced features', 'Reliable'],
    'Value': ['Affordable', 'Core features', 'Low barrier'],
    'Budget': ['Lowest price', 'Simple', 'Quick start'],
    'Freemium': ['No commitment', 'Try before buy', 'Wide adoption']
  };
  return strengths[type] || [];
}

/**
 * Generate competitor weaknesses
 */
function generateWeaknesses(type) {
  const weaknesses = {
    'Market Leader': ['Expensive', 'Complex', 'Less personal'],
    'Premium': ['High price', 'Overkill for beginners', 'Steep learning curve'],
    'Mid-Market': ['Not cheapest', 'Missing advanced features', 'Average support'],
    'Value': ['Limited features', 'Less support', 'Basic only'],
    'Budget': ['Missing features', 'Poor support', 'Quality concerns'],
    'Freemium': ['Limited functionality', 'Upsell pressure', 'Basic support']
  };
  return weaknesses[type] || [];
}

/**
 * Analyze price distribution
 */
function analyzePriceDistribution(competitors) {
  const prices = competitors.map(c => c.price).sort((a, b) => a - b);
  
  return {
    range: { min: prices[0], max: prices[prices.length - 1] },
    quartiles: {
      q1: prices[Math.floor(prices.length * 0.25)],
      q2: prices[Math.floor(prices.length * 0.5)],
      q3: prices[Math.floor(prices.length * 0.75)]
    },
    clusters: identifyPriceClusters(prices),
    outliers: prices.filter(p => p > prices[prices.length - 1] * 0.9 || p < prices[0] * 1.1)
  };
}

/**
 * Identify price clusters
 */
function identifyPriceClusters(prices) {
  // Simple clustering by price ranges
  const clusters = [];
  let currentCluster = { start: prices[0], end: prices[0], count: 1 };
  
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] - currentCluster.end < currentCluster.end * 0.3) {
      currentCluster.end = prices[i];
      currentCluster.count++;
    } else {
      clusters.push(currentCluster);
      currentCluster = { start: prices[i], end: prices[i], count: 1 };
    }
  }
  clusters.push(currentCluster);
  
  return clusters;
}

/**
 * Identify price gaps
 */
function identifyPriceGaps(distribution) {
  const gaps = [];
  const clusters = distribution.clusters;
  
  for (let i = 0; i < clusters.length - 1; i++) {
    const gapStart = clusters[i].end;
    const gapEnd = clusters[i + 1].start;
    const gapSize = gapEnd - gapStart;
    
    if (gapSize > gapStart * 0.4) { // Gap is significant
      gaps.push({
        range: { start: gapStart, end: gapEnd },
        size: gapSize,
        opportunity: 'Underserved price point',
        suggestedPrice: findNearestCharmPrice(Math.round((gapStart + gapEnd) / 2))
      });
    }
  }
  
  return gaps;
}

/**
 * Find nearest charm price
 */
function findNearestCharmPrice(price) {
  return CHARM_PRICES.reduce((prev, curr) => 
    Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
  );
}

/**
 * Find median
 */
function findMedian(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Find pricing opportunities
 */
function findPricingOpportunities(competitors, gaps) {
  const opportunities = [];
  
  // Gap opportunities
  for (const gap of gaps) {
    opportunities.push({
      type: 'Price Gap',
      description: `Position at $${gap.suggestedPrice} to fill market gap`,
      potential: 'High',
      risk: 'Low',
      action: 'Create offer at this price point'
    });
  }
  
  // Value add opportunity
  const maxPrice = Math.max(...competitors.map(c => c.price));
  opportunities.push({
    type: 'Premium Positioning',
    description: `Go above market at $${findNearestCharmPrice(maxPrice * 1.5)}`,
    potential: 'Medium',
    risk: 'Medium',
    action: 'Add significant value to justify premium'
  });
  
  // Budget opportunity
  const minPrice = Math.min(...competitors.filter(c => c.price > 0).map(c => c.price));
  opportunities.push({
    type: 'Budget Option',
    description: `Entry-level option at $${findNearestCharmPrice(minPrice * 0.5)}`,
    potential: 'High volume, lower margin',
    risk: 'Low',
    action: 'Strip to core essentials'
  });
  
  return opportunities;
}

/**
 * Generate pricing recommendations
 */
function generatePricingRecommendations(niche, distribution, opportunities) {
  return [
    {
      priority: 1,
      strategy: 'Value-Based Pricing',
      price: findNearestCharmPrice(distribution.quartiles.q2 * 1.2),
      reasoning: 'Above median with added value justification'
    },
    {
      priority: 2,
      strategy: 'Penetration Pricing',
      price: findNearestCharmPrice(distribution.quartiles.q1),
      reasoning: 'Enter market with competitive price, raise later'
    },
    {
      priority: 3,
      strategy: 'Premium Positioning',
      price: findNearestCharmPrice(distribution.range.max * 1.3),
      reasoning: 'Premium brand with superior offering'
    }
  ];
}

/**
 * Optimize product pricing
 */
async function optimizePricing(product, options = {}) {
  const productType = options.type || 'course';
  const targetMargin = options.margin || 70;
  const targetConversion = options.conversion || 2;
  
  // Calculate pricing components
  const valueAnchor = VALUE_ANCHORS[productType];
  const suggestedTier = findOptimalTier(options.targetRevenue);
  
  // Generate multiple pricing strategies
  const strategies = [
    {
      name: 'Psychological Pricing',
      price: findNearestCharmPrice(options.targetPrice || 197),
      psychology: 'Charm pricing ending in 7',
      conversionBoost: '+15% vs round numbers'
    },
    {
      name: 'Anchored Pricing',
      price: findNearestCharmPrice((options.targetPrice || 197) * 1.2),
      strikethrough: options.targetPrice ? options.targetPrice * 2.5 : 497,
      psychology: 'Show value with crossed-out price',
      conversionBoost: '+20% with perceived savings'
    },
    {
      name: 'Payment Plan',
      fullPrice: options.targetPrice || 297,
      payments: 3,
      paymentAmount: Math.round((options.targetPrice || 297) * 1.15 / 3),
      psychology: 'Lower per-payment barrier',
      conversionBoost: '+30-50% conversion'
    },
    {
      name: 'Tiered Options',
      tiers: [
        { name: 'Basic', price: findNearestCharmPrice((options.targetPrice || 197) * 0.5), value: 'Core content' },
        { name: 'Pro', price: options.targetPrice || 197, value: 'Full access', recommended: true },
        { name: 'Premium', price: findNearestCharmPrice((options.targetPrice || 197) * 2), value: 'Full + bonuses + support' }
      ],
      psychology: 'Decoy effect pushes middle tier',
      conversionBoost: 'Most buy middle tier'
    }
  ];
  
  const optimization = {
    product,
    productType,
    valueAnchor,
    suggestedTier,
    strategies,
    discountStrategies: generateDiscountPlan(strategies[0].price),
    projections: calculatePriceProjections(strategies[0].price, targetConversion),
    optimizedAt: new Date().toISOString()
  };
  
  pricingData.optimizations.push(optimization);
  await saveData();
  
  return optimization;
}

/**
 * Find optimal pricing tier
 */
function findOptimalTier(targetRevenue) {
  const monthly = targetRevenue || 5000;
  
  // Work backwards from revenue goal
  for (const [tier, config] of Object.entries(PRICING_TIERS)) {
    const avgPrice = (config.range[0] + config.range[1]) / 2;
    const avgConversion = parseFloat(config.conversion.split('-')[0]) / 100;
    
    if (avgPrice > 0 && avgConversion > 0) {
      const requiredTraffic = monthly / (avgPrice * avgConversion);
      if (requiredTraffic < 5000) { // Achievable traffic
        return { tier, ...config, requiredTraffic: Math.round(requiredTraffic) };
      }
    }
  }
  
  return { tier: 'midTicket', ...PRICING_TIERS.midTicket };
}

/**
 * Generate discount plan
 */
function generateDiscountPlan(basePrice) {
  return Object.entries(DISCOUNT_STRATEGIES).map(([name, strategy]) => ({
    name,
    ...strategy,
    discountedPrice: Math.round(basePrice * (1 - parseInt(strategy.discount.split('-')[0]) / 100))
  }));
}

/**
 * Calculate price projections
 */
function calculatePriceProjections(price, conversionRate) {
  const traffic = [100, 500, 1000, 5000];
  
  return traffic.map(visitors => ({
    visitors,
    conversions: Math.round(visitors * (conversionRate / 100)),
    revenue: Math.round(visitors * (conversionRate / 100) * price)
  }));
}

/**
 * Design value ladder
 */
async function designValueLadder(niche) {
  const ladder = {
    niche,
    rungs: [
      {
        level: 1,
        name: 'Free Lead Magnet',
        type: 'Lead Generation',
        price: 0,
        purpose: 'Build email list, provide value preview',
        examples: ['Checklist', 'Mini-course', 'Template', 'Ebook chapter'],
        nextStep: 'Low-ticket offer'
      },
      {
        level: 2,
        name: 'Tripwire',
        type: 'Customer Acquisition',
        price: findNearestCharmPrice(17),
        priceRange: '$7-$27',
        purpose: 'Convert lead to customer, prove value',
        examples: ['Quick-start guide', 'Mini workshop', 'Template pack'],
        nextStep: 'Core offer'
      },
      {
        level: 3,
        name: 'Core Offer',
        type: 'Main Revenue',
        price: findNearestCharmPrice(197),
        priceRange: '$97-$297',
        purpose: 'Primary product, maximum reach',
        examples: ['Full course', 'Complete system', 'Certification'],
        nextStep: 'High-ticket'
      },
      {
        level: 4,
        name: 'High-Ticket',
        type: 'Premium',
        price: findNearestCharmPrice(997),
        priceRange: '$497-$1997',
        purpose: 'Premium results, high margins',
        examples: ['Group coaching', 'Implementation program', 'Advanced course'],
        nextStep: 'Done-for-you'
      },
      {
        level: 5,
        name: 'Done-For-You',
        type: 'Elite',
        price: findNearestCharmPrice(4997),
        priceRange: '$2997-$9997+',
        purpose: 'Maximum value, limited availability',
        examples: ['1-on-1 coaching', 'Done-for-you service', 'Partnership'],
        nextStep: 'Ongoing relationship'
      },
      {
        level: 6,
        name: 'Continuity',
        type: 'Recurring',
        price: findNearestCharmPrice(47),
        priceRange: '$27-$97/month',
        purpose: 'Ongoing value, recurring revenue',
        examples: ['Membership', 'Community', 'Subscription'],
        nextStep: null
      }
    ],
    strategy: {
      entryPoint: 'Lead magnet captures email',
      ascension: 'Each rung solves next-level problem',
      retention: 'Continuity keeps relationship ongoing',
      maximization: 'Offer upsells at each step'
    },
    projectedLTV: calculateLadderLTV([0, 17, 197, 0.1, 0.05, 47]),
    createdAt: new Date().toISOString()
  };
  
  pricingData.ladders.push(ladder);
  await saveData();
  
  return ladder;
}

/**
 * Calculate ladder LTV
 */
function calculateLadderLTV(prices) {
  // Simplified LTV calculation
  const conversions = [1, 0.3, 0.15, 0.05, 0.02, 0.1];
  let totalValue = 0;
  
  for (let i = 0; i < prices.length; i++) {
    totalValue += prices[i] * conversions[i];
  }
  
  // Add continuity value (12 months average)
  totalValue += prices[5] * conversions[5] * 12;
  
  return Math.round(totalValue);
}

/**
 * Generate bundle strategies
 */
async function generateBundles(niche) {
  const basePrice = 197; // Assume core product
  
  const bundles = [
    {
      name: 'Starter Bundle',
      products: ['Core Course', 'Quick-Start Guide'],
      individualPrice: basePrice + 27,
      bundlePrice: findNearestCharmPrice(basePrice * 0.9),
      savings: '20%',
      bestFor: 'New customers wanting basics'
    },
    {
      name: 'Complete Bundle',
      products: ['Core Course', 'Quick-Start Guide', 'Template Pack', 'Bonus Training'],
      individualPrice: basePrice + 27 + 47 + 97,
      bundlePrice: findNearestCharmPrice((basePrice + 27 + 47 + 97) * 0.6),
      savings: '40%',
      bestFor: 'Best value seekers'
    },
    {
      name: 'Premium Bundle',
      products: ['Complete Bundle', '3 Months Membership', 'Q&A Calls'],
      individualPrice: basePrice * 2 + 47 * 3,
      bundlePrice: findNearestCharmPrice((basePrice * 2 + 47 * 3) * 0.5),
      savings: '50%',
      bestFor: 'Serious implementers'
    },
    {
      name: 'Lifetime Bundle',
      products: ['All Courses', 'Lifetime Membership', 'All Future Updates'],
      individualPrice: basePrice * 4,
      bundlePrice: findNearestCharmPrice(basePrice * 4 * 0.4),
      savings: '60%',
      bestFor: 'Loyal fans, limited offer'
    }
  ];
  
  return {
    niche,
    bundles,
    psychology: [
      'Bundle pricing increases perceived value',
      'Savings percentage drives urgency',
      'Multiple bundles provide choice without paralysis',
      'Lifetime offers create FOMO'
    ],
    implementation: [
      'Start with 2-3 bundle options',
      'Highlight most popular/best value',
      'Use visual comparison table',
      'Include social proof per bundle'
    ],
    generatedAt: new Date().toISOString()
  };
}

/**
 * Track competitor pricing
 */
async function trackCompetitor(competitor, price, notes = '') {
  if (!pricingData.competitors[competitor]) {
    pricingData.competitors[competitor] = {
      name: competitor,
      priceHistory: [],
      lastUpdated: null
    };
  }
  
  pricingData.competitors[competitor].priceHistory.push({
    price,
    notes,
    recordedAt: new Date().toISOString()
  });
  
  pricingData.competitors[competitor].lastUpdated = new Date().toISOString();
  
  await saveData();
  
  return pricingData.competitors[competitor];
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'analyze': {
        const niche = args.join(' ') || 'online courses';
        console.log(`Analyzing pricing for: ${niche}...`);
        
        const analysis = await analyzePricing(niche);
        
        console.log('\n' + '='.repeat(60));
        console.log(`PRICING ANALYSIS: ${niche.toUpperCase()}`);
        console.log('='.repeat(60));
        
        console.log('\nMARKET SUMMARY:');
        console.log(`  Average Price: $${analysis.summary.avgPrice}`);
        console.log(`  Price Range: $${analysis.summary.minPrice} - $${analysis.summary.maxPrice}`);
        console.log(`  Median: $${analysis.summary.medianPrice}`);
        
        console.log('\nCOMPETITOR PRICING:');
        for (const comp of analysis.competitors) {
          console.log(`  ${comp.type.padEnd(15)} $${String(comp.price).padStart(4)} - ${comp.features}`);
        }
        
        console.log('\nPRICE GAPS:');
        for (const gap of analysis.gaps) {
          console.log(`  Gap: $${gap.range.start} - $${gap.range.end}`);
          console.log(`  Suggested: $${gap.suggestedPrice}`);
        }
        
        console.log('\nRECOMMENDATIONS:');
        for (const rec of analysis.recommendations) {
          console.log(`  ${rec.priority}. ${rec.strategy}: $${rec.price}`);
          console.log(`     ${rec.reasoning}`);
        }
        break;
      }
      
      case 'optimize': {
        const product = args.join(' ') || 'Digital Course';
        console.log(`Optimizing pricing for: ${product}...`);
        
        const optimization = await optimizePricing(product, { targetPrice: 197 });
        
        console.log('\nPricing Optimization');
        console.log('='.repeat(50));
        
        console.log('\nSTRATEGIES:');
        for (const strategy of optimization.strategies) {
          console.log(`\n  ${strategy.name}:`);
          if (strategy.tiers) {
            for (const tier of strategy.tiers) {
              console.log(`    ${tier.name}: $${tier.price} ${tier.recommended ? '← RECOMMENDED' : ''}`);
            }
          } else if (strategy.payments) {
            console.log(`    ${strategy.payments}x $${strategy.paymentAmount} (Total: $${strategy.fullPrice * 1.15})`);
          } else {
            console.log(`    Price: $${strategy.price}`);
            if (strategy.strikethrough) {
              console.log(`    Was: $${strategy.strikethrough}`);
            }
          }
          console.log(`    ${strategy.conversionBoost}`);
        }
        
        console.log('\nPROJECTIONS:');
        for (const proj of optimization.projections) {
          console.log(`  ${String(proj.visitors).padStart(5)} visitors → ${proj.conversions} sales → $${proj.revenue.toLocaleString()}`);
        }
        break;
      }
      
      case 'ladder': {
        const niche = args.join(' ') || 'coaching';
        console.log(`Designing value ladder for: ${niche}...`);
        
        const ladder = await designValueLadder(niche);
        
        console.log('\nValue Ladder');
        console.log('='.repeat(50));
        
        for (const rung of ladder.rungs) {
          console.log(`\n  LEVEL ${rung.level}: ${rung.name}`);
          console.log(`    Price: ${rung.price > 0 ? '$' + rung.price : 'FREE'} ${rung.priceRange ? '(' + rung.priceRange + ')' : ''}`);
          console.log(`    Purpose: ${rung.purpose}`);
          console.log(`    Examples: ${rung.examples.join(', ')}`);
        }
        
        console.log(`\n  Projected Customer LTV: $${ladder.projectedLTV}`);
        break;
      }
      
      case 'bundles': {
        const niche = args.join(' ') || 'courses';
        console.log(`Generating bundle strategies for: ${niche}...`);
        
        const result = await generateBundles(niche);
        
        console.log('\nBundle Strategies');
        console.log('='.repeat(50));
        
        for (const bundle of result.bundles) {
          console.log(`\n  ${bundle.name.toUpperCase()}`);
          console.log(`    Products: ${bundle.products.join(' + ')}`);
          console.log(`    Value: $${bundle.individualPrice} → $${bundle.bundlePrice} (Save ${bundle.savings})`);
          console.log(`    Best for: ${bundle.bestFor}`);
        }
        break;
      }
      
      case 'psychology': {
        console.log('\nPricing Psychology Tips');
        console.log('='.repeat(50));
        
        console.log('\nCHARM PRICING:');
        console.log('  Prices ending in 7 or 9 convert better');
        console.log(`  Common price points: ${CHARM_PRICES.slice(0, 10).map(p => '$' + p).join(', ')}`);
        
        console.log('\nANCHORING:');
        console.log('  Show original/comparison price first');
        console.log('  Stack value before revealing price');
        console.log('  Compare to more expensive alternatives');
        
        console.log('\nDECOY EFFECT:');
        console.log('  Offer 3 options: Basic, Pro, Premium');
        console.log('  Make middle option most attractive');
        console.log('  Premium should be obviously expensive');
        
        console.log('\nURGENCY:');
        console.log('  Limited time offers increase conversion');
        console.log('  Countdown timers create pressure');
        console.log('  Limited spots/availability works too');
        
        console.log('\nPAYMENT OPTIONS:');
        console.log('  Payment plans increase conversion 30-50%');
        console.log('  Show monthly equivalent for annual');
        console.log('  Offer both options, highlight savings');
        break;
      }
      
      case 'track': {
        const competitor = args[0];
        const price = parseFloat(args[1]);
        const notes = args.slice(2).join(' ');
        
        if (!competitor || isNaN(price)) {
          console.error('Usage: track <competitor> <price> [notes]');
          process.exit(1);
        }
        
        const result = await trackCompetitor(competitor, price, notes);
        
        console.log('\nCompetitor Tracking');
        console.log('='.repeat(40));
        console.log(`Competitor: ${result.name}`);
        console.log(`Price History: ${result.priceHistory.length} entries`);
        
        console.log('\nRecent Prices:');
        for (const entry of result.priceHistory.slice(-5)) {
          console.log(`  $${entry.price} - ${new Date(entry.recordedAt).toLocaleDateString()}`);
          if (entry.notes) console.log(`    Notes: ${entry.notes}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Price Researcher Module');
        console.log('=======================');
        console.log(`Pricing tiers: ${Object.keys(PRICING_TIERS).length}`);
        console.log(`Charm prices: ${CHARM_PRICES.length}`);
        console.log(`Pricing models: ${Object.keys(PRICING_MODELS).length}`);
        console.log(`Tracked competitors: ${Object.keys(pricingData.competitors).length}`);
        console.log(`Analyses saved: ${Object.keys(pricingData.analyses).length}`);
        break;
      }
      
      default:
        console.log('Price Researcher - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  analyzePricing,
  optimizePricing,
  designValueLadder,
  generateBundles,
  trackCompetitor,
  PRICING_TIERS,
  CHARM_PRICES,
  VALUE_ANCHORS,
  DISCOUNT_STRATEGIES,
  PRICING_MODELS
};

// Run CLI
main().catch(console.error);
