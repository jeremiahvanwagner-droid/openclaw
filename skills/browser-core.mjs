#!/usr/bin/env node
/**
 * OpenClaw Browser Core
 * 
 * Unified browser automation launcher supporting Playwright and Puppeteer
 * 
 * Features:
 *   - Playwright for GHL/YouTube (reliable, multi-browser)
 *   - Puppeteer-extra with stealth for social platforms (fingerprint evasion)
 *   - Session persistence and cookie management
 *   - Headless/headed mode switching
 *   - VPS-optimized configuration (Xvfb support)
 * 
 * Usage: node browser-core.mjs <command> [args...]
 * 
 * Commands:
 *   test-launch                    Test both browser engines
 *   get-browser <platform>         Get browser instance for platform
 *   save-session <platform>        Save session cookies
 *   load-session <platform>        Load session cookies
 *   health-check                   Check browser health status
 */

import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'browser-sessions');
const COOKIES_DIR = path.join(DATA_DIR, 'social-sessions');

// Browser mode from environment
const BROWSER_MODE = process.env.BROWSER_MODE || 'headless'; // headless | headed | debug

// Browser configuration
const BROWSER_CONFIG = {
  headless: BROWSER_MODE === 'headless',
  slowMo: BROWSER_MODE === 'debug' ? 100 : 0,
  timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000'),
  viewport: {
    width: parseInt(process.env.BROWSER_WIDTH || '1920'),
    height: parseInt(process.env.BROWSER_HEIGHT || '1080')
  }
};

// Platform to engine mapping
const PLATFORM_ENGINES = {
  // Playwright platforms (reliable, multi-browser)
  ghl: 'playwright',
  youtube: 'playwright',
  
  // Puppeteer-stealth platforms (fingerprint evasion)
  tiktok: 'puppeteer-stealth',
  instagram: 'puppeteer-stealth',
  facebook: 'puppeteer-stealth',
  twitter: 'puppeteer-stealth',
  linkedin: 'puppeteer-stealth'
};

// Browser instances cache
const browserInstances = new Map();

/**
 * Initialize directories
 */
async function initDirs() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.mkdir(COOKIES_DIR, { recursive: true });
}

/**
 * Get Playwright browser
 */
async function getPlaywrightBrowser(options = {}) {
  try {
    const { chromium } = await import('playwright');
    
    const launchOptions = {
      headless: options.headless ?? BROWSER_CONFIG.headless,
      slowMo: BROWSER_CONFIG.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    };
    
    // Load persistent context if session exists
    // If explicit userDataDir is provided (e.g. from pool manager), use it directly
    const persistentPath = options.userDataDir || 
      (options.sessionName ? path.join(SESSIONS_DIR, `playwright-${options.sessionName}`) : null);
    
    if (persistentPath) {
      await fs.mkdir(persistentPath, { recursive: true });
      try {
        const context = await chromium.launchPersistentContext(persistentPath, {
          ...launchOptions,
          viewport: BROWSER_CONFIG.viewport
        });
        return { browser: null, context, type: 'persistent' };
      } catch (e) {
        // Persistent context failed (may be locked), fall through to standard launch
        console.warn(`Persistent context unavailable for ${persistentPath}: ${e.message}`);
      }
    }
    
    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      viewport: BROWSER_CONFIG.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    
    return { browser, context, type: 'standard' };
  } catch (error) {
    console.error('Playwright not available:', error.message);
    throw new Error('Playwright not installed. Run: npm install playwright && npx playwright install chromium');
  }
}

/**
 * Get Puppeteer-stealth browser
 */
async function getPuppeteerStealthBrowser(options = {}) {
  try {
    const puppeteerExtra = await import('puppeteer-extra');
    const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
    
    const puppeteer = puppeteerExtra.default;
    puppeteer.use(StealthPlugin.default());
    
    const launchOptions = {
      headless: options.headless ?? BROWSER_CONFIG.headless ? 'new' : false,
      slowMo: BROWSER_CONFIG.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        `--window-size=${BROWSER_CONFIG.viewport.width},${BROWSER_CONFIG.viewport.height}`
      ],
      defaultViewport: BROWSER_CONFIG.viewport
    };
    
    // Load user data dir for session persistence
    // If explicit userDataDir is provided (e.g. from pool manager), use it directly
    if (options.userDataDir) {
      await fs.mkdir(options.userDataDir, { recursive: true });
      launchOptions.userDataDir = options.userDataDir;
    } else if (options.sessionName) {
      const sessionPath = path.join(SESSIONS_DIR, `puppeteer-${options.sessionName}`);
      await fs.mkdir(sessionPath, { recursive: true });
      launchOptions.userDataDir = sessionPath;
    }
    
    const browser = await puppeteer.launch(launchOptions);
    return { browser, context: null, type: 'puppeteer' };
  } catch (error) {
    console.error('Puppeteer-stealth not available:', error.message);
    throw new Error('Puppeteer-stealth not installed. Run: npm install puppeteer-extra puppeteer-extra-plugin-stealth');
  }
}

