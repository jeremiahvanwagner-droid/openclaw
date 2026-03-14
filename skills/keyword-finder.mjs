#!/usr/bin/env node
/**
 * OpenClaw Keyword Finder Agent
 * 
 * Research Division - Keyword research and SEO analysis
 * 
 * Features:
 *   - Keyword discovery
 *   - Search volume estimation
 *   - Competition analysis
 *   - Long-tail keyword generation
 *   - Keyword clustering
 *   - SERP analysis
 * 
 * Usage: node keyword-finder.mjs <command> [args...]
 * 
 * Commands:
 *   discover <seed>           Find keywords from seed
 *   analyze <keyword>         Analyze specific keyword
 *   longtail <keyword>        Generate long-tail variations
 *   cluster <keywords...>     Cluster related keywords
 *   opportunities             Best keyword opportunities
 *   report <niche>            Keyword research report
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const KEYWORDS_FILE = path.join(DATA_DIR, 'keywords.json');

// Keyword difficulty tiers
const DIFFICULTY_TIERS = {
  easy: { range: [0, 30], description: 'Low competition, good for new sites', strategy: 'Target aggressively' },
  medium: { range: [31, 60], description: 'Moderate competition, achievable', strategy: 'Build authority first' },
  hard: { range: [61, 80], description: 'High competition, need strong domain', strategy: 'Long-term play' },
  veryHard: { range: [81, 100], description: 'Very competitive, enterprise level', strategy: 'Consider alternatives' }
};

// Search intent categories
const SEARCH_INTENTS = {
  informational: {
    modifiers: ['how to', 'what is', 'why', 'guide', 'tutorial', 'tips', 'examples', 'ideas'],
    contentType: 'Blog posts, guides, tutorials',
    conversionPotential: 'Low immediate, high long-term'
  },
  navigational: {
    modifiers: ['login', 'sign in', 'website', 'app', 'official'],
    contentType: 'Landing pages, homepages',
    conversionPotential: 'High for brand terms'
  },
  commercial: {
    modifiers: ['best', 'top', 'review', 'comparison', 'vs', 'alternative'],
    contentType: 'Comparison posts, reviews',
    conversionPotential: 'High'
  },
  transactional: {
    modifiers: ['buy', 'price', 'discount', 'coupon', 'deal', 'cheap', 'order'],
    contentType: 'Product pages, offers',
    conversionPotential: 'Very high'
  }
};

// Content type mappings
const CONTENT_TYPES = {
  'how-to': { format: 'Step-by-step guide', avgWordCount: 2000, rankingFactors: ['comprehensiveness', 'visuals'] },
  'list': { format: 'Listicle', avgWordCount: 1500, rankingFactors: ['quantity', 'uniqueness'] },
  'comparison': { format: 'Comparison table', avgWordCount: 2500, rankingFactors: ['objectivity', 'detail'] },
  'review': { format: 'In-depth review', avgWordCount: 2000, rankingFactors: ['experience', 'honesty'] },
  'guide': { format: 'Ultimate guide', avgWordCount: 4000, rankingFactors: ['depth', 'authority'] },
  'template': { format: 'Template + explanation', avgWordCount: 1000, rankingFactors: ['utility', 'downloadable'] }
};

// Keyword modifiers by category
const KEYWORD_MODIFIERS = {
  year: ['2026', '2025'],
  specificity: ['for beginners', 'advanced', 'step by step', 'complete guide'],
  audience: ['for entrepreneurs', 'for small business', 'for freelancers', 'for agencies'],
  location: ['online', 'remote', 'local'],
  format: ['course', 'template', 'checklist', 'pdf', 'free'],
  comparison: ['vs', 'alternative', 'or']
};

// Data storage
let keywordData = {
  keywords: {},
  clusters: [],
  reports: [],
  opportunities: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(KEYWORDS_FILE, 'utf8');
    keywordData = JSON.parse(data);
  } catch {
    keywordData = { keywords: {}, clusters: [], reports: [], opportunities: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(KEYWORDS_FILE, JSON.stringify(keywordData, null, 2));
}

/**
 * Discover keywords from seed
 */
