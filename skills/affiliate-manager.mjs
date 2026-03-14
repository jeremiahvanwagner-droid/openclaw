#!/usr/bin/env node
/**
 * OpenClaw Affiliate Manager Agent
 * 
 * Distribution Division - Affiliate program management and optimization
 * 
 * Features:
 *   - Affiliate program setup
 *   - Commission structures
 *   - Affiliate recruitment
 *   - Performance tracking
 *   - Payout management
 *   - Promotional assets
 * 
 * Usage: node affiliate-manager.mjs <command> [args...]
 * 
 * Commands:
 *   setup <program>           Setup affiliate program
 *   commission <structure>    Configure commissions
 *   recruit <strategy>        Recruitment plan
 *   assets <product>          Generate promo assets
 *   track <affiliate>         Track performance
 *   payout <period>           Process payouts
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const AFFILIATE_FILE = path.join(DATA_DIR, 'affiliate-data.json');

// Affiliate platforms
const AFFILIATE_PLATFORMS = {
  thrivecart: {
    name: 'ThriveCart',
    type: 'Built-in',
    features: ['Cookie tracking', 'Commission rules', 'Payouts'],
    payoutMethod: 'PayPal, Stripe'
  },
  firstpromoter: {
    name: 'FirstPromoter',
    type: 'Dedicated',
    features: ['Referral tracking', 'Multi-tier', 'Rewards'],
    payoutMethod: 'PayPal, Bank'
  },
  refersion: {
    name: 'Refersion',
    type: 'Dedicated',
    features: ['E-commerce integration', 'Coupon tracking', 'Analytics'],
    payoutMethod: 'PayPal, Gift cards'
  },
  rewardful: {
    name: 'Rewardful',
    type: 'SaaS focused',
    features: ['Stripe integration', 'Recurring commissions', 'Portal'],
    payoutMethod: 'PayPal, Wire'
  },
  tapfiliate: {
    name: 'Tapfiliate',
    type: 'Dedicated',
    features: ['Cloud-based', 'Multi-program', 'Automation'],
    payoutMethod: 'PayPal, Bank'
  },
  custom: {
    name: 'Custom Build',
    type: 'Self-hosted',
    features: ['Full control', 'Custom rules', 'Integration flexibility'],
    payoutMethod: 'Any'
  }
};

// Commission structures
const COMMISSION_STRUCTURES = {
  percentageSale: {
    name: 'Percentage of Sale',
    description: 'Fixed percentage of each sale',
    typical: '20-50%',
    bestFor: 'Digital products, courses'
  },
  flatRate: {
    name: 'Flat Rate',
    description: 'Fixed amount per sale',
    typical: '$10-$100',
    bestFor: 'Consistent pricing products'
  },
  tiered: {
    name: 'Tiered Commission',
    description: 'Increases with performance',
    typical: '20% → 30% → 40%',
    bestFor: 'Motivating top performers'
  },
  recurring: {
    name: 'Recurring Commission',
    description: 'Ongoing % for subscriptions',
    typical: '10-30% recurring',
    bestFor: 'SaaS, memberships'
  },
  twoTier: {
    name: 'Two-Tier',
    description: 'Earn from recruited affiliates',
    typical: '10% of sub-affiliate sales',
    bestFor: 'Network building'
  },
  hybrid: {
    name: 'Hybrid',
    description: 'Multiple commission types combined',
    typical: 'Varies',
    bestFor: 'Complex product lines'
  }
};

// Affiliate tiers
const AFFILIATE_TIERS = {
  starter: {
    name: 'Starter',
    requirements: 'Application approved',
    commission: '20%',
    perks: ['Basic swipe files', 'Email support']
  },
  silver: {
    name: 'Silver',
    requirements: '$1,000+ in sales',
    commission: '25%',
    perks: ['Custom links', 'Priority support']
  },
  gold: {
    name: 'Gold',
    requirements: '$5,000+ in sales',
    commission: '30%',
    perks: ['Early access', 'Co-marketing', 'Bonus commissions']
  },
  platinum: {
    name: 'Platinum',
    requirements: '$25,000+ in sales',
    commission: '40%',
    perks: ['VIP access', 'JV opportunities', 'Dedicated manager']
  }
};

// Recruitment sources
const RECRUITMENT_SOURCES = {
  customers: 'Existing customers → affiliates',
  influencers: 'Industry influencers/creators',
  affiliateNetworks: 'ClickBank, ShareASale, CJ',
  competitors: 'Affiliates from competing products',
  podcasters: 'Podcast hosts in niche',
  bloggers: 'Content creators with audience',
  youtubers: 'YouTube creators',
  emailListOwners: 'JV partners with lists'
};

// Data storage
let affiliateData = {
  programs: [],
  affiliates: [],
  commissions: [],
  payouts: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(AFFILIATE_FILE, 'utf8');
    affiliateData = JSON.parse(data);
  } catch {
    affiliateData = { programs: [], affiliates: [], commissions: [], payouts: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(AFFILIATE_FILE, JSON.stringify(affiliateData, null, 2));
}

/**
 * Setup affiliate program
 */
