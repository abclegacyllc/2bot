/**
 * Cursor Brain — Multi-Worker Stream Client
 *
 * Lightweight client that connects the frontend to the multi-worker
 * SSE endpoint. The backend handles routing, worker selection, and
 * tool execution — this module just manages the SSE connection.
 *
 * @module components/cursor/cursor-brain
 */

import { apiUrl } from "@/shared/config/urls";

// ===========================================
// Multi-Worker Stream Client
// ===========================================

/** Request body for the worker-stream endpoint */
export interface WorkerStreamClientRequest {
  message: string;
  pluginSlug?: string;
  pluginName?: string;
  mode?: "create" | "edit" | "analyze-repo";
  /** AI model ID (defaults to "auto" on server) */
  modelId?: string;
  /** GitHub/GitLab HTTPS URL to clone and analyze */
  repoUrl?: string;
  /** Git branch to clone (defaults to default branch) */
  repoBranch?: string;
  /** User description of what the plugin should do */
  description?: string;
  /** Workflow context for Studio AI operations */
  workflowContext?: WorkflowContext;
  /** Studio mode — controls tool availability and prompt behavior */
  studioMode?: "agent" | "ask" | "plan" | "build";
  /**
   * Declarative agent name from the dropdown (e.g. "agent" / "ask" / "plan").
   * The backend uses this to apply the agent's frontmatter (runtime + studioMode).
   * When omitted, the legacy `studioMode` + heuristic routing is used.
   */
  agentName?: string;
  /** Resume a suspended session — message becomes the user's answer */
  resumeSessionId?: string;
  /**
   * Frontend chat thread ID (the activeSessionId from cursor-studio-bar).
   * Scopes agent memories to this chat session — fresh chat = clean slate.
   */
  chatThreadId?: string;
  /**
   * Attached images (base64 data URLs) to include in the first user message.
   * Format: "data:image/png;base64,..." — max 4 images, each ≤ 4 MB.
   */
  imageParts?: Array<{ url: string; mimeType: string }>;
  /**
   * Prior turns from the current chat session — gives the AI memory of what was discussed.
   * Serialized from the frontend messages array before each send.
   */
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  /**
   * User-configured per-session credit budget (from the Cursor settings popover).
   * When supplied, overrides the per-runtime defaults (assistant=10, coder=30).
   * Server clamps to a safe range; repo-clone sessions still get a 500-credit floor.
   */
  creditBudgetOverride?: number;
}

/** Workflow context passed from Studio to give the AI awareness of the current workflow */
export interface WorkflowContext {
  workflowId: string;
  workflowName: string;
  triggerType: string;
  botName?: string;
  /** Gateway ID of the bot currently open in the Studio */
  gatewayId?: string;
  steps: Array<{
    id: string;
    order: number;
    name: string;
    pluginSlug: string;
    isEnabled: boolean;
    entryFile?: string;
  }>;
}

/**
 * Open an SSE connection to the multi-worker endpoint.
 *
 * Hits the /worker-stream endpoint which uses the zero-cost router
 * + specialized workers (Cursor Assistant / Cursor Coder).
 *
 * Returns a cleanup function to abort the connection.
 */
export function streamWorker(
  req: WorkerStreamClientRequest,
  authToken: string,
  onEvent: (event: Record<string, unknown>) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): () => void {
  const controller = new AbortController();
  const url = apiUrl("/cursor/worker-stream");

  // Stale connection detection — server sends keepalive every 15s,
  // so if we receive nothing for 45s the connection is dead.
  const STALE_TIMEOUT_MS = 45_000;
  let staleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetStaleTimer = () => {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      controller.abort();
      onError("Connection lost — no data received for 45 seconds. Please try again.");
      onDone();
    }, STALE_TIMEOUT_MS);
  };

  const clearStaleTimer = () => {
    if (staleTimer) {
      clearTimeout(staleTimer);
      staleTimer = null;
    }
  };

  void (async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as Record<string, unknown>;
        onError((errBody.message as string) || `HTTP ${response.status}`);
        onDone();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError("No response body");
        onDone();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventId: string | null = null;

      resetStaleTimer();

      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Any data received means connection is alive
        resetStaleTimer();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          // Capture SSE event ID for reconnect support
          if (trimmed.startsWith("id: ")) {
            currentEventId = trimmed.slice(4).trim();
            continue;
          }
          if (trimmed === "data: [DONE]") {
            receivedDone = true;
            clearStaleTimer();
            onDone();
            return;
          }
          if (trimmed.startsWith("data: ")) {
            try {
              const event = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
              // Attach SSE event ID for reconnect tracking
              if (currentEventId) event._eventId = parseInt(currentEventId, 10);
              currentEventId = null;
              onEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }
      }

      clearStaleTimer();
      // Stream closed without a [DONE] marker — unexpected disconnect
      if (!receivedDone) {
        onError("Connection closed unexpectedly. The session may have timed out or the server restarted. You can retry your request.");
      }
      onDone();
    } catch (err) {
      clearStaleTimer();
      if (err instanceof DOMException && err.name === "AbortError") return;
      onError(err instanceof Error ? err.message : "Stream connection failed");
      onDone();
    }
  })();

  return () => {
    clearStaleTimer();
    controller.abort();
  };
}

/**
 * Send a user's answer to a pending ask_user question.
 * Called when the user types a response to a worker's question.
 */
export async function sendWorkerAnswer(
  sessionId: string,
  answer: string,
  authToken: string,
): Promise<boolean> {
  try {
    const url = apiUrl("/cursor/worker-answer");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ sessionId, answer }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
