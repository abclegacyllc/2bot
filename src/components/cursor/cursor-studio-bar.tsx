"use client";

/**
 * CursorStudioBar — Bottom bar AI interface for the 2Bot Studio.
 *
 * Replaces the old AICopilotBar with Cursor's multi-worker backend.
 * Renders as a floating island at the bottom of the studio with:
 *   - **Agent**: Autonomous workflow builder — uses tools to modify steps
 *   - **Ask**: Ask questions, get detailed answers (no tool execution)
 *   - **Plan**: Get a step-by-step plan without executing changes
 *   - **Model selector**: Choose AI model inline
 *   - **Context-aware chips**: Tab/state-specific quick actions
 *   - **Auto-hide + proximity reveal**: Slides away when idle, back on hover
 *   - **Animated glow**: Floating island with breathing gradient border
 *
 * @module components/cursor/cursor-studio-bar
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { WorkflowListItem } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/shared/config/urls";

import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  MessageCircleQuestion,
  Send,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react";

import { ModelSelector, type RealModelOption } from "@/components/shared/model-selector";
import type { CursorAgentEvent } from "@/modules/cursor/cursor-agent.types";
import { describeAgentEvent } from "./agent-event-mapper";
import type { WorkflowContext } from "./cursor-brain";

// =============================================================================
// Types
// =============================================================================

type StudioMode = "agent" | "ask" | "plan";

interface StudioMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: "thinking" | "working" | "success" | "error";
  timestamp: number;
}

interface QuickChip {
  label: string;
  prompt: string;
  icon?: "wand" | "sparkles";
}

export interface CursorStudioBarProps {
  /** Auth token for API requests */
  token: string | null;
  /** Current user's ID — used to scope storage per account */
  userId?: string;
  /** Organization ID for org-context credit usage */
  organizationId?: string;
  /** Current workflow for context */
  workflow: WorkflowListItem | null;
  /** Gateway/bot name for prompt context */
  botName?: string;
  /** Callback to refresh workflow data after mutations */
  fetchWorkflow?: () => void;
  /** Current active tab in BotStudioView (for context-aware chips) */
  activeTab?: string;
}

// =============================================================================
// Constants
// =============================================================================

function sessionKey(userId?: string) { return userId ? `cursor-studio-messages-${userId}` : "cursor-studio-messages"; }
function modelKey(userId?: string) { return userId ? `cursor-model-preference-${userId}` : "cursor-model-preference"; }
const IDLE_TIMEOUT_MS = 12_000;
const PROXIMITY_ZONE_PX = 90;

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Lazy-load the cursor-brain SSE client */
async function loadWorkerBrain() {
  const mod = await import("./cursor-brain");
  return { streamWorker: mod.streamWorker, sendWorkerAnswer: mod.sendWorkerAnswer };
}

/** Persist messages to sessionStorage (scoped by userId) */
function saveMessages(msgs: StudioMessage[], userId?: string) {
  try {
    // Keep last 50 messages to avoid bloating storage
    const trimmed = msgs.slice(-50);
    sessionStorage.setItem(sessionKey(userId), JSON.stringify(trimmed));
  } catch { /* quota exceeded — ignore */ }
}

