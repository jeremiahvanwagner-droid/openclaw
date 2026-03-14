#!/usr/bin/env node
/**
 * OpenClaw Proposal Generator Agent
 * 
 * Sales Division - Professional proposal creation
 * 
 * Features:
 *   - Proposal templates
 *   - Section generators
 *   - Pricing tables
 *   - Terms and conditions
 *   - Follow-up sequences
 *   - Contract essentials
 * 
 * Usage: node proposal-generator.mjs <command> [args...]
 * 
 * Commands:
 *   create <type>            Generate proposal structure
 *   sections <proposal>      Generate proposal sections
 *   pricing <offer>          Create pricing table
 *   terms <type>             Generate terms and conditions
 *   followup <stage>         Create follow-up sequence
 *   contract <type>          Generate contract template
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const PROPOSAL_FILE = path.join(DATA_DIR, 'proposal-generator-data.json');

// Proposal types
const PROPOSAL_TYPES = {
  consulting: {
    name: 'Consulting Proposal',
    sections: ['Executive Summary', 'Situation Analysis', 'Proposed Solution', 'Deliverables', 'Timeline', 'Investment', 'Terms'],
    tone: 'Professional',
    length: 'Medium (5-10 pages)'
  },
  service: {
    name: 'Service Proposal',
    sections: ['Overview', 'Services Offered', 'Scope of Work', 'Pricing', 'Timeline', 'Terms'],
    tone: 'Clear and direct',
    length: 'Short (3-5 pages)'
  },
  project: {
    name: 'Project Proposal',
    sections: ['Project Overview', 'Objectives', 'Approach', 'Deliverables', 'Timeline', 'Budget', 'Team'],
    tone: 'Detail-oriented',
    length: 'Medium (5-8 pages)'
  },
  retainer: {
    name: 'Retainer Proposal',
    sections: ['Partnership Overview', 'Services Included', 'Monthly Scope', 'Pricing', 'Terms', 'Exclusivity'],
    tone: 'Partnership-focused',
    length: 'Short (3-5 pages)'
  },
  productized: {
    name: 'Productized Service',
    sections: ['Package Overview', 'What\'s Included', 'What\'s Not Included', 'Investment', 'Process', 'FAQ'],
    tone: 'Product-like clarity',
    length: 'Short (2-4 pages)'
  }
};

// Section templates
const SECTION_TEMPLATES = {
  executiveSummary: {
    name: 'Executive Summary',
    elements: ['Problem overview', 'Proposed solution', 'Expected outcomes', 'Investment range'],
    length: '1 page max',
    purpose: 'Quick overview for decision makers'
  },
  situationAnalysis: {
    name: 'Situation Analysis',
    elements: ['Current state', 'Challenges', 'Opportunities', 'Risks of inaction'],
    length: '1-2 pages',
    purpose: 'Show you understand their situation'
  },
  proposedSolution: {
    name: 'Proposed Solution',
    elements: ['Approach overview', 'Methodology', 'Key activities', 'Why this approach'],
    length: '2-3 pages',
    purpose: 'Present your solution clearly'
  },
  deliverables: {
    name: 'Deliverables',
    elements: ['List of deliverables', 'Format/specifications', 'Ownership', 'Revisions included'],
    length: '1 page',
    purpose: 'Set clear expectations'
  },
  timeline: {
    name: 'Timeline',
    elements: ['Phases/milestones', 'Dates', 'Dependencies', 'Client responsibilities'],
    length: '1 page',
    purpose: 'Show the path forward'
  },
  investment: {
    name: 'Investment',
    elements: ['Pricing options', 'What\'s included', 'Payment terms', 'Guarantee'],
    length: '1 page',
    purpose: 'Present the investment'
  }
};

// Pricing frameworks
const PRICING_FRAMEWORKS = {
  tiered: {
    name: 'Good-Better-Best',
    structure: ['Basic option', 'Recommended option', 'Premium option'],
    psychology: 'Anchoring + choice architecture',
    bestFor: 'Medium-ticket services'
  },
  single: {
    name: 'Single Option',
    structure: ['One clear offer'],
    psychology: 'Simplicity, no confusion',
    bestFor: 'High-ticket, productized services'
  },
  modular: {
    name: 'Modular Pricing',
    structure: ['Base price', 'Add-ons', 'Optional services'],
    psychology: 'Customization + control',
    bestFor: 'Complex projects'
  },
  value: {
    name: 'Value-Based',
    structure: ['Investment', 'Expected ROI', 'Guarantee'],
    psychology: 'Frame as investment not cost',
    bestFor: 'High-value outcomes'
  }
};

// Data storage
let proposalData = {
  proposals: [],
  templates: [],
  contracts: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(PROPOSAL_FILE, 'utf8');
    proposalData = JSON.parse(data);
  } catch {
    proposalData = { proposals: [], templates: [], contracts: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(PROPOSAL_FILE, JSON.stringify(proposalData, null, 2));
}

/**
 * Create proposal structure
 */
