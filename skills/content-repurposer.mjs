#!/usr/bin/env node
/**
 * OpenClaw Content Repurposer Agent
 * 
 * Content Division - Content transformation and repurposing
 * 
 * Features:
 *   - Blog to social media
 *   - Video to blog/thread
 *   - Podcast to articles
 *   - Long-form to short-form
 *   - Content atomization
 *   - Format transformation
 * 
 * Usage: node content-repurposer.mjs <command> [args...]
 * 
 * Commands:
 *   atomize <content>        Break content into atoms
 *   blog-to-social <url>     Convert blog to social posts
 *   video-to-blog <url>      Convert video to blog post
 *   thread-to-blog <url>     Convert thread to blog
 *   podcast-to-article       Convert podcast to article
 *   matrix <content>         Generate repurposing matrix
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const REPURPOSE_FILE = path.join(DATA_DIR, 'repurposed.json');

// Content formats
const CONTENT_FORMATS = {
  longForm: {
    name: 'Long-Form Content',
    types: ['blog-post', 'youtube-video', 'podcast-episode', 'webinar', 'course-module'],
    duration: '10+ minutes / 1500+ words'
  },
  mediumForm: {
    name: 'Medium-Form Content',
    types: ['linkedin-post', 'newsletter', 'email', 'twitter-thread', 'carousel'],
    duration: '2-10 minutes / 300-1500 words'
  },
  shortForm: {
    name: 'Short-Form Content',
    types: ['tweet', 'instagram-caption', 'tiktok', 'reel', 'story'],
    duration: '<2 minutes / <300 words'
  },
  micro: {
    name: 'Micro Content',
    types: ['quote', 'stat', 'tip', 'hook', 'headline'],
    duration: '<15 seconds / <50 words'
  }
};

// Repurposing pathways
const REPURPOSING_PATHS = {
  'blog-post': {
    canBecome: ['twitter-thread', 'linkedin-post', 'email', 'carousel', 'video-script', 'podcast-talking-points', 'quote-graphics', 'infographic'],
    timeToCreate: 'Source: 2-4 hours → Derivatives: 30 min each'
  },
  'youtube-video': {
    canBecome: ['blog-post', 'podcast-episode', 'short-clips', 'quote-cards', 'twitter-thread', 'audiogram', 'transcript-post'],
    timeToCreate: 'Source: 4-8 hours → Derivatives: 1 hour each'
  },
  'podcast-episode': {
    canBecome: ['blog-post', 'youtube-video', 'audiogram', 'quote-graphics', 'twitter-thread', 'email', 'linkedin-post'],
    timeToCreate: 'Source: 1-2 hours → Derivatives: 30 min each'
  },
  'webinar': {
    canBecome: ['course-module', 'youtube-video', 'blog-series', 'email-sequence', 'social-clips', 'podcast-episode'],
    timeToCreate: 'Source: 4+ hours → Derivatives: 2 hours each'
  },
  'twitter-thread': {
    canBecome: ['blog-post', 'linkedin-post', 'carousel', 'email', 'video-script'],
    timeToCreate: 'Source: 30 min → Derivatives: 15 min each'
  }
};

// Data storage
let repurposeData = {
  projects: [],
  atoms: [],
  matrices: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(REPURPOSE_FILE, 'utf8');
    repurposeData = JSON.parse(data);
  } catch {
    repurposeData = { projects: [], atoms: [], matrices: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(REPURPOSE_FILE, JSON.stringify(repurposeData, null, 2));
}

/**
 * Atomize content into reusable pieces
 */
