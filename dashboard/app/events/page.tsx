"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

interface AgentEvent {
  id: string;
  event_name: string;
  source_agent: string;
  target_agent: string;
  payload: Record<string, any>;
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
}: {
  event: AgentEvent;
  onSelect: (e: AgentEvent) => void;
}) {
  const time = new Date(event.created_at).toLocaleTimeString();
  const date = new Date(event.created_at).toLocaleDateString();

  return (
    <tr
      className="border-b border-slate-700/50 hover:bg-slate-800/50 cursor-pointer"
      onClick={() => onSelect(event)}
    >
      <td className="py-3 px-4">
        <div className="font-mono text-sm text-white">{event.event_name}</div>
        <div className="text-xs text-slate-500">
          {event.correlation_id?.substring(0, 8)}...
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm text-slate-300">{event.source_agent}</div>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm text-slate-300">{event.target_agent || "—"}</div>
      </td>
      <td className="py-3 px-4">
        <span
          className={`px-2 py-0.5 rounded text-xs border ${
            PRIORITY_BADGES[event.priority] || PRIORITY_BADGES.normal
          }`}
        >
          {event.priority}
        </span>
      </td>
      <td className="py-3 px-4">
        <span
          className={`px-2 py-0.5 rounded text-xs ${
            STATUS_BADGES[event.status] || STATUS_BADGES.pending
          }`}
        >
          {event.status}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        <div className="text-sm text-slate-400">{time}</div>
        <div className="text-xs text-slate-600">{date}</div>
      </td>
    </tr>
  );
}

function EventDetail({
  event,
  onClose,
}: {
  event: AgentEvent;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-700 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white font-mono">
              {event.event_name}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              ID: {event.correlation_id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status badges */}
          <div className="flex gap-3">
            <span
              className={`px-3 py-1 rounded text-sm border ${
                PRIORITY_BADGES[event.priority] || PRIORITY_BADGES.normal
              }`}
            >
              {event.priority} priority
            </span>
            <span
              className={`px-3 py-1 rounded text-sm ${
                STATUS_BADGES[event.status] || STATUS_BADGES.pending
              }`}
            >
              {event.status}
            </span>
          </div>

          {/* Event flow */}
          <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-lg">
            <div className="text-center">
              <div className="text-sm text-slate-500">Source</div>
              <div className="text-white font-medium">{event.source_agent}</div>
            </div>
            <div className="flex-1 border-t border-dashed border-slate-600 relative">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-slate-900 px-2">
                <span className="text-slate-500">→</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-slate-500">Target</div>
              <div className="text-white font-medium">
                {event.target_agent || "Broadcast"}
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-slate-500 text-sm">Created</div>
              <div className="text-white">
                {new Date(event.created_at).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-sm">Processed</div>
              <div className="text-white">
                {event.processed_at
                  ? new Date(event.processed_at).toLocaleString()
                  : "—"}
              </div>
            </div>
          </div>

          {/* Payload */}
          <div>
            <div className="text-slate-500 text-sm mb-2">Payload</div>
            <pre className="p-4 bg-slate-900 rounded-lg overflow-x-auto text-sm text-slate-300 font-mono">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition">
              Replay Event
            </button>
            <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition">
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
  const pageSize = 50;

  useEffect(() => {
    async function fetchEvents() {
      if (!supabase) { setLoading(false); return; }
      let query = supabase
        .from("agent_events")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (selectedType !== "all") {
        query = query.ilike("event_name", `${selectedType}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching events:", error);
      } else {
        setEvents(data || []);
      }
      setLoading(false);
    }

    fetchEvents();
  }, [selectedType, page]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading events...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-slate-400">Recent agent events and workflows</p>
        </div>
        <button className="px-4 py-2 bg-claw-500 hover:bg-claw-600 text-white rounded-lg transition">
          + New Event
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-claw-500"
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value);
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

      {/* Events table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-slate-900 text-left">
            <tr>
              <th className="py-3 px-4 text-sm text-slate-400 font-medium">
                Event
              </th>
              <th className="py-3 px-4 text-sm text-slate-400 font-medium">
                Source
              </th>
              <th className="py-3 px-4 text-sm text-slate-400 font-medium">
                Target
              </th>
              <th className="py-3 px-4 text-sm text-slate-400 font-medium">
                Priority
              </th>
              <th className="py-3 px-4 text-sm text-slate-400 font-medium">
                Status
              </th>
              <th className="py-3 px-4 text-sm text-slate-400 font-medium text-right">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onSelect={setSelectedEvent}
              />
            ))}
          </tbody>
        </table>

        {events.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No events found
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="text-slate-400">Page {page + 1}</span>
        <button
          disabled={events.length < pageSize}
          onClick={() => setPage((p) => p + 1)}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
