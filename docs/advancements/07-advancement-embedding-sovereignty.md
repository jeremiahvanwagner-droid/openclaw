# Advancement 7 — Embedding Sovereignty: OpenAI → Local Ollama Embeddings

## Summary

- **File Evidence:**
  - `lib/agent-memory.ts:8` — "TODO: Migrate embeddings from OpenAI to Anthropic or alternative embedding service"; `:75` — runtime warning string "TODO: Migrate to alternative embedding service (Anthropic does not provide embedding models)"; `:116` — same TODO again.
  - `lib/llm-router.ts:133` and `:443` — the identical TODO pair in the router's embedding path.
  - `.env.example:18-19` — "OpenAI (EMBEDDINGS ONLY — text-embedding-3-small for semantic search)".
  - `lib/api-rate-governor.ts:205-215` — the `openai` provider limit block: "BACKUP ONLY. Embeddings only, no completions. Hard cap: $3/day to prevent runaway costs."
  - `supabase/migrations/20260318000006_embedding_model_upgrade.sql:1-9` — the platform has already executed one embedding-model migration (ada-002/1536 → 3-small/512): `embedding_512 vector(512)` column + `match_agent_memories_512()` function. This is the exact template a local-model migration follows.
  - `scripts/reembed-agent-memory.mjs` — the backfill/re-embed helper already exists.
  - `package.json` — `openai` is a production dependency whose only sanctioned use is this embedding path.
  - **Live verification (2026-07-03):** `agent_memory` on DB1 = **0 rows** — there is currently no corpus to re-embed, which makes this the cheapest moment the migration will ever have.
  - Ollama serving locally at `127.0.0.1:11434` with headroom (`REGGIE-STATE.md:15,166`); an embedding model is a few-hundred-MB addition beside the 9.3 GB qwen3:14b.
- **Current State:** Semantic memory depends on an external OpenAI key — the platform's last non-Anthropic, non-local API dependency, held on a $3/day leash by the governor and flagged for replacement in five separate TODO comments across two modules. The embedding dimension (512) is bound to OpenAI's `text-embedding-3-small` reduction.
- **Proposed Enhancement:** Add an `ollama` embedding provider (`nomic-embed-text`, 768-dim, Apache-2.0) selected by `OPENCLAW_EMBEDDINGS_PROVIDER=ollama`, following the proven 20260318000006 pattern: new `embedding_768 vector(768)` column + `match_agent_memories_768()` RPC + re-embed backfill via the existing script. OpenAI path remains as explicit fallback until one clean week passes, then the dependency is dropped.
- **Impact / Effort:** 7/10 · 5/10
- **Risk Eliminated:** Third-party dependency for a core cognitive function (memory recall dies if the OpenAI key expires/throttles — same failure class as the Telegram 401 storm, currently mitigated only by a spend cap); embedding-vendor lock-in on stored vectors.
- **Mission Advancement:** Completes the sovereignty arc that Phase 9 started for completions — P10 doctrine ("operational independence… protected from third-party gatekeeping", `REGGIE-STATE.md:424`) extended to memory.
- **Unlocks:** Unmetered embedding volume (memory can embed *everything* — every webhook event from Advancement 3, every cron report — without budget anxiety); removal of the `openai` dependency and its key rotation surface; a second walk-up path (better local embedders drop in by tag).

## Implementation Brief

### Files to Create/Modify/Delete

- **Create:** `supabase/migrations/<ts>_embedding_768_local.sql`
- **Modify:** `lib/agent-memory.ts`, `lib/llm-router.ts` (provider switch in the embedding functions), `scripts/reembed-agent-memory.mjs` (target-provider flag), `.env.example` (new var + retire OpenAI comment), `lib/api-rate-governor.ts` (add zero-cost `ollama` provider limits entry), tests (`lib/__tests__/agent-memory.test.ts`, `lib/__tests__/llm-router.test.ts`)
- **Delete (final step only, after soak):** `openai` from `package.json` dependencies.

### Step-by-Step Instructions

