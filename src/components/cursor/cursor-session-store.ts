/**
 * Cursor Session History Store — localStorage-based
 *
 * Records every Cursor interaction session with its events so users
 * can browse action history (like GitHub Copilot / Cursor IDE).
 *
 * Storage: browser localStorage (NOT server DB).
 * Key: "cursor-sessions"
 * Limit: MAX_SESSIONS (50) — oldest sessions pruned automatically.
 *
 * Each session stores:
 *   - user's original message
 *   - all SSE events (tool_start, tool_result, thinking, etc.)
 *   - status (running / completed / error / cancelled)
 *   - timing (startedAt, completedAt, durationMs)
 *   - summary text
 *
 * Integration: cursor-panel.tsx hooks into this store at:
 *   - executeCommand()  → createSession()
 *   - handleWorkerEvent → addEvent()
 *   - done/error/cancel → completeSession()
 *
 * @module components/cursor/cursor-session-store
 */

import type { CursorAgentEvent, ToolStartMeta } from "@/modules/cursor/cursor-agent.types";
import type { CursorWorkerType } from "@/modules/cursor/cursor-workers";

// ===========================================
// Types
// ===========================================

export type SessionStatus = "running" | "completed" | "error" | "cancelled";

/**
 * A single recorded event within a cursor session.
 * Deliberately lightweight — we store the subset needed for display,
 * not the full CursorAgentEvent (which can be large for code_preview).
 */
export interface CursorSessionEvent {
  /** Monotonic index within the session */
  index: number;
  /** ISO timestamp */
  timestamp: string;
  /** Event type from CursorAgentEvent */
  eventType: CursorAgentEvent["type"];
  /** Tool name (for tool_start / tool_result) */
  toolName?: string;
  /** Tool kind from ToolStartMeta (e.g. "read_file", "write_file") */
  toolKind?: ToolStartMeta["kind"];
  /** Which worker was active */
  worker?: CursorWorkerType;
  /** Human-readable description (from describeAgentEvent) */
  description?: string;
  /** Whether tool_result was successful */
  success?: boolean;
  /** Duration in ms (for tool_result, measures time since matching tool_start) */
  durationMs?: number;
}

/**
 * A full cursor session — one user command → stream → done/error cycle.
 */
export interface CursorSession {
  /** Unique session ID (generated client-side) */
  id: string;
  /** The user's original message / command */
  userMessage: string;
  /** ISO timestamp when the session started */
  startedAt: string;
  /** ISO timestamp when the session ended (null if still running) */
  completedAt: string | null;
  /** Total duration in ms (set on completion) */
  durationMs: number | null;
  /** Session outcome */
  status: SessionStatus;
  /** Summary text (from done event or auto-generated) */
  summary: string | null;
  /** Workers that participated in this session */
  workers: Array<{ type: CursorWorkerType; displayName: string }>;
  /** All recorded events */
  events: CursorSessionEvent[];
  /** Number of tool executions (tool_start count) */
  toolCount: number;
  /** Number of errors within the session */
  errorCount: number;
}

// ===========================================
// Constants
// ===========================================

const STORAGE_KEY = "cursor-sessions";
const MAX_SESSIONS = 50;
const MAX_EVENTS_PER_SESSION = 200;

// ===========================================
// Internal Helpers
// ===========================================

