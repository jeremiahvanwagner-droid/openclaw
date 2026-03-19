import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabase, requireAdminUser } from "../../../lib/server-auth";

export async function GET(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const selectedType = req.nextUrl.searchParams.get("type") || "all";
  const page = Math.max(Number.parseInt(req.nextUrl.searchParams.get("page") || "0", 10) || 0, 0);
  const pageSize = Math.min(
    Math.max(Number.parseInt(req.nextUrl.searchParams.get("pageSize") || "50", 10) || 50, 1),
    100,
  );

  const supabase = getServiceSupabase();
  let query = supabase
    .from("agent_events")
    .select(
      "id, event_name, source_agent, target_agent, payload, priority, status, correlation_id, created_at, processed_at, error_message, metadata",
    )
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (selectedType !== "all") {
    query = query.ilike("event_name", `${selectedType}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
