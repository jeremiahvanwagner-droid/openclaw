/**
 * Phase 3 Execution — Inngest Event Handlers
 * Skills 1, 4, 7, 9
 *
 * Defines all Inngest functions for the Phase 3 execution skills:
 * - Native GHL Build/Refactor (event-driven + HITL)
 * - Experiment Engine (cron + event-driven)
 * - Content-to-Campaign Factory (event-driven)
 * - Offer Engineering (cron + event-driven)
 */

import { inngest } from "../client";
import { supabase as _supabaseSingleton } from "../../lib/agent-memory.js";

// Typed loaders for dynamic .mjs skill imports
// @ts-expect-error — .mjs skills are untyped by design
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadGHLBuilder = () => import("../../skills/native-ghl-build-refactor/index.mjs") as Promise<any>;
// @ts-expect-error — .mjs skills are untyped by design
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadExperimentEngine = () => import("../../skills/experiment-engine/index.mjs") as Promise<any>;
// @ts-expect-error — .mjs skills are untyped by design
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadCampaignFactory = () => import("../../skills/content-to-campaign-factory/index.mjs") as Promise<any>;
// @ts-expect-error — .mjs skills are untyped by design
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadOfferEngineering = () => import("../../skills/offer-engineering/index.mjs") as Promise<any>;

// ═══════════════════════════════════════════════════════════════════
// SKILL 1: Native GHL Build / Refactor
// ═══════════════════════════════════════════════════════════════════

/**
 * Handle build/create requests — funnel, workflow, or payment link.
 * Automatically snapshots before creation.
 */
export const ghlBuildCreateRequested = inngest.createFunction(
  {
    id: "ghl-build-create-requested",
    name: "GHL Builder — Create Requested",
    retries: 2,
    idempotency: "event.id",
  },
  { event: "ghl-build/create.requested" },
  async ({ event, step }) => {
    const mod = await step.run("load-ghl-builder", () => loadGHLBuilder());

    const { business_id, entity_type, template, config } = event.data;

    let result;
    switch (entity_type) {
      case "funnel":
        result = await step.run("create-funnel", () =>
          mod.createFunnel(business_id, template, config)
        );
        break;
      case "workflow":
        result = await step.run("create-workflow", () =>
          mod.createWorkflow(business_id, config)
        );
        break;
      case "payment_link":
        result = await step.run("create-payment-link", () =>
          mod.createPaymentLink(business_id, config)
        );
        break;
      default:
        throw new Error(`Unknown entity_type: ${entity_type}`);
    }

    // Emit snapshot created event
    await step.sendEvent("emit-snapshot-created", {
      name: "ghl-build/snapshot.created" as const,
      data: {
        location_id: (result as Record<string, unknown>).location_id as string,
        entity_type,
        entity_id: (result as Record<string, unknown>).build_log_id as string || "new",
        agent_id: (config as Record<string, unknown>)?.agent_id as string || "d8_funnel_engineer",
      },
    });

    // Alert on successful build
    await step.sendEvent("alert-build-complete", {
      name: "alert/telegram" as const,
      data: {
        channel: "ops" as const,
        message: `🔨 GHL Build completed: ${entity_type} for ${business_id}`,
        priority: "normal" as const,
      },
    });

    return result;
  }
);

/**
 * Log snapshot creation events for audit trail.
 */
export const ghlSnapshotCreated = inngest.createFunction(
  {
    id: "ghl-snapshot-created",
    name: "GHL Builder — Snapshot Created",
    retries: 1,
    idempotency: "event.id",
  },
  { event: "ghl-build/snapshot.created" },
  async ({ event, step }) => {
    // Audit log — snapshot is already stored in Supabase by the skill
    const result = await step.run("log-snapshot", () => ({
      location_id: event.data.location_id,
      entity_type: event.data.entity_type,
      entity_id: event.data.entity_id,
      agent_id: event.data.agent_id,
      logged_at: new Date().toISOString(),
    }));

    return result;
  }
);

/**
 * Handle rollback requests (requires HITL approval).
 */