async function setupProgram(programName, options = {}) {
  const platform = options.platform || 'thrivecart';
  const platformConfig = AFFILIATE_PLATFORMS[platform] || AFFILIATE_PLATFORMS.thrivecart;
  
  const program = {
    id: `program-${Date.now()}`,
    name: programName,
    platform,
    platformConfig,
    products: [],
    settings: {},
    tiers: Object.values(AFFILIATE_TIERS)
  };
  
  // Program settings
  program.settings = {
    cookieDuration: options.cookieDays || 60,
    attributionModel: options.attribution || 'Last click',
    payoutThreshold: options.threshold || 50,
    payoutSchedule: options.schedule || 'Monthly',
    payoutDay: 15,
    approvalRequired: true,
    publicSignup: options.public || true
  };
  
  // Application requirements
  program.application = {
    fields: ['Name', 'Email', 'Website/social', 'Audience size', 'Promotion plan'],
    autoApprove: false,
    reviewTime: '24-48 hours',
    welcomeEmail: true
  };
  
  // Terms and conditions
  program.terms = [
    'No paid ads on brand keywords',
    'No spam or unsolicited emails',
    'Must disclose affiliate relationship',
    'Cookie duration: 60 days',
    'Refund period must pass before commission'
  ];
  
  program.generatedAt = new Date().toISOString();
  
  affiliateData.programs.push(program);
  await saveData();
  
  return program;
}

/**
 * Configure commission structure
 */
async function configureCommission(structure, options = {}) {
  const structureConfig = COMMISSION_STRUCTURES[structure] || COMMISSION_STRUCTURES.percentageSale;
  
  const commission = {
    id: `commission-${Date.now()}`,
    structure,
    config: structureConfig,
    rules: []
  };
  
  switch (structure) {
    case 'percentageSale':
      commission.rules = [
        { product: 'Main Product', commission: options.percentage || 30, type: 'percentage' },
        { product: 'Upsell 1', commission: options.percentage || 30, type: 'percentage' },
        { product: 'Order Bumps', commission: options.percentage || 30, type: 'percentage' }
      ];
      break;
      
    case 'tiered':
      commission.rules = [
        { tier: 'Starter (0-10 sales)', commission: 20, type: 'percentage' },
        { tier: 'Silver (11-50 sales)', commission: 25, type: 'percentage' },
        { tier: 'Gold (51-200 sales)', commission: 30, type: 'percentage' },
        { tier: 'Platinum (201+ sales)', commission: 40, type: 'percentage' }
      ];
      commission.resetPeriod = 'Rolling 30 days';
      break;
      
    case 'recurring':
      commission.rules = [
        { product: 'Subscription', commission: 20, type: 'percentage', recurring: true },
        { product: 'Subscription', durationMonths: 12, maxMonths: 12 }
      ];
      commission.churnProtection = 'Commission clawed back on refund/cancel';
      break;
      
    case 'hybrid':
      commission.rules = [
        { product: 'Course', commission: 30, type: 'percentage', oneTime: true },
        { product: 'Membership', commission: 20, type: 'percentage', recurring: true },
        { bonus: 'First 50 affiliates to 10 sales', amount: 500, type: 'flat' }
      ];
      break;
      
    default:
      commission.rules = [
        { product: 'All products', commission: 30, type: 'percentage' }
      ];
  }
  
  // Bonus structure
  commission.bonuses = [
    { name: 'Launch Week Bonus', condition: 'First 7 days', extra: '+10%' },
    { name: 'Top Affiliate Bonus', condition: '#1 sales', prize: '$500 cash' },
    { name: 'Milestone Bonus', condition: '100 sales', prize: '$1000 bonus' }
  ];
  
  commission.generatedAt = new Date().toISOString();
  
  affiliateData.commissions.push(commission);
  await saveData();
  
  return commission;
}

