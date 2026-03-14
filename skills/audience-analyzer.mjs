#!/usr/bin/env node
/**
 * OpenClaw Audience Analyzer Agent
 * 
 * Research Division - Audience profiling and segmentation
 * 
 * Features:
 *   - Demographic analysis
 *   - Psychographic profiling
 *   - Behavioral segmentation
 *   - Persona generation
 *   - Pain point identification
 *   - Customer journey mapping
 * 
 * Usage: node audience-analyzer.mjs <command> [args...]
 * 
 * Commands:
 *   profile <audience>        Create audience profile
 *   segment <criteria>        Segment audience
 *   persona <niche>           Generate buyer personas
 *   painpoints <audience>     Identify pain points
 *   journey <persona>         Map customer journey
 *   report                    Audience insights report
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const AUDIENCE_FILE = path.join(DATA_DIR, 'audience.json');

// Demographic categories
const DEMOGRAPHICS = {
  age: {
    '18-24': { label: 'Gen Z', characteristics: ['digital native', 'video-first', 'authenticity-focused'] },
    '25-34': { label: 'Millennials', characteristics: ['career-building', 'side-hustle', 'experience-seeker'] },
    '35-44': { label: 'Gen X Early', characteristics: ['family-focused', 'career-peaked', 'stability-seeker'] },
    '45-54': { label: 'Gen X Core', characteristics: ['wealth-building', 'leadership', 'efficiency-driven'] },
    '55-64': { label: 'Boomers', characteristics: ['legacy-minded', 'expertise-rich', 'transition-ready'] },
    '65+': { label: 'Seniors', characteristics: ['retired/retiring', 'knowledge-transfer', 'health-focused'] }
  },
  income: {
    'entry': { range: '$30k-$50k', behavior: 'price-sensitive, ROI-focused' },
    'mid': { range: '$50k-$100k', behavior: 'value-conscious, willing to invest' },
    'upper-mid': { range: '$100k-$200k', behavior: 'quality-focused, time-valued' },
    'high': { range: '$200k+', behavior: 'premium-seeker, done-for-you preferred' }
  },
  education: {
    'high-school': { behavior: 'practical learning, step-by-step needed' },
    'some-college': { behavior: 'self-improvement oriented' },
    'bachelors': { behavior: 'research-based decisions' },
    'advanced': { behavior: 'depth-over-breadth preference' }
  }
};

// Psychographic profiles
const PSYCHOGRAPHICS = {
  motivations: [
    { id: 'financial-freedom', description: 'Escape 9-5, passive income', priority: 'high' },
    { id: 'time-freedom', description: 'Work on own schedule', priority: 'high' },
    { id: 'impact', description: 'Help others, leave legacy', priority: 'medium' },
    { id: 'mastery', description: 'Become expert, continuous growth', priority: 'medium' },
    { id: 'status', description: 'Recognition, achievement', priority: 'low' },
    { id: 'security', description: 'Stable income, reduce risk', priority: 'medium' }
  ],
  fears: [
    { id: 'failure', description: 'Wasted money/time, embarrassment', intensity: 'high' },
    { id: 'overwhelm', description: 'Too complex, not tech-savvy', intensity: 'high' },
    { id: 'scam', description: 'Getting ripped off, not legitimate', intensity: 'medium' },
    { id: 'isolation', description: 'No support, alone in journey', intensity: 'medium' },
    { id: 'competition', description: 'Too late, market saturated', intensity: 'medium' }
  ],
  values: [
    'authenticity', 'freedom', 'family', 'growth', 'impact', 
    'creativity', 'security', 'achievement', 'independence', 'community'
  ]
};

// Behavioral patterns
const BEHAVIORS = {
  buyingBehavior: {
    'impulse': { description: 'Quick decisions, emotional', contentNeeds: ['urgency', 'social proof', 'easy action'] },
    'researcher': { description: 'Extensive research, comparison', contentNeeds: ['detailed info', 'comparisons', 'reviews'] },
    'relationship': { description: 'Trust-based, follows people', contentNeeds: ['personal stories', 'engagement', 'consistency'] },
    'value': { description: 'ROI-focused, practical', contentNeeds: ['case studies', 'numbers', 'guarantees'] }
  },
  contentConsumption: {
    'video': { platforms: ['YouTube', 'TikTok'], format: 'visual learner' },
    'audio': { platforms: ['Podcasts', 'Audiobooks'], format: 'multitasker' },
    'text': { platforms: ['Blog', 'Newsletter'], format: 'deep reader' },
    'interactive': { platforms: ['Courses', 'Workshops'], format: 'hands-on learner' }
  },
  engagementLevel: {
    'lurker': { percentage: 60, behavior: 'Consumes but rarely engages' },
    'casual': { percentage: 25, behavior: 'Occasional likes/comments' },
    'active': { percentage: 12, behavior: 'Regular engagement, shares content' },
    'advocate': { percentage: 3, behavior: 'Promotes, refers, champions' }
  }
};

// Pain point categories
const PAIN_CATEGORIES = {
  financial: ['not enough income', 'debt', 'no savings', 'job insecurity', 'expensive education'],
  time: ['no time', 'overwhelmed', 'burnout', 'work-life balance', 'juggling responsibilities'],
  knowledge: ['don\'t know where to start', 'information overload', 'no clear path', 'outdated skills'],
  confidence: ['fear of failure', 'imposter syndrome', 'not tech-savvy', 'fear of judgment'],
  results: ['tried before and failed', 'not seeing progress', 'plateau', 'slow growth']
};

// Data storage
let audienceData = {
  profiles: [],
  segments: [],
  personas: [],
  journeys: [],
  insights: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(AUDIENCE_FILE, 'utf8');
    audienceData = JSON.parse(data);
  } catch {
    audienceData = { profiles: [], segments: [], personas: [], journeys: [], insights: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(AUDIENCE_FILE, JSON.stringify(audienceData, null, 2));
}

/**
 * Create audience profile
 */
