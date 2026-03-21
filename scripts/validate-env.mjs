#!/usr/bin/env node
/**
 * Environment Variable Validator
 * OpenClaw Multi-Agent Network
 *
 * Checks all required environment variables on startup and fails fast
 * with clear messages about what's missing.
 *
 * Usage:
 *   node scripts/validate-env.mjs              # Validate all
 *   node scripts/validate-env.mjs --dashboard  # Dashboard only
 *   node scripts/validate-env.mjs --bot        # Bot/webhook only
 */

const args = process.argv.slice(2);
const dashboardOnly = args.includes("--dashboard");
const botOnly = args.includes("--bot");

const errors = [];
const warnings = [];

function requireEnv(name, description) {
  if (!process.env[name]) {
    errors.push(`  ✗ ${name} — ${description}`);
  }
}

function warnEnv(name, description) {
  if (!process.env[name]) {
    warnings.push(`  ⚠ ${name} — ${description}`);
  }
}

// ── Core (always required) ─────────────────────────────────────
requireEnv("SUPABASE_URL", "Supabase project URL");
requireEnv("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role JWT");

if (!dashboardOnly) {
  // ── Bot / Webhook ──────────────────────────────────────────
  requireEnv("GHL_PRIVATE_INTEGRATION_TOKEN", "GoHighLevel primary integration token");
  requireEnv("OPENCLAW_GATEWAY_AUTH_TOKEN", "Webhook → gateway auth token");
  requireEnv("OPENCLAW_GHL_WEBHOOK_SECRET", "GHL webhook HMAC secret");

  warnEnv("INNGEST_SIGNING_KEY", "Inngest function signing key");
  warnEnv("INNGEST_EVENT_KEY", "Inngest event dispatch key");
  warnEnv("OPENAI_API_KEY", "OpenAI API key (required for embeddings)");
  warnEnv("TELEGRAM_BOT_TOKEN", "Telegram bot token (alerts will be disabled)");
  warnEnv("TELEGRAM_ALERT_CHAT_ID", "Telegram alert chat ID");
}

if (!botOnly) {
  // ── Dashboard ──────────────────────────────────────────────
  requireEnv("NEXT_PUBLIC_SUPABASE_URL", "Dashboard Supabase URL");
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Dashboard Supabase anon key");

  warnEnv("DASHBOARD_ADMIN_EMAILS", "Admin email list (required for dashboard auth)");
  warnEnv("INNGEST_EVENT_API_URL", "Inngest event URL (agent invocation will fail)");
}

// ── Report ───────────────────────────────────────────────────
if (warnings.length > 0) {
  console.log("\n⚠ Optional variables not set:");
  for (const w of warnings) console.log(w);
}

if (errors.length > 0) {
  console.error("\n❌ Required environment variables missing:");
  for (const e of errors) console.error(e);
  console.error(`\n${errors.length} required variable(s) missing. Set them in /etc/openclaw/.env or your environment.`);
  process.exit(1);
} else {
  console.log("\n✓ All required environment variables are set.");
  process.exit(0);
}
