#!/usr/bin/env node
/**
 * OpenClaw Funnel Builder Agent
 * 
 * Distribution Division - Sales funnel creation and optimization
 * 
 * Features:
 *   - Funnel type templates
 *   - Step-by-step flow creation
 *   - Conversion tracking setup
 *   - Upsell/downsell sequences
 *   - Automation mapping
 *   - Funnel analytics
 * 
 * Usage: node funnel-builder.mjs <command> [args...]
 * 
 * Commands:
 *   create <type>            Create funnel blueprint
 *   flow <funnel>            Generate flow diagram
 *   upsell <product>         Design upsell sequence
 *   automation <funnel>      Map automations
 *   analyze <funnel>         Analyze funnel metrics
 *   optimize <funnel>        Optimization recommendations
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const FUNNEL_FILE = path.join(DATA_DIR, 'funnel-data.json');

// Funnel types
const FUNNEL_TYPES = {
  leadMagnet: {
    name: 'Lead Magnet Funnel',
    purpose: 'Build email list',
    steps: ['optinPage', 'thankYouPage', 'emailSequence'],
    avgConversion: '25-45%',
    complexity: 'Simple',
    bestFor: 'List building, awareness'
  },
  tripwire: {
    name: 'Tripwire Funnel',
    purpose: 'Convert leads to buyers',
    steps: ['optinPage', 'tripwireOffer', 'upsell1', 'upsell2', 'thankYouPage'],
    avgConversion: '5-15%',
    complexity: 'Medium',
    bestFor: 'Self-liquidating offers'
  },
  webinar: {
    name: 'Webinar Funnel',
    purpose: 'Sell high-ticket via education',
    steps: ['registrationPage', 'confirmationPage', 'reminderSequence', 'webinar', 'replayPage', 'salesPage'],
    avgConversion: '3-10%',
    complexity: 'Complex',
    bestFor: 'High-ticket products, coaching'
  },
  productLaunch: {
    name: 'Product Launch Funnel',
    purpose: 'Launch new products',
    steps: ['prelaunchCapture', 'plcVideo1', 'plcVideo2', 'plcVideo3', 'cartOpenPage', 'salesPage', 'cartClosePage'],
    avgConversion: '5-15%',
    complexity: 'Complex',
    bestFor: 'New product launches'
  },
  challenge: {
    name: 'Challenge Funnel',
    purpose: 'Engage and convert',
    steps: ['registrationPage', 'welcomeEmail', 'day1-5Content', 'graduationOffer', 'upsell'],
    avgConversion: '8-20%',
    complexity: 'Medium',
    bestFor: 'Community building, engagement'
  },
  application: {
    name: 'Application Funnel',
    purpose: 'Qualify high-ticket leads',
    steps: ['landingPage', 'applicationForm', 'calendlyBooking', 'salesCall', 'followUp'],
    avgConversion: '10-25%',
    complexity: 'Simple',
    bestFor: 'High-ticket coaching, services'
  },
  vsL: {
    name: 'Video Sales Letter Funnel',
    purpose: 'Direct sales via video',
    steps: ['vslPage', 'orderPage', 'upsell1', 'downsell', 'thankYouPage'],
    avgConversion: '1-5%',
    complexity: 'Medium',
    bestFor: 'Direct response, info products'
  },
  evergreen: {
    name: 'Evergreen Webinar Funnel',
    purpose: 'Automated webinar sales',
    steps: ['registrationPage', 'waitingRoom', 'webinarRoom', 'offerPage', 'replayPage', 'closingEmail'],
    avgConversion: '3-8%',
    complexity: 'Complex',
    bestFor: 'Passive income, scalable'
  }
};

// Funnel step templates
const STEP_TEMPLATES = {
  optinPage: {
    name: 'Opt-in Page',
    elements: ['headline', 'benefit bullets', 'form', 'CTA'],
    metrics: ['visits', 'optins', 'conversion rate'],
    benchmark: '30-50% conversion'
  },
  thankYouPage: {
    name: 'Thank You Page',
    elements: ['confirmation', 'next steps', 'upsell offer'],
    metrics: ['views', 'upsell clicks'],
    benchmark: '10-25% upsell click'
  },
  tripwireOffer: {
    name: 'Tripwire Offer Page',
    elements: ['special offer', 'countdown', 'order form'],
    metrics: ['views', 'purchases', 'conversion rate'],
    benchmark: '5-15% conversion'
  },
  upsell1: {
    name: 'Upsell Page 1',
    elements: ['video/copy', 'offer', 'yes/no buttons'],
    metrics: ['views', 'accepts', 'conversion rate'],
    benchmark: '15-30% take rate'
  },
  upsell2: {
    name: 'Upsell Page 2',
    elements: ['video/copy', 'offer', 'yes/no buttons'],
    metrics: ['views', 'accepts', 'conversion rate'],
    benchmark: '10-20% take rate'
  },
  registrationPage: {
    name: 'Registration Page',
    elements: ['headline', 'webinar details', 'form', 'host bio'],
    metrics: ['visits', 'registrations', 'conversion rate'],
    benchmark: '30-50% conversion'
  },
  confirmationPage: {
    name: 'Confirmation Page',
    elements: ['confirmation', 'add to calendar', 'pre-webinar offer'],
    metrics: ['views', 'calendar adds'],
    benchmark: '50%+ calendar adds'
  },
  salesPage: {
    name: 'Sales Page',
    elements: ['full sales letter', 'testimonials', 'offer', 'guarantee'],
    metrics: ['visits', 'purchases', 'conversion rate'],
    benchmark: '1-5% conversion'
  },
  orderPage: {
    name: 'Order Page',
    elements: ['order summary', 'payment form', 'security badges'],
    metrics: ['views', 'completions', 'abandon rate'],
    benchmark: '60-80% completion'
  },
  applicationForm: {
    name: 'Application Page',
    elements: ['qualification questions', 'form', 'booking'],
    metrics: ['visits', 'submissions', 'qualified rate'],
    benchmark: '10-25% submission'
  }
};

// Upsell strategies
const UPSELL_STRATEGIES = {
  complementary: {
    name: 'Complementary Product',
    description: 'Offer something that enhances the main purchase',
    example: 'Book + Workbook',
    timing: 'Immediately after purchase'
  },
  premium: {
    name: 'Premium Version',
    description: 'Higher-tier version of what they bought',
    example: 'Basic course → Pro course',
    timing: 'Post-purchase'
  },
  bundle: {
    name: 'Bundle Offer',
    description: 'Package multiple products at discount',
    example: 'All courses bundle',
    timing: 'Post-purchase'
  },
  fastAction: {
    name: 'Fast Action Bonus',
    description: 'Limited-time bonus for immediate action',
    example: 'Order in 15 mins = extra coaching call',
    timing: 'During checkout'
  },
  subscription: {
    name: 'Membership/Subscription',
    description: 'Recurring access or updates',
    example: 'Join membership for ongoing support',
    timing: 'Post-purchase'
  },
  service: {
    name: 'Done-For-You Service',
    description: 'Implementation help',
    example: 'Course + implementation coaching',
    timing: 'Post-purchase'
  }
};

// Automation triggers
const AUTOMATION_TRIGGERS = {
  purchase: ['Deliver product', 'Add to customer list', 'Start onboarding sequence'],
  optIn: ['Deliver lead magnet', 'Add to nurture sequence', 'Tag subscriber'],
  abandoned: ['Trigger abandonment email', 'Retarget with ads', 'Add to recovery sequence'],
  webinar: ['Send reminder sequence', 'Track attendance', 'Segment by attendance'],
  noShow: ['Send replay link', 'Trigger no-show sequence', 'Offer alternative']
};

// Data storage
let funnelData = {
  funnels: [],
  flows: [],
  analytics: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(FUNNEL_FILE, 'utf8');
    funnelData = JSON.parse(data);
  } catch {
    funnelData = { funnels: [], flows: [], analytics: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(FUNNEL_FILE, JSON.stringify(funnelData, null, 2));
}

/**
 * Create funnel blueprint
 */