async function atomizeContent(content, options = {}) {
  const title = options.title || 'Content';
  const sourceType = options.sourceType || 'blog-post';
  
  const project = {
    id: `atomize-${Date.now()}`,
    title,
    sourceType,
    sourceContent: content.substring(0, 500) + '...', // Store preview
    atoms: []
  };
  
  // Extract different atom types
  project.atoms = [
    ...extractKeyPoints(content, 5),
    ...extractQuotables(content, 3),
    ...extractStats(content),
    ...extractHooks(content, 3),
    ...extractActionables(content, 3)
  ];
  
  // Generate derivative suggestions
  project.derivatives = generateDerivativeSuggestions(project.atoms, sourceType);
  
  // Content multiplication factor
  project.multiplicationFactor = {
    originalPieces: 1,
    potentialPieces: project.atoms.length + project.derivatives.length,
    roi: `${project.atoms.length + project.derivatives.length}x content multiplication`
  };
  
  project.generatedAt = new Date().toISOString();
  
  repurposeData.projects.push(project);
  await saveData();
  
  return project;
}

/**
 * Extract key points
 */
function extractKeyPoints(content, count) {
  return Array.from({ length: count }, (_, i) => ({
    type: 'key-point',
    content: `[Key Point ${i + 1} extracted from content]`,
    usableFor: ['twitter', 'linkedin', 'carousel-slide', 'email-bullet'],
    format: 'One main idea, 1-2 sentences'
  }));
}

/**
 * Extract quotables
 */
function extractQuotables(content, count) {
  return Array.from({ length: count }, (_, i) => ({
    type: 'quotable',
    content: `"[Quotable phrase ${i + 1}]"`,
    usableFor: ['quote-graphic', 'tweet', 'story', 'pull-quote'],
    format: 'Memorable phrase, <15 words'
  }));
}

/**
 * Extract statistics
 */
function extractStats(content) {
  return [
    {
      type: 'statistic',
      content: '[Statistic or data point]',
      usableFor: ['infographic', 'tweet', 'carousel', 'video-b-roll'],
      format: 'Number + context'
    }
  ];
}

/**
 * Extract hooks
 */
function extractHooks(content, count) {
  return Array.from({ length: count }, (_, i) => ({
    type: 'hook',
    content: `[Hook ${i + 1}: Opening line that grabs attention]`,
    usableFor: ['video-opening', 'email-subject', 'ad-headline', 'social-hook'],
    format: 'Curiosity-inducing opener'
  }));
}

/**
 * Extract actionables
 */
function extractActionables(content, count) {
  return Array.from({ length: count }, (_, i) => ({
    type: 'actionable',
    content: `[Actionable tip ${i + 1}: Specific action reader can take]`,
    usableFor: ['carousel-cta', 'email-ps', 'story-cta', 'thread-finale'],
    format: 'Clear directive'
  }));
}

/**
 * Generate derivative suggestions
 */
function generateDerivativeSuggestions(atoms, sourceType) {
  const paths = REPURPOSING_PATHS[sourceType] || REPURPOSING_PATHS['blog-post'];
  
  return paths.canBecome.map(format => ({
    format,
    atomsToUse: Math.min(5, atoms.length),
    description: `Create ${format} from extracted atoms`,
    estimatedTime: '15-30 minutes',
    template: getDerivativeTemplate(format)
  }));
}

/**
 * Get derivative template
 */
function getDerivativeTemplate(format) {
  const templates = {
    'twitter-thread': 'Hook tweet → Key point tweets → CTA tweet',
    'linkedin-post': 'Hook → Story/Context → Key points → CTA',
    'carousel': 'Cover slide → Point slides (1 each) → CTA slide',
    'email': 'Subject line (hook) → Intro → Points → CTA',
    'video-script': 'Hook → Intro → Content sections → CTA → Outro'
  };
  
  return templates[format] || 'Adapt atoms to format requirements';
}

/**
 * Convert blog to social posts
 */