async function discoverKeywords(seed, options = {}) {
  const keywords = [];
  const count = options.count || 20;
  
  // Generate variations
  const variations = generateVariations(seed);
  
  for (let i = 0; i < Math.min(count, variations.length); i++) {
    const kw = variations[i];
    const metrics = generateKeywordMetrics(kw);
    
    keywords.push({
      keyword: kw,
      ...metrics,
      intent: detectIntent(kw),
      contentType: suggestContentType(kw),
      opportunity: calculateOpportunityScore(metrics)
    });
  }
  
  // Sort by opportunity score
  keywords.sort((a, b) => b.opportunity - a.opportunity);
  
  // Store keywords
  for (const kw of keywords) {
    keywordData.keywords[kw.keyword] = {
      ...kw,
      discoveredAt: new Date().toISOString(),
      seed
    };
  }
  
  await saveData();
  
  return {
    seed,
    count: keywords.length,
    keywords,
    topOpportunities: keywords.slice(0, 5)
  };
}

/**
 * Generate keyword variations
 */
function generateVariations(seed) {
  const variations = [seed];
  const seedLower = seed.toLowerCase();
  
  // Add modifiers
  for (const category of Object.values(KEYWORD_MODIFIERS)) {
    for (const modifier of category.slice(0, 2)) {
      variations.push(`${seedLower} ${modifier}`);
      variations.push(`${modifier} ${seedLower}`);
    }
  }
  
  // Add question variations
  const questions = ['how to', 'what is', 'why', 'best'];
  for (const q of questions) {
    variations.push(`${q} ${seedLower}`);
  }
  
  // Add long-tail
  variations.push(`${seedLower} for beginners step by step`);
  variations.push(`${seedLower} complete guide 2026`);
  variations.push(`best ${seedLower} strategies`);
  variations.push(`${seedLower} tips and tricks`);
  variations.push(`how to start ${seedLower}`);
  variations.push(`${seedLower} examples`);
  variations.push(`${seedLower} mistakes to avoid`);
  
  // Remove duplicates
  return [...new Set(variations)];
}

/**
 * Generate simulated keyword metrics
 */
function generateKeywordMetrics(keyword) {
  // Longer keywords typically have lower volume but easier difficulty
  const wordCount = keyword.split(' ').length;
  const lengthFactor = Math.max(0.2, 1 - (wordCount - 2) * 0.15);
  
  const baseVolume = Math.round(Math.random() * 50000 + 1000);
  const volume = Math.round(baseVolume * lengthFactor);
  
  const baseDifficulty = Math.round(Math.random() * 60 + 20);
  const difficulty = Math.round(baseDifficulty * lengthFactor);
  
  const cpc = Math.round((Math.random() * 5 + 0.5) * 100) / 100;
  
  return {
    volume,
    difficulty,
    cpc,
    trend: getTrend(),
    serps: {
      organic: 10,
      ads: Math.random() > 0.5 ? Math.round(Math.random() * 4 + 1) : 0,
      featured: Math.random() > 0.7,
      paa: Math.random() > 0.5
    }
  };
}

/**
 * Get trend indicator
 */
function getTrend() {
  const trends = ['rising', 'stable', 'declining', 'seasonal'];
  const weights = [0.3, 0.4, 0.15, 0.15];
  const rand = Math.random();
  let sum = 0;
  
  for (let i = 0; i < trends.length; i++) {
    sum += weights[i];
    if (rand <= sum) return trends[i];
  }
  return 'stable';
}

/**
 * Detect search intent
 */
function detectIntent(keyword) {
  const kwLower = keyword.toLowerCase();
  
  for (const [intent, config] of Object.entries(SEARCH_INTENTS)) {
    for (const modifier of config.modifiers) {
      if (kwLower.includes(modifier)) {
        return {
          type: intent,
          contentType: config.contentType,
          conversionPotential: config.conversionPotential
        };
      }
    }
  }
  
  // Default to informational
  return {
    type: 'informational',
    contentType: SEARCH_INTENTS.informational.contentType,
    conversionPotential: SEARCH_INTENTS.informational.conversionPotential
  };
}

/**
 * Suggest content type
 */
function suggestContentType(keyword) {
  const kwLower = keyword.toLowerCase();
  
  if (kwLower.includes('how to')) return CONTENT_TYPES['how-to'];
  if (kwLower.includes('best') || kwLower.includes('top')) return CONTENT_TYPES['list'];
  if (kwLower.includes('vs') || kwLower.includes('comparison')) return CONTENT_TYPES['comparison'];
  if (kwLower.includes('review')) return CONTENT_TYPES['review'];
  if (kwLower.includes('guide') || kwLower.includes('complete')) return CONTENT_TYPES['guide'];
  if (kwLower.includes('template') || kwLower.includes('checklist')) return CONTENT_TYPES['template'];
  
  return CONTENT_TYPES['how-to'];
}

