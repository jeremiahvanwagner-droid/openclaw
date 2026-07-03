#!/usr/bin/env node
/**
 * Provider Preflight Gate — Advancement 2
 * (docs/advancements/02-advancement-provider-preflight-degrade.md)
 *
 * openclaw's provider preflight aborts crons instead of degrading, so a single
 * bad endpoint/model/token silently kills every scheduled task platform-wide
 * (REGGIE-STATE audits 2026-05-14-001, 2026-05-16-001; Telegram 401 storm,
 * March 2026). This gate verifies BEFORE a config ships or a runtime restarts:
 *
 *   1. Every ollama/* model referenced by the config resolves against a
 *      reachable Ollama endpoint with the tag actually pulled.
 *   2. Every model tag pinned in cron payloads is pulled.
 *   3. Telegram bot token(s) answer getMe.
 *   4. Anthropic API key(s) answer /v1/models (via probe-anthropic-key.mjs).
 *
 * Exit 0 = safe to ship. Exit 1 = at least one FAIL (block the deploy).
 * Unconfigured surfaces are SKIPped, never failed.
 *
 * Usage:
 *   node scripts/preflight-providers.mjs \
 *     [--config <openclaw.json>] [--cron <jobs.json>] [--env-file <file>] \
 *     [--skip-anthropic]
 */

import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocalEnv } from "../lib/load-local-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function argValue(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
}
const configPath =
  argValue("--config") ||
  path.join(process.env.USERPROFILE || process.env.HOME || "", ".openclaw", "openclaw.json");
const cronPath = argValue("--cron") || path.join(path.dirname(configPath), "cron", "jobs.json");
const extraEnvFile = argValue("--env-file");
const skipAnthropic = argv.includes("--skip-anthropic");

// ── env ─────────────────────────────────────────────────────────────────────
loadLocalEnv();
if (extraEnvFile) {
  loadLocalEnv({
    rootDir: path.dirname(path.resolve(extraEnvFile)),
    envFiles: [path.basename(extraEnvFile)],
  });
}

// ── result collection ───────────────────────────────────────────────────────
const results = [];
function record(status, label, detail) {
  results.push({ status, label, detail });
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ""}`);
}

// ── config scan (shape-agnostic recursive walk) ─────────────────────────────
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) walk(value, visit);
}

function collectModelRefs(config) {
  const refs = new Set();
  walk(config, (obj) => {
    // active-map style: "models": { "ollama/qwen3:14b": {}, ... }
    if (obj.models && typeof obj.models === "object" && !Array.isArray(obj.models)) {
      for (const key of Object.keys(obj.models)) {
        if (key.includes("/")) refs.add(key);
      }
    }
    // per-agent style: "model": "ollama/qwen3:14b"
    if (typeof obj.model === "string" && obj.model.includes("/")) refs.add(obj.model);
  });
  return refs;
}

function findOllamaBaseUrl(config) {
  let baseUrl;
  walk(config, (obj) => {
    if (obj.api === "ollama" && typeof obj.baseUrl === "string") baseUrl = obj.baseUrl;
  });
  return baseUrl || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
}

function collectCronModelTags(cronFile) {
  const tags = new Set();
  if (!existsSync(cronFile)) return tags;
  try {
    const jobs = JSON.parse(readFileSync(cronFile, "utf8")).jobs ?? [];
    for (const job of jobs) {
      if (job.enabled === false) continue;
      const m = job?.payload?.model;
      if (typeof m === "string" && m.trim()) tags.add(m.trim());
    }
  } catch (err) {
    record("FAIL", "cron store parse", `${cronFile}: ${err.message}`);
  }
  return tags;
}

// ── checks ──────────────────────────────────────────────────────────────────
async function checkOllama(config, cronTags) {
  const refs = collectModelRefs(config);
  const wanted = new Set(
    [...refs].filter((r) => r.startsWith("ollama/")).map((r) => r.slice("ollama/".length)),
  );
  for (const tag of cronTags) {
    // bare cron tags (no provider prefix) resolve through the ollama provider
    if (!tag.includes("/")) wanted.add(tag);
    else if (tag.startsWith("ollama/")) wanted.add(tag.slice("ollama/".length));
  }
  if (wanted.size === 0) {
    record("SKIP", "ollama", "no ollama models referenced by config or cron");
    return;
  }
  const base = findOllamaBaseUrl(config).replace(/\/v1\/?$/, "").replace(/\/$/, "");
  let pulled;
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pulled = new Set(((await res.json()).models ?? []).map((m) => m.name));
  } catch (err) {
    record("FAIL", "ollama endpoint", `${base} unreachable (${err.message})`);
    return;
  }
  let ok = true;
  for (const tag of wanted) {
    if (!pulled.has(tag)) {
      ok = false;
      record("FAIL", `ollama model ${tag}`, `referenced but not pulled at ${base}`);
    }
  }
  if (ok) record("PASS", "ollama", `${base} serving all ${wanted.size} referenced tag(s): ${[...wanted].join(", ")}`);
}

async function checkTelegram() {
  const tokens = new Map(); // token -> var names
  for (const varName of ["TELEGRAM_BOT_TOKEN", "OPENCLAW_TELEGRAM_BOT_TOKEN"]) {
    const v = process.env[varName];
    if (v) tokens.set(v, [...(tokens.get(v) ?? []), varName]);
  }
  if (tokens.size === 0) {
    record("SKIP", "telegram", "no bot token in environment");
    return;
  }
  for (const [token, varNames] of tokens) {
    const label = `telegram getMe (${varNames.join("=")})`;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json();
      if (body.ok) record("PASS", label, `bot @${body.result?.username ?? "?"}`);
      else record("FAIL", label, `HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
    } catch (err) {
      record("FAIL", label, `unreachable (${err.message})`);
    }
  }
}

function checkAnthropic() {
  if (skipAnthropic) {
    record("SKIP", "anthropic", "--skip-anthropic");
    return;
  }
  const keyVars = ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY_SOVEREIGN", "ANTHROPIC_API_KEY_SHARED"];
  if (!keyVars.some((k) => process.env[k])) {
    record("SKIP", "anthropic", "no API key in environment (claude-cli models are subscription-routed)");
    return;
  }
  const probe = path.join(__dirname, "upgrade", "probe-anthropic-key.mjs");
  const run = spawnSync(process.execPath, [probe], { encoding: "utf8", timeout: 30000 });
  if (run.status === 0) {
    record("PASS", "anthropic", "probe-anthropic-key.mjs exit 0");
  } else {
    const tail = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-3).join(" | ");
    record("FAIL", "anthropic", `probe exit ${run.status}: ${tail}`);
  }
}

// ── main ────────────────────────────────────────────────────────────────────
if (!existsSync(configPath)) {
  record("FAIL", "config", `${configPath} not found`);
} else {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    record("FAIL", "config parse", `${configPath}: ${err.message}`);
  }
  if (config) {
    console.log(`Preflight against config: ${configPath}`);
    const cronTags = collectCronModelTags(cronPath);
    if (cronTags.size > 0) console.log(`Cron store: ${cronPath} (${cronTags.size} pinned model tag(s))`);
    await checkOllama(config, cronTags);
    await checkTelegram();
    checkAnthropic();
  }
}

const failures = results.filter((r) => r.status === "FAIL");
if (failures.length > 0) {
  console.error(`\nPREFLIGHT FAIL — ${failures.length} blocking issue(s). Do NOT ship this config.`);
  process.exit(1);
}
console.log("\nPREFLIGHT OK — all configured providers reachable, referenced models present.");
