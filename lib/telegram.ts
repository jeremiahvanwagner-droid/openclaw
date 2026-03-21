/**
 * Telegram Delivery Service
 * OpenClaw Multi-Agent Network
 *
 * Sends messages to Telegram via the Bot API.
 * Uses TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.
 */

import { logger } from "./logger";

const log = logger.child({ module: "telegram" });

export interface TelegramSendOptions {
  chatId?: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  disableNotification?: boolean;
}

function getBotToken(): string {
  return (
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.OPENCLAW_TELEGRAM_BOT_TOKEN ||
    ""
  );
}

function getDefaultChatId(): string {
  return (
    process.env.TELEGRAM_CHAT_ID ||
    process.env.TELEGRAM_ALERT_CHAT_ID ||
    process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID ||
    ""
  );
}

/**
 * Send a message to a Telegram chat.
 *
 * Returns `true` on success, `false` if credentials are missing or the
 * API call fails.
 */
export async function sendTelegramMessage(
  message: string,
  options: TelegramSendOptions = {},
): Promise<boolean> {
  const botToken = getBotToken();
  const chatId = options.chatId || getDefaultChatId();

  if (!botToken || !chatId) {
    log.warn("Telegram credentials not configured — message not sent");
    return false;
  }

  const { parseMode = "Markdown", disableNotification = false } = options;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: parseMode,
          disable_notification: disableNotification,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    const result = (await response.json()) as { ok: boolean; description?: string };

    if (!result.ok) {
      log.warn(
        { description: result.description },
        "Telegram API returned not-ok",
      );
      return false;
    }

    return true;
  } catch (err) {
    log.error({ err: (err as Error).message }, "Telegram sendMessage failed");
    return false;
  }
}

/**
 * Send a formatted agent notification to Telegram.
 *
 * Includes an emoji prefix, the agent name as a bold header, and the agent ID.
 * Urgent messages enable notifications; normal messages are silent.
 */
export async function sendAgentNotification(
  agentId: string,
  agentName: string,
  message: string,
  priority: "normal" | "urgent" = "normal",
): Promise<boolean> {
  const emoji = priority === "urgent" ? "🚨" : "🤖";
  const formatted = `${emoji} *${agentName}* \`[${agentId}]\`\n\n${message}`;

  return sendTelegramMessage(formatted, {
    disableNotification: priority === "normal",
  });
}

/**
 * Send a system alert to Telegram.
 *
 * Always sends with notification enabled regardless of priority.
 */
export async function sendTelegramAlert(
  message: string,
  source = "system",
): Promise<boolean> {
  const formatted = `⚠️ *OpenClaw Alert* (${source})\n\n${message}`;
  return sendTelegramMessage(formatted, {
    parseMode: "Markdown",
    disableNotification: false,
  });
}
