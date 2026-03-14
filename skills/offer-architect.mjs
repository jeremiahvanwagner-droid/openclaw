#!/usr/bin/env node
/**
 * OpenClaw Offer Architect Agent
 * 
 * Sales Division - Irresistible offer creation and optimization
 * 
 * Features:
 *   - Offer structure design
 *   - Value stacking
 *   - Bonus creation
 *   - Scarcity/urgency strategies
 *   - Offer positioning
 *   - Grand Slam offers (Hormozi style)
 * 
 * Usage: node offer-architect.mjs <command> [args...]
 * 
 * Commands:
 *   create <product>         Create offer structure
 *   stack <price>            Generate value stack
 *   bonuses <product>        Design bonus package
 *   urgency <type>           Create urgency elements
 *   position <offer>         Position against competitors
 *   grandslam <product>      Build Grand Slam offer
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const OFFER_FILE = path.join(DATA_DIR, 'offer-architect-data.json');

// Offer types
const OFFER_TYPES = {
  standalone: {
    name: 'Standalone Product',
    structure: ['Core product', 'Basic guarantee'],
    complexity: 'Simple',
    bestFor: 'Single solution products'
  },
  bundle: {
    name: 'Bundle Offer',
    structure: ['Multiple products', 'Bundle discount', 'Combined guarantee'],
    complexity: 'Medium',
    bestFor: 'Complementary products'
  },
  valueStack: {
    name: 'Value Stack',
    structure: ['Core product', '3-7 bonuses', 'Strong guarantee', 'Urgency element'],
    complexity: 'Medium',
    bestFor: 'Digital products, courses'
  },
  grandSlam: {
    name: 'Grand Slam Offer',
    structure: ['Dream outcome', 'Perceived likelihood', 'Time to achieve', 'Effort required'],
    complexity: 'Advanced',
    bestFor: 'High-ticket, transformation products'
  },
  hybrid: {
    name: 'Hybrid Offer',
    structure: ['Entry product', 'Upsells', 'Downsells', 'Order bumps'],
    complexity: 'Advanced',
    bestFor: 'Funnel optimization'
  }
};

// Bonus categories
const BONUS_CATEGORIES = {
  accelerator: {
    name: 'Accelerator Bonus',
    description: 'Helps achieve results faster',
    examples: ['Quick-start guide', 'Cheat sheet', 'Templates', 'Swipe files'],
    perceivedValue: 'High'
  },
  implementation: {
    name: 'Implementation Bonus',
    description: 'Makes it easier to take action',
    examples: ['Workbooks', 'Worksheets', 'Action plans', 'Checklists'],
    perceivedValue: 'High'
  },
  access: {
    name: 'Access Bonus',
    description: 'Provides additional access',
    examples: ['Group coaching', 'Private community', 'Q&A calls', 'Office hours'],
    perceivedValue: 'Very High'
  },
  tools: {
    name: 'Tools/Resources',
    description: 'Practical tools and resources',
    examples: ['Software access', 'Calculator tools', 'Tracking sheets', 'Scripts'],
    perceivedValue: 'High'
  },
  exclusive: {
    name: 'Exclusive Content',
    description: 'Content not available elsewhere',
    examples: ['Bonus modules', 'Behind-the-scenes', 'Case studies', 'Interviews'],
    perceivedValue: 'Medium-High'
  },
  support: {
    name: 'Support Bonus',
    description: 'Additional support/guidance',
    examples: ['Email support', '1-on-1 call', 'Review feedback', 'Accountability'],
    perceivedValue: 'Very High'
  }
};

// Urgency types
const URGENCY_TYPES = {
  deadline: {
    name: 'Time Deadline',
    description: 'Offer expires at specific time',
    examples: ['Cart closes Friday', 'Enrollment ends tonight', 'Sale ends Sunday'],
    ethical: 'Must be real deadline'
  },
  quantity: {
    name: 'Quantity Limit',
    description: 'Limited number available',
    examples: ['Only 50 spots', 'Limited to 100 copies', 'First 25 only'],
    ethical: 'Must be genuine limit'
  },
  bonusRemoval: {
    name: 'Bonus Removal',
    description: 'Bonuses removed after deadline',
    examples: ['Bonuses removed Monday', 'Fast-action bonus ends tonight'],
    ethical: 'Can be reused ethically'
  },
  priceIncrease: {
    name: 'Price Increase',
    description: 'Price going up',
    examples: ['Price doubles Monday', 'Beta pricing ends soon', 'Founding member rate'],
    ethical: 'Must actually raise price'
  },
  launchWindow: {
    name: 'Launch Window',
    description: 'Only available during launch',
    examples: ['Doors close Friday', 'Enrollment period', 'Cart open limited time'],
    ethical: 'Must close and wait to reopen'
  }
};

// Value equation (from Alex Hormozi)
const VALUE_EQUATION = {
  numerator: {
    dreamOutcome: 'The desired result/transformation',
    perceivedLikelihood: 'Probability of achieving it'
  },
  denominator: {
    timeDelay: 'How long to see results',
    effortSacrifice: 'Work/sacrifice required'
  },
  formula: 'Value = (Dream Outcome × Perceived Likelihood) / (Time Delay × Effort & Sacrifice)',
  optimization: [
    'Increase dream outcome specificity',
    'Add guarantees to increase likelihood',
    'Decrease time with accelerators',
    'Decrease effort with done-for-you elements'
  ]
};

// Data storage
let offerData = {
  offers: [],
  bonuses: [],
  valueStacks: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(OFFER_FILE, 'utf8');
    offerData = JSON.parse(data);
  } catch {
    offerData = { offers: [], bonuses: [], valueStacks: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(OFFER_FILE, JSON.stringify(offerData, null, 2));
}

/**
 * Create offer structure
 */
