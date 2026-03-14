#!/usr/bin/env node
/**
 * OpenClaw Pricing Strategist Agent
 * 
 * Sales Division - Pricing psychology and optimization
 * 
 * Features:
 *   - Pricing psychology principles
 *   - Pricing models
 *   - Tier structure design
 *   - Anchoring strategies
 *   - Price testing frameworks
 *   - Value-based pricing
 * 
 * Usage: node pricing-strategist.mjs <command> [args...]
 * 
 * Commands:
 *   model <type>             Get pricing model details
 *   psychology <principle>   Apply pricing psychology
 *   tiers <product>          Design tier structure
 *   anchor <price>           Create anchoring strategy
 *   test <price>             Generate price testing plan
 *   value <product>          Value-based pricing calc
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const PRICING_FILE = path.join(DATA_DIR, 'pricing-strategist-data.json');

// Pricing models
const PRICING_MODELS = {
  oneTime: {
    name: 'One-Time Payment',
    description: 'Single payment for lifetime access',
    pros: ['Simple', 'Larger upfront revenue', 'Customer owns forever'],
    cons: ['No recurring revenue', 'Support burden', 'Harder to update'],
    bestFor: 'Templates, tools, standalone courses'
  },
  subscription: {
    name: 'Subscription/Membership',
    description: 'Recurring payment for continued access',
    pros: ['Predictable revenue', 'Lower barrier to entry', 'Ongoing relationship'],
    cons: ['Churn management', 'Must deliver ongoing value', 'Complex billing'],
    bestFor: 'SaaS, communities, content libraries'
  },
  paymentPlan: {
    name: 'Payment Plan',
    description: 'One-time price split into payments',
    pros: ['Lower barrier', 'Higher total price', 'More accessible'],
    cons: ['Default risk', 'Admin complexity', 'Cash flow delay'],
    bestFor: 'High-ticket courses, coaching programs'
  },
  tiered: {
    name: 'Tiered Pricing',
    description: 'Multiple price points for different segments',
    pros: ['Captures more market', 'Price anchoring', 'Choice'],
    cons: ['Complexity', 'Cannibalization risk', 'Decision paralysis'],
    bestFor: 'Services, SaaS, course bundles'
  },
  valueBased: {
    name: 'Value-Based Pricing',
    description: 'Price based on value delivered',
    pros: ['Higher margins', 'Aligned incentives', 'Differentiation'],
    cons: ['Harder to calculate', 'Requires trust', 'Varies by client'],
    bestFor: 'Consulting, high-impact solutions'
  },
  freemium: {
    name: 'Freemium',
    description: 'Free tier with paid upgrades',
    pros: ['Massive reach', 'Try before buy', 'Network effects'],
    cons: ['Conversion challenge', 'Support costs', 'Free user expectations'],
    bestFor: 'Apps, tools, SaaS with viral potential'
  }
};

// Pricing psychology
const PRICING_PSYCHOLOGY = {
  charm: {
    name: 'Charm Pricing',
    description: 'Ending prices in 9 or 7',
    example: '$997 instead of $1000',
    why: 'Left-digit bias - brain reads first number',
    whenToUse: 'Most consumer products'
  },
  prestige: {
    name: 'Prestige Pricing',
    description: 'Round numbers for premium positioning',
    example: '$5000 instead of $4997',
    why: 'Signals quality and luxury',
    whenToUse: 'Luxury, high-end services'
  },
  anchoring: {
    name: 'Price Anchoring',
    description: 'Show higher price first',
    example: 'Was $2997, now $997',
    why: 'First price becomes reference point',
    whenToUse: 'Discounts, tier comparisons'
  },
  decoy: {
    name: 'Decoy Effect',
    description: 'Add option to make another look better',
    example: 'Small $3, Medium $6.50, Large $7',
    why: 'Medium-Large gap makes Large obvious choice',
    whenToUse: 'Tier pricing to push specific option'
  },
  bundling: {
    name: 'Price Bundling',
    description: 'Combine items at single price',
    example: 'Course + Templates + Community = $997',
    why: 'Harder to compare individual prices',
    whenToUse: 'Digital products, service packages'
  },
  framing: {
    name: 'Price Framing',
    description: 'Break down to smallest unit',
    example: 'Less than a coffee per day',
    why: 'Makes large numbers digestible',
    whenToUse: 'Subscriptions, payment plans'
  },
  scarcity: {
    name: 'Scarcity Pricing',
    description: 'Limited time/quantity',
    example: 'Only 50 at this price',
    why: 'Fear of missing out drives action',
    whenToUse: 'Launches, special offers',
    ethics: 'Must be genuine'
  },
  oddEven: {
    name: 'Odd-Even Pricing',
    description: 'Odd for deals, even for quality',
    example: 'Odd: $47, Even: $50',
    why: 'Odd feels like deal, even feels premium',
    whenToUse: 'Depending on positioning'
  }
};

// Tier structures
const TIER_TEMPLATES = {
  goodBetterBest: {
    name: 'Good-Better-Best',
    tiers: ['Basic', 'Professional', 'Enterprise'],
    structure: {
      basic: { percentage: 30, features: 'Core only' },
      professional: { percentage: 55, features: 'Core + advanced' },
      enterprise: { percentage: 15, features: 'All + support' }
    },
    recommended: 'Professional (middle tier)'
  },
  lowMidHigh: {
    name: 'Low-Mid-High Ticket',
    tiers: ['DIY', 'Done-With-You', 'Done-For-You'],
    structure: {
      diy: { price: '$97-497', delivery: 'Self-paced' },
      dwy: { price: '$997-2997', delivery: 'Coaching + course' },
      dfy: { price: '$5000+', delivery: 'Full service' }
    },
    recommended: 'Based on client capacity'
  },
  ascending: {
    name: 'Ascension Model',
    tiers: ['Free', 'Low Ticket', 'Core Offer', 'High Ticket'],
    structure: {
      free: { purpose: 'Lead generation' },
      low: { purpose: 'Filter buyers' },
      core: { purpose: 'Main revenue' },
      high: { purpose: 'Premium service' }
    },
    recommended: 'Build full ladder'
  }
};

// Data storage
let pricingData = {
  analyses: [],
  tests: [],
  recommendations: []
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
    pricingData = { analyses: [], tests: [], recommendations: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(PRICING_FILE, JSON.stringify(pricingData, null, 2));
}

/**
 * Get pricing model details
 */