export const ghlRollbackRequested = inngest.createFunction(
  {
    id: "ghl-rollback-requested",
    name: "GHL Builder — Rollback Requested",
    retries: 1,
    idempotency: "event.id",
  },
  { event: "ghl-build/rollback.requested" },
  async ({ event, step }) => {
    const mod = await step.run("load-ghl-builder", () => loadGHLBuilder());

    // Diff before rolling back to show what will change
    const diff = await step.run("diff-snapshot", () =>
      mod.diffSnapshot(event.data.snapshot_id, event.data.current_snapshot_id || event.data.snapshot_id)
    );

    // Execute rollback
    const result = await step.run("execute-rollback", () =>
      mod.rollback(event.data.snapshot_id)
    );

    // Critical alert for rollback
    await step.sendEvent("alert-rollback", {
      name: "alert/telegram" as const,
      data: {
        channel: "executive" as const,
        message: `⚠️ GHL Rollback executed to snapshot ${event.data.snapshot_id}\nChanges reverted: ${(diff as Record<string, unknown>).diff_count || 0}`,
        priority: "urgent" as const,
      },
    });

    return { diff, result };
  }
);

// ═══════════════════════════════════════════════════════════════════
// SKILL 4: Experiment Engine
// ═══════════════════════════════════════════════════════════════════

/**
 * Handle new experiment creation.
 */
export const experimentCreated = inngest.createFunction(
  {
    id: "experiment-created",
    name: "Experiment Engine — Created",
    retries: 2,
    idempotency: "event.id",
  },
  { event: "experiment/created" },
  async ({ event, step }) => {
    const mod = await step.run("load-experiment-engine", () => loadExperimentEngine());

    const experiment = await step.run("create-experiment", () =>
      mod.createExperiment(event.data)
    );

    await step.sendEvent("alert-experiment-created", {
      name: "alert/telegram" as const,
      data: {
        channel: "ops" as const,
        message: `🧪 New experiment: "${event.data.name}" (${event.data.type}) — ${(event.data.variants || ["A", "B"]).length} variants`,
        priority: "normal" as const,
      },
    });

    return experiment;
  }
);

/**
 * Scheduled evaluation of all active experiments — runs at 5 AM.
 */
export const experimentEvaluationScheduled = inngest.createFunction(
  {
    id: "experiment-evaluation-scheduled",
    name: "Experiment Engine — Scheduled Evaluation",
    retries: 2,
  },
  { cron: "0 5 * * *" },
  async ({ step }) => {
    const mod = await step.run("load-experiment-engine", () => loadExperimentEngine());

    // Get all businesses and check active experiments
    const businessIds = Array.from({ length: 10 }, (_, i) => `biz_${String(i + 1).padStart(2, "0")}`);

    const allResults = await step.run("evaluate-all-experiments", async () => {
      const results = [];
      for (const bizId of businessIds) {
        const active = await mod.listActiveExperiments(bizId) as Array<{ id: string }>;
        for (const experiment of active) {
          const evaluation = await mod.evaluateSignificance(experiment.id);
          results.push(evaluation);
        }
      }
      return results;
    });

    // Emit events for significant experiments
    const significant = (allResults as Array<Record<string, unknown>>).filter(
      (r) => r.significance === "significant" || r.significance === "highly_significant"
    );

    for (const result of significant) {
      await step.sendEvent(`emit-significant-${result.experiment_id}`, {
        name: "experiment/significant" as const,
        data: {
          experiment_id: result.experiment_id as string,
          winner_variant: result.winner_variant as string,
          significance: result.significance as string,
          z_score: result.z_score as number,
        },
      });
    }

    return {
      evaluated: (allResults as unknown[]).length,
      significant: significant.length,
    };
  }
);

/**
 * React to statistically significant experiments.
 */
export const experimentSignificant = inngest.createFunction(
  {
    id: "experiment-significant",
    name: "Experiment Engine — Significant Result",
    retries: 2,
    idempotency: "event.id",
  },
  { event: "experiment/significant" },
  async ({ event, step }) => {
    await step.run("load-experiment-engine", () => loadExperimentEngine());

    // Alert on significance
    await step.sendEvent("alert-significant", {
      name: "alert/telegram" as const,
      data: {
        channel: "ops" as const,
        message: `🎯 Experiment significant! ID: ${event.data.experiment_id}\nWinner: Variant ${event.data.winner_variant}\nSignificance: ${event.data.significance} (z=${event.data.z_score.toFixed(2)})`,
        priority: "normal" as const,
      },
    });

    return { experiment_id: event.data.experiment_id, winner: event.data.winner_variant };
  }
);

/**
 * Auto-promote a winning experiment variant.
 */
