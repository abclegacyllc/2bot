/**
 * 2Bot AI Agent Actions Tracker
 *
 * Tracks all file modifications made by the AI agent within a session.
 * Stores before/after content for:
 *   - Diff display (GitHub Copilot–style before/after comparison)
 *   - One-click restore (undo individual files or entire session)
 *   - Conflict detection (if file changed after AI modified it)
 *
 * Storage is in-memory per session with a 1-hour TTL.
 * This is acceptable because restores are session-scoped and
 * only relevant while the user is actively reviewing.
 *
 * @module modules/2bot-ai-agent/agent-actions
 */

import { logger } from "@/lib/logger";
import { workspaceService } from "@/modules/workspace/workspace.service";
import type { ServiceContext } from "@/shared/types/context";

import type { AgentFileAction, AgentRestoreResult } from "./agent.types";

const log = logger.child({ module: "2bot-ai-agent:actions" });

// ===========================================
// Constants
// ===========================================

/** Maximum content size to backup per file (500 KB) */
const MAX_BACKUP_CONTENT_SIZE = 500_000;

/** Auto-cleanup TTL for session actions (1 hour) */
const SESSION_TTL_MS = 60 * 60 * 1000;

/** Preview lines for diff display */
const PREVIEW_MAX_LINES = 60;
const PREVIEW_MAX_CHARS = 4000;

// ===========================================
// In-Memory Store
// ===========================================

interface SessionActionStore {
  actions: AgentFileAction[];
  workspaceId: string;
  createdAt: number;
  cleanupTimer: ReturnType<typeof setTimeout>;
}

/** Map<sessionId, SessionActionStore> */
const sessionStore = new Map<string, SessionActionStore>();

// ===========================================
// Public API
// ===========================================

/**
 * Initialize action tracking for a new session.
 */
export function initSession(sessionId: string, workspaceId: string): void {
  // Clean up any existing session with this ID
  clearSession(sessionId);

  const cleanupTimer = setTimeout(() => {
    log.info({ sessionId }, "Auto-cleaning expired session actions");
    clearSession(sessionId);
  }, SESSION_TTL_MS);

  sessionStore.set(sessionId, {
    actions: [],
    workspaceId,
    createdAt: Date.now(),
    cleanupTimer,
  });
}

/**
 * Track a file modification.
 *
 * Call this AFTER the modification is executed so we know it succeeded.
 * The originalContent should be fetched BEFORE the modification.
 */
export function trackFileAction(
  sessionId: string,
  action: AgentFileAction,
): void {
  const store = sessionStore.get(sessionId);
  if (!store) {
    log.warn({ sessionId }, "Cannot track action — session not found");
    return;
  }

  store.actions.push(action);
  log.info(
    { sessionId, actionId: action.id, type: action.type, path: action.path },
    `📝 Tracked AI file action: ${action.type} ${action.path}`,
  );
}

/**
 * Read a file's current content for backup before modification.
 * Returns null if the file doesn't exist (e.g., for new file creation).
 */
export async function readFileForBackup(
  workspaceId: string,
  filePath: string,
  ctx: ServiceContext,
): Promise<{ content: string | null; truncated: boolean }> {
  try {
    const result = await workspaceService.sendBridgeAction(
      ctx,
      workspaceId,
      "file.read",
      { path: filePath },
    );

    const content = (result as { content?: string })?.content ?? null;
    if (content === null) {
      return { content: null, truncated: false };
    }

    // Truncate large files
    if (content.length > MAX_BACKUP_CONTENT_SIZE) {
      return {
        content: content.substring(0, MAX_BACKUP_CONTENT_SIZE),
        truncated: true,
      };
    }

    return { content, truncated: false };
  } catch {
    // File doesn't exist — this is normal for new file creation
    return { content: null, truncated: false };
  }
}

/**
 * Get all tracked file actions for a session.
 */
export function getSessionActions(sessionId: string): AgentFileAction[] {
  return sessionStore.get(sessionId)?.actions ?? [];
}

/**
 * Generate a content preview for diff display.
 * Returns the first N lines, truncated if needed.
 */
export function generatePreview(content: string | null): string | null {
  if (content === null) return null;

  const lines = content.split("\n");
  if (lines.length <= PREVIEW_MAX_LINES && content.length <= PREVIEW_MAX_CHARS) {
    return content;
  }

  const previewLines = lines.slice(0, PREVIEW_MAX_LINES);
  let preview = previewLines.join("\n");

  if (preview.length > PREVIEW_MAX_CHARS) {
    preview = preview.substring(0, PREVIEW_MAX_CHARS);
  }

  const remainingLines = lines.length - PREVIEW_MAX_LINES;
  if (remainingLines > 0) {
    preview += `\n\n... (${remainingLines} more lines)`;
  }

  return preview;
}