async function createFunnel(type, options = {}) {
  const funnelType = FUNNEL_TYPES[type] || FUNNEL_TYPES.leadMagnet;
  const product = options.product || 'Your Product';
  
  const funnel = {
    id: `funnel-${Date.now()}`,
    type,
    name: `${product} ${funnelType.name}`,
    product,
    template: funnelType,
    steps: []
  };
  
  // Build funnel steps
  for (const stepName of funnelType.steps) {
    const template = STEP_TEMPLATES[stepName] || { name: stepName };
    
    funnel.steps.push({
      id: `step-${funnel.steps.length + 1}`,
      name: template.name || stepName,
      type: stepName,
      elements: template.elements || [],
      metrics: template.metrics || [],
      benchmark: template.benchmark || 'Varies',
      content: {
        headline: `[${stepName} headline for ${product}]`,
        cta: `[${stepName} call-to-action]`
      }
    });
  }
  
  // Add email automations
  funnel.emailAutomations = generateEmailAutomations(type);
  
  // Add tracking setup
  funnel.tracking = {
    pixels: ['Facebook Pixel', 'Google Analytics', 'Google Tag Manager'],
    events: ['PageView', 'Lead', 'Purchase', 'CompleteRegistration'],
    utmParameters: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']
  };
  
  funnel.generatedAt = new Date().toISOString();
  
  funnelData.funnels.push(funnel);
  await saveData();
  
  return funnel;
}

