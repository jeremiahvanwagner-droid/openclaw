#!/usr/bin/env node
/**
 * OpenClaw Testimonial Collector Agent
 * 
 * Sales Division - Testimonial collection and management
 * 
 * Features:
 *   - Testimonial request generation
 *   - Collection workflows
 *   - Testimonial optimization
 *   - Display strategies
 *   - Video testimonial scripts
 *   - Case study creation
 * 
 * Usage: node testimonial-collector.mjs <command> [args...]
 * 
 * Commands:
 *   request <type>           Generate testimonial request
 *   collect <product>        Create collection workflow
 *   optimize <text>          Optimize testimonial copy
 *   display <format>         Generate display format
 *   video <type>             Create video testimonial script
 *   casestudy <client>       Build case study template
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const TESTIMONIAL_FILE = path.join(DATA_DIR, 'testimonial-collector-data.json');

// Testimonial types
const TESTIMONIAL_TYPES = {
  text: {
    name: 'Written Testimonial',
    format: 'Quote with attribution',
    effort: 'Low',
    impact: 'Medium',
    useCase: 'Website, sales pages, emails'
  },
  video: {
    name: 'Video Testimonial',
    format: 'Customer on camera',
    effort: 'High',
    impact: 'Very High',
    useCase: 'Sales pages, VSLs, ads'
  },
  audio: {
    name: 'Audio Testimonial',
    format: 'Voice recording',
    effort: 'Medium',
    impact: 'High',
    useCase: 'Podcasts, audio sales letters'
  },
  screenshot: {
    name: 'Screenshot Testimonial',
    format: 'DM/email/comment screenshot',
    effort: 'Very Low',
    impact: 'High',
    useCase: 'Organic, authentic placement'
  },
  casestudy: {
    name: 'Case Study',
    format: 'Detailed transformation story',
    effort: 'High',
    impact: 'Very High',
    useCase: 'High-ticket sales, B2B'
  },
  data: {
    name: 'Results/Data',
    format: 'Metrics and statistics',
    effort: 'Medium',
    impact: 'High',
    useCase: 'Technical/analytical audiences'
  }
};

// Request templates
const REQUEST_TEMPLATES = {
  simple: {
    subject: 'Quick favor?',
    body: `Hey [name],

I hope you're enjoying [product]! 

I'm updating my website and would love to feature your experience. Would you mind sharing a few sentences about your results?

Just reply to this email with:
1. What was your biggest challenge before?
2. What results have you seen?
3. What would you tell someone thinking about joining?

No pressure at all - but it would really mean a lot!

Thanks,
[Your name]`
  },
  specific: {
    subject: 'Your [specific result] was amazing!',
    body: `Hey [name],

I saw that you [specific achievement/result] and I was blown away! 

Would you be open to sharing that story? I think it would really help others who are struggling with [problem].

I can keep it super simple - just 2-3 sentences about:
- Where you started
- What you did
- Where you are now

Let me know!

[Your name]`
  },
  video: {
    subject: 'Would you share your story on video?',
    body: `Hey [name],

Your transformation has been incredible to watch, and I think your story could really inspire others.

Would you be open to doing a quick video testimonial? It doesn't have to be fancy - just your phone is perfect.

I can send you some simple prompts to follow, and it only needs to be 1-2 minutes.

As a thank you, I'd love to [incentive - bonus, feature, gift].

What do you think?

[Your name]`
  }
};

// Interview questions
const INTERVIEW_QUESTIONS = {
  before: [
    'What was your situation before [product]?',
    'What had you already tried that didn\'t work?',
    'What was the biggest challenge you were facing?',
    'How did the problem affect your life/business?'
  ],
  during: [
    'What made you decide to try [product]?',
    'What was your first impression?',
    'Was there a specific moment where things clicked?',
    'What surprised you most about the experience?'
  ],
  after: [
    'What results have you achieved?',
    'How is your life/business different now?',
    'What specific metrics or changes can you share?',
    'What would you tell someone considering this?'
  ],
  emotional: [
    'How did it feel to finally solve this problem?',
    'What does this transformation mean to you?',
    'Who else in your life has noticed the change?',
    'What are you most proud of?'
  ]
};

// Display formats
const DISPLAY_FORMATS = {
  card: {
    name: 'Testimonial Card',
    elements: ['Quote', 'Photo', 'Name', 'Title/Company', 'Star rating'],
    layout: 'Grid or carousel',
    bestFor: 'Multiple testimonials on one page'
  },
  featured: {
    name: 'Featured Testimonial',
    elements: ['Large quote', 'Large photo', 'Full attribution', 'Result metric'],
    layout: 'Full-width section',
    bestFor: 'Hero testimonial, sales pages'
  },
  sidebar: {
    name: 'Sidebar Testimonial',
    elements: ['Short quote', 'Small photo', 'Name'],
    layout: 'Side placement',
    bestFor: 'Supporting content, opt-in pages'
  },
  inline: {
    name: 'Inline Quote',
    elements: ['Quote only', 'Attribution'],
    layout: 'Within body text',
    bestFor: 'Blog posts, email'
  },
  wall: {
    name: 'Social Proof Wall',
    elements: ['Many small testimonials', 'Screenshots', 'Scrolling'],
    layout: 'Dense mosaic',
    bestFor: 'Overwhelming proof, sales pages'
  }
};

// Data storage
let testimonialData = {
  testimonials: [],
  requests: [],
  caseStudies: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(TESTIMONIAL_FILE, 'utf8');
    testimonialData = JSON.parse(data);
  } catch {
    testimonialData = { testimonials: [], requests: [], caseStudies: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(TESTIMONIAL_FILE, JSON.stringify(testimonialData, null, 2));
}

/**
 * Generate testimonial request
 */
