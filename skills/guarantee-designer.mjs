#!/usr/bin/env node
/**
 * OpenClaw Guarantee Designer Agent
 * 
 * Sales Division - Guarantee and risk reversal design
 * 
 * Features:
 *   - Guarantee types
 *   - Risk reversal strategies
 *   - Guarantee copy templates
 *   - Conditional guarantees
 *   - Guarantee badges
 *   - Refund policy design
 * 
 * Usage: node guarantee-designer.mjs <command> [args...]
 * 
 * Commands:
 *   types                    List guarantee types
 *   design <type>            Design a guarantee
 *   risk <product>           Create risk reversal strategy
 *   copy <guarantee>         Generate guarantee copy
 *   badge <type>             Create guarantee badge
 *   policy <duration>        Generate refund policy
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const GUARANTEE_FILE = path.join(DATA_DIR, 'guarantee-designer-data.json');

// Guarantee types
const GUARANTEE_TYPES = {
  moneyBack: {
    name: 'Money-Back Guarantee',
    description: 'Full refund within specified period',
    duration: '30-60 days',
    riskLevel: 'Medium',
    conversionImpact: 'High',
    example: '30-Day Money-Back Guarantee',
    conditions: 'No questions asked'
  },
  conditional: {
    name: 'Conditional Guarantee',
    description: 'Refund if specific conditions met',
    duration: 'Varies',
    riskLevel: 'Low',
    conversionImpact: 'Medium-High',
    example: 'Complete all modules + apply strategies = guarantee applies',
    conditions: 'Must prove implementation'
  },
  results: {
    name: 'Results Guarantee',
    description: 'Guarantee specific outcome',
    duration: '90+ days',
    riskLevel: 'High',
    conversionImpact: 'Very High',
    example: 'Double your revenue or money back',
    conditions: 'Must show baseline, follow program'
  },
  betterThan: {
    name: 'Better-Than Money Back',
    description: 'Refund plus additional compensation',
    duration: '30-60 days',
    riskLevel: 'High',
    conversionImpact: 'Very High',
    example: 'Full refund + keep the bonuses',
    conditions: 'Strong confidence in product'
  },
  satisfaction: {
    name: 'Satisfaction Guarantee',
    description: 'Happiness-based guarantee',
    duration: '14-30 days',
    riskLevel: 'Medium',
    conversionImpact: 'Medium',
    example: '100% Satisfaction Guarantee',
    conditions: 'Subjective - customer\'s call'
  },
  trial: {
    name: 'Free Trial',
    description: 'Try before you buy',
    duration: '7-30 days',
    riskLevel: 'Very Low',
    conversionImpact: 'High',
    example: '14-Day Free Trial',
    conditions: 'No payment required until trial ends'
  },
  lifetime: {
    name: 'Lifetime Guarantee',
    description: 'Refund anytime, forever',
    duration: 'Unlimited',
    riskLevel: 'Very High',
    conversionImpact: 'Very High',
    example: 'Lifetime Money-Back Guarantee',
    conditions: 'Extreme confidence required'
  },
  proRata: {
    name: 'Pro-Rata Refund',
    description: 'Partial refund based on usage',
    duration: 'Anytime',
    riskLevel: 'Low',
    conversionImpact: 'Medium',
    example: 'Cancel anytime, unused portion refunded',
    conditions: 'For subscriptions'
  }
};

// Risk reversal strategies
const RISK_REVERSAL = {
  completeReversal: {
    name: 'Complete Risk Reversal',
    description: 'All risk on you, none on customer',
    elements: ['Full refund', 'Keep bonuses', 'No questions'],
    effectiveness: 'Maximum',
    bestFor: 'High-ticket, proven products'
  },
  partialReversal: {
    name: 'Partial Risk Reversal',
    description: 'Share risk with customer',
    elements: ['Partial refund', 'Some conditions', 'Time limit'],
    effectiveness: 'High',
    bestFor: 'Medium-ticket, with caveats'
  },
  conditionalReversal: {
    name: 'Conditional Reversal',
    description: 'Refund if they do the work',
    elements: ['Implementation required', 'Proof needed', 'Support offered'],
    effectiveness: 'High',
    bestFor: 'Courses, coaching'
  },
  outcomeReversal: {
    name: 'Outcome-Based Reversal',
    description: 'Promise specific measurable result',
    elements: ['Defined outcome', 'Measurement criteria', 'Timeline'],
    effectiveness: 'Maximum',
    bestFor: 'Services with trackable results'
  }
};

// Copy templates
const COPY_TEMPLATES = {
  strong: {
    headline: 'Ironclad [Duration]-Day Money-Back Guarantee',
    body: `Try [Product] completely risk-free for [duration] days. 
    
If for ANY reason you're not 100% satisfied, simply email us and we'll refund every penny. No questions asked. No hoops to jump through.

We're so confident [Product] will [benefit] that we're taking all the risk off your shoulders and putting it on ours.`,
    cta: 'Order now with confidence'
  },
  conditional: {
    headline: 'Results-Based Guarantee',
    body: `Here's how confident we are in [Product]:

Complete the program, implement the strategies, and if you don't see [specific result] within [timeline], we'll refund 100% of your investment.

All we ask is that you:
1. [Condition 1]
2. [Condition 2]
3. [Condition 3]

Then show us you did the work. If you don't get results, you get your money back. Period.`,
    cta: 'Try it risk-free'
  },
  betterThan: {
    headline: 'Better-Than-Money-Back Guarantee',
    body: `We believe in [Product] so much, if it doesn't work for you, you don't just get your money back...

You get to KEEP all the bonuses (worth $[value]) as our way of saying thank you for giving us a try.

That's right - even if you ask for a refund, you keep:
- [Bonus 1]
- [Bonus 2]  
- [Bonus 3]

We can offer this because we know [Product] works.`,
    cta: 'Get started now'
  }
};

// Data storage
let guaranteeData = {
  guarantees: [],
  policies: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(GUARANTEE_FILE, 'utf8');
    guaranteeData = JSON.parse(data);
  } catch {
    guaranteeData = { guarantees: [], policies: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(GUARANTEE_FILE, JSON.stringify(guaranteeData, null, 2));
}

/**
 * List all guarantee types
 */
