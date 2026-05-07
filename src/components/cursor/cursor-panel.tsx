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

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/shared/config/urls";
import {
    ChevronDown,
    Code,
    Github,
    GripVertical,
    History,
    Loader2,
    Palette,
    Plus,
    RotateCcw,
    Send,
    Square,
    Trash2,
    Volume2,
    VolumeX,
    X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ModelSelector } from "@/components/shared/model-selector";
import type { CursorAgentEvent } from "@/modules/cursor/cursor-agent.types";
import { describeAgentEvent, mapAgentEventToActions } from "./agent-event-mapper";
import { CursorAvatar, TypingIndicator, type CursorExpression } from "./cursor-avatar";
import { formatRepoUrl, isValidRepoUrl } from "./cursor-helpers";
import { CursorHistoryPanel } from "./cursor-history-panel";
import { useCursorOptional } from "./cursor-provider";
import { addEvent, completeSession, createSession, markSessionRetried } from "./cursor-session-store";
import { CursorSettings } from "./cursor-settings";
import { EditableUserMessage, MarkdownContent, MessageBlocks } from "./cursor-shared-blocks";
import { isSoundEnabled, playError, playStart, playSuccess, setSoundEnabled, setSoundProfile } from "./cursor-sounds";
import {
    CURSOR_THEMES,
    getCursorThemeVars,
    loadThemePreference,
    resolveTheme,
    saveThemePreference,
    type CursorThemeConfig,
} from "./cursor-theme";
import type { UIAction } from "./cursor.types";
import { useCursorStream } from "./hooks/use-cursor-stream";
import type { CursorChatMessage } from "./types/cursor-chat.types";

// Lazy-loaded worker stream functions — only fetched when first command is executed
async function loadWorkerBrain() {
  const mod = await import("./cursor-brain");
  return { streamWorker: mod.streamWorker, sendWorkerAnswer: mod.sendWorkerAnswer };
}

/**
 * Lazy BuildSpec apply helper. The Cursor Builder agent emits a BuildSpec
 * inside the chat stream; clicking "Apply" calls this. Imported lazily to
 * keep the api-client module out of the initial bundle.
 */
async function loadBuildSpecApply() {
  const mod = await import("@/lib/api-client");
  return { applyBuildSpec: mod.applyBuildSpec };
}

// ===========================================
// Session-counter formatters
// ===========================================

/**
 * Format ms as a tight session-counter string: "47s" / "6m 16s" / "2h 14m".
 */
function formatSessionDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM === 0 ? `${h}h` : `${h}h ${remM}m`;
}

/**
 * Compact token formatter: "980" / "25.0k" / "1.8m".
 */
function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

// ===========================================
// Persistence helpers
// ===========================================

const STORAGE_KEY = "cursor-position";
const ACTIVE_SESSION_KEY = "cursor-active-session";

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

