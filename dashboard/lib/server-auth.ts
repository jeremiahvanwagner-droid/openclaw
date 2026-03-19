import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServer } from "../app/supabase-server";
import { isUserAdmin } from "./admin";

export function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
  );
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
