"use client";

/**
 * Workspace Terminal Hook
 *
 * Manages a WebSocket connection to a workspace container's terminal.
 * Provides PTY-like terminal I/O through the platform's WebSocket proxy.
 *
 * Flow:
 *   1. POST /workspace/{containerId}/terminal → creates bridge terminal session, returns sessionId
 *   2. Connect WebSocket: ws://api.2bot.org/ws/workspace/{containerId}/terminal/{sessionId}
 *   3. Send:    JSON { type: "input", data: "..." } or { type: "resize", cols, rows }
 *   4. Receive: JSON { type: "output", data: "..." } or { type: "exit", code }
 *
 * @module hooks/use-workspace-terminal
 */

import { URLS } from "@/shared/config/urls";
import { useCallback, useEffect, useRef, useState } from "react";

// ===========================================
// Types
// ===========================================

interface UseWorkspaceTerminalOptions {
  /** Container DB ID to connect to */
  containerId: string | null;
  /** Initial terminal dimensions */
  cols?: number;
  rows?: number;
  /** Callback when data is received from terminal */
  onData?: (data: string) => void;
  /** Callback when terminal exits */
  onExit?: (code: number) => void;
  /** Auto-connect on mount */
  autoConnect?: boolean;
}

interface UseWorkspaceTerminalReturn {
  /** Whether the WebSocket is connected */
  connected: boolean;
  /** Connection error */
  error: string | null;
  /** Connect to terminal */
  connect: () => void;
  /** Disconnect from terminal */
  disconnect: () => void;
  /** Send input to terminal */
  sendInput: (data: string) => void;
  /** Resize terminal */
  resize: (cols: number, rows: number) => void;
}

// ===========================================
// Helpers
// ===========================================

function getAuthToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

// ===========================================
// Hook
// ===========================================

export function useWorkspaceTerminal(
  options: UseWorkspaceTerminalOptions
): UseWorkspaceTerminalReturn {
  const {
    containerId,
    cols = 80,
    rows = 24,
    onData,
    onExit,
    autoConnect = false,
  } = options;

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onDataRef = useRef(onData);
  const onExitRef = useRef(onExit);

  // Keep refs updated
  onDataRef.current = onData;
  onExitRef.current = onExit;

  /**
   * Step 1: Create terminal session via REST API
   * Returns the sessionId needed for the WebSocket URL
   */
  const createTerminalSession = useCallback(async (): Promise<string> => {
    const res = await fetch(`${URLS.api}/workspace/${containerId}/terminal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ cols, rows }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to create terminal session (${res.status})`);
    }
    const data = await res.json();
    return data.data?.sessionId || data.sessionId;
  }, [containerId, cols, rows]);

  /**
   * Step 2: Connect WebSocket using sessionId
   */
  const connectWebSocket = useCallback((sessionId: string) => {
    const apiBase = URLS.api.replace(/^http/, "ws");
    const token = getAuthToken();
    const url = `${apiBase}/ws/workspace/${containerId}/terminal/${sessionId}?token=${token}&cols=${cols}&rows=${rows}`;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output" && msg.data && onDataRef.current) {
          onDataRef.current(msg.data);
        } else if (msg.type === "exit" && onExitRef.current) {
          onExitRef.current(msg.code ?? 0);
        }
        // Silently ignore 'connected', 'pong', 'error', and output messages with no data
      } catch {
        // Raw data fallback — only write if it looks like terminal content, not JSON
        if (onDataRef.current && typeof event.data === "string" && !event.data.startsWith("{")) {
          onDataRef.current(event.data);
        }
      }
    };

    ws.onerror = () => {
      setError("Terminal connection error");
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      sessionIdRef.current = null;
    };

    wsRef.current = ws;
    sessionIdRef.current = sessionId;
  }, [containerId, cols, rows]);

  /**
   * Full connect flow: create session → connect WebSocket
   */
  const connect = useCallback(async () => {
    if (!containerId || wsRef.current) return;

    setError(null);
    try {
      const sessionId = await createTerminalSession();
      connectWebSocket(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect terminal");
    }
  }, [containerId, createTerminalSession, connectWebSocket]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      sessionIdRef.current = null;
      setConnected(false);
    }
  }, []);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data }));
    }
  }, []);

  const resize = useCallback((newCols: number, newRows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "resize", cols: newCols, rows: newRows }));
    }
  }, []);

  // Auto-connect
  useEffect(() => {
    if (autoConnect && containerId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, containerId, connect, disconnect]);

  return {
    connected,
    error,
    connect,
    disconnect,
    sendInput,
    resize,
  };
}