/**
 * Generate email automations
 */
function generateEmailAutomations(funnelType) {
  const automations = [];
  
  switch (funnelType) {
    case 'leadMagnet':
      automations.push(
        { trigger: 'Opt-in', action: 'Deliver lead magnet', delay: '0 min' },
        { trigger: 'Opt-in', action: 'Welcome email', delay: '0 min' },
        { trigger: 'Day 1', action: 'Value email 1', delay: '24 hours' },
        { trigger: 'Day 3', action: 'Value email 2', delay: '72 hours' },
        { trigger: 'Day 5', action: 'Soft pitch email', delay: '120 hours' }
      );
      break;
      
    case 'webinar':
      automations.push(
        { trigger: 'Registration', action: 'Confirmation email', delay: '0 min' },
        { trigger: 'Registration', action: 'Add to calendar', delay: '5 min' },
        { trigger: '24h before', action: 'Reminder email 1', delay: '-24 hours' },
        { trigger: '1h before', action: 'Reminder email 2', delay: '-1 hour' },
        { trigger: 'Post-webinar', action: 'Replay access', delay: '1 hour' },
        { trigger: 'No purchase', action: 'Follow-up sequence', delay: '24 hours' }
      );
      break;
      
    case 'tripwire':
      automations.push(
        { trigger: 'Opt-in', action: 'Deliver lead magnet', delay: '0 min' },
        { trigger: 'No purchase', action: 'Abandon cart email', delay: '1 hour' },
        { trigger: 'Purchase', action: 'Receipt + access', delay: '0 min' },
        { trigger: 'Purchase', action: 'Start onboarding', delay: '24 hours' }
      );
      break;
      
    default:
      automations.push(
        { trigger: 'Entry', action: 'Welcome sequence', delay: '0 min' },
        { trigger: 'Exit without action', action: 'Follow-up sequence', delay: '24 hours' }
      );
  }
  
  return automations;
}

/**
 * Generate flow diagram
 */
async function generateFlow(funnelType) {
  const funnel = FUNNEL_TYPES[funnelType] || FUNNEL_TYPES.leadMagnet;
  
  const flow = {
    funnelType,
    name: funnel.name,
    diagram: [],
    connections: []
  };
  
  // Build flow diagram
  for (let i = 0; i < funnel.steps.length; i++) {
    const step = funnel.steps[i];
    const template = STEP_TEMPLATES[step];
    
    flow.diagram.push({
      id: i + 1,
      step,
      name: template?.name || step,
      benchmark: template?.benchmark || 'Varies'
    });
    
    // Add connection to next step
    if (i < funnel.steps.length - 1) {
      flow.connections.push({
        from: i + 1,
        to: i + 2,
        type: 'primary'
      });
    }
  }
  
  // Generate ASCII flow
  flow.asciiDiagram = funnel.steps.map((step, i) => {
    const num = i + 1;
    const stepName = STEP_TEMPLATES[step]?.name || step;
    return `[${num}. ${stepName}]`;
  }).join('\n    ↓\n');
  
  return flow;
}

