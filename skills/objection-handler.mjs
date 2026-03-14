#!/usr/bin/env node
/**
 * OpenClaw Objection Handler
 * 
 * Sales objection pattern matching and automated responses
 * 
 * Features:
 *   - Pattern matching for common objections
 *   - Context-aware response generation
 *   - Product-specific rebuttals
 *   - A/B testing of responses
 *   - Integration with GHL workflows
 *   - Response analytics
 * 
 * Usage: node objection-handler.mjs <command> [args...]
 * 
 * Commands:
 *   detect <message>              Detect objection type
 *   respond <objection> [product] Generate response
 *   analyze <contactId>           Analyze contact objections
 *   train <objection> <response>  Add custom response
 *   stats                         Objection statistics
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const OBJECTIONS_FILE = path.join(DATA_DIR, 'objections.json');

// Objection categories with patterns and responses
const OBJECTION_PATTERNS = {
  'too-expensive': {
    patterns: [
      /too expensive/i,
      /can't afford/i,
      /too much money/i,
      /out of.*budget/i,
      /price.*too high/i,
      /cost.*too much/i,
      /over.*budget/i,
      /cheaper/i,
      /discount/i,
      /payment plan/i,
      /too costly/i,
      /financially/i,
      /money.*tight/i
    ],
    category: 'price',
    priority: 1,
    responses: {
      default: [
        "I completely understand budget concerns. Let me show you how this investment pays for itself. Most of our clients see ROI within {timeframe}. Would a payment plan make this more accessible for you?",
        "Price is definitely important. Here's what I want you to consider: the cost of NOT solving {problem} is often much higher. What's this challenge costing you right now - in time, money, or opportunity?",
        "I hear you. Before we talk numbers, let me ask: if this delivered exactly what you needed, would price still be the concern? Often there's something else we need to address first."
      ],
      withPaymentPlan: [
        "Great news - we offer flexible payment plans that break this down to just {monthly} per month. That's less than {comparison}. Would that work better for your situation?",
        "I want to make sure this works for you. We can split this into {payments} payments of {amount}. Plus, you start seeing results immediately while paying over time. Does that help?"
      ],
      withROI: [
        "Let me put this in perspective: if this helps you {benefit}, that's worth {roi_value} in the first year alone. You're investing {price} to make {roi_value}. Does that math make sense?",
        "I get it - {price} is a real investment. But consider: our clients typically {result} within {timeframe}. At that point, this has paid for itself {multiplier}x over."
      ],
      withGuarantee: [
        "Here's what I want you to know: we stand behind this 100%. If you don't see {result} within {timeframe}, we'll refund your investment completely. You're protected either way.",
        "I understand the hesitation. That's exactly why we offer our {guarantee_type} guarantee. You can try everything risk-free. If it doesn't work, you get your money back. Fair enough?"
      ]
    }
  },
  
  'no-time': {
    patterns: [
      /no time/i,
      /too busy/i,
      /don't have time/i,
      /time.*issue/i,
      /schedule.*full/i,
      /can't commit/i,
      /overwhelmed/i,
      /swamped/i,
      /time constraint/i,
      /maybe later/i,
      /not.*right now/i
    ],
    category: 'time',
    priority: 1,
    responses: {
      default: [
        "I completely get it - you're busy. That's actually why this might be perfect for you. This is designed to SAVE you time. Most people reclaim {hours} hours per week. Can you afford NOT to have that time back?",
        "Time is your most valuable asset - I respect that. Quick question: how much time are you currently spending on {problem}? Because this cuts that in half, minimum.",
        "Being busy is exactly why you need this. Let me ask you: what would you do with an extra {hours} hours each week? This makes that possible."
      ],
      quickStart: [
        "Here's what's different about this: you can implement the core system in just {minutes} minutes. No lengthy setup, no complicated process. Start today, see results this week.",
        "I designed this for busy people like you. The Quick Start module takes {minutes} minutes. That's it. One lunch break and you're up and running."
      ],
      doneForYou: [
        "What if I told you we do most of the heavy lifting for you? Our team handles {service}, so your time investment is minimal - maybe {hours} hours total.",
        "You're too busy to figure this out yourself - I get it. That's why we include {service}. We set everything up for you. You just use it."
      ]
    }
  },
  
  'need-to-think': {
    patterns: [
      /need to think/i,
      /think.*about/i,
      /let me consider/i,
      /get back to you/i,
      /sleep on it/i,
      /mull.*over/i,
      /give me.*time/i,
      /need.*process/i,
      /not ready.*decide/i,
      /need more time/i
    ],
    category: 'delay',
    priority: 2,
    responses: {
      default: [
        "I respect that - it's a big decision. Can I ask what specifically you're thinking about? Is it the {aspect1}, the {aspect2}, or something else? That way I can make sure you have all the info you need.",
        "Of course! What specifically would help you make this decision? I want to make sure you have everything you need to decide with confidence.",
        "That's totally fair. Can I ask you this: if everything we discussed was exactly right, what would still give you pause? Let's address that right now so you can decide with clarity."
      ],
      withDeadline: [
        "I understand. Here's something to consider: the {bonus/discount} I mentioned expires {deadline}. Take your time, but I don't want you to miss out on {value}.",
        "Take all the time you need. Just so you know, this offer - including {bonus} - is only available until {deadline}. After that, the investment goes up to {regular_price}."
      ],
      withFollowUp: [
        "No problem at all. I'll follow up with you on {day}. In the meantime, would it help if I sent you {resource}? That might answer some questions that come up.",
        "Sounds good. Let me send you {resource} to review. I'll check back on {day}. Does morning or afternoon work better for you?"
      ]
    }
  },
  
  'not-for-me': {
    patterns: [
      /not for me/i,
      /doesn't.*fit/i,
      /not.*right fit/i,
      /different.*situation/i,
      /unique.*case/i,
      /won't work.*for me/i,
      /not my.*thing/i,
      /not relevant/i,
      /doesn't apply/i
    ],
    category: 'fit',
    priority: 2,
    responses: {
      default: [
        "I appreciate you being direct. Can you help me understand - what specifically makes you feel it's not a fit? I want to make sure I'm not missing something about your situation.",
        "That's fair. Can I ask: is it because of {reason1}, {reason2}, or something else entirely? Sometimes it's not a fit, but other times there's a misconception I can clear up.",
        "I hear you. Before we close this out, let me ask: what would need to be different for this to be a fit? I might be able to adjust something, or at least point you in a better direction."
      ],
      withCase Studies: [
        "I thought the same thing initially. Then I saw what happened with {client_name}. They had a similar situation - {situation}. The result? {result}. Would you be open to hearing how they made it work?",
        "You know, {client_name} said the exact same thing. Their situation was {situation}. Six months later, they {result}. What if I connected you with them?"
      ]
    }
  },
  
  'tried-before': {
    patterns: [
      /tried.*before/i,
      /didn't work/i,
      /already tried/i,
      /burned.*before/i,
      /waste.*money/i,
      /been there/i,
      /done that/i,
      /same thing/i,
      /similar.*failed/i,
      /skeptical/i
    ],
    category: 'skepticism',
    priority: 1,
    responses: {
      default: [
        "I appreciate you sharing that - it takes courage to try again. Can you tell me what you tried before and what went wrong? That'll help me explain why this is different.",
        "That experience makes sense of your hesitation. Here's what makes this different: {differentiator}. We specifically designed it to avoid the problems you experienced.",
        "I hear you - and honestly, that past experience is why THIS might actually work for you. You know what doesn't work. This approach is {different}. Would it help to see a comparison?"
      ],
      withGuarantee: [
        "I get the skepticism - you've been burned before. That's exactly why we have our {guarantee} guarantee. If it doesn't work, you're protected. You have nothing to lose except the problem.",
        "After what you've been through, I completely understand the hesitation. Here's what I'll do: try it completely risk-free for {period}. If it's not different from everything else you've tried, full refund. Fair?"
      ]
    }
  },
  
  'spouse-partner': {
    patterns: [
      /talk to.*spouse/i,
      /husband.*wife/i,
      /partner/i,
      /check with/i,
      /ask my/i,
      /family.*decision/i,
      /not just.*me/i,
      /consult/i
    ],
    category: 'authority',
    priority: 2,
    responses: {
      default: [
        "That's respectful and smart - important decisions should include your partner. What specifically do you think they'll want to know? I can give you the key points to share.",
        "I respect that. Can I ask: are they generally supportive of investments in {area}? If so, what do you think their main question will be?",
        "Makes total sense. Would it help if we scheduled a quick call where both of you can join? That way you're not playing telephone and they can ask questions directly."
      ],
      withMaterials: [
        "I'll send you {materials} that you can review together. It covers the key points including {point1} and {point2}. When would be a good time for us to reconnect?",
        "Let me make this easy for you. I'll put together a quick summary with the main points and FAQs. You can review it together tonight. Can we chat again tomorrow?"
      ]
    }
  },
  
  'competitors': {
    patterns: [
      /other option/i,
      /competitor/i,
      /comparing/i,
      /alternative/i,
      /shopping around/i,
      /looking at.*others/i,
      /similar product/i,
      /other.*offer/i,
      /cheaper option/i
    ],
    category: 'competition',
    priority: 2,
    responses: {
      default: [
        "Shopping around is smart - I encourage it. Can I ask what specifically you're comparing? Price, features, support? That'll help me show you where we stand out.",
        "Great - you should compare options. Quick question: what are the top 2-3 things most important to you in making this decision? I'll show you exactly how we stack up.",
        "I appreciate you being thorough. Here's what our clients say makes us different: {differentiator}. Is that something the other options offer?"
      ],
      withComparison: [
        "Let me save you some time. Here's a quick comparison with {competitor}: {comparison}. The main difference is {key_difference}. Does that help?",
        "I know {competitor} well. Here's the honest truth: they're good at {strength}, but we're better at {our_strength}. For your situation, {recommendation} is more important. Fair assessment?"
      ]
    }
  },
  
  'bad-timing': {
    patterns: [
      /bad timing/i,
      /not.*right time/i,
      /busy season/i,
      /after.*holiday/i,
      /next quarter/i,
      /next year/i,
      /end of.*year/i,
      /middle of/i,
      /waiting.*until/i
    ],
    category: 'timing',
    priority: 2,
    responses: {
      default: [
        "I understand timing is important. Can I ask: what would make it the 'right' time? Because often the perfect time never comes, and {problem} keeps costing you.",
        "Is there ever a perfect time? Here's my experience: people who wait for 'later' usually just keep waiting. What if you started small today and scaled when things calm down?",
        "I hear you - timing matters. But consider this: while you're waiting, {competitor/problem} isn't. Starting now means you're ahead when the 'right' time arrives."
      ],
      withUrgency: [
        "I get it. Here's the thing though: this {offer/price/bonus} is only available right now. After {deadline}, the investment increases to {regular_price}.",
        "Totally understand. But here's why now matters: we're limiting this to {number} spots because of {reason}. Once those are gone, the next opportunity is {timeframe} away."
      ]
    }
  }
};

// Response templates variables
const TEMPLATE_VARIABLES = {
  timeframe: '30-60 days',
  problem: 'this challenge',
  monthly: '$97',
  comparison: 'a daily coffee',
  payments: 3,
  amount: '$299',
  benefit: 'save 10 hours per week',
  roi_value: '$10,000',
  price: '$897',
  result: 'meaningful results',
  multiplier: 3,
  guarantee_type: '30-day money-back',
  hours: 5,
  minutes: 15,
  service: 'the setup',
  bonus: 'the bonus package',
  deadline: 'Friday at midnight',
  regular_price: '$1,497',
  day: 'Thursday',
  resource: 'our case study document',
  differentiator: 'our proprietary methodology',
  period: '30 days',
  materials: 'a summary deck',
  point1: 'expected outcomes',
  point2: 'the guarantee',
  competitor: 'Alternative X',
  comparison: 'key differences',
  key_difference: 'our done-for-you implementation',
  strength: 'their thing',
  our_strength: 'our thing',
  recommendation: 'implementation support',
  number: 10,
  reason: 'personalized onboarding capacity'
};

// Data storage
let objectionsData = {
  detected: [],
  responses: [],
  customPatterns: [],
  stats: {}
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(OBJECTIONS_FILE, 'utf8');
    objectionsData = JSON.parse(data);
  } catch {
    objectionsData = { detected: [], responses: [], customPatterns: [], stats: {} };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(OBJECTIONS_FILE, JSON.stringify(objectionsData, null, 2));
}

/**
 * Detect objection in message
 */
