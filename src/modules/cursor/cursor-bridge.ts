/**
 * Cursor Bridge Utilities
 *
 * Shared helpers for connecting to workspace bridge clients and
 * retrying transient bridge errors. Used by both cursor-agent.service
 * and cursor-worker-runner.
 *
 * @module modules/cursor/cursor-bridge
 */

import { prisma } from "@/lib/prisma";
import { bridgeClientManager } from "@/modules/workspace";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

// ===========================================
// Bridge Client Helper
// ===========================================

/**
 * Get or reconnect a bridge client for a user's running workspace.
 * Returns both the client AND workspaceId (for session tracking).
 */
export async function getBridgeClient(
  userId: string,
  organizationId: string | null,
): Promise<{ client: BridgeClient; workspaceId: string } | null> {
  const container = await prisma.workspaceContainer.findFirst({
    where: {
      userId,
      organizationId: organizationId ?? null,
      status: "RUNNING",
    },
    select: { id: true, bridgePort: true, bridgeAuthToken: true },
  });
  if (!container) return null;

  const existing = bridgeClientManager.getExistingClient(container.id);
  if (existing) return { client: existing, workspaceId: container.id };

  if (!container.bridgePort || !container.bridgeAuthToken) return null;

  try {
    const { decrypt } = await import("@/lib/encryption");
    const authToken = container.bridgeAuthToken.startsWith("v1:")
      ? decrypt(container.bridgeAuthToken)
      : container.bridgeAuthToken;
    const client = await bridgeClientManager.getClient(
      container.id,
      container.bridgePort,
      authToken,
    );
    return { client, workspaceId: container.id };
  } catch {
    return null;
  }
}

// ===========================================
// Retry Helper
// ===========================================

const MAX_BRIDGE_RETRIES = 2;
const BRIDGE_RETRY_DELAY_MS = 500;

/**
 * Retry a bridge operation for transient connection errors.
 * @param fn - The async operation to retry
 * @param label - Label for logging
 * @param log - Logger instance (optional, uses console.warn if not provided)
 */
export async function withBridgeRetry<T>(
  fn: () => Promise<T>,
  label: string,
  log?: { warn: (obj: Record<string, unknown>, msg: string) => void },
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_BRIDGE_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message?.toLowerCase() || "";
      const isTransient = msg.includes("timeout") || msg.includes("econnreset") ||
        msg.includes("socket") || msg.includes("disconnected") || msg.includes("econnrefused");
      if (!isTransient || attempt >= MAX_BRIDGE_RETRIES) break;
      if (log) {
        log.warn({ attempt: attempt + 1, label, error: msg }, "Retrying transient bridge error");
      }
      await new Promise((r) => setTimeout(r, BRIDGE_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastError;
}
