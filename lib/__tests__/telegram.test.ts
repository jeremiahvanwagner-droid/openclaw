import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { sendTelegramMessage, sendAgentNotification, sendTelegramAlert } from "../telegram";

describe("telegram", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("sendTelegramMessage", () => {
    it("returns false when bot token is not configured", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
      vi.stubEnv("OPENCLAW_TELEGRAM_BOT_TOKEN", "");
      vi.stubEnv("TELEGRAM_CHAT_ID", "");
      vi.stubEnv("TELEGRAM_ALERT_CHAT_ID", "");
      vi.stubEnv("OPENCLAW_ALERT_TELEGRAM_CHAT_ID", "");

      const result = await sendTelegramMessage("test");
      expect(result).toBe(false);
    });

    it("returns false when chat id is not configured", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
      vi.stubEnv("TELEGRAM_CHAT_ID", "");
      vi.stubEnv("TELEGRAM_ALERT_CHAT_ID", "");
      vi.stubEnv("OPENCLAW_ALERT_TELEGRAM_CHAT_ID", "");

      const result = await sendTelegramMessage("test");
      expect(result).toBe(false);
    });

    it("calls the Telegram API and returns true on success", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot123");
      vi.stubEnv("TELEGRAM_CHAT_ID", "chat456");

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendTelegramMessage("Hello world");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("api.telegram.org/botbot123/sendMessage");
      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe("chat456");
      expect(body.text).toBe("Hello world");
      expect(body.parse_mode).toBe("Markdown");
      expect(body.disable_notification).toBe(false);
    });

    it("accepts a custom chatId via options", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot123");
      vi.stubEnv("TELEGRAM_CHAT_ID", "defaultchat");

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal("fetch", mockFetch);

      await sendTelegramMessage("test", { chatId: "customchat" });

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body).chat_id).toBe("customchat");
    });

    it("returns false when Telegram API returns not-ok", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot123");
      vi.stubEnv("TELEGRAM_CHAT_ID", "chat456");

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ ok: false, description: "Bad Request" }), {
            status: 400,
          }),
        ),
      );

      const result = await sendTelegramMessage("test");
      expect(result).toBe(false);
    });

    it("returns false when fetch throws", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot123");
      vi.stubEnv("TELEGRAM_CHAT_ID", "chat456");

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      const result = await sendTelegramMessage("test");
      expect(result).toBe(false);
    });

    it("uses OPENCLAW_TELEGRAM_BOT_TOKEN fallback", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
      vi.stubEnv("OPENCLAW_TELEGRAM_BOT_TOKEN", "fallback-token");
      vi.stubEnv("TELEGRAM_CHAT_ID", "chat456");

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendTelegramMessage("test");
      expect(result).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toContain("botfallback-token");
    });

    it("uses OPENCLAW_ALERT_TELEGRAM_CHAT_ID fallback", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot123");
      vi.stubEnv("TELEGRAM_CHAT_ID", "");
      vi.stubEnv("TELEGRAM_ALERT_CHAT_ID", "");
      vi.stubEnv("OPENCLAW_ALERT_TELEGRAM_CHAT_ID", "fallback-chat");

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendTelegramMessage("test");
      expect(result).toBe(true);
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).chat_id).toBe("fallback-chat");
    });
  });

  describe("sendAgentNotification", () => {
    it("sends a formatted urgent notification with alarm emoji", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot123");
      vi.stubEnv("TELEGRAM_CHAT_ID", "chat456");

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendAgentNotification("d1_ceo", "CEO Agent", "Task complete", "urgent");

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("🚨");
      expect(body.text).toContain("*CEO Agent*");
      expect(body.text).toContain("d1_ceo");
      expect(body.text).toContain("Task complete");
      expect(body.disable_notification).toBe(false);
    });

    it("sends a silent normal notification with robot emoji", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot123");
      vi.stubEnv("TELEGRAM_CHAT_ID", "chat456");

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal("fetch", mockFetch);

      await sendAgentNotification("d1_ceo", "CEO Agent", "Routine update");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("🤖");
      expect(body.disable_notification).toBe(true);
    });
  });

  describe("sendTelegramAlert", () => {
    it("sends a formatted alert message with source", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot123");
      vi.stubEnv("TELEGRAM_CHAT_ID", "chat456");

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendTelegramAlert("Disk space low", "monitoring");

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("⚠️");
      expect(body.text).toContain("OpenClaw Alert");
      expect(body.text).toContain("monitoring");
      expect(body.text).toContain("Disk space low");
      expect(body.disable_notification).toBe(false);
    });
  });
});
