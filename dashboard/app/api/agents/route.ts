import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabase, requireAdminUser } from "../../../lib/server-auth";

const ALLOWED_CONFIG_PATCH_FIELDS = new Set(["model", "role", "escalation_path"]);

type AgentAction = "invoke" | "quarantine" | "update";
type JsonObject = Record<string, unknown>;

interface AgentMutationRequest {
  action: AgentAction;
  agent_id: string;
  config?: JsonObject;
}

function sanitizeConfigPatch(config: unknown): JsonObject | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const patch = Object.entries(config).reduce<JsonObject>((accumulator, [key, value]) => {
    if (!ALLOWED_CONFIG_PATCH_FIELDS.has(key)) {
      return accumulator;
    }

    if (typeof value === "string") {
      accumulator[key] = value.trim();
      return accumulator;
    }

    if (value === null) {
      accumulator[key] = null;
    }

    return accumulator;
  }, {});

  return Object.keys(patch).length > 0 ? patch : null;
}

async function auditLog(
  db: ReturnType<typeof getServiceSupabase>,
  action: string,
  agentId: string,
  userEmail: string,
  details: Record<string, unknown>,
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

export async function GET(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const agentId = req.nextUrl.searchParams.get("agent_id");
  const db = getServiceSupabase();

  if (agentId) {
    const { data, error } = await db
      .from("agents")
      .select("*")
      .eq("agent_id", agentId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ agent: data });
  }

  const { data, error } = await db
    .from("agents")
    .select("*")
    .order("org_unit", { ascending: true })
    .order("agent_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }

  return NextResponse.json({ agents: data || [] });
}

// POST /api/agents -- dispatch by action field
export async function POST(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<AgentMutationRequest>;
  const { action, agent_id } = body;

  if (!action || !["invoke", "quarantine", "update"].includes(action)) {
    return NextResponse.json({ error: "Valid action required" }, { status: 400 });
  }

  if (!agent_id || typeof agent_id !== "string") {
    return NextResponse.json({ error: "agent_id required" }, { status: 400 });
  }

  const db = getServiceSupabase();
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
      const inngestUrl = process.env.INNGEST_EVENT_API_URL ?? "http://localhost:8288/e";
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
          { status: 502 },
        );
      }

      await auditLog(db, "invoke", agent_id, user.email!, {
        action: "manual_invoke",
      });

      return NextResponse.json({ ok: true });
    }

    case "quarantine": {
      const newStatus = agent.status === "quarantined" ? "active" : "quarantined";

      const { error: updateErr } = await db
        .from("agents")
        .update({ status: newStatus })
        .eq("agent_id", agent_id);

      if (updateErr) {
        return NextResponse.json(
          { error: "Failed to update agent status" },
          { status: 500 },
        );
      }

      await auditLog(db, "quarantine", agent_id, user.email!, {
        previous_status: agent.status,
        new_status: newStatus,
      });

      return NextResponse.json({ ok: true, status: newStatus });
    }

    case "update": {
      const config = sanitizeConfigPatch(body.config);
      if (!config) {
        return NextResponse.json(
          { error: "config must only include model, role, or escalation_path" },
          { status: 400 },
        );
      }

      const existingConfig =
        agent.config && typeof agent.config === "object" && !Array.isArray(agent.config)
          ? (agent.config as JsonObject)
          : {};
      const mergedConfig = { ...existingConfig, ...config };

      const { error: updateErr } = await db
        .from("agents")
        .update({ config: mergedConfig })
        .eq("agent_id", agent_id);

      if (updateErr) {
        return NextResponse.json(
          { error: "Failed to update agent config" },
          { status: 500 },
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
        { status: 400 },
      );
  }
}
