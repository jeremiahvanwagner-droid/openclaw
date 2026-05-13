/**
 * Division 8 SaaS Operations — Inngest Event Handlers
 * Routes SaaS-specific events to Division 8 agents.
 */

import { inngest } from "../client";
import { supabase } from "../../lib/agent-memory.js";

// Supabase singleton is imported from agent-memory.js

// ═══════════════════════════════════════════════════════════════════
// NEW SAAS CLIENT SIGNUP
// Triggers: subaccount provisioning → snapshot deploy → CRM setup
// ═══════════════════════════════════════════════════════════════════
export const saasClientSignup = inngest.createFunction(
  { id: "saas-client-signup", name: "SaaS Client Signup Handler", retries: 3, idempotency: "event.id", triggers: [{ event: "saas/client.signup" }] },
  async ({ event, step }) => {
    const { saas_instance_id, client_name, email, phone, plan_tier, niche, correlation_id } = event.data;
    const corrId = correlation_id || `signup_${Date.now()}`;

    // Log event
    await step.run("log-signup", async () => {
      await supabase.from("agent_events").insert({
        event_name: "saas/client.signup",
        source_agent: "system",
        target_agent: "d8_platform_architect",
        payload: event.data,
        priority: "high",
        correlation_id: corrId,
      });
    });

    // ── Saga Step 1: Provision sub-account ──────────────────────
    // On failure → stop entirely (no resources to clean up yet)
    let provisionResult: { provisioned: boolean };
    try {
      provisionResult = await step.run("provision-subaccount", async () => {
        await supabase.from("agent_events").insert({
          event_name: "saga/step",
          source_agent: "saas_event_handler",
          target_agent: "d8_platform_architect",
          payload: { step: "provision", saas_instance_id, plan_tier },
          priority: "high",
          correlation_id: corrId,
        });
        return { provisioned: true };
      });

      await step.sendEvent("send-provision-task", {
        name: "agent/d8_platform_architect/task",
        data: {
          type: "provision_new_client",
          source: "saas_event_handler",
          correlation_id: corrId,
          saas_instance_id,
          client_name,
          email,
          phone,
          plan_tier,
          niche,
        },
      });
    } catch (err) {
      // Step 1 failed — nothing to roll back
      await step.run("log-provision-failure", async () => {
        await supabase.from("agent_events").insert({
          event_name: "saga/failure",
          source_agent: "saas_event_handler",
          payload: { step: "provision", saas_instance_id, error: String(err) },
          priority: "critical",
          correlation_id: corrId,
        });
      });
      return { success: false, failed_step: "provision", saas_instance_id };
    }

    // ── Saga Step 2: Create CRM contact ─────────────────────────
    // On failure → rollback subaccount provisioning
    try {
      await step.run("create-crm-contact", async () => {
        await supabase.from("agent_events").insert({
          event_name: "saga/step",
          source_agent: "saas_event_handler",
          target_agent: "d8_crm_ops",
          payload: { step: "crm_contact", saas_instance_id },
          priority: "high",
          correlation_id: corrId,
        });
      });

      await step.sendEvent("send-crm-task", {
        name: "agent/d8_crm_ops/task",
        data: {
          type: "create_saas_client_contact",
          source: "saas_event_handler",
          correlation_id: corrId,
          saas_instance_id,
          client_name,
          email,
          phone,
          tags: ["saas_client", `plan_${plan_tier}`, `niche_${niche || "general"}`],
        },
      });
    } catch (err) {
      // Compensate: rollback subaccount
      await step.sendEvent("rollback-subaccount", {
        name: "agent/d8_platform_architect/task",
        data: {
          type: "rollback_provision",
          source: "saas_event_handler",
          correlation_id: corrId,
          saas_instance_id,
          reason: `CRM contact creation failed: ${String(err)}`,
        },
      });

      await step.run("log-crm-failure", async () => {
        await supabase.from("agent_events").insert({
          event_name: "saga/compensation",
          source_agent: "saas_event_handler",
          payload: { step: "crm_contact", compensated: "provision", saas_instance_id, error: String(err) },
          priority: "critical",
          correlation_id: corrId,
        });
      });

      return { success: false, failed_step: "crm_contact", compensated: true, saas_instance_id };
    }

    // ── Saga Step 3: Notify director (non-critical) ─────────────
    // On failure → log warning only, don't rollback
    try {
      await step.sendEvent("notify-director", {
        name: "agent/d8_saas_director/task",
        data: {
          type: "new_client_notification",
          source: "saas_event_handler",
          saas_instance_id,
          client_name,
          plan_tier,
        },
      });
    } catch (err) {
      // Non-critical — log and continue
      await step.run("log-notify-warning", async () => {
        await supabase.from("agent_events").insert({
          event_name: "saga/warning",
          source_agent: "saas_event_handler",
          payload: { step: "notify_director", saas_instance_id, error: String(err) },
          priority: "normal",
          correlation_id: corrId,
        });
      });
    }

    return { success: true, client_name, plan_tier, saas_instance_id };
  }
);