export const experimentPromoted = inngest.createFunction(
  {
    id: "experiment-promoted",
    name: "Experiment Engine — Promote Winner",
    retries: 2,
    idempotency: "event.id",
  },
  { event: "experiment/promoted" },
  async ({ event, step }) => {
    const mod = await step.run("load-experiment-engine", () => loadExperimentEngine());

    const result = await step.run("auto-promote", () =>
      mod.autoPromoteWinner(event.data.experiment_id)
    );

    await step.sendEvent("alert-promoted", {
      name: "alert/telegram" as const,
      data: {
        channel: "executive" as const,
        message: `✅ Experiment promoted: ${event.data.experiment_id}\nWinner: Variant ${(result as Record<string, unknown>).winner}\nType: ${(result as Record<string, unknown>).type}${(result as Record<string, unknown>).requires_hitl ? " (HITL required)" : ""}`,
        priority: "normal" as const,
      },
    });

    return result;
  }
);

// ═══════════════════════════════════════════════════════════════════
// SKILL 7: Content-to-Campaign Factory
// ═══════════════════════════════════════════════════════════════════

/**
 * Handle new campaign idea submission.
 */
export const campaignIdeaSubmitted = inngest.createFunction(
  {
    id: "campaign-idea-submitted",
    name: "Campaign Factory — Idea Submitted",
    retries: 2,
    idempotency: "event.id",
  },
  { event: "campaign/idea.submitted" },
  async ({ event, step }) => {
    const mod = await step.run("load-campaign-factory", () => loadCampaignFactory());

    // Atomize the core idea
    const atomized = await step.run("atomize-idea", () =>
      mod.atomizeIdea(event.data.core_idea, event.data.business_id)
    );

    // Generate asset bundle
    const bundle = await step.run("generate-assets", () =>
      mod.generateAssetBundle(atomized, event.data.channels || null)
    );

    // Run brand alignment check
    const alignment = await step.run("align-to-scope", () =>
      mod.alignToBusinessScope(bundle, event.data.business_id)
    );

    // Emit bundle ready
    await step.sendEvent("emit-bundle-ready", {
      name: "campaign/bundle.ready" as const,
      data: {
        campaign_id: (atomized as Record<string, unknown>).campaign_id as string,
        business_id: event.data.business_id,
        total_assets: (bundle as Record<string, unknown>).total_assets as number,
        compliant: (alignment as Record<string, unknown>).compliant as boolean,
      },
    });

    return { atomized, bundle, alignment };
  }
);

/**
 * Handle bundle ready — notify for review.
 */
export const campaignBundleReady = inngest.createFunction(
  {
    id: "campaign-bundle-ready",
    name: "Campaign Factory — Bundle Ready",
    retries: 1,
    idempotency: "event.id",
  },
  { event: "campaign/bundle.ready" },
  async ({ event, step }) => {
    await step.sendEvent("alert-bundle-ready", {
      name: "alert/telegram" as const,
      data: {
        channel: "ops" as const,
        message: `📦 Campaign bundle ready: ${event.data.campaign_id}\n${event.data.total_assets} assets for ${event.data.business_id}\nCompliant: ${event.data.compliant ? "✅" : "⚠️ Review needed"}`,
        priority: "normal" as const,
      },
    });

    return { campaign_id: event.data.campaign_id, notified: true };
  }
);

/**
 * Handle campaign approval — schedule distribution.
 */
export const campaignApproved = inngest.createFunction(
  {
    id: "campaign-approved",
    name: "Campaign Factory — Approved & Schedule",
    retries: 2,
    idempotency: "event.id",
  },
  { event: "campaign/approved" },
  async ({ event, step }) => {
    const mod = await step.run("load-campaign-factory", () => loadCampaignFactory());

    const schedule = await step.run("schedule-distribution", () =>
      mod.scheduleDistribution(
        { campaign_id: event.data.campaign_id, assets: event.data.assets || [] },
        event.data.calendar || {}
      )
    );

    await step.sendEvent("alert-campaign-scheduled", {
      name: "alert/telegram" as const,
      data: {
        channel: "ops" as const,
        message: `📅 Campaign scheduled: ${event.data.campaign_id}\n${(schedule as Record<string, unknown>).total_scheduled || 0} assets queued for distribution`,
        priority: "normal" as const,
      },
    });

    return schedule;
  }
);

/**
 * Daily campaign performance collection — runs at 8 AM.
 */
