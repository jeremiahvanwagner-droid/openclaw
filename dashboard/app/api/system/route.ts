import { NextResponse } from "next/server";

import { getServiceSupabase, requireAuthenticatedUser } from "../../../lib/server-auth";

export async function GET() {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await getServiceSupabase();
  const { error } = await supabase.from("agents").select("agent_id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { connected: false, status: "degraded", message: "Database query failed" },
      { status: 503 },
    );
  }

  return NextResponse.json({ connected: true, status: "ok" });
}
