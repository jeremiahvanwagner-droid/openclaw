#!/usr/bin/env node
/**
 * OpenClaw Social Distributor Agent
 * 
 * Distribution Division - Multi-platform content distribution
 * 
 * Features:
 *   - Cross-platform posting
 *   - Platform-specific formatting
 *   - Scheduling and queuing
 *   - Hashtag optimization
 *   - Engagement tracking
 *   - Auto-reposts
 * 
 * Usage: node social-distributor.mjs <command> [args...]
 * 
 * Commands:
 *   distribute <content>      Distribute to platforms
 *   format <platform>         Format for platform
 *   schedule <content>        Schedule posts
 *   queue <action>            Manage post queue
 *   crosspost <content>       Cross-post with formatting
 *   analytics <platform>      Get distribution analytics
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const DISTRIBUTOR_FILE = path.join(DATA_DIR, 'distributor-data.json');

// Platform specifications
const PLATFORMS = {
  twitter: {
    name: 'Twitter/X',
    maxLength: 280,
    mediaTypes: ['image', 'gif', 'video'],
    maxImages: 4,
    maxVideoLength: 140,
    features: ['threads', 'polls', 'spaces'],
    hashtagLimit: 3,
    bestPractices: [
      'Use 1-2 hashtags max',
      'Include visuals for 2x engagement',
      'Thread for longer content',
      'Engage in replies'
    ]
  },
  instagram: {
    name: 'Instagram',
    maxLength: 2200,
    mediaTypes: ['image', 'video', 'carousel', 'reel', 'story'],
    maxImages: 10,
    maxVideoLength: 60,
    features: ['reels', 'stories', 'carousels', 'guides'],
    hashtagLimit: 30,
    bestPractices: [
      'Use 5-10 strategic hashtags',
      'First line = hook',
      'Add line breaks',
      'Use carousel for higher reach'
    ]
  },
  linkedin: {
    name: 'LinkedIn',
    maxLength: 3000,
    mediaTypes: ['image', 'video', 'document', 'poll'],
    maxImages: 9,
    maxVideoLength: 600,
    features: ['articles', 'newsletters', 'polls', 'documents'],
    hashtagLimit: 5,
    bestPractices: [
      'Use 3-5 hashtags',
      'Professional tone',
      'Hook in first 2 lines',
      'Add line breaks'
    ]
  },
  facebook: {
    name: 'Facebook',
    maxLength: 63206,
    mediaTypes: ['image', 'video', 'link', 'story', 'reel'],
    maxImages: 10,
    maxVideoLength: 240,
    features: ['groups', 'pages', 'reels', 'stories', 'live'],
    hashtagLimit: 3,
    bestPractices: [
      'Minimal hashtags',
      'Native video preferred',
      'Engage in groups',
      'Ask questions'
    ]
  },
  tiktok: {
    name: 'TikTok',
    maxLength: 2200,
    mediaTypes: ['video'],
    maxVideoLength: 180,
    features: ['duets', 'stitches', 'live', 'series'],
    hashtagLimit: 5,
    bestPractices: [
      'Hook in first 3 seconds',
      'Trending sounds',
      'Native style',
      'Post consistently'
    ]
  },
  youtube: {
    name: 'YouTube',
    maxLength: 5000,
    mediaTypes: ['video', 'shorts', 'live'],
    maxVideoLength: 43200,
    features: ['shorts', 'community', 'live', 'premieres'],
    hashtagLimit: 3,
    bestPractices: [
      'SEO-optimized titles',
      'Custom thumbnails',
      'End screens',
      'Consistent schedule'
    ]
  },
  pinterest: {
    name: 'Pinterest',
    maxLength: 500,
    mediaTypes: ['image', 'video', 'idea-pin'],
    features: ['boards', 'idea-pins', 'shopping'],
    hashtagLimit: 5,
    bestPractices: [
      'Vertical images (2:3)',
      'Keyword-rich descriptions',
      'Rich pins enabled',
      'Pin consistently'
    ]
  }
};

// Content transformation rules
const TRANSFORMATION_RULES = {
  longToShort: {
    blog: ['twitter-thread', 'linkedin-post', 'carousel'],
    video: ['shorts', 'reels', 'tiktok', 'clips'],
    podcast: ['audiograms', 'quotes', 'clips']
  },
  formatMapping: {
    text: {
      twitter: 'tweet/thread',
      linkedin: 'text-post',
      instagram: 'caption',
      facebook: 'post'
    },
    image: {
      instagram: 'post/carousel',
      pinterest: 'pin',
      twitter: 'image-tweet',
      linkedin: 'image-post'
    },
    video: {
      youtube: 'video/short',
      tiktok: 'tiktok',
      instagram: 'reel/story',
      linkedin: 'native-video'
    }
  }
};

// Queue statuses
const QUEUE_STATUSES = {
  draft: 'Content created, not scheduled',
  scheduled: 'Scheduled for posting',
  pending: 'Awaiting approval',
  posted: 'Successfully published',
  failed: 'Failed to post',
  archived: 'Removed from queue'
};

// Data storage
let distributorData = {
  posts: [],
  queue: [],
  analytics: {}
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(DISTRIBUTOR_FILE, 'utf8');
    distributorData = JSON.parse(data);
  } catch {
    distributorData = { posts: [], queue: [], analytics: {} };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(DISTRIBUTOR_FILE, JSON.stringify(distributorData, null, 2));
}

/**
 * Distribute content to platforms
 */
