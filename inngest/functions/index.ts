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
