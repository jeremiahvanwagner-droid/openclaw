/**
 * Inngest Serve Handler
 * Open Claw Multi-Agent Network
 *
 * Creates an Express-compatible serve handler for all Inngest functions.
 * Mount at /api/inngest in your Express app.
 */

import { serve } from "inngest/express";
import { inngest } from "./client";
import {
  agentInvoke,
  agentEscalate,
  agentHealthCheck,
  telegramAlert,
  podQuarantine,
  podRestore,
  credentialHealthCheck,
  bookLaunchReady,
} from "./functions/agent-orchestrator";
import {
  trainingWeeklyReview,
  trainingSkillDevelopment,
  trainingCrossDivision,
  trainingSoulRefinement,
  trainingPerformanceReview,
  trainingMemoryConsolidation,
  trainingHealthCheck,
} from "./functions/training-protocol";
import {
  saasClientSignup,
  saasPaymentFailed,
  saasPaymentReceived,
  saasClientChurn,
  saasSubscriptionCancelled,
  saasUsageThreshold,
  saasFunnelPublished,
} from "./functions/d8-saas-operations";
import {
  weeklyInterDivisionMeeting,
  onDemandMeeting,
} from "./functions/weekly-meeting";
import {
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
} from "./functions/phase1-foundation";

export const handler = serve({
  client: inngest,
  functions: [
    agentInvoke,
    agentEscalate,
    agentHealthCheck,
    telegramAlert,
    podQuarantine,
    podRestore,
    credentialHealthCheck,
    bookLaunchReady,
    trainingWeeklyReview,
    trainingSkillDevelopment,
    trainingCrossDivision,
    trainingSoulRefinement,
    trainingPerformanceReview,
    trainingMemoryConsolidation,
    trainingHealthCheck,
    saasClientSignup,
    saasPaymentFailed,
    saasPaymentReceived,
    saasClientChurn,
    saasSubscriptionCancelled,
    saasUsageThreshold,
    saasFunnelPublished,
    weeklyInterDivisionMeeting,
    onDemandMeeting,
    // Phase 1: Foundation Skills
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
  ],
});
