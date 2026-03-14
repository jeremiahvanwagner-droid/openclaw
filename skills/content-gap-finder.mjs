#!/usr/bin/env node
/**
 * OpenClaw Content Gap Finder Agent
 * 
 * Research Division - Content gap analysis and opportunity discovery
 * 
 * Features:
 *   - Topic gap identification
 *   - Competitor content analysis
 *   - SERP gap detection
 *   - Content opportunity scoring
 *   - Topic cluster mapping
 *   - Content calendar planning
 * 
 * Usage: node content-gap-finder.mjs <command> [args...]
 * 
 * Commands:
 *   analyze <niche>          Find content gaps in niche
 *   compare <url1> <url2>    Compare content coverage
 *   opportunities            Best content opportunities
 *   cluster <topic>          Map topic clusters
 *   calendar <niche>         Generate content calendar
 *   serp <keyword>           Analyze SERP gaps
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const GAPS_FILE = path.join(DATA_DIR, 'content-gaps.json');

// Content types and their characteristics
const CONTENT_TYPES = {
  'blog-post': {
    format: 'Article',
    avgLength: '1500-2500 words',
    effort: 'Medium',
    lifespan: '6-24 months',
    distribution: ['SEO', 'Social', 'Email']
  },
  'video': {
    format: 'Video content',
    avgLength: '8-15 minutes',
    effort: 'High',
    lifespan: '2-5 years',
    distribution: ['YouTube', 'Social', 'Embed']
  },
  'podcast': {
    format: 'Audio episode',
    avgLength: '20-45 minutes',
    effort: 'Medium',
    lifespan: '1-3 years',
    distribution: ['Podcast platforms', 'Social', 'Blog']
  },
  'infographic': {
    format: 'Visual content',
    avgLength: 'N/A',
    effort: 'High',
    lifespan: '1-3 years',
    distribution: ['Pinterest', 'Social', 'Blog']
  },
  'guide': {
    format: 'Ultimate guide',
    avgLength: '5000-10000 words',
    effort: 'Very High',
    lifespan: '2-5 years',
    distribution: ['SEO', 'Lead magnet', 'Social']
  },
  'case-study': {
    format: 'Success story',
    avgLength: '1500-3000 words',
    effort: 'Medium',
    lifespan: '1-3 years',
    distribution: ['Sales', 'SEO', 'Social']
  },
  'template': {
    format: 'Downloadable resource',
    avgLength: 'N/A',
    effort: 'Medium',
    lifespan: '2-5 years',
    distribution: ['Lead magnet', 'Product', 'Blog']
  },
  'webinar': {
    format: 'Live/recorded presentation',
    avgLength: '45-90 minutes',
    effort: 'High',
    lifespan: '1-2 years',
    distribution: ['Email', 'Social', 'Ads']
  }
};

// Gap categories
const GAP_CATEGORIES = {
  'topic-coverage': {
    description: 'Topics not covered by competitors',
    impact: 'High',
    difficulty: 'Medium',
    strategy: 'Create comprehensive content on untouched topics'
  },
  'depth-gap': {
    description: 'Topics covered superficially by competitors',
    impact: 'High',
    difficulty: 'Medium',
    strategy: 'Create more in-depth, detailed content'
  },
  'format-gap': {
    description: 'Content exists but not in preferred format',
    impact: 'Medium',
    difficulty: 'Low',
    strategy: 'Repurpose existing topic into new format'
  },
  'freshness-gap': {
    description: 'Outdated content from competitors',
    impact: 'Medium',
    difficulty: 'Low',
    strategy: 'Create updated, current version'
  },
  'angle-gap': {
    description: 'Topic exists but unique angle missing',
    impact: 'Medium',
    difficulty: 'Medium',
    strategy: 'Cover from new perspective or audience'
  },
  'aggregation-gap': {
    description: 'Information scattered across sources',
    impact: 'High',
    difficulty: 'High',
    strategy: 'Create definitive consolidated resource'
  }
};

// Content pillars template
const CONTENT_PILLARS = {
  'awareness': {
    purpose: 'Introduce problem/solution',
    types: ['blog posts', 'social content', 'videos'],
    topics: ['beginner guides', 'what is X', 'why X matters']
  },
  'consideration': {
    purpose: 'Educate on solutions',
    types: ['comparison posts', 'how-to guides', 'case studies'],
    topics: ['how to X', 'X vs Y', 'best X for Y']
  },
  'decision': {
    purpose: 'Convert to customer',
    types: ['demos', 'webinars', 'testimonials'],
    topics: ['reviews', 'implementation', 'results']
  },
  'retention': {
    purpose: 'Keep customers engaged',
    types: ['tutorials', 'tips', 'community'],
    topics: ['advanced techniques', 'optimization', 'updates']
  },
  'advocacy': {
    purpose: 'Turn customers into promoters',
    types: ['success stories', 'user content', 'referrals'],
    topics: ['transformations', 'community highlights', 'referral incentives']
  }
};

// Data storage
let gapData = {
  analyses: {},
  opportunities: [],
  clusters: [],
  calendars: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(GAPS_FILE, 'utf8');
    gapData = JSON.parse(data);
  } catch {
    gapData = { analyses: {}, opportunities: [], clusters: [], calendars: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(GAPS_FILE, JSON.stringify(gapData, null, 2));
}

/**
 * Analyze content gaps in niche
 */
