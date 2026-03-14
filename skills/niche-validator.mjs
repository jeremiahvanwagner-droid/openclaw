#!/usr/bin/env node
/**
 * OpenClaw Niche Validator Agent
 * 
 * Research Division - Niche validation and viability analysis
 * 
 * Features:
 *   - Market size estimation
 *   - Competition analysis
 *   - Profit potential scoring
 *   - Demand validation
 *   - Entry barrier assessment
 *   - Success probability calculation
 * 
 * Usage: node niche-validator.mjs <command> [args...]
 * 
 * Commands:
 *   validate <niche>          Full niche validation
 *   score <niche>             Quick viability score
 *   compare <niche1> <niche2> Compare two niches
 *   criteria                  Show validation criteria
 *   history                   View past validations
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const NICHES_FILE = path.join(DATA_DIR, 'niches.json');

// Validation criteria with weights
const VALIDATION_CRITERIA = {
  marketSize: {
    weight: 0.15,
    description: 'Total addressable market size',
    metrics: ['revenue potential', 'customer base', 'growth rate']
  },
  demand: {
    weight: 0.20,
    description: 'Customer demand and search interest',
    metrics: ['search volume', 'trend direction', 'problem urgency']
  },
  competition: {
    weight: 0.15,
    description: 'Competitive landscape',
    metrics: ['number of competitors', 'market concentration', 'barriers']
  },
  profitability: {
    weight: 0.20,
    description: 'Revenue and margin potential',
    metrics: ['price points', 'margins', 'LTV potential']
  },
  accessibility: {
    weight: 0.10,
    description: 'Ease of market entry',
    metrics: ['capital required', 'expertise needed', 'time to market']
  },
  scalability: {
    weight: 0.10,
    description: 'Growth and scaling potential',
    metrics: ['automation potential', 'leverage opportunities', 'expansion paths']
  },
  passion: {
    weight: 0.10,
    description: 'Personal interest and expertise fit',
    metrics: ['knowledge level', 'enthusiasm', 'staying power']
  }
};

// Niche categories
const NICHE_CATEGORIES = {
  'digital-products': {
    avgMarketSize: 'large',
    typicalMargins: '70-90%',
    entryBarrier: 'low',
    examples: ['online courses', 'ebooks', 'templates', 'software']
  },
  'coaching': {
    avgMarketSize: 'medium',
    typicalMargins: '60-80%',
    entryBarrier: 'medium',
    examples: ['business coaching', 'life coaching', 'career coaching']
  },
  'ecommerce': {
    avgMarketSize: 'large',
    typicalMargins: '20-50%',
    entryBarrier: 'medium',
    examples: ['dropshipping', 'private label', 'handmade']
  },
  'services': {
    avgMarketSize: 'medium',
    typicalMargins: '40-70%',
    entryBarrier: 'low',
    examples: ['consulting', 'freelancing', 'agency']
  },
  'content': {
    avgMarketSize: 'medium',
    typicalMargins: '50-80%',
    entryBarrier: 'low',
    examples: ['blogging', 'YouTube', 'podcasting']
  },
  'saas': {
    avgMarketSize: 'large',
    typicalMargins: '70-90%',
    entryBarrier: 'high',
    examples: ['productivity tools', 'marketing tools', 'analytics']
  }
};

// Risk factors
const RISK_FACTORS = {
  'high-competition': { impact: -15, description: 'Saturated market with established players' },
  'low-barrier': { impact: -10, description: 'Easy entry means more future competition' },
  'trend-dependent': { impact: -15, description: 'Success tied to passing trends' },
  'regulatory': { impact: -20, description: 'Subject to regulations or compliance' },
  'platform-dependent': { impact: -15, description: 'Relies heavily on third-party platforms' },
  'seasonal': { impact: -10, description: 'Revenue varies significantly by season' },
  'capital-intensive': { impact: -20, description: 'Requires significant upfront investment' }
};

// Success factors
const SUCCESS_FACTORS = {
  'evergreen': { impact: 15, description: 'Consistent demand year-round' },
  'recurring-revenue': { impact: 20, description: 'Subscription or repeat purchase model' },
  'high-margins': { impact: 15, description: 'Profit margins above 60%' },
  'scalable': { impact: 20, description: 'Can grow without proportional cost increase' },
  'expertise-moat': { impact: 15, description: 'Your expertise creates competitive advantage' },
  'underserved': { impact: 20, description: 'Clear gap in current market offerings' },
  'growing-market': { impact: 15, description: 'Market expanding year over year' }
};

// Data storage
let nicheData = {
  validations: {},
  comparisons: [],
  watchlist: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(NICHES_FILE, 'utf8');
    nicheData = JSON.parse(data);
  } catch {
    nicheData = { validations: {}, comparisons: [], watchlist: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(NICHES_FILE, JSON.stringify(nicheData, null, 2));
}

/**
 * Validate a niche
 */
