#!/usr/bin/env node
/**
 * OpenClaw Market Intelligence Agent
 * 
 * Research Division - Market data collection and analysis
 * 
 * Features:
 *   - Industry trend monitoring
 *   - Market size estimation
 *   - Growth rate analysis
 *   - Opportunity identification
 *   - Risk assessment
 *   - Data source aggregation
 * 
 * Usage: node market-intel.mjs <command> [args...]
 * 
 * Commands:
 *   analyze <industry>        Analyze market for industry
 *   trends <topic>            Get trending topics
 *   opportunities <niche>     Find market opportunities
 *   report <industry>         Generate market report
 *   sources                   List data sources
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const INTEL_FILE = path.join(DATA_DIR, 'market-intel.json');

// Market data sources
const DATA_SOURCES = {
  'google-trends': {
    name: 'Google Trends',
    type: 'trend',
    reliability: 0.85,
    updateFrequency: 'daily',
    apiEndpoint: 'https://trends.google.com/trends/api'
  },
  'statista': {
    name: 'Statista',
    type: 'statistics',
    reliability: 0.95,
    updateFrequency: 'monthly',
    apiEndpoint: 'https://api.statista.com/v1'
  },
  'semrush': {
    name: 'SEMrush',
    type: 'keyword',
    reliability: 0.90,
    updateFrequency: 'weekly',
    apiEndpoint: 'https://api.semrush.com'
  },
  'similar-web': {
    name: 'SimilarWeb',
    type: 'traffic',
    reliability: 0.85,
    updateFrequency: 'monthly',
    apiEndpoint: 'https://api.similarweb.com'
  },
  'social-blade': {
    name: 'Social Blade',
    type: 'social',
    reliability: 0.80,
    updateFrequency: 'daily',
    apiEndpoint: 'https://socialblade.com/api'
  },
  'reddit-api': {
    name: 'Reddit',
    type: 'sentiment',
    reliability: 0.75,
    updateFrequency: 'realtime',
    apiEndpoint: 'https://oauth.reddit.com/api'
  }
};

// Industry classifications
const INDUSTRIES = {
  'digital-products': {
    name: 'Digital Products',
    subNiches: ['ebooks', 'courses', 'templates', 'software', 'memberships'],
    avgMarketSize: '$50B',
    growthRate: 15.3,
    competitionLevel: 'high'
  },
  'coaching': {
    name: 'Coaching & Consulting',
    subNiches: ['business', 'life', 'health', 'career', 'executive'],
    avgMarketSize: '$20B',
    growthRate: 12.8,
    competitionLevel: 'medium'
  },
  'ecommerce': {
    name: 'E-commerce',
    subNiches: ['physical', 'dropship', 'print-on-demand', 'subscription'],
    avgMarketSize: '$5.7T',
    growthRate: 14.7,
    competitionLevel: 'very-high'
  },
  'saas': {
    name: 'Software as a Service',
    subNiches: ['b2b', 'b2c', 'productivity', 'marketing', 'analytics'],
    avgMarketSize: '$200B',
    growthRate: 18.2,
    competitionLevel: 'high'
  },
  'content-creation': {
    name: 'Content Creation',
    subNiches: ['youtube', 'podcast', 'blog', 'newsletter', 'social'],
    avgMarketSize: '$30B',
    growthRate: 22.5,
    competitionLevel: 'medium'
  }
};

// Market analysis metrics
const ANALYSIS_METRICS = {
  marketSize: { weight: 0.20, description: 'Total addressable market' },
  growthRate: { weight: 0.20, description: 'YoY growth percentage' },
  competition: { weight: 0.15, description: 'Competitive landscape' },
  barriers: { weight: 0.15, description: 'Entry barriers' },
  demand: { weight: 0.15, description: 'Consumer demand signals' },
  profitability: { weight: 0.15, description: 'Profit margin potential' }
};

// Data storage
let intelData = {
  analyses: [],
  reports: [],
  opportunities: [],
  watchlist: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(INTEL_FILE, 'utf8');
    intelData = JSON.parse(data);
  } catch {
    intelData = { analyses: [], reports: [], opportunities: [], watchlist: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(INTEL_FILE, JSON.stringify(intelData, null, 2));
}

/**
 * Analyze market for an industry/niche
 */