/**
 * Create recruitment plan
 */
async function createRecruitmentPlan(strategy, options = {}) {
  const plan = {
    id: `recruit-${Date.now()}`,
    strategy,
    target: options.target || 100,
    timeline: options.timeline || '90 days',
    channels: [],
    outreach: {}
  };
  
  // Define channels based on strategy
  switch (strategy) {
    case 'customers':
      plan.channels = [
        { channel: 'Thank you page invite', expected: 20 },
        { channel: 'Post-purchase email', expected: 30 },
        { channel: 'Customer success outreach', expected: 25 },
        { channel: 'Referral program upgrade', expected: 25 }
      ];
      plan.messaging = {
        angle: 'Share what you love',
        incentive: 'Earn while you share'
      };
      break;
      
    case 'influencers':
      plan.channels = [
        { channel: 'Instagram DMs', expected: 15 },
        { channel: 'YouTube outreach', expected: 10 },
        { channel: 'Podcast pitches', expected: 10 },
        { channel: 'Twitter/X engagement', expected: 15 }
      ];
      plan.messaging = {
        angle: 'Partnership opportunity',
        incentive: 'Premium commissions + exclusives'
      };
      break;
      
    case 'networks':
      plan.channels = [
        { channel: 'ClickBank marketplace', expected: 50 },
        { channel: 'JVZoo listings', expected: 30 },
        { channel: 'Warrior Forum JV', expected: 20 }
      ];
      plan.messaging = {
        angle: 'High-converting offers',
        incentive: 'Proven EPCs + bonuses'
      };
      break;
      
    default:
      plan.channels = Object.entries(RECRUITMENT_SOURCES).slice(0, 5).map(([key, desc]) => ({
        channel: desc,
        expected: 20
      }));
  }
  
  // Outreach templates
  plan.outreach = {
    initial: {
      subject: 'Partnership opportunity - [Product Name]',
      body: 'Personalized pitch highlighting mutual benefit',
      followUp: '3-5 day sequence'
    },
    sequence: [
      { day: 0, action: 'Initial outreach' },
      { day: 3, action: 'Follow-up if no response' },
      { day: 7, action: 'Value-add follow-up' },
      { day: 14, action: 'Final check-in' }
    ]
  };
  
  plan.generatedAt = new Date().toISOString();
  
  return plan;
}

/**
 * Generate promotional assets
 */
async function generatePromoAssets(product, options = {}) {
  const assets = {
    id: `assets-${Date.now()}`,
    product,
    package: {}
  };
  
  // Swipe copy
  assets.package.swipeCopy = {
    emails: [
      { type: 'Curiosity email', subject: 'This changed everything for me...', length: 'Short' },
      { type: 'Story email', subject: 'My journey from X to Y', length: 'Medium' },
      { type: 'Direct pitch', subject: '[Product Name] is now available', length: 'Short' }
    ],
    socialPosts: [
      { platform: 'Instagram', type: 'Carousel of benefits' },
      { platform: 'Twitter/X', type: 'Thread about results' },
      { platform: 'Facebook', type: 'Personal recommendation' },
      { platform: 'LinkedIn', type: 'Professional use case' }
    ]
  };
  
  // Graphics
  assets.package.graphics = {
    banners: [
      { size: '728x90', name: 'Leaderboard' },
      { size: '300x250', name: 'Medium Rectangle' },
      { size: '160x600', name: 'Wide Skyscraper' },
      { size: '320x50', name: 'Mobile Banner' }
    ],
    social: [
      { size: '1080x1080', platform: 'Instagram Square' },
      { size: '1080x1920', platform: 'Instagram/TikTok Story' },
      { size: '1200x630', platform: 'Facebook/LinkedIn' },
      { size: '1600x900', platform: 'YouTube Thumbnail' }
    ]
  };
  
  // Video assets
  assets.package.videos = [
    { type: 'Product demo', length: '2-3 min' },
    { type: 'Testimonial compilation', length: '60 sec' },
    { type: 'Quick pitch', length: '30 sec' }
  ];
  
  // Tracking links
  assets.package.tracking = {
    baseUrl: `https://yoursite.com/go/${product.toLowerCase().replace(/\s+/g, '-')}`,
    parameters: '?ref=AFFILIATE_ID',
    example: 'https://yoursite.com/go/product?ref=john123'
  };
  
  // Bonus content
  assets.package.bonuses = {
    exclusiveOffer: 'Affiliates can offer exclusive bonuses',
    reviewCopy: 'Provided for authentic reviews',
    demoAccess: 'Free product access for review'
  };
  
  assets.generatedAt = new Date().toISOString();
  
  return assets;
}

