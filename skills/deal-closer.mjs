#!/usr/bin/env node
/**
 * OpenClaw Deal Closer Agent
 * 
 * Sales Division - Closing strategies and objection handling
 * 
 * Features:
 *   - Closing techniques
 *   - Objection handling
 *   - Follow-up sequences
 *   - Negotiation tactics
 *   - Deal acceleration
 *   - Lost deal recovery
 * 
 * Usage: node deal-closer.mjs <command> [args...]
 * 
 * Commands:
 *   close <technique>        Get closing techniques
 *   objection <type>         Handle common objections
 *   followup <stage>         Generate follow-up sequence
 *   negotiate <scenario>     Get negotiation tactics
 *   accelerate <deal>        Accelerate deal timeline
 *   recover <reason>         Recover lost deals
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const CLOSER_FILE = path.join(DATA_DIR, 'deal-closer-data.json');

// Closing techniques
const CLOSING_TECHNIQUES = {
  assumptive: {
    name: 'Assumptive Close',
    description: 'Assume the sale and discuss next steps',
    example: 'So shall we get you started with the Pro plan, or would Enterprise better fit your needs?',
    bestFor: 'Warm prospects who have shown buying signals',
    risk: 'Low'
  },
  summary: {
    name: 'Summary Close',
    description: 'Summarize all benefits before asking',
    example: 'So you\'re getting [benefit 1], [benefit 2], and [benefit 3], all for [price]. Ready to move forward?',
    bestFor: 'Complex deals with many features',
    risk: 'Low'
  },
  urgency: {
    name: 'Urgency Close',
    description: 'Create legitimate time pressure',
    example: 'The current pricing is only available until Friday. Should we lock this in for you today?',
    bestFor: 'Prospects who need a push',
    risk: 'Medium - must be genuine'
  },
  alternative: {
    name: 'Alternative Close',
    description: 'Give two positive options',
    example: 'Would you prefer to start this month or next month?',
    bestFor: 'Reducing decision fatigue',
    risk: 'Low'
  },
  question: {
    name: 'Question Close',
    description: 'Ask clarifying questions that lead to yes',
    example: 'Is there anything else you need to know before we get started?',
    bestFor: 'Uncovering hidden objections',
    risk: 'Low'
  },
  puppy: {
    name: 'Puppy Dog Close',
    description: 'Let them try before buying',
    example: 'Why don\'t you try it for 14 days, and if it\'s not right, no obligation.',
    bestFor: 'Risk-averse prospects',
    risk: 'Low'
  },
  takeaway: {
    name: 'Takeaway Close',
    description: 'Suggest maybe it\'s not right for them',
    example: 'Actually, I\'m not sure this is the right fit for you right now...',
    bestFor: 'Creating scarcity/desire',
    risk: 'High - use carefully'
  },
  silence: {
    name: 'Silent Close',
    description: 'After presenting price, stay silent',
    example: 'The investment is $5,000. [silence]',
    bestFor: 'Letting prospects process',
    risk: 'Low'
  }
};

// Common objections and responses
const OBJECTION_HANDLERS = {
  price: {
    objection: 'It\'s too expensive',
    responses: [
      {
        name: 'Reframe to value',
        script: 'I understand. Let me ask - what would it be worth to you to [achieve desired outcome]?'
      },
      {
        name: 'Break it down',
        script: 'When you break it down, it\'s just [$/day or week]. Is [outcome] worth [small amount] a day?'
      },
      {
        name: 'Cost of inaction',
        script: 'I hear you. What\'s it costing you right now to NOT solve this problem?'
      },
      {
        name: 'Comparison',
        script: 'Compared to [alternative], this actually saves you [amount] over [time period].'
      }
    ]
  },
  time: {
    objection: 'I need to think about it',
    responses: [
      {
        name: 'Isolate the concern',
        script: 'Of course. What specifically would you like to think through? Maybe I can help.'
      },
      {
        name: 'Set a follow-up',
        script: 'Absolutely. When would be a good time for me to follow up? I want to make sure you have everything you need.'
      },
      {
        name: 'Address real concern',
        script: 'That makes sense. Usually when someone says that, there\'s a specific concern. What\'s yours?'
      }
    ]
  },
  spouse: {
    objection: 'I need to talk to my spouse/partner',
    responses: [
      {
        name: 'Include them',
        script: 'Absolutely - they should be part of this decision. Can we schedule a call together?'
      },
      {
        name: 'Arm them with info',
        script: 'Of course. What questions do you think they\'ll have? I can help you prepare.'
      },
      {
        name: 'Understand concern',
        script: 'That makes sense. What aspects do you think will be most important to them?'
      }
    ]
  },
  competitor: {
    objection: 'I\'m looking at other options',
    responses: [
      {
        name: 'Understand criteria',
        script: 'That\'s smart. What criteria are you using to evaluate your options?'
      },
      {
        name: 'Differentiate',
        script: 'What specifically appeals to you about the other options? I can help compare.'
      },
      {
        name: 'Acknowledge and position',
        script: '[Competitor] is good at [X]. Where we excel is [Y]. Which is more important to you?'
      }
    ]
  },
  trust: {
    objection: 'I\'m not sure this will work for me',
    responses: [
      {
        name: 'Social proof',
        script: 'I understand. Let me share how [similar person] had the same concern and [result].'
      },
      {
        name: 'Guarantee',
        script: 'That\'s exactly why we offer [guarantee]. You have nothing to lose.'
      },
      {
        name: 'Identify specifics',
        script: 'What specifically are you concerned won\'t work? Let\'s address that.'
      }
    ]
  },
  notReady: {
    objection: 'Not the right time',
    responses: [
      {
        name: 'Understand timing',
        script: 'When would be the right time? What needs to happen first?'
      },
      {
        name: 'Cost of waiting',
        script: 'I hear you. What\'s the cost of waiting another [time period] to solve this?'
      },
      {
        name: 'Make it easy to start',
        script: 'What if we started small and scaled up when timing is better?'
      }
    ]
  }
};

// Follow-up stages
const FOLLOW_UP_STAGES = {
  postDemo: {
    name: 'Post-Demo Follow-up',
    sequence: [
      { day: 0, action: 'Send recap email with key points discussed' },
      { day: 1, action: 'Share relevant case study or resource' },
      { day: 3, action: 'Check if any questions came up' },
      { day: 5, action: 'Share additional value/content' },
      { day: 7, action: 'Direct ask about decision timeline' }
    ]
  },
  postProposal: {
    name: 'Post-Proposal Follow-up',
    sequence: [
      { day: 0, action: 'Confirm receipt, offer to walk through' },
      { day: 2, action: 'Check for questions' },
      { day: 4, action: 'Share testimonial/case study' },
      { day: 7, action: 'Phone call to discuss' },
      { day: 10, action: 'Set deadline if applicable' }
    ]
  },
  ghosted: {
    name: 'Ghosted Lead Recovery',
    sequence: [
      { day: 0, action: 'Acknowledge they\'re busy' },
      { day: 3, action: 'Share relevant content' },
      { day: 7, action: '"Is this still a priority?" email' },
      { day: 14, action: '"Should I close your file?" email' },
      { day: 30, action: 'Breakup email - permission to close' }
    ]
  }
};

// Negotiation tactics
const NEGOTIATION_TACTICS = {
  anchoring: {
    name: 'Anchoring',
    description: 'Set high initial expectation',
    howTo: 'Present premium option first, or compare to higher-priced alternatives',
    example: 'Our enterprise clients pay $50k/year. For your needs, we can do this for $15k.'
  },
  bundling: {
    name: 'Bundling',
    description: 'Add value rather than dropping price',
    howTo: 'If they want discount, add bonus instead',
    example: 'I can\'t drop the price, but I CAN include [bonus] worth $X.'
  },
  splitting: {
    name: 'Split the Difference',
    description: 'Meet in the middle',
    howTo: 'Use when stuck and both parties flexible',
    example: 'You\'re at $X, I\'m at $Y. What if we met at $Z?'
  },
  walkAway: {
    name: 'Walk Away Power',
    description: 'Be willing to lose the deal',
    howTo: 'Know your bottom line and stick to it',
    example: 'I appreciate the conversation, but I can\'t go below $X and maintain quality.'
  },
  terms: {
    name: 'Adjust Terms',
    description: 'Keep price, modify terms',
    howTo: 'Keep the price, change payment schedule',
    example: 'The investment stays at $X, but we can break it into 3 monthly payments.'
  }
};

// Data storage
let closerData = {
  deals: [],
  objections: [],
  wins: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(CLOSER_FILE, 'utf8');
    closerData = JSON.parse(data);
  } catch {
    closerData = { deals: [], objections: [], wins: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(CLOSER_FILE, JSON.stringify(closerData, null, 2));
}

/**
 * Get closing techniques
 */