async function createProposal(type, options = {}) {
  const proposalType = PROPOSAL_TYPES[type] || PROPOSAL_TYPES.service;
  const clientName = options.clientName || '[Client Name]';
  const projectName = options.projectName || '[Project Name]';
  
  const proposal = {
    id: `proposal-${Date.now()}`,
    type,
    config: proposalType,
    client: clientName,
    project: projectName,
    sections: [],
    metadata: {}
  };
  
  // Generate sections
  proposal.sections = proposalType.sections.map((section, index) => ({
    order: index + 1,
    name: section,
    status: 'draft',
    content: `[${section} content here]`,
    notes: SECTION_TEMPLATES[section.toLowerCase().replace(/\s+/g, '')] || {}
  }));
  
  // Cover page
  proposal.coverPage = {
    title: projectName,
    subtitle: 'Proposal',
    client: clientName,
    preparedBy: '[Your Name/Company]',
    date: new Date().toLocaleDateString(),
    confidential: true
  };
  
  // Metadata
  proposal.metadata = {
    createdAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    version: '1.0',
    status: 'draft'
  };
  
  proposalData.proposals.push(proposal);
  await saveData();
  
  return proposal;
}

/**
 * Generate proposal sections
 */
async function generateSections(proposalType, options = {}) {
  const type = PROPOSAL_TYPES[proposalType] || PROPOSAL_TYPES.service;
  
  const sections = {
    id: `sections-${Date.now()}`,
    proposalType,
    generated: []
  };
  
  // Executive Summary
  sections.generated.push({
    name: 'Executive Summary',
    template: `
## Executive Summary

[Client Name] is facing [primary challenge]. This has resulted in [negative impact].

We propose [solution overview] which will deliver [expected outcomes].

The investment for this engagement is [price range], with [timeline] for completion.

This proposal is valid until [date]. We recommend scheduling a call to discuss next steps.
`.trim()
  });
  
  // Situation Analysis
  sections.generated.push({
    name: 'Situation Analysis',
    template: `
## Current Situation

### Overview
[Client Name] currently [current situation]. Key challenges include:

- [Challenge 1]
- [Challenge 2]
- [Challenge 3]

### Impact
If left unaddressed, these challenges could result in:

- [Negative outcome 1]
- [Negative outcome 2]

### Opportunity
By addressing these challenges, [Client Name] can expect:

- [Positive outcome 1]
- [Positive outcome 2]
`.trim()
  });
  
  // Proposed Solution
  sections.generated.push({
    name: 'Proposed Solution',
    template: `
## Proposed Solution

### Our Approach
We will [approach overview] using our proven [methodology name].

### Key Activities
1. **Phase 1: [Name]** - [Description]
2. **Phase 2: [Name]** - [Description]
3. **Phase 3: [Name]** - [Description]

### Why This Approach
This methodology has been proven with [X] clients and delivers [specific results].
`.trim()
  });
  
  // Investment
  sections.generated.push({
    name: 'Investment',
    template: `
## Investment

### Option 1: [Name] - $[Price]
- [Included item 1]
- [Included item 2]
- [Included item 3]

### Option 2: [Name] - $[Price] (Recommended)
Everything in Option 1, plus:
- [Additional item 1]
- [Additional item 2]

### Payment Terms
- 50% upon agreement
- 50% upon completion

### Guarantee
[Your guarantee here]
`.trim()
  });
  
  sections.generatedAt = new Date().toISOString();
  
  return sections;
}

/**
 * Create pricing table
 */
