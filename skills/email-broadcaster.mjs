#!/usr/bin/env node
/**
 * OpenClaw Email Broadcaster Agent
 * 
 * Distribution Division - Email campaign management
 * 
 * Features:
 *   - Broadcast email creation
 *   - List segmentation
 *   - A/B testing setup
 *   - Delivery optimization
 *   - Campaign scheduling
 *   - Performance tracking
 * 
 * Usage: node email-broadcaster.mjs <command> [args...]
 * 
 * Commands:
 *   broadcast <type>          Create broadcast email
 *   segment <criteria>        Generate list segments
 *   abtest <subject>          Create A/B test
 *   schedule <campaign>       Schedule campaign
 *   warmup <plan>             Generate warmup plan
 *   analyze <campaign>        Analyze performance
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const BROADCASTER_FILE = path.join(DATA_DIR, 'broadcaster-data.json');

// Email types and templates
const EMAIL_TYPES = {
  newsletter: {
    name: 'Newsletter',
    structure: ['header', 'intro', 'mainContent', 'sections', 'cta', 'footer'],
    avgOpenRate: '20-30%',
    bestPractices: ['Consistent send day', 'Value-first content', 'Single focus']
  },
  promotion: {
    name: 'Promotional',
    structure: ['hook', 'offer', 'benefits', 'urgency', 'cta', 'ps'],
    avgOpenRate: '15-25%',
    bestPractices: ['Clear offer', 'Strong CTA', 'Scarcity/urgency']
  },
  announcement: {
    name: 'Announcement',
    structure: ['headline', 'news', 'impact', 'nextSteps', 'cta'],
    avgOpenRate: '25-35%',
    bestPractices: ['Newsworthy angle', 'Clear benefit', 'Simple action']
  },
  educational: {
    name: 'Educational',
    structure: ['hook', 'lesson', 'examples', 'actionSteps', 'cta'],
    avgOpenRate: '22-32%',
    bestPractices: ['One key takeaway', 'Practical advice', 'Easy to implement']
  },
  reEngagement: {
    name: 'Re-engagement',
    structure: ['personalGreeting', 'weMessYou', 'whatYouMissed', 'specialOffer', 'cta'],
    avgOpenRate: '10-20%',
    bestPractices: ['Personal tone', 'Special incentive', 'Easy unsubscribe']
  }
};

// Segmentation criteria
const SEGMENT_CRITERIA = {
  engagement: {
    active: 'Opened email in last 30 days',
    engaged: 'Clicked in last 60 days',
    inactive: 'No opens in 90+ days',
    dormant: 'No activity in 180+ days'
  },
  purchase: {
    customers: 'Made a purchase',
    prospects: 'Never purchased',
    vip: '3+ purchases',
    recent: 'Purchased in last 30 days'
  },
  source: {
    organic: 'Signed up directly',
    leadMagnet: 'Downloaded lead magnet',
    webinar: 'Registered for webinar',
    referral: 'Referred by customer'
  },
  demographic: {
    location: 'Geographic region',
    industry: 'Business industry',
    role: 'Job title/role',
    companySize: 'Company size'
  }
};

// Subject line formulas
const SUBJECT_FORMULAS = {
  curiosity: [
    'The [unexpected] way to [achieve result]',
    'Why [common belief] is wrong',
    '[Number] [topic] secrets nobody talks about'
  ],
  benefit: [
    'How to [achieve result] in [timeframe]',
    'Get [benefit] without [pain point]',
    '[Result] guaranteed (here\'s how)'
  ],
  urgency: [
    'Last chance: [offer] ends tonight',
    'Only [number] spots left',
    '[Time] left to claim your [benefit]'
  ],
  personal: [
    'Quick question, [Name]',
    '[Name], I noticed something...',
    'You asked, I delivered'
  ],
  proof: [
    'How [person] got [result] in [time]',
    '[Number] people already [achieved result]',
    'Case study: [result] in [timeframe]'
  ]
};

// Sending times
const OPTIMAL_SEND_TIMES = {
  b2b: {
    days: ['Tuesday', 'Wednesday', 'Thursday'],
    times: ['10:00 AM', '2:00 PM'],
    avoid: ['Monday morning', 'Friday afternoon']
  },
  b2c: {
    days: ['Tuesday', 'Thursday', 'Saturday'],
    times: ['8:00 AM', '12:00 PM', '8:00 PM'],
    avoid: ['Late night', 'Early morning']
  },
  promotion: {
    days: ['Tuesday', 'Thursday'],
    times: ['10:00 AM', '2:00 PM', '7:00 PM'],
    avoid: ['Major holidays', 'Weekends']
  }
};

// Data storage
let broadcasterData = {
  campaigns: [],
  segments: [],
  tests: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(BROADCASTER_FILE, 'utf8');
    broadcasterData = JSON.parse(data);
  } catch {
    broadcasterData = { campaigns: [], segments: [], tests: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(BROADCASTER_FILE, JSON.stringify(broadcasterData, null, 2));
}

/**
 * Create broadcast email
 */
