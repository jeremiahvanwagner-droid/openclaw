import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseServer } from "../app/supabase-server";
import { isUserAdmin } from "./admin";

const UNREGISTERED_API_KEY_PATTERN = /unregistered api key/i;

type ServiceSupabaseClient = SupabaseClient;

let cachedServiceClient: ServiceSupabaseClient | null = null;
let clientBootstrapPromise: Promise<ServiceSupabaseClient> | null = null;

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  if (!url) {
    throw new Error("Supabase URL is not configured (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL)");
  }
  return url;
}

function getCandidateKeys(): string[] {
  const keys = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(keys));
}

async function canReadWithClient(client: ServiceSupabaseClient): Promise<boolean> {
  const { error } = await client
    .from("agents")
    .select("agent_id", { count: "exact", head: true });

  if (!error) {
    return true;
  }

  if (UNREGISTERED_API_KEY_PATTERN.test(error.message || "")) {
    return false;
  }

  return true;
}

export async function getServiceSupabase(): Promise<ServiceSupabaseClient> {
  if (cachedServiceClient) {
    return cachedServiceClient;
  }

  if (clientBootstrapPromise) {
    return clientBootstrapPromise;
  }

  clientBootstrapPromise = (async () => {
    const url = getSupabaseUrl();
    const keys = getCandidateKeys();

    if (keys.length === 0) {
      throw new Error(
        "Supabase API key is not configured (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
      );
    }

    for (const key of keys) {
      const client = createClient(url, key);
      if (await canReadWithClient(client)) {
        cachedServiceClient = client;
        return client;
      }
    }

    // Fallback to last key so route handlers can surface the concrete error.
    const fallback = createClient(url, keys[keys.length - 1]);
    cachedServiceClient = fallback;
    return fallback;
  })();

  try {
    return await clientBootstrapPromise;
  } finally {
    clientBootstrapPromise = null;
  }
}

export async function requireAuthenticatedUser(): Promise<User | null> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

export async function requireAdminUser(): Promise<User | null> {
  const user = await requireAuthenticatedUser();
  if (!user || !isUserAdmin(user)) {
    return null;
  }
  return user;
}