async function createOffer(product, options = {}) {
  const price = options.price || 997;
  const type = options.type || 'valueStack';
  const offerType = OFFER_TYPES[type] || OFFER_TYPES.valueStack;
  
  const offer = {
    id: `offer-${Date.now()}`,
    product,
    price,
    type,
    template: offerType,
    components: {},
    positioning: {}
  };
  
  // Core offer
  offer.components.core = {
    name: product,
    description: `Complete ${product} system`,
    value: price * 3,
    delivery: 'Instant access'
  };
  
  // Bonuses
  offer.components.bonuses = [
    {
      name: `${product} Quick-Start Guide`,
      category: 'accelerator',
      value: Math.round(price * 0.5),
      description: 'Get started in 30 minutes or less'
    },
    {
      name: 'Implementation Workbook',
      category: 'implementation',
      value: Math.round(price * 0.3),
      description: 'Step-by-step action worksheets'
    },
    {
      name: 'Private Community Access',
      category: 'access',
      value: Math.round(price * 0.5),
      description: 'Connect with other members'
    }
  ];
  
  // Calculate total value
  offer.components.totalValue = offer.components.core.value + 
    offer.components.bonuses.reduce((sum, b) => sum + b.value, 0);
  
  // Guarantee
  offer.components.guarantee = {
    type: 'money-back',
    duration: '30 days',
    terms: 'Full refund if not satisfied',
    name: 'Risk-Free Guarantee'
  };
  
  // Urgency
  offer.components.urgency = {
    type: 'bonusRemoval',
    description: 'Fast-action bonuses removed in 48 hours',
    countdown: true
  };
  
  // Positioning
  offer.positioning = {
    unique: `The only ${product} that [unique mechanism]`,
    comparison: `Unlike [alternatives], this [key differentiator]`,
    transformation: `Go from [current state] to [desired state]`
  };
  
  offer.generatedAt = new Date().toISOString();
  
  offerData.offers.push(offer);
  await saveData();
  
  return offer;
}

/**
 * Generate value stack
 */