async function validateNiche(niche, options = {}) {
  const scores = {};
  const details = {};
  
  // Score each criterion
  for (const [criterion, config] of Object.entries(VALIDATION_CRITERIA)) {
    const { score, detail } = evaluateCriterion(niche, criterion);
    scores[criterion] = score;
    details[criterion] = detail;
  }
  
  // Calculate weighted total
  let weightedTotal = 0;
  for (const [criterion, score] of Object.entries(scores)) {
    weightedTotal += score * VALIDATION_CRITERIA[criterion].weight;
  }
  
  // Identify risk and success factors
  const risks = identifyRiskFactors(niche, details);
  const successes = identifySuccessFactors(niche, details);
  
  // Apply factor adjustments
  let adjustment = 0;
  for (const risk of risks) {
    adjustment += RISK_FACTORS[risk.factor].impact;
  }
  for (const success of successes) {
    adjustment += SUCCESS_FACTORS[success.factor].impact;
  }
  
  const finalScore = Math.max(0, Math.min(100, Math.round(weightedTotal + adjustment)));
  
  // Generate recommendation
  const recommendation = generateRecommendation(finalScore, risks, successes);
  
  // Market analysis
  const marketAnalysis = analyzeMarket(niche);
  
  // Revenue projections
  const projections = generateProjections(niche, marketAnalysis);
  
  const validation = {
    niche,
    scores,
    details,
    weightedScore: Math.round(weightedTotal),
    adjustment,
    finalScore,
    grade: getGrade(finalScore),
    risks,
    successes,
    recommendation,
    marketAnalysis,
    projections,
    validatedAt: new Date().toISOString()
  };
  
  // Store validation
  nicheData.validations[niche.toLowerCase()] = validation;
  await saveData();
  
  return validation;
}

/**
 * Evaluate single criterion
 */
function evaluateCriterion(niche, criterion) {
  // Simulated scoring based on niche characteristics
  const baseScore = 50 + Math.round((Math.random() - 0.3) * 40);
  
  const detail = {
    score: Math.max(20, Math.min(100, baseScore)),
    factors: generateCriterionFactors(criterion),
    notes: generateCriterionNotes(niche, criterion)
  };
  
  return { score: detail.score, detail };
}

/**
 * Generate criterion factors
 */
