#!/usr/bin/env node

import { loadLocalEnv } from "../../lib/load-local-env.mjs";

loadLocalEnv();

function parseArgs(argv) {
  const args = {
    endpoint: "https://api.anthropic.com/v1/models",
    timeoutMs: 10000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--endpoint" && argv[i + 1]) args.endpoint = argv[i + 1];
    if (arg === "--timeout-ms" && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) args.timeoutMs = parsed;
    }
  }

  return args;
}

function maskKey(apiKey) {
  if (typeof apiKey !== "string" || apiKey.length < 10) return "redacted";
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}

async function probeKey(keyName, apiKey, endpoint, timeoutMs) {
  if (!apiKey) {
    return {
      key_name: keyName,
      action: "probe-anthropic-key",
      ok: false,
      error: `${keyName} is not set`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();
  const requestId =
    response.headers.get("request-id")
    || response.headers.get("x-request-id")
    || null;

  return {
    key_name: keyName,
    action: "probe-anthropic-key",
    endpoint,
    timeout_ms: timeoutMs,
    request_id: requestId,
    status: response.status,
    key: maskKey(apiKey),
    ok: response.ok,
    ...(response.ok ? {} : { error: "anthropic_key_probe_failed", response_excerpt: body.slice(0, 300) }),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sovereignKey = process.env.ANTHROPIC_API_KEY_SOVEREIGN || "";
  const sharedKey    = process.env.ANTHROPIC_API_KEY_SHARED    || "";

  const [sovereignReport, sharedReport] = await Promise.all([
    probeKey("ANTHROPIC_API_KEY_SOVEREIGN", sovereignKey, args.endpoint, args.timeoutMs),
    probeKey("ANTHROPIC_API_KEY_SHARED",    sharedKey,    args.endpoint, args.timeoutMs),
  ]);

  const allOk = sovereignReport.ok && sharedReport.ok;

  if (!allOk) {
    console.error(JSON.stringify({ results: [sovereignReport, sharedReport], all_ok: allOk }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ results: [sovereignReport, sharedReport], all_ok: allOk }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        action: "probe-anthropic-key",
        status: "failed",
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
