/**
 * Agent Memory Library
 * Open Claw Multi-Agent Network
 *
 * Provides semantic memory operations using Supabase pgvector.
 * Supports private, division-scoped, and global memory sharing.
 *
 * TODO: Migrate embeddings from OpenAI to Anthropic or alternative embedding service
 * (Anthropic currently does not provide embedding models)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";
import {
  memoryQueryDuration,
  memoryStoreTotal,
} from "./metrics";

const log = logger.child({ module: "agent-memory" });

// Initialize clients lazily
let supabase: SupabaseClient | null = null;
// Lazy-load OpenAI only if embeddings are needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let openaiModule: any = null;

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

/**
 * Lazy-load OpenAI SDK only when embeddings are needed.
 * This allows the rest of the system to work without OpenAI if embeddings are not used.
 *
 * @throws Error if OPENAI_API_KEY is not configured
 */
async function getOpenAIClient(): Promise<any> {
  if (!openaiModule) {
    // Dynamically import OpenAI only when needed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: OpenAI } = await import("openai");

    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY not configured. Embeddings require OpenAI API key. " +
        "TODO: Migrate to alternative embedding service (Anthropic does not provide embedding models)"
      );
    }

    openaiModule = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiModule;
}

// Types
export type MemoryScope = "private" | "division" | "global";

export interface MemoryEntry {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  memory_scope: MemoryScope;
  created_at: string;
}

export interface StoreOptions {
  scope?: MemoryScope;
  metadata?: Record<string, unknown>;
  expiresIn?: number; // seconds
}

export interface QueryOptions {
  topK?: number;
  includeShared?: boolean;
  minSimilarity?: number;
}

// ═══════════════════════════════════════════════════════════════════
// EMBEDDING OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate embedding vector for text using OpenAI text-embedding-3-small.
 *
 * NOTE: Anthropic does not provide embedding models. Embeddings still use OpenAI.
 * TODO: Migrate to alternative embedding service (Cohere, Hugging Face, etc.)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = await getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input: text,
  });
  return response.data[0].embedding;
}

// ═══════════════════════════════════════════════════════════════════
// STORE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Store a memory with embedding for an agent
 */
