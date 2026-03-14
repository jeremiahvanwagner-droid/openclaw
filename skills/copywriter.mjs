#!/usr/bin/env node
/**
 * OpenClaw Copywriter Agent
 * 
 * Content Division - Sales copy and persuasive writing
 * 
 * Features:
 *   - Sales page copy
 *   - Landing page copy
 *   - Ad copy generation
 *   - Email copy
 *   - Product descriptions
 *   - CTA optimization
 * 
 * Usage: node copywriter.mjs <command> [args...]
 * 
 * Commands:
 *   sales <product>          Generate sales page copy
 *   landing <offer>          Generate landing page
 *   ad <product>             Generate ad copy
 *   email <purpose>          Generate email copy
 *   cta <action>             Generate CTAs
 *   benefits <product>       Extract/generate benefits
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const COPY_FILE = path.join(DATA_DIR, 'copywriter.json');

// Copywriting frameworks
const COPY_FRAMEWORKS = {
  AIDA: {
    name: 'Attention-Interest-Desire-Action',
    steps: ['Attention', 'Interest', 'Desire', 'Action'],
    description: 'Classic framework for sequential persuasion',
    bestFor: ['Sales pages', 'Email sequences', 'Ads']
  },
  PAS: {
    name: 'Problem-Agitate-Solve',
    steps: ['Problem', 'Agitate', 'Solve'],
    description: 'Pain-focused framework that intensifies the problem',
    bestFor: ['Sales letters', 'VSLs', 'Email']
  },
  BAB: {
    name: 'Before-After-Bridge',
    steps: ['Before', 'After', 'Bridge'],
    description: 'Transformation-focused framework',
    bestFor: ['Case studies', 'Testimonials', 'Courses']
  },
  '4Ps': {
    name: 'Promise-Picture-Proof-Push',
    steps: ['Promise', 'Picture', 'Proof', 'Push'],
    description: 'Visually compelling framework',
    bestFor: ['Landing pages', 'Video sales letters']
  },
  PASTOR: {
    name: 'Problem-Amplify-Story-Transform-Offer-Response',
    steps: ['Problem', 'Amplify', 'Story', 'Transform', 'Offer', 'Response'],
    description: 'Comprehensive long-form framework',
    bestFor: ['Long sales pages', 'Webinars']
  },
  FAB: {
    name: 'Features-Advantages-Benefits',
    steps: ['Features', 'Advantages', 'Benefits'],
    description: 'Product-focused framework',
    bestFor: ['Product descriptions', 'Comparisons']
  }
};

// Persuasion triggers
const PERSUASION_TRIGGERS = {
  scarcity: {
    phrases: ['Limited time', 'Only X spots left', 'Expires soon', 'While supplies last'],
    effectiveness: 90
  },
  urgency: {
    phrases: ['Act now', 'Don\'t wait', 'Today only', 'Last chance'],
    effectiveness: 85
  },
  socialProof: {
    phrases: ['Join 10,000+ others', 'Trusted by', 'As seen on', '5-star reviews'],
    effectiveness: 88
  },
  authority: {
    phrases: ['Expert-approved', 'Research-backed', 'Industry-leading', 'Award-winning'],
    effectiveness: 82
  },
  reciprocity: {
    phrases: ['Free bonus', 'Special gift', 'Exclusive access', 'Complimentary'],
    effectiveness: 80
  },
  commitment: {
    phrases: ['Start your journey', 'Take the first step', 'Begin today', 'Make the choice'],
    effectiveness: 75
  },
  liking: {
    phrases: ['We understand', 'Just like you', 'We\'ve been there', 'Together'],
    effectiveness: 78
  },
  unity: {
    phrases: ['Join the community', 'Become part of', 'Welcome to the family', 'Members like you'],
    effectiveness: 80
  }
};

// CTA templates by purpose
const CTA_TEMPLATES = {
  purchase: ['Buy Now', 'Get Instant Access', 'Start Today', 'Claim Your Spot', 'Yes, I Want This!'],
  signup: ['Sign Up Free', 'Create Account', 'Get Started', 'Join Now', 'Start Free Trial'],
  download: ['Download Now', 'Get Your Free Copy', 'Grab Your Guide', 'Send Me The PDF'],
  learn: ['Learn More', 'Discover How', 'See How It Works', 'Show Me More'],
  contact: ['Book a Call', 'Schedule Demo', 'Talk to Us', 'Get in Touch']
};

// Guarantee types
const GUARANTEE_TYPES = {
  moneyBack: {
    template: '{days}-Day Money-Back Guarantee',
    description: 'Full refund within {days} days, no questions asked',
    trustLevel: 'High'
  },
  results: {
    template: 'Results Guarantee',
    description: 'Get results or get your money back',
    trustLevel: 'Very High'
  },
  satisfaction: {
    template: '100% Satisfaction Guarantee',
    description: 'If you\'re not completely satisfied, we\'ll make it right',
    trustLevel: 'High'
  },
  bestPrice: {
    template: 'Best Price Guarantee',
    description: 'Find a lower price and we\'ll match it',
    trustLevel: 'Medium'
  },
  lifetime: {
    template: 'Lifetime Access Guarantee',
    description: 'Access your purchase forever with all future updates',
    trustLevel: 'High'
  }
};

// Data storage
let copyData = {
  generated: [],
  templates: {},
  campaigns: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(COPY_FILE, 'utf8');
    copyData = JSON.parse(data);
  } catch {
    copyData = { generated: [], templates: {}, campaigns: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(COPY_FILE, JSON.stringify(copyData, null, 2));
}

/**
 * Generate sales page copy
 */
