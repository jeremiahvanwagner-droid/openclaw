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
import {
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
} from "./functions/phase2-intelligence";
import {
  ghlBuildCreateRequested,
  ghlSnapshotCreated,
  ghlRollbackRequested,
  experimentCreated,
  experimentEvaluationScheduled,
  experimentSignificant,
  experimentPromoted,
  campaignIdeaSubmitted,
  campaignBundleReady,
  campaignApproved,
  campaignPerformanceCollect,
  offerAnalysisScheduled,
  offerOptimizationSuggested,
  offerPerformanceCollected,
} from "./functions/phase3-execution";
import { selfHealingCodingFunctions } from "./functions/self-healing-coding";

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
    // Phase 2: Intelligence Skills
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
    // Phase 3: Execution Skills
    ghlBuildCreateRequested,
    ghlSnapshotCreated,
    ghlRollbackRequested,
    experimentCreated,
    experimentEvaluationScheduled,
    experimentSignificant,
    experimentPromoted,
    campaignIdeaSubmitted,
    campaignBundleReady,
    campaignApproved,
    campaignPerformanceCollect,
    offerAnalysisScheduled,
    offerOptimizationSuggested,
    offerPerformanceCollected,
    // Self-Healing: CI auto-fix, integration checks, escalation, cron & on-demand triggers
    ...selfHealingCodingFunctions,
  ],
});