async function createProfile(audienceName, config = {}) {
  const profile = {
    id: `profile-${Date.now()}`,
    name: audienceName,
    createdAt: new Date().toISOString(),
    demographics: {
      primaryAge: config.age || '25-34',
      incomeLevel: config.income || 'mid',
      education: config.education || 'bachelors',
      location: config.location || 'North America',
      gender: config.gender || 'mixed'
    },
    psychographics: {
      primaryMotivation: config.motivation || 'financial-freedom',
      secondaryMotivation: config.secondaryMotivation || 'time-freedom',
      topFears: config.fears || ['failure', 'overwhelm'],
      coreValues: config.values || ['freedom', 'growth', 'family']
    },
    behaviors: {
      buyingStyle: config.buyingStyle || 'researcher',
      preferredContent: config.contentType || 'video',
      platformsUsed: config.platforms || ['YouTube', 'Instagram', 'LinkedIn'],
      engagementLevel: config.engagement || 'casual'
    },
    characteristics: generateCharacteristics(config),
    estimatedSize: estimateAudienceSize(config),
    reachability: calculateReachability(config)
  };
  
  audienceData.profiles.push(profile);
  await saveData();
  
  return profile;
}

/**
 * Generate audience characteristics
 */
function generateCharacteristics(config) {
  const age = config.age || '25-34';
  const ageData = DEMOGRAPHICS.age[age] || DEMOGRAPHICS.age['25-34'];
  
  return {
    generationLabel: ageData.label,
    coreTraits: ageData.characteristics,
    buyingFactors: BEHAVIORS.buyingBehavior[config.buyingStyle || 'researcher'].contentNeeds,
    contentPreferences: BEHAVIORS.contentConsumption[config.contentType || 'video'].format
  };
}

/**
 * Estimate audience size
 */
