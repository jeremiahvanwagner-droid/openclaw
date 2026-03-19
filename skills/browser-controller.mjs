#!/usr/bin/env node
/**
 * OpenClaw Browser Controller
 * 
 * Puppeteer orchestration for GHL and social media automation
 * 
 * Features:
 *   - Headless browser automation
 *   - GHL UI operations (when API insufficient)
 *   - Social media posting (native browser)
 *   - Screenshot/PDF generation
 *   - Cookie/session management
 *   - Multi-tab orchestration
 * 
 * Usage: node browser-controller.mjs <command> [args...]
 * 
 * Commands:
 *   ghl-login                            Login to GoHighLevel
 *   ghl-screenshot <url> <output>        Take GHL dashboard screenshot
 *   social-post <platform> <content>     Post to social platform
 *   scrape <url> <selector>              Scrape content from URL
 *   pdf <url> <output>                   Generate PDF from page
 *   session-save <name>                  Save browser session
 *   session-load <name>                  Load saved session
 */

import fs from 'fs/promises';
import path from 'path';
import { buildBrowserLaunchArgs, getBrowserStorageRoot } from "./browser-security.mjs";

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const BROWSER_ROOT = getBrowserStorageRoot();
const SESSIONS_DIR = path.join(BROWSER_ROOT, 'sessions');
const SCREENSHOTS_DIR = path.join(BROWSER_ROOT, 'screenshots');

// Browser settings
const BROWSER_CONFIG = {
  headless: process.env.BROWSER_HEADLESS !== 'false',
  slowMo: parseInt(process.env.BROWSER_SLOW_MO || '0'),
  timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000'),
  viewport: {
    width: parseInt(process.env.BROWSER_WIDTH || '1920'),
    height: parseInt(process.env.BROWSER_HEIGHT || '1080')
  }
};

// Platform configurations
const PLATFORMS = {
  ghl: {
    loginUrl: 'https://app.gohighlevel.com/login',
    dashboardUrl: 'https://app.gohighlevel.com/dashboard',
    selectors: {
      emailInput: 'input[name="email"]',
      passwordInput: 'input[name="password"]',
      loginButton: 'button[type="submit"]',
      dashboardReady: '.dashboard-container'
    }
  },
  youtube: {
    studioUrl: 'https://studio.youtube.com',
    uploadUrl: 'https://studio.youtube.com/channel/UC/videos/upload',
    selectors: {
      uploadButton: '#upload-icon',
      fileInput: 'input[type="file"]',
      titleInput: '#textbox[aria-label="Add a title"]',
      descriptionInput: '#textbox[aria-label="Tell viewers about your video"]'
    }
  },
  instagram: {
    baseUrl: 'https://www.instagram.com',
    selectors: {
      createButton: 'svg[aria-label="New post"]',
      fileInput: 'input[type="file"]',
      captionInput: 'textarea[aria-label="Write a caption..."]'
    }
  },
  facebook: {
    baseUrl: 'https://www.facebook.com',
    selectors: {
      createPost: '[aria-label="Create a post"]',
      postInput: '[contenteditable="true"]',
      postButton: '[aria-label="Post"]'
    }
  },
  tiktok: {
    uploadUrl: 'https://www.tiktok.com/upload',
    selectors: {
      fileInput: 'input[type="file"]',
      captionInput: '[contenteditable="true"]',
      postButton: 'button[type="submit"]'
    }
  }
};

// Task queue for browser operations
const taskQueue = [];
let isProcessing = false;
let browserInstance = null;

/**
 * Initialize directories
 */
async function initDirs() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Get Puppeteer (lazy load)
 */
async function getPuppeteer() {
  try {
    // Dynamic import for puppeteer
    const puppeteer = await import('puppeteer');
    return puppeteer.default || puppeteer;
  } catch (error) {
    console.error('Puppeteer not installed. Run: npm install puppeteer');
    throw error;
  }
}

/**
 * Launch browser with configuration
 */
