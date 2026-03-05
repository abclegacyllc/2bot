/**
 * 2Bot AI Agent Approval Store
 *
 * Server-side store for pending approval requests.
 * When the agent wants to run a terminal command, install packages,
 * or clone a repo, it pauses and waits for user approval.
 *
 * Flow:
 *   1. Agent loop calls requestApproval() → returns a Promise
 *   2. Agent loop awaits the Promise (SSE connection stays open)
 *   3. User clicks Approve/Reject in the UI
 *   4. Frontend POSTs to /agent/approve
 *   5. Route handler calls resolveApproval() → resolves the Promise
 *   6. Agent loop resumes — executes or skips the tool call
 *
 * Timeout: If user doesn't respond within 30s, auto-rejects.
 *
 * @module modules/2bot-ai-agent/agent-approval
 */

import { logger } from "@/lib/logger";

import type { AgentApprovalResponse } from "./agent.types";

const log = logger.child({ module: "2bot-ai-agent:approval" });

// ===========================================
// Constants
// ===========================================

/** Default timeout for user approval (30 seconds) */
const DEFAULT_APPROVAL_TIMEOUT_MS = 30_000;

// ===========================================
// In-Memory Store
// ===========================================

interface PendingApproval {
  resolve: (response: AgentApprovalResponse) => void;
  timer: ReturnType<typeof setTimeout>;
  toolName: string;
  createdAt: number;
}

/** Map<"sessionId:toolCallId", PendingApproval> */
const pendingApprovals = new Map<string, PendingApproval>();

// ===========================================
// Public API
// ===========================================

/**
 * Create a pending approval request.
 * Returns a Promise that resolves when the user approves or rejects,
 * or auto-rejects after the timeout.
 */
export function requestApproval(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  timeoutMs = DEFAULT_APPROVAL_TIMEOUT_MS,
): Promise<AgentApprovalResponse> {
  const key = `${sessionId}:${toolCallId}`;

  // Clean up any existing approval for this key (shouldn't happen, but be safe)
  if (pendingApprovals.has(key)) {
    clearApproval(key);
  }

  return new Promise<AgentApprovalResponse>((resolve) => {
    const timer = setTimeout(() => {
      log.info({ sessionId, toolCallId, toolName }, "⏰ Approval timed out — auto-rejecting");
      pendingApprovals.delete(key);
      resolve({ approved: false });
    }, timeoutMs);

    pendingApprovals.set(key, {
      resolve,
      timer,
      toolName,
      createdAt: Date.now(),
    });

    log.info({ sessionId, toolCallId, toolName }, "🔒 Approval requested — waiting for user");
  });
}

/**
 * Resolve a pending approval request.
 * Called when the user clicks Approve or Reject in the UI.
 *
 * @returns true if the approval was found and resolved, false if not found
 */
export function resolveApproval(
  sessionId: string,
  toolCallId: string,
  response: AgentApprovalResponse,
): boolean {
  const key = `${sessionId}:${toolCallId}`;
  const pending = pendingApprovals.get(key);

  if (!pending) {
    log.warn({ sessionId, toolCallId }, "No pending approval found (may have timed out)");
    return false;
  }

  clearTimeout(pending.timer);
  pendingApprovals.delete(key);

  log.info(
    { sessionId, toolCallId, approved: response.approved, toolName: pending.toolName },
    `🔓 Approval ${response.approved ? "APPROVED" : "REJECTED"} by user`,
  );

  pending.resolve(response);
  return true;
}

/**
 * Clear all pending approvals for a session.
 * Called on disconnect, error, or session completion.
 * Auto-rejects all pending approvals so the agent loop doesn't hang.
 */
export function clearSessionApprovals(sessionId: string): void {
  const prefix = `${sessionId}:`;
  let cleared = 0;

  for (const [key, pending] of pendingApprovals.entries()) {
    if (key.startsWith(prefix)) {
      clearTimeout(pending.timer);
      pending.resolve({ approved: false });
      pendingApprovals.delete(key);
      cleared++;
    }
  }

  if (cleared > 0) {
    log.info({ sessionId, cleared }, "Cleared pending approvals for session");
  }
}

/**
 * Check if there's a pending approval for a session.
 */
export function hasPendingApproval(sessionId: string): boolean {
  const prefix = `${sessionId}:`;
  for (const key of pendingApprovals.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

// ===========================================
// Internal
// ===========================================

function clearApproval(key: string): void {
  const pending = pendingApprovals.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    pendingApprovals.delete(key);
  }
}