async function generateRequest(type, options = {}) {
  const template = REQUEST_TEMPLATES[type] || REQUEST_TEMPLATES.simple;
  const product = options.product || 'the program';
  const name = options.name || '[Customer Name]';
  
  const request = {
    id: `request-${Date.now()}`,
    type,
    template,
    customized: {
      subject: template.subject.replace(/\[name\]/g, name).replace(/\[product\]/g, product),
      body: template.body.replace(/\[name\]/g, name).replace(/\[product\]/g, product)
    },
    timing: {}
  };
  
  // Timing recommendations
  request.timing = {
    ideal: 'Ask after customer achieves result',
    triggers: [
      'Customer shares positive feedback',
      'Customer achieves milestone',
      'Customer renews or refers',
      '30-60 days after purchase'
    ],
    avoid: [
      'Immediately after purchase (no results yet)',
      'During support issue',
      'Without personalization'
    ]
  };
  
  // Follow-up sequence
  request.followUp = [
    { day: 0, action: 'Send initial request' },
    { day: 3, action: 'Bump email if no response' },
    { day: 7, action: 'Final follow-up with different angle' },
    { day: 14, action: 'Move to next month check-in list' }
  ];
  
  request.generatedAt = new Date().toISOString();
  
  testimonialData.requests.push(request);
  await saveData();
  
  return request;
}

/**
 * Create collection workflow
 */
async function createCollectionWorkflow(product, options = {}) {
  const workflow = {
    id: `workflow-${Date.now()}`,
    product,
    stages: [],
    automation: {}
  };
  
  // Collection stages
  workflow.stages = [
    {
      stage: 1,
      name: 'Identify Candidates',
      actions: [
        'Monitor support for positive feedback',
        'Track milestone completions',
        'Note referrals and renewals',
        'Check social mentions'
      ],
      tools: ['CRM tags', 'Support system', 'Social monitoring']
    },
    {
      stage: 2,
      name: 'Request Testimonial',
      actions: [
        'Send personalized request email',
        'Mention specific result they achieved',
        'Make it easy (provide prompts)',
        'Offer incentive if appropriate'
      ],
      tools: ['Email templates', 'Form links', 'Video recording tools']
    },
    {
      stage: 3,
      name: 'Collect & Process',
      actions: [
        'Receive testimonial',
        'Get permission to use',
        'Request photo if not provided',
        'Ask clarifying questions if needed'
      ],
      tools: ['Intake form', 'Release form', 'File storage']
    },
    {
      stage: 4,
      name: 'Optimize & Publish',
      actions: [
        'Edit for clarity (with permission)',
        'Format for different uses',
        'Add to asset library',
        'Deploy across channels'
      ],
      tools: ['Design templates', 'CMS', 'Asset management']
    }
  ];
  
  // Automation opportunities
  workflow.automation = {
    triggers: [
      'Milestone completion triggers request',
      'Positive NPS score triggers request',
      'X days since purchase triggers check-in'
    ],
    tools: [
      'Zapier/Make for automations',
      'Boast.io or similar for collection',
      'Typeform for structured collection'
    ]
  };
  
  workflow.generatedAt = new Date().toISOString();
  
  return workflow;
}

/**
 * Optimize testimonial text
 */
