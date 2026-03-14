#!/usr/bin/env node
/**
 * OpenClaw Lead Magnet Creator Agent
 * 
 * Content Division - Lead magnet development
 * 
 * Features:
 *   - Checklist generation
 *   - Blueprint/guide creation
 *   - Cheat sheet design
 *   - Template packs
 *   - Mini-course outlines
 *   - Swipe files
 * 
 * Usage: node lead-magnet-creator.mjs <command> [args...]
 * 
 * Commands:
 *   checklist <topic>        Generate checklist lead magnet
 *   guide <topic>            Generate guide/blueprint
 *   cheatsheet <topic>       Generate cheat sheet
 *   templates <topic>        Generate template pack
 *   minicourse <topic>       Generate mini-course outline
 *   swipe <topic>            Generate swipe file
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const LEADMAG_FILE = path.join(DATA_DIR, 'lead-magnets.json');

// Lead magnet types
const LEAD_MAGNET_TYPES = {
  checklist: {
    name: 'Checklist',
    description: 'Step-by-step actionable list',
    conversionRate: 'High',
    effort: 'Low',
    idealFor: ['Quick wins', 'Processes', 'Beginners']
  },
  guide: {
    name: 'Guide/Blueprint',
    description: 'Comprehensive how-to document',
    conversionRate: 'Medium-High',
    effort: 'Medium',
    idealFor: ['Deep topics', 'Complex processes', 'Authority building']
  },
  cheatsheet: {
    name: 'Cheat Sheet',
    description: 'Quick reference document',
    conversionRate: 'High',
    effort: 'Low',
    idealFor: ['Reference materials', 'Shortcuts', 'Formulas']
  },
  templates: {
    name: 'Template Pack',
    description: 'Done-for-you templates',
    conversionRate: 'Very High',
    effort: 'Medium',
    idealFor: ['Practical tools', 'Time-savers', 'Professionals']
  },
  minicourse: {
    name: 'Mini-Course',
    description: 'Short educational series',
    conversionRate: 'Medium',
    effort: 'High',
    idealFor: ['Complex topics', 'Course previews', 'High-value leads']
  },
  swipefile: {
    name: 'Swipe File',
    description: 'Collection of proven examples',
    conversionRate: 'High',
    effort: 'Medium',
    idealFor: ['Copywriting', 'Marketing', 'Inspiration']
  },
  workbook: {
    name: 'Workbook',
    description: 'Interactive exercises and worksheets',
    conversionRate: 'Medium-High',
    effort: 'Medium',
    idealFor: ['Self-reflection', 'Planning', 'Implementation']
  },
  toolkit: {
    name: 'Toolkit/Resource List',
    description: 'Curated collection of tools and resources',
    conversionRate: 'High',
    effort: 'Low',
    idealFor: ['Tool recommendations', 'Resource guides', 'Beginners']
  }
};

// Title formulas
const TITLE_FORMULAS = [
  'The Ultimate {Topic} Checklist',
  '{Number} Steps to {Outcome}',
  'The Complete {Topic} Guide',
  '{Topic} Made Simple: A Quick Reference',
  'The {Topic} Blueprint',
  'Your {Topic} Cheat Sheet',
  '{Number} {Topic} Templates You Need',
  'The Only {Topic} Guide You\'ll Ever Need',
  'Quick Start: {Topic} in {Timeframe}',
  '{Topic} Toolkit: Everything You Need'
];

// Data storage
let leadmagData = {
  leadMagnets: [],
  templates: {}
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(LEADMAG_FILE, 'utf8');
    leadmagData = JSON.parse(data);
  } catch {
    leadmagData = { leadMagnets: [], templates: {} };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(LEADMAG_FILE, JSON.stringify(leadmagData, null, 2));
}

/**
 * Generate checklist lead magnet
 */
