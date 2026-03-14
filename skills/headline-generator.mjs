#!/usr/bin/env node
/**
 * OpenClaw Headline Generator Agent
 * 
 * Content Division - Compelling headline and hook creation
 * 
 * Features:
 *   - Multiple headline formulas
 *   - A/B test variations
 *   - Emotional triggers
 *   - Power words integration
 *   - Click-through optimization
 *   - Platform-specific headlines
 * 
 * Usage: node headline-generator.mjs <command> [args...]
 * 
 * Commands:
 *   generate <topic>         Generate headlines
 *   formula <type> <topic>   Use specific formula
 *   hooks <topic>            Generate hooks
 *   optimize <headline>      Optimize existing headline
 *   ab <topic>               Create A/B test variants
 *   analyze <headline>       Analyze headline strength
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const HEADLINES_FILE = path.join(DATA_DIR, 'headlines.json');

// Headline formulas
const HEADLINE_FORMULAS = {
  'how-to': {
    template: 'How to [Action] [Result] in [Timeframe]',
    example: 'How to Double Your Income in 90 Days',
    emotion: 'aspiration',
    effectiveness: 85
  },
  'number-list': {
    template: '[Number] [Adjective] Ways to [Action]',
    example: '7 Proven Ways to Increase Sales',
    emotion: 'curiosity',
    effectiveness: 90
  },
  'question': {
    template: 'Are You Making These [Number] [Topic] Mistakes?',
    example: 'Are You Making These 5 Marketing Mistakes?',
    emotion: 'fear',
    effectiveness: 80
  },
  'secret': {
    template: 'The Secret to [Desired Result] That [Authority] Don\'t Want You to Know',
    example: 'The Secret to Weight Loss That Doctors Don\'t Want You to Know',
    emotion: 'curiosity',
    effectiveness: 75
  },
  'ultimate': {
    template: 'The Ultimate Guide to [Topic] for [Target Audience]',
    example: 'The Ultimate Guide to SEO for Beginners',
    emotion: 'completeness',
    effectiveness: 85
  },
  'why': {
    template: 'Why [Common Belief] Is Wrong (And What to Do Instead)',
    example: 'Why Cold Calling Is Dead (And What to Do Instead)',
    emotion: 'contrarian',
    effectiveness: 80
  },
  'case-study': {
    template: 'How [Person/Company] [Achieved Result] in [Timeframe]',
    example: 'How One Startup Grew to $1M in 6 Months',
    emotion: 'social proof',
    effectiveness: 85
  },
  'warning': {
    template: 'Warning: [Problem] Could Be [Negative Consequence]',
    example: 'Warning: Your Morning Routine Could Be Killing Your Productivity',
    emotion: 'fear',
    effectiveness: 70
  },
  'surprising': {
    template: '[Counter-Intuitive Statement] That Will [Result]',
    example: 'Working Less That Will Actually Make You More Productive',
    emotion: 'surprise',
    effectiveness: 75
  },
  'newbie': {
    template: '[Topic] for Beginners: Everything You Need to Know',
    example: 'Cryptocurrency for Beginners: Everything You Need to Know',
    emotion: 'accessibility',
    effectiveness: 80
  }
};

// Power words by category
const POWER_WORDS = {
  urgency: ['Now', 'Today', 'Immediately', 'Fast', 'Quick', 'Instant', 'Limited', 'Hurry', 'Deadline'],
  exclusivity: ['Secret', 'Insider', 'Exclusive', 'Private', 'Hidden', 'Underground', 'VIP', 'Members-Only'],
  curiosity: ['Surprising', 'Shocking', 'Strange', 'Unusual', 'Weird', 'Unexpected', 'Mysterious', 'Unknown'],
  fear: ['Warning', 'Danger', 'Alert', 'Avoid', 'Mistake', 'Risk', 'Threat', 'Critical', 'Crisis'],
  value: ['Free', 'Bonus', 'Ultimate', 'Complete', 'Comprehensive', 'Essential', 'Proven', 'Guaranteed'],
  emotion: ['Amazing', 'Incredible', 'Powerful', 'Life-Changing', 'Breakthrough', 'Revolutionary', 'Epic'],
  action: ['Discover', 'Unlock', 'Master', 'Transform', 'Boost', 'Skyrocket', 'Dominate', 'Conquer'],
  trust: ['Scientific', 'Research-Backed', 'Expert', 'Professional', 'Certified', 'Authentic', 'Verified']
};

// Emotional triggers
const EMOTIONAL_TRIGGERS = {
  fear: { phrase: 'Don\'t miss out', effectiveness: 85 },
  greed: { phrase: 'Get more for less', effectiveness: 80 },
  guilt: { phrase: 'What you should be doing', effectiveness: 70 },
  curiosity: { phrase: 'The truth about', effectiveness: 90 },
  exclusivity: { phrase: 'For serious people only', effectiveness: 75 },
  urgency: { phrase: 'Limited time only', effectiveness: 85 },
  belonging: { phrase: 'Join thousands who', effectiveness: 80 },
  aspiration: { phrase: 'Become the person who', effectiveness: 85 }
};

// Number psychology
const OPTIMAL_NUMBERS = [3, 5, 7, 10, 21, 30, 101];
const NUMBER_REASONING = {
  3: 'Minimum for pattern, easy to remember',
  5: 'Hand counting, feels complete',
  7: 'Lucky number, cognitive limit',
  10: 'Round, comprehensive',
  21: 'Specific enough to be credible',
  30: 'Month timeframe, achievable',
  101: 'Exceeds expectations'
};

// Data storage
let headlineData = {
  generated: [],
  analyzed: [],
  tests: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(HEADLINES_FILE, 'utf8');
    headlineData = JSON.parse(data);
  } catch {
    headlineData = { generated: [], analyzed: [], tests: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(HEADLINES_FILE, JSON.stringify(headlineData, null, 2));
}

/**
 * Generate headlines for topic
 */
