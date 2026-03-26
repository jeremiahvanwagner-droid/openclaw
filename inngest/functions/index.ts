/**
 * Inngest Functions Index
 * Open Claw Multi-Agent Network
 *
 * Exports all Inngest functions for registration with the serve handler.
 */

export { inngest } from "../client";

// Agent orchestration functions
export {
  agentInvoke,
  agentEscalate,
  agentHealthCheck,
  telegramAlert,
  bookLaunchReady,
  functions,
} from "./agent-orchestrator";

// Training protocol functions
export {
  trainingWeeklyReview,
  trainingSkillDevelopment,
  trainingCrossDivision,
  trainingSoulRefinement,
  trainingPerformanceReview,
  trainingMemoryConsolidation,
  trainingHealthCheck,
} from "./training-protocol";

// Division 8 — SaaS Operations event handlers
export {
  saasClientSignup,
  saasPaymentFailed,
  saasPaymentReceived,
  saasClientChurn,
  saasSubscriptionCancelled,
  saasUsageThreshold,
  saasFunnelPublished,
  d8Functions,
} from "./d8-saas-operations";

// Phase 1 — Foundation Skills
export {
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
  phase1Functions,
} from "./phase1-foundation";

// Phase 2 — Intelligence Skills
export {
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
  phase2Functions,
} from "./phase2-intelligence";

// Phase 3 — Execution Skills
export {
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
  phase3Functions,
} from "./phase3-execution";

// Self-Healing & Advanced Coding
export {
  selfHealingScheduled,
  selfHealingOnDemand,
  supervisorIntegrationCheck,
  healingEscalationHandler,
  ciAutoFix,
  ciDailyCheck,
  selfHealingCodingFunctions,
} from "./self-healing-coding";
