/**
 * Division 8 SaaS Operations — Inngest Event Handlers
 * Routes SaaS-specific events to Division 8 agents.
 */

import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ═══════════════════════════════════════════════════════════════════
// NEW SAAS CLIENT SIGNUP
// Triggers: subaccount provisioning → snapshot deploy → CRM setup
// ═══════════════════════════════════════════════════════════════════
export const saasClientSignup = inngest.createFunction(
  { id: "saas-client-signup", name: "SaaS Client Signup Handler", retries: 3 },
  { event: "saas/client.signup" },
  async ({ event, step }) => {
    const { saas_instance_id, client_name, email, phone, plan_tier, niche, correlation_id } = event.data;

    // Log event
    await step.run("log-signup", async () => {
      await supabase.from("agent_events").insert({
        event_name: "saas/client.signup",
        source_agent: "system",
        target_agent: "d8_platform_architect",
        payload: event.data,
        priority: "high",
        correlation_id,
      });
    });

    // Step 1: Provision sub-account via d8_platform_architect
    await step.sendEvent("provision-subaccount", {
      name: "agent/d8_platform_architect/task",
      data: {
        type: "provision_new_client",
        source: "saas_event_handler",
        correlation_id: correlation_id || `signup_${Date.now()}`,
        saas_instance_id,
        client_name,
        email,
        phone,
        plan_tier,
        niche,
      },
    });

    // Step 2: Create CRM contact
    await step.sendEvent("create-crm-contact", {
      name: "agent/d8_crm_ops/task",
      data: {
        type: "create_saas_client_contact",
        source: "saas_event_handler",
        correlation_id: correlation_id || `signup_${Date.now()}`,
        saas_instance_id,
        client_name,
        email,
        phone,
        tags: ["saas_client", `plan_${plan_tier}`, `niche_${niche || "general"}`],
      },
    });

    // Step 3: Notify director
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

    return { success: true, client_name, plan_tier, saas_instance_id };
  }
);

// ═══════════════════════════════════════════════════════════════════
// PAYMENT FAILED
// Triggers dunning sequence via d8_revenue_ops
// ═══════════════════════════════════════════════════════════════════
export const saasPaymentFailed = inngest.createFunction(
  { id: "saas-payment-failed", name: "SaaS Payment Failed Handler", retries: 2 },
  { event: "saas/payment.failed" },
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
  { id: "saas-payment-received", name: "SaaS Payment Received Handler", retries: 2 },
  { event: "saas/payment.received" },
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
  { id: "saas-client-churn", name: "SaaS Client Churn Handler", retries: 2 },
  { event: "saas/client.churn" },
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
  { id: "saas-subscription-cancelled", name: "SaaS Subscription Cancelled", retries: 2 },
  { event: "saas/subscription.cancelled" },
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
  { id: "saas-usage-threshold", name: "SaaS Usage Threshold Handler", retries: 1 },
  { event: "saas/usage.threshold" },
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
  { id: "saas-funnel-published", name: "SaaS Funnel Published Handler", retries: 1 },
  { event: "saas/funnel.published" },
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
