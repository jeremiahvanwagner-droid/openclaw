/**
 * Anthropic Client Singleton
 * OpenClaw Multi-Agent Network
 *
 * Single source of truth for the Anthropic SDK client and model tier mapping.
 * Import `anthropic` and `MODELS` from here instead of constructing clients inline.
 */

import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("[OpenClaw] ANTHROPIC_API_KEY is required but not set");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  SOVEREIGN:  "claude-opus-4-5",   // Tier 1: replaces openai/gpt-5.3-codex
  STRATEGIST: "claude-sonnet-4-5", // Tier 2: replaces gpt-4o
  OPERATOR:   "claude-haiku-4-5",  // Tier 3: replaces gpt-4o-mini
} as const;

export type ModelTier = keyof typeof MODELS;