function generateId(): string {
  return `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Load all sessions from localStorage.
 * Returns empty array on parse failure.
 */
function loadFromStorage(): CursorSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CursorSession[];
  } catch {
    return [];
  }
}

/**
 * Save sessions to localStorage, pruning to MAX_SESSIONS.
 * Silently ignores quota errors.
 */
function saveToStorage(sessions: CursorSession[]): void {
  try {
    const trimmed = sessions.slice(-MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — try removing oldest sessions
    try {
      const smaller = sessions.slice(-Math.floor(MAX_SESSIONS / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(smaller));
    } catch {
      // Give up silently — history is not critical
    }
  }
}

// ===========================================
// In-Memory State (mirrors localStorage)
// ===========================================

/** In-memory cache of sessions — avoids parsing JSON on every event */
let sessionsCache: CursorSession[] | null = null;

/** Active session ID — set by createSession, cleared by completeSession */
let activeSessionId: string | null = null;

/** Tracks the last tool_start timestamp per tool for duration calculation */
const toolStartTimestamps = new Map<string, number>();

/** Current event index counter */
let eventIndex = 0;

/** Current active worker — tracked for tagging events */
let currentWorker: { type: CursorWorkerType; displayName: string } | null = null;

function getSessionsCache(): CursorSession[] {
  if (!sessionsCache) {
    sessionsCache = loadFromStorage();
  }
  return sessionsCache;
}

function findActiveSession(): CursorSession | null {
  if (!activeSessionId) return null;
  return getSessionsCache().find((s) => s.id === activeSessionId) ?? null;
}

// ===========================================
// Public API
// ===========================================

/**
 * Create a new session when the user submits a command.
 * Returns the session ID for reference.
 */
export function createSession(userMessage: string): string {
  const sessions = getSessionsCache();
  const id = generateId();

  const session: CursorSession = {
    id,
    userMessage,
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    status: "running",
    summary: null,
    workers: [],
    events: [],
    toolCount: 0,
    errorCount: 0,
  };

  sessions.push(session);
  activeSessionId = id;
  eventIndex = 0;
  toolStartTimestamps.clear();
  currentWorker = null;

  saveToStorage(sessions);
  return id;
}

/**
 * Record a CursorAgentEvent into the active session.
 * Call this from handleWorkerEvent for every event.
 *
 * @param event The raw CursorAgentEvent
 * @param description Human-readable description (from describeAgentEvent)
 */
export function addEvent(
  event: CursorAgentEvent,
  description?: string,
): void {
  const session = findActiveSession();
  if (!session) return;
  if (session.events.length >= MAX_EVENTS_PER_SESSION) return;

  const now = Date.now();

  // Track worker changes
  if (event.type === "worker_start") {
    currentWorker = { type: event.worker, displayName: event.displayName };
    if (!session.workers.find((w) => w.type === event.worker)) {
      session.workers.push({ type: event.worker, displayName: event.displayName });
    }
  }
  if (event.type === "worker_switch") {
    currentWorker = { type: event.toWorker, displayName: event.toDisplayName };
    if (!session.workers.find((w) => w.type === event.toWorker)) {
      session.workers.push({ type: event.toWorker, displayName: event.toDisplayName });
    }
  }

  // Build the session event
  const sessionEvent: CursorSessionEvent = {
    index: eventIndex++,
    timestamp: new Date().toISOString(),
    eventType: event.type,
    worker: currentWorker?.type,
    description,
  };

  // Tool-specific fields
  if (event.type === "tool_start") {
    sessionEvent.toolName = event.tool;
    sessionEvent.toolKind = event.meta.kind;
    toolStartTimestamps.set(event.tool, now);
    session.toolCount++;
  }

  if (event.type === "tool_result") {
    sessionEvent.toolName = event.tool;
    sessionEvent.success = event.success;
    const startTime = toolStartTimestamps.get(event.tool);
    if (startTime) {
      sessionEvent.durationMs = now - startTime;
      toolStartTimestamps.delete(event.tool);
    }
    if (!event.success) {
      session.errorCount++;
    }
  }

  if (event.type === "error") {
    session.errorCount++;
  }

  session.events.push(sessionEvent);

  // Periodic save — every 5 events (not every event to reduce I/O)
  if (session.events.length % 5 === 0) {
    saveToStorage(getSessionsCache());
  }
}

/**
 * Mark the active session as completed/error/cancelled.
 * Flushes to localStorage immediately.
 */
export function completeSession(
  status: "completed" | "error" | "cancelled",
  summary?: string,
): void {
  const session = findActiveSession();
  if (!session) return;

  const endTime = new Date();
  session.status = status;
  session.completedAt = endTime.toISOString();
  session.durationMs = endTime.getTime() - new Date(session.startedAt).getTime();
  session.summary = summary ?? null;

  activeSessionId = null;
  eventIndex = 0;
  toolStartTimestamps.clear();
  currentWorker = null;

  saveToStorage(getSessionsCache());
}

/**
 * Get all sessions (most recent last).
 * Returns a copy to prevent external mutation.
 */
export function getSessions(): CursorSession[] {
  return [...getSessionsCache()];
}

/**
 * Get a single session by ID.
 */
export function getSession(id: string): CursorSession | null {
  return getSessionsCache().find((s) => s.id === id) ?? null;
}

/**
 * Get the currently active session (if any).
 */
export function getActiveSession(): CursorSession | null {
  return findActiveSession();
}

/**
 * Delete a single session by ID.
 */
export function deleteSession(id: string): void {
  const sessions = getSessionsCache();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx !== -1) {
    sessions.splice(idx, 1);
    saveToStorage(sessions);
  }
}

/**
 * Clear all session history.
 */
export function clearAllSessions(): void {
  sessionsCache = [];
  activeSessionId = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Get summary stats across all sessions.
 */
export function getSessionStats(): {
  totalSessions: number;
  completedSessions: number;
  errorSessions: number;
  totalToolCalls: number;
  totalDurationMs: number;
} {
  const sessions = getSessionsCache();
  return {
    totalSessions: sessions.length,
    completedSessions: sessions.filter((s) => s.status === "completed").length,
    errorSessions: sessions.filter((s) => s.status === "error").length,
    totalToolCalls: sessions.reduce((sum, s) => sum + s.toolCount, 0),
    totalDurationMs: sessions.reduce((sum, s) => sum + (s.durationMs ?? 0), 0),
  };
}