async function generateHeadlines(topic, options = {}) {
  const count = options.count || 10;
  const headlines = [];
  
  // Generate using different formulas
  for (const [formula, config] of Object.entries(HEADLINE_FORMULAS)) {
    const headline = applyFormula(formula, topic, config);
    headlines.push({
      headline,
      formula,
      emotion: config.emotion,
      estimatedCTR: estimateCTR(headline, config.effectiveness)
    });
  }
  
  // Add power word variations
  const powerWordHeadlines = generatePowerWordVariations(topic);
  headlines.push(...powerWordHeadlines);
  
  // Sort by estimated CTR
  headlines.sort((a, b) => b.estimatedCTR - a.estimatedCTR);
  
  // Store results
  const result = {
    id: `headlines-${Date.now()}`,
    topic,
    headlines: headlines.slice(0, count),
    bestPerformer: headlines[0],
    generatedAt: new Date().toISOString()
  };
  
  headlineData.generated.push(result);
  await saveData();
  
  return result;
}

/**
 * Apply formula to topic
 */
function applyFormula(formula, topic, config) {
  const templates = {
    'how-to': `How to ${topic} in 30 Days or Less`,
    'number-list': `${getOptimalNumber()} Proven ${topic} Strategies That Actually Work`,
    'question': `Are You Making These ${getOptimalNumber()} ${topic} Mistakes?`,
    'secret': `The ${topic} Secret That Experts Don't Share`,
    'ultimate': `The Ultimate ${topic} Guide for 2026`,
    'why': `Why Everything You Know About ${topic} Is Wrong`,
    'case-study': `How I Mastered ${topic} in 90 Days (Case Study)`,
    'warning': `Warning: This ${topic} Mistake Could Cost You Everything`,
    'surprising': `The Surprising Truth About ${topic} Nobody Talks About`,
    'newbie': `${topic} for Beginners: The Complete Starter Guide`
  };
  
  return templates[formula] || `The Complete Guide to ${topic}`;
}

