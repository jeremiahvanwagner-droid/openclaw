#!/usr/bin/env node

import { ESLint } from "eslint";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const baselinePath = path.join(repoRoot, "config", "lint-warning-baseline.json");
const lintPaths = ["handlers", "lib", "inngest", "scripts"];

async function loadBaseline() {
  const raw = await readFile(baselinePath, "utf8");
  const parsed = JSON.parse(raw);
  const maxWarnings = Number(parsed.maxWarnings);
  if (!Number.isInteger(maxWarnings) || maxWarnings < 0) {
    throw new Error(`Invalid maxWarnings in ${baselinePath}`);
  }

  return maxWarnings;
}

async function run() {
  const maxWarnings = await loadBaseline();
  const eslint = new ESLint({
    cwd: repoRoot,
    errorOnUnmatchedPattern: false,
  });
  const results = await eslint.lintFiles(lintPaths);

  const totals = results.reduce(
    (acc, result) => {
      acc.errors += result.errorCount + result.fatalErrorCount;
      acc.warnings += result.warningCount;
      return acc;
    },
    { errors: 0, warnings: 0 }
  );

  if (totals.errors > 0) {
    console.error(`Lint errors found: ${totals.errors}`);
    process.exit(1);
  }

  if (totals.warnings > maxWarnings) {
    console.error(
      `Lint warning regression: ${totals.warnings} warnings (baseline max: ${maxWarnings})`
    );
    console.error(
      "Reduce warnings to the baseline or update config/lint-warning-baseline.json after intentional cleanup."
    );
    process.exit(1);
  }

  console.log(
    `Lint warning baseline check passed: ${totals.warnings} warnings (baseline max: ${maxWarnings})`
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
