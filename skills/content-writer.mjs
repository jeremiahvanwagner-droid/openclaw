#!/usr/bin/env node
/**
 * OpenClaw Content Writer Agent
 * 
 * Content Division - AI-powered content generation
 * 
 * Features:
 *   - Blog post generation
 *   - Article writing
 *   - Content outlines
 *   - Introduction/conclusion writing
 *   - Content expansion
 *   - Tone adjustment
 * 
 * Usage: node content-writer.mjs <command> [args...]
 * 
 * Commands:
 *   blog <topic>             Generate blog post
 *   article <topic>          Generate article
 *   outline <topic>          Create content outline
 *   intro <topic>            Write introduction
 *   expand <text>            Expand existing content
 *   rewrite <text> <tone>    Rewrite in different tone
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content-writer.json');

// Content templates
const BLOG_STRUCTURES = {
  'how-to': {
    sections: ['Introduction', 'What You Need', 'Step-by-Step Process', 'Common Mistakes', 'Pro Tips', 'Conclusion'],
    wordCount: '1500-2500',
    style: 'instructional'
  },
  'listicle': {
    sections: ['Introduction', 'List Items (5-10)', 'Bonus Tips', 'Conclusion'],
    wordCount: '1200-2000',
    style: 'scannable'
  },
  'guide': {
    sections: ['Introduction', 'Overview', 'Detailed Sections', 'Examples', 'FAQ', 'Conclusion'],
    wordCount: '3000-5000',
    style: 'comprehensive'
  },
  'comparison': {
    sections: ['Introduction', 'Criteria', 'Option Analysis', 'Comparison Table', 'Recommendation', 'Conclusion'],
    wordCount: '2000-3000',
    style: 'analytical'
  },
  'case-study': {
    sections: ['Overview', 'Challenge', 'Solution', 'Implementation', 'Results', 'Key Takeaways'],
    wordCount: '1500-2500',
    style: 'narrative'
  }
};

// Tone profiles
const TONE_PROFILES = {
  professional: {
    vocabulary: 'formal',
    contractions: false,
    personalPronouns: 'limited',
    humor: 'none',
    readingLevel: 'advanced'
  },
  conversational: {
    vocabulary: 'casual',
    contractions: true,
    personalPronouns: 'frequent',
    humor: 'light',
    readingLevel: 'general'
  },
  authoritative: {
    vocabulary: 'expert',
    contractions: false,
    personalPronouns: 'we',
    humor: 'none',
    readingLevel: 'advanced'
  },
  friendly: {
    vocabulary: 'simple',
    contractions: true,
    personalPronouns: 'I/you',
    humor: 'moderate',
    readingLevel: 'easy'
  },
  persuasive: {
    vocabulary: 'action-oriented',
    contractions: true,
    personalPronouns: 'you',
    humor: 'strategic',
    readingLevel: 'general'
  }
};

// Hook templates
const HOOK_TEMPLATES = [
  'Question hook: Start with a thought-provoking question',
  'Statistic hook: Open with a surprising statistic',
  'Story hook: Begin with a brief anecdote',
  'Problem hook: Highlight a common pain point',
  'Contrarian hook: Challenge conventional wisdom',
  'Quote hook: Start with an inspiring quote',
  'Curiosity hook: Tease what readers will learn'
];

// Data storage
let contentData = {
  generated: [],
  templates: {},
  outlines: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(CONTENT_FILE, 'utf8');
    contentData = JSON.parse(data);
  } catch {
    contentData = { generated: [], templates: {}, outlines: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(CONTENT_FILE, JSON.stringify(contentData, null, 2));
}

/**
 * Generate blog post
 */
