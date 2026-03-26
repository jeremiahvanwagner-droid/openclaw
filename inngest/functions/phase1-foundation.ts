/**
 * Phase 1 Foundation — Inngest Event Handlers
 * Skills 3, 6, 10
 *
 * Defines all Inngest functions for the Phase 1 foundation skills:
 * - Cross-Business Scope Governor (cron + event-driven)
 * - Self-Healing Integrations (cron + event-driven)
 * - Autonomous QA & Compliance (cron + event-driven)
 */

import { inngest } from "../client";

interface DriftItem { severity: string; agent_id: string; reason: string }
interface BrokenItem { failure_type: string; provider: string }
interface ProbeResult { provider: string; status: string }

// Dynamic .mjs imports
declare module "../../skills/cross-business-scope-governor/index.mjs";
declare module "../../skills/self-healing-integrations/index.mjs";
declare module "../../skills/autonomous-qa-compliance/index.mjs";

// ═══════════════════════════════════════════════════════════════════
// SKILL 3: Cross-Business Scope Governor
// ═══════════════════════════════════════════════════════════════════

/**
 * Daily scope audit — runs at 2 AM.
 * Performs full compliance audit, drift detection, isolation check,
 * and policy guardrail enforcement.
 */
export const scopeAuditScheduled = inngest.createFunction(
  {
    id: "scope-audit-scheduled",
    name: "Scope Audit — Daily Scheduled",
    retries: 2,
  },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    const { auditScopeCompliance, detectScopeDrift, crossBusinessIsolationCheck, policyGuardrailEnforcement } =
      await step.run("load-scope-governor", async () => {
        const mod = await import("../../skills/cross-business-scope-governor/index.mjs");
        return mod;
      });

    // Step 1: Full compliance audit
    const compliance = await step.run("audit-compliance", async () => {
      return auditScopeCompliance();
    });

    // Step 2: Drift detection
    const drift = await step.run("detect-drift", async () => {
      return detectScopeDrift();
    });

    // Step 3: If drift found, emit drift event
    if (drift.has_drift) {
      await step.sendEvent("emit-drift-detected", {
        name: "scope/drift.detected",
        data: {
          drift_count: drift.drifts.length,
          critical_count: drift.drifts.filter((d: DriftItem) => d.severity === "critical").length,
          drifts: drift.drifts,
        },
      });
    }

    // Step 4: Cross-business isolation check
    const isolation = await step.run("check-isolation", async () => {
      return crossBusinessIsolationCheck();
    });

    // Step 5: Policy guardrail enforcement
    const policy = await step.run("check-policy", async () => {
      return policyGuardrailEnforcement();
    });

    // Step 6: Alert if critical issues found
    const hasCritical =
      compliance.summary.violations > 0 ||
      !isolation.isolated ||
      drift.drifts?.some((d: DriftItem) => d.severity === "critical");

    if (hasCritical) {
      await step.sendEvent("alert-critical-scope", {
        name: "alert/telegram",
        data: {
          channel: "ops" as const,
          message: `🔒 Scope Governor Alert:\n` +
            `- Compliance violations: ${compliance.summary.violations}\n` +
            `- Drift items: ${drift.drifts?.length || 0}\n` +
            `- Isolation: ${isolation.isolated ? "✅" : "❌"}\n` +
            `- Policy: ${policy.compliant ? "✅" : "❌"}`,
          priority: "urgent" as const,
        },
      });
    }

    return {
      compliance: compliance.summary,
      drift: { has_drift: drift.has_drift, count: drift.drifts?.length || 0 },
      isolation: { isolated: isolation.isolated, violations: isolation.violations?.length || 0 },
      policy: { compliant: policy.compliant, violations: policy.violations?.length || 0 },
    };
  }
);

/**
 * Handle drift detection — attempt auto-correct or escalate.
 */