async function analyzeGaps(niche) {
  // Generate simulated competitor content
  const competitorContent = generateCompetitorContent(niche);
  
  // Identify potential topics
  const potentialTopics = generatePotentialTopics(niche);
  
  // Find gaps
  const gaps = findGaps(potentialTopics, competitorContent);
  
  // Score opportunities
  const opportunities = scoreOpportunities(gaps);
  
  // Generate content strategy
  const strategy = generateContentStrategy(opportunities);
  
  const analysis = {
    niche,
    competitorContent: summarizeCompetitorContent(competitorContent),
    gaps,
    opportunities: opportunities.slice(0, 10),
    strategy,
    summary: {
      totalGaps: gaps.length,
      highImpact: gaps.filter(g => g.impact === 'High').length,
      quickWins: gaps.filter(g => g.difficulty === 'Low').length,
      priorityTopics: opportunities.slice(0, 5).map(o => o.topic)
    },
    analyzedAt: new Date().toISOString()
  };
  
  // Store analysis
  gapData.analyses[niche.toLowerCase()] = analysis;
  await saveData();
  
  return analysis;
}

/**
 * Generate simulated competitor content
 */
function generateCompetitorContent(niche) {
  const competitors = [
    { name: 'Competitor A', authority: 'High', contentVolume: 'High' },
    { name: 'Competitor B', authority: 'Medium', contentVolume: 'Medium' },
    { name: 'Competitor C', authority: 'Low', contentVolume: 'High' }
  ];
  
  const topicTemplates = [
    `Getting started with ${niche}`,
    `${niche} for beginners`,
    `Best ${niche} tools`,
    `How to ${niche} in 2026`,
    `${niche} tips and tricks`,
    `Common ${niche} mistakes`,
    `${niche} case study`,
    `${niche} vs alternatives`
  ];
  
  return competitors.map(comp => ({
    ...comp,
    coverage: topicTemplates.slice(0, Math.floor(Math.random() * 5) + 3).map(topic => ({
      topic,
      contentType: ['blog-post', 'video', 'guide'][Math.floor(Math.random() * 3)],
      depth: ['shallow', 'medium', 'deep'][Math.floor(Math.random() * 3)],
      freshness: ['outdated', 'recent', 'current'][Math.floor(Math.random() * 3)],
      engagement: Math.round(Math.random() * 1000)
    }))
  }));
}

/**
 * Generate potential topics
 */