async function generateValueStack(targetPrice, options = {}) {
  const price = parseFloat(targetPrice) || 997;
  const multiplier = options.multiplier || 10;
  
  const stack = {
    id: `stack-${Date.now()}`,
    targetPrice: price,
    targetTotalValue: price * multiplier,
    items: [],
    presentation: {}
  };
  
  // Core product (3x price in value)
  stack.items.push({
    order: 1,
    name: 'Core Program',
    type: 'core',
    value: price * 3,
    description: 'The complete system'
  });
  
  // Bonuses to reach 10x
  const bonusTargetValue = (price * multiplier) - (price * 3);
  const bonusValues = [
    { name: 'Bonus 1: Quick-Start Kit', value: Math.round(bonusTargetValue * 0.25) },
    { name: 'Bonus 2: Templates & Swipes', value: Math.round(bonusTargetValue * 0.2) },
    { name: 'Bonus 3: Community Access', value: Math.round(bonusTargetValue * 0.25) },
    { name: 'Bonus 4: Expert Interviews', value: Math.round(bonusTargetValue * 0.15) },
    { name: 'Bonus 5: Fast-Action Bonus', value: Math.round(bonusTargetValue * 0.15) }
  ];
  
  bonusValues.forEach((bonus, i) => {
    stack.items.push({
      order: i + 2,
      name: bonus.name,
      type: 'bonus',
      value: bonus.value,
      description: `$${bonus.value} value`
    });
  });
  
  // Calculate actual total
  stack.actualTotal = stack.items.reduce((sum, item) => sum + item.value, 0);
  stack.savings = stack.actualTotal - price;
  stack.savingsPercent = Math.round((stack.savings / stack.actualTotal) * 100);
  
  // Presentation script
  stack.presentation = {
    intro: `Let me show you everything you're getting today...`,
    perItem: stack.items.map(item => 
      `${item.name}... valued at $${item.value.toLocaleString()}`
    ),
    total: `Total value: $${stack.actualTotal.toLocaleString()}`,
    reveal: `But you won't pay $${stack.actualTotal.toLocaleString()}... not even half that...`,
    price: `Your investment today is just $${price.toLocaleString()}`,
    savings: `That's ${stack.savingsPercent}% off!`
  };
  
  stack.generatedAt = new Date().toISOString();
  
  offerData.valueStacks.push(stack);
  await saveData();
  
  return stack;
}

/**
 * Design bonus package
 */
async function designBonuses(product, options = {}) {
  const price = options.price || 497;
  const bonusCount = options.count || 5;
  
  const bonusPackage = {
    id: `bonuses-${Date.now()}`,
    product,
    bonuses: [],
    strategy: {}
  };
  
  // Generate bonuses from each category
  const categories = Object.keys(BONUS_CATEGORIES);
  
  for (let i = 0; i < bonusCount; i++) {
    const category = categories[i % categories.length];
    const categoryInfo = BONUS_CATEGORIES[category];
    
    bonusPackage.bonuses.push({
      number: i + 1,
      category,
      name: `Bonus ${i + 1}: ${categoryInfo.examples[i % categoryInfo.examples.length]}`,
      type: categoryInfo.name,
      value: Math.round(price * (0.2 + Math.random() * 0.3)),
      perceivedValue: categoryInfo.perceivedValue,
      deliveryTiming: i === 0 ? 'Immediate' : 'With main product',
      purpose: categoryInfo.description
    });
  }
  
  // Calculate total bonus value
  bonusPackage.totalBonusValue = bonusPackage.bonuses.reduce((sum, b) => sum + b.value, 0);
  
  // Strategy recommendations
  bonusPackage.strategy = {
    naming: 'Name bonuses for the outcome they deliver',
    valuation: 'Price at what you could sell them separately',
    ordering: 'Lead with highest-value bonuses',
    fastAction: 'Make 1-2 bonuses time-limited',
    relevance: 'Every bonus should solve a related problem'
  };
  
  bonusPackage.generatedAt = new Date().toISOString();
  
  return bonusPackage;
}

/**
 * Create urgency elements
 */
async function createUrgency(urgencyType, options = {}) {
  const type = URGENCY_TYPES[urgencyType] || URGENCY_TYPES.deadline;
  
  const urgency = {
    id: `urgency-${Date.now()}`,
    type: urgencyType,
    config: type,
    implementation: {},
    copy: {}
  };
  
  switch (urgencyType) {
    case 'deadline':
      urgency.implementation = {
        countdown: true,
        countdownPosition: 'Above CTA and in sticky bar',
        redirectAfter: 'Closed page or waitlist',
        fakeDeadlines: 'NEVER - destroy trust'
      };
      urgency.copy = {
        headline: 'Enrollment Closes In:',
        subline: 'When the timer hits zero, this offer disappears',
        reminder: 'Don\'t miss out - secure your spot now',
        lastChance: 'FINAL HOURS: Your last chance to join'
      };
      break;
      
    case 'quantity':
      urgency.implementation = {
        counter: true,
        realTimeUpdates: 'Update as spots fill',
        soldOut: 'Redirect to waitlist',
        verification: 'Must be genuine limit'
      };
      urgency.copy = {
        headline: 'Only [X] Spots Remaining',
        subline: 'When they\'re gone, enrollment closes',
        reminder: 'Spots are filling fast',
        almostGone: 'WARNING: Less than 10 spots left'
      };
      break;
      
    case 'bonusRemoval':
      urgency.implementation = {
        countdown: true,
        bonusToRemove: 'Most valuable bonus',
        afterDeadline: 'Still available without bonus',
        reusable: 'Yes - can offer again later'
      };
      urgency.copy = {
        headline: 'Fast-Action Bonus Expires In:',
        subline: 'Order now to get [bonus name] included',
        reminder: 'This bonus won\'t be available after midnight',
        value: 'Don\'t miss this $X value bonus'
      };
      break;
      
    default:
      urgency.implementation = {
        mechanism: 'Choose appropriate urgency type',
        ethics: 'Must be genuine and deliverable'
      };
  }
  
  urgency.bestPractices = [
    'Always be truthful - fake urgency destroys trust',
    'Explain WHY there\'s urgency (capacity, pricing, bonuses)',
    'Give adequate notice before deadline',
    'Send reminder emails as deadline approaches',
    'Follow through - actually close/remove when stated'
  ];
  
  urgency.generatedAt = new Date().toISOString();
  
  return urgency;
}