async function getPricingModel(type, options = {}) {
  const result = {
    id: `model-${Date.now()}`,
    requested: type,
    models: []
  };
  
  if (type && PRICING_MODELS[type]) {
    result.models = [PRICING_MODELS[type]];
  } else {
    result.models = Object.values(PRICING_MODELS);
  }
  
  result.selecting = {
    questions: [
      'What does your customer prefer? (lump sum vs ongoing)',
      'Do you need recurring revenue for sustainability?',
      'How complex is your solution?',
      'What does competition charge?',
      'What is the customer\'s willingness to pay?'
    ]
  };
  
  result.generatedAt = new Date().toISOString();
  
  return result;
}

/**
 * Apply pricing psychology
 */
async function applyPsychology(principle, options = {}) {
  const price = options.price || 1000;
  
  const result = {
    id: `psych-${Date.now()}`,
    originalPrice: price,
    principle,
    application: {}
  };
  
  if (principle && PRICING_PSYCHOLOGY[principle]) {
    result.application = PRICING_PSYCHOLOGY[principle];
    
    // Apply the principle to the price
    switch (principle) {
      case 'charm':
        result.suggestedPrice = Math.floor(price / 100) * 100 - 3;
        break;
      case 'prestige':
        result.suggestedPrice = Math.round(price / 500) * 500;
        break;
      case 'anchoring':
        result.anchor = price * 3;
        result.suggestedPrice = price;
        break;
      case 'framing':
        result.suggestedPrice = price;
        result.perDay = (price / 365).toFixed(2);
        result.perMonth = (price / 12).toFixed(2);
        break;
      default:
        result.suggestedPrice = price;
    }
  } else {
    result.application = {
      allPrinciples: Object.keys(PRICING_PSYCHOLOGY),
      message: 'Specify a principle to see details'
    };
  }
  
  result.generatedAt = new Date().toISOString();
  
  return result;
}

/**
 * Design tier structure
 */
async function designTiers(product, options = {}) {
  const basePrice = options.basePrice || 997;
  const template = options.template || 'goodBetterBest';
  const tierTemplate = TIER_TEMPLATES[template] || TIER_TEMPLATES.goodBetterBest;
  
  const tiers = {
    id: `tiers-${Date.now()}`,
    product,
    template,
    config: tierTemplate,
    designed: []
  };
  
  // Design based on Good-Better-Best
  tiers.designed = [
    {
      name: 'Starter',
      price: basePrice,
      displayPrice: '$' + (basePrice - 3),
      features: [
        `Core ${product}`,
        'Basic support',
        '30-day access'
      ],
      target: 'Price-sensitive buyers',
      margin: 'High'
    },
    {
      name: 'Professional',
      price: basePrice * 2,
      displayPrice: '$' + (basePrice * 2 - 3),
      badge: 'Most Popular',
      features: [
        `Everything in Starter`,
        'Bonus modules',
        'Community access',
        'Lifetime access'
      ],
      target: 'Best value seekers',
      margin: 'Higher'
    },
    {
      name: 'Premium',
      price: basePrice * 4,
      displayPrice: '$' + (basePrice * 4 - 3),
      features: [
        `Everything in Professional`,
        '1-on-1 coaching call',
        'Priority support',
        'Future updates'
      ],
      target: 'Results-driven, time-poor',
      margin: 'Highest'
    }
  ];
  
  // Strategy notes
  tiers.strategy = {
    anchor: 'Premium tier anchors value',
    sweetSpot: 'Professional should be obvious choice',
    decoy: 'Starter makes Professional look like deal',
    naming: 'Use aspirational names for higher tiers'
  };
  
  tiers.generatedAt = new Date().toISOString();
  
  return tiers;
}