async function generateSalesPage(product, options = {}) {
  const framework = options.framework || 'PAS';
  const tone = options.tone || 'conversational';
  const price = options.price || 97;
  
  const fw = COPY_FRAMEWORKS[framework];
  
  const salesPage = {
    id: `sales-${Date.now()}`,
    product,
    framework,
    price,
    sections: {}
  };
  
  // Generate headline
  salesPage.headline = {
    main: `Finally: The ${product} System That Actually Works`,
    sub: `Discover how to achieve breakthrough results without the frustration, confusion, or wasted time.`
  };
  
  // Generate framework-specific sections
  if (framework === 'PAS') {
    salesPage.sections = {
      problem: generateProblemSection(product),
      agitate: generateAgitateSection(product),
      solve: generateSolveSection(product)
    };
  } else if (framework === 'AIDA') {
    salesPage.sections = {
      attention: generateAttentionSection(product),
      interest: generateInterestSection(product),
      desire: generateDesireSection(product),
      action: generateActionSection(product, price)
    };
  }
  
  // Add universal elements
  salesPage.benefits = generateBenefits(product, 7);
  salesPage.features = generateFeatures(product, 5);
  salesPage.testimonials = generateTestimonialTemplates(3);
  salesPage.bonuses = generateBonuses(product, 3);
  salesPage.guarantee = generateGuarantee(30);
  salesPage.faq = generateFAQ(product, 5);
  salesPage.cta = generateSalesCTA(product, price);
  salesPage.urgency = generateUrgencyElement();
  
  salesPage.generatedAt = new Date().toISOString();
  
  copyData.generated.push(salesPage);
  await saveData();
  
  return salesPage;
}

/**
 * Generate problem section
 */
function generateProblemSection(product) {
  return {
    headline: `Are You Struggling With ${product}?`,
    painPoints: [
      `You've tried everything but nothing seems to work`,
      `You're overwhelmed by conflicting information`,
      `You're wasting time and money on ineffective solutions`,
      `You feel stuck and don't know what to do next`,
      `You're watching others succeed while you fall behind`
    ],
    empathy: `We understand exactly how frustrating this feels. You're not alone.`
  };
}

/**
 * Generate agitate section
 */
function generateAgitateSection(product) {
  return {
    headline: `Here's The Hard Truth...`,
    consequences: [
      `Every day you wait, you're falling further behind`,
      `The problem doesn't fix itself – it gets worse`,
      `You're losing opportunities while you hesitate`,
      `Your competitors are already figuring this out`
    ],
    pivotStatement: `But it doesn't have to be this way.`
  };
}