async function generateBlogPost(topic, options = {}) {
  const type = options.type || detectBlogType(topic);
  const tone = options.tone || 'conversational';
  const structure = BLOG_STRUCTURES[type];
  const toneProfile = TONE_PROFILES[tone];
  
  // Generate outline
  const outline = generateOutline(topic, structure);
  
  // Generate content sections
  const sections = [];
  for (const section of outline.sections) {
    sections.push({
      heading: section.heading,
      content: generateSectionContent(topic, section, toneProfile),
      wordCount: section.targetWords
    });
  }
  
  // Generate meta elements
  const meta = {
    title: generateTitle(topic, type),
    metaDescription: generateMetaDescription(topic),
    slug: generateSlug(topic),
    keywords: extractKeywords(topic),
    readTime: calculateReadTime(sections)
  };
  
  const blogPost = {
    id: `blog-${Date.now()}`,
    topic,
    type,
    tone,
    structure: type,
    meta,
    outline,
    sections,
    totalWordCount: sections.reduce((a, s) => a + s.wordCount, 0),
    generatedAt: new Date().toISOString()
  };
  
  contentData.generated.push(blogPost);
  await saveData();
  
  return blogPost;
}

/**
 * Detect blog type from topic
 */
function detectBlogType(topic) {
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes('how to') || topicLower.includes('step')) return 'how-to';
  if (topicLower.includes('best') || topicLower.includes('top') || /\d+/.test(topicLower)) return 'listicle';
  if (topicLower.includes('vs') || topicLower.includes('compare')) return 'comparison';
  if (topicLower.includes('case study') || topicLower.includes('success')) return 'case-study';
  
  return 'guide';
}

/**
 * Generate content outline
 */
function generateOutline(topic, structure) {
  const sections = structure.sections.map((section, index) => {
    const isIntro = section.toLowerCase().includes('intro');
    const isConclusion = section.toLowerCase().includes('conclusion');
    
    return {
      order: index + 1,
      heading: customizeHeading(section, topic),
      type: isIntro ? 'intro' : isConclusion ? 'conclusion' : 'body',
      targetWords: isIntro || isConclusion ? 150 : 300,
      keyPoints: generateKeyPoints(section, topic)
    };
  });
  
  return {
    topic,
    structure: structure,
    sections,
    totalTargetWords: sections.reduce((a, s) => a + s.targetWords, 0)
  };
}

/**
 * Customize heading for topic
 */
function customizeHeading(template, topic) {
  const topicKeyword = topic.split(' ').slice(0, 3).join(' ');
  
  const headings = {
    'Introduction': `Why ${topicKeyword} Matters`,
    'What You Need': `Prerequisites for ${topicKeyword}`,
    'Step-by-Step Process': `How to ${topicKeyword}: Complete Process`,
    'Common Mistakes': `${topicKeyword} Mistakes to Avoid`,
    'Pro Tips': `Expert Tips for ${topicKeyword}`,
    'Conclusion': `Start Your ${topicKeyword} Journey Today`,
    'List Items (5-10)': `Top Ways to ${topicKeyword}`,
    'Overview': `Understanding ${topicKeyword}`,
    'Detailed Sections': `Deep Dive into ${topicKeyword}`,
    'Examples': `${topicKeyword} Examples That Work`,
    'FAQ': `Frequently Asked Questions About ${topicKeyword}`,
    'Criteria': `How to Evaluate ${topicKeyword} Options`,
    'Option Analysis': `Comparing ${topicKeyword} Solutions`,
    'Comparison Table': `${topicKeyword} Feature Comparison`,
    'Recommendation': `Our ${topicKeyword} Recommendation`,
    'Challenge': `The Problem We Faced`,
    'Solution': `Our ${topicKeyword} Approach`,
    'Implementation': `Putting ${topicKeyword} Into Action`,
    'Results': `${topicKeyword} Results and Impact`,
    'Key Takeaways': `What We Learned About ${topicKeyword}`,
    'Bonus Tips': `Bonus ${topicKeyword} Strategies`
  };
  
  return headings[template] || template;
}

/**
 * Generate key points for section
 */
function generateKeyPoints(section, topic) {
  const points = [
    `Main concept of ${section.toLowerCase()}`,
    'Supporting evidence or example',
    'Practical application',
    'Connection to reader\'s goals'
  ];
  
  return points.slice(0, 3);
}

/**
 * Generate section content
 */
function generateSectionContent(topic, section, toneProfile) {
  const templates = {
    intro: generateIntroContent(topic, toneProfile),
    body: generateBodyContent(topic, section, toneProfile),
    conclusion: generateConclusionContent(topic, toneProfile)
  };
  
  return templates[section.type] || templates.body;
}

/**
 * Generate introduction content
 */
