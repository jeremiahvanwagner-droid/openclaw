import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSupabaseInsert,
  mockSupabaseSelect,
  mockSupabaseUpdate,
  mockSupabaseRpc,
  createHumanApprovalRequest,
  getHumanApprovalRequest,
  markHumanApprovalExecuting,
  expireHumanApproval,
  capturedFunctions,
} = vi.hoisted(() => {
  const mockSupabaseInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "evt-001" }, error: null }),
    }),
  });

  const mockSupabaseSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          agent_id: "test_agent",
          status: "active",
          last_heartbeat_at: new Date().toISOString(),
          heartbeat_policy: "always_on",
          agent_class: "supervisor",
          pod_id: "biz_01",
          org_unit: "division_1",
          config: { escalation_path: "d1_ceo" },
        },
        error: null,
      }),
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    in: vi.fn().mockResolvedValue({
      data: [
        {
          agent_id: "agent_1",
          org_unit: "d1",
          pod_id: "biz_01",
          status: "active",
          last_heartbeat_at: new Date().toISOString(),
          display_name: "Agent 1",
          agent_class: "supervisor",
          heartbeat_policy: "always_on",
          criticality: "high",
        },
      ],
      error: null,
    }),
  });

  const mockSupabaseUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        neq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  });

  const mockSupabaseRpc = vi.fn().mockResolvedValue({ error: null });

  return {
    mockSupabaseInsert,
    mockSupabaseSelect,
    mockSupabaseUpdate,
    mockSupabaseRpc,
    createHumanApprovalRequest: vi.fn().mockResolvedValue({
      id: "approval-001",
      status: "pending",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
    getHumanApprovalRequest: vi.fn().mockResolvedValue({
      id: "approval-001",
      status: "approved",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
    markHumanApprovalExecuting: vi.fn().mockResolvedValue({
      id: "approval-001",
      status: "executing",
    }),
    expireHumanApproval: vi.fn().mockResolvedValue({
      id: "approval-001",
      status: "expired",
    }),
    capturedFunctions: {} as Record<string, any>,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockSupabaseInsert,
      select: mockSupabaseSelect,
      update: mockSupabaseUpdate,
    })),
    rpc: mockSupabaseRpc,
  })),
}));

vi.mock("../../lib/api-rate-governor", () => ({
  reportFailure: vi.fn(),
}));

vi.mock("../../lib/human-approval", () => ({
  buildApprovalPreview: vi.fn(() => "approval preview"),
  classifyApprovalCandidate: vi.fn((candidate: { payload?: Record<string, unknown> }) => {
    if (candidate.payload?.action_domain === "finance") {
      return { requiresApproval: true, actionFamily: "payment_action" };
    }
    return { requiresApproval: false, actionFamily: null };
  }),
  createHumanApprovalRequest,
  getHumanApprovalRequest,
  markHumanApprovalExecuting,
  expireHumanApproval,
}));

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
process.env.TELEGRAM_ALERT_CHAT_ID = "123456";

function createMockStep() {
  const sentEvents: Array<{ id: string; event: any }> = [];
  const stepResults = new Map<string, any>();

  return {
    run: vi.fn(async (stepId: string, fn: () => Promise<any>) => {
      const result = await fn();
      stepResults.set(stepId, result);
      return result;
    }),
    sendEvent: vi.fn(async (stepId: string, event: any) => {
      sentEvents.push({ id: stepId, event });
      return { ids: [`test-${stepId}`] };
    }),
    sleep: vi.fn(async () => undefined),
    getSentEvents: () => sentEvents,
    getStepResult: (id: string) => stepResults.get(id),
  };
}

vi.mock("../../inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((config: any, trigger: any, handler: any) => {
      capturedFunctions[config.id] = { config, trigger, handler };
      return { config, trigger, handler };
    }),
  },
  agentTaskName: vi.fn((agentId: string) => `agent/${agentId}/task`),
  getDivisionHead: vi.fn((division: string) => {
    const heads: Record<string, string> = {
      division_1_core_operations: "d1_ceo",
      division_2_ecommerce: "d2_director",
      division_8_saas_operations: "d8_saas_director",
    };
    return heads[division] || "shared_exec_orchestrator";
  }),
  getPodLead: vi.fn((podId: string) => (podId.startsWith("biz_") ? `${podId}_pod_lead` : null)),
  podTaskName: vi.fn((podId: string) => `pod/${podId}/task`),
}));

import "../../inngest/functions/agent-orchestrator";

describe("agent-orchestrator", () => {
  beforeEach(() => {
    createHumanApprovalRequest.mockClear();
    getHumanApprovalRequest.mockClear();
    markHumanApprovalExecuting.mockClear();
    expireHumanApproval.mockClear();

    getHumanApprovalRequest.mockResolvedValue({
      id: "approval-001",
      status: "approved",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    markHumanApprovalExecuting.mockResolvedValue({
      id: "approval-001",
      status: "executing",
    });
  });

  it("registers the agent invoke function", () => {
    expect(capturedFunctions["agent-invoke"]).toBeDefined();
  });

  it("routes to a pod lead when the target agent is pod-assigned", async () => {
    const step = createMockStep();
    const handler = capturedFunctions["agent-invoke"].handler;

    const result = await handler({
      event: {
        data: {
          source_agent: "d2_director",
          target_agent: "d2_copywriter",
          payload: { task: "write copy" },
          priority: "normal",
        },
      },
      step,
    });

    expect(result.success).toBe(true);
    expect(step.sendEvent).toHaveBeenCalled();
  });

  it("creates and waits on a human approval for irreversible actions", async () => {
    const step = createMockStep();
    const handler = capturedFunctions["agent-invoke"].handler;

    const result = await handler({
      event: {
        data: {
          source_agent: "d8_revenue_ops",
          target_agent: "d8_billing",
          payload: { action_domain: "finance", amount: 5000 },
          priority: "high",
        },
      },
      step,
    });

    expect(createHumanApprovalRequest).toHaveBeenCalledTimes(1);
    expect(markHumanApprovalExecuting).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("fails closed when the approval is rejected", async () => {
    getHumanApprovalRequest.mockResolvedValueOnce({
      id: "approval-001",
      status: "rejected",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    const step = createMockStep();
    const handler = capturedFunctions["agent-invoke"].handler;

    const result = await handler({
      event: {
        data: {
          source_agent: "d8_revenue_ops",
          target_agent: "d8_billing",
          payload: { action_domain: "finance", amount: 5000 },
          priority: "high",
        },
      },
      step,
    });

    expect(result.success).toBe(false);
    expect(result.approval_status).toBe("rejected");
  });

  it("requires target_agent or target_division", async () => {
    const step = createMockStep();
    const handler = capturedFunctions["agent-invoke"].handler;

    await expect(
      handler({
        event: {
          data: {
            source_agent: "d1_ceo",
            payload: { task: "open-ended" },
          },
        },
        step,
      }),
    ).rejects.toThrow("Must specify either target_agent or target_division");
  });

  it("registers the telegram alert function", () => {
    expect(capturedFunctions["telegram-alert"]).toBeDefined();
  });

  it("sends telegram alerts with fallback chat configuration", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { message_id: 999 } }),
    }) as typeof fetch;

    const step = createMockStep();
    const handler = capturedFunctions["telegram-alert"].handler;
    const result = await handler({
      event: {
        data: {
          channel: "ops",
          message: "Server is down!",
          priority: "urgent",
          agent_id: "d1_ceo",
        },
      },
      step,
    });

    expect(result.success).toBe(true);
    expect(result.message_id).toBe(999);
    globalThis.fetch = originalFetch;
  });
});