function ExpandableText({ text, onClick }: { text: string; onClick?: () => void }) {
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
    return (
      <span
        className={onClick ? "cursor-pointer" : undefined}
        onClick={onClick}
        title={onClick ? "Click to edit" : undefined}
      >
        {text}
      </span>
    );
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
          aria-expanded={expanded}
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

function deriveExpression(messages: CursorChatMessage[], isRunning: boolean): CursorExpression {
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
  const [secretPending, setSecretPending] = useState<{
    secretId: string;
    label: string;
    hint?: string;
    field: string;
    /** If true, use password masking; otherwise plain text input */
    sensitive?: boolean;
  } | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const secretResolveRef = useRef<((v: string) => void) | null>(null);
  const [attachedImages, setAttachedImages] = useState<Array<{ url: string; mimeType: string }>>([]);
  const MAX_PANEL_IMAGES = 4;

  // Theme — toggleable between available themes
  const [theme, setTheme] = useState<CursorThemeConfig>(() => {
    const t = resolveTheme(loadThemePreference());
    setSoundProfile(t.id);
    return t;
  });

  // Sound mute toggle
  const [soundMuted, setSoundMuted] = useState(() => !isSoundEnabled());
  const toggleSound = useCallback(() => {
    setSoundMuted((prev) => {
      setSoundEnabled(prev); // prev=true means currently muted, so enable
      return !prev;
    });
  }, []);
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

  // ── Panel-only state (defined before hook so callback can reference them) ──

  // Feedback — tracks which sessions have been rated
  const [feedbackSent, setFeedbackSent] = useState<Record<string, "positive" | "negative">>({});
  const lastDoneSessionRef = useRef<string | null>(null);
  /** Current running session ID (for mid-stream corrections) */
  const runningSessionIdRef = useRef<string | null>(null);
  /** Last SSE event ID received (for reconnect) */
  const lastEventIdRef = useRef<number>(0);

  /** Structured plan / TODO items (shown as collapsible checklist) */
  const [planItems, setPlanItems] = useState<Array<{ id: string; title: string; status: "pending" | "in_progress" | "done" }>>([]);
  /** Markdown plan body produced by the Plan agent (passed via update_plan(summary)) */
  const [planMarkdown, setPlanMarkdown] = useState<string | null>(null);
  /** Whether the View Plan modal is open */
  const [planModalOpen, setPlanModalOpen] = useState(false);
  /** File actions tracked for Keep/Undo (accumulated during session) */
  const [fileActions, setFileActions] = useState<Array<{
    id: string; type: "created" | "modified" | "deleted"; path: string;
    originalPreview: string | null; newPreview: string | null; toolCallId: string;
  }>>([]);
  /** Files the user has undone (paths) */
  const [revertedFiles, setRevertedFiles] = useState<Set<string>>(new Set());

  // View mode — chat or session history
  const [panelView, setPanelView] = useState<"chat" | "history">("chat");

  const cursor = useCursorOptional();

  // ── Shared streaming hook ──
  const stream = useCursorStream({
    storageKey: "cursor-messages",
    modelStorageKey: "cursor-model-preference",
    suspendedStorageKey: "cursor-suspended-panel",
    messageLimit: 30,
    idPrefix: "msg",
    token: localStorage.getItem("token") ?? "",
    onWorkerEvent: useCallback((event: CursorAgentEvent, msgId: string | null) => {
      // ── Track active session for reconnect on page change / refresh ──
      const sseEventId = (event as unknown as { _eventId?: number })._eventId;
      if (sseEventId) lastEventIdRef.current = sseEventId;

      if (event.type === "session_start") {
        try {
          localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
            sessionId: event.sessionId,
            lastEventId: lastEventIdRef.current,
            startedAt: Date.now(),
          }));
        } catch { /* ignore */ }
      } else if (event.type === "done" || event.type === "error") {
        try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch { /* ignore */ }
      } else {
        if (sseEventId) {
          try {
            const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
            if (raw) {
              const saved = JSON.parse(raw) as { sessionId: string; lastEventId: number; startedAt: number };
              saved.lastEventId = sseEventId;
              localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(saved));
            }
          } catch { /* ignore */ }
        }
      }

      // ── Record event into session history ──
      const eventDesc = describeAgentEvent(event);
      addEvent(event, eventDesc ?? undefined);

      // ── Panel-specific side-effects ──
      switch (event.type) {
        case "worker_start": {
          const actions = event.uiActions?.length ? event.uiActions : mapAgentEventToActions(event);
          for (const a of actions) cursor?.enqueue(a);
          break;
        }
        case "worker_switch": {
          const actions = mapAgentEventToActions(event);
          for (const a of actions) cursor?.enqueue(a);
          break;
        }
        case "ask_user": {
          if (event.sensitive) {
            setSecretPending({
              secretId: "ask_user",
              label: event.question,
              field: "answer",
              sensitive: true,
            });
            setSecretValue("");
            secretResolveRef.current = (value: string) => {
              const tk = localStorage.getItem("token") || "";
              void loadWorkerBrain().then((b) => b.sendWorkerAnswer(event.sessionId, value, tk));
              // addMessage is not available yet when this ref is called,
              // but it will be available via the stream hook — left as-is for now
              setSecretPending(null);
              setSecretValue("");
            };
          }
          break;
        }
        case "thinking": {
          // Reasoning is handled by the shared hook (saves event.reasoning to message)
          break;
        }
        case "tool_result": {
          cursor?.releaseGate();
          const resultActions = mapAgentEventToActions(event);
          for (const a of resultActions) {
            if (a.action === "done") continue;
            cursor?.enqueue(a);
          }
          break;
        }
        case "diff_preview": {
          const diffActions = mapAgentEventToActions(event);
          for (const a of diffActions) cursor?.enqueue(a);
          break;
        }
        case "tool_start":
        case "code_preview":
        case "status":
        case "iteration_start": {
          const uiDirect = "uiActions" in event && Array.isArray((event as { uiActions?: unknown }).uiActions)
            ? (event as { uiActions: UIAction[] }).uiActions
            : null;
          const actions = uiDirect?.length ? uiDirect : mapAgentEventToActions(event);
          for (const a of actions) {
            if (a.action === "done") continue;
            cursor?.enqueue(a);
          }
          break;
        }
        case "session_start": {
          runningSessionIdRef.current = event.sessionId;
          setPlanItems([]);
          setPlanMarkdown(null);
          setFileActions([]);
          setRevertedFiles(new Set());
          const actions = mapAgentEventToActions(event);
          for (const a of actions) {
            if (a.action === "done") continue;
            cursor?.enqueue(a);
          }
          break;
        }
        case "todo_update": {
          setPlanItems(event.items);
          if (event.planMarkdown) setPlanMarkdown(event.planMarkdown);
          break;
        }
        case "file_action": {
          setFileActions((prev) => [...prev, event.action]);
          break;
        }
        case "done": {
          playSuccess();
          completeSession("completed", event.summary || "Done!");
          lastDoneSessionRef.current = event.sessionId;
          runningSessionIdRef.current = null;
          break;
        }
        case "error": {
          playError();
          completeSession("error", event.message || "Something went wrong.");
          runningSessionIdRef.current = null;
          break;
        }
      }
    }, [cursor]),
  });
  const {
    messages, isStreaming: isRunning, askUserPending,
    activityLog, creditsUsed, currentIteration, creditBudget,
    activeWorker, selectedModel, realModels, handleModelChange,
    repoUrl, setRepoUrl, showRepoInput, setShowRepoInput,
    showImportCode, setShowImportCode,
    addMessage, updateMessage, clearMessages,
    executeStream, submitAnswer, cancelStream, sendCorrection,
    retryFromMessage, editAndResend,
    replayEvents,
    resolveConfirmBlock,
    resolveAskBlock,
    updateBuildSpecBlock,
    conversationSnapshots, fileActionCount,
    inputTokens, outputTokens, toolUseCount, elapsedMs,
  } = stream;

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  /**
   * drive the BuildSpec apply lifecycle from a chat block.
   * idle → applying → applied | rolled-back | error.
   */
  const handleApplyBuildSpec = useCallback(
    async (block: { id: string; spec: unknown }) => {
      updateBuildSpecBlock(block.id, { status: "applying", error: undefined });
      try {
        const tk =
          (typeof window !== "undefined" ? localStorage.getItem("token") : null) || undefined;
        const { applyBuildSpec } = await loadBuildSpecApply();
        const res = await applyBuildSpec(block.spec, {}, tk);
        if (!res.success || !res.data) {
          updateBuildSpecBlock(block.id, {
            status: "error",
            error: res.error?.message || "Apply failed",
          });
          return;
        }
        const data = res.data;
        const status: "applied" | "rolled-back" | "error" =
          data.status === "applied"
            ? "applied"
            : data.status === "rolled-back"
              ? "rolled-back"
              : "error";
        updateBuildSpecBlock(block.id, {
          status,
          result: data,
          error:
            status === "error"
              ? data.rollbackReason ||
                (data.validationErrors
                  ? Object.values(data.validationErrors).flat()[0]
                  : undefined) ||
                "Validation failed"
              : undefined,
        });
      } catch (err) {
        updateBuildSpecBlock(block.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [updateBuildSpecBlock],
  );

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

  // ── Reconnect to an interrupted session on mount (page change / refresh) ──
  const reconnectAttemptedRef = useRef(false);
  useEffect(() => {
    if (reconnectAttemptedRef.current || isRunning) return;
    reconnectAttemptedRef.current = true;

    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { sessionId: string; lastEventId: number; startedAt: number };
      // Only attempt reconnect for sessions started within the last 10 minutes
      if (Date.now() - saved.startedAt > 10 * 60 * 1000) {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
        return;
      }

      const token = localStorage.getItem("token") || "";
      if (!token) return;

      // Show reconnecting state
      const msgId = addMessage({ role: "assistant", content: "Reconnecting to session…", status: "thinking" });

      void (async () => {
        try {
          const res = await fetch(
            apiUrl(`/cursor/worker-resume?sessionId=${encodeURIComponent(saved.sessionId)}&lastEventId=${saved.lastEventId}`),
            {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "include",
            },
          );
          if (!res.ok) {
            updateMessage(msgId, { content: "Session expired", status: "error" });
            localStorage.removeItem(ACTIVE_SESSION_KEY);
            return;
          }
          const data = (await res.json()) as {
            success: boolean;
            data: {
              events: Array<Record<string, unknown>>;
              complete: boolean;
            };
          };

          const { events, complete } = data.data;
          if (events.length === 0 && complete) {
            // Session already ended but we missed the done event
            updateMessage(msgId, { content: "Session completed while away", status: "success" });
            localStorage.removeItem(ACTIVE_SESSION_KEY);
            return;
          }

          if (events.length === 0 && !complete) {
            // Worker is still running but no new events yet — session is in progress
            updateMessage(msgId, { content: "Session still in progress — waiting for results…", status: "working" });
            // Poll a few times for completion
            let pollCount = 0;
            const pollInterval = setInterval(async () => {
              pollCount++;
              if (pollCount > 20) { // Stop after ~60s
                clearInterval(pollInterval);
                updateMessage(msgId, { content: "Session may still be running — check back shortly", status: "success" });
                localStorage.removeItem(ACTIVE_SESSION_KEY);
                return;
              }
              try {
                const pollRes = await fetch(
                  apiUrl(`/cursor/worker-resume?sessionId=${encodeURIComponent(saved.sessionId)}&lastEventId=${saved.lastEventId}`),
                  { headers: { Authorization: `Bearer ${token}` }, credentials: "include" },
                );
                if (!pollRes.ok) { clearInterval(pollInterval); return; }
                const pollData = (await pollRes.json()) as typeof data;
                if (pollData.data.events.length > 0 || pollData.data.complete) {
                  clearInterval(pollInterval);
                  // Replay missed events
                  replayEvents(pollData.data.events, msgId);
                  if (pollData.data.complete) {
                    localStorage.removeItem(ACTIVE_SESSION_KEY);
                  } else {
                    // Update lastEventId for next poll
                    const lastEvt = pollData.data.events[pollData.data.events.length - 1];
                    if (lastEvt?.id) saved.lastEventId = lastEvt.id as number;
                  }
                }
              } catch { /* ignore poll errors */ }
            }, 3000);
            return;
          }

          // Replay missed events
          replayEvents(events, msgId);

          if (complete) {
            localStorage.removeItem(ACTIVE_SESSION_KEY);
          } else {
            // Still running — update the saved lastEventId
            const lastEvt = events[events.length - 1];
            if (lastEvt?.id) {
              saved.lastEventId = lastEvt.id as number;
              localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(saved));
            }
          }
        } catch {
          updateMessage(msgId, { content: "Could not reconnect", status: "error" });
          localStorage.removeItem(ACTIVE_SESSION_KEY);
        }
      })();
    } catch {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          void submitAnswer("", askUserPending.sessionId);
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
  }, [isOpen, secretPending, askUserPending, submitAnswer]);

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

    const panelW = panelRef.current?.offsetWidth || 400;
    const panelH = panelRef.current?.offsetHeight || 520;
    const newX = Math.max(0, Math.min(dragStartRef.current.startLeft + dx, window.innerWidth - Math.min(panelW, 120)));
    const newY = Math.max(0, Math.min(dragStartRef.current.startTop + dy, window.innerHeight - Math.min(panelH, 60)));

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
  // Command Execution — via shared hook
  // ===========================================

  /** Submit thumbs up/down feedback for the last completed session */
  const submitFeedback = useCallback(async (rating: "positive" | "negative") => {
    const sid = lastDoneSessionRef.current;
    if (!sid || feedbackSent[sid]) return;
    setFeedbackSent((prev) => ({ ...prev, [sid]: rating }));
    try {
      await fetch(apiUrl(`/cursor/sessions/${encodeURIComponent(sid)}/feedback`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
    } catch {
      // Non-critical — feedback is best-effort
    }
  }, [feedbackSent]);

  /**
   * Execute a user command via the shared streaming hook.
   */
  const executeCommand = useCallback(
    async (command: string) => {
      if (!command.trim()) return;

      // ── Ask-user answer: resume the suspended session via hook ──
      if (askUserPending && !askUserPending.sensitive) {
        const text = command.trim();
        addMessage({ role: "user", content: text });
        setInput("");
        const savedSessionId = askUserPending.sessionId;
        await submitAnswer(text, savedSessionId);
        return;
      }

      // ── Mid-stream correction: send input as correction while agent is running ──
      if (isRunning) {
        const sid = runningSessionIdRef.current;
        if (!sid) return;
        const text = command.trim();
        addMessage({ role: "user", content: `💬 ${text}` });
        setInput("");
        await sendCorrection(sid, text);
        return;
      }
      if (!cursor) {
        addMessage({ role: "system", content: "Cursor not available" });
        return;
      }

      setInput("");
      setShowRepoInput(false);
      playStart();

      // Snapshot and clear attached images before send
      const pendingImages = attachedImages.length > 0 ? attachedImages : undefined;
      setAttachedImages([]);

      // ── Start a new session in history store ──
      createSession(command);

      // Add user message
      addMessage({ role: "user", content: command, ...(pendingImages ? { imageParts: pendingImages } : {}) });

      // Start the stream via shared hook
      await executeStream({
        message: command,
        ...(repoUrl.trim() ? { repoUrl: repoUrl.trim(), mode: "analyze-repo" as const } : {}),
        ...(pendingImages ? { imageParts: pendingImages } : {}),
      });
    },
    [cursor, isRunning, askUserPending, attachedImages, addMessage, submitAnswer, executeStream, sendCorrection, repoUrl, setShowRepoInput],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeCommand(input);
  };

  const addPanelImagesFromFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, MAX_PANEL_IMAGES).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        if (!url) return;
        setAttachedImages((prev) => prev.length >= MAX_PANEL_IMAGES ? prev : [...prev, { url, mimeType: file.type }]);
      };
      reader.readAsDataURL(file);
    });
  }, [MAX_PANEL_IMAGES]);

  const handlePanelImagePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItems = Array.from(e.clipboardData.items).filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    imageItems.forEach((item) => { const f = item.getAsFile(); if (f) addPanelImagesFromFiles([f]); });
  }, [addPanelImagesFromFiles]);

  const handleCancel = () => {
    cancelStream();
    completeSession("cancelled", "Cancelled by user.");
    runningSessionIdRef.current = null;
    cursor?.cancel();
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
        "w-[400px] max-w-[calc(100vw-2rem)] max-h-[520px] border",
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
              {askUserPending ? "Waiting for your answer..." : (
                <>
                  Step {currentIteration || 1}
                  {elapsedMs !== null && (
                    <span className="text-[10px] opacity-60 font-mono">· {formatSessionDuration(elapsedMs)}</span>
                  )}
                  {(inputTokens > 0 || outputTokens > 0) && (
                    <span
                      className="text-[10px] opacity-60 font-mono"
                      title={`${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`}
                    >· ↓ {formatTokens(inputTokens + outputTokens)}</span>
                  )}
                  {creditsUsed > 0 && (
                    <span className="text-[10px] opacity-60">· {creditsUsed.toFixed(1)}/{creditBudget} credits</span>
                  )}
                </>
              )}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground block">Ask me anything</span>
          )}
        </div>
        <ModelSelector
          models={[]}
          value={selectedModel}
          onChange={handleModelChange}
          disabled={isRunning}
          compact
          showAutoMode
          realModels={realModels}
          hasImages={attachedImages.length > 0}
        />
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
        <CursorSettings
          theme={theme}
          onThemeChange={setTheme}
          soundMuted={soundMuted}
          onSoundToggle={toggleSound}
        />

        <button
          onClick={toggleTheme}
          aria-label={`Switch theme (current: ${theme.name})`}
          title={`Theme: ${theme.name}`}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
        >
          <Palette className="h-4 w-4" />
        </button>
        <button
          onClick={toggleSound}
          aria-label={soundMuted ? "Unmute sounds" : "Mute sounds"}
          title={soundMuted ? "Unmute" : "Mute"}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
        >
          {soundMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        {messages.length > 0 && !isRunning ? (
          <button
            onClick={() => { clearMessages(); setRepoUrl(""); }}
            aria-label="Clear chat history"
            title="Clear Chat"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
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
      {/* ── Chat Messages Area ── */}
      <div
        className="cursor-scroll flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3 min-h-[180px] max-h-[320px] min-w-0"
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
                "flex gap-2.5 group/msg relative min-w-0",
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
                    "max-w-[80%] min-w-0 overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words",
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
                  {/* Collapsible reasoning section (from reasoning models) */}
                  {msg.reasoning && (
                    <details className="mb-1.5 group/reasoning">
                      <summary className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-purple-400/80 hover:text-purple-400 transition-colors list-none [&::-webkit-details-marker]:hidden">
                        <svg className="h-3 w-3 shrink-0 transition-transform group-open/reasoning:rotate-90" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4" /></svg>
                        <span>Reasoning</span>
                        <span className="text-[10px] text-muted-foreground/50">·</span>
                        <span className="text-[10px] text-muted-foreground/50">{msg.reasoning.length > 1000 ? `${Math.round(msg.reasoning.length / 100) / 10}k chars` : `${msg.reasoning.length} chars`}</span>
                      </summary>
                      <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70 bg-purple-500/5 border-l-2 border-purple-500/20 pl-2.5 pr-2 py-1.5 rounded-sm max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words">
                        {msg.reasoning.length > 2000 ? msg.reasoning.slice(0, 2000) + "…" : msg.reasoning}
                      </div>
                    </details>
                  )}

                  {/* Thinking indicator — only when no blocks exist yet */}
                  {msg.role === "assistant" && (msg.status === "thinking" || msg.status === "working") && !(msg.blocks && msg.blocks.length > 0) ? (
                    <div className="flex items-center gap-2">
                      <span>{msg.content}</span>
                      <TypingIndicator className="text-muted-foreground/60" />
                    </div>
                  ) : msg.role === "user" ? (
                    editingMessageId === msg.id ? (
                      <EditableUserMessage
                        initialContent={msg.content}
                        onSubmit={(newContent) => {
                          setEditingMessageId(null);
                          void editAndResend(msg.id, newContent);
                        }}
                        onCancel={() => setEditingMessageId(null)}
                        warnFileChanges={fileActionCount > 0}
                      />
                    ) : (
                      <>
                        {msg.imageParts && msg.imageParts.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {msg.imageParts.map((img, i) => (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img key={i} src={img.url} alt={`Image ${i + 1}`} className="h-16 w-16 rounded-md object-cover border border-white/20" />
                            ))}
                          </div>
                        ) : null}
                        <ExpandableText text={msg.content} onClick={isRunning ? undefined : () => setEditingMessageId(msg.id)} />
                      </>
                    )
                  ) : msg.blocks && msg.blocks.length > 0 ? (
                    /* Block-based rendering (tools, terminal, text) */
                    <MessageBlocks
                      blocks={msg.blocks}
                      isThinking={msg.status === "thinking" || msg.status === "working"}
                      content={msg.content}
                      hasTextBlock={msg.blocks?.some(b => b.kind === "text") ?? false}
                      onResolveConfirm={(sessionId, approved) => resolveConfirmBlock(msg.id, sessionId, approved)}
                      onResolveAsk={(sessionId, value, label) => {
                        resolveAskBlock(sessionId, value, label);
                        addMessage({ role: "user", content: label });
                        const tk = (typeof window !== "undefined" ? localStorage.getItem("token") : null) || "";
                        void loadWorkerBrain().then((b) => b.sendWorkerAnswer(sessionId, value, tk));
                      }}
                      onApplyBuildSpec={handleApplyBuildSpec}
                    />
                  ) : (
                    <span>{msg.content}</span>
                  )}

                  {/* Detail badge */}
                  {msg.detail && !(msg.blocks && msg.blocks.length > 0) ? (
                    <div className="mt-1.5 text-[10px] font-mono opacity-70 bg-black/5 dark:bg-white/5 rounded px-2 py-0.5 whitespace-pre-wrap">
                      {msg.detail}
                    </div>
                  ) : null}

                  {/* Model + per-turn metrics + Retry — completed/errored assistant messages */}
                  {msg.role === "assistant" && (msg.status === "success" || msg.status === "error") && (
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/50">
                      {(msg.modelUsed || typeof msg.creditsUsed === "number" || typeof msg.durationMs === "number" || (msg.inputTokens || msg.outputTokens) || msg.toolUseCount) && (
                        <span title={
                          typeof msg.inputTokens === "number" && typeof msg.outputTokens === "number"
                            ? `${msg.inputTokens.toLocaleString()} in / ${msg.outputTokens.toLocaleString()} out`
                            : undefined
                        }>
                          {msg.modelUsed ? `· ${msg.modelUsed}` : "·"}
                          {typeof msg.durationMs === "number" ? ` | ${formatSessionDuration(msg.durationMs)}` : ""}
                          {(msg.inputTokens || msg.outputTokens)
                            ? ` | ↓ ${formatTokens((msg.inputTokens ?? 0) + (msg.outputTokens ?? 0))} tokens`
                            : ""}
                          {msg.toolUseCount ? ` | ${msg.toolUseCount} tool ${msg.toolUseCount === 1 ? "use" : "uses"}` : ""}
                          {typeof msg.creditsUsed === "number" ? ` | ${msg.creditsUsed.toFixed(1)} credits` : ""}
                        </span>
                      )}
                      {!isRunning && (
                        <button
                          type="button"
                          className="flex items-center rounded-md border bg-background/90 p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          onClick={() => {
                            if (lastDoneSessionRef.current) markSessionRetried(lastDoneSessionRef.current);
                            void retryFromMessage(msg.id);
                          }}
                          title="Retry"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Feedback buttons — show on the final success message */}
                  {msg.role === "assistant" && msg.status === "success" && !isRunning && lastDoneSessionRef.current && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {feedbackSent[lastDoneSessionRef.current] ? (
                        <span className="text-[10px] text-muted-foreground/60">
                          {feedbackSent[lastDoneSessionRef.current] === "positive" ? "👍" : "👎"} Thanks!
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => submitFeedback("positive")}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-muted/40 hover:bg-green-500/20 transition-colors"
                            title="Good result"
                          >
                            👍
                          </button>
                          <button
                            onClick={() => submitFeedback("negative")}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-muted/40 hover:bg-red-500/20 transition-colors"
                            title="Bad result"
                          >
                            👎
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* Auto-scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      {/* ── Terminal Allow/Skip (command consent) ── */}
      {/* Session counter (inline) — timer + tokens + tool uses + credits.
          Shown after a session ends; the live header above carries the
          same fields while streaming. */}
      {creditsUsed > 0 && !isRunning && (
        <div className="mx-3 mt-1 mb-1 space-y-1 text-[10px] text-muted-foreground/60">
          <div className="flex items-center gap-2 font-mono">
            {elapsedMs !== null && (
              <span title="Session duration">{formatSessionDuration(elapsedMs)}</span>
            )}
            {(inputTokens > 0 || outputTokens > 0) && (
              <span title={`${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`}>
                · ↓ {formatTokens(inputTokens + outputTokens)} tokens
              </span>
            )}
            {toolUseCount > 0 && (
              <span>· {toolUseCount} tool {toolUseCount === 1 ? "use" : "uses"}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (creditsUsed / creditBudget) * 100)}%`,
                  background: creditsUsed > creditBudget * 0.8
                    ? "var(--cursor-error, #ef4444)"
                    : creditsUsed > creditBudget * 0.5
                      ? "#f59e0b"
                      : "var(--cursor-primary, #3b82f6)",
                }}
              />
            </div>
            <span className="font-mono shrink-0">{creditsUsed.toFixed(1)}/{creditBudget} credits</span>
          </div>
        </div>
      )}

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

      {/* ── TODO Widget (plan tracker) ── */}
      {planItems.length > 0 ? (
        <details open className="mx-3 mb-2 rounded-lg border bg-muted/20 text-xs">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted-foreground hover:text-foreground flex items-center gap-2">
            <span className="flex-1">
              Todos ({planItems.filter((i) => i.status === "done").length}/{planItems.length})
            </span>
            {planMarkdown ? (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlanModalOpen(true); }}
                className="rounded border bg-background px-2 py-0.5 text-[11px] font-normal text-foreground hover:bg-accent"
              >
                View Plan
              </button>
            ) : null}
          </summary>
          <ul className="px-3 pb-2 space-y-1">
            {planItems.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="flex-shrink-0">
                  {item.status === "done" ? "✅" : item.status === "in_progress" ? "🔵" : "⭕"}
                </span>
                <span className={cn(
                  "truncate",
                  item.status === "done" && "line-through text-muted-foreground/60",
                  item.status === "in_progress" && "font-medium",
                )}>
                  {item.title}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* ── Plan Markdown Modal ── */}
      {planModalOpen && planMarkdown ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Plan details"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPlanModalOpen(false)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-lg border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-2">
              <h2 className="text-sm font-semibold">Plan</h2>
              <button
                type="button"
                onClick={() => setPlanModalOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close plan"
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto p-4" style={{ maxHeight: "calc(85vh - 3rem)" }}>
              <MarkdownContent text={planMarkdown} className="text-sm leading-relaxed" />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── File Changes: shown during session with live count, Keep/Undo after done ── */}
      {fileActions.length > 0 ? (
        <details className="mx-3 mb-2 rounded-lg border bg-muted/20 text-xs">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted-foreground hover:text-foreground">
            {fileActions.length} file{fileActions.length > 1 ? "s" : ""} changed
            {isRunning && <Loader2 className="inline h-3 w-3 animate-spin ml-1.5" />}
          </summary>
          <ul className="px-3 pb-2 space-y-1">
            {fileActions.map((fa) => {
              const short = fa.path.split("/").slice(-2).join("/");
              const isReverted = revertedFiles.has(fa.path);
              return (
                <li key={fa.id} className="flex items-center gap-2 justify-between">
                  <span className={cn("truncate flex-1", isReverted && "line-through text-muted-foreground/50")}>
                    {fa.type === "created" ? "📄" : fa.type === "modified" ? "✏️" : "🗑️"} {short}
                  </span>
                  {!isReverted && !isRunning ? (
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setRevertedFiles((prev) => new Set(prev).add(fa.path))}
                        className="rounded px-2 py-0.5 text-[10px] border text-muted-foreground hover:text-foreground"
                      >
                        Keep
                      </button>
                      <button
                        onClick={async () => {
                          if (!fa.originalPreview && fa.type !== "deleted") {
                            // New file — can't revert to "nothing" easily
                            return;
                          }
                          try {
                            const sid = lastDoneSessionRef.current;
                            if (!sid) return;
                            await fetch(apiUrl(`/cursor/sessions/${encodeURIComponent(sid)}/revert-file`), {
                              method: "POST",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ path: fa.path, originalContent: fa.originalPreview }),
                            });
                            setRevertedFiles((prev) => new Set(prev).add(fa.path));
                          } catch { /* ignore */ }
                        }}
                        className="rounded px-2 py-0.5 text-[10px] border text-red-500/80 hover:text-red-600"
                      >
                        Undo
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50">reverted</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
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

      {/* ── Attached Repo Chip ── */}
      {repoUrl ? (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-muted/30">
          <div className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs">
            <Github className="h-3 w-3 text-muted-foreground" />
            <span className="max-w-[240px] truncate text-muted-foreground">
              {formatRepoUrl(repoUrl)}
            </span>
            <button
              type="button"
              onClick={() => { setRepoUrl(""); }}
              aria-label="Remove repo"
              className="text-muted-foreground hover:text-foreground ml-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Ask-user options now render INSIDE the chat timeline (InlineAskBlock).
          The previous floating row here duplicated the buttons and stayed visible
          after answering. Removed to keep a single source of truth. ── */}


      {/* \u2500\u2500 Input Bar \u2500\u2500 */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-3 border-t"
        role="search"
      >
        {/* + Attach button with context menu popover */}
        <Popover open={showRepoInput} onOpenChange={(open) => {
          setShowRepoInput(open);
          if (!open) setShowImportCode(false);
        }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Attach context"
              title="Attach context"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition-all flex-shrink-0",
                showRepoInput
                  ? "text-white rotate-45"
                  : repoUrl
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground border",
              )}
              style={showRepoInput || repoUrl ? { background: "var(--cursor-primary)" } : undefined}
            >
              <Plus className="h-4 w-4 transition-transform" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-72 p-0"
          >
            {!showImportCode ? (
              /* ── Step 1: Context menu ── */
              <div className="py-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                  onClick={() => setShowImportCode(true)}
                >
                  <Code className="h-4 w-4 text-muted-foreground" />
                  Import code
                </button>
              </div>
            ) : (
              /* ── Step 2: GitHub URL input ── */
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportCode(false)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Back"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <h4 className="text-sm font-medium">Import code</h4>
                </div>
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/user/repo"
                    className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--cursor-primary)]/30"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && repoUrl.trim()) {
                        e.preventDefault();
                        if (!isValidRepoUrl(repoUrl)) return;
                        setShowRepoInput(false);
                        setShowImportCode(false);
                        inputRef.current?.focus();
                      }
                    }}
                  />
                </div>
                {repoUrl.trim() ? (
                  <div className="flex flex-col gap-1.5">
                    {!isValidRepoUrl(repoUrl) ? (
                      <p className="text-[10px] text-destructive">Enter a valid GitHub, GitLab, or Bitbucket repo URL</p>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                        {formatRepoUrl(repoUrl)}
                      </p>
                      <button
                        type="button"
                        className="text-xs font-medium px-2.5 py-1 rounded-md transition-colors text-white disabled:opacity-40"
                        style={{ background: "var(--cursor-primary)" }}
                        disabled={!isValidRepoUrl(repoUrl)}
                        onClick={() => {
                          setShowRepoInput(false);
                          setShowImportCode(false);
                          inputRef.current?.focus();
                        }}
                      >
                        Attach
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </PopoverContent>
        </Popover>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize
            const el = e.target;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 150) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim()) handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          onPaste={handlePanelImagePaste}
          placeholder={
            askUserPending && !askUserPending.sensitive
              ? "Type your answer..."
              : isRunning
                ? "Send a correction..."
                : "Type a message..."
          }
          disabled={!!secretPending}
          aria-label="Cursor chat input"
          className="flex-1 rounded-xl border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--cursor-primary)]/30 resize-none"
          style={{ minHeight: "2.5rem", maxHeight: "150px" }}
        />
        {isRunning && !askUserPending ? (
          <>
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send correction"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition-colors disabled:opacity-40"
              style={{ background: "var(--cursor-primary)" }}
              title="Send correction"
            >
              <Send className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              aria-label="Cancel current action"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition-colors"
              style={{ background: "var(--cursor-error)" }}
              title="Cancel — halts the agent at the next safe checkpoint. Tokens already produced will still be charged."
            >
              <Square className="h-4 w-4" />
            </button>
          </>
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

      {/* ── Conversation History Modal ── */}

    </div>
  );
}
