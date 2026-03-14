#!/usr/bin/env node
/**
 * OpenClaw Browser Automation Orchestrator
 * 
 * Full automation pipeline for GoHighLevel + Social Media management
 * Integrates: Design Generator → Browser Pool → Social Publisher → GHL Control
 * 
 * Features:
 *   - Automated content generation & posting
 *   - Multi-platform social media management
 *   - GoHighLevel operations automation
 *   - Scheduled task execution
 *   - Health monitoring & recovery
 *   - Telegram notifications
 * 
 * Usage: node browser-automation.mjs <command>
 */

import { getBrowserPool } from './browser-pool-manager.mjs';
import { generateThumbnail, generateSocialPost } from './design-generator.mjs';
import https from 'https';

// Telegram notification
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '';

/**
 * Send Telegram notification
 */
async function notify(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'Markdown'
  });
  
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, () => resolve());
    
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

/**
 * Automation Workflows
 */
const workflows = {
  /**
   * Generate and post thumbnails across YouTube channels
   */
  async generateYouTubeThumbnails(topics) {
    console.log('🎨 Generating YouTube thumbnails...\n');
    
    const pool = getBrowserPool();
    const results = [];
    
    for (const topic of topics) {
      try {
        // Generate thumbnail
        console.log(`  📸 Creating: ${topic}`);
        const thumbnail = await generateThumbnail(topic, 'spiritual-elegant');
        
        if (thumbnail.success) {
          results.push({
            topic,
            path: thumbnail.path,
            success: true
          });
          console.log(`  ✅ Saved: ${thumbnail.path}`);
        }
      } catch (error) {
        console.error(`  ❌ Failed: ${topic} - ${error.message}`);
        results.push({ topic, success: false, error: error.message });
      }
    }
    
    await notify(`🎨 Generated ${results.filter(r => r.success).length}/${topics.length} thumbnails`);
    return results;
  },
  
  /**
   * Post content to all social media platforms
   */
  async postToAllPlatforms(content) {
    console.log('📢 Posting to all platforms...\n');
    
    const pool = getBrowserPool();
    const platforms = ['tiktok', 'instagram', 'facebook', 'twitter', 'linkedin'];
    const tasks = [];
    
    for (const platform of platforms) {
      // Generate platform-specific image if media needed
      let mediaPath = null;
      if (content.generateImage) {
        console.log(`  🎨 Generating image for ${platform}...`);
        const image = await generateSocialPost(content.topic || 'Update', platform, content.style || 'spiritual-elegant');
        if (image.success) {
          mediaPath = image.path;
        }
      }
      
      // Add posting task to pool
      const taskId = await pool.addTask({
        type: 'social_post',
        platform,
        content: {
          text: content.text,
          media: mediaPath ? [{ type: 'image', url: mediaPath }] : [],
          hashtags: content.hashtags || [],
          mentions: content.mentions || []
        }
      });
      
      tasks.push({ platform, taskId });
      console.log(`  📥 Queued: ${platform} (${taskId})`);
    }
    
    await notify(`📢 Queued posts to ${platforms.length} platforms`);
    return tasks;
  },
  
  /**
   * Daily GHL screenshot routine
   */
  async dailyGHLScreenshots() {
    console.log('📊 Taking GHL dashboard screenshots...\n');
    
    const pool = getBrowserPool();
    const pages = ['dashboard', 'contacts', 'opportunities', 'calendar'];
    const tasks = [];
    
    for (const page of pages) {
      const taskId = await pool.addTask({
        type: 'ghl_screenshot',
        platform: 'ghl',
        page
      });
      
      tasks.push({ page, taskId });
      console.log(`  📥 Queued: ${page} (${taskId})`);
    }
    
    await notify(`📊 GHL screenshot routine initiated (${pages.length} pages)`);
    return tasks;
  },
  
  /**
   * Create and publish GHL membership
   */
  async createMembership(config) {
    console.log('🎓 Creating GHL membership...\n');
    
    const pool = getBrowserPool();
    
    const taskId = await pool.addTask({
      type: 'ghl_create_membership',
      platform: 'ghl',
      name: config.name,
      description: config.description
    });
    
    console.log(`  📥 Queued: ${config.name} (${taskId})`);
    await notify(`🎓 Creating membership: ${config.name}`);
    
    return taskId;
  },
  
  /**
   * Weekly content calendar execution
   */
  async weeklyContentCalendar() {
    console.log('📅 Executing weekly content calendar...\n');
    
    const contentPlan = [
      {
        day: 'Monday',
        topic: 'Sacred Blueprint Weekly Wisdom',
        platforms: ['instagram', 'facebook', 'linkedin'],
        style: 'spiritual-elegant'
      },
      {
        day: 'Wednesday',
        topic: 'Divine Technology Insights',
        platforms: ['twitter', 'linkedin'],
        style: 'tech-futuristic'
      },
      {
        day: 'Friday',
        topic: 'Weekend Reflection & Growth',
        platforms: ['instagram', 'tiktok', 'facebook'],
        style: 'bold-impact'
      }
    ];
    
    const pool = getBrowserPool();
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const todayPlan = contentPlan.find(p => p.day === today);
    
    if (!todayPlan) {
      console.log(`  ℹ️  No content scheduled for ${today}`);
      return;
    }
    
    console.log(`  📌 Today's plan: ${todayPlan.topic}`);
    
    // Generate images for each platform
    for (const platform of todayPlan.platforms) {
      console.log(`  🎨 Generating for ${platform}...`);
      const image = await generateSocialPost(todayPlan.topic, platform, todayPlan.style);
      
      if (image.success) {
        await pool.addTask({
          type: 'social_post',
          platform,
          content: {
            text: `${todayPlan.topic}\n\n✨ #TruthJBlue #SacredBlueprint #DivineWisdom`,
            media: [{ type: 'image', url: image.path }]
          }
        });
        
        console.log(`  ✅ Queued: ${platform}`);
      }
    }
    
    await notify(`📅 ${today} content calendar executed`);
  }
};

