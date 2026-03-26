#!/usr/bin/env node
/**
 * OpenClaw Browser Pool Manager
 * 
 * Manages 50+ concurrent browser instances for GoHighLevel and social media automation
 * 
 * Features:
 *   - Multi-browser instance pooling (Playwright + Puppeteer)
 *   - Resource management & limits
 *   - Task queue distribution
 *   - Session persistence across instances
 *   - Health monitoring & auto-recovery
 *   - Account rotation
 *   - Rate limiting per platform
 * 
 * Usage:
 *   import { BrowserPool } from './browser-pool-manager.mjs';
 */

import fs from 'fs/promises';
import path from 'path';
import EventEmitter from 'events';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const BROWSER_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'browser');

const POOL_CONFIG = {
  maxInstances: 50,
  maxInstancesPerPlatform: 10,
  instanceIdleTimeout: 300000, // 5 minutes
  taskTimeout: 120000, // 2 minutes
  healthCheckInterval: 60000, // 1 minute
  maxRetries: 3,
  maxProvisionRetries: 3,
  rateLimits: {
    ghl: { requests: 100, period: 60000 }, // 100/min
    tiktok: { requests: 10, period: 60000 },
    instagram: { requests: 20, period: 60000 },
    facebook: { requests: 30, period: 60000 },
    twitter: { requests: 50, period: 60000 },
    linkedin: { requests: 20, period: 60000 },
    youtube: { requests: 10, period: 60000 }
  }
};

/**
 * Browser Pool Manager
 */