async function analyzeMarket(industry, options = {}) {
  const industryData = INDUSTRIES[industry] || {
    name: industry,
    subNiches: [],
    avgMarketSize: 'Unknown',
    growthRate: 0,
    competitionLevel: 'unknown'
  };
  
  // Simulate data collection from sources
  const dataPoints = [];
  for (const [sourceId, source] of Object.entries(DATA_SOURCES)) {
    dataPoints.push({
      source: sourceId,
      type: source.type,
      reliability: source.reliability,
      metrics: generateMockMetrics(industry, source.type)
    });
  }
  
  // Calculate aggregate scores
  const scores = {
    marketSize: calculateScore('marketSize', dataPoints),
    growthRate: calculateScore('growthRate', dataPoints),
    competition: calculateScore('competition', dataPoints),
    barriers: calculateScore('barriers', dataPoints),
    demand: calculateScore('demand', dataPoints),
    profitability: calculateScore('profitability', dataPoints)
  };
  
  // Calculate overall opportunity score
  let overallScore = 0;
  for (const [metric, score] of Object.entries(scores)) {
    overallScore += score * ANALYSIS_METRICS[metric].weight;
  }
  
  const analysis = {
    id: `analysis-${Date.now()}`,
    industry,
    industryData,
    dataPoints,
    scores,
    overallScore: Math.round(overallScore),
    recommendation: getRecommendation(overallScore),
    opportunities: identifyOpportunities(industry, scores),
    risks: identifyRisks(industry, scores),
    createdAt: new Date().toISOString()
  };
  
  intelData.analyses.push(analysis);
  await saveData();
  
  return analysis;
}

/**
 * Generate mock metrics for testing
 */
function generateMockMetrics(industry, sourceType) {
  const base = Math.random() * 40 + 50; // 50-90 range
  
  return {
    marketSize: Math.round(base + Math.random() * 10),
    growthRate: Math.round(base - 5 + Math.random() * 15),
    competition: Math.round(100 - base + Math.random() * 20),
    barriers: Math.round(50 + Math.random() * 30),
    demand: Math.round(base + Math.random() * 8),
    profitability: Math.round(base - 10 + Math.random() * 20)
  };
}

/**
 * Calculate weighted score from data points
 */
function calculateScore(metric, dataPoints) {
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const point of dataPoints) {
    const value = point.metrics[metric] || 50;
    const weight = point.reliability;
    weightedSum += value * weight;
    totalWeight += weight;
  }
  
  return Math.round(weightedSum / totalWeight);
}

/**
 * Get recommendation based on score
 */
function getRecommendation(score) {
  if (score >= 80) return { level: 'strong-buy', text: 'Highly favorable market conditions. Strong opportunity.' };
  if (score >= 70) return { level: 'buy', text: 'Good market conditions with manageable risks.' };
  if (score >= 60) return { level: 'hold', text: 'Moderate opportunity. Proceed with strategy.' };
  if (score >= 50) return { level: 'caution', text: 'Mixed signals. Additional research recommended.' };
  return { level: 'avoid', text: 'Unfavorable conditions. Consider alternatives.' };
}

/**
 * Identify market opportunities
 */
function identifyOpportunities(industry, scores) {
  const opportunities = [];
  
  if (scores.growthRate >= 70) {
    opportunities.push({
      type: 'growth',
      priority: 'high',
      description: `High growth market (${scores.growthRate}% score). First-mover advantage available.`
    });
  }
  
  if (scores.demand >= 75 && scores.competition < 60) {
    opportunities.push({
      type: 'underserved',
      priority: 'high',
      description: 'High demand with moderate competition. Market gap identified.'
    });
  }
  
  if (scores.profitability >= 70) {
    opportunities.push({
      type: 'margins',
      priority: 'medium',
      description: 'Strong profit margins. Premium positioning viable.'
    });
  }
  
  if (scores.barriers < 40) {
    opportunities.push({
      type: 'accessibility',
      priority: 'medium',
      description: 'Low barriers to entry. Quick market entry possible.'
    });
  }
  
  return opportunities;
}

