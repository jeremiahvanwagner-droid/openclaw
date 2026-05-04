================================================================================
DIFFS SUMMARY: Items 1-3 Complete
================================================================================

ITEM 1: Update docker-compose.yml — Add Ollama and Redis services
─────────────────────────────────────────────────────────────────────────────

CHANGES:
  1. Added named volumes section at top:
     volumes:
       redis-data:
       ollama-data:

  2. Updated bot service:
     - Added environment vars for Redis and Ollama discovery:
       REDIS_HOST=redis
       REDIS_PORT=6379
       OLLAMA_HOST=http://ollama:11434
     - Added depends_on with health checks:
       depends_on:
         redis:
           condition: service_healthy
         ollama:
           condition: service_healthy
     - Added health check for bot service:
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:18789/health"]
         interval: 30s
         timeout: 10s
         retries: 3
         start_period: 30s

  3. Added redis service (before webhook):
     - Image: redis:7-alpine
     - Port: 6379 (host:container)
     - Volume: redis-data:/data (persistent)
     - Health check: redis-cli ping
     - Persistence: --appendonly yes

  4. Added ollama service (before webhook):
     - Image: ollama/ollama:latest
     - Port: 11434 (host:container)
     - Volume: ollama-data:/root/.ollama (persistent)
     - Health check: curl /api/tags
     - Environment: OLLAMA_HOST=0.0.0.0:11434
     - Comment: models loaded on-demand or via docker exec

  5. Updated webhook service depends_on:
     depends_on:
       - bot
       - redis
       - ollama

================================================================================

ITEM 2: Create lib/ollama-client.ts — Ollama LLM adapter
─────────────────────────────────────────────────────────────────────────────

NEW FILE: lib/ollama-client.ts (6.9 KB)

EXPORTS:
  - healthcheck(): Promise<boolean>
    • Tests http://ollama:11434/api/tags
    • Returns true/false
    
  - listModels(): Promise<string[]>
    • Fetches available models from Ollama
    • Returns [] on error
    
  - chat(messages, model?, temperature?, maxTokens?): Promise<CompletionResult>
    • Main non-streaming chat completion
    • Posts to http://ollama:11434/api/chat
    • Timeout: 300s (configurable via OLLAMA_REQUEST_TIMEOUT_MS)
    • Returns: { content, model, provider: "ollama", usage }
    
  - chatStream(messages, model?, temperature?, maxTokens?): AsyncGenerator<string>
    • Streaming version (for future use)
    • Yields tokens incrementally
    
  - getModelForRole(roleType): OllamaModel
    • Maps role type to default model (STANDARD or FAST)
    
  - mapAnthropicToOllama(anthropicModel): OllamaModel
    • Converts Anthropic model names to Ollama equivalents

MODELS:
  - OllamaModel.STANDARD = "llama3.1:8b"   (primary, 8B)
  - OllamaModel.FAST = "llama3.2:3b"       (lightweight, 3B)
  - OllamaModel.NEURAL = "nomic-embed-text" (future embeddings)

CONFIGURATION:
  - OLLAMA_HOST: http://ollama:11434 (read from env, default localhost:11434)
  - OLLAMA_REQUEST_TIMEOUT_MS: 300000 (5 min, adjustable for slow machines)

INTEGRATION READY FOR:
  - lib/llm-router.ts (future: add Ollama case in complete() switch)
  - Future: route requests based on OPENCLAW_LLM_PROVIDER env flag

================================================================================

ITEM 3: Update .env.example — Document Redis, OpenAI embeddings, Ollama
─────────────────────────────────────────────────────────────────────────────

ADDED SECTIONS:
  
  1. OpenAI (renamed from LEGACY):
     OPENAI_API_KEY=sk-proj-your-openai-key-here
     (Clarified: embeddings only, text-embedding-3-small)
  
  2. Redis (NEW):
     REDIS_HOST=redis
     REDIS_PORT=6379
     # REDIS_PASSWORD=  (optional)
  
  3. Ollama (REORGANIZED, already existed):
     OLLAMA_HOST=http://ollama:11434
     OLLAMA_REQUEST_TIMEOUT_MS=300000
     # Docs for future OPENCLAW_LLM_PROVIDER=ollama flag

IMPROVED STRUCTURE:
  - Grouped by function: Anthropic, Cost Guard, Gemini, OpenAI, Redis, Ollama
  - Grouped: OpenRouter, Brave, GHL tokens, Supabase, Inngest, Telegram
  - Runtime: OpenClaw runtime vars
  - Deployment: Final section for origins, ports, timezone

================================================================================

NEXT STEPS (when ready):
  1. Copy .env.example to .env (fill in your secrets)
  2. docker compose up (builds + starts all 5 services)
  3. Verify health:
     - http://localhost:18789/health (bot gateway)
     - http://localhost:8788/health (webhook)
     - redis-cli -p 6379 PING (should say PONG)
     - curl http://localhost:11434/api/tags (Ollama model list)
  4. Pre-load Ollama models (optional, loaded on first request):
     docker exec openclaw-ollama ollama pull llama3.1:8b
     docker exec openclaw-ollama ollama pull llama3.2:3b
  5. Next: wire Ollama into llm-router.ts (requires OPENCLAW_LLM_PROVIDER flag)

================================================================================
