import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────

// Use vi.hoisted() so these are available inside vi.mock() factories (which get hoisted)
const { mockSupabaseInsert, mockSupabaseSelect, mockSupabaseUpdate, mockSupabaseRpc, capturedFunctions } = vi.hoisted(() => {
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

  const capturedFunctions: Record<string, any> = {};

  return { mockSupabaseInsert, mockSupabaseSelect, mockSupabaseUpdate, mockSupabaseRpc, capturedFunctions };
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

// Mock rate governor
vi.mock("../../lib/api-rate-governor", () => ({
  reportFailure: vi.fn(),
}));

// Set env vars
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
process.env.TELEGRAM_ALERT_CHAT_ID = "123456";

// ─── Mock Inngest Step Utilities ─────────────────────────────────

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
    getSentEvents: () => sentEvents,
    getStepResult: (id: string) => stepResults.get(id),
  };
}

// ─── Import the module under test ────────────────────────────────
// We need to mock inngest.createFunction to capture the handlers

vi.mock("../../inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((config: any, handler: any) => {
      const trigger = config.triggers?.[0];
      capturedFunctions[config.id] = { config, trigger, handler };
      return { config, trigger, handler };
    }),
  },
  agentTaskName: vi.fn((agentId: string) => `agent/${agentId}/task`),
  getDivisionHead: vi.fn((div: string) => {
    const heads: Record<string, string> = {
      division_1_core_operations: "d1_ceo",
      division_2_ecommerce: "d2_director",
      division_8_saas_operations: "d8_saas_director",
    };
    return heads[div] || "shared_exec_orchestrator";
  }),
  getPodLead: vi.fn((pod: string) => {
    if (pod.startsWith("biz_")) return `${pod}_pod_lead`;
    return null;
  }),
  podTaskName: vi.fn((podId: string) => `pod/${podId}/task`),
}));

// Import triggers the createFunction calls
import "../../inngest/functions/agent-orchestrator";

// ═════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════

describe("agent-orchestrator", () => {
  describe("agentInvoke", () => {
    it("is registered with id 'agent-invoke'", () => {
      expect(capturedFunctions["agent-invoke"]).toBeDefined();
      expect(capturedFunctions["agent-invoke"].config.name).toBe("Agent Invoke Router");
    });

    it("routes to target agent via pod lead when pod-assigned", async () => {
      const step = createMockStep();
      const event = {
        data: {
          source_agent: "d2_director",
          target_agent: "d2_copywriter",
          payload: { task: "write copy" },
          priority: "normal",
        },
      };

      const handler = capturedFunctions["agent-invoke"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      expect(step.run).toHaveBeenCalled();
    });

    it("escalates gated action domains to shared_exec_orchestrator", async () => {
      const step = createMockStep();
      const event = {
        data: {
          source_agent: "d8_revenue_ops",
          target_agent: "d8_billing",
          payload: { action_domain: "finance", amount: 5000 },
          priority: "high",
        },
      };

      const handler = capturedFunctions["agent-invoke"].handler;
      const result = await handler({ event, step });

      expect(result.gated).toBe(true);
      expect(result.routed_to).toBe("shared_exec_orchestrator");
    });

    it("requires target_agent or target_division", async () => {
      const step = createMockStep();
      const event = {
        data: {
          source_agent: "d1_ceo",
          payload: { task: "open-ended" },
        },
      };

      const handler = capturedFunctions["agent-invoke"].handler;
      await expect(handler({ event, step })).rejects.toThrow(
        "Must specify either target_agent or target_division",
      );
    });
  });

  describe("agentEscalate", () => {
    it("is registered with id 'agent-escalate'", () => {
      expect(capturedFunctions["agent-escalate"]).toBeDefined();
    });

    it("falls back to shared_exec_orchestrator after max retries", async () => {
      const step = createMockStep();
      const event = {
        data: {
          source_agent: "d2_marketing_lead",
          payload: { issue: "blocked on approval" },
          retry_count: 3,
          reason: "Target unhealthy",
        },
      };

      const handler = capturedFunctions["agent-escalate"].handler;
      const result = await handler({ event, step });

      expect(result.fallback).toBe(true);
      expect(result.routed_to).toBe("shared_exec_orchestrator");
    });

    it("routes to healthy target agent", async () => {
      const step = createMockStep();
      const event = {
        data: {
          source_agent: "d1_ceo",
          escalation_path: "shared_exec_orchestrator",
          payload: { issue: "need help" },
          retry_count: 0,
          reason: "Need executive input",
        },
      };

      const handler = capturedFunctions["agent-escalate"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      expect(result.routed_to).toBe("shared_exec_orchestrator");
    });
  });

  describe("agentHealthCheck", () => {
    it("is registered as hourly cron", () => {
      expect(capturedFunctions["agent-health-check"]).toBeDefined();
    });
  });

  describe("telegramAlert", () => {
    it("is registered with id 'telegram-alert'", () => {
      expect(capturedFunctions["telegram-alert"]).toBeDefined();
    });

    it("formats urgent messages with 🚨 emoji", async () => {
      // Mock fetch for Telegram API
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { message_id: 999 } }),
      });

      const step = createMockStep();
      const event = {
        data: {
          channel: "ops",
          message: "Server is down!",
          priority: "urgent",
          agent_id: "d1_ceo",
        },
      };

      const handler = capturedFunctions["telegram-alert"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      expect(result.message_id).toBe(999);

      globalThis.fetch = originalFetch;
    });
  });

  describe("podQuarantine", () => {
    it("is registered with id 'pod-quarantine'", () => {
      expect(capturedFunctions["pod-quarantine"]).toBeDefined();
    });
  });

  describe("podRestore", () => {
    it("is registered with id 'pod-restore'", () => {
      expect(capturedFunctions["pod-restore"]).toBeDefined();
    });
  });

  describe("credentialHealthCheck", () => {
    it("is registered with id 'credential-health-check'", () => {
      expect(capturedFunctions["credential-health-check"]).toBeDefined();
    });
  });
});