export const scopeDriftDetected = inngest.createFunction(
  {
    id: "scope-drift-detected",
    name: "Scope Drift — Auto-Correct Handler",
    retries: 1,
  },
  { event: "scope/drift.detected" },
  async ({ event, step }) => {
    const { autoCorrectDrift } = await step.run("load-scope-governor", async () => {
      return import("../../skills/cross-business-scope-governor/index.mjs");
    });

    const result = await step.run("auto-correct", async () => {
      return autoCorrectDrift(
        { drifts: event.data.drifts },
        { dryRun: false }
      );
    });

    // If any items escalated, send alert
    if (result.escalated.length > 0) {
      await step.sendEvent("escalate-drift", {
        name: "alert/telegram",
        data: {
          channel: "ops" as const,
          message: `⚠️ Scope Drift Escalation:\n` +
            `${result.escalated.length} drift items require human review:\n` +
            result.escalated.map((e: DriftItem) => `- ${e.agent_id}: ${e.reason}`).join("\n"),
          priority: "urgent" as const,
        },
      });
    }

    return result;
  }
);

/**
 * Log scope violation in real-time (triggered from ghl-scope-enforcer).
 */
export const scopeViolationAttempted = inngest.createFunction(
  {
    id: "scope-violation-attempted",
    name: "Scope Violation — Logger",
    retries: 2,
  },
  { event: "scope/violation.attempted" },
  async ({ event, step }) => {
    const { logScopeViolation } = await step.run("load-scope-governor", async () => {
      return import("../../skills/cross-business-scope-governor/index.mjs");
    });

    await step.run("log-violation", async () => {
      return logScopeViolation(event.data);
    });

    // Alert on violation
    await step.sendEvent("alert-violation", {
      name: "alert/telegram",
      data: {
        channel: "ops" as const,
        message: `🚫 Scope Violation: Agent "${event.data.agent_id}" attempted ${event.data.resource}:${event.data.operation}` +
          (event.data.blocked ? " (BLOCKED)" : " (ALLOWED)"),
        priority: "normal" as const,
      },
    });

    return { logged: true };
  }
);

// ═══════════════════════════════════════════════════════════════════
// SKILL 6: Self-Healing Integrations
// ═══════════════════════════════════════════════════════════════════

/**
 * Health check — runs every 5 minutes.
 * Probes endpoints, checks DLQ, evaluates circuit breaker state.
 */
export const integrationHealthCheck = inngest.createFunction(
  {
    id: "integration-health-check",
    name: "Integration Health — 5min Probe",
    retries: 1,
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const { probeAllWebhooks, detectBrokenIntegrations, selfHealCircuitBreaker } =
      await step.run("load-self-healing", async () => {
        return import("../../skills/self-healing-integrations/index.mjs");
      });

    // Step 1: Probe all endpoints
    const probeResults = await step.run("probe-endpoints", async () => {
      return probeAllWebhooks();
    });

    // Step 2: Detect broken integrations
    const broken = await step.run("detect-broken", async () => {
      return detectBrokenIntegrations();
    });

    // Step 3: Attempt to heal any previously broken providers that are now healthy
    const healed = [];
    for (const result of probeResults.results) {
      if (result.status === "healthy") {
        const healResult = await step.run(`heal-${result.provider}`, async () => {
          return selfHealCircuitBreaker(result.provider);
        });
        if (healResult.reset) {
          healed.push(result.provider);
        }
      }
    }

    if (healed.length > 0) {
      await step.sendEvent("emit-healed", {
        name: "integration/healed",
        data: {
          providers: healed,
          healed_at: new Date().toISOString(),
        },
      });
    }

    // Step 4: If any broken integrations, emit failure event
    if (broken.broken.length > 0) {
      await step.sendEvent("emit-failure", {
        name: "integration/failure.detected",
        data: {
          broken: broken.broken,
          dlq_depth: broken.dlq_depth,
        },
      });
    }

    return {
      probed: probeResults.results.length,
      healthy: probeResults.results.filter((r: ProbeResult) => r.status === "healthy").length,
      broken: broken.broken.length,
      healed: healed.length,
      dlq_depth: broken.dlq_depth,
    };
  }
);

/**
 * Handle detected integration failures — auto-retry or escalate.
 */
