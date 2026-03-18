#!/usr/bin/env node
/**
 * Re-embed agent memory content into the 512-dim text-embedding-3-small column.
 *
 * Usage:
 *   node scripts/reembed-agent-memory.mjs
 *   node scripts/reembed-agent-memory.mjs --batch-size 50 --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;
const DEFAULT_BATCH_SIZE = 25;

function parseArgs(argv) {
  const args = { batchSize: DEFAULT_BATCH_SIZE, dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--batch-size") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error("Invalid --batch-size value");
      }
      args.batchSize = next;
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://aagqvfwuixpxtdcrdxmv.supabase.co";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required");
  process.exit(1);
}

const { batchSize, dryRun } = parseArgs(process.argv.slice(2));
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function countPending() {
  const { count, error } = await supabase
    .from("agent_memory")
    .select("id", { count: "exact", head: true })
    .is("embedding_512", null);

  if (error) {
    throw new Error(`Failed to count pending memories: ${error.message}`);
  }

  return count || 0;
}

async function fetchPendingBatch() {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("id, content")
    .is("embedding_512", null)
    .order("created_at", { ascending: true })
    .range(0, batchSize - 1);

  if (error) {
    throw new Error(`Failed to fetch pending memories: ${error.message}`);
  }

  return data || [];
}

async function updateBatch(rows, embeddings) {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const { error } = await supabase
      .from("agent_memory")
      .update({
        embedding_512: embeddings[i],
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`Failed to update ${row.id}: ${error.message}`);
    }
  }
}

async function main() {
  const pending = await countPending();
  console.log(`Pending memories: ${pending}`);
  console.log(`Embedding model: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`);

  if (dryRun) {
    console.log("Dry run only. No rows updated.");
    return;
  }

  let processed = 0;
  while (true) {
    const rows = await fetchPendingBatch();
    if (rows.length === 0) {
      break;
    }

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: rows.map((row) => row.content),
    });

    await updateBatch(
      rows,
      response.data.map((item) => item.embedding)
    );

    processed += rows.length;
    console.log(`Backfilled ${processed}/${pending}`);
  }

  console.log("Re-embedding complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
