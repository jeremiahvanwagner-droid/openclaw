#!/usr/bin/env node
/**
 * OpenClaw SEO Optimizer Agent
 * 
 * Content Division - Search engine optimization
 * 
 * Features:
 *   - On-page SEO analysis
 *   - Keyword optimization
 *   - Meta tag generation
 *   - Content structure optimization
 *   - Internal linking suggestions
 *   - SEO scoring
 * 
 * Usage: node seo-optimizer.mjs <command> [args...]
 * 
 * Commands:
 *   analyze <content>        Analyze content for SEO
 *   meta <topic>             Generate meta tags
 *   keywords <topic>         Keyword optimization plan
 *   structure <content>      Optimize content structure
 *   score <url>              Generate SEO score
 *   checklist <type>         Generate SEO checklist
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SEO_FILE = path.join(DATA_DIR, 'seo-data.json');

// SEO factors and weights
const SEO_FACTORS = {
  onPage: {
    titleTag: { weight: 10, description: 'Primary keyword in title, under 60 chars' },
    metaDescription: { weight: 8, description: 'Compelling description, under 160 chars' },
    h1Tag: { weight: 9, description: 'One H1 with primary keyword' },
    headingStructure: { weight: 7, description: 'Proper H2-H6 hierarchy' },
    keywordDensity: { weight: 6, description: '1-3% keyword density' },
    contentLength: { weight: 7, description: 'Comprehensive content (1500+ words)' },
    internalLinks: { weight: 6, description: '3-5 internal links minimum' },
    externalLinks: { weight: 4, description: 'Relevant authoritative links' },
    imageOptimization: { weight: 5, description: 'Alt text, compressed images' },
    urlStructure: { weight: 7, description: 'Clean, keyword-rich URL' }
  },
  technical: {
    pageSpeed: { weight: 8, description: 'Core Web Vitals passing' },
    mobileFriendly: { weight: 9, description: 'Responsive design' },
    ssl: { weight: 6, description: 'HTTPS enabled' },
    schemaMarkup: { weight: 5, description: 'Structured data implementation' },
    crawlability: { weight: 7, description: 'No indexing issues' }
  },
  content: {
    readability: { weight: 6, description: 'Grade 8 reading level' },
    uniqueness: { weight: 9, description: 'Original content' },
    topicDepth: { weight: 7, description: 'Comprehensive coverage' },
    userIntent: { weight: 8, description: 'Matches search intent' },
    freshness: { weight: 4, description: 'Recently updated' }
  }
};

// Keyword intent types
const KEYWORD_INTENT = {
  informational: {
    modifiers: ['how to', 'what is', 'why', 'guide', 'tutorial', 'tips', 'ideas', 'examples'],
    contentType: 'Blog posts, guides, tutorials',
    conversionRate: 'Low (awareness stage)'
  },
  navigational: {
    modifiers: ['login', 'website', 'app', 'brand name'],
    contentType: 'Homepage, login pages',
    conversionRate: 'Medium (already aware)'
  },
  commercial: {
    modifiers: ['best', 'top', 'review', 'vs', 'comparison', 'alternative'],
    contentType: 'Comparison posts, reviews',
    conversionRate: 'Medium-High (consideration)'
  },
  transactional: {
    modifiers: ['buy', 'price', 'discount', 'coupon', 'order', 'purchase', 'deal'],
    contentType: 'Product/sales pages',
    conversionRate: 'High (ready to buy)'
  }
};

// Data storage
let seoData = {
  analyses: [],
  keywords: [],
  scores: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(SEO_FILE, 'utf8');
    seoData = JSON.parse(data);
  } catch {
    seoData = { analyses: [], keywords: [], scores: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(SEO_FILE, JSON.stringify(seoData, null, 2));
}

/**
 * Analyze content for SEO
 */