// ═══════════════════════════════════════════════════════════════════
// PAYMENT FAILED
// Triggers dunning sequence via d8_revenue_ops
// ═══════════════════════════════════════════════════════════════════
export const saasPaymentFailed = inngest.createFunction(
  { id: "saas-payment-failed", name: "SaaS Payment Failed Handler", retries: 2, idempotency: "event.id", triggers: [{ event: "saas/payment.failed" }] },
  async ({ event, step }) => {
    const { saas_instance_id, contact_id, location_id, amount, failure_reason, retry_count, plan_name, correlation_id } = event.data;

    await step.run("log-payment-failure", async () => {
      await supabase.from("agent_events").insert({
        event_name: "saas/payment.failed",
        source_agent: "system",
        target_agent: "d8_revenue_ops",
        payload: event.data,
        priority: "critical",
        correlation_id,
      });
    });

    // Route to revenue ops for dunning
    await step.sendEvent("start-dunning", {
      name: "agent/d8_revenue_ops/task",
      data: {
        type: "start_dunning_sequence",
        source: "saas_event_handler",
        correlation_id: correlation_id || `payment_fail_${Date.now()}`,
        saas_instance_id,
        contact_id,
        location_id,
        amount,
        failure_reason,
        retry_count,
        plan_name,
      },
    });

    // Alert director on critical amounts
    if (amount >= 500 || retry_count >= 3) {
      await step.sendEvent("alert-director-payment", {
        name: "alert/telegram",
        data: {
          channel: "executive",
          message: `⚠️ Payment failure: $${amount} from contact ${contact_id} (${failure_reason}, retry #${retry_count})`,
          priority: "urgent",
          agent_id: "d8_revenue_ops",
        },
      });
    }

    return { success: true, contact_id, amount, dunning_started: true };
  }
);

// ═══════════════════════════════════════════════════════════════════
// PAYMENT RECEIVED (dunning recovery or normal payment)
// ═══════════════════════════════════════════════════════════════════
export const saasPaymentReceived = inngest.createFunction(
  { id: "saas-payment-received", name: "SaaS Payment Received Handler", retries: 2, idempotency: "event.id", triggers: [{ event: "saas/payment.received" }] },
  async ({ event, step }) => {
    const { saas_instance_id, contact_id, location_id, amount, correlation_id } = event.data;

    // Cancel any active dunning
    await step.sendEvent("cancel-dunning", {
      name: "agent/d8_revenue_ops/task",
      data: {
        type: "cancel_dunning_sequence",
        source: "saas_event_handler",
        correlation_id: correlation_id || `payment_recv_${Date.now()}`,
        saas_instance_id,
        contact_id,
        location_id,
        amount,
      },
    });

    return { success: true, contact_id, amount };
  }
);

// ═══════════════════════════════════════════════════════════════════
// CLIENT CHURN
// Triggers win-back campaign + data archival
// ═══════════════════════════════════════════════════════════════════
export const saasClientChurn = inngest.createFunction(
  { id: "saas-client-churn", name: "SaaS Client Churn Handler", retries: 2, idempotency: "event.id", triggers: [{ event: "saas/client.churn" }] },
  async ({ event, step }) => {
    const { saas_instance_id, client_id, location_id, reason, mrr_lost, correlation_id } = event.data;

    await step.run("log-churn", async () => {
      await supabase.from("agent_events").insert({
        event_name: "saas/client.churn",
        source_agent: "system",
        target_agent: "d8_customer_success",
        payload: event.data,
        priority: "high",
        correlation_id,
      });
    });

    // Win-back via customer success
    await step.sendEvent("start-winback", {
      name: "agent/d8_customer_success/task",
      data: {
        type: "churn_winback",
        source: "saas_event_handler",
        correlation_id: correlation_id || `churn_${Date.now()}`,
        saas_instance_id,
        client_id,
        location_id,
        reason,
        mrr_lost,
      },
    });

    // Revenue cleanup
    await step.sendEvent("billing-cleanup", {
      name: "agent/d8_revenue_ops/task",
      data: {
        type: "churn_billing_cleanup",
        source: "saas_event_handler",
        correlation_id: correlation_id || `churn_${Date.now()}`,
        saas_instance_id,
        client_id,
        location_id,
      },
    });

    // Director alert
    await step.sendEvent("alert-churn", {
      name: "alert/telegram",
      data: {
        channel: "executive",
        message: `📉 Client churned: ${client_id} — MRR lost: $${mrr_lost} — Reason: ${reason || "unknown"}`,
        priority: "urgent",
        agent_id: "d8_saas_director",
      },
    });

    return { success: true, client_id, mrr_lost, winback_started: true };
  }
);

