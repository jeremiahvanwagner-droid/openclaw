#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
  loadPlatformOpsBundle,
  validatePlatformOpsBundle,
} from "../../lib/platform-ops-governance.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function hasFlag(name) {
  return process.argv.includes(name);
}

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value ?? fallback;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function summarizeAuditLog(hours = 24) {
  const logPath = path.join(ROOT_DIR, "logs", "platform-ops-audit.jsonl");
  const exists = await fileExists(logPath);
  if (!exists) {
    return {
      path: logPath,
      exists: false,
      entries_in_window: 0,
      status_counts: {},
    };
  }

  const raw = await fs.readFile(logPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  const statusCounts = {};
  let windowEntries = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const ts = Date.parse(entry.timestamp || entry.generated_at || "");
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      windowEntries += 1;
      const status = entry?.decision?.status || entry?.status || "unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    } catch {
      // Skip malformed lines
    }
  }

  return {
    path: logPath,
    exists: true,
    entries_in_window: windowEntries,
    status_counts: statusCounts,
  };
}

async function main() {
  const compact = hasFlag("--compact");
  const fromAudit = hasFlag("--from-audit");
  const hours = Number(readArg("--hours", "24")) || 24;

  const bundle = await loadPlatformOpsBundle();
  const validation = validatePlatformOpsBundle(bundle);

  const openclawConfig = await readJson(path.join(ROOT_DIR, "config", "openclaw.json"), {});
  const prodConfig = await readJson(path.join(ROOT_DIR, "config", "openclaw.prod.json"), {});

  const files = {
    browser_profiles: await fileExists(path.join(ROOT_DIR, "config", "browser-profiles.json")),
    platform_lanes: await fileExists(path.join(ROOT_DIR, "config", "platform-lanes.json")),
    approval_policies: await fileExists(path.join(ROOT_DIR, "config", "approval-policies.json")),
    routing_policy: await fileExists(path.join(ROOT_DIR, "config", "governance", "platform-routing-policy.json")),
    risk_matrix: await fileExists(path.join(ROOT_DIR, "config", "governance", "platform-risk-tier-matrix.json")),
    platform_cron_jobs: await fileExists(path.join(ROOT_DIR, "config", "cron", "platform-ops-jobs.json")),
    worker_environment_map: await fileExists(path.join(ROOT_DIR, "data", "worker-environment-map.json")),
  };

  const envReadiness = {
    OPENCLAW_AUTONOMOUS_PAUSED_defined: Boolean(process.env.OPENCLAW_AUTONOMOUS_PAUSED !== undefined),
    TELEGRAM_BOT_TOKEN_defined: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    TELEGRAM_ALERT_CHAT_ID_defined: Boolean(process.env.TELEGRAM_ALERT_CHAT_ID || process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID),
    SUPABASE_URL_defined: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY_defined: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const openclawBrowser = {
    default_profile: openclawConfig?.browser?.defaultProfile || null,
    profile_count: Object.keys(openclawConfig?.browser?.profiles || {}).length,
  };

  const prodBrowser = {
    default_profile: prodConfig?.browser?.defaultProfile || null,
    profile_count: Object.keys(prodConfig?.browser?.profiles || {}).length,
  };

  const gaps = [];
  if (!validation.ok) {
    gaps.push("Lane/profile/policy configuration validation failed");
  }
  if (!files.worker_environment_map) {
    gaps.push("Worker environment map is missing (data/worker-environment-map.json)");
  }
  if (openclawBrowser.profile_count < 4) {
    gaps.push("config/openclaw.json browser profile count is below required multi-browser minimum (4)");
  }
  if (prodBrowser.profile_count < 4) {
    gaps.push("config/openclaw.prod.json browser profile count is below required multi-browser minimum (4)");
  }
  if (!envReadiness.TELEGRAM_BOT_TOKEN_defined) {
    gaps.push("Telegram bot token not visible in current shell session");
  }
  if (!envReadiness.SUPABASE_SERVICE_ROLE_KEY_defined) {
    gaps.push("Supabase service role key not visible in current shell session");
  }

  const report = {
    action: "platform-ops-diagnostic",
    timestamp: new Date().toISOString(),
    mode: fromAudit ? "audit-window" : "baseline",
    config_validation: validation,
    file_readiness: files,
    env_readiness: envReadiness,
    browser_runtime_snapshot: {
      local: openclawBrowser,
      production_template: prodBrowser,
    },
    gaps,
    status: gaps.length === 0 ? "ready" : "ready_with_gaps",
  };

  if (fromAudit) {
    report.audit_window = await summarizeAuditLog(hours);
    report.audit_window_hours = hours;
  }

  if (compact) {
    console.log(
      JSON.stringify(
        {
          action: report.action,
          timestamp: report.timestamp,
          status: report.status,
          gap_count: report.gaps.length,
          validation_ok: report.config_validation.ok,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(JSON.stringify(report, null, 2));
  if (!validation.ok) process.exit(1);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        action: "platform-ops-diagnostic",
        status: "failed",
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