async function distributeContent(content, options = {}) {
  const platforms = options.platforms || ['twitter', 'linkedin'];
  const scheduleTime = options.scheduleTime || null;
  
  const distribution = {
    id: `dist-${Date.now()}`,
    originalContent: content,
    platforms: {},
    status: 'created'
  };
  
  for (const platform of platforms) {
    const formatted = await formatForPlatform(content, platform, options);
    distribution.platforms[platform] = {
      content: formatted.content,
      hashtags: formatted.hashtags,
      mediaRequirements: formatted.mediaRequirements,
      status: scheduleTime ? 'scheduled' : 'ready',
      scheduledFor: scheduleTime
    };
  }
  
  distribution.summary = {
    platformCount: platforms.length,
    scheduledTime: scheduleTime,
    estimatedReach: calculateEstimatedReach(platforms)
  };
  
  distribution.generatedAt = new Date().toISOString();
  
  distributorData.posts.push(distribution);
  await saveData();
  
  return distribution;
}

/**
 * Format content for specific platform
 */
async function formatForPlatform(content, platform, options = {}) {
  const spec = PLATFORMS[platform.toLowerCase()];
  
  if (!spec) {
    return {
      error: `Unknown platform: ${platform}`,
      available: Object.keys(PLATFORMS)
    };
  }
  
  const formatted = {
    platform,
    original: content,
    content: '',
    hashtags: [],
    mediaRequirements: {}
  };
  
  // Truncate if needed
  let processedContent = content;
  if (content.length > spec.maxLength) {
    if (platform === 'twitter') {
      // Create thread indication
      formatted.isThread = true;
      formatted.threadParts = splitIntoThread(content, spec.maxLength);
      processedContent = formatted.threadParts[0] + '... (1/' + formatted.threadParts.length + ')';
    } else {
      processedContent = content.substring(0, spec.maxLength - 3) + '...';
    }
  }
  
  // Platform-specific formatting
  switch (platform.toLowerCase()) {
    case 'twitter':
      formatted.content = processedContent;
      formatted.hashtags = extractHashtags(content).slice(0, spec.hashtagLimit);
      formatted.mediaRequirements = {
        recommended: 'Image or GIF for 2x engagement',
        maxImages: spec.maxImages,
        imageSize: '1200x675px'
      };
      break;
      
    case 'instagram':
      formatted.content = addLineBreaks(processedContent);
      formatted.hashtags = generateInstagramHashtags(content, options.niche);
      formatted.mediaRequirements = {
        required: 'Image, carousel, or video required',
        feedSize: '1080x1080px or 1080x1350px',
        storySize: '1080x1920px',
        reelSize: '1080x1920px'
      };
      break;
      
    case 'linkedin':
      formatted.content = addProfessionalFormatting(processedContent);
      formatted.hashtags = extractHashtags(content).slice(0, spec.hashtagLimit);
      formatted.mediaRequirements = {
        recommended: 'Document carousel or image',
        imageSize: '1200x627px',
        documentFormat: 'PDF for carousels'
      };
      break;
      
    case 'facebook':
      formatted.content = processedContent;
      formatted.hashtags = extractHashtags(content).slice(0, spec.hashtagLimit);
      formatted.mediaRequirements = {
        recommended: 'Native video or image',
        imageSize: '1200x630px',
        videoFormat: 'MP4 preferred'
      };
      break;
      
    case 'tiktok':
      formatted.content = processedContent;
      formatted.hashtags = generateTikTokHashtags(content);
      formatted.mediaRequirements = {
        required: 'Video required',
        size: '1080x1920px',
        length: 'Under 60s recommended',
        sound: 'Trending sound recommended'
      };
      break;
      
    case 'youtube':
      formatted.content = processedContent;
      formatted.seoTitle = generateYouTubeTitle(content);
      formatted.description = processedContent;
      formatted.hashtags = extractHashtags(content).slice(0, spec.hashtagLimit);
      formatted.mediaRequirements = {
        thumbnail: '1280x720px',
        endScreen: 'Add end screens',
        cards: 'Add info cards'
      };
      break;
      
    case 'pinterest':
      formatted.content = processedContent;
      formatted.hashtags = extractHashtags(content).slice(0, spec.hashtagLimit);
      formatted.mediaRequirements = {
        size: '1000x1500px (2:3 ratio)',
        format: 'Vertical images',
        text: 'Text overlay recommended'
      };
      break;
  }
  
  formatted.bestPractices = spec.bestPractices;
  
  return formatted;
}