/**
 * Calculate opportunity score
 */
function calculateOpportunityScore(metrics) {
  // Higher volume = better (max 40 points)
  const volumeScore = Math.min(metrics.volume / 5000 * 40, 40);
  
  // Lower difficulty = better (max 40 points)
  const difficultyScore = (100 - metrics.difficulty) * 0.4;
  
  // Higher CPC = more commercial value (max 10 points)
  const cpcScore = Math.min(metrics.cpc * 2, 10);
  
  // Trend bonus (max 10 points)
  const trendScores = { rising: 10, stable: 5, seasonal: 3, declining: 0 };
  const trendScore = trendScores[metrics.trend] || 5;
  
  return Math.round(volumeScore + difficultyScore + cpcScore + trendScore);
}

/**
 * Analyze specific keyword
 */
async function analyzeKeyword(keyword) {
  const metrics = generateKeywordMetrics(keyword);
  const intent = detectIntent(keyword);
  const contentType = suggestContentType(keyword);
  
  // Get difficulty tier
  let difficultyTier;
  for (const [tier, config] of Object.entries(DIFFICULTY_TIERS)) {
    if (metrics.difficulty >= config.range[0] && metrics.difficulty <= config.range[1]) {
      difficultyTier = { tier, ...config };
      break;
    }
  }
  
  // Generate related keywords
  const related = generateVariations(keyword).slice(1, 6).map(kw => ({
    keyword: kw,
    ...generateKeywordMetrics(kw)
  }));
  
  // SERP analysis
  const serpAnalysis = {
    competitorTypes: analyzeSerpCompetitors(),
    contentGaps: identifyContentGaps(keyword),
    rankingFactors: contentType.rankingFactors,
    estimatedEffort: estimateRankingEffort(metrics.difficulty)
  };
  
  const analysis = {
    keyword,
    metrics,
    intent,
    contentType,
    difficultyTier,
    related,
    serpAnalysis,
    recommendations: generateKeywordRecommendations(metrics, intent, difficultyTier),
    analyzedAt: new Date().toISOString()
  };
  
  // Store analysis
  keywordData.keywords[keyword] = {
    ...analysis,
    opportunity: calculateOpportunityScore(metrics)
  };
  
  await saveData();
  
  return analysis;
}

/**
 * Analyze SERP competitors
 */
function analyzeSerpCompetitors() {
  return [
    { type: 'Authority blogs', percentage: 40, example: 'HubSpot, Neil Patel' },
    { type: 'Niche sites', percentage: 30, example: 'Specialized industry sites' },
    { type: 'News/Media', percentage: 15, example: 'Forbes, Entrepreneur' },
    { type: 'UGC/Forums', percentage: 15, example: 'Reddit, Quora' }
  ];
}

/**
 * Identify content gaps
 */
function identifyContentGaps(keyword) {
  return [
    'Updated 2026 information',
    'Video/visual content',
    'Interactive elements',
    'Real case studies',
    'Downloadable resources'
  ];
}

/**
 * Estimate ranking effort
 */
function estimateRankingEffort(difficulty) {
  if (difficulty <= 30) return { months: '1-3', effort: 'Low', investment: '$500-2000' };
  if (difficulty <= 60) return { months: '3-6', effort: 'Medium', investment: '$2000-5000' };
  if (difficulty <= 80) return { months: '6-12', effort: 'High', investment: '$5000-15000' };
  return { months: '12+', effort: 'Very High', investment: '$15000+' };
}

/**
 * Generate recommendations
 */
function generateKeywordRecommendations(metrics, intent, difficultyTier) {
  const recs = [];
  
  // Based on difficulty
  if (metrics.difficulty <= 30) {
    recs.push({
      priority: 1,
      action: 'Target immediately',
      reasoning: 'Low competition keyword with viable traffic'
    });
  } else if (metrics.difficulty <= 60) {
    recs.push({
      priority: 2,
      action: 'Build supporting content first',
      reasoning: 'Create topic cluster before targeting main keyword'
    });
  } else {
    recs.push({
      priority: 3,
      action: 'Long-term play',
      reasoning: 'Focus on lower-difficulty variations first'
    });
  }
  
  // Based on intent
  if (intent.type === 'transactional') {
    recs.push({
      priority: 1,
      action: 'Create dedicated landing page',
      reasoning: 'High conversion potential keyword'
    });
  }
  
  if (intent.type === 'informational') {
    recs.push({
      priority: 2,
      action: 'Create comprehensive guide with lead capture',
      reasoning: 'Build authority and capture email leads'
    });
  }
  
  // Based on volume
  if (metrics.volume >= 10000) {
    recs.push({
      priority: 2,
      action: 'Consider paid traffic test',
      reasoning: 'Volume justifies ad spend ROI analysis'
    });
  }
  
  return recs;
}