async function generateChecklist(topic, options = {}) {
  const itemCount = options.items || 15;
  
  const checklist = {
    id: `checklist-${Date.now()}`,
    type: 'checklist',
    topic,
    title: `The Ultimate ${topic} Checklist`,
    subtitle: `${itemCount} Steps to ${topic} Success`,
    structure: {
      intro: {
        headline: `Your Complete ${topic} Checklist`,
        description: `Follow these ${itemCount} steps to ensure you're covering all your bases with ${topic}. Print this out and check off each item as you complete it.`
      },
      sections: generateChecklistSections(topic, itemCount),
      outro: {
        headline: 'You Did It!',
        content: 'Completed all the steps? You\'re well on your way to [OUTCOME]. For more help with [TOPIC], check out [CTA/LINK].',
        cta: 'Want to take this further? →'
      }
    },
    designSpecs: {
      format: 'PDF',
      pages: Math.ceil(itemCount / 10),
      elements: ['Checkboxes', 'Section headers', 'Brief explanations', 'Pro tips'],
      branding: 'Logo, colors, contact info'
    },
    landingPageCopy: generateLandingCopy('checklist', topic),
    generatedAt: new Date().toISOString()
  };
  
  leadmagData.leadMagnets.push(checklist);
  await saveData();
  
  return checklist;
}

/**
 * Generate checklist sections
 */
function generateChecklistSections(topic, itemCount) {
  const sectionsCount = Math.ceil(itemCount / 5);
  const sections = [];
  
  const sectionNames = ['Getting Started', 'Core Steps', 'Advanced Steps', 'Optimization', 'Final Touches'];
  
  let itemNum = 1;
  for (let s = 0; s < sectionsCount; s++) {
    const section = {
      name: sectionNames[s] || `Section ${s + 1}`,
      items: []
    };
    
    const itemsInSection = Math.min(5, itemCount - (s * 5));
    for (let i = 0; i < itemsInSection; i++) {
      section.items.push({
        number: itemNum++,
        task: `[Step ${itemNum - 1} for ${topic}]`,
        description: '[Brief explanation of why this matters]',
        proTip: i === 0 ? '💡 Pro tip: [Quick helpful tip]' : null
      });
    }
    
    sections.push(section);
  }
  
  return sections;
}

/**
 * Generate guide/blueprint lead magnet
 */
async function generateGuide(topic, options = {}) {
  const depth = options.depth || 'comprehensive';
  
  const guide = {
    id: `guide-${Date.now()}`,
    type: 'guide',
    topic,
    title: `The Complete ${topic} Blueprint`,
    subtitle: `Everything You Need to Know to Master ${topic}`,
    structure: {
      coverPage: {
        title: `The ${topic} Blueprint`,
        subtitle: 'Your Step-by-Step Guide to [OUTCOME]',
        author: '[YOUR NAME]',
        branding: '[LOGO/WEBSITE]'
      },
      tableOfContents: true,
      introduction: {
        headline: `Why ${topic} Matters`,
        content: [
          'The current state of [INDUSTRY/TOPIC]',
          'What you\'ll learn in this guide',
          'How to use this blueprint',
          'What results you can expect'
        ]
      },
      chapters: generateGuideChapters(topic, depth),
      conclusion: {
        headline: 'Your Next Steps',
        content: 'Summary of key points and action items',
        cta: 'Ready for the next level? [PRODUCT CTA]'
      },
      resources: {
        headline: 'Additional Resources',
        items: ['Recommended tools', 'Further reading', 'Contact/support info']
      }
    },
    designSpecs: {
      format: 'PDF',
      pages: depth === 'comprehensive' ? '20-30' : '10-15',
      elements: ['Headers', 'Pull quotes', 'Callout boxes', 'Action steps', 'Images/diagrams'],
      branding: 'Full branding throughout'
    },
    landingPageCopy: generateLandingCopy('guide', topic),
    generatedAt: new Date().toISOString()
  };
  
  leadmagData.leadMagnets.push(guide);
  await saveData();
  
  return guide;
}