export async function embedAndStore(
  agentId: string,
  content: string,
  options: StoreOptions = {}
): Promise<string> {
  const {
    scope = "private",
    metadata = {},
    expiresIn,
  } = options;

  // Generate embedding
  const embedding = await generateEmbedding(content);

  // Calculate expiration if provided
  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  // Store in Supabase
  const { data, error } = await getSupabase()
    .from("agent_memory")
    .insert({
      agent_id: agentId,
      content,
      embedding_512: embedding,
      memory_scope: scope,
      metadata: {
        ...metadata,
        stored_at: new Date().toISOString(),
      },
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) {
    log.error({ err: error }, "Failed to store memory");
    throw error;
  }

  memoryStoreTotal.inc({ agent_id: agentId, scope });
  return data.id;
}

/**
 * Store multiple memories in batch
 */
export async function batchStore(
  agentId: string,
  entries: Array<{ content: string; scope?: MemoryScope; metadata?: Record<string, unknown> }>
): Promise<string[]> {
  const ids: string[] = [];

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(entry =>
        embedAndStore(agentId, entry.content, {
          scope: entry.scope,
          metadata: entry.metadata,
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        ids.push(r.value);
      } else {
        log.error({ err: r.reason }, "batchStore: failed to store entry");
      }
    }
  }

  return ids;
}

// ═══════════════════════════════════════════════════════════════════
// QUERY OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Query memories by semantic similarity
 */
export async function queryMemory(
  agentId: string,
  query: string,
  options: QueryOptions = {}
): Promise<MemoryEntry[]> {
  const stopTimer = memoryQueryDuration.startTimer({ agent_id: agentId });
  const {
    topK = 5,
    includeShared = true,
    minSimilarity = 0.7,
  } = options;

  // Get agent's division for scope filtering
  const { data: agent } = await getSupabase()
    .from("agents")
    .select("org_unit")
    .eq("agent_id", agentId)
    .single();

  if (!agent) {
    log.warn({ agentId }, "Agent not found in registry");
    stopTimer();
    return [];
  }

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Query with the 512-dim pgvector RPC function.
  const { data, error } = await getSupabase().rpc("match_agent_memories_512", {
    query_embedding: queryEmbedding,
    agent_id_filter: agentId,
    division_filter: agent.org_unit,
    include_shared: includeShared,
    match_count: topK,
  });

  if (error) {
    log.error({ err: error }, "Failed to query memory");
    stopTimer();
    throw error;
  }

  stopTimer();
  // Filter by minimum similarity
  return (data || []).filter(
    (entry: MemoryEntry) => entry.similarity >= minSimilarity
  );
}

/**
 * Get recent memories for an agent (non-semantic)
 */
export async function getRecentMemories(
  agentId: string,
  limit: number = 10
): Promise<Omit<MemoryEntry, "similarity">[]> {
  const { data, error } = await getSupabase()
    .from("agent_memory")
    .select("id, content, metadata, memory_scope, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    log.error({ err: error }, "Failed to get recent memories");
    throw error;
  }

  return data || [];
}

// ═══════════════════════════════════════════════════════════════════
// SHARING OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Share context from one agent to another
 */
export async function shareContext(
  fromAgent: string,
  toAgent: string,
  context: string,
  metadata: Record<string, unknown> = {}
): Promise<string> {
  // Get target agent's division
  const { data: target } = await getSupabase()
    .from("agents")
    .select("org_unit")
    .eq("agent_id", toAgent)
    .single();

  if (!target) {
    throw new Error(`Target agent ${toAgent} not found`);
  }

  // Store as division-scoped memory for the target agent
  return embedAndStore(toAgent, context, {
    scope: "division",
    metadata: {
      ...metadata,
      shared_by: fromAgent,
      shared_at: new Date().toISOString(),
    },
  });
}

/**
 * Broadcast context to all agents in a division
 */
export async function broadcastToDivision(
  fromAgent: string,
  division: string,
  context: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  // Get all agents in the division
  const { data: agents } = await getSupabase()
    .from("agents")
    .select("agent_id")
    .eq("org_unit", division)
    .neq("agent_id", fromAgent);

  if (!agents || agents.length === 0) {
    log.warn({ division }, "No other agents found in division");
    return;
  }

  // Share with each agent
  const results = await Promise.allSettled(
    agents.map(agent =>
      shareContext(fromAgent, agent.agent_id, context, metadata)
    )
  );
  const failures = results.filter(r => r.status === "rejected");
  if (failures.length) {
    log.error({ failures: failures.length, total: results.length }, "broadcastToDivision: partial share failure");
  }
}

/**
 * Share context globally (all agents can access)
 */
export async function shareGlobally(
  fromAgent: string,
  context: string,
  metadata: Record<string, unknown> = {}
): Promise<string> {
  return embedAndStore(fromAgent, context, {
    scope: "global",
    metadata: {
      ...metadata,
      shared_by: fromAgent,
      shared_at: new Date().toISOString(),
      global_share: true,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// MAINTENANCE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Delete a specific memory
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("agent_memory")
    .delete()
    .eq("id", memoryId);

  if (error) {
    log.error({ err: error }, "Failed to delete memory");
    throw error;
  }
}

/**
 * Clear all memories for an agent
 */
export async function clearAgentMemory(
  agentId: string,
  scope?: MemoryScope
): Promise<number> {
  let query = getSupabase()
    .from("agent_memory")
    .delete()
    .eq("agent_id", agentId);

  if (scope) {
    query = query.eq("memory_scope", scope);
  }

  const { data, error } = await query.select("id");

  if (error) {
    log.error({ err: error }, "Failed to clear memory");
    throw error;
  }

  return data?.length || 0;
}

/**
 * Clean up expired memories (should be run periodically)
 */
export async function cleanupExpiredMemories(): Promise<number> {
  const { data, error } = await getSupabase()
    .from("agent_memory")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    log.error({ err: error }, "Failed to cleanup expired memories");
    throw error;
  }

  return data?.length || 0;
}

/**
 * Get memory statistics for an agent
 */
export async function getMemoryStats(agentId: string): Promise<{
  total: number;
  private: number;
  division: number;
  global: number;
}> {
  const { data, error } = await getSupabase()
    .from("agent_memory")
    .select("memory_scope")
    .eq("agent_id", agentId);

  if (error) {
    log.error({ err: error }, "Failed to get memory stats");
    throw error;
  }

  const stats = {
    total: data?.length || 0,
    private: 0,
    division: 0,
    global: 0,
  };

  for (const entry of data || []) {
    stats[entry.memory_scope as MemoryScope]++;
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Store and immediately confirm retrieval (useful for testing)
 */
export async function storeAndVerify(
  agentId: string,
  content: string,
  options: StoreOptions = {}
): Promise<{ id: string; verified: boolean }> {
  const id = await embedAndStore(agentId, content, options);

  // Wait a moment for consistency
  await new Promise(resolve => setTimeout(resolve, 100));

  // Try to retrieve
  const results = await queryMemory(agentId, content, { topK: 1 });
  const verified = results.some(r => r.id === id);

  return { id, verified };
}

/**
 * Create a contextual summary from multiple memories
 */
export async function summarizeMemories(
  memories: MemoryEntry[]
): Promise<string> {
  if (memories.length === 0) return "No relevant memories found.";

  const summaryParts = memories.map(
    (m, i) => `[${i + 1}] (${(m.similarity * 100).toFixed(0)}% match) ${m.content}`
  );

  return summaryParts.join("\n\n");
}
