/**
 * WP-2 Issue 2.2 — Add idempotency to Inngest event-driven functions.
 * Cron-triggered functions are intentionally skipped (no deduplication needed).
 * Run once: node scripts/add-idempotency.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const FILES = [
  "inngest/functions/agent-orchestrator.ts",
  "inngest/functions/d8-saas-operations.ts",
  "inngest/functions/phase1-foundation.ts",
  "inngest/functions/phase2-intelligence.ts",
  "inngest/functions/phase3-execution.ts",
  "inngest/functions/self-healing-coding.ts",
  "inngest/functions/training-protocol.ts",
  "inngest/functions/weekly-meeting.ts",
];

let totalAdded = 0;

for (const rel of FILES) {
  const file = path.join(root, rel);
  let src = readFileSync(file, "utf8");

  // Detect line ending style
  const eol = src.includes("\r\n") ? "\r\n" : "\n";

  // Split into lines for line-by-line processing
  const lines = src.split(eol);
  const out = [];
  let added = 0;

  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);

    // Look for the transition: `  },` followed (2 lines later? no — next line) by `  { event: ...`
    // But the next line may be the trigger directly, or there could be a comment.
    // Pattern: current line is "  }," and next line (or next-next for blank) is "  { event: "
    if (
      lines[i].trimEnd() === "  }," &&
      i + 1 < lines.length &&
      /^\s*\{ event:/.test(lines[i + 1])
    ) {
      // We are about to close an options object before an event trigger.
      // Check that idempotency has NOT already been added (look backwards).
      const prevLine = out[out.length - 2]?.trimEnd() ?? "";
      if (!prevLine.includes("idempotency:")) {
        // Insert the idempotency line BEFORE the closing },
        out.splice(out.length - 1, 1); // remove the "  }," we just pushed
        out.push('    idempotency: "event.id",');
        out.push("  },");
        added++;
      }
    }
  }

  if (added > 0) {
    writeFileSync(file, out.join(eol), "utf8");
    console.log(`✓ ${rel}: added idempotency to ${added} function(s)`);
    totalAdded += added;
  } else {
    console.log(`  ${rel}: no changes needed`);
  }
}

// Patch agent-orchestrator: agentInvoke should use correlation_id, not event.id
const orchFile = path.join(root, "inngest/functions/agent-orchestrator.ts");
let orchSrc = readFileSync(orchFile, "utf8");
const oldKey = 'id: "agent-invoke",';
const marker = '    idempotency: "event.id",';

// Find the agentInvoke options block: id: "agent-invoke" ... idempotency: "event.id"
// and replace event.id with event.data.correlation_id
const invokeBlockStart = orchSrc.indexOf(oldKey);
if (invokeBlockStart !== -1) {
  const markerIdx = orchSrc.indexOf(marker, invokeBlockStart);
  const nextFunctionIdx = orchSrc.indexOf("inngest.createFunction", invokeBlockStart + 1);
  if (markerIdx !== -1 && markerIdx < nextFunctionIdx) {
    orchSrc = orchSrc.slice(0, markerIdx) +
      '    idempotency: "event.data.correlation_id",' +
      orchSrc.slice(markerIdx + marker.length);
    writeFileSync(orchFile, orchSrc, "utf8");
    console.log("✓ agent-orchestrator.ts (agentInvoke): idempotency → event.data.correlation_id");
  }
}

console.log(`\nDone. Total idempotency keys added: ${totalAdded}`);
