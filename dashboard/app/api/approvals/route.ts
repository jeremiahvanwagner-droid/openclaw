import { NextRequest, NextResponse } from "next/server";

import { resolveHumanApproval } from "../../../../lib/human-approval.mjs";
import { getServiceSupabase, requireAdminUser } from "../../../lib/server-auth";

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
    decision?: "approve" | "reject";
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
    const approval = await resolveHumanApproval({
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
