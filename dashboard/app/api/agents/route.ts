import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../supabase-server";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdmin(req: NextRequest) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return user;
}

async function auditLog(
  db: ReturnType<typeof getServiceSupabase>,
  action: string,
  agentId: string,
  userEmail: string,
  details: Record<string, unknown>
) {
  await db.from("agent_events").insert({
    event_name: `dashboard/${action}`,
    source_agent: "dashboard",
    target_agent: agentId,
    payload: { user_email: userEmail, ...details },
    priority: "normal",
    status: "completed",
    correlation_id: `admin:${agentId}:${Date.now()}`,
  });
}

// POST /api/agents — dispatch by action field
export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, agent_id } = body;

  if (!agent_id || typeof agent_id !== "string") {
    return NextResponse.json({ error: "agent_id required" }, { status: 400 });
  }

  const db = getServiceSupabase();

  // Verify agent exists
  const { data: agent, error: fetchErr } = await db
    .from("agents")
    .select("*")
    .eq("agent_id", agent_id)
    .single();

  if (fetchErr || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  switch (action) {
    case "invoke": {
      // Trigger manual agent run via Inngest
      const inngestUrl =
        process.env.INNGEST_EVENT_API_URL ?? "http://localhost:8288/e";
      const inngestKey = process.env.INNGEST_EVENT_KEY ?? "";

      const res = await fetch(`${inngestUrl}/${inngestKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "agent/invoke",
          data: {
            source_agent: "dashboard",
            target_agent: agent_id,
            payload: { manual_trigger: true, triggered_by: user.email },
            priority: "normal",
            correlation_id: `manual:${agent_id}:${Date.now()}`,
          },
        }),
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: "Failed to invoke agent via Inngest" },
          { status: 502 }
        );
      }

      await auditLog(db, "invoke", agent_id, user.email!, {
        action: "manual_invoke",
      });

      return NextResponse.json({ ok: true });
    }

    case "quarantine": {
      const newStatus =
        agent.status === "quarantined" ? "active" : "quarantined";

      const { error: updateErr } = await db
        .from("agents")
        .update({ status: newStatus })
        .eq("agent_id", agent_id);

      if (updateErr) {
        return NextResponse.json(
          { error: "Failed to update agent status" },
          { status: 500 }
        );
      }

      await auditLog(db, "quarantine", agent_id, user.email!, {
        previous_status: agent.status,
        new_status: newStatus,
      });

      return NextResponse.json({ ok: true, status: newStatus });
    }

    case "update": {
      const { config } = body;
      if (!config || typeof config !== "object") {
        return NextResponse.json(
          { error: "config object required for update" },
          { status: 400 }
        );
      }

      // Merge with existing config to avoid overwriting nested fields
      const mergedConfig = { ...agent.config, ...config };

      const { error: updateErr } = await db
        .from("agents")
        .update({ config: mergedConfig })
        .eq("agent_id", agent_id);

      if (updateErr) {
        return NextResponse.json(
          { error: "Failed to update agent config" },
          { status: 500 }
        );
      }

      await auditLog(db, "update", agent_id, user.email!, {
        updated_fields: Object.keys(config),
      });

      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}