/**
 * Generate guide chapters
 */
function generateGuideChapters(topic, depth) {
  const chapterCount = depth === 'comprehensive' ? 5 : 3;
  const chapters = [];
  
  const chapterTemplates = [
    { title: 'Foundation', subtitle: 'Understanding the Basics of {topic}' },
    { title: 'Strategy', subtitle: 'Building Your {topic} Plan' },
    { title: 'Implementation', subtitle: 'Putting {topic} Into Action' },
    { title: 'Optimization', subtitle: 'Improving Your {topic} Results' },
    { title: 'Scaling', subtitle: 'Taking Your {topic} to the Next Level' }
  ];
  
  for (let i = 0; i < chapterCount; i++) {
    const template = chapterTemplates[i];
    chapters.push({
      number: i + 1,
      title: `Chapter ${i + 1}: ${template.title}`,
      subtitle: template.subtitle.replace('{topic}', topic),
      sections: [
        { heading: '[Section 1 Heading]', content: '[Content outline]' },
        { heading: '[Section 2 Heading]', content: '[Content outline]' },
        { heading: '[Section 3 Heading]', content: '[Content outline]' }
      ],
      keyTakeaways: ['[Takeaway 1]', '[Takeaway 2]', '[Takeaway 3]'],
      actionStep: '[Specific action reader should take]'
    });
  }
  
  return chapters;
}

/**
 * Generate cheat sheet lead magnet
 */
async function generateCheatSheet(topic, options = {}) {
  const cheatsheet = {
    id: `cheatsheet-${Date.now()}`,
    type: 'cheatsheet',
    topic,
    title: `${topic} Cheat Sheet`,
    subtitle: 'Your Quick Reference Guide',
    structure: {
      header: {
        title: `The ${topic} Cheat Sheet`,
        tagline: 'Everything you need on one page'
      },
      sections: [
        {
          name: 'Key Concepts',
          items: [
            { term: '[Term 1]', definition: '[Brief definition]' },
            { term: '[Term 2]', definition: '[Brief definition]' },
            { term: '[Term 3]', definition: '[Brief definition]' },
            { term: '[Term 4]', definition: '[Brief definition]' }
          ]
        },
        {
          name: 'Essential Formulas',
          items: [
            { formula: '[Formula 1]', usage: '[When to use]' },
            { formula: '[Formula 2]', usage: '[When to use]' },
            { formula: '[Formula 3]', usage: '[When to use]' }
          ]
        },
        {
          name: 'Quick Tips',
          items: [
            '✓ [Tip 1]',
            '✓ [Tip 2]',
            '✓ [Tip 3]',
            '✓ [Tip 4]',
            '✓ [Tip 5]'
          ]
        },
        {
          name: 'Common Mistakes to Avoid',
          items: [
            '✗ [Mistake 1]',
            '✗ [Mistake 2]',
            '✗ [Mistake 3]'
          ]
        },
        {
          name: 'Tools & Resources',
          items: [
            { tool: '[Tool 1]', link: '[URL]' },
            { tool: '[Tool 2]', link: '[URL]' },
            { tool: '[Tool 3]', link: '[URL]' }
          ]
        }
      ],
      footer: {
        cta: 'Want more? Visit [WEBSITE]',
        contact: '@[HANDLE] | [EMAIL]'
      }
    },
    designSpecs: {
      format: 'PDF',
      pages: 1,
      layout: 'Multi-column, dense but scannable',
      elements: ['Icons', 'Color coding', 'Visual hierarchy'],
      printFriendly: true
    },
    landingPageCopy: generateLandingCopy('cheatsheet', topic),
    generatedAt: new Date().toISOString()
  };
  
  leadmagData.leadMagnets.push(cheatsheet);
  await saveData();
  
  return cheatsheet;
}

/**
 * Generate template pack lead magnet
 */