function generateIntroContent(topic, toneProfile) {
  const hooks = [
    `Have you ever wondered how to master ${topic}? You're not alone.`,
    `${topic} is transforming how people achieve their goals. Here's what you need to know.`,
    `In the next few minutes, you'll discover everything about ${topic} that experts don't want you to know.`,
    `Let's face it: ${topic} can be overwhelming. But it doesn't have to be.`
  ];
  
  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  
  return {
    hook,
    context: `This comprehensive guide covers everything you need to know about ${topic}. Whether you're just getting started or looking to level up, you'll find actionable insights here.`,
    promise: `By the end, you'll have a clear roadmap for success with ${topic}.`,
    transition: `Let's dive in.`
  };
}

/**
 * Generate body content
 */
function generateBodyContent(topic, section, toneProfile) {
  return {
    mainPoint: `${section.heading} is crucial for success with ${topic}.`,
    explanation: `Understanding this concept will help you avoid common pitfalls and accelerate your progress.`,
    example: `For example, many successful practitioners of ${topic} emphasize this approach.`,
    actionItem: `To apply this: Start by implementing one small change today.`,
    keyPoints: section.keyPoints
  };
}

/**
 * Generate conclusion content
 */
function generateConclusionContent(topic, toneProfile) {
  return {
    summary: `We've covered the essential aspects of ${topic} that will help you succeed.`,
    reinforcement: `Remember, mastering ${topic} is a journey, not a destination.`,
    callToAction: `Start implementing these strategies today and watch your results transform.`,
    nextSteps: `Your next step: Pick one technique from this guide and put it into action within the next 24 hours.`
  };
}

/**
 * Generate title
 */
function generateTitle(topic, type) {
  const templates = {
    'how-to': [
      `How to ${topic}: A Complete Guide`,
      `The Ultimate Guide to ${topic}`,
      `${topic}: Step-by-Step Tutorial`
    ],
    'listicle': [
      `7 Powerful Ways to ${topic}`,
      `Top 10 ${topic} Strategies That Work`,
      `${topic}: 5 Secrets the Pros Use`
    ],
    'guide': [
      `The Complete ${topic} Guide for 2026`,
      `${topic} Mastery: Everything You Need to Know`,
      `Your Ultimate ${topic} Blueprint`
    ],
    'comparison': [
      `${topic}: The Definitive Comparison`,
      `Choosing the Best ${topic}: Complete Analysis`,
      `${topic} Showdown: Which Is Right for You?`
    ],
    'case-study': [
      `How We Achieved Success with ${topic}`,
      `${topic} Case Study: From Zero to Hero`,
      `Real Results: Our ${topic} Journey`
    ]
  };
  
  const typeTemplates = templates[type] || templates['guide'];
  return typeTemplates[Math.floor(Math.random() * typeTemplates.length)];
}

/**
 * Generate meta description
 */
function generateMetaDescription(topic) {
  return `Discover how to master ${topic} with our comprehensive guide. Learn proven strategies, avoid common mistakes, and get actionable tips for success. Start your journey today!`;
}

/**
 * Generate URL slug
 */
function generateSlug(topic) {
  return topic.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60);
}

/**
 * Extract keywords
 */
function extractKeywords(topic) {
  const words = topic.toLowerCase().split(' ');
  const keywords = [topic.toLowerCase()];
  
  // Add variations
  keywords.push(`how to ${topic.toLowerCase()}`);
  keywords.push(`best ${topic.toLowerCase()}`);
  keywords.push(`${topic.toLowerCase()} guide`);
  keywords.push(`${topic.toLowerCase()} tips`);
  
  return keywords;
}

/**
 * Calculate read time
 */
function calculateReadTime(sections) {
  const totalWords = sections.reduce((a, s) => a + s.wordCount, 0);
  const wordsPerMinute = 200;
  return Math.ceil(totalWords / wordsPerMinute);
}

/**
 * Generate article
 */
async function generateArticle(topic, options = {}) {
  // Similar to blog but with different formatting
  const blog = await generateBlogPost(topic, { ...options, type: 'guide' });
  blog.format = 'article';
  return blog;
}

/**
 * Create detailed outline
 */