async function listGuaranteeTypes() {
  const result = {
    id: `types-${Date.now()}`,
    types: Object.entries(GUARANTEE_TYPES).map(([key, value]) => ({
      id: key,
      ...value
    })),
    selecting: {}
  };
  
  result.selecting = {
    byConfidence: {
      high: ['moneyBack', 'betterThan', 'lifetime', 'results'],
      medium: ['conditional', 'satisfaction'],
      building: ['trial', 'proRata']
    },
    byProduct: {
      courses: 'conditional or moneyBack',
      software: 'trial or proRata',
      services: 'results or satisfaction',
      coaching: 'conditional'
    }
  };
  
  result.generatedAt = new Date().toISOString();
  
  return result;
}

/**
 * Design a guarantee
 */
async function designGuarantee(type, options = {}) {
  const guaranteeType = GUARANTEE_TYPES[type] || GUARANTEE_TYPES.moneyBack;
  const product = options.product || 'the product';
  const duration = options.duration || 30;
  
  const guarantee = {
    id: `guarantee-${Date.now()}`,
    type,
    config: guaranteeType,
    designed: {},
    implementation: {}
  };
  
  // Design the guarantee
  guarantee.designed = {
    name: `${duration}-Day ${guaranteeType.name}`,
    duration: `${duration} days`,
    terms: [],
    exclusions: []
  };
  
  // Terms based on type
  switch (type) {
    case 'conditional':
      guarantee.designed.terms = [
        `Complete all core modules/content`,
        `Implement at least [X] strategies`,
        `Show proof of implementation`,
        `Request refund within ${duration} days`
      ];
      guarantee.designed.exclusions = [
        'Requests without proof of completion',
        'Requests after deadline'
      ];
      break;
      
    case 'results':
      guarantee.designed.terms = [
        `Achieve measurable baseline before starting`,
        `Follow the program as designed`,
        `Allow full ${duration} days for results`,
        `Provide proof of following system`
      ];
      guarantee.designed.exclusions = [
        'Results not due to program',
        'No baseline established'
      ];
      break;
      
    default:
      guarantee.designed.terms = [
        `Try ${product} risk-free for ${duration} days`,
        `Full refund for any reason`,
        `No questions asked`
      ];
      guarantee.designed.exclusions = [
        `Requests after ${duration} days`
      ];
  }
  
  // Implementation
  guarantee.implementation = {
    display: [
      'Below pricing on sales page',
      'Near checkout button',
      'In email follow-ups'
    ],
    process: [
      'Document clear refund process',
      'Honor all refund requests as stated',
      'Make it easy (single email)',
      'Process within 5-7 business days'
    ],
    tracking: [
      'Track refund rate',
      'Note reasons for refunds',
      'Use data to improve product'
    ]
  };
  
  guarantee.generatedAt = new Date().toISOString();
  
  guaranteeData.guarantees.push(guarantee);
  await saveData();
  
  return guarantee;
}