function estimateAudienceSize(config) {
  // Base estimates by market
  const baseMarkets = {
    'digital-products': 50000000,
    'coaching': 20000000,
    'business': 100000000,
    'health': 80000000,
    'finance': 60000000
  };
  
  const market = config.market || 'business';
  let size = baseMarkets[market] || 30000000;
  
  // Apply demographic filters
  const ageModifiers = {
    '18-24': 0.15, '25-34': 0.25, '35-44': 0.22,
    '45-54': 0.18, '55-64': 0.12, '65+': 0.08
  };
  size *= ageModifiers[config.age || '25-34'];
  
  // Income filter
  const incomeModifiers = { 'entry': 0.35, 'mid': 0.40, 'upper-mid': 0.20, 'high': 0.05 };
  size *= incomeModifiers[config.income || 'mid'];
  
  return {
    total: Math.round(size),
    reachable: Math.round(size * 0.15),
    convertible: Math.round(size * 0.02)
  };
}

/**
 * Calculate reachability score
 */
function calculateReachability(config) {
  let score = 50;
  
  // Platform presence
  const platforms = config.platforms || [];
  if (platforms.includes('YouTube')) score += 10;
  if (platforms.includes('Instagram')) score += 8;
  if (platforms.includes('LinkedIn')) score += 7;
  if (platforms.includes('TikTok')) score += 8;
  if (platforms.includes('Facebook')) score += 5;
  
  // Engagement level bonus
  const engagementBonus = { 'lurker': 0, 'casual': 5, 'active': 10, 'advocate': 15 };
  score += engagementBonus[config.engagement || 'casual'];
  
  return {
    score: Math.min(score, 100),
    difficulty: score >= 70 ? 'easy' : score >= 50 ? 'moderate' : 'challenging',
    bestChannels: platforms.slice(0, 3)
  };
}

/**
 * Segment audience
 */
async function segmentAudience(criteria, options = {}) {
  const segmentation = {
    id: `segment-${Date.now()}`,
    criteria,
    createdAt: new Date().toISOString(),
    segments: []
  };
  
  switch (criteria) {
    case 'awareness':
      segmentation.segments = [
        { name: 'Unaware', percentage: 40, description: 'Don\'t know they have a problem', contentType: 'Educational, problem-aware' },
        { name: 'Problem Aware', percentage: 25, description: 'Know problem, not solution', contentType: 'Solution introduction' },
        { name: 'Solution Aware', percentage: 20, description: 'Know solutions exist', contentType: 'Comparison, features' },
        { name: 'Product Aware', percentage: 10, description: 'Know your product', contentType: 'Offers, testimonials' },
        { name: 'Most Aware', percentage: 5, description: 'Ready to buy', contentType: 'Direct offers, urgency' }
      ];
      break;
      
    case 'engagement':
      segmentation.segments = Object.entries(BEHAVIORS.engagementLevel).map(([key, data]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        percentage: data.percentage,
        description: data.behavior,
        strategy: getEngagementStrategy(key)
      }));
      break;
      
    case 'buying':
      segmentation.segments = Object.entries(BEHAVIORS.buyingBehavior).map(([key, data]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1) + ' Buyers',
        description: data.description,
        contentNeeds: data.contentNeeds,
        conversionTips: getConversionTips(key)
      }));
      break;
      
    case 'lifecycle':
      segmentation.segments = [
        { name: 'Prospects', stage: 1, actions: ['Lead magnet', 'Nurture sequence'] },
        { name: 'Leads', stage: 2, actions: ['Email sequence', 'Webinar invite'] },
        { name: 'Qualified', stage: 3, actions: ['Sales call', 'Direct offer'] },
        { name: 'Customers', stage: 4, actions: ['Onboarding', 'Support'] },
        { name: 'Advocates', stage: 5, actions: ['Referral program', 'Testimonial request'] }
      ];
      break;
      
    default:
      segmentation.segments = [{ name: 'Default', description: 'No segmentation applied' }];
  }
  
  audienceData.segments.push(segmentation);
  await saveData();
  
  return segmentation;
}

/**
 * Get engagement strategy
 */
function getEngagementStrategy(level) {
  const strategies = {
    lurker: 'Create bingeable content series, lower friction calls-to-action',
    casual: 'Encourage comments with questions, create polls and quizzes',
    active: 'Feature in content, invite to communities, early access offers',
    advocate: 'Ambassador program, affiliate opportunities, exclusive access'
  };
  return strategies[level];
}

