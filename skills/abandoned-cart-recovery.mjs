#!/usr/bin/env node
/**
 * OpenClaw Abandoned Cart Recovery
 * 
 * Tracks checkout page visits and triggers recovery sequences
 * when purchase is not completed within the configured window.
 * 
 * Recovery Sequence:
 *   - 1 hour: SMS reminder
 *   - 3 hours: Email with urgency
 *   - 24 hours: Final SMS with bonus offer
 *   - 48 hours: Last chance email
 */

import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Configuration
const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');

// Recovery sequence timing (in minutes)
const RECOVERY_SEQUENCE = {
  'cart-recovery-1h': {
    delay: 60,
    type: 'sms',
    template: 'CART_REMINDER_1H',
    message: "Hey {name}! You left something behind 🛒 Your {product} is still waiting. Complete your order: {cartUrl}",
    subject: null
  },
  'cart-recovery-3h': {
    delay: 180,
    type: 'email',
    template: 'CART_REMINDER_3H',
    message: null,
    subject: "You're so close! Don't let this slip away"
  },
  'cart-recovery-24h': {
    delay: 1440,
    type: 'sms',
    template: 'CART_BONUS_24H',
    message: "{name}, because you started your journey: Get {bonusOffer} when you complete your order in the next 2 hours! {cartUrl}",
    subject: null
  },
  'cart-recovery-48h': {
    delay: 2880,
    type: 'email',
    template: 'CART_LAST_CHANCE',
    message: null,
    subject: "This is it - your cart expires soon"
  }
};

// Product-specific bonus offers
const PRODUCT_BONUSES = {
  'ebook': {
    defaultBonus: 'FREE Implementation Checklist',
    urgencyBonus: '+ 15-minute Strategy Call'
  },
  'course': {
    defaultBonus: 'FREE Bonus Module',
    urgencyBonus: '+ 1 Month Community Access'
  },
  'intensive': {
    defaultBonus: 'FREE Extra Coaching Call',
    urgencyBonus: '+ Lifetime Updates'
  }
};

/**
 * Make GHL API request
 */