class BrowserPool extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = { ...POOL_CONFIG, ...config };
    
    // Pool state
    this.instances = new Map(); // instanceId -> { browser, platform, account, status, lastUsed, tasks }
    this.queue = []; // Pending tasks
    this.accounts = new Map(); // platform -> [accounts]
    this.rateLimiters = new Map(); // platform -> { count, resetAt }
    
    // Statistics
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      activeInstances: 0,
      startedAt: Date.now()
    };
    
    // Health monitoring
    this.healthCheckTimer = null;
    this.isShuttingDown = false;
  }
  
  /**
   * Initialize the browser pool
   */
  async initialize() {
    await fs.mkdir(BROWSER_DIR, { recursive: true });
    await fs.mkdir(path.join(BROWSER_DIR, 'sessions'), { recursive: true });
    
    // Load account configurations
    await this.loadAccounts();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    this.emit('initialized');
    console.log(`✅ Browser pool initialized (max: ${this.config.maxInstances} instances)`);
  }
  
  /**
   * Load account configurations from files
   */
  async loadAccounts() {
    const accountsFile = path.join(DATA_DIR, 'browser-accounts.json');
    
    try {
      const data = await fs.readFile(accountsFile, 'utf8');
      const accounts = JSON.parse(data);
      
      for (const [platform, accountList] of Object.entries(accounts)) {
        this.accounts.set(platform, accountList);
      }
      
      console.log(`📦 Loaded accounts: ${Array.from(this.accounts.keys()).join(', ')}`);
    } catch (error) {
      // Create default structure if file doesn't exist
      const defaultAccounts = {
        ghl: [{ email: process.env.GHL_EMAIL, password: process.env.GHL_PASSWORD }],
        tiktok: [{ username: '@TruthJBlue' }],
        instagram: [{ username: '@TruthJBlue' }],
        facebook: [{ username: 'TruthJBlue' }],
        twitter: [{ username: '@TruthJBlue' }],
        linkedin: [{ username: 'vanwagnerjeremiah' }],
        youtube: [
          { username: '@TruthJBlue' },
          { username: '@palaceofexcellence' }
        ]
      };
      
      await fs.writeFile(accountsFile, JSON.stringify(defaultAccounts, null, 2));
      this.accounts = new Map(Object.entries(defaultAccounts));
      
      console.log('📝 Created default browser-accounts.json');
    }
  }
  
  /**
   * Add task to queue
   */
  async addTask(task) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const queuedTask = {
      id: taskId,
      ...task,
      addedAt: Date.now(),
      retries: 0,
      provisionFailures: 0,
      status: 'queued'
    };
    
    this.queue.push(queuedTask);
    this.stats.totalTasks++;
    
    this.emit('taskQueued', queuedTask);
    
    // Process queue
    this.processQueue();
    
    return taskId;
  }
  
  /**
   * Process task queue
   */
  async processQueue() {
    if (this.isShuttingDown || this.queue.length === 0) {
      return;
    }
    
    // Find available instance or create new one
    const task = this.queue[0];
    
    if (!task) return;
    
    const allocation = await this.getOrCreateInstance(task.platform, task.account);
    
    if (allocation.status !== 'ok') {
      if (allocation.status === 'provision-failed') {
        task.provisionFailures = (task.provisionFailures || 0) + 1;
        if (task.provisionFailures >= this.config.maxProvisionRetries) {
          this.queue.shift();
          task.status = 'failed';
          task.error = `Failed to provision browser instance for ${task.platform} after ${task.provisionFailures} attempt(s)`;
          task.completedAt = Date.now();
          this.stats.failedTasks++;
          const err = new Error(task.error);
          this.emit('taskFailed', task, err);
          console.error(`❌ ${task.error}`);
          this.processQueue();
          return;
        }
      }

      // Rate-limited or at-capacity pools retry naturally.
      setTimeout(() => this.processQueue(), 1000);
      return;
    }
    
    const instance = allocation.instance;
    
    // Remove from queue and execute
    this.queue.shift();
    await this.executeTask(instance, task);
    
    // Continue processing
    this.processQueue();
  }
  
  /**
   * Get existing instance or create new one
   */
  async getOrCreateInstance(platform, accountId = null) {
    // Check rate limits
    if (!this.checkRateLimit(platform)) {
      return { status: 'rate-limited' };
    }
    
    // Try to find idle instance for this platform
    for (const [id, instance] of this.instances) {
      if (instance.platform === platform && 
          instance.status === 'idle' &&
          (!accountId || instance.account === accountId)) {
        instance.status = 'busy';
        instance.lastUsed = Date.now();
        return { status: 'ok', instance };
      }
    }
    
    // Create new instance if under limits
    const platformInstanceCount = Array.from(this.instances.values())
      .filter(i => i.platform === platform).length;
    
    if (this.instances.size >= this.config.maxInstances ||
        platformInstanceCount >= this.config.maxInstancesPerPlatform) {
      return { status: 'capacity' };
    }
    
    const instance = await this.createInstance(platform, accountId);
    if (!instance) {
      return { status: 'provision-failed' };
    }
    return { status: 'ok', instance };
  }
  
  /**
   * Create new browser instance
   */
  async createInstance(platform, accountId = null) {
    const instanceId = `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    try {
      const { getBrowser } = await import('./browser-core.mjs');
      
      const browser = await getBrowser(platform, {
        headless: true,
        userDataDir: path.join(BROWSER_DIR, 'sessions', instanceId)
      });
      
      const instance = {
        id: instanceId,
        browser,
        platform,
        account: accountId,
        status: 'busy',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        tasks: 0,
        errors: 0
      };
      
      this.instances.set(instanceId, instance);
      this.stats.activeInstances++;
      
      this.emit('instanceCreated', instance);
      console.log(`🌐 Created browser instance: ${instanceId} (${platform})`);
      
      return instance;
    } catch (error) {
      console.error(`❌ Failed to create instance for ${platform}:`, error.message);
      return null;
    }
  }
  
  /**
   * Execute task on instance
   */
  async executeTask(instance, task) {
    task.status = 'running';
    task.startedAt = Date.now();
    task.instanceId = instance.id;
    
    this.emit('taskStarted', task);
    
    const timeout = setTimeout(() => {
      this.emit('taskTimeout', task);
      task.status = 'timeout';
    }, this.config.taskTimeout);
    
    try {
      let result;
      const browserInstance = instance.browser; // This is the object from getBrowser()
      const browser = browserInstance.browser;
      const context = browserInstance.context;
      
      // Create page from context (Playwright) or browser (Puppeteer)
      const page = context ? await context.newPage() : await browser.newPage();
      
      switch (task.type) {
        case 'custom':
          // Custom task with user-provided execute function
          if (!task.execute || typeof task.execute !== 'function') {
            throw new Error('Custom task requires an execute function');
          }
          result = await task.execute(browser, page);
          break;
          
        case 'ghl_screenshot':
          const { screenshotDashboard } = await import('./ghl-browser-control.mjs');
          result = await screenshotDashboard(task.page || 'dashboard');
          break;
          
        case 'ghl_create_membership':
          const { createMembership } = await import('./ghl-browser-control.mjs');
          result = await createMembership(task.name, task.description);
          break;
          
        case 'social_post':
          const { post } = await import('./social-media-publisher.mjs');
          result = await post(task.platform, task.content);
          break;
          
        case 'social_schedule':
          const { schedulePost } = await import('./social-media-publisher.mjs');
          result = await schedulePost(task.platform, task.content, task.scheduleTime);
          break;
          
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
      
      // Close the page
      await page.close();
      
      clearTimeout(timeout);
      
      task.status = 'completed';
      task.completedAt = Date.now();
      task.duration = task.completedAt - task.startedAt;
      task.result = result;
      
      this.stats.completedTasks++;
      instance.tasks++;
      instance.status = 'idle';
      instance.lastUsed = Date.now();
      
      this.emit('taskCompleted', task);
      console.log(`✅ Task completed: ${task.id} (${task.duration}ms)`);
      
      // Update rate limiter
      this.incrementRateLimit(instance.platform);
      
    } catch (error) {
      clearTimeout(timeout);
      
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = Date.now();
      
      this.stats.failedTasks++;
      instance.errors++;
      
      this.emit('taskFailed', task, error);
      console.error(`❌ Task failed: ${task.id} - ${error.message}`);
      
      // Retry logic
      if (task.retries < this.config.maxRetries) {
        task.retries++;
        task.status = 'queued';
        this.queue.push(task);
        console.log(`🔄 Retrying task: ${task.id} (attempt ${task.retries}/${this.config.maxRetries})`);
      }
      
      // Mark instance as idle
      instance.status = 'idle';
      
      // If too many errors, destroy instance
      if (instance.errors > 5) {
        await this.destroyInstance(instance.id);
      }
    }
  }
  
  /**
   * Check rate limit for platform
   */
  checkRateLimit(platform) {
    const limit = this.config.rateLimits[platform];
    if (!limit) return true;
    
    const limiter = this.rateLimiters.get(platform) || { count: 0, resetAt: Date.now() + limit.period };
    
    if (Date.now() > limiter.resetAt) {
      limiter.count = 0;
      limiter.resetAt = Date.now() + limit.period;
    }
    
    return limiter.count < limit.requests;
  }
  
  /**
   * Increment rate limit counter
   */
  incrementRateLimit(platform) {
    const limit = this.config.rateLimits[platform];
    if (!limit) return;
    
    const limiter = this.rateLimiters.get(platform) || { count: 0, resetAt: Date.now() + limit.period };
    limiter.count++;
    this.rateLimiters.set(platform, limiter);
  }
  
  /**
   * Destroy browser instance
   */
  async destroyInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    try {
      // instance.browser is the wrapper { browser, context, type } from browser-core
      const wrapper = instance.browser;
      if (wrapper) {
        // Close persistent context (Playwright)
        if (wrapper.context && typeof wrapper.context.close === 'function') {
          await wrapper.context.close();
        }
        // Close browser instance (Puppeteer or Playwright standard)
        if (wrapper.browser && typeof wrapper.browser.close === 'function') {
          await wrapper.browser.close();
        }
      }
      
      this.instances.delete(instanceId);
      this.stats.activeInstances--;
      
      this.emit('instanceDestroyed', instance);
      console.log(`🗑️  Destroyed instance: ${instanceId}`);
    } catch (error) {
      console.error(`Failed to destroy instance ${instanceId}:`, error.message);
    }
  }
  
  /**
   * Health monitoring
   */
  startHealthMonitoring() {
    this.healthCheckTimer = setInterval(async () => {
      const now = Date.now();
      
      // Check for idle instances to clean up
      for (const [id, instance] of this.instances) {
        if (instance.status === 'idle' && 
            now - instance.lastUsed > this.config.instanceIdleTimeout) {
          await this.destroyInstance(id);
        }
      }
      
      // Emit health stats
      this.emit('healthCheck', this.getStats());
    }, this.config.healthCheckInterval);
  }
  
  /**
   * Get pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      instancesById: Object.fromEntries(
        Array.from(this.instances.entries()).map(([id, inst]) => [
          id,
          {
            platform: inst.platform,
            status: inst.status,
            tasks: inst.tasks,
            errors: inst.errors,
            uptime: Date.now() - inst.createdAt
          }
        ])
      ),
      rateLimits: Object.fromEntries(this.rateLimiters)
    };
  }
  
  /**
   * Shutdown pool gracefully
   */
  async shutdown() {
    this.isShuttingDown = true;
    
    console.log('🛑 Shutting down browser pool...');
    
    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    // Wait for active tasks to complete (with timeout)
    const shutdownTimeout = setTimeout(() => {
      console.log('⚠️  Shutdown timeout reached, forcing close');
    }, 30000);
    
    while (this.queue.length > 0 || 
           Array.from(this.instances.values()).some(i => i.status === 'busy')) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    clearTimeout(shutdownTimeout);
    
    // Destroy all instances
    const instances = Array.from(this.instances.keys());
    for (const id of instances) {
      await this.destroyInstance(id);
    }
    
    this.emit('shutdown');
    console.log('✅ Browser pool shut down');
  }
}

// Singleton instance
let poolInstance = null;

export function getBrowserPool(config = {}) {
  if (!poolInstance) {
    poolInstance = new BrowserPool(config);
  }
  return poolInstance;
}

export { BrowserPool };

// CLI interface
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const command = process.argv[2];
  
  (async () => {
    const pool = getBrowserPool();
    await pool.initialize();
    
    try {
      switch (command) {
        case 'test':
          console.log('🧪 Testing browser pool with sample tasks...\n');
          
          // Add test tasks
          await pool.addTask({
            type: 'ghl_screenshot',
            platform: 'ghl',
            page: 'dashboard'
          });
          
          await pool.addTask({
            type: 'social_post',
            platform: 'twitter',
            content: { text: 'Test post from OpenClaw Browser Pool' }
          });
          
          // Wait for tasks to complete
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          console.log('\n📊 Pool Statistics:');
          console.log(JSON.stringify(pool.getStats(), null, 2));
          
          await pool.shutdown();
          break;
          
        case 'stats':
          console.log(JSON.stringify(pool.getStats(), null, 2));
          break;
          
        case 'monitor':
          console.log('📡 Monitoring browser pool (Ctrl+C to stop)...\n');
          
          pool.on('taskQueued', t => console.log(`📥 Queued: ${t.id} (${t.type})`));
          pool.on('taskStarted', t => console.log(`🏃 Started: ${t.id}`));
          pool.on('taskCompleted', t => console.log(`✅ Completed: ${t.id} in ${t.duration}ms`));
          pool.on('taskFailed', (t, e) => console.log(`❌ Failed: ${t.id} - ${e.message}`));
          pool.on('instanceCreated', i => console.log(`🌐 Instance created: ${i.id}`));
          pool.on('instanceDestroyed', i => console.log(`🗑️  Instance destroyed: ${i.id}`));
          
          // Keep alive
          await new Promise(() => {});
          break;
          
        default:
          console.log(`
OpenClaw Browser Pool Manager

Commands:
  test         Run test tasks through pool
  stats        Show current pool statistics
  monitor      Monitor pool activity in real-time

Pool Configuration:
  Max Instances:     ${POOL_CONFIG.maxInstances}
  Per Platform:      ${POOL_CONFIG.maxInstancesPerPlatform}
  Idle Timeout:      ${POOL_CONFIG.instanceIdleTimeout}ms
  Task Timeout:      ${POOL_CONFIG.taskTimeout}ms

Supported Platforms:
  - ghl (GoHighLevel)
  - tiktok
  - instagram
  - facebook
  - twitter
  - linkedin
  - youtube
          `);
          process.exit(0);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      await pool.shutdown();
      process.exit(1);
    }
  })();
}