/**
 * Generate long-tail keywords
 */
async function generateLongTail(keyword, options = {}) {
  const count = options.count || 20;
  const longTails = [];
  
  const templates = [
    `how to ${keyword} for beginners`,
    `${keyword} step by step guide`,
    `best ${keyword} strategies 2026`,
    `${keyword} tips for success`,
    `${keyword} mistakes to avoid`,
    `${keyword} for small business`,
    `${keyword} without experience`,
    `${keyword} on a budget`,
    `${keyword} from home`,
    `${keyword} case study`,
    `${keyword} examples and templates`,
    `${keyword} tools and software`,
    `${keyword} checklist pdf`,
    `${keyword} for entrepreneurs`,
    `${keyword} course free`,
    `easy ${keyword} for beginners`,
    `${keyword} in 30 days`,
    `${keyword} automation`,
    `${keyword} strategies that work`,
    `${keyword} secrets revealed`
  ];
  
  for (const template of templates.slice(0, count)) {
    const metrics = generateKeywordMetrics(template);
    longTails.push({
      keyword: template,
      ...metrics,
      parent: keyword,
      opportunity: calculateOpportunityScore(metrics)
    });
  }
  
  // Sort by opportunity
  longTails.sort((a, b) => b.opportunity - a.opportunity);
  
  return {
    seed: keyword,
    count: longTails.length,
    longTails,
    quickWins: longTails.filter(lt => lt.difficulty <= 30).slice(0, 5)
  };
}

/**
 * Cluster related keywords
 */
async function clusterKeywords(keywords) {
  // Group by topic similarity
  const clusters = {};
  
  for (const kw of keywords) {
    const topic = extractTopic(kw);
    
    if (!clusters[topic]) {
      clusters[topic] = {
        topic,
        keywords: [],
        totalVolume: 0,
        avgDifficulty: 0
      };
    }
    
    const metrics = keywordData.keywords[kw] || generateKeywordMetrics(kw);
    clusters[topic].keywords.push({
      keyword: kw,
      volume: metrics.volume,
      difficulty: metrics.difficulty
    });
    clusters[topic].totalVolume += metrics.volume;
  }
  
  // Calculate averages
  for (const cluster of Object.values(clusters)) {
    const difficulties = cluster.keywords.map(k => k.difficulty);
    cluster.avgDifficulty = Math.round(
      difficulties.reduce((a, b) => a + b, 0) / difficulties.length
    );
    cluster.pillarKeyword = cluster.keywords.sort((a, b) => b.volume - a.volume)[0];
  }
  
  const clusterResult = {
    id: `cluster-${Date.now()}`,
    inputKeywords: keywords.length,
    clusters: Object.values(clusters),
    createdAt: new Date().toISOString()
  };
  
  keywordData.clusters.push(clusterResult);
  await saveData();
  
  return clusterResult;
}

/**
 * Extract main topic from keyword
 */
function extractTopic(keyword) {
  // Remove common modifiers
  const modifiersToRemove = [
    'how to', 'best', 'top', 'guide', 'tutorial', 'tips',
    '2026', '2025', 'for beginners', 'step by step'
  ];
  
  let topic = keyword.toLowerCase();
  for (const mod of modifiersToRemove) {
    topic = topic.replace(mod, '').trim();
  }
  
  // Get first 2-3 words
  return topic.split(' ').slice(0, 3).join(' ') || topic;
}

/**
 * Find best opportunities
 */
async function findOpportunities(options = {}) {
  const minVolume = options.minVolume || 500;
  const maxDifficulty = options.maxDifficulty || 50;
  
  const opportunities = Object.values(keywordData.keywords)
    .filter(kw => kw.volume >= minVolume && kw.difficulty <= maxDifficulty)
    .sort((a, b) => b.opportunity - a.opportunity)
    .slice(0, 20);
  
  const result = {
    criteria: { minVolume, maxDifficulty },
    count: opportunities.length,
    opportunities,
    quickWins: opportunities.filter(o => o.difficulty <= 30).slice(0, 5),
    highVolume: opportunities.filter(o => o.volume >= 5000).slice(0, 5)
  };
  
  keywordData.opportunities.push({
    ...result,
    foundAt: new Date().toISOString()
  });
  
  await saveData();
  
  return result;
}