/**
 * Create risk reversal strategy
 */
async function createRiskReversal(product, options = {}) {
  const price = options.price || 997;
  
  const strategy = {
    id: `risk-${Date.now()}`,
    product,
    price,
    analysis: {},
    recommendations: []
  };
  
  // Analyze customer risks
  strategy.analysis = {
    customerRisks: [
      { risk: 'Product doesn\'t work', mitigation: 'Results guarantee' },
      { risk: 'Product not as described', mitigation: 'Money-back guarantee' },
      { risk: 'Won\'t use it', mitigation: 'Implementation support' },
      { risk: 'Not the right time', mitigation: 'Lifetime access' },
      { risk: 'Buyer\'s remorse', mitigation: 'Cooling-off period' }
    ],
    priceRisk: {
      level: price > 500 ? 'High' : price > 100 ? 'Medium' : 'Low',
      recommendation: price > 500 ? 'Strong guarantee required' : 'Standard guarantee sufficient'
    }
  };
  
  // Recommendations based on price
  if (price > 1000) {
    strategy.recommendations = [
      {
        type: 'Full Risk Reversal',
        guarantee: '60-90 Day Money Back',
        extras: ['Keep bonuses', 'Implementation support', 'Q&A access'],
        rationale: 'High price requires maximum trust'
      }
    ];
  } else if (price > 200) {
    strategy.recommendations = [
      {
        type: 'Standard Risk Reversal',
        guarantee: '30-Day Money Back',
        extras: ['No questions asked'],
        rationale: 'Balance of protection and simplicity'
      }
    ];
  } else {
    strategy.recommendations = [
      {
        type: 'Light Risk Reversal',
        guarantee: '14-Day Money Back',
        extras: ['Satisfaction focused'],
        rationale: 'Low price, lower friction needed'
      }
    ];
  }
  
  // Stack elements
  strategy.riskReversalStack = [
    '1. Money-back guarantee (time-based)',
    '2. Results guarantee (outcome-based)',
    '3. Keep bonuses even if refund',
    '4. Support included',
    '5. Future updates included'
  ];
  
  strategy.generatedAt = new Date().toISOString();
  
  return strategy;
}

/**
 * Generate guarantee copy
 */