async function createBroadcast(type, options = {}) {
  const emailType = EMAIL_TYPES[type.toLowerCase()] || EMAIL_TYPES.newsletter;
  const topic = options.topic || 'Your Topic';
  
  const broadcast = {
    id: `broadcast-${Date.now()}`,
    type,
    topic,
    email: {}
  };
  
  // Generate subject lines
  broadcast.email.subjectOptions = generateSubjectLines(topic, type);
  
  // Generate preheader options
  broadcast.email.preheaderOptions = [
    `Discover how to ${topic.toLowerCase()} today...`,
    `Inside: Everything you need to know about ${topic.toLowerCase()}`,
    `Don't miss this important update about ${topic.toLowerCase()}`
  ];
  
  // Generate email structure
  broadcast.email.structure = {};
  
  for (const section of emailType.structure) {
    broadcast.email.structure[section] = generateSectionContent(section, topic, type);
  }
  
  // Sending recommendations
  broadcast.recommendations = {
    type: emailType.name,
    expectedOpenRate: emailType.avgOpenRate,
    bestPractices: emailType.bestPractices,
    optimalSendTimes: OPTIMAL_SEND_TIMES[type === 'promotion' ? 'promotion' : 'b2b']
  };
  
  broadcast.generatedAt = new Date().toISOString();
  
  broadcasterData.campaigns.push(broadcast);
  await saveData();
  
  return broadcast;
}

/**
 * Generate subject lines
 */
function generateSubjectLines(topic, type) {
  const lines = [];
  
  // Get formulas based on type
  const formulas = type === 'promotion' 
    ? [...SUBJECT_FORMULAS.benefit, ...SUBJECT_FORMULAS.urgency]
    : [...SUBJECT_FORMULAS.curiosity, ...SUBJECT_FORMULAS.benefit];
  
  for (const formula of formulas.slice(0, 5)) {
    const subject = formula
      .replace('[topic]', topic)
      .replace('[result]', `master ${topic}`)
      .replace('[benefit]', `better ${topic}`)
      .replace('[timeframe]', '30 days')
      .replace('[number]', '7')
      .replace('[Number]', '7')
      .replace('[pain point]', 'the struggle')
      .replace('[unexpected]', 'surprising')
      .replace('[common belief]', 'what you\'ve been told')
      .replace('[offer]', 'special offer')
      .replace('[Time]', '24 hours')
      .replace('[person]', 'Sarah')
      .replace('[time]', '2 weeks');
    
    lines.push({
      subject,
      formula,
      recommended: lines.length === 0
    });
  }
  
  return lines;
}

/**
 * Generate section content
 */