1. **Pull the model on the VPS:** `ollama pull nomic-embed-text` (~274 MB; verify with `ollama list` and `free -h` — negligible beside qwen3:14b). Probe: `curl http://127.0.0.1:11434/api/embeddings -d '{"model":"nomic-embed-text","prompt":"test"}'` → 768-float vector.
2. **Migration (clone the 006 pattern exactly):**
   ```sql
   ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS embedding_768 vector(768);
   CREATE INDEX IF NOT EXISTS agent_memory_embedding_768_idx
     ON agent_memory USING ivfflat (embedding_768 vector_cosine_ops) WITH (lists = 100);
   CREATE OR REPLACE FUNCTION match_agent_memories_768(
     query_embedding vector(768), agent_id_filter TEXT, division_filter TEXT,
     include_shared BOOLEAN DEFAULT TRUE, match_count INT DEFAULT 5)
   RETURNS TABLE (id UUID, content TEXT, similarity FLOAT, metadata JSONB, memory_scope TEXT, created_at TIMESTAMPTZ)
   LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY
     SELECT am.id, am.content, 1 - (am.embedding_768 <=> query_embedding), am.metadata, am.memory_scope, am.created_at
     FROM agent_memory am
     WHERE am.embedding_768 IS NOT NULL
       AND (am.agent_id = agent_id_filter
            OR (include_shared AND am.memory_scope IN ('division','global')
                AND (am.memory_scope = 'global' OR am.division = division_filter)))
     ORDER BY am.embedding_768 <=> query_embedding LIMIT match_count;
   END; $$;
   ```
   (Adjust the WHERE clause to mirror `match_agent_memories_512`'s exact scope logic — copy from `20260318000006_embedding_model_upgrade.sql:10-30ff` rather than from this sketch.)
3. **Provider switch in code:** in `lib/agent-memory.ts` and `lib/llm-router.ts`, extract the current OpenAI embed call into `embedWithOpenAI()` and add:
   ```ts
   async function embedWithOllama(text: string): Promise<number[]> {
     const base = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/v1$/, "");
     const res = await fetch(`${base}/api/embeddings`, {
       method: "POST", headers: { "content-type": "application/json" },
       body: JSON.stringify({ model: process.env.OPENCLAW_EMBEDDINGS_MODEL || "nomic-embed-text", prompt: text }),
     });
     if (!res.ok) throw Object.assign(new Error(`ollama embeddings ${res.status}`), { status: res.status });
     return (await res.json()).embedding;
   }
   const EMBED_PROVIDER = process.env.OPENCLAW_EMBEDDINGS_PROVIDER || "openai"; // flip default after soak
   ```
   Route store→`embedding_768`+`match_agent_memories_768` when provider is `ollama`, and wrap the call in `withGovernor({ provider: "ollama", queueClass: "P3" })` after adding an uncapped `ollama` entry to `PROVIDER_LIMITS` (`lib/api-rate-governor.ts:121`) — local calls still deserve concurrency limits (`maxConcurrent: 2`) so embedding bursts can't starve the single CPU core mid-inference.
4. **Re-embed path:** extend `scripts/reembed-agent-memory.mjs` with `--provider ollama --column embedding_768`. With `agent_memory` at 0 rows today this is a no-op safeguard, but it future-proofs the cutover for whenever the corpus is non-empty.
5. **Env & docs:** `.env.example` — add `OPENCLAW_EMBEDDINGS_PROVIDER=ollama` and `OPENCLAW_EMBEDDINGS_MODEL=nomic-embed-text`; demote the OpenAI block comment to "legacy fallback, scheduled for removal".
6. **Soak & retire:** run one week with `ollama` default and OpenAI still installed. If zero embed failures in logs, remove the `openai` dependency, delete `embedWithOpenAI`, and update `lib/api-rate-governor.ts:205-215` comment to record the retirement.

### Verification Checklist

- [ ] `pnpm test` green (provider switch unit-tested with fetch mocked; dimension asserted = 768).
- [ ] `memory/store` → `memory/query` round-trip on the VPS returns the stored item via `match_agent_memories_768` (insert a probe memory, query it, similarity > 0.9).
- [ ] `select count(*) from agent_memory where embedding_768 is not null` grows with new stores; no new rows populate only the 512 column.
- [ ] Governor status (`getAllStatus()`) shows `ollama` provider with request counts climbing and `openai` flat at 0 after cutover.
- [ ] Week-long soak: zero `ollama embeddings 5xx` log lines.

### Rollback Procedure

1. Set `OPENCLAW_EMBEDDINGS_PROVIDER=openai` (env flip, restart) — reads/writes return to the 512 path instantly; the 768 column simply stops advancing.
2. Migration is additive; leave in place (0-cost) or drop the column/index/function with three statements.
3. Only after the final retire step would rollback need `pnpm add openai` + `git revert` — which is why retirement waits for the soak week.

### Definition of Done

A stored memory is retrieved through `match_agent_memories_768` on the VPS with `OPENCLAW_EMBEDDINGS_PROVIDER=ollama` set in the live environment, AND the OpenAI daily request count in governor status remains 0 for 7 consecutive days. Both true → done.