/**
 * Get conversion tips
 */
function getConversionTips(buyingType) {
  const tips = {
    impulse: ['Create urgency', 'Simplify purchase', 'Strong emotional hooks', 'One-click buy'],
    researcher: ['Detailed FAQ', 'Comparison charts', 'Free trial/sample', 'Extended content'],
    relationship: ['Personal stories', 'Behind-the-scenes', 'Live interactions', 'Community feel'],
    value: ['Clear ROI', 'Case studies', 'Money-back guarantee', 'Success metrics']
  };
  return tips[buyingType];
}

/**
 * Generate buyer personas
 */
async function generatePersonas(niche, count = 3) {
  const personas = [];
  
  const personaTemplates = [
    {
      archetype: 'The Aspiring Entrepreneur',
      demographics: { age: '25-34', income: 'mid', education: 'bachelors' },
      story: 'Works corporate job but dreams of freedom. Consumes business content daily.',
      goals: ['Replace income', 'Build scalable business', 'Work from anywhere'],
      frustrations: ['No clear roadmap', 'Information overload', 'Fear of quitting job'],
      contentPreferences: ['How-to guides', 'Success stories', 'Step-by-step tutorials']
    },
    {
      archetype: 'The Side Hustler',
      demographics: { age: '30-40', income: 'mid', education: 'bachelors' },
      story: 'Has family responsibilities but wants additional income stream.',
      goals: ['Extra $2-5k/month', 'Flexible schedule', 'Eventually go full-time'],
      frustrations: ['Limited time', 'Needs quick wins', 'Family skepticism'],
      contentPreferences: ['Quick tips', 'Part-time strategies', 'Realistic expectations']
    },
    {
      archetype: 'The Career Transitioner',
      demographics: { age: '35-50', income: 'upper-mid', education: 'bachelors' },
      story: 'Senior professional looking to leverage expertise differently.',
      goals: ['Monetize knowledge', 'More autonomy', 'Impact at scale'],
      frustrations: ['Tech overwhelm', 'Starting over fears', 'Finding audience'],
      contentPreferences: ['Expert interviews', 'Case studies', 'Professional approach']
    },
    {
      archetype: 'The Creator',
      demographics: { age: '20-30', income: 'entry', education: 'some-college' },
      story: 'Passionate about content creation, wants to monetize audience.',
      goals: ['Monetize following', 'Diversify income', 'Build brand'],
      frustrations: ['Algorithm changes', 'Income inconsistency', 'Burnout'],
      contentPreferences: ['Trending strategies', 'Creator economy news', 'Collaboration opportunities']
    }
  ];
  
  for (let i = 0; i < Math.min(count, personaTemplates.length); i++) {
    const template = personaTemplates[i];
    
    const persona = {
      id: `persona-${Date.now()}-${i}`,
      niche,
      name: generatePersonaName(template.archetype),
      archetype: template.archetype,
      demographics: template.demographics,
      psychographics: {
        story: template.story,
        goals: template.goals,
        frustrations: template.frustrations,
        motivations: identifyMotivations(template.goals)
      },
      behaviors: {
        contentPreferences: template.contentPreferences,
        platformsUsed: identifyPlatforms(template.demographics.age),
        buyingStyle: identifyBuyingStyle(template.demographics)
      },
      messaging: {
        hooks: generateHooks(template.frustrations),
        ctas: generateCTAs(template.goals),
        objections: predictObjections(template.frustrations)
      },
      createdAt: new Date().toISOString()
    };
    
    personas.push(persona);
  }
  
  audienceData.personas.push(...personas);
  await saveData();
  
  return personas;
}

/**
 * Generate persona name
 */
function generatePersonaName(archetype) {
  const names = {
    'The Aspiring Entrepreneur': ['Alex', 'Jordan', 'Sam'],
    'The Side Hustler': ['Taylor', 'Morgan', 'Casey'],
    'The Career Transitioner': ['Michael', 'Jennifer', 'David'],
    'The Creator': ['Zoe', 'Leo', 'Maya']
  };
  
  const nameList = names[archetype] || ['Pat'];
  return nameList[Math.floor(Math.random() * nameList.length)];
}