function generateSectionContent(section, topic, type) {
  const content = {
    header: {
      content: `[Logo/Brand Name]`,
      notes: 'Keep header clean and recognizable'
    },
    intro: {
      content: `Hey [First Name],\n\nI wanted to share something important about ${topic} that I think you'll find valuable...`,
      notes: 'Personal greeting, build curiosity'
    },
    hook: {
      content: `What if you could [achieve desired result with ${topic}] without [common pain point]?\n\nToday, I'm going to show you exactly how.`,
      notes: 'Lead with benefit, create curiosity'
    },
    mainContent: {
      content: `[Main value content about ${topic}]\n\nKey points:\n• Point 1\n• Point 2\n• Point 3`,
      notes: 'Deliver promised value'
    },
    sections: {
      content: `## Section 1: [Topic Area]\n[Content]\n\n## Section 2: [Topic Area]\n[Content]`,
      notes: 'Break into scannable sections'
    },
    lesson: {
      content: `Here's what I want you to understand about ${topic}:\n\n[Key insight]\n\nThis matters because [reason]...`,
      notes: 'One clear takeaway'
    },
    examples: {
      content: `Let me show you an example:\n\n[Real example or case study]\n\nNotice how [key observation]...`,
      notes: 'Concrete, relatable examples'
    },
    offer: {
      content: `For a limited time, you can get [product/service] for [price/discount].\n\nThis includes:\n✓ Feature 1\n✓ Feature 2\n✓ Feature 3`,
      notes: 'Clear offer with benefits'
    },
    benefits: {
      content: `With this, you'll be able to:\n\n→ Benefit 1\n→ Benefit 2\n→ Benefit 3`,
      notes: 'Focus on outcomes, not features'
    },
    urgency: {
      content: `But here's the thing: this offer expires [date/time].\n\nAfter that, [consequence].`,
      notes: 'Real scarcity or urgency'
    },
    actionSteps: {
      content: `Here's what to do next:\n\n1. Step one\n2. Step two\n3. Step three`,
      notes: 'Simple, actionable steps'
    },
    cta: {
      content: `[Button: Get Started Now]\n\nOr reply to this email if you have questions.`,
      notes: 'Single, clear CTA'
    },
    ps: {
      content: `P.S. Remember, [restate key benefit or urgency]. [Link]`,
      notes: 'Restate offer, second CTA opportunity'
    },
    footer: {
      content: `[Company Name]\n[Address]\n[Unsubscribe Link]`,
      notes: 'Required legal elements'
    },
    headline: {
      content: `Big News: [Announcement about ${topic}]`,
      notes: 'Clear, newsworthy headline'
    },
    news: {
      content: `I'm excited to announce [news].\n\nThis means [what it means for reader]...`,
      notes: 'State the news clearly'
    },
    impact: {
      content: `Here's how this affects you:\n\n[Impact points]`,
      notes: 'Make it about the reader'
    },
    nextSteps: {
      content: `Here's what happens next:\n\n[Timeline or actions]`,
      notes: 'Clear expectations'
    },
    personalGreeting: {
      content: `Hey [First Name],\n\nIt's been a while, and I noticed you haven't been around lately.`,
      notes: 'Warm, personal tone'
    },
    weMessYou: {
      content: `I wanted to check in because I genuinely miss having you in our community.`,
      notes: 'Show you care'
    },
    whatYouMissed: {
      content: `Since you've been away, here's what's happened:\n\n• Update 1\n• Update 2\n• Update 3`,
      notes: 'Create FOMO, show value'
    },
    specialOffer: {
      content: `As a "welcome back" gesture, I'd like to offer you [special deal].`,
      notes: 'Incentive to return'
    }
  };
  
  return content[section] || { content: `[${section} content]`, notes: 'Add content' };
}

/**
 * Generate list segments
 */
async function generateSegments(criteria, options = {}) {
  const segmentation = {
    id: `segment-${Date.now()}`,
    criteria,
    segments: []
  };
  
  // Generate segments based on criteria
  const criteriaType = criteria.toLowerCase();
  const criteriaData = SEGMENT_CRITERIA[criteriaType] || SEGMENT_CRITERIA.engagement;
  
  for (const [name, description] of Object.entries(criteriaData)) {
    segmentation.segments.push({
      name,
      description,
      recommendedContent: getRecommendedContent(name, criteriaType),
      sendFrequency: getSendFrequency(name, criteriaType)
    });
  }
  
  // Segmentation strategy
  segmentation.strategy = {
    purpose: `Segment by ${criteria} to personalize messaging`,
    implementation: [
      'Tag subscribers based on criteria',
      'Create targeted campaigns for each segment',
      'Adjust messaging and offers accordingly',
      'Monitor segment performance separately'
    ]
  };
  
  broadcasterData.segments.push(segmentation);
  await saveData();
  
  return segmentation;
}

