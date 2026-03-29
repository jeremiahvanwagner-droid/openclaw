/**
 * Inngest Client Configuration
 * Open Claw Multi-Agent Network
 *
 * Event-driven orchestration for the OpenClaw runtime.
 */

import { EventSchemas, Inngest } from "inngest";

type JsonObject = Record<string, unknown>;
type Priority = "low" | "normal" | "high" | "critical";
type QueueClass = "P0" | "P1" | "P2" | "P3";
type BrowserPlatform =
  | "ghl"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "twitter"
  | "linkedin"
  | "youtube"
  | "canva";

export type AgentTaskEventName = `agent/${string}/task`;
export type PodTaskEventName = `pod/${string}/task`;
export type PodEscalateEventName = `pod/${string}/escalate`;
export type PodQuarantineEventName = `pod/${string}/quarantine`;
export type PodRestoreEventName = `pod/${string}/restore`;

export interface AgentTaskPayload {
  type: string;
  source?: string;
  correlation_id?: string;
  payload?: JsonObject;
  [key: string]: unknown;
}

export interface PodTaskPayload {
  type: string;
  pod_id: string;
  source?: string;
  queue_class: QueueClass;
  correlation_id?: string;
  payload?: JsonObject;
  [key: string]: unknown;
}

export function agentTaskName(agentId: string): AgentTaskEventName {
  return `agent/${agentId}/task` as AgentTaskEventName;
}

export function podTaskName(podId: string): PodTaskEventName {
  return `pod/${podId}/task` as PodTaskEventName;
}

export function podEscalateName(podId: string): PodEscalateEventName {
  return `pod/${podId}/escalate` as PodEscalateEventName;
}

export function podQuarantineName(podId: string): PodQuarantineEventName {
  return `pod/${podId}/quarantine` as PodQuarantineEventName;
}

export function podRestoreName(podId: string): PodRestoreEventName {
  return `pod/${podId}/restore` as PodRestoreEventName;
}