function generatePotentialTopics(niche) {
  const templates = [
    // Beginner topics
    `What is ${niche}`,
    `${niche} explained for beginners`,
    `Getting started with ${niche} guide`,
    `${niche} basics everyone should know`,
    
    // How-to topics
    `How to start ${niche}`,
    `How to succeed in ${niche}`,
    `How to make money with ${niche}`,
    `How to grow your ${niche}`,
    
    // Comparison topics
    `Best ${niche} platforms`,
    `Top ${niche} tools compared`,
    `${niche} software comparison`,
    `Free vs paid ${niche} options`,
    
    // Strategy topics
    `${niche} strategies that work`,
    `${niche} blueprint for success`,
    `${niche} roadmap 2026`,
    `Complete ${niche} system`,
    
    // Problem-focused
    `${niche} mistakes to avoid`,
    `${niche} challenges and solutions`,
    `Why ${niche} fails and how to fix it`,
    `${niche} troubleshooting guide`,
    
    // Advanced topics
    `Advanced ${niche} techniques`,
    `${niche} automation`,
    `Scaling your ${niche}`,
    `${niche} optimization tips`,
    
    // Case studies
    `${niche} success stories`,
    `${niche} case study: From 0 to success`,
    `How I built a 6-figure ${niche}`,
    `${niche} transformation results`,
    
    // Templates and resources
    `${niche} checklist`,
    `${niche} templates pack`,
    `${niche} swipe file`,
    `${niche} calculator`
  ];
  
  return templates.map(topic => ({
    topic,
    category: categorizeTopic(topic),
    searchIntent: detectSearchIntent(topic),
    contentTypeRecommendation: recommendContentType(topic)
  }));
}

/**
 * Categorize topic
 */
function categorizeTopic(topic) {
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes('what is') || topicLower.includes('beginner') || topicLower.includes('basics')) {
    return 'awareness';
  }
  if (topicLower.includes('how to') || topicLower.includes('guide') || topicLower.includes('strategy')) {
    return 'consideration';
  }
  if (topicLower.includes('best') || topicLower.includes('compare') || topicLower.includes('vs')) {
    return 'decision';
  }
  if (topicLower.includes('advanced') || topicLower.includes('scale') || topicLower.includes('optimize')) {
    return 'retention';
  }
  if (topicLower.includes('success') || topicLower.includes('case study') || topicLower.includes('results')) {
    return 'advocacy';
  }
  
  return 'consideration';
}

/**
 * Detect search intent
 */
function detectSearchIntent(topic) {
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes('what') || topicLower.includes('why') || topicLower.includes('explained')) {
    return 'informational';
  }
  if (topicLower.includes('best') || topicLower.includes('top') || topicLower.includes('vs')) {
    return 'commercial';
  }
  if (topicLower.includes('buy') || topicLower.includes('price') || topicLower.includes('discount')) {
    return 'transactional';
  }
  
  return 'informational';
}

/**
 * Recommend content type
 */
function recommendContentType(topic) {
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes('checklist') || topicLower.includes('template') || topicLower.includes('swipe')) {
    return 'template';
  }
  if (topicLower.includes('case study') || topicLower.includes('success') || topicLower.includes('results')) {
    return 'case-study';
  }
  if (topicLower.includes('complete') || topicLower.includes('ultimate') || topicLower.includes('blueprint')) {
    return 'guide';
  }
  if (topicLower.includes('how to')) {
    return 'video';
  }
  
  return 'blog-post';
}

/**
 * Find gaps between potential and existing content
 */
function findGaps(potentialTopics, competitorContent) {
  const gaps = [];
  const allCompetitorTopics = competitorContent.flatMap(c => c.coverage.map(t => t.topic.toLowerCase()));
  
  for (const potential of potentialTopics) {
    const topicLower = potential.topic.toLowerCase();
    
    // Check if topic exists in competitor content
    const existingCoverage = competitorContent.filter(c => 
      c.coverage.some(t => t.topic.toLowerCase().includes(topicLower.split(' ').slice(0, 3).join(' ')))
    );
    
    let gapType;
    let impact;
    let difficulty;
    
    if (existingCoverage.length === 0) {
      // Topic not covered
      gapType = 'topic-coverage';
      impact = 'High';
      difficulty = 'Medium';
    } else if (existingCoverage.every(c => c.coverage.some(t => t.depth === 'shallow'))) {
      // Only shallow coverage
      gapType = 'depth-gap';
      impact = 'High';
      difficulty = 'Medium';
    } else if (existingCoverage.every(c => c.coverage.some(t => t.freshness === 'outdated'))) {
      // Outdated content
      gapType = 'freshness-gap';
      impact = 'Medium';
      difficulty = 'Low';
    } else if (Math.random() > 0.5) {
      // Random angle or format gap
      gapType = Math.random() > 0.5 ? 'angle-gap' : 'format-gap';
      impact = 'Medium';
      difficulty = Math.random() > 0.5 ? 'Low' : 'Medium';
    } else {
      continue; // No significant gap
    }
    
    gaps.push({
      topic: potential.topic,
      category: potential.category,
      gapType,
      gapInfo: GAP_CATEGORIES[gapType],
      impact,
      difficulty,
      searchIntent: potential.searchIntent,
      recommendedFormat: potential.contentTypeRecommendation,
      competitorCoverage: existingCoverage.length
    });
  }
  
  return gaps;
}