async function launchBrowser(options = {}) {
  const puppeteer = await getPuppeteer();
  const launchArgs = await buildBrowserLaunchArgs([
    `--window-size=${BROWSER_CONFIG.viewport.width},${BROWSER_CONFIG.viewport.height}`,
  ]);
  
  const launchOptions = {
    headless: options.headless ?? BROWSER_CONFIG.headless,
    slowMo: BROWSER_CONFIG.slowMo,
    args: launchArgs,
    defaultViewport: BROWSER_CONFIG.viewport
  };
  
  // Load session if provided
  if (options.sessionName) {
    const sessionPath = path.join(SESSIONS_DIR, options.sessionName);
    try {
      await fs.access(sessionPath);
      launchOptions.userDataDir = sessionPath;
    } catch {
      // Session doesn't exist, will create new
    }
  }
  
  browserInstance = await puppeteer.launch(launchOptions);
  return browserInstance;
}

/**
 * Get or create browser instance
 */
async function getBrowser(options = {}) {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await launchBrowser(options);
  }
  return browserInstance;
}

/**
 * Close browser
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Save browser session
 */
async function saveSession(name) {
  const sessionPath = path.join(SESSIONS_DIR, name);
  const browser = await getBrowser({ sessionName: name });
  
  // Session is automatically saved in userDataDir
  console.log(`Session saved to: ${sessionPath}`);
  return { success: true, path: sessionPath };
}

/**
 * Login to GoHighLevel
 */
async function ghlLogin(email, password) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.goto(PLATFORMS.ghl.loginUrl, { waitUntil: 'networkidle2' });
    
    // Enter credentials
    await page.waitForSelector(PLATFORMS.ghl.selectors.emailInput);
    await page.type(PLATFORMS.ghl.selectors.emailInput, email);
    await page.type(PLATFORMS.ghl.selectors.passwordInput, password);
    
    // Click login
    await page.click(PLATFORMS.ghl.selectors.loginButton);
    
    // Wait for dashboard
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    const currentUrl = page.url();
    const success = currentUrl.includes('dashboard') || currentUrl.includes('app.gohighlevel');
    
    if (success) {
      console.log('GHL login successful');
      return { success: true, url: currentUrl };
    } else {
      throw new Error('Login failed - unexpected redirect');
    }
  } catch (error) {
    console.error('GHL login failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Take screenshot
 */
async function takeScreenshot(url, outputPath, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: BROWSER_CONFIG.timeout });
    
    if (options.waitFor) {
      await page.waitForSelector(options.waitFor, { timeout: BROWSER_CONFIG.timeout });
    }
    
    const finalPath = outputPath || path.join(
      SCREENSHOTS_DIR, 
      `screenshot-${Date.now()}.png`
    );
    
    await page.screenshot({
      path: finalPath,
      fullPage: options.fullPage ?? true,
      type: 'png'
    });
    
    console.log(`Screenshot saved: ${finalPath}`);
    return { success: true, path: finalPath };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await page.close();
  }
}

/**
 * Generate PDF from page
 */
async function generatePDF(url, outputPath, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: BROWSER_CONFIG.timeout });
    
    const finalPath = outputPath || path.join(
      DATA_DIR, 
      `document-${Date.now()}.pdf`
    );
    
    await page.pdf({
      path: finalPath,
      format: options.format || 'A4',
      printBackground: true,
      margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
    });
    
    console.log(`PDF generated: ${finalPath}`);
    return { success: true, path: finalPath };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await page.close();
  }
}

/**
 * Scrape content from URL
 */
async function scrapeContent(url, selector, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: BROWSER_CONFIG.timeout });
    
    await page.waitForSelector(selector, { timeout: BROWSER_CONFIG.timeout });
    
    const content = await page.evaluate((sel, getAttr) => {
      const elements = document.querySelectorAll(sel);
      return Array.from(elements).map(el => {
        if (getAttr) {
          return el.getAttribute(getAttr);
        }
        return {
          text: el.textContent?.trim(),
          html: el.innerHTML
        };
      });
    }, selector, options.attribute);
    
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await page.close();
  }
}

/**
 * Post to social platform via browser
 */
