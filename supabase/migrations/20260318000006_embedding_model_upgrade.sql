-- Embedding model upgrade: text-embedding-ada-002 (1536 dims) -> text-embedding-3-small (512 dims)
-- Legacy embedding data stays in place until the re-embedding helper backfills the new column.

ALTER TABLE agent_memory
  ADD COLUMN IF NOT EXISTS embedding_512 vector(512);

CREATE INDEX IF NOT EXISTS agent_memory_embedding_512_idx
  ON agent_memory USING ivfflat (embedding_512 vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_agent_memories_512(
  query_embedding vector(512),
  agent_id_filter TEXT,
  division_filter TEXT,
  include_shared BOOLEAN DEFAULT TRUE,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB,
  memory_scope TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    am.content,
    1 - (am.embedding_512 <=> query_embedding) AS similarity,
    am.metadata,
    am.memory_scope,
    am.created_at
  FROM agent_memory am
  WHERE am.embedding_512 IS NOT NULL
    AND (
      (am.agent_id = agent_id_filter AND am.memory_scope = 'private')
      OR (include_shared AND am.memory_scope = 'division' AND am.agent_id IN (
        SELECT a.agent_id FROM agents a WHERE a.org_unit = division_filter
      ))
      OR (include_shared AND am.memory_scope = 'global')
    )
    AND (am.expires_at IS NULL OR am.expires_at > NOW())
  ORDER BY am.embedding_512 <=> query_embedding
  LIMIT match_count;
END;
$$;