/**
 * Get recommended content for segment
 */
function getRecommendedContent(segment, criteria) {
  const recommendations = {
    active: 'Regular newsletters, new content, soft promotions',
    engaged: 'Product updates, exclusive offers, case studies',
    inactive: 'Re-engagement campaigns, surveys, incentives',
    dormant: 'Win-back offers, "we miss you" campaigns',
    customers: 'Upsells, loyalty rewards, referral requests',
    prospects: 'Educational content, social proof, soft CTAs',
    vip: 'Exclusive access, premium offers, personal touch',
    recent: 'Onboarding content, first-purchase support'
  };
  
  return recommendations[segment] || 'General content';
}

/**
 * Get send frequency for segment
 */
function getSendFrequency(segment, criteria) {
  const frequencies = {
    active: '2-3 emails per week',
    engaged: '2-4 emails per week',
    inactive: '1 email per week',
    dormant: '1 email per month (re-engagement)',
    customers: '2-3 emails per week',
    prospects: '1-2 emails per week',
    vip: 'As needed (don\'t over-email)',
    recent: 'Daily for first week, then normal'
  };
  
  return frequencies[segment] || 'Weekly';
}

/**
 * Create A/B test
 */
async function createABTest(testType, options = {}) {
  const test = {
    id: `abtest-${Date.now()}`,
    type: testType,
    variants: []
  };
  
  switch (testType.toLowerCase()) {
    case 'subject':
      test.variants = [
        { name: 'A', subject: options.subjectA || '[Curiosity-based subject line]' },
        { name: 'B', subject: options.subjectB || '[Benefit-based subject line]' }
      ];
      test.metric = 'Open Rate';
      test.recommendedSampleSize = '20% of list, 10% each variant';
      break;
      
    case 'content':
      test.variants = [
        { name: 'A', description: 'Long-form content' },
        { name: 'B', description: 'Short-form content' }
      ];
      test.metric = 'Click Rate';
      test.recommendedSampleSize = '20% of list';
      break;
      
    case 'cta':
      test.variants = [
        { name: 'A', cta: 'Get Started Now' },
        { name: 'B', cta: 'Learn More' }
      ];
      test.metric = 'Click Rate';
      test.recommendedSampleSize = '20% of list';
      break;
      
    case 'sendtime':
      test.variants = [
        { name: 'A', time: '10:00 AM' },
        { name: 'B', time: '2:00 PM' }
      ];
      test.metric = 'Open Rate';
      test.recommendedSampleSize = '50% of list, 25% each';
      break;
  }
  
  test.protocol = {
    steps: [
      `Split test group (${test.recommendedSampleSize})`,
      'Send variants simultaneously',
      'Wait 2-4 hours for results',
      'Send winner to remaining list'
    ],
    duration: '2-4 hours minimum',
    statisticalSignificance: 'Need 100+ opens per variant'
  };
  
  broadcasterData.tests.push(test);
  await saveData();
  
  return test;
}

/**
 * Schedule campaign
 */
async function scheduleCampaign(campaign, scheduleConfig = {}) {
  const schedule = {
    id: `schedule-${Date.now()}`,
    campaign,
    timing: {}
  };
  
  const audience = scheduleConfig.audience || 'b2b';
  const optimalTimes = OPTIMAL_SEND_TIMES[audience];
  
  schedule.timing = {
    recommendedDays: optimalTimes.days,
    recommendedTimes: optimalTimes.times,
    avoid: optimalTimes.avoid,
    timezone: scheduleConfig.timezone || 'subscriber local time'
  };
  
  // Generate send schedule
  const now = new Date();
  schedule.suggestedSends = [];
  
  for (let i = 1; i <= 7; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
    
    if (optimalTimes.days.includes(dayName)) {
      schedule.suggestedSends.push({
        date: date.toISOString().split('T')[0],
        day: dayName,
        time: optimalTimes.times[0],
        recommended: schedule.suggestedSends.length === 0
      });
    }
  }
  
  schedule.sendingBestPractices = [
    'Test email before sending',
    'Check all links work',
    'Preview on mobile',
    'Send test to yourself first',
    'Monitor deliverability'
  ];
  
  return schedule;
}

