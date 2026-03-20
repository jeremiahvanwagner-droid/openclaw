// @ts-expect-error - runtime implementation lives in the adjacent .mjs module.
import * as runtime from "./security-governance.mjs";

export interface CapabilityPolicy {
  allowed_tools: string[];
  allowed_channels: string[];
  allowed_action_families: string[];
  requires_hitl_for: string[];
}

export interface SkillRegistryEntry {
  skill_id: string;
  owner: string;
  risk_tier: "read_only" | "draft_only" | "write_safe" | "irreversible";
  side_effects: string[];
  external_systems: string[];
  idempotency_key_strategy: string;
  approval_policy: string;
  replay_policy: string;
  required_tests: string[];
}

export const loadAgentsConfig = runtime.loadAgentsConfig as () => Promise<Record<string, unknown> | null>;
export const loadRuntimeConfig = runtime.loadRuntimeConfig as () => Promise<Record<string, unknown> | null>;
export const loadSkillRegistry = runtime.loadSkillRegistry as () => Promise<{
  version: string;
  enforcement_defaults: Record<string, unknown>;
  skills: SkillRegistryEntry[];
}>;
export const getAgentCapabilityPolicy = runtime.getAgentCapabilityPolicy as (
  agentId: string,
) => Promise<CapabilityPolicy | null>;
export const getCapabilityEnforcementMode = runtime.getCapabilityEnforcementMode as (
  config?: Record<string, unknown> | null,
) => "off" | "warn" | "fail";
export const getSkillRegistryEnforcementMode =
  runtime.getSkillRegistryEnforcementMode as (
    registry?: Record<string, unknown> | null,
  ) => "off" | "warn" | "fail";
export const enforceAgentCapability = runtime.enforceAgentCapability as (options: {
  agentId: string;
  channel?: string;
  actionFamily?: string | null;
  tool?: string;
  correlationId?: string | null;
  targetAgent?: string | null;
  metadata?: Record<string, unknown>;
}) => Promise<{ allowed: boolean; mode: string; policy?: CapabilityPolicy }>;
export const inferCallingSkillId = runtime.inferCallingSkillId as (
  stack?: string,
) => string | null;
export const getSkillRegistryEntry = runtime.getSkillRegistryEntry as (
  skillId: string,
) => Promise<SkillRegistryEntry | null>;
export const enforceSkillRegistry = runtime.enforceSkillRegistry as (options: {
  skillId?: string | null;
  externalSystem?: string;
  operation?: string;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}) => Promise<{ allowed: boolean; mode: string; skillId?: string | null; entry?: SkillRegistryEntry }>;
export const getGovernanceSummary = runtime.getGovernanceSummary as () => Promise<{
  generated_at: string;
  capability_mode: string;
  skill_registry_mode: string;
  agents: Array<{
    agent_id: string;
    display_name: string;
    org_unit: string;
    capability_policy: CapabilityPolicy | null;
  }>;
  skills: SkillRegistryEntry[];
}>;