/**
 * CLI Interface
 */
const command = process.argv[2];
const args = process.argv.slice(3);

(async () => {
  try {
    // Initialize browser pool
    const pool = getBrowserPool({ maxInstances: 50 });
    await pool.initialize();
    
    // Set up monitoring
    pool.on('taskCompleted', (task) => {
      console.log(`✅ ${task.id} completed in ${task.duration}ms`);
    });
    
    pool.on('taskFailed', (task, error) => {
      console.error(`❌ ${task.id} failed: ${error.message}`);
    });
    
    switch (command) {
      case 'post':
        if (!args[0]) {
          console.error('Usage: node browser-automation.mjs post "<text>" [--image] [--hashtags "tag1,tag2"]');
          process.exit(1);
        }
        
        const content = {
          text: args[0],
          generateImage: args.includes('--image'),
          topic: args[0].substring(0, 50),
          style: 'spiritual-elegant',
          hashtags: args.includes('--hashtags') ? args[args.indexOf('--hashtags') + 1].split(',') : []
        };
        
        await workflows.postToAllPlatforms(content);
        
        // Wait for tasks to complete
        await new Promise(resolve => setTimeout(resolve, 30000));
        break;
        
      case 'thumbnails':
        const topics = args.length > 0 ? args : [
          'Sacred Blueprint Revealed',
          'Divine Technology Secrets',
          'Spiritual Excellence Guide'
        ];
        
        await workflows.generateYouTubeThumbnails(topics);
        break;
        
      case 'ghl-screenshots':
        await workflows.dailyGHLScreenshots();
        
        // Wait for tasks
        await new Promise(resolve => setTimeout(resolve, 60000));
        break;
        
      case 'create-membership':
        if (!args[0]) {
          console.error('Usage: node browser-automation.mjs create-membership "<name>" "<description>"');
          process.exit(1);
        }
        
        await workflows.createMembership({
          name: args[0],
          description: args[1] || ''
        });
        
        // Wait for task
        await new Promise(resolve => setTimeout(resolve, 120000));
        break;
        
      case 'weekly-calendar':
        await workflows.weeklyContentCalendar();
        
        // Wait for tasks
        await new Promise(resolve => setTimeout(resolve, 60000));
        break;
        
      case 'daemon':
        console.log('🤖 Starting automation daemon...\n');
        await notify('🤖 OpenClaw Browser Automation daemon started');
        
        // Schedule daily routines
        setInterval(async () => {
          const hour = new Date().getHours();
          
          // 9 AM - GHL screenshots
          if (hour === 9) {
            await workflows.dailyGHLScreenshots();
          }
          
          // 10 AM - Weekly content calendar
          if (hour === 10) {
            await workflows.weeklyContentCalendar();
          }
        }, 3600000); // Check every hour
        
        // Keep daemon alive
        await new Promise(() => {});
        break;
        
      case 'test':
        console.log('🧪 Testing browser pool with simple task...\n');
        
        // Add a simple test task
        await pool.addTask({
          id: 'test-browser-launch',
          type: 'custom',
          platform: 'ghl',
          accountId: 'ghl',
          execute: async (browser, page) => {
            console.log('  ✅ Browser launched successfully');
            
            // Navigate to GoHighLevel login page
            console.log('  📍 Navigating to https://app.gohighlevel.com/');
            await page.goto('https://app.gohighlevel.com/', { waitUntil: 'networkidle' });
            
            // Take screenshot
            const screenshotPath = `${process.env.USERPROFILE}/.openclaw/data/screenshots/test-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: false });
            console.log(`  📸 Screenshot saved: ${screenshotPath}`);
            
            console.log('  ✅ Test completed successfully!');
            
            return { success: true, screenshot: screenshotPath };
          }
        });
        
        // Wait for test to complete
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        console.log('\n✅ Browser pool test completed\n');
        break;
        
      case 'stats':
        console.log('\n📊 Browser Automation Statistics\n');
        console.log(JSON.stringify(pool.getStats(), null, 2));
        break;
        
      default:
        console.log(`
OpenClaw Browser Automation Orchestrator

Commands:
  test
      Test browser pool with simple task
  
  post "<text>" [--image] [--hashtags "tags"]
      Post content to all social platforms
      
  thumbnails [topic1] [topic2] ...
      Generate YouTube thumbnails
      
  ghl-screenshots
      Take screenshots of all GHL pages
      
  create-membership "<name>" "<description>"
      Create and publish GHL membership
      
  weekly-calendar
      Execute today's content from weekly calendar
      
  daemon
      Run as background daemon with scheduled tasks
      
  stats
      Show browser pool statistics

Examples:
  node browser-automation.mjs post "New video is live! 🎥" --image --hashtags "TruthJBlue,Wisdom"
  node browser-automation.mjs thumbnails "Sacred Tech" "Divine AI"
  node browser-automation.mjs create-membership "Sacred Blueprint Mastermind" "Premium course"
  node browser-automation.mjs daemon
        `);
        process.exit(0);
    }
    
    // Show final stats before shutdown
    console.log('\n📊 Final Statistics:');
    const stats = pool.getStats();
    console.log(`  Total tasks: ${stats.totalTasks}`);
    console.log(`  Completed: ${stats.completedTasks}`);
    console.log(`  Failed: ${stats.failedTasks}`);
    console.log(`  Active instances: ${stats.activeInstances}`);
    
    await pool.shutdown();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();

export { workflows };
