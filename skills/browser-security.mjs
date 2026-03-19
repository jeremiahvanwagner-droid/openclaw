import fs from "fs/promises";
import path from "path";

import { enforceSkillRegistry } from "../lib/security-governance.mjs";

const DEFAULT_BROWSER_FLAGS = [
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
];

function isTruthy(value) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function getBrowserStorageRoot() {
  return (
    process.env.OPENCLAW_BROWSER_DATA_DIR ||
    path.join(
      process.env.OPENCLAW_DATA_DIR ||
        path.join(process.env.USERPROFILE || process.env.HOME || ".", ".openclaw", "data"),
      "browser-runtime",
    )
  );
}

export function isUnsafeBrowserSandboxAllowed() {
  const environment = (process.env.NODE_ENV || process.env.OPENCLAW_ENVIRONMENT || "").toLowerCase();
  if (environment === "production") {
    return false;
  }

  return isTruthy(process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_NO_SANDBOX || "");
}

export async function ensureBrowserStorageDir(...segments) {
  const target = path.join(getBrowserStorageRoot(), ...segments);
  await fs.mkdir(target, { recursive: true });
  return target;
}

export async function buildBrowserLaunchArgs(extraArgs = []) {
  await enforceSkillRegistry({
    externalSystem: "browser",
    operation: "browser_launch",
    metadata: { extra_args: extraArgs },
  });

  const args = [...DEFAULT_BROWSER_FLAGS, ...extraArgs];
  if (isUnsafeBrowserSandboxAllowed()) {
    args.unshift("--disable-setuid-sandbox");
    args.unshift("--no-sandbox");
  }

  return args;
}
