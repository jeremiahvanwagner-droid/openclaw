/**
 * skill-interface.ts
 * OpenClaw Multi-Agent Network — Skill Interface Contract
 *
 * Fixes audit finding ARCH-04: "Skills Have No Interface Contract"
 *
 * Problem:
 *   116 skill files exist with no shared interface, type definition, or base class.
 *   Some are 3-4 line stubs that redirect to another file. No validation that a
 *   skill conforms to expected input/output shape. No dependency declaration or
 *   version pinning. This makes it impossible to:
 *     - Validate skill files programmatically at load time
 *     - Enumerate available skills and their capabilities from the gateway
 *     - Test skills in isolation without running the full agent
 *     - Generate documentation or capability manifests automatically
 *
 * Solution:
 *   This file defines the canonical TypeScript interfaces that all skills must
 *   implement. Skills are discovered and validated at runtime by the skill loader
 *   in handlers/ghl-webhook-handler.mjs. If a skill module's default export does
 *   not conform to the Skill interface, it is rejected at load time with a clear
 *   error message.
 *
 * Place this file at: lib/skill-interface.ts
 * Import in skill loader: import type { Skill, SkillManifest } from '../lib/skill-interface';
 */

// ─────────────────────────────────────────────────────────────────────────────
// SKILL MANIFEST
// Describes the skill's identity, capabilities, and requirements.
// The manifest is static metadata — it should not change at runtime.
// ─────────────────────────────────────────────────────────────────────────────

export type SkillCategory =
  | 'crm'          // GoHighLevel contact/opportunity management
  | 'content'      // Content generation, social media, publishing
  | 'analytics'    // Reporting, metrics, business intelligence
  | 'automation'   // Workflow triggers, scheduled tasks, event handlers
  | 'integration'  // Third-party API connections (Stripe, Mailchimp, etc.)
  | 'compliance'   // Legal, privacy, audit, regulatory
  | 'platform';    // Internal OpenClaw operations (agent management, memory, etc.)

export interface SkillManifest {
  /**
   * Unique identifier for this skill. Must be stable across deployments.
   * Convention: kebab-case, prefixed by category (e.g., "crm-contact-create")
   */
  id: string;

  /**
   * Semantic version string (MAJOR.MINOR.PATCH).
   * Increment MAJOR for breaking input/output schema changes.
   * Increment MINOR for new optional fields.
   * Increment PATCH for bug fixes.
   */
  version: string;

  /** Human-readable name shown in the dashboard and logs */
  displayName: string;

  /** One-sentence description of what this skill does */
  description: string;

  /** Primary functional category */
  category: SkillCategory;

  /**
   * External tool IDs this skill requires (e.g., 'ghl', 'stripe', 'openai').
   * The skill loader checks that all required tools are configured before
   * allowing the skill to be invoked.
   */
  requiredTools: string[];

  /**
   * JSON Schema (draft-07 compatible) describing the expected input shape.
   * Used for validation before execute() is called.
   * Minimal example: { type: 'object', properties: { contactId: { type: 'string' } }, required: ['contactId'] }
   */
  inputSchema: Record<string, unknown>;

  /**
   * JSON Schema describing the expected output shape.
   * Used to validate execute() return values and for documentation.
   */
  outputSchema: Record<string, unknown>;

  /**
   * IDs of other skills this skill depends on (for dependency resolution).
   * The skill loader will refuse to invoke a skill whose dependencies are unavailable.
   * Leave empty [] if this skill has no dependencies.
   */
  dependencies: string[];

