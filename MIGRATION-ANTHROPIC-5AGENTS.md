# OpenClaw Migration Plan: OpenAI → 5-Agent Anthropic Configuration
**Status:** Planning | **Version:** 1.0  
**Date:** 2026-03-29 | **Target Completion:** 2026-04-15

---

## Executive Summary

Migrate OpenClaw from hybrid OpenAI/Anthropic architecture to **pure Anthropic** with a 5-agent specialized configuration. This consolidation reduces complexity, cost, and operational risk while leveraging Anthropic's Claude models across all tiers.

**Key Outcomes:**
- ✅ Eliminate OpenAI API calls and dependencies
- ✅ Standardize on Anthropic Claude (Opus/Sonnet/Haiku)
- ✅ Reduce tier configs from 3+ to 5 specialized agents
- ✅ Maintain sovereign isolation and rate-limiting
- ✅ 100% backward compatibility for existing handlers

---

## Phase 0: Current State Assessment

### OpenAI References Found (30+ instances)
| Location | Type | Usage | Action |
|----------|------|-------|--------|
| `.env` | Env Variable | `OPENAI_API_KEY` (embeddings/legacy) | Remove |
| `.env.example` | Documentation | Webhook secrets for old integrations | Update |
| `package.json` | Dependency | `"openai": "^4.70.0"` | Remove from production |
| `agents/support/agent/models.json` | Config | `openai-codex` references | Convert to Claude |
| `.openclaw-dev/openclaw.json` | Dev Config | Old openai-codex auth profiles | Purge |
| `agent_communication_map.md` | Docs | OpenAI rate limits noted | Update to Anthropic specs |

### Current Architecture
- **Primary LLM:** Anthropic (via `claw-router.ts`) ✅
- **Legacy LLM:** OpenAI (embeddings, codex) ❌ TO REMOVE
- **Tier System:** 3-4 tiers with mixed providers
- **Sovereign Isolation:** `ANTHROPIC_API_KEY_SOVEREIGN` (implemented)
- **Rate Governor:** Supports multiple providers (needs consolidation)

**Current code already uses Anthropic SDK:**
```typescript
import Anthropic from "@anthropic-ai/sdk";
// claw-router.ts fully Anthropic-based
```

---

## Phase 1: Define 5 Core Anthropic Agent Archetypes

Each agent is a specialized tier with specific Claude model, rate limits, and autonomy scope.

### Agent 1: **STRATEGIST** (Decision & Analysis)
- **Model**: `claude-opus-4-latest`
- **Use Case**: Complex reasoning, multi-step planning, executive decisions
- **Max Tokens**: 16,000
- **Rate Limit**: 30 req/min (P1 priority)
- **Agents**: `d1_ceo`, `d1_cto`, `d1_product_dev_manager`, pod_leads
- **Sovereign Key**: `ANTHROPIC_API_KEY_SOVEREIGN`

**Routing Rule:**
```json
{
  "rule_id": "strategist-tier",
  "priority": 10,
  "match": {
    "tag": "executive-decision",
    "any_of": [
      { "agent_id": "d1_ceo" },
      { "agent_id": "d1_cto" },
      { "agent_id": "d1_product_dev_manager" }
    ]
  },
  "route_to": "anthropic-strategist",
  "enforce_sovereign_isolation": true
}
```

### Agent 2: **EXECUTOR** (Implementation & Operations)
- **Model**: `claude-sonnet-4.5-latest`
- **Use Case**: Code generation, workflow execution, integration handling
- **Max Tokens**: 8,000
- **Rate Limit**: 60 req/min (P1/P2 mixed)
- **Agents**: `d1_fullstack_dev`, `d1_devops`, `d8_integration_engineer`, `d8_funnel_engineer`
- **Sovereign Key**: `ANTHROPIC_API_KEY_SHARED`