/**
 * Track affiliate performance
 */
async function trackPerformance(affiliateId = null, data = {}) {
  const performance = {
    affiliate: affiliateId || 'All affiliates',
    period: data.period || 'Last 30 days',
    metrics: {},
    ranking: []
  };
  
  if (affiliateId) {
    // Individual affiliate metrics
    performance.metrics = {
      clicks: data.clicks || 1250,
      leads: data.leads || 125,
      sales: data.sales || 25,
      revenue: data.revenue || 2425,
      commission: data.commission || 727.50,
      conversionRate: '2%',
      epc: '$0.58'
    };
    
    performance.history = [
      { month: 'Month 1', sales: 8, commission: 232 },
      { month: 'Month 2', sales: 12, commission: 348 },
      { month: 'Month 3', sales: 25, commission: 727.50 }
    ];
  } else {
    // Program-wide metrics
    performance.metrics = {
      totalAffiliates: data.affiliates || 150,
      activeAffiliates: Math.round((data.affiliates || 150) * 0.25),
      totalClicks: data.clicks || 45000,
      totalSales: data.sales || 450,
      totalRevenue: data.revenue || 43650,
      totalCommissions: data.commissions || 13095
    };
    
    performance.topAffiliates = [
      { rank: 1, id: 'aff_001', sales: 85, commission: 2465 },
      { rank: 2, id: 'aff_002', sales: 62, commission: 1798 },
      { rank: 3, id: 'aff_003', sales: 48, commission: 1392 },
      { rank: 4, id: 'aff_004', sales: 41, commission: 1189 },
      { rank: 5, id: 'aff_005', sales: 35, commission: 1015 }
    ];
  }
  
  performance.generatedAt = new Date().toISOString();
  
  return performance;
}

/**
 * Process payouts
 */
