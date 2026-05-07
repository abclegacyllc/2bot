/**
 * useCursorStream — Shared hook for SSE streaming, message management,
 * event handling, model selection, and ask_user logic.
 *
 * Extracted from duplicate code in cursor-panel.tsx and cursor-studio-bar.tsx.
 * Each consumer wires unique side-effects (cursor animations, sounds,
 * session history, workflow refresh) via the `onWorkerEvent` callback.
 *
 * @module components/cursor/hooks/use-cursor-stream
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { RealModelOption } from "@/components/shared/model-selector";
import type { CursorAgentEvent } from "@/modules/cursor/cursor-agent.types";
import type { CursorWorkerType } from "@/modules/cursor/cursor-workers";
import { apiUrl } from "@/shared/config/urls";
import { describeAgentEvent } from "../agent-event-mapper";
import type { WorkerStreamClientRequest } from "../cursor-brain";
import {
    createCheckpoint as createCp,
    getCheckpoints,
    getRestoreData,
    pruneAfterRestore,
    type Checkpoint,
    type FileActionSnapshot,
} from "../cursor-checkpoints";
import {
    clearConversationLog,
    getSnapshots,
    saveSnapshot,
} from "../cursor-conversation-log";
import { getCreditBudget } from "../cursor-session-store";
import type {
    ActivityItem,
    AskUserPending,
    CursorChatMessage,
    CursorStreamConfig,
    CursorStreamReturn,
    MessageBlock,
} from "../types/cursor-chat.types";

// =============================================================================
// Helpers
// =============================================================================

/** Lazy-load the cursor-brain SSE client */
async function loadWorkerBrain() {
  const mod = await import("../cursor-brain");
  return { streamWorker: mod.streamWorker, sendWorkerAnswer: mod.sendWorkerAnswer };
}

/** Generate a unique message ID */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Persist messages to localStorage */
function saveMessages(msgs: CursorChatMessage[], storageKey: string, limit: number) {
  try {
    const serialisable = msgs
      .filter((m) => m.status !== "thinking" && m.status !== "working")
      .slice(-limit)
      .map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
    localStorage.setItem(storageKey, JSON.stringify(serialisable));
  } catch { /* quota exceeded — ignore */ }
}

/** Restore messages from localStorage */
function loadMessages(storageKey: string, limit: number): CursorChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      role: string;
      content: string;
      detail?: string;
      reasoning?: string;
      status?: string;
      timestamp: string | number;
    }>;
    return parsed
      .filter((m) => m.id && m.content && m.status !== "thinking" && m.status !== "working")
      .slice(-limit)
      .map((m) => ({
        ...m,
        role: m.role as CursorChatMessage["role"],
        status: m.status as CursorChatMessage["status"],
        // Handle both Date ISO strings and epoch numbers (legacy Studio format)
        timestamp: new Date(m.timestamp),
      }));
  } catch { /* ignore */ }
  return [];
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Reject result-detail strings that are pure JSON delimiter garbage
 * (e.g. `]`, `, ]`, `}`) which can leak through when a tool returns
 * a stringified empty array/object. Returns undefined for junk input.
 */