export const integrationFailureDetected = inngest.createFunction(
  {
    id: "integration-failure-detected",
    name: "Integration Failure — Auto-Heal Handler",
    retries: 2,
  },
  { event: "integration/failure.detected" },
  async ({ event, step }) => {
    const { autoRetryTransient } = await step.run(
      "load-self-healing",
      async () => {
        return import("../../skills/self-healing-integrations/index.mjs");
      }
    );

    const transientFailures = event.data.broken.filter(
      (b: BrokenItem) => b.failure_type === "transient"
    );

    let retryResult = { retried: 0, succeeded: 0, failed: 0 };
    if (transientFailures.length > 0) {
      retryResult = await step.run("auto-retry-transient", async () => {
        return autoRetryTransient(transientFailures);
      });
    }

    // Escalate dead integrations
    const deadIntegrations = event.data.broken.filter(
      (b: BrokenItem) => b.failure_type === "dead"
    );

    if (deadIntegrations.length > 0) {
      await step.sendEvent("escalate-dead", {
        name: "integration/escalation.needed",
        data: {
          dead_providers: deadIntegrations,
          dlq_depth: event.data.dlq_depth,
        },
      });
    }

    return { retryResult, escalated: deadIntegrations.length };
  }
);

/**
 * Log integration healed event.
 */
export const integrationHealed = inngest.createFunction(
  {
    id: "integration-healed",
    name: "Integration Healed — Logger",
    retries: 1,
  },
  { event: "integration/healed" },
  async ({ event, step }) => {
    await step.sendEvent("alert-healed", {
      name: "alert/telegram",
      data: {
        channel: "ops" as const,
        message: `✅ Integration Healed: ${event.data.providers.join(", ")} recovered at ${event.data.healed_at}`,
        priority: "normal" as const,
      },
    });
    return { logged: true };
  }
);

/**
 * Escalation handler — when auto-heal fails repeatedly.
 */
export const integrationEscalation = inngest.createFunction(
  {
    id: "integration-escalation",
    name: "Integration Escalation — Human Required",
    retries: 1,
  },
  { event: "integration/escalation.needed" },
  async ({ event, step }) => {
    await step.sendEvent("alert-escalation", {
      name: "alert/telegram",
      data: {
        channel: "ops" as const,
        message: `🚨 Integration Escalation Required!\n` +
          `Dead providers: ${event.data.dead_providers.map((p: BrokenItem) => p.provider).join(", ")}\n` +
          `DLQ depth: ${event.data.dlq_depth}\n` +
          `Auto-heal exhausted — human intervention needed.`,
        priority: "urgent" as const,
      },
    });
    return { escalated: true };
  }
);

// ═══════════════════════════════════════════════════════════════════
// SKILL 10: Autonomous QA & Compliance
// ═══════════════════════════════════════════════════════════════════

/**
 * Daily QA audit — runs at 3 AM.
 * Full compliance audit across all businesses.
 */
export const qaScheduledAudit = inngest.createFunction(
  {
    id: "qa-scheduled-audit",
    name: "QA Audit — Daily Scheduled",
    retries: 2,
  },
  { cron: "0 3 * * *" },
  async ({ step }) => {
    const {
      runFunnelAudit,
      runTrackingIntegrityCheck,
      runBrandComplianceCheck: _runBrandComplianceCheck,
      generateComplianceScorecard,
    } = await step.run("load-qa-compliance", async () => {
      return import("../../skills/autonomous-qa-compliance/index.mjs");
    });

    // Load business registry to get all locations
    const registry = await step.run("load-registry", async () => {
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      const data = readFileSync(
        join(process.cwd(), "data/business-registry.json"),
        "utf-8"
      );
      return JSON.parse(data);
    });

    const businesses = registry.businesses || Object.values(registry);
    const results = [];

    for (const biz of businesses) {
      const locationId = biz.ghl_location_id || biz.location_id || biz.id;
      if (!locationId) continue;

      // Run funnel audit
      await step.run(`funnel-audit-${locationId}`, async () => {
        return runFunnelAudit(locationId);
      });

      // Run tracking check
      await step.run(`tracking-check-${locationId}`, async () => {
        return runTrackingIntegrityCheck(locationId);
      });

      // Generate scorecard
      const scorecard = await step.run(`scorecard-${locationId}`, async () => {
        return generateComplianceScorecard(locationId);
      });

      results.push({
        location_id: locationId,
        business: biz.name || biz.business_id,
        funnel_score: funnel.score,
        tracking_score: tracking.score,
        overall_score: scorecard.overall_score,
      });

      // Alert if score below threshold
      if (scorecard.overall_score < 70) {
        await step.sendEvent(`alert-low-score-${locationId}`, {
          name: "qa/compliance.alert",
          data: {
            location_id: locationId,
            business_id: biz.business_id || biz.id,
            overall_score: scorecard.overall_score,
            categories: scorecard.categories,
          },
        });
      }
    }

    return { businesses_audited: results.length, results };
  }
);

