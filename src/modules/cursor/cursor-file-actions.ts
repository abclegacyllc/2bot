/**
 * Cursor File Actions Tracker
 *
 * Tracks file modifications made by Cursor Coder within a session.
 * Ported from 2Bot AI Agent's agent-actions.ts, adapted to use
 * BridgeClient instead of workspaceService.
 *
 * Provides:
 *   - Per-session in-memory tracking with 1-hour TTL
 *   - Backup before modification (read original content)
 *   - Restore (undo) individual actions or entire session
 *   - Conflict detection (if file changed after AI modified it)
 *
 * @module modules/cursor/cursor-file-actions
 */

import { logger } from "@/lib/logger";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

const log = logger.child({ module: "cursor:file-actions" });

// ===========================================
// Types
// ===========================================

export type FileActionType = "created" | "modified" | "deleted";

export interface CursorFileAction {
  id: string;
  type: FileActionType;
  path: string;
  originalContent: string | null;
  newContent: string | null;
  contentTruncated: boolean;
  toolCallId: string;
  timestamp: Date;
}

export interface RestoreResult {
  restoredCount: number;
  conflictCount: number;
  details: Array<{
    actionId: string;
    path: string;
    type: FileActionType;
    status: "restored" | "conflict" | "error";
    message?: string;
  }>;
}

// ===========================================
// Constants
// ===========================================

/** Maximum content size to backup per file (500 KB) */
const MAX_BACKUP_SIZE = 500_000;

/** Auto-cleanup TTL for session actions (1 hour) */
const SESSION_TTL_MS = 60 * 60 * 1000;

// ===========================================
// In-Memory Store
// ===========================================

interface SessionActionStore {
  actions: CursorFileAction[];
  cleanupTimer: ReturnType<typeof setTimeout>;
}

const sessionStore = new Map<string, SessionActionStore>();

// ===========================================
// Public API
// ===========================================

/**
 * Initialize action tracking for a new Cursor session.
 */
export function initSession(sessionId: string): void {
  clearSession(sessionId);

  const cleanupTimer = setTimeout(() => {
    log.info({ sessionId }, "Auto-cleaning expired cursor file actions");
    clearSession(sessionId);
  }, SESSION_TTL_MS);

  sessionStore.set(sessionId, { actions: [], cleanupTimer });
}

/**
 * Read a file's current content for backup before modification.
 * Returns null if the file doesn't exist (new file creation).
 */
export async function readFileForBackup(
  client: BridgeClient,
  filePath: string,
): Promise<{ content: string | null; truncated: boolean }> {
  try {
    const result = await client.fileRead(filePath) as { content?: string };
    const content = result?.content ?? null;
    if (content === null) {
      return { content: null, truncated: false };
    }
    if (content.length > MAX_BACKUP_SIZE) {
      return { content: content.substring(0, MAX_BACKUP_SIZE), truncated: true };
    }
    return { content, truncated: false };
  } catch {
    // File doesn't exist — normal for new file creation
    return { content: null, truncated: false };
  }
}

/**
 * Track a file modification after it succeeds.
 */
export function trackFileAction(sessionId: string, action: CursorFileAction): void {
  const store = sessionStore.get(sessionId);
  if (!store) {
    log.warn({ sessionId }, "Cannot track action — session not found");
    return;
  }
  store.actions.push(action);
  log.info(
    { sessionId, actionId: action.id, type: action.type, path: action.path },
    `📝 Tracked cursor file action: ${action.type} ${action.path}`,
  );
}

/**
 * Get all tracked file actions for a session.
 */
export function getSessionActions(sessionId: string): CursorFileAction[] {
  return sessionStore.get(sessionId)?.actions ?? [];
}

/**
 * Restore all file actions in a session (undo all changes).
 * Processes in LIFO order for correct multi-edit handling.
 */
export async function restoreSession(
  sessionId: string,
  client: BridgeClient,
  force = false,
): Promise<RestoreResult> {
  const store = sessionStore.get(sessionId);
  if (!store) {
    return { restoredCount: 0, conflictCount: 0, details: [] };
  }

  const result: RestoreResult = { restoredCount: 0, conflictCount: 0, details: [] };
  const reversedActions = [...store.actions].reverse();

  for (const action of reversedActions) {
    try {
      const detail = await restoreSingleAction(action, client, force);
      result.details.push(detail);
      if (detail.status === "restored") result.restoredCount++;
      else if (detail.status === "conflict") result.conflictCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ sessionId, actionId: action.id, error: message }, "Failed to restore action");
      result.details.push({
        actionId: action.id,
        path: action.path,
        type: action.type,
        status: "error",
        message,
      });
    }
  }

  log.info(
    { sessionId, restored: result.restoredCount, conflicts: result.conflictCount },
    "📝 Cursor session restore completed",
  );

  return result;
}

/**
 * Clean up session actions and timers.
 */
export function clearSession(sessionId: string): void {
  const store = sessionStore.get(sessionId);
  if (store) {
    clearTimeout(store.cleanupTimer);
    sessionStore.delete(sessionId);
  }
}

// ===========================================
// Internal Helpers
// ===========================================

async function restoreSingleAction(
  action: CursorFileAction,
  client: BridgeClient,
  force: boolean,
): Promise<RestoreResult["details"][number]> {
  const { type, path, originalContent, newContent, id: actionId } = action;

  switch (type) {
    case "modified": {
      if (originalContent === null) {
        return { actionId, path, type, status: "error", message: "No original content to restore" };
      }
      if (!force) {
        const conflict = await checkConflict(client, path, newContent);
        if (conflict) return { actionId, path, type, status: "conflict", message: conflict };
      }
      await client.fileWrite(path, originalContent, false);
      return { actionId, path, type, status: "restored" };
    }

    case "created": {
      if (!force) {
        const conflict = await checkConflict(client, path, newContent);
        if (conflict) return { actionId, path, type, status: "conflict", message: conflict };
      }
      await client.fileDelete(path);
      return { actionId, path, type, status: "restored" };
    }

    case "deleted": {
      if (originalContent === null) {
        return { actionId, path, type, status: "error", message: "No original content to restore" };
      }
      await client.fileWrite(path, originalContent, true);
      return { actionId, path, type, status: "restored" };
    }

    default:
      return { actionId, path, type, status: "error", message: `Unknown action type: ${type}` };
  }
}

async function checkConflict(
  client: BridgeClient,
  filePath: string,
  expectedContent: string | null,
): Promise<string | null> {
  try {
    const result = await client.fileRead(filePath) as { content?: string };
    const currentContent = result?.content ?? null;

    if (expectedContent !== null && currentContent !== null && currentContent !== expectedContent) {
      return "File has been modified since AI changes — use force restore to override.";
    }
    if (expectedContent !== null && currentContent === null) {
      return "File no longer exists — may have been manually deleted.";
    }
    return null;
  } catch {
    if (expectedContent !== null) {
      return "Cannot read current file — it may have been deleted or moved.";
    }
    return null;
  }
}
