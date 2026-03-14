#!/usr/bin/env node
/**
 * OpenClaw GHL Browser Control
 * 
 * GoHighLevel browser automation for operations not available via API
 * 
 * Features:
 *   - GHL authentication with session persistence
 *   - Sub-account navigation
 *   - Contact/Pipeline operations (API fallback)
 *   - Workflow creation and management
 *   - Funnel operations
 *   - Membership Builder automation
 *   - Analytics dashboard screenshots
 *   - Telegram notification integration
 * 
 * Usage: node ghl-browser-control.mjs <command> [args...]
 * 
 * Commands:
 *   login                                 Authenticate to GHL
 *   switch-account <name>                 Switch to sub-account
 *   screenshot <dashboard>                Screenshot dashboard → Telegram
 *   
 *   contact-read <id>                     Read contact details
 *   contact-write <id> <json>             Update contact
 *   opportunity-list <pipelineId>         List opportunities
 *   opportunity-move <id> <stageId>       Move opportunity stage
 *   
 *   workflow-list                         List workflows
 *   workflow-create <configJson>          Create workflow
 *   workflow-edit <id> <changesJson>      Edit workflow
 *   workflow-duplicate <id>               Duplicate workflow
 *   
 *   funnel-list                           List funnels
 *   funnel-launch <id>                    Launch/publish funnel
 *   
 *   membership-list                       List memberships
 *   membership-create <configJson>        Create membership
 *   membership-add-course <id> <config>   Add course to membership
 *   membership-pricing <id> <config>      Configure pricing
 *   membership-publish <id>               Publish membership
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');

// GHL Credentials from environment
const GHL_EMAIL = process.env.GHL_EMAIL || '';
const GHL_PASSWORD = process.env.GHL_PASSWORD || '';
const GHL_ACCOUNT_NAME = process.env.GHL_ACCOUNT_NAME || 'Truth J Blue';

// Telegram notification config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '';

// GHL Selectors
const GHL_SELECTORS = {
  // Login
  emailInput: 'input[name="email"], input[type="email"]',
  passwordInput: 'input[name="password"], input[type="password"]',
  loginButton: 'button[type="submit"]',
  
  // Dashboard
  dashboardReady: '.dashboard-container, [data-testid="dashboard"], .main-content',
  accountSwitcher: '[data-testid="account-switcher"], .account-dropdown',
  accountOption: (name) => `[data-testid="account-option"]:has-text("${name}"), .account-item:has-text("${name}")`,
  
  // Navigation
  navContacts: '[href*="contacts"], [data-nav="contacts"]',
  navPipelines: '[href*="opportunities"], [data-nav="pipelines"]',
  navWorkflows: '[href*="automation"], [data-nav="workflows"]',
  navFunnels: '[href*="funnels"], [data-nav="funnels"]',
  navMemberships: '[href*="memberships"], [data-nav="memberships"]',
  navAnalytics: '[href*="reporting"], [data-nav="analytics"]',
  
  // Contact
  contactRow: '.contact-row, [data-testid="contact-row"]',
  contactName: '.contact-name, [data-testid="contact-name"]',
  contactEmail: '.contact-email, [data-testid="contact-email"]',
  contactEditBtn: '.edit-contact-btn, [data-testid="edit-contact"]',
  contactSaveBtn: '.save-contact-btn, [data-testid="save-contact"]',
  
  // Pipeline/Opportunities
  pipelineCard: '.pipeline-card, [data-testid="opportunity-card"]',
  stageColumn: '.stage-column, [data-testid="stage-column"]',
  opportunityCard: '.opportunity-card, [data-testid="opportunity"]',
  
  // Workflows
  workflowCard: '.workflow-card, [data-testid="workflow-card"]',
  createWorkflowBtn: '[data-testid="create-workflow"], .create-workflow-btn',
  workflowNameInput: '[data-testid="workflow-name"], input[name="name"]',
  workflowSaveBtn: '[data-testid="save-workflow"], .save-workflow-btn',
  
  // Funnels
  funnelCard: '.funnel-card, [data-testid="funnel-card"]',
  funnelPublishBtn: '[data-testid="publish-funnel"], .publish-btn',
  
  // Memberships
  membershipCard: '.membership-card, [data-testid="membership-card"]',
  createMembershipBtn: '[data-testid="create-membership"], .create-membership-btn',
  membershipNameInput: '[data-testid="membership-name"], input[name="membershipName"]',
  membershipDescInput: '[data-testid="membership-desc"], textarea[name="description"]',
  addCourseBtn: '[data-testid="add-course"], .add-course-btn',
  courseNameInput: '[data-testid="course-name"], input[name="courseName"]',
  pricingTab: '[data-testid="pricing-tab"], .pricing-tab',
  priceInput: '[data-testid="price"], input[name="price"]',
  intervalSelect: '[data-testid="interval"], select[name="interval"]',
  publishMembershipBtn: '[data-testid="publish-membership"], .publish-membership-btn',
  saveMembershipBtn: '[data-testid="save-membership"], .save-btn'
};

// Dashboard URLs
const DASHBOARDS = {
  main: '/dashboard',
  contacts: '/contacts',
  pipelines: '/opportunities/pipelines',
  opportunities: '/opportunities',
  conversations: '/conversations',
  workflows: '/automation/workflows',
  funnels: '/funnels',
  memberships: '/memberships',
  analytics: '/reporting/dashboard'
};

let browserInstance = null;
let currentPage = null;

/**
 * Initialize directories
 */
