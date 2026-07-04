/**
 * Anthropic Client Singleton
 * OpenClaw Multi-Agent Network
 *
 * Single source of truth for the Anthropic SDK client and model tier mapping.
 * Import `anthropic` and `MODELS` from here instead of constructing clients inline.
 */

import Anthropic from "@anthropic-ai/sdk";

export const anthropicSovereign = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY_SOVEREIGN,
});

export const anthropicShared = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY_SHARED,
});

export function getAnthropicForTier(sovereign: boolean): Anthropic {
  return sovereign ? anthropicSovereign : anthropicShared;
}

/**
 * Model tier mapping — canonical Anthropic model strings for OpenClaw.
 *
 * | Tier       | Use case                                          |
 * |------------|---------------------------------------------------|
 * | SOVEREIGN  | Main sovereign/executive agents (highest capability) |
 * | STRATEGIST | Complex reasoning, strategy, content generation   |
 * | OPERATOR   | High-volume, low-stakes, routine tasks             |
 */
export const MODELS = {
  SOVEREIGN:  "claude-opus-4-8",  // Tier 1: current Opus (2026-07 refresh)
  STRATEGIST: "claude-sonnet-5",  // Tier 2: current Sonnet (2026-07 refresh)
  OPERATOR:   "claude-haiku-4-5", // Tier 3: current Haiku (unchanged)
} as const;

export type ModelTier = keyof typeof MODELS;