/**
 * Generate warmup plan
 */
async function generateWarmupPlan(options = {}) {
  const listSize = options.listSize || 10000;
  const currentReputation = options.reputation || 'new';
  
  const plan = {
    id: `warmup-${Date.now()}`,
    listSize,
    reputation: currentReputation,
    phases: []
  };
  
  // Calculate warmup phases
  const phases = [
    { week: 1, percentage: 5, expectedSends: Math.round(listSize * 0.05) },
    { week: 2, percentage: 10, expectedSends: Math.round(listSize * 0.10) },
    { week: 3, percentage: 20, expectedSends: Math.round(listSize * 0.20) },
    { week: 4, percentage: 35, expectedSends: Math.round(listSize * 0.35) },
    { week: 5, percentage: 50, expectedSends: Math.round(listSize * 0.50) },
    { week: 6, percentage: 75, expectedSends: Math.round(listSize * 0.75) },
    { week: 7, percentage: 100, expectedSends: listSize }
  ];
  
  plan.phases = phases.map(phase => ({
    ...phase,
    targetAudience: 'Most engaged subscribers first',
    contentType: 'High-value, engagement-focused',
    monitorMetrics: ['Bounce rate', 'Spam complaints', 'Open rate']
  }));
  
  plan.guidelines = [
    'Start with most engaged subscribers',
    'Send valuable content only',
    'Remove bounces immediately',
    'Monitor spam complaints (<0.1%)',
    'Don\'t send daily until week 4',
    'Authenticate domain (SPF, DKIM, DMARC)'
  ];
  
  plan.warningThresholds = {
    bounceRate: '> 2% = pause and clean list',
    spamComplaints: '> 0.1% = review content',
    openRate: '< 10% = check deliverability'
  };
  
  return plan;
}

/**
 * Analyze campaign performance
 */