async function createPricingTable(offer, options = {}) {
  const framework = options.framework || 'tiered';
  const basePrice = options.basePrice || 2500;
  
  const pricing = {
    id: `pricing-${Date.now()}`,
    offer,
    framework,
    options: [],
    presentation: {}
  };
  
  if (framework === 'tiered') {
    pricing.options = [
      {
        name: 'Essential',
        price: basePrice,
        recommended: false,
        features: [
          { name: 'Core deliverable', included: true },
          { name: 'Basic support', included: true },
          { name: 'Premium features', included: false },
          { name: 'Priority access', included: false }
        ],
        bestFor: 'Those who want the basics'
      },
      {
        name: 'Professional',
        price: basePrice * 2,
        recommended: true,
        features: [
          { name: 'Core deliverable', included: true },
          { name: 'Basic support', included: true },
          { name: 'Premium features', included: true },
          { name: 'Priority access', included: false }
        ],
        bestFor: 'Most popular choice'
      },
      {
        name: 'Enterprise',
        price: basePrice * 4,
        recommended: false,
        features: [
          { name: 'Core deliverable', included: true },
          { name: 'Basic support', included: true },
          { name: 'Premium features', included: true },
          { name: 'Priority access', included: true }
        ],
        bestFor: 'Maximum results'
      }
    ];
  } else {
    pricing.options = [{
      name: offer,
      price: basePrice,
      recommended: true,
      features: [
        { name: 'Everything included', included: true }
      ],
      bestFor: 'Complete solution'
    }];
  }
  
  // Presentation tips
  pricing.presentation = {
    anchor: 'Show highest price first for anchoring',
    highlight: 'Visually emphasize recommended option',
    value: 'Focus on value, not cost',
    comparison: 'Show what they\'d pay separately'
  };
  
  pricing.generatedAt = new Date().toISOString();
  
  return pricing;
}

/**
 * Generate terms and conditions
 */
async function generateTerms(type, options = {}) {
  const terms = {
    id: `terms-${Date.now()}`,
    type,
    sections: []
  };
  
  // Standard sections
  terms.sections = [
    {
      name: 'Scope of Work',
      content: 'This agreement covers the services outlined in the proposal. Additional services may be provided under separate agreement.',
      important: true
    },
    {
      name: 'Payment Terms',
      content: '[X]% due upon signing, [Y]% due upon [milestone/completion]. Late payments subject to [X]% monthly fee.',
      important: true
    },
    {
      name: 'Timeline',
      content: 'Project timeline begins upon receipt of initial payment and required materials from Client.',
      important: true
    },
    {
      name: 'Revisions',
      content: '[X] rounds of revisions included. Additional revisions billed at $[X]/hour.',
      important: false
    },
    {
      name: 'Intellectual Property',
      content: 'Upon full payment, Client owns all deliverables. Provider retains right to show work in portfolio.',
      important: true
    },
    {
      name: 'Confidentiality',
      content: 'Both parties agree to keep confidential information private.',
      important: true
    },
    {
      name: 'Termination',
      content: 'Either party may terminate with [X] days written notice. Work completed to date will be billed.',
      important: true
    },
    {
      name: 'Limitation of Liability',
      content: 'Provider\'s liability limited to fees paid under this agreement.',
      important: true
    }
  ];
  
  // Add disclaimer
  terms.disclaimer = 'This is a template. Consult a legal professional for your specific needs.';
  
  terms.generatedAt = new Date().toISOString();
  
  return terms;
}

/**
 * Create follow-up sequence
 */
async function createFollowUp(stage, options = {}) {
  const followUp = {
    id: `followup-${Date.now()}`,
    stage,
    sequence: []
  };
  
  // Follow-up sequence based on stage
  switch (stage) {
    case 'sent':
      followUp.sequence = [
        {
          day: 0,
          action: 'Send proposal with personal note',
          template: 'Subject: [Project] Proposal Attached\n\n[Personal message about conversation] + Proposal attached.',
          channel: 'Email'
        },
        {
          day: 2,
          action: 'Quick check-in',
          template: 'Subject: Quick question about the proposal\n\nJust wanted to check if you received the proposal and if any questions came up.',
          channel: 'Email'
        },
        {
          day: 5,
          action: 'Add value follow-up',
          template: 'Subject: Thought this might help\n\n[Share relevant resource] + Ask if they\'ve had time to review.',
          channel: 'Email'
        },
        {
          day: 7,
          action: 'Phone/Video call',
          template: 'Call to discuss any questions and next steps.',
          channel: 'Phone'
        }
      ];
      break;
      
    case 'negotiating':
      followUp.sequence = [
        {
          day: 0,
          action: 'Address concerns',
          template: 'Thanks for sharing your thoughts. Here\'s how we can address [concern]...',
          channel: 'Email'
        },
        {
          day: 1,
          action: 'Provide alternatives',
          template: 'Based on our conversation, here are some options...',
          channel: 'Email'
        }
      ];
      break;
      
    default:
      followUp.sequence = [
        {
          day: 0,
          action: 'Initial outreach',
          template: 'Customize based on stage',
          channel: 'Email'
        }
      ];
  }
  
  // Best practices
  followUp.bestPractices = [
    'Always add value in follow-ups, not just "checking in"',
    'Vary channels (email, phone, video)',
    'Reference previous conversations',
    'Know when to move on (after 4-5 attempts)'
  ];
  
  followUp.generatedAt = new Date().toISOString();
  
  return followUp;
}