/**
 * Get browser for specific platform
 */
async function getBrowser(platform, options = {}) {
  const engine = PLATFORM_ENGINES[platform.toLowerCase()] || 'playwright';
  // When userDataDir is provided (pool mode), use it as cache key for uniqueness
  const cacheKey = options.userDataDir || `${platform}-${options.sessionName || 'default'}`;
  
  // Return cached instance if available and connected
  if (browserInstances.has(cacheKey)) {
    const cached = browserInstances.get(cacheKey);
    if (cached.browser?.isConnected?.() || cached.context) {
      return cached;
    }
    browserInstances.delete(cacheKey);
  }
  
  let instance;
  // When userDataDir is set, don't override sessionName (it would conflict)
  const sessionFallback = options.userDataDir ? undefined : (options.sessionName || platform);
  
  if (engine === 'playwright') {
    instance = await getPlaywrightBrowser({
      ...options,
      sessionName: sessionFallback
    });
  } else {
    instance = await getPuppeteerStealthBrowser({
      ...options,
      sessionName: sessionFallback
    });
  }
  
  instance.engine = engine;
  instance.platform = platform;
  browserInstances.set(cacheKey, instance);
  
  return instance;
}

/**
 * Close browser instance
 */
async function closeBrowser(platform, sessionName = 'default') {
  const cacheKey = `${platform}-${sessionName}`;
  const instance = browserInstances.get(cacheKey);
  
  if (instance) {
    if (instance.context && instance.type === 'persistent') {
      await instance.context.close();
    } else if (instance.browser) {
      await instance.browser.close();
    }
    browserInstances.delete(cacheKey);
  }
}

/**
 * Close all browser instances
 */
async function closeAllBrowsers() {
  for (const [key, instance] of browserInstances) {
    try {
      if (instance.context && instance.type === 'persistent') {
        await instance.context.close();
      } else if (instance.browser) {
        await instance.browser.close();
      }
    } catch (e) {
      console.error(`Error closing browser ${key}:`, e.message);
    }
  }
  browserInstances.clear();
}

/**
 * Get new page from browser instance
 */
async function getPage(browserInstance) {
  if (browserInstance.context) {
    return await browserInstance.context.newPage();
  } else if (browserInstance.browser) {
    return await browserInstance.browser.newPage();
  }
  throw new Error('No browser or context available');
}

/**
 * Save cookies for platform
 */
async function saveCookies(platform, page) {
  const cookiesPath = path.join(COOKIES_DIR, `${platform}.cookies.json`);
  
  let cookies;
  if (page.context) {
    // Playwright
    cookies = await page.context().cookies();
  } else {
    // Puppeteer
    cookies = await page.cookies();
  }
  
  await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log(`Cookies saved for ${platform}: ${cookiesPath}`);
  return { success: true, path: cookiesPath, count: cookies.length };
}

/**
 * Load cookies for platform
 */
async function loadCookies(platform, page) {
  const cookiesPath = path.join(COOKIES_DIR, `${platform}.cookies.json`);
  
  try {
    const data = await fs.readFile(cookiesPath, 'utf8');
    const cookies = JSON.parse(data);
    
    if (page.context) {
      // Playwright
      await page.context().addCookies(cookies);
    } else {
      // Puppeteer
      await page.setCookie(...cookies);
    }
    
    console.log(`Cookies loaded for ${platform}: ${cookies.length} cookies`);
    return { success: true, count: cookies.length };
  } catch (error) {
    console.log(`No saved cookies for ${platform}`);
    return { success: false, error: error.message };
  }
}

/**
 * Check session health for platform
 */