function ghlRequest(method, urlPath, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'services.leadconnectorhq.com',
      port: 443,
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Send Telegram notification
 */
async function notifyTelegram(message) {
  try {
    const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await execAsync(`openclaw send --agent main --channel telegram --to ${TELEGRAM_CHAT_ID} "${escaped}"`);
  } catch (error) {
    console.error('Telegram notification failed:', error.message);
  }
}

/**
 * Trigger OpenClaw agent action
 */
async function triggerAgent(agentId, message) {
  try {
    const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await execAsync(`openclaw message --agent ${agentId} "${escaped}"`);
  } catch (error) {
    console.error(`Agent trigger failed (${agentId}):`, error.message);
  }
}

/**
 * Load abandoned carts data
 */
async function loadCarts() {
  const cartsFile = path.join(DATA_DIR, 'abandoned-carts.json');
  try {
    const data = await fs.readFile(cartsFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return { carts: [], lastProcessed: null };
  }
}

/**
 * Save abandoned carts data
 */
async function saveCarts(data) {
  const cartsFile = path.join(DATA_DIR, 'abandoned-carts.json');
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(cartsFile, JSON.stringify(data, null, 2));
}

/**
 * Track checkout page visit
 */
async function trackCheckoutVisit(contactId, product, cartUrl) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('🛒 TRACKING CHECKOUT VISIT');
  console.log('═'.repeat(60));
  
  const data = await loadCarts();
  
  // Remove any existing cart entry for this contact
  data.carts = data.carts.filter(c => c.contactId !== contactId);
  
  // Get contact info
  const response = await ghlRequest('GET', `/contacts/${contactId}`);
  const contact = response.contact || response;
  
  // Add new cart entry
  const cartEntry = {
    contactId,
    name: contact.firstName || 'Friend',
    email: contact.email,
    phone: contact.phone,
    product,
    cartUrl,
    visitTime: Date.now(),
    status: 'active',
    recoveryStep: 0,
    lastRecoveryTime: null
  };
  
  data.carts.push(cartEntry);
  await saveCarts(data);
  
  console.log(`👤 Contact: ${cartEntry.name} (${cartEntry.email})`);
  console.log(`📦 Product: ${product}`);
  console.log(`🔗 Cart URL: ${cartUrl}`);
  console.log(`⏰ Tracking started: ${new Date().toISOString()}`);
  
  // Add tag to contact
  await ghlRequest('PUT', `/contacts/${contactId}`, {
    tags: ['cart-active']
  });
  
  console.log('✅ Checkout tracking active');
  console.log('═'.repeat(60));
  
  return cartEntry;
}

/**
 * Mark cart as completed (purchase made)
 */
async function markCartCompleted(contactId) {
  const data = await loadCarts();
  
  const cart = data.carts.find(c => c.contactId === contactId);
  if (cart) {
    cart.status = 'completed';
    cart.completedTime = Date.now();
    await saveCarts(data);
    
    // Remove cart-active tag, add cart-converted
    await ghlRequest('PUT', `/contacts/${contactId}`, {
      tags: ['cart-converted']
    });
    
    // Remove cart-active tag
    await ghlRequest('DELETE', `/contacts/${contactId}/tags/cart-active`);
    
    console.log(`✅ Cart marked completed for ${contactId}`);
    return true;
  }
  return false;
}

/**
 * Process recovery queue (run by cron)
 */
async function processRecoveryQueue() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('🔄 PROCESSING ABANDONED CART RECOVERY');
  console.log('═'.repeat(60));
  
  const data = await loadCarts();
  const now = Date.now();
  let processed = 0;
  
  for (const cart of data.carts) {
    if (cart.status !== 'active') continue;
    
    const minutesSinceVisit = (now - cart.visitTime) / (60 * 1000);
    const recoverySteps = Object.entries(RECOVERY_SEQUENCE);
    
    // Find the appropriate recovery step
    for (let i = cart.recoveryStep; i < recoverySteps.length; i++) {
      const [stepKey, config] = recoverySteps[i];
      
      if (minutesSinceVisit >= config.delay && cart.recoveryStep === i) {
        console.log(`\n📤 Processing: ${stepKey} for ${cart.name}`);
        
        // Get fresh contact data
        const response = await ghlRequest('GET', `/contacts/${cart.contactId}`);
        const contact = response.contact || response;
        
        // Check if they purchased in the meantime
        if (contact.tags?.includes('customer') || contact.tags?.includes('ebook-buyer')) {
          cart.status = 'completed';
          console.log(`  ⏭️ Skipped - contact already purchased`);
          continue;
        }
        
        // Prepare message
        const productType = detectProductType(cart.product);
        const bonus = PRODUCT_BONUSES[productType] || PRODUCT_BONUSES['ebook'];
        
        if (config.type === 'sms' && cart.phone) {
          const message = config.message
            .replace('{name}', cart.name)
            .replace('{product}', cart.product)
            .replace('{cartUrl}', cart.cartUrl)
            .replace('{bonusOffer}', i >= 2 ? bonus.urgencyBonus : bonus.defaultBonus);
          
          await triggerAgent('marketing',
            `CART RECOVERY SMS: Send to ${cart.name} at ${cart.phone}. ` +
            `Message: "${message}". ` +
            `This is recovery step ${i + 1} of ${recoverySteps.length}.`
          );
        } else if (config.type === 'email') {
          await triggerAgent('marketing',
            `CART RECOVERY EMAIL: Send ${config.template} to ${cart.name} at ${cart.email}. ` +
            `Subject: "${config.subject}". ` +
            `Include cart link: ${cart.cartUrl}. ` +
            `Bonus offer: ${i >= 2 ? bonus.urgencyBonus : bonus.defaultBonus}. ` +
            `This is recovery step ${i + 1} of ${recoverySteps.length}.`
          );
        }
        
        cart.recoveryStep = i + 1;
        cart.lastRecoveryTime = now;
        processed++;
        
        // If this was the last step, mark as exhausted
        if (cart.recoveryStep >= recoverySteps.length) {
          cart.status = 'exhausted';
          
          await notifyTelegram(
            `⚠️ Cart Recovery Exhausted\n` +
            `👤 ${cart.name}\n` +
            `📦 ${cart.product}\n` +
            `📧 ${cart.email}\n` +
            `Manual follow-up recommended`
          );
        }
        
        break; // Only process one step per cart per run
      }
    }
  }
  
  data.lastProcessed = new Date().toISOString();
  await saveCarts(data);
  
  console.log(`\n✅ Processed ${processed} recovery messages`);
  console.log('═'.repeat(60));
  
  return { processed };
}

/**
 * Detect product type from product name
 */
function detectProductType(productName) {
  const name = productName.toLowerCase();
  if (name.includes('intensive') || name.includes('implementation')) return 'intensive';
  if (name.includes('course') || name.includes('mastery')) return 'course';
  return 'ebook';
}

