"use client";

import { useEffect, useState } from "react";

interface AgentEvent {
  id: string;
  event_name: string;
  source_agent: string;
  target_agent: string;
  payload: Record<string, unknown>;
  priority: string;
  status: string;
  correlation_id: string;
  created_at: string;
  processed_at: string | null;
}

const EVENT_TYPES = [
  { key: "all", label: "All Events" },
  { key: "agent/task", label: "Task Events" },
  { key: "agent/escalate", label: "Escalations" },
  { key: "agent/handoff", label: "Handoffs" },
  { key: "customer/", label: "Customer Events" },
  { key: "lead/", label: "Lead Events" },
  { key: "metrics/", label: "Metrics Events" },
];

const PRIORITY_BADGES: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  normal: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  processing: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

function EventRow({
  event,
  onSelect,
  onReplay,
  replayingId,
}: {
  event: AgentEvent;
  onSelect: (event: AgentEvent) => void;
  onReplay: (id: string) => void;
  replayingId: string | null;
}) {
  const time = new Date(event.created_at).toLocaleTimeString();
  const date = new Date(event.created_at).toLocaleDateString();

  return (
    <tr
      className="cursor-pointer border-b border-slate-700/50 hover:bg-slate-800/50"
      onClick={() => onSelect(event)}
    >
      <td className="px-4 py-3">
        <div className="font-mono text-sm text-white">{event.event_name}</div>
        <div className="text-xs text-slate-500">
          {event.correlation_id?.substring(0, 8)}...
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-slate-300">{event.source_agent}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-slate-300">{event.target_agent || "-"}</div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`rounded border px-2 py-0.5 text-xs ${
            PRIORITY_BADGES[event.priority] || PRIORITY_BADGES.normal
          }`}
        >
          {event.priority}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            STATUS_BADGES[event.status] || STATUS_BADGES.pending
          }`}
        >
          {event.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {event.status === "failed" ? (
            <button
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                onReplay(event.id);
              }}
              disabled={replayingId === event.id}
              className="rounded bg-claw-500/20 px-2 py-1 text-xs text-claw-400 transition hover:bg-claw-500/30 disabled:opacity-50"
            >
              {replayingId === event.id ? "..." : "Replay"}
            </button>
          ) : null}
          <div>
            <div className="text-sm text-slate-400">{time}</div>
            <div className="text-xs text-slate-600">{date}</div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function EventDetail({
  event,
  onClose,
  onReplay,
}: {
  event: AgentEvent;
  onClose: () => void;
  onReplay: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-800">
        <div className="flex items-start justify-between border-b border-slate-700 p-6">
          <div>
            <h2 className="font-mono text-xl font-bold text-white">{event.event_name}</h2>
            <p className="mt-1 text-sm text-slate-400">ID: {event.correlation_id}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-white">
            x
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="flex gap-3">
            <span
              className={`rounded border px-3 py-1 text-sm ${
                PRIORITY_BADGES[event.priority] || PRIORITY_BADGES.normal
              }`}
            >
              {event.priority} priority
            </span>
            <span
              className={`rounded px-3 py-1 text-sm ${
                STATUS_BADGES[event.status] || STATUS_BADGES.pending
              }`}
            >
              {event.status}
            </span>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-slate-900 p-4">
            <div className="text-center">
              <div className="text-sm text-slate-500">Source</div>
              <div className="text-white">{event.source_agent}</div>
            </div>
            <div className="relative flex-1 border-t border-dashed border-slate-600">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 px-2 text-slate-500">
                -&gt;
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-slate-500">Target</div>
              <div className="text-white">{event.target_agent || "Broadcast"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-500">Created</div>
              <div className="text-white">{new Date(event.created_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Processed</div>
              <div className="text-white">
                {event.processed_at ? new Date(event.processed_at).toLocaleString() : "-"}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm text-slate-500">Payload</div>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-300">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>

          <div className="flex gap-3 border-t border-slate-700 pt-4">
            {event.status === "failed" || event.status === "pending" ? (
              <button
                onClick={() => onReplay(event.id)}
                className="rounded-lg bg-claw-500 px-4 py-2 text-white transition hover:bg-claw-600"
              >
                Replay Event
              </button>
            ) : null}
            <button className="rounded-lg bg-slate-700 px-4 py-2 text-white transition hover:bg-slate-600">
              View Related
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<AgentEvent | null>(null);
  const [page, setPage] = useState(0);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const pageSize = 50;

  async function handleReplay(eventId: string) {
    setReplayingId(eventId);
    try {
      const response = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        alert(`Replay failed: ${error.error || "Unknown error"}`);
      } else {
        setSelectedEvent(null);
      }
    } finally {
      setReplayingId(null);
    }
  }

  useEffect(() => {
    async function fetchEvents() {
      try {
        const params = new URLSearchParams({
          type: selectedType,
          page: String(page),
          pageSize: String(pageSize),
        });
        const response = await fetch(`/api/events?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch events");
        }

        const data = (await response.json()) as { events?: AgentEvent[] };
        setEvents(data.events || []);
      } catch (error) {
        console.error("Error fetching events:", error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    setLoading(true);
    fetchEvents();
  }, [page, pageSize, selectedType]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Loading events...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-slate-400">Recent agent events and workflows</p>
        </div>
        <button className="rounded-lg bg-claw-500 px-4 py-2 text-white transition hover:bg-claw-600">
          + New Event
        </button>
      </div>

      <div className="flex gap-4">
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white focus:border-claw-500 focus:outline-none"
          value={selectedType}
          onChange={(event) => {
            setSelectedType(event.target.value);
            setPage(0);
          }}
        >
          {EVENT_TYPES.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-slate-900 text-left">
            <tr>
              <th className="px-4 py-3 text-sm font-medium text-slate-400">Event</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-400">Source</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-400">Target</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-400">Priority</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-400">Status</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Time</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onSelect={setSelectedEvent}
                onReplay={handleReplay}
                replayingId={replayingId}
              />
            ))}
          </tbody>
        </table>

        {events.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No events found</div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <button
          disabled={page === 0}
          onClick={() => setPage((current) => current - 1)}
          className="rounded-lg bg-slate-700 px-4 py-2 text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-slate-400">Page {page + 1}</span>
        <button
          disabled={events.length < pageSize}
          onClick={() => setPage((current) => current + 1)}
          className="rounded-lg bg-slate-700 px-4 py-2 text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>

      {selectedEvent ? (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onReplay={handleReplay}
        />
      ) : null}
    </div>
  );
}