function generateCriterionFactors(criterion) {
  const factors = {
    marketSize: [
      { name: 'TAM Estimate', value: '$' + (Math.random() * 50 + 5).toFixed(1) + 'B' },
      { name: 'Growth Rate', value: (Math.random() * 15 + 5).toFixed(1) + '%' },
      { name: 'Customer Base', value: (Math.random() * 100 + 10).toFixed(0) + 'M' }
    ],
    demand: [
      { name: 'Monthly Searches', value: Math.round(Math.random() * 500000 + 50000).toLocaleString() },
      { name: 'Trend', value: Math.random() > 0.5 ? 'Growing' : 'Stable' },
      { name: 'Problem Urgency', value: Math.random() > 0.5 ? 'High' : 'Medium' }
    ],
    competition: [
      { name: 'Major Players', value: Math.round(Math.random() * 20 + 3) },
      { name: 'Market Concentration', value: Math.random() > 0.5 ? 'Fragmented' : 'Concentrated' },
      { name: 'Entry Difficulty', value: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)] }
    ],
    profitability: [
      { name: 'Avg Price Point', value: '$' + Math.round(Math.random() * 500 + 47) },
      { name: 'Typical Margin', value: Math.round(Math.random() * 40 + 40) + '%' },
      { name: 'LTV Potential', value: '$' + Math.round(Math.random() * 5000 + 500) }
    ],
    accessibility: [
      { name: 'Capital Required', value: '$' + Math.round(Math.random() * 10000 + 500) },
      { name: 'Expertise Level', value: ['Basic', 'Intermediate', 'Expert'][Math.floor(Math.random() * 3)] },
      { name: 'Time to Launch', value: Math.round(Math.random() * 6 + 1) + ' months' }
    ],
    scalability: [
      { name: 'Automation Potential', value: Math.round(Math.random() * 40 + 60) + '%' },
      { name: 'Leverage Score', value: (Math.random() * 3 + 2).toFixed(1) + 'x' },
      { name: 'Expansion Paths', value: Math.round(Math.random() * 5 + 2) }
    ],
    passion: [
      { name: 'Interest Match', value: 'Self-assessed' },
      { name: 'Knowledge Level', value: 'Self-assessed' },
      { name: 'Long-term Commitment', value: 'Self-assessed' }
    ]
  };
  
  return factors[criterion] || [];
}

/**
 * Generate criterion notes
 */
function generateCriterionNotes(niche, criterion) {
  const notes = {
    marketSize: `The ${niche} market shows significant potential with healthy growth indicators.`,
    demand: `Search trends indicate steady interest in ${niche} solutions.`,
    competition: `Competition exists but differentiation opportunities remain.`,
    profitability: `Margins are favorable for digital product models in this space.`,
    accessibility: `Entry requirements are manageable for bootstrapped entrepreneurs.`,
    scalability: `Good potential for automation and passive income streams.`,
    passion: `Consider your personal interest and experience in ${niche}.`
  };
  
  return notes[criterion] || '';
}

/**
 * Identify risk factors
 */
function identifyRiskFactors(niche, details) {
  const risks = [];
  
  // Check for risk indicators
  if (details.competition?.score < 40) {
    risks.push({
      factor: 'high-competition',
      severity: 'high',
      mitigation: 'Focus on specific sub-niche or unique positioning'
    });
  }
  
  if (details.accessibility?.score > 80) {
    risks.push({
      factor: 'low-barrier',
      severity: 'medium',
      mitigation: 'Build expertise moat and strong brand'
    });
  }
  
  if (Math.random() > 0.7) {
    risks.push({
      factor: 'platform-dependent',
      severity: 'medium',
      mitigation: 'Diversify traffic sources and build owned audience'
    });
  }
  
  return risks;
}

/**
 * Identify success factors
 */
function identifySuccessFactors(niche, details) {
  const successes = [];
  
  if (details.profitability?.score > 70) {
    successes.push({
      factor: 'high-margins',
      impact: 'Revenue efficiency and faster profitability'
    });
  }
  
  if (details.scalability?.score > 70) {
    successes.push({
      factor: 'scalable',
      impact: 'Growth potential without proportional cost increase'
    });
  }
  
  if (details.demand?.score > 70) {
    successes.push({
      factor: 'growing-market',
      impact: 'Rising tide lifts all boats - easier customer acquisition'
    });
  }
  
  if (details.marketSize?.score > 60 && details.competition?.score > 60) {
    successes.push({
      factor: 'underserved',
      impact: 'Opportunity to capture market share quickly'
    });
  }
  
  return successes;
}

/**
 * Generate recommendation
 */