async function createOutline(topic, options = {}) {
  const type = options.type || detectBlogType(topic);
  const structure = BLOG_STRUCTURES[type];
  
  const outline = {
    id: `outline-${Date.now()}`,
    topic,
    type,
    title: generateTitle(topic, type),
    hook: HOOK_TEMPLATES[Math.floor(Math.random() * HOOK_TEMPLATES.length)],
    sections: structure.sections.map((section, i) => ({
      order: i + 1,
      heading: customizeHeading(section, topic),
      subheadings: generateSubheadings(section, topic),
      keyPoints: generateKeyPoints(section, topic),
      targetWords: i === 0 || i === structure.sections.length - 1 ? 150 : 400,
      notes: ''
    })),
    totalTargetWords: structure.wordCount,
    callToAction: `Ready to ${topic.toLowerCase()}? Start your journey today!`,
    createdAt: new Date().toISOString()
  };
  
  contentData.outlines.push(outline);
  await saveData();
  
  return outline;
}

/**
 * Generate subheadings
 */
function generateSubheadings(section, topic) {
  if (section.toLowerCase().includes('intro') || section.toLowerCase().includes('conclusion')) {
    return [];
  }
  
  return [
    `Understanding ${section}`,
    `How to Apply ${section}`,
    `${section} Best Practices`
  ];
}

/**
 * Write introduction
 */
async function writeIntroduction(topic, options = {}) {
  const tone = options.tone || 'conversational';
  const toneProfile = TONE_PROFILES[tone];
  
  const hooks = {
    question: `Have you ever struggled with ${topic}? You're not alone. Thousands of people face this challenge every day.`,
    statistic: `Did you know that 73% of people who master ${topic} see results within 30 days? Here's how you can join them.`,
    story: `Three years ago, I knew nothing about ${topic}. Today, it's transformed my entire approach. Let me show you how.`,
    problem: `${topic} frustrates most people. But it doesn't have to be that way. In this guide, I'll show you a better path.`,
    contrarian: `Everything you've been told about ${topic} is wrong. Here's the truth that experts don't want you to know.`
  };
  
  const hookType = options.hookType || 'question';
  
  return {
    topic,
    tone,
    hookType,
    hook: hooks[hookType] || hooks.question,
    context: `This guide will walk you through everything you need to know about ${topic}, from the basics to advanced strategies.`,
    promise: `By the time you finish reading, you'll have a clear action plan for mastering ${topic}.`,
    transition: `Let's start with the fundamentals.`,
    wordCount: 150
  };
}

/**
 * Expand content
 */
async function expandContent(text, options = {}) {
  const targetMultiplier = options.multiplier || 2;
  const originalWords = text.split(' ').length;
  const targetWords = Math.round(originalWords * targetMultiplier);
  
  return {
    original: text,
    originalWordCount: originalWords,
    targetWordCount: targetWords,
    expanded: {
      introduction: `Building on this concept, we can explore deeper insights.`,
      elaboration: `${text} This principle extends further when we consider the practical applications.`,
      examples: `For instance, many professionals apply this approach in their daily work with remarkable results.`,
      evidence: `Research supports this methodology, with studies showing significant improvements.`,
      application: `To implement this yourself, start with small steps and build gradually.`,
      summary: `In essence, this approach provides a solid foundation for continued growth.`
    },
    suggestions: [
      'Add specific examples or case studies',
      'Include relevant statistics or data',
      'Provide step-by-step instructions',
      'Address common objections or questions',
      'Add expert quotes or testimonials'
    ]
  };
}

/**
 * Rewrite in different tone
 */
