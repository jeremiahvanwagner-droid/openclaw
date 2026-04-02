import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const FUNCTION_FILES = [
  "inngest/functions/agent-orchestrator.ts",
  "inngest/functions/d8-saas-operations.ts",
  "inngest/functions/phase1-foundation.ts",
  "inngest/functions/phase2-intelligence.ts",
  "inngest/functions/phase3-execution.ts",
  "inngest/functions/self-healing-coding.ts",
  "inngest/functions/training-protocol.ts",
  "inngest/functions/weekly-meeting.ts",
];

describe("Inngest idempotency keys", () => {
  it("every event-triggered function has an idempotency field", () => {
    const missing: string[] = [];

    for (const rel of FUNCTION_FILES) {
      const src = readFileSync(path.join(root, rel), "utf8");
      const lines = src.split("\n");

      for (let i = 0; i < lines.length; i++) {
        // Find trigger lines that are event-based (not cron)
        const triggerMatch = /^\s*\{ event:\s*"([^"]+)"/.exec(lines[i]);
        if (!triggerMatch) continue;

        // Look backward (up to 20 lines) for the options object
        let hasIdempotency = false;
        for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
          const l = lines[j];
          if (/idempotency/.test(l)) {
            hasIdempotency = true;
            break;
          }
          // Stop at createFunction( to avoid bleeding into previous function
          if (/createFunction\s*\(/.test(l)) break;
        }

        if (!hasIdempotency) {
          // Find the function name (look back further for export const)
          let funcName = "unknown";
          for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
            const m = /export const (\w+)/.exec(lines[j]);
            if (m) { funcName = m[1]; break; }
          }
          missing.push(`${rel} → ${funcName} (event: ${triggerMatch[1]})`);
        }
      }
    }

    expect(missing).toHaveLength(0);
  });

  it("cron-triggered functions do NOT have an idempotency field", () => {
    const wronglySet: string[] = [];

    for (const rel of FUNCTION_FILES) {
      const src = readFileSync(path.join(root, rel), "utf8");
      const lines = src.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const cronMatch = /^\s*\{ cron:/.exec(lines[i]);
        if (!cronMatch) continue;

        // Look backward up to 10 lines
        for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
          if (/idempotency/.test(lines[j])) {
            let funcName = "unknown";
            for (let k = j - 1; k >= Math.max(0, j - 20); k--) {
              const m = /export const (\w+)/.exec(lines[k]);
              if (m) { funcName = m[1]; break; }
            }
            wronglySet.push(`${rel} → ${funcName} (should NOT have idempotency)`);
            break;
          }
          if (/createFunction\s*\(/.test(lines[j])) break;
        }
      }
    }

    expect(wronglySet).toHaveLength(0);
  });

  it("agentInvoke uses correlation_id, not event.id", () => {
    const src = readFileSync(
      path.join(root, "inngest/functions/agent-orchestrator.ts"),
      "utf8"
    );
    // Find agent-invoke options block
    const invokeIdx = src.indexOf('"agent-invoke"');
    expect(invokeIdx).toBeGreaterThan(-1);

    // Within 200 chars after id, find idempotency
    const slice = src.slice(invokeIdx, invokeIdx + 300);
    expect(slice).toContain('idempotency: "event.data.correlation_id"');
    expect(slice).not.toContain('idempotency: "event.id"');
  });
});