/**
 * Position offer against competitors
 */
async function positionOffer(offer, options = {}) {
  const positioning = {
    id: `position-${Date.now()}`,
    offer,
    differentiation: {},
    messaging: {},
    comparison: []
  };
  
  // Differentiation strategies
  positioning.differentiation = {
    mechanism: {
      name: 'Unique Mechanism',
      description: 'What makes your method different',
      example: 'Unlike [competitors] who focus on [X], we use the [Your Method]'
    },
    audience: {
      name: 'Specific Audience',
      description: 'Narrow the target audience',
      example: '[Product] specifically for [niche audience]'
    },
    result: {
      name: 'Specific Result',
      description: 'Promise a concrete outcome',
      example: '[Exact result] in [timeframe] or [guarantee]'
    },
    delivery: {
      name: 'Delivery Method',
      description: 'How you deliver differently',
      example: '[Live/self-paced/hybrid] with [unique feature]'
    },
    guarantee: {
      name: 'Superior Guarantee',
      description: 'Reduce risk more than competitors',
      example: '[Longer/stronger] guarantee than anyone else'
    }
  };
  
  // Positioning messages
  positioning.messaging = {
    tagline: `The [only/first/most] [product type] that [unique benefit]`,
    hook: `Finally, [benefit] without [common pain point]`,
    comparison: `Why pay $[competitor price] when you can [same result] for $[your price]`,
    transformation: `Go from [before state] to [after state] in [timeframe]`
  };
  
  // Competitive comparison
  positioning.comparison = [
    { factor: 'Price', yours: 'To define', competitors: 'To research' },
    { factor: 'Results', yours: 'To define', competitors: 'To research' },
    { factor: 'Time to result', yours: 'To define', competitors: 'To research' },
    { factor: 'Support level', yours: 'To define', competitors: 'To research' },
    { factor: 'Guarantee', yours: 'To define', competitors: 'To research' }
  ];
  
  positioning.generatedAt = new Date().toISOString();
  
  return positioning;
}

/**
 * Build Grand Slam offer
 */