/**
 * Generate contract template
 */
async function generateContract(type, options = {}) {
  const contract = {
    id: `contract-${Date.now()}`,
    type,
    clauses: [],
    signatures: {}
  };
  
  // Contract clauses
  contract.clauses = [
    {
      name: 'Parties',
      content: 'This agreement is between [Provider] and [Client].',
      required: true
    },
    {
      name: 'Services',
      content: 'Provider agrees to deliver: [List of services/deliverables]',
      required: true
    },
    {
      name: 'Compensation',
      content: 'Client agrees to pay [Amount] according to [Payment Schedule].',
      required: true
    },
    {
      name: 'Term',
      content: 'This agreement begins on [Date] and continues until [completion/date].',
      required: true
    },
    {
      name: 'Ownership',
      content: 'Upon full payment, all deliverables become property of Client.',
      required: true
    },
    {
      name: 'Warranties',
      content: 'Provider warrants deliverables will meet specifications outlined.',
      required: false
    },
    {
      name: 'Liability',
      content: 'Provider liability limited to total fees paid.',
      required: true
    },
    {
      name: 'Termination',
      content: 'Either party may terminate with [X] days notice.',
      required: true
    }
  ];
  
  // Signature section
  contract.signatures = {
    provider: {
      name: '[Provider Name]',
      signature: '_________________',
      date: '_________________'
    },
    client: {
      name: '[Client Name]',
      signature: '_________________',
      date: '_________________'
    }
  };
  
  contract.disclaimer = 'Template only. Have a lawyer review before use.';
  contract.generatedAt = new Date().toISOString();
  
  proposalData.contracts.push(contract);
  await saveData();
  
  return contract;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'create': {
        const type = args[0] || 'service';
        const proposal = await createProposal(type);
        
        console.log('Proposal Created');
        console.log('='.repeat(50));
        console.log(`Type: ${proposal.config.name}`);
        console.log(`Sections: ${proposal.sections.length}`);
        console.log(`Valid until: ${proposal.metadata.validUntil.split('T')[0]}`);
        break;
      }
      
      case 'sections': {
        const type = args[0] || 'service';
        const sections = await generateSections(type);
        
        console.log('Generated Sections');
        console.log('='.repeat(50));
        for (const section of sections.generated) {
          console.log(`\n${section.name}:`);
          console.log(section.template.substring(0, 150) + '...');
        }
        break;
      }
      
      case 'pricing': {
        const offer = args.join(' ') || 'Service Package';
        const pricing = await createPricingTable(offer);
        
        console.log('Pricing Table');
        console.log('='.repeat(50));
        for (const option of pricing.options) {
          console.log(`\n${option.name}: $${option.price}${option.recommended ? ' (Recommended)' : ''}`);
        }
        break;
      }
      
      case 'terms': {
        const type = args[0] || 'standard';
        const terms = await generateTerms(type);
        
        console.log('Terms & Conditions');
        console.log('='.repeat(50));
        for (const section of terms.sections.slice(0, 4)) {
          console.log(`\n${section.name}:`);
          console.log(`  ${section.content.substring(0, 80)}...`);
        }
        break;
      }
      
      case 'followup': {
        const stage = args[0] || 'sent';
        const followUp = await createFollowUp(stage);
        
        console.log('Follow-Up Sequence');
        console.log('='.repeat(50));
        for (const step of followUp.sequence) {
          console.log(`  Day ${step.day}: ${step.action}`);
        }
        break;
      }
      
      case 'contract': {
        const type = args[0] || 'service';
        const contract = await generateContract(type);
        
        console.log('Contract Template');
        console.log('='.repeat(50));
        console.log(`Clauses: ${contract.clauses.length}`);
        for (const clause of contract.clauses.slice(0, 4)) {
          console.log(`  - ${clause.name}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Proposal Generator Module');
        console.log('=========================');
        console.log(`Proposal types: ${Object.keys(PROPOSAL_TYPES).length}`);
        console.log(`Section templates: ${Object.keys(SECTION_TEMPLATES).length}`);
        console.log(`Pricing frameworks: ${Object.keys(PRICING_FRAMEWORKS).length}`);
        console.log(`Saved proposals: ${proposalData.proposals.length}`);
        break;
      }
      
      default:
        console.log('Proposal Generator - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  createProposal,
  generateSections,
  createPricingTable,
  generateTerms,
  createFollowUp,
  generateContract,
  PROPOSAL_TYPES,
  SECTION_TEMPLATES,
  PRICING_FRAMEWORKS
};

// Run CLI
main().catch(console.error);
