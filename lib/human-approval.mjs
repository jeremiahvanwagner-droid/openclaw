import crypto from "crypto";
import { supabase as _supabaseSingleton } from "./agent-memory.js";
import { childLogger } from "./logger.mjs";

const log = childLogger({ module: "human-approval" });

export const APPROVAL_PENDING_STATUSES = ["pending", "approved", "executing"];
export const APPROVAL_ACTION_FAMILIES = {
  GHL_WRITE: "ghl_write",
  EMAIL_SEND: "email_send",
  PAYMENT_ACTION: "payment_action",
  SEMANTIC_INPUT_REVIEW: "semantic_input_review",
};
export const DEFAULT_APPROVAL_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_APPROVAL_POLL_MS = 5000;

export function getApprovalSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    log.warn("Supabase credentials unavailable for human approval operations");
    return null;
  }

  return _supabaseSingleton;
}

function approvalLogPayload(payload) {
  try {
    if (!payload || typeof payload !== "object") return {};
    return payload;
  } catch {
    return {};
  }
}

export async function logAgentEvent(entry) {
  const db = getApprovalSupabase();
  if (!db) return null;

  const insertable = {
    event_name: entry.eventName,
    source_agent: entry.sourceAgent || "system",
    target_agent: entry.targetAgent || null,
    target_division: entry.targetDivision || null,
    payload: approvalLogPayload(entry.payload),
    priority: entry.priority || "normal",
    status: entry.status || "completed",
    correlation_id: entry.correlationId || null,
    metadata: entry.metadata || {},
    processed_at: entry.processedAt || new Date().toISOString(),
    error_message: entry.errorMessage || null,
  };

  const { data, error } = await db.from("agent_events").insert(insertable).select("id").single();
  if (error) {
    log.warn({ err: error, eventName: entry.eventName }, "Failed to write agent event");
    return null;
  }
  return data?.id || null;
}

function normalizeActionFamily(actionFamily) {
  if (!actionFamily || typeof actionFamily !== "string") return null;
  const normalized = actionFamily.trim().toLowerCase();
  if (!normalized) return null;
  return normalized;
}

function commandFromTaskType(taskType) {
  return typeof taskType === "string" ? taskType.trim().toLowerCase() : "";
}

function inferActionFamilyFromTask(taskType, payload = {}) {
  const task = commandFromTaskType(taskType);
  const joined = [task, payload.command, payload.action, payload.request_type]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (
    /\b(payment|invoice|charge|refund|billing|collect[_ -]?payment)\b/.test(joined)
  ) {
    return APPROVAL_ACTION_FAMILIES.PAYMENT_ACTION;
  }

  if (/\b(send-email|email_send|send email|email\b)\b/.test(joined)) {
    return APPROVAL_ACTION_FAMILIES.EMAIL_SEND;
  }

  if (
    /\b(create-contact|update-contact|add-tag|remove-tag|move-stage|send-sms|send-email|create|update|tag|stage|send)\b/.test(
      joined,
    )
  ) {
    return APPROVAL_ACTION_FAMILIES.GHL_WRITE;
  }

  const actionDomain = typeof payload.action_domain === "string"
    ? payload.action_domain.toLowerCase()
    : "";
  if (actionDomain === "finance") return APPROVAL_ACTION_FAMILIES.PAYMENT_ACTION;
  if (
    actionDomain === "destructive_actions" ||
    actionDomain === "irreversible_account_actions"
  ) {
    return APPROVAL_ACTION_FAMILIES.GHL_WRITE;
  }

  return null;
}

export function classifyApprovalCandidate(candidate = {}) {
  const payload =
    candidate.payload && typeof candidate.payload === "object" && !Array.isArray(candidate.payload)
      ? candidate.payload
      : {};

  const explicitActionFamily =
    normalizeActionFamily(candidate.actionFamily) ||
    normalizeActionFamily(candidate.action_family) ||
    normalizeActionFamily(payload.action_family) ||
    normalizeActionFamily(payload.actionFamily);

  const actionFamily =
    explicitActionFamily ||
    inferActionFamilyFromTask(candidate.taskType || payload.taskType || payload.type, payload);

  return {
    actionFamily,
    requiresApproval: Boolean(actionFamily),
  };
}

