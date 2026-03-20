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
  "gpt-4o-mini": {
    provider: "openai",
    model: "gpt-4o-mini",
    tier: "routine",
  },
} as const;

export type LLMModelKey = keyof typeof LLM_MODELS;