async function optimizeTestimonial(text, options = {}) {
  const optimization = {
    id: `optimize-${Date.now()}`,
    original: text,
    suggestions: [],
    improved: ''
  };
  
  // Common improvements
  optimization.suggestions = [
    {
      issue: 'Too generic',
      fix: 'Add specific numbers or results',
      example: 'Instead of "great results" → "increased revenue 47%"'
    },
    {
      issue: 'Too long',
      fix: 'Extract the most powerful sentence',
      example: 'Lead with the transformation or result'
    },
    {
      issue: 'Weak opening',
      fix: 'Start with the result, not the problem',
      example: 'Lead with "I 3x\'d my business" not "I was struggling"'
    },
    {
      issue: 'No emotion',
      fix: 'Include how they felt',
      example: 'Add "I couldn\'t believe it" or "Finally felt free"'
    },
    {
      issue: 'Missing credibility',
      fix: 'Add specific details about who they are',
      example: 'Include role, company, industry'
    }
  ];
  
  // Elements to highlight
  optimization.powerElements = {
    results: 'Extract specific metrics and outcomes',
    before: 'Highlight the problem or struggle',
    after: 'Emphasize the transformation',
    emotional: 'Capture genuine emotion',
    specific: 'Keep concrete details'
  };
  
  // Format variations
  optimization.formats = {
    headline: 'Pull out one powerful phrase',
    tweet: 'Condense to ~200 characters',
    email: 'Include context and full quote',
    ad: 'Result-focused, punchy version',
    casestudy: 'Expand with full story'
  };
  
  optimization.generatedAt = new Date().toISOString();
  
  return optimization;
}

/**
 * Generate display format
 */
async function generateDisplayFormat(format, options = {}) {
  const displayType = DISPLAY_FORMATS[format] || DISPLAY_FORMATS.card;
  
  const display = {
    id: `display-${Date.now()}`,
    format,
    config: displayType,
    html: '',
    css: '',
    placement: {}
  };
  
  // HTML template
  display.html = `
<div class="testimonial testimonial-${format}">
  <div class="testimonial-quote">
    "[Quote here]"
  </div>
  <div class="testimonial-author">
    <img src="[photo]" alt="[name]" class="testimonial-photo">
    <div class="testimonial-info">
      <div class="testimonial-name">[Name]</div>
      <div class="testimonial-title">[Title/Result]</div>
    </div>
  </div>
</div>`.trim();
  
  // CSS template
  display.css = `
.testimonial-${format} {
  background: #f9f9f9;
  padding: 2rem;
  border-radius: 8px;
  margin: 1rem 0;
}
.testimonial-quote {
  font-size: 1.2rem;
  font-style: italic;
  margin-bottom: 1rem;
}
.testimonial-author {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.testimonial-photo {
  width: 60px;
  height: 60px;
  border-radius: 50%;
}`.trim();
  
  // Placement recommendations
  display.placement = {
    salesPage: [
      'After major claims (proof)',
      'Before CTA (reassurance)',
      'In objection sections'
    ],
    homepage: [
      'Social proof section',
      'Below hero',
      'Footer area'
    ],
    optIn: [
      'Below form (increase conversions)',
      'Sidebar'
    ],
    checkout: [
      'Reduce cart abandonment',
      'Address final doubts'
    ]
  };
  
  display.generatedAt = new Date().toISOString();
  
  return display;
}

/**
 * Create video testimonial script
 */
async function createVideoScript(type, options = {}) {
  const script = {
    id: `video-${Date.now()}`,
    type,
    duration: options.duration || '60-90 seconds',
    structure: [],
    prompts: [],
    tips: []
  };
  
  // Script structure
  script.structure = [
    {
      section: 'Hook',
      duration: '5-10 seconds',
      goal: 'Capture attention',
      prompt: 'Start with your biggest result or transformation'
    },
    {
      section: 'Before',
      duration: '15-20 seconds',
      goal: 'Establish relatability',
      prompt: 'What was your situation before? What had you tried?'
    },
    {
      section: 'Discovery',
      duration: '10-15 seconds',
      goal: 'Build anticipation',
      prompt: 'What made you decide to try [product]?'
    },
    {
      section: 'After',
      duration: '20-30 seconds',
      goal: 'Show transformation',
      prompt: 'What results did you get? Be specific with numbers.'
    },
    {
      section: 'Recommendation',
      duration: '10-15 seconds',
      goal: 'Call to action',
      prompt: 'What would you tell someone considering this?'
    }
  ];
  
  // Recording prompts to send to customer
  script.prompts = [
    '1. Introduce yourself (name, what you do)',
    '2. Where were you before [product]?',
    '3. What specific results have you achieved?', 
    '4. What was the turning point for you?',
    '5. What would you say to someone on the fence?'
  ];
  
  // Tips for better videos
  script.tips = [
    'Record in natural light facing a window',
    'Keep phone horizontal (landscape)',
    'Find a quiet space',
    'Be yourself - imperfect is authentic',
    'Look at the camera lens, not the screen',
    'It\'s okay to do multiple takes',
    'Keep it under 2 minutes'
  ];
  
  script.generatedAt = new Date().toISOString();
  
  return script;
}

/**
 * Build case study template
 */
