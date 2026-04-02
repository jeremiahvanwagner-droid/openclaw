import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const SOURCE_DIRS = ["skills", "lib", "handlers", "inngest"];
const EXTENSIONS = new Set([".mjs", ".ts", ".js"]);
const EXCLUDE_DIRS = new Set(["backups", "node_modules", "__tests__", ".git"]);

/** Recursively collect all source files (no backups, no tests) */
function gatherFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...gatherFiles(full));
      } else if (EXTENSIONS.has(path.extname(entry))) {
        results.push(full);
      }
    }
  } catch {
    // ignore permission errors
  }
  return results;
}

const allSourceFiles = SOURCE_DIRS.flatMap(d => gatherFiles(path.join(root, d)));

describe("Telegram chat_id hardening", () => {
  it("no production file assigns a literal numeric chat_id", () => {
    // Pattern: chat_id followed by : or = and then an optional quote + digits
    // e.g.  chat_id: "123456789"  or  chat_id: '-1001234567'
    const LITERAL_CHATID_RE = /chat_id\s*[:=]\s*['"` `]?\s*-?[0-9]{6,}/;
    const violations: string[] = [];

    for (const file of allSourceFiles) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (LITERAL_CHATID_RE.test(line)) {
          // Extra filter: exclude process.env references (they are safe)
          if (!line.includes("process.env")) {
            violations.push(`${path.relative(root, file)}:${i + 1} → ${line.trim()}`);
          }
        }
      });
    }

    expect(violations).toHaveLength(0);
  });

  it("all TELEGRAM_CHAT_ID variable declarations read from process.env", () => {
    // Every `const TELEGRAM_CHAT_ID = ...` must point to process.env
    const DECL_RE = /const\s+TELEGRAM_CHAT_ID\s*=/;
    const ENV_RE = /process\.env\./;
    const violations: string[] = [];

    for (const file of allSourceFiles) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (DECL_RE.test(line) && !ENV_RE.test(line)) {
          violations.push(`${path.relative(root, file)}:${i + 1} → ${line.trim()}`);
        }
      });
    }

    expect(violations).toHaveLength(0);
  });
});