async function getClosingTechniques(technique, options = {}) {
  const result = {
    id: `close-${Date.now()}`,
    requested: technique,
    techniques: []
  };
  
  if (technique && CLOSING_TECHNIQUES[technique]) {
    result.techniques = [CLOSING_TECHNIQUES[technique]];
  } else {
    result.techniques = Object.values(CLOSING_TECHNIQUES);
  }
  
  // Add usage tips
  result.tips = [
    'Read buying signals before closing',
    'Only use techniques appropriate for the prospect',
    'Be genuine - manipulative tactics backfire',
    'Always follow up regardless of outcome',
    'Track what works for your audience'
  ];
  
  result.generatedAt = new Date().toISOString();
  
  return result;
}

/**
 * Handle objections
 */
async function handleObjection(objectionType, options = {}) {
  const handler = OBJECTION_HANDLERS[objectionType];
  
  const result = {
    id: `objection-${Date.now()}`,
    type: objectionType,
    handler: handler || null,
    generalTips: {}
  };
  
  if (!handler) {
    result.handler = {
      objection: 'Unknown objection',
      responses: [
        {
          name: 'Clarify',
          script: 'Help me understand what you mean by that...'
        },
        {
          name: 'Empathize',
          script: 'I completely understand that concern. Many of our clients felt the same way before...'
        }
      ]
    };
  }
  
  // General objection handling framework
  result.generalTips = {
    framework: 'LAER - Listen, Acknowledge, Explore, Respond',
    listen: 'Let them finish completely',
    acknowledge: 'Show you understand their concern',
    explore: 'Ask questions to understand the real concern',
    respond: 'Address the specific concern directly'
  };
  
  // Log objection
  closerData.objections.push({
    type: objectionType,
    timestamp: new Date().toISOString()
  });
  await saveData();
  
  result.generatedAt = new Date().toISOString();
  
  return result;
}

