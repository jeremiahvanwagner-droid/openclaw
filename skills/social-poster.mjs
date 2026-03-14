#!/usr/bin/env node
/**
 * OpenClaw Social Poster
 * 
 * Native posting to Facebook, Instagram, and TikTok
 * 
 * Features:
 *   - Multi-platform posting (FB, IG, TikTok)
 *   - Scheduled posting with queue
 *   - Best time optimization
 *   - Hashtag management
 *   - Media handling
 *   - Analytics tracking
 * 
 * Usage: node social-poster.mjs <command> [args...]
 * 
 * Commands:
 *   post <platform> <content> [media]   Post content immediately
 *   schedule <platform> <content> <time> Schedule post
 *   queue                               Show post queue
 *   best-times <platform>               Get optimal posting times
 *   hashtags <topic>                    Generate hashtags
 *   analytics <platform> [days]         Get posting analytics
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const POSTS_FILE = path.join(DATA_DIR, 'social-posts.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'social-schedule.json');

// API Tokens (from environment)
const TOKENS = {
  meta: {
    accessToken: process.env.META_ACCESS_TOKEN || '',
    pageId: process.env.META_PAGE_ID || '',
    igUserId: process.env.META_IG_USER_ID || ''
  },
  tiktok: {
    accessToken: process.env.TIKTOK_ACCESS_TOKEN || '',
    openId: process.env.TIKTOK_OPEN_ID || ''
  }
};

// Platform configurations
const PLATFORMS = {
  facebook: {
    name: 'Facebook',
    maxLength: 63206,
    mediaTypes: ['image', 'video', 'link'],
    hashtagLimit: 30,
    bestTimes: [9, 13, 16], // Hours in local time
    apiBase: 'https://graph.facebook.com/v18.0'
  },
  instagram: {
    name: 'Instagram',
    maxLength: 2200,
    mediaTypes: ['image', 'video', 'carousel'],
    hashtagLimit: 30,
    bestTimes: [7, 12, 17, 21],
    apiBase: 'https://graph.facebook.com/v18.0'
  },
  tiktok: {
    name: 'TikTok',
    maxLength: 2200,
    mediaTypes: ['video'],
    hashtagLimit: 100,
    bestTimes: [7, 10, 19, 23],
    apiBase: 'https://open.tiktokapis.com/v2'
  }
};

// Hashtag database
const HASHTAG_DB = {
  'business': ['#business', '#entrepreneur', '#success', '#motivation', '#hustle', '#startup', '#money', '#wealth', '#mindset', '#goals'],
  'marketing': ['#marketing', '#digitalmarketing', '#socialmedia', '#branding', '#contentmarketing', '#marketingtips', '#growth', '#strategy'],
  'education': ['#education', '#learning', '#knowledge', '#study', '#teaching', '#onlinelearning', '#elearning', '#course', '#training'],
  'motivation': ['#motivation', '#inspiration', '#success', '#mindset', '#goals', '#dreams', '#nevergiveup', '#believe', '#positivity'],
  'lifestyle': ['#lifestyle', '#life', '#happy', '#love', '#instagood', '#beautiful', '#photooftheday', '#style', '#fashion'],
  'fitness': ['#fitness', '#workout', '#gym', '#health', '#fitnessmotivation', '#training', '#exercise', '#fit', '#healthy'],
  'tech': ['#technology', '#tech', '#innovation', '#ai', '#digital', '#future', '#coding', '#software', '#data', '#automation'],
  'sales': ['#sales', '#selling', '#salestraining', '#closingdeals', '#revenue', '#b2b', '#leads', '#conversion', '#pipeline']
};

// Post data
let postsData = { posts: [], scheduled: [], analytics: {} };

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    postsData = JSON.parse(data);
  } catch {
    postsData = { posts: [], scheduled: [], analytics: {} };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(POSTS_FILE, JSON.stringify(postsData, null, 2));
}

/**
 * Make API request
 */
