#!/usr/bin/env node
/**
 * Credential Rotation Checker
 * OpenClaw Multi-Agent Network
 *
 * Reads deploy/hetzner/credential-inventory.csv and alerts via Telegram
 * when credentials are within 14 days of their rotate_by date or overdue.
 *
 * Usage:  node scripts/credential-rotation-check.mjs
 * Cron:   Run daily via openclaw cron or system crontab.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openclawSend } from '../lib/safe-exec.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_PATH = path.join(__dirname, '..', 'deploy', 'hetzner', 'credential-inventory.csv');
const WARN_DAYS = 14;

function parseCSV(text) {
  const [headerLine, ...rows] = text.trim().split('\n');
  const headers = headerLine.split(',');
  return rows.map(row => {
    const values = row.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (values[i] || '').trim(); });
    return obj;
  });
}

function daysBetween(dateStr, now) {
  const target = new Date(dateStr + 'T00:00:00Z');
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[ROTATION CHECK] CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const csv = fs.readFileSync(CSV_PATH, 'utf-8');
  const credentials = parseCSV(csv);
  const now = new Date();
  const alerts = [];

  for (const cred of credentials) {
    const { credential, rotate_by } = cred;
    if (!rotate_by) {
      alerts.push(`⚠️ ${credential}: No rotate_by date set!`);
      continue;
    }

    const daysLeft = daysBetween(rotate_by, now);

    if (daysLeft < 0) {
      alerts.push(`🔴 ${credential}: OVERDUE by ${Math.abs(daysLeft)} days (was due ${rotate_by})`);
    } else if (daysLeft <= WARN_DAYS) {
      alerts.push(`🟡 ${credential}: Rotation due in ${daysLeft} days (${rotate_by})`);
    }
  }

  if (alerts.length === 0) {
    console.log('[ROTATION CHECK] All credentials within rotation window. No alerts.');
    return;
  }

  const message = `🔑 Credential Rotation Alert\n${alerts.join('\n')}`;
  console.log(message);

  const chatId = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID;
  if (chatId) {
    try {
      await openclawSend({ agent: 'main', channel: 'telegram', to: chatId, message });
      console.log('[ROTATION CHECK] Telegram alert sent.');
    } catch (err) {
      console.error('[ROTATION CHECK] Failed to send Telegram alert:', err.message);
    }
  } else {
    console.warn('[ROTATION CHECK] OPENCLAW_ALERT_TELEGRAM_CHAT_ID not set — skipping Telegram.');
  }
}

main().catch(err => {
  console.error('[ROTATION CHECK] Fatal:', err.message);
  process.exit(1);
});