/**
 * Design upsell sequence
 */
async function designUpsellSequence(product, options = {}) {
  const price = options.price || 97;
  
  const sequence = {
    id: `upsell-${Date.now()}`,
    mainProduct: product,
    mainPrice: price,
    upsells: []
  };
  
  // Upsell 1 (higher price point)
  sequence.upsells.push({
    order: 1,
    type: 'premium',
    name: `${product} Premium`,
    price: price * 2,
    strategy: UPSELL_STRATEGIES.premium,
    expectedTakeRate: '20-30%',
    copy: {
      headline: `Wait! Get the Premium Version`,
      offer: `Upgrade to ${product} Premium for just $${price * 2}`,
      cta: 'Yes, Upgrade Me!'
    }
  });
  
  // Downsell (if upsell 1 declined)
  sequence.upsells.push({
    order: 2,
    type: 'downsell',
    name: `${product} Lite`,
    price: Math.round(price * 0.5),
    trigger: 'Upsell 1 declined',
    expectedTakeRate: '10-15%',
    copy: {
      headline: `One More Thing...`,
      offer: `Get ${product} Lite for just $${Math.round(price * 0.5)}`,
      cta: 'Yes, I Want This!'
    }
  });
  
  // Upsell 2 (complementary)
  sequence.upsells.push({
    order: 3,
    type: 'complementary',
    name: `${product} Implementation Kit`,
    price: Math.round(price * 0.75),
    strategy: UPSELL_STRATEGIES.complementary,
    expectedTakeRate: '15-25%',
    copy: {
      headline: `Complete Your Success Kit`,
      offer: `Add the Implementation Kit for just $${Math.round(price * 0.75)}`,
      cta: 'Yes, Add This!'
    }
  });
  
  // Calculate potential revenue
  const baseRevenue = 1000 * price; // Assume 1000 buyers
  const upsellRevenue = 
    (300 * price * 2) + // 30% take upsell 1
    (70 * Math.round(price * 0.5)) + // 10% of decliners take downsell
    (200 * Math.round(price * 0.75)); // 20% take upsell 2
  
  sequence.revenueProjection = {
    baseRevenue: `$${baseRevenue.toLocaleString()} (1000 buyers)`,
    upsellRevenue: `$${upsellRevenue.toLocaleString()}`,
    totalRevenue: `$${(baseRevenue + upsellRevenue).toLocaleString()}`,
    increasePercent: `+${((upsellRevenue / baseRevenue) * 100).toFixed(0)}%`
  };
  
  return sequence;
}

/**
 * Map automations
 */
async function mapAutomations(funnelType) {
  const automations = {
    funnelType,
    triggers: AUTOMATION_TRIGGERS,
    workflows: []
  };
  
  // Main purchase workflow
  automations.workflows.push({
    name: 'Purchase Workflow',
    trigger: 'Successful Purchase',
    actions: [
      { step: 1, action: 'Send receipt email', delay: 'Immediate' },
      { step: 2, action: 'Grant product access', delay: 'Immediate' },
      { step: 3, action: 'Add to customer segment', delay: 'Immediate' },
      { step: 4, action: 'Start onboarding sequence', delay: '1 hour' },
      { step: 5, action: 'Request review', delay: '7 days' }
    ]
  });
  
  // Abandoned cart workflow
  automations.workflows.push({
    name: 'Abandoned Cart Recovery',
    trigger: 'Cart Abandonment',
    actions: [
      { step: 1, action: 'Send reminder email 1', delay: '1 hour' },
      { step: 2, action: 'Send reminder email 2', delay: '24 hours' },
      { step: 3, action: 'Send discount offer', delay: '48 hours' },
      { step: 4, action: 'Final reminder', delay: '72 hours' }
    ]
  });
  
  // Lead nurture workflow
  automations.workflows.push({
    name: 'Lead Nurture Sequence',
    trigger: 'New Lead (No Purchase)',
    actions: [
      { step: 1, action: 'Welcome email', delay: 'Immediate' },
      { step: 2, action: 'Value email 1', delay: '1 day' },
      { step: 3, action: 'Value email 2', delay: '3 days' },
      { step: 4, action: 'Soft pitch', delay: '5 days' },
      { step: 5, action: 'Direct offer', delay: '7 days' }
    ]
  });
  
  return automations;
}