/**
 * Identify market risks
 */
function identifyRisks(industry, scores) {
  const risks = [];
  
  if (scores.competition >= 75) {
    risks.push({
      type: 'competition',
      severity: 'high',
      description: 'Highly competitive market. Differentiation critical.',
      mitigation: 'Focus on unique value proposition and niche positioning.'
    });
  }
  
  if (scores.barriers >= 70) {
    risks.push({
      type: 'barriers',
      severity: 'medium',
      description: 'Significant entry barriers.',
      mitigation: 'Partner with established players or acquire necessary resources.'
    });
  }
  
  if (scores.growthRate < 40) {
    risks.push({
      type: 'stagnation',
      severity: 'medium',
      description: 'Slow or declining market growth.',
      mitigation: 'Focus on market share capture rather than market expansion.'
    });
  }
  
  return risks;
}

/**
 * Find trending topics
 */
async function findTrends(topic, options = {}) {
  const trendData = {
    topic,
    timestamp: new Date().toISOString(),
    trends: []
  };
  
  // Simulate trend data
  const trendCategories = [
    { name: 'Rising', timeframe: '7d', momentum: 'high' },
    { name: 'Emerging', timeframe: '30d', momentum: 'medium' },
    { name: 'Seasonal', timeframe: '90d', momentum: 'cyclical' },
    { name: 'Declining', timeframe: '30d', momentum: 'low' }
  ];
  
  // Generate mock trends based on topic
  const baseTerms = getRelatedTerms(topic);
  
  for (let i = 0; i < 10; i++) {
    const category = trendCategories[i % 4];
    trendData.trends.push({
      term: baseTerms[i % baseTerms.length] + (i > 0 ? ` ${getModifier()}` : ''),
      category: category.name,
      momentum: category.momentum,
      volume: Math.round(Math.random() * 50000 + 10000),
      growth: Math.round(Math.random() * 200 - 50),
      competition: Math.round(Math.random() * 100),
      timeframe: category.timeframe
    });
  }
  
  // Sort by volume
  trendData.trends.sort((a, b) => b.volume - a.volume);
  
  return trendData;
}

/**
 * Get related terms for a topic
 */
function getRelatedTerms(topic) {
  const termMaps = {
    'digital products': ['online course', 'ebook', 'template', 'membership', 'digital download', 'printable', 'coaching program', 'masterclass'],
    'coaching': ['life coach', 'business mentor', 'career coaching', 'executive coach', 'wellness coaching', 'transformation', 'accountability'],
    'marketing': ['social media marketing', 'email marketing', 'content marketing', 'SEO', 'paid ads', 'funnel', 'lead generation'],
    'finance': ['investing', 'budgeting', 'passive income', 'crypto', 'financial freedom', 'wealth building', 'side hustle'],
    'health': ['weight loss', 'fitness', 'nutrition', 'mental health', 'wellness', 'habits', 'biohacking']
  };
  
  // Find matching terms or use generic
  for (const [key, terms] of Object.entries(termMaps)) {
    if (topic.toLowerCase().includes(key)) {
      return terms;
    }
  }
  
  return ['tutorial', 'guide', 'course', 'training', 'system', 'method', 'program', 'blueprint'];
}

/**
 * Get trend modifier
 */
function getModifier() {
  const modifiers = ['2026', 'for beginners', 'advanced', 'strategy', 'secrets', 'tips', 'masterclass', 'AI-powered'];
  return modifiers[Math.floor(Math.random() * modifiers.length)];
}

/**
 * Find market opportunities
 */