async function rewriteContent(text, targetTone) {
  const toneProfile = TONE_PROFILES[targetTone] || TONE_PROFILES.conversational;
  
  return {
    original: text,
    targetTone,
    toneProfile,
    rewritten: `[Content rewritten in ${targetTone} tone: ${text}]`,
    toneGuidelines: toneProfile,
    suggestions: [
      toneProfile.contractions ? 'Use contractions freely' : 'Avoid contractions',
      `Vocabulary style: ${toneProfile.vocabulary}`,
      `Personal pronouns: ${toneProfile.personalPronouns}`,
      `Humor level: ${toneProfile.humor}`
    ]
  };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'blog': {
        const topic = args.join(' ') || 'digital marketing';
        console.log(`Generating blog post for: ${topic}...`);
        
        const blog = await generateBlogPost(topic);
        
        console.log('\n' + '='.repeat(60));
        console.log('BLOG POST GENERATED');
        console.log('='.repeat(60));
        console.log(`\nTitle: ${blog.meta.title}`);
        console.log(`Type: ${blog.type}`);
        console.log(`Tone: ${blog.tone}`);
        console.log(`Word Count: ~${blog.totalWordCount}`);
        console.log(`Read Time: ${blog.meta.readTime} min`);
        
        console.log('\nOutline:');
        for (const section of blog.sections) {
          console.log(`  ${section.heading} (~${section.wordCount} words)`);
        }
        
        console.log('\nMeta:');
        console.log(`  Slug: ${blog.meta.slug}`);
        console.log(`  Keywords: ${blog.meta.keywords.slice(0, 3).join(', ')}`);
        break;
      }
      
      case 'outline': {
        const topic = args.join(' ') || 'content marketing';
        console.log(`Creating outline for: ${topic}...`);
        
        const outline = await createOutline(topic);
        
        console.log('\nContent Outline');
        console.log('='.repeat(50));
        console.log(`Title: ${outline.title}`);
        console.log(`Type: ${outline.type}`);
        console.log(`Target: ${outline.totalTargetWords}`);
        
        console.log('\nSections:');
        for (const section of outline.sections) {
          console.log(`\n  ${section.order}. ${section.heading}`);
          console.log(`     Target: ${section.targetWords} words`);
          for (const sub of section.subheadings) {
            console.log(`       - ${sub}`);
          }
        }
        
        console.log(`\nCTA: ${outline.callToAction}`);
        break;
      }
      
      case 'intro': {
        const topic = args.join(' ') || 'email marketing';
        console.log(`Writing introduction for: ${topic}...`);
        
        const intro = await writeIntroduction(topic);
        
        console.log('\nIntroduction');
        console.log('='.repeat(50));
        console.log(`\nHook (${intro.hookType}):`);
        console.log(`  "${intro.hook}"`);
        console.log(`\nContext:`);
        console.log(`  "${intro.context}"`);
        console.log(`\nPromise:`);
        console.log(`  "${intro.promise}"`);
        console.log(`\nTransition:`);
        console.log(`  "${intro.transition}"`);
        break;
      }
      
      case 'expand': {
        const text = args.join(' ') || 'Content is important for business growth.';
        console.log(`Expanding content...`);
        
        const result = await expandContent(text);
        
        console.log('\nContent Expansion');
        console.log('='.repeat(50));
        console.log(`Original (${result.originalWordCount} words):`);
        console.log(`  "${result.original}"`);
        console.log(`\nTarget: ${result.targetWordCount} words`);
        console.log('\nExpansion suggestions:');
        for (const suggestion of result.suggestions) {
          console.log(`  • ${suggestion}`);
        }
        break;
      }
      
      case 'rewrite': {
        const tone = args[0] || 'professional';
        const text = args.slice(1).join(' ') || 'Hey! Check this out, it\'s pretty cool.';
        
        const result = await rewriteContent(text, tone);
        
        console.log('\nTone Rewriting');
        console.log('='.repeat(50));
        console.log(`Target Tone: ${result.targetTone}`);
        console.log(`\nOriginal: "${result.original}"`);
        console.log(`\nGuidelines:`);
        for (const guide of result.suggestions) {
          console.log(`  • ${guide}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Content Writer Module');
        console.log('=====================');
        console.log(`Blog structures: ${Object.keys(BLOG_STRUCTURES).length}`);
        console.log(`Tone profiles: ${Object.keys(TONE_PROFILES).length}`);
        console.log(`Hook templates: ${HOOK_TEMPLATES.length}`);
        console.log(`Content generated: ${contentData.generated.length}`);
        console.log(`Outlines created: ${contentData.outlines.length}`);
        break;
      }
      
      default:
        console.log('Content Writer - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  generateBlogPost,
  generateArticle,
  createOutline,
  writeIntroduction,
  expandContent,
  rewriteContent,
  BLOG_STRUCTURES,
  TONE_PROFILES,
  HOOK_TEMPLATES
};

// Run CLI
main().catch(console.error);
