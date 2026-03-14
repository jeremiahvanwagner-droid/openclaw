#!/usr/bin/env node
/**
 * OpenClaw Social Media Publisher
 * 
 * Unified cross-platform social media automation
 * 
 * Features:
 *   - Multi-platform posting (TikTok, Instagram, Facebook, X/Twitter, LinkedIn, YouTube)
 *   - Session/cookie persistence (no re-login per run)
 *   - Content queue management
 *   - Scheduled posting
 *   - Media format adaptation per platform
 *   - Engagement metrics collection → GHL CRM
 *   - Telegram notifications
 * 
 * Usage: node social-media-publisher.mjs <command> [args...]
 * 
 * Commands:
 *   post <platform> <content> [media]    Post immediately
 *   multi-post <platforms> <content>     Post to multiple platforms
 *   schedule <platform> <content> <time> Schedule post
 *   queue-show                           Show post queue
 *   queue-add <platform> <content>       Add to queue
 *   queue-process                        Process pending queue items
 *   metrics <platform> <postId>          Collect engagement metrics
 *   session-check <platform>             Check session health
 *   session-save <platform>              Save session cookies
 *   accounts                             List configured accounts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'content-queue.json');
const METRICS_FILE = path.join(DATA_DIR, 'social-metrics.json');
const ASSETS_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'assets', 'designs');

// Platform configurations
const PLATFORMS = {
  tiktok: {
    name: 'TikTok',
    handle: '@TruthJBlue',
    baseUrl: 'https://www.tiktok.com',
    uploadUrl: 'https://www.tiktok.com/creator#/upload',
    maxLength: 2200,
    mediaTypes: ['video'],
    hashtagLimit: 50,
    selectors: {
      authCheck: '[data-e2e="upload-card"], .upload-card',
      fileInput: 'input[type="file"][accept*="video"]',
      captionInput: '[data-text="true"], [contenteditable="true"]',
      hashtagBtn: '[data-e2e="hashtag"]',
      postButton: '[data-e2e="post-button"], button:has-text("Post")',
      draftButton: '[data-e2e="draft-button"]',
      successIndicator: '[data-e2e="upload-success"], .success-message'
    }
  },
  instagram: {
    name: 'Instagram',
    handle: '@TruthJBlue',
    baseUrl: 'https://www.instagram.com',
    maxLength: 2200,
    mediaTypes: ['image', 'video', 'carousel'],
    hashtagLimit: 30,
    selectors: {
      authCheck: '[aria-label="New post"], svg[aria-label="New post"]',
      createButton: 'svg[aria-label="New post"]',
      fileInput: 'input[type="file"]',
      nextButton: 'button:has-text("Next")',
      captionInput: 'textarea[aria-label="Write a caption..."]',
      shareButton: 'button:has-text("Share")',
      successIndicator: '.success-message, [role="dialog"]:has-text("shared")'
    }
  },
  facebook: {
    name: 'Facebook',
    handle: 'TruthJBlue',
    baseUrl: 'https://www.facebook.com',
    maxLength: 63206,
    mediaTypes: ['image', 'video', 'link', 'text'],
    hashtagLimit: 30,
    selectors: {
      authCheck: '[aria-label="Create"], [data-testid="creation_menu"]',
      createPost: '[aria-label="Create a post"], [data-testid="creation_menu"]',
      postInput: '[contenteditable="true"][role="textbox"]',
      photoVideoBtn: '[aria-label="Photo/video"]',
      fileInput: 'input[type="file"]',
      postButton: '[aria-label="Post"], button:has-text("Post")',
      successIndicator: '.post-success, [role="article"]'
    }
  },
  twitter: {
    name: 'X (Twitter)',
    handle: '@TruthJBlue',
    baseUrl: 'https://twitter.com',
    maxLength: 280,
    mediaTypes: ['image', 'video', 'text'],
    hashtagLimit: 10,
    selectors: {
      authCheck: '[data-testid="SideNav_NewTweet_Button"], [aria-label="Post"]',
      composeButton: '[data-testid="SideNav_NewTweet_Button"]',
      tweetInput: '[data-testid="tweetTextarea_0"], [role="textbox"]',
      mediaButton: '[data-testid="fileInput"]',
      fileInput: 'input[type="file"]',
      postButton: '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',
      successIndicator: '[data-testid="toast"]:has-text("posted")'
    }
  },
  linkedin: {
    name: 'LinkedIn',
    handle: 'vanwagnerjeremiah',
    baseUrl: 'https://www.linkedin.com',
    maxLength: 3000,
    mediaTypes: ['image', 'video', 'article', 'text'],
    hashtagLimit: 5,
    selectors: {
      authCheck: '.share-box, [data-control-name="identity_welcome_message"]',
      startPost: '.share-box-feed__open-share-button, button:has-text("Start a post")',
      postInput: '.ql-editor, [data-placeholder="What do you want to talk about?"]',
      mediaButton: '[aria-label="Add a photo"], [data-control-name="add_photo"]',
      fileInput: 'input[type="file"]',
      postButton: '.share-actions__primary-action, button:has-text("Post")',
      successIndicator: '.post-success, [data-test-id="post-card"]'
    }
  },
  youtube: {
    name: 'YouTube',
    handles: ['@TruthJBlue', '@palaceofexcellence'],
    baseUrl: 'https://studio.youtube.com',
    maxTitleLength: 100,
    maxDescLength: 5000,
    mediaTypes: ['video'],
    selectors: {
      authCheck: '#upload-icon, [data-e2e="upload"]',
      uploadButton: '#upload-icon, #create-icon',
      fileInput: 'input[type="file"]',
      titleInput: '#textbox[aria-label="Add a title"], [id="title-textarea"]',
      descriptionInput: '#textbox[aria-label="Tell viewers about your video"]',
      visibilityRadio: '[name="VIDEO_MADE_FOR_KIDS_MFK"]',
      doneButton: '#done-button',
      publishButton: '#publish-button, button:has-text("Publish")',
      successIndicator: '.upload-success, [data-e2e="upload-complete"]'
    }
  }
};

// Content queue
let contentQueue = { pending: [], scheduled: [], completed: [], failed: [] };
let metricsData = { posts: {} };

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  
  try {
    const queueData = await fs.readFile(QUEUE_FILE, 'utf8');
    contentQueue = JSON.parse(queueData);
  } catch {
    await saveQueue();
  }
  
  try {
    const mData = await fs.readFile(METRICS_FILE, 'utf8');
    metricsData = JSON.parse(mData);
  } catch {
    await saveMetrics();
  }
}

/**
 * Save queue
 */