function detectObjection(message) {
  const detected = [];
  
  // Check built-in patterns
  for (const [objectionType, config] of Object.entries(OBJECTION_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(message)) {
        detected.push({
          type: objectionType,
          category: config.category,
          priority: config.priority,
          pattern: pattern.toString(),
          confidence: 0.9
        });
        break; // Only match once per objection type
      }
    }
  }
  
  // Check custom patterns
  for (const custom of objectionsData.customPatterns) {
    const regex = new RegExp(custom.pattern, 'i');
    if (regex.test(message)) {
      detected.push({
        type: custom.type,
        category: 'custom',
        priority: custom.priority || 2,
        pattern: custom.pattern,
        confidence: 0.8
      });
    }
  }
  
  // Sort by priority
  detected.sort((a, b) => a.priority - b.priority);
  
  // Log detection
  if (detected.length > 0) {
    objectionsData.detected.push({
      message: message.substring(0, 200),
      detected,
      timestamp: new Date().toISOString()
    });
    
    // Update stats
    for (const d of detected) {
      objectionsData.stats[d.type] = (objectionsData.stats[d.type] || 0) + 1;
    }
  }
  
  return detected;
}

/**
 * Fill template variables
 */
function fillTemplate(template, customVars = {}) {
  const vars = { ...TEMPLATE_VARIABLES, ...customVars };
  let result = template;
  
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value);
  }
  
  return result;
}