async function socialPost(platform, content, mediaPath = null) {
  const platformConfig = PLATFORMS[platform.toLowerCase()];
  if (!platformConfig) {
    return { success: false, error: `Unknown platform: ${platform}` };
  }
  
  const browser = await getBrowser({ sessionName: `session-${platform}` });
  const page = await browser.newPage();
  
  try {
    // Platform-specific posting logic
    switch (platform.toLowerCase()) {
      case 'facebook':
        return await postToFacebook(page, content, mediaPath);
      case 'instagram':
        return await postToInstagram(page, content, mediaPath);
      case 'tiktok':
        return await postToTikTok(page, content, mediaPath);
      default:
        return { success: false, error: `Posting not implemented for ${platform}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await page.close();
  }
}

/**
 * Facebook posting
 */
async function postToFacebook(page, content, mediaPath) {
  await page.goto(PLATFORMS.facebook.baseUrl, { waitUntil: 'networkidle2' });
  
  // Click create post
  await page.waitForSelector(PLATFORMS.facebook.selectors.createPost, { timeout: 10000 });
  await page.click(PLATFORMS.facebook.selectors.createPost);
  
  // Wait for post input
  await page.waitForSelector(PLATFORMS.facebook.selectors.postInput, { timeout: 10000 });
  await page.type(PLATFORMS.facebook.selectors.postInput, content);
  
  // Upload media if provided
  if (mediaPath) {
    const fileInput = await page.$('input[type="file"][accept*="image"]');
    if (fileInput) {
      await fileInput.uploadFile(mediaPath);
      await page.waitForTimeout(2000); // Wait for upload
    }
  }
  
  // Click post
  await page.click(PLATFORMS.facebook.selectors.postButton);
  await page.waitForTimeout(3000); // Wait for post to complete
  
  return { success: true, platform: 'facebook' };
}

/**
 * Instagram posting
 */
async function postToInstagram(page, content, mediaPath) {
  if (!mediaPath) {
    return { success: false, error: 'Instagram requires media for posts' };
  }
  
  await page.goto(PLATFORMS.instagram.baseUrl, { waitUntil: 'networkidle2' });
  
  // Click create button
  await page.waitForSelector(PLATFORMS.instagram.selectors.createButton, { timeout: 10000 });
  await page.click(PLATFORMS.instagram.selectors.createButton);
  
  // Upload file
  const fileInput = await page.waitForSelector(PLATFORMS.instagram.selectors.fileInput);
  await fileInput.uploadFile(mediaPath);
  
  // Wait for processing
  await page.waitForTimeout(3000);
  
  // Add caption
  const captionInput = await page.waitForSelector(PLATFORMS.instagram.selectors.captionInput);
  await captionInput.type(content);
  
  // Share
  const shareButton = await page.$('button:has-text("Share")');
  if (shareButton) {
    await shareButton.click();
    await page.waitForTimeout(5000);
  }
  
  return { success: true, platform: 'instagram' };
}

/**
 * TikTok posting
 */
async function postToTikTok(page, content, mediaPath) {
  if (!mediaPath) {
    return { success: false, error: 'TikTok requires video for posts' };
  }
  
  await page.goto(PLATFORMS.tiktok.uploadUrl, { waitUntil: 'networkidle2' });
  
  // Upload video
  const fileInput = await page.waitForSelector(PLATFORMS.tiktok.selectors.fileInput);
  await fileInput.uploadFile(mediaPath);
  
  // Wait for upload
  await page.waitForTimeout(10000);
  
  // Add caption
  const captionInput = await page.waitForSelector(PLATFORMS.tiktok.selectors.captionInput);
  await captionInput.type(content);
  
  // Post
  await page.click(PLATFORMS.tiktok.selectors.postButton);
  await page.waitForTimeout(5000);
  
  return { success: true, platform: 'tiktok' };
}

/**
 * Execute GHL UI action
 */
async function ghlAction(action, params = {}) {
  const browser = await getBrowser({ sessionName: 'ghl-session' });
  const page = await browser.newPage();
  
  try {
    await page.goto(PLATFORMS.ghl.dashboardUrl, { waitUntil: 'networkidle2' });
    
    // Verify logged in
    const isLoggedIn = await page.$('.dashboard-container, .main-content');
    if (!isLoggedIn) {
      return { success: false, error: 'Not logged in to GHL' };
    }
    
    switch (action) {
      case 'navigate':
        await page.goto(params.url, { waitUntil: 'networkidle2' });
        return { success: true, url: params.url };
        
      case 'click':
        await page.waitForSelector(params.selector, { timeout: 10000 });
        await page.click(params.selector);
        return { success: true };
        
      case 'type':
        await page.waitForSelector(params.selector, { timeout: 10000 });
        await page.type(params.selector, params.text);
        return { success: true };
        
      case 'screenshot':
        const screenshotPath = params.output || path.join(SCREENSHOTS_DIR, `ghl-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return { success: true, path: screenshotPath };
        
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await page.close();
  }
}

/**
 * Queue browser task
 */
function queueTask(task) {
  return new Promise((resolve, reject) => {
    taskQueue.push({ task, resolve, reject });
    processQueue();
  });
}

/**
 * Process task queue
 */
async function processQueue() {
  if (isProcessing || taskQueue.length === 0) return;
  
  isProcessing = true;
  
  while (taskQueue.length > 0) {
    const { task, resolve, reject } = taskQueue.shift();
    
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    }
    
    // Rate limiting between tasks
    await new Promise(r => setTimeout(r, 1000));
  }
  
  isProcessing = false;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initDirs();
  
  try {
    switch (command) {
      case 'ghl-login': {
        const email = args[0] || process.env.GHL_EMAIL;
        const password = args[1] || process.env.GHL_PASSWORD;
        if (!email || !password) {
          console.error('Usage: ghl-login <email> <password>');
          process.exit(1);
        }
        const result = await ghlLogin(email, password);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'ghl-screenshot': {
        const url = args[0] || PLATFORMS.ghl.dashboardUrl;
        const output = args[1];
        const result = await takeScreenshot(url, output);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'ghl-action': {
        const action = args[0];
        const params = args[1] ? JSON.parse(args[1]) : {};
        const result = await ghlAction(action, params);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'social-post': {
        const platform = args[0];
        const content = args[1];
        const mediaPath = args[2];
        if (!platform || !content) {
          console.error('Usage: social-post <platform> <content> [mediaPath]');
          process.exit(1);
        }
        const result = await socialPost(platform, content, mediaPath);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'scrape': {
        const url = args[0];
        const selector = args[1];
        if (!url || !selector) {
          console.error('Usage: scrape <url> <selector>');
          process.exit(1);
        }
        const result = await scrapeContent(url, selector);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'pdf': {
        const url = args[0];
        const output = args[1];
        if (!url) {
          console.error('Usage: pdf <url> [output]');
          process.exit(1);
        }
        const result = await generatePDF(url, output);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'screenshot': {
        const url = args[0];
        const output = args[1];
        if (!url) {
          console.error('Usage: screenshot <url> [output]');
          process.exit(1);
        }
        const result = await takeScreenshot(url, output);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'session-save': {
        const name = args[0];
        if (!name) {
          console.error('Usage: session-save <name>');
          process.exit(1);
        }
        const result = await saveSession(name);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'close': {
        await closeBrowser();
        console.log('Browser closed');
        break;
      }
      
      case 'test': {
        console.log('Browser Controller Module');
        console.log('=========================');
        console.log('Configuration:', JSON.stringify(BROWSER_CONFIG, null, 2));
        console.log('\nSupported platforms:', Object.keys(PLATFORMS).join(', '));
        console.log('\nCommands:');
        console.log('  ghl-login <email> <pw>  - Login to GoHighLevel');
        console.log('  ghl-screenshot [url]    - Screenshot GHL page');
        console.log('  social-post <p> <c> [m] - Post to social platform');
        console.log('  scrape <url> <selector> - Scrape page content');
        console.log('  pdf <url> [output]      - Generate PDF');
        console.log('  screenshot <url> [out]  - Take screenshot');
        console.log('  session-save <name>     - Save browser session');
        console.log('  close                   - Close browser');
        break;
      }
      
      default:
        console.log('Browser Controller - OpenClaw');
        console.log('Run with "test" to see available commands');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    // Don't auto-close on test
    if (command !== 'test' && command !== 'session-save') {
      await closeBrowser();
    }
  }
}

// Export for module use
export {
  launchBrowser,
  getBrowser,
  closeBrowser,
  ghlLogin,
  takeScreenshot,
  generatePDF,
  scrapeContent,
  socialPost,
  ghlAction,
  queueTask,
  PLATFORMS,
  BROWSER_CONFIG
};

// Run CLI
main().catch(console.error);