/**
 * Generate solve section
 */
function generateSolveSection(product) {
  return {
    headline: `Introducing: The ${product} Solution`,
    introduction: `After years of research and testing, we've developed a proven system that eliminates the guesswork and delivers real results.`,
    keyFeatures: [
      `Step-by-step blueprint you can follow`,
      `Proven strategies that work in 2026`,
      `Expert guidance at every step`,
      `Results-focused approach`
    ],
    transformation: `Imagine finally having the clarity, confidence, and results you've been looking for.`
  };
}

/**
 * Generate attention section
 */
function generateAttentionSection(product) {
  return {
    headline: `Warning: What You're About to Discover Could Change Everything`,
    hook: `In the next few minutes, you'll learn the exact system top performers use to master ${product}.`,
    intrigue: `This isn't like anything you've seen before.`
  };
}

/**
 * Generate interest section
 */
function generateInterestSection(product) {
  return {
    headline: `Here's What Makes This Different`,
    differentiators: [
      `Based on real-world results, not theory`,
      `Designed for busy people with limited time`,
      `Works even if you've failed before`,
      `Step-by-step so you can't get lost`
    ],
    credibility: `This system has helped thousands achieve breakthrough results.`
  };
}

/**
 * Generate desire section
 */
function generateDesireSection(product) {
  return {
    headline: `Imagine What Life Looks Like When...`,
    desires: [
      `You wake up confident and in control`,
      `You have a proven system that works`,
      `You're getting the results you deserve`,
      `You finally feel like you've figured it out`
    ],
    testimonialTeaser: `Just like Sarah, who said: "This changed everything for me."`
  };
}

/**
 * Generate action section
 */
function generateActionSection(product, price) {
  return {
    headline: `Ready to Transform Your ${product}?`,
    offer: `Get instant access to the complete ${product} system`,
    price: {
      original: price * 3,
      current: price,
      savings: price * 2
    },
    cta: `Yes, I'm Ready to Start!`,
    guarantee: `Backed by our 30-day money-back guarantee`
  };
}

/**
 * Generate benefits
 */
function generateBenefits(product, count) {
  const benefitTemplates = [
    `Get instant clarity on exactly what to do next`,
    `Save hours of frustration and wasted effort`,
    `Join a proven system used by thousands`,
    `Access expert strategies that actually work`,
    `See results faster than you thought possible`,
    `Never feel stuck or confused again`,
    `Build confidence with each step forward`,
    `Get lifetime access to updates and improvements`,
    `Connect with a supportive community`,
    `Unlock your full potential with ${product}`
  ];
  
  return benefitTemplates.slice(0, count).map((benefit, i) => ({
    benefit,
    icon: ['✓', '★', '→', '•', '◆'][i % 5]
  }));
}

/**
 * Generate features
 */
function generateFeatures(product, count) {
  const featureTemplates = [
    { feature: 'Complete Video Training', description: 'Step-by-step video modules' },
    { feature: 'Downloadable Resources', description: 'Templates, checklists, and guides' },
    { feature: 'Expert Support', description: 'Get your questions answered' },
    { feature: 'Community Access', description: 'Connect with fellow members' },
    { feature: 'Lifetime Updates', description: 'Always get the latest content' },
    { feature: 'Mobile Friendly', description: 'Learn anywhere, anytime' },
    { feature: 'Quick-Start Guide', description: 'Get going in minutes' }
  ];
  
  return featureTemplates.slice(0, count);
}

/**
 * Generate testimonial templates
 */
function generateTestimonialTemplates(count) {
  return [
    {
      template: '"Before [PRODUCT], I was [PROBLEM]. Now, I [RESULT]. This has been a game-changer!"',
      name: '[CUSTOMER NAME]',
      title: '[TITLE/LOCATION]'
    },
    {
      template: '"I was skeptical at first, but [PRODUCT] exceeded my expectations. I\'ve seen [SPECIFIC RESULT]."',
      name: '[CUSTOMER NAME]',
      title: '[TITLE/LOCATION]'
    },
    {
      template: '"Finally, something that actually works! [PRODUCT] helped me [ACHIEVEMENT] in [TIMEFRAME]."',
      name: '[CUSTOMER NAME]',
      title: '[TITLE/LOCATION]'
    }
  ].slice(0, count);
}