async function generateGuaranteeCopy(guaranteeType, options = {}) {
  const duration = options.duration || 30;
  const product = options.product || 'the program';
  
  const copy = {
    id: `copy-${Date.now()}`,
    type: guaranteeType,
    versions: {}
  };
  
  // Generate versions
  copy.versions = {
    headline: {
      strong: `Ironclad ${duration}-Day Money-Back Guarantee`,
      professional: `${duration}-Day 100% Satisfaction Guarantee`,
      bold: `Risk-Free ${duration}-Day Trial`,
      simple: `${duration}-Day Money Back`
    },
    subheadline: {
      strong: 'Try it completely risk-free. Love it or get every penny back.',
      professional: 'Your satisfaction is our priority.',
      bold: 'We\'re betting the farm that you\'ll love it.',
      simple: 'No questions asked. No hassle.'
    },
    body: {
      detailed: `We're so confident that ${product} will help you [achieve result] that we're removing ALL the risk from your decision.

Try it for ${duration} days. Go through the entire program. Apply what you learn.

If for ANY reason—or no reason at all—you're not completely satisfied, just send us one email and we'll refund 100% of your investment.

No questions. No hoops. No hard feelings.

Why can we make this guarantee? Because ${product} has helped [X] people achieve [results]. We know it works. And we want you to experience the same success.

The only risk? Not taking action today.`,
      concise: `Try ${product} risk-free for ${duration} days. If you're not satisfied for any reason, we'll refund every penny. No questions asked.`
    }
  };
  
  // Badge text
  copy.badge = {
    text: `${duration}-DAY GUARANTEE`,
    subtext: '100% Money Back'
  };
  
  copy.generatedAt = new Date().toISOString();
  
  return copy;
}

/**
 * Create guarantee badge
 */
async function createBadge(type, options = {}) {
  const duration = options.duration || 30;
  
  const badge = {
    id: `badge-${Date.now()}`,
    type,
    design: {},
    placement: []
  };
  
  // Badge design elements
  badge.design = {
    shape: 'Shield, Circle, or Seal',
    colors: {
      trust: '#2563eb (blue)',
      quality: '#059669 (green)',
      premium: '#7c3aed (purple)'
    },
    elements: [
      'Duration prominently displayed',
      'Icon (checkmark, shield, ribbon)',
      'Text: "Money-Back Guarantee"',
      'Optional: 100% satisfaction'
    ],
    svg: `
<svg width="120" height="120" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="55" fill="#2563eb" opacity="0.1"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="#2563eb" stroke-width="3"/>
  <text x="60" y="45" text-anchor="middle" fill="#2563eb" font-weight="bold" font-size="24">${duration}</text>
  <text x="60" y="62" text-anchor="middle" fill="#2563eb" font-size="12">DAY</text>
  <text x="60" y="78" text-anchor="middle" fill="#2563eb" font-size="10">MONEY BACK</text>
  <text x="60" y="92" text-anchor="middle" fill="#2563eb" font-size="10">GUARANTEE</text>
</svg>`.trim()
  };
  
  // Placement recommendations
  badge.placement = [
    { location: 'Near price', reason: 'Reduces price anxiety' },
    { location: 'Next to CTA', reason: 'Builds confidence to click' },
    { location: 'Above checkout form', reason: 'Reduces cart abandonment' },
    { location: 'In testimonials section', reason: 'Reinforces trust' }
  ];
  
  badge.generatedAt = new Date().toISOString();
  
  return badge;
}

/**
 * Generate refund policy
 */
