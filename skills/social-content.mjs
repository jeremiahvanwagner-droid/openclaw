#!/usr/bin/env node
/**
 * OpenClaw Social Content Agent
 * 
 * Content Division - Social media content creation
 * 
 * Features:
 *   - Platform-specific posts
 *   - Carousel content
 *   - Thread generation
 *   - Hashtag optimization
 *   - Caption writing
 *   - Stories/Reels ideas
 * 
 * Usage: node social-content.mjs <command> [args...]
 * 
 * Commands:
 *   post <topic>             Generate social posts
 *   thread <topic>           Generate Twitter/X thread
 *   carousel <topic>         Generate carousel content
 *   caption <context>        Generate captions
 *   hashtags <topic>         Generate optimized hashtags
 *   schedule <topic>         Generate week of content
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SOCIAL_FILE = path.join(DATA_DIR, 'social-content.json');

// Platform specifications
const PLATFORMS = {
  twitter: {
    name: 'Twitter/X',
    maxLength: 280,
    idealLength: 200,
    imageRatio: '16:9 or 1:1',
    bestTimes: ['8am', '12pm', '5pm'],
    hashtagLimit: 2,
    features: ['threads', 'quotes', 'polls']
  },
  instagram: {
    name: 'Instagram',
    captionMax: 2200,
    idealLength: 125,
    imageRatio: '1:1, 4:5, or 1.91:1',
    bestTimes: ['11am', '2pm', '7pm'],
    hashtagLimit: 30,
    features: ['carousels', 'reels', 'stories']
  },
  linkedin: {
    name: 'LinkedIn',
    maxLength: 3000,
    idealLength: 1300,
    imageRatio: '1.91:1 or 1:1',
    bestTimes: ['7am', '12pm', '5pm'],
    hashtagLimit: 5,
    features: ['documents', 'polls', 'articles']
  },
  facebook: {
    name: 'Facebook',
    maxLength: 63206,
    idealLength: 80,
    imageRatio: '1.91:1',
    bestTimes: ['1pm', '3pm', '9am'],
    hashtagLimit: 3,
    features: ['videos', 'groups', 'events']
  },
  tiktok: {
    name: 'TikTok',
    captionMax: 2200,
    idealLength: 75,
    videoRatio: '9:16',
    bestTimes: ['7am', '12pm', '7pm'],
    hashtagLimit: 5,
    features: ['duets', 'stitches', 'sounds']
  }
};

// Post templates by content type
const POST_TEMPLATES = {
  educational: [
    '5 things I wish I knew about {topic} sooner:\n\n1. {point1}\n2. {point2}\n3. {point3}\n4. {point4}\n5. {point5}\n\nBookmark this for later ⬇️',
    'The {topic} framework that changed everything:\n\n{framework}\n\nHere\'s why it works 🧵',
    'Common {topic} myths debunked:\n\n❌ Myth: {myth1}\n✅ Truth: {truth1}\n\n❌ Myth: {myth2}\n✅ Truth: {truth2}'
  ],
  storytelling: [
    'A year ago, I was {struggle}.\n\nToday, {success}.\n\nHere\'s what changed 👇',
    'I made a mistake with {topic}.\n\nHere\'s what happened and what I learned:\n\n[Thread]',
    'The moment everything clicked about {topic}:\n\n{story}'
  ],
  engagement: [
    'Controversial take: {opinion}\n\nAgree or disagree?',
    'What\'s the one thing about {topic} you wish more people understood?\n\n👇 Drop your answers below',
    'POV: You finally understood {topic}.\n\nWhat changed for you?'
  ],
  promotional: [
    '🚀 Exciting news!\n\n{announcement}\n\nLink in bio for more details',
    'After months of work, it\'s finally here:\n\n{product}\n\n{brief_description}\n\n{cta}',
    'Last chance!\n\n{offer}\n\nEnds {deadline}\n\n{link}'
  ],
  authority: [
    'In {years} years of {expertise}, here\'s what I\'ve learned:\n\n{lessons}',
    'Most people get {topic} wrong.\n\nHere\'s the truth that {experts} don\'t tell you:',
    'I\'ve helped {number}+ people with {topic}.\n\nThe #1 mistake they ALL made:\n\n{mistake}'
  ]
};

// Hook formulas for social
const SOCIAL_HOOKS = {
  curiosity: [
    'Here\'s something nobody talks about...',
    'I shouldn\'t be sharing this, but...',
    'The real reason why {topic}...'
  ],
  controversy: [
    'Unpopular opinion:',
    'Hot take:',
    'This might upset some people, but...'
  ],
  story: [
    'A year ago, I...',
    'When I first started...',
    'I just realized something about...'
  ],
  value: [
    'Save this for later:',
    '{Number} lessons I learned about {topic}:',
    'The complete guide to {topic}:'
  ],
  urgency: [
    'You need to see this NOW:',
    'This is important...',
    'Stop scrolling. Read this:'
  ]
};

// Data storage
let socialData = {
  posts: [],
  threads: [],
  carousels: [],
  schedules: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(SOCIAL_FILE, 'utf8');
    socialData = JSON.parse(data);
  } catch {
    socialData = { posts: [], threads: [], carousels: [], schedules: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(SOCIAL_FILE, JSON.stringify(socialData, null, 2));
}

/**
 * Generate social posts
 */