async function analyzeCampaign(campaignId, metrics = {}) {
  const analysis = {
    campaignId,
    metrics: {
      sent: metrics.sent || 10000,
      delivered: metrics.delivered || 9800,
      opened: metrics.opened || 2500,
      clicked: metrics.clicked || 350,
      converted: metrics.converted || 25,
      bounced: metrics.bounced || 200,
      unsubscribed: metrics.unsubscribed || 15,
      spamComplaints: metrics.spamComplaints || 2
    },
    rates: {}
  };
  
  // Calculate rates
  analysis.rates = {
    deliverability: ((analysis.metrics.delivered / analysis.metrics.sent) * 100).toFixed(2) + '%',
    openRate: ((analysis.metrics.opened / analysis.metrics.delivered) * 100).toFixed(2) + '%',
    clickRate: ((analysis.metrics.clicked / analysis.metrics.delivered) * 100).toFixed(2) + '%',
    clickToOpen: ((analysis.metrics.clicked / analysis.metrics.opened) * 100).toFixed(2) + '%',
    conversionRate: ((analysis.metrics.converted / analysis.metrics.clicked) * 100).toFixed(2) + '%',
    bounceRate: ((analysis.metrics.bounced / analysis.metrics.sent) * 100).toFixed(2) + '%',
    unsubscribeRate: ((analysis.metrics.unsubscribed / analysis.metrics.delivered) * 100).toFixed(2) + '%'
  };
  
  // Benchmark comparison
  analysis.benchmarks = {
    openRate: { industry: '21.5%', yours: analysis.rates.openRate },
    clickRate: { industry: '2.3%', yours: analysis.rates.clickRate },
    bounceRate: { industry: '0.7%', yours: analysis.rates.bounceRate }
  };
  
  // Recommendations
  analysis.recommendations = [];
  
  const openRateNum = parseFloat(analysis.rates.openRate);
  if (openRateNum < 20) {
    analysis.recommendations.push('Improve subject lines - test different formulas');
    analysis.recommendations.push('Clean inactive subscribers from list');
  }
  
  const clickRateNum = parseFloat(analysis.rates.clickRate);
  if (clickRateNum < 2) {
    analysis.recommendations.push('Make CTAs more prominent');
    analysis.recommendations.push('Add more relevant links in content');
  }
  
  return analysis;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'broadcast': {
        const type = args[0] || 'newsletter';
        const broadcast = await createBroadcast(type, { topic: args.slice(1).join(' ') || 'Digital Marketing' });
        
        console.log('Broadcast Email Created');
        console.log('='.repeat(50));
        console.log(`Type: ${broadcast.type}`);
        console.log(`\nSubject Options:`);
        for (const option of broadcast.email.subjectOptions.slice(0, 3)) {
          console.log(`  ${option.recommended ? '★' : '•'} ${option.subject}`);
        }
        break;
      }
      
      case 'segment': {
        const criteria = args[0] || 'engagement';
        const segments = await generateSegments(criteria);
        
        console.log('List Segments');
        console.log('='.repeat(50));
        for (const segment of segments.segments) {
          console.log(`\n${segment.name}:`);
          console.log(`  ${segment.description}`);
          console.log(`  Frequency: ${segment.sendFrequency}`);
        }
        break;
      }
      
      case 'abtest': {
        const type = args[0] || 'subject';
        const test = await createABTest(type);
        
        console.log('A/B Test Setup');
        console.log('='.repeat(50));
        console.log(`Type: ${test.type}`);
        console.log(`Metric: ${test.metric}`);
        console.log(`\nVariants:`);
        for (const variant of test.variants) {
          console.log(`  ${variant.name}: ${JSON.stringify(variant).substring(0, 50)}...`);
        }
        break;
      }
      
      case 'schedule': {
        const campaign = args[0] || 'newsletter';
        const schedule = await scheduleCampaign(campaign);
        
        console.log('Campaign Schedule');
        console.log('='.repeat(50));
        console.log(`Best Days: ${schedule.timing.recommendedDays.join(', ')}`);
        console.log(`Best Times: ${schedule.timing.recommendedTimes.join(', ')}`);
        console.log(`\nSuggested Sends:`);
        for (const send of schedule.suggestedSends.slice(0, 3)) {
          console.log(`  ${send.recommended ? '★' : '•'} ${send.day}, ${send.date} at ${send.time}`);
        }
        break;
      }
      
      case 'warmup': {
        const plan = await generateWarmupPlan({ listSize: 10000 });
        
        console.log('Email Warmup Plan');
        console.log('='.repeat(50));
        console.log(`List Size: ${plan.listSize}`);
        console.log(`\nPhases:`);
        for (const phase of plan.phases.slice(0, 4)) {
          console.log(`  Week ${phase.week}: ${phase.percentage}% (${phase.expectedSends} emails)`);
        }
        break;
      }
      
      case 'analyze': {
        const campaignId = args[0] || 'test-campaign';
        const analysis = await analyzeCampaign(campaignId);
        
        console.log('Campaign Analysis');
        console.log('='.repeat(50));
        console.log(`Open Rate: ${analysis.rates.openRate}`);
        console.log(`Click Rate: ${analysis.rates.clickRate}`);
        console.log(`Conversion: ${analysis.rates.conversionRate}`);
        
        if (analysis.recommendations.length > 0) {
          console.log(`\nRecommendations:`);
          for (const rec of analysis.recommendations) {
            console.log(`  • ${rec}`);
          }
        }
        break;
      }
      
      case 'test': {
        console.log('Email Broadcaster Module');
        console.log('========================');
        console.log(`Email types: ${Object.keys(EMAIL_TYPES).length}`);
        console.log(`Segment criteria: ${Object.keys(SEGMENT_CRITERIA).length}`);
        console.log(`Campaigns: ${broadcasterData.campaigns.length}`);
        break;
      }
      
      default:
        console.log('Email Broadcaster - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  createBroadcast,
  generateSegments,
  createABTest,
  scheduleCampaign,
  generateWarmupPlan,
  analyzeCampaign,
  EMAIL_TYPES,
  SEGMENT_CRITERIA,
  SUBJECT_FORMULAS,
  OPTIMAL_SEND_TIMES
};

// Run CLI
main().catch(console.error);
