/**
 * supabase-singleton.ts
 * OpenClaw Multi-Agent Network — Shared Supabase Client
 *
 * Fixes audit finding PERF-02: "No Supabase Client Singleton"
 *
 * Problem:
 *   Every module calls createClient() independently (agent-orchestrator.ts,
 *   d8-saas-operations.ts, dashboard API routes, etc.). Each call creates
 *   a new connection, performs an auth handshake, and allocates memory.
 *   With 103 agents and concurrent Inngest function execution, this can
 *   exhaust Supabase's connection pool under load.
 *
 * Solution:
 *   A module-level singleton that lazily initializes once on first call
 *   and returns the same client thereafter. Because Node.js module imports
 *   are cached, importing this module from multiple files is safe — they
 *   all share the same instance.
 *
 * Usage (replace all createClient() calls in backend code):
 *   import { getSupabase } from '../lib/supabase-singleton';
 *   const supabase = getSupabase();
 *   const { data } = await supabase.from('agents').select('*');
 *
 * For dashboard server routes (SSR, uses auth session instead of service role):
 *   Use dashboard/app/supabase-server.ts which creates a per-request client
 *   with the user's auth cookie — that intentionally stays separate.
 *
 * Place this file at: lib/supabase-singleton.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level singleton — initialized on first call to getSupabase()
// ─────────────────────────────────────────────────────────────────────────────
let _client: SupabaseClient | null = null;

/**
 * Returns the shared Supabase service-role client.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY (not the anon key) for backend operations.
 * This client bypasses RLS — only use it in server-side / backend code
 * that has already performed its own authorization checks.
 *
 * @throws {Error} if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are unset
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      'SUPABASE_URL environment variable is not set. ' +
      'Check your .env file or deployment secrets.'
    );
  }
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY environment variable is not set. ' +
      'Do not use the anon key here — the service role key is required for backend writes.'
    );
  }

  _client = createClient(url, key, {
    auth: {
      // Backend service clients should not persist sessions or auto-refresh
      // tokens — sessions are irrelevant for service_role access.
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        // Tag requests for observability in Supabase logs
        'x-application-name': 'openclaw-backend',
      },
    },
  });

  return _client;
}

/**
 * Reset the singleton (test helper only).
 *
 * Call this in beforeEach() / afterEach() to get a fresh client per test.
 * Never call in production code.
 *
 * @example
 * import { resetSupabase } from '../lib/supabase-singleton';
 * afterEach(() => resetSupabase());
 */
export function resetSupabase(): void {
  _client = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION GUIDE
// ─────────────────────────────────────────────────────────────────────────────
// Replace all occurrences of the pattern:
//
//   const supabase = createClient(
//     process.env.SUPABASE_URL!,
//     process.env.SUPABASE_SERVICE_KEY!    ← also note: env var name was
//   );                                        inconsistent (SERVICE_KEY vs
//                                             SERVICE_ROLE_KEY). Standardize
//                                             to SUPABASE_SERVICE_ROLE_KEY.
//
// Files to update:
//   - inngest/functions/agent-orchestrator.ts  (line 21)
//   - inngest/functions/d8-saas-operations.ts
//   - inngest/functions/training-protocol.ts
//   - Any other backend module calling createClient directly
//
// With:
//   import { getSupabase } from '../../lib/supabase-singleton';
//   const supabase = getSupabase();
//
// The dashboard server client (dashboard/app/supabase-server.ts) is intentionally
// separate because it creates per-request clients bound to the user's auth
// cookie/session. Do NOT replace that with this singleton.
