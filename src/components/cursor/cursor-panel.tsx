/**
 * Cursor Panel — Conversational Chat-Bubble UI
 *
 * A draggable floating chat panel where users talk naturally with the
 * Cursor. Messages flow as chat bubbles — the cursor responds
 * with personality and expression changes.
 *
 * The cursor navigates the dashboard, fills forms, clicks buttons,
 * and performs real platform actions — it's a worker, not an advisor.
 *
 * Architecture:
 *   User message → cursor-brain.ts streamWorker() → SSE /worker-stream
 *   → multi-worker runner (Assistant + Coder) → agent-event-mapper → CursorProvider (animate)
 *
 * Theme Support:
 *   All visual tokens are CSS custom properties from cursor-theme.ts.
 *   When platform themes are added, the cursor automatically adapts.
 *
 * @module components/cursor/cursor-panel
 */

"use client";

import { cn } from "@/lib/utils";
import {
  ChevronDown,
  GripVertical,
  History,
  Loader2,
  Palette,
  Send,
  Square,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CursorAgentEvent } from "@/modules/cursor/cursor-agent.types";
import type { CursorWorkerType } from "@/modules/cursor/cursor-workers";
import { describeAgentEvent, mapAgentEventToActions } from "./agent-event-mapper";
import { CursorAvatar, TypingIndicator, type CursorExpression } from "./cursor-avatar";
import { CursorHistoryPanel } from "./cursor-history-panel";
import { useCursorOptional } from "./cursor-provider";
import { addEvent, completeSession, createSession } from "./cursor-session-store";
import { playError, playStart, playSuccess, setSoundProfile } from "./cursor-sounds";
import {
  CURSOR_THEMES,
  getCursorThemeVars,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  type CursorThemeConfig,
} from "./cursor-theme";

// Lazy-loaded worker stream functions — only fetched when first command is executed
async function loadWorkerBrain() {
  const mod = await import("./cursor-brain");
  return { streamWorker: mod.streamWorker, sendWorkerAnswer: mod.sendWorkerAnswer };
}

// ===========================================
// Types
// ===========================================

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Extra structured detail from API (e.g., gateway name, plugin slug) */
  detail?: string;
  status?: "thinking" | "working" | "success" | "error";
  timestamp: Date;
}

// ===========================================
// Persistence helpers
// ===========================================

const STORAGE_KEY = "cursor-position";
const MESSAGES_STORAGE_KEY = "cursor-messages";

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      role: string;
      content: string;
      detail?: string;
      status?: string;
      timestamp: string;
    }>;
    return parsed
      .filter((m) => m.id && m.content && m.status !== "thinking" && m.status !== "working")
      .slice(0, 30)
      .map((m) => ({
        ...m,
        role: m.role as "user" | "assistant" | "system",
        status: m.status as ChatMessage["status"],
        timestamp: new Date(m.timestamp),
      }));
  } catch { /* ignore */ }
  return [];
}

function saveMessages(items: ChatMessage[]) {
  try {
    const serialisable = items
      .filter((m) => m.status !== "thinking" && m.status !== "working")
      .slice(0, 30)
      .map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(serialisable));
  } catch { /* ignore */ }
}

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x: number; y: number };
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      parsed.x >= 0 &&
      parsed.y >= 0 &&
      parsed.x < window.innerWidth &&
      parsed.y < window.innerHeight
    ) {
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
  } catch { /* ignore */ }
}

// ===========================================
// Expandable user message (collapse long texts)
// ===========================================

/** Threshold in characters — messages shorter than this are never collapsed */
const EXPAND_CHAR_THRESHOLD = 180;
/** Number of CSS line-clamp lines when collapsed */
const EXPAND_LINE_CLAMP = 3;

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  // After first render check if the element is actually overflowing
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    // scrollHeight > clientHeight means content is clipped
    setNeedsClamp(el.scrollHeight > el.clientHeight + 2);
  }, [text]);

  // Short text — render plain, no button
  if (text.length < EXPAND_CHAR_THRESHOLD) {
    return <span>{text}</span>;
  }

  return (
    <span className="block">
      <span
        ref={textRef}
        className="block whitespace-pre-wrap break-words"
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: EXPAND_LINE_CLAMP,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }
        }
      >
        {text}
      </span>
      {needsClamp || (!expanded && text.length >= EXPAND_CHAR_THRESHOLD) ? (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="mt-1 flex items-center gap-1 text-[11px] opacity-70 hover:opacity-100 transition-opacity"
        >
          <ChevronDown
            size={12}
            className={cn("transition-transform", expanded && "rotate-180")}
          />
          {expanded ? "Show less" : "Expand text"}
        </button>
      ) : null}
    </span>
  );
}