/**
 * Analyze funnel metrics
 */
async function analyzeFunnel(funnelId, metrics = {}) {
  const analysis = {
    funnelId,
    metrics: {
      traffic: metrics.traffic || 10000,
      leads: metrics.leads || 3000,
      sales: metrics.sales || 100,
      revenue: metrics.revenue || 9700,
      adSpend: metrics.adSpend || 3000
    },
    calculated: {}
  };
  
  // Calculate key metrics
  analysis.calculated = {
    optInRate: ((analysis.metrics.leads / analysis.metrics.traffic) * 100).toFixed(2) + '%',
    salesConversion: ((analysis.metrics.sales / analysis.metrics.leads) * 100).toFixed(2) + '%',
    overallConversion: ((analysis.metrics.sales / analysis.metrics.traffic) * 100).toFixed(2) + '%',
    averageOrderValue: (analysis.metrics.revenue / analysis.metrics.sales).toFixed(2),
    costPerLead: (analysis.metrics.adSpend / analysis.metrics.leads).toFixed(2),
    costPerAcquisition: (analysis.metrics.adSpend / analysis.metrics.sales).toFixed(2),
    roas: (analysis.metrics.revenue / analysis.metrics.adSpend).toFixed(2) + 'x',
    profit: analysis.metrics.revenue - analysis.metrics.adSpend
  };
  
  // Benchmark comparison
  analysis.benchmarks = {
    optInRate: { benchmark: '30%', yours: analysis.calculated.optInRate },
    salesConversion: { benchmark: '3%', yours: analysis.calculated.salesConversion },
    roas: { benchmark: '3x', yours: analysis.calculated.roas }
  };
  
  // Identify bottlenecks
  analysis.bottlenecks = [];
  
  const optInNum = parseFloat(analysis.calculated.optInRate);
  if (optInNum < 25) {
    analysis.bottlenecks.push({
      stage: 'Opt-in',
      issue: 'Low opt-in rate',
      recommendation: 'Test headlines, offer, and page speed'
    });
  }
  
  const salesNum = parseFloat(analysis.calculated.salesConversion);
  if (salesNum < 2) {
    analysis.bottlenecks.push({
      stage: 'Sales',
      issue: 'Low sales conversion',
      recommendation: 'Improve email sequence, add testimonials'
    });
  }
  
  return analysis;
}

/**
 * Generate optimization recommendations
 */
