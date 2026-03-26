/**
 * Phase 2 Intelligence — Inngest Event Handlers
 * Skills 2, 8, 5
 *
 * Defines all Inngest functions for the Phase 2 intelligence skills:
 * - Autonomous Revenue Ops (cron + event-driven)
 * - Customer Journey Intelligence (event-driven + cron)
 * - Executive Command Center (cron + event-driven)
 */

import { inngest } from "../client";

// Typed loaders for dynamic .mjs skill imports
// @ts-expect-error — .mjs skills are untyped by design
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadRevenueOps = () => import("../../skills/autonomous-revenue-ops/index.mjs") as Promise<any>;
// @ts-expect-error — .mjs skills are untyped by design
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadJourneyIntel = () => import("../../skills/customer-journey-intelligence/index.mjs") as Promise<any>;
// @ts-expect-error — .mjs skills are untyped by design
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadCommandCenter = () => import("../../skills/executive-command-center/index.mjs") as Promise<any>;

// ═══════════════════════════════════════════════════════════════════
// SKILL 2: Autonomous Revenue Ops
// ═══════════════════════════════════════════════════════════════════

/**
 * Daily KPI collection — runs at 6 AM.
 * Collects KPIs for all 10 businesses, detects anomalies,
 * matches & executes playbooks, then emits briefing event.
 */
export const revenueDailyCollection = inngest.createFunction(
  {
    id: "revenue-daily-collection",
    name: "Revenue Ops — Daily KPI Collection",
    retries: 3,
  },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const mod = await step.run("load-revenue-ops", () => loadRevenueOps());

    // Fan out KPI collection across all 10 businesses
    const businessIds = Array.from({ length: 10 }, (_, i) => `biz_${String(i + 1).padStart(2, "0")}`);

    const kpis = await step.run("collect-all-kpis", async () => {
      const results = [];
      for (const bizId of businessIds) {
        try {
          const kpi = await mod.collectDailyKPIs(bizId);
          results.push(kpi);
        } catch (err) {
          results.push({ business_id: bizId, error: (err as Error).message });
        }
      }
      return results;
    });

    // Detect anomalies for each business
    const allAnomalies = await step.run("detect-anomalies", async () => {
      const anomalies = [];
      for (const bizId of businessIds) {
        try {
          const found = await mod.detectKPIAnomalies(bizId);
          anomalies.push(...found);
        } catch (_err) { /* skip on insufficient data */ }
      }
      return anomalies;
    });

    // Process anomalies — match and execute playbooks
    if (allAnomalies.length > 0) {
      await step.run("execute-playbooks", async () => {
        for (const anomaly of allAnomalies) {
          const playbook = mod.matchPlaybook(anomaly);
          if (playbook) {
            await mod.executePlaybook(playbook, {
              business_id: anomaly.business_id,
              z_score: anomaly.z_score,
            });
          }
        }
      });
    }

    // Emit briefing ready event
    await step.sendEvent("emit-briefing-ready", {
      name: "revenue/briefing.ready" as const,
      data: {
        businesses_collected: kpis.filter((k: Record<string, unknown>) => !k.error).length,
        anomalies_found: allAnomalies.length,
        date: new Date().toISOString().slice(0, 10),
      },
    });

    return { kpis_collected: kpis.length, anomalies: allAnomalies.length };
  }
);

/**
 * React to detected anomalies — match playbooks and execute.
 */
export const revenueAnomalyDetected = inngest.createFunction(
  {
    id: "revenue-anomaly-detected",
    name: "Revenue Ops — Anomaly Response",
    retries: 2,
  },
  { event: "revenue/anomaly.detected" },
  async ({ event, step }) => {
    const mod = await step.run("load-revenue-ops", () => loadRevenueOps());

    const anomaly = event.data;
    const playbook = await step.run("match-playbook", () => mod.matchPlaybook(anomaly));

    if (playbook) {
      const execution = await step.run("execute-playbook", () =>
        mod.executePlaybook(playbook, {
          business_id: anomaly.business_id,
          z_score: anomaly.z_score,
          anomaly_id: anomaly.anomaly_id,
        })
      );

      // Alert on critical anomalies
      if (anomaly.severity === "critical") {
        await step.sendEvent("alert-critical-anomaly", {
          name: "alert/telegram" as const,
          data: {
            channel: "executive" as const,
            message: `🚨 Critical anomaly: ${anomaly.kpi_name} for ${anomaly.business_id} — z-score: ${anomaly.z_score}`,
            priority: "urgent" as const,
          },
        });
      }

      return { playbook: (playbook as Record<string, unknown>).playbook_id, execution };
    }

    return { playbook: null, message: "No matching playbook" };
  }
);