/**
 * Create anchoring strategy
 */
async function createAnchor(price, options = {}) {
  const targetPrice = parseFloat(price) || 997;
  
  const anchoring = {
    id: `anchor-${Date.now()}`,
    targetPrice,
    strategies: []
  };
  
  anchoring.strategies = [
    {
      type: 'Value Stack Anchor',
      anchor: targetPrice * 10,
      presentation: `Total value: $${(targetPrice * 10).toLocaleString()} | Your price: $${targetPrice}`,
      how: 'Show total value of all components before price'
    },
    {
      type: 'Competitor Anchor',
      anchor: 'Competitor price',
      presentation: `Others charge $X for less. You get more for $${targetPrice}`,
      how: 'Compare to market alternatives'
    },
    {
      type: 'Original Price Anchor',
      anchor: targetPrice * 2,
      presentation: `Was $${(targetPrice * 2).toLocaleString()} → Now $${targetPrice}`,
      how: 'Show discount from "original" price'
    },
    {
      type: 'Cost Comparison Anchor',
      anchor: 'Alternative cost',
      presentation: `DIY would take 6 months and cost $${(targetPrice * 3).toLocaleString()} in time`,
      how: 'Compare to cost of doing it other ways'
    },
    {
      type: 'ROI Anchor',
      anchor: 'Potential return',
      presentation: `This $${targetPrice} investment could return $${(targetPrice * 10).toLocaleString()}+`,
      how: 'Frame as investment with returns'
    }
  ];
  
  anchoring.bestPractices = [
    'Always present anchor before price',
    'Anchor must be believable',
    'Multiple anchors reinforce each other',
    'Let anchor sink in before revealing price'
  ];
  
  anchoring.generatedAt = new Date().toISOString();
  
  return anchoring;
}

/**
 * Generate price testing plan
 */
async function generatePriceTest(price, options = {}) {
  const basePrice = parseFloat(price) || 497;
  
  const testing = {
    id: `test-${Date.now()}`,
    basePrice,
    tests: [],
    methodology: {}
  };
  
  // Test variations
  testing.tests = [
    {
      name: 'Price Points Test',
      variations: [
        { price: basePrice * 0.75, label: 'Lower' },
        { price: basePrice, label: 'Control' },
        { price: basePrice * 1.5, label: 'Higher' },
        { price: basePrice * 2, label: 'Premium' }
      ],
      minimize: 'Traffic required per variation',
      timeframe: '2-4 weeks minimum'
    },
    {
      name: 'Charm vs Round Test',
      variations: [
        { price: basePrice, label: 'Round' },
        { price: basePrice - 3, label: 'Charm (-3)' },
        { price: basePrice - 100 + 97, label: 'Charm (-103)' }
      ],
      measures: 'Conversion rate at checkout',
      timeframe: '2 weeks minimum'
    },
    {
      name: 'Payment Plan Test',
      variations: [
        { price: basePrice, label: 'One-time' },
        { price: `${Math.round(basePrice / 3)} x 3`, label: '3-pay' },
        { price: `${Math.round(basePrice / 6)} x 6`, label: '6-pay' }
      ],
      measures: 'Total revenue and completion rate',
      timeframe: '1 month minimum'
    }
  ];
  
  // Methodology
  testing.methodology = {
    setup: [
      'Define primary metric (usually revenue per visitor)',
      'Calculate sample size needed for significance',
      'Set up tracking and split traffic evenly',
      'Define success criteria upfront'
    ],
    during: [
      'Don\'t peek at results early',
      'Run for full test duration',
      'Monitor for technical issues only'
    ],
    after: [
      'Check statistical significance',
      'Consider secondary metrics',
      'Document learnings',
      'Implement winner'
    ]
  };
  
  testing.generatedAt = new Date().toISOString();
  
  pricingData.tests.push(testing);
  await saveData();
  
  return testing;
}

/**
 * Value-based pricing calculation
 */