async function optimizeFunnel(funnelType, currentMetrics = {}) {
  const recommendations = {
    funnelType,
    improvements: []
  };
  
  // General optimizations
  recommendations.improvements = [
    {
      area: 'Opt-in Page',
      priority: 'High',
      actions: [
        'Test different headlines (aim for 2-3x lift)',
        'Reduce form fields to email only',
        'Add social proof',
        'Improve page speed (<3 seconds)',
        'Add exit-intent popup'
      ]
    },
    {
      area: 'Email Sequence',
      priority: 'High',
      actions: [
        'Improve subject lines (test curiosity vs benefit)',
        'Add more value before pitching',
        'Include case studies/testimonials',
        'Test send times',
        'Segment by engagement'
      ]
    },
    {
      area: 'Sales Page',
      priority: 'Medium',
      actions: [
        'Lead with transformation',
        'Add video sales letter',
        'Stack value before revealing price',
        'Add risk reversal (guarantee)',
        'Create urgency (ethical scarcity)'
      ]
    },
    {
      area: 'Upsells',
      priority: 'Medium',
      actions: [
        'Offer complementary products',
        'Test one-click upsells',
        'Add downsell for those who decline',
        'Create bundle offers'
      ]
    },
    {
      area: 'Retargeting',
      priority: 'Low',
      actions: [
        'Retarget page visitors who didn\'t opt in',
        'Retarget leads who didn\'t buy',
        'Use dynamic product ads',
        'Create lookalike audiences from buyers'
      ]
    }
  ];
  
  return recommendations;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'create': {
        const type = args[0] || 'leadMagnet';
        const funnel = await createFunnel(type, {
          product: args.slice(1).join(' ') || 'Product'
        });
        
        console.log('Funnel Blueprint Created');
        console.log('='.repeat(50));
        console.log(`Type: ${funnel.template.name}`);
        console.log(`Steps: ${funnel.steps.length}`);
        console.log(`\nFunnel Flow:`);
        for (const step of funnel.steps) {
          console.log(`  ${step.id}. ${step.name}`);
        }
        break;
      }
      
      case 'flow': {
        const type = args[0] || 'webinar';
        const flow = await generateFlow(type);
        
        console.log(`Funnel Flow: ${flow.name}`);
        console.log('='.repeat(50));
        console.log(flow.asciiDiagram);
        break;
      }
      
      case 'upsell': {
        const product = args.join(' ') || 'Your Course';
        const sequence = await designUpsellSequence(product, { price: 97 });
        
        console.log('Upsell Sequence');
        console.log('='.repeat(50));
        
        for (const upsell of sequence.upsells) {
          console.log(`\n${upsell.order}. ${upsell.name} ($${upsell.price})`);
          console.log(`   Type: ${upsell.type}`);
          console.log(`   Expected: ${upsell.expectedTakeRate}`);
        }
        
        console.log(`\nRevenue Impact: ${sequence.revenueProjection.increasePercent}`);
        break;
      }
      
      case 'automation': {
        const type = args[0] || 'webinar';
        const automations = await mapAutomations(type);
        
        console.log('Automation Workflows');
        console.log('='.repeat(50));
        
        for (const workflow of automations.workflows.slice(0, 2)) {
          console.log(`\n${workflow.name}:`);
          for (const action of workflow.actions.slice(0, 3)) {
            console.log(`  ${action.step}. ${action.action} (${action.delay})`);
          }
        }
        break;
      }
      
      case 'analyze': {
        const funnelId = args[0] || 'test-funnel';
        const analysis = await analyzeFunnel(funnelId);
        
        console.log('Funnel Analysis');
        console.log('='.repeat(50));
        console.log(`Opt-in Rate: ${analysis.calculated.optInRate}`);
        console.log(`Conversion: ${analysis.calculated.salesConversion}`);
        console.log(`ROAS: ${analysis.calculated.roas}`);
        console.log(`Profit: $${analysis.calculated.profit}`);
        
        if (analysis.bottlenecks.length > 0) {
          console.log('\nBottlenecks:');
          for (const b of analysis.bottlenecks) {
            console.log(`  • ${b.stage}: ${b.issue}`);
          }
        }
        break;
      }
      
      case 'optimize': {
        const type = args[0] || 'leadMagnet';
        const recommendations = await optimizeFunnel(type);
        
        console.log('Optimization Recommendations');
        console.log('='.repeat(50));
        
        for (const imp of recommendations.improvements.slice(0, 3)) {
          console.log(`\n${imp.area} [${imp.priority}]:`);
          for (const action of imp.actions.slice(0, 3)) {
            console.log(`  • ${action}`);
          }
        }
        break;
      }
      
      case 'test': {
        console.log('Funnel Builder Module');
        console.log('=====================');
        console.log(`Funnel types: ${Object.keys(FUNNEL_TYPES).length}`);
        console.log(`Step templates: ${Object.keys(STEP_TEMPLATES).length}`);
        console.log(`Funnels created: ${funnelData.funnels.length}`);
        break;
      }
      
      default:
        console.log('Funnel Builder - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  createFunnel,
  generateFlow,
  designUpsellSequence,
  mapAutomations,
  analyzeFunnel,
  optimizeFunnel,
  FUNNEL_TYPES,
  STEP_TEMPLATES,
  UPSELL_STRATEGIES,
  AUTOMATION_TRIGGERS
};

// Run CLI
main().catch(console.error);