/**
 * Generate bonuses
 */
function generateBonuses(product, count) {
  const bonusTemplates = [
    {
      name: 'Quick-Start Action Guide',
      value: 47,
      description: 'Get going immediately with this step-by-step checklist'
    },
    {
      name: 'Template Pack',
      value: 97,
      description: 'Done-for-you templates you can customize'
    },
    {
      name: 'Exclusive Training',
      value: 197,
      description: 'Advanced strategies for accelerated results'
    },
    {
      name: 'Private Community Access',
      value: 297,
      description: 'Connect with other members and get support'
    },
    {
      name: 'Monthly Q&A Calls',
      value: 497,
      description: 'Get your questions answered by experts'
    }
  ];
  
  return bonusTemplates.slice(0, count).map(b => ({
    ...b,
    included: 'FREE with your purchase today'
  }));
}

/**
 * Generate guarantee
 */
function generateGuarantee(days) {
  return {
    type: 'moneyBack',
    days,
    headline: `${days}-Day Money-Back Guarantee`,
    description: `Try everything risk-free. If you're not completely satisfied within ${days} days, simply request a full refund. No questions asked, no hassles, no hard feelings.`,
    badge: `100% Risk-Free Guarantee`
  };
}

/**
 * Generate FAQ
 */
function generateFAQ(product, count) {
  const faqTemplates = [
    {
      question: 'How quickly will I see results?',
      answer: 'Many customers see initial results within the first week. Of course, results vary based on how quickly you implement what you learn.'
    },
    {
      question: 'What if it doesn\'t work for me?',
      answer: 'We offer a full money-back guarantee. If you\'re not satisfied, simply request a refund within the guarantee period.'
    },
    {
      question: 'Do I need any prior experience?',
      answer: 'No! This is designed for beginners and experts alike. We start from the basics and progress to advanced strategies.'
    },
    {
      question: 'How long do I have access?',
      answer: 'You get lifetime access. Once you purchase, you can access the content forever, including all future updates.'
    },
    {
      question: 'Is there support available?',
      answer: 'Yes! You\'ll have access to our support team and community to get your questions answered.'
    }
  ];
  
  return faqTemplates.slice(0, count);
}

/**
 * Generate sales CTA
 */
function generateSalesCTA(product, price) {
  return {
    primary: `Yes! Give Me Instant Access Now`,
    secondary: `Start My ${product} Journey Today`,
    price: `Only $${price}`,
    valueProposition: `(That's less than $3/day for life-changing results)`,
    urgency: `Special pricing ends soon`
  };
}

/**
 * Generate urgency element
 */
function generateUrgencyElement() {
  return {
    type: 'limited-time',
    headline: `⚠️ Special Launch Pricing`,
    body: `This introductory price is only available for a limited time. When the timer hits zero, the price goes up.`,
    countdown: true,
    scarcityElement: `Only 47 spots remaining at this price`
  };
}

/**
 * Generate landing page copy
 */
async function generateLandingPage(offer, options = {}) {
  const type = options.type || 'lead-gen';
  
  const landingPage = {
    id: `landing-${Date.now()}`,
    offer,
    type,
    headline: generateLandingHeadline(offer, type),
    subheadline: `Discover the simple system that's helping thousands achieve breakthrough results`,
    hero: {
      image: '[HERO IMAGE]',
      video: '[OPTIONAL VIDEO]'
    },
    bulletPoints: [
      `Learn the exact steps successful people take`,
      `Avoid the common mistakes that hold most people back`,
      `Get actionable strategies you can implement today`,
      `Join a proven system with real results`
    ],
    form: generateFormCopy(type),
    socialProof: {
      stat: '10,000+ people have already joined',
      logos: ['[LOGO 1]', '[LOGO 2]', '[LOGO 3]']
    },
    cta: type === 'lead-gen' ? 'Get Free Access Now' : 'Get Started Today',
    trustElements: [
      'No credit card required',
      '100% free',
      'Unsubscribe anytime'
    ],
    generatedAt: new Date().toISOString()
  };
  
  copyData.generated.push(landingPage);
  await saveData();
  
  return landingPage;
}

