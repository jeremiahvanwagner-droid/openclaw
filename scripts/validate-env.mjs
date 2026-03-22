#!/usr/bin/env node
/**
 * Environment Variable Validator
 * OpenClaw Multi-Agent Network
 *
 * Usage:
 *   node scripts/validate-env.mjs              # Validate all
 *   node scripts/validate-env.mjs --dashboard  # Dashboard only
 *   node scripts/validate-env.mjs --bot        # Bot/webhook only
 */

import { loadLocalEnv } from "../lib/load-local-env.mjs";

loadLocalEnv();

// Normalize common aliases used across older/local setups.
if (!process.env.OPENCLAW_GATEWAY_AUTH_TOKEN && process.env.OPEN_CLAW_GATEWAY_AUTH_TOKEN) {
  process.env.OPENCLAW_GATEWAY_AUTH_TOKEN = process.env.OPEN_CLAW_GATEWAY_AUTH_TOKEN;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
}
if (!process.env.GHL_PRIVATE_INTEGRATION_TOKEN) {
  process.env.GHL_PRIVATE_INTEGRATION_TOKEN =
    process.env.GHL_PRIVATE_INTEGRATION_TOKEN_TJB || process.env.GHL_TOKEN || "";
}

const args = process.argv.slice(2);
const dashboardOnly = args.includes("--dashboard");
const botOnly = args.includes("--bot");

const errors = [];
const warnings = [];

function firstPresent(keys) {
  return keys.find((key) => process.env[key]) || null;
}

function requireAny(keys, description) {
  if (!firstPresent(keys)) {
    errors.push(`  x ${keys.join(" | ")} - ${description}`);
  }
}

function warnAny(keys, description) {
  if (!firstPresent(keys)) {
    warnings.push(`  ! ${keys.join(" | ")} - ${description}`);
  }
}

// Core
requireAny(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], "Supabase project URL");
requireAny(
  [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ],
  "Supabase API key (service key preferred; anon key accepted for read/fallback)",
);

if (!dashboardOnly) {
  // Bot / Webhook
  requireAny(
    ["GHL_PRIVATE_INTEGRATION_TOKEN", "GHL_PRIVATE_INTEGRATION_TOKEN_TJB", "GHL_TOKEN"],
    "GoHighLevel primary integration token",
  );
  requireAny(
    ["OPENCLAW_GATEWAY_AUTH_TOKEN", "OPEN_CLAW_GATEWAY_AUTH_TOKEN"],
    "Webhook -> gateway auth token",
  );
  requireAny(["OPENCLAW_GHL_WEBHOOK_SECRET"], "GHL webhook HMAC secret");

  warnAny(["INNGEST_SIGNING_KEY"], "Inngest function signing key");
  warnAny(["INNGEST_EVENT_KEY"], "Inngest event dispatch key");
  warnAny(["OPENAI_API_KEY"], "OpenAI API key (required for embeddings)");
  warnAny(
    ["TELEGRAM_BOT_TOKEN", "OPENCLAW_TELEGRAM_BOT_TOKEN"],
    "Telegram bot token (alerts will be disabled)",
  );
  warnAny(
    ["TELEGRAM_ALERT_CHAT_ID", "OPENCLAW_ALERT_TELEGRAM_CHAT_ID"],
    "Telegram alert chat ID",
  );
}

if (!botOnly) {
  // Dashboard
  requireAny(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"], "Dashboard Supabase URL");
  requireAny(
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
    "Dashboard Supabase anon key",
  );

  warnAny(["DASHBOARD_ADMIN_EMAILS"], "Admin email list (required for dashboard auth)");
  warnAny(["INNGEST_EVENT_API_URL"], "Inngest event URL (agent invocation will fail)");
}

if (warnings.length > 0) {
  console.log("\n! Optional variables not set:");
  for (const warning of warnings) {
    console.log(warning);
  }
}

if (errors.length > 0) {
  console.error("\nX Required environment variables missing:");
  for (const error of errors) {
    console.error(error);
  }
  console.error(
    `\n${errors.length} required variable(s) missing. Set them in .env / dashboard/.env.local or your shell environment.`,
  );
  process.exit(1);
}

console.log("\nOK All required environment variables are set.");