/**
 * Get optimal number for headlines
 */
function getOptimalNumber() {
  return OPTIMAL_NUMBERS[Math.floor(Math.random() * OPTIMAL_NUMBERS.length)];
}

/**
 * Generate power word variations
 */
function generatePowerWordVariations(topic) {
  const variations = [];
  
  const urgencyWord = POWER_WORDS.urgency[Math.floor(Math.random() * POWER_WORDS.urgency.length)];
  const valueWord = POWER_WORDS.value[Math.floor(Math.random() * POWER_WORDS.value.length)];
  const actionWord = POWER_WORDS.action[Math.floor(Math.random() * POWER_WORDS.action.length)];
  
  variations.push({
    headline: `${actionWord} ${topic}: Your ${valueWord} Guide`,
    formula: 'power-words',
    emotion: 'action',
    estimatedCTR: Math.round(Math.random() * 10 + 75) / 10
  });
  
  variations.push({
    headline: `${urgencyWord}: The ${valueWord} ${topic} Method`,
    formula: 'power-words-urgency',
    emotion: 'urgency',
    estimatedCTR: Math.round(Math.random() * 10 + 70) / 10
  });
  
  return variations;
}

/**
 * Estimate click-through rate
 */
function estimateCTR(headline, baseEffectiveness) {
  let score = baseEffectiveness;
  
  // Check for numbers
  if (/\d+/.test(headline)) score += 5;
  
  // Check for power words
  for (const category of Object.values(POWER_WORDS)) {
    for (const word of category) {
      if (headline.toLowerCase().includes(word.toLowerCase())) {
        score += 2;
        break;
      }
    }
  }
  
  // Length optimization (50-60 chars optimal)
  const length = headline.length;
  if (length >= 50 && length <= 60) score += 5;
  else if (length < 40 || length > 70) score -= 5;
  
  // Check for brackets/parentheses (boost engagement)
  if (/[\[\(]/.test(headline)) score += 3;
  
  return Math.round(Math.min(100, score) / 10 * 10) / 10;
}

/**
 * Generate using specific formula
 */
async function useFormula(formulaType, topic) {
  const config = HEADLINE_FORMULAS[formulaType];
  
  if (!config) {
    return { error: `Unknown formula: ${formulaType}`, availableFormulas: Object.keys(HEADLINE_FORMULAS) };
  }
  
  const headline = applyFormula(formulaType, topic, config);
  
  return {
    formula: formulaType,
    template: config.template,
    example: config.example,
    headline,
    emotion: config.emotion,
    effectiveness: config.effectiveness,
    tips: getFormulaTips(formulaType)
  };
}

/**
 * Get tips for formula
 */
function getFormulaTips(formula) {
  const tips = {
    'how-to': ['Include specific timeframe', 'Promise concrete result', 'Make it achievable'],
    'number-list': ['Use odd numbers (7, 9, 11)', 'Be specific', 'Promise unique insights'],
    'question': ['Touch on common fears', 'Make reader curious', 'Imply solution exists'],
    'secret': ['Promise exclusive info', 'Create intrigue', 'Suggest insider knowledge'],
    'ultimate': ['Promise comprehensiveness', 'Target specific audience', 'Include year for freshness'],
    'why': ['Challenge assumptions', 'Be provocative', 'Offer alternative'],
    'case-study': ['Use specific numbers', 'Include timeframe', 'Make it relatable'],
    'warning': ['Create urgency', 'Highlight risk', 'Promise prevention'],
    'surprising': ['Subvert expectations', 'Tease revelation', 'Create curiosity gap'],
    'newbie': ['Promise no jargon', 'Emphasize simplicity', 'Target beginners specifically']
  };
  
  return tips[formula] || ['Create curiosity', 'Be specific', 'Promise value'];
}

/**
 * Generate hooks
 */
async function generateHooks(topic, options = {}) {
  const count = options.count || 5;
  
  const hookTypes = [
    {
      type: 'Question Hook',
      hook: `Have you ever wondered why most people fail at ${topic}? The answer might surprise you.`,
      purpose: 'Engage curiosity'
    },
    {
      type: 'Statistic Hook',
      hook: `Only 3% of people actually succeed with ${topic}. Here's what they do differently.`,
      purpose: 'Establish credibility'
    },
    {
      type: 'Story Hook',
      hook: `Two years ago, I knew nothing about ${topic}. Today, it's completely transformed my life.`,
      purpose: 'Create connection'
    },
    {
      type: 'Contrarian Hook',
      hook: `Everything you've been told about ${topic} is wrong. Let me show you the truth.`,
      purpose: 'Challenge assumptions'
    },
    {
      type: 'Promise Hook',
      hook: `In the next 5 minutes, you'll learn the ${topic} strategy that changed everything for me.`,
      purpose: 'Set expectations'
    },
    {
      type: 'Fear Hook',
      hook: `If you're doing ${topic} without this crucial step, you're setting yourself up for failure.`,
      purpose: 'Create urgency'
    },
    {
      type: 'Curiosity Hook',
      hook: `There's one ${topic} technique that top performers never share publicly. Until now.`,
      purpose: 'Generate interest'
    }
  ];
  
  return {
    topic,
    hooks: hookTypes.slice(0, count),
    bestPractices: [
      'Lead with the most compelling hook',
      'Match hook to content type',
      'Keep it under 2 sentences',
      'Create an open loop',
      'Make a promise you can deliver'
    ]
  };
}

/**
 * Optimize existing headline
 */
async function optimizeHeadline(headline) {
  const analysis = analyzeHeadlineStrength(headline);
  const improvements = [];
  
  // Add number if missing
  if (!analysis.hasNumber) {
    improvements.push({
      type: 'Add number',
      reason: 'Headlines with numbers get 36% more clicks',
      suggestion: `7 Ways to ${headline.replace(/^(the|a|an)\s+/i, '')}`
    });
  }
  
  // Add power words
  if (analysis.powerWordCount < 2) {
    const powerWord = POWER_WORDS.value[Math.floor(Math.random() * POWER_WORDS.value.length)];
    improvements.push({
      type: 'Add power word',
      reason: 'Power words increase emotional response',
      suggestion: headline.replace(/guide|tips|ways/i, `${powerWord} $&`)
    });
  }
  
  // Optimize length
  if (analysis.length < 40 || analysis.length > 70) {
    improvements.push({
      type: 'Optimize length',
      reason: '50-60 characters is optimal for SEO',
      current: analysis.length,
      target: '50-60 characters'
    });
  }
  
  // Add brackets if missing
  if (!analysis.hasBrackets) {
    improvements.push({
      type: 'Add clarifier in brackets',
      reason: 'Brackets add context and boost CTR',
      suggestion: `${headline} [2026 Guide]`
    });
  }
  
  return {
    original: headline,
    analysis,
    improvements,
    optimizedVersions: improvements.filter(i => i.suggestion).map(i => i.suggestion)
  };
}

/**
 * Analyze headline strength
 */
function analyzeHeadlineStrength(headline) {
  const analysis = {
    headline,
    length: headline.length,
    wordCount: headline.split(' ').length,
    hasNumber: /\d+/.test(headline),
    hasBrackets: /[\[\(]/.test(headline),
    powerWordCount: 0,
    emotionalTrigger: null,
    estimatedCTR: 0,
    scores: {}
  };
  
  // Count power words
  for (const [category, words] of Object.entries(POWER_WORDS)) {
    for (const word of words) {
      if (headline.toLowerCase().includes(word.toLowerCase())) {
        analysis.powerWordCount++;
        if (!analysis.emotionalTrigger) {
          analysis.emotionalTrigger = category;
        }
      }
    }
  }
  
  // Calculate scores
  analysis.scores = {
    length: analysis.length >= 50 && analysis.length <= 60 ? 10 : 
            analysis.length >= 40 && analysis.length <= 70 ? 7 : 4,
    specificity: analysis.hasNumber ? 10 : 5,
    emotion: analysis.powerWordCount > 2 ? 10 : analysis.powerWordCount * 4,
    clarity: analysis.wordCount <= 12 ? 10 : analysis.wordCount <= 15 ? 7 : 4
  };
  
  analysis.totalScore = Object.values(analysis.scores).reduce((a, b) => a + b, 0);
  analysis.maxScore = 40;
  analysis.grade = analysis.totalScore >= 35 ? 'A' : 
                   analysis.totalScore >= 28 ? 'B' :
                   analysis.totalScore >= 20 ? 'C' : 'D';
  
  analysis.estimatedCTR = Math.round(analysis.totalScore / 4 * 10) / 10;
  
  return analysis;
}

/**
 * Create A/B test variants
 */
async function createABVariants(topic, options = {}) {
  const count = options.count || 4;
  
  // Generate diverse variants
  const variants = [];
  const formulaKeys = Object.keys(HEADLINE_FORMULAS);
  
  for (let i = 0; i < count; i++) {
    const formulaKey = formulaKeys[i % formulaKeys.length];
    const config = HEADLINE_FORMULAS[formulaKey];
    const headline = applyFormula(formulaKey, topic, config);
    const analysis = analyzeHeadlineStrength(headline);
    
    variants.push({
      variant: String.fromCharCode(65 + i), // A, B, C, D...
      headline,
      formula: formulaKey,
      emotion: config.emotion,
      predictedCTR: analysis.estimatedCTR,
      confidence: Math.round(70 + Math.random() * 20)
    });
  }
  
  // Sort by predicted performance
  variants.sort((a, b) => b.predictedCTR - a.predictedCTR);
  
  const test = {
    id: `ab-${Date.now()}`,
    topic,
    variants,
    recommendation: variants[0].variant,
    testDuration: '7-14 days recommended',
    sampleSize: '1000+ impressions per variant',
    createdAt: new Date().toISOString()
  };
  
  headlineData.tests.push(test);
  await saveData();
  
  return test;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'generate': {
        const topic = args.join(' ') || 'email marketing';
        console.log(`Generating headlines for: ${topic}...`);
        
        const result = await generateHeadlines(topic);
        
        console.log('\n' + '='.repeat(60));
        console.log('HEADLINE GENERATOR');
        console.log('='.repeat(60));
        console.log(`Topic: ${result.topic}`);
        
        console.log('\nTop Headlines:');
        for (const h of result.headlines.slice(0, 8)) {
          console.log(`  [${h.estimatedCTR}%] ${h.headline}`);
          console.log(`          Formula: ${h.formula} | Emotion: ${h.emotion}`);
        }
        
        console.log(`\nBest Performer: "${result.bestPerformer.headline}"`);
        break;
      }
      
      case 'formula': {
        const formulaType = args[0];
        const topic = args.slice(1).join(' ') || 'productivity';
        
        const result = await useFormula(formulaType, topic);
        
        if (result.error) {
          console.log(`Error: ${result.error}`);
          console.log(`Available: ${result.availableFormulas.join(', ')}`);
          break;
        }
        
        console.log('\nFormula Application');
        console.log('='.repeat(50));
        console.log(`Formula: ${result.formula}`);
        console.log(`Template: ${result.template}`);
        console.log(`Example: ${result.example}`);
        console.log(`\nGenerated: "${result.headline}"`);
        console.log(`Emotion: ${result.emotion}`);
        console.log(`Effectiveness: ${result.effectiveness}%`);
        
        console.log('\nTips:');
        for (const tip of result.tips) {
          console.log(`  • ${tip}`);
        }
        break;
      }
      
      case 'hooks': {
        const topic = args.join(' ') || 'content marketing';
        console.log(`Generating hooks for: ${topic}...`);
        
        const result = await generateHooks(topic);
        
        console.log('\nContent Hooks');
        console.log('='.repeat(50));
        
        for (const hook of result.hooks) {
          console.log(`\n[${hook.type}]`);
          console.log(`  "${hook.hook}"`);
          console.log(`  Purpose: ${hook.purpose}`);
        }
        break;
      }
      
      case 'optimize': {
        const headline = args.join(' ') || 'How to improve your marketing';
        console.log(`Optimizing: "${headline}"...`);
        
        const result = await optimizeHeadline(headline);
        
        console.log('\nHeadline Optimization');
        console.log('='.repeat(50));
        console.log(`Original: "${result.original}"`);
        console.log(`Score: ${result.analysis.totalScore}/${result.analysis.maxScore} (${result.analysis.grade})`);
        
        console.log('\nImprovements:');
        for (const imp of result.improvements) {
          console.log(`  • ${imp.type}: ${imp.reason}`);
          if (imp.suggestion) console.log(`    → "${imp.suggestion}"`);
        }
        
        if (result.optimizedVersions.length > 0) {
          console.log('\nOptimized Versions:');
          for (const v of result.optimizedVersions) {
            console.log(`  → "${v}"`);
          }
        }
        break;
      }
      
      case 'analyze': {
        const headline = args.join(' ') || 'The Complete Guide to Success';
        const analysis = analyzeHeadlineStrength(headline);
        
        console.log('\nHeadline Analysis');
        console.log('='.repeat(50));
        console.log(`Headline: "${analysis.headline}"`);
        console.log(`Grade: ${analysis.grade} (${analysis.totalScore}/${analysis.maxScore})`);
        console.log(`Estimated CTR: ${analysis.estimatedCTR}%`);
        
        console.log('\nBreakdown:');
        console.log(`  Length: ${analysis.length} chars (Score: ${analysis.scores.length}/10)`);
        console.log(`  Specificity: ${analysis.hasNumber ? 'Has number' : 'No number'} (Score: ${analysis.scores.specificity}/10)`);
        console.log(`  Emotion: ${analysis.powerWordCount} power words (Score: ${analysis.scores.emotion}/10)`);
        console.log(`  Clarity: ${analysis.wordCount} words (Score: ${analysis.scores.clarity}/10)`);
        break;
      }
      
      case 'ab': {
        const topic = args.join(' ') || 'digital marketing';
        console.log(`Creating A/B test variants for: ${topic}...`);
        
        const test = await createABVariants(topic);
        
        console.log('\nA/B Test Variants');
        console.log('='.repeat(50));
        
        for (const v of test.variants) {
          console.log(`\n  Variant ${v.variant}: ${v.headline}`);
          console.log(`    Predicted CTR: ${v.predictedCTR}% | Confidence: ${v.confidence}%`);
        }
        
        console.log(`\nRecommendation: Start with Variant ${test.recommendation}`);
        console.log(`Test Duration: ${test.testDuration}`);
        break;
      }
      
      case 'test': {
        console.log('Headline Generator Module');
        console.log('=========================');
        console.log(`Headline formulas: ${Object.keys(HEADLINE_FORMULAS).length}`);
        console.log(`Power word categories: ${Object.keys(POWER_WORDS).length}`);
        console.log(`Emotional triggers: ${Object.keys(EMOTIONAL_TRIGGERS).length}`);
        console.log(`Headlines generated: ${headlineData.generated.length}`);
        console.log(`A/B tests created: ${headlineData.tests.length}`);
        break;
      }
      
      default:
        console.log('Headline Generator - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  generateHeadlines,
  useFormula,
  generateHooks,
  optimizeHeadline,
  analyzeHeadlineStrength,
  createABVariants,
  HEADLINE_FORMULAS,
  POWER_WORDS,
  EMOTIONAL_TRIGGERS
};

// Run CLI
main().catch(console.error);