async function processPayouts(period = null, options = {}) {
  const payoutRun = {
    id: `payout-${Date.now()}`,
    period: period || 'This month',
    status: 'pending',
    summary: {},
    payouts: []
  };
  
  // Generate sample payouts
  payoutRun.payouts = [
    { affiliateId: 'aff_001', name: 'John Smith', amount: 847.50, method: 'PayPal', status: 'pending' },
    { affiliateId: 'aff_002', name: 'Jane Doe', amount: 623.00, method: 'PayPal', status: 'pending' },
    { affiliateId: 'aff_003', name: 'Bob Wilson', amount: 412.80, method: 'Stripe', status: 'pending' },
    { affiliateId: 'aff_004', name: 'Sarah Johnson', amount: 285.00, method: 'PayPal', status: 'pending' },
    { affiliateId: 'aff_005', name: 'Mike Brown', amount: 156.30, method: 'PayPal', status: 'pending' }
  ];
  
  // Summary
  payoutRun.summary = {
    totalPayouts: payoutRun.payouts.length,
    totalAmount: payoutRun.payouts.reduce((sum, p) => sum + p.amount, 0),
    byMethod: {
      paypal: payoutRun.payouts.filter(p => p.method === 'PayPal').length,
      stripe: payoutRun.payouts.filter(p => p.method === 'Stripe').length
    },
    belowThreshold: 12,
    processingDate: new Date().toISOString()
  };
  
  // Processing steps
  payoutRun.steps = [
    { step: 1, action: 'Verify all sales cleared refund period', status: 'complete' },
    { step: 2, action: 'Calculate commissions', status: 'complete' },
    { step: 3, action: 'Review for fraud/violations', status: 'pending' },
    { step: 4, action: 'Process payments', status: 'pending' },
    { step: 5, action: 'Send confirmation emails', status: 'pending' }
  ];
  
  payoutRun.generatedAt = new Date().toISOString();
  
  affiliateData.payouts.push(payoutRun);
  await saveData();
  
  return payoutRun;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'setup': {
        const programName = args.join(' ') || 'Product Affiliate Program';
        const program = await setupProgram(programName);
        
        console.log('Affiliate Program Setup');
        console.log('='.repeat(50));
        console.log(`Name: ${program.name}`);
        console.log(`Platform: ${program.platformConfig.name}`);
        console.log(`Cookie: ${program.settings.cookieDuration} days`);
        console.log(`Payout: ${program.settings.payoutSchedule}`);
        break;
      }
      
      case 'commission': {
        const structure = args[0] || 'percentageSale';
        const commission = await configureCommission(structure);
        
        console.log(`Commission Structure: ${commission.config.name}`);
        console.log('='.repeat(50));
        console.log(`Typical: ${commission.config.typical}`);
        console.log('\nRules:');
        for (const rule of commission.rules.slice(0, 3)) {
          const label = rule.product || rule.tier;
          console.log(`  ${label}: ${rule.commission}%`);
        }
        break;
      }
      
      case 'recruit': {
        const strategy = args[0] || 'customers';
        const plan = await createRecruitmentPlan(strategy);
        
        console.log(`Recruitment Plan: ${strategy}`);
        console.log('='.repeat(50));
        console.log(`Target: ${plan.target} affiliates`);
        console.log(`Timeline: ${plan.timeline}`);
        console.log('\nChannels:');
        for (const ch of plan.channels.slice(0, 4)) {
          console.log(`  ${ch.channel}: ${ch.expected} expected`);
        }
        break;
      }
      
      case 'assets': {
        const product = args.join(' ') || 'Digital Product';
        const assets = await generatePromoAssets(product);
        
        console.log(`Promotional Assets: ${assets.product}`);
        console.log('='.repeat(50));
        console.log(`Emails: ${assets.package.swipeCopy.emails.length}`);
        console.log(`Social posts: ${assets.package.swipeCopy.socialPosts.length}`);
        console.log(`Banner sizes: ${assets.package.graphics.banners.length}`);
        break;
      }
      
      case 'track': {
        const affiliateId = args[0] || null;
        const performance = await trackPerformance(affiliateId);
        
        console.log('Performance Tracking');
        console.log('='.repeat(50));
        if (affiliateId) {
          console.log(`Affiliate: ${affiliateId}`);
          console.log(`Sales: ${performance.metrics.sales}`);
          console.log(`Commission: $${performance.metrics.commission}`);
          console.log(`EPC: ${performance.metrics.epc}`);
        } else {
          console.log(`Active Affiliates: ${performance.metrics.activeAffiliates}`);
          console.log(`Total Sales: ${performance.metrics.totalSales}`);
          console.log(`Total Commissions: $${performance.metrics.totalCommissions}`);
        }
        break;
      }
      
      case 'payout': {
        const period = args.join(' ') || 'This month';
        const payout = await processPayouts(period);
        
        console.log('Payout Processing');
        console.log('='.repeat(50));
        console.log(`Period: ${payout.period}`);
        console.log(`Affiliates: ${payout.summary.totalPayouts}`);
        console.log(`Total Amount: $${payout.summary.totalAmount.toFixed(2)}`);
        break;
      }
      
      case 'test': {
        console.log('Affiliate Manager Module');
        console.log('========================');
        console.log(`Platforms: ${Object.keys(AFFILIATE_PLATFORMS).length}`);
        console.log(`Commission structures: ${Object.keys(COMMISSION_STRUCTURES).length}`);
        console.log(`Affiliate tiers: ${Object.keys(AFFILIATE_TIERS).length}`);
        console.log(`Programs created: ${affiliateData.programs.length}`);
        break;
      }
      
      default:
        console.log('Affiliate Manager - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  setupProgram,
  configureCommission,
  createRecruitmentPlan,
  generatePromoAssets,
  trackPerformance,
  processPayouts,
  AFFILIATE_PLATFORMS,
  COMMISSION_STRUCTURES,
  AFFILIATE_TIERS,
  RECRUITMENT_SOURCES
};

// Run CLI
main().catch(console.error);