**Routing Rule:**
```json
{
  "rule_id": "executor-tier",
  "priority": 20,
  "match": {
    "tag": "implementation",
    "any_of": [
      { "agent_id": "d1_fullstack_dev" },
      { "agent_id": "d8_integration_engineer" }
    ]
  },
  "route_to": "anthropic-executor",
  "enforce_sovereign_isolation": false
}
```

### Agent 3: **COMMUNICATOR** (Content & Customer-Facing)
- **Model**: `claude-sonnet-4.5-latest`
- **Use Case**: Customer support, content generation, messaging
- **Max Tokens**: 6,000
- **Rate Limit**: 90 req/min (P2 growth priority)
- **Agents**: `d1_cmo`, `d1_customer_success`, `support/*`, `sales/*`
- **Sovereign Key**: `ANTHROPIC_API_KEY_SHARED`

**Routing Rule:**
```json
{
  "rule_id": "communicator-tier",
  "priority": 30,
  "match": {
    "tag": "customer-facing",
    "any_of": [
      { "agent_id": "d1_cmo" },
      { "agent_id": "d1_customer_success" }
    ]
  },
  "route_to": "anthropic-communicator",
  "enforce_sovereign_isolation": false
}
```

### Agent 4: **ANALYST** (Data & Insights)
- **Model**: `claude-haiku-4.5-latest`
- **Use Case**: Data processing, reporting, analysis, embeddings
- **Max Tokens**: 4,000
- **Rate Limit**: 120 req/min (P3 batch priority)
- **Agents**: `d1_data_analyst`, `d8_revenue_ops`, `d8_crm_ops`
- **Sovereign Key**: `ANTHROPIC_API_KEY_SHARED`

**Routing Rule:**
```json
{
  "rule_id": "analyst-tier",
  "priority": 40,
  "match": {
    "tag": "analytics",
    "any_of": [
      { "agent_id": "d1_data_analyst" },
      { "agent_id": "d8_revenue_ops" }
    ]
  },
  "route_to": "anthropic-analyst",
  "enforce_sovereign_isolation": false
}
```

### Agent 5: **GUARDIAN** (Compliance & Safety)
- **Model**: `claude-haiku-4.5-latest`
- **Use Case**: Compliance checks, safety validation, audit logging
- **Max Tokens**: 4,000
- **Rate Limit**: 40 req/min (P0 runtime priority)
- **Agents**: `shared_runtime_ops`, `d8_compliance_auditor`, internal monitors
- **Sovereign Key**: `ANTHROPIC_API_KEY_SOVEREIGN` (separate for audit trail)

**Routing Rule:**
```json
{
  "rule_id": "guardian-tier",
  "priority": 1,
  "match": {
    "tag": "compliance-safety",
    "any_of": [
      { "agent_id": "d8_compliance_auditor" }
    ]
  },
  "route_to": "anthropic-guardian",
  "enforce_sovereign_isolation": true
}
```

---

## Phase 2: Configuration Schema Updates

### New `agents_config.json` Tiers Section