/**
 * Identify motivations from goals
 */
function identifyMotivations(goals) {
  const motivationMap = {
    'income': 'financial-freedom',
    'freedom': 'time-freedom',
    'impact': 'impact',
    'expert': 'mastery',
    'scale': 'impact'
  };
  
  const motivations = [];
  for (const goal of goals) {
    for (const [key, motivation] of Object.entries(motivationMap)) {
      if (goal.toLowerCase().includes(key)) {
        motivations.push(motivation);
      }
    }
  }
  
  return [...new Set(motivations)].slice(0, 3);
}

/**
 * Identify platforms by age
 */
function identifyPlatforms(age) {
  const platformsByAge = {
    '20-30': ['TikTok', 'Instagram', 'YouTube'],
    '25-34': ['YouTube', 'Instagram', 'LinkedIn'],
    '30-40': ['LinkedIn', 'YouTube', 'Facebook'],
    '35-50': ['LinkedIn', 'Facebook', 'YouTube']
  };
  
  return platformsByAge[age] || platformsByAge['25-34'];
}

/**
 * Identify buying style
 */
function identifyBuyingStyle(demographics) {
  if (demographics.income === 'high') return 'impulse';
  if (demographics.education === 'advanced') return 'researcher';
  if (demographics.age.includes('50')) return 'value';
  return 'relationship';
}

/**
 * Generate hooks from frustrations
 */
function generateHooks(frustrations) {
  return frustrations.map(f => {
    if (f.includes('time')) return 'What if you could accomplish this in just 30 minutes a day?';
    if (f.includes('fear')) return 'The #1 mistake that keeps people stuck (and how to avoid it)';
    if (f.includes('overload')) return 'Cut through the noise: The only 3 things that actually matter';
    if (f.includes('roadmap')) return 'The exact step-by-step blueprint I used to...';
    return `How to overcome "${f}" starting today`;
  });
}

/**
 * Generate CTAs from goals
 */
function generateCTAs(goals) {
  return goals.map(g => {
    if (g.includes('income')) return 'Get the free income blueprint';
    if (g.includes('freedom')) return 'Download the freedom roadmap';
    if (g.includes('business')) return 'Start building your business today';
    return `Learn how to ${g.toLowerCase()}`;
  });
}

/**
 * Predict objections
 */
function predictObjections(frustrations) {
  const objectionMap = {
    'time': 'I don\'t have time for this',
    'fear': 'What if it doesn\'t work?',
    'overload': 'This seems too complicated',
    'skepticism': 'Is this actually legitimate?'
  };
  
  const objections = [];
  for (const frustration of frustrations) {
    for (const [key, objection] of Object.entries(objectionMap)) {
      if (frustration.toLowerCase().includes(key)) {
        objections.push(objection);
      }
    }
  }
  
  return objections.slice(0, 3);
}

/**
 * Identify pain points
 */
async function identifyPainPoints(audienceType, options = {}) {
  const painPointAnalysis = {
    id: `pain-${Date.now()}`,
    audience: audienceType,
    createdAt: new Date().toISOString(),
    painPoints: []
  };
  
  // Score pain points for this audience
  for (const [category, pains] of Object.entries(PAIN_CATEGORIES)) {
    for (const pain of pains) {
      const intensity = Math.round(Math.random() * 40 + 60); // 60-100
      const frequency = Math.round(Math.random() * 40 + 60);
      
      painPointAnalysis.painPoints.push({
        category,
        pain,
        intensity,
        frequency,
        overallScore: Math.round((intensity + frequency) / 2),
        contentAngles: generateContentAngles(pain, category),
        productOpportunities: identifyProductOpportunities(pain, category)
      });
    }
  }
  
  // Sort by overall score
  painPointAnalysis.painPoints.sort((a, b) => b.overallScore - a.overallScore);
  
  // Top insights
  painPointAnalysis.topPains = painPointAnalysis.painPoints.slice(0, 5);
  painPointAnalysis.categoryBreakdown = Object.keys(PAIN_CATEGORIES).map(cat => ({
    category: cat,
    avgScore: Math.round(
      painPointAnalysis.painPoints
        .filter(p => p.category === cat)
        .reduce((a, b) => a + b.overallScore, 0) / PAIN_CATEGORIES[cat].length
    )
  })).sort((a, b) => b.avgScore - a.avgScore);
  
  audienceData.insights.push(painPointAnalysis);
  await saveData();
  
  return painPointAnalysis;
}