async function findOpportunities(niche, options = {}) {
  const analysis = await analyzeMarket(niche);
  const trends = await findTrends(niche);
  
  const opportunities = {
    niche,
    timestamp: new Date().toISOString(),
    marketAnalysis: {
      score: analysis.overallScore,
      recommendation: analysis.recommendation
    },
    identified: []
  };
  
  // Product opportunities
  opportunities.identified.push({
    type: 'product',
    title: `${niche} Digital Course`,
    description: `Comprehensive training program for ${niche}`,
    potential: analysis.scores.demand,
    competition: analysis.scores.competition,
    suggestedPrice: calculateSuggestedPrice(analysis.scores),
    timeToMarket: '4-8 weeks'
  });
  
  opportunities.identified.push({
    type: 'product',
    title: `${niche} Template Pack`,
    description: `Ready-to-use templates for ${niche}`,
    potential: Math.round(analysis.scores.demand * 0.8),
    competition: Math.round(analysis.scores.competition * 1.2),
    suggestedPrice: calculateSuggestedPrice(analysis.scores) * 0.3,
    timeToMarket: '1-2 weeks'
  });
  
  // Service opportunities
  opportunities.identified.push({
    type: 'service',
    title: `${niche} Coaching`,
    description: `1-on-1 or group coaching for ${niche}`,
    potential: analysis.scores.profitability,
    competition: Math.round(analysis.scores.competition * 0.8),
    suggestedPrice: calculateSuggestedPrice(analysis.scores) * 3,
    timeToMarket: '1-2 weeks'
  });
  
  // Content opportunities from trends
  for (const trend of trends.trends.slice(0, 3)) {
    if (trend.momentum === 'high' || trend.growth > 50) {
      opportunities.identified.push({
        type: 'content',
        title: `Content: ${trend.term}`,
        description: `Create content targeting "${trend.term}"`,
        potential: Math.round(trend.volume / 1000),
        competition: trend.competition,
        suggestedAction: 'Create blog + video + social content',
        timeToMarket: '1 week'
      });
    }
  }
  
  // Store opportunity
  intelData.opportunities.push(opportunities);
  await saveData();
  
  return opportunities;
}

/**
 * Calculate suggested price based on scores
 */
function calculateSuggestedPrice(scores) {
  const base = 97;
  const multiplier = (scores.profitability / 100) + (scores.demand / 100) - (scores.competition / 200);
  return Math.round(base * Math.max(multiplier, 0.5) * 10) / 10;
}

/**
 * Generate market report
 */
async function generateReport(industry, options = {}) {
  const analysis = await analyzeMarket(industry);
  const trends = await findTrends(industry);
  const opportunities = await findOpportunities(industry);
  
  const report = {
    id: `report-${Date.now()}`,
    title: `Market Intelligence Report: ${industry}`,
    generatedAt: new Date().toISOString(),
    executive_summary: {
      industry,
      overallScore: analysis.overallScore,
      recommendation: analysis.recommendation,
      keyFindings: [
        `Market opportunity score: ${analysis.overallScore}/100`,
        `Growth potential: ${analysis.scores.growthRate}%`,
        `Competition level: ${getCompetitionLevel(analysis.scores.competition)}`,
        `Top trending topic: ${trends.trends[0]?.term || 'N/A'}`
      ]
    },
    market_analysis: {
      scores: analysis.scores,
      industryData: analysis.industryData,
      dataPointsUsed: analysis.dataPoints.length
    },
    trends: {
      rising: trends.trends.filter(t => t.momentum === 'high').slice(0, 5),
      emerging: trends.trends.filter(t => t.momentum === 'medium').slice(0, 5)
    },
    opportunities: opportunities.identified.slice(0, 5),
    risks: analysis.risks,
    recommendations: generateRecommendations(analysis, trends, opportunities)
  };
  
  intelData.reports.push(report);
  await saveData();
  
  return report;
}

/**
 * Get competition level text
 */
function getCompetitionLevel(score) {
  if (score >= 80) return 'Very High';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Moderate';
  if (score >= 20) return 'Low';
  return 'Very Low';
}

/**
 * Generate strategic recommendations
 */