/**
 * Generate landing headline
 */
function generateLandingHeadline(offer, type) {
  const headlines = {
    'lead-gen': `Free Guide: Discover How to ${offer} (Step-by-Step)`,
    'webinar': `Free Training: The ${offer} Blueprint Revealed`,
    'trial': `Try ${offer} Free for 14 Days`,
    'demo': `See How ${offer} Can Transform Your Results`
  };
  
  return headlines[type] || `Get Your Free ${offer} Guide`;
}

/**
 * Generate form copy
 */
function generateFormCopy(type) {
  return {
    headline: type === 'lead-gen' ? 'Get Instant Access' : 'Start Your Free Trial',
    fields: [
      { label: 'First Name', placeholder: 'Enter your first name' },
      { label: 'Email', placeholder: 'Enter your best email' }
    ],
    button: type === 'lead-gen' ? 'Send Me The Guide' : 'Start Free Trial',
    disclaimer: 'We respect your privacy. Unsubscribe at any time.'
  };
}

/**
 * Generate ad copy
 */
async function generateAdCopy(product, options = {}) {
  const platform = options.platform || 'facebook';
  const objective = options.objective || 'conversion';
  
  const adCopy = {
    id: `ad-${Date.now()}`,
    product,
    platform,
    objective,
    variations: []
  };
  
  // Generate multiple variations
  const variations = [
    {
      type: 'Problem-Solution',
      hook: `Struggling with ${product}? You're not alone.`,
      body: `Thousands of people face this challenge every day. But there's a better way.`,
      cta: `Discover the solution →`
    },
    {
      type: 'Social Proof',
      hook: `Join 10,000+ people who've transformed their ${product}`,
      body: `See why they're calling this "the best decision they ever made."`,
      cta: `Get started free →`
    },
    {
      type: 'Curiosity',
      hook: `The ${product} secret that changes everything`,
      body: `This simple shift made all the difference. Here's what happened...`,
      cta: `Learn more →`
    },
    {
      type: 'FOMO',
      hook: `Others are already getting results with ${product}`,
      body: `Don't get left behind. The window is closing.`,
      cta: `Claim your spot →`
    }
  ];
  
  adCopy.variations = variations.map(v => ({
    ...v,
    characterCount: (v.hook + v.body + v.cta).length,
    platformOptimized: platform
  }));
  
  adCopy.generatedAt = new Date().toISOString();
  
  copyData.generated.push(adCopy);
  await saveData();
  
  return adCopy;
}

/**
 * Generate CTAs
 */
async function generateCTAs(action, options = {}) {
  const purpose = options.purpose || 'purchase';
  const templates = CTA_TEMPLATES[purpose] || CTA_TEMPLATES.purchase;
  
  const ctas = templates.map(template => ({
    cta: template.replace(/\[ACTION\]/g, action),
    purpose,
    variation: 'standard'
  }));
  
  // Add personalized variations
  ctas.push(
    { cta: `Yes, I Want to ${action}!`, purpose, variation: 'affirmative' },
    { cta: `Start ${action} Now`, purpose, variation: 'action' },
    { cta: `Show Me How to ${action}`, purpose, variation: 'curiosity' }
  );
  
  return {
    action,
    purpose,
    ctas,
    bestPractices: [
      'Use action verbs',
      'Create urgency',
      'Be specific about the outcome',
      'Use first person ("I want" vs "Get")',
      'A/B test different variations'
    ]
  };
}

/**
 * Generate benefits list
 */