async function generateSocialPosts(topic, options = {}) {
  const platform = options.platform || 'all';
  const contentType = options.type || 'educational';
  
  const posts = {
    id: `posts-${Date.now()}`,
    topic,
    platform,
    contentType,
    variations: []
  };
  
  const platforms = platform === 'all' 
    ? ['twitter', 'instagram', 'linkedin'] 
    : [platform];
  
  for (const p of platforms) {
    const platformSpec = PLATFORMS[p];
    
    posts.variations.push({
      platform: p,
      posts: [
        generatePlatformPost(topic, p, 'educational'),
        generatePlatformPost(topic, p, 'storytelling'),
        generatePlatformPost(topic, p, 'engagement')
      ]
    });
  }
  
  posts.generatedAt = new Date().toISOString();
  
  socialData.posts.push(posts);
  await saveData();
  
  return posts;
}

/**
 * Generate platform-specific post
 */
function generatePlatformPost(topic, platform, type) {
  const spec = PLATFORMS[platform];
  
  const templates = {
    twitter: {
      educational: `5 {topic} lessons that took me years to learn:\n\n1. [LESSON]\n2. [LESSON]\n3. [LESSON]\n4. [LESSON]\n5. [LESSON]\n\nRetweet to save for later.`,
      storytelling: `Last year I knew nothing about {topic}.\n\nNow I [ACHIEVEMENT].\n\nHere's the exact path I took 🧵`,
      engagement: `What's your biggest {topic} challenge right now?\n\n👇 Reply and I'll help you out`
    },
    instagram: {
      educational: `📚 {TOPIC} GUIDE\n\nSave this post for later!\n\n✨ Key point 1\n✨ Key point 2\n✨ Key point 3\n✨ Key point 4\n✨ Key point 5\n\n💬 Which tip will you try first?\n\n#[hashtags]`,
      storytelling: `The {topic} journey nobody sees...\n\n\\n📍 Where I started: [STRUGGLE]\n📍 The turning point: [MOMENT]\n📍 Where I am now: [SUCCESS]\n\nDouble tap if this resonates 💙`,
      engagement: `Let's play a game 🎮\n\nYour {topic} in 3 words. Go!\n\nI'll start: [YOUR ANSWER]\n\n#[hashtags]`
    },
    linkedin: {
      educational: `I've been thinking about {topic} a lot lately.\n\nHere's what I've learned:\n\n1️⃣ [INSIGHT]\n\n2️⃣ [INSIGHT]\n\n3️⃣ [INSIGHT]\n\n4️⃣ [INSIGHT]\n\n5️⃣ [INSIGHT]\n\n—\n\n♻️ Repost if this resonated\n💬 What would you add?`,
      storytelling: `3 years ago, I was [SITUATION].\n\nI had no idea what I was doing with {topic}.\n\nFast forward to today:\n• [ACHIEVEMENT]\n• [ACHIEVEMENT]\n• [ACHIEVEMENT]\n\nThe secret? [KEY INSIGHT]\n\nHere's my advice to anyone starting out:\n\n[ADVICE]`,
      engagement: `Quick poll for my network:\n\nWhen it comes to {topic}, what's your biggest challenge?\n\nA) [OPTION]\nB) [OPTION]\nC) [OPTION]\nD) Something else (comment below)\n\n👇 Vote in the comments!`
    }
  };
  
  return {
    type,
    content: templates[platform]?.[type]?.replace(/{topic}/gi, topic) || `[${type} post about ${topic}]`,
    charCount: templates[platform]?.[type]?.length || 0,
    withinLimit: true,
    hashtags: generateHashtags(topic, spec.hashtagLimit)
  };
}