/**
 * Generate keyword research report
 */
async function generateReport(niche) {
  // Discover keywords for niche
  const discovery = await discoverKeywords(niche, { count: 30 });
  
  // Analyze top keywords
  const topAnalyses = [];
  for (const kw of discovery.keywords.slice(0, 5)) {
    topAnalyses.push(await analyzeKeyword(kw.keyword));
  }
  
  // Generate long-tails for top keyword
  const longTails = await generateLongTail(discovery.keywords[0].keyword);
  
  // Cluster all keywords
  const cluster = await clusterKeywords(discovery.keywords.map(k => k.keyword));
  
  const report = {
    id: `report-${Date.now()}`,
    niche,
    generatedAt: new Date().toISOString(),
    summary: {
      keywordsFound: discovery.count,
      avgVolume: Math.round(
        discovery.keywords.reduce((a, b) => a + b.volume, 0) / discovery.count
      ),
      avgDifficulty: Math.round(
        discovery.keywords.reduce((a, b) => a + b.difficulty, 0) / discovery.count
      ),
      topicsIdentified: cluster.clusters.length
    },
    topOpportunities: discovery.topOpportunities,
    quickWins: discovery.keywords.filter(k => k.difficulty <= 30).slice(0, 5),
    longTailOpportunities: longTails.quickWins,
    topicClusters: cluster.clusters.slice(0, 5),
    recommendations: [
      {
        priority: 1,
        action: `Create pillar content for "${cluster.clusters[0]?.topic}"`,
        reasoning: `Highest volume topic with ${cluster.clusters[0]?.totalVolume.toLocaleString()} combined searches`
      },
      {
        priority: 2,
        action: 'Target quick-win long-tail keywords',
        reasoning: `${longTails.quickWins.length} low-competition opportunities identified`
      },
      {
        priority: 3,
        action: 'Build topic cluster strategy',
        reasoning: `${cluster.clusters.length} distinct topics can be organized into content silos`
      }
    ]
  };
  
  keywordData.reports.push(report);
  await saveData();
  
  return report;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'discover': {
        const seed = args.join(' ') || 'digital marketing';
        console.log(`Discovering keywords for: ${seed}...`);
        
        const discovery = await discoverKeywords(seed);
        
        console.log('\nKeyword Discovery');
        console.log('='.repeat(60));
        console.log(`Seed: ${discovery.seed}`);
        console.log(`Found: ${discovery.count} keywords\n`);
        
        console.log('Top Opportunities:');
        for (const kw of discovery.topOpportunities) {
          console.log(`  ${kw.keyword.padEnd(40)} Vol: ${String(kw.volume).padStart(6)} | Diff: ${kw.difficulty} | Score: ${kw.opportunity}`);
        }
        break;
      }
      
      case 'analyze': {
        const keyword = args.join(' ');
        
        if (!keyword) {
          console.error('Usage: analyze <keyword>');
          process.exit(1);
        }
        
        console.log(`Analyzing: ${keyword}...`);
        const analysis = await analyzeKeyword(keyword);
        
        console.log('\nKeyword Analysis');
        console.log('='.repeat(50));
        console.log(`Keyword: ${analysis.keyword}`);
        console.log(`Volume: ${analysis.metrics.volume.toLocaleString()}`);
        console.log(`Difficulty: ${analysis.metrics.difficulty} (${analysis.difficultyTier.tier})`);
        console.log(`CPC: $${analysis.metrics.cpc}`);
        console.log(`Trend: ${analysis.metrics.trend}`);
        
        console.log(`\nIntent: ${analysis.intent.type}`);
        console.log(`Content Type: ${analysis.contentType.format}`);
        console.log(`Word Count: ${analysis.contentType.avgWordCount}+`);
        
        console.log('\nRanking Effort:');
        console.log(`  Time: ${analysis.serpAnalysis.estimatedEffort.months} months`);
        console.log(`  Investment: ${analysis.serpAnalysis.estimatedEffort.investment}`);
        
        console.log('\nRecommendations:');
        for (const rec of analysis.recommendations) {
          console.log(`  ${rec.priority}. ${rec.action}`);
        }
        break;
      }
      
      case 'longtail': {
        const keyword = args.join(' ');
        
        if (!keyword) {
          console.error('Usage: longtail <keyword>');
          process.exit(1);
        }
        
        console.log(`Generating long-tail keywords for: ${keyword}...`);
        const result = await generateLongTail(keyword);
        
        console.log('\nLong-Tail Keywords');
        console.log('='.repeat(70));
        
        console.log('\nQuick Wins (Difficulty ≤ 30):');
        for (const lt of result.quickWins) {
          console.log(`  ${lt.keyword.padEnd(45)} Vol: ${String(lt.volume).padStart(5)} | Diff: ${lt.difficulty}`);
        }
        
        console.log('\nAll Long-Tail Keywords:');
        for (const lt of result.longTails.slice(0, 10)) {
          console.log(`  ${lt.keyword.padEnd(45)} Vol: ${String(lt.volume).padStart(5)} | Diff: ${lt.difficulty}`);
        }
        break;
      }
      
      case 'cluster': {
        if (args.length < 2) {
          console.error('Usage: cluster <keyword1> <keyword2> [more...]');
          process.exit(1);
        }
        
        console.log(`Clustering ${args.length} keywords...`);
        const result = await clusterKeywords(args);
        
        console.log('\nKeyword Clusters');
        console.log('='.repeat(50));
        
        for (const cluster of result.clusters) {
          console.log(`\n  [${cluster.topic.toUpperCase()}]`);
          console.log(`    Keywords: ${cluster.keywords.length}`);
          console.log(`    Total Volume: ${cluster.totalVolume.toLocaleString()}`);
          console.log(`    Avg Difficulty: ${cluster.avgDifficulty}`);
          console.log(`    Pillar: "${cluster.pillarKeyword?.keyword}"`);
        }
        break;
      }
      
      case 'opportunities': {
        console.log('Finding best keyword opportunities...');
        const result = await findOpportunities();
        
        console.log('\nKeyword Opportunities');
        console.log('='.repeat(60));
        console.log(`Found: ${result.count} opportunities\n`);
        
        console.log('Quick Wins (Difficulty ≤ 30):');
        for (const opp of result.quickWins) {
          console.log(`  ${opp.keyword?.padEnd(40) || 'N/A'} Vol: ${String(opp.volume || 0).padStart(6)}`);
        }
        
        console.log('\nHigh Volume (≥ 5000):');
        for (const opp of result.highVolume) {
          console.log(`  ${opp.keyword?.padEnd(40) || 'N/A'} Vol: ${String(opp.volume || 0).padStart(6)}`);
        }
        break;
      }
      
      case 'report': {
        const niche = args.join(' ') || 'online business';
        console.log(`Generating keyword report for: ${niche}...`);
        
        const report = await generateReport(niche);
        
        console.log('\n' + '='.repeat(60));
        console.log(`KEYWORD RESEARCH REPORT: ${niche.toUpperCase()}`);
        console.log('='.repeat(60));
        
        console.log('\nSUMMARY:');
        console.log(`  Keywords Found: ${report.summary.keywordsFound}`);
        console.log(`  Avg Volume: ${report.summary.avgVolume.toLocaleString()}`);
        console.log(`  Avg Difficulty: ${report.summary.avgDifficulty}`);
        console.log(`  Topics Identified: ${report.summary.topicsIdentified}`);
        
        console.log('\nTOP OPPORTUNITIES:');
        for (const opp of report.topOpportunities.slice(0, 3)) {
          console.log(`  • ${opp.keyword} (Vol: ${opp.volume}, Diff: ${opp.difficulty})`);
        }
        
        console.log('\nQUICK WINS:');
        for (const qw of report.quickWins.slice(0, 3)) {
          console.log(`  • ${qw.keyword} (Diff: ${qw.difficulty})`);
        }
        
        console.log('\nRECOMMENDATIONS:');
        for (const rec of report.recommendations) {
          console.log(`  ${rec.priority}. ${rec.action}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Keyword Finder Module');
        console.log('=====================');
        console.log(`Keywords tracked: ${Object.keys(keywordData.keywords).length}`);
        console.log(`Clusters created: ${keywordData.clusters.length}`);
        console.log(`Reports generated: ${keywordData.reports.length}`);
        console.log(`Difficulty tiers: ${Object.keys(DIFFICULTY_TIERS).length}`);
        console.log(`Intent types: ${Object.keys(SEARCH_INTENTS).length}`);
        break;
      }
      
      default:
        console.log('Keyword Finder - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  discoverKeywords,
  analyzeKeyword,
  generateLongTail,
  clusterKeywords,
  findOpportunities,
  generateReport,
  DIFFICULTY_TIERS,
  SEARCH_INTENTS,
  CONTENT_TYPES
};

// Run CLI
main().catch(console.error);
