/**
 * Cursor Session History Panel
 *
 * Displays past cursor sessions with expandable event timelines.
 * Similar to GitHub Copilot's action history / Cursor IDE's session log.
 *
 * Reads from the localStorage-based cursor-session-store.
 *
 * @module components/cursor/cursor-history-panel
 */

"use client";

import { cn } from "@/lib/utils";
import {
    AlertCircle,
    Check,
    ChevronDown,
    ChevronRight,
    Clock,
    Loader2,
    Trash2,
    Wrench,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { CursorSession, CursorSessionEvent, SessionStatus } from "./cursor-session-store";
import { clearAllSessions, deleteSession, getSessions } from "./cursor-session-store";

// ===========================================
// Helpers
// ===========================================

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Today ${time}`;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` ${time}`;
  } catch {
    return iso;
  }
}

function statusIcon(status: SessionStatus) {
  switch (status) {
    case "completed":
      return <Check size={14} className="text-emerald-400" />;
    case "error":
      return <AlertCircle size={14} className="text-red-400" />;
    case "cancelled":
      return <XCircle size={14} className="text-yellow-400" />;
    case "running":
      return <Loader2 size={14} className="text-blue-400 animate-spin" />;
  }
}

function statusLabel(status: SessionStatus): string {
  switch (status) {
    case "completed": return "Completed";
    case "error": return "Error";
    case "cancelled": return "Cancelled";
    case "running": return "Running";
  }
}

function eventIcon(eventType: CursorSessionEvent["eventType"]) {
  switch (eventType) {
    case "tool_start":
      return <Wrench size={11} className="text-blue-300" />;
    case "tool_result":
      return <Check size={11} className="text-emerald-300" />;
    case "error":
      return <AlertCircle size={11} className="text-red-300" />;
    case "worker_start":
    case "worker_switch":
      return <Loader2 size={11} className="text-purple-300" />;
    default:
      return <Clock size={11} className="text-zinc-400" />;
  }
}

// ===========================================
// Session Card
// ===========================================

function SessionCard({
  session,
  onDelete,
}: {
  session: CursorSession;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Filter events to only show interesting ones (skip thinking, iteration_start)
  const visibleEvents = session.events.filter(
    (e) =>
      e.eventType === "tool_start" ||
      e.eventType === "tool_result" ||
      e.eventType === "worker_start" ||
      e.eventType === "worker_switch" ||
      e.eventType === "error" ||
      e.eventType === "done" ||
      e.eventType === "ask_user" ||
      e.eventType === "code_preview",
  );

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-start gap-2 p-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="mt-0.5 shrink-0">
          {expanded ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-zinc-200 truncate">
            {session.userMessage}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
            {statusIcon(session.status)}
            <span>{statusLabel(session.status)}</span>
            <span className="opacity-40">·</span>
            <span>{formatTime(session.startedAt)}</span>
            {session.durationMs !== null ? (
              <>
                <span className="opacity-40">·</span>
                <span>{formatDuration(session.durationMs)}</span>
              </>
            ) : null}
            {session.toolCount > 0 ? (
              <>
                <span className="opacity-40">·</span>
                <Wrench size={10} className="inline" />
                <span>{session.toolCount} tools</span>
              </>
            ) : null}
          </div>
          {session.summary ? (
            <p className="mt-1 text-[11px] text-zinc-400 truncate">
              {session.summary}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.id);
          }}
          className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors opacity-40 hover:opacity-100"
          title="Delete session"
        >
          <Trash2 size={12} />
        </button>
      </button>

      {/* Expanded event timeline */}
      {expanded && visibleEvents.length > 0 ? (
        <div className="border-t border-white/5 px-3 py-2 space-y-1">
          {visibleEvents.map((evt) => (
            <div
              key={evt.index}
              className={cn(
                "flex items-start gap-2 py-1 text-[11px]",
                evt.eventType === "error" ? "text-red-300" : "text-zinc-400",
              )}
            >
              <span className="mt-0.5 shrink-0">{eventIcon(evt.eventType)}</span>
              <span className="flex-1 min-w-0 truncate">
                {evt.description || `${evt.eventType}${evt.toolName ? `: ${evt.toolName}` : ""}`}
              </span>
              {evt.durationMs !== undefined && (
                <span className="shrink-0 text-zinc-500 tabular-nums">
                  {formatDuration(evt.durationMs)}
                </span>
              )}
            </div>
          ))}
          {visibleEvents.length === 0 && (
            <p className="text-[11px] text-zinc-500 py-1">No tool events recorded.</p>
          )}
        </div>
      ) : null}

      {expanded && visibleEvents.length === 0 ? (
        <div className="border-t border-white/5 px-3 py-2">
          <p className="text-[11px] text-zinc-500">No tool events recorded.</p>
        </div>
      ) : null}

      {/* Workers badge row */}
      {expanded && session.workers.length > 0 ? (
        <div className="border-t border-white/5 px-3 py-2 flex flex-wrap gap-1">
          {session.workers.map((w) => (
            <span
              key={w.type}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-zinc-300"
            >
              {w.displayName}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ===========================================
// Main History Panel
// ===========================================

export function CursorHistoryPanel({
  onCloseAction,
}: {
  /** Called when user wants to go back to chat view */
  onCloseAction: () => void;
}) {
  const [sessions, setSessions] = useState<CursorSession[]>(() => getSessions());

  // Refresh sessions periodically for live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setSessions(getSessions());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteSession(id);
    setSessions(getSessions());
  }, []);

  const handleClearAll = useCallback(() => {
    clearAllSessions();
    setSessions([]);
  }, []);

  // Show most recent first
  const reversed = [...sessions].reverse();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <button
          type="button"
          onClick={onCloseAction}
          className="text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
        >
          <ChevronDown size={12} className="rotate-90" />
          Back to chat
        </button>
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 size={10} />
            Clear all
          </button>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
        {reversed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <Clock size={24} className="mb-2 opacity-40" />
            <p className="text-[13px]">No session history yet</p>
            <p className="text-[11px] mt-1 opacity-70">
              Your cursor sessions will appear here
            </p>
          </div>
        ) : (
          reversed.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Footer stats */}
      {sessions.length > 0 && (
        <div className="border-t border-white/10 px-3 py-1.5 text-[10px] text-zinc-500 flex items-center gap-3">
          <span>{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
          <span className="opacity-40">·</span>
          <span>
            {sessions.reduce((sum, s) => sum + s.toolCount, 0)} total tool calls
          </span>
        </div>
      )}
    </div>
  );
}