/**
 * Generate Twitter/X thread
 */
async function generateThread(topic, options = {}) {
  const tweetCount = options.tweets || 7;
  
  const thread = {
    id: `thread-${Date.now()}`,
    topic,
    tweets: []
  };
  
  // Tweet 1: Hook
  thread.tweets.push({
    position: 1,
    type: 'hook',
    content: `The complete {TOPIC} breakdown you've been waiting for:\n\n(Thread 🧵)`.replace('{TOPIC}', topic),
    purpose: 'Stop the scroll, promise value'
  });
  
  // Middle tweets: Value
  for (let i = 2; i < tweetCount; i++) {
    thread.tweets.push({
      position: i,
      type: 'value',
      content: `${i - 1}/ [POINT ABOUT ${topic.toUpperCase()}]\n\nKey insight:\n• [DETAIL]\n• [DETAIL]\n\nWhy this matters: [EXPLANATION]`,
      purpose: 'Deliver on the promise'
    });
  }
  
  // Final tweet: CTA
  thread.tweets.push({
    position: tweetCount,
    type: 'cta',
    content: `${tweetCount - 1}/ That's the ${topic} breakdown!\n\nWant more content like this?\n\n1. Follow @[HANDLE] for daily insights\n2. Retweet tweet #1 to share with others\n3. [ADDITIONAL CTA]\n\nSee you in the next thread! 🙌`,
    purpose: 'Drive engagement and follows'
  });
  
  thread.bestPractices = [
    'Post all tweets within 1-2 minutes',
    'Add images to tweets 1 and 7 for visibility',
    'Reply to comments quickly for algorithm boost',
    'Quote tweet your own thread 2-3 hours later'
  ];
  
  thread.generatedAt = new Date().toISOString();
  
  socialData.threads.push(thread);
  await saveData();
  
  return thread;
}

/**
 * Generate carousel content
 */
async function generateCarousel(topic, options = {}) {
  const slides = options.slides || 10;
  const platform = options.platform || 'instagram';
  
  const carousel = {
    id: `carousel-${Date.now()}`,
    topic,
    platform,
    slides: []
  };
  
  // Slide 1: Cover
  carousel.slides.push({
    position: 1,
    type: 'cover',
    headline: topic.toUpperCase(),
    subheadline: 'Swipe to learn more →',
    design: 'Bold headline, clean background, arrow indicator'
  });
  
  // Content slides
  for (let i = 2; i < slides; i++) {
    carousel.slides.push({
      position: i,
      type: 'content',
      headline: `Point ${i - 1}: [KEY INSIGHT]`,
      body: '[2-3 sentences explaining the point]',
      visual: '[Relevant icon or simple illustration]',
      design: 'Consistent branding, readable text, visual hierarchy'
    });
  }
  
  // Final slide: CTA
  carousel.slides.push({
    position: slides,
    type: 'cta',
    headline: 'Found this helpful?',
    body: '👆 Save this post\n❤️ Like if you learned something\n💬 Comment your thoughts\n📤 Share with a friend\n👤 Follow @[HANDLE] for more',
    design: 'Clean with clear CTAs'
  });
  
  // Caption for carousel
  carousel.caption = {
    hook: `The only ${topic} guide you'll ever need:\n\n`,
    body: `(Swipe through all ${slides} slides 👆)\n\n`,
    callout: `⭐ Key takeaways:\n• [POINT 1]\n• [POINT 2]\n• [POINT 3]\n\n`,
    cta: `Which slide was most helpful? Comment below! 👇\n\n`,
    hashtags: generateHashtags(topic, 15).join(' ')
  };
  
  carousel.generatedAt = new Date().toISOString();
  
  socialData.carousels.push(carousel);
  await saveData();
  
  return carousel;
}

