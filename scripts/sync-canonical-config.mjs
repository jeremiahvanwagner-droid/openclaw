#!/usr/bin/env node
/**
 * Canonical-Config Sync & Drift Gate — Advancement 5
 * (docs/advancements/05-advancement-config-single-source-of-truth.md)
 *
 * Canonical (hand-edited) sources:
 *   config/agents_config.json   — THE agent config. The runtime reads only this
 *                                 (lib/security-governance.mjs, lib/runtime-model-policy.mjs,
 *                                 lib/ghl-scope-enforcer.mjs).
 *   skills/*.mjs                — THE skill implementations.
 *
 * Generated mirrors (never hand-edit):
 *   agents_config.json          — root mirror, kept for legacy readers until they
 *                                 are all retargeted (tracked in git so drift shows).
 *   workspace/skills/*.mjs      — runtime artifact for agent workspaces (gitignored).
 *
 * Modes:
 *   --check   exit 1 naming each drifted mirror (CI gate; default)
 *   --write   refresh mirrors from canonical sources
 *
 * The workspace/skills mirror is only checked when the directory exists —
 * workspace/ is gitignored, so fresh clones legitimately lack it; --write
 * creates it.
 *
 * History: the two agents_config copies diverged between 2026-05-14 and
 * 2026-07-03 (canon gained business_scope/ghl_token_group/operational_boundaries/
 * skills[] on 27–101 agents while root kept pre-mapping values). Reconciled
 * 2026-07-04: canon confirmed the superset, root overwritten. This gate exists
 * so that class of split-brain cannot recur silently.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANON_AGENTS = path.join(ROOT_DIR, "config", "agents_config.json");
const MIRROR_AGENTS = path.join(ROOT_DIR, "agents_config.json");
const CANON_SKILLS = path.join(ROOT_DIR, "skills");
const MIRROR_SKILLS = path.join(ROOT_DIR, "workspace", "skills");

const mode = process.argv.includes("--write") ? "write" : "check";
const drift = [];

function sha1(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

// ── 1. agents_config root mirror ────────────────────────────────────────────
if (!fs.existsSync(CANON_AGENTS)) {
  console.error(`FATAL: canonical ${path.relative(ROOT_DIR, CANON_AGENTS)} missing`);
  process.exit(1);
}
const canon = fs.readFileSync(CANON_AGENTS);
if (!fs.existsSync(MIRROR_AGENTS) || !canon.equals(fs.readFileSync(MIRROR_AGENTS))) {
  if (mode === "write") {
    fs.writeFileSync(MIRROR_AGENTS, canon);
    console.log("refreshed agents_config.json from config/agents_config.json");
  } else {
    drift.push("agents_config.json != config/agents_config.json (run: node scripts/sync-canonical-config.mjs --write)");
  }
}

// ── 2. workspace/skills mirror (top-level .mjs only) ────────────────────────
const haveMirrorDir = fs.existsSync(MIRROR_SKILLS);
if (mode === "write" && !haveMirrorDir) fs.mkdirSync(MIRROR_SKILLS, { recursive: true });
if (mode === "write" || haveMirrorDir) {
  let refreshed = 0;
  for (const entry of fs.readdirSync(CANON_SKILLS)) {
    if (!entry.endsWith(".mjs")) continue;
    const src = path.join(CANON_SKILLS, entry);
    if (!fs.statSync(src).isFile()) continue;
    const dst = path.join(MIRROR_SKILLS, entry);
    const same = fs.existsSync(dst) && sha1(fs.readFileSync(src)) === sha1(fs.readFileSync(dst));
    if (!same) {
      if (mode === "write") {
        fs.copyFileSync(src, dst);
        refreshed++;
      } else {
        drift.push(`workspace/skills/${entry} stale vs skills/${entry}`);
      }
    }
  }
  if (mode === "write" && refreshed) console.log(`refreshed ${refreshed} module(s) into workspace/skills/`);
} else {
  console.log("workspace/skills absent — skipped (runtime artifact; --write creates it)");
}

if (drift.length) {
  console.error("CONFIG DRIFT:\n  " + drift.join("\n  "));
  process.exit(1);
}
console.log(mode === "write" ? "Mirrors in sync." : "No drift.");