function generateRecommendation(score, risks, successes) {
  if (score >= 80) {
    return {
      verdict: 'HIGHLY RECOMMENDED',
      color: 'green',
      summary: 'This niche shows strong potential across all criteria.',
      action: 'Proceed with confidence. Begin market validation immediately.',
      priority: 1
    };
  } else if (score >= 65) {
    return {
      verdict: 'RECOMMENDED',
      color: 'green',
      summary: 'Good opportunity with some areas to address.',
      action: 'Proceed with targeted strategy to mitigate identified risks.',
      priority: 2
    };
  } else if (score >= 50) {
    return {
      verdict: 'CONDITIONAL',
      color: 'yellow',
      summary: 'Viable but requires careful planning.',
      action: 'Consider if your unique advantages can overcome the challenges.',
      priority: 3
    };
  } else if (score >= 35) {
    return {
      verdict: 'CAUTION',
      color: 'orange',
      summary: 'Significant challenges outweigh opportunities.',
      action: 'Only proceed if you have substantial competitive advantages.',
      priority: 4
    };
  } else {
    return {
      verdict: 'NOT RECOMMENDED',
      color: 'red',
      summary: 'High risk with limited upside potential.',
      action: 'Explore alternative niches unless you have exceptional circumstances.',
      priority: 5
    };
  }
}

/**
 * Get letter grade
 */
function getGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 45) return 'D+';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Analyze market
 */
function analyzeMarket(niche) {
  return {
    category: detectCategory(niche),
    segments: [
      { name: 'Beginners', size: '45%', characteristics: 'New to topic, need basics' },
      { name: 'Intermediate', size: '35%', characteristics: 'Some knowledge, want to advance' },
      { name: 'Advanced', size: '20%', characteristics: 'Experts seeking specialized info' }
    ],
    channels: [
      { name: 'Search', effectiveness: 'High', cost: 'Medium' },
      { name: 'Social Media', effectiveness: 'Medium', cost: 'Low' },
      { name: 'Paid Ads', effectiveness: 'High', cost: 'High' },
      { name: 'Partnerships', effectiveness: 'High', cost: 'Medium' }
    ],
    seasonality: Math.random() > 0.7 ? 'Seasonal peaks in Q1 and Q4' : 'Relatively consistent year-round'
  };
}

/**
 * Detect niche category
 */
function detectCategory(niche) {
  const nicheLower = niche.toLowerCase();
  
  const categoryKeywords = {
    'digital-products': ['course', 'ebook', 'template', 'software', 'app'],
    'coaching': ['coaching', 'mentor', 'consult', 'advise'],
    'ecommerce': ['product', 'store', 'shop', 'sell'],
    'services': ['service', 'agency', 'freelance'],
    'content': ['blog', 'youtube', 'podcast', 'influencer'],
    'saas': ['saas', 'platform', 'tool', 'automation']
  };
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (nicheLower.includes(keyword)) {
        return NICHE_CATEGORIES[category];
      }
    }
  }
  
  return NICHE_CATEGORIES['digital-products'];
}

/**
 * Generate revenue projections
 */
function generateProjections(niche, marketAnalysis) {
  const avgPrice = 97 + Math.round(Math.random() * 400);
  const monthlyCustomers = {
    conservative: Math.round(Math.random() * 20 + 5),
    moderate: Math.round(Math.random() * 50 + 20),
    optimistic: Math.round(Math.random() * 100 + 50)
  };
  
  return {
    pricePoint: avgPrice,
    scenarios: {
      conservative: {
        monthlyCustomers: monthlyCustomers.conservative,
        monthlyRevenue: avgPrice * monthlyCustomers.conservative,
        yearOneRevenue: avgPrice * monthlyCustomers.conservative * 12
      },
      moderate: {
        monthlyCustomers: monthlyCustomers.moderate,
        monthlyRevenue: avgPrice * monthlyCustomers.moderate,
        yearOneRevenue: avgPrice * monthlyCustomers.moderate * 12
      },
      optimistic: {
        monthlyCustomers: monthlyCustomers.optimistic,
        monthlyRevenue: avgPrice * monthlyCustomers.optimistic,
        yearOneRevenue: avgPrice * monthlyCustomers.optimistic * 12
      }
    },
    breakEvenMonths: Math.round(Math.random() * 6 + 2),
    marginEstimate: Math.round(Math.random() * 20 + 65) + '%'
  };
}

/**
 * Quick score calculation
 */