/**
 * Generate captions
 */
async function generateCaptions(context, options = {}) {
  const platform = options.platform || 'instagram';
  const tone = options.tone || 'conversational';
  
  const captions = {
    id: `captions-${Date.now()}`,
    context,
    platform,
    variations: []
  };
  
  // Short version
  captions.variations.push({
    length: 'short',
    caption: `${context}.\n\nThoughts? 👇`,
    charCount: 50,
    bestFor: 'High-quality visual content'
  });
  
  // Medium version
  captions.variations.push({
    length: 'medium',
    caption: `Here's the thing about ${context}...\n\n[KEY INSIGHT]\n\nThis is why it matters:\n• [REASON 1]\n• [REASON 2]\n• [REASON 3]\n\nSave this for later! 📌`,
    charCount: 200,
    bestFor: 'Educational content'
  });
  
  // Long version
  captions.variations.push({
    length: 'long',
    caption: `Let's talk about ${context}.\n\n[HOOK PARAGRAPH]\n\n[STORY/CONTEXT PARAGRAPH]\n\n[VALUE PARAGRAPH WITH BULLET POINTS]\n\n[CALL TO ACTION]\n\n[HASHTAGS]`,
    charCount: 500,
    bestFor: 'Story-driven or in-depth content'
  });
  
  return captions;
}

/**
 * Generate hashtags
 */
function generateHashtags(topic, limit = 10) {
  const words = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').filter(w => w.length > 2);
  
  const hashtags = [
    `#${words.join('')}`,
    `#${words[0]}tips`,
    `#${words[0]}`,
    '#entrepreneur',
    '#growthmindset',
    '#success',
    '#motivation',
    '#businesstips',
    '#digitalmarketing',
    '#onlinebusiness',
    '#contentcreator',
    '#smallbusiness',
    '#mindset',
    '#learning',
    '#goals'
  ];
  
  return hashtags.slice(0, limit);
}

/**
 * Generate optimized hashtags
 */
async function generateOptimizedHashtags(topic, options = {}) {
  const platform = options.platform || 'instagram';
  const count = options.count || 20;
  
  const spec = PLATFORMS[platform];
  const limit = Math.min(count, spec.hashtagLimit);
  
  const categories = {
    niche: generateHashtags(topic, 5),
    broad: ['#business', '#success', '#growth', '#learning', '#mindset'],
    community: ['#entrepreneurlife', '#hustlehard', '#bossbabe', '#solopreneur', '#sidehlustler'],
    trending: ['#fyp', '#viral', '#trending', '#explorepage', '#reels']
  };
  
  return {
    topic,
    platform,
    recommended: [...categories.niche, ...categories.broad.slice(0, 3)].slice(0, limit),
    byCategory: categories,
    strategy: `Use ${Math.floor(limit * 0.5)} niche, ${Math.floor(limit * 0.3)} broad, ${Math.floor(limit * 0.2)} trending`,
    placement: platform === 'instagram' ? 'First comment or end of caption' : 'End of post'
  };
}

/**
 * Generate week of content
 */