async function blogToSocial(blogContent, options = {}) {
  const title = options.title || 'Blog Post';
  
  const conversion = {
    id: `blog-social-${Date.now()}`,
    source: {
      type: 'blog-post',
      title,
      preview: blogContent.substring(0, 300) + '...'
    },
    outputs: {}
  };
  
  // Twitter Thread
  conversion.outputs.twitterThread = {
    tweets: [
      { position: 1, type: 'hook', content: `[Hook from blog: "${title}"]\n\nThread 🧵` },
      { position: 2, type: 'point', content: '[Key Point 1 from blog]\n\n[Brief explanation]' },
      { position: 3, type: 'point', content: '[Key Point 2 from blog]\n\n[Brief explanation]' },
      { position: 4, type: 'point', content: '[Key Point 3 from blog]\n\n[Brief explanation]' },
      { position: 5, type: 'cta', content: '[Summary]\n\nRead the full post: [LINK]\n\nFollow for more on [TOPIC]' }
    ],
    estimatedEngagement: 'High (threads perform well)'
  };
  
  // LinkedIn Post
  conversion.outputs.linkedinPost = {
    hook: `[Attention-grabbing opening from blog]`,
    body: `[2-3 paragraphs adapting blog content]\n\n→ [Point 1]\n→ [Point 2]\n→ [Point 3]\n\n[Call to action]`,
    hashtags: ['#relevant', '#hashtags'],
    characterCount: 'Aim for 1200-1500 characters',
    estimatedEngagement: 'Very high (LinkedIn favors long-form)'
  };
  
  // Instagram Carousel
  conversion.outputs.instagramCarousel = {
    slides: [
      { slide: 1, type: 'cover', content: `${title}\n(Swipe →)` },
      { slide: 2, type: 'problem', content: '[Problem statement from blog]' },
      { slide: 3, type: 'point', content: '[Key insight 1]' },
      { slide: 4, type: 'point', content: '[Key insight 2]' },
      { slide: 5, type: 'point', content: '[Key insight 3]' },
      { slide: 6, type: 'cta', content: 'Save this post!\nFollow @[HANDLE]\nLink in bio for full article' }
    ],
    caption: '[Hook]\n\n[Key takeaway summary]\n\n[CTA + Hashtags]'
  };
  
  // Email Newsletter
  conversion.outputs.emailNewsletter = {
    subject: `[Blog title variation]`,
    preview: '[Teaser text]',
    body: {
      greeting: 'Hey [NAME]!',
      hook: '[Opening line from blog]',
      content: '[Condensed blog content - 3-4 paragraphs]',
      cta: 'Read the full article: [LINK]',
      signoff: '[Your sign-off]'
    }
  };
  
  // Quote Graphics
  conversion.outputs.quoteGraphics = [
    { quote: '[Quotable 1 from blog]', design: 'Bold text, branded background' },
    { quote: '[Quotable 2 from blog]', design: 'Minimal, centered text' },
    { quote: '[Quotable 3 from blog]', design: 'Text on photo background' }
  ];
  
  conversion.totalOutputs = Object.keys(conversion.outputs).length;
  conversion.generatedAt = new Date().toISOString();
  
  repurposeData.projects.push(conversion);
  await saveData();
  
  return conversion;
}

/**
 * Convert video to blog
 */
async function videoToBlog(videoInfo, options = {}) {
  const title = videoInfo.title || 'Video';
  const duration = videoInfo.duration || '10 minutes';
  
  const conversion = {
    id: `video-blog-${Date.now()}`,
    source: {
      type: 'youtube-video',
      title,
      duration,
      hasTranscript: true
    },
    output: {
      type: 'blog-post',
      title: `[SEO-optimized version: ${title}]`,
      structure: {
        intro: {
          hook: '[Open with hook from video intro]',
          context: '[Set up the topic]',
          preview: '[What the reader will learn]'
        },
        sections: [
          {
            heading: '[Section 1 - First major topic from video]',
            content: '[Expand on video content for this section]',
            timestamp: '[Corresponding video timestamp]'
          },
          {
            heading: '[Section 2 - Second major topic]',
            content: '[Expand on video content]',
            timestamp: '[Timestamp]'
          },
          {
            heading: '[Section 3 - Third major topic]',
            content: '[Expand on video content]',
            timestamp: '[Timestamp]'
          }
        ],
        conclusion: {
          summary: '[Recap key points]',
          cta: '[Call to action]',
          videoEmbed: 'Embed video for cross-promotion'
        }
      },
      seoElements: {
        metaTitle: '[SEO title <60 chars]',
        metaDescription: '[Meta description <160 chars]',
        targetKeyword: '[Primary keyword]',
        internalLinks: '[Link to related content]'
      },
      additionalContent: {
        embedVideo: 'Include video embed at top',
        timestamps: 'Add timestamp links',
        keyTakeaways: 'Add TL;DR section'
      }
    },
    estimatedWordCount: parseInt(duration) * 200,
    generatedAt: new Date().toISOString()
  };
  
  repurposeData.projects.push(conversion);
  await saveData();
  
  return conversion;
}