/**
 * Deliver daily briefing when ready.
 */
export const revenueBriefingReady = inngest.createFunction(
  {
    id: "revenue-briefing-ready",
    name: "Revenue Ops — Briefing Delivery",
    retries: 2,
  },
  { event: "revenue/briefing.ready" },
  async ({ step }) => {
    const mod = await step.run("load-revenue-ops", () => loadRevenueOps());

    const pulse = await step.run("portfolio-pulse", () => mod.portfolioPulse()) as {
      total_revenue: number;
      total_leads: number;
      total_conversions: number;
      active_anomalies: number;
      critical_anomalies: number;
    };

    // Send Telegram briefing
    await step.sendEvent("send-briefing-telegram", {
      name: "alert/telegram" as const,
      data: {
        channel: "executive" as const,
        message: `📊 Daily Revenue Pulse\n💰 $${pulse.total_revenue.toLocaleString()}\n👥 ${pulse.total_leads} leads\n🔄 ${pulse.total_conversions} conversions\n⚠️ ${pulse.active_anomalies} anomalies (${pulse.critical_anomalies} critical)`,
        priority: "normal" as const,
      },
    });

    return pulse;
  }
);

// ═══════════════════════════════════════════════════════════════════
// SKILL 8: Customer Journey Intelligence
// ═══════════════════════════════════════════════════════════════════

/**
 * Record a touchpoint when triggered by webhook handler.
 */
export const journeyTouchpointRecorded = inngest.createFunction(
  {
    id: "journey-touchpoint-recorded",
    name: "Journey — Record Touchpoint",
    retries: 2,
  },
  { event: "journey/touchpoint.recorded" },
  async ({ event, step }) => {
    const mod = await step.run("load-journey", () => loadJourneyIntel());

    const touchpoint = await step.run("record-touchpoint", () =>
      mod.recordTouchpoint(event.data.contact_id, event.data)
    );

    // Score intent after recording touchpoint
    const score = await step.run("score-intent", () =>
      mod.scoreIntent(event.data.contact_id)
    ) as { intent_score: number; factors: Record<string, number> };

    // If high intent, emit event for sales alert
    if (score.intent_score >= 80) {
      await step.sendEvent("emit-high-intent", {
        name: "journey/intent.high" as const,
        data: {
          contact_id: event.data.contact_id,
          business_id: event.data.business_id,
          intent_score: score.intent_score,
          factors: score.factors,
        },
      });
    }

    return { touchpoint, score };
  }
);

/**
 * Daily scan for stalled journeys — runs at 4 AM.
 */
export const journeyStallDetection = inngest.createFunction(
  {
    id: "journey-stall-detection",
    name: "Journey — Daily Stall Detection",
    retries: 2,
  },
  { cron: "0 4 * * *" },
  async ({ step }) => {
    const mod = await step.run("load-journey", () => loadJourneyIntel());

    // Get all active contacts with recent touchpoints
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    );

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: recentContacts } = await sb
      .from("journey_touchpoints")
      .select("contact_id")
      .gte("timestamp", thirtyDaysAgo);

    const uniqueContacts = [...new Set((recentContacts || []).map((c: { contact_id: string }) => c.contact_id))];

    const stalls = await step.run("detect-stalls", async () => {
      const found = [];
      for (const contactId of uniqueContacts) {
        const stall = await mod.detectJourneyStall(contactId);
        if (stall) found.push(stall);
      }
      return found;
    });

    // Emit events for stalled journeys
    if (stalls.length > 0) {
      await step.sendEvent("alert-stalled-journeys", {
        name: "alert/telegram" as const,
        data: {
          channel: "ops" as const,
          message: `🔄 ${stalls.length} stalled journey(s) detected. Top stall stages: ${[...new Set(stalls.map((s: { stalled_at: string }) => s.stalled_at))].join(", ")}`,
          priority: "normal" as const,
        },
      });
    }

    return { stalls_found: stalls.length, stalls };
  }
);

/**
 * React to high-intent contacts — recommend next offer.
 */