async function initDirs() {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Get browser instance using browser-core
 */
async function getBrowserInstance() {
  if (browserInstance) return browserInstance;
  
  const browserCore = await import('./browser-core.mjs');
  browserInstance = await browserCore.getBrowser('ghl', { sessionName: 'ghl-session' });
  return browserInstance;
}

/**
 * Get page instance
 */
async function getPage() {
  if (currentPage) return currentPage;
  
  const instance = await getBrowserInstance();
  const browserCore = await import('./browser-core.mjs');
  currentPage = await browserCore.getPage(instance);
  return currentPage;
}

/**
 * Wait for GHL to be ready (SPA loading)
 */
async function waitForGHLReady(page, timeout = 30000) {
  try {
    await page.waitForSelector(GHL_SELECTORS.dashboardReady, { timeout });
    // Additional wait for SPA hydration
    await page.waitForTimeout(1000);
    return true;
  } catch {
    // Try waiting for any main content
    try {
      await page.waitForSelector('.main-content, .app-container', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Login to GoHighLevel
 */
async function login() {
  if (!GHL_EMAIL || !GHL_PASSWORD) {
    throw new Error('GHL_EMAIL and GHL_PASSWORD environment variables required');
  }
  
  const page = await getPage();
  
  try {
    await page.goto('https://app.gohighlevel.com/login', { waitUntil: 'networkidle' });
    
    // Wait for page to fully load and JS to execute
    await page.waitForTimeout(3000);
    
    // Check current URL - might have redirected to dashboard if already logged in
    const initialUrl = page.url();
    console.log(`Current URL after navigation: ${initialUrl}`);
    
    // Debug: Get page title and check for any input elements
    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);
    
    // Check all input fields on the page
    const inputs = await page.$$('input');
    console.log(`Found ${inputs.length} input elements on page`);
    
    // Try to find email input with multiple strategies
    const emailInputSelectors = [
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="Email" i]',
      'input[id*="email" i]',
      '#email',
      '.email-input'
    ];
    
    let emailInput = null;
    for (const selector of emailInputSelectors) {
      emailInput = await page.$(selector).catch(() => null);
      if (emailInput) {
        console.log(`Found email input with selector: ${selector}`);
        break;
      }
    }
    
    // Debug: Take screenshot of login page
    const debugScreenshot = path.join(SCREENSHOTS_DIR, `ghl-login-debug-${Date.now()}.png`);
    await page.screenshot({ path: debugScreenshot, fullPage: true });
    console.log(`Debug screenshot saved: ${debugScreenshot}`);
    
    // Check if already logged in (redirected to dashboard/locations)
    if (initialUrl.includes('/dashboard') || initialUrl.includes('/locations') || initialUrl.includes('/v2/')) {
      console.log('Already logged in to GHL (redirected to dashboard)');
      // Save session
      await saveCookies('ghl', page);
      return { success: true, message: 'Already authenticated' };
    }
    
    // Check if login form is present
    if (!emailInput) {
      // Check if there's a dashboard element
      const isLoggedIn = await page.$(GHL_SELECTORS.dashboardReady).catch(() => null);
      if (isLoggedIn) {
        console.log('Already logged in to GHL (dashboard visible)');
        await saveCookies('ghl', page);
        return { success: true, message: 'Already authenticated' };
      }
      
      // Try to get page content for debugging
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
      console.log(`Page content preview: ${bodyText}`);
      
      throw new Error(`Login page loaded but no login form found. URL: ${initialUrl}, Inputs: ${inputs.length}`);
    }
    
    // Enter credentials
    console.log('Entering credentials...');
    await page.waitForSelector(GHL_SELECTORS.emailInput, { timeout: 5000 });
    await page.fill(GHL_SELECTORS.emailInput, GHL_EMAIL);
    await page.fill(GHL_SELECTORS.passwordInput, GHL_PASSWORD);
    
    // Click login
    await page.click(GHL_SELECTORS.loginButton);
    
    // Wait for dashboard
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
    await waitForGHLReady(page);
    
    const currentUrl = page.url();
    const success = currentUrl.includes('dashboard') || currentUrl.includes('app.gohighlevel');
    
    if (success) {
      // Save session cookies
      const browserCore = await import('./browser-core.mjs');
      await browserCore.saveCookies('ghl', page);
      
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
 * Switch to sub-account
 */
async function switchAccount(accountName) {
  const page = await getPage();
  
  try {
    // Look for account switcher
    const accountSwitcher = await page.$(GHL_SELECTORS.accountSwitcher);
    if (accountSwitcher) {
      await accountSwitcher.click();
      await page.waitForTimeout(500);
      
      // Find and click the account
      const accountSelector = GHL_SELECTORS.accountOption(accountName);
      await page.waitForSelector(accountSelector, { timeout: 5000 });
      await page.click(accountSelector);
      
      await waitForGHLReady(page);
      console.log(`Switched to account: ${accountName}`);
      return { success: true, account: accountName };
    } else {
      // Try URL-based navigation
      console.log('Account switcher not found, using URL navigation');
      return { success: true, message: 'Single account mode' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Screenshot dashboard and send to Telegram
 */
async function screenshotDashboard(dashboardName) {
  const page = await getPage();
  const dashboardPath = DASHBOARDS[dashboardName] || DASHBOARDS.main;
  
  try {
    // Navigate to dashboard
    const baseUrl = 'https://app.gohighlevel.com';
    await page.goto(`${baseUrl}${dashboardPath}`, { waitUntil: 'networkidle' });
    await waitForGHLReady(page);
    await page.waitForTimeout(2000); // Let charts render
    
    // Take screenshot
    const timestamp = Date.now();
    const filename = `ghl-${dashboardName}-${timestamp}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    
    await page.screenshot({
      path: filepath,
      fullPage: false,
      type: 'png'
    });
    
    console.log(`Screenshot saved: ${filepath}`);
    
    // Send to Telegram if configured
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendToTelegram(filepath, `GHL ${dashboardName} Dashboard`);
    }
    
    return { success: true, path: filepath, dashboard: dashboardName };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send image to Telegram
 */
async function sendToTelegram(imagePath, caption) {
  try {
    const FormData = (await import('form-data')).default;
    const fetch = (await import('node-fetch')).default;
    
    const form = new FormData();
    const imageBuffer = await fs.readFile(imagePath);
    form.append('photo', imageBuffer, { filename: path.basename(imagePath) });
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('caption', `📊 ${caption}\n🕐 ${new Date().toLocaleString()}`);
    
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      { method: 'POST', body: form }
    );
    
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }
    
    console.log('Screenshot sent to Telegram');
    return { success: true };
  } catch (error) {
    console.error('Telegram send failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Read contact details (browser fallback for API 403)
 */
async function readContact(contactId) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/contacts/${contactId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Extract contact info
    const contact = await page.evaluate(() => {
      const getName = () => document.querySelector('.contact-name, [data-testid="contact-name"]')?.textContent?.trim();
      const getEmail = () => document.querySelector('.contact-email, [data-testid="contact-email"]')?.textContent?.trim();
      const getPhone = () => document.querySelector('.contact-phone, [data-testid="contact-phone"]')?.textContent?.trim();
      
      return {
        name: getName(),
        email: getEmail(),
        phone: getPhone()
      };
    });
    
    return { success: true, contact };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update contact details
 */
async function writeContact(contactId, data) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/contacts/${contactId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Click edit button
    await page.click(GHL_SELECTORS.contactEditBtn);
    await page.waitForTimeout(500);
    
    // Fill in fields
    if (data.name) {
      await page.fill('[name="name"], [data-field="name"]', data.name);
    }
    if (data.email) {
      await page.fill('[name="email"], [data-field="email"]', data.email);
    }
    if (data.phone) {
      await page.fill('[name="phone"], [data-field="phone"]', data.phone);
    }
    
    // Save
    await page.click(GHL_SELECTORS.contactSaveBtn);
    await page.waitForTimeout(1000);
    
    return { success: true, contactId, updated: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List opportunities in pipeline
 */
async function listOpportunities(pipelineId) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/opportunities/pipelines/${pipelineId}`, { waitUntil: 'networkidle' });
    await waitForGHLReady(page);
    await page.waitForTimeout(2000);
    
    const opportunities = await page.evaluate((selectors) => {
      const cards = document.querySelectorAll(selectors.opportunityCard);
      return Array.from(cards).map(card => ({
        name: card.querySelector('.opportunity-name, .card-title')?.textContent?.trim(),
        value: card.querySelector('.opportunity-value, .card-value')?.textContent?.trim(),
        stage: card.closest(selectors.stageColumn)?.getAttribute('data-stage-id')
      }));
    }, GHL_SELECTORS);
    
    return { success: true, pipelineId, opportunities };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Move opportunity to stage (drag and drop simulation)
 */
async function moveOpportunityStage(opportunityId, stageId) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/opportunities/${opportunityId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Find stage selector and change it
    await page.click('[data-testid="stage-selector"], .stage-dropdown');
    await page.waitForTimeout(300);
    await page.click(`[data-stage-id="${stageId}"], [data-value="${stageId}"]`);
    await page.waitForTimeout(1000);
    
    return { success: true, opportunityId, newStage: stageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List workflows
 */
async function listWorkflows() {
  const page = await getPage();
  
  try {
    await page.goto('https://app.gohighlevel.com/automation/workflows', { waitUntil: 'networkidle' });
    await waitForGHLReady(page);
    await page.waitForTimeout(2000);
    
    const workflows = await page.evaluate((selector) => {
      const cards = document.querySelectorAll(selector);
      return Array.from(cards).map(card => ({
        name: card.querySelector('.workflow-name, .card-title')?.textContent?.trim(),
        status: card.querySelector('.workflow-status, .status-badge')?.textContent?.trim(),
        id: card.getAttribute('data-workflow-id') || card.getAttribute('data-id')
      }));
    }, GHL_SELECTORS.workflowCard);
    
    return { success: true, workflows };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create workflow
 */
async function createWorkflow(config) {
  const page = await getPage();
  
  try {
    await page.goto('https://app.gohighlevel.com/automation/workflows', { waitUntil: 'networkidle' });
    await waitForGHLReady(page);
    
    // Click create button
    await page.click(GHL_SELECTORS.createWorkflowBtn);
    await page.waitForTimeout(1000);
    
    // Fill workflow name
    await page.fill(GHL_SELECTORS.workflowNameInput, config.name);
    
    // Note: Full workflow builder automation would require extensive selector mapping
    // This creates the workflow shell, detailed configuration requires UI interaction
    
    await page.click(GHL_SELECTORS.workflowSaveBtn);
    await page.waitForTimeout(1000);
    
    return { success: true, workflow: config.name, message: 'Workflow created - configure triggers and actions in GHL UI' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Duplicate workflow
 */
async function duplicateWorkflow(workflowId) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/automation/workflows/${workflowId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Click options menu
    await page.click('[data-testid="workflow-options"], .options-btn');
    await page.waitForTimeout(300);
    
    // Click duplicate
    await page.click('[data-testid="duplicate-workflow"], [data-action="duplicate"]');
    await page.waitForTimeout(2000);
    
    return { success: true, originalId: workflowId, message: 'Workflow duplicated' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List funnels
 */
async function listFunnels() {
  const page = await getPage();
  
  try {
    await page.goto('https://app.gohighlevel.com/funnels', { waitUntil: 'networkidle' });
    await waitForGHLReady(page);
    await page.waitForTimeout(2000);
    
    const funnels = await page.evaluate((selector) => {
      const cards = document.querySelectorAll(selector);
      return Array.from(cards).map(card => ({
        name: card.querySelector('.funnel-name, .card-title')?.textContent?.trim(),
        status: card.querySelector('.funnel-status, .status-badge')?.textContent?.trim(),
        id: card.getAttribute('data-funnel-id') || card.getAttribute('data-id')
      }));
    }, GHL_SELECTORS.funnelCard);
    
    return { success: true, funnels };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Launch/publish funnel
 */
async function launchFunnel(funnelId) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/funnels/${funnelId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    await page.click(GHL_SELECTORS.funnelPublishBtn);
    await page.waitForTimeout(2000);
    
    return { success: true, funnelId, message: 'Funnel published' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List memberships
 */
async function listMemberships() {
  const page = await getPage();
  
  try {
    await page.goto('https://app.gohighlevel.com/memberships', { waitUntil: 'networkidle' });
    await waitForGHLReady(page);
    await page.waitForTimeout(2000);
    
    const memberships = await page.evaluate((selector) => {
      const cards = document.querySelectorAll(selector);
      return Array.from(cards).map(card => ({
        name: card.querySelector('.membership-name, .card-title')?.textContent?.trim(),
        status: card.querySelector('.membership-status, .status-badge')?.textContent?.trim(),
        id: card.getAttribute('data-membership-id') || card.getAttribute('data-id')
      }));
    }, GHL_SELECTORS.membershipCard);
    
    return { success: true, memberships };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create membership
 */
async function createMembership(config) {
  const page = await getPage();
  
  try {
    await page.goto('https://app.gohighlevel.com/memberships', { waitUntil: 'networkidle' });
    await waitForGHLReady(page);
    
    // Click create button
    await page.click(GHL_SELECTORS.createMembershipBtn);
    await page.waitForTimeout(1000);
    
    // Fill membership details
    await page.fill(GHL_SELECTORS.membershipNameInput, config.name);
    
    if (config.description) {
      await page.fill(GHL_SELECTORS.membershipDescInput, config.description);
    }
    
    // Save initial membership
    await page.click(GHL_SELECTORS.saveMembershipBtn);
    await page.waitForTimeout(2000);
    
    return { 
      success: true, 
      membership: config.name,
      message: 'Membership created - add courses and configure pricing to complete setup'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Add course to membership
 */
async function addMembershipCourse(membershipId, courseConfig) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/memberships/${membershipId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Click add course
    await page.click(GHL_SELECTORS.addCourseBtn);
    await page.waitForTimeout(500);
    
    // Fill course name
    await page.fill(GHL_SELECTORS.courseNameInput, courseConfig.name);
    
    // Save course
    await page.click('[data-testid="save-course"], .save-course-btn');
    await page.waitForTimeout(1000);
    
    return { success: true, membershipId, course: courseConfig.name };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Configure membership pricing
 */
async function configureMembershipPricing(membershipId, pricingConfig) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/memberships/${membershipId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Navigate to pricing tab
    await page.click(GHL_SELECTORS.pricingTab);
    await page.waitForTimeout(500);
    
    // Set price
    await page.fill(GHL_SELECTORS.priceInput, String(pricingConfig.amount));
    
    // Set interval if recurring
    if (pricingConfig.type === 'recurring' && pricingConfig.interval) {
      await page.selectOption(GHL_SELECTORS.intervalSelect, pricingConfig.interval);
    }
    
    // Save pricing
    await page.click(GHL_SELECTORS.saveMembershipBtn);
    await page.waitForTimeout(1000);
    
    return { success: true, membershipId, pricing: pricingConfig };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Publish membership
 */
async function publishMembership(membershipId) {
  const page = await getPage();
  
  try {
    await page.goto(`https://app.gohighlevel.com/memberships/${membershipId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Click publish
    await page.click(GHL_SELECTORS.publishMembershipBtn);
    await page.waitForTimeout(2000);
    
    return { success: true, membershipId, message: 'Membership published' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Cleanup browser
 */
async function cleanup() {
  if (browserInstance) {
    const browserCore = await import('./browser-core.mjs');
    await browserCore.closeBrowser('ghl', 'ghl-session');
    browserInstance = null;
    currentPage = null;
  }
}

// CLI interface
const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  await initDirs();
  
  try {
    switch (command) {
      case 'login':
        const loginResult = await login();
        console.log(JSON.stringify(loginResult, null, 2));
        break;
        
      case 'switch-account':
        await login();
        const switchResult = await switchAccount(args[0] || GHL_ACCOUNT_NAME);
        console.log(JSON.stringify(switchResult, null, 2));
        break;
        
      case 'screenshot':
        await login();
        const ssResult = await screenshotDashboard(args[0] || 'main');
        console.log(JSON.stringify(ssResult, null, 2));
        break;
        
      case 'contact-read':
        if (!args[0]) throw new Error('Contact ID required');
        await login();
        const contactResult = await readContact(args[0]);
        console.log(JSON.stringify(contactResult, null, 2));
        break;
        
      case 'contact-write':
        if (!args[0] || !args[1]) throw new Error('Contact ID and JSON data required');
        await login();
        const writeResult = await writeContact(args[0], JSON.parse(args[1]));
        console.log(JSON.stringify(writeResult, null, 2));
        break;
        
      case 'opportunity-list':
        if (!args[0]) throw new Error('Pipeline ID required');
        await login();
        const oppResult = await listOpportunities(args[0]);
        console.log(JSON.stringify(oppResult, null, 2));
        break;
        
      case 'opportunity-move':
        if (!args[0] || !args[1]) throw new Error('Opportunity ID and Stage ID required');
        await login();
        const moveResult = await moveOpportunityStage(args[0], args[1]);
        console.log(JSON.stringify(moveResult, null, 2));
        break;
        
      case 'workflow-list':
        await login();
        const wfListResult = await listWorkflows();
        console.log(JSON.stringify(wfListResult, null, 2));
        break;
        
      case 'workflow-create':
        if (!args[0]) throw new Error('Config JSON required');
        await login();
        const wfCreateResult = await createWorkflow(JSON.parse(args[0]));
        console.log(JSON.stringify(wfCreateResult, null, 2));
        break;
        
      case 'workflow-duplicate':
        if (!args[0]) throw new Error('Workflow ID required');
        await login();
        const wfDupResult = await duplicateWorkflow(args[0]);
        console.log(JSON.stringify(wfDupResult, null, 2));
        break;
        
      case 'funnel-list':
        await login();
        const funnelListResult = await listFunnels();
        console.log(JSON.stringify(funnelListResult, null, 2));
        break;
        
      case 'funnel-launch':
        if (!args[0]) throw new Error('Funnel ID required');
        await login();
        const funnelLaunchResult = await launchFunnel(args[0]);
        console.log(JSON.stringify(funnelLaunchResult, null, 2));
        break;
        
      case 'membership-list':
        await login();
        const memListResult = await listMemberships();
        console.log(JSON.stringify(memListResult, null, 2));
        break;
        
      case 'membership-create':
        if (!args[0]) throw new Error('Config JSON required');
        await login();
        const memCreateResult = await createMembership(JSON.parse(args[0]));
        console.log(JSON.stringify(memCreateResult, null, 2));
        break;
        
      case 'membership-add-course':
        if (!args[0] || !args[1]) throw new Error('Membership ID and Config JSON required');
        await login();
        const courseResult = await addMembershipCourse(args[0], JSON.parse(args[1]));
        console.log(JSON.stringify(courseResult, null, 2));
        break;
        
      case 'membership-pricing':
        if (!args[0] || !args[1]) throw new Error('Membership ID and Pricing Config JSON required');
        await login();
        const pricingResult = await configureMembershipPricing(args[0], JSON.parse(args[1]));
        console.log(JSON.stringify(pricingResult, null, 2));
        break;
        
      case 'membership-publish':
        if (!args[0]) throw new Error('Membership ID required');
        await login();
        const pubResult = await publishMembership(args[0]);
        console.log(JSON.stringify(pubResult, null, 2));
        break;
        
      default:
        console.log(`
OpenClaw GHL Browser Control

Commands:
  login                                 Authenticate to GHL
  switch-account <name>                 Switch to sub-account
  screenshot <dashboard>                Screenshot dashboard → Telegram
  
  contact-read <id>                     Read contact details
  contact-write <id> <json>             Update contact
  opportunity-list <pipelineId>         List opportunities
  opportunity-move <id> <stageId>       Move opportunity stage
  
  workflow-list                         List workflows
  workflow-create <configJson>          Create workflow
  workflow-duplicate <id>               Duplicate workflow
  
  funnel-list                           List funnels
  funnel-launch <id>                    Launch/publish funnel
  
  membership-list                       List memberships
  membership-create <configJson>        Create membership
  membership-add-course <id> <config>   Add course to membership
  membership-pricing <id> <config>      Configure pricing
  membership-publish <id>               Publish membership

Dashboards: main, contacts, pipelines, opportunities, conversations, workflows, funnels, memberships, analytics

Environment:
  GHL_EMAIL              GHL login email
  GHL_PASSWORD           GHL login password
  GHL_ACCOUNT_NAME       Sub-account name (default: Truth J Blue)
  TELEGRAM_BOT_TOKEN     For screenshot notifications
  OPENCLAW_ALERT_TELEGRAM_CHAT_ID  Telegram chat ID
        `);
    }
  } finally {
    await cleanup();
  }
}

main().catch(console.error);

// Export for programmatic use
export {
  login,
  switchAccount,
  screenshotDashboard,
  readContact,
  writeContact,
  listOpportunities,
  moveOpportunityStage,
  listWorkflows,
  createWorkflow,
  duplicateWorkflow,
  listFunnels,
  launchFunnel,
  listMemberships,
  createMembership,
  addMembershipCourse,
  configureMembershipPricing,
  publishMembership,
  cleanup
};