async function generateRefundPolicy(duration, options = {}) {
  const days = parseInt(duration) || 30;
  const productType = options.productType || 'digital product';
  
  const policy = {
    id: `policy-${Date.now()}`,
    duration: days,
    sections: []
  };
  
  policy.sections = [
    {
      heading: 'Refund Policy',
      content: `We offer a ${days}-day money-back guarantee on all purchases. If you're not completely satisfied with your purchase, you may request a full refund within ${days} days of your purchase date.`
    },
    {
      heading: 'How to Request a Refund',
      content: `To request a refund, simply email [support email] with:
• Your order number
• The email address used for purchase
• Brief reason for refund (optional, but helps us improve)

Refunds are typically processed within 5-7 business days.`
    },
    {
      heading: 'What Qualifies',
      content: `• Requests made within ${days} days of purchase
• Original purchaser (no refunds on transferred accounts)
• First-time refund request for this product`
    },
    {
      heading: 'What Doesn\'t Qualify',
      content: `• Requests made after ${days} days
• Repeat refund requests
• Chargebacks (please contact us first)`
    },
    {
      heading: 'After Refund',
      content: `Once your refund is processed:
• Access to the ${productType} will be revoked
• Any bonuses or materials should be deleted
• You may not share or distribute any materials`
    }
  ];
  
  policy.legalNote = 'This is a template. Have a legal professional review for your jurisdiction.';
  
  policy.generatedAt = new Date().toISOString();
  
  guaranteeData.policies.push(policy);
  await saveData();
  
  return policy;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'types': {
        const result = await listGuaranteeTypes();
        
        console.log('Guarantee Types');
        console.log('='.repeat(50));
        for (const type of result.types.slice(0, 5)) {
          console.log(`\n${type.name}:`);
          console.log(`  ${type.description}`);
          console.log(`  Duration: ${type.duration}`);
        }
        break;
      }
      
      case 'design': {
        const type = args[0] || 'moneyBack';
        const result = await designGuarantee(type);
        
        console.log('Designed Guarantee');
        console.log('='.repeat(50));
        console.log(`\nName: ${result.designed.name}`);
        console.log(`Duration: ${result.designed.duration}`);
        console.log('\nTerms:');
        for (const term of result.designed.terms) {
          console.log(`  - ${term}`);
        }
        break;
      }
      
      case 'risk': {
        const product = args.join(' ') || 'Product';
        const result = await createRiskReversal(product);
        
        console.log('Risk Reversal Strategy');
        console.log('='.repeat(50));
        console.log(`\nCustomer Risks:`);
        for (const risk of result.analysis.customerRisks.slice(0, 3)) {
          console.log(`  - ${risk.risk} → ${risk.mitigation}`);
        }
        break;
      }
      
      case 'copy': {
        const type = args[0] || 'moneyBack';
        const result = await generateGuaranteeCopy(type);
        
        console.log('Guarantee Copy');
        console.log('='.repeat(50));
        console.log(`\nHeadline options:`);
        for (const [style, text] of Object.entries(result.versions.headline)) {
          console.log(`  ${style}: ${text}`);
        }
        break;
      }
      
      case 'badge': {
        const type = args[0] || 'standard';
        const result = await createBadge(type);
        
        console.log('Guarantee Badge');
        console.log('='.repeat(50));
        console.log(`\nPlacement recommendations:`);
        for (const place of result.placement) {
          console.log(`  ${place.location}: ${place.reason}`);
        }
        break;
      }
      
      case 'policy': {
        const duration = args[0] || 30;
        const result = await generateRefundPolicy(duration);
        
        console.log('Refund Policy');
        console.log('='.repeat(50));
        console.log(`Duration: ${result.duration} days`);
        console.log(`\nSections:`);
        for (const section of result.sections.slice(0, 3)) {
          console.log(`  - ${section.heading}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Guarantee Designer Module');
        console.log('=========================');
        console.log(`Guarantee types: ${Object.keys(GUARANTEE_TYPES).length}`);
        console.log(`Risk reversal strategies: ${Object.keys(RISK_REVERSAL).length}`);
        console.log(`Copy templates: ${Object.keys(COPY_TEMPLATES).length}`);
        break;
      }
      
      default:
        console.log('Guarantee Designer - OpenClaw');
        console.log('Run with "types" to see guarantee types');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  listGuaranteeTypes,
  designGuarantee,
  createRiskReversal,
  generateGuaranteeCopy,
  createBadge,
  generateRefundPolicy,
  GUARANTEE_TYPES,
  RISK_REVERSAL,
  COPY_TEMPLATES
};

// Run CLI
main().catch(console.error);
