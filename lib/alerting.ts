/**
 * Alerting Module
 * OpenClaw Multi-Agent Network
 *
 * Multi-channel alerting with cascading fallback:
 *   1. Telegram (primary)
 *   2. Email via Nodemailer SMTP (secondary)
 *   3. Disk log (last resort)
 *
 * For critical alerts, all channels are attempted in parallel.
 */

import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { logger } from "./logger.ts";
import { alertsSentTotal } from "./metrics.ts";

const log = logger.child({ module: "alerting" });

export type AlertSeverity = "info" | "warning" | "critical";

// ═══════════════════════════════════════════════════════════════════
// SMTP TRANSPORT (lazy init)
// ═══════════════════════════════════════════════════════════════════

let smtpTransport: nodemailer.Transporter | null = null;

function getSmtpTransport(): nodemailer.Transporter | null {
  if (smtpTransport) return smtpTransport;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  smtpTransport = nodemailer.createTransport({
    host,
    port: Number(port) || 587,
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return smtpTransport;
}

// ═══════════════════════════════════════════════════════════════════
// CHANNEL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════

async function sendTelegram(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error("Telegram not configured");

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API ${res.status}: ${body}`);
  }
}

async function sendEmail(message: string, severity: AlertSeverity): Promise<void> {
  const transport = getSmtpTransport();
  const to = process.env.ALERT_EMAIL_TO;
  if (!transport || !to) throw new Error("Email not configured");

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[OpenClaw ${severity.toUpperCase()}] Alert`,
    text: message,
  });
}

function writeToDisk(message: string, severity: AlertSeverity): void {
  const logDir = process.env.ALERT_LOG_DIR || path.join(process.cwd(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logPath = path.join(logDir, "alerts-fallback.log");
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    severity,
    message,
  });
  fs.appendFileSync(logPath, entry + "\n");
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Send alert with cascading fallback.
 * - Critical: all channels in parallel
 * - Warning/Info: Telegram → Email → Disk cascade
 */
export async function sendAlert(
  message: string,
  severity: AlertSeverity = "warning"
): Promise<void> {
  if (severity === "critical") {
    // Fire all channels simultaneously
    const results = await Promise.allSettled([
      sendTelegram(message).then(() => alertsSentTotal.inc({ channel: "telegram", status: "success" })),
      sendEmail(message, severity).then(() => alertsSentTotal.inc({ channel: "email", status: "success" })),
    ]);

    const allFailed = results.every((r) => r.status === "rejected");
    if (allFailed) {
      writeToDisk(message, severity);
      alertsSentTotal.inc({ channel: "disk", status: "success" });
      log.error("All alert channels failed, wrote to disk");
    }

    for (const r of results) {
      if (r.status === "rejected") {
        const channel = results.indexOf(r) === 0 ? "telegram" : "email";
        alertsSentTotal.inc({ channel, status: "error" });
        log.warn({ err: r.reason?.message, channel }, "Alert channel failed");
      }
    }
    return;
  }

  // Cascade: Telegram → Email → Disk
  try {
    await sendTelegram(message);
    alertsSentTotal.inc({ channel: "telegram", status: "success" });
    return;
  } catch (err) {
    alertsSentTotal.inc({ channel: "telegram", status: "error" });
    log.warn({ err: (err as Error).message }, "Telegram alert failed, trying email");
  }

  try {
    await sendEmail(message, severity);
    alertsSentTotal.inc({ channel: "email", status: "success" });
    return;
  } catch (err) {
    alertsSentTotal.inc({ channel: "email", status: "error" });
    log.warn({ err: (err as Error).message }, "Email alert failed, writing to disk");
  }

  writeToDisk(message, severity);
  alertsSentTotal.inc({ channel: "disk", status: "success" });
}