async function calculateValuePricing(product, options = {}) {
  const outcomeValue = options.outcomeValue || 10000;
  
  const valuePricing = {
    id: `value-${Date.now()}`,
    product,
    analysis: {},
    recommendation: {}
  };
  
  // Value analysis
  valuePricing.analysis = {
    customerOutcome: outcomeValue,
    questions: [
      'What is the $ value of the result you deliver?',
      'How much time do you save them?',
      'What pain/cost do you eliminate?',
      'What could they earn from this?'
    ],
    calculation: {
      tangibleValue: outcomeValue,
      intangibleValue: Math.round(outcomeValue * 0.3),
      totalValue: Math.round(outcomeValue * 1.3)
    }
  };
  
  // Pricing recommendation
  const totalValue = valuePricing.analysis.calculation.totalValue;
  valuePricing.recommendation = {
    minPrice: Math.round(totalValue * 0.1),
    sweetSpot: Math.round(totalValue * 0.2),
    maxPrice: Math.round(totalValue * 0.3),
    rule: 'Price at 10-30% of value delivered',
    example: `If you save them $${outcomeValue.toLocaleString()}, charge $${Math.round(outcomeValue * 0.2).toLocaleString()}`
  };
  
  valuePricing.communication = {
    frame: `This investment will [outcome worth $${outcomeValue.toLocaleString()}]`,
    roi: `For every $1 you invest, expect $${Math.round(outcomeValue / (outcomeValue * 0.2)).toLocaleString()} in return`,
    comparison: 'Compare to alternatives that cost more and deliver less'
  };
  
  valuePricing.generatedAt = new Date().toISOString();
  
  return valuePricing;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'model': {
        const type = args[0];
        const result = await getPricingModel(type);
        
        console.log('Pricing Models');
        console.log('='.repeat(50));
        for (const model of result.models.slice(0, 3)) {
          console.log(`\n${model.name}:`);
          console.log(`  ${model.description}`);
          console.log(`  Best for: ${model.bestFor}`);
        }
        break;
      }
      
      case 'psychology': {
        const principle = args[0];
        const result = await applyPsychology(principle, { price: 1000 });
        
        console.log('Pricing Psychology');
        console.log('='.repeat(50));
        if (result.application.name) {
          console.log(`\n${result.application.name}:`);
          console.log(`  ${result.application.description}`);
          console.log(`  Example: ${result.application.example}`);
          console.log(`  Suggested: $${result.suggestedPrice}`);
        }
        break;
      }
      
      case 'tiers': {
        const product = args.join(' ') || 'Product';
        const result = await designTiers(product);
        
        console.log('Tier Structure');
        console.log('='.repeat(50));
        for (const tier of result.designed) {
          console.log(`\n${tier.name}: ${tier.displayPrice}${tier.badge ? ' (' + tier.badge + ')' : ''}`);
          console.log(`  Target: ${tier.target}`);
        }
        break;
      }
      
      case 'anchor': {
        const price = args[0] || 997;
        const result = await createAnchor(price);
        
        console.log('Anchoring Strategies');
        console.log('='.repeat(50));
        console.log(`Target price: $${result.targetPrice}`);
        for (const strategy of result.strategies.slice(0, 3)) {
          console.log(`\n${strategy.type}:`);
          console.log(`  ${strategy.presentation}`);
        }
        break;
      }
      
      case 'test': {
        const price = args[0] || 497;
        const result = await generatePriceTest(price);
        
        console.log('Price Testing Plan');
        console.log('='.repeat(50));
        console.log(`Base price: $${result.basePrice}`);
        for (const test of result.tests.slice(0, 2)) {
          console.log(`\n${test.name}:`);
          console.log(`  Timeframe: ${test.timeframe}`);
        }
        break;
      }
      
      case 'value': {
        const product = args.join(' ') || 'Service';
        const result = await calculateValuePricing(product);
        
        console.log('Value-Based Pricing');
        console.log('='.repeat(50));
        console.log(`\nRecommended range:`);
        console.log(`  Min: $${result.recommendation.minPrice.toLocaleString()}`);
        console.log(`  Sweet spot: $${result.recommendation.sweetSpot.toLocaleString()}`);
        console.log(`  Max: $${result.recommendation.maxPrice.toLocaleString()}`);
        break;
      }
      
      case 'test': {
        console.log('Pricing Strategist Module');
        console.log('=========================');
        console.log(`Pricing models: ${Object.keys(PRICING_MODELS).length}`);
        console.log(`Psychology principles: ${Object.keys(PRICING_PSYCHOLOGY).length}`);
        console.log(`Tier templates: ${Object.keys(TIER_TEMPLATES).length}`);
        break;
      }
      
      default:
        console.log('Pricing Strategist - OpenClaw');
        console.log('Run with "model" to see pricing models');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  getPricingModel,
  applyPsychology,
  designTiers,
  createAnchor,
  generatePriceTest,
  calculateValuePricing,
  PRICING_MODELS,
  PRICING_PSYCHOLOGY,
  TIER_TEMPLATES
};

// Run CLI
main().catch(console.error);