  /**
   * Permission strings required to invoke this skill.
   * Checked against the invoking agent's permission set.
   * Examples: 'ghl:contacts:write', 'billing:read', 'agent:quarantine'
   */
  requiredPermissions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL CONTEXT
// Injected by the runtime when execute() is called. Provides all services
// the skill needs without tightly coupling the skill to specific implementations.
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillContext {
  /** ID of the agent invoking this skill */
  agentId: string;

  /** Division this agent belongs to (e.g., 'division_1_core_operations') */
  divisionId: string;

  /** Pod ID if this agent is part of a SaaS pod */
  podId?: string;

  /** GHL location/business ID for the current tenant */
  businessId?: string;

  /**
   * Trace correlation ID — propagated from the triggering event.
   * All Supabase writes, LLM calls, and API calls made during this skill
   * execution should include this ID for distributed tracing.
   */
  correlationId: string;

  /** Memory access — query and store in the agent memory system */
  memory: {
    /**
     * Semantic search over agent memory.
     * @param text   Natural language query
     * @param scope  'private' = this agent only, 'division' = division-wide,
     *               'global' = all agents (use sparingly)
     * @returns      Array of memory entries ranked by similarity
     */
    query: (text: string, scope?: 'private' | 'division' | 'global') => Promise<MemoryEntry[]>;

    /**
     * Store a new memory entry.
     * @param content  Text content to embed and store
     * @param scope    Visibility scope for the memory
     * @param metadata Optional key-value metadata attached to the entry
     */
    store: (
      content: string,
      scope: 'private' | 'division' | 'global',
      metadata?: Record<string, unknown>
    ) => Promise<void>;
  };

  /** LLM access — call language models and generate embeddings */
  llm: {
    /**
     * Run a chat completion.
     * @param model    Model key from LLM_MODELS in inngest/client.ts
     *                 (e.g., 'claude-opus-4', 'gpt-4o-mini')
     * @param messages OpenAI/Anthropic-compatible messages array
     * @returns        Completion response object
     */
    complete: (model: string, messages: LLMMessage[]) => Promise<LLMResponse>;

    /**
     * Generate a 512-dimension embedding for the given text.
     * Uses the provider configured in lib/llm-router.ts.
     */
    embed: (text: string) => Promise<number[]>;
  };

  /** External API access */
  api: {
    /**
     * Make a GoHighLevel API request.
     * Automatically handles auth, retries, and rate limiting via api-rate-governor.
     * @param endpoint  GHL API path (e.g., '/contacts/{contactId}')
     * @param method    HTTP method (default: 'GET')
     * @param body      Request body for POST/PUT/PATCH
     */
    ghl: (endpoint: string, method?: string, body?: unknown) => Promise<unknown>;

    /**
     * Access the shared Supabase client (service_role).
     * Returns the singleton from lib/supabase-singleton.ts.
     * Use this for reading/writing to OpenClaw tables (agent_events, agent_memory, etc.)
     */
    supabase: () => import('@supabase/supabase-js').SupabaseClient;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTING TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  agentId: string;
  content: string;
  scope: 'private' | 'division' | 'global';
  similarity: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface HealthCheckResult {
  healthy: boolean;
  message?: string;
  /** Milliseconds taken to complete the check */
  latencyMs?: number;
  /** Additional diagnostic detail */
  detail?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL INTERFACE
// The contract that every skill module's default export must satisfy.
// ─────────────────────────────────────────────────────────────────────────────

export interface Skill {
  /**
   * Static manifest describing this skill.
   * Loaded by the skill loader at startup — must be synchronously accessible.
   */
  manifest: SkillManifest;

  /**
   * Execute the skill's primary function.
   *
   * @param context  Runtime context injected by the skill loader
   * @param input    Input data (should conform to manifest.inputSchema)
   * @returns        Output data (should conform to manifest.outputSchema)
   *
   * Skills should be idempotent when possible — if the skill is retried
   * with the same input and correlationId, it should not duplicate side effects.
   */
  execute: (
    context: SkillContext,
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;

  /**
   * Validate the input before execute() is called.
   * Optional — if not provided, the skill loader performs JSON Schema validation
   * using manifest.inputSchema. Implement this for custom validation logic.
   *
   * @param input  Raw input to validate
   * @returns      { valid: true } or { valid: false, errors: ['...'] }
   */
  validate?: (input: Record<string, unknown>) => ValidationResult;

  /**
   * Check that the skill's external dependencies are healthy.
   * Called by the health check cron and before critical invocations.
   *
   * @param context  Runtime context (for API access)
   * @returns        { healthy: true } or { healthy: false, message: '...' }
   */
  healthCheck?: (context: SkillContext) => Promise<HealthCheckResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME VALIDATION HELPER
// Use in the skill loader to verify a loaded module conforms to this interface.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard that verifies a module export is a valid Skill.
 * Checks for the presence of required properties and their types.
 *
 * @example
 * const mod = await import(skillPath);
 * if (!isValidSkill(mod.default)) {
 *   log.warn({ path: skillPath }, 'Skill does not implement Skill interface — skipping');
 *   return null;
 * }
 * return mod.default as Skill;
 */
export function isValidSkill(candidate: unknown): candidate is Skill {
  if (!candidate || typeof candidate !== 'object') return false;
  const s = candidate as Record<string, unknown>;

  // Check manifest
  if (!s.manifest || typeof s.manifest !== 'object') return false;
  const m = s.manifest as Record<string, unknown>;
  if (typeof m.id !== 'string' || !m.id) return false;
  if (typeof m.version !== 'string' || !m.version) return false;
  if (typeof m.displayName !== 'string' || !m.displayName) return false;
  if (typeof m.category !== 'string') return false;
  if (!Array.isArray(m.requiredTools)) return false;
  if (!Array.isArray(m.dependencies)) return false;
  if (!Array.isArray(m.requiredPermissions)) return false;

  // Check execute function
  if (typeof s.execute !== 'function') return false;

  // validate and healthCheck are optional
  if (s.validate !== undefined && typeof s.validate !== 'function') return false;
  if (s.healthCheck !== undefined && typeof s.healthCheck !== 'function') return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// STUB HELPER
// Minimal valid implementation for gradual migration of existing stub skills.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal Skill implementation that satisfies the interface.
 * Use this as a placeholder while migrating existing stub files to full skills.
 *
 * @example
 * // skills/my-existing-stub.mjs → migrate to skills/my-skill.ts
 * export default createStubSkill({
 *   id: 'crm-contact-tag',
 *   version: '0.1.0',
 *   displayName: 'Contact Tagger',
 *   description: 'Adds or removes tags on a GHL contact',
 *   category: 'crm',
 * });
 */
export function createStubSkill(
  partial: Pick<SkillManifest, 'id' | 'version' | 'displayName' | 'description' | 'category'>
): Skill {
  return {
    manifest: {
      ...partial,
      requiredTools: [],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      dependencies: [],
      requiredPermissions: [],
    },
    execute: async (_context, input) => {
      return {
        status: 'stub',
        message: `Skill ${partial.id} is a stub. Implement execute() to activate.`,
        input,
      };
    },
  };
}
