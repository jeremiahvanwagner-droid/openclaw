import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseServer } from "../../supabase-server";
import { isUserAdmin } from "../../../lib/admin";

export async function POST(req: NextRequest) {
  // Verify authenticated session
  const supabaseAuth = createSupabaseServer();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { event_id } = await req.json();

  if (!event_id || typeof event_id !== "string") {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  // Use service role to read and write events
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch original event
  const { data: original, error: fetchErr } = await supabase
    .from("agent_events")
    .select("*")
    .eq("id", event_id)
    .single();

  if (fetchErr || !original) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Build new correlation_id linking back to the original
  const newCorrelationId = `replay:${original.correlation_id ?? original.id}`;

  // Re-publish to Inngest
  const inngestUrl =
    process.env.INNGEST_EVENT_API_URL ?? "http://localhost:8288/e";
  const inngestKey = process.env.INNGEST_EVENT_KEY ?? "";

  const inngestRes = await fetch(`${inngestUrl}/${inngestKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: original.event_name,
      data: {
        ...original.payload,
        source_agent: original.source_agent,
        target_agent: original.target_agent,
        correlation_id: newCorrelationId,
        priority: original.priority,
        replay_of: original.id,
      },
    }),
  });

  if (!inngestRes.ok) {
    return NextResponse.json(
      { error: "Failed to replay event via Inngest" },
      { status: 502 },
    );
  }

  // Audit log
  await supabase.from("agent_events").insert({
    event_name: "dashboard/replay",
    source_agent: "dashboard",
    target_agent: original.source_agent,
    payload: {
      replayed_event_id: original.id,
      replayed_event_name: original.event_name,
      user_email: user.email,
    },
    priority: "normal",
    status: "completed",
    correlation_id: newCorrelationId,
  });

  return NextResponse.json({ ok: true, correlation_id: newCorrelationId });
}