async function generateTemplatePack(topic, options = {}) {
  const templateCount = options.count || 5;
  
  const pack = {
    id: `templates-${Date.now()}`,
    type: 'template-pack',
    topic,
    title: `${templateCount} ${topic} Templates`,
    subtitle: 'Ready-to-Use Templates to Save You Hours',
    structure: {
      overview: {
        headline: `Your ${topic} Template Pack`,
        description: `This pack contains ${templateCount} professionally designed templates to help you [OUTCOME] faster.`,
        howToUse: 'Each template is fully customizable. Simply fill in your details and you\'re ready to go.'
      },
      templates: generateTemplateList(topic, templateCount),
      bonus: {
        name: 'Quick Start Guide',
        description: 'A brief guide on how to customize and use each template effectively'
      }
    },
    deliverables: {
      formats: ['Google Docs', 'Word', 'PDF', 'Notion'],
      access: 'Shared folder with all templates',
      updates: 'Lifetime access to updates'
    },
    designSpecs: {
      pages: templateCount + 2,
      elements: ['Fillable fields', 'Instructions', 'Examples'],
      branding: 'Your branding with customizable sections'
    },
    landingPageCopy: generateLandingCopy('templates', topic),
    generatedAt: new Date().toISOString()
  };
  
  leadmagData.leadMagnets.push(pack);
  await saveData();
  
  return pack;
}

/**
 * Generate template list
 */
function generateTemplateList(topic, count) {
  const templateIdeas = [
    { name: 'Planning Template', description: 'Map out your {topic} strategy' },
    { name: 'Tracking Template', description: 'Monitor your {topic} progress' },
    { name: 'Checklist Template', description: 'Ensure nothing falls through the cracks' },
    { name: 'Script Template', description: 'Done-for-you {topic} scripts' },
    { name: 'Worksheet Template', description: 'Work through key {topic} decisions' },
    { name: 'Calendar Template', description: 'Schedule your {topic} activities' },
    { name: 'Formula Template', description: 'Proven {topic} formulas' },
    { name: 'Swipe Template', description: 'Copy-paste {topic} examples' }
  ];
  
  return templateIdeas.slice(0, count).map((t, i) => ({
    number: i + 1,
    name: t.name,
    description: t.description.replace('{topic}', topic),
    includes: ['[Element 1]', '[Element 2]', '[Element 3]'],
    useCase: '[When to use this template]'
  }));
}

/**
 * Generate mini-course lead magnet
 */
async function generateMiniCourse(topic, options = {}) {
  const lessonCount = options.lessons || 5;
  
  const course = {
    id: `minicourse-${Date.now()}`,
    type: 'mini-course',
    topic,
    title: `${topic} Mini-Course`,
    subtitle: `Master ${topic} in ${lessonCount} Days`,
    structure: {
      welcome: {
        headline: `Welcome to the ${topic} Mini-Course!`,
        content: 'What you\'ll learn, how to get the most out of this course, and what to expect.',
        deliveryMethod: 'Email or members area'
      },
      lessons: generateMiniCourseLessons(topic, lessonCount),
      completion: {
        headline: 'Congratulations!',
        content: 'Recap of what they\'ve learned and next steps',
        cta: 'Ready for the full course? →'
      }
    },
    deliveryPlan: {
      method: 'Daily emails over ' + lessonCount + ' days',
      timing: 'One lesson per day',
      format: 'Video + PDF worksheet per lesson'
    },
    conversionStrategy: {
      softSell: 'Brief mention of full product in lessons 2-4',
      hardSell: 'Full pitch in final lesson',
      followUp: 'Sales sequence for non-buyers'
    },
    landingPageCopy: generateLandingCopy('minicourse', topic),
    generatedAt: new Date().toISOString()
  };
  
  leadmagData.leadMagnets.push(course);
  await saveData();
  
  return course;
}

/**
 * Generate mini-course lessons
 */
