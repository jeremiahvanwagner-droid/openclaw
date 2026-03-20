// @ts-expect-error - runtime implementation lives in the adjacent .mjs module.
import * as runtime from "./human-approval.mjs";

export interface ApprovalQueueRow {
  id: string;
  request_type: string;
  action_family: string;
  source_agent: string | null;
  target_agent: string | null;
  correlation_id: string | null;
  status: "pending" | "approved" | "rejected" | "expired" | "executing";
  payload_preview: string | null;
  full_payload: Record<string, unknown>;
  requested_by: string | null;
  resolved_by: string | null;
  resolution_channel: string | null;
  resolution_note: string | null;
  notification_chat_id: string | null;
  notification_message_id: number | null;
  requested_at: string;
  resolved_at: string | null;
  expires_at: string;
}

export interface HumanApprovalOptions {
  requestType?: string;
  actionFamily?: string;
  sourceAgent?: string;
  targetAgent?: string | null;
  correlationId?: string;
  payloadPreview?: string;
  fullPayload?: Record<string, unknown>;
  requestedBy?: string;
  ttlMs?: number;
  sendTelegram?: boolean;
}

export interface ResolveHumanApprovalOptions {
  approvalId: string;
  decision: "approve" | "reject";
  resolvedBy?: string;
  channel?: string;
  note?: string;
}

export const APPROVAL_PENDING_STATUSES =
  runtime.APPROVAL_PENDING_STATUSES as string[];
export const APPROVAL_ACTION_FAMILIES = runtime.APPROVAL_ACTION_FAMILIES as {
  GHL_WRITE: "ghl_write";
  EMAIL_SEND: "email_send";
  PAYMENT_ACTION: "payment_action";
  SEMANTIC_INPUT_REVIEW: "semantic_input_review";
};
export const DEFAULT_APPROVAL_TTL_MS = runtime.DEFAULT_APPROVAL_TTL_MS as number;
export const DEFAULT_APPROVAL_POLL_MS = runtime.DEFAULT_APPROVAL_POLL_MS as number;

export const getApprovalSupabase = runtime.getApprovalSupabase as () => unknown;
export const buildApprovalPreview = runtime.buildApprovalPreview as (
  payload: unknown,
) => string;
export const classifyApprovalCandidate = runtime.classifyApprovalCandidate as (
  candidate?: {
    actionFamily?: string;
    action_family?: string;
    taskType?: string;
    payload?: Record<string, unknown>;
  },
) => { actionFamily: string | null; requiresApproval: boolean };
export const createHumanApprovalRequest =
  runtime.createHumanApprovalRequest as (
    options?: HumanApprovalOptions,
  ) => Promise<ApprovalQueueRow>;
export const getHumanApprovalRequest = runtime.getHumanApprovalRequest as (
  approvalId: string,
) => Promise<ApprovalQueueRow | null>;
export const resolveHumanApproval = runtime.resolveHumanApproval as (
  options: ResolveHumanApprovalOptions,
) => Promise<ApprovalQueueRow>;
export const expireHumanApproval = runtime.expireHumanApproval as (
  approvalId: string,
  note?: string,
) => Promise<ApprovalQueueRow | null>;
export const markHumanApprovalExecuting = runtime.markHumanApprovalExecuting as (
  approvalId: string,
) => Promise<ApprovalQueueRow | null>;
export const waitForHumanApproval = runtime.waitForHumanApproval as (
  approvalId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
) => Promise<{ status: string; approval: ApprovalQueueRow | null }>;
export const logAgentEvent = runtime.logAgentEvent as (entry: {
  eventName: string;
  sourceAgent?: string;
  targetAgent?: string | null;
  targetDivision?: string | null;
  payload?: Record<string, unknown>;
  priority?: string;
  status?: string;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  processedAt?: string | null;
  errorMessage?: string | null;
}) => Promise<string | null>;