/**
 * Generate repurposing matrix
 */
async function generateRepurposingMatrix(content, options = {}) {
  const contentType = options.type || 'blog-post';
  const title = options.title || 'Content';
  
  const matrix = {
    id: `matrix-${Date.now()}`,
    sourceContent: {
      type: contentType,
      title,
      preview: content.substring(0, 200) + '...'
    },
    repurposingPlan: []
  };
  
  // Week 1: Primary conversions
  matrix.repurposingPlan.push({
    week: 1,
    theme: 'Primary Conversions',
    tasks: [
      { day: 'Monday', content: 'Twitter Thread', status: 'pending' },
      { day: 'Tuesday', content: 'LinkedIn Post', status: 'pending' },
      { day: 'Wednesday', content: 'Instagram Carousel', status: 'pending' },
      { day: 'Thursday', content: 'Email Newsletter', status: 'pending' },
      { day: 'Friday', content: 'Quote Graphics (3)', status: 'pending' }
    ]
  });
  
  // Week 2: Secondary conversions
  matrix.repurposingPlan.push({
    week: 2,
    theme: 'Secondary Conversions',
    tasks: [
      { day: 'Monday', content: 'Video Script', status: 'pending' },
      { day: 'Tuesday', content: 'Podcast Talking Points', status: 'pending' },
      { day: 'Wednesday', content: 'Infographic', status: 'pending' },
      { day: 'Thursday', content: 'Story Series (5)', status: 'pending' },
      { day: 'Friday', content: 'Pinterest Pins (3)', status: 'pending' }
    ]
  });
  
  // Week 3: Micro content
  matrix.repurposingPlan.push({
    week: 3,
    theme: 'Micro Content',
    tasks: [
      { day: 'Monday', content: 'Standalone Tweets (5)', status: 'pending' },
      { day: 'Tuesday', content: 'Instagram Captions (3)', status: 'pending' },
      { day: 'Wednesday', content: 'TikTok/Reel Ideas (3)', status: 'pending' },
      { day: 'Thursday', content: 'Facebook Posts (3)', status: 'pending' },
      { day: 'Friday', content: 'Compilation/Roundup', status: 'pending' }
    ]
  });
  
  // Calculate metrics
  const totalPieces = matrix.repurposingPlan.reduce((acc, week) => 
    acc + week.tasks.reduce((a, t) => {
      const match = t.content.match(/\((\d+)\)/);
      return a + (match ? parseInt(match[1]) : 1);
    }, 0), 0);
  
  matrix.metrics = {
    sourcePieces: 1,
    derivativesPossible: totalPieces,
    multiplicationFactor: `${totalPieces}x`,
    timeInvestment: '10-15 hours total',
    contentLifespan: '3+ weeks of publishing'
  };
  
  matrix.generatedAt = new Date().toISOString();
  
  repurposeData.matrices.push(matrix);
  await saveData();
  
  return matrix;
}

/**
 * Thread to blog conversion
 */
