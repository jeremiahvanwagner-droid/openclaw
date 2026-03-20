import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabase, requireAdminUser } from "../../../lib/server-auth";

type ApprovalDecision = "approve" | "reject";

interface HumanApprovalRow {
  id: string;
  source_agent: string | null;
  target_agent: string | null;
  correlation_id: string | null;
}

async function writeApprovalResolutionEvent(params: {
  approval: HumanApprovalRow;
  channel: string;
  decision: "approved" | "rejected";
  note?: string;
  resolvedBy: string;
}) {
  const db = getServiceSupabase();
  await db.from("agent_events").insert({
    event_name: "approval/resolved",
    source_agent: params.resolvedBy,
    target_agent: params.approval.target_agent,
    payload: {
      approval_id: params.approval.id,
      decision: params.decision,
      channel: params.channel,
      note: params.note ?? null,
    },
    priority: "critical",
    status: params.decision === "approved" ? "completed" : "failed",
    correlation_id: params.approval.correlation_id || params.approval.id,
    metadata: {
      approval_id: params.approval.id,
      resolution_channel: params.channel,
    },
  });
}

async function resolveApproval(params: {
  approvalId: string;
  decision: ApprovalDecision;
  resolvedBy: string;
  note?: string;
  channel: string;
}) {
  const db = getServiceSupabase();
  const status = params.decision === "approve" ? "approved" : "rejected";

  const { data, error } = await db
    .from("human_approval_queue")
    .update({
      status,
      resolved_by: params.resolvedBy,
      resolution_channel: params.channel,
      resolution_note: params.note ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", params.approvalId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) {
    const { data: existing, error: existingError } = await db
      .from("human_approval_queue")
      .select("*")
      .eq("id", params.approvalId)
      .single();

    if (existingError || !existing) {
      throw error;
    }

    return existing;
  }

  await writeApprovalResolutionEvent({
    approval: data as HumanApprovalRow,
    channel: params.channel,
    decision: status,
    note: params.note,
    resolvedBy: params.resolvedBy,
  });

  return data;
}

export async function GET(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const limit = Math.min(
    Number.parseInt(req.nextUrl.searchParams.get("limit") || "100", 10) || 100,
    200,
  );

  const db = getServiceSupabase();
  let query = db
    .from("human_approval_queue")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }

  return NextResponse.json({ approvals: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    approval_id?: string;
    decision?: ApprovalDecision;
    note?: string;
  };

  if (!body.approval_id || !body.decision) {
    return NextResponse.json(
      { error: "approval_id and decision are required" },
      { status: 400 },
    );
  }

  if (!["approve", "reject"].includes(body.decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  try {
    const approval = await resolveApproval({
      approvalId: body.approval_id,
      decision: body.decision,
      resolvedBy: user.email || "dashboard",
      channel: "dashboard",
      note: body.note,
    });

    return NextResponse.json({ ok: true, approval });
  } catch {
    return NextResponse.json({ error: "Failed to resolve approval" }, { status: 500 });
  }
}