export const campaignPerformanceCollect = inngest.createFunction(
  {
    id: "campaign-performance-collect",
    name: "Campaign Factory — Daily Performance",
    retries: 2,
  },
  { cron: "0 8 * * *" },
  async ({ step }) => {
    const mod = await step.run("load-campaign-factory", () => loadCampaignFactory());

    // Get active campaigns from Supabase
    const sb = _supabaseSingleton;

    const { data: activeCampaigns } = await sb
      .from("campaign_ideas")
      .select("id")
      .in("status", ["published", "scheduled"]);

    const results = await step.run("collect-performance", async () => {
      const collected = [];
      for (const campaign of activeCampaigns || []) {
        const metrics = await mod.trackCampaignPerformance(campaign.id);
        collected.push(metrics);
      }
      return collected;
    });

    return {
      campaigns_tracked: (results as unknown[]).length,
      collected_at: new Date().toISOString(),
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// SKILL 9: Offer Engineering
// ═══════════════════════════════════════════════════════════════════

/**
 * Scheduled offer analysis — runs at 3 AM.
 */
export const offerAnalysisScheduled = inngest.createFunction(
  {
    id: "offer-analysis-scheduled",
    name: "Offer Engineering — Scheduled Analysis",
    retries: 2,
  },
  { cron: "0 3 * * *" },
  async ({ step }) => {
    const mod = await step.run("load-offer-engineering", () => loadOfferEngineering());

    const businessIds = Array.from({ length: 10 }, (_, i) => `biz_${String(i + 1).padStart(2, "0")}`);

    const analyses = await step.run("analyze-all-offers", async () => {
      const results = [];
      for (const bizId of businessIds) {
        const analysis = await mod.analyzeCurrentOffers(bizId);
        results.push(analysis);
      }
      return results;
    });

    // Generate and store recommendations
    const recommendations = await step.run("generate-recommendations", async () => {
      const allRecs = [];
      for (const bizId of businessIds) {
        const recs = await mod.recommendOptimizations(bizId);
        if (recs.total_recommendations > 0) allRecs.push(recs);
      }
      return allRecs;
    });

    const totalRecs = (recommendations as Array<Record<string, unknown>>).reduce(
      (s, r) => s + ((r.total_recommendations as number) || 0), 0
    );

    if (totalRecs > 0) {
      await step.sendEvent("emit-optimization-suggested", {
        name: "offer/optimization.suggested" as const,
        data: {
          total_recommendations: totalRecs,
          businesses_with_recommendations: (recommendations as unknown[]).length,
        },
      });
    }

    return {
      businesses_analyzed: (analyses as unknown[]).length,
      total_recommendations: totalRecs,
    };
  }
);

/**
 * React to optimization suggestions — alert team.
 */
export const offerOptimizationSuggested = inngest.createFunction(
  {
    id: "offer-optimization-suggested",
    name: "Offer Engineering — Optimization Alert",
    retries: 1,
    idempotency: "event.id",
  },
  { event: "offer/optimization.suggested" },
  async ({ event, step }) => {
    await step.sendEvent("alert-offer-optimization", {
      name: "alert/telegram" as const,
      data: {
        channel: "executive" as const,
        message: `💡 ${event.data.total_recommendations} offer optimization(s) suggested across ${event.data.businesses_with_recommendations} business(es). Review in dashboard: /offers`,
        priority: "normal" as const,
      },
    });

    return { notified: true };
  }
);

/**
 * Daily offer performance tracking — runs at 9 AM.
 */
export const offerPerformanceCollected = inngest.createFunction(
  {
    id: "offer-performance-collected",
    name: "Offer Engineering — Daily Performance",
    retries: 2,
  },
  { cron: "0 9 * * *" },
  async ({ step }) => {
    const mod = await step.run("load-offer-engineering", () => loadOfferEngineering());

    // Get all offers with analytics
    const sb = _supabaseSingleton;

    const { data: offers } = await sb
      .from("offer_analytics")
      .select("offer_id")
      .order("calculated_at", { ascending: false })
      .limit(50);

    const uniqueOffers = [...new Set((offers || []).map((o: { offer_id: string }) => o.offer_id))];

    const results = await step.run("track-performance", async () => {
      const tracked = [];
      for (const offerId of uniqueOffers) {
        const perf = await mod.trackOfferPerformance(offerId, "daily");
        tracked.push(perf);
      }
      return tracked;
    });

    return {
      offers_tracked: (results as unknown[]).length,
      collected_at: new Date().toISOString(),
    };
  }
);

// ── Export all Phase 3 functions ────────────────────────────────

export const phase3Functions = [
  // Skill 1: Native GHL Build/Refactor
  ghlBuildCreateRequested,
  ghlSnapshotCreated,
  ghlRollbackRequested,
  // Skill 4: Experiment Engine
  experimentCreated,
  experimentEvaluationScheduled,
  experimentSignificant,
  experimentPromoted,
  // Skill 7: Content-to-Campaign Factory
  campaignIdeaSubmitted,
  campaignBundleReady,
  campaignApproved,
  campaignPerformanceCollect,
  // Skill 9: Offer Engineering
  offerAnalysisScheduled,
  offerOptimizationSuggested,
  offerPerformanceCollected,
];
