"use client";

import { useEffect, useMemo, useState } from "react";

interface ApprovalRow {
  id: string;
  request_type: string;
  action_family: string;
  source_agent: string | null;
  target_agent: string | null;
  correlation_id: string | null;
  status: string;
  payload_preview: string | null;
  requested_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

function formatAge(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const deltaMinutes = Math.max(1, Math.floor(deltaMs / 60000));
  if (deltaMinutes < 60) return `${deltaMinutes}m`;
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ApprovalCard({
  approval,
  onResolve,
  pendingAction,
}: {
  approval: ApprovalRow;
  onResolve: (approvalId: string, decision: "approve" | "reject") => Promise<void>;
  pendingAction: string | null;
}) {
  const isPending = approval.status === "pending";

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
            {approval.request_type}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-white">
            {approval.action_family}
          </h2>
          <div className="mt-2 text-sm text-slate-400">
            {approval.source_agent || "unknown"} {"->"} {approval.target_agent || "unknown"}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
              approval.status === "pending"
                ? "bg-yellow-500/15 text-yellow-300"
                : approval.status === "approved" || approval.status === "executing"
                  ? "bg-green-500/15 text-green-300"
                  : "bg-red-500/15 text-red-300"
            }`}
          >
            {approval.status}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {formatAge(approval.requested_at)} ago
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-slate-950 p-4 text-sm text-slate-300 whitespace-pre-wrap">
        {approval.payload_preview || "No preview available"}
      </div>

      <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
        <div>Correlation: {approval.correlation_id || "n/a"}</div>
        <div>Requested: {new Date(approval.requested_at).toLocaleString()}</div>
        <div>Resolved: {approval.resolved_at ? new Date(approval.resolved_at).toLocaleString() : "Pending"}</div>
        <div>Note: {approval.resolution_note || "n/a"}</div>
      </div>

      {isPending && (
        <div className="flex gap-3">
          <button
            onClick={() => onResolve(approval.id, "approve")}
            disabled={pendingAction === approval.id}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {pendingAction === approval.id ? "Working..." : "Approve"}
          </button>
          <button
            onClick={() => onResolve(approval.id, "reject")}
            disabled={pendingAction === approval.id}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm text-white transition hover:bg-rose-500 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function loadApprovals() {
    setLoading(true);
    try {
      const response = await fetch("/api/approvals", { cache: "no-store" });
      const payload = (await response.json()) as { approvals?: ApprovalRow[] };
      setApprovals(payload.approvals || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApprovals();
  }, []);

  async function handleResolve(approvalId: string, decision: "approve" | "reject") {
    setPendingAction(approvalId);
    try {
      await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_id: approvalId, decision }),
      });
      await loadApprovals();
    } finally {
      setPendingAction(null);
    }
  }

  const pending = useMemo(
    () => approvals.filter((approval) => approval.status === "pending"),
    [approvals],
  );
  const recent = useMemo(
    () => approvals.filter((approval) => approval.status !== "pending").slice(0, 20),
    [approvals],
  );

  if (loading) {
    return <div className="text-slate-400">Loading approvals...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Approvals</h1>
          <p className="text-slate-400">
            Pending human approval requests from coordinators, live runtimes, and guardrails.
          </p>
        </div>
        <button
          onClick={() => void loadApprovals()}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-white transition hover:border-slate-400"
        >
          Refresh
        </button>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Pending</h2>
          <span className="text-sm text-slate-500">{pending.length} waiting</span>
        </div>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
            No pending approvals.
          </div>
        ) : (
          pending.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onResolve={handleResolve}
              pendingAction={pendingAction}
            />
          ))
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Decisions</h2>
          <span className="text-sm text-slate-500">{recent.length} shown</span>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
            No recent approvals.
          </div>
        ) : (
          recent.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onResolve={handleResolve}
              pendingAction={pendingAction}
            />
          ))
        )}
      </section>
    </div>
  );
}