function truncatePreview(value, maxLength = 280) {
  if (value == null) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

function getTelegramConfig() {
  const botToken =
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.OPENCLAW_TELEGRAM_BOT_TOKEN ||
    "";
  const chatId =
    process.env.TELEGRAM_CHAT_ID ||
    process.env.TELEGRAM_ALERT_CHAT_ID ||
    process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID ||
    "";
  const callbackSecret =
    process.env.OPENCLAW_TELEGRAM_WEBHOOK_SECRET ||
    process.env.OPENCLAW_GHL_WEBHOOK_SECRET ||
    "";
  const webhookBase =
    process.env.OPENCLAW_PUBLIC_WEBHOOK_BASE_URL ||
    process.env.OPENCLAW_REMOTE_GATEWAY_URL ||
    "";
  const dashboardBase =
    process.env.OPENCLAW_DASHBOARD_BASE_URL ||
    process.env.OPENCLAW_PUBLIC_DASHBOARD_BASE_URL ||
    "";

  return { botToken, chatId, callbackSecret, webhookBase, dashboardBase };
}

function requireApprovalCallbackSecret(callbackSecret) {
  if (callbackSecret) return callbackSecret;
  console.error("FATAL: approval secret not set");
  process.exit(1);
}

function buildTelegramCallbackData(approvalId, decision, callbackSecret) {
  const action = decision === "approve" ? "a" : "r";
  const sig = crypto
    .createHmac("sha256", requireApprovalCallbackSecret(callbackSecret))
    .update(`${approvalId}:${action}`)
    .digest("hex")
    .slice(0, 16);
  return `oa|${approvalId}|${action}|${sig}`;
}

export function parseTelegramApprovalCallback(data) {
  if (!data || typeof data !== "string") return null;
  const parts = data.split("|");
  if (parts.length !== 4 || parts[0] !== "oa") return null;

  const [, approvalId, action, signature] = parts;
  if (!approvalId || !signature || !["a", "r"].includes(action)) return null;
  return {
    approvalId,
    decision: action === "a" ? "approve" : "reject",
    signature,
  };
}

export function verifyTelegramApprovalCallback(parsed) {
  if (!parsed) return false;
  const { callbackSecret } = getTelegramConfig();
  const expected = buildTelegramCallbackData(
    parsed.approvalId,
    parsed.decision,
    callbackSecret,
  );
  const actual = `oa|${parsed.approvalId}|${parsed.decision === "approve" ? "a" : "r"}|${parsed.signature}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function buildApprovalMessage(approval, dashboardBase) {
  const lines = [
    "OpenClaw approval required",
    `Request: ${approval.request_type}`,
    `Action: ${approval.action_family}`,
    `Source: ${approval.source_agent || "unknown"}`,
    `Target: ${approval.target_agent || "unknown"}`,
    `Correlation: ${approval.correlation_id || "n/a"}`,
    `Expires: ${approval.expires_at}`,
    "",
    approval.payload_preview || "(no preview available)",
  ];

  if (dashboardBase) {
    const base = dashboardBase.replace(/\/+$/, "");
    lines.push("", `Dashboard: ${base}/approvals`);
  }

  return lines.join("\n");
}

async function telegramApi(method, payload) {
  const { botToken } = getTelegramConfig();
  if (!botToken) {
    throw new Error("Telegram bot token not configured");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram ${method} failed`);
  }
  return data;
}

export async function sendApprovalTelegramNotification(approval) {
  const { chatId, callbackSecret } = getTelegramConfig();
  if (!chatId) return null;

  const messageText = buildApprovalMessage(approval, getTelegramConfig().dashboardBase);

  const callbackApprove = buildTelegramCallbackData(approval.id, "approve", callbackSecret);
  const callbackReject = buildTelegramCallbackData(approval.id, "reject", callbackSecret);

  const payload = {
    chat_id: chatId,
    text: messageText,
    disable_notification: false,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Approve", callback_data: callbackApprove },
          { text: "Reject", callback_data: callbackReject },
        ],
      ],
    },
  };

  const data = await telegramApi("sendMessage", payload);
  const result = data?.result;
  if (!result?.message_id) return null;

  await updateApprovalNotification(approval.id, {
    notification_chat_id: String(result.chat.id),
    notification_message_id: result.message_id,
  });

  return result;
}

export async function answerTelegramCallback(callbackQueryId, text) {
  if (!callbackQueryId) return;
  try {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });
  } catch (error) {
    log.warn({ err: error }, "Failed to answer Telegram callback");
  }
}

export async function editApprovalTelegramMessage(approval) {
  if (!approval?.notification_chat_id || !approval?.notification_message_id) return;

  const statusText = approval.status === "approved"
    ? "APPROVED"
    : approval.status === "rejected"
      ? "REJECTED"
      : approval.status === "expired"
        ? "EXPIRED"
        : approval.status === "executing"
          ? "EXECUTING"
          : approval.status.toUpperCase();

  try {
    await telegramApi("editMessageText", {
      chat_id: approval.notification_chat_id,
      message_id: approval.notification_message_id,
      text: `${buildApprovalMessage(approval, getTelegramConfig().dashboardBase)}\n\nStatus: ${statusText}`,
    });
  } catch (error) {
    log.warn({ approvalId: approval.id, err: error }, "Failed to edit Telegram approval message");
  }
}

async function updateApprovalNotification(approvalId, patch) {
  const db = getApprovalSupabase();
  if (!db) return null;
  const { error } = await db.from("human_approval_queue").update(patch).eq("id", approvalId);
  if (error) {
    log.warn({ approvalId, err: error }, "Failed to update approval notification metadata");
  }
  return patch;
}

