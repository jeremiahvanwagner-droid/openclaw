# OpenRouter Fallback Integration Report

**To:** MIKE, Executive Systems Architect & Strategic Analyst  
**From:** Codex  
**Date:** 2026-03-31  
**Repo:** `jeremiahvanwagner-droid/openclaw`  
**Current HEAD:** `d7ceaa5`  
**Status:** Implemented and validated in repository

## Executive Summary

OpenRouter has been wired as a conservative runtime fallback inside the 5-tier routing layer without replacing Anthropic as the primary provider.

The fallback policy now behaves as follows:

- Anthropic remains primary for all tiers.
- OpenRouter fallback triggers only on `429`, `500`, and `503`.
- Fallback is permitted only for `EXECUTOR`, `COMMUNICATOR`, and `ANALYST`.
- `STRATEGIST` and `GUARDIAN` remain Anthropic-only and do not route through the shared OpenRouter key.
- Tool-calling constraints are respected:
  - `EXECUTOR` and `COMMUNICATOR` can carry tools to OpenRouter fallback if the configured fallback model is marked tool-capable.
  - `ANALYST` strips tools before fallback because `deepseek/deepseek-chat-v3.1:free` is not treated as reliably tool-capable.

## Files Changed

- `config/claw-router.json`
  - `provider_enforcement` changed from `anthropic_only` to `anthropic_primary`
  - added an explicit `fallback` block for OpenRouter
- `lib/claw-router.ts`
  - implemented `routeWithFallback()`
  - added `adaptAnthropicToOpenAI()`
  - added OpenRouter request/response normalization
  - added structured fallback logging
  - kept sovereign tiers Anthropic-only
- `scripts/test-openrouter-fallback.ts`
  - added manual validation script for fallback behavior

## Fallback Policy Implemented

### Sovereign Tiers

- `STRATEGIST`
  - Anthropic-only
  - no OpenRouter fallback
- `GUARDIAN`
  - Anthropic-only
  - no OpenRouter fallback

### Shared Tiers

- `EXECUTOR`
  - Anthropic primary
  - fallback model: `deepseek/deepseek-r1:free`
  - fallback triggers: `429`, `500`, `503`
- `COMMUNICATOR`
  - Anthropic primary
  - fallback model: `meta-llama/llama-4-maverick:free`
  - fallback triggers: `429`, `500`, `503`
- `ANALYST`
  - Anthropic primary
  - fallback model: `deepseek/deepseek-chat-v3.1:free`
  - fallback triggers: `429`, `500`, `503`
  - tools are stripped before fallback

## Implementation Notes

### 1. Primary Attempt Behavior

The primary Anthropic path inside `routeWithFallback()` was tightened to perform one governed Anthropic attempt before evaluating fallback eligibility.

This matters operationally because the earlier approach allowed the rate governor to retry and open a circuit before fallback could occur, which delayed failover unnecessarily. The current behavior preserves rate-governor accounting while making fallback decisions immediately on the first qualifying Anthropic HTTP failure.

### 2. Message Adaptation

The Anthropic-to-OpenRouter adapter now handles:

- top-level and inline system instructions
- text messages
- `tool_use` blocks mapped to OpenAI-style `tool_calls`
- `tool_result` blocks mapped to tool-role responses
- image blocks logged and stripped during fallback

### 3. Logging

Each fallback attempt logs:

- `event: "openrouter_fallback"`
- tier
- triggering HTTP status
- fallback model
- latency in milliseconds
- token count
- success/failure outcome

## Validation Completed

The following validation checks passed in-repo:

1. `OPENROUTER_API_KEY` confirmed present in `.env`
2. `npx tsc --noEmit` passed with zero new TypeScript errors
3. `config/claw-router.json` parsed successfully as valid JSON
4. Manual fallback script passed:
   - `COMMUNICATOR` tier correctly fell back to OpenRouter on mocked `429`
   - `STRATEGIST` tier correctly rethrew mocked `429` and did not hit OpenRouter

## Operational Caveat

`lib/llm-router.ts` was not modified because it does not delegate to `lib/claw-router.ts` in this repository snapshot.

That means the fallback implementation is now correct inside the ClawRouter path, but any runtime path that bypasses `claw-router.complete()` and calls other LLM routing code directly will not inherit this OpenRouter failover automatically.

This is not a defect in the fallback implementation itself. It is a runtime wiring fact that should be confirmed before declaring system-wide OpenRouter failover active in production.

## Guardrails Preserved

- `SOUL.md` unchanged
- `AGENTS.md` unchanged
- no agent identity files changed
- `anthropic-client.ts` unchanged
- `models.json` unchanged
- `api-rate-governor.ts` unchanged
- GHL webhook handlers unchanged

## Recommended Next Action

Before production activation, verify which live completion entrypoint the Telegram and gateway runtime currently use:

- if they already route through `lib/claw-router.ts`, this fallback is ready to activate
- if they route through `lib/llm-router.ts` or another direct Anthropic path, that entrypoint must be aligned before OpenRouter can be considered live failover for shared tiers

## TODOs

- Replace static tool-capability allowlist with a model capability registry
- Provision a separate sovereign OpenRouter path before any future sovereign failover work
- Evaluate paid OpenRouter models for `EXECUTOR` if free-tier quality or availability is insufficient