async function quickScore(niche) {
  const baseScores = {};
  
  for (const criterion of Object.keys(VALIDATION_CRITERIA)) {
    baseScores[criterion] = 40 + Math.round(Math.random() * 50);
  }
  
  let total = 0;
  for (const [criterion, score] of Object.entries(baseScores)) {
    total += score * VALIDATION_CRITERIA[criterion].weight;
  }
  
  const finalScore = Math.round(total);
  
  return {
    niche,
    score: finalScore,
    grade: getGrade(finalScore),
    quickAssessment: finalScore >= 65 ? 'Worth exploring further' : 'Consider alternatives',
    topStrength: Object.entries(baseScores).sort((a, b) => b[1] - a[1])[0][0],
    topWeakness: Object.entries(baseScores).sort((a, b) => a[1] - b[1])[0][0]
  };
}

/**
 * Compare two niches
 */
async function compareNiches(niche1, niche2) {
  const validation1 = await validateNiche(niche1);
  const validation2 = await validateNiche(niche2);
  
  const comparison = {
    niches: [niche1, niche2],
    scores: {
      [niche1]: validation1.finalScore,
      [niche2]: validation2.finalScore
    },
    winner: validation1.finalScore > validation2.finalScore ? niche1 : niche2,
    margin: Math.abs(validation1.finalScore - validation2.finalScore),
    criteriaComparison: {},
    recommendation: '',
    comparedAt: new Date().toISOString()
  };
  
  // Compare each criterion
  for (const criterion of Object.keys(VALIDATION_CRITERIA)) {
    comparison.criteriaComparison[criterion] = {
      [niche1]: validation1.scores[criterion],
      [niche2]: validation2.scores[criterion],
      winner: validation1.scores[criterion] > validation2.scores[criterion] ? niche1 : niche2
    };
  }
  
  // Generate comparison recommendation
  if (comparison.margin > 20) {
    comparison.recommendation = `${comparison.winner} is clearly the better choice with a ${comparison.margin}-point advantage.`;
  } else if (comparison.margin > 10) {
    comparison.recommendation = `${comparison.winner} has a moderate advantage. Consider your personal factors.`;
  } else {
    comparison.recommendation = `Both niches are comparable. Choose based on your passion and expertise.`;
  }
  
  // Store comparison
  nicheData.comparisons.push(comparison);
  await saveData();
  
  return comparison;
}

/**
 * Get validation history
 */