type OpenClawEvent =
  | {
      name: "agent/invoke";
      data: {
        source_agent: string;
        target_agent?: string;
        target_division?: string;
        payload: JsonObject;
        priority?: Priority;
        correlation_id?: string;
      };
    }
  | {
      name: "agent/escalate";
      data: {
        source_agent: string;
        escalation_path?: string | null;
        payload: JsonObject;
        retry_count?: number;
        reason?: string;
      };
    }
  | {
      name: AgentTaskEventName;
      data: AgentTaskPayload;
    }
  | {
      name: PodTaskEventName;
      data: PodTaskPayload;
    }
  | {
      name: PodEscalateEventName;
      data: {
        pod_id: string;
        source_agent: string;
        reason: string;
        payload: JsonObject;
        [key: string]: unknown;
      };
    }
  | {
      name: PodQuarantineEventName;
      data: {
        pod_id: string;
        reason: string;
        triggered_by: string;
        [key: string]: unknown;
      };
    }
  | {
      name: PodRestoreEventName;
      data: {
        pod_id: string;
        restored_by: string;
        [key: string]: unknown;
      };
    }
  | {
      name: "agent/health.summary";
      data: {
        total_agents: number;
        healthy: number;
        degraded: number;
        offline: number;
        divisions?: Record<string, { healthy: number; degraded: number }>;
        pods?: Record<string, { healthy: number; degraded: number; pod_lead_status: string }>;
        unhealthy_supervisors?: string[];
        unhealthy_workers?: string[];
        timestamp: string;
      };
    }
  | {
      name: "agent/health.check";
      data: {
        agent_id: string;
        status: "alive" | "degraded" | "error";
        metrics?: {
          latency_ms?: number;
          memory_entries?: number;
          last_task_at?: string;
        };
      };
    }
  | {
      name: "credential/health.check";
      data: JsonObject;
    }
  | {
      name: "alert/telegram";
      data: {
        channel: "ops" | "executive" | "all";
        message: string;
        priority?: "normal" | "urgent";
        agent_id?: string;
      };
    }
  | {
      name: "book.launch.ready";
      data: {
        book_id: string;
        title: string;
        launch_date: string;
        author?: string;
        description?: string;
      };
    }
  | {
      name: "lead.qualified";
      data: {
        contact_id: string;
        source_division: string;
        lead_score: number;
        metadata?: JsonObject;
      };
    }
  | {
      name: "revenue.milestone";
      data: {
        division: string;
        milestone: string;
        amount: number;
        period: string;
      };
    }
  | {
      name: "ghl/contact.created";
      data: {
        contact_id: string;
        email?: string;
        phone?: string;
        name?: string;
        tags?: string[];
        source?: string;
      };
    }
  | {
      name: "ghl/opportunity.stage_changed";
      data: {
        opportunity_id: string;
        contact_id: string;
        pipeline_id: string;
        old_stage: string;
        new_stage: string;
      };
    }
  | {
      name: "ghl/appointment.scheduled";
      data: {
        appointment_id: string;
        contact_id: string;
        calendar_id: string;
        start_time: string;
        end_time: string;
      };
    }
  | {
      name: "memory/store";
      data: {
        agent_id: string;
        content: string;
        scope: "private" | "division" | "global";
        metadata?: JsonObject;
      };
    }
  | {
      name: "memory/query";
      data: {
        agent_id: string;
        query: string;
        top_k?: number;
        include_shared?: boolean;
      };
    }
  | {
      name: "training.weekly_review";
      data: {
        week?: number;
        initiated_by?: string;
      };
    }
  | {
      name: "training.skill_development";
      data: {
        priority_skills?: string[];
        target_divisions?: string[];
      };
    }
  | {
      name: "training.cross_division";
      data: {
        scenarios?: string[];
        focus_divisions?: string[];
      };
    }
  | {
      name: "training.soul_refinement";
      data: {
        agents_to_refine?: string[];
        auto_apply?: boolean;
      };
    }
  | {
      name: "training.performance_review";
      data: {
        generate_dashboard?: boolean;
        send_notifications?: boolean;
      };
    }
  | {
      name: "training.memory_consolidation";
      data: {
        clear_stale?: boolean;
        retention_days?: number;
      };
    }
  | {
      name: "training.health_check";
      data: {
        full_scan?: boolean;
        notify_on_issues?: boolean;
      };
    }
  | {
      name: "training.division_notification";
      data: {
        type: string;
        week?: number;
        agents_needing_training?: string[];
        log_path?: string;
      };
    }
  | {
      name: "browser/task";
      data: {
        task_type: "screenshot" | "scrape" | "navigate" | "interact" | "upload";
        platform: BrowserPlatform;
        url?: string;
        selectors?: Record<string, string>;
        actions?: Array<{ action: string; target?: string; value?: string }>;
        timeout_ms?: number;
        correlation_id?: string;
      };
    }
  | {
      name: "browser/ghl.screenshot";
      data: {
        account_id?: string;
        page:
          | "dashboard"
          | "contacts"
          | "opportunities"
          | "calendar"
          | "memberships"
          | "workflows";
        notify_telegram?: boolean;
        correlation_id?: string;
      };
    }
  | {
      name: "browser/ghl.membership";
      data: {
        action:
          | "create"
          | "update"
          | "publish"
          | "unpublish"
          | "add_course"
          | "configure_pricing";
        membership_id?: string;
        membership_name?: string;
        description?: string;
        pricing?: {
          type: "free" | "one_time" | "recurring";
          amount?: number;
          interval?: "monthly" | "quarterly" | "yearly";
        };
        course?: {
          name: string;
          description?: string;
          image_url?: string;
        };
        correlation_id?: string;
      };
    }
  | {
      name: "browser/social.post";
      data: {
        platforms: Array<Exclude<BrowserPlatform, "ghl" | "canva">>;
        content: {
          text: string;
          media?: Array<{
            type: "image" | "video";
            url: string;
            alt_text?: string;
          }>;
          hashtags?: string[];
          mentions?: string[];
        };
        schedule_at?: string;
        correlation_id?: string;
      };
    }
  | {
      name: "browser/social.schedule";
      data: {
        platform: Exclude<BrowserPlatform, "ghl" | "canva">;
        content: {
          text: string;
          media_urls?: string[];
        };
        schedule_time: string;
        recurring?: {
          frequency: "daily" | "weekly" | "monthly";
          end_date?: string;
        };
        correlation_id?: string;
      };
    }
  | {
      name: "browser/design.generate";
      data: {
        design_type: "thumbnail" | "social_post" | "banner" | "book_cover" | "membership_card";
        template_id?: string;
        style_preset?: "spiritual-elegant" | "tech-futuristic" | "clean-professional" | "bold-impact";
        elements: {
          title?: string;
          subtitle?: string;
          image_url?: string;
          background_color?: string;
          accent_color?: string;
        };
        dimensions?: { width: number; height: number };
        export_format?: "png" | "jpg" | "webp" | "pdf";
        correlation_id?: string;
      };
    }
  | {
      name: "browser/session.check";
      data: {
        platforms?: BrowserPlatform[];
        reauth_if_expired?: boolean;
        notify_telegram?: boolean;
        correlation_id?: string;
      };
    }
  | {
      name: "browser/session.refresh";
      data: {
        platform: BrowserPlatform;
        force?: boolean;
        correlation_id?: string;
      };
    }
  | {
      name: "saas/client.signup";
      data: {
        saas_instance_id: string;
        client_name: string;
        email: string;
        phone?: string;
        plan_tier: string;
        niche?: string;
        correlation_id?: string;
      };
    }
  | {
      name: "saas/client.churn";
      data: {
        saas_instance_id: string;
        client_id: string;
        location_id: string;
        reason?: string;
        mrr_lost: number;
        correlation_id?: string;
      };
    }
  | {
      name: "saas/payment.failed";
      data: {
        saas_instance_id: string;
        contact_id: string;
        location_id: string;
        amount: number;
        failure_reason: string;
        retry_count: number;
        plan_name?: string;
        correlation_id?: string;
      };
    }
  | {
      name: "saas/payment.received";
      data: {
        saas_instance_id: string;
        contact_id: string;
        location_id: string;
        amount: number;
        plan_name?: string;
        correlation_id?: string;
      };
    }
  | {
      name: "saas/usage.threshold";
      data: {
        saas_instance_id: string;
        location_id: string;
        metric: string;
        current_value: number;
        threshold_value: number;
        percent_used: number;
        correlation_id?: string;
      };
    }
  | {
      name: "saas/funnel.published";
      data: {
        saas_instance_id: string;
        location_id: string;
        funnel_id: string;
        funnel_name: string;
        page_count: number;
        correlation_id?: string;
      };
    }
  | {
      name: "saas/subscription.cancelled";
      data: {
        saas_instance_id: string;
        contact_id: string;
        location_id: string;
        plan_name: string;
        mrr_lost: number;
        correlation_id?: string;
      };
    }
  | {
      name: "meeting/executive.request";
      data: {
        requested_by: string;
        focus_divisions?: string[];
        lookback_days?: number;
      };
    }
  | {
      name: "weekly_meeting.completed";
      data: {
        week_of: string;
        divisions_reported: number;
        total_revenue: number;
        total_leads: number;
      };
    }
  // ── Phase 1: Cross-Business Scope Governor ──────────────────
  | {
      name: "scope/drift.detected";
      data: {
        drift_count: number;
        critical_count: number;
        drifts: Array<{ agent_id: string; field: string; severity: string; [key: string]: unknown }>;
      };
    }
  | {
      name: "scope/violation.attempted";
      data: {
        agent_id: string;
        resource: string;
        operation: string;
        business_id?: string;
        blocked: boolean;
      };
    }
  // ── Phase 1: Self-Healing Integrations ──────────────────────
  | {
      name: "integration/failure.detected";
      data: {
        broken: Array<{ provider: string; reason: string; failure_type: string }>;
        dlq_depth: number;
      };
    }
  | {
      name: "integration/healed";
      data: {
        providers: string[];
        healed_at: string;
      };
    }
  | {
      name: "integration/escalation.needed";
      data: {
        dead_providers: Array<{ provider: string; reason: string; failure_type: string }>;
        dlq_depth: number;
      };
    }
  // ── Phase 1: Autonomous QA & Compliance ────────────────────
  | {
      name: "qa/funnel.published";
      data: {
        location_id: string;
        funnel_id: string;
        funnel_name: string;
        page_count?: number;
        correlation_id?: string;
      };
    }
  | {
      name: "qa/compliance.alert";
      data: {
        location_id: string;
        business_id: string;
        overall_score: number;
        categories: Record<string, { score: number; status: string }>;
      };
    }
  | {
      name: "qa/tracking.broken";
      data: {
        location_id: string;
        broken_params?: string[];
        correlation_id?: string;
      };
    }
  // ── Phase 2: Autonomous Revenue Ops ─────────────────────────
  | {
      name: "revenue/daily.collection";
      data: { date: string };
    }
  | {
      name: "revenue/anomaly.detected";
      data: {
        anomaly_id?: string;
        business_id: string;
        kpi_name: string;
        severity: "warning" | "critical";
        z_score: number;
        current_value: number;
        baseline_avg: number;
      };
    }
  | {
      name: "revenue/playbook.executed";
      data: {
        playbook_id: string;
        business_id: string;
        anomaly_id?: string;
        actions_taken: string[];
      };
    }
  | {
      name: "revenue/briefing.ready";
      data: {
        businesses_collected: number;
        anomalies_found: number;
        date: string;
      };
    }
  // ── Phase 2: Customer Journey Intelligence ──────────────────
  | {
      name: "journey/touchpoint.recorded";
      data: {
        contact_id: string;
        business_id: string;
        event_type: string;
        channel?: string;
        funnel_stage?: string;
        metadata?: Record<string, unknown>;
      };
    }
  | {
      name: "journey/stall.detected";
      data: {
        contact_id: string;
        stalled_at: string;
        days_stalled: number;
      };
    }
  | {
      name: "journey/intent.high";
      data: {
        contact_id: string;
        business_id: string;
        intent_score: number;
        factors: Record<string, number>;
      };
    }
  | {
      name: "journey/next-offer.triggered";
      data: {
        contact_id: string;
        recommendation: {
          recommended_offer_id: string;
          reason: string;
        };
      };
    }
  // ── Phase 2: Executive Command Center ───────────────────────
  | {
      name: "command-center/daily.briefing";
      data: { date: string };
    }
  | {
      name: "command-center/weekly.digest";
      data: { week: string };
    }
  | {
      name: "command-center/alert.critical";
      data: {
        source: string;
        message: string;
        severity: "critical";
      };
    }
  // ── Phase 3: Native GHL Build / Refactor ─────────────────────
  | {
      name: "ghl-build/create.requested";
      data: {
        business_id: string;
        entity_type: "funnel" | "workflow" | "payment_link";
        template?: string;
        config: Record<string, unknown>;
      };
    }
  | {
      name: "ghl-build/snapshot.created";
      data: {
        location_id: string;
        entity_type: string;
        entity_id: string;
        agent_id: string;
      };
    }
  | {
      name: "ghl-build/rollback.requested";
      data: {
        snapshot_id: string;
        current_snapshot_id?: string;
        reason: string;
      };
    }
  // ── Phase 3: Experiment Engine ──────────────────────────────
  | {
      name: "experiment/created";
      data: {
        business_id: string;
        name: string;
        type: "offer" | "copy" | "page" | "automation" | "prompt";
        variants?: string[];
        success_metric: string;
        min_sample?: number;
        variant_labels?: Record<string, string>;
        variant_configs?: Record<string, Record<string, unknown>>;
        traffic_split?: Record<string, number>;
        max_duration_days?: number;
      };
    }
  | {
      name: "experiment/evaluation.scheduled";
      data: { date: string };
    }
  | {
      name: "experiment/significant";
      data: {
        experiment_id: string;
        winner_variant: string;
        significance: string;
        z_score: number;
      };
    }
  | {
      name: "experiment/promoted";
      data: {
        experiment_id: string;
      };
    }
  // ── Phase 3: Content-to-Campaign Factory ────────────────────
  | {
      name: "campaign/idea.submitted";
      data: {
        business_id: string;
        core_idea: string;
        channels?: string[];
      };
    }
  | {
      name: "campaign/bundle.ready";
      data: {
        campaign_id: string;
        business_id: string;
        total_assets: number;
        compliant: boolean;
      };
    }
  | {
      name: "campaign/approved";
      data: {
        campaign_id: string;
        assets?: Array<{ id: string; channel: string; content: Record<string, unknown> }>;
        calendar?: Record<string, unknown>;
      };
    }
  | {
      name: "campaign/performance.collect";
      data: { date: string };
    }
  // ── Phase 3: Offer Engineering ──────────────────────────────
  | {
      name: "offer/analysis.scheduled";
      data: { date: string };
    }
  | {
      name: "offer/optimization.suggested";
      data: {
        total_recommendations: number;
        businesses_with_recommendations: number;
      };
    }
  | {
      name: "offer/performance.collected";
      data: { date: string };
    }
  // ── Self-Healing & Advanced Coding ──────────────────────────
  | {
      name: "healing/run.requested";
      data: {
        logs: Array<{ source: string; message: string; stack?: string; timestamp?: string }>;
        model?: string;
      };
    }
  | {
      name: "healing/run.completed";
      data: {
        run_id: string;
        patches_applied: number;
        patches_skipped: number;
        clusters_found: number;
        escalations: number;
      };
    }
  | {
      name: "healing/escalation.needed";
      data: {
        run_id?: string;
        escalations?: string[];
        source?: string;
        escalated?: string[];
        overall?: string;
      };
    }
  | {
      name: "healing/integration.health_check";
      data: {
        triggered_by?: string;
      };
    }
  | {
      name: "ci/run.failed";
      data: {
        owner: string;
        repo: string;
        branch?: string;
        run_id?: number;
      };
    };