async function buildGrandSlamOffer(product, options = {}) {
  const grandSlam = {
    id: `grandslam-${Date.now()}`,
    product,
    valueEquation: VALUE_EQUATION,
    components: {},
    finalOffer: {}
  };
  
  // Dream Outcome (increase)
  grandSlam.components.dreamOutcome = {
    current: 'Generic result promise',
    improved: [
      'Make it more specific and measurable',
      'Add timeframe',
      'Include identity transformation',
      'Describe the life after'
    ],
    example: `Go from [specific current state] to [specific desired state] and become [identity]`
  };
  
  // Perceived Likelihood (increase)
  grandSlam.components.perceivedLikelihood = {
    current: 'Hope it works',
    improved: [
      'Add proof/testimonials of others achieving',
      'Show your own results',
      'Provide guarantee that eliminates risk',
      'Break process into clear steps',
      'Add support/accountability'
    ],
    example: 'Join 500+ people who have already [achieved result]'
  };
  
  // Time Delay (decrease)
  grandSlam.components.timeDelay = {
    current: 'Eventually see results',
    improved: [
      'Add quick wins / early results',
      'Create fast-start module',
      'Provide templates to skip steps',
      'Done-for-you elements'
    ],
    example: 'See your first [result] in [short timeframe]'
  };
  
  // Effort & Sacrifice (decrease)
  grandSlam.components.effortSacrifice = {
    current: 'Must do it all yourself',
    improved: [
      'Provide templates and swipes',
      'Offer done-for-you services',
      'Create systems that automate work',
      'Provide support for hard parts'
    ],
    example: '[Result] without [common sacrifice]'
  };
  
  // Final offer structure
  grandSlam.finalOffer = {
    promise: `Get [dream outcome] in [timeframe] without [major sacrifice], guaranteed.`,
    proof: 'Backed by [number] success stories',
    process: 'Using our proven [X]-step system',
    price: 'For less than the cost of [anchoring comparison]',
    guarantee: 'Or you pay nothing'
  };
  
  grandSlam.generatedAt = new Date().toISOString();
  
  return grandSlam;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'create': {
        const product = args.join(' ') || 'Digital Course';
        const offer = await createOffer(product);
        
        console.log('Offer Structure');
        console.log('='.repeat(50));
        console.log(`Product: ${offer.product}`);
        console.log(`Price: $${offer.price}`);
        console.log(`Total Value: $${offer.components.totalValue.toLocaleString()}`);
        console.log(`Bonuses: ${offer.components.bonuses.length}`);
        break;
      }
      
      case 'stack': {
        const price = args[0] || 997;
        const stack = await generateValueStack(price);
        
        console.log('Value Stack');
        console.log('='.repeat(50));
        console.log(`Price: $${stack.targetPrice}`);
        console.log(`Total Value: $${stack.actualTotal.toLocaleString()}`);
        console.log(`Savings: ${stack.savingsPercent}%`);
        console.log('\nItems:');
        for (const item of stack.items.slice(0, 4)) {
          console.log(`  ${item.order}. ${item.name}: $${item.value}`);
        }
        break;
      }
      
      case 'bonuses': {
        const product = args.join(' ') || 'Course';
        const bonuses = await designBonuses(product);
        
        console.log('Bonus Package');
        console.log('='.repeat(50));
        console.log(`Total Bonus Value: $${bonuses.totalBonusValue}`);
        console.log('\nBonuses:');
        for (const bonus of bonuses.bonuses.slice(0, 4)) {
          console.log(`  ${bonus.number}. ${bonus.name}: $${bonus.value}`);
        }
        break;
      }
      
      case 'urgency': {
        const type = args[0] || 'deadline';
        const urgency = await createUrgency(type);
        
        console.log(`Urgency: ${urgency.config.name}`);
        console.log('='.repeat(50));
        console.log(`Type: ${urgency.config.description}`);
        console.log('\nCopy:');
        console.log(`  Headline: ${urgency.copy.headline}`);
        console.log(`  Reminder: ${urgency.copy.reminder}`);
        break;
      }
      
      case 'position': {
        const offer = args.join(' ') || 'My Product';
        const positioning = await positionOffer(offer);
        
        console.log('Offer Positioning');
        console.log('='.repeat(50));
        console.log(`\nDifferentiation strategies:`);
        for (const [key, diff] of Object.entries(positioning.differentiation).slice(0, 3)) {
          console.log(`  ${diff.name}: ${diff.description}`);
        }
        break;
      }
      
      case 'grandslam': {
        const product = args.join(' ') || 'Premium Program';
        const grandSlam = await buildGrandSlamOffer(product);
        
        console.log('Grand Slam Offer');
        console.log('='.repeat(50));
        console.log(`\nFinal Promise:`);
        console.log(`  ${grandSlam.finalOffer.promise}`);
        console.log(`\nFormula: ${grandSlam.valueEquation.formula}`);
        break;
      }
      
      case 'test': {
        console.log('Offer Architect Module');
        console.log('======================');
        console.log(`Offer types: ${Object.keys(OFFER_TYPES).length}`);
        console.log(`Bonus categories: ${Object.keys(BONUS_CATEGORIES).length}`);
        console.log(`Urgency types: ${Object.keys(URGENCY_TYPES).length}`);
        console.log(`Offers created: ${offerData.offers.length}`);
        break;
      }
      
      default:
        console.log('Offer Architect - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  createOffer,
  generateValueStack,
  designBonuses,
  createUrgency,
  positionOffer,
  buildGrandSlamOffer,
  OFFER_TYPES,
  BONUS_CATEGORIES,
  URGENCY_TYPES,
  VALUE_EQUATION
};

// Run CLI
main().catch(console.error);