export const journeyHighIntent = inngest.createFunction(
  {
    id: "journey-high-intent",
    name: "Journey — High Intent Response",
    retries: 2,
  },
  { event: "journey/intent.high" },
  async ({ event, step }) => {
    const mod = await step.run("load-journey", () => loadJourneyIntel());

    const recommendation = await step.run("recommend-offer", () =>
      mod.recommendNextOffer(event.data.contact_id)
    ) as { recommended_offer_id?: string; reason: string } | null;

    if (recommendation) {
      // Alert sales team
      await step.sendEvent("alert-sales-high-intent", {
        name: "alert/telegram" as const,
        data: {
          channel: "ops" as const,
          message: `🎯 High-intent contact (score: ${event.data.intent_score}): ${event.data.contact_id}\nRecommended: ${recommendation.recommended_offer_id || "custom outreach"}\nReason: ${recommendation.reason}`,
          priority: "normal" as const,
        },
      });
    }

    return { recommendation };
  }
);

/**
 * Trigger next action for a contact (workflow enrollment).
 */
export const journeyNextOfferTriggered = inngest.createFunction(
  {
    id: "journey-next-offer-triggered",
    name: "Journey — Next Offer Trigger",
    retries: 2,
  },
  { event: "journey/next-offer.triggered" },
  async ({ event, step }) => {
    const mod = await step.run("load-journey", () => loadJourneyIntel());

    const result = await step.run("trigger-action", () =>
      mod.triggerNextAction(event.data.contact_id, event.data.recommendation)
    );

    return result;
  }
);

// ═══════════════════════════════════════════════════════════════════
// SKILL 5: Executive Command Center
// ═══════════════════════════════════════════════════════════════════

/**
 * Daily briefing — runs at 7 AM.
 */
export const commandCenterDailyBriefing = inngest.createFunction(
  {
    id: "command-center-daily-briefing",
    name: "Command Center — Daily Briefing",
    retries: 2,
  },
  { cron: "0 7 * * *" },
  async ({ step }) => {
    const mod = await step.run("load-command-center", () => loadCommandCenter());

    const briefing = await step.run("generate-briefing", () => mod.generatePortfolioBriefing()) as {
      portfolio: Record<string, unknown>;
    };
    const bottlenecks = await step.run("identify-bottlenecks", () => mod.identifyBottlenecks());
    const risks = await step.run("surface-risks", () => mod.surfaceRisks());

    // Deliver via Telegram
    await step.run("deliver-telegram", () => mod.deliverBriefing("telegram"));

    return { briefing, bottlenecks, risks };
  }
);

/**
 * Weekly digest — runs Monday 8 AM.
 */
export const commandCenterWeeklyDigest = inngest.createFunction(
  {
    id: "command-center-weekly-digest",
    name: "Command Center — Weekly Digest",
    retries: 2,
  },
  { cron: "0 8 * * 1" },
  async ({ step }) => {
    const mod = await step.run("load-command-center", () => loadCommandCenter());

    const briefing = await step.run("generate-weekly-briefing", () => mod.generatePortfolioBriefing()) as {
      portfolio: Record<string, unknown>;
    };
    const risks = await step.run("surface-risks", () => mod.surfaceRisks()) as unknown[];

    // Deliver weekly digest via Telegram
    await step.sendEvent("send-weekly-digest", {
      name: "alert/telegram" as const,
      data: {
        channel: "executive" as const,
        message: `📋 Weekly OpenClaw Digest\n${JSON.stringify(briefing.portfolio, null, 2).slice(0, 500)}`,
        priority: "normal" as const,
      },
    });

    return { briefing, risks };
  }
);

/**
 * React to critical alerts — update command center.
 */
export const commandCenterCriticalAlert = inngest.createFunction(
  {
    id: "command-center-critical-alert",
    name: "Command Center — Critical Alert",
    retries: 2,
  },
  { event: "command-center/alert.critical" },
  async ({ event, step }) => {
    const mod = await step.run("load-command-center", () => loadCommandCenter());

    const risks = await step.run("surface-risks", () => mod.surfaceRisks()) as unknown[];

    // Forward critical alert
    await step.sendEvent("forward-critical", {
      name: "alert/telegram" as const,
      data: {
        channel: "executive" as const,
        message: `🚨 CRITICAL: ${event.data.source || "unknown"} — ${event.data.message || "Alert triggered"}\n\nActive risks: ${risks.length}`,
        priority: "urgent" as const,
      },
    });

    return { risks_count: risks.length };
  }
);

// ── Export all Phase 2 functions ────────────────────────────────

export const phase2Functions = [
  revenueDailyCollection,
  revenueAnomalyDetected,
  revenueBriefingReady,
  journeyTouchpointRecorded,
  journeyStallDetection,
  journeyHighIntent,
  journeyNextOfferTriggered,
  commandCenterDailyBriefing,
  commandCenterWeeklyDigest,
  commandCenterCriticalAlert,
];