// ═══════════════════════════════════════════════════════════════════
// SUBSCRIPTION CANCELLED
// ═══════════════════════════════════════════════════════════════════
export const saasSubscriptionCancelled = inngest.createFunction(
  { id: "saas-subscription-cancelled", name: "SaaS Subscription Cancelled", retries: 2, idempotency: "event.id", triggers: [{ event: "saas/subscription.cancelled" }] },
  async ({ event, step }) => {
    const { saas_instance_id, contact_id, location_id, plan_name, mrr_lost, correlation_id } = event.data;

    // Customer success handles win-back
    await step.sendEvent("subscription-winback", {
      name: "agent/d8_customer_success/task",
      data: {
        type: "subscription_cancelled_winback",
        source: "saas_event_handler",
        correlation_id: correlation_id || `sub_cancel_${Date.now()}`,
        saas_instance_id,
        contact_id,
        location_id,
        plan_name,
        mrr_lost,
      },
    });

    // Revenue ops cleanup
    await step.sendEvent("subscription-billing-cleanup", {
      name: "agent/d8_revenue_ops/task",
      data: {
        type: "subscription_cancelled_cleanup",
        source: "saas_event_handler",
        saas_instance_id,
        contact_id,
        location_id,
        plan_name,
      },
    });

    return { success: true, contact_id, plan_name, mrr_lost };
  }
);

// ═══════════════════════════════════════════════════════════════════
// USAGE THRESHOLD REACHED
// Triggers upsell via marketing automation
// ═══════════════════════════════════════════════════════════════════
export const saasUsageThreshold = inngest.createFunction(
  { id: "saas-usage-threshold", name: "SaaS Usage Threshold Handler", retries: 1, idempotency: "event.id", triggers: [{ event: "saas/usage.threshold" }] },
  async ({ event, step }) => {
    const { saas_instance_id, location_id, metric, current_value, threshold_value, percent_used, correlation_id } = event.data;

    // Marketing handles upsell
    await step.sendEvent("trigger-upsell", {
      name: "agent/d8_marketing_automation/task",
      data: {
        type: "usage_upsell_campaign",
        source: "saas_event_handler",
        correlation_id: correlation_id || `usage_${Date.now()}`,
        saas_instance_id,
        location_id,
        metric,
        current_value,
        threshold_value,
        percent_used,
      },
    });

    return { success: true, location_id, metric, percent_used };
  }
);

// ═══════════════════════════════════════════════════════════════════
// FUNNEL PUBLISHED
// Triggers QA checks via compliance auditor
// ═══════════════════════════════════════════════════════════════════
export const saasFunnelPublished = inngest.createFunction(
  { id: "saas-funnel-published", name: "SaaS Funnel Published Handler", retries: 1, idempotency: "event.id", triggers: [{ event: "saas/funnel.published" }] },
  async ({ event, step }) => {
    const { saas_instance_id, location_id, funnel_id, funnel_name, correlation_id } = event.data;

    // Compliance check
    await step.sendEvent("qa-funnel", {
      name: "agent/d8_compliance_auditor/task",
      data: {
        type: "funnel_qa_check",
        source: "saas_event_handler",
        correlation_id: correlation_id || `funnel_${Date.now()}`,
        saas_instance_id,
        location_id,
        funnel_id,
        funnel_name,
      },
    });

    return { success: true, funnel_id, funnel_name };
  }
);

// Export all Division 8 functions
export const d8Functions = [
  saasClientSignup,
  saasPaymentFailed,
  saasPaymentReceived,
  saasClientChurn,
  saasSubscriptionCancelled,
  saasUsageThreshold,
  saasFunnelPublished,
];
