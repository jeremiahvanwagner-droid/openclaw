import type { User } from "@supabase/supabase-js";

const ADMIN_ROLE_KEYS = ["role", "app_role", "dashboard_role"] as const;
const ADMIN_ROLE_VALUES = new Set(["admin", "owner", "super_admin"]);

function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.DASHBOARD_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getMetadataRoles(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];

  return ADMIN_ROLE_KEYS.flatMap((key) => {
    const value = metadata[key];
    if (typeof value !== "string") return [];
    return value.toLowerCase();
  });
}

export function isUserAdmin(
  user: Pick<User, "email" | "app_metadata" | "user_metadata"> | null | undefined,
): boolean {
  if (!user) return false;

  const email = user.email?.trim().toLowerCase();
  if (email && parseAdminEmails().has(email)) {
    return true;
  }

  const roles = [
    ...getMetadataRoles(user.app_metadata as Record<string, unknown> | undefined),
    ...getMetadataRoles(user.user_metadata as Record<string, unknown> | undefined),
  ];

  return roles.some((role) => ADMIN_ROLE_VALUES.has(role));
}