/**
 * Split content into Twitter thread
 */
function splitIntoThread(content, maxLength) {
  const sentences = content.split(/(?<=[.!?])\s+/);
  const parts = [];
  let currentPart = '';
  
  for (const sentence of sentences) {
    if ((currentPart + ' ' + sentence).length > maxLength - 10) {
      parts.push(currentPart.trim());
      currentPart = sentence;
    } else {
      currentPart += ' ' + sentence;
    }
  }
  
  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }
  
  return parts;
}

/**
 * Extract hashtags from content
 */
function extractHashtags(content) {
  const matches = content.match(/#\w+/g) || [];
  return matches.map(tag => tag.toLowerCase());
}

/**
 * Generate Instagram hashtags
 */
function generateInstagramHashtags(content, niche = 'general') {
  const baseHashtags = ['#contentcreator', '#digitalmarketing', '#entrepreneur'];
  const nicheHashtags = {
    general: ['#motivation', '#success', '#mindset'],
    coaching: ['#coaching', '#lifecoach', '#transformation'],
    business: ['#business', '#entrepreneurship', '#startup'],
    fitness: ['#fitness', '#health', '#wellness']
  };
  
  return [...baseHashtags, ...(nicheHashtags[niche] || nicheHashtags.general)];
}

/**
 * Generate TikTok hashtags
 */
function generateTikTokHashtags(content) {
  return ['#fyp', '#foryou', '#viral', '#trending', '#tiktok'];
}

/**
 * Generate YouTube title
 */
function generateYouTubeTitle(content) {
  const firstSentence = content.split(/[.!?]/)[0];
  if (firstSentence.length <= 60) {
    return firstSentence;
  }
  return firstSentence.substring(0, 57) + '...';
}

/**
 * Add line breaks for readability
 */
function addLineBreaks(content) {
  return content.replace(/\. /g, '.\n\n');
}

/**
 * Add professional LinkedIn formatting
 */
function addProfessionalFormatting(content) {
  let formatted = content;
  
  // Add hook separator
  const firstSentence = content.split(/[.!?]/)[0];
  formatted = firstSentence + '.\n\n' + content.substring(firstSentence.length + 2);
  
  // Add bullet points for lists
  formatted = formatted.replace(/^\d+\./gm, '→');
  
  return formatted;
}

/**
 * Calculate estimated reach
 */
function calculateEstimatedReach(platforms) {
  const reachMultipliers = {
    twitter: 1000,
    instagram: 2000,
    linkedin: 500,
    facebook: 1500,
    tiktok: 5000,
    youtube: 3000,
    pinterest: 800
  };
  
  return platforms.reduce((total, p) => total + (reachMultipliers[p] || 500), 0);
}

/**
 * Schedule content
 */
async function scheduleContent(content, scheduleConfig) {
  const schedule = {
    id: `sched-${Date.now()}`,
    content,
    platforms: scheduleConfig.platforms || ['twitter', 'linkedin'],
    times: scheduleConfig.times || [],
    status: 'scheduled'
  };
  
  // Generate optimal times if not provided
  if (schedule.times.length === 0) {
    schedule.times = generateOptimalTimes(schedule.platforms);
  }
  
  schedule.queueItems = [];
  
  for (const platform of schedule.platforms) {
    for (const time of schedule.times) {
      const formatted = await formatForPlatform(content, platform);
      
      schedule.queueItems.push({
        platform,
        content: formatted.content,
        scheduledFor: time,
        status: 'queued'
      });
    }
  }
  
  distributorData.queue.push(...schedule.queueItems);
  await saveData();
  
  return schedule;
}

/**
 * Generate optimal posting times
 */
function generateOptimalTimes(platforms) {
  const times = [];
  const now = new Date();
  
  // Schedule for next 7 days at optimal times
  for (let day = 1; day <= 7; day++) {
    const date = new Date(now);
    date.setDate(now.getDate() + day);
    
    // Morning slot
    date.setHours(9, 0, 0, 0);
    times.push(new Date(date).toISOString());
    
    // Afternoon slot
    date.setHours(14, 0, 0, 0);
    times.push(new Date(date).toISOString());
  }
  
  return times.slice(0, platforms.length * 3);
}

/**
 * Manage queue
 */
async function manageQueue(action, params = {}) {
  switch (action) {
    case 'list':
      return {
        queue: distributorData.queue,
        count: distributorData.queue.length,
        byStatus: groupByStatus(distributorData.queue)
      };
      
    case 'clear':
      const cleared = distributorData.queue.length;
      distributorData.queue = [];
      await saveData();
      return { cleared, message: 'Queue cleared' };
      
    case 'remove':
      const index = distributorData.queue.findIndex(item => item.id === params.id);
      if (index > -1) {
        distributorData.queue.splice(index, 1);
        await saveData();
        return { removed: true };
      }
      return { removed: false, message: 'Item not found' };
      
    default:
      return { error: 'Unknown action', available: ['list', 'clear', 'remove'] };
  }
}

/**
 * Group by status
 */
function groupByStatus(items) {
  return items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Cross-post with automatic formatting
 */
async function crossPost(content, options = {}) {
  const platforms = options.platforms || Object.keys(PLATFORMS);
  const strategy = options.strategy || 'adaptive';
  
  const crosspost = {
    id: `cross-${Date.now()}`,
    original: content,
    strategy,
    posts: {}
  };
  
  for (const platform of platforms) {
    const formatted = await formatForPlatform(content, platform, options);
    crosspost.posts[platform] = {
      ...formatted,
      optimized: true
    };
  }
  
  crosspost.summary = {
    platforms: platforms.length,
    totalHashtags: Object.values(crosspost.posts)
      .reduce((acc, p) => acc + (p.hashtags?.length || 0), 0),
    ready: true
  };
  
  return crosspost;
}

/**
 * Get distribution analytics
 */
async function getAnalytics(platform, dateRange = '7d') {
  // Simulated analytics
  const analytics = {
    platform,
    dateRange,
    metrics: {
      totalPosts: Math.floor(Math.random() * 50) + 10,
      totalReach: Math.floor(Math.random() * 10000) + 1000,
      totalEngagements: Math.floor(Math.random() * 500) + 50,
      engagementRate: (Math.random() * 5 + 1).toFixed(2) + '%',
      clicks: Math.floor(Math.random() * 200) + 20
    },
    topPerformingContent: [
      { type: 'image', engagementRate: '4.5%', reach: 2500 },
      { type: 'video', engagementRate: '6.2%', reach: 4000 },
      { type: 'text', engagementRate: '2.1%', reach: 1000 }
    ],
    recommendations: [
      'Post more video content for higher engagement',
      'Best posting time: 9 AM and 2 PM',
      'Use 2-3 hashtags for optimal reach'
    ]
  };
  
  return analytics;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'distribute': {
        const content = args.join(' ') || 'Check out our new product!';
        const distribution = await distributeContent(content, {
          platforms: ['twitter', 'linkedin', 'instagram']
        });
        
        console.log('Content Distribution');
        console.log('='.repeat(50));
        console.log(`ID: ${distribution.id}`);
        console.log(`Platforms: ${Object.keys(distribution.platforms).length}`);
        
        for (const [platform, data] of Object.entries(distribution.platforms)) {
          console.log(`\n${platform}:`);
          console.log(`  Status: ${data.status}`);
          console.log(`  Hashtags: ${data.hashtags.join(', ')}`);
        }
        break;
      }
      
      case 'format': {
        const platform = args[0] || 'twitter';
        const content = args.slice(1).join(' ') || 'Sample content for formatting';
        const formatted = await formatForPlatform(content, platform);
        
        console.log(`Formatted for ${platform}`);
        console.log('='.repeat(50));
        console.log(`Content: ${formatted.content}`);
        console.log(`Hashtags: ${formatted.hashtags?.join(', ')}`);
        console.log(`\nBest Practices:`);
        for (const tip of formatted.bestPractices || []) {
          console.log(`  • ${tip}`);
        }
        break;
      }
      
      case 'schedule': {
        const content = args.join(' ') || 'Scheduled post content';
        const schedule = await scheduleContent(content, {
          platforms: ['twitter', 'linkedin']
        });
        
        console.log('Content Scheduled');
        console.log('='.repeat(50));
        console.log(`ID: ${schedule.id}`);
        console.log(`Queue items: ${schedule.queueItems.length}`);
        console.log(`\nFirst 3 scheduled:`);
        for (const item of schedule.queueItems.slice(0, 3)) {
          console.log(`  • ${item.platform}: ${item.scheduledFor}`);
        }
        break;
      }
      
      case 'queue': {
        const action = args[0] || 'list';
        const result = await manageQueue(action);
        
        console.log('Queue Management');
        console.log('='.repeat(50));
        
        if (result.queue) {
          console.log(`Total items: ${result.count}`);
          console.log(`\nBy status:`);
          for (const [status, count] of Object.entries(result.byStatus)) {
            console.log(`  ${status}: ${count}`);
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'crosspost': {
        const content = args.join(' ') || 'Cross-posting content';
        const crosspost = await crossPost(content, {
          platforms: ['twitter', 'linkedin', 'instagram']
        });
        
        console.log('Cross-Post Generated');
        console.log('='.repeat(50));
        console.log(`Platforms: ${crosspost.summary.platforms}`);
        
        for (const [platform, data] of Object.entries(crosspost.posts)) {
          console.log(`\n${platform}:`);
          console.log(`  Length: ${data.content?.length || 0} chars`);
        }
        break;
      }
      
      case 'analytics': {
        const platform = args[0] || 'twitter';
        const analytics = await getAnalytics(platform);
        
        console.log(`Analytics: ${analytics.platform}`);
        console.log('='.repeat(50));
        console.log(`Posts: ${analytics.metrics.totalPosts}`);
        console.log(`Reach: ${analytics.metrics.totalReach}`);
        console.log(`Engagement: ${analytics.metrics.engagementRate}`);
        break;
      }
      
      case 'test': {
        console.log('Social Distributor Module');
        console.log('=========================');
        console.log(`Platforms: ${Object.keys(PLATFORMS).length}`);
        console.log(`Queue: ${distributorData.queue.length} items`);
        console.log(`Posts: ${distributorData.posts.length}`);
        break;
      }
      
      default:
        console.log('Social Distributor - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  distributeContent,
  formatForPlatform,
  scheduleContent,
  manageQueue,
  crossPost,
  getAnalytics,
  PLATFORMS,
  TRANSFORMATION_RULES,
  QUEUE_STATUSES
};

// Run CLI
main().catch(console.error);