/**
 * Restore all AI file actions from a session (undo all changes).
 *
 * Processes actions in REVERSE order (last change first) to handle
 * cases where the AI modified the same file multiple times.
 *
 * Conflict detection: If the current file content doesn't match what
 * the AI wrote (e.g., user manually edited after AI), we flag it as
 * a conflict and skip (unless force=true).
 */
export async function restoreSession(
  sessionId: string,
  ctx: ServiceContext,
  force = false,
): Promise<AgentRestoreResult> {
  const store = sessionStore.get(sessionId);
  if (!store) {
    return { restoredCount: 0, conflictCount: 0, details: [] };
  }

  const result: AgentRestoreResult = {
    restoredCount: 0,
    conflictCount: 0,
    details: [],
  };

  // Process in reverse order
  const reversedActions = [...store.actions].reverse();

  for (const action of reversedActions) {
    try {
      const restoreResult = await restoreSingleAction(
        action,
        store.workspaceId,
        ctx,
        force,
      );

      result.details.push(restoreResult);

      if (restoreResult.status === "restored") {
        result.restoredCount++;
      } else if (restoreResult.status === "conflict") {
        result.conflictCount++;
      }
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
    "📝 Session restore completed",
  );

  return result;
}

/**
 * Restore a single file action.
 */
export async function restoreSingleAction(
  action: AgentFileAction,
  workspaceId: string,
  ctx: ServiceContext,
  force = false,
): Promise<AgentRestoreResult["details"][number]> {
  const { type, path, newPath, originalContent, newContent, id: actionId } = action;

  switch (type) {
    case "modified": {
      if (originalContent === null) {
        return { actionId, path, type, status: "error", message: "No original content to restore" };
      }

      // Conflict check: read current content and compare to what AI wrote
      if (!force) {
        const conflict = await checkConflict(workspaceId, path, newContent, ctx);
        if (conflict) {
          return { actionId, path, type, status: "conflict", message: conflict };
        }
      }

      // Restore original content
      await workspaceService.sendBridgeAction(ctx, workspaceId, "file.write", {
        path,
        content: originalContent,
        createDirs: false,
      });

      return { actionId, path, type, status: "restored" };
    }

    case "created": {
      // Conflict check: make sure the file still has what AI wrote
      if (!force) {
        const conflict = await checkConflict(workspaceId, path, newContent, ctx);
        if (conflict) {
          return { actionId, path, type, status: "conflict", message: conflict };
        }
      }

      // Delete the file AI created
      await workspaceService.sendBridgeAction(ctx, workspaceId, "file.delete", { path });

      return { actionId, path, type, status: "restored" };
    }

    case "deleted": {
      if (originalContent === null) {
        return { actionId, path, type, status: "error", message: "No original content to restore" };
      }

      // Re-create the deleted file with original content
      await workspaceService.sendBridgeAction(ctx, workspaceId, "file.write", {
        path,
        content: originalContent,
        createDirs: true,
      });

      return { actionId, path, type, status: "restored" };
    }

    case "renamed": {
      if (!newPath) {
        return { actionId, path, type, status: "error", message: "No new path recorded for rename" };
      }

      // Rename back: newPath → original path
      await workspaceService.sendBridgeAction(ctx, workspaceId, "file.rename", {
        oldPath: newPath,
        newPath: path,
      });

      return { actionId, path, type, status: "restored" };
    }

    default:
      return { actionId, path, type, status: "error", message: `Unknown action type: ${type}` };
  }
}

/**
 * Check if a file has been modified since the AI last wrote it.
 * Returns a conflict message if the content differs, or null if it matches.
 */
async function checkConflict(
  workspaceId: string,
  filePath: string,
  expectedContent: string | null,
  ctx: ServiceContext,
): Promise<string | null> {
  try {
    const result = await workspaceService.sendBridgeAction(
      ctx,
      workspaceId,
      "file.read",
      { path: filePath },
    );

    const currentContent = (result as { content?: string })?.content ?? null;

    // If we expected content and the file was modified externally
    if (expectedContent !== null && currentContent !== null) {
      if (currentContent !== expectedContent) {
        return "File has been modified since AI changes — content differs from what the agent wrote. Use force restore to override.";
      }
    }

    // If file should exist (we tried to write it) but doesn't
    if (expectedContent !== null && currentContent === null) {
      return "File no longer exists — may have been manually deleted.";
    }

    return null; // No conflict
  } catch {
    // Can't read the file — might have been deleted or moved
    if (expectedContent !== null) {
      return "Cannot read current file — it may have been deleted or moved.";
    }
    return null;
  }
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

/**
 * Get the number of active sessions being tracked (for monitoring).
 */
export function getActiveSessionCount(): number {
  return sessionStore.size;
}
