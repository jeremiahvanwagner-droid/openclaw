#!/usr/bin/env node

const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENCLAW_GATEWAY_AUTH_TOKEN",
  "OPENCLAW_GHL_WEBHOOK_SECRET",
  "OPENCLAW_TELEGRAM_WEBHOOK_SECRET",
  "OPENCLAW_DASHBOARD_BASE_URL",
  "DASHBOARD_ADMIN_EMAILS",
];

const missing = REQUIRED_ENV_KEYS.filter((key) => {
  const value = process.env[key];
  return typeof value !== "string" || value.trim().length === 0;
});

if (missing.length > 0) {
  console.error(`Missing required security env vars: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Security preflight passed.");