```json
{
  "tiers": {
    "anthropic-strategist": {
      "credential_env": "ANTHROPIC_API_KEY_SOVEREIGN",
      "provider": "anthropic",
      "model": "claude-opus-4-latest",
      "max_tokens": 16000,
      "temperature_default": 0.7,
      "queue_class": "P1",
      "sovereign_isolation": true,
      "rate_limit_per_min": 30,
      "max_concurrent_requests": 5,
      "description": "Executive strategy and complex reasoning"
    },
    "anthropic-executor": {
      "credential_env": "ANTHROPIC_API_KEY_SHARED",
      "provider": "anthropic",
      "model": "claude-sonnet-4.5-latest",
      "max_tokens": 8000,
      "temperature_default": 0.5,
      "queue_class": "P1",
      "sovereign_isolation": false,
      "rate_limit_per_min": 60,
      "max_concurrent_requests": 10,
      "description": "Code generation and workflow execution"
    },
    "anthropic-communicator": {
      "credential_env": "ANTHROPIC_API_KEY_SHARED",
      "provider": "anthropic",
      "model": "claude-sonnet-4.5-latest",
      "max_tokens": 6000,
      "temperature_default": 0.8,
      "queue_class": "P2",
      "sovereign_isolation": false,
      "rate_limit_per_min": 90,
      "max_concurrent_requests": 15,
      "description": "Customer-facing content and support"
    },
    "anthropic-analyst": {
      "credential_env": "ANTHROPIC_API_KEY_SHARED",
      "provider": "anthropic",
      "model": "claude-haiku-4.5-latest",
      "max_tokens": 4000,
      "temperature_default": 0.3,
      "queue_class": "P3",
      "sovereign_isolation": false,
      "rate_limit_per_min": 120,
      "max_concurrent_requests": 20,
      "description": "Data analysis and batch processing"
    },
    "anthropic-guardian": {
      "credential_env": "ANTHROPIC_API_KEY_SOVEREIGN",
      "provider": "anthropic",
      "model": "claude-haiku-4.5-latest",
      "max_tokens": 4000,
      "temperature_default": 0.1,
      "queue_class": "P0",
      "sovereign_isolation": true,
      "rate_limit_per_min": 40,
      "max_concurrent_requests": 3,
      "description": "Compliance, safety, and audit"
    }
  }
}
```

---

## Phase 3: Environment Variable Consolidation

### Remove OpenAI Variables
```bash
# DELETE FROM .env:
OPENAI_API_KEY
OPENCLAW_OPENAI_CODEX_MANUAL_TOKEN
OPENAI_WEBHOOK_SECRET_* (all 13 webhook secrets)
```

### Define Anthropic Variables (Required)
```bash
# ADD TO .env:
ANTHROPIC_API_KEY_SOVEREIGN=sk-ant-abcd-xyz-...
ANTHROPIC_API_KEY_SHARED=sk-ant-1234-567-...

# Optional backup keys for failover:
ANTHROPIC_API_KEY_BACKUP=sk-ant-fallback-...
```

### Rate Limits Configuration
```bash
ANTHROPIC_RATE_LIMIT_STRATEGIST=30
ANTHROPIC_RATE_LIMIT_EXECUTOR=60
ANTHROPIC_RATE_LIMIT_COMMUNICATOR=90
ANTHROPIC_RATE_LIMIT_ANALYST=120
ANTHROPIC_RATE_LIMIT_GUARDIAN=40
```

---

## Phase 4: Code Changes Required

### 4.1 Update `lib/claw-router.ts`
**Change:**
- Consolidate tier routing logic (remove OpenAI fallback)
- Update rate governor to only process Anthropic limits
- Add explicit Anthropic model validation for 5 tiers
- Remove `assertNever` check for non-Anthropic providers

**Lines affected:** ~150-200

### 4.2 Update `package.json`
**Remove Dependency:**
```json
"openai": "^4.70.0"  // DELETE THIS LINE
```

**Verify Keep:**
```json
"@anthropic-ai/sdk": "^0.39.0"  // KEEP
```

**Command to verify build:**
```bash
npm list @anthropic-ai/sdk
npm list openai  # Should show removed
```

### 4.3 Update Agent Model Configurations
**Remove these files (legacy OpenAI):***
- `agents/support/agent/models.json` (openai-codex refs)
- `.openclaw-dev/openclaw.json` (old auth profiles)
- `.openclaw-dev/agents/main/agent/auth-profiles.json` (openai-codex)

**Create new file:** `config/anthropic-tier-assignment.json`
```json
{
  "agent_assignments": {
    "d1_ceo": "anthropic-strategist",
    "d1_cto": "anthropic-strategist",
    "d1_fullstack_dev": "anthropic-executor",
    "d1_cmo": "anthropic-communicator",
    "d1_customer_success": "anthropic-communicator",
    "d1_data_analyst": "anthropic-analyst",
    "d8_compliance_auditor": "anthropic-guardian"
  }
}
```

