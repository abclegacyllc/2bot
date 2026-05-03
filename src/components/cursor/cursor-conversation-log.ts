/**
 * Cursor Conversation Log — localStorage-based
 *
 * Preserves full conversation history for user reading.
 * When retry/edit/restore truncates the active message array,
 * the discarded messages are saved here as a "snapshot" so users
 * can browse the complete conversation timeline.
 *
 * The AI engine only sees the truncated (active) messages.
 * This log is purely for human review — read-only history.
 *
 * Storage: browser localStorage per storage key.
 * Key: "cursor-conv-log-{storageKey}"
 * Limit: MAX_SNAPSHOTS (30) per session.
 *
 * @module components/cursor/cursor-conversation-log
 */

import type { CursorChatMessage } from "./types/cursor-chat.types";

// =============================================================================
// Types
// =============================================================================

/** Lightweight serialized message (no Date objects, no heavy blocks) */
export interface SerializedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  modelUsed?: string;
  status?: string;
  timestamp: string;
}

/** A snapshot of the conversation taken before a retry/edit/restore */
export interface ConversationSnapshot {
  /** Full message array at the time of the action */
  messages: SerializedMessage[];
  /** What caused this snapshot to be superseded */
  action: "retry" | "edit" | "restore";
  /** Human-readable description of the action */
  label: string;
  /** When the action was taken (ISO) */
  timestamp: string;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_PREFIX = "cursor-conv-log-";
const MAX_SNAPSHOTS = 30;

function makeKey(sessionKey: string): string {
  return STORAGE_PREFIX + sessionKey;
}

// =============================================================================
// Internal
// =============================================================================

function serializeMessage(msg: CursorChatMessage): SerializedMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    reasoning: msg.reasoning,
    modelUsed: msg.modelUsed,
    status: msg.status,
    timestamp:
      msg.timestamp instanceof Date
        ? msg.timestamp.toISOString()
        : String(msg.timestamp),
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Save a snapshot of the current conversation before truncation.
 * Called by the hook right before retry/edit/restore discards messages.
 */
export function saveSnapshot(
  sessionKey: string,
  messages: CursorChatMessage[],
  action: "retry" | "edit" | "restore",
  label: string,
): void {
  try {
    const snapshots = getSnapshots(sessionKey);
    snapshots.push({
      messages: messages.map(serializeMessage),
      action,
      label,
      timestamp: new Date().toISOString(),
    });
    const trimmed = snapshots.slice(-MAX_SNAPSHOTS);
    localStorage.setItem(makeKey(sessionKey), JSON.stringify(trimmed));
  } catch {
    // localStorage full — non-critical feature
  }
}

/**
 * Get all saved conversation snapshots for a session.
 */
export function getSnapshots(sessionKey: string): ConversationSnapshot[] {
  try {
    const raw = localStorage.getItem(makeKey(sessionKey));
    if (!raw) return [];
    return JSON.parse(raw) as ConversationSnapshot[];
  } catch {
    return [];
  }
}

/**
 * Clear the conversation log for a session (e.g., when user clears messages).
 */
export function clearConversationLog(sessionKey: string): void {
  try {
    localStorage.removeItem(makeKey(sessionKey));
  } catch {
    // ignore
  }
}