function apiRequest(url, method, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Post to Facebook
 */
async function postToFacebook(content, mediaUrl = null, published = true) {
  if (!TOKENS.meta.accessToken || !TOKENS.meta.pageId) {
    return { success: false, error: 'Facebook credentials not configured' };
  }
  
  const platform = PLATFORMS.facebook;
  const truncatedContent = content.substring(0, platform.maxLength);
  
  let endpoint = `${platform.apiBase}/${TOKENS.meta.pageId}/feed`;
  let postData = {
    message: truncatedContent,
    access_token: TOKENS.meta.accessToken,
    published: published
  };
  
  if (mediaUrl) {
    if (mediaUrl.endsWith('.mp4') || mediaUrl.includes('video')) {
      endpoint = `${platform.apiBase}/${TOKENS.meta.pageId}/videos`;
      postData.file_url = mediaUrl;
    } else {
      endpoint = `${platform.apiBase}/${TOKENS.meta.pageId}/photos`;
      postData.url = mediaUrl;
    }
  }
  
  try {
    const result = await apiRequest(endpoint, 'POST', postData);
    
    const postRecord = {
      id: result.id || `fb-${Date.now()}`,
      platform: 'facebook',
      content: truncatedContent,
      mediaUrl,
      postedAt: new Date().toISOString(),
      status: result.id ? 'published' : 'failed',
      response: result
    };
    
    postsData.posts.push(postRecord);
    await saveData();
    
    return { success: !!result.id, postId: result.id, post: postRecord };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Post to Instagram
 */
async function postToInstagram(content, mediaUrl, mediaType = 'IMAGE') {
  if (!TOKENS.meta.accessToken || !TOKENS.meta.igUserId) {
    return { success: false, error: 'Instagram credentials not configured' };
  }
  
  if (!mediaUrl) {
    return { success: false, error: 'Instagram requires media for posts' };
  }
  
  const platform = PLATFORMS.instagram;
  const truncatedContent = content.substring(0, platform.maxLength);
  
  try {
    // Step 1: Create media container
    const containerEndpoint = `${platform.apiBase}/${TOKENS.meta.igUserId}/media`;
    const containerData = {
      caption: truncatedContent,
      access_token: TOKENS.meta.accessToken
    };
    
    if (mediaType === 'VIDEO') {
      containerData.media_type = 'REELS';
      containerData.video_url = mediaUrl;
    } else {
      containerData.image_url = mediaUrl;
    }
    
    const containerResult = await apiRequest(containerEndpoint, 'POST', containerData);
    
    if (!containerResult.id) {
      return { success: false, error: 'Failed to create media container', response: containerResult };
    }
    
    // Step 2: Publish the container
    const publishEndpoint = `${platform.apiBase}/${TOKENS.meta.igUserId}/media_publish`;
    const publishData = {
      creation_id: containerResult.id,
      access_token: TOKENS.meta.accessToken
    };
    
    const publishResult = await apiRequest(publishEndpoint, 'POST', publishData);
    
    const postRecord = {
      id: publishResult.id || `ig-${Date.now()}`,
      platform: 'instagram',
      content: truncatedContent,
      mediaUrl,
      mediaType,
      postedAt: new Date().toISOString(),
      status: publishResult.id ? 'published' : 'failed',
      response: publishResult
    };
    
    postsData.posts.push(postRecord);
    await saveData();
    
    return { success: !!publishResult.id, postId: publishResult.id, post: postRecord };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Post to TikTok
 */
async function postToTikTok(content, videoUrl) {
  if (!TOKENS.tiktok.accessToken || !TOKENS.tiktok.openId) {
    return { success: false, error: 'TikTok credentials not configured' };
  }
  
  if (!videoUrl) {
    return { success: false, error: 'TikTok requires video for posts' };
  }
  
  const platform = PLATFORMS.tiktok;
  const truncatedContent = content.substring(0, platform.maxLength);
  
  try {
    // TikTok Content Posting API
    const endpoint = `${platform.apiBase}/post/publish/video/init/`;
    const postData = {
      post_info: {
        title: truncatedContent,
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl
      }
    };
    
    const result = await apiRequest(endpoint, 'POST', postData, {
      'Authorization': `Bearer ${TOKENS.tiktok.accessToken}`
    });
    
    const postRecord = {
      id: result.data?.publish_id || `tt-${Date.now()}`,
      platform: 'tiktok',
      content: truncatedContent,
      mediaUrl: videoUrl,
      postedAt: new Date().toISOString(),
      status: result.data?.publish_id ? 'processing' : 'failed',
      response: result
    };
    
    postsData.posts.push(postRecord);
    await saveData();
    
    return { success: !!result.data?.publish_id, publishId: result.data?.publish_id, post: postRecord };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Universal post function
 */
async function post(platform, content, mediaUrl = null, mediaType = 'IMAGE') {
  platform = platform.toLowerCase();
  
  if (!PLATFORMS[platform]) {
    return { success: false, error: `Unknown platform: ${platform}. Supported: ${Object.keys(PLATFORMS).join(', ')}` };
  }
  
  switch (platform) {
    case 'facebook':
      return postToFacebook(content, mediaUrl);
    case 'instagram':
      return postToInstagram(content, mediaUrl, mediaType);
    case 'tiktok':
      return postToTikTok(content, mediaUrl);
    default:
      return { success: false, error: `Posting not implemented for ${platform}` };
  }
}

/**
 * Schedule post
 */
async function schedulePost(platform, content, scheduledTime, mediaUrl = null, mediaType = 'IMAGE') {
  platform = platform.toLowerCase();
  
  if (!PLATFORMS[platform]) {
    return { success: false, error: `Unknown platform: ${platform}` };
  }
  
  const scheduledDate = new Date(scheduledTime);
  if (isNaN(scheduledDate.getTime())) {
    return { success: false, error: `Invalid date: ${scheduledTime}` };
  }
  
  if (scheduledDate <= new Date()) {
    return { success: false, error: 'Scheduled time must be in the future' };
  }
  
  const scheduledPost = {
    id: `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    platform,
    content,
    mediaUrl,
    mediaType,
    scheduledFor: scheduledDate.toISOString(),
    createdAt: new Date().toISOString(),
    status: 'scheduled'
  };
  
  postsData.scheduled.push(scheduledPost);
  await saveData();
  
  console.log(`Scheduled: ${scheduledPost.id} for ${scheduledDate.toLocaleString()}`);
  return { success: true, scheduledPost };
}

/**
 * Get scheduled posts queue
 */
function getQueue() {
  return postsData.scheduled
    .filter(p => p.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
    .map(p => ({
      id: p.id,
      platform: p.platform,
      content: p.content.substring(0, 50) + '...',
      scheduledFor: new Date(p.scheduledFor).toLocaleString(),
      hasMedia: !!p.mediaUrl
    }));
}

/**
 * Process scheduled posts
 */
async function processScheduledPosts() {
  const now = new Date();
  const duePost = postsData.scheduled.filter(
    p => p.status === 'scheduled' && new Date(p.scheduledFor) <= now
  );
  
  const results = [];
  
  for (const scheduled of duePost) {
    const result = await post(scheduled.platform, scheduled.content, scheduled.mediaUrl, scheduled.mediaType);
    
    scheduled.status = result.success ? 'published' : 'failed';
    scheduled.publishedAt = now.toISOString();
    scheduled.result = result;
    
    results.push({
      id: scheduled.id,
      platform: scheduled.platform,
      success: result.success,
      error: result.error
    });
  }
  
  if (results.length > 0) {
    await saveData();
  }
  
  return results;
}

/**
 * Get best posting times
 */
function getBestTimes(platform) {
  platform = platform.toLowerCase();
  const config = PLATFORMS[platform];
  
  if (!config) {
    return { success: false, error: `Unknown platform: ${platform}` };
  }
  
  const now = new Date();
  const times = config.bestTimes.map(hour => {
    const date = new Date(now);
    date.setHours(hour, 0, 0, 0);
    
    // If time has passed today, use tomorrow
    if (date <= now) {
      date.setDate(date.getDate() + 1);
    }
    
    return {
      hour: `${hour}:00`,
      recommended: hour >= 9 && hour <= 17 ? 'high' : 'medium',
      nextSlot: date.toLocaleString()
    };
  });
  
  return {
    success: true,
    platform: config.name,
    bestTimes: times,
    tip: platform === 'instagram' 
      ? 'Post when your audience is most active. Check Insights for personalized data.'
      : platform === 'tiktok'
        ? 'TikTok users are most active in mornings and late evenings.'
        : 'Facebook engagement peaks during lunch and early evening.'
  };
}

/**
 * Generate hashtags
 */
function generateHashtags(topic, count = 10) {
  const topicLower = topic.toLowerCase();
  let hashtags = [];
  
  // Get topic-specific hashtags
  for (const [key, tags] of Object.entries(HASHTAG_DB)) {
    if (topicLower.includes(key) || key.includes(topicLower)) {
      hashtags = hashtags.concat(tags);
    }
  }
  
  // Add generic popular hashtags if needed
  if (hashtags.length < count) {
    hashtags = hashtags.concat([
      '#viral', '#trending', '#explore', '#fyp', '#foryou', '#follow', '#like', '#share'
    ]);
  }
  
  // Remove duplicates and limit
  hashtags = [...new Set(hashtags)].slice(0, count);
  
  return {
    success: true,
    topic,
    hashtags,
    formatted: hashtags.join(' '),
    count: hashtags.length
  };
}

/**
 * Get posting analytics
 */
function getAnalytics(platform = null, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  let posts = postsData.posts.filter(p => new Date(p.postedAt) >= cutoff);
  
  if (platform) {
    posts = posts.filter(p => p.platform === platform.toLowerCase());
  }
  
  const analytics = {
    period: `Last ${days} days`,
    totalPosts: posts.length,
    byPlatform: {},
    byStatus: {},
    byDay: {},
    successRate: 0
  };
  
  for (const post of posts) {
    // By platform
    analytics.byPlatform[post.platform] = (analytics.byPlatform[post.platform] || 0) + 1;
    
    // By status
    analytics.byStatus[post.status] = (analytics.byStatus[post.status] || 0) + 1;
    
    // By day
    const day = post.postedAt.split('T')[0];
    analytics.byDay[day] = (analytics.byDay[day] || 0) + 1;
  }
  
  const published = analytics.byStatus['published'] || 0;
  analytics.successRate = posts.length > 0 
    ? ((published / posts.length) * 100).toFixed(1) + '%'
    : 'N/A';
  
  return analytics;
}

/**
 * Cancel scheduled post
 */
async function cancelScheduled(postId) {
  const index = postsData.scheduled.findIndex(p => p.id === postId);
  
  if (index === -1) {
    return { success: false, error: `Scheduled post not found: ${postId}` };
  }
  
  postsData.scheduled[index].status = 'cancelled';
  await saveData();
  
  return { success: true, message: `Cancelled: ${postId}` };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'post': {
        const platform = args[0];
        const content = args[1];
        const mediaUrl = args[2];
        const mediaType = args[3] || 'IMAGE';
        
        if (!platform || !content) {
          console.error('Usage: post <platform> <content> [mediaUrl] [mediaType]');
          console.error('Platforms:', Object.keys(PLATFORMS).join(', '));
          process.exit(1);
        }
        
        const result = await post(platform, content, mediaUrl, mediaType);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'schedule': {
        const platform = args[0];
        const content = args[1];
        const time = args[2];
        const mediaUrl = args[3];
        
        if (!platform || !content || !time) {
          console.error('Usage: schedule <platform> <content> <time> [mediaUrl]');
          console.error('Time format: ISO 8601 (e.g., 2024-03-15T14:00:00)');
          process.exit(1);
        }
        
        const result = await schedulePost(platform, content, time, mediaUrl);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'queue': {
        const queue = getQueue();
        console.log('Scheduled Posts Queue');
        console.log('='.repeat(60));
        if (queue.length === 0) {
          console.log('No scheduled posts');
        } else {
          for (const post of queue) {
            console.log(`${post.id}`);
            console.log(`  ${post.platform.toUpperCase()} | ${post.scheduledFor}`);
            console.log(`  ${post.content}`);
            console.log('');
          }
        }
        break;
      }
      
      case 'process': {
        const results = await processScheduledPosts();
        console.log(`Processed ${results.length} scheduled posts`);
        for (const r of results) {
          console.log(`  ${r.id}: ${r.success ? 'SUCCESS' : 'FAILED'} ${r.error || ''}`);
        }
        break;
      }
      
      case 'best-times': {
        const platform = args[0];
        if (!platform) {
          console.error('Usage: best-times <platform>');
          process.exit(1);
        }
        const result = getBestTimes(platform);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'hashtags': {
        const topic = args.join(' ') || 'business';
        const result = generateHashtags(topic);
        console.log(`Hashtags for "${topic}":`);
        console.log(result.formatted);
        break;
      }
      
      case 'analytics': {
        const platform = args[0];
        const days = parseInt(args[1]) || 30;
        const analytics = getAnalytics(platform, days);
        console.log('Social Media Analytics');
        console.log('='.repeat(50));
        console.log(`Period:       ${analytics.period}`);
        console.log(`Total Posts:  ${analytics.totalPosts}`);
        console.log(`Success Rate: ${analytics.successRate}`);
        console.log('\nBy Platform:');
        for (const [p, count] of Object.entries(analytics.byPlatform)) {
          console.log(`  ${p.padEnd(12)} ${count}`);
        }
        console.log('\nBy Status:');
        for (const [status, count] of Object.entries(analytics.byStatus)) {
          console.log(`  ${status.padEnd(12)} ${count}`);
        }
        break;
      }
      
      case 'cancel': {
        const postId = args[0];
        if (!postId) {
          console.error('Usage: cancel <scheduledPostId>');
          process.exit(1);
        }
        const result = await cancelScheduled(postId);
        console.log(result.message || result.error);
        break;
      }
      
      case 'history': {
        const limit = parseInt(args[0]) || 10;
        const posts = postsData.posts.slice(-limit).reverse();
        console.log(`Recent Posts (last ${limit})`);
        console.log('='.repeat(60));
        for (const p of posts) {
          console.log(`${p.platform.toUpperCase().padEnd(10)} | ${p.status.padEnd(10)} | ${p.postedAt.split('T')[0]}`);
          console.log(`  ${p.content.substring(0, 60)}...`);
          console.log('');
        }
        break;
      }
      
      case 'test': {
        console.log('Social Poster Module');
        console.log('====================');
        console.log('\nSupported Platforms:');
        for (const [key, config] of Object.entries(PLATFORMS)) {
          console.log(`  ${key}: ${config.name} (max ${config.maxLength} chars)`);
        }
        console.log('\nCommands:');
        console.log('  post <platform> <content>       - Post immediately');
        console.log('  schedule <p> <content> <time>   - Schedule post');
        console.log('  queue                           - Show scheduled');
        console.log('  process                         - Process due posts');
        console.log('  best-times <platform>           - Optimal times');
        console.log('  hashtags <topic>                - Generate hashtags');
        console.log('  analytics [platform] [days]     - Get analytics');
        console.log('  history [limit]                 - Post history');
        console.log('  cancel <id>                     - Cancel scheduled');
        break;
      }
      
      default:
        console.log('Social Poster - OpenClaw');
        console.log('Run with "test" to see available commands');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  post,
  postToFacebook,
  postToInstagram,
  postToTikTok,
  schedulePost,
  getQueue,
  processScheduledPosts,
  getBestTimes,
  generateHashtags,
  getAnalytics,
  cancelScheduled,
  PLATFORMS
};

// Run CLI
main().catch(console.error);