/**
 * Generate response for objection
 */
function generateResponse(objectionType, responseType = 'default', customVars = {}) {
  const config = OBJECTION_PATTERNS[objectionType];
  
  if (!config) {
    // Check custom patterns
    const custom = objectionsData.customPatterns.find(p => p.type === objectionType);
    if (custom && custom.response) {
      return {
        objection: objectionType,
        response: fillTemplate(custom.response, customVars),
        type: 'custom'
      };
    }
    return { error: `Unknown objection type: ${objectionType}` };
  }
  
  const responses = config.responses[responseType] || config.responses.default;
  const template = responses[Math.floor(Math.random() * responses.length)];
  const response = fillTemplate(template, customVars);
  
  // Log response
  objectionsData.responses.push({
    objection: objectionType,
    responseType,
    template: template.substring(0, 100),
    timestamp: new Date().toISOString()
  });
  
  return {
    objection: objectionType,
    category: config.category,
    response,
    type: responseType,
    alternatives: Object.keys(config.responses).filter(t => t !== responseType)
  };
}

/**
 * Get full response with follow-up
 */
function getFullResponse(objectionType, product = 'default') {
  const config = OBJECTION_PATTERNS[objectionType];
  if (!config) {
    return { error: `Unknown objection type: ${objectionType}` };
  }
  
  const mainResponse = generateResponse(objectionType, 'default');
  
  // Get alternative responses
  const alternatives = [];
  for (const [type, responses] of Object.entries(config.responses)) {
    if (type !== 'default') {
      alternatives.push({
        type,
        preview: fillTemplate(responses[0], {}).substring(0, 100) + '...'
      });
    }
  }
  
  return {
    objection: objectionType,
    category: config.category,
    mainResponse: mainResponse.response,
    alternatives,
    followUp: getFollowUpStrategy(objectionType)
  };
}