/**
 * Immediate funnel audit when a funnel is published.
 * Triggered by the existing saas/funnel.published event.
 */
export const qaFunnelPublished = inngest.createFunction(
  {
    id: "qa-funnel-published",
    name: "QA — Funnel Published Audit",
    retries: 2,
  },
  { event: "qa/funnel.published" },
  async ({ event, step }) => {
    const {
      runFunnelAudit,
      runTrackingIntegrityCheck,
      generateComplianceScorecard,
    } = await step.run("load-qa-compliance", async () => {
      return import("../../skills/autonomous-qa-compliance/index.mjs");
    });

    const locationId = event.data.location_id;

    await step.run("funnel-audit", async () => {
      return runFunnelAudit(locationId);
    });

    await step.run("tracking-check", async () => {
      return runTrackingIntegrityCheck(locationId);
    });

    const scorecard = await step.run("scorecard", async () => {
      return generateComplianceScorecard(locationId);
    });

    if (scorecard.overall_score < 70) {
      await step.sendEvent("alert-low-score", {
        name: "alert/telegram",
        data: {
          channel: "ops" as const,
          message: `⚠️ QA Alert: Funnel "${event.data.funnel_name}" scored ${scorecard.overall_score}/100\n` +
            `Location: ${locationId}\n` +
            `Action: Review compliance scorecard in dashboard.`,
          priority: "normal" as const,
        },
      });
    }

    return { location_id: locationId, scorecard };
  }
);

/**
 * Compliance alert handler — when scorecard drops below threshold.
 */
export const qaComplianceAlert = inngest.createFunction(
  {
    id: "qa-compliance-alert",
    name: "QA — Compliance Alert Handler",
    retries: 1,
  },
  { event: "qa/compliance.alert" },
  async ({ event, step }) => {
    await step.sendEvent("alert-compliance", {
      name: "alert/telegram",
      data: {
        channel: "ops" as const,
        message: `📋 Compliance Alert: Business "${event.data.business_id}" scored ${event.data.overall_score}/100\n` +
          `Categories below threshold need attention.`,
        priority: event.data.overall_score < 50 ? ("urgent" as const) : ("normal" as const),
      },
    });
    return { alerted: true };
  }
);

/**
 * Tracking broken handler — when UTM integrity check fails.
 */
export const qaTrackingBroken = inngest.createFunction(
  {
    id: "qa-tracking-broken",
    name: "QA — Tracking Broken Alert",
    retries: 1,
  },
  { event: "qa/tracking.broken" },
  async ({ event, step }) => {
    await step.sendEvent("alert-tracking", {
      name: "alert/telegram",
      data: {
        channel: "ops" as const,
        message: `🔗 Tracking Broken: UTM integrity check failed for location "${event.data.location_id}"\n` +
          `Affected parameters: ${event.data.broken_params?.join(", ") || "unknown"}`,
        priority: "urgent" as const,
      },
    });
    return { alerted: true };
  }
);

// ── Exports for registration ───────────────────────────────────

export const phase1Functions = [
  scopeAuditScheduled,
  scopeDriftDetected,
  scopeViolationAttempted,
  integrationHealthCheck,
  integrationFailureDetected,
  integrationHealed,
  integrationEscalation,
  qaScheduledAudit,
  qaFunnelPublished,
  qaComplianceAlert,
  qaTrackingBroken,
];