function generateRecommendations(analysis, trends, opportunities) {
  const recs = [];
  
  // Based on market score
  if (analysis.overallScore >= 70) {
    recs.push({
      priority: 1,
      type: 'entry',
      action: 'Proceed with market entry',
      reasoning: 'Market conditions are favorable for new entrants.'
    });
  }
  
  // Based on trends
  const topTrend = trends.trends[0];
  if (topTrend && topTrend.growth > 50) {
    recs.push({
      priority: 2,
      type: 'content',
      action: `Create content around "${topTrend.term}"`,
      reasoning: `${topTrend.growth}% growth indicates strong demand.`
    });
  }
  
  // Based on competition
  if (analysis.scores.competition > 70) {
    recs.push({
      priority: 2,
      type: 'differentiation',
      action: 'Develop unique positioning strategy',
      reasoning: 'High competition requires clear differentiation.'
    });
  }
  
  // Based on opportunities
  const topOpp = opportunities.identified[0];
  if (topOpp) {
    recs.push({
      priority: 3,
      type: 'product',
      action: `Launch ${topOpp.title}`,
      reasoning: `Potential score of ${topOpp.potential} with ${topOpp.timeToMarket} time to market.`
    });
  }
  
  return recs;
}

/**
 * Add industry to watchlist
 */
async function addToWatchlist(industry, config = {}) {
  const watchItem = {
    industry,
    addedAt: new Date().toISOString(),
    alertThreshold: config.alertThreshold || 70,
    checkFrequency: config.checkFrequency || 'weekly',
    lastChecked: null,
    alerts: []
  };
  
  // Remove existing if present
  intelData.watchlist = intelData.watchlist.filter(w => w.industry !== industry);
  intelData.watchlist.push(watchItem);
  
  await saveData();
  return watchItem;
}

/**
 * List data sources
 */