async function threadToBlog(thread, options = {}) {
  const conversion = {
    id: `thread-blog-${Date.now()}`,
    source: {
      type: 'twitter-thread',
      tweetCount: Array.isArray(thread) ? thread.length : 7,
      engagement: '[Likes, RTs]'
    },
    output: {
      type: 'blog-post',
      title: '[SEO-optimized title based on thread hook]',
      structure: {
        intro: '[Expand thread hook into full intro paragraph]',
        sections: '[Each tweet becomes a section with expanded content]',
        examples: '[Add examples and details not in thread]',
        visuals: '[Add images, screenshots, diagrams]',
        conclusion: '[Expand CTA tweet into full conclusion]'
      },
      seo: {
        targetKeyword: '[From thread topic]',
        wordCount: 'Aim for 1500-2000 words',
        readabilityTarget: 'Grade 8 level'
      },
      enhancements: [
        'Add subheadings for each section',
        'Include images/visuals',
        'Add internal links',
        'Expand with examples',
        'Include data/statistics',
        'Add FAQ section'
      ]
    },
    generatedAt: new Date().toISOString()
  };
  
  repurposeData.projects.push(conversion);
  await saveData();
  
  return conversion;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'atomize': {
        const content = args.join(' ') || 'Sample content to atomize';
        const result = await atomizeContent(content, { title: 'Sample' });
        
        console.log('Content Atomized');
        console.log('='.repeat(50));
        console.log(`Atoms extracted: ${result.atoms.length}`);
        console.log(`Derivatives possible: ${result.derivatives.length}`);
        console.log(`Multiplication: ${result.multiplicationFactor.roi}`);
        
        console.log('\nAtom Types:');
        const atomTypes = {};
        for (const atom of result.atoms) {
          atomTypes[atom.type] = (atomTypes[atom.type] || 0) + 1;
        }
        for (const [type, count] of Object.entries(atomTypes)) {
          console.log(`  ${type}: ${count}`);
        }
        break;
      }
      
      case 'blog-to-social': {
        const content = args.join(' ') || 'Sample blog content';
        const result = await blogToSocial(content);
        
        console.log('Blog → Social Conversion');
        console.log('='.repeat(50));
        console.log(`Outputs generated: ${result.totalOutputs}`);
        
        for (const [platform, data] of Object.entries(result.outputs)) {
          console.log(`\n📱 ${platform}`);
        }
        break;
      }
      
      case 'video-to-blog': {
        const title = args.join(' ') || 'Sample Video';
        const result = await videoToBlog({ title, duration: '12 minutes' });
        
        console.log('Video → Blog Conversion');
        console.log('='.repeat(50));
        console.log(`Blog Title: ${result.output.title}`);
        console.log(`Est. Words: ${result.estimatedWordCount}`);
        console.log(`Sections: ${result.output.structure.sections.length}`);
        break;
      }
      
      case 'matrix': {
        const content = args.join(' ') || 'Content piece';
        const result = await generateRepurposingMatrix(content);
        
        console.log('Repurposing Matrix');
        console.log('='.repeat(50));
        console.log(`Source: 1 piece`);
        console.log(`Derivatives: ${result.metrics.derivativesPossible}`);
        console.log(`Multiplication: ${result.metrics.multiplicationFactor}`);
        
        for (const week of result.repurposingPlan) {
          console.log(`\n📅 Week ${week.week}: ${week.theme}`);
          for (const task of week.tasks) {
            console.log(`   ${task.day}: ${task.content}`);
          }
        }
        break;
      }
      
      case 'thread-to-blog': {
        const result = await threadToBlog(args);
        
        console.log('Thread → Blog Conversion');
        console.log('='.repeat(50));
        console.log(`Output: ${result.output.type}`);
        console.log(`Target: ${result.output.seo.wordCount}`);
        break;
      }
      
      case 'test': {
        console.log('Content Repurposer Module');
        console.log('=========================');
        console.log(`Content formats: ${Object.keys(CONTENT_FORMATS).length}`);
        console.log(`Repurposing paths: ${Object.keys(REPURPOSING_PATHS).length}`);
        console.log(`Projects: ${repurposeData.projects.length}`);
        break;
      }
      
      default:
        console.log('Content Repurposer - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  atomizeContent,
  blogToSocial,
  videoToBlog,
  threadToBlog,
  generateRepurposingMatrix,
  CONTENT_FORMATS,
  REPURPOSING_PATHS
};

// Run CLI
main().catch(console.error);