async function buildCaseStudy(client, options = {}) {
  const caseStudy = {
    id: `casestudy-${Date.now()}`,
    client,
    template: {},
    sections: []
  };
  
  // Case study template
  caseStudy.sections = [
    {
      name: 'Headline',
      content: 'How [Client] Achieved [Result] in [Timeframe]',
      purpose: 'Capture attention with the transformation'
    },
    {
      name: 'Quick Stats',
      content: '[Key metrics in boxes: +X% increase, $Y revenue, etc.]',
      purpose: 'Scannable proof'
    },
    {
      name: 'The Challenge',
      content: '[Describe the problem they faced, what they had tried, stakes]',
      purpose: 'Build relatability'
    },
    {
      name: 'The Solution',
      content: '[How they found you, what you provided, implementation]',
      purpose: 'Show your process'
    },
    {
      name: 'The Results',
      content: '[Specific metrics, before/after, timeline]',
      purpose: 'Prove the transformation'
    },
    {
      name: 'Client Quote',
      content: '[Powerful testimonial quote]',
      purpose: 'Add authenticity'
    },
    {
      name: 'Key Takeaways',
      content: '[Bullet points of lessons/highlights]',
      purpose: 'Make it actionable'
    },
    {
      name: 'CTA',
      content: '[Ready to get similar results? Button/link]',
      purpose: 'Convert reader'
    }
  ];
  
  // Interview guide
  caseStudy.interviewGuide = {
    before: INTERVIEW_QUESTIONS.before,
    during: INTERVIEW_QUESTIONS.during,
    after: INTERVIEW_QUESTIONS.after,
    emotional: INTERVIEW_QUESTIONS.emotional
  };
  
  caseStudy.generatedAt = new Date().toISOString();
  
  testimonialData.caseStudies.push(caseStudy);
  await saveData();
  
  return caseStudy;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'request': {
        const type = args[0] || 'simple';
        const request = await generateRequest(type);
        
        console.log('Testimonial Request');
        console.log('='.repeat(50));
        console.log(`Type: ${type}`);
        console.log(`\nSubject: ${request.customized.subject}`);
        console.log(`\nBody preview: ${request.customized.body.substring(0, 150)}...`);
        break;
      }
      
      case 'collect': {
        const product = args.join(' ') || 'Product';
        const workflow = await createCollectionWorkflow(product);
        
        console.log('Collection Workflow');
        console.log('='.repeat(50));
        console.log(`\nStages:`);
        for (const stage of workflow.stages) {
          console.log(`  ${stage.stage}. ${stage.name}`);
        }
        break;
      }
      
      case 'optimize': {
        const text = args.join(' ') || 'Sample testimonial text';
        const optimization = await optimizeTestimonial(text);
        
        console.log('Testimonial Optimization');
        console.log('='.repeat(50));
        console.log(`\nSuggestions:`);
        for (const sugg of optimization.suggestions.slice(0, 3)) {
          console.log(`  - ${sugg.issue}: ${sugg.fix}`);
        }
        break;
      }
      
      case 'display': {
        const format = args[0] || 'card';
        const display = await generateDisplayFormat(format);
        
        console.log(`Display Format: ${display.config.name}`);
        console.log('='.repeat(50));
        console.log(`Elements: ${display.config.elements.join(', ')}`);
        console.log(`Best for: ${display.config.bestFor}`);
        break;
      }
      
      case 'video': {
        const type = args[0] || 'standard';
        const script = await createVideoScript(type);
        
        console.log('Video Testimonial Script');
        console.log('='.repeat(50));
        console.log(`Duration: ${script.duration}`);
        console.log(`\nSections:`);
        for (const section of script.structure.slice(0, 3)) {
          console.log(`  - ${section.section}: ${section.duration}`);
        }
        break;
      }
      
      case 'casestudy': {
        const client = args.join(' ') || 'Client Name';
        const caseStudy = await buildCaseStudy(client);
        
        console.log('Case Study Template');
        console.log('='.repeat(50));
        console.log(`Client: ${caseStudy.client}`);
        console.log(`\nSections:`);
        for (const section of caseStudy.sections.slice(0, 4)) {
          console.log(`  - ${section.name}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Testimonial Collector Module');
        console.log('============================');
        console.log(`Testimonial types: ${Object.keys(TESTIMONIAL_TYPES).length}`);
        console.log(`Request templates: ${Object.keys(REQUEST_TEMPLATES).length}`);
        console.log(`Display formats: ${Object.keys(DISPLAY_FORMATS).length}`);
        console.log(`Stored testimonials: ${testimonialData.testimonials.length}`);
        break;
      }
      
      default:
        console.log('Testimonial Collector - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  generateRequest,
  createCollectionWorkflow,
  optimizeTestimonial,
  generateDisplayFormat,
  createVideoScript,
  buildCaseStudy,
  TESTIMONIAL_TYPES,
  REQUEST_TEMPLATES,
  INTERVIEW_QUESTIONS,
  DISPLAY_FORMATS
};

// Run CLI
main().catch(console.error);