### 4.4 Update Rate Governor
**File:** `lib/api-rate-governor.ts`

**Change:**
- Remove OpenAI provider logic (50 req/min)
- Hard-code Anthropic provider
- Update limits per 5 tiers

**Before:**
```typescript
if (provider === "openai") return 50;
if (provider === "anthropic") return 30;  // Old single limit
```

**After:**
```typescript
const tierLimits: Record<string, number> = {
  "anthropic-strategist": 30,
  "anthropic-executor": 60,
  "anthropic-communicator": 90,
  "anthropic-analyst": 120,
  "anthropic-guardian": 40,
};
return tierLimits[tier] || 60;
```

### 4.5 Update Inngest Client
**File:** `inngest/client.ts`

**Change:**
```typescript
// OLD:
const LLM_MODELS = {
  default: "claude-haiku-4.5-latest",
  fast: "gpt-4o-mini",
};

// NEW:
const LLM_MODELS = {
  default: "claude-haiku-4.5-latest",
  complex: "claude-opus-4-latest",
  standard: "claude-sonnet-4.5-latest",
};
```

### 4.6 Update Type Tests
**File:** `lib/__tests__/llm-router.test.ts`

**Change:**
- Replace any `gpt-4o` assertions with `claude-*` models
- Add 5-tier model validation tests
- Verify sovereign key routing

---

## Phase 5: Deletion Checklist

### Files to Delete
```bash
# Legacy OpenAI configs
rm -f agents/support/agent/models.json
rm -f .openclaw-dev/openclaw.json (if present)
rm -f .openclaw-dev/agents/main/agent/auth-profiles.json (if present)
```

### Env Variable Cleanup
```bash
# In .env, remove or comment:
# OPENAI_API_KEY=...
# OPENCLAW_OPENAI_CODEX_MANUAL_TOKEN=...
# OPENAI_WEBHOOK_SECRET_* (all 13 lines)
```

### Documentation Updates
```bash
# Search and update references:
grep -r "openai\|gpt-4o\|gpt-5" docs/ README.md
# Replace with Anthropic equivalents
```

---

## Phase 6: Testing & Validation Strategy

### 6.1 Unit Tests (New)
**Create:** `lib/__tests__/anthropic-tier-routing.test.ts`
```typescript
describe("Five-Agent Anthropic Routing", () => {
  it("routes d1_ceo to anthropic-strategist", () => {
    const { tierId } = routeRequest({
      agent_id: "d1_ceo",
      prompt: "Strategic planning question"
    });
    expect(tierId).toBe("anthropic-strategist");
  });

  it("routes d1_fullstack_dev to anthropic-executor", () => {
    const { tierId } = routeRequest({
      agent_id: "d1_fullstack_dev",
      prompt: "Code generation"
    });
    expect(tierId).toBe("anthropic-executor");
  });

  // ... tests for all 5 agents and sovereign isolation
});
```

### 6.2 Integration Tests
```bash
# Test against Anthropic API with real keys
npm run test:integration -- --match="*anthropic-tier*"

# Verify rate limiting:
# - Send 100 requests to ANALYST tier (limit: 120/min) → should all pass
# - Send 100 requests to GUARDIAN tier (limit: 40/min) → should throttle after 40
```

### 6.3 Smoke Tests (Pre-Deploy)
```bash
# 1. Verify no OpenAI imports remain:
grep -r "openai\|gpt-" lib/ inngest/ handlers/ --include="*.ts" --include="*.mjs"
# Expected: 0 matches

# 2. Verify Anthropic client loads:
node -e "const c = require('./lib/claw-router.ts'); console.log('✓ Claw router loaded')"

# 3. Verify env variables:
test -n "$ANTHROPIC_API_KEY_SOVEREIGN" && echo "✓ Sovereign key present"
test -n "$ANTHROPIC_API_KEY_SHARED" && echo "✓ Shared key present"

# 4. Test single completion request:
npm run test -- --match="*complete*" # from lib/__tests__/
```