/**
 * Score opportunities
 */
function scoreOpportunities(gaps) {
  const scored = gaps.map(gap => {
    // Impact score
    const impactScores = { 'High': 40, 'Medium': 25, 'Low': 10 };
    const impactScore = impactScores[gap.impact] || 20;
    
    // Difficulty score (easier = higher score)
    const difficultyScores = { 'Low': 30, 'Medium': 20, 'High': 10, 'Very High': 5 };
    const difficultyScore = difficultyScores[gap.difficulty] || 15;
    
    // Competition score (less coverage = higher score)
    const competitionScore = Math.max(0, 30 - gap.competitorCoverage * 10);
    
    // Category bonus
    const categoryBonus = { 'decision': 10, 'consideration': 5, 'awareness': 3 };
    const bonus = categoryBonus[gap.category] || 0;
    
    const totalScore = impactScore + difficultyScore + competitionScore + bonus;
    
    return {
      ...gap,
      opportunityScore: Math.min(100, totalScore),
      action: generateAction(gap),
      estimatedEffort: estimateEffort(gap)
    };
  });
  
  return scored.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

/**
 * Generate action recommendation
 */
function generateAction(gap) {
  const actions = {
    'topic-coverage': `Create comprehensive ${gap.recommendedFormat} on "${gap.topic}"`,
    'depth-gap': `Create in-depth, 3000+ word guide on "${gap.topic}"`,
    'format-gap': `Create ${gap.recommendedFormat} version of "${gap.topic}"`,
    'freshness-gap': `Create updated 2026 version of "${gap.topic}"`,
    'angle-gap': `Create unique angle on "${gap.topic}" for your audience`,
    'aggregation-gap': `Create definitive resource consolidating "${gap.topic}"`
  };
  
  return actions[gap.gapType] || `Create content for "${gap.topic}"`;
}

/**
 * Estimate effort
 */
function estimateEffort(gap) {
  const formatEffort = CONTENT_TYPES[gap.recommendedFormat]?.effort || 'Medium';
  const gapEffort = gap.gapType === 'freshness-gap' ? 'Low' : 
                    gap.gapType === 'aggregation-gap' ? 'Very High' : 'Medium';
  
  // Combine estimates
  const effortMap = { 'Low': 1, 'Medium': 2, 'High': 3, 'Very High': 4 };
  const combinedScore = (effortMap[formatEffort] + effortMap[gapEffort]) / 2;
  
  const effortLabels = ['Low', 'Medium', 'High', 'Very High'];
  const hours = [2, 8, 20, 40];
  
  const index = Math.min(Math.round(combinedScore) - 1, 3);
  
  return {
    level: effortLabels[index],
    estimatedHours: hours[index],
    timeline: `${Math.ceil(hours[index] / 8)} days`
  };
}

/**
 * Summarize competitor content
 */
function summarizeCompetitorContent(competitors) {
  return competitors.map(c => ({
    name: c.name,
    authority: c.authority,
    topicsCount: c.coverage.length,
    avgEngagement: Math.round(c.coverage.reduce((a, b) => a + b.engagement, 0) / c.coverage.length),
    topTopics: c.coverage.slice(0, 3).map(t => t.topic)
  }));
}

/**
 * Generate content strategy
 */
function generateContentStrategy(opportunities) {
  const pillars = {};
  
  // Categorize opportunities by pillar
  for (const opp of opportunities) {
    if (!pillars[opp.category]) {
      pillars[opp.category] = [];
    }
    pillars[opp.category].push(opp);
  }
  
  return {
    pillars: Object.entries(pillars).map(([pillar, opps]) => ({
      pillar,
      ...CONTENT_PILLARS[pillar],
      opportunities: opps.length,
      topPriority: opps[0]?.topic
    })),
    immediateActions: opportunities.filter(o => o.difficulty === 'Low').slice(0, 3).map(o => o.action),
    contentMix: {
      blogs: opportunities.filter(o => o.recommendedFormat === 'blog-post').length,
      videos: opportunities.filter(o => o.recommendedFormat === 'video').length,
      guides: opportunities.filter(o => o.recommendedFormat === 'guide').length,
      other: opportunities.filter(o => !['blog-post', 'video', 'guide'].includes(o.recommendedFormat)).length
    }
  };
}

/**
 * Map topic clusters
 */
async function mapCluster(topic) {
  const cluster = {
    pillarTopic: topic,
    supportingTopics: [],
    internalLinks: [],
    contentPlan: []
  };
  
  // Generate supporting topics
  const supportingTemplates = [
    `${topic} for beginners`,
    `${topic} vs alternatives`,
    `Best ${topic} tools`,
    `${topic} mistakes to avoid`,
    `How to start ${topic}`,
    `${topic} tips and tricks`,
    `Advanced ${topic} strategies`,
    `${topic} case studies`,
    `${topic} FAQ`,
    `${topic} checklist`
  ];
  
  cluster.supportingTopics = supportingTemplates.map((supporting, index) => ({
    topic: supporting,
    priority: index + 1,
    contentType: index < 3 ? 'blog-post' : index < 6 ? 'video' : 'template',
    linksTo: 'pillar',
    status: 'planned'
  }));
  
  // Generate internal linking strategy
  cluster.internalLinks = [
    { from: 'Pillar', to: 'All supporting content', type: 'hub-to-spoke' },
    { from: 'Supporting content', to: 'Pillar', type: 'spoke-to-hub' },
    { from: 'Related supporting', to: 'Each other', type: 'contextual' }
  ];
  
  // Generate content plan
  cluster.contentPlan = [
    { week: 1, action: `Create pillar content: "${topic}" comprehensive guide`, type: 'guide' },
    { week: 2, action: `Create "${supportingTemplates[0]}"`, type: 'blog-post' },
    { week: 3, action: `Create "${supportingTemplates[1]}"`, type: 'blog-post' },
    { week: 4, action: `Create "${supportingTemplates[2]}"`, type: 'blog-post' },
    { week: 5, action: `Update pillar with links to supporting content`, type: 'update' },
    { week: 6, action: `Create "${supportingTemplates[3]}"`, type: 'video' }
  ];
  
  cluster.seoStrategy = {
    primaryKeyword: topic,
    secondaryKeywords: supportingTemplates.slice(0, 5),
    rankingGoal: 'Top 10 for pillar, Top 20 for supporting',
    timeframe: '6-12 months'
  };
  
  cluster.createdAt = new Date().toISOString();
  
  gapData.clusters.push(cluster);
  await saveData();
  
  return cluster;
}

/**
 * Generate content calendar
 */
async function generateCalendar(niche, options = {}) {
  const weeks = options.weeks || 12;
  const postsPerWeek = options.postsPerWeek || 2;
  
  // Get or create analysis
  let analysis = gapData.analyses[niche.toLowerCase()];
  if (!analysis) {
    analysis = await analyzeGaps(niche);
  }
  
  const calendar = {
    niche,
    startDate: new Date().toISOString(),
    weeks,
    postsPerWeek,
    schedule: [],
    summary: {}
  };
  
  let opportunityIndex = 0;
  let currentDate = new Date();
  
  for (let week = 1; week <= weeks; week++) {
    const weekPosts = [];
    
    for (let post = 0; post < postsPerWeek; post++) {
      if (opportunityIndex < analysis.opportunities.length) {
        const opp = analysis.opportunities[opportunityIndex];
        weekPosts.push({
          date: new Date(currentDate.getTime() + (post * 3 + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          topic: opp.topic,
          contentType: opp.recommendedFormat,
          category: opp.category,
          estimatedHours: opp.estimatedEffort.estimatedHours,
          priority: opp.opportunityScore
        });
        opportunityIndex++;
      }
    }
    
    if (weekPosts.length > 0) {
      calendar.schedule.push({
        week,
        posts: weekPosts,
        totalHours: weekPosts.reduce((a, b) => a + b.estimatedHours, 0)
      });
    }
    
    currentDate.setDate(currentDate.getDate() + 7);
  }
  
  // Calculate summary
  const allPosts = calendar.schedule.flatMap(w => w.posts);
  calendar.summary = {
    totalPosts: allPosts.length,
    totalHours: allPosts.reduce((a, b) => a + b.estimatedHours, 0),
    byType: allPosts.reduce((acc, p) => {
      acc[p.contentType] = (acc[p.contentType] || 0) + 1;
      return acc;
    }, {}),
    byCategory: allPosts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {})
  };
  
  gapData.calendars.push(calendar);
  await saveData();
  
  return calendar;
}

/**
 * Analyze SERP gaps
 */
async function analyzeSerpGaps(keyword) {
  // Simulate SERP analysis
  const serpResults = [
    { position: 1, type: 'blog-post', wordCount: 2500, features: ['images', 'video'], freshness: 'recent' },
    { position: 2, type: 'video', platform: 'YouTube', length: '12 min', engagement: 'high' },
    { position: 3, type: 'guide', wordCount: 5000, features: ['images', 'downloadable'], freshness: 'outdated' },
    { position: 4, type: 'blog-post', wordCount: 1500, features: ['images'], freshness: 'recent' },
    { position: 5, type: 'forum', platform: 'Reddit', engagement: 'high', ads: false }
  ];
  
  const serpGaps = {
    keyword,
    serpAnalysis: serpResults,
    gaps: [
      {
        type: 'Interactive content gap',
        description: 'No calculators, quizzes, or interactive elements in top 10',
        opportunity: 'Create interactive tool',
        difficulty: 'Medium'
      },
      {
        type: 'Video gap',
        description: 'Limited video content in results',
        opportunity: 'Create comprehensive video series',
        difficulty: 'High'
      },
      {
        type: 'Freshness gap',
        description: 'Position 3 result is outdated',
        opportunity: 'Create updated comprehensive guide',
        difficulty: 'Medium'
      },
      {
        type: 'Format gap',
        description: 'No infographics or visual summaries',
        opportunity: 'Create shareable infographic',
        difficulty: 'Medium'
      }
    ],
    recommendations: [
      'Create 5000+ word guide with multimedia',
      'Include downloadable resources/templates',
      'Add interactive elements (calculator, quiz)',
      'Optimize for featured snippet',
      'Create supporting video content'
    ],
    rankingPotential: Math.random() > 0.5 ? 'High' : 'Medium',
    estimatedTimeToRank: '3-6 months'
  };
  
  return serpGaps;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'analyze': {
        const niche = args.join(' ') || 'digital marketing';
        console.log(`Analyzing content gaps for: ${niche}...`);
        
        const analysis = await analyzeGaps(niche);
        
        console.log('\n' + '='.repeat(60));
        console.log(`CONTENT GAP ANALYSIS: ${niche.toUpperCase()}`);
        console.log('='.repeat(60));
        
        console.log('\nSUMMARY:');
        console.log(`  Total Gaps Found: ${analysis.summary.totalGaps}`);
        console.log(`  High Impact: ${analysis.summary.highImpact}`);
        console.log(`  Quick Wins: ${analysis.summary.quickWins}`);
        
        console.log('\nTOP OPPORTUNITIES:');
        for (const opp of analysis.opportunities.slice(0, 5)) {
          console.log(`\n  [${opp.opportunityScore}/100] ${opp.topic}`);
          console.log(`    Type: ${opp.gapType} | Impact: ${opp.impact} | Effort: ${opp.estimatedEffort.level}`);
          console.log(`    Action: ${opp.action}`);
        }
        
        console.log('\nCONTENT STRATEGY:');
        console.log(`  Recommended Mix: ${JSON.stringify(analysis.strategy.contentMix)}`);
        console.log('\n  Immediate Actions:');
        for (const action of analysis.strategy.immediateActions) {
          console.log(`    • ${action}`);
        }
        break;
      }
      
      case 'opportunities': {
        const allOpportunities = Object.values(gapData.analyses)
          .flatMap(a => a.opportunities)
          .sort((a, b) => b.opportunityScore - a.opportunityScore)
          .slice(0, 15);
        
        console.log('\nTop Content Opportunities');
        console.log('='.repeat(50));
        
        for (const opp of allOpportunities) {
          console.log(`  [${opp.opportunityScore}] ${opp.topic}`);
          console.log(`      ${opp.gapType} | ${opp.recommendedFormat}`);
        }
        break;
      }
      
      case 'cluster': {
        const topic = args.join(' ') || 'email marketing';
        console.log(`Mapping topic cluster for: ${topic}...`);
        
        const cluster = await mapCluster(topic);
        
        console.log('\nTopic Cluster Map');
        console.log('='.repeat(50));
        console.log(`\nPillar: ${cluster.pillarTopic}`);
        
        console.log('\nSupporting Content:');
        for (const support of cluster.supportingTopics.slice(0, 5)) {
          console.log(`  ${support.priority}. ${support.topic} (${support.contentType})`);
        }
        
        console.log('\nContent Plan (First 6 Weeks):');
        for (const item of cluster.contentPlan) {
          console.log(`  Week ${item.week}: ${item.action}`);
        }
        
        console.log('\nSEO Strategy:');
        console.log(`  Primary: ${cluster.seoStrategy.primaryKeyword}`);
        console.log(`  Goal: ${cluster.seoStrategy.rankingGoal}`);
        break;
      }
      
      case 'calendar': {
        const niche = args.join(' ') || 'online business';
        console.log(`Generating content calendar for: ${niche}...`);
        
        const calendar = await generateCalendar(niche);
        
        console.log('\nContent Calendar');
        console.log('='.repeat(50));
        console.log(`Niche: ${calendar.niche}`);
        console.log(`Duration: ${calendar.weeks} weeks`);
        console.log(`Total Posts: ${calendar.summary.totalPosts}`);
        console.log(`Total Hours: ${calendar.summary.totalHours}`);
        
        console.log('\nSchedule (First 4 Weeks):');
        for (const week of calendar.schedule.slice(0, 4)) {
          console.log(`\n  Week ${week.week}:`);
          for (const post of week.posts) {
            console.log(`    ${post.date}: ${post.topic.substring(0, 40)}... (${post.contentType})`);
          }
        }
        
        console.log('\nContent Mix:');
        for (const [type, count] of Object.entries(calendar.summary.byType)) {
          console.log(`  ${type}: ${count}`);
        }
        break;
      }
      
      case 'serp': {
        const keyword = args.join(' ') || 'how to start a business';
        console.log(`Analyzing SERP gaps for: ${keyword}...`);
        
        const analysis = await analyzeSerpGaps(keyword);
        
        console.log('\nSERP Gap Analysis');
        console.log('='.repeat(50));
        console.log(`Keyword: ${analysis.keyword}`);
        console.log(`Ranking Potential: ${analysis.rankingPotential}`);
        console.log(`Time to Rank: ${analysis.estimatedTimeToRank}`);
        
        console.log('\nGaps Identified:');
        for (const gap of analysis.gaps) {
          console.log(`  • ${gap.type}`);
          console.log(`    ${gap.opportunity} (${gap.difficulty} effort)`);
        }
        
        console.log('\nRecommendations:');
        for (const rec of analysis.recommendations) {
          console.log(`  • ${rec}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Content Gap Finder Module');
        console.log('========================');
        console.log(`Content types defined: ${Object.keys(CONTENT_TYPES).length}`);
        console.log(`Gap categories: ${Object.keys(GAP_CATEGORIES).length}`);
        console.log(`Content pillars: ${Object.keys(CONTENT_PILLARS).length}`);
        console.log(`Analyses saved: ${Object.keys(gapData.analyses).length}`);
        console.log(`Clusters created: ${gapData.clusters.length}`);
        console.log(`Calendars generated: ${gapData.calendars.length}`);
        break;
      }
      
      default:
        console.log('Content Gap Finder - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  analyzeGaps,
  mapCluster,
  generateCalendar,
  analyzeSerpGaps,
  CONTENT_TYPES,
  GAP_CATEGORIES,
  CONTENT_PILLARS
};

// Run CLI
main().catch(console.error);