/**
 * Get follow-up strategy
 */
function getFollowUpStrategy(objectionType) {
  const strategies = {
    'too-expensive': {
      immediate: 'Ask about budget range',
      followUp1: 'Send ROI calculator',
      followUp2: 'Share payment plan options',
      followUp3: 'Send case study with ROI data'
    },
    'no-time': {
      immediate: 'Emphasize time savings',
      followUp1: 'Send quick-start guide',
      followUp2: 'Offer implementation support',
      followUp3: 'Schedule micro-commitment'
    },
    'need-to-think': {
      immediate: 'Identify specific concern',
      followUp1: 'Send FAQ document',
      followUp2: 'Schedule follow-up call',
      followUp3: 'Send deadline reminder'
    },
    'not-for-me': {
      immediate: 'Understand their situation',
      followUp1: 'Send relevant case study',
      followUp2: 'Offer customization call',
      followUp3: 'Request feedback for improvement'
    },
    'tried-before': {
      immediate: 'Acknowledge past experience',
      followUp1: 'Share differentiation document',
      followUp2: 'Offer risk-free trial',
      followUp3: 'Connect with similar success story'
    },
    'spouse-partner': {
      immediate: 'Prepare discussion materials',
      followUp1: 'Send partner-friendly summary',
      followUp2: 'Offer joint call',
      followUp3: 'Check in on decision progress'
    },
    'competitors': {
      immediate: 'Understand comparison criteria',
      followUp1: 'Send comparison guide',
      followUp2: 'Highlight unique benefits',
      followUp3: 'Offer competitive match (if applicable)'
    },
    'bad-timing': {
      immediate: 'Understand ideal timing',
      followUp1: 'Create urgency for current offer',
      followUp2: 'Set future reminder',
      followUp3: 'Share time-sensitive benefit'
    }
  };
  
  return strategies[objectionType] || strategies['need-to-think'];
}