/**
 * Generate content angles for pain point
 */
function generateContentAngles(pain, category) {
  return [
    `How to overcome "${pain}"`,
    `The truth about ${pain} nobody tells you`,
    `${category === 'financial' ? '5' : '3'} proven ways to solve ${pain}`,
    `I struggled with ${pain} until I discovered this`
  ];
}

/**
 * Identify product opportunities
 */
function identifyProductOpportunities(pain, category) {
  const opportunities = {
    financial: ['Income course', 'Budget template', 'Side hustle guide'],
    time: ['Productivity system', 'Automation toolkit', 'Time-blocking planner'],
    knowledge: ['Comprehensive course', 'Roadmap guide', 'Mentorship program'],
    confidence: ['Mindset course', 'Community access', 'Coaching program'],
    results: ['Done-for-you service', 'Accelerator program', 'Accountability group']
  };
  
  return opportunities[category] || ['Digital product', 'Coaching', 'Course'];
}

/**
 * Map customer journey
 */
async function mapCustomerJourney(personaId) {
  const persona = audienceData.personas.find(p => p.id === personaId);
  
  if (!persona) {
    // Create default journey
    return createDefaultJourney();
  }
  
  const journey = {
    id: `journey-${Date.now()}`,
    personaId,
    personaName: persona.name,
    archetype: persona.archetype,
    createdAt: new Date().toISOString(),
    stages: [
      {
        stage: 'Awareness',
        touchpoints: ['Social media content', 'YouTube videos', 'Blog posts'],
        emotions: ['Curious', 'Skeptical', 'Hopeful'],
        questions: ['Is this real?', 'Can this work for me?', 'Who is this person?'],
        content: ['Educational content', 'Free value', 'Social proof'],
        kpis: ['Views', 'Followers', 'Engagement rate']
      },
      {
        stage: 'Interest',
        touchpoints: ['Lead magnet', 'Email opt-in', 'Webinar registration'],
        emotions: ['Interested', 'Excited', 'Overwhelmed'],
        questions: ['What exactly will I learn?', 'How long will this take?', 'What\'s the catch?'],
        content: ['Lead magnets', 'Case studies', 'Testimonials'],
        kpis: ['Opt-in rate', 'Lead magnet downloads', 'Email list growth']
      },
      {
        stage: 'Consideration',
        touchpoints: ['Email sequence', 'Webinar', 'Sales page'],
        emotions: ['Evaluating', 'Comparing', 'Anxious'],
        questions: ['Is this worth the money?', 'Will I actually use this?', 'What results can I expect?'],
        content: ['Detailed breakdowns', 'FAQs', 'Comparisons', 'Guarantees'],
        kpis: ['Email open rate', 'Webinar attendance', 'Sales page visits']
      },
      {
        stage: 'Purchase',
        touchpoints: ['Checkout page', 'Order confirmation', 'Welcome email'],
        emotions: ['Excited', 'Nervous', 'Hopeful'],
        questions: ['Did it go through?', 'What do I do now?', 'When can I start?'],
        content: ['Clear checkout', 'Immediate access', 'Quick wins'],
        kpis: ['Conversion rate', 'AOV', 'Cart abandonment']
      },
      {
        stage: 'Onboarding',
        touchpoints: ['Welcome sequence', 'Getting started guide', 'Community access'],
        emotions: ['Motivated', 'Overwhelmed', 'Determined'],
        questions: ['Where do I start?', 'Am I doing this right?', 'Who can help me?'],
        content: ['Quick start guide', 'First win tutorial', 'Community welcome'],
        kpis: ['Activation rate', 'Module completion', 'Support tickets']
      },
      {
        stage: 'Success',
        touchpoints: ['Support', 'Community', 'Milestone celebrations'],
        emotions: ['Accomplished', 'Grateful', 'Confident'],
        questions: ['What\'s next?', 'How can I get more results?', 'How can I help others?'],
        content: ['Advanced training', 'Upsells', 'Community recognition'],
        kpis: ['NPS', 'Testimonials', 'Referrals']
      },
      {
        stage: 'Advocacy',
        touchpoints: ['Referral program', 'Testimonial request', 'Affiliate opportunity'],
        emotions: ['Proud', 'Helpful', 'Invested'],
        questions: ['How can I share this?', 'What do I get for referring?', 'Can I become a partner?'],
        content: ['Shareable content', 'Referral incentives', 'Affiliate program'],
        kpis: ['Referral rate', 'LTV', 'Affiliate signups']
      }
    ]
  };
  
  audienceData.journeys.push(journey);
  await saveData();
  
  return journey;
}