function generateMiniCourseLessons(topic, count) {
  const lessonTemplates = [
    { title: 'Foundation', focus: 'Understanding the basics' },
    { title: 'Strategy', focus: 'Building your approach' },
    { title: 'Implementation', focus: 'Taking action' },
    { title: 'Optimization', focus: 'Improving results' },
    { title: 'Next Steps', focus: 'Scaling and growing' }
  ];
  
  return lessonTemplates.slice(0, count).map((l, i) => ({
    day: i + 1,
    title: `Day ${i + 1}: ${l.title}`,
    focus: l.focus,
    content: {
      video: `${3 + i}-${5 + i} minutes`,
      topics: ['[Topic 1]', '[Topic 2]', '[Topic 3]'],
      actionStep: '[Specific action for today]'
    },
    email: {
      subject: `[Day ${i + 1}] ${l.title}`,
      preview: `Today we\'re covering ${l.focus}...`
    }
  }));
}

/**
 * Generate swipe file lead magnet
 */
async function generateSwipeFile(topic, options = {}) {
  const exampleCount = options.examples || 20;
  
  const swipefile = {
    id: `swipefile-${Date.now()}`,
    type: 'swipe-file',
    topic,
    title: `${exampleCount} ${topic} Swipes`,
    subtitle: 'Proven Examples You Can Model',
    structure: {
      intro: {
        headline: `Your ${topic} Swipe File`,
        description: 'A curated collection of proven examples. Use these as inspiration (don\'t copy directly!).',
        howToUse: '1. Browse for inspiration\n2. Identify what works\n3. Adapt to your context'
      },
      categories: generateSwipeCategories(topic, exampleCount),
      bonus: {
        name: 'Analysis Notes',
        description: 'Why each example works and how to apply the principles'
      }
    },
    designSpecs: {
      format: 'PDF or Notion database',
      organization: 'Categorized with tags',
      elements: ['Screenshots', 'Annotations', 'Analysis']
    },
    landingPageCopy: generateLandingCopy('swipefile', topic),
    generatedAt: new Date().toISOString()
  };
  
  leadmagData.leadMagnets.push(swipefile);
  await saveData();
  
  return swipefile;
}

/**
 * Generate swipe categories
 */
function generateSwipeCategories(topic, count) {
  const perCategory = Math.ceil(count / 4);
  
  return [
    {
      name: 'Best Performers',
      description: 'Top-performing examples',
      examples: Array.from({ length: perCategory }, (_, i) => ({
        id: i + 1,
        example: `[Example ${i + 1}]`,
        source: '[Source]',
        whyItWorks: '[Analysis]'
      }))
    },
    {
      name: 'Classic Examples',
      description: 'Time-tested approaches',
      examples: Array.from({ length: perCategory }, (_, i) => ({
        id: perCategory + i + 1,
        example: `[Example ${perCategory + i + 1}]`,
        source: '[Source]',
        whyItWorks: '[Analysis]'
      }))
    },
    {
      name: 'Creative Approaches',
      description: 'Unique and innovative examples',
      examples: Array.from({ length: perCategory }, (_, i) => ({
        id: (perCategory * 2) + i + 1,
        example: `[Example ${(perCategory * 2) + i + 1}]`,
        source: '[Source]',
        whyItWorks: '[Analysis]'
      }))
    },
    {
      name: 'Modern Examples',
      description: 'Recent high-performers',
      examples: Array.from({ length: Math.min(perCategory, count - (perCategory * 3)) }, (_, i) => ({
        id: (perCategory * 3) + i + 1,
        example: `[Example ${(perCategory * 3) + i + 1}]`,
        source: '[Source]',
        whyItWorks: '[Analysis]'
      }))
    }
  ];
}

/**
 * Generate landing page copy
 */