export async function createHumanApprovalRequest(options = {}) {
  const db = getApprovalSupabase();
  if (!db) {
    throw new Error("Supabase is required for human approval queue operations");
  }

  const now = Date.now();
  const requestedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + (options.ttlMs || DEFAULT_APPROVAL_TTL_MS)).toISOString();

  const record = {
    request_type: options.requestType || "agent_action",
    action_family: options.actionFamily || APPROVAL_ACTION_FAMILIES.GHL_WRITE,
    source_agent: options.sourceAgent || null,
    target_agent: options.targetAgent || null,
    correlation_id: options.correlationId || null,
    status: "pending",
    payload_preview: truncatePreview(options.payloadPreview ?? options.fullPayload),
    full_payload: options.fullPayload || {},
    requested_by: options.requestedBy || options.sourceAgent || "system",
    requested_at: requestedAt,
    expires_at: expiresAt,
  };

  const { data, error } = await db
    .from("human_approval_queue")
    .insert(record)
    .select("*")
    .single();

  if (error || !data) {
    throw error || new Error("Failed to create approval request");
  }

  await logAgentEvent({
    eventName: "approval/requested",
    sourceAgent: options.sourceAgent || "system",
    targetAgent: options.targetAgent || null,
    correlationId: options.correlationId || data.id,
    payload: {
      approval_id: data.id,
      request_type: data.request_type,
      action_family: data.action_family,
      payload_preview: data.payload_preview,
    },
    priority: "critical",
    status: "pending",
    processedAt: null,
  });

  if (options.sendTelegram !== false) {
    try {
      await sendApprovalTelegramNotification(data);
    } catch (telegramError) {
      log.warn({ approvalId: data.id, err: telegramError }, "Failed to notify Telegram for approval request");
    }
  }

  return data;
}

export async function getHumanApprovalRequest(approvalId) {
  const db = getApprovalSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("human_approval_queue")
    .select("*")
    .eq("id", approvalId)
    .single();

  if (error) {
    log.warn({ approvalId, err: error }, "Failed to load approval request");
    return null;
  }

  return data;
}

export async function resolveHumanApproval(options = {}) {
  const db = getApprovalSupabase();
  if (!db) {
    throw new Error("Supabase is required for approval resolution");
  }

  const decision = options.decision === "approve" ? "approved" : "rejected";
  const { data, error } = await db
    .from("human_approval_queue")
    .update({
      status: decision,
      resolved_by: options.resolvedBy || "human",
      resolution_channel: options.channel || "dashboard",
      resolution_note: options.note || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", options.approvalId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) {
    const existing = await getHumanApprovalRequest(options.approvalId);
    if (existing) return existing;
    throw error;
  }

  await logAgentEvent({
    eventName: "approval/resolved",
    sourceAgent: options.resolvedBy || "human",
    targetAgent: data.target_agent || null,
    correlationId: data.correlation_id || data.id,
    payload: {
      approval_id: data.id,
      decision,
      channel: options.channel || "dashboard",
      note: options.note || null,
    },
    priority: "critical",
    status: decision === "approved" ? "completed" : "failed",
  });
  await editApprovalTelegramMessage(data);
  return data;
}

export async function expireHumanApproval(approvalId, note = "Approval timed out") {
  const db = getApprovalSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("human_approval_queue")
    .update({
      status: "expired",
      resolved_by: "system",
      resolution_channel: "system",
      resolution_note: note,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) return null;

  await logAgentEvent({
    eventName: "approval/expired",
    sourceAgent: "system",
    targetAgent: data.target_agent || null,
    correlationId: data.correlation_id || data.id,
    payload: { approval_id: data.id, note },
    priority: "critical",
    status: "failed",
  });
  await editApprovalTelegramMessage(data);
  return data;
}

export async function markHumanApprovalExecuting(approvalId) {
  const db = getApprovalSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("human_approval_queue")
    .update({ status: "executing" })
    .eq("id", approvalId)
    .eq("status", "approved")
    .select("*")
    .single();

  if (error) {
    const current = await getHumanApprovalRequest(approvalId);
    return current?.status === "executing" ? current : null;
  }

  await logAgentEvent({
    eventName: "approval/executing",
    sourceAgent: data.source_agent || "system",
    targetAgent: data.target_agent || null,
    correlationId: data.correlation_id || data.id,
    payload: { approval_id: data.id, action_family: data.action_family },
    priority: "critical",
    status: "processing",
  });
  await editApprovalTelegramMessage(data);
  return data;
}

export async function waitForHumanApproval(approvalId, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_APPROVAL_TTL_MS;
  const pollIntervalMs = options.pollIntervalMs || DEFAULT_APPROVAL_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const approval = await getHumanApprovalRequest(approvalId);
    if (!approval) {
      return { status: "missing", approval: null };
    }

    if (approval.status === "approved" || approval.status === "executing") {
      return { status: approval.status, approval };
    }
    if (approval.status === "rejected" || approval.status === "expired") {
      return { status: approval.status, approval };
    }

    if (approval.expires_at && new Date(approval.expires_at).getTime() <= Date.now()) {
      const expired = await expireHumanApproval(approvalId);
      return { status: expired?.status || "expired", approval: expired || approval };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const expired = await expireHumanApproval(approvalId);
  return { status: expired?.status || "expired", approval: expired };
}

export function buildApprovalPreview(payload) {
  return truncatePreview(payload);
}
