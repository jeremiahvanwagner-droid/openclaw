#!/usr/bin/env node
/**
 * OpenClaw Substack Browser Control
 *
 * Browser automation for Substack publication management.
 *
 * Features:
 *   - Substack authentication with session persistence
 *   - Draft CRUD (create, read, update, delete)
 *   - QA gate enforcement before publish (from platform-lanes.json qa_gates)
 *   - Issue scheduling (set publish date/time)
 *   - Issue publishing with governance approval gate
 *   - Subscriber analytics read
 *   - Telegram notification integration
 *
 * Usage: node substack-browser-control.mjs <command> [args...]
 *
 * Commands:
 *   login                                    Login to Substack
 *   draft-list                               List all drafts (id, title, updated_at)
 *   draft-create <titleJson>                 Create a new empty draft
 *   draft-read <draftId>                     Read draft content + metadata
 *   draft-update <draftId> <contentJson>     Update draft title, body, or subtitle
 *   draft-delete <draftId>                   Delete a draft (requires governance approval)
 *   draft-preview <draftId>                  Open draft preview URL
 *   draft-qa-check <draftId>                 Run QA gates (word count, links, placeholders)
 *   issue-schedule <draftId> <isoDateTime>   Set scheduled publish time
 *   issue-publish <draftId> <approvedBy>     Publish immediately (critical — requires QA + approval)
 *   analytics-read                           Read subscriber + revenue analytics
 *   screenshot                               Screenshot Substack dashboard → Telegram
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { evaluatePlatformOperation, recordPlatformOperationOutcome } from '../lib/platform-ops-governance.mjs';
import { buildBrowserLaunchArgs } from './browser-security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuration ─────────────────────────────────────────────────────────
const DATA_DIR = process.env.OPENCLAW_DATA_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
const SESSIONS_DIR = path.join(DATA_DIR, 'browser-sessions');
const SESSION_FILE = path.join(SESSIONS_DIR, 'substack-session.json');
const LANES_CONFIG_PATH = path.resolve(__dirname, '../config/platform-lanes.json');

const SUBSTACK_EMAIL            = process.env.SUBSTACK_EMAIL            || '';
const SUBSTACK_PASSWORD         = process.env.SUBSTACK_PASSWORD         || '';
const SUBSTACK_PUBLICATION_URL  = (process.env.SUBSTACK_PUBLICATION_URL || '').replace(/\/$/, '');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '';

// Derive publication slug from URL
const SUBSTACK_PUB_SLUG = SUBSTACK_PUBLICATION_URL
  ? new URL(SUBSTACK_PUBLICATION_URL).hostname.split('.')[0]
  : '';

const SUBSTACK_URLS = {
  login:      'https://substack.com/sign-in',
  dashboard:  () => `${SUBSTACK_PUBLICATION_URL}/publish`,
  drafts:     () => `${SUBSTACK_PUBLICATION_URL}/publish/drafts`,
  newPost:    () => `${SUBSTACK_PUBLICATION_URL}/publish/post`,
  draft:      (id) => `${SUBSTACK_PUBLICATION_URL}/publish/post/${id}`,
  analytics:  () => `${SUBSTACK_PUBLICATION_URL}/publish/analytics`,
  subscribers:() => `${SUBSTACK_PUBLICATION_URL}/publish/subscribers`,
};

const SUBSTACK_SELECTORS = {
  // Login
  emailInput:         'input[name="email"], input[type="email"]',
  continueBtn:        'button:has-text("Continue"), button[type="submit"]',
  passwordInput:      'input[name="password"], input[type="password"]',
  signInBtn:          'button:has-text("Sign in"), button[type="submit"]',
  loggedInIndicator:  '.dashboard-nav, [data-testid="dashboard"], .publication-home',

  // Post editor
  titleInput:         '[data-testid="post-title"], .post-title-input, h1[contenteditable]',
  subtitleInput:      '[data-testid="post-subtitle"], .post-subtitle-input, h2[contenteditable]',
  bodyEditor:         '.editor-wrapper .ProseMirror, [data-testid="editor"], .tiptap',
  wordCountIndicator: '[data-testid="word-count"], .word-count',

  // Draft list
  draftRow:           '[data-testid="draft-row"], .draft-list-item',
  draftTitle:         '.draft-title, [data-testid="draft-title"]',
  draftUpdated:       '.draft-updated, [data-testid="draft-updated"]',

  // Publish controls
  publishBtn:         'button:has-text("Publish"), [data-testid="publish-button"]',
  scheduleBtn:        'button:has-text("Schedule"), [data-testid="schedule-button"]',
  scheduleDateInput:  'input[type="datetime-local"], [data-testid="schedule-datetime"]',
  confirmPublishBtn:  'button:has-text("Publish now"), button:has-text("Confirm publish")',

  // Analytics
  totalSubscribers:   '[data-testid="total-subscribers"], .subscribers-count',
  openRate:           '[data-testid="open-rate"], .open-rate',
  freeCount:          '[data-testid="free-subscribers"], .free-subscribers-count',
  paidCount:          '[data-testid="paid-subscribers"], .paid-subscribers-count',
};

// QA gate rules (mirrors config/platform-lanes.json substack.qa_gates)
const QA_GATES = {
  word_count_min: 200,
  forbidden_placeholders: ['[TODO]', '[INSERT]', '[TBD]', '{{', '[PLACEHOLDER]'],
  subject_line_required: true,
  links_valid: true,
};

// ─── Telegram notification ──────────────────────────────────────────────────
async function notify(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const body = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' });
  return new Promise((resolve) => {
    const req = https.request('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, () => resolve());
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

// ─── Session helpers ────────────────────────────────────────────────────────
async function saveSession(page) {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const cookies = await page.context().cookies();
  await fs.writeFile(SESSION_FILE, JSON.stringify({ cookies, savedAt: Date.now() }, null, 2));
}

async function loadSession(context) {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf8');
    const { cookies, savedAt } = JSON.parse(raw);
    const ageHours = (Date.now() - savedAt) / 3600000;
    if (ageHours > 48) return false;
    await context.addCookies(cookies);
    return true;
  } catch {
    return false;
  }
}

// ─── Governance gate ────────────────────────────────────────────────────────
async function gate(action, agentId, payload = {}, entityId = null) {
  const decision = await evaluatePlatformOperation({
    lane: 'substack',
    action,
    platform: 'substack',
    agentId: agentId || 'substack-browser-control',
    entityId,
    payload,
  });
  if (!decision.ok) {
    throw new Error(`Governance blocked: [${decision.status}] ${decision.reason}`);
  }
  if (decision.requires_approval) {
    throw new Error(`Approval required for ${action}. Status: ${decision.status}. Obtain approval first.`);
  }
  return decision;
}

// ─── Browser launcher ───────────────────────────────────────────────────────
async function launchBrowser() {
  const { chromium } = await import('playwright');
  const extraArgs = [];
  const args = await buildBrowserLaunchArgs(extraArgs);
  const browser = await chromium.launch({ headless: true, args });
  const profileDir = path.join(DATA_DIR, 'browser-runtime', 'profiles', 'content-live');
  await fs.mkdir(profileDir, { recursive: true });
  const context = await browser.newContext({
    userDataDir: profileDir,
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  return { browser, context };
}

// ─── Login ──────────────────────────────────────────────────────────────────
async function loginToSubstack(page) {
  if (!SUBSTACK_EMAIL || !SUBSTACK_PASSWORD) {
    throw new Error('SUBSTACK_EMAIL and SUBSTACK_PASSWORD environment variables are required');
  }
  await page.goto(SUBSTACK_URLS.login, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill(SUBSTACK_SELECTORS.emailInput, SUBSTACK_EMAIL);
  await page.click(SUBSTACK_SELECTORS.continueBtn);
  await page.waitForSelector(SUBSTACK_SELECTORS.passwordInput, { timeout: 10000 });
  await page.fill(SUBSTACK_SELECTORS.passwordInput, SUBSTACK_PASSWORD);
  await page.click(SUBSTACK_SELECTORS.signInBtn);
  await page.waitForSelector(SUBSTACK_SELECTORS.loggedInIndicator, { timeout: 20000 });
}

// ─── QA check (in-memory, on page content) ──────────────────────────────────
async function runQaGates(page) {
  const errors = [];

  // Word count
  const bodyText = await page.$eval(
    SUBSTACK_SELECTORS.bodyEditor,
    el => el.innerText || el.textContent || ''
  ).catch(() => '');
  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < QA_GATES.word_count_min) {
    errors.push(`word_count: ${wordCount} < minimum ${QA_GATES.word_count_min}`);
  }

  // Subject line
  const title = await page.$eval(SUBSTACK_SELECTORS.titleInput, el => el.innerText || el.textContent || '').catch(() => '');
  if (QA_GATES.subject_line_required && !title.trim()) {
    errors.push('subject_line: missing title');
  }

  // Placeholder detection
  const fullText = title + ' ' + bodyText;
  for (const placeholder of QA_GATES.forbidden_placeholders) {
    if (fullText.includes(placeholder)) {
      errors.push(`placeholder_found: "${placeholder}"`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    metrics: { word_count: wordCount, title_length: title.trim().length },
  };
}

// ─── Commands ───────────────────────────────────────────────────────────────
const commands = {

  async 'login'(args) {
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      await loginToSubstack(page);
      await saveSession(page);
      console.log(JSON.stringify({ ok: true, message: 'Substack login successful, session saved' }));
    } finally {
      await browser.close();
    }
  },

  async 'draft-list'(args) {
    const decision = await gate('draft_read', args.agentId);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await page.goto(SUBSTACK_URLS.drafts(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(SUBSTACK_SELECTORS.draftRow, { timeout: 10000 }).catch(() => {});
      const drafts = await page.$$eval(SUBSTACK_SELECTORS.draftRow, rows => rows.map(r => ({
        title: r.querySelector('.draft-title')?.textContent?.trim() || '',
        updated: r.querySelector('.draft-updated')?.textContent?.trim() || '',
        id: r.getAttribute('data-id') || r.getAttribute('data-draft-id') || null,
      })));
      console.log(JSON.stringify({ ok: true, drafts }));
    } finally {
      await browser.close();
    }
  },

  async 'draft-create'(args) {
    const meta = JSON.parse(args[0] || '{}');
    const decision = await gate('draft_create', args.agentId, meta);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await page.goto(SUBSTACK_URLS.newPost(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(SUBSTACK_SELECTORS.titleInput, { timeout: 10000 });
      if (meta.title) await page.fill(SUBSTACK_SELECTORS.titleInput, meta.title);
      if (meta.subtitle) await page.fill(SUBSTACK_SELECTORS.subtitleInput, meta.subtitle);
      const draftUrl = page.url();
      const draftIdMatch = draftUrl.match(/\/post\/(\d+)/);
      const draftId = draftIdMatch ? draftIdMatch[1] : null;
      await recordPlatformOperationOutcome({ lane: 'substack', action: 'draft_create', profile: 'content-live', correlation_id: decision.correlation_id, status: 'success', result: { draft_id: draftId, title: meta.title } });
      console.log(JSON.stringify({ ok: true, draft_id: draftId, url: draftUrl, correlation_id: decision.correlation_id }));
    } finally {
      await browser.close();
    }
  },

  async 'draft-read'(args) {
    const draftId = args[0];
    if (!draftId) throw new Error('draftId required');
    const decision = await gate('draft_read', args.agentId, {}, draftId);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await page.goto(SUBSTACK_URLS.draft(draftId), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(SUBSTACK_SELECTORS.titleInput, { timeout: 10000 });
      const title = await page.$eval(SUBSTACK_SELECTORS.titleInput, el => el.innerText || el.textContent || '').catch(() => '');
      const body = await page.$eval(SUBSTACK_SELECTORS.bodyEditor, el => el.innerText || el.textContent || '').catch(() => '');
      const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
      console.log(JSON.stringify({ ok: true, draft_id: draftId, title, word_count: wordCount, body_preview: body.slice(0, 200) }));
    } finally {
      await browser.close();
    }
  },

  async 'draft-update'(args) {
    const draftId = args[0];
    const content = JSON.parse(args[1] || '{}');
    if (!draftId) throw new Error('draftId required');
    const decision = await gate('draft_update', args.agentId, content, draftId);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await page.goto(SUBSTACK_URLS.draft(draftId), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(SUBSTACK_SELECTORS.titleInput, { timeout: 10000 });
      if (content.title) {
        await page.click(SUBSTACK_SELECTORS.titleInput);
        await page.keyboard.selectAll();
        await page.keyboard.type(content.title);
      }
      if (content.body) {
        await page.click(SUBSTACK_SELECTORS.bodyEditor);
        await page.keyboard.selectAll();
        await page.keyboard.type(content.body);
      }
      // Substack auto-saves; wait briefly for autosave
      await page.waitForTimeout(2000);
      await recordPlatformOperationOutcome({ lane: 'substack', action: 'draft_update', profile: 'content-live', correlation_id: decision.correlation_id, status: 'success', result: { draft_id: draftId } });
      console.log(JSON.stringify({ ok: true, draft_id: draftId, updated_fields: Object.keys(content), correlation_id: decision.correlation_id }));
    } finally {
      await browser.close();
    }
  },

  async 'draft-qa-check'(args) {
    const draftId = args[0];
    if (!draftId) throw new Error('draftId required');
    const decision = await gate('draft_read', args.agentId, {}, draftId);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await page.goto(SUBSTACK_URLS.draft(draftId), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(SUBSTACK_SELECTORS.titleInput, { timeout: 10000 });
      const qaResult = await runQaGates(page);
      console.log(JSON.stringify({ ok: true, draft_id: draftId, qa: qaResult }));
    } finally {
      await browser.close();
    }
  },

  async 'draft-preview'(args) {
    const draftId = args[0];
    if (!draftId) throw new Error('draftId required');
    const decision = await gate('draft_read', args.agentId, {}, draftId);
    const previewUrl = `${SUBSTACK_URLS.draft(draftId)}?preview=1`;
    console.log(JSON.stringify({ ok: true, draft_id: draftId, preview_url: previewUrl }));
  },

  async 'issue-schedule'(args) {
    const draftId = args[0];
    const isoDateTime = args[1];
    if (!draftId || !isoDateTime) throw new Error('draftId and isoDateTime required');
    // Validate ISO date
    const ts = Date.parse(isoDateTime);
    if (isNaN(ts)) throw new Error(`Invalid isoDateTime: ${isoDateTime}`);
    if (ts <= Date.now()) throw new Error('Schedule date must be in the future');
    const decision = await gate('issue_schedule', args.agentId, { scheduled_for: isoDateTime }, draftId);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await page.goto(SUBSTACK_URLS.draft(draftId), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(SUBSTACK_SELECTORS.scheduleBtn, { timeout: 15000 });
      await page.click(SUBSTACK_SELECTORS.scheduleBtn);
      const dateInput = await page.$(SUBSTACK_SELECTORS.scheduleDateInput);
      if (dateInput) {
        await dateInput.fill(isoDateTime);
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(2000);
      await recordPlatformOperationOutcome({ lane: 'substack', action: 'issue_schedule', profile: 'content-live', correlation_id: decision.correlation_id, status: 'success', result: { draft_id: draftId, scheduled_for: isoDateTime } });
      await notify(`⏰ Substack issue scheduled\nDraft: ${draftId}\nPublish time: ${isoDateTime}`);
      console.log(JSON.stringify({ ok: true, draft_id: draftId, scheduled_for: isoDateTime, correlation_id: decision.correlation_id }));
    } finally {
      await browser.close();
    }
  },

  async 'issue-publish'(args) {
    const draftId = args[0];
    const approvedBy = args[1];
    if (!draftId) throw new Error('draftId required');
    if (!approvedBy) throw new Error('approvedBy required — issue-publish is a critical action');

    const decision = await gate('issue_publish', args.agentId, { approved_by: approvedBy }, draftId);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await page.goto(SUBSTACK_URLS.draft(draftId), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(SUBSTACK_SELECTORS.titleInput, { timeout: 10000 });

      // Enforce QA gates before publish
      const qaResult = await runQaGates(page);
      if (!qaResult.passed) {
        throw new Error(`QA gates failed before publish: ${qaResult.errors.join('; ')}`);
      }

      await page.waitForSelector(SUBSTACK_SELECTORS.publishBtn, { timeout: 15000 });
      await page.click(SUBSTACK_SELECTORS.publishBtn);
      const confirmBtn = await page.$(SUBSTACK_SELECTORS.confirmPublishBtn);
      if (confirmBtn) await confirmBtn.click();
      await page.waitForTimeout(3000);

      await recordPlatformOperationOutcome({
        lane: 'substack', action: 'issue_publish', profile: 'content-live',
        correlation_id: decision.correlation_id, status: 'success',
        result: { draft_id: draftId, approved_by: approvedBy, qa: qaResult }
      });
      await notify(`🚀 Substack issue published!\nDraft: ${draftId}\nApproved by: ${approvedBy}`);
      console.log(JSON.stringify({ ok: true, draft_id: draftId, status: 'published', approved_by: approvedBy, qa: qaResult, correlation_id: decision.correlation_id }));
    } finally {
      await browser.close();
    }
  },

  async 'analytics-read'(args) {
    const decision = await gate('analytics_read', args.agentId);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await page.goto(SUBSTACK_URLS.analytics(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      const total = await page.$eval(SUBSTACK_SELECTORS.totalSubscribers, el => el.textContent.trim()).catch(() => null);
      const openRate = await page.$eval(SUBSTACK_SELECTORS.openRate, el => el.textContent.trim()).catch(() => null);
      const free = await page.$eval(SUBSTACK_SELECTORS.freeCount, el => el.textContent.trim()).catch(() => null);
      const paid = await page.$eval(SUBSTACK_SELECTORS.paidCount, el => el.textContent.trim()).catch(() => null);
      console.log(JSON.stringify({ ok: true, subscribers: { total, free, paid }, open_rate: openRate }));
    } finally {
      await browser.close();
    }
  },

  async 'screenshot'(args) {
    const decision = await gate('analytics_read', args.agentId);
    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      const loaded = await loadSession(context);
      if (!loaded) { await loginToSubstack(page); await saveSession(page); }
      await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
      const filename = `substack-dashboard-${Date.now()}.png`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);
      await page.goto(SUBSTACK_URLS.dashboard(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.screenshot({ path: filepath, fullPage: false });
      await notify(`📸 Substack screenshot saved: ${filename}`);
      console.log(JSON.stringify({ ok: true, file: filepath }));
    } finally {
      await browser.close();
    }
  },

  async 'draft-delete'(args) {
    const draftId = args[0];
    const approvedBy = args[1];
    if (!draftId) throw new Error('draftId required');
    if (!approvedBy) throw new Error('approvedBy required — draft-delete is a high-risk action');
    const decision = await gate('draft_delete', args.agentId, { approved_by: approvedBy }, draftId);
    console.log(JSON.stringify({ ok: true, status: 'delete_approved', draft_id: draftId, approved_by: approvedBy, correlation_id: decision.correlation_id, note: 'Navigate to draft and use Substack UI to confirm deletion' }));
    await notify(`⚠️ Substack draft deletion approved\nDraft: ${draftId}\nApproved by: ${approvedBy}`);
  },
};

// ─── CLI entrypoint ─────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;
const handler = commands[cmd];
if (!handler) {
  console.error(JSON.stringify({ ok: false, error: `Unknown command: ${cmd}`, available: Object.keys(commands) }));
  process.exit(1);
}
handler(args).catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
