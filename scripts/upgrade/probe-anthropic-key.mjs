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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  let response;
  try {
    response = await fetch(args.endpoint, {
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

  const report = {
    action: "probe-anthropic-key",
    endpoint: args.endpoint,
    timeout_ms: args.timeoutMs,
    request_id: requestId,
    status: response.status,
    key: maskKey(apiKey),
    ok: response.ok,
  };

  if (!response.ok) {
    report.error = "anthropic_key_probe_failed";
    report.response_excerpt = body.slice(0, 300);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(report, null, 2));
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