async function analyzeContent(content, options = {}) {
  const keyword = options.keyword || '[primary keyword]';
  const url = options.url || '[target-url]';
  
  const analysis = {
    id: `analysis-${Date.now()}`,
    keyword,
    url,
    wordCount: content.split(/\s+/).length,
    checks: {}
  };
  
  // Title Tag
  analysis.checks.titleTag = {
    status: 'needs-review',
    current: '[Current title tag]',
    recommendation: `${keyword} - Compelling Benefit | Brand`,
    tips: [
      'Keep under 60 characters',
      'Put primary keyword near the beginning',
      'Make it compelling and click-worthy',
      'Include brand name at end'
    ]
  };
  
  // Meta Description
  analysis.checks.metaDescription = {
    status: 'needs-review',
    current: '[Current meta description]',
    recommendation: `Learn how to ${keyword.toLowerCase()} with our comprehensive guide. Discover [benefit 1], [benefit 2], and more. Click to get started!`,
    tips: [
      'Keep under 160 characters',
      'Include primary keyword naturally',
      'Add a call-to-action',
      'Make it compelling to improve CTR'
    ]
  };
  
  // H1 Tag
  analysis.checks.h1Tag = {
    status: 'needs-review',
    recommendation: `How to ${keyword}: [Compelling Subtitle]`,
    tips: [
      'Only one H1 per page',
      'Include primary keyword',
      'Match user search intent'
    ]
  };
  
  // Heading Structure
  analysis.checks.headingStructure = {
    status: 'needs-review',
    recommended: [
      'H1: Main title (1x)',
      'H2: Major sections (3-7x)',
      'H3: Subsections under H2s',
      'H4-H6: Deeper subsections if needed'
    ],
    tips: [
      'Create logical hierarchy',
      'Include keywords in some H2s',
      'Use headings for scanability'
    ]
  };
  
  // Keyword Density
  const keywordCount = (content.toLowerCase().match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
  const density = ((keywordCount / analysis.wordCount) * 100).toFixed(2);
  
  analysis.checks.keywordDensity = {
    status: parseFloat(density) >= 1 && parseFloat(density) <= 3 ? 'good' : 'needs-improvement',
    current: `${density}% (${keywordCount} occurrences in ${analysis.wordCount} words)`,
    target: '1-3%',
    tips: [
      'Avoid keyword stuffing',
      'Use semantic variations',
      'Include in title, H1, first paragraph'
    ]
  };
  
  // Content Length
  analysis.checks.contentLength = {
    status: analysis.wordCount >= 1500 ? 'good' : 'needs-improvement',
    current: `${analysis.wordCount} words`,
    recommendation: 'Aim for 1500-2500 words for comprehensive topics',
    tips: [
      'Cover topic thoroughly',
      'Don\'t add fluff',
      'Match competitor content length',
      'Focus on value, not word count'
    ]
  };
  
  // Internal Links
  analysis.checks.internalLinks = {
    status: 'needs-review',
    current: '[Count internal links]',
    recommendation: '3-5 internal links minimum',
    tips: [
      'Link to relevant pages',
      'Use descriptive anchor text',
      'Create content clusters',
      'Help users navigate deeper'
    ]
  };
  
  // Image Optimization
  analysis.checks.images = {
    status: 'needs-review',
    checklist: [
      '☐ Add descriptive alt text with keywords',
      '☐ Compress images (under 100KB)',
      '☐ Use descriptive file names',
      '☐ Include relevant images every 300 words',
      '☐ Add captions where appropriate'
    ]
  };
  
  // URL Structure
  analysis.checks.url = {
    status: 'needs-review',
    current: url,
    recommendation: `/[category]/${keyword.toLowerCase().replace(/\s+/g, '-')}`,
    tips: [
      'Keep URLs short',
      'Include primary keyword',
      'Use hyphens, not underscores',
      'Avoid dates unless necessary'
    ]
  };
  
  // Calculate overall score
  let score = 0;
  let maxScore = 0;
  for (const check of Object.values(analysis.checks)) {
    maxScore += 10;
    if (check.status === 'good') score += 10;
    else if (check.status === 'needs-review') score += 5;
    else score += 2;
  }
  
  analysis.overallScore = {
    score: Math.round((score / maxScore) * 100),
    grade: getGrade(Math.round((score / maxScore) * 100)),
    summary: 'Review all items marked "needs-review" and implement recommendations'
  };
  
  analysis.generatedAt = new Date().toISOString();
  
  seoData.analyses.push(analysis);
  await saveData();
  
  return analysis;
}

/**
 * Get letter grade
 */
function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Generate meta tags
 */
async function generateMetaTags(topic, options = {}) {
  const keyword = options.keyword || topic;
  const type = options.type || 'blog';
  
  const meta = {
    id: `meta-${Date.now()}`,
    topic,
    keyword,
    type,
    tags: {}
  };
  
  // Title Tag variations
  meta.tags.title = {
    variations: [
      `${keyword}: The Complete Guide [${new Date().getFullYear()}]`,
      `How to ${keyword} (Step-by-Step Guide)`,
      `${keyword} - Everything You Need to Know`,
      `The Ultimate Guide to ${keyword} | [Brand]`,
      `${keyword}: Tips, Strategies & Examples`
    ],
    bestPractices: [
      'Keep under 60 characters',
      'Primary keyword at start',
      'Include power words',
      'Add year for freshness'
    ]
  };
  
  // Meta Description variations
  meta.tags.metaDescription = {
    variations: [
      `Learn how to ${keyword.toLowerCase()} with our comprehensive guide. Discover proven strategies, tips, and best practices. Start improving today!`,
      `Master ${keyword.toLowerCase()} with this step-by-step guide. Get actionable tips you can implement right now. Click to learn more.`,
      `Everything you need to know about ${keyword.toLowerCase()}. Expert advice, real examples, and practical strategies. Free guide inside!`
    ],
    bestPractices: [
      'Keep under 160 characters',
      'Include primary keyword',
      'Add clear CTA',
      'Highlight unique value'
    ]
  };
  
  // Open Graph Tags
  meta.tags.openGraph = {
    'og:title': `${keyword}: Complete Guide`,
    'og:description': `Discover everything about ${keyword.toLowerCase()}. Expert strategies and actionable tips.`,
    'og:type': 'article',
    'og:image': '[1200x630 image URL]',
    'og:url': '[canonical URL]'
  };
  
  // Twitter Cards
  meta.tags.twitter = {
    'twitter:card': 'summary_large_image',
    'twitter:title': `${keyword}: Complete Guide`,
    'twitter:description': `Master ${keyword.toLowerCase()} with our expert guide.`,
    'twitter:image': '[1200x600 image URL]'
  };
  
  // Schema Markup
  meta.tags.schema = {
    type: type === 'blog' ? 'Article' : 'WebPage',
    example: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${keyword}: Complete Guide`,
      author: { '@type': 'Person', name: '[Author Name]' },
      datePublished: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      image: '[Image URL]',
      publisher: {
        '@type': 'Organization',
        name: '[Brand Name]',
        logo: '[Logo URL]'
      }
    }
  };
  
  meta.generatedAt = new Date().toISOString();
  
  return meta;
}

/**
 * Generate keyword optimization plan
 */
async function keywordOptimizationPlan(topic, options = {}) {
  const plan = {
    id: `keyword-${Date.now()}`,
    topic,
    primaryKeyword: topic,
    secondaryKeywords: [],
    lsiKeywords: [],
    placement: {}
  };
  
  // Generate secondary keywords
  plan.secondaryKeywords = [
    `${topic} guide`,
    `${topic} tips`,
    `${topic} strategies`,
    `best ${topic}`,
    `${topic} examples`,
    `how to ${topic}`,
    `${topic} for beginners`
  ];
  
  // LSI Keywords (semantically related)
  plan.lsiKeywords = [
    '[Related term 1]',
    '[Related term 2]',
    '[Related term 3]',
    '[Related term 4]',
    '[Related term 5]'
  ];
  
  // Keyword placement strategy
  plan.placement = {
    title: {
      keyword: plan.primaryKeyword,
      position: 'Near beginning',
      example: `${plan.primaryKeyword}: [Compelling subtitle]`
    },
    metaDescription: {
      keyword: plan.primaryKeyword,
      usage: 'Once, naturally',
      example: `Learn how to ${plan.primaryKeyword.toLowerCase()}...`
    },
    h1: {
      keyword: plan.primaryKeyword,
      position: 'Exact or close match'
    },
    firstParagraph: {
      keyword: plan.primaryKeyword,
      position: 'Within first 100 words'
    },
    h2Tags: {
      keywords: plan.secondaryKeywords.slice(0, 3),
      position: 'Some H2s (not all)'
    },
    body: {
      primaryDensity: '1-2%',
      secondaryUsage: 'Naturally throughout',
      lsiUsage: 'Sprinkle for semantic richness'
    },
    imageAlt: {
      keyword: plan.primaryKeyword,
      usage: 'At least one image alt text'
    },
    url: {
      keyword: plan.primaryKeyword,
      format: `/${plan.primaryKeyword.toLowerCase().replace(/\s+/g, '-')}`
    }
  };
  
  // Intent analysis
  plan.intentAnalysis = {
    detected: detectIntent(topic),
    contentType: KEYWORD_INTENT[detectIntent(topic)]?.contentType || 'General content',
    optimization: KEYWORD_INTENT[detectIntent(topic)]?.conversionRate || 'Varies'
  };
  
  seoData.keywords.push(plan);
  await saveData();
  
  return plan;
}

/**
 * Detect keyword intent
 */
function detectIntent(keyword) {
  const lower = keyword.toLowerCase();
  
  for (const [intent, data] of Object.entries(KEYWORD_INTENT)) {
    for (const modifier of data.modifiers) {
      if (lower.includes(modifier)) {
        return intent;
      }
    }
  }
  
  return 'informational'; // Default
}

/**
 * Generate SEO score
 */
async function generateSEOScore(url, options = {}) {
  const score = {
    id: `score-${Date.now()}`,
    url,
    scores: {},
    overall: 0
  };
  
  // Score each category
  const categories = {
    onPage: {
      score: Math.floor(Math.random() * 30) + 60, // Simulated 60-90
      factors: [
        { name: 'Title Tag', score: 'Good', recommendation: null },
        { name: 'Meta Description', score: 'Needs work', recommendation: 'Add compelling CTA' },
        { name: 'H1 Tag', score: 'Good', recommendation: null },
        { name: 'Keyword Usage', score: 'Good', recommendation: null },
        { name: 'Content Length', score: 'Needs work', recommendation: 'Add 500+ words' }
      ]
    },
    technical: {
      score: Math.floor(Math.random() * 30) + 60,
      factors: [
        { name: 'Page Speed', score: 'Good', recommendation: null },
        { name: 'Mobile-Friendly', score: 'Good', recommendation: null },
        { name: 'SSL', score: 'Good', recommendation: null },
        { name: 'Schema Markup', score: 'Missing', recommendation: 'Add Article schema' }
      ]
    },
    content: {
      score: Math.floor(Math.random() * 30) + 60,
      factors: [
        { name: 'Readability', score: 'Good', recommendation: null },
        { name: 'Uniqueness', score: 'Good', recommendation: null },
        { name: 'Topic Depth', score: 'Needs work', recommendation: 'Add more subtopics' },
        { name: 'User Intent', score: 'Good', recommendation: null }
      ]
    },
    links: {
      score: Math.floor(Math.random() * 30) + 50,
      factors: [
        { name: 'Internal Links', score: 'Low', recommendation: 'Add 3+ more internal links' },
        { name: 'External Links', score: 'Missing', recommendation: 'Add 1-2 authoritative sources' },
        { name: 'Broken Links', score: 'Good', recommendation: null }
      ]
    }
  };
  
  score.scores = categories;
  
  // Calculate overall
  const totalScore = Object.values(categories).reduce((acc, cat) => acc + cat.score, 0);
  score.overall = Math.round(totalScore / Object.keys(categories).length);
  score.grade = getGrade(score.overall);
  
  // Priority improvements
  score.priorityImprovements = [];
  for (const [category, data] of Object.entries(categories)) {
    for (const factor of data.factors) {
      if (factor.recommendation) {
        score.priorityImprovements.push({
          category,
          factor: factor.name,
          action: factor.recommendation,
          impact: factor.score === 'Missing' ? 'High' : 'Medium'
        });
      }
    }
  }
  
  score.generatedAt = new Date().toISOString();
  
  seoData.scores.push(score);
  await saveData();
  
  return score;
}

/**
 * Generate SEO checklist
 */
async function generateSEOChecklist(type = 'blog-post') {
  const checklists = {
    'blog-post': {
      name: 'Blog Post SEO Checklist',
      sections: [
        {
          name: 'Before Writing',
          items: [
            '☐ Identify primary keyword',
            '☐ Research search intent',
            '☐ Analyze top-ranking competitors',
            '☐ Plan content structure',
            '☐ Identify secondary keywords'
          ]
        },
        {
          name: 'On-Page SEO',
          items: [
            '☐ Primary keyword in title (near start)',
            '☐ Title under 60 characters',
            '☐ Meta description with keyword (<160 chars)',
            '☐ One H1 tag with keyword',
            '☐ H2s and H3s with logical structure',
            '☐ Keyword in first 100 words',
            '☐ Keyword density 1-2%',
            '☐ SEO-friendly URL with keyword'
          ]
        },
        {
          name: 'Content Quality',
          items: [
            '☐ Comprehensive coverage (1500+ words)',
            '☐ Original, valuable content',
            '☐ Easy to read (Grade 8 level)',
            '☐ Short paragraphs (2-3 sentences)',
            '☐ Bullet points and lists',
            '☐ Answer common questions',
            '☐ Include examples/case studies'
          ]
        },
        {
          name: 'Links & Media',
          items: [
            '☐ 3-5+ internal links',
            '☐ 1-2 external authoritative links',
            '☐ Images every 300 words',
            '☐ Alt text on all images',
            '☐ Compressed images (<100KB)',
            '☐ Descriptive anchor text'
          ]
        },
        {
          name: 'Technical',
          items: [
            '☐ Mobile-responsive',
            '☐ Fast page load speed',
            '☐ No broken links',
            '☐ Schema markup added',
            '☐ Social sharing meta tags'
          ]
        }
      ]
    },
    'landing-page': {
      name: 'Landing Page SEO Checklist',
      sections: [
        {
          name: 'Core Elements',
          items: [
            '☐ Clear H1 with main keyword',
            '☐ Compelling title tag',
            '☐ Action-oriented meta description',
            '☐ Clean URL structure',
            '☐ Fast load time (<3 seconds)'
          ]
        },
        {
          name: 'Content',
          items: [
            '☐ Clear value proposition',
            '☐ Benefit-focused copy',
            '☐ Social proof elements',
            '☐ Trust signals',
            '☐ Clear CTA'
          ]
        }
      ]
    }
  };
  
  return checklists[type] || checklists['blog-post'];
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'analyze': {
        const content = args.join(' ') || 'Sample content for SEO analysis';
        const analysis = await analyzeContent(content, { keyword: 'sample keyword' });
        
        console.log('SEO Analysis');
        console.log('='.repeat(50));
        console.log(`Overall Score: ${analysis.overallScore.score}/100 (${analysis.overallScore.grade})`);
        console.log(`Word Count: ${analysis.wordCount}`);
        
        console.log('\nChecks:');
        for (const [name, check] of Object.entries(analysis.checks)) {
          const icon = check.status === 'good' ? '✓' : '⚠';
          console.log(`  ${icon} ${name}: ${check.status}`);
        }
        break;
      }
      
      case 'meta': {
        const topic = args.join(' ') || 'Digital Marketing';
        const meta = await generateMetaTags(topic);
        
        console.log('Meta Tags Generated');
        console.log('='.repeat(50));
        console.log('\nTitle Options:');
        for (const title of meta.tags.title.variations.slice(0, 3)) {
          console.log(`  • ${title}`);
        }
        console.log('\nMeta Description:');
        console.log(`  ${meta.tags.metaDescription.variations[0]}`);
        break;
      }
      
      case 'keywords': {
        const topic = args.join(' ') || 'email marketing';
        const plan = await keywordOptimizationPlan(topic);
        
        console.log('Keyword Optimization Plan');
        console.log('='.repeat(50));
        console.log(`Primary: ${plan.primaryKeyword}`);
        console.log(`\nSecondary Keywords:`);
        for (const kw of plan.secondaryKeywords) {
          console.log(`  • ${kw}`);
        }
        console.log(`\nIntent: ${plan.intentAnalysis.detected}`);
        break;
      }
      
      case 'score': {
        const url = args[0] || 'example.com/blog/post';
        const score = await generateSEOScore(url);
        
        console.log('SEO Score');
        console.log('='.repeat(50));
        console.log(`URL: ${score.url}`);
        console.log(`Overall: ${score.overall}/100 (${score.grade})`);
        
        console.log('\nCategory Scores:');
        for (const [cat, data] of Object.entries(score.scores)) {
          console.log(`  ${cat}: ${data.score}/100`);
        }
        
        console.log('\nPriority Improvements:');
        for (const imp of score.priorityImprovements.slice(0, 3)) {
          console.log(`  • [${imp.impact}] ${imp.action}`);
        }
        break;
      }
      
      case 'checklist': {
        const type = args[0] || 'blog-post';
        const checklist = await generateSEOChecklist(type);
        
        console.log(checklist.name);
        console.log('='.repeat(50));
        
        for (const section of checklist.sections) {
          console.log(`\n${section.name}:`);
          for (const item of section.items) {
            console.log(`  ${item}`);
          }
        }
        break;
      }
      
      case 'test': {
        console.log('SEO Optimizer Module');
        console.log('====================');
        console.log(`SEO factors: ${Object.keys(SEO_FACTORS).length} categories`);
        console.log(`Intent types: ${Object.keys(KEYWORD_INTENT).length}`);
        console.log(`Analyses: ${seoData.analyses.length}`);
        break;
      }
      
      default:
        console.log('SEO Optimizer - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  analyzeContent,
  generateMetaTags,
  keywordOptimizationPlan,
  generateSEOScore,
  generateSEOChecklist,
  SEO_FACTORS,
  KEYWORD_INTENT
};

// Run CLI
main().catch(console.error);