// ===========================================
// Cursor expression derived from chat state
// ===========================================

function deriveExpression(messages: ChatMessage[], isRunning: boolean): CursorExpression {
  if (!isRunning && messages.length === 0) return "idle";

  const latest = messages[messages.length - 1];
  if (!latest) return "idle";

  if (latest.status === "thinking" || latest.status === "working") return "thinking";
  if (latest.status === "success") return "happy";
  if (latest.status === "error") return "error";
  return "idle";
}

// ===========================================
// Component
// ===========================================

export function CursorPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages());
  const [secretPending, setSecretPending] = useState<{
    secretId: string;
    label: string;
    hint?: string;
    field: string;
    /** If true, use password masking; otherwise plain text input */
    sensitive?: boolean;
  } | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const secretResolveRef = useRef<((v: string) => void) | null>(null);

  // Theme — toggleable between available themes
  const [theme, setTheme] = useState<CursorThemeConfig>(() => {
    const t = resolveTheme(loadThemePreference());
    setSoundProfile(t.id);
    return t;
  });
  const themeVars = getCursorThemeVars(theme);

  /** Cycle to the next theme */
  const toggleTheme = useCallback(() => {
    const themeIds = Object.keys(CURSOR_THEMES);
    const currentIdx = themeIds.indexOf(theme.id);
    const nextId = themeIds[(currentIdx + 1) % themeIds.length] ?? themeIds[0] ?? "classic";
    saveThemePreference(nextId);
    setSoundProfile(nextId);
    setTheme(resolveTheme(nextId));
  }, [theme.id]);

  // Multi-worker state
  const [activeWorker, setActiveWorker] = useState<{ type: CursorWorkerType; displayName: string } | null>(null);
  /** When set, the next input submission sends an answer to the worker instead of a new command */
  const [askUserPending, setAskUserPending] = useState<{
    sessionId: string;
    sensitive: boolean;
  } | null>(null);
  /** Ref to the current worker SSE cleanup function (for cancel) */
  const workerCleanupRef = useRef<(() => void) | null>(null);
  /** Tracks the current assistant message ID for updating with streaming progress */
  const assistantMsgIdRef = useRef<string | null>(null);

  // View mode — chat or session history
  const [panelView, setPanelView] = useState<"chat" | "history">("chat");

  // Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => loadPosition());
  const dragStartRef = useRef<{
    startX: number; startY: number;
    startLeft: number; startTop: number;
  } | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const didDragRef = useRef(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input when a worker asks a non-sensitive question
  useEffect(() => {
    if (askUserPending && !askUserPending.sensitive) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [askUserPending]);

  const cursor = useCursorOptional();
  const pathname = usePathname();
  const expression = deriveExpression(messages, isRunning);

  // ===========================================
  // Keyboard Shortcuts: Cmd+J to toggle, Escape to close/cancel
  // ===========================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+J (or Ctrl+J) to toggle panel
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setIsOpen((prev) => {
          if (!prev) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
          return !prev;
        });
        return;
      }

      // Escape key
      if (e.key === "Escape") {
        if (askUserPending) {
          e.preventDefault();
          // Cancel the ask — send empty answer to unblock the stream
          const token = localStorage.getItem("token") || "";
          void loadWorkerBrain().then((b) => b.sendWorkerAnswer(askUserPending.sessionId, "", token));
          setAskUserPending(null);
          return;
        }
        if (secretPending && secretResolveRef.current) {
          e.preventDefault();
          secretResolveRef.current("");
          secretResolveRef.current = null;
          setSecretPending(null);
          setSecretValue("");
          return;
        }
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, secretPending, askUserPending]);

  // ===========================================
  // Drag Logic (pointer events)
  // ===========================================

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = fabRef.current ?? panelRef.current;
    if (!el) return;

    const target = e.target as HTMLElement;
    const isDragHandle = target.closest("[data-drag-handle]");
    const isFab = target.closest("[data-cursor-fab]");
    if (!isDragHandle && !isFab) return;

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    didDragRef.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    e.preventDefault();

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      didDragRef.current = true;
    }

    const newX = Math.max(0, Math.min(dragStartRef.current.startLeft + dx, window.innerWidth - 60));
    const newY = Math.max(0, Math.min(dragStartRef.current.startTop + dy, window.innerHeight - 60));

    setPosition({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    if (didDragRef.current && position) {
      savePosition(position.x, position.y);
    }

    dragStartRef.current = null;
  }, [position]);

  // ===========================================
  // Message Helpers
  // ===========================================

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
    };
    setMessages((prev) => {
      const updated = [...prev, newMsg].slice(-30);
      saveMessages(updated);
      return updated;
    });
    return newMsg.id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, ...updates } : m));
      saveMessages(updated);
      return updated;
    });
  }, []);

  // ===========================================
  // Secret Collection (used for sensitive ask_user events)
  // ===========================================

  const handleSecretSubmit = useCallback(() => {
    if (!secretValue.trim() || !secretResolveRef.current) return;
    secretResolveRef.current(secretValue.trim());
    secretResolveRef.current = null;
    setSecretPending(null);
    setSecretValue("");
  }, [secretValue]);

  // ===========================================
  // Command Execution — Multi-Worker Stream
  // ===========================================

  /**
   * Process a single SSE event from the multi-worker stream.
   * Maps events to UI updates, animations, and ask_user handling.
   */
  const handleWorkerEvent = useCallback(
    (rawEvent: Record<string, unknown>) => {
      const event = rawEvent as unknown as CursorAgentEvent;
      const msgId = assistantMsgIdRef.current;

      // ── Record event into session history ──
      const eventDesc = describeAgentEvent(event);
      addEvent(event, eventDesc ?? undefined);

      switch (event.type) {
        case "worker_start": {
          setActiveWorker({ type: event.worker, displayName: event.displayName });
          // Enqueue UI actions (toast)
          const actions = mapAgentEventToActions(event);
          for (const a of actions) cursor?.enqueue(a);
          if (msgId) {
            updateMessage(msgId, { content: `${event.displayName} is on it...`, status: "working" });
          }
          break;
        }

        case "worker_switch": {
          setActiveWorker({ type: event.toWorker, displayName: event.toDisplayName });
          addMessage({ role: "system", content: `Passing to ${event.toDisplayName}...` });
          const actions = mapAgentEventToActions(event);
          for (const a of actions) cursor?.enqueue(a);
          break;
        }

        case "ask_user": {
          // Show the question and enable input for the user to answer
          addMessage({ role: "assistant", content: event.question, status: "success" });
          setAskUserPending({ sessionId: event.sessionId, sensitive: event.sensitive });
          if (event.sensitive) {
            setSecretPending({
              secretId: "ask_user",
              label: event.question,
              field: "answer",
              sensitive: true,
            });
            setSecretValue("");
            secretResolveRef.current = (value: string) => {
              const token = localStorage.getItem("token") || "";
              void loadWorkerBrain().then((b) => b.sendWorkerAnswer(event.sessionId, value, token));
              addMessage({ role: "user", content: "••••••" });
              setAskUserPending(null);
              setSecretPending(null);
              setSecretValue("");
            };
          }
          // Non-sensitive: input bar is re-enabled via askUserPending check
          break;
        }

        case "thinking": {
          if (msgId) {
            updateMessage(msgId, { content: event.text.slice(0, 200), status: "thinking" });
          }
          break;
        }

        case "tool_result": {
          // Release the event gate so the gated highlight animation ends
          cursor?.releaseGate();

          // Map to UI actions (usually empty for success, warning toast for errors)
          const resultActions = mapAgentEventToActions(event);
          for (const a of resultActions) {
            if (a.action === "done") continue;
            cursor?.enqueue(a);
          }
          const resultDesc = describeAgentEvent(event);
          if (resultDesc && msgId) {
            updateMessage(msgId, { content: resultDesc, status: "working" });
          }
          break;
        }

        case "tool_start":
        case "code_preview":
        case "status":
        case "iteration_start":
        case "session_start": {
          const actions = mapAgentEventToActions(event);
          for (const a of actions) {
            if (a.action === "done") continue;
            cursor?.enqueue(a);
          }
          const desc = describeAgentEvent(event);
          if (desc && msgId) {
            updateMessage(msgId, { content: desc, status: "working" });
          }
          break;
        }

        case "done": {
          playSuccess();
          completeSession("completed", event.summary || "Done!");
          if (msgId) {
            const detail = event.fileCount
              ? `Files: ${event.fileCount} · ${((event.durationMs) / 1000).toFixed(1)}s`
              : undefined;
            updateMessage(msgId, {
              content: event.summary || "Done!",
              detail,
              status: "success",
            });
          }
          setActiveWorker(null);
          break;
        }

        case "error": {
          playError();
          completeSession("error", event.message || "Something went wrong.");
          if (msgId) {
            updateMessage(msgId, { content: event.message || "Something went wrong.", status: "error" });
          }
          setActiveWorker(null);
          break;
        }
      }
    },
    [cursor, addMessage, updateMessage],
  );

  /**
   * Execute a user command via the multi-worker stream.
   * Replaces the old 17-path executeSingleCommand with a single SSE call.
   */
  const executeCommand = useCallback(
    async (command: string) => {
      if (!command.trim()) return;

      // ── Ask-user answer: send the answer to the worker stream ──
      if (askUserPending && !askUserPending.sensitive) {
        const text = command.trim();
        addMessage({ role: "user", content: text });
        setInput("");
        setAskUserPending(null);
        const token = localStorage.getItem("token") || "";
        const brain = await loadWorkerBrain();
        await brain.sendWorkerAnswer(askUserPending.sessionId, text, token);
        return;
      }

      if (isRunning) return;
      if (!cursor) {
        addMessage({ role: "system", content: "Cursor not available" });
        return;
      }

      setIsRunning(true);
      setInput("");
      playStart();

      // ── Start a new session in history store ──
      createSession(command);

      // Add user message + assistant thinking bubble
      addMessage({ role: "user", content: command });
      const msgId = addMessage({ role: "assistant", content: "Thinking...", status: "thinking" });
      assistantMsgIdRef.current = msgId;

      try {
        const token = localStorage.getItem("token") || "";
        const brain = await loadWorkerBrain();

        const cleanup = brain.streamWorker(
          { message: command },
          token,
          handleWorkerEvent,
          () => {
            // onDone — stream ended
            assistantMsgIdRef.current = null;
            workerCleanupRef.current = null;
            setIsRunning(false);
            setActiveWorker(null);
          },
          (errMsg) => {
            // onError — stream-level error
            playError();
            if (assistantMsgIdRef.current) {
              updateMessage(assistantMsgIdRef.current, { content: errMsg, status: "error" });
            }
            assistantMsgIdRef.current = null;
            workerCleanupRef.current = null;
            setIsRunning(false);
            setActiveWorker(null);
          },
        );

        workerCleanupRef.current = cleanup;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        playError();
        completeSession("error", msg);
        updateMessage(msgId, { content: `Oops — ${msg}`, status: "error" });
        setIsRunning(false);
      }
    },
    [cursor, isRunning, askUserPending, handleWorkerEvent, addMessage, updateMessage],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeCommand(input);
  };

  const handleCancel = () => {
    // Abort the active worker SSE stream
    if (workerCleanupRef.current) {
      workerCleanupRef.current();
      workerCleanupRef.current = null;
    }
    completeSession("cancelled", "Cancelled by user.");
    cursor?.cancel();
    setIsRunning(false);
    setActiveWorker(null);
    setAskUserPending(null);
    assistantMsgIdRef.current = null;
    addMessage({ role: "system", content: "Cancelled." });
    // Resolve any pending secret promise with empty string to unblock the flow
    if (secretResolveRef.current) {
      secretResolveRef.current("");
    }
    secretResolveRef.current = null;
    setSecretPending(null);
    setSecretValue("");
  };

  // ===========================================
  // Context-Aware Suggestion Chips
  // ===========================================

  const suggestions = (() => {
    if (pathname?.startsWith("/gateways")) {
      return ["Create a Telegram bot", "Show my gateways", "Check credits"];
    } else if (pathname?.startsWith("/plugins")) {
      return ["Create a plugin", "Edit a plugin", "Browse plugins"];
    } else if (pathname?.startsWith("/workspace")) {
      return ["Start workspace", "Show gateways", "Check credits"];
    } else if (pathname?.startsWith("/credits") || pathname?.startsWith("/usage")) {
      return ["Check credits", "View usage", "Create a bot"];
    }
    return ["Create a Telegram bot", "Check credits", "Start workspace"];
  })();

  // ===========================================
  // Position style
  // ===========================================

  const posStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
    : { right: 24, bottom: 96 };

  // ===========================================
  // Render: Floating Cursor FAB (closed state)
  // ===========================================

  if (!isOpen) {
    return (
      <button
        ref={fabRef}
        data-cursor-fab
        aria-label="Open Cursor chat (Cmd+J)"
        role="button"
        onClick={() => {
          if (didDragRef.current) return;
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={cn(
          "fixed z-50 touch-none select-none",
          "flex h-14 w-14 items-center justify-center rounded-full",
          "bg-background/90 backdrop-blur-md border",
          "shadow-lg hover:shadow-xl transition-shadow duration-200",
          "group cursor-grab active:cursor-grabbing",
        )}
        style={{
          ...posStyle,
          borderColor: "var(--cursor-primary)",
          boxShadow: "0 4px 20px var(--cursor-glow)",
          ...(themeVars as React.CSSProperties),
        }}
        title="Cursor — drag to move (⌘J)"
      >
        <CursorAvatar expression={expression} size="sm" avatarType={theme.avatar} effects={theme.effects} />
      </button>
    );
  }

  // ===========================================
  // Render: Chat Panel (open state)
  // ===========================================

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Cursor chat panel"
      aria-modal="false"
      className={cn(
        "fixed z-50",
        "w-[400px] max-h-[520px] border",
        "backdrop-blur-lg",
        "shadow-2xl",
        "flex flex-col overflow-hidden",
      )}
      style={{
        ...posStyle,
        ...(themeVars as React.CSSProperties),
        borderColor: "var(--cursor-panel-border)",
        background: "var(--cursor-panel-bg)",
        borderRadius: "var(--cursor-panel-radius)",
      }}
    >
      {/* \u2500\u2500 Header \u2014 avatar + title + drag handle \u2500\u2500 */}
      <div
        data-drag-handle
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex items-center gap-3 px-4 py-3 border-b cursor-grab active:cursor-grabbing select-none touch-none"
        style={{ background: "var(--cursor-header-bg)" }}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
        <CursorAvatar expression={expression} size="sm" noFloat avatarType={theme.avatar} effects={theme.effects} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">{activeWorker?.displayName || "Cursor"}</span>
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {askUserPending ? "Waiting for your answer..." : "Working..."}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground block">Ask me anything</span>
          )}
        </div>
        <button
          onClick={() => setPanelView((v) => v === "chat" ? "history" : "chat")}
          aria-label={panelView === "chat" ? "Show session history" : "Back to chat"}
          title={panelView === "chat" ? "Session History" : "Back to Chat"}
          className={cn(
            "text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50",
            panelView === "history" && "text-foreground bg-muted/50",
          )}
        >
          <History className="h-4 w-4" />
        </button>
        <button
          onClick={toggleTheme}
          aria-label={`Switch theme (current: ${theme.name})`}
          title={`Theme: ${theme.name}`}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
        >
          <Palette className="h-4 w-4" />
        </button>
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Close chat panel"
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── History View (replaces chat when active) ── */}
      {panelView === "history" ? (
        <CursorHistoryPanel onCloseAction={() => setPanelView("chat")} />
      ) : (
      <>
      {/* \u2500\u2500 Chat Messages Area \u2500\u2500 */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[180px] max-h-[320px]"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          /* \u2500\u2500 Empty State \u2014 Welcome \u2500\u2500 */
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <CursorAvatar expression="idle" size="lg" avatarType={theme.avatar} effects={theme.effects} />
            <div className="text-center">
              <p className="text-sm font-medium">Hey! I&apos;m your Cursor</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tell me what to do and I&apos;ll handle it for you.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2.5",
                msg.role === "user" && "flex-row-reverse",
                msg.role === "system" && "justify-center",
              )}
              style={{ animation: "cursor-message-in 0.3s ease-out" }}
            >
              {/* Avatar \u2014 only for assistant messages */}
              {msg.role === "assistant" ? (
                <div className="flex-shrink-0 mt-1">
                  <CursorAvatar
                    expression={
                      msg.status === "thinking" || msg.status === "working"
                        ? "thinking"
                        : msg.status === "success"
                          ? "happy"
                          : msg.status === "error"
                            ? "error"
                            : "idle"
                    }
                    size="sm"
                    noFloat={msg.status !== "thinking" && msg.status !== "working"}
                    avatarType={theme.avatar}
                    effects={theme.effects}
                  />
                </div>
              ) : null}

              {/* Message Bubble */}
              {msg.role === "system" ? (
                /* System messages \u2014 centered, subtle */
                <div className="text-xs text-muted-foreground/70 py-1 px-3 rounded-full bg-muted/30">
                  {msg.content}
                </div>
              ) : (
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "rounded-br-md"
                      : "rounded-bl-md",
                    msg.role === "user"
                      ? "text-white"
                      : "bg-muted/50 text-foreground",
                    msg.role === "assistant" && msg.status === "success" && "border-l-2",
                    msg.role === "assistant" && msg.status === "error" && "border-l-2",
                  )}
                  style={{
                    ...(msg.role === "user" ? { background: "var(--cursor-primary)" } : {}),
                    ...(msg.role === "assistant" && msg.status === "success" ? { borderColor: "var(--cursor-success)" } : {}),
                    ...(msg.role === "assistant" && msg.status === "error" ? { borderColor: "var(--cursor-error)" } : {}),
                  }}
                >
                  {/* Thinking indicator */}
                  {msg.role === "assistant" && (msg.status === "thinking" || msg.status === "working") ? (
                    <div className="flex items-center gap-2">
                      <span>{msg.content}</span>
                      <TypingIndicator className="text-muted-foreground/60" />
                    </div>
                  ) : msg.role === "user" ? (
                    <ExpandableText text={msg.content} />
                  ) : (
                    <span>{msg.content}</span>
                  )}

                  {/* Detail badge */}
                  {msg.detail ? (
                    <div className="mt-1.5 text-[10px] font-mono opacity-70 bg-black/5 dark:bg-white/5 rounded px-2 py-0.5">
                      {msg.detail}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}

        {/* Auto-scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      {/* \u2500\u2500 Secret Dialog (only for sensitive inputs like API tokens) \u2500\u2500 */}
      {secretPending && secretPending.sensitive ? (
        <div className="px-4 py-3 border-t border-b bg-amber-500/5">
          <div className="text-sm font-medium mb-1">{secretPending.label}</div>
          {secretPending.hint ? (
            <div className="text-xs text-muted-foreground mb-2">{secretPending.hint}</div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSecretSubmit();
            }}
            className="flex gap-2"
          >
            <input
              type={secretPending.sensitive ? "password" : "text"}
              value={secretValue}
              onChange={(e) => setSecretValue(e.target.value)}
              placeholder={`Enter ${secretPending.field}...`}
              className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm"
              autoFocus
            />
            <button
              type="submit"
              disabled={!secretValue.trim()}
              className="rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-50"
              style={{ background: "var(--cursor-primary)" }}
            >
              Submit
            </button>
          </form>
        </div>
      ) : null}

      {/* ── Suggestion Chips ── */}
      {!isRunning && !secretPending ? (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => void executeCommand(s)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                "bg-muted/30 text-muted-foreground",
              )}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.borderColor = "var(--cursor-primary)";
                (e.target as HTMLElement).style.color = "var(--cursor-primary)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.borderColor = "";
                (e.target as HTMLElement).style.color = "";
              }}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* \u2500\u2500 Input Bar \u2500\u2500 */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-3 border-t"
        role="search"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            askUserPending && !askUserPending.sensitive
              ? "Type your answer..."
              : isRunning
                ? "Working on it..."
                : "Type a message..."
          }
          disabled={(isRunning && !askUserPending) || !!secretPending}
          aria-label="Cursor chat input"
          className="flex-1 rounded-xl border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--cursor-primary)]/30"
        />
        {isRunning && !askUserPending ? (
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cancel current action"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition-colors"
            style={{ background: "var(--cursor-error)" }}
            title="Cancel"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition-colors disabled:opacity-40"
            style={{ background: "var(--cursor-primary)" }}
            title="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </form>
      </>
      )}
    </div>
  );
}