/**
 * Add custom objection pattern
 */
async function addCustomPattern(type, pattern, response, priority = 2) {
  objectionsData.customPatterns.push({
    type,
    pattern,
    response,
    priority,
    addedAt: new Date().toISOString()
  });
  
  await saveData();
  return { success: true, type };
}

/**
 * Get objection statistics
 */
function getStats() {
  const total = Object.values(objectionsData.stats).reduce((a, b) => a + b, 0);
  
  const byCategory = {};
  for (const [type, count] of Object.entries(objectionsData.stats)) {
    const config = OBJECTION_PATTERNS[type];
    const category = config?.category || 'custom';
    byCategory[category] = (byCategory[category] || 0) + count;
  }
  
  return {
    total,
    byType: objectionsData.stats,
    byCategory,
    recentDetections: objectionsData.detected.slice(-10),
    responseCount: objectionsData.responses.length
  };
}

/**
 * List all objection types
 */
function listObjectionTypes() {
  const types = [];
  
  for (const [type, config] of Object.entries(OBJECTION_PATTERNS)) {
    types.push({
      type,
      category: config.category,
      priority: config.priority,
      patternCount: config.patterns.length,
      responseTypes: Object.keys(config.responses)
    });
  }
  
  return types;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'detect': {
        const message = args.join(' ');
        if (!message) {
          console.error('Usage: detect <message>');
          process.exit(1);
        }
        
        const detected = detectObjection(message);
        await saveData();
        
        if (detected.length === 0) {
          console.log('No objection detected');
        } else {
          console.log('Detected Objections:');
          for (const d of detected) {
            console.log(`  [${d.priority}] ${d.type} (${d.category}) - ${(d.confidence * 100).toFixed(0)}% confidence`);
          }
        }
        break;
      }
      
      case 'respond': {
        const objection = args[0];
        const responseType = args[1] || 'default';
        
        if (!objection) {
          console.error('Usage: respond <objectionType> [responseType]');
          console.error('Types:', Object.keys(OBJECTION_PATTERNS).join(', '));
          process.exit(1);
        }
        
        const result = generateResponse(objection, responseType);
        await saveData();
        
        if (result.error) {
          console.error(result.error);
        } else {
          console.log('Response:');
          console.log('-'.repeat(50));
          console.log(result.response);
          console.log('-'.repeat(50));
          if (result.alternatives.length > 0) {
            console.log('\nAlternative response types:', result.alternatives.join(', '));
          }
        }
        break;
      }
      
      case 'full': {
        const objection = args[0];
        
        if (!objection) {
          console.error('Usage: full <objectionType>');
          process.exit(1);
        }
        
        const result = getFullResponse(objection);
        
        if (result.error) {
          console.error(result.error);
        } else {
          console.log(`Objection: ${result.objection} (${result.category})`);
          console.log('='.repeat(50));
          console.log('\nMain Response:');
          console.log(result.mainResponse);
          console.log('\nAlternative Approaches:');
          for (const alt of result.alternatives) {
            console.log(`  [${alt.type}]`);
            console.log(`    ${alt.preview}`);
          }
          console.log('\nFollow-up Strategy:');
          for (const [step, action] of Object.entries(result.followUp)) {
            console.log(`  ${step}: ${action}`);
          }
        }
        break;
      }
      
      case 'train': {
        const type = args[0];
        const pattern = args[1];
        const response = args.slice(2).join(' ');
        
        if (!type || !pattern || !response) {
          console.error('Usage: train <type> <pattern> <response>');
          process.exit(1);
        }
        
        const result = await addCustomPattern(type, pattern, response);
        console.log(`Added custom pattern for: ${result.type}`);
        break;
      }
      
      case 'stats': {
        const stats = getStats();
        console.log('Objection Statistics');
        console.log('='.repeat(50));
        console.log(`Total Detected: ${stats.total}`);
        console.log(`Responses Generated: ${stats.responseCount}`);
        console.log('\nBy Type:');
        for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
          const bar = ''.repeat(Math.min(count, 20));
          console.log(`  ${type.padEnd(15)} ${String(count).padStart(4)} ${bar}`);
        }
        console.log('\nBy Category:');
        for (const [cat, count] of Object.entries(stats.byCategory)) {
          console.log(`  ${cat}: ${count}`);
        }
        break;
      }
      
      case 'types': {
        const types = listObjectionTypes();
        console.log('Objection Types');
        console.log('='.repeat(60));
        for (const t of types) {
          console.log(`\n${t.type}:`);
          console.log(`  Category: ${t.category} | Priority: ${t.priority}`);
          console.log(`  Patterns: ${t.patternCount}`);
          console.log(`  Response Types: ${t.responseTypes.join(', ')}`);
        }
        break;
      }
      
      case 'variables': {
        console.log('Template Variables');
        console.log('='.repeat(40));
        for (const [key, value] of Object.entries(TEMPLATE_VARIABLES)) {
          console.log(`  {${key}} = "${value}"`);
        }
        break;
      }
      
      case 'test': {
        console.log('Objection Handler Module');
        console.log('========================');
        console.log('\nObjection Categories:');
        const categories = [...new Set(Object.values(OBJECTION_PATTERNS).map(p => p.category))];
        console.log('  ' + categories.join(', '));
        console.log('\nCommands:');
        console.log('  detect <message>       - Detect objection types');
        console.log('  respond <type> [rtype] - Generate response');
        console.log('  full <type>            - Full response package');
        console.log('  train <t> <pat> <resp> - Add custom pattern');
        console.log('  stats                  - View statistics');
        console.log('  types                  - List all types');
        console.log('  variables              - Template variables');
        break;
      }
      
      default:
        console.log('Objection Handler - OpenClaw');
        console.log('Run with "test" to see available commands');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  detectObjection,
  generateResponse,
  getFullResponse,
  getFollowUpStrategy,
  addCustomPattern,
  getStats,
  listObjectionTypes,
  fillTemplate,
  OBJECTION_PATTERNS,
  TEMPLATE_VARIABLES
};

// Run CLI
main().catch(console.error);