/**
 * Generate follow-up sequence
 */
async function generateFollowUp(stage, options = {}) {
  const stageConfig = FOLLOW_UP_STAGES[stage] || FOLLOW_UP_STAGES.postDemo;
  
  const result = {
    id: `followup-${Date.now()}`,
    stage,
    config: stageConfig,
    templates: []
  };
  
  // Generate email templates
  result.templates = stageConfig.sequence.map((step, index) => ({
    order: index + 1,
    day: step.day,
    action: step.action,
    subjectLine: generateSubjectLine(step, index),
    brief: 'Keep it short and action-oriented'
  }));
  
  result.bestPractices = [
    'Add value in every touch, not just "checking in"',
    'Vary your channel (email, phone, LinkedIn)',
    'Reference previous conversations',
    'Be persistent but respectful',
    'Know when to move on (after 5-7 attempts)'
  ];
  
  result.generatedAt = new Date().toISOString();
  
  return result;
}

/**
 * Generate subject line helper
 */
function generateSubjectLine(step, index) {
  const subjects = [
    'Re: Our conversation',
    'Thought this might help',
    'Quick question',
    'Following up',
    'Next steps?',
    'Before I close your file...'
  ];
  return subjects[index % subjects.length];
}

/**
 * Get negotiation tactics
 */
async function getNegotiationTactics(scenario, options = {}) {
  const result = {
    id: `negotiate-${Date.now()}`,
    scenario,
    tactics: [],
    guidelines: {}
  };
  
  if (scenario && NEGOTIATION_TACTICS[scenario]) {
    result.tactics = [NEGOTIATION_TACTICS[scenario]];
  } else {
    result.tactics = Object.values(NEGOTIATION_TACTICS);
  }
  
  result.guidelines = {
    preparation: [
      'Know your BATNA (Best Alternative)',
      'Know their likely BATNA',
      'Set your walk-away point',
      'Research their situation'
    ],
    during: [
      'Listen more than you talk',
      'Ask questions to understand their needs',
      'Focus on interests, not positions',
      'Look for win-win solutions'
    ],
    rules: [
      'Never negotiate against yourself',
      'Get something for everything you give',
      'Document agreements in writing',
      'Know when to walk away'
    ]
  };
  
  result.generatedAt = new Date().toISOString();
  
  return result;
}

/**
 * Accelerate deal timeline
 */
async function accelerateDeal(deal, options = {}) {
  const acceleration = {
    id: `accelerate-${Date.now()}`,
    deal,
    strategies: [],
    urgencyCreators: []
  };
  
  acceleration.strategies = [
    {
      name: 'Create deadline',
      description: 'Add legitimate time constraint',
      example: 'Pricing changes on [date]',
      ethics: 'Must be real'
    },
    {
      name: 'Reduce friction',
      description: 'Make it easier to say yes',
      example: 'Simplify contract, offer payment plan'
    },
    {
      name: 'Remove blockers',
      description: 'Proactively address concerns',
      example: 'Include implementation support'
    },
    {
      name: 'Executive alignment',
      description: 'Get decision-maker involved',
      example: 'Offer executive-to-executive call'
    },
    {
      name: 'Limited availability',
      description: 'Only X slots available',
      example: 'Only taking 5 new clients this month',
      ethics: 'Must be true'
    }
  ];
  
  acceleration.urgencyCreators = [
    'Upcoming price increase (must be real)',
    'Limited capacity/slots',
    'Bonus expiration',
    'Competitor movement',
    'Their own deadlines/goals'
  ];
  
  acceleration.generatedAt = new Date().toISOString();
  
  return acceleration;
}