/** Restore messages from sessionStorage (scoped by userId) */
function loadMessages(userId?: string): StudioMessage[] {
  try {
    const raw = sessionStorage.getItem(sessionKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudioMessage[];
    // Filter out in-progress messages from previous sessions
    return parsed.filter((m) => m.status !== "thinking" && m.status !== "working");
  } catch {
    return [];
  }
}

// =============================================================================
// Context-aware Chips
// =============================================================================

function getQuickChips(
  workflow: WorkflowListItem | null,
  activeTab?: string,
): QuickChip[] {
  // Home page — no workflow, no bot
  if (!workflow) {
    return [
      { label: "Create a new bot", prompt: "Help me create a new bot", icon: "sparkles" },
      { label: "Build from GitHub repo", prompt: "Analyze a GitHub repo and create a plugin from it", icon: "sparkles" },
      { label: "What can I build?", prompt: "What kinds of bots and workflows can I build with 2Bot?", icon: "sparkles" },
    ];
  }

  // Tab-specific chips
  switch (activeTab) {
    case "plugins":
      return [
        { label: "Install a plugin", prompt: "Help me find and install a plugin for my workflow" },
        { label: "Configure plugin", prompt: "Help me configure the plugins in my workflow" },
        { label: "Suggest plugins", prompt: "What plugins would improve this workflow?" },
      ];
    case "analytics":
      return [
        { label: "View recent runs", prompt: "Show me a summary of recent workflow runs" },
        { label: "Debug errors", prompt: "Help me debug recent workflow errors" },
        { label: "Optimize performance", prompt: "How can I optimize this workflow's performance?" },
      ];
    case "settings":
      return [
        { label: "Edit bot name", prompt: "Help me update this bot's name and settings" },
        { label: "Configure trigger", prompt: "Help me change when this workflow triggers" },
        { label: "Manage permissions", prompt: "Help me configure permissions for this bot" },
      ];
    case "overview":
      return [
        { label: "Summarize bot", prompt: "Give me a summary of what this bot does" },
        { label: "Suggest improvements", prompt: "What improvements would you suggest for this bot?" },
        { label: "Add a workflow", prompt: "Help me add a new workflow to this bot" },
      ];
    default: // "workflow" tab or unset
      break;
  }

  // Workflow tab — state-aware
  const hasSteps = workflow.steps && workflow.steps.length > 0;
  if (!hasSteps) {
    return [
      { label: "Add first step", prompt: "Add the first step to my empty workflow", icon: "sparkles" },
      { label: "Design workflow", prompt: "Help me design a workflow for this bot from scratch" },
      { label: "Use a template", prompt: "Suggest a workflow template that fits my bot type" },
    ];
  }

  // Default workflow chips
  return [
    { label: "Add a step", prompt: "Add a new step to my workflow" },
    { label: "Test workflow", prompt: "Run a test of this workflow" },
    { label: "Edit trigger", prompt: "Help me change the trigger for this workflow" },
  ];
}

// =============================================================================
// Component
// =============================================================================

export function CursorStudioBar({
  token,
  userId,
  organizationId: _organizationId,
  workflow,
  botName,
  fetchWorkflow,
  activeTab,
}: CursorStudioBarProps) {
  // ---- State ----
  const hasBuildCapability = workflow !== null;
  const [modePreference, setModePreference] = useState<StudioMode>("agent");
  // Auto-fallback to ask when agent/plan is unavailable (no workflow)
  const mode: StudioMode = hasBuildCapability ? modePreference : "ask";
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [prevUserId, setPrevUserId] = useState(userId);
  const [messages, setMessages] = useState<StudioMessage[]>(() => loadMessages(userId));
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeWorkerName, setActiveWorkerName] = useState<string | null>(null);

  // ask_user state — when the AI asks the user a question mid-stream
  const [askUserPending, setAskUserPending] = useState<{
    sessionId: string;
    sensitive: boolean;
    options?: Array<{ label: string; value: string }>;
    question: string;
    freetextActive?: boolean;
  } | null>(null);

  // Model selector state
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try { return localStorage.getItem(modelKey(userId)) ?? "auto"; } catch { return "auto"; }
  });
  const [realModels, setRealModels] = useState<RealModelOption[]>([]);

  // Reset messages & model when account switches (React-recommended derived-state pattern)
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    setMessages(loadMessages(userId));
    try { setSelectedModel(localStorage.getItem(modelKey(userId)) ?? "auto"); } catch { /* ignore */ }
  }

  // Auto-hide / proximity state
  const [isHidden, setIsHidden] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // ---- Refs ----
  const cleanupRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const assistantMsgIdRef = useRef<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<StudioMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ---- Derived ----
  const chips = useMemo(() => getQuickChips(workflow, activeTab), [workflow, activeTab]);

  // ---- Persist messages to sessionStorage ----
  useEffect(() => {
    saveMessages(messages, userId);
  }, [messages, userId]);

  // ---- Restore suspended session from localStorage ----
  // Use a ref to track if we restored so the effect only triggers side-effects (expand)
  const restoredSuspendedRef = useRef(false);
  useEffect(() => {
    if (restoredSuspendedRef.current) return;
    try {
      const raw = localStorage.getItem(`cursor-suspended-${userId}`);
      if (raw) {
        const pending = JSON.parse(raw) as {
          sessionId: string;
          sensitive: boolean;
          options?: Array<{ label: string; value: string }>;
          question: string;
        };
        if (pending.sessionId && pending.question) {
          restoredSuspendedRef.current = true;
          // Schedule state updates for next tick to avoid sync setState in effect
          queueMicrotask(() => {
            setAskUserPending(pending);
            setExpanded(true);
          });
        }
      }
    } catch { /* ignore */ }
  }, [userId]);

  // ---- Fetch real models for selector ----
  useEffect(() => {
    const controller = new AbortController();
    const authToken = token ?? localStorage.getItem("token") ?? "";
    const headers: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    fetch(apiUrl("/2bot-ai/real-models?capability=text-generation"), {
      credentials: "include",
      headers,
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.models) {
          // Only show models that support function calling (agent requires tools)
          setRealModels(data.data.models.filter((m: { functionCalling?: boolean }) => m.functionCalling !== false));
        }
      })
      .catch(() => { /* aborted or network error — ignore */ });
    return () => controller.abort();
  }, [token]);

  // ---- Auto-scroll chat (only if user is near bottom) ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // ---- Idle auto-hide ----
  useEffect(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (isStreaming || expanded || input.trim()) return;
    idleTimerRef.current = setTimeout(() => {
      setIsHidden(true);
    }, IDLE_TIMEOUT_MS);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isStreaming, expanded, input]);

  // ---- Mouse proximity detection for reveal (throttled) ----
  useEffect(() => {
    if (!isHidden) return;

    let lastCall = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastCall < 100) return; // throttle to max 10 calls/sec
      lastCall = now;
      const distFromBottom = window.innerHeight - e.clientY;
      if (distFromBottom <= PROXIMITY_ZONE_PX) {
        setIsHidden(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isHidden]);

  // ---- Reveal on any interaction ----
  const revealBar = useCallback(() => {
    setIsHidden(false);
  }, []);

  // ---- Model change handler ----
  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    try { localStorage.setItem(modelKey(userId), modelId); } catch { /* ignore */ }
  }, [userId]);

  // ---- Build workflow context for the backend (memoized sorted steps) ----
  const sortedSteps = useMemo(() => {
    if (!workflow?.steps) return [];
    return [...workflow.steps]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        order: s.order,
        name: s.name || s.pluginSlug || `Step ${s.order + 1}`,
        pluginSlug: s.pluginSlug || "unknown",
        isEnabled: s.isEnabled !== false,
        entryFile: s.entryFile || undefined,
      }));
  }, [workflow]);

  const buildWorkflowContext = useCallback((): WorkflowContext | undefined => {
    if (!workflow) return undefined;
    return {
      workflowId: workflow.id,
      workflowName: workflow.name || "Untitled",
      triggerType: workflow.triggerType,
      botName: botName,
      steps: sortedSteps,
    };
  }, [workflow, botName, sortedSteps]);

  // ---- Message helpers ----
  const addMessage = useCallback(
    (msg: Omit<StudioMessage, "id" | "timestamp">): string => {
      const id = generateId();
      setMessages((prev) => [...prev, { ...msg, id, timestamp: Date.now() }]);
      return id;
    },
    [],
  );

  const updateMessage = useCallback(
    (id: string, patch: Partial<StudioMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  // ---- Handle worker SSE events ----
  const handleWorkerEvent = useCallback(
    (event: Record<string, unknown>) => {
      const ev = event as unknown as CursorAgentEvent;
      const msgId = assistantMsgIdRef.current;

      switch (ev.type) {
        case "worker_start":
          setActiveWorkerName(ev.displayName ?? ev.worker ?? null);
          if (msgId) {
            updateMessage(msgId, {
              content: `${ev.displayName || "AI"} is working...`,
              status: "working",
            });
          }
          break;

        case "worker_switch":
          setActiveWorkerName(ev.toDisplayName ?? null);
          addMessage({ role: "system", content: `Passing to ${ev.toDisplayName}...` });
          break;

        case "ask_user":
          // AI is asking the user a question — show it and enable reply
          addMessage({ role: "assistant", content: ev.question, status: "success" });
          setAskUserPending({
            sessionId: ev.sessionId,
            sensitive: ev.sensitive ?? false,
            options: ev.options,
            question: ev.question,
          });
          break;

        case "suspended":
          // AI asked a question and the stream closed (state saved to DB).
          // Save the pending question to localStorage so it survives page refresh.
          addMessage({ role: "assistant", content: ev.question, status: "success" });
          {
            const pending = {
              sessionId: ev.sessionId,
              sensitive: ev.sensitive ?? false,
              options: ev.options,
              question: ev.question,
            };
            setAskUserPending(pending);
            try {
              localStorage.setItem(
                `cursor-suspended-${userId}`,
                JSON.stringify(pending),
              );
            } catch { /* ignore */ }
          }
          break;

        case "thinking":
          if (msgId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      content:
                        m.status === "thinking" || m.status === "working"
                          ? ev.text || ""
                          : m.content + (ev.text || ""),
                      status: "working",
                    }
                  : m,
              ),
            );
          }
          break;

        case "tool_start":
        case "tool_result":
        case "status":
        case "iteration_start":
        case "code_preview": {
          const desc = describeAgentEvent(ev);
          if (desc && msgId) {
            updateMessage(msgId, { content: desc, status: "working" });
          }
          // Refresh workflow canvas after mutation tools complete
          if (ev.type === "tool_result" && ev.success) {
            const MUTATION_TOOLS = new Set([
              "add_workflow_step",
              "remove_workflow_step",
              "update_workflow_step",
              "reorder_workflow_step",
              "toggle_workflow_step",
              "update_workflow_trigger",
            ]);
            if (MUTATION_TOOLS.has(ev.tool)) {
              fetchWorkflow?.();
            }
          }
          break;
        }

        case "done":
          if (msgId) {
            const summary = (ev.summary as string) || "";
            const isGenericDone = !summary || summary === "Done" || summary === "Done!";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      content: isGenericDone ? (m.content || "Done!") : summary,
                      status: "success" as const,
                    }
                  : m,
              ),
            );
          }
          setActiveWorkerName(null);
          break;

        case "error":
          if (msgId) {
            updateMessage(msgId, {
              content: (ev.message as string) || "Something went wrong.",
              status: "error",
            });
          }
          setActiveWorkerName(null);
          break;
      }
    },
    [addMessage, updateMessage, fetchWorkflow, userId],
  );

  // ---- Select an ask_user option (multi-choice) ----
  const handleOptionSelect = useCallback(async (option: { label: string; value: string }) => {
    if (!askUserPending || !token) return;

    // Free-text option — switch to text input mode
    if (option.value === "__freetext__") {
      setAskUserPending((prev) => prev ? { ...prev, freetextActive: true } : null);
      return;
    }

    // Send the selected option value — resume the suspended session
    addMessage({ role: "user", content: option.label });
    const savedSessionId = askUserPending.sessionId;
    setAskUserPending(null);
    try { localStorage.removeItem(`cursor-suspended-${userId}`); } catch { /* ignore */ }

    // Resume via a new stream with resumeSessionId
    setIsStreaming(true);
    setExpanded(true);
    const msgId = addMessage({
      role: "assistant",
      content: "Resuming...",
      status: "thinking",
    });
    assistantMsgIdRef.current = msgId;

    try {
      const brain = await loadWorkerBrain();
      const cleanup = brain.streamWorker(
        {
          message: option.value,
          resumeSessionId: savedSessionId,
          modelId: selectedModel !== "auto" ? selectedModel : undefined,
          studioMode: modeRef.current,
        },
        token,
        handleWorkerEvent,
        () => {
          assistantMsgIdRef.current = null;
          cleanupRef.current = null;
          setIsStreaming(false);
          setActiveWorkerName(null);
        },
        (errMsg) => {
          setError(errMsg);
          if (assistantMsgIdRef.current) {
            updateMessage(assistantMsgIdRef.current, {
              content: errMsg,
              status: "error",
            });
          }
          assistantMsgIdRef.current = null;
          cleanupRef.current = null;
          setIsStreaming(false);
          setActiveWorkerName(null);
        },
      );
      cleanupRef.current = cleanup;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      updateMessage(msgId, { content: `Error: ${msg}`, status: "error" });
      setIsStreaming(false);
    }
  }, [askUserPending, token, addMessage, selectedModel, handleWorkerEvent, updateMessage, userId]);

  // ---- Send message (or answer an ask_user question) ----
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!token) {
      setError("Not authenticated");
      return;
    }

    // If the AI asked a question, resume the session with the answer
    if (askUserPending) {
      setInput("");
      addMessage({ role: "user", content: askUserPending.sensitive ? "••••••" : trimmed });
      const savedSessionId = askUserPending.sessionId;
      setAskUserPending(null);
      try { localStorage.removeItem(`cursor-suspended-${userId}`); } catch { /* ignore */ }

      // Resume via a new stream with resumeSessionId
      setIsStreaming(true);
      setExpanded(true);
      const msgId = addMessage({
        role: "assistant",
        content: "Resuming...",
        status: "thinking",
      });
      assistantMsgIdRef.current = msgId;

      try {
        const brain = await loadWorkerBrain();
        const cleanup = brain.streamWorker(
          {
            message: trimmed,
            resumeSessionId: savedSessionId,
            modelId: selectedModel !== "auto" ? selectedModel : undefined,
            studioMode: modeRef.current,
          },
          token,
          handleWorkerEvent,
          () => {
            assistantMsgIdRef.current = null;
            cleanupRef.current = null;
            setIsStreaming(false);
            setActiveWorkerName(null);
          },
          (errMsg) => {
            setError(errMsg);
            if (assistantMsgIdRef.current) {
              updateMessage(assistantMsgIdRef.current, {
                content: errMsg,
                status: "error",
              });
            }
            assistantMsgIdRef.current = null;
            cleanupRef.current = null;
            setIsStreaming(false);
            setActiveWorkerName(null);
          },
        );
        cleanupRef.current = cleanup;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        updateMessage(msgId, { content: `Error: ${msg}`, status: "error" });
        setIsStreaming(false);
      }
      return;
    }

    if (isStreaming) return;

    setInput("");
    setExpanded(true);
    setIsStreaming(true);
    setError(null);
    revealBar();

    // Add user message + assistant placeholder
    addMessage({ role: "user", content: trimmed });
    const msgId = addMessage({
      role: "assistant",
      content: "Thinking...",
      status: "thinking",
    });
    assistantMsgIdRef.current = msgId;

    try {
      const brain = await loadWorkerBrain();

      // Detect GitHub/GitLab HTTPS repo URLs in the message → trigger repo analysis
      const repoMatch = trimmed.match(/https:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+(?:\.git)?/i);
      const repoUrl = repoMatch?.[0];

      const cleanup = brain.streamWorker(
        {
          message: trimmed,
          workflowContext: buildWorkflowContext() || undefined,
          modelId: selectedModel !== "auto" ? selectedModel : undefined,
          // Repo analysis always runs as Agent (needs write tools) regardless of current mode
          studioMode: repoUrl ? "agent" : modeRef.current,
          ...(repoUrl ? { repoUrl, mode: "analyze-repo" as const } : {}),
        },
        token,
        handleWorkerEvent,
        () => {
          // onDone
          assistantMsgIdRef.current = null;
          cleanupRef.current = null;
          setIsStreaming(false);
          setActiveWorkerName(null);
        },
        (errMsg) => {
          // onError
          setError(errMsg);
          if (assistantMsgIdRef.current) {
            updateMessage(assistantMsgIdRef.current, {
              content: errMsg,
              status: "error",
            });
          }
          assistantMsgIdRef.current = null;
          cleanupRef.current = null;
          setIsStreaming(false);
          setActiveWorkerName(null);
        },
      );

      cleanupRef.current = cleanup;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      updateMessage(msgId, { content: `Error: ${msg}`, status: "error" });
      setIsStreaming(false);
    }
  }, [input, isStreaming, token, selectedModel, askUserPending, addMessage, updateMessage, handleWorkerEvent, buildWorkflowContext, revealBar, userId]);

  // ---- Stop streaming ----
  const handleStop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsStreaming(false);
    setActiveWorkerName(null);
    setAskUserPending(null);
    try { localStorage.removeItem(`cursor-suspended-${userId}`); } catch { /* ignore */ }
  }, [userId]);

  // ---- Clear chat ----
  const handleClear = useCallback(() => {
    handleStop();
    setMessages([]);
    setError(null);
    try { sessionStorage.removeItem(sessionKey(userId)); } catch { /* ignore */ }
    try { localStorage.removeItem(`cursor-suspended-${userId}`); } catch { /* ignore */ }
  }, [handleStop, userId]);

  // ---- Keyboard ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  // ---- Placeholder text ----
  const placeholder = askUserPending
    ? askUserPending.sensitive
      ? "Type your answer (sensitive)..."
      : "Type your answer..."
    : mode === "agent"
      ? "Describe what you want to build..."
      : mode === "plan"
        ? "Describe what changes you want planned..."
        : "Ask anything about your bot or workflow...";

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div
      ref={barRef}
      className={cn(
        "mx-auto z-20 w-[calc(100%-2rem)] max-w-2xl py-2",
        "studio-bar-wrapper",
        isHidden && "studio-bar-slide-down pointer-events-none opacity-0",
      )}
      style={{
        transition: "opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        ...(isHidden ? { transform: "translateY(100%)" } : { transform: "translateY(0)" }),
      }}
      onMouseEnter={() => { setIsHovering(true); revealBar(); }}
      onMouseLeave={() => { setIsHovering(false); }}
    >
      {/* Expanded chat panel */}
      {expanded && messages.length > 0 ? (
        <div className="mb-2 rounded-xl border border-border/60 bg-background/95 backdrop-blur-md shadow-lg overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              Cursor
              {activeWorkerName ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {activeWorkerName}
                </span>
              ) : null}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {mode}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
                title="Clear chat"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded(false)}
                title="Collapse"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="max-h-64 overflow-y-auto px-3 py-2 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "text-sm leading-relaxed",
                  msg.role === "user" && "text-foreground",
                  msg.role === "assistant" && "text-muted-foreground",
                  msg.role === "system" && "text-muted-foreground/70 italic text-xs",
                )}
              >
                {msg.role === "user" ? (
                  <div className="flex gap-2">
                    <span className="shrink-0 text-[10px] font-semibold text-primary uppercase tracking-wider mt-0.5">
                      You
                    </span>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ) : msg.role === "system" ? (
                  <p>{msg.content}</p>
                ) : (
                  <div className="flex gap-2">
                    <span className="shrink-0 text-[10px] font-semibold text-accent-foreground/70 uppercase tracking-wider mt-0.5">
                      AI
                    </span>
                    <div className="whitespace-pre-wrap min-h-[1.25rem]">
                      {msg.content || (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      {msg.status === "thinking" && (
                        <Loader2 className="inline h-3 w-3 animate-spin ml-1 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Collapsed: show expand toggle if there are messages */}
      {!expanded && messages.length > 0 ? (
        <div className="mb-1 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-muted-foreground gap-1 hover:text-foreground"
            onClick={() => setExpanded(true)}
          >
            <ChevronUp className="h-3 w-3" />
            Show AI chat ({messages.filter((m) => m.role !== "system").length} messages)
          </Button>
        </div>
      ) : null}

      {/* Ask-user floating dialog — rendered ABOVE the input bar */}
      {askUserPending && askUserPending.options?.length && !askUserPending.sensitive ? (
        <div className="mb-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="rounded-xl border border-border/60 bg-background/95 backdrop-blur-md shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-sm font-medium text-foreground leading-snug pr-4">
                {askUserPending.question}
              </p>
              <button
                onClick={() => {
                  void loadWorkerBrain().then((b) => b.sendWorkerAnswer(askUserPending.sessionId, "", token ?? ""));
                  setAskUserPending(null);
                }}
                className="shrink-0 rounded-md p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Options */}
            <div className="px-3 pb-3 flex flex-col gap-1">
              {askUserPending.options
                .filter((opt) => opt.value !== "__freetext__")
                .map((opt, i) => (
                <button
                  key={`${opt.value}-${i}`}
                  onClick={() => void handleOptionSelect(opt)}
                  className={cn(
                    "group flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-left text-sm transition-all duration-150",
                    "hover:bg-primary/10 hover:text-primary",
                    "text-foreground/90",
                  )}
                >
                  <span className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                    "bg-accent/70 text-accent-foreground/70 group-hover:bg-primary/20 group-hover:text-primary",
                  )}>
                    {i + 1}
                  </span>
                  <span className="font-medium">{opt.label}</span>
                </button>
              ))}
              {/* Free-text hint */}
              <div className="mt-1 px-3 text-[10px] text-muted-foreground/60">
                Or type your own answer below · <span className="text-muted-foreground/40">Esc to dismiss</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Input bar — floating island */}
      <div
        className={cn(
          "studio-bar-island relative rounded-xl border bg-background/90 backdrop-blur-md shadow-lg",
          "border-transparent",
          isStreaming && "is-streaming",
          isHovering && "is-hovering",
        )}
      >
        {/* Animated gradient border */}
        <div
          className="studio-bar-gradient-border absolute inset-0 rounded-xl p-[1px] -z-10"
          style={{
            background: "linear-gradient(90deg, var(--glow-accent), var(--glow-primary), var(--glow-accent), var(--glow-primary))",
            backgroundSize: "200% 200%",
          }}
        >
          <div className="h-full w-full rounded-[11px] bg-background" />
        </div>

        {/* Breathing glow layer */}
        <div
          className="studio-bar-glow-layer absolute inset-0 rounded-xl -z-20"
          style={{
            background: "linear-gradient(90deg, var(--glow-accent), var(--glow-primary), var(--glow-accent))",
            backgroundSize: "200% 200%",
          }}
        />

        {/* Shimmer sweep overlay */}
        <div className="studio-bar-shimmer absolute inset-0 rounded-xl -z-5 pointer-events-none" />

        <div className="flex items-center gap-2 px-3 py-2">
          {/* Mode selector dropdown */}
          <div className="relative shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-[11px] gap-1 font-medium transition-all duration-200",
                "text-primary hover:text-primary hover:bg-primary/10",
              )}
              onClick={() => setModeDropdownOpen((prev) => !prev)}
              disabled={isStreaming}
              title="Select mode"
            >
              {mode === "agent" && <><Wand2 className="h-3 w-3" />Agent</>}
              {mode === "ask" && <><MessageCircleQuestion className="h-3 w-3" />Ask</>}
              {mode === "plan" && <><ClipboardList className="h-3 w-3" />Plan</>}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>

            {modeDropdownOpen ? (
              <>
                {/* Backdrop click-away */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setModeDropdownOpen(false)}
                />
                <div className="absolute bottom-full left-0 mb-1 z-50 w-44 rounded-lg border bg-popover/95 backdrop-blur-md p-1 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150">
                  {([
                    { value: "agent" as const, label: "Agent", icon: Wand2, desc: "Autonomous builder", needsWorkflow: true },
                    { value: "ask" as const, label: "Ask", icon: MessageCircleQuestion, desc: "Ask questions", needsWorkflow: false },
                    { value: "plan" as const, label: "Plan", icon: ClipboardList, desc: "Plan changes", needsWorkflow: true },
                  ] as const).map((opt) => {
                    const disabled = opt.needsWorkflow && !hasBuildCapability;
                    return (
                      <button
                        key={opt.value}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                          disabled
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : mode === opt.value
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/50 text-foreground",
                        )}
                        onClick={() => {
                          if (!disabled) {
                            setModePreference(opt.value);
                            setModeDropdownOpen(false);
                          }
                        }}
                        disabled={disabled}
                        title={disabled ? "Select a bot to use this mode" : opt.desc}
                      >
                        <opt.icon className="h-3.5 w-3.5 shrink-0" />
                        <div className="flex flex-col">
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>

          {/* Model selector — compact */}
          {realModels.length > 0 ? (
            <div className="shrink-0">
              <ModelSelector
                models={[]}
                value={selectedModel}
                onChange={handleModelChange}
                disabled={isStreaming}
                compact
                showAutoMode
                realModels={realModels}
              />
            </div>
          ) : null}

          {/* Input */}
          <div className="flex-1 min-w-0">
            {askUserPending ? (
              /* ── Free-text reply input (always show the text input when ask_user is active) ── */
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-[10px] font-medium text-amber-500 uppercase tracking-wide">Reply</span>
                <input
                  ref={inputRef as unknown as React.RefObject<HTMLInputElement>}
                  type={askUserPending.sensitive ? "password" : "text"}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); revealBar(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void handleSend(); }
                    if (e.key === "Escape") {
                      // Cancel — send empty answer to unblock the stream
                      void loadWorkerBrain().then((b) => b.sendWorkerAnswer(askUserPending.sessionId, "", token ?? ""));
                      setAskUserPending(null);
                    }
                  }}
                  onFocus={revealBar}
                  placeholder={askUserPending.options?.length ? "Or type your own answer..." : "Type your answer..."}
                  autoFocus
                  className={cn(
                    "w-full bg-transparent text-sm text-foreground",
                    "placeholder:text-muted-foreground/50",
                    "focus:outline-none",
                  )}
                />
              </div>
            ) : (
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); revealBar(); }}
                onKeyDown={handleKeyDown}
                onFocus={revealBar}
                placeholder={placeholder}
                rows={1}
                disabled={isStreaming && !askUserPending ? true : false}
                className={cn(
                  "w-full resize-none bg-transparent text-sm text-foreground",
                  "placeholder:text-muted-foreground/50",
                  "focus:outline-none",
                  "disabled:opacity-50",
                )}
                style={{ minHeight: "1.5rem", maxHeight: "4rem" }}
              />
            )}
          </div>

          {/* Send / Stop */}
          {isStreaming && !askUserPending ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
              onClick={handleStop}
              title="Stop"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0 shrink-0 transition-all duration-200",
                input.trim()
                  ? "text-primary hover:text-primary hover:scale-110"
                  : "text-muted-foreground",
              )}
              onClick={() => void handleSend()}
              disabled={!input.trim() || !token}
              title="Send"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Context-aware quick action chips */}
      {messages.length === 0 && !isStreaming ? (
        <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={cn(
                "studio-chip inline-flex items-center gap-1 rounded-full border border-border/60",
                "bg-background/80 px-2.5 py-1 text-[10px] font-medium text-muted-foreground",
                "hover:text-foreground hover:border-primary/40 hover:bg-muted/50",
                "hover:scale-105 active:scale-95",
                "transition-all duration-200 backdrop-blur-sm",
              )}
              onClick={() => {
                setInput(chip.prompt);
                revealBar();
                inputRef.current?.focus();
              }}
            >
              {chip.icon === "sparkles" ? (
                <Sparkles className="h-2.5 w-2.5" />
              ) : (
                <Wand2 className="h-2.5 w-2.5" />
              )}
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
