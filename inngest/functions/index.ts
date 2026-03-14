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