### 6.4 Canary Deployment
```bash
# Deploy to 5% of traffic first
# Monitor: error_rate, latency, token_usage for 24h
# Thresholds: <0.1% error, <500ms p99, token efficiency maintained
# If OK → 50% → 100%
```

---

## Phase 7: Rollback Plan

If deployment fails, rollback to last stable commit:

```bash
# 1. Revert code (keep Anthropic SDK):
git revert HEAD~1  # or specific commit range

# 2. Restore OpenAI keys (if needed as emergency fallback):
# Contact security team to re-enable OPENAI_API_KEY in prod secrets

# 3. Restore old routing logic:
git checkout stable-branch -- lib/claw-router.ts

# 4. Re-enable old agent models:
docker restart openclaw-api

# 5. Alert on-call team
# Incident report: what failed, why, recovery steps taken
```

---

## Phase 8: Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| **Zero OpenAI refs** | 100% | `grep` finds 0 matches in code |
| **All 103 agents → assigned tier** | 100% | Config validation script |
| **API uptime** | >99.95% | CloudWatch metrics |
| **Latency p99** | <750ms | New Relic APM |
| **Error rate** | <0.05% | Error tracking (Sentry) |
| **Sovereign isolation** | 100% | Audit logs show correct key usage |
| **Rate limiting** | ±5% of spec | Request distribution tests |
| **Cost reduction** | >20% | API billing comparison (Anthropic vs OpenAI+Anthropic) |

---

## Implementation Timeline

| Phase | Task | Duration | Owner | Start | End |
|-------|------|----------|-------|-------|-----|
| **P0** | Code analysis & tier design | 2 days | Eng | Mar 29 | Mar 31 |
| **P1** | Update routing, remove OpenAI | 3 days | Eng | Apr 1 | Apr 3 |
| **P2** | Unit & integration tests | 2 days | QA | Apr 4 | Apr 5 |
| **P3** | Documentation & runbooks | 1 day | DevOps | Apr 6 | Apr 6 |
| **P4** | Canary deployment (5%) | 1 day | DevOps | Apr 7 | Apr 7 |
| **P5** | Progressive rollout (50%→100%) | 2 days | DevOps | Apr 8 | Apr 9 |
| **P6** | Monitoring & optimization | 3 days | Ops | Apr 10 | Apr 12 |
| **P7** | Decommission OpenAI entirely | 2 days | Sec | Apr 13 | Apr 14 |
| **P8** | Post-mortem & lessons learned | 1 day | Eng | Apr 15 | Apr 15 |

**Total: ~17 calendar days (5-person team)**

---

## Appendix: Monarch Model Selection Rationale

### Why These 5 Models?

| Model | Why | Replaces |
|-------|-----|----------|
| `claude-opus-4-latest` | Highest reasoning, complex planning | gpt-4o (strategy) |
| `claude-sonnet-4.5-latest` | Balance speed/capability for ops | gpt-4o-mini (coding) |
| `claude-haiku-4.5-latest` | Fast, cheap for high-volume tasks | gpt-4o-mini (analytics) |

### Cost Analysis
**Current (OpenAI + Anthropic hybrid):**
- GPT-4o: $30/1M tokens
- GPT-4o-mini: $0.15/1M tokens
- Anthropic: variable per tier

**Post-migration (Anthropic only):**
- Opus: $3/1M tokens
- Sonnet: $3/1M tokens
- Haiku: $0.80/1M tokens

**Estimated savings: 25-40% per month** (to be validated post-migration)

---

## Questions & Decisions Needed

- [ ] Confirm 5-agent structure aligns with org chart
- [ ] Approve tier model assignments (Opus/Sonnet/Haiku distribution)
- [ ] Schedule canary deployment window
- [ ] Assign post-launch on-call engineer
- [ ] Decide on complete removal vs archiving old configs

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-29  
**Next Review:** 2026-04-01 (after Phase 1)