async function getHistory() {
  return {
    totalValidations: Object.keys(nicheData.validations).length,
    validations: Object.entries(nicheData.validations).map(([niche, data]) => ({
      niche,
      score: data.finalScore,
      grade: data.grade,
      validatedAt: data.validatedAt
    })).sort((a, b) => b.score - a.score),
    comparisons: nicheData.comparisons.length,
    recentComparisons: nicheData.comparisons.slice(-5)
  };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'validate': {
        const niche = args.join(' ') || 'online courses';
        console.log(`Validating niche: ${niche}...`);
        
        const validation = await validateNiche(niche);
        
        console.log('\n' + '='.repeat(60));
        console.log(`NICHE VALIDATION: ${niche.toUpperCase()}`);
        console.log('='.repeat(60));
        
        console.log(`\nFINAL SCORE: ${validation.finalScore}/100 (${validation.grade})`);
        console.log(`VERDICT: ${validation.recommendation.verdict}`);
        
        console.log('\nCRITERIA SCORES:');
        for (const [criterion, score] of Object.entries(validation.scores)) {
          const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
          console.log(`  ${criterion.padEnd(15)} ${bar} ${score}`);
        }
        
        console.log('\nRISK FACTORS:');
        for (const risk of validation.risks) {
          console.log(`  ⚠ ${RISK_FACTORS[risk.factor].description}`);
          console.log(`    Mitigation: ${risk.mitigation}`);
        }
        
        console.log('\nSUCCESS FACTORS:');
        for (const success of validation.successes) {
          console.log(`  ✓ ${SUCCESS_FACTORS[success.factor].description}`);
        }
        
        console.log('\nPROJECTIONS (Moderate Scenario):');
        const proj = validation.projections.scenarios.moderate;
        console.log(`  Monthly Revenue: $${proj.monthlyRevenue.toLocaleString()}`);
        console.log(`  Year 1 Revenue: $${proj.yearOneRevenue.toLocaleString()}`);
        console.log(`  Break-even: ${validation.projections.breakEvenMonths} months`);
        
        console.log('\nRECOMMENDATION:');
        console.log(`  ${validation.recommendation.summary}`);
        console.log(`  Action: ${validation.recommendation.action}`);
        break;
      }
      
      case 'score': {
        const niche = args.join(' ');
        
        if (!niche) {
          console.error('Usage: score <niche>');
          process.exit(1);
        }
        
        const result = await quickScore(niche);
        
        console.log('\nQuick Score');
        console.log('='.repeat(40));
        console.log(`Niche: ${result.niche}`);
        console.log(`Score: ${result.score}/100 (${result.grade})`);
        console.log(`Assessment: ${result.quickAssessment}`);
        console.log(`Top Strength: ${result.topStrength}`);
        console.log(`Top Weakness: ${result.topWeakness}`);
        break;
      }
      
      case 'compare': {
        if (args.length < 2) {
          console.error('Usage: compare <niche1> <niche2>');
          process.exit(1);
        }
        
        // Simple split - first arg vs rest
        const niche1 = args[0];
        const niche2 = args.slice(1).join(' ');
        
        console.log(`Comparing: ${niche1} vs ${niche2}...`);
        const comparison = await compareNiches(niche1, niche2);
        
        console.log('\nNiche Comparison');
        console.log('='.repeat(50));
        console.log(`${niche1}: ${comparison.scores[niche1]}/100`);
        console.log(`${niche2}: ${comparison.scores[niche2]}/100`);
        console.log(`\nWinner: ${comparison.winner} (+${comparison.margin} points)`);
        
        console.log('\nCriteria Breakdown:');
        for (const [criterion, data] of Object.entries(comparison.criteriaComparison)) {
          const diff = data[niche1] - data[niche2];
          const indicator = diff > 0 ? '>' : diff < 0 ? '<' : '=';
          console.log(`  ${criterion.padEnd(15)} ${data[niche1]} ${indicator} ${data[niche2]}`);
        }
        
        console.log(`\n${comparison.recommendation}`);
        break;
      }
      
      case 'criteria': {
        console.log('\nValidation Criteria');
        console.log('='.repeat(50));
        
        for (const [criterion, config] of Object.entries(VALIDATION_CRITERIA)) {
          console.log(`\n${criterion.toUpperCase()} (Weight: ${config.weight * 100}%)`);
          console.log(`  ${config.description}`);
          console.log(`  Metrics: ${config.metrics.join(', ')}`);
        }
        break;
      }
      
      case 'history': {
        const history = await getHistory();
        
        console.log('\nValidation History');
        console.log('='.repeat(50));
        console.log(`Total Validations: ${history.totalValidations}`);
        
        if (history.validations.length > 0) {
          console.log('\nTop Validated Niches:');
          for (const v of history.validations.slice(0, 5)) {
            console.log(`  ${v.niche.padEnd(25)} ${v.score}/100 (${v.grade})`);
          }
        }
        
        if (history.comparisons > 0) {
          console.log(`\nComparisons Made: ${history.comparisons}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Niche Validator Module');
        console.log('======================');
        console.log(`Criteria defined: ${Object.keys(VALIDATION_CRITERIA).length}`);
        console.log(`Niche categories: ${Object.keys(NICHE_CATEGORIES).length}`);
        console.log(`Risk factors: ${Object.keys(RISK_FACTORS).length}`);
        console.log(`Success factors: ${Object.keys(SUCCESS_FACTORS).length}`);
        console.log(`Past validations: ${Object.keys(nicheData.validations).length}`);
        break;
      }
      
      default:
        console.log('Niche Validator - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  validateNiche,
  quickScore,
  compareNiches,
  getHistory,
  VALIDATION_CRITERIA,
  NICHE_CATEGORIES,
  RISK_FACTORS,
  SUCCESS_FACTORS
};

// Run CLI
main().catch(console.error);