function generateLandingCopy(type, topic) {
  const typeConfig = LEAD_MAGNET_TYPES[type] || LEAD_MAGNET_TYPES.checklist;
  
  return {
    headline: `Free ${typeConfig.name}: Master ${topic}`,
    subheadline: `Download your free ${typeConfig.name.toLowerCase()} and start getting results today.`,
    bulletPoints: [
      `✓ [Benefit 1 - What they'll learn/get]`,
      `✓ [Benefit 2 - Problem it solves]`,
      `✓ [Benefit 3 - Transformation achieved]`,
      `✓ [Benefit 4 - Time/money saved]`
    ],
    cta: `Get Your Free ${typeConfig.name}`,
    trustElements: [
      'No credit card required',
      'Instant download',
      'Works for beginners and pros'
    ],
    socialProof: '[X,XXX] downloads so far'
  };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'checklist': {
        const topic = args.join(' ') || 'Product Launch';
        const result = await generateChecklist(topic);
        
        console.log('Checklist Lead Magnet Generated');
        console.log('='.repeat(50));
        console.log(`Title: ${result.title}`);
        console.log(`Sections: ${result.structure.sections.length}`);
        
        for (const section of result.structure.sections) {
          console.log(`\n📋 ${section.name} (${section.items.length} items)`);
        }
        break;
      }
      
      case 'guide': {
        const topic = args.join(' ') || 'Content Marketing';
        const result = await generateGuide(topic);
        
        console.log('Guide Lead Magnet Generated');
        console.log('='.repeat(50));
        console.log(`Title: ${result.title}`);
        console.log(`Chapters: ${result.structure.chapters.length}`);
        
        for (const chapter of result.structure.chapters) {
          console.log(`  ${chapter.title}`);
        }
        break;
      }
      
      case 'cheatsheet': {
        const topic = args.join(' ') || 'SEO';
        const result = await generateCheatSheet(topic);
        
        console.log('Cheat Sheet Generated');
        console.log('='.repeat(50));
        console.log(`Title: ${result.title}`);
        console.log(`Sections: ${result.structure.sections.length}`);
        break;
      }
      
      case 'templates': {
        const topic = args.join(' ') || 'Email Marketing';
        const result = await generateTemplatePack(topic);
        
        console.log('Template Pack Generated');
        console.log('='.repeat(50));
        console.log(`Title: ${result.title}`);
        
        for (const template of result.structure.templates) {
          console.log(`  ${template.number}. ${template.name}`);
        }
        break;
      }
      
      case 'minicourse': {
        const topic = args.join(' ') || 'Instagram Growth';
        const result = await generateMiniCourse(topic);
        
        console.log('Mini-Course Generated');
        console.log('='.repeat(50));
        console.log(`Title: ${result.title}`);
        
        for (const lesson of result.structure.lessons) {
          console.log(`  ${lesson.title}`);
        }
        break;
      }
      
      case 'swipe': {
        const topic = args.join(' ') || 'Headlines';
        const result = await generateSwipeFile(topic);
        
        console.log('Swipe File Generated');
        console.log('='.repeat(50));
        console.log(`Title: ${result.title}`);
        
        for (const category of result.structure.categories) {
          console.log(`  ${category.name}: ${category.examples.length} examples`);
        }
        break;
      }
      
      case 'test': {
        console.log('Lead Magnet Creator Module');
        console.log('==========================');
        console.log(`Lead magnet types: ${Object.keys(LEAD_MAGNET_TYPES).length}`);
        console.log(`Title formulas: ${TITLE_FORMULAS.length}`);
        console.log(`Lead magnets created: ${leadmagData.leadMagnets.length}`);
        break;
      }
      
      default:
        console.log('Lead Magnet Creator - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  generateChecklist,
  generateGuide,
  generateCheatSheet,
  generateTemplatePack,
  generateMiniCourse,
  generateSwipeFile,
  LEAD_MAGNET_TYPES,
  TITLE_FORMULAS
};

// Run CLI
main().catch(console.error);