async function extractBenefits(product, options = {}) {
  const count = options.count || 10;
  
  return {
    product,
    benefits: generateBenefits(product, count),
    framework: 'FAB (Features-Advantages-Benefits)',
    tips: [
      'Lead with the benefit, not the feature',
      'Use "so that" to connect features to benefits',
      'Focus on emotional outcomes',
      'Be specific with numbers when possible',
      'Address the "WIIFM" (What\'s In It For Me)'
    ]
  };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'sales': {
        const product = args.join(' ') || 'Digital Marketing Course';
        console.log(`Generating sales page for: ${product}...`);
        
        const salesPage = await generateSalesPage(product);
        
        console.log('\n' + '='.repeat(60));
        console.log('SALES PAGE COPY');
        console.log('='.repeat(60));
        console.log(`\nHeadline: ${salesPage.headline.main}`);
        console.log(`Subheadline: ${salesPage.headline.sub}`);
        
        console.log('\nProblem Section:');
        console.log(`  ${salesPage.sections.problem?.headline || 'Generated'}`);
        
        console.log('\nTop Benefits:');
        for (const b of salesPage.benefits.slice(0, 4)) {
          console.log(`  ${b.icon} ${b.benefit}`);
        }
        
        console.log('\nCTA:');
        console.log(`  ${salesPage.cta.primary}`);
        console.log(`  ${salesPage.cta.price}`);
        
        console.log('\nGuarantee:');
        console.log(`  ${salesPage.guarantee.headline}`);
        break;
      }
      
      case 'landing': {
        const offer = args.join(' ') || 'Growth Strategy Guide';
        console.log(`Generating landing page for: ${offer}...`);
        
        const landing = await generateLandingPage(offer);
        
        console.log('\nLanding Page Copy');
        console.log('='.repeat(50));
        console.log(`Headline: ${landing.headline}`);
        console.log(`Subheadline: ${landing.subheadline}`);
        
        console.log('\nBullet Points:');
        for (const point of landing.bulletPoints) {
          console.log(`  • ${point}`);
        }
        
        console.log(`\nCTA: ${landing.cta}`);
        break;
      }
      
      case 'ad': {
        const product = args.join(' ') || 'Online Course';
        console.log(`Generating ad copy for: ${product}...`);
        
        const adCopy = await generateAdCopy(product);
        
        console.log('\nAd Copy Variations');
        console.log('='.repeat(50));
        
        for (const v of adCopy.variations) {
          console.log(`\n[${v.type}]`);
          console.log(`  Hook: ${v.hook}`);
          console.log(`  Body: ${v.body}`);
          console.log(`  CTA: ${v.cta}`);
        }
        break;
      }
      
      case 'cta': {
        const action = args.join(' ') || 'Get Started';
        console.log(`Generating CTAs for: ${action}...`);
        
        const result = await generateCTAs(action);
        
        console.log('\nCall-to-Action Options');
        console.log('='.repeat(50));
        
        for (const cta of result.ctas) {
          console.log(`  [${cta.variation}] "${cta.cta}"`);
        }
        
        console.log('\nBest Practices:');
        for (const tip of result.bestPractices) {
          console.log(`  • ${tip}`);
        }
        break;
      }
      
      case 'benefits': {
        const product = args.join(' ') || 'Productivity App';
        console.log(`Extracting benefits for: ${product}...`);
        
        const result = await extractBenefits(product);
        
        console.log('\nBenefits List');
        console.log('='.repeat(50));
        
        for (const b of result.benefits) {
          console.log(`  ${b.icon} ${b.benefit}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Copywriter Module');
        console.log('==================');
        console.log(`Copy frameworks: ${Object.keys(COPY_FRAMEWORKS).length}`);
        console.log(`Persuasion triggers: ${Object.keys(PERSUASION_TRIGGERS).length}`);
        console.log(`CTA categories: ${Object.keys(CTA_TEMPLATES).length}`);
        console.log(`Guarantee types: ${Object.keys(GUARANTEE_TYPES).length}`);
        console.log(`Copy pieces generated: ${copyData.generated.length}`);
        break;
      }
      
      default:
        console.log('Copywriter - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  generateSalesPage,
  generateLandingPage,
  generateAdCopy,
  generateCTAs,
  extractBenefits,
  COPY_FRAMEWORKS,
  PERSUASION_TRIGGERS,
  CTA_TEMPLATES,
  GUARANTEE_TYPES
};

// Run CLI
main().catch(console.error);
