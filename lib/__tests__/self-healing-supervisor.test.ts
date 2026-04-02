/**
 * Self-Healing Supervisor — Unit Tests
 *
 * Tests the pure orchestration logic in lib/self-healing-supervisor.ts using
 * mocked skill modules and a mocked Supabase client.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock Supabase ─────────────────────────────────────────────────

const mockInsert = vi.fn().mockResolvedValue({ data: { id: "row-1" }, error: null });
const mockFrom   = vi.fn(() => ({ insert: mockInsert }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

// ── Mock logger ───────────────────────────────────────────────────

vi.mock("../logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info:  vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// ── Mock autonomous debugging skill ───────────────────────────────

const mockIngestErrorLogs        = vi.fn();
const mockClusterIncidents       = vi.fn();
const mockGeneratePatchProposals = vi.fn();
const mockValidatePatch          = vi.fn();
const mockApplyPatch             = vi.fn();
const mockMonitorStability       = vi.fn();
const mockGenerateReport         = vi.fn();

vi.mock("../../skills/aisaas-autonomous-debugging/index.mjs", () => ({
  ingestErrorLogs:        mockIngestErrorLogs,
  clusterIncidents:       mockClusterIncidents,
  generatePatchProposals: mockGeneratePatchProposals,
  validatePatch:          mockValidatePatch,
  applyPatch:             mockApplyPatch,
  monitorPostFixStability: mockMonitorStability,
  generateResolutionReport: mockGenerateReport,
}));

// ── Mock self-healing-integrations skill ──────────────────────────

const mockProbeWebhooks      = vi.fn();
const mockDetectBroken       = vi.fn();
const mockAutoRetry          = vi.fn();
const mockHealCircuitBreaker = vi.fn();
const mockHealthReport       = vi.fn();

vi.mock("../../skills/self-healing-integrations/index.mjs", () => ({
  probeAllWebhooks:          mockProbeWebhooks,
  detectBrokenIntegrations:  mockDetectBroken,
  autoRetryTransient:        mockAutoRetry,
  selfHealCircuitBreaker:    mockHealCircuitBreaker,
  generateHealthReport:      mockHealthReport,
}));

// ── Mock gh-fix-ci skill ──────────────────────────────────────────

const mockRunCiFixWorkflow = vi.fn();

vi.mock("../../skills/gh-fix-ci/index.mjs", () => ({
  runCiFixWorkflow: mockRunCiFixWorkflow,
}));

// ── Import SUT ────────────────────────────────────────────────────

import {
  runHealingLoop,
  runIntegrationHealthCheck,
  runCiHealingCycle,
} from "../self-healing-supervisor";

// ─────────────────────────────────────────────────────────────────

describe("self-healing-supervisor — runHealingLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL              = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.ANTHROPIC_API_KEY_SOVEREIGN = "sk-ant-test-key-sovereign";
    process.env.ANTHROPIC_API_KEY_SHARED    = "sk-ant-test-key-shared";
    // Silence Telegram alert attempt (no token set)
    delete process.env.TELEGRAM_BOT_TOKEN;
    // Stub fetch so the gateway reachability check in preflightCheck() doesn't block
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  it("returns zero patches when no logs are provided", async () => {
    mockIngestErrorLogs.mockResolvedValue({ incidents: [] });
    mockClusterIncidents.mockReturnValue({ clusters: {} });
    mockGenerateReport.mockReturnValue({ report: "# Report\n\nNo incidents." });

    const result = await runHealingLoop([]);

    expect(result.incidents_ingested).toBe(0);
    expect(result.clusters_found).toBe(0);
    expect(result.patches_applied).toBe(0);
    expect(result.report).toContain("No incidents");
  });

  it("applies safe patches and skips proposals requiring human review", async () => {
    const fakeIncidents = [
      { id: "i1", signature: "network_connectivity", severity: "high", message: "ECONNREFUSED", source: "webhook-handler", timestamp: new Date().toISOString() },
    ];

    mockIngestErrorLogs.mockResolvedValue({ incidents: fakeIncidents });
    mockClusterIncidents.mockReturnValue({
      clusters: {
        network_connectivity: {
          signature: "network_connectivity",
          severity: "high",
          count: 1,
          incidents: ["i1"],
          representative: "ECONNREFUSED",
        },
      },
    });

    const safeProposal = {
      id: "proposal-network_connectivity-0",
      description: "Add retry with exponential backoff",
      patch_hint: "Wrap fetch with retry-backoff-wrapper",
      confidence: 0.7,
      requires_human_review: false,
    };
    const humanProposal = {
      id: "proposal-network_connectivity-1",
      description: "Rotate credentials",
      patch_hint: "Check env vars",
      confidence: 0.5,
      requires_human_review: true,
    };

    mockGeneratePatchProposals.mockResolvedValue({ proposals: [safeProposal, humanProposal] });

    mockValidatePatch
      .mockReturnValueOnce({ valid: true, safe_to_apply: true, reason: "Static checks passed" })
      .mockReturnValueOnce({ valid: true, safe_to_apply: false, reason: "Requires human review" });

    mockApplyPatch.mockResolvedValue({ applied: true, patch_id: "patch-1", rollback_token: "rb-abc" });

    mockMonitorStability.mockResolvedValue({ stable: true, recurrence_count: 0, verdict: "stable" });

    mockGenerateReport.mockReturnValue({ report: "# Report\n\n## Patches Applied (1)" });

    // Mock Supabase insert for healing_run_log
    mockFrom.mockReturnValue({ insert: mockInsert.mockResolvedValue({ data: null, error: null }) });

    const result = await runHealingLoop([
      { source: "webhook-handler", message: "ECONNREFUSED", timestamp: new Date().toISOString() },
    ]);

    expect(result.patches_applied).toBe(1);
    expect(result.patches_skipped).toBe(1); // human review proposal skipped
    // Human-review proposals generate a human escalation — expected behavior
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]).toContain("Requires human review");
    expect(result.report).toContain("Patches Applied");
  });

  it("escalates when a cluster regresses after patching", async () => {
    const fakeIncidents = [
      { id: "i2", signature: "auth_failure", severity: "high", message: "401 Unauthorized", source: "ghl", timestamp: new Date().toISOString() },
    ];

    mockIngestErrorLogs.mockResolvedValue({ incidents: fakeIncidents });
    mockClusterIncidents.mockReturnValue({
      clusters: {
        auth_failure: {
          signature: "auth_failure",
          severity: "high",
          count: 5,
          incidents: ["i2"],
          representative: "401 Unauthorized",
        },
      },
    });

    mockGeneratePatchProposals.mockResolvedValue({
      proposals: [{
        id: "p0",
        description: "Refresh token",
        patch_hint: "Rotate token",
        confidence: 0.3,
        requires_human_review: true,
      }],
    });

    mockValidatePatch.mockReturnValue({ valid: true, safe_to_apply: false, reason: "Requires human review" });

    // Regression detected post-fix
    mockMonitorStability.mockResolvedValue({
      stable: false,
      recurrence_count: 7,
      verdict: "regressed",
    });

    mockGenerateReport.mockReturnValue({ report: "# Report\n\nRegression detected." });
    mockFrom.mockReturnValue({ insert: mockInsert.mockResolvedValue({ data: null, error: null }) });

    const result = await runHealingLoop([
      { source: "ghl", message: "401 Unauthorized" },
    ]);

    // Regression should appear in escalations
    const regressionEscalation = result.escalations.find(e => e.includes("Regression"));
    expect(regressionEscalation).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────

describe("self-healing-supervisor — runIntegrationHealthCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL              = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("heals transient failures and escalates dead integrations", async () => {
    mockProbeWebhooks.mockResolvedValue({ results: [
      { provider: "ghl",      status: "healthy",  latency_ms: 120 },
      { provider: "supabase", status: "degraded", latency_ms: 800 },
      { provider: "stripe",   status: "dead",     latency_ms: 0 },
    ]});

    mockDetectBroken.mockResolvedValue({
      broken: [
        { provider: "supabase", reason: "3 of 5 degraded", failure_type: "degraded" },
        { provider: "stripe",   reason: "5 of 5 dead",     failure_type: "dead" },
      ],
      healthy: ["ghl"],
      dlq_depth: 2,
    });

    mockAutoRetry.mockResolvedValue({ retried: 0, succeeded: 0, failed: 0 });
    mockHealCircuitBreaker.mockResolvedValue({ reset: true, previous_state: "open" });

    mockHealthReport.mockResolvedValue({
      overall: "critical",
      providers: {
        ghl:      { status: "healthy",  uptime_pct: 100, avg_latency_ms: 120, dlq_depth: 0, checks_total: 10 },
        supabase: { status: "degraded", uptime_pct: 40,  avg_latency_ms: 800, dlq_depth: 0, checks_total: 10 },
        stripe:   { status: "dead",     uptime_pct: 0,   avg_latency_ms: 0,   dlq_depth: 0, checks_total: 10 },
      },
    });

    mockFrom.mockReturnValue({ insert: mockInsert.mockResolvedValue({ data: null, error: null }) });

    const result = await runIntegrationHealthCheck();

    expect(result.overall).toBe("critical");
    expect(result.healed).toContain("supabase");
    expect(result.escalated).toContain("stripe");
  });
});

// ─────────────────────────────────────────────────────────────────

describe("self-healing-supervisor — runCiHealingCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL              = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("returns skipped=true when no failing runs exist", async () => {
    mockRunCiFixWorkflow.mockResolvedValue({
      run_id: 0,
      category: "none",
      skipped: true,
      reason: "No failing runs found",
    });

    const result = await runCiHealingCycle("acme", "api-server");

    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/No failing runs/);
  });

  it("returns PR details when a fix is successfully applied", async () => {
    mockRunCiFixWorkflow.mockResolvedValue({
      run_id: 42,
      category: "lint_error",
      pr_url: "https://github.com/acme/api-server/pull/99",
      pr_number: 99,
      skipped: false,
    });

    mockFrom.mockReturnValue({ insert: mockInsert.mockResolvedValue({ data: null, error: null }) });

    const result = await runCiHealingCycle("acme", "api-server");

    expect(result.skipped).toBe(false);
    expect(result.pr_url).toContain("pull/99");
    expect(result.category).toBe("lint_error");
  });
});
