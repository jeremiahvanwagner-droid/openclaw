import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_ROOT_DIR = resolvePath(__dirname, "..");
const DEFAULT_ENV_FILES = [".env", "dashboard/.env.local"];

function stripOuterQuotes(value) {
  if (!value) return value;
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  const envText = readFileSync(filePath, "utf8");

  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = stripOuterQuotes(line.slice(eqIndex + 1).trim());
    if (!key) continue;
    parsed[key] = value;
  }

  return parsed;
}

function expandValue(rawValue, lookup) {
  return rawValue.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => lookup[key] || "");
}

/**
 * Hydrates process.env from local env files if keys are missing.
 * Existing process env values are preserved unless override=true.
 */
export function loadLocalEnv(options = {}) {
  const rootDir = options.rootDir || DEFAULT_ROOT_DIR;
  const envFiles = options.envFiles || DEFAULT_ENV_FILES;
  const override = options.override === true;
  const loaded = {};

  for (const relativePath of envFiles) {
    const absolutePath = join(rootDir, relativePath);
    const parsed = parseEnvFile(absolutePath);

    // Build deterministic expansion lookup:
    // 1) current process env
    // 2) values already loaded from earlier files
    // 3) values from current file
    const expansionLookup = { ...process.env, ...loaded, ...parsed };

    for (const [key, rawValue] of Object.entries(parsed)) {
      const expandedValue = expandValue(rawValue, expansionLookup);
      loaded[key] = expandedValue;
      expansionLookup[key] = expandedValue;
      if (override || !process.env[key]) {
        process.env[key] = expandedValue;
      }
    }
  }

  return loaded;
}