function sanitizeResultDetail(detail: string | undefined | null): string | undefined {
  if (!detail) return undefined;
  // Strip leaked LLM-facing cache marker if it slipped through
  let trimmed = detail.replace(/^\[cached[^\]]*\]\s*-?\s*/i, "").trim();
  if (!trimmed) return undefined;
  // Drop if the entire string is just brackets/braces/commas/quotes/whitespace
  if (/^[\[\]{}(),"\s]+$/.test(trimmed)) return undefined;
  return trimmed;
}

export function useCursorStream(config: CursorStreamConfig): CursorStreamReturn {
  const {
    storageKey,
    modelStorageKey,
    suspendedStorageKey,
    messageLimit = 30,
    idPrefix = "msg",
    token,
    onWorkerEvent,
  } = config;

  // ── State ──
  const [messages, setMessages] = useState<CursorChatMessage[]>(() => loadMessages(storageKey, messageLimit));
  const [isStreaming, setIsStreaming] = useState(false);
  const [askUserPending, setAskUserPending] = useState<AskUserPending | null>(null);
  /** Stable ref so submitAnswer can read inFlight without stale-closure issues */
  const askUserPendingRef = useRef<AskUserPending | null>(null);
  useEffect(() => { askUserPendingRef.current = askUserPending; }, [askUserPending]);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [creditsUsed, setCreditsUsed] = useState<number>(0);
  const [currentIteration, setCurrentIteration] = useState<number>(0);
  const [creditBudget, setCreditBudget] = useState<number>(200);
  const [activeWorker, setActiveWorker] = useState<{ type: CursorWorkerType; displayName: string } | null>(null);
  /** Cumulative input tokens consumed by the current/last session. */
  const [inputTokens, setInputTokens] = useState<number>(0);
  /** Cumulative output tokens produced by the current/last session. */
  const [outputTokens, setOutputTokens] = useState<number>(0);
  /** Cumulative tool invocations across the session. */
  const [toolUseCount, setToolUseCount] = useState<number>(0);
  /**
   * Wall-clock timestamp the current session started (ms epoch).
   * Set on `session_start`, cleared on chat clear; preserved between
   * iterations so the timer never resets mid-session.
   */
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  /** Frozen elapsed time in ms — set on `done`/`error`, null while live. */
  const [sessionFinalDurationMs, setSessionFinalDurationMs] = useState<number | null>(null);
  /**
   * Tick state — increments once per second while streaming so UI components
   * that derive elapsed time from `sessionStartedAt` re-render.
   */
  /**
   * Live elapsed milliseconds for the current/last session.
   *
   * - While streaming: `now() - sessionStartedAt`, ticking once per second.
   * - After done/error: the frozen `sessionFinalDurationMs`.
   * - Idle (no session yet, or chat cleared): `null`.
   *
   * Held in state and updated inside an effect — keeps `Date.now()` out of
   * the render path (React Compiler treats it as impure) without losing
   * the per-second update cadence.
   */
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try { return localStorage.getItem(modelStorageKey) ?? "auto"; } catch { return "auto"; }
  });
  const [realModels, setRealModels] = useState<RealModelOption[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [showRepoInput, setShowRepoInput] = useState(false);
  const [showImportCode, setShowImportCode] = useState(false);
  const [fileActionCount, setFileActionCount] = useState(0);
  /** Repo attached in this session — persists across messages until chat is cleared */
  const sessionRepoUrlKey = `${storageKey}-repo`;
  const [sessionRepoUrl, setSessionRepoUrlState] = useState<string>(() => {
    try { return localStorage.getItem(`${storageKey}-repo`) ?? ""; } catch { return ""; }
  });
  const setSessionRepoUrl = useCallback((url: string) => {
    setSessionRepoUrlState(url);
    try {
      if (url) localStorage.setItem(sessionRepoUrlKey, url);
      else localStorage.removeItem(sessionRepoUrlKey);
    } catch { /* ignore */ }
  }, [sessionRepoUrlKey]);

  // ── Reload messages when storageKey changes (e.g. userId switch or session switch in Studio) ──
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  if (prevStorageKey !== storageKey) {
    setPrevStorageKey(storageKey);
    // Synchronously reset — React-recommended derived-state pattern
    setMessages(loadMessages(storageKey, messageLimit));
    try { setSelectedModel(localStorage.getItem(modelStorageKey) ?? "auto"); } catch { /* ignore */ }
    // Reset all per-stream state so sessions don't leak into each other
    setActivityLog([]);
    setCreditsUsed(0);
    setCurrentIteration(0);
    setCreditBudget(200);
    setActiveWorker(null);
    setAskUserPending(null);
    setInputTokens(0);
    setOutputTokens(0);
    setToolUseCount(0);
    setSessionStartedAt(null);
    setSessionFinalDurationMs(null);
    // Load session repo for new storageKey
    try { setSessionRepoUrlState(localStorage.getItem(`${storageKey}-repo`) ?? ""); } catch { /* ignore */ }
  }

  // ── Refs ──
  const assistantMsgIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  /**
   * Active server-side session id, captured from `session_start` events.
   * Used by `cancelStream` to send a POST /cursor/worker-cancel so the
   * runner halts billing instead of just closing the SSE on the client.
   */
  const activeSessionIdRef = useRef<string | null>(null);
  /** Keep latest values accessible inside handleWorkerEvent without dep cycle */
  const currentIterationRef = useRef(currentIteration);
  const creditBudgetRef = useRef(creditBudget);
  const creditsUsedRef = useRef(creditsUsed);
  const activityLogRef = useRef(activityLog);
  const storageKeyRef = useRef(storageKey);
  const messageLimitRef = useRef(messageLimit);
  /** Stable ref to current messages (for checkpoint creation inside executeStream) */
  const messagesRef = useRef(messages);
  /** File action snapshots tracked for checkpoints */
  const fileActionsRef = useRef<FileActionSnapshot[]>([]);
  /** Synchronous tracker for messages that have blocks — avoids stale-ref race in status handler */
  const msgsWithBlocksRef = useRef<Set<string>>(new Set());
  /** Stable ref for onWorkerEvent callback */
  const onWorkerEventRef = useRef(onWorkerEvent);
  /** Stable ref for token */
  const tokenRef = useRef(token);
  /** Stable ref for sessionStartedAt — avoids stale-closure inside event handlers. */
  const sessionStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    currentIterationRef.current = currentIteration;
    creditBudgetRef.current = creditBudget;
    creditsUsedRef.current = creditsUsed;
    activityLogRef.current = activityLog;
    onWorkerEventRef.current = onWorkerEvent;
    tokenRef.current = token;
    storageKeyRef.current = storageKey;
    messageLimitRef.current = messageLimit;
    messagesRef.current = messages;
    sessionStartedAtRef.current = sessionStartedAt;
    // Keep sync tracker in sync with actual message state
    for (const m of messages) {
      if (m.blocks && m.blocks.length > 0) msgsWithBlocksRef.current.add(m.id);
    }
  });

  // ── Message helpers ──

  const addMessage = useCallback((msg: Omit<CursorChatMessage, "id" | "timestamp">) => {
    const newMsg: CursorChatMessage = {
      ...msg,
      id: generateId(idPrefix),
      timestamp: new Date(),
    };
    setMessages((prev) => {
      const updated = [...prev, newMsg].slice(-messageLimit);
      saveMessages(updated, storageKey, messageLimit);
      return updated;
    });
    return newMsg.id;
  }, [idPrefix, messageLimit, storageKey]);

  const updateMessage = useCallback((id: string, updates: Partial<CursorChatMessage>) => {
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, ...updates } : m));
      saveMessages(updated, storageKey, messageLimit);
      return updated;
    });
  }, [storageKey, messageLimit]);

  /** Append a block to the assistant message's inline chain */
  const appendBlock = useCallback((id: string, block: MessageBlock) => {
    // Mark synchronously so the status handler can see blocks exist immediately
    msgsWithBlocksRef.current.add(id);
    setMessages((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== id) return m;
        const blocks = m.blocks ? [...m.blocks] : [];
        // Merge consecutive text blocks
        if (block.kind === "text" && blocks.length > 0) {
          const last = blocks[blocks.length - 1];
          if (last && last.kind === "text") {
            blocks[blocks.length - 1] = { kind: "text", text: last.text + "\n\n" + block.text };
            return { ...m, blocks };
          }
        }
        blocks.push(block);
        return { ...m, blocks };
      });
      saveMessages(updated, storageKey, messageLimit);
      return updated;
    });
  }, [storageKey, messageLimit]);

  /** Update the last tool block's status in the inline chain */
  const updateLastToolBlock = useCallback((id: string, status: "done" | "error", detail?: string, snippet?: string, patch?: string) => {
    setMessages((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== id || !m.blocks) return m;
        const blocks = [...m.blocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i];
          if (b && b.kind === "tool" && b.status === "running") {
            let desc: string;
            if (status === "done" && b.description.startsWith("📖 Reading `")) {
              // Present → past tense for read_file. Detail from server is
              // "<fullPath> lines X–Y" but the description already has the line
              // range from tool_start, so we just swap the verb and drop the
              // ellipsis — never inject the full path into the visible text.
              desc = b.description.replace("📖 Reading `", "📖 Read `").replace(/…$/, "");
              // If for some reason the description doesn't carry the range yet
              // (older meta missing startLine), append a stripped, basename-safe range.
              if (!/lines\s+/.test(desc) && detail) {
                const range = detail.match(/lines\s+\S+/i)?.[0];
                if (range) desc = `${desc}, ${range}`;
              }
            } else if (status === "done" && b.description.startsWith("✏️ Editing `")) {
              // Present → past tense for edit_file: "Editing `file`…" → "Edited `file` +1 -2"
              desc = b.description
                .replace("✏️ Editing `", "✏️ Edited `")
                .replace(/…$/, detail ? ` ${detail}` : "");
            } else if (detail && !b.description.includes(detail)) {
              // Avoid duplicating info already in the description (e.g. diff stats)
              desc = `${b.description}, ${detail}`;
            } else {
              desc = b.description;
            }
            blocks[i] = {
              ...b,
              description: desc,
              status,
              ...(snippet ? { snippet } : {}),
              ...(patch ? { patch } : {}),
            };
            break;
          }
        }
        return { ...m, blocks };
      });
      saveMessages(updated, storageKey, messageLimit);
      return updated;
    });
  }, [storageKey, messageLimit]);

  /**
   * Replace the most-recently-done tool block with a terminal block.
   * Used by terminal_output events so run_command/validate_plugin show as a
   * single merged entry instead of a "Running…" tool block + separate terminal block.
   */
  const replaceLastCommandBlock = useCallback((id: string, terminalBlock: Extract<MessageBlock, { kind: "terminal" }>) => {
    setMessages((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== id || !m.blocks) return m;
        const blocks = [...m.blocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i];
          // Replace the last done tool block — terminal_output always follows
          // immediately after tool_result for run_command/validate_plugin
          if (b && b.kind === "tool" && b.status === "done") {
            blocks[i] = terminalBlock;
            // Remove the orphaned confirm block ("Command allowed" badge) that follows
            // the replaced tool block — it has no meaning once the terminal output is shown
            if (i + 1 < blocks.length && blocks[i + 1]?.kind === "confirm") {
              blocks.splice(i + 1, 1);
            }
            return { ...m, blocks };
          }
        }
        // No done tool block found — fall back to appending
        blocks.push(terminalBlock);
        return { ...m, blocks };
      });
      saveMessages(updated, storageKey, messageLimit);
      return updated;
    });
  }, [storageKey, messageLimit]);

  /** Resolve an inline confirm block (Allow/Skip) */
  const resolveConfirmBlock = useCallback((msgId: string, sessionId: string, approved: boolean) => {
    setMessages((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== msgId || !m.blocks) return m;
        const blocks = m.blocks.map((b) => {
          if (b.kind === "confirm" && b.sessionId === sessionId && !b.resolved) {
            return { ...b, resolved: approved ? "allowed" as const : "skipped" as const };
          }
          return b;
        });
        return { ...m, blocks };
      });
      saveMessages(updated, storageKey, messageLimit);
      return updated;
    });
  }, [storageKey, messageLimit]);

  /** Mark an inline ask block as answered so the option buttons collapse to a badge. */
  const resolveAskBlock = useCallback((sessionId: string, value: string, label: string) => {
    setMessages((prev) => {
      const updated = prev.map((m) => {
        if (!m.blocks) return m;
        const blocks = m.blocks.map((b) => {
          if (b.kind === "ask" && b.sessionId === sessionId && !b.resolved) {
            return { ...b, resolved: { value, label } };
          }
          return b;
        });
        return { ...m, blocks };
      });
      saveMessages(updated, storageKey, messageLimit);
      return updated;
    });
  }, [storageKey, messageLimit]);

  /**
   * patch the status (and optionally result/error) of a
   * BuildSpec block. Used by the chat surface as it drives the apply flow:
   * idle → applying → applied/rolled-back/error.
   */
  const updateBuildSpecBlock = useCallback(
    (
      blockId: string,
      patch: Partial<{
        status: "idle" | "applying" | "applied" | "rolled-back" | "error";
        result: unknown;
        error: string;
      }>,
    ) => {
      setMessages((prev) => {
        const updated = prev.map((m) => {
          if (!m.blocks) return m;
          const blocks = m.blocks.map((b) =>
            b.kind === "buildspec" && b.id === blockId ? { ...b, ...patch } : b,
          );
          return { ...m, blocks };
        });
        saveMessages(updated, storageKey, messageLimit);
        return updated;
      });
    },
    [storageKey, messageLimit],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    try { localStorage.removeItem(suspendedStorageKey); } catch { /* ignore */ }
    try { localStorage.removeItem(`${storageKey}-repo`); } catch { /* ignore */ }
    setSessionRepoUrlState("");
    clearConversationLog(storageKey);
    // Reset session-metric state so the header doesn't keep showing stale
    // counters from the cleared conversation.
    setSessionStartedAt(null);
    setSessionFinalDurationMs(null);
    setInputTokens(0);
    setOutputTokens(0);
    setToolUseCount(0);
  }, [storageKey, suspendedStorageKey]);

  // ── Model change handler ──

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    try { localStorage.setItem(modelStorageKey, modelId); } catch { /* ignore */ }
  }, [modelStorageKey]);

  // ── Fetch real models for selector ──

  useEffect(() => {
    const controller = new AbortController();
    const authToken = token || localStorage.getItem("token") || "";
    const headers: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    fetch(apiUrl("/2bot-ai/real-models?capability=code-generation"), {
      credentials: "include",
      headers,
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.models) {
          setRealModels(data.data.models.filter((m: { functionCalling?: boolean }) => m.functionCalling !== false));
        }
      })
      .catch(() => { /* aborted or network error — ignore */ });
    return () => controller.abort();
  }, [token]);

  // ── Restore suspended session from localStorage ──

  const restoredSuspendedRef = useRef(false);
  useEffect(() => {
    if (restoredSuspendedRef.current) return;
    try {
      const raw = localStorage.getItem(suspendedStorageKey);
      if (raw) {
        const pending = JSON.parse(raw) as AskUserPending;
        if (pending.sessionId) {
          restoredSuspendedRef.current = true;
          queueMicrotask(() => {
            setAskUserPending(pending);
          });
        }
      }
    } catch { /* ignore */ }
  }, [suspendedStorageKey]);

  // ── Cleanup on unmount ──

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  // ── SSE event handler ──

  const handleWorkerEvent = useCallback(
    (rawEvent: Record<string, unknown>) => {
      const event = rawEvent as unknown as CursorAgentEvent;
      const msgId = assistantMsgIdRef.current;

      // Capture the sessionId so `cancelStream` can hit the server-side
      // cancel endpoint. The runner emits sessionId on session_start /
      // worker_start / done events; any of them is enough to record the
      // most recent active session.
      const evtSessionId = (rawEvent as { sessionId?: unknown }).sessionId;
      if (typeof evtSessionId === "string" && evtSessionId.length > 0) {
        activeSessionIdRef.current = evtSessionId;
      }

      switch (event.type) {
        case "worker_start": {
          setActiveWorker({ type: event.worker, displayName: event.displayName });
          if (msgId) {
            updateMessage(msgId, {
              content: `${event.displayName || "AI"} is on it...`,
              status: "working",
            });
          }
          break;
        }

        case "worker_switch": {
          setActiveWorker({ type: event.toWorker, displayName: event.toDisplayName });
          addMessage({ role: "system", content: `Passing to ${event.toDisplayName}...` });
          break;
        }

        case "ask_user": {
          // Add a new assistant message and append an inline `ask` block. The
          // question text is rendered INSIDE the ask card (not as message
          // content) so the card has a single source of truth — when it
          // collapses to the resolved "Answered: …" badge, the question text
          // disappears with it and we don't leave orphan markdown floating
          // in the bubble.
          const askMsgId = addMessage({ role: "assistant", content: "", status: "success" });
          appendBlock(askMsgId, {
            kind: "ask",
            sessionId: event.sessionId,
            question: event.question,
            options: event.options,
            sensitive: event.sensitive ?? false,
          });
          setAskUserPending({
            sessionId: event.sessionId,
            sensitive: event.sensitive ?? false,
            question: event.question,
            options: event.options,
            inFlight: true, // SSE stream still open — answer via /cursor/worker-answer
          });
          break;
        }

        case "suspended": {
          const suspendMsgId = addMessage({ role: "assistant", content: "", status: "success" });
          appendBlock(suspendMsgId, {
            kind: "ask",
            sessionId: event.sessionId,
            question: event.question,
            options: event.options,
            sensitive: event.sensitive ?? false,
          });
          const pending: AskUserPending = {
            sessionId: event.sessionId,
            sensitive: event.sensitive ?? false,
            question: event.question,
            options: event.options,
          };
          setAskUserPending(pending);
          try {
            localStorage.setItem(suspendedStorageKey, JSON.stringify(pending));
          } catch { /* ignore */ }
          break;
        }

        case "terminal_confirm": {
          // Append inline confirm block so Allow/Skip appears inside the chat message
          if (msgId) {
            appendBlock(msgId, {
              kind: "confirm",
              sessionId: event.sessionId,
              command: event.command,
            });
          }
          break;
        }

        case "thinking": {
          if (msgId) {
            const updates: Partial<CursorChatMessage> = {
              content: event.text.slice(0, 200),
              status: "thinking",
            };
            // Preserve reasoning from reasoning models (o1, o3, Claude extended thinking)
            // Accumulate across iterations — each thinking event may carry a new reasoning block
            if (event.reasoning) {
              const existingReasoning = messagesRef.current.find((m) => m.id === msgId)?.reasoning;
              updates.reasoning = existingReasoning
                ? existingReasoning + "\n\n---\n\n" + event.reasoning
                : event.reasoning;
            }
            updateMessage(msgId, updates);
            // Append AI's reasoning as inline text block — but skip if the
            // last block is already a streaming text block (text_delta
            // path, F-7), to avoid duplicating the same content.
            if (event.text.length > 10) {
              const msg = messagesRef.current.find((m) => m.id === msgId);
              const lastBlock = msg?.blocks?.[msg.blocks.length - 1];
              const alreadyStreamed = lastBlock?.kind === "text";
              if (!alreadyStreamed) {
                appendBlock(msgId, { kind: "text", text: event.text });
              }
            }
          }
          if (event.text.length > 30) {
            setActivityLog((prev) => [...prev, {
              id: generateId("act"),
              kind: "thinking",
              description: `💭 ${event.text.slice(0, 80)}${event.text.length > 80 ? "..." : ""}`,
              status: "done",
              iteration: currentIterationRef.current,
            }]);
          }
          break;
        }

        case "text_delta": {
          // F-7: incremental text from a streaming LLM response. Append to
          // the most recent text block on the assistant message; create
          // one if the last block isn't text (typically right after an
          // iteration_start status block or a tool_result).
          if (!msgId || !event.delta) break;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId) return m;
              const blocks = m.blocks ? [...m.blocks] : [];
              const lastIdx = blocks.length - 1;
              const last = lastIdx >= 0 ? blocks[lastIdx] : undefined;
              if (last && last.kind === "text") {
                blocks[lastIdx] = { ...last, text: last.text + event.delta };
              } else {
                blocks.push({ kind: "text", text: event.delta });
              }
              msgsWithBlocksRef.current.add(msgId);
              // Mirror the running text into `content` so any non-block
              // renderer (history, search) still has the gist. Cap to
              // 300 chars to keep React update cost bounded on long
              // streaming responses; the full text lives in the block.
              const liveText = blocks
                .filter((b): b is { kind: "text"; text: string } => b.kind === "text")
                .map((b) => b.text)
                .join("\n");
              return {
                ...m,
                blocks,
                content: liveText.slice(-300),
                status: "working",
              };
            }),
          );
          break;
        }

        case "tool_result": {
          const resultDesc = describeAgentEvent(event);
          if (resultDesc && msgId) {
            // Only update content when no blocks — blocks renderer handles the rest
            const hasBlocks = msgsWithBlocksRef.current.has(msgId);
            if (hasBlocks) {
              updateMessage(msgId, { status: "working" });
            } else {
              updateMessage(msgId, { content: resultDesc, status: "working" });
            }
          }
          // Update inline tool block status
          if (msgId) {
            const rawDetail = (event as { resultDetail?: string }).resultDetail;
            const detail = sanitizeResultDetail(rawDetail);
            const snippet = (event as { snippet?: string }).snippet;
            const patch = (event as { patch?: string }).patch;
            updateLastToolBlock(
              msgId,
              event.success ? "done" : "error",
              detail,
              snippet,
              patch,
            );
          }
          setActivityLog((prev) => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              const item = updated[i];
              if (item && item.status === "running") {
                const rawDetail = (event as { resultDetail?: string }).resultDetail;
                const detail = sanitizeResultDetail(rawDetail);
                // Avoid duplicating info already in the description
                const enrichedDesc = detail && !item.description.includes(detail)
                  ? `${item.description}, ${detail}`
                  : item.description;
                updated[i] = {
                  id: item.id,
                  kind: item.kind,
                  description: enrichedDesc,
                  status: event.success ? "done" : "error",
                  errorDetail: event.success ? undefined : event.summary?.slice(0, 120),
                  iteration: item.iteration,
                };
                break;
              }
            }
            return updated;
          });
          break;
        }

        case "tool_start":
        case "code_preview":
        case "status":
        case "iteration_start": {
          const desc = describeAgentEvent(event);
          if (desc && msgId) {
            // Check if blocks exist (sync ref avoids stale-state race)
            const hasBlocks = msgsWithBlocksRef.current.has(msgId);
            // Show status/iteration text as content while streaming (no blocks yet).
            // Gives the user visibility into what the AI is doing: "Thinking... (step 2)",
            // "Analyzing requirements...", "Compacting context…" etc.
            // Once blocks appear the content display is replaced by MessageBlocks.
            if (hasBlocks) {
              // Status events (e.g. repo analysis progress) must stay visible even after
              // blocks exist. Update the last status block's text in-place so the user
              // can see "Scanning file structure…" → "Read 4 key files. Analyzing with AI…"
              // instead of a silent spinner. Non-status events (tool_start, iteration_start,
              // code_preview) only need the spinner — they have their own blocks.
              if (event.type === "status") {
                setMessages((prev) => prev.map((m) => {
                  if (m.id !== msgId || !m.blocks) return m;
                  const blocks = [...m.blocks];
                  // Find the last status block and update it
                  for (let i = blocks.length - 1; i >= 0; i--) {
                    const b = blocks[i];
                    if (b && b.kind === "status") {
                      blocks[i] = { ...b, text: desc };
                      return { ...m, blocks, status: "working" };
                    }
                  }
                  // No existing status block — append one
                  blocks.push({ kind: "status", text: desc });
                  return { ...m, blocks, status: "working" };
                }));
                msgsWithBlocksRef.current.add(msgId);
              } else {
                updateMessage(msgId, { status: "working" });
              }
            } else {
              updateMessage(msgId, { content: desc, status: "working" });
            }
          }
          if (event.type === "iteration_start") {
            setCreditsUsed(event.totalCreditsUsed);
            setCurrentIteration(event.iteration);
            if (event.creditBudget && event.creditBudget > 0) {
              setCreditBudget(event.creditBudget);
            }
            // Update the running token + tool-use totals so the UI reflects
            // mid-session progress without waiting for the `done` event.
            if (typeof event.inputTokens === "number") setInputTokens(event.inputTokens);
            if (typeof event.outputTokens === "number") setOutputTokens(event.outputTokens);
            if (typeof event.toolUseCount === "number") setToolUseCount(event.toolUseCount);
            // Inline step separator block
            if (event.iteration > 1 && msgId) {
              appendBlock(msgId, {
                kind: "status",
                text: `── Step ${event.iteration} ──`,
              });
            }
            if (event.iteration > 1) {
              setActivityLog((prev) => [...prev, {
                id: `act-iter-${event.iteration}`,
                kind: "status",
                description: `── Step ${event.iteration} · ${Number(event.totalCreditsUsed).toFixed(1)} credits used ──`,
                status: "done",
                iteration: event.iteration,
              }]);
            }
          }
          // code_preview follows a tool_start:write_file — update existing block instead of creating duplicate
          if (event.type === "code_preview" && msgId) {
            updateLastToolBlock(msgId, "done");
            // Also mark the last running activity as done
            setActivityLog((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i]?.status === "running") {
                  updated[i] = { ...updated[i]!, status: "done" };
                  break;
                }
              }
              return updated;
            });
            break;
          }
          // Append inline tool block (tool_start only — not code_preview)
          if (event.type === "tool_start" && desc && msgId) {
            const toolBlockId = generateId("blk");
            // Capture the full file/dir path from meta so the chat can render
            // only the basename and reveal the full path on hover.
            const meta = (event as { meta?: { path?: string } }).meta;
            const fullPath = typeof meta?.path === "string" && meta.path.length > 0 ? meta.path : undefined;
            appendBlock(msgId, {
              kind: "tool",
              id: toolBlockId,
              description: desc,
              status: "running",
              ...(fullPath ? { fullPath } : {}),
            });
          }
          if (event.type === "tool_start" && desc) {
            setActivityLog((prev) => [...prev, {
              id: generateId("act"),
              kind: "tool",
              description: desc,
              status: "running",
              iteration: currentIterationRef.current,
            }]);
          }
          break;
        }

        case "terminal_confirm": {
          // Append an inline confirm block so the Allow/Skip dialog appears inside the chat
          if (msgId) {
            appendBlock(msgId, {
              kind: "confirm",
              sessionId: event.sessionId,
              command: event.command,
            });
          }
          break;
        }

        case "terminal_output": {
          // Merge with the preceding run_command/validate_plugin tool block instead of
          // appending a separate entry — keeps the timeline as one unified item.
          if (msgId) {
            replaceLastCommandBlock(msgId, {
              kind: "terminal",
              command: event.command,
              output: event.output,
              exitCode: event.exitCode,
              cwd: event.cwd,
            });
          }
          // Track in activity log so operations counter includes terminal commands
          setActivityLog((prev) => [...prev, {
            id: generateId("act"),
            kind: "tool",
            description: `▶ Terminal: ${event.command.slice(0, 60)}${event.command.length > 60 ? "..." : ""}`,
            status: event.exitCode === 0 ? "done" : "error",
            iteration: currentIterationRef.current,
          }]);
          break;
        }

        case "model_fallback": {
          // Show inline notice that the user's selected model was unavailable
          if (msgId) {
            const requested = (event as { requestedModel?: string }).requestedModel || "selected model";
            const fallback = (event as { fallbackModel?: string }).fallbackModel || "best available model";
            appendBlock(msgId, {
              kind: "text",
              text: `⚠️ **${requested}** is currently unavailable — continuing with **${fallback}**`,
            });
          }
          // Update model selector to reflect the actual model in use
          const fallbackId = (event as { fallbackModelId?: string }).fallbackModelId;
          if (fallbackId) {
            handleModelChange(fallbackId);
          }
          break;
        }

        case "handoffs": {
          // Declarative-agent post-completion hand-off buttons. Stash on the
          // assistant message so the chat surface can render buttons under it.
          if (msgId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      handoffs: event.options.map((o) => ({
                        label: o.label,
                        agent: o.agent,
                        prompt: o.prompt,
                      })),
                    }
                  : m,
              ),
            );
          }
          break;
        }

        case "buildspec": {
          // The Cursor Builder agent produced a structured BuildSpec.
          // Render as an inline block with an Apply button. The user-facing
          // chat surface owns the apply lifecycle (idle → applying → applied).
          if (msgId) {
            const evt = event as { spec: unknown; summary?: string };
            appendBlock(msgId, {
              kind: "buildspec",
              id: generateId("buildspec"),
              spec: evt.spec,
              summary: evt.summary,
              status: "idle",
            });
          }
          break;
        }

        case "done": {
          if (msgId) {
            const isSuccess = event.success !== false;
            const stopReason = (event as unknown as Record<string, unknown>).stopReason as string | undefined;
            const summary = (event.summary as string) || "";
            const isGenericDone = !summary || summary === "Done" || summary === "Done!";
            const modelUsed = (event.modelUsed as string) || "";
            const fileInfo = event.fileCount ? `${event.fileCount} files` : "";
            const fileList = (event.fileList as string) || "";
            const detail = fileInfo ? (fileList ? `${fileInfo}\n${fileList}` : fileInfo) : (fileList || undefined);

            // If the session was interrupted (no explicit finish), close any still-
            // in-progress tool blocks so they don't display as pending forever.
            if (!isSuccess) {
              setMessages((prev) => {
                const msg = prev.find(m => m.id === msgId);
                if (!msg?.blocks) return prev;
                const blocks = msg.blocks.map((b) => {
                  if (b.kind === "tool" && b.status === "running") {
                    return { ...b, status: "error" as const, detail: "Session interrupted" };
                  }
                  return b;
                });
                return prev.map(m => m.id === msgId ? { ...m, blocks } : m);
              });
            }

            // Single atomic setMessages: append summary blocks + set final content/status
            // (avoids stale-ref race when reading blocks from messagesRef)
            setMessages((prev) => {
              const msg = prev.find(m => m.id === msgId);
              if (!msg) return prev;
              const blocks = msg.blocks ? [...msg.blocks] : [];
              const existingText = blocks.filter(b => b.kind === "text").map(b => b.kind === "text" ? b.text : "").join("\n");

              const toAppend: string[] = [];

              if (!isSuccess) {
                // Interrupted session: always show the stop reason prominently
                const notice = summary || `Session stopped${stopReason ? ` (${stopReason})` : ""}.`;
                if (!existingText.includes(notice.slice(0, 40))) {
                  toAppend.push(`⚠️ ${notice}`);
                }
              } else {
                if (!isGenericDone && summary && !existingText.includes(summary.slice(0, 50))) {
                  toAppend.push(summary);
                }
                if (detail && !existingText.includes(detail.slice(0, 20))) {
                  toAppend.push(detail);
                }
              }

              if (toAppend.length > 0) {
                const newText = toAppend.join("\n\n");
                if (blocks.length > 0) {
                  const last = blocks[blocks.length - 1];
                  if (last && last.kind === "text") {
                    blocks[blocks.length - 1] = { kind: "text", text: last.text + "\n\n" + newText };
                  } else {
                    blocks.push({ kind: "text", text: newText });
                  }
                } else {
                  blocks.push({ kind: "text", text: newText });
                }
              }

              // Compute final content from blocks
              let finalContent: string | undefined;
              if (!isSuccess) {
                finalContent = summary || `Session stopped${stopReason ? ` (${stopReason})` : ""}.`;
              } else if (isGenericDone) {
                const textBlocks = blocks.filter((b): b is { kind: "text"; text: string } => b.kind === "text");
                if (textBlocks.length > 0) {
                  finalContent = textBlocks[textBlocks.length - 1]!.text.slice(0, 300);
                }
              } else {
                finalContent = summary;
              }

              const startedAt = sessionStartedAtRef.current;
              const turnDurationMs =
                typeof event.durationMs === "number"
                  ? event.durationMs
                  : startedAt !== null
                    ? Math.max(0, Date.now() - startedAt)
                    : undefined;

              const updated = prev.map(m => m.id === msgId ? {
                ...m,
                blocks,
                ...(finalContent !== undefined ? { content: finalContent } : {}),
                detail,
                modelUsed: modelUsed || undefined,
                creditsUsed:
                  event.creditsUsed !== null && event.creditsUsed !== undefined
                    ? Number(event.creditsUsed)
                    : undefined,
                // Per-turn metrics — stamped onto THIS assistant message so the
                // bubble can show its own duration + token + tool counts even
                // after the user sends another prompt.
                inputTokens: typeof event.inputTokens === "number" ? event.inputTokens : undefined,
                outputTokens: typeof event.outputTokens === "number" ? event.outputTokens : undefined,
                toolUseCount: typeof event.toolUseCount === "number" ? event.toolUseCount : undefined,
                durationMs: turnDurationMs,
                status: (isSuccess ? "success" : "error") as "success" | "error",
              } : m);
              saveMessages(updated, storageKeyRef.current, messageLimitRef.current);
              return updated;
            });
          }
          // Capture final session metrics from the `done` event so the
          // header timer + token counter freeze on accurate values.
          if (typeof event.inputTokens === "number") setInputTokens(event.inputTokens);
          if (typeof event.outputTokens === "number") setOutputTokens(event.outputTokens);
          if (typeof event.toolUseCount === "number") setToolUseCount(event.toolUseCount);
          if (typeof event.durationMs === "number") {
            setSessionFinalDurationMs(event.durationMs);
          }
          // Session is finished — drop the active id so a subsequent Stop
          // click doesn't fire a no-op cancel against a session that's
          // already closed.
          activeSessionIdRef.current = null;
          // Backfill the cumulative credits display with the post-final-
          // iteration value. Without this the progress bar reads the
          // `iteration_start` snapshot from BEFORE the last LLM call, so
          // it lagged the per-message bubble (which carries the final).
          if (event.creditsUsed !== null && event.creditsUsed !== undefined) {
            const finalCredits = Number(event.creditsUsed);
            if (Number.isFinite(finalCredits)) setCreditsUsed(finalCredits);
          }
          setActiveWorker(null);
          break;
        }

        case "error": {
          if (msgId) {
            const parts: string[] = [];
            if (event.creditsUsed) parts.push(`Credits: ${Number(event.creditsUsed).toFixed(1)}/${creditBudgetRef.current}`);
            else if (creditsUsedRef.current > 0) parts.push(`Credits: ${creditsUsedRef.current.toFixed(1)}/${creditBudgetRef.current}`);
            const recentErrors = activityLogRef.current.filter((a) => a.status === "error").slice(-3);
            if (recentErrors.length > 0) parts.push(`Failed: ${recentErrors.map((e) => e.description).join(" → ")}`);
            const totalOps = activityLogRef.current.filter((a) => a.kind === "tool").length;
            if (totalOps > 0) parts.push(`${totalOps} operations total`);
            const startedAt = sessionStartedAtRef.current;
            const turnDurationMs =
              startedAt !== null ? Math.max(0, Date.now() - startedAt) : undefined;
            updateMessage(msgId, {
              content: event.message || "Something went wrong.",
              detail: parts.length > 0 ? parts.join(" · ") : undefined,
              status: "error",
              // Stamp whatever we have so far so the bubble can still display
              // a per-turn counter alongside the error notice.
              ...(event.creditsUsed !== null && event.creditsUsed !== undefined
                ? { creditsUsed: Number(event.creditsUsed) }
                : {}),
              durationMs: turnDurationMs,
            });
          }
          // Freeze the timer when the stream errors so the header stops
          // counting up — keep the running token / tool totals as-is.
          {
            const startedAt = sessionStartedAtRef.current;
            if (typeof startedAt === "number") {
              setSessionFinalDurationMs(Math.max(0, Date.now() - startedAt));
            }
          }
          activeSessionIdRef.current = null;
          setActiveWorker(null);
          break;
        }
      }

      // Notify the consumer for component-specific side-effects
      onWorkerEventRef.current?.(event, msgId);
    },
    [addMessage, updateMessage, suspendedStorageKey, handleModelChange],
  );

  // ── Stream control ──

  /** Start a new SSE stream with the given request */
  const executeStream = useCallback(
    async (request: Partial<WorkerStreamClientRequest> & { message: string }) => {
      const authToken = tokenRef.current || localStorage.getItem("token") || "";
      if (!authToken) return;

      // Auto-checkpoint before every AI turn (captures current message state).
      // Skip when no messages exist yet (first turn — nothing to restore to).
      try {
        const currentMsgs = messagesRef.current;
        if (currentMsgs.length > 0) {
          createCp(
            storageKeyRef.current,
            currentMsgs,
            fileActionsRef.current,
            request.message.slice(0, 60),
          );
        }
      } catch { /* non-critical */ }

      setIsStreaming(true);

      // Per-TURN counters (one prompt → one assistant turn). Reset every
      // time the user sends a new message so the live overlay shows just
      // this turn's metrics, not the whole chat. Mid-turn updates arrive
      // via `iteration_start`; finals via `done` (and are also stamped on
      // the assistant message itself for the per-bubble badge).
      setSessionStartedAt(Date.now());
      setSessionFinalDurationMs(null);
      setInputTokens(0);
      setOutputTokens(0);
      setToolUseCount(0);

      const msgId = addMessage({
        role: "assistant",
        content: "Thinking...",
        status: "thinking",
      });
      assistantMsgIdRef.current = msgId;

      try {
        const brain = await loadWorkerBrain();
        const cleanup = brain.streamWorker(
          {
            ...request,
            modelId: selectedModel !== "auto" ? selectedModel : undefined,
            creditBudgetOverride: request.creditBudgetOverride ?? getCreditBudget(),
          },
          authToken,
          handleWorkerEvent,
          () => {
            // SSE stream closed cleanly — finalize any in-flight message that never got a done event
            if (assistantMsgIdRef.current) {
              updateMessage(assistantMsgIdRef.current, { status: "success" });
            }
            assistantMsgIdRef.current = null;
            cleanupRef.current = null;
            setIsStreaming(false);
            setActiveWorker(null);
          },
          (errMsg) => {
            if (assistantMsgIdRef.current) {
              updateMessage(assistantMsgIdRef.current, {
                content: errMsg,
                status: "error",
              });
            }
            assistantMsgIdRef.current = null;
            cleanupRef.current = null;
            setIsStreaming(false);
            setActiveWorker(null);
          },
        );
        cleanupRef.current = cleanup;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        updateMessage(msgId, { content: `Error: ${msg}`, status: "error" });
        setIsStreaming(false);
      }
    },
    [addMessage, updateMessage, handleWorkerEvent, selectedModel],
  );

  /** Resume a suspended session by sending an answer */
  const submitAnswer = useCallback(
    async (answer: string, resumeSessionId: string, extraRequestFields?: Partial<WorkerStreamClientRequest>) => {
      // Capture the inFlight flag BEFORE clearing the pending state
      const isInFlight = askUserPendingRef.current?.inFlight === true;
      setAskUserPending(null);
      try { localStorage.removeItem(suspendedStorageKey); } catch { /* ignore */ }

      if (isInFlight) {
        // SSE stream is still open — post the answer directly (resolveUserAnswer)
        await fetch(apiUrl("/cursor/worker-answer"), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenRef.current || localStorage.getItem("token") || ""}`,
          },
          body: JSON.stringify({ sessionId: resumeSessionId, answer }),
        });
      } else {
        // Session was suspended to DB — resume via a new stream
        await executeStream({
          message: answer,
          resumeSessionId,
          ...extraRequestFields,
        });
      }
    },
    [executeStream, suspendedStorageKey],
  );

  /**
   * Cancel the active stream.
   *
   * Two-phase stop: (1) fire-and-forget POST to `/cursor/worker-cancel`
   * with the active sessionId so the server-side runner halts the agent
   * loop and stops billing — this is the part that actually saves money.
   * (2) Close the local SSE so the UI snaps out of the streaming state
   * immediately, even if the network call is slow.
   *
   * Closing the SSE alone (the old behaviour) only stops the client from
   * RECEIVING events; the runner kept executing tools and consuming
   * tokens because the route handler keeps the generator alive for
   * reconnect-on-disconnect support.
   */
  const cancelStream = useCallback(() => {
    // Phase 1: tell the server to stop. Best-effort — we don't await
    // because the SSE close should not depend on this request landing.
    const sessionId = activeSessionIdRef.current;
    const tk = tokenRef.current;
    if (sessionId) {
      void fetch(apiUrl("/cursor/worker-cancel"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
        },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {
        // Network failure on the cancel call is non-fatal — the SSE-close
        // path still removes the user-facing streaming state. The cancel
        // flag's TTL means a stuck server-side run will eventually time
        // out on its own credit budget anyway.
      });
    }

    // Phase 2: client-side cleanup — finalize the in-flight message so
    // the spinner stops, abort the SSE, drop the suspended-session
    // checkpoint.
    if (assistantMsgIdRef.current) {
      updateMessage(assistantMsgIdRef.current, { status: "success" });
    }
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsStreaming(false);
    setActiveWorker(null);
    setAskUserPending(null);
    assistantMsgIdRef.current = null;
    activeSessionIdRef.current = null;
    try { localStorage.removeItem(suspendedStorageKey); } catch { /* ignore */ }
  }, [suspendedStorageKey, updateMessage]);

  /** Send a mid-stream correction to a running session */
  const sendCorrection = useCallback(async (sessionId: string, correction: string) => {
    try {
      await fetch(apiUrl("/cursor/worker-correction"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ sessionId, correction }),
      });
    } catch { /* non-critical */ }
  }, []);

  // ── Retry / Edit ──

  /**
   * Retry from a specific assistant message — removes it and everything after,
   * then re-executes the preceding user message with the current model.
   * Returns the user message content that was retried, or null if invalid.
   */
  const retryFromMessage = useCallback(
    async (assistantMsgId: string, extraRequestFields?: Partial<WorkerStreamClientRequest>): Promise<string | null> => {
      if (isStreaming) return null;

      // Find the assistant message index
      const msgs = messages;
      const assistantIdx = msgs.findIndex((m) => m.id === assistantMsgId);
      if (assistantIdx < 0) return null;

      // Find the user message immediately before it
      let userMsg: CursorChatMessage | null = null;
      for (let i = assistantIdx - 1; i >= 0; i--) {
        if (msgs[i]?.role === "user") {
          userMsg = msgs[i]!;
          break;
        }
      }
      if (!userMsg) return null;

      // Snapshot the full conversation before discarding (for read-only history)
      saveSnapshot(storageKeyRef.current, msgs, "retry",
        `Retried response to: ${userMsg.content.slice(0, 50)}`);

      // Truncate: keep everything up to (but not including) the assistant message
      const truncated = msgs.slice(0, assistantIdx);
      setMessages(truncated);
      saveMessages(truncated, storageKeyRef.current, messageLimitRef.current);

      // Reset per-stream state
      setActivityLog([]);
      setCreditsUsed(0);
      setCurrentIteration(0);
      setActiveWorker(null);

      // Re-execute with the same user message and current model
      await executeStream({
        message: userMsg.content,
        ...extraRequestFields,
      });

      return userMsg.content;
    },
    [isStreaming, messages, executeStream],
  );

  /**
   * Edit a user message and re-send — truncates the conversation at that
   * message index, replaces its content, and starts a fresh stream.
   * Returns true if successful.
   */
  const editAndResend = useCallback(
    async (userMsgId: string, newContent: string, extraRequestFields?: Partial<WorkerStreamClientRequest>): Promise<boolean> => {
      if (isStreaming) return false;
      if (!newContent.trim()) return false;

      const msgs = messages;
      const msgIdx = msgs.findIndex((m) => m.id === userMsgId);
      if (msgIdx < 0) return false;
      if (msgs[msgIdx]?.role !== "user") return false;

      // Snapshot the full conversation before discarding (for read-only history)
      saveSnapshot(storageKeyRef.current, msgs, "edit",
        `Edited: "${msgs[msgIdx]!.content.slice(0, 40)}" → "${newContent.slice(0, 40)}"`);

      // Truncate: keep everything before this message, then add the edited message
      const before = msgs.slice(0, msgIdx);
      const editedMsg: CursorChatMessage = {
        ...msgs[msgIdx]!,
        content: newContent.trim(),
        timestamp: new Date(),
      };
      const truncated = [...before, editedMsg];
      setMessages(truncated);
      saveMessages(truncated, storageKeyRef.current, messageLimitRef.current);

      // Reset per-stream state
      setActivityLog([]);
      setCreditsUsed(0);
      setCurrentIteration(0);
      setActiveWorker(null);

      // Execute with the new content
      await executeStream({
        message: newContent.trim(),
        ...extraRequestFields,
      });

      return true;
    },
    [isStreaming, messages, executeStream],
  );

  /** Replay raw SSE events through the handler (used by Panel reconnect logic) */
  const replayEvents = useCallback((events: Array<Record<string, unknown>>, targetMsgId: string) => {
    assistantMsgIdRef.current = targetMsgId;
    for (const evt of events) {
      handleWorkerEvent(evt);
    }
    assistantMsgIdRef.current = null;
  }, [handleWorkerEvent]);

  // ── Checkpoint helpers ──

  /** Get all checkpoints for the current session */
  const checkpoints = getCheckpoints(storageKey);

  /**
   * Restore conversation to a checkpoint — truncates messages to that point.
   * Returns the checkpoint data (including files to revert) or null if invalid.
   * The caller (Panel/StudioBar) is responsible for reverting files via the API.
   */
  const restoreToCheckpoint = useCallback(
    (checkpointIndex: number): { checkpoint: Checkpoint; filesToRevert: FileActionSnapshot[] } | null => {
      if (isStreaming) return null;

      const data = getRestoreData(storageKeyRef.current, checkpointIndex);
      if (!data) return null;

      // Snapshot the full conversation before discarding (for read-only history)
      saveSnapshot(storageKeyRef.current, messages, "restore",
        `Restored to: ${data.checkpoint?.label ?? `checkpoint ${checkpointIndex}`}`);

      // Truncate messages to the checkpoint's message count
      const truncated = messages.slice(0, data.messageCount);
      setMessages(truncated);
      saveMessages(truncated, storageKeyRef.current, messageLimitRef.current);

      // Prune checkpoints after the restored one
      pruneAfterRestore(storageKeyRef.current, checkpointIndex);

      // Reset per-stream state
      setActivityLog([]);
      setCreditsUsed(0);
      setCurrentIteration(0);
      setActiveWorker(null);

      return { checkpoint: data.checkpoint, filesToRevert: data.filesToRevert };
    },
    [isStreaming, messages],
  );

  /** Track a file action (called by consumer components when they detect file writes) */
  const trackFileAction = useCallback((action: FileActionSnapshot) => {
    fileActionsRef.current = [...fileActionsRef.current, action];
    setFileActionCount(fileActionsRef.current.length);
  }, []);

  // Drive `elapsedMs` from a single effect so `Date.now()` stays out of
  // the render path. Three cases the effect resolves:
  //   1. session ended (`sessionFinalDurationMs !== null`) → write the
  //      frozen value once and stop ticking.
  //   2. no session yet → write `null` and stop ticking.
  //   3. live → seed immediately, then tick once per second until one of
  //      the above conditions takes over.
  // Using state (vs. deriving each render) keeps React Compiler's purity
  // checker happy without the timerTick + useMemo dance. The synchronous
  // initial setElapsedMs is intentional — without it the header timer
  // would read `null` for the first second of every streaming turn.
  useEffect(() => {
    if (sessionFinalDurationMs !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsedMs(sessionFinalDurationMs);
      return;
    }
    if (sessionStartedAt === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsedMs(null);
      return;
    }
    // Wall-clock-derived state: by definition cannot be computed from
    // props/state during render (Date.now() is impure), so the rule's
    // usual advice doesn't apply. Seed once synchronously so the header
    // doesn't read `null` for the first second of every streaming turn,
    // then tick once per second.
    const tick = () => {
      setElapsedMs(Math.max(0, Date.now() - sessionStartedAt));
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt, sessionFinalDurationMs]);

  return {
    messages,
    isStreaming,
    askUserPending,
    setAskUserPending,
    activityLog,
    creditsUsed,
    currentIteration,
    creditBudget,
    activeWorker,
    selectedModel,
    realModels,
    handleModelChange,
    repoUrl,
    setRepoUrl,
    showRepoInput,
    setShowRepoInput,
    showImportCode,
    setShowImportCode,
    sessionRepoUrl,
    setSessionRepoUrl,
    addMessage,
    updateMessage,
    clearMessages,
    executeStream,
    submitAnswer,
    cancelStream,
    sendCorrection,
    retryFromMessage,
    editAndResend,
    replayEvents,
    checkpoints,
    restoreToCheckpoint,
    trackFileAction,
    resolveConfirmBlock,
    resolveAskBlock,
    updateBuildSpecBlock,
    conversationSnapshots: getSnapshots(storageKey),
    fileActionCount,
    inputTokens,
    outputTokens,
    toolUseCount,
    sessionStartedAt,
    elapsedMs,
  };
}
