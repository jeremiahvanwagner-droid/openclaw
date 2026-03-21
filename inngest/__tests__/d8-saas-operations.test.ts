import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────

const { mockInsert, capturedFunctions } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const capturedFunctions: Record<string, any> = {};
  return { mockInsert, capturedFunctions };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

// Capture Inngest function handlers

vi.mock("../../inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((config: any, trigger: any, handler: any) => {
      capturedFunctions[config.id] = { config, trigger, handler };
      return { config, trigger, handler };
    }),
  },
}));

function createMockStep() {
  const sentEvents: Array<{ id: string; event: any }> = [];
  return {
    run: vi.fn(async (_stepId: string, fn: () => Promise<any>) => fn()),
    sendEvent: vi.fn(async (stepId: string, event: any) => {
      sentEvents.push({ id: stepId, event });
      return { ids: [`test-${stepId}`] };
    }),
    getSentEvents: () => sentEvents,
  };
}

// Import triggers createFunction registrations
import "../../inngest/functions/d8-saas-operations";

// ═════════════════════════════════════════════════════════════════

describe("d8-saas-operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saasClientSignup", () => {
    it("is registered with correct id and trigger", () => {
      expect(capturedFunctions["saas-client-signup"]).toBeDefined();
      expect(capturedFunctions["saas-client-signup"].trigger).toEqual({
        event: "saas/client.signup",
      });
    });

    it("provisions subaccount, creates CRM contact, and notifies director", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          client_name: "Test Client",
          email: "test@example.com",
          phone: "+1234567890",
          plan_tier: "pro",
          niche: "coaching",
          correlation_id: "cor-001",
        },
      };

      const handler = capturedFunctions["saas-client-signup"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      expect(result.client_name).toBe("Test Client");
      expect(result.plan_tier).toBe("pro");

      // Should have sent 3 events: provision, CRM, notify
      const sent = step.getSentEvents();
      expect(sent.length).toBe(3);
      expect(sent[0].event.name).toBe("agent/d8_platform_architect/task");
      expect(sent[1].event.name).toBe("agent/d8_crm_ops/task");
      expect(sent[2].event.name).toBe("agent/d8_saas_director/task");
    });
  });

  describe("saasPaymentFailed", () => {
    it("starts dunning sequence", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          contact_id: "ct-001",
          location_id: "loc-001",
          amount: 99,
          failure_reason: "insufficient_funds",
          retry_count: 1,
          plan_name: "pro",
          correlation_id: "cor-002",
        },
      };

      const handler = capturedFunctions["saas-payment-failed"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      expect(result.dunning_started).toBe(true);

      // Only dunning event for small amounts
      const sent = step.getSentEvents();
      expect(sent[0].event.name).toBe("agent/d8_revenue_ops/task");
    });

    it("alerts director on amounts >= $500", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          contact_id: "ct-001",
          location_id: "loc-001",
          amount: 750,
          failure_reason: "card_declined",
          retry_count: 1,
          plan_name: "enterprise",
          correlation_id: "cor-003",
        },
      };

      const handler = capturedFunctions["saas-payment-failed"].handler;
      const result = await handler({ event, step });

      const sent = step.getSentEvents();
      // Should have dunning + telegram alert
      expect(sent.length).toBe(2);
      expect(sent[1].event.name).toBe("alert/telegram");
      expect(sent[1].event.data.priority).toBe("urgent");
    });

    it("alerts director on retry_count >= 3", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          contact_id: "ct-002",
          location_id: "loc-002",
          amount: 29,
          failure_reason: "processing_error",
          retry_count: 3,
          correlation_id: "cor-004",
        },
      };

      const handler = capturedFunctions["saas-payment-failed"].handler;
      await handler({ event, step });

      const sent = step.getSentEvents();
      expect(sent.length).toBe(2);
      expect(sent[1].event.name).toBe("alert/telegram");
    });
  });

  describe("saasPaymentReceived", () => {
    it("cancels dunning sequence", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          contact_id: "ct-001",
          location_id: "loc-001",
          amount: 99,
          correlation_id: "cor-005",
        },
      };

      const handler = capturedFunctions["saas-payment-received"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      const sent = step.getSentEvents();
      expect(sent[0].event.data.type).toBe("cancel_dunning_sequence");
    });
  });

  describe("saasClientChurn", () => {
    it("starts win-back campaign and billing cleanup", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          client_id: "cl-001",
          location_id: "loc-001",
          reason: "too_expensive",
          mrr_lost: 199,
          correlation_id: "cor-006",
        },
      };

      const handler = capturedFunctions["saas-client-churn"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      expect(result.winback_started).toBe(true);

      const sent = step.getSentEvents();
      // win-back + billing cleanup + telegram alert
      expect(sent.length).toBe(3);
      expect(sent[0].event.name).toBe("agent/d8_customer_success/task");
      expect(sent[1].event.name).toBe("agent/d8_revenue_ops/task");
      expect(sent[2].event.name).toBe("alert/telegram");
    });
  });

  describe("saasSubscriptionCancelled", () => {
    it("triggers win-back and billing cleanup", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          contact_id: "ct-001",
          location_id: "loc-001",
          plan_name: "pro",
          mrr_lost: 99,
          correlation_id: "cor-007",
        },
      };

      const handler = capturedFunctions["saas-subscription-cancelled"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      const sent = step.getSentEvents();
      expect(sent.length).toBe(2);
    });
  });

  describe("saasUsageThreshold", () => {
    it("triggers upsell campaign", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          location_id: "loc-001",
          metric: "contacts",
          current_value: 950,
          threshold_value: 1000,
          percent_used: 95,
          correlation_id: "cor-008",
        },
      };

      const handler = capturedFunctions["saas-usage-threshold"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      expect(result.percent_used).toBe(95);

      const sent = step.getSentEvents();
      expect(sent[0].event.data.type).toBe("usage_upsell_campaign");
    });
  });

  describe("saasFunnelPublished", () => {
    it("triggers compliance QA check", async () => {
      const step = createMockStep();
      const event = {
        data: {
          saas_instance_id: "inst-001",
          location_id: "loc-001",
          funnel_id: "fun-001",
          funnel_name: "Lead Magnet Funnel",
          correlation_id: "cor-009",
        },
      };

      const handler = capturedFunctions["saas-funnel-published"].handler;
      const result = await handler({ event, step });

      expect(result.success).toBe(true);
      expect(result.funnel_name).toBe("Lead Magnet Funnel");

      const sent = step.getSentEvents();
      expect(sent[0].event.data.type).toBe("funnel_qa_check");
    });
  });
});