function listSources() {
  return Object.entries(DATA_SOURCES).map(([id, source]) => ({
    id,
    ...source
  }));
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'analyze': {
        const industry = args.join('-') || 'digital-products';
        console.log(`Analyzing market: ${industry}...`);
        
        const analysis = await analyzeMarket(industry);
        
        console.log('\nMarket Analysis Results');
        console.log('='.repeat(50));
        console.log(`Industry: ${analysis.industryData.name || industry}`);
        console.log(`Overall Score: ${analysis.overallScore}/100`);
        console.log(`Recommendation: ${analysis.recommendation.level.toUpperCase()}`);
        console.log(`  ${analysis.recommendation.text}`);
        
        console.log('\nMetric Scores:');
        for (const [metric, score] of Object.entries(analysis.scores)) {
          const bar = '█'.repeat(Math.round(score / 5));
          console.log(`  ${metric.padEnd(14)} ${String(score).padStart(3)} ${bar}`);
        }
        
        if (analysis.opportunities.length > 0) {
          console.log('\nOpportunities:');
          for (const opp of analysis.opportunities) {
            console.log(`  [${opp.priority}] ${opp.type}: ${opp.description}`);
          }
        }
        
        if (analysis.risks.length > 0) {
          console.log('\nRisks:');
          for (const risk of analysis.risks) {
            console.log(`  [${risk.severity}] ${risk.type}: ${risk.description}`);
          }
        }
        break;
      }
      
      case 'trends': {
        const topic = args.join(' ') || 'digital products';
        console.log(`Finding trends for: ${topic}...`);
        
        const trends = await findTrends(topic);
        
        console.log('\nTrending Topics');
        console.log('='.repeat(60));
        for (const trend of trends.trends) {
          const growthStr = trend.growth >= 0 ? `+${trend.growth}%` : `${trend.growth}%`;
          console.log(`  ${trend.term.padEnd(35)} ${String(trend.volume).padStart(6)} vol  ${growthStr.padStart(6)}  [${trend.momentum}]`);
        }
        break;
      }
      
      case 'opportunities': {
        const niche = args.join(' ') || 'digital products';
        console.log(`Finding opportunities in: ${niche}...`);
        
        const opps = await findOpportunities(niche);
        
        console.log('\nMarket Opportunities');
        console.log('='.repeat(60));
        console.log(`Market Score: ${opps.marketAnalysis.score}/100 - ${opps.marketAnalysis.recommendation.level}`);
        
        console.log('\nIdentified Opportunities:');
        for (const opp of opps.identified) {
          console.log(`\n  [${opp.type.toUpperCase()}] ${opp.title}`);
          console.log(`    ${opp.description}`);
          console.log(`    Potential: ${opp.potential} | Competition: ${opp.competition}`);
          if (opp.suggestedPrice) console.log(`    Suggested Price: $${opp.suggestedPrice}`);
          console.log(`    Time to Market: ${opp.timeToMarket}`);
        }
        break;
      }
      
      case 'report': {
        const industry = args.join('-') || 'digital-products';
        console.log(`Generating market report for: ${industry}...`);
        
        const report = await generateReport(industry);
        
        console.log('\n' + '='.repeat(60));
        console.log(report.title);
        console.log('='.repeat(60));
        console.log(`Generated: ${report.generatedAt}`);
        
        console.log('\nEXECUTIVE SUMMARY');
        console.log('-'.repeat(40));
        console.log(`Score: ${report.executive_summary.overallScore}/100`);
        console.log(`Recommendation: ${report.executive_summary.recommendation.level}`);
        console.log('\nKey Findings:');
        for (const finding of report.executive_summary.keyFindings) {
          console.log(`  • ${finding}`);
        }
        
        console.log('\nTOP OPPORTUNITIES');
        console.log('-'.repeat(40));
        for (const opp of report.opportunities.slice(0, 3)) {
          console.log(`  • ${opp.title} (Potential: ${opp.potential})`);
        }
        
        console.log('\nRECOMMENDATIONS');
        console.log('-'.repeat(40));
        for (const rec of report.recommendations) {
          console.log(`  ${rec.priority}. [${rec.type}] ${rec.action}`);
        }
        break;
      }
      
      case 'watch': {
        const industry = args[0];
        if (industry) {
          const item = await addToWatchlist(industry);
          console.log(`Added ${industry} to watchlist`);
          console.log(`Alert threshold: ${item.alertThreshold}`);
          console.log(`Check frequency: ${item.checkFrequency}`);
        } else {
          console.log('Watchlist:');
          for (const item of intelData.watchlist) {
            console.log(`  • ${item.industry} (added ${item.addedAt.split('T')[0]})`);
          }
        }
        break;
      }
      
      case 'sources': {
        const sources = listSources();
        console.log('Data Sources');
        console.log('='.repeat(50));
        for (const source of sources) {
          console.log(`\n  ${source.name} (${source.id})`);
          console.log(`    Type: ${source.type}`);
          console.log(`    Reliability: ${(source.reliability * 100).toFixed(0)}%`);
          console.log(`    Update: ${source.updateFrequency}`);
        }
        break;
      }
      
      case 'industries': {
        console.log('Tracked Industries');
        console.log('='.repeat(50));
        for (const [id, data] of Object.entries(INDUSTRIES)) {
          console.log(`\n  ${data.name} (${id})`);
          console.log(`    Market Size: ${data.avgMarketSize}`);
          console.log(`    Growth: ${data.growthRate}%`);
          console.log(`    Competition: ${data.competitionLevel}`);
          console.log(`    Niches: ${data.subNiches.join(', ')}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Market Intelligence Module');
        console.log('==========================');
        console.log(`Analyses stored: ${intelData.analyses.length}`);
        console.log(`Reports generated: ${intelData.reports.length}`);
        console.log(`Opportunities found: ${intelData.opportunities.length}`);
        console.log(`Watchlist items: ${intelData.watchlist.length}`);
        console.log(`Data sources: ${Object.keys(DATA_SOURCES).length}`);
        console.log(`Industries tracked: ${Object.keys(INDUSTRIES).length}`);
        break;
      }
      
      default:
        console.log('Market Intelligence - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  analyzeMarket,
  findTrends,
  findOpportunities,
  generateReport,
  addToWatchlist,
  listSources,
  DATA_SOURCES,
  INDUSTRIES,
  ANALYSIS_METRICS
};

// Run CLI
main().catch(console.error);
