/**
 * Cursor Checkpoint Service — localStorage-based
 *
 * Auto-snapshots conversation state before each AI turn so users can
 * restore to any previous point, rolling back both messages and
 * file changes.
 *
 * Storage: browser localStorage per session.
 * Key: "cursor-checkpoints-{sessionId}"
 * Limit: MAX_CHECKPOINTS (20) per session.
 *
 * @module components/cursor/cursor-checkpoints
 */

import type { CursorChatMessage } from "./types/cursor-chat.types";

// =============================================================================
// Types
// =============================================================================

export interface Checkpoint {
  /** Auto-incrementing index within the session */
  index: number;
  /** ISO timestamp */
  createdAt: string;
  /** First ~60 chars of the user message that triggered this checkpoint */
  label: string;
  /** Number of messages at this point (used to truncate on restore) */
  messageCount: number;
  /** Number of file actions recorded up to this point (frontend tracking only) */
  fileActionCount: number;
}

export interface FileActionSnapshot {
  path: string;
  type: "created" | "modified" | "deleted";
  originalContent: string | null;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_CHECKPOINTS = 20;

function storageKey(sessionId: string): string {
  return `cursor-checkpoints-${sessionId}`;
}

function fileActionsKey(sessionId: string): string {
  return `cursor-checkpoint-files-${sessionId}`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a checkpoint before an AI turn. Captures the current message count
 * and associates it with a label derived from the user message.
 */
export function createCheckpoint(
  sessionId: string,
  messages: CursorChatMessage[],
  fileActions: FileActionSnapshot[],
  label?: string,
): Checkpoint {
  const checkpoints = getCheckpoints(sessionId);
  const cp: Checkpoint = {
    index: checkpoints.length,
    createdAt: new Date().toISOString(),
    label: (label ?? messages[messages.length - 1]?.content ?? "").slice(0, 60) || `Checkpoint ${checkpoints.length}`,
    messageCount: messages.length,
    fileActionCount: fileActions.length,
  };

  checkpoints.push(cp);

  // Prune oldest if over limit (keep first + most recent)
  if (checkpoints.length > MAX_CHECKPOINTS) {
    checkpoints.splice(1, checkpoints.length - MAX_CHECKPOINTS);
  }

  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(checkpoints));
    // Store the file action snapshots for this checkpoint
    const allSnapshots = getFileActionSnapshots(sessionId);
    allSnapshots[cp.index] = fileActions;
    localStorage.setItem(fileActionsKey(sessionId), JSON.stringify(allSnapshots));
  } catch {
    /* localStorage full — silently skip */
  }

  return cp;
}

/**
 * Get all checkpoints for a session, ordered by index.
 */
export function getCheckpoints(sessionId: string): Checkpoint[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (!raw) return [];
    return JSON.parse(raw) as Checkpoint[];
  } catch {
    return [];
  }
}

/**
 * Get stored file action snapshots keyed by checkpoint index.
 */
function getFileActionSnapshots(sessionId: string): Record<number, FileActionSnapshot[]> {
  try {
    const raw = localStorage.getItem(fileActionsKey(sessionId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<number, FileActionSnapshot[]>;
  } catch {
    return {};
  }
}

/**
 * Restore to a checkpoint. Returns the data needed to:
 * 1. Truncate messages to checkpoint.messageCount
 * 2. Revert files that were changed after the checkpoint
 */
export function getRestoreData(
  sessionId: string,
  checkpointIndex: number,
): {
  checkpoint: Checkpoint;
  messageCount: number;
  filesToRevert: FileActionSnapshot[];
} | null {
  const checkpoints = getCheckpoints(sessionId);
  const cp = checkpoints.find((c) => c.index === checkpointIndex);
  if (!cp) return null;

  // Gather file actions from ALL checkpoints AFTER this one to build revert list
  const allSnapshots = getFileActionSnapshots(sessionId);
  const filesToRevert: FileActionSnapshot[] = [];
  const seenPaths = new Set<string>();

  // Walk backwards from latest to checkpoint+1 to collect files that need reverting
  for (let i = checkpoints.length - 1; i > checkpointIndex; i--) {
    const snap = allSnapshots[i];
    if (!snap) continue;
    // Only include new files that appeared after the checkpoint
    for (const fa of snap) {
      if (fa.path && !seenPaths.has(fa.path)) {
        // Only include if this file action index > checkpoint's fileActionCount
        seenPaths.add(fa.path);
        filesToRevert.push(fa);
      }
    }
  }

  return {
    checkpoint: cp,
    messageCount: cp.messageCount,
    filesToRevert,
  };
}

/**
 * After restoring, prune checkpoints beyond the restored index.
 */
export function pruneAfterRestore(sessionId: string, checkpointIndex: number): void {
  const checkpoints = getCheckpoints(sessionId);
  const pruned = checkpoints.filter((c) => c.index <= checkpointIndex);

  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(pruned));

    // Also prune file snapshots
    const allSnapshots = getFileActionSnapshots(sessionId);
    const prunedSnapshots: Record<number, FileActionSnapshot[]> = {};
    for (const [key, val] of Object.entries(allSnapshots)) {
      if (Number(key) <= checkpointIndex) {
        prunedSnapshots[Number(key)] = val;
      }
    }
    localStorage.setItem(fileActionsKey(sessionId), JSON.stringify(prunedSnapshots));
  } catch {
    /* ignore */
  }
}

/**
 * Clear all checkpoints for a session (e.g. when session is deleted).
 */
export function clearCheckpoints(sessionId: string): void {
  try {
    localStorage.removeItem(storageKey(sessionId));
    localStorage.removeItem(fileActionsKey(sessionId));
  } catch {
    /* ignore */
  }
}