export const inngest = new Inngest({
  id: "truth-j-blue-agents",
  schemas: new EventSchemas().fromUnion<OpenClawEvent>(),
});

export const DIVISION_HEADS: Record<string, string> = {
  division_1_core_operations: "d1_ceo",
  division_2_ecommerce: "d2_director",
  division_3_consulting: "d3_ceo",
  division_4_coaching: "d4_cvo",
  division_5_publishing: "d5_publisher",
  division_6_nonprofit: "d6_executive_director",
  division_7_shared_services: "shared_exec_orchestrator",
  division_8_saas_operations: "d8_saas_director",
  division_9_online_store: "d9_store_director",
};

export function getDivisionHead(division: string): string {
  return DIVISION_HEADS[division] || "shared_exec_orchestrator";
}

export const POD_LEADS: Record<string, string> = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => {
    const podId = `biz_${String(index + 1).padStart(2, "0")}`;
    return [podId, `${podId}_pod_lead`];
  }),
);

export function getPodLead(podId: string): string | null {
  return POD_LEADS[podId] || null;
}

export const LLM_MODELS = {
  "claude-opus-4": {
    provider: "anthropic",
    model: "claude-opus-4-20250514",
    tier: "strategic",
  },
  "claude-sonnet-4.5": {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250514",
    tier: "content",
  },
  "claude-haiku-4-5": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    tier: "routine",
  },
} as const;

export type LLMModelKey = keyof typeof LLM_MODELS;