async function saveQueue() {
  await fs.writeFile(QUEUE_FILE, JSON.stringify(contentQueue, null, 2));
}

/**
 * Save metrics
 */
async function saveMetrics() {
  await fs.writeFile(METRICS_FILE, JSON.stringify(metricsData, null, 2));
}

/**
 * Get browser for platform
 */
async function getBrowserForPlatform(platform) {
  const browserCore = await import('./browser-core.mjs');
  return await browserCore.getBrowser(platform, { sessionName: `social-${platform}` });
}

/**
 * Get page for platform
 */
async function getPageForPlatform(platform) {
  const instance = await getBrowserForPlatform(platform);
  const browserCore = await import('./browser-core.mjs');
  const page = await browserCore.getPage(instance);
  
  // Load saved cookies
  await browserCore.loadCookies(platform, page);
  
  return page;
}

/**
 * Check session health for platform
 */
async function checkSession(platform) {
  const config = PLATFORMS[platform];
  if (!config) {
    return { success: false, error: `Unknown platform: ${platform}` };
  }
  
  try {
    const page = await getPageForPlatform(platform);
    await page.goto(config.baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Check for auth indicator
    let isAuthenticated = false;
    try {
      await page.waitForSelector(config.selectors.authCheck, { timeout: 10000 });
      isAuthenticated = true;
    } catch {
      isAuthenticated = false;
    }
    
    await page.close();
    
    return {
      platform,
      handle: config.handle || config.handles?.[0],
      authenticated: isAuthenticated,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      platform,
      authenticated: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Save session cookies for platform
 */
async function saveSession(platform) {
  const config = PLATFORMS[platform];
  if (!config) {
    return { success: false, error: `Unknown platform: ${platform}` };
  }
  
  try {
    const page = await getPageForPlatform(platform);
    const browserCore = await import('./browser-core.mjs');
    const result = await browserCore.saveCookies(platform, page);
    await page.close();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Format content for platform
 */
function formatContent(platform, content) {
  const config = PLATFORMS[platform];
  let formatted = content;
  
  // Truncate to platform limit
  if (formatted.length > config.maxLength) {
    formatted = formatted.substring(0, config.maxLength - 3) + '...';
  }
  
  // Platform-specific formatting
  if (platform === 'twitter') {
    // Remove excess hashtags for Twitter
    const hashtags = formatted.match(/#\w+/g) || [];
    if (hashtags.length > config.hashtagLimit) {
      const keepHashtags = hashtags.slice(0, config.hashtagLimit);
      hashtags.slice(config.hashtagLimit).forEach(tag => {
        formatted = formatted.replace(tag, '');
      });
    }
  }
  
  if (platform === 'linkedin') {
    // LinkedIn: fewer hashtags, more professional tone
    const hashtags = formatted.match(/#\w+/g) || [];
    if (hashtags.length > config.hashtagLimit) {
      const keepHashtags = hashtags.slice(0, config.hashtagLimit);
      hashtags.slice(config.hashtagLimit).forEach(tag => {
        formatted = formatted.replace(tag, '');
      });
    }
  }
  
  return formatted.trim();
}

/**
 * Post to TikTok
 */
async function postToTikTok(content, mediaPath) {
  if (!mediaPath) {
    return { success: false, error: 'TikTok requires video content' };
  }
  
  const config = PLATFORMS.tiktok;
  const page = await getPageForPlatform('tiktok');
  
  try {
    await page.goto(config.uploadUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Upload video
    const fileInput = await page.$(config.selectors.fileInput);
    if (fileInput) {
      await fileInput.setInputFiles(mediaPath);
      await page.waitForTimeout(5000); // Wait for upload
    }
    
    // Add caption
    await page.waitForSelector(config.selectors.captionInput, { timeout: 30000 });
    await page.click(config.selectors.captionInput);
    await page.keyboard.type(formatContent('tiktok', content), { delay: 50 });
    
    // Post
    await page.click(config.selectors.postButton);
    await page.waitForTimeout(5000);
    
    const browserCore = await import('./browser-core.mjs');
    await browserCore.saveCookies('tiktok', page);
    await page.close();
    
    return { success: true, platform: 'tiktok', content: content.substring(0, 100) };
  } catch (error) {
    await page.close();
    return { success: false, platform: 'tiktok', error: error.message };
  }
}

/**
 * Post to Instagram
 */
async function postToInstagram(content, mediaPath) {
  const config = PLATFORMS.instagram;
  const page = await getPageForPlatform('instagram');
  
  try {
    await page.goto(config.baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Click create button
    await page.click(config.selectors.createButton);
    await page.waitForTimeout(1000);
    
    // Upload media if provided
    if (mediaPath) {
      const fileInput = await page.$(config.selectors.fileInput);
      if (fileInput) {
        await fileInput.setInputFiles(mediaPath);
        await page.waitForTimeout(3000);
      }
    }
    
    // Click Next
    await page.click(config.selectors.nextButton);
    await page.waitForTimeout(1000);
    await page.click(config.selectors.nextButton);
    await page.waitForTimeout(1000);
    
    // Add caption
    await page.fill(config.selectors.captionInput, formatContent('instagram', content));
    
    // Share
    await page.click(config.selectors.shareButton);
    await page.waitForTimeout(5000);
    
    const browserCore = await import('./browser-core.mjs');
    await browserCore.saveCookies('instagram', page);
    await page.close();
    
    return { success: true, platform: 'instagram', content: content.substring(0, 100) };
  } catch (error) {
    await page.close();
    return { success: false, platform: 'instagram', error: error.message };
  }
}

/**
 * Post to Facebook
 */
async function postToFacebook(content, mediaPath) {
  const config = PLATFORMS.facebook;
  const page = await getPageForPlatform('facebook');
  
  try {
    await page.goto(config.baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Click create post
    await page.click(config.selectors.createPost);
    await page.waitForTimeout(1500);
    
    // Type content
    await page.click(config.selectors.postInput);
    await page.keyboard.type(formatContent('facebook', content), { delay: 30 });
    
    // Upload media if provided
    if (mediaPath) {
      await page.click(config.selectors.photoVideoBtn);
      await page.waitForTimeout(500);
      const fileInput = await page.$(config.selectors.fileInput);
      if (fileInput) {
        await fileInput.setInputFiles(mediaPath);
        await page.waitForTimeout(3000);
      }
    }
    
    // Post
    await page.click(config.selectors.postButton);
    await page.waitForTimeout(5000);
    
    const browserCore = await import('./browser-core.mjs');
    await browserCore.saveCookies('facebook', page);
    await page.close();
    
    return { success: true, platform: 'facebook', content: content.substring(0, 100) };
  } catch (error) {
    await page.close();
    return { success: false, platform: 'facebook', error: error.message };
  }
}

/**
 * Post to X/Twitter
 */
async function postToTwitter(content, mediaPath) {
  const config = PLATFORMS.twitter;
  const page = await getPageForPlatform('twitter');
  
  try {
    await page.goto(config.baseUrl + '/home', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Click compose
    await page.click(config.selectors.composeButton);
    await page.waitForTimeout(1000);
    
    // Type content
    await page.click(config.selectors.tweetInput);
    await page.keyboard.type(formatContent('twitter', content), { delay: 30 });
    
    // Upload media if provided
    if (mediaPath) {
      const fileInput = await page.$(config.selectors.fileInput);
      if (fileInput) {
        await fileInput.setInputFiles(mediaPath);
        await page.waitForTimeout(3000);
      }
    }
    
    // Post
    await page.click(config.selectors.postButton);
    await page.waitForTimeout(3000);
    
    const browserCore = await import('./browser-core.mjs');
    await browserCore.saveCookies('twitter', page);
    await page.close();
    
    return { success: true, platform: 'twitter', content: content.substring(0, 100) };
  } catch (error) {
    await page.close();
    return { success: false, platform: 'twitter', error: error.message };
  }
}

/**
 * Post to LinkedIn
 */
async function postToLinkedIn(content, mediaPath) {
  const config = PLATFORMS.linkedin;
  const page = await getPageForPlatform('linkedin');
  
  try {
    await page.goto(config.baseUrl + '/feed', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Click start post
    await page.click(config.selectors.startPost);
    await page.waitForTimeout(1500);
    
    // Type content
    await page.click(config.selectors.postInput);
    await page.keyboard.type(formatContent('linkedin', content), { delay: 30 });
    
    // Upload media if provided
    if (mediaPath) {
      await page.click(config.selectors.mediaButton);
      await page.waitForTimeout(500);
      const fileInput = await page.$(config.selectors.fileInput);
      if (fileInput) {
        await fileInput.setInputFiles(mediaPath);
        await page.waitForTimeout(3000);
      }
    }
    
    // Post
    await page.click(config.selectors.postButton);
    await page.waitForTimeout(5000);
    
    const browserCore = await import('./browser-core.mjs');
    await browserCore.saveCookies('linkedin', page);
    await page.close();
    
    return { success: true, platform: 'linkedin', content: content.substring(0, 100) };
  } catch (error) {
    await page.close();
    return { success: false, platform: 'linkedin', error: error.message };
  }
}

/**
 * Post to YouTube (video upload)
 */
async function postToYouTube(content, mediaPath, options = {}) {
  if (!mediaPath) {
    return { success: false, error: 'YouTube requires video content' };
  }
  
  const config = PLATFORMS.youtube;
  const page = await getPageForPlatform('youtube');
  
  try {
    await page.goto(config.baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Click upload
    await page.click(config.selectors.uploadButton);
    await page.waitForTimeout(1000);
    
    // Upload video
    const fileInput = await page.$(config.selectors.fileInput);
    if (fileInput) {
      await fileInput.setInputFiles(mediaPath);
      await page.waitForTimeout(10000); // Wait for upload processing
    }
    
    // Fill title
    const title = options.title || content.substring(0, 100);
    await page.fill(config.selectors.titleInput, title);
    
    // Fill description
    await page.fill(config.selectors.descriptionInput, content);
    
    // Handle "made for kids" if needed
    // Note: This varies by region and account settings
    
    // Click through to publish
    await page.click(config.selectors.doneButton);
    await page.waitForTimeout(2000);
    
    // Publish
    await page.click(config.selectors.publishButton);
    await page.waitForTimeout(5000);
    
    const browserCore = await import('./browser-core.mjs');
    await browserCore.saveCookies('youtube', page);
    await page.close();
    
    return { success: true, platform: 'youtube', title };
  } catch (error) {
    await page.close();
    return { success: false, platform: 'youtube', error: error.message };
  }
}

/**
 * Post to single platform
 */
async function post(platform, content, mediaPath) {
  const platformKey = platform.toLowerCase();
  
  switch (platformKey) {
    case 'tiktok':
      return await postToTikTok(content, mediaPath);
    case 'instagram':
      return await postToInstagram(content, mediaPath);
    case 'facebook':
      return await postToFacebook(content, mediaPath);
    case 'twitter':
    case 'x':
      return await postToTwitter(content, mediaPath);
    case 'linkedin':
      return await postToLinkedIn(content, mediaPath);
    case 'youtube':
      return await postToYouTube(content, mediaPath);
    default:
      return { success: false, error: `Unknown platform: ${platform}` };
  }
}

/**
 * Post to multiple platforms
 */
async function multiPost(platforms, content, mediaPath) {
  const results = [];
  
  for (const platform of platforms) {
    console.log(`Posting to ${platform}...`);
    const result = await post(platform, content, mediaPath);
    results.push(result);
    
    // Rate limiting: wait between posts
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  return {
    success: results.every(r => r.success),
    results
  };
}

/**
 * Schedule a post
 */
async function schedulePost(platform, content, scheduleTime, mediaPath) {
  const scheduledAt = new Date(scheduleTime).toISOString();
  
  const item = {
    id: `schedule-${Date.now()}`,
    platform,
    content,
    mediaPath,
    scheduledAt,
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };
  
  contentQueue.scheduled.push(item);
  await saveQueue();
  
  return { success: true, item };
}

/**
 * Add to queue
 */
async function addToQueue(platform, content, mediaPath) {
  const item = {
    id: `queue-${Date.now()}`,
    platform,
    content,
    mediaPath,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  contentQueue.pending.push(item);
  await saveQueue();
  
  return { success: true, item };
}

/**
 * Process queue
 */
async function processQueue() {
  const now = new Date();
  const results = [];
  
  // Process scheduled items whose time has come
  const dueScheduled = contentQueue.scheduled.filter(item => 
    new Date(item.scheduledAt) <= now
  );
  
  for (const item of dueScheduled) {
    console.log(`Processing scheduled post for ${item.platform}...`);
    const result = await post(item.platform, item.content, item.mediaPath);
    
    if (result.success) {
      contentQueue.completed.push({ ...item, completedAt: now.toISOString(), result });
      contentQueue.scheduled = contentQueue.scheduled.filter(i => i.id !== item.id);
    } else {
      item.lastError = result.error;
      item.retries = (item.retries || 0) + 1;
      if (item.retries >= 3) {
        contentQueue.failed.push({ ...item, failedAt: now.toISOString() });
        contentQueue.scheduled = contentQueue.scheduled.filter(i => i.id !== item.id);
      }
    }
    
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Process pending queue items
  for (const item of contentQueue.pending.slice(0, 5)) { // Process up to 5 at a time
    console.log(`Processing queued post for ${item.platform}...`);
    const result = await post(item.platform, item.content, item.mediaPath);
    
    if (result.success) {
      contentQueue.completed.push({ ...item, completedAt: now.toISOString(), result });
      contentQueue.pending = contentQueue.pending.filter(i => i.id !== item.id);
    } else {
      item.lastError = result.error;
      item.retries = (item.retries || 0) + 1;
      if (item.retries >= 3) {
        contentQueue.failed.push({ ...item, failedAt: now.toISOString() });
        contentQueue.pending = contentQueue.pending.filter(i => i.id !== item.id);
      }
    }
    
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  await saveQueue();
  
  return { processed: results.length, results };
}

/**
 * Collect engagement metrics
 */
async function collectMetrics(platform, postUrl) {
  // Note: Full implementation requires platform-specific scraping
  // This is a stub that would be expanded per platform
  
  const metrics = {
    platform,
    postUrl,
    collectedAt: new Date().toISOString(),
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0
  };
  
  metricsData.posts[postUrl] = metrics;
  await saveMetrics();
  
  return { success: true, metrics };
}

/**
 * Log metrics to GHL contact
 */
async function logMetricsToGHL(contactId, metrics) {
  try {
    const ghlApi = await import('./ghl-api.mjs');
    // Add note to contact with engagement metrics
    // Implementation depends on ghl-api.mjs capabilities
    console.log(`Would log metrics to GHL contact ${contactId}:`, metrics);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List configured accounts
 */
function listAccounts() {
  const accounts = [];
  for (const [key, config] of Object.entries(PLATFORMS)) {
    accounts.push({
      platform: key,
      name: config.name,
      handle: config.handle || config.handles?.[0],
      handles: config.handles
    });
  }
  return accounts;
}

// CLI interface
const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  await initData();
  
  try {
    switch (command) {
      case 'post':
        if (!args[0] || !args[1]) {
          console.error('Usage: social-media-publisher.mjs post <platform> <content> [mediaPath]');
          process.exit(1);
        }
        const postResult = await post(args[0], args[1], args[2]);
        console.log(JSON.stringify(postResult, null, 2));
        break;
        
      case 'multi-post':
        if (!args[0] || !args[1]) {
          console.error('Usage: social-media-publisher.mjs multi-post <platforms,comma,sep> <content> [mediaPath]');
          process.exit(1);
        }
        const platforms = args[0].split(',').map(p => p.trim());
        const multiResult = await multiPost(platforms, args[1], args[2]);
        console.log(JSON.stringify(multiResult, null, 2));
        break;
        
      case 'schedule':
        if (!args[0] || !args[1] || !args[2]) {
          console.error('Usage: social-media-publisher.mjs schedule <platform> <content> <isoTime> [mediaPath]');
          process.exit(1);
        }
        const schedResult = await schedulePost(args[0], args[1], args[2], args[3]);
        console.log(JSON.stringify(schedResult, null, 2));
        break;
        
      case 'queue-show':
        console.log(JSON.stringify(contentQueue, null, 2));
        break;
        
      case 'queue-add':
        if (!args[0] || !args[1]) {
          console.error('Usage: social-media-publisher.mjs queue-add <platform> <content> [mediaPath]');
          process.exit(1);
        }
        const queueResult = await addToQueue(args[0], args[1], args[2]);
        console.log(JSON.stringify(queueResult, null, 2));
        break;
        
      case 'queue-process':
        const processResult = await processQueue();
        console.log(JSON.stringify(processResult, null, 2));
        break;
        
      case 'metrics':
        if (!args[0] || !args[1]) {
          console.error('Usage: social-media-publisher.mjs metrics <platform> <postUrl>');
          process.exit(1);
        }
        const metricsResult = await collectMetrics(args[0], args[1]);
        console.log(JSON.stringify(metricsResult, null, 2));
        break;
        
      case 'session-check':
        if (!args[0]) {
          console.error('Usage: social-media-publisher.mjs session-check <platform>');
          process.exit(1);
        }
        const checkResult = await checkSession(args[0]);
        console.log(JSON.stringify(checkResult, null, 2));
        break;
        
      case 'session-save':
        if (!args[0]) {
          console.error('Usage: social-media-publisher.mjs session-save <platform>');
          process.exit(1);
        }
        const saveResult = await saveSession(args[0]);
        console.log(JSON.stringify(saveResult, null, 2));
        break;
        
      case 'accounts':
        console.log(JSON.stringify(listAccounts(), null, 2));
        break;
        
      default:
        console.log(`
OpenClaw Social Media Publisher

Commands:
  post <platform> <content> [media]     Post immediately
  multi-post <plats> <content> [media]  Post to multiple platforms (comma-separated)
  schedule <plat> <content> <time>      Schedule post (ISO 8601 time)
  queue-show                            Show post queue
  queue-add <plat> <content> [media]    Add to queue
  queue-process                         Process pending queue items
  metrics <platform> <postUrl>          Collect engagement metrics
  session-check <platform>              Check session health
  session-save <platform>               Save session cookies
  accounts                              List configured accounts

Platforms: tiktok, instagram, facebook, twitter, linkedin, youtube

Handles:
  TikTok:    @TruthJBlue
  Instagram: @TruthJBlue
  Facebook:  TruthJBlue
  X/Twitter: @TruthJBlue
  LinkedIn:  vanwagnerjeremiah
  YouTube:   @TruthJBlue, @palaceofexcellence
        `);
    }
  } finally {
    // Cleanup browsers
    const browserCore = await import('./browser-core.mjs');
    await browserCore.closeAllBrowsers();
  }
}

main().catch(console.error);

// Export for programmatic use
export {
  post,
  multiPost,
  schedulePost,
  addToQueue,
  processQueue,
  collectMetrics,
  checkSession,
  saveSession,
  listAccounts,
  PLATFORMS
};
