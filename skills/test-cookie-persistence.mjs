#!/usr/bin/env node
/**
 * Test cookie persistence cycle
 * Phase 1.3 validation
 */

import { getBrowser, saveCookies, loadCookies } from './browser-core.mjs';
import fs from 'fs/promises';
import path from 'path';

const TEST_PLATFORM = 'test';
const COOKIE_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data', 'social-sessions', `${TEST_PLATFORM}.cookies.json`);

async function testCookiePersistence() {
  console.log('\n=== Phase 1.3: Cookie Persistence Test ===\n');
  
  try {
    // Clean up any existing test cookies
    try {
      await fs.unlink(COOKIE_PATH);
      console.log('🧹 Cleaned up existing test cookies');
    } catch (e) {
      // Doesn't exist, that's fine
    }
    
    console.log('1️⃣ Creating browser instance...');
    const browserInstance = await getBrowser('ghl', { headless: true });
    const page = browserInstance.context 
      ? await browserInstance.context.newPage() 
      : await browserInstance.browser.newPage();
    
    console.log('2️⃣ Navigating to test site...');
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    
    console.log('3️⃣ Setting test cookie...');
    await page.context().addCookies([{
      name: 'test_cookie',
      value: 'openclaw_test_value_' + Date.now(),
      domain: 'example.com',
      path: '/'
    }]);
    
    console.log('4️⃣ Saving cookies...');
    const saveResult = await saveCookies(TEST_PLATFORM, page);
    if (!saveResult.success) {
      throw new Error('Cookie save failed');
    }
    console.log(`   ✅ Saved ${saveResult.count} cookies to ${saveResult.path}`);
    
    console.log('5️⃣ Verifying cookie file exists...');
    const fileExists = await fs.access(COOKIE_PATH).then(() => true).catch(() => false);
    if (!fileExists) {
      throw new Error('Cookie file not created');
    }
    console.log('   ✅ Cookie file exists');
    
    console.log('6️⃣ Reading cookie file...');
    const cookieData = JSON.parse(await fs.readFile(COOKIE_PATH, 'utf-8'));
    console.log(`   ✅ Parsed ${cookieData.length} cookies from file`);
    
    console.log('7️⃣ Closing browser...');
    if (browserInstance.context) {
      await browserInstance.context.close();
    } else if (browserInstance.browser) {
      await browserInstance.browser.close();
    }
    
    // Import closeAllBrowsers to clear cache
    const { closeAllBrowsers } = await import('./browser-core.mjs');
    await closeAllBrowsers();
    console.log('   ✅ Browser cache cleared');
    
    console.log('8️⃣ Creating new browser instance...');
    const browserInstance2 = await getBrowser('ghl', { headless: true, sessionName: 'test2' });
    const page2 = browserInstance2.context 
      ? await browserInstance2.context.newPage() 
      : await browserInstance2.browser.newPage();
    
    console.log('9️⃣ Loading cookies into new browser...');
    const loadResult = await loadCookies(TEST_PLATFORM, page2);
    if (!loadResult.success) {
      throw new Error('Cookie load failed');
    }
    console.log(`   ✅ Loaded ${loadResult.count} cookies`);
    
    console.log('🔟 Navigating to verify cookies...');
    await page2.goto('https://example.com', { waitUntil: 'networkidle' });
    
    console.log('1️⃣1️⃣ Checking cookies...');
    const cookies = await page2.context().cookies();
    const testCookie = cookies.find(c => c.name === 'test_cookie');
    
    if (!testCookie) {
      throw new Error('Test cookie not found after reload');
    }
    console.log(`   ✅ Cookie restored: ${testCookie.name} = ${testCookie.value}`);
    
    console.log('1️⃣2️⃣ Cleaning up...');
    if (browserInstance2.context) {
      await browserInstance2.context.close();
    } else if (browserInstance2.browser) {
      await browserInstance2.browser.close();
    }
    
    await fs.unlink(COOKIE_PATH);
    console.log('   ✅ Test cookie file cleaned up');
    
    console.log('\n✅ Phase 1.3: Cookie persistence test PASSED\n');
    console.log('Results: {');
    console.log('  "cookieSave": true,');
    console.log('  "cookieLoad": true,');
    console.log('  "persistence": true');
    console.log('}\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Phase 1.3: Cookie persistence test FAILED\n');
    console.error('Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

testCookiePersistence();