/**
 * Create default journey
 */
function createDefaultJourney() {
  return {
    id: `journey-${Date.now()}`,
    personaName: 'Default Persona',
    stages: [
      { stage: 'Awareness', description: 'Discovers brand' },
      { stage: 'Interest', description: 'Engages with content' },
      { stage: 'Consideration', description: 'Evaluates offer' },
      { stage: 'Purchase', description: 'Makes decision' },
      { stage: 'Onboarding', description: 'Gets started' },
      { stage: 'Success', description: 'Achieves results' },
      { stage: 'Advocacy', description: 'Refers others' }
    ]
  };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'profile': {
        const audience = args.join(' ') || 'entrepreneurs';
        console.log(`Creating profile for: ${audience}...`);
        
        const profile = await createProfile(audience);
        
        console.log('\nAudience Profile');
        console.log('='.repeat(50));
        console.log(`Name: ${profile.name}`);
        
        console.log('\nDemographics:');
        console.log(`  Age: ${profile.demographics.primaryAge}`);
        console.log(`  Income: ${profile.demographics.incomeLevel}`);
        console.log(`  Education: ${profile.demographics.education}`);
        
        console.log('\nPsychographics:');
        console.log(`  Primary Motivation: ${profile.psychographics.primaryMotivation}`);
        console.log(`  Core Values: ${profile.psychographics.coreValues.join(', ')}`);
        
        console.log('\nBehaviors:');
        console.log(`  Buying Style: ${profile.behaviors.buyingStyle}`);
        console.log(`  Preferred Content: ${profile.behaviors.preferredContent}`);
        console.log(`  Platforms: ${profile.behaviors.platformsUsed.join(', ')}`);
        
        console.log('\nAudience Size Estimate:');
        console.log(`  Total: ${profile.estimatedSize.total.toLocaleString()}`);
        console.log(`  Reachable: ${profile.estimatedSize.reachable.toLocaleString()}`);
        console.log(`  Convertible: ${profile.estimatedSize.convertible.toLocaleString()}`);
        break;
      }
      
      case 'segment': {
        const criteria = args[0] || 'awareness';
        console.log(`Segmenting by: ${criteria}...`);
        
        const segmentation = await segmentAudience(criteria);
        
        console.log('\nAudience Segmentation');
        console.log('='.repeat(50));
        console.log(`Criteria: ${segmentation.criteria}`);
        
        for (const segment of segmentation.segments) {
          console.log(`\n  ${segment.name}${segment.percentage ? ` (${segment.percentage}%)` : ''}`);
          console.log(`    ${segment.description || segment.contentType || ''}`);
          if (segment.strategy) console.log(`    Strategy: ${segment.strategy}`);
        }
        break;
      }
      
      case 'persona': {
        const niche = args.join(' ') || 'digital products';
        console.log(`Generating personas for: ${niche}...`);
        
        const personas = await generatePersonas(niche, 3);
        
        console.log('\nBuyer Personas');
        console.log('='.repeat(50));
        
        for (const persona of personas) {
          console.log(`\n${persona.name} - "${persona.archetype}"`);
          console.log('-'.repeat(40));
          console.log(`Story: ${persona.psychographics.story}`);
          console.log(`Goals: ${persona.psychographics.goals.join(', ')}`);
          console.log(`Frustrations: ${persona.psychographics.frustrations.slice(0, 2).join(', ')}`);
          console.log(`Platforms: ${persona.behaviors.platformsUsed.join(', ')}`);
          console.log(`Buying Style: ${persona.behaviors.buyingStyle}`);
        }
        break;
      }
      
      case 'painpoints': {
        const audience = args.join(' ') || 'entrepreneurs';
        console.log(`Identifying pain points for: ${audience}...`);
        
        const analysis = await identifyPainPoints(audience);
        
        console.log('\nPain Point Analysis');
        console.log('='.repeat(50));
        
        console.log('\nTop Pain Points:');
        for (const pain of analysis.topPains) {
          console.log(`\n  [${pain.category}] ${pain.pain}`);
          console.log(`    Intensity: ${pain.intensity} | Frequency: ${pain.frequency} | Score: ${pain.overallScore}`);
          console.log(`    Content Angle: ${pain.contentAngles[0]}`);
        }
        
        console.log('\nCategory Breakdown:');
        for (const cat of analysis.categoryBreakdown) {
          const bar = '█'.repeat(Math.round(cat.avgScore / 5));
          console.log(`  ${cat.category.padEnd(12)} ${bar} ${cat.avgScore}`);
        }
        break;
      }
      
      case 'journey': {
        const personaId = args[0];
        console.log('Mapping customer journey...');
        
        const journey = await mapCustomerJourney(personaId);
        
        console.log('\nCustomer Journey Map');
        console.log('='.repeat(50));
        console.log(`Persona: ${journey.personaName}`);
        
        for (const stage of journey.stages) {
          console.log(`\n  ${stage.stage.toUpperCase()}`);
          if (stage.touchpoints) console.log(`    Touchpoints: ${stage.touchpoints.slice(0, 3).join(', ')}`);
          if (stage.emotions) console.log(`    Emotions: ${stage.emotions.join(' → ')}`);
          if (stage.questions) console.log(`    Questions: "${stage.questions[0]}"`);
        }
        break;
      }
      
      case 'report': {
        console.log('\nAudience Insights Report');
        console.log('='.repeat(50));
        console.log(`Profiles created: ${audienceData.profiles.length}`);
        console.log(`Segments defined: ${audienceData.segments.length}`);
        console.log(`Personas generated: ${audienceData.personas.length}`);
        console.log(`Journeys mapped: ${audienceData.journeys.length}`);
        console.log(`Pain analyses: ${audienceData.insights.length}`);
        
        if (audienceData.personas.length > 0) {
          console.log('\nRecent Personas:');
          for (const p of audienceData.personas.slice(-3)) {
            console.log(`  • ${p.name} (${p.archetype})`);
          }
        }
        break;
      }
      
      case 'test': {
        console.log('Audience Analyzer Module');
        console.log('========================');
        console.log(`Profiles: ${audienceData.profiles.length}`);
        console.log(`Segments: ${audienceData.segments.length}`);
        console.log(`Personas: ${audienceData.personas.length}`);
        console.log(`Demographics: ${Object.keys(DEMOGRAPHICS).length} categories`);
        console.log(`Pain categories: ${Object.keys(PAIN_CATEGORIES).length}`);
        break;
      }
      
      default:
        console.log('Audience Analyzer - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  createProfile,
  segmentAudience,
  generatePersonas,
  identifyPainPoints,
  mapCustomerJourney,
  DEMOGRAPHICS,
  PSYCHOGRAPHICS,
  BEHAVIORS,
  PAIN_CATEGORIES
};

// Run CLI
main().catch(console.error);
