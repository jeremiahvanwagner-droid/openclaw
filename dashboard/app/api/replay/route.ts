import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabase, requireAdminUser } from "../../../lib/server-auth";

interface ReplayLedgerRow {
  id: string;
  operation_key: string;
  status: string;
  result: {
    correlation_id?: string;
    replayed_event_id?: string;
  } | null;
}

export async function POST(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { event_id } = (await req.json()) as { event_id?: string };
  if (!event_id || typeof event_id !== "string") {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: original, error: fetchError } = await supabase
    .from("agent_events")
    .select("*")
    .eq("id", event_id)
    .single();

  if (fetchError || !original) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const operationKey = `dashboard-replay:${original.id}`;
  const newCorrelationId = `replay:${original.correlation_id ?? original.id}`;

  const { data: ledgerInsert, error: ledgerInsertError } = await supabase
    .from("operation_ledger")
    .insert({
      operation_key: operationKey,
      operation_type: "dashboard_replay",
      actor: user.email,
      status: "pending",
      source_table: "agent_events",
      source_id: original.id,
      correlation_id: newCorrelationId,
      payload: {
        replayed_event_id: original.id,
        replayed_event_name: original.event_name,
        requested_by: user.email,
      },
    })
    .select("id, operation_key, status, result")
    .single();

  if (ledgerInsertError) {
    const { data: existingLedger } = await supabase
      .from("operation_ledger")
      .select("id, operation_key, status, result")
      .eq("operation_key", operationKey)
      .single<ReplayLedgerRow>();

    if (existingLedger?.status === "completed") {
      return NextResponse.json({
        ok: true,
        deduped: true,
        correlation_id: existingLedger.result?.correlation_id ?? newCorrelationId,
      });
    }

    return NextResponse.json(
      { error: "Replay already in progress or previously failed" },
      { status: 409 },
    );
  }

  const ledger = ledgerInsert as ReplayLedgerRow;

  try {
    const inngestUrl = process.env.INNGEST_EVENT_API_URL ?? "http://localhost:8288/e";
    const inngestKey = process.env.INNGEST_EVENT_KEY ?? "";

    const inngestResponse = await fetch(`${inngestUrl}/${inngestKey}`, {
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

    if (!inngestResponse.ok) {
      throw new Error("Failed to replay event via Inngest");
    }

    await supabase
      .from("operation_ledger")
      .update({
        status: "completed",
        result: {
          correlation_id: newCorrelationId,
          replayed_event_id: original.id,
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ledger.id);

    await supabase.from("agent_events").insert({
      event_name: "dashboard/replay",
      source_agent: "dashboard",
      target_agent: original.source_agent,
      payload: {
        replayed_event_id: original.id,
        replayed_event_name: original.event_name,
        user_email: user.email,
        operation_key: operationKey,
      },
      priority: "normal",
      status: "completed",
      correlation_id: newCorrelationId,
      metadata: { operation_ledger_id: ledger.id },
    });

    return NextResponse.json({ ok: true, correlation_id: newCorrelationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replay failed";

    await supabase
      .from("operation_ledger")
      .update({
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ledger.id);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
