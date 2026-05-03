"use client";

/**
 * StudioBarContext — Bridge between page-level data and the layout-level CursorStudioBar.
 *
 * Child pages (studio home, bot-studio-view) call `useProvideStudioBarData()` to push
 * their page-specific workflow/bot/tab state up to the context. The CursorStudioBar
 * (rendered in the studio layout) reads it via `useStudioBarData()`.
 *
 * This lets the bar live in the layout (surviving navigation) while still getting
 * fresh page-specific data from whichever page is currently mounted.
 *
 * @module components/cursor/studio-bar-context
 */

import type { WorkflowListItem } from "@/lib/api-client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// =============================================================================
// Types
// =============================================================================

export interface StudioBarData {
  /** Current workflow (null on home page or before load) */
  workflow: WorkflowListItem | null;
  /** Bot/gateway name for prompt context */
  botName?: string;
  /** Bot/gateway ID — lets the AI agent know which gateway is currently open */
  gatewayId?: string;
  /** Callback to refresh workflow data after AI mutations */
  fetchWorkflow?: () => void;
  /** Current active tab in BotStudioView */
  activeTab?: string;
}

interface StudioBarContextValue {
  data: StudioBarData;
  /** Called by child pages to push their data into the context */
  setData: (data: StudioBarData) => void;
  /** Ref-based access for callbacks (fetchWorkflow) that may change identity */
  dataRef: React.RefObject<StudioBarData>;
  /**
   * One-shot prompt queued by any page component (e.g. preflight dialog).
   * CursorStudioBar picks this up, pre-fills its input, reveals/expands, then
   * clears it. The user reviews the text and presses Enter to send.
   */
  pendingPrompt: string | null;
  /** Set a pending prompt — replaces any existing one */
  firePrompt: (prompt: string) => void;
  /** Called by CursorStudioBar once it has consumed the prompt */
  clearPendingPrompt: () => void;
}

// =============================================================================
// Context
// =============================================================================

const StudioBarContext = createContext<StudioBarContextValue | null>(null);

// =============================================================================
// Provider — rendered once in the studio layout
// =============================================================================

export function StudioBarProvider({ children }: { children: ReactNode }) {
  const [data, setDataRaw] = useState<StudioBarData>({ workflow: null });
  const dataRef = useRef<StudioBarData>(data);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const setData = useCallback((d: StudioBarData) => {
    dataRef.current = d;
    setDataRaw(d);
  }, []);

  const firePrompt = useCallback((prompt: string) => {
    setPendingPrompt(prompt);
  }, []);

  const clearPendingPrompt = useCallback(() => {
    setPendingPrompt(null);
  }, []);

  return (
    <StudioBarContext.Provider value={{ data, setData, dataRef, pendingPrompt, firePrompt, clearPendingPrompt }}>
      {children}
    </StudioBarContext.Provider>
  );
}

// =============================================================================
// Consumer hook — used by CursorStudioBar in the layout
// =============================================================================

export function useStudioBarData(): StudioBarData {
  const ctx = useContext(StudioBarContext);
  if (!ctx) return { workflow: null };
  return ctx.data;
}

/** Ref-based access for callbacks — always returns the latest fetchWorkflow etc. */
export function useStudioBarDataRef(): React.RefObject<StudioBarData> {
  const ctx = useContext(StudioBarContext);
  const fallback = useRef<StudioBarData>({ workflow: null });
  if (!ctx) return fallback;
  return ctx.dataRef;
}

/**
 * Returns `{ firePrompt }` — lets any page component queue a prefilled prompt
 * into the CursorStudioBar without going through props.
 */
export function useStudioBarActions(): { firePrompt: (prompt: string) => void } {
  const ctx = useContext(StudioBarContext);
  const noop = useCallback(() => {}, []);
  return { firePrompt: ctx?.firePrompt ?? noop };
}

/**
 * Used by CursorStudioBar to pick up and clear pending prompts queued by pages.
 */
export function useStudioBarPendingPrompt(): {
  pendingPrompt: string | null;
  clearPendingPrompt: () => void;
} {
  const ctx = useContext(StudioBarContext);
  return {
    pendingPrompt: ctx?.pendingPrompt ?? null,
    clearPendingPrompt: ctx?.clearPendingPrompt ?? (() => {}),
  };
}

// =============================================================================
// Producer hook — called by child pages to push their data
// =============================================================================

export function useProvideStudioBarData(data: StudioBarData): void {
  const ctx = useContext(StudioBarContext);
  const prevKeyRef = useRef<string>("");

  // Always keep ref up-to-date (no state update, no re-render)
  if (ctx) ctx.dataRef.current = data;

  useEffect(() => {
    if (!ctx) return;
    // Only trigger state update (and re-renders) when visible data changes
    const key = `${data.workflow?.id ?? ""}|${data.workflow?.steps?.length ?? 0}|${data.botName ?? ""}|${data.activeTab ?? ""}`;
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      ctx.setData(data);
    }
  });

  // Reset to default when the page unmounts (e.g., navigating away from a bot)
  useEffect(() => {
    return () => {
      ctx?.setData({ workflow: null });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