/**
 * Recover lost deals
 */
async function recoverLostDeal(reason, options = {}) {
  const recovery = {
    id: `recover-${Date.now()}`,
    lostReason: reason,
    strategies: [],
    reEngagement: []
  };
  
  // Recovery strategies based on reason
  const strategies = {
    price: [
      'Wait for seasonal promotion to re-approach',
      'Offer modified scope at lower price',
      'Payment plan option',
      'Time-limited special offer'
    ],
    timing: [
      'Set calendar reminder for 30/60/90 days',
      'Keep nurturing with valuable content',
      'Re-engage when situation changes'
    ],
    competitor: [
      'Monitor for buyer\'s remorse (6 months)',
      'Stay connected on LinkedIn',
      'Send valuable content occasionally'
    ],
    noDecision: [
      'Breakup email to get response',
      'New angle or use case',
      'Share success story of similar client'
    ]
  };
  
  recovery.strategies = strategies[reason] || strategies.noDecision;
  
  recovery.reEngagement = {
    templates: [
      {
        name: 'Win-back email',
        subject: 'Are you still looking to [solve problem]?',
        timing: '90 days after lost'
      },
      {
        name: 'New offer email',
        subject: 'Something new I thought you\'d like',
        timing: 'When you have something new'
      },
      {
        name: 'Success story',
        subject: 'How [similar client] achieved [result]',
        timing: '60 days after lost'
      }
    ]
  };
  
  recovery.generatedAt = new Date().toISOString();
  
  return recovery;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'close': {
        const technique = args[0];
        const result = await getClosingTechniques(technique);
        
        console.log('Closing Techniques');
        console.log('='.repeat(50));
        for (const tech of result.techniques.slice(0, 3)) {
          console.log(`\n${tech.name}:`);
          console.log(`  "${tech.example}"`);
          console.log(`  Best for: ${tech.bestFor}`);
        }
        break;
      }
      
      case 'objection': {
        const type = args[0] || 'price';
        const result = await handleObjection(type);
        
        console.log('Objection Handler');
        console.log('='.repeat(50));
        if (result.handler) {
          console.log(`\nObjection: "${result.handler.objection}"`);
          console.log('\nResponses:');
          for (const resp of result.handler.responses.slice(0, 2)) {
            console.log(`  ${resp.name}: "${resp.script.substring(0, 60)}..."`);
          }
        }
        break;
      }
      
      case 'followup': {
        const stage = args[0] || 'postDemo';
        const result = await generateFollowUp(stage);
        
        console.log(`Follow-Up: ${result.config.name}`);
        console.log('='.repeat(50));
        for (const step of result.config.sequence) {
          console.log(`  Day ${step.day}: ${step.action}`);
        }
        break;
      }
      
      case 'negotiate': {
        const scenario = args[0];
        const result = await getNegotiationTactics(scenario);
        
        console.log('Negotiation Tactics');
        console.log('='.repeat(50));
        for (const tactic of result.tactics.slice(0, 3)) {
          console.log(`\n${tactic.name}: ${tactic.description}`);
        }
        break;
      }
      
      case 'accelerate': {
        const deal = args.join(' ') || 'Deal';
        const result = await accelerateDeal(deal);
        
        console.log('Deal Acceleration');
        console.log('='.repeat(50));
        for (const strategy of result.strategies.slice(0, 3)) {
          console.log(`  - ${strategy.name}: ${strategy.description}`);
        }
        break;
      }
      
      case 'recover': {
        const reason = args[0] || 'noDecision';
        const result = await recoverLostDeal(reason);
        
        console.log('Lost Deal Recovery');
        console.log('='.repeat(50));
        console.log(`Lost reason: ${result.lostReason}`);
        console.log('\nStrategies:');
        for (const strategy of result.strategies) {
          console.log(`  - ${strategy}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Deal Closer Module');
        console.log('==================');
        console.log(`Closing techniques: ${Object.keys(CLOSING_TECHNIQUES).length}`);
        console.log(`Objection handlers: ${Object.keys(OBJECTION_HANDLERS).length}`);
        console.log(`Follow-up stages: ${Object.keys(FOLLOW_UP_STAGES).length}`);
        console.log(`Negotiation tactics: ${Object.keys(NEGOTIATION_TACTICS).length}`);
        break;
      }
      
      default:
        console.log('Deal Closer - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  getClosingTechniques,
  handleObjection,
  generateFollowUp,
  getNegotiationTactics,
  accelerateDeal,
  recoverLostDeal,
  CLOSING_TECHNIQUES,
  OBJECTION_HANDLERS,
  FOLLOW_UP_STAGES,
  NEGOTIATION_TACTICS
};

// Run CLI
main().catch(console.error);
