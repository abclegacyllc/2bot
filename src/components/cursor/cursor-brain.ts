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
  mode?: "create" | "edit";
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (trimmed === "data: [DONE]") {
            onDone();
            return;
          }
          if (trimmed.startsWith("data: ")) {
            try {
              const event = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
              onEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }
      }

      onDone();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onError(err instanceof Error ? err.message : "Stream connection failed");
      onDone();
    }
  })();

  return () => controller.abort();
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