/**
 * Get abandoned cart stats
 */
async function getCartStats() {
  const data = await loadCarts();
  
  const stats = {
    total: data.carts.length,
    active: data.carts.filter(c => c.status === 'active').length,
    completed: data.carts.filter(c => c.status === 'completed').length,
    exhausted: data.carts.filter(c => c.status === 'exhausted').length,
    lastProcessed: data.lastProcessed
  };
  
  // Calculate recovery rate
  if (stats.total > 0) {
    stats.recoveryRate = Math.round((stats.completed / stats.total) * 100);
  } else {
    stats.recoveryRate = 0;
  }
  
  // Calculate revenue recovered (estimated)
  const completedCarts = data.carts.filter(c => c.status === 'completed');
  stats.estimatedRevenue = completedCarts.reduce((sum, cart) => {
    const type = detectProductType(cart.product);
    const values = { ebook: 9.95, course: 297, intensive: 2497 };
    return sum + (values[type] || 9.95);
  }, 0);
  
  return stats;
}

/**
 * Get active carts
 */
async function getActiveCarts() {
  const data = await loadCarts();
  return data.carts.filter(c => c.status === 'active');
}

/**
 * Clean up old cart entries
 */
async function cleanupCarts(daysOlderThan = 30) {
  const data = await loadCarts();
  const cutoff = Date.now() - (daysOlderThan * 24 * 60 * 60 * 1000);
  
  const originalCount = data.carts.length;
  data.carts = data.carts.filter(c => c.visitTime > cutoff || c.status === 'active');
  
  const removed = originalCount - data.carts.length;
  await saveCarts(data);
  
  console.log(`🧹 Cleaned up ${removed} old cart entries`);
  return { removed };
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'track':
    if (args.length < 3) {
      console.log('Usage: abandoned-cart-recovery.mjs track <contactId> <product> <cartUrl>');
      process.exit(1);
    }
    trackCheckoutVisit(args[0], args[1], args[2]);
    break;
    
  case 'complete':
    if (!args[0]) {
      console.log('Usage: abandoned-cart-recovery.mjs complete <contactId>');
      process.exit(1);
    }
    markCartCompleted(args[0]).then(result => {
      console.log(result ? 'Cart marked complete' : 'Cart not found');
    });
    break;
    
  case 'process':
    processRecoveryQueue();
    break;
    
  case 'stats':
    getCartStats().then(stats => {
      console.log('\n📊 ABANDONED CART STATS\n');
      console.log(`Total Carts: ${stats.total}`);
      console.log(`Active: ${stats.active}`);
      console.log(`Recovered: ${stats.completed}`);
      console.log(`Exhausted: ${stats.exhausted}`);
      console.log(`Recovery Rate: ${stats.recoveryRate}%`);
      console.log(`Estimated Revenue: $${stats.estimatedRevenue.toFixed(2)}`);
      console.log(`Last Processed: ${stats.lastProcessed || 'Never'}`);
    });
    break;
    
  case 'active':
    getActiveCarts().then(carts => {
      console.log('\n🛒 ACTIVE CARTS\n');
      if (carts.length === 0) {
        console.log('No active abandoned carts');
        return;
      }
      for (const cart of carts) {
        const age = Math.round((Date.now() - cart.visitTime) / (60 * 1000));
        console.log(`${cart.name} (${cart.email})`);
        console.log(`  Product: ${cart.product}`);
        console.log(`  Age: ${age} minutes`);
        console.log(`  Recovery Step: ${cart.recoveryStep + 1}/4`);
        console.log('');
      }
    });
    break;
    
  case 'cleanup':
    cleanupCarts(parseInt(args[0]) || 30);
    break;
    
  default:
    console.log(`
Abandoned Cart Recovery

Usage:
  abandoned-cart-recovery.mjs track <contactId> <product> <cartUrl>  - Track checkout visit
  abandoned-cart-recovery.mjs complete <contactId>                   - Mark cart completed
  abandoned-cart-recovery.mjs process                                - Process recovery queue
  abandoned-cart-recovery.mjs stats                                  - Show cart statistics
  abandoned-cart-recovery.mjs active                                 - List active carts
  abandoned-cart-recovery.mjs cleanup [days]                         - Remove old cart entries
`);
}

export { 
  trackCheckoutVisit, 
  markCartCompleted, 
  processRecoveryQueue, 
  getCartStats,
  RECOVERY_SEQUENCE 
};
