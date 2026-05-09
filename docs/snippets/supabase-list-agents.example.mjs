// Reference snippet — DO NOT IMPORT.
// Quick example of listing the `agents` table via the service-role key.
// Wrap in an async function before using; never run at module top-level.
//
// Usage:
//   node docs/snippets/supabase-list-agents.example.mjs

import { createClient } from "@supabase/supabase-js";

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.from("agents").select("*");
  if (error) {
    console.error(error);
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
