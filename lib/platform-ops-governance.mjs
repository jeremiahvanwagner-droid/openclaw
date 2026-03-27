import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const DEFAULT_PATHS = {
  browserProfiles: path.join(ROOT_DIR, "config", "browser-profiles.json"),
  platformLanes: path.join(ROOT_DIR, "config", "platform-lanes.json"),
  approvalPolicies: path.join(ROOT_DIR, "config", "approval-policies.json"),
  routingPolicy: path.join(ROOT_DIR, "config", "governance", "platform-routing-policy.json"),
};

const DEFAULT_STATE_PATHS = {
  antiLoop: path.join(ROOT_DIR, "data", "runtime", "platform-anti-loop-ledger.json"),
  idempotency: path.join(ROOT_DIR, "data", "runtime", "platform-idempotency-ledger.json"),
  rateLimit: path.join(ROOT_DIR, "data", "runtime", "platform-rate-limit-ledger.json"),
  auditLog: path.join(ROOT_DIR, "logs", "platform-ops-audit.jsonl"),
};

const REQUIRED_PROFILES = ["ghl-live", "social-live", "content-live", "sandbox-test"];
const REQUIRED_LANES = ["ghl", "social", "skool", "substack"];
const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key|authorization|cookie|session)/i;

function timestamp(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function ensureObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getByPath(target, fieldPath) {
  if (!fieldPath) return undefined;
  if (!target || typeof target !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(target, fieldPath)) return target[fieldPath];

  const segments = fieldPath.split(".").filter(Boolean);
  let cursor = target;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function normalizeTokenValue(value) {
  if (value === null || value === undefined) return "missing";
  const text = String(value).trim().toLowerCase();
  if (!text) return "missing";
  return text.slice(0, 120);
}

function buildCompositeContext(request = {}) {
  const payload = ensureObject(request.payload);
  const merged = {
    ...payload,
    lane: request.lane,
    action: request.action,
    source: request.source,
    platform: request.platform || payload.platform,
    agent_id: request.agentId,
    agentId: request.agentId,
    correlation_id: request.correlationId,
    correlationId: request.correlationId,
    entity_id:
      request.entityId ||
      payload.entity_id ||
      payload.contact_id ||
      payload.draft_id ||
      payload.post_id ||
      payload.member_id ||
      payload.workflow_id ||
      payload.opportunity_id,
  };

  if (merged.entity_id !== undefined) {
    merged.entityId = merged.entity_id;
  }

  return merged;
}

function deriveKeyFromExpression(expression, context) {
  const strategy = normalizeString(expression);
  if (!strategy) return null;

  const tokens = strategy
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const values = tokens.map((token) => {
    const value = getByPath(context, token);
    return normalizeTokenValue(value);
  });

  if (values.some((value) => value === "missing")) {
    return null;
  }

  return values.join("|");
}

function deriveFingerprint(fields, context) {
  const list = asArray(fields).filter(Boolean);
  if (list.length === 0) {
    return sha(JSON.stringify(context));
  }

  const joined = list
    .map((field) => `${field}:${normalizeTokenValue(getByPath(context, field))}`)
    .join("|");

  return sha(joined);
}

function sanitizeForAudit(value, depth = 0) {
  if (depth > 6) return "[TRUNCATED_DEPTH]";
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeForAudit(entry, depth + 1));
  }

  if (typeof value === "object") {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeForAudit(entry, depth + 1);
      }
    }
    return result;
  }

  if (typeof value === "string") {
    if (value.length > 500) return `${value.slice(0, 497)}...`;
    return value;
  }

  return value;
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function appendJsonLine(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function matchRule(rule, request) {
  const match = ensureObject(rule.match);
  const field = normalizeString(match.field);
  if (!field) return false;

  const candidate = getByPath(request, field);
  const operator = normalizeString(match.operator);

  if (operator === "equals") {
    return normalizeTokenValue(candidate) === normalizeTokenValue(match.value);
  }

  if (operator === "in") {
    const accepted = asArray(match.values).map((entry) => normalizeTokenValue(entry));
    return accepted.includes(normalizeTokenValue(candidate));
  }

  if (operator === "prefix") {
    const prefix = normalizeTokenValue(match.value);
    return normalizeTokenValue(candidate).startsWith(prefix);
  }

  return false;
}

function resolveLaneFromRoutingPolicy(request, routingPolicy = {}) {
  const normalizedRequest = {
    ...request,
    payload: ensureObject(request.payload),
  };

  const routeRules = asArray(routingPolicy.rules)
    .filter((rule) => typeof rule?.priority === "number")
    .sort((a, b) => b.priority - a.priority);

  for (const rule of routeRules) {
    if (!matchRule(rule, normalizedRequest) && !matchRule(rule, normalizedRequest.payload)) {
      continue;
    }

    if (rule.route_to_lane_field_value) {
      const lane = normalizeString(normalizedRequest.lane);
      if (lane) return lane;
      continue;
    }

    const lane = normalizeString(rule.route_to_lane);
    if (lane) return lane;
  }

  const fallbackLane = normalizeString(routingPolicy?.fallback?.route_to_lane);
  return fallbackLane || "";
}

function resolveStatePaths(bundle) {
  const controls = ensureObject(bundle.platformLanes?.global_controls);
  return {
    antiLoop: normalizePath(controls.anti_loop_ledger) || DEFAULT_STATE_PATHS.antiLoop,
    idempotency: normalizePath(controls.idempotency_ledger) || DEFAULT_STATE_PATHS.idempotency,
    rateLimit: normalizePath(controls.rate_limit_ledger) || DEFAULT_STATE_PATHS.rateLimit,
    auditLog: normalizePath(controls.audit_log_target) || DEFAULT_STATE_PATHS.auditLog,
  };
}

function assertRiskTier(approvalPolicies, riskTier) {
  const tiers = ensureObject(approvalPolicies?.risk_tiers);
  return Boolean(tiers[riskTier]);
}

function hasDestructiveKeyword(action) {
  return /(delete|ban|bulk|remove|unpublish|publish|send)/i.test(action);
}

function checkRequiredFields(requiredInputs, action, payload) {
  const required = asArray(requiredInputs?.[action]);
  if (required.length === 0) return { ok: true, missing: [] };

  const missing = required.filter((field) => {
    const value = getByPath(payload, field);
    return value === undefined || value === null || value === "";
  });

  return {
    ok: missing.length === 0,
    missing,
  };
}

function computeRateLimit(profileName, profileConfig, platform, rateLedger, nowMs) {
  const limits = ensureObject(profileConfig?.rate_limits);
  const perPlatform = ensureObject(limits.per_platform);

  let maxRequests = 0;
  let windowMs = 60 * 1000;
  let scope = profileName;

  if (typeof limits.requests_per_minute === "number") {
    maxRequests = limits.requests_per_minute;
    windowMs = 60 * 1000;
    scope = profileName;
  } else if (platform && perPlatform[platform]) {
    const platformLimits = ensureObject(perPlatform[platform]);
    if (typeof platformLimits.requests_per_hour === "number") {
      maxRequests = platformLimits.requests_per_hour;
      windowMs = 60 * 60 * 1000;
      scope = `${profileName}:${platform}`;
    } else if (typeof platformLimits.requests_per_minute === "number") {
      maxRequests = platformLimits.requests_per_minute;
      windowMs = 60 * 1000;
      scope = `${profileName}:${platform}`;
    }
  }

  if (!maxRequests || maxRequests < 1) {
    return {
      enabled: false,
      limited: false,
      ledger: rateLedger,
      limit: null,
      current: 0,
      window_start_ms: nowMs,
      window_end_ms: nowMs,
      scope,
      key: "",
    };
  }

  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;
  const key = `${scope}:${windowStart}`;

  const entries = asArray(rateLedger.entries).filter((entry) => entry?.window_end_ms > nowMs);
  const existing = entries.find((entry) => entry?.key === key);
  const current = existing ? existing.count : 0;

  const limited = current >= maxRequests;

  return {
    enabled: true,
    limited,
    ledger: { entries },
    limit: maxRequests,
    current,
    window_start_ms: windowStart,
    window_end_ms: windowEnd,
    scope,
    key,
  };
}

function applyRateLimit(rateCheck, rateLedger) {
  if (!rateCheck.enabled || rateCheck.limited) return rateLedger;

  const entries = asArray(rateLedger.entries);
  const existing = entries.find((entry) => entry?.key === rateCheck.key);
  if (existing) {
    existing.count += 1;
    existing.updated_at = timestamp();
    return { entries };
  }

  entries.push({
    key: rateCheck.key,
    scope: rateCheck.scope,
    count: 1,
    limit: rateCheck.limit,
    window_start_ms: rateCheck.window_start_ms,
    window_end_ms: rateCheck.window_end_ms,
    created_at: timestamp(),
    updated_at: timestamp(),
  });

  return { entries };
}

export async function loadPlatformOpsBundle(paths = {}) {
  const browserProfiles = await readJson(paths.browserProfiles || DEFAULT_PATHS.browserProfiles);
  const platformLanes = await readJson(paths.platformLanes || DEFAULT_PATHS.platformLanes);
  const approvalPolicies = await readJson(paths.approvalPolicies || DEFAULT_PATHS.approvalPolicies);
  const routingPolicy = await readJson(paths.routingPolicy || DEFAULT_PATHS.routingPolicy, {
    rules: [],
    fallback: { route_to_lane: "" },
  });

  if (!browserProfiles || !platformLanes || !approvalPolicies) {
    throw new Error("Platform ops configuration files are missing or unreadable");
  }

  return {
    browserProfiles,
    platformLanes,
    approvalPolicies,
    routingPolicy,
    loaded_at: timestamp(),
  };
}

export function validatePlatformOpsBundle(bundle) {
  const errors = [];
  const warnings = [];

  const profiles = ensureObject(bundle?.browserProfiles?.profiles);
  const lanes = ensureObject(bundle?.platformLanes?.lanes);
  const riskTiers = ensureObject(bundle?.approvalPolicies?.risk_tiers);

  for (const profileName of REQUIRED_PROFILES) {
    if (!profiles[profileName]) {
      errors.push(`Missing required browser profile: ${profileName}`);
    }
  }

  for (const laneName of REQUIRED_LANES) {
    if (!lanes[laneName]) {
      errors.push(`Missing required platform lane: ${laneName}`);
    }
  }

  for (const [laneName, laneConfig] of Object.entries(lanes)) {
    const profileName = normalizeString(laneConfig.browser_profile);
    if (!profileName) {
      errors.push(`Lane ${laneName} missing browser_profile`);
      continue;
    }

    const profile = profiles[profileName];
    if (!profile) {
      errors.push(`Lane ${laneName} references unknown browser profile ${profileName}`);
      continue;
    }

    const operations = ensureObject(laneConfig.operations);
    if (Object.keys(operations).length === 0) {
      errors.push(`Lane ${laneName} has no operations defined`);
    }

    for (const [action, operation] of Object.entries(operations)) {
      const riskTier = normalizeString(operation.risk || profile.risk_tier || "low");
      if (!assertRiskTier({ risk_tiers: riskTiers }, riskTier)) {
        errors.push(`Lane ${laneName} action ${action} uses unknown risk tier ${riskTier}`);
      }

      const profileAllowed = asArray(profile.allowed_actions);
      const profileGated = asArray(profile.gated_actions);
      const profileForbidden = asArray(profile.forbidden_actions);
      const hasWildcard = profileAllowed.includes("*");

      if (!hasWildcard && !profileAllowed.includes(action) && !profileGated.includes(action) && !profileForbidden.includes(action)) {
        warnings.push(`Lane ${laneName} action ${action} is not declared in browser profile ${profileName}`);
      }

      if (hasDestructiveKeyword(action) && operation.requires_approval !== true && riskTier !== "low" && riskTier !== "medium") {
        errors.push(`Lane ${laneName} action ${action} appears destructive but does not require approval`);
      }
    }

    if (!laneConfig.rollback || Object.keys(ensureObject(laneConfig.rollback)).length === 0) {
      warnings.push(`Lane ${laneName} has no rollback mapping`);
    }

    if (!Array.isArray(laneConfig.trigger_conditions) || laneConfig.trigger_conditions.length === 0) {
      warnings.push(`Lane ${laneName} has no trigger_conditions`);
    }

    if (!Array.isArray(laneConfig.audit_log_fields) || laneConfig.audit_log_fields.length === 0) {
      warnings.push(`Lane ${laneName} has no audit_log_fields`);
    }
  }

  const summary = {
    profile_count: Object.keys(profiles).length,
    lane_count: Object.keys(lanes).length,
    risk_tier_count: Object.keys(riskTiers).length,
    error_count: errors.length,
    warning_count: warnings.length,
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary,
  };
}

export async function evaluatePlatformOperation(request = {}, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const persist = options.persist !== false;

  const bundle = options.bundle || (await loadPlatformOpsBundle());
  const validation = validatePlatformOpsBundle(bundle);
  if (!validation.ok) {
    return {
      ok: false,
      status: "config_invalid",
      generated_at: timestamp(nowMs),
      reason: validation.errors.join("; "),
      validation,
    };
  }

  const routingPolicy = ensureObject(bundle.routingPolicy);
  const laneName = normalizeString(request.lane) || resolveLaneFromRoutingPolicy(request, routingPolicy);
  const action = normalizeString(request.action);

  if (!laneName || !action) {
    return {
      ok: false,
      status: "invalid_request",
      generated_at: timestamp(nowMs),
      reason: "Request must include lane and action (or resolvable lane source)",
    };
  }

  const laneConfig = ensureObject(bundle.platformLanes?.lanes?.[laneName]);
  if (Object.keys(laneConfig).length === 0) {
    return {
      ok: false,
      status: "lane_not_found",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      reason: `Unknown lane: ${laneName}`,
    };
  }

  const operation = ensureObject(laneConfig.operations?.[action]);
  if (Object.keys(operation).length === 0) {
    return {
      ok: false,
      status: "operation_not_supported",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      reason: `Operation ${action} is not defined for lane ${laneName}`,
    };
  }

  const profiles = ensureObject(bundle.browserProfiles?.profiles);
  const profileName = normalizeString(request.profile) || normalizeString(laneConfig.browser_profile);
  const profileConfig = ensureObject(profiles[profileName]);
  if (Object.keys(profileConfig).length === 0) {
    return {
      ok: false,
      status: "profile_not_found",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      reason: `Unknown browser profile: ${profileName}`,
    };
  }

  const payload = ensureObject(request.payload);
  const platform = normalizeString(request.platform || payload.platform || request.source);

  const allowedPlatforms = asArray(profileConfig.allowed_platforms);
  if (platform && allowedPlatforms.length > 0 && !allowedPlatforms.includes(platform)) {
    return {
      ok: false,
      status: "platform_not_allowed",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      platform,
      reason: `Platform ${platform} is not allowed for profile ${profileName}`,
    };
  }

  const allowedActions = asArray(profileConfig.allowed_actions);
  const gatedActions = asArray(profileConfig.gated_actions);
  const forbiddenActions = asArray(profileConfig.forbidden_actions);
  const wildcardAllowed = allowedActions.includes("*");

  if (forbiddenActions.includes(action)) {
    return {
      ok: false,
      status: "action_forbidden",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      reason: `Action ${action} is forbidden for profile ${profileName}`,
    };
  }

  if (!wildcardAllowed && !allowedActions.includes(action) && !gatedActions.includes(action)) {
    return {
      ok: false,
      status: "action_not_allowed",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      reason: `Action ${action} is not allowed for profile ${profileName}`,
    };
  }

  const inputCheck = checkRequiredFields(laneConfig.required_inputs, action, payload);
  if (!inputCheck.ok) {
    return {
      ok: false,
      status: "missing_required_inputs",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      missing_inputs: inputCheck.missing,
      reason: `Missing required inputs for ${action}: ${inputCheck.missing.join(", ")}`,
    };
  }

  const approvalPolicies = ensureObject(bundle.approvalPolicies);
  const riskTier = normalizeString(operation.risk || profileConfig.risk_tier || "low");
  const riskPolicy = ensureObject(approvalPolicies.risk_tiers?.[riskTier]);
  if (Object.keys(riskPolicy).length === 0) {
    return {
      ok: false,
      status: "risk_policy_missing",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      risk_tier: riskTier,
      reason: `No approval policy configured for risk tier ${riskTier}`,
    };
  }

  const pauseSwitch = ensureObject(approvalPolicies.human_override_switch);
  const pauseEnvVar = normalizeString(pauseSwitch.env_var);
  const pauseValue = normalizeString(pauseSwitch.value_to_pause);
  if (pauseEnvVar && pauseValue && normalizeString(process.env[pauseEnvVar]) === pauseValue) {
    return {
      ok: false,
      status: "paused_by_human_override",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      risk_tier: riskTier,
      reason: `Autonomous execution paused by ${pauseEnvVar}`,
      controls: {
        pause_switch: {
          env_var: pauseEnvVar,
          value: pauseValue,
        },
      },
    };
  }

  const context = buildCompositeContext({
    ...request,
    lane: laneName,
    action,
    payload,
    platform,
  });

  const statePaths = resolveStatePaths(bundle);
  const antiLoopLedger = (await readJson(statePaths.antiLoop, { entries: [] })) || { entries: [] };
  const idempotencyLedger = (await readJson(statePaths.idempotency, { entries: [] })) || { entries: [] };
  const rateLimitLedger = (await readJson(statePaths.rateLimit, { entries: [] })) || { entries: [] };

  const antiLoopConfig = ensureObject(laneConfig.anti_loop_config);
  const antiLoopEnabled = antiLoopConfig.enabled !== false;
  const antiLoopWindowSeconds = Number(antiLoopConfig.window_seconds) || 300;
  const antiLoopMaxIdentical = Number(antiLoopConfig.max_identical_ops) || 3;
  const antiLoopFingerprint = deriveFingerprint(antiLoopConfig.fingerprint_fields, context);

  const antiLoopCutoff = nowMs - antiLoopWindowSeconds * 1000;
  const antiLoopEntries = asArray(antiLoopLedger.entries).filter((entry) => {
    return Number(entry?.timestamp_ms) >= antiLoopCutoff;
  });

  const antiLoopCount = antiLoopEntries.filter((entry) => {
    return entry?.lane === laneName && entry?.action === action && entry?.fingerprint === antiLoopFingerprint;
  }).length;

  if (antiLoopEnabled && antiLoopCount >= antiLoopMaxIdentical) {
    return {
      ok: false,
      status: "loop_blocked",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      risk_tier: riskTier,
      reason: `Anti-loop guard blocked operation after ${antiLoopCount} matching attempts`,
      controls: {
        anti_loop: {
          enabled: true,
          fingerprint: antiLoopFingerprint,
          count: antiLoopCount,
          max: antiLoopMaxIdentical,
          window_seconds: antiLoopWindowSeconds,
        },
      },
    };
  }

  const idempotencyDefaults = ensureObject(approvalPolicies.idempotency_defaults);
  const idempotencyEnabled = operation.idempotent !== false && idempotencyDefaults.enabled !== false;
  const idempotencyTtlHours = Number(idempotencyDefaults.dedupe_ttl_hours) || 72;
  const idempotencyCutoff = nowMs - idempotencyTtlHours * 60 * 60 * 1000;
  const idempotencyKey =
    normalizeString(payload.idempotency_key) ||
    deriveKeyFromExpression(operation.idempotency_key, context) ||
    "";

  const idempotencyEntries = asArray(idempotencyLedger.entries).filter((entry) => {
    return Number(entry?.timestamp_ms) >= idempotencyCutoff;
  });

  const duplicateHit = idempotencyEnabled && idempotencyKey
    ? idempotencyEntries.find((entry) => {
      return entry?.lane === laneName && entry?.action === action && entry?.idempotency_key === idempotencyKey;
    })
    : null;

  if (duplicateHit && idempotencyDefaults.reject_on_duplicate !== false) {
    return {
      ok: false,
      status: "duplicate_blocked",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      risk_tier: riskTier,
      reason: `Idempotency guard blocked duplicate key ${idempotencyKey}`,
      controls: {
        idempotency: {
          enabled: true,
          key: idempotencyKey,
          previous_correlation_id: duplicateHit.correlation_id || null,
        },
      },
    };
  }

  const rateCheck = computeRateLimit(profileName, profileConfig, platform, rateLimitLedger, nowMs);
  if (rateCheck.limited) {
    return {
      ok: false,
      status: "rate_limited",
      generated_at: timestamp(nowMs),
      lane: laneName,
      action,
      profile: profileName,
      risk_tier: riskTier,
      platform: platform || null,
      reason: `Rate limit reached for ${rateCheck.scope} (${rateCheck.current}/${rateCheck.limit})`,
      controls: {
        rate_limit: {
          enabled: true,
          scope: rateCheck.scope,
          current: rateCheck.current,
          limit: rateCheck.limit,
          window_start_ms: rateCheck.window_start_ms,
          window_end_ms: rateCheck.window_end_ms,
        },
      },
    };
  }

  const requiresApproval =
    operation.requires_approval === true ||
    riskPolicy.requires_approval === true ||
    gatedActions.includes(action);

  const correlationId = normalizeString(request.correlationId) || crypto.randomUUID();
  const entityId =
    normalizeString(request.entityId) ||
    normalizeString(context.entity_id) ||
    normalizeString(context.entityId) ||
    null;

  const dryRun = Boolean(profileConfig.dry_run || request.dryRun || request.simulateOnly);
  const status = requiresApproval
    ? "approval_required"
    : dryRun
      ? "approved_dry_run"
      : "approved_auto";

  const decision = {
    ok: true,
    status,
    generated_at: timestamp(nowMs),
    lane: laneName,
    action,
    profile: profileName,
    platform: platform || null,
    risk_tier: riskTier,
    requires_approval: requiresApproval,
    correlation_id: correlationId,
    entity_id: entityId,
    controls: {
      anti_loop: {
        enabled: antiLoopEnabled,
        fingerprint: antiLoopFingerprint,
        count: antiLoopCount,
        max: antiLoopMaxIdentical,
        window_seconds: antiLoopWindowSeconds,
      },
      idempotency: {
        enabled: idempotencyEnabled,
        key: idempotencyKey || null,
        duplicate: false,
      },
      rate_limit: {
        enabled: rateCheck.enabled,
        scope: rateCheck.scope,
        current: rateCheck.current + (rateCheck.enabled ? 1 : 0),
        limit: rateCheck.limit,
        window_start_ms: rateCheck.window_start_ms,
        window_end_ms: rateCheck.window_end_ms,
      },
      pause_switch: {
        env_var: pauseEnvVar || null,
        active: false,
      },
    },
    approval: requiresApproval ? riskPolicy.approval || { channels: [] } : null,
    next_step: requiresApproval
      ? "Queue approval request and wait for explicit confirmation"
      : dryRun
        ? "Execute in simulation mode only"
        : "Execute operation and record outcome",
  };

  if (persist) {
    const nextAntiLoopLedger = {
      entries: [
        ...antiLoopEntries,
        {
          lane: laneName,
          action,
          fingerprint: antiLoopFingerprint,
          timestamp_ms: nowMs,
          correlation_id: correlationId,
        },
      ],
    };

    const nextIdempotencyLedger = {
      entries: idempotencyEnabled && idempotencyKey
        ? [
          ...idempotencyEntries,
          {
            lane: laneName,
            action,
            idempotency_key: idempotencyKey,
            timestamp_ms: nowMs,
            correlation_id: correlationId,
            status,
          },
        ]
        : idempotencyEntries,
    };

    const nextRateLedger = applyRateLimit(rateCheck, rateCheck.ledger || rateLimitLedger);

    await writeJson(statePaths.antiLoop, nextAntiLoopLedger);
    await writeJson(statePaths.idempotency, nextIdempotencyLedger);
    await writeJson(statePaths.rateLimit, nextRateLedger);

    await appendJsonLine(statePaths.auditLog, {
      timestamp: timestamp(nowMs),
      phase: "pre_execution",
      lane: laneName,
      action,
      profile: profileName,
      request: sanitizeForAudit({
        agent_id: request.agentId || "unknown",
        source: request.source || "unspecified",
        payload,
      }),
      decision: sanitizeForAudit(decision),
    });
  }

  return decision;
}

export async function recordPlatformOperationOutcome(outcome = {}, options = {}) {
  const bundle = options.bundle || (await loadPlatformOpsBundle());
  const statePaths = resolveStatePaths(bundle);
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();

  const record = {
    timestamp: timestamp(nowMs),
    phase: "post_execution",
    lane: normalizeString(outcome.lane),
    action: normalizeString(outcome.action),
    profile: normalizeString(outcome.profile),
    correlation_id: normalizeString(outcome.correlation_id) || null,
    status: normalizeString(outcome.status) || "unknown",
    result: sanitizeForAudit(outcome.result || {}),
    error: sanitizeForAudit(outcome.error || null),
  };

  await appendJsonLine(statePaths.auditLog, record);
  return record;
}

export async function resetPlatformOpsLedgers(paths = {}) {
  const bundle = paths.bundle || (await loadPlatformOpsBundle(paths));
  const statePaths = resolveStatePaths(bundle);

  await writeJson(statePaths.antiLoop, { entries: [] });
  await writeJson(statePaths.idempotency, { entries: [] });
  await writeJson(statePaths.rateLimit, { entries: [] });

  return {
    ok: true,
    reset_at: timestamp(),
    state_paths: statePaths,
  };
}

export { DEFAULT_PATHS, DEFAULT_STATE_PATHS };