async function checkSessionHealth(platform, testUrl, authSelector) {
  try {
    const instance = await getBrowser(platform);
    const page = await getPage(instance);
    
    await loadCookies(platform, page);
    await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: BROWSER_CONFIG.timeout });
    
    // Check if auth selector exists (indicates logged in)
    let isLoggedIn = false;
    try {
      if (page.locator) {
        // Playwright
        isLoggedIn = await page.locator(authSelector).count() > 0;
      } else {
        // Puppeteer
        isLoggedIn = await page.$(authSelector) !== null;
      }
    } catch {
      isLoggedIn = false;
    }
    
    await page.close();
    
    return {
      platform,
      healthy: isLoggedIn,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      platform,
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Test both browser engines
 */
async function testLaunch() {
  const results = { playwright: null, puppeteerStealth: null };
  
  console.log('Testing Playwright...');
  try {
    const pw = await getPlaywrightBrowser({ headless: true });
    const page = await pw.context.newPage();
    await page.goto('https://example.com');
    const title = await page.title();
    await page.close();
    if (pw.browser) await pw.browser.close();
    results.playwright = { success: true, title };
    console.log('✓ Playwright working');
  } catch (error) {
    results.playwright = { success: false, error: error.message };
    console.log('✗ Playwright failed:', error.message);
  }
  
  console.log('\nTesting Puppeteer-stealth...');
  try {
    const pp = await getPuppeteerStealthBrowser({ headless: true });
    const page = await pp.browser.newPage();
    await page.goto('https://example.com');
    const title = await page.title();
    await page.close();
    await pp.browser.close();
    results.puppeteerStealth = { success: true, title };
    console.log('✓ Puppeteer-stealth working');
  } catch (error) {
    results.puppeteerStealth = { success: false, error: error.message };
    console.log('✗ Puppeteer-stealth failed:', error.message);
  }
  
  return results;
}

/**
 * Health check all platforms
 */
async function healthCheck() {
  const platforms = {
    ghl: {
      testUrl: 'https://app.gohighlevel.com/dashboard',
      authSelector: '.dashboard-container, [data-testid="dashboard"]'
    },
    youtube: {
      testUrl: 'https://studio.youtube.com',
      authSelector: '#menu-button, [aria-label="Account"]'
    },
    instagram: {
      testUrl: 'https://www.instagram.com',
      authSelector: '[aria-label="Home"], [aria-label="New post"]'
    },
    facebook: {
      testUrl: 'https://www.facebook.com',
      authSelector: '[aria-label="Create"], [aria-label="Your profile"]'
    },
    tiktok: {
      testUrl: 'https://www.tiktok.com/upload',
      authSelector: '[data-e2e="upload-button"], .upload-card'
    },
    twitter: {
      testUrl: 'https://twitter.com/home',
      authSelector: '[data-testid="SideNav_NewTweet_Button"], [aria-label="Post"]'
    },
    linkedin: {
      testUrl: 'https://www.linkedin.com/feed',
      authSelector: '[data-control-name="identity_welcome_message"], .share-box'
    }
  };
  
  const results = [];
  for (const [platform, config] of Object.entries(platforms)) {
    console.log(`Checking ${platform}...`);
    const result = await checkSessionHealth(platform, config.testUrl, config.authSelector);
    results.push(result);
    console.log(`  ${result.healthy ? '✓' : '✗'} ${platform}: ${result.healthy ? 'authenticated' : result.error || 'not authenticated'}`);
  }
  
  await closeAllBrowsers();
  return results;
}

// CLI interface
const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  await initDirs();
  
  switch (command) {
    case 'test-launch':
      const testResults = await testLaunch();
      console.log('\nResults:', JSON.stringify(testResults, null, 2));
      break;
      
    case 'health-check':
      const healthResults = await healthCheck();
      console.log('\nHealth Check Results:', JSON.stringify(healthResults, null, 2));
      break;
      
    case 'get-browser':
      if (!args[0]) {
        console.error('Usage: browser-core.mjs get-browser <platform>');
        process.exit(1);
      }
      const browser = await getBrowser(args[0]);
      console.log(`Browser ready for ${args[0]} using ${browser.engine}`);
      break;
      
    case 'save-session':
      if (!args[0]) {
        console.error('Usage: browser-core.mjs save-session <platform>');
        process.exit(1);
      }
      console.log(`Session save must be called programmatically with a page instance`);
      break;
      
    default:
      console.log(`
OpenClaw Browser Core - Unified browser automation

Commands:
  test-launch           Test both Playwright and Puppeteer-stealth engines
  health-check          Check authentication status for all platforms
  get-browser <plat>    Get browser instance for platform

Environment:
  BROWSER_MODE          headless | headed | debug (default: headless)
  BROWSER_TIMEOUT       Page timeout in ms (default: 30000)
  BROWSER_WIDTH         Viewport width (default: 1920)
  BROWSER_HEIGHT        Viewport height (default: 1080)

Platform Engine Mapping:
  Playwright:           ghl, youtube
  Puppeteer-stealth:    tiktok, instagram, facebook, twitter, linkedin
      `);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch(console.error);
}

// Export for programmatic use
export {
  getBrowser,
  getPage,
  closeBrowser,
  closeAllBrowsers,
  saveCookies,
  loadCookies,
  checkSessionHealth,
  testLaunch,
  healthCheck,
  BROWSER_CONFIG,
  PLATFORM_ENGINES
};