async function generateContentSchedule(topic, options = {}) {
  const days = options.days || 7;
  
  const contentTypes = [
    { day: 'Monday', type: 'Educational', theme: 'Tips & tricks', format: 'Carousel/Thread' },
    { day: 'Tuesday', type: 'Story', theme: 'Behind the scenes', format: 'Single post' },
    { day: 'Wednesday', type: 'Value', theme: 'How-to guide', format: 'Thread/Caption' },
    { day: 'Thursday', type: 'Engagement', theme: 'Question/Poll', format: 'Single post' },
    { day: 'Friday', type: 'Authority', theme: 'Industry insights', format: 'Carousel' },
    { day: 'Saturday', type: 'Personal', theme: 'Weekend thoughts', format: 'Story' },
    { day: 'Sunday', type: 'Promo', theme: 'Soft sell', format: 'Single post' }
  ];
  
  const schedule = {
    id: `schedule-${Date.now()}`,
    topic,
    days: days,
    posts: contentTypes.slice(0, days).map((ct, i) => ({
      ...ct,
      dayNumber: i + 1,
      postIdea: `${ct.type} post about ${topic}: ${ct.theme}`,
      suggestedTime: PLATFORMS.instagram.bestTimes[i % 3],
      hashtags: generateHashtags(topic, 10)
    })),
    tips: [
      'Batch create content on one day',
      'Schedule posts in advance',
      'Engage 15 min before and after posting',
      'Repurpose top performers',
      'Mix content types for variety'
    ]
  };
  
  schedule.generatedAt = new Date().toISOString();
  
  socialData.schedules.push(schedule);
  await saveData();
  
  return schedule;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'post': {
        const topic = args.join(' ') || 'productivity';
        const posts = await generateSocialPosts(topic);
        
        console.log('Social Posts Generated');
        console.log('='.repeat(50));
        
        for (const variation of posts.variations) {
          console.log(`\n📱 ${variation.platform.toUpperCase()}`);
          for (const post of variation.posts) {
            console.log(`\n  [${post.type}]`);
            console.log(`  ${post.content.substring(0, 100)}...`);
          }
        }
        break;
      }
      
      case 'thread': {
        const topic = args.join(' ') || 'business lessons';
        const thread = await generateThread(topic);
        
        console.log('Twitter Thread Generated');
        console.log('='.repeat(50));
        
        for (const tweet of thread.tweets) {
          console.log(`\n${tweet.position}/ [${tweet.type}]`);
          console.log(tweet.content.substring(0, 100));
        }
        break;
      }
      
      case 'carousel': {
        const topic = args.join(' ') || 'marketing tips';
        const carousel = await generateCarousel(topic);
        
        console.log('Carousel Content Generated');
        console.log('='.repeat(50));
        
        for (const slide of carousel.slides) {
          console.log(`\n📄 Slide ${slide.position}: ${slide.type}`);
          console.log(`   ${slide.headline}`);
        }
        break;
      }
      
      case 'caption': {
        const context = args.join(' ') || 'new product launch';
        const captions = await generateCaptions(context);
        
        console.log('Captions Generated');
        console.log('='.repeat(50));
        
        for (const v of captions.variations) {
          console.log(`\n[${v.length}] Best for: ${v.bestFor}`);
        }
        break;
      }
      
      case 'hashtags': {
        const topic = args.join(' ') || 'entrepreneurship';
        const result = await generateOptimizedHashtags(topic);
        
        console.log('Hashtags Generated');
        console.log('='.repeat(50));
        console.log('\nRecommended:');
        console.log(result.recommended.join(' '));
        console.log(`\nStrategy: ${result.strategy}`);
        break;
      }
      
      case 'schedule': {
        const topic = args.join(' ') || 'personal brand';
        const schedule = await generateContentSchedule(topic);
        
        console.log('Content Schedule Generated');
        console.log('='.repeat(50));
        
        for (const post of schedule.posts) {
          console.log(`\n${post.day}: ${post.type} (${post.format})`);
          console.log(`  ${post.postIdea}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Social Content Module');
        console.log('=====================');
        console.log(`Platforms: ${Object.keys(PLATFORMS).length}`);
        console.log(`Post templates: ${Object.keys(POST_TEMPLATES).length}`);
        console.log(`Hook types: ${Object.keys(SOCIAL_HOOKS).length}`);
        console.log(`Posts created: ${socialData.posts.length}`);
        break;
      }
      
      default:
        console.log('Social Content - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  generateSocialPosts,
  generateThread,
  generateCarousel,
  generateCaptions,
  generateOptimizedHashtags,
  generateContentSchedule,
  PLATFORMS,
  POST_TEMPLATES,
  SOCIAL_HOOKS
};

// Run CLI
main().catch(console.error);
