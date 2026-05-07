"use client";

/**
 * CursorStudioBar — Bottom bar AI interface for the 2Bot Studio.
 *
 * AI Studio bar — powered by 2Bot's multi-worker agent backend.
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

import { useStudioSafe } from "@/app/studio/layout";
import { Button } from "@/components/ui/button";
import type { WorkflowListItem } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Code,
    Database,
    Eraser,
    Github,
    GripHorizontal,
    GripVertical,
    History,
    ImageOff,
    ImagePlus,
    Loader2,
    MessageCircleQuestion,
    Plus,
    RotateCcw,
    Send,
    Sparkles,
    Square,
    Trash2,
    Wand2,
    X,
} from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { AUTO_MODE_VALUE, ModelSelector } from "@/components/shared/model-selector";
import type { CursorAgentEvent } from "@/modules/cursor/cursor-agent.types";
import { apiUrl } from "@/shared/config/urls";
import { describeAgentEvent } from "./agent-event-mapper";
import type { WorkflowContext } from "./cursor-brain";
import { formatRepoUrl, isValidRepoUrl } from "./cursor-helpers";
import {
    addEvent as addSessionEvent,
    completeSession as completeSessionRecord,
    createSession as createSessionRecord,
    deleteSession as deleteSessionRecord,
    getSession as getSessionRecord,
    getSessions,
} from "./cursor-session-store";
import { CursorSettings } from "./cursor-settings";
import { EditableUserMessage, MarkdownContent, MessageBlocks } from "./cursor-shared-blocks";
import { isSoundEnabled, setSoundEnabled, setSoundProfile } from "./cursor-sounds";
import {
    getCursorThemeVars,
    loadThemePreference,
    resolveTheme,
    type CursorThemeConfig,
} from "./cursor-theme";
import { useCursorStream } from "./hooks/use-cursor-stream";
import { useStudioBarData, useStudioBarDataRef, useStudioBarPendingPrompt } from "./studio-bar-context";
import { filterToolSuggestions, type ToolSuggestion } from "./tool-mention-suggestions";

// =============================================================================
// Types
// =============================================================================

type StudioMode = "agent" | "ask" | "plan" | "build";
type BarPosition = "bottom" | "right" | "left";

/**
 * Lightweight agent metadata returned by `GET /api/cursor/agents`.
 * Mirrors `AgentSummary` from `src/modules/cursor/agents/types.ts` —
 * duplicated here so the frontend bundle does not pull in server-only code.
 */
interface AgentDropdownEntry {
  name: string;
  displayName: string;
  description: string;
  userInvocable: boolean;
  source: "builtin" | "user" | "org" | "marketplace";
  toolCount: number;
}

interface QuickChip {
  label: string;
  prompt: string;
  icon?: "wand" | "sparkles";
}

// Props are no longer needed — the bar reads auth from useAuth()
// and page-specific data from useStudioBarData() context.

// =============================================================================
// Constants
// =============================================================================

const IDLE_TIMEOUT_MS = 12_000;
const PROXIMITY_ZONE_PX = 90;
const STUDIO_ACTIVE_SESSION_KEY = "cursor-studio-active-session";
const RECONNECT_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_CHAT_HEIGHT = 256; // px for bottom mode
const MIN_CHAT_HEIGHT = 120;
const MAX_CHAT_HEIGHT = 600;
const DEFAULT_SIDE_WIDTH = 360; // px for left/right mode
const MIN_SIDE_WIDTH = 280;
const MAX_SIDE_WIDTH = 600;
const TOPBAR_HEIGHT = 48; // StudioTopBar h-12
const SIDEBAR_EXPANDED = 240; // BotSidebar w-60
const SIDEBAR_COLLAPSED = 56; // BotSidebar w-14

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
// Helpers
// =============================================================================

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function generateSessionId(): string {
  return `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Format a duration in ms as a tight session-counter string:
 *   < 1m   → "47s"
 *   < 1h   → "6m 16s"
 *   else   → "2h 14m"
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
 * Format a token count as a compact string with a SI suffix:
 *   980 → "980", 1234 → "1.2k", 25000 → "25.0k", 1_750_000 → "1.8m"
 */
function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

// =============================================================================
// User Message Bubble (Gemini-style right-aligned, collapsible)
// =============================================================================

const USER_BUBBLE_MAX_LINES = 6;

function UserBubble({ content, attachment, imageParts, onClick }: { content: string; attachment?: { type: "repo"; url: string; label: string }; imageParts?: Array<{ url: string; mimeType: string }>; onClick?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const isLong = lines.length > USER_BUBBLE_MAX_LINES || content.length > 300;
  const displayText = !expanded && isLong
    ? lines.slice(0, USER_BUBBLE_MAX_LINES).join("\n") + (lines.length > USER_BUBBLE_MAX_LINES ? "…" : "")
    : content;

  return (
    <div className="max-w-[85%] ml-auto">
      {attachment?.type === "repo" && (
        <div className="flex justify-end mb-1">
          <div className="flex items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-0.5 text-[10px] text-muted-foreground">
            <Github className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[180px]">{attachment.label}</span>
          </div>
        </div>
      )}
      {imageParts && imageParts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 justify-end mb-1">
          {imageParts.map((img, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={img.url}
              alt={`Attached image ${i + 1}`}
              className="h-20 w-20 rounded-lg object-cover border border-border"
            />
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "rounded-2xl rounded-br-sm bg-primary/15 border border-primary/20 px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words",
          onClick && "cursor-pointer hover:bg-primary/20 transition-colors",
        )}
        onClick={onClick}
        title={onClick ? "Click to edit" : undefined}
      >
        {displayText}
      </div>
      {isLong && (
        <button
          type="button"
          className="mt-0.5 text-[10px] text-primary/70 hover:text-primary transition-colors float-right pr-1"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function CursorStudioBar() {
  // ---- Auth & page-specific data from context (no props needed) ----
  const { token, user, context: authCtx } = useAuth();
  const userId = user?.id;
  const _organizationId = authCtx.type === "organization" ? authCtx.organizationId : undefined;
  const { workflow, botName, gatewayId, activeTab } = useStudioBarData();
  const barDataRef = useStudioBarDataRef(); // ref for latest fetchWorkflow callback
  const { pendingPrompt, clearPendingPrompt } = useStudioBarPendingPrompt();
  // ---- State ----
  const [modePreference, setModePreference] = useState<StudioMode>("agent");
  // All modes available everywhere — agent/plan will use generic AI when no workflow context
  const mode: StudioMode = modePreference;
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);

  // ---- Agent dropdown catalog (loaded from /api/cursor/agents) ----
  // Falls back to the static built-in list if the request fails.
  const [agentCatalog, setAgentCatalog] = useState<AgentDropdownEntry[]>([]);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch(apiUrl("/cursor/agents"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { agents?: AgentDropdownEntry[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.agents)) setAgentCatalog(data.agents);
      })
      .catch(() => { /* fall back to static options */ });
    return () => { cancelled = true; };
  }, [token]);

  // ---- Workspace index status (for the index chip) ----
  const [indexStatus, setIndexStatus] = useState<{
    ready: boolean;
    fileCount: number;
    chunkCount: number;
    lastIndexedAt: string | null;
  } | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchStatus = () => {
      void fetch(apiUrl("/cursor/index-status"), {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setIndexStatus(data);
        })
        .catch(() => { /* silently ignore */ });
    };
    fetchStatus();
    // Refresh every 30s — index updates fire-and-forget after write_file/edit_file
    const id = setInterval(fetchStatus, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [token]);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // ── Tool-mention autocomplete (`#tool` syntax) ──
  // When the user types `#` followed by letters, show a popover of matching
  // tool names. Arrow keys navigate, Enter/Tab inserts, Esc dismisses.
  const [mentionState, setMentionState] = useState<{
    /** Caret offset where the `#` was typed */
    start: number;
    /** Current query text after the `#` */
    query: string;
    /** Highlighted suggestion index */
    index: number;
  } | null>(null);

  const mentionSuggestions: ToolSuggestion[] = useMemo(
    () => (mentionState ? filterToolSuggestions(mentionState.query) : []),
    [mentionState],
  );

  /** Detect whether the caret sits inside a `#word` token and update mention state. */
  const updateMentionState = useCallback((value: string, caret: number) => {
    // Walk backwards from the caret to find the start of the current word
    let i = caret;
    while (i > 0) {
      const ch = value[i - 1];
      if (ch === "#") {
        // Found a `#` — must be preceded by start-of-string or whitespace
        const prev = i >= 2 ? value[i - 2] : "";
        if (i === 1 || prev === " " || prev === "\n" || prev === "\t") {
          const query = value.slice(i, caret);
          // Only allow lowercase letters, digits, underscore in the query
          if (/^[a-z0-9_]*$/.test(query)) {
            setMentionState((prev2) => ({
              start: i - 1,
              query,
              index: prev2 && prev2.start === i - 1 ? prev2.index : 0,
            }));
            return;
          }
        }
        break;
      }
      if (!/[a-z0-9_]/i.test(ch ?? "")) break;
      i--;
    }
    setMentionState(null);
  }, []);

  /** Replace the active `#word` with the chosen tool name and close the popover. */
  const insertMention = useCallback((suggestion: ToolSuggestion) => {
    setMentionState((current) => {
      if (!current) return null;
      const before = input.slice(0, current.start);
      const after = input.slice(current.start + 1 + current.query.length);
      const replacement = `#${suggestion.name} `;
      const next = `${before}${replacement}${after}`;
      setInput(next);
      // Restore caret right after the inserted token on the next frame
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          const pos = before.length + replacement.length;
          el.setSelectionRange(pos, pos);
          el.focus();
        }
      });
      return null;
    });
  }, [input]);

  // Attached images (pending send)
  const [attachedImages, setAttachedImages] = useState<Array<{ url: string; mimeType: string }>>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Auto-hide / proximity state
  const [isHidden, setIsHidden] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // ---- Theme & Sound ----
  const [theme, setTheme] = useState<CursorThemeConfig>(() => {
    const t = resolveTheme(loadThemePreference());
    setSoundProfile(t.id);
    return t;
  });
  const [soundMuted, setSoundMuted] = useState(() => !isSoundEnabled());
  const toggleSound = useCallback(() => {
    setSoundMuted((prev) => {
      setSoundEnabled(prev);
      return !prev;
    });
  }, []);
  const themeVars = getCursorThemeVars(theme);

  // Model fallback confirmation state
  const [modelConfirm, setModelConfirm] = useState<{
    sessionId: string; failedModel: string;
  } | null>(null);

  // ---- Multi-session chat state ----
  const activeSessionKey = userId ? `cursor-active-session-${userId}` : "cursor-active-session";
  const [activeSessionId, setActiveSessionIdRaw] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(activeSessionKey);
      if (saved) return saved;
      // Migrate legacy messages if they exist
      const legacyKey = userId ? `cursor-studio-messages-${userId}` : "cursor-studio-messages";
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        const msgs = JSON.parse(raw);
        if (Array.isArray(msgs) && msgs.length > 0) {
          const id = generateSessionId();
          const sessionKey = userId
            ? `cursor-studio-messages-${userId}-${id}`
            : `cursor-studio-messages-${id}`;
          localStorage.setItem(sessionKey, raw);
          localStorage.removeItem(legacyKey);
          localStorage.setItem(activeSessionKey, id);
          return id;
        }
      }
      // Fresh start
      const id = generateSessionId();
      localStorage.setItem(activeSessionKey, id);
      return id;
    } catch {
      return generateSessionId();
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [sessionList, setSessionList] = useState<ReturnType<typeof getSessions>>([]);

  const setActiveSessionId = useCallback((id: string) => {
    setActiveSessionIdRaw(id);
    try { localStorage.setItem(activeSessionKey, id); } catch { /* ignore */ }
  }, [activeSessionKey]);

  // Refresh session list when history panel is shown
  useEffect(() => {
    if (!showHistory) return;
    setSessionList(getSessions());
    const interval = setInterval(() => setSessionList(getSessions()), 2000);
    return () => clearInterval(interval);
  }, [showHistory]);

  // ---- Layout position & resize state ----
  const posStorageKey = userId ? `cursor-bar-position-${userId}` : "cursor-bar-position";
  const sizeStorageKey = userId ? `cursor-bar-size-${userId}` : "cursor-bar-size";
  const [barPosition, setBarPosition] = useState<BarPosition>(() => {
    try {
      const saved = localStorage.getItem(posStorageKey);
      if (saved === "right" || saved === "left" || saved === "bottom") return saved;
    } catch { /* ignore */ }
    return "bottom";
  });
  const [chatHeight, setChatHeight] = useState(() => {
    try {
      const saved = localStorage.getItem(sizeStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.height ?? DEFAULT_CHAT_HEIGHT;
      }
    } catch { /* ignore */ }
    return DEFAULT_CHAT_HEIGHT;
  });
  const [sideWidth, setSideWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(sizeStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.width ?? DEFAULT_SIDE_WIDTH;
      }
    } catch { /* ignore */ }
    return DEFAULT_SIDE_WIDTH;
  });
  const isResizing = useRef(false);

  // Persist position preference
  const handlePositionChange = useCallback((pos: BarPosition) => {
    setBarPosition(pos);
    try { localStorage.setItem(posStorageKey, pos); } catch { /* ignore */ }
  }, [posStorageKey]);

  // Persist size preference
  useEffect(() => {
    try {
      localStorage.setItem(sizeStorageKey, JSON.stringify({ height: chatHeight, width: sideWidth }));
    } catch { /* ignore */ }
  }, [chatHeight, sideWidth, sizeStorageKey]);

  // Resize handler for bottom mode (drag to change chat height)
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startY = e.clientY;
    const startX = e.clientX;
    const startHeight = chatHeight;
    const startWidth = sideWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      if (barPosition === "bottom") {
        const delta = startY - ev.clientY; // dragging up increases height
        const newH = Math.max(MIN_CHAT_HEIGHT, Math.min(MAX_CHAT_HEIGHT, startHeight + delta));
        setChatHeight(newH);
      } else if (barPosition === "right") {
        const delta = startX - ev.clientX; // dragging left increases width
        const newW = Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, startWidth + delta));
        setSideWidth(newW);
      } else if (barPosition === "left") {
        const delta = ev.clientX - startX; // dragging right increases width
        const newW = Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, startWidth + delta));
        setSideWidth(newW);
      }
    };
    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = barPosition === "bottom" ? "ns-resize" : "ew-resize";
    document.body.style.userSelect = "none";
  }, [chatHeight, sideWidth, barPosition]);

  const isSideMode = barPosition === "left" || barPosition === "right";
  const studioCtx = useStudioSafe();
  const sidebarPx = studioCtx?.sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  // ---- Drag-to-reposition state ----
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<BarPosition | null>(null);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't interfere with buttons inside the header
    if ((e.target as HTMLElement).closest("button")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let currentTarget: BarPosition | null = null;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging) {
        const dist = Math.sqrt((ev.clientX - startX) ** 2 + (ev.clientY - startY) ** 2);
        if (dist > 8) {
          dragging = true;
          setIsDragging(true);
        }
        return;
      }
      const { clientX, clientY } = ev;
      const { innerWidth, innerHeight } = window;
      const distBottom = innerHeight - clientY;
      // Left zone: only when past the sidebar area
      const distLeft = clientX > sidebarPx ? clientX - sidebarPx : Infinity;
      const distRight = innerWidth - clientX;
      const threshold = 200;

      // Don't detect side zones when mouse is above the TopBar
      if (clientY < TOPBAR_HEIGHT) {
        currentTarget = null;
      } else {
        const minDist = Math.min(distBottom, distLeft, distRight);
        if (minDist > threshold) {
          currentTarget = null;
        } else if (minDist === distBottom) {
          currentTarget = "bottom";
        } else if (minDist === distLeft) {
          currentTarget = "left";
        } else {
          currentTarget = "right";
        }
      }
      setDragTarget(currentTarget);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (dragging && currentTarget) {
        handlePositionChange(currentTarget);
      }
      setIsDragging(false);
      setDragTarget(null);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }, [handlePositionChange, sidebarPx]);

  // ---- Side-by-side layout: push content aside via CSS custom properties ----
  // Always push content aside when in side mode (even when collapsed — input bar is still shown)
  useEffect(() => {
    const root = document.documentElement;
    if (isSideMode) {
      root.style.setProperty("--cursor-bar-right", barPosition === "right" ? `${sideWidth}px` : "0px");
      root.style.setProperty("--cursor-bar-left", barPosition === "left" ? `${sideWidth}px` : "0px");
    } else {
      root.style.setProperty("--cursor-bar-right", "0px");
      root.style.setProperty("--cursor-bar-left", "0px");
    }
    return () => {
      root.style.removeProperty("--cursor-bar-right");
      root.style.removeProperty("--cursor-bar-left");
    };
  }, [isSideMode, barPosition, sideWidth]);

  // ---- Shared streaming hook ----
  const storageKey = userId
    ? `cursor-studio-messages-${userId}-${activeSessionId}`
    : `cursor-studio-messages-${activeSessionId}`;
  const modelStorageKey = userId ? `cursor-model-preference-${userId}` : "cursor-model-preference";
  const suspendedStorageKey = userId ? `cursor-suspended-${userId}` : "cursor-suspended";
  const modeRef = useRef<StudioMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  /** Last SSE event ID received (for reconnect) */
  const lastEventIdRef = useRef<number>(0);

  const {
    messages, isStreaming, askUserPending, setAskUserPending,
    activityLog, creditsUsed, currentIteration, creditBudget,
    activeWorker, selectedModel, realModels, handleModelChange,
    repoUrl, setRepoUrl, showRepoInput, setShowRepoInput,
    showImportCode, setShowImportCode,
    sessionRepoUrl, setSessionRepoUrl,
    addMessage, updateMessage, clearMessages,
    executeStream, submitAnswer, cancelStream,
    retryFromMessage, editAndResend,
    replayEvents,
    resolveConfirmBlock,
    resolveAskBlock,
    updateBuildSpecBlock,
    fileActionCount,
    inputTokens, outputTokens, toolUseCount, elapsedMs,
  } = useCursorStream({
    storageKey,
    modelStorageKey,
    suspendedStorageKey,
    messageLimit: 50,
    idPrefix: "studio",
    token: token ?? undefined,
    onWorkerEvent: useCallback((event: CursorAgentEvent, _msgId: string | null) => {
      // ── Track active session for SSE reconnect ──
      const sseEventId = (event as unknown as { _eventId?: number })._eventId;
      if (sseEventId) lastEventIdRef.current = sseEventId;

      if (event.type === "session_start") {
        try {
          localStorage.setItem(STUDIO_ACTIVE_SESSION_KEY, JSON.stringify({
            sessionId: (event as unknown as { sessionId?: string }).sessionId,
            lastEventId: lastEventIdRef.current,
            startedAt: Date.now(),
          }));
        } catch { /* ignore */ }
      } else if (event.type === "done" || event.type === "error") {
        try { localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY); } catch { /* ignore */ }
      } else if (sseEventId) {
        try {
          const raw = localStorage.getItem(STUDIO_ACTIVE_SESSION_KEY);
          if (raw) {
            const saved = JSON.parse(raw) as { sessionId: string; lastEventId: number; startedAt: number };
            saved.lastEventId = sseEventId;
            localStorage.setItem(STUDIO_ACTIVE_SESSION_KEY, JSON.stringify(saved));
          }
        } catch { /* ignore */ }
      }

      // ── Session history tracking ──
      addSessionEvent(event, describeAgentEvent(event) || undefined);

      // ── Studio-specific side-effects ──
      switch (event.type) {
        case "tool_result": {
          // Refresh workflow canvas after mutation tools complete
          if (event.success) {
            const MUTATION_TOOLS = new Set([
              "add_workflow_step",
              "remove_workflow_step",
              "update_workflow_step",
              "reorder_workflow_step",
              "toggle_workflow_step",
              "update_workflow_trigger",
            ]);
            if (MUTATION_TOOLS.has(event.tool)) {
              barDataRef.current?.fetchWorkflow?.();
            }

            // Refresh studio sidebar data (gateways + plugins) when the AI
            // creates, updates or deletes a plugin. Uses a custom window event
            // so the studio layout can update without polling every 30 seconds.
            const PLUGIN_TOOLS = new Set([
              "create_plugin_record",
              "install_plugin",
              "uninstall_plugin",
              "update_plugin_config",
            ]);
            if (PLUGIN_TOOLS.has(event.tool)) {
              window.dispatchEvent(new CustomEvent("studio:plugins-updated"));
            }
          }
          break;
        }
        case "suspended": {
          // Expand bar when session suspends with a question
          setExpanded(true);
          break;
        }
        case "terminal_confirm": {
          setExpanded(true);
          break;
        }
        case "model_confirm": {
          setModelConfirm({ sessionId: event.sessionId, failedModel: event.failedModel });
          setExpanded(true);
          break;
        }
        case "done": {
          setModelConfirm(null);
          completeSessionRecord("completed", event.summary);
          break;
        }
        case "error": {
          setModelConfirm(null);
          completeSessionRecord("error", event.message);
          break;
        }
        default:
          break;
      }
    }, [barDataRef]),
  });

  // Note: userId switching is handled by the hook's storageKey change detection.

  // ---- Refs ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // ---- Derived ----
  const chips = useMemo(() => getQuickChips(workflow, activeTab), [workflow, activeTab]);

  // ---- Auto-scroll chat (only if user is near bottom) ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // ---- Auto-expand + scroll when AI asks a question ----
  useEffect(() => {
    if (!askUserPending) return;
    setExpanded(true);
    setTimeout(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 80);
  }, [askUserPending]);

  // ---- Cleanup idle timer on unmount ----
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // ---- Reconnect to an interrupted session on mount (page change / refresh) ----
  const reconnectAttemptedRef = useRef(false);
  useEffect(() => {
    if (reconnectAttemptedRef.current || isStreaming) return;
    reconnectAttemptedRef.current = true;

    try {
      const raw = localStorage.getItem(STUDIO_ACTIVE_SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { sessionId: string; lastEventId: number; startedAt: number };
      // Only attempt reconnect for sessions started within the last 10 minutes
      if (Date.now() - saved.startedAt > RECONNECT_MAX_AGE_MS) {
        localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY);
        return;
      }

      const authToken = token || localStorage.getItem("token") || "";
      if (!authToken) return;

      // Show reconnecting state
      const msgId = addMessage({ role: "assistant", content: "Reconnecting to session…", status: "thinking" });
      setExpanded(true);

      void (async () => {
        try {
          const res = await fetch(
            apiUrl(`/cursor/worker-resume?sessionId=${encodeURIComponent(saved.sessionId)}&lastEventId=${saved.lastEventId}`),
            { headers: { Authorization: `Bearer ${authToken}` }, credentials: "include" },
          );
          if (!res.ok) {
            updateMessage(msgId, { content: "Session expired", status: "error" });
            localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY);
            return;
          }
          const data = (await res.json()) as {
            success: boolean;
            data: { events: Array<Record<string, unknown>>; complete: boolean };
          };

          const { events, complete } = data.data;
          if (events.length === 0 && complete) {
            updateMessage(msgId, { content: "Session completed while away", status: "success" });
            localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY);
            return;
          }

          if (events.length === 0 && !complete) {
            updateMessage(msgId, { content: "Session still in progress — waiting for results…", status: "working" });
            let pollCount = 0;
            const pollInterval = setInterval(async () => {
              pollCount++;
              if (pollCount > 20) { // Stop after ~60s
                clearInterval(pollInterval);
                updateMessage(msgId, { content: "Session may still be running — check back shortly", status: "success" });
                localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY);
                return;
              }
              try {
                const pollRes = await fetch(
                  apiUrl(`/cursor/worker-resume?sessionId=${encodeURIComponent(saved.sessionId)}&lastEventId=${saved.lastEventId}`),
                  { headers: { Authorization: `Bearer ${authToken}` }, credentials: "include" },
                );
                if (!pollRes.ok) { clearInterval(pollInterval); return; }
                const pollData = (await pollRes.json()) as typeof data;
                if (pollData.data.events.length > 0 || pollData.data.complete) {
                  clearInterval(pollInterval);
                  replayEvents(pollData.data.events, msgId);
                  if (pollData.data.complete) {
                    localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY);
                  } else {
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
            localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY);
          } else {
            const lastEvt = events[events.length - 1];
            if (lastEvt?.id) {
              saved.lastEventId = lastEvt.id as number;
              localStorage.setItem(STUDIO_ACTIVE_SESSION_KEY, JSON.stringify(saved));
            }
          }
        } catch {
          updateMessage(msgId, { content: "Could not reconnect", status: "error" });
          localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY);
        }
      })();
    } catch {
      localStorage.removeItem(STUDIO_ACTIVE_SESSION_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Side mode: always expanded when messages exist ----
  useEffect(() => {
    if (isSideMode && messages.length > 0 && !expanded) {
      setExpanded(true);
    }
  }, [isSideMode, messages.length, expanded]);

  // ---- Idle auto-hide (bottom mode only — side panels stay visible) ----
  useEffect(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (isSideMode || isStreaming || expanded || input.trim()) {
      if (isSideMode) setIsHidden(false); // always visible in side mode
      return;
    }
    idleTimerRef.current = setTimeout(() => {
      setIsHidden(true);
    }, IDLE_TIMEOUT_MS);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isStreaming, expanded, input, isSideMode]);

  // ---- Mouse proximity detection for reveal (throttled) ----
  useEffect(() => {
    if (!isHidden) return;

    let lastCall = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastCall < 100) return; // throttle to max 10 calls/sec
      lastCall = now;
      if (barPosition === "bottom") {
        const distFromBottom = window.innerHeight - e.clientY;
        if (distFromBottom <= PROXIMITY_ZONE_PX) setIsHidden(false);
      } else if (barPosition === "right") {
        const distFromRight = window.innerWidth - e.clientX;
        if (distFromRight <= PROXIMITY_ZONE_PX) setIsHidden(false);
      } else if (barPosition === "left") {
        if (e.clientX >= sidebarPx && e.clientX <= sidebarPx + PROXIMITY_ZONE_PX) setIsHidden(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isHidden, barPosition, sidebarPx]);

  // ---- Reveal on any interaction ----
  const revealBar = useCallback(() => {
    setIsHidden(false);
  }, []);

  // ---- Consume pendingPrompt queued by page components (e.g. preflight dialog) ----
  // Pre-fills the input and expands the bar so the user can review + press Enter.
  useEffect(() => {
    if (!pendingPrompt) return;
    setInput(pendingPrompt);
    setExpanded(true);
    setIsHidden(false);
    clearPendingPrompt();
  }, [pendingPrompt, clearPendingPrompt]);

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
      gatewayId: gatewayId,
      steps: sortedSteps,
    };
  }, [workflow, botName, gatewayId, sortedSteps]);

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
    setExpanded(true);
    await submitAnswer(option.value, askUserPending.sessionId, {
      studioMode: modeRef.current,
    });
  }, [askUserPending, token, addMessage, submitAnswer, setAskUserPending]);

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
      setExpanded(true);
      await submitAnswer(trimmed, askUserPending.sessionId, {
        studioMode: modeRef.current,
      });
      return;
    }

    if (isStreaming) return;

    setInput("");
    setShowRepoInput(false);
    setExpanded(true);
    setError(null);
    revealBar();

    // Snapshot and clear attached images before send
    const pendingImages = attachedImages.length > 0 ? attachedImages : undefined;
    setAttachedImages([]);

    // Only use repo URL explicitly attached via the Import Code popover, or the session-persisted one
    const newlyAttached = repoUrl.trim() || undefined;
    // Clear the input chip immediately after reading
    if (newlyAttached) setRepoUrl("");
    // Persist newly attached repo for the whole session; fallback to existing session repo
    const effectiveRepoUrl = newlyAttached ?? (sessionRepoUrl || undefined);
    if (newlyAttached) setSessionRepoUrl(newlyAttached);

    // Add user message (include attachment badge if a new repo was just attached)
    addMessage({
      role: "user",
      content: trimmed,
      ...(newlyAttached ? { attachment: { type: "repo" as const, url: newlyAttached, label: formatRepoUrl(newlyAttached) } } : {}),
      ...(pendingImages ? { imageParts: pendingImages } : {}),
    });

    // Create session record in store (first message creates the entry)
    if (!getSessionRecord(activeSessionId)) {
      createSessionRecord(trimmed, activeSessionId);
    }

    // Start the stream via shared hook
    // Pass repoUrl on every message so the runner knows which repo this session is about.
    // mode:"analyze-repo" is only set for the very first attach — follow-ups go as normal agent.
    const isFirstRepoAttach = !!newlyAttached;

    // Serialize prior turns so the AI remembers the conversation.
    // Keep only completed user/assistant messages; strip images, tool calls, and placeholder text.
    const MAX_HISTORY = 20; // 10 exchanges × 2
    const conversationHistory = messages
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          m.status !== "thinking" &&
          m.status !== "working" &&
          m.content &&
          m.content !== "Thinking..." &&
          m.content !== "Reconnecting to session…",
      )
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        // Truncate very long messages to avoid token bloat
        content: m.content.length > 3000 ? `${m.content.slice(0, 3000)}…` : m.content,
      }));

    await executeStream({
      message: trimmed,
      workflowContext: buildWorkflowContext() || undefined,
      studioMode: isFirstRepoAttach ? "agent" : modeRef.current,
      // "build" mode → the built-in `builder` agent (declarative). All other
      // modes have an agent of the same name registered in the agent loader.
      agentName: isFirstRepoAttach
        ? "agent"
        : modeRef.current === "build"
          ? "builder"
          : modeRef.current,
      ...(effectiveRepoUrl ? { repoUrl: effectiveRepoUrl } : {}),
      ...(isFirstRepoAttach ? { mode: "analyze-repo" as const } : {}),
      ...(pendingImages ? { imageParts: pendingImages } : {}),
      // Scope agent memories to this chat thread — fresh chat = clean slate
      chatThreadId: activeSessionId,
      // Carry prior turns so the AI remembers the conversation
      ...(conversationHistory.length > 0 ? { conversationHistory } : {}),
    });
  }, [input, isStreaming, token, askUserPending, activeSessionId, attachedImages, addMessage, submitAnswer, executeStream, buildWorkflowContext, revealBar, repoUrl, setRepoUrl, sessionRepoUrl, setSessionRepoUrl, setShowRepoInput]);

  // ---- Hand-off click (declarative agent post-completion buttons) ----
  // Wired from the `handoffs` SSE event the runner emits after a declarative
  // agent finishes. Sends a fresh request to the chosen agent with the
  // suggested prompt, replacing the old mid-stream `hand_off_to_*` tools.
  const handleHandoff = useCallback(async (handoff: { agent: string; prompt: string }) => {
    if (isStreaming) return;
    if (!token) {
      setError("Not authenticated");
      return;
    }
    // Sync the dropdown if the target is one of the standard modes.
    const STUDIO_MODES: StudioMode[] = ["agent", "ask", "plan", "build"];
    if ((STUDIO_MODES as string[]).includes(handoff.agent)) {
      setModePreference(handoff.agent as StudioMode);
    }
    setExpanded(true);
    revealBar();
    addMessage({ role: "user", content: handoff.prompt });
    if (!getSessionRecord(activeSessionId)) {
      createSessionRecord(handoff.prompt, activeSessionId);
    }
    await executeStream({
      message: handoff.prompt,
      workflowContext: buildWorkflowContext() || undefined,
      studioMode: (STUDIO_MODES as string[]).includes(handoff.agent)
        ? (handoff.agent as StudioMode)
        : modeRef.current,
      agentName: handoff.agent,
      ...(sessionRepoUrl ? { repoUrl: sessionRepoUrl } : {}),
      chatThreadId: activeSessionId,
    });
  }, [isStreaming, token, activeSessionId, addMessage, executeStream, buildWorkflowContext, revealBar, sessionRepoUrl]);

  // ---- Apply BuildSpec from a Builder-mode chat block ----
  // Mirrors the cursor-panel implementation: drives the buildspec block's
  // lifecycle (idle → applying → applied | rolled-back | error) by calling
  // POST /api/cursor/buildspec/apply via the lazy api-client loader.
  const handleApplyBuildSpec = useCallback(
    async (block: { id: string; spec: unknown }) => {
      updateBuildSpecBlock(block.id, { status: "applying", error: undefined });
      try {
        const tk =
          (typeof window !== "undefined" ? localStorage.getItem("token") : null) ||
          token ||
          undefined;
        const { applyBuildSpec } = await import("@/lib/api-client");
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
    [updateBuildSpecBlock, token],
  );

  // ---- Stop streaming ----
  const handleStop = useCallback(() => {
    cancelStream();
  }, [cancelStream]);

  // ---- Clear chat ----
  const handleClear = useCallback(() => {
    handleStop();
    clearMessages();
    setError(null);
    setRepoUrl("");
  }, [handleStop, clearMessages, setRepoUrl]);

  // ---- New chat ----
  const startNewChat = useCallback(() => {
    cancelStream();
    const id = generateSessionId();
    setActiveSessionId(id);
    setShowHistory(false);
    setError(null);
    setRepoUrl("");
    // Side mode: keep panel visible, just clear content. Bottom: collapse.
    if (barPosition !== "left" && barPosition !== "right") {
      setExpanded(false);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [cancelStream, setActiveSessionId, setRepoUrl, barPosition]);

  // ---- Load a historical session ----
  const loadSession = useCallback((sessionId: string) => {
    if (isStreaming) return;
    setActiveSessionId(sessionId);
    setShowHistory(false);
    setExpanded(true);
  }, [isStreaming, setActiveSessionId]);

  // ---- Delete a session ----
  const handleDeleteSession = useCallback((sessionId: string) => {
    deleteSessionRecord(sessionId);
    try {
      const key = userId
        ? `cursor-studio-messages-${userId}-${sessionId}`
        : `cursor-studio-messages-${sessionId}`;
      localStorage.removeItem(key);
    } catch { /* ignore */ }
    if (sessionId === activeSessionId) {
      const id = generateSessionId();
      setActiveSessionId(id);
      if (barPosition !== "left" && barPosition !== "right") {
        setExpanded(false);
      }
    }
    setSessionList(getSessions());
  }, [userId, activeSessionId, setActiveSessionId, barPosition]);

  // ---- Toggle history panel ----
  const toggleHistory = useCallback(() => {
    setShowHistory(prev => !prev);
    setExpanded(true);
  }, []);

  // ---- Image attachment helpers ----
  const MAX_IMAGES = 4;

  const addImagesFromFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, MAX_IMAGES);
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        if (!url) return;
        setAttachedImages((prev) => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, { url, mimeType: file.type }];
        });
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleImagePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    imageItems.forEach((item) => {
      const file = item.getAsFile();
      if (file) addImagesFromFiles([file]);
    });
  }, [addImagesFromFiles]);

  // ---- Keyboard ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Mention popover takes priority for nav keys
      if (mentionState && mentionSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionState((s) => (s ? { ...s, index: (s.index + 1) % mentionSuggestions.length } : s));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionState((s) =>
            s ? { ...s, index: (s.index - 1 + mentionSuggestions.length) % mentionSuggestions.length } : s,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          const choice = mentionSuggestions[mentionState.index];
          if (choice) {
            e.preventDefault();
            insertMention(choice);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionState(null);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend, mentionState, mentionSuggestions, insertMention],
  );

  // Ctrl+N for new chat (when bar is focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        if (barRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          startNewChat();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [startNewChat]);

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

  // Side-mode border radius: only round corners facing inward (away from screen edge)
  const sideRadius = isSideMode
    ? barPosition === "left"
      ? { borderRadius: "0 8px 8px 0" }   // round right corners only
      : { borderRadius: "8px 0 0 8px" }   // round left corners only
    : {};

  return (
    <div
      ref={barRef}
      className={cn(
        "z-20 pointer-events-none",
        // Bottom mode: centered floating bar
        barPosition === "bottom" && cn(
          "mx-auto w-[calc(100%-2rem)] max-w-2xl py-2",
          "studio-bar-wrapper",
          isHidden && "studio-bar-slide-down pointer-events-none opacity-0",
        ),
        // Side mode: full-height flex column (below TopBar, after Sidebar)
        isSideMode && cn(
          "fixed flex flex-col py-0 pb-3",
          barPosition === "right" && "right-0 pr-0 pl-0",
          barPosition === "left" && "pl-0 pr-0",
        ),
      )}
      style={{
        ...themeVars,
        transition: isSideMode
          ? "opacity 0.3s ease, left 0.3s ease, width 0.3s ease"
          : "opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        ...(barPosition === "bottom" && isHidden
          ? { transform: "translateY(100%)" }
          : barPosition === "bottom"
            ? { transform: "translateY(0)" }
            : {}),
        ...(isSideMode ? {
          width: `${sideWidth}px`,
          top: `${TOPBAR_HEIGHT}px`,
          height: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
          ...(barPosition === "left" ? { left: `${sidebarPx}px` } : {}),
        } : {}),
      }}
      onMouseEnter={() => { setIsHovering(true); revealBar(); }}
      onMouseLeave={() => { setIsHovering(false); }}
    >
      {/* Resize handle for side mode — always visible */}
      {isSideMode && (
        <div
          className={cn(
            "absolute top-0 h-full w-1.5 cursor-ew-resize z-30 pointer-events-auto",
            "hover:bg-primary/20 active:bg-primary/30 transition-colors",
            barPosition === "right" ? "left-0" : "right-0",
          )}
          onMouseDown={handleResizeMouseDown}
        >
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2",
            barPosition === "right" ? "-left-1" : "-right-1",
          )}>
            <GripVertical className="h-6 w-3 text-muted-foreground/30" />
          </div>
        </div>
      )}
      {/* Expanded chat panel */}
      {expanded && (messages.length > 0 || showHistory || isSideMode) ? (
        <div
          className={cn(
            "border border-border/60 bg-background/95 backdrop-blur-md shadow-lg overflow-hidden pointer-events-auto",
            barPosition === "bottom" && "rounded-xl mb-2",
            isSideMode && "flex flex-col flex-1 min-h-0 border-x-0 border-t-0",
          )}
          style={sideRadius}
        >
          {/* Resize handle — top edge for bottom mode */}
          {barPosition === "bottom" && (
            <div
              className="flex items-center justify-center h-3 cursor-ns-resize hover:bg-muted/50 transition-colors group"
              onMouseDown={handleResizeMouseDown}
            >
              <GripHorizontal className="h-3 w-5 text-muted-foreground/20 group-hover:text-muted-foreground/50" />
            </div>
          )}
          {/* Chat header — draggable to reposition */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30 cursor-grab active:cursor-grabbing select-none shrink-0"
            onMouseDown={handleHeaderMouseDown}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <GripVertical className="h-3 w-3 text-muted-foreground/40" />
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              <span className="truncate max-w-[140px] text-[11px]">
                {showHistory
                  ? "Chat History"
                  : (() => {
                      const session = getSessionRecord(activeSessionId);
                      return session?.summary?.slice(0, 40) || session?.userMessage?.slice(0, 40) || "New chat";
                    })()}
              </span>
              {activeWorker ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {activeWorker.displayName}
                </span>
              ) : null}
              {indexStatus && indexStatus.fileCount > 0 ? (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 font-mono",
                    indexStatus.ready
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                  title={
                    indexStatus.lastIndexedAt
                      ? `${indexStatus.fileCount} files · ${indexStatus.chunkCount} chunks indexed · last update ${new Date(indexStatus.lastIndexedAt).toLocaleString()}`
                      : `${indexStatus.fileCount} files indexed`
                  }
                >
                  <Database className="h-2.5 w-2.5" />
                  {indexStatus.fileCount}
                </span>
              ) : null}
              {isStreaming && creditsUsed > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
                  {creditsUsed.toFixed(1)}/{creditBudget}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <CursorSettings
                theme={theme}
                onThemeChange={setTheme}
                soundMuted={soundMuted}
                onSoundToggle={toggleSound}
                compact
              />

              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 w-6 p-0 text-muted-foreground hover:text-foreground",
                  showHistory && "text-primary",
                )}
                onClick={toggleHistory}
                title="Chat history"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={startNewChat}
                disabled={isStreaming}
                title="New chat (Ctrl+N)"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:text-destructive"
                onClick={handleClear}
                title="Clear chat"
              >
                <Eraser className="h-3.5 w-3.5" />
              </Button>
              {/* Collapse button — bottom mode only (side panels stay expanded) */}
              {!isSideMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setExpanded(false)}
                  title="Collapse"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {showHistory ? (
            /* ── Session history list ── */
            <div
              className={cn(
                "cursor-scroll overflow-y-auto overflow-x-hidden px-2 py-2 space-y-1 min-w-0",
                isSideMode && "flex-1 min-h-0",
              )}
              style={barPosition === "bottom" ? { maxHeight: `${chatHeight}px` } : undefined}
            >
              {sessionList.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground/50 py-8">No chat history yet</p>
              ) : (
                sessionList.slice().reverse().map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "group flex items-start gap-2 w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer",
                      session.id === activeSessionId
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => loadSession(session.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-[11px]">{session.summary || session.userMessage}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground/60">
                        <span>{formatTimeAgo(new Date(session.completedAt ?? session.startedAt))}</span>
                        {session.toolCount > 0 && <span>· {session.toolCount} tools</span>}
                        <span className={cn(
                          "px-1 rounded text-[9px]",
                          session.status === "completed" && "bg-green-500/10 text-green-600 dark:text-green-400",
                          session.status === "error" && "bg-red-500/10 text-red-600 dark:text-red-400",
                          session.status === "running" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                          session.status === "retried" && "bg-orange-500/10 text-orange-600 dark:text-orange-400",
                        )}>{session.status}</span>
                      </div>
                    </div>
                    <button
                      className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                      title="Delete session"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
          {/* Messages */}
          <div
            ref={scrollRef}
            className={cn(
              "cursor-scroll overflow-y-auto overflow-x-hidden px-3 py-2 space-y-3 min-w-0",
              isSideMode && "flex-1 min-h-0",
            )}
            style={barPosition === "bottom" ? { maxHeight: `${chatHeight}px` } : undefined}
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <Wand2 className="h-8 w-8 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground/50">New chat</p>
                <p className="text-[11px] text-muted-foreground/30 mt-1">Type a message below to start</p>
              </div>
            ) : messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "text-sm leading-relaxed group/msg relative",
                  msg.role === "user" && "flex justify-end",
                  msg.role === "assistant" && "text-muted-foreground",
                  msg.role === "system" && "text-muted-foreground/70 italic text-xs",
                )}
              >
                {msg.role === "user" ? (
                  editingMessageId === msg.id ? (
                    <EditableUserMessage
                      initialContent={msg.content}
                      onSubmit={(newContent) => {
                        setEditingMessageId(null);
                        void editAndResend(msg.id, newContent);
                      }}
                      onCancel={() => setEditingMessageId(null)}
                      warnFileChanges={fileActionCount > 0}
                      compact
                    />
                  ) : (
                    <UserBubble content={msg.content} attachment={msg.attachment} imageParts={msg.imageParts} onClick={isStreaming ? undefined : () => setEditingMessageId(msg.id)} />
                  )
                ) : msg.role === "system" ? (
                  <p>{msg.content}</p>
                ) : (
                  <div className={cn(
                    "flex gap-2",
                    msg.status === "error" && "rounded-lg border border-destructive/40 bg-destructive/5 px-2 py-1.5 -mx-2",
                  )}>
                    <span className={cn(
                      "shrink-0 text-[10px] font-semibold uppercase tracking-wider mt-0.5",
                      msg.status === "error" ? "text-destructive/80" : "text-accent-foreground/70",
                    )}>
                      {msg.status === "error" ? "⚠ AI" : "AI"}
                    </span>
                    <div className="min-h-[1.25rem] w-full">
                      {/* Collapsible reasoning section (from reasoning models) */}
                      {msg.reasoning && (
                        <details className="mb-1 group/reasoning" open>
                          <summary className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-purple-400/80 hover:text-purple-400 transition-colors list-none [&::-webkit-details-marker]:hidden">
                            <svg className="h-2.5 w-2.5 shrink-0 transition-transform group-open/reasoning:rotate-90" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4" /></svg>
                            <span>Reasoning</span>
                            <span className="text-[9px] text-muted-foreground/50">· {msg.reasoning.length > 1000 ? `${Math.round(msg.reasoning.length / 100) / 10}k` : `${msg.reasoning.length} chars`}</span>
                          </summary>
                          <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/70 bg-purple-500/5 border-l-2 border-purple-500/20 pl-2 pr-1.5 py-1 rounded-sm max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                            {msg.reasoning}
                          </div>
                        </details>
                      )}
                      {/* Inline block chain (activity narrative) */}
                      {msg.blocks && msg.blocks.length > 0 ? (
                        <MessageBlocks
                          blocks={msg.blocks}
                          isThinking={msg.status === "thinking" || msg.status === "working"}
                          content={msg.content}
                          hasTextBlock={msg.blocks.some(b => b.kind === "text")}
                          compact
                          onResolveConfirm={(sessionId, approved) => resolveConfirmBlock(msg.id, sessionId, approved)}
                          onResolveAsk={(sessionId, value, label) => {
                            resolveAskBlock(sessionId, value, label);
                            void handleOptionSelect({ value, label });
                          }}
                          onApplyBuildSpec={handleApplyBuildSpec}
                        />
                      ) : (
                        /* Fallback: plain content (for old messages / non-streaming) */
                        <div>
                          {msg.content ? (
                            <MarkdownContent text={msg.content} />
                          ) : (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                          {(msg.status === "thinking" || msg.status === "working") && (
                            <Loader2 className="inline h-3 w-3 animate-spin ml-1 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      {msg.detail && !(msg.blocks && msg.blocks.length > 0) && (
                        <div className="mt-1 text-[10px] font-mono text-muted-foreground/60 bg-muted/40 rounded px-1.5 py-0.5 whitespace-pre-wrap">
                          {msg.detail}
                        </div>
                      )}
                      {/* Model + per-turn metrics — completed/errored assistant messages */}
                      {msg.role === "assistant" && (msg.status === "success" || msg.status === "error") && (
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/50">
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
                          {!isStreaming && (
                            <button
                              type="button"
                              className="flex items-center rounded-md border bg-background/90 p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                              onClick={() => void retryFromMessage(msg.id)}
                              title="Retry"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      )}
                      {/* Hand-off buttons (declarative agents — post-completion) */}
                      {msg.role === "assistant"
                        && msg.status === "success"
                        && msg.handoffs
                        && msg.handoffs.length > 0
                        && !isStreaming && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {msg.handoffs.map((h, idx) => (
                            <button
                              key={`handoff-${msg.id}-${idx}`}
                              type="button"
                              onClick={() => void handleHandoff({ agent: h.agent, prompt: h.prompt })}
                              className="rounded-md border border-border/40 bg-muted/40 px-2 py-1 text-[10px] font-medium text-foreground/80 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                              title={`Send to ${h.agent}: ${h.prompt}`}
                            >
                              {h.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}

            {/*
              Inline answer widget — historically rendered after the message list
              to show options. Now disabled: the option buttons are rendered as
              an `ask` block INSIDE the assistant message via MessageBlocks, so
              they appear in the timeline next to the question (not at the bottom).
              We keep this branch only for the sensitive-answer hint fallback.
            */}
            {askUserPending && askUserPending.sensitive && (
              <div className="mt-2 animate-in slide-in-from-bottom-1 fade-in duration-200">
                <p className="text-[11px] text-muted-foreground/70 italic">
                  🔒 Type your answer in the input below — it will be masked.
                </p>
              </div>
            )}

            {/* Session counter (inline) — timer + tokens + tool uses + credits.
                Shown after a session ends. While streaming, the credit bar
                lives in the collapsed/expanded indicators above. */}
            {creditsUsed > 0 && !isStreaming && (
              <div className="mt-2 border-t border-border/20 pt-2 space-y-1 text-[10px] text-muted-foreground/60">
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
                  <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        creditsUsed / creditBudget > 0.85 ? "bg-destructive" : creditsUsed / creditBudget > 0.6 ? "bg-yellow-500" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(100, (creditsUsed / creditBudget) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono shrink-0">{creditsUsed.toFixed(1)}/{creditBudget} credits</span>
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </div>
      ) : null}

      {/* Collapsed: show expand toggle + live progress if streaming */}
      {!expanded && messages.length > 0 ? (
        isSideMode ? (
          /* Side mode collapsed: full-width compact header */
          <div className="mb-1 pointer-events-auto">
            {/* Live streaming indicator when collapsed */}
            {isStreaming && (
              <div className="flex items-center gap-1.5 mb-1 px-3 py-1 rounded-lg bg-primary/5 border border-primary/10">
                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                <span className="truncate text-[10px] text-foreground/70">Working...</span>
                {elapsedMs !== null && (
                  <span className="shrink-0 text-[9px] font-mono text-muted-foreground/60">
                    {formatSessionDuration(elapsedMs)}
                  </span>
                )}
                {(inputTokens > 0 || outputTokens > 0) && (
                  <span
                    className="shrink-0 text-[9px] font-mono text-muted-foreground/50"
                    title={`${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`}
                  >
                    · ↓ {formatTokens(inputTokens + outputTokens)}
                  </span>
                )}
                {creditsUsed > 0 && (
                  <span className="shrink-0 text-[9px] font-mono text-muted-foreground/50 ml-auto">
                    {creditsUsed.toFixed(1)}/{creditBudget}
                  </span>
                )}
              </div>
            )}
            <button
              className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              onClick={() => setExpanded(true)}
            >
              <ChevronUp className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {isStreaming
                  ? `Working... · ${creditsUsed.toFixed(1)} credits`
                  : `Show chat (${messages.filter((m) => m.role !== "system").length} messages)`
                }
              </span>
            </button>
          </div>
        ) : (
          /* Bottom mode collapsed: centered button */
          <div className="mb-1 flex flex-col items-center pointer-events-auto">
            {/* Live streaming indicator when collapsed */}
            {isStreaming && (
              <div className="flex items-center gap-1.5 mb-1 px-3 py-1 rounded-lg bg-primary/5 border border-primary/10 max-w-md">
                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                <span className="truncate text-[10px] text-foreground/70">Working...</span>
                {elapsedMs !== null && (
                  <span className="shrink-0 text-[9px] font-mono text-muted-foreground/60">
                    {formatSessionDuration(elapsedMs)}
                  </span>
                )}
                {(inputTokens > 0 || outputTokens > 0) && (
                  <span
                    className="shrink-0 text-[9px] font-mono text-muted-foreground/50"
                    title={`${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`}
                  >
                    · ↓ {formatTokens(inputTokens + outputTokens)}
                  </span>
                )}
                {creditsUsed > 0 && (
                  <span className="shrink-0 text-[9px] font-mono text-muted-foreground/50 ml-auto">
                    {creditsUsed.toFixed(1)}/{creditBudget}
                  </span>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-muted-foreground gap-1 hover:text-foreground"
              onClick={() => setExpanded(true)}
            >
              <ChevronUp className="h-3 w-3" />
              {isStreaming
                ? `Working... · ${creditsUsed.toFixed(1)} credits`
                : `Show AI chat (${messages.filter((m) => m.role !== "system").length} messages)`
              }
            </Button>
          </div>
        )
      ) : null}

      {/*
        Ask-user floating dialog — REMOVED.
        The ask question is now rendered inline in the chat timeline as a
        message-block (`kind: "ask"`). An effect auto-expands the chat when
        `askUserPending` becomes truthy, so the inline block is always visible.
        Keeping a duplicate floating dialog above the input caused the question
        to feel "stuck at the bottom" and detached from the timeline.
      */}

      {/* ── Model Fallback Confirmation — rendered above input bar ── */}
      {modelConfirm ? (
        <div className="mb-2 animate-in slide-in-from-bottom-2 fade-in duration-200 pointer-events-auto">
          <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 backdrop-blur-md shadow-xl overflow-hidden p-3">
            <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <span className="text-amber-500">⚠️</span> Model unavailable
            </p>
            <p className="text-[12px] text-muted-foreground mb-3">
              <strong>{modelConfirm.failedModel}</strong> is currently unavailable. Continue with the best available model?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const sid = modelConfirm.sessionId;
                  setModelConfirm(null);
                  void fetch(apiUrl("/cursor/worker-answer"), {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ sessionId: sid, answer: "__model_fallback_accept__" }),
                  });
                }}
                className="rounded px-3 py-1 text-white text-[11px] font-medium"
                style={{ background: "var(--cursor-primary, #3b82f6)" }}
              >
                Continue
              </button>
              <button
                onClick={() => {
                  const sid = modelConfirm.sessionId;
                  setModelConfirm(null);
                  void fetch(apiUrl("/cursor/worker-answer"), {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ sessionId: sid, answer: "__model_fallback_reject__" }),
                  });
                }}
                className="rounded px-3 py-1 text-muted-foreground border text-[11px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Side mode spacer — pushes input bar to bottom when no chat is shown */}
      {isSideMode && !(expanded && (messages.length > 0 || showHistory || isSideMode)) && (
        <div className="flex-1" />
      )}

      {/* Input bar — floating island */}
      <div
        className={cn(
          "studio-bar-island relative border bg-background/90 backdrop-blur-md shadow-lg pointer-events-auto",
          askUserPending ? "border-amber-500/40" : "border-transparent",
          !isSideMode && "rounded-xl",
          isSideMode && "is-side-mode",
          isStreaming && "is-streaming",
          isHovering && "is-hovering",
          isSideMode && "mb-0 shrink-0",
        )}
        style={sideRadius}
      >
        {/* Animated gradient border */}
        <div
          className={cn("studio-bar-gradient-border absolute inset-0 p-[1px] -z-10", !isSideMode && "rounded-xl")}
          style={{
            background: "linear-gradient(90deg, var(--glow-accent), var(--glow-primary), var(--glow-accent), var(--glow-primary))",
            backgroundSize: "200% 200%",
            ...sideRadius,
          }}
        >
          <div className={cn("h-full w-full bg-background", !isSideMode && "rounded-[11px]")} style={isSideMode ? sideRadius : undefined} />
        </div>

        {/* Breathing glow layer */}
        <div
          className={cn("studio-bar-glow-layer absolute inset-0 -z-20", !isSideMode && "rounded-xl")}
          style={{
            background: "linear-gradient(90deg, var(--glow-accent), var(--glow-primary), var(--glow-accent))",
            backgroundSize: "200% 200%",
            ...sideRadius,
          }}
        />

        {/* Shimmer sweep overlay */}
        <div className={cn("studio-bar-shimmer absolute inset-0 -z-5 pointer-events-none", !isSideMode && "rounded-xl")} style={isSideMode ? sideRadius : undefined} />

        {/* Hidden file input for image attachment */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addImagesFromFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* ── Textarea row (top) ── */}
        <div className="relative px-3 pt-2 pb-2">
          {/* Attached repo chip — shows when input-chip active OR session repo is persisted */}
          {(repoUrl || sessionRepoUrl) && !showRepoInput ? (
            <div className="flex items-center gap-1.5 pb-1.5">
              <div className="flex items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-1 text-[11px]">
                <Github className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate text-muted-foreground max-w-[200px]">
                  {formatRepoUrl(repoUrl || sessionRepoUrl)}
                </span>
                <button
                  type="button"
                  onClick={() => { setRepoUrl(""); setSessionRepoUrl(""); }}
                  className="text-muted-foreground hover:text-foreground shrink-0 ml-0.5"
                  aria-label="Remove repo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : null}

          {/* Vision incompatibility warning — shown when images are attached but the selected model can't analyse them */}
          {attachedImages.length > 0 && selectedModel !== AUTO_MODE_VALUE && realModels.find((m) => m.id === selectedModel)?.supportsVision === false ? (
            <div className="flex items-center gap-1.5 pb-1.5">
              <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-500">
                <ImageOff className="h-3 w-3 shrink-0" />
                <span>This model doesn&apos;t support images — switch to a vision model or use Auto</span>
              </div>
            </div>
          ) : null}

          {askUserPending ? (
            /* Bar fallback input — inline chat widget is primary; this handles sensitive answers or collapsed chat */
            <input
              ref={inputRef as unknown as React.RefObject<HTMLInputElement>}
              type={askUserPending.sensitive ? "password" : "text"}
              value={input}
              onChange={(e) => { setInput(e.target.value); revealBar(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void handleSend(); }
                if (e.key === "Escape") {
                  void submitAnswer("", askUserPending.sessionId);
                }
              }}
              onFocus={revealBar}
              placeholder={askUserPending.sensitive ? "Type your answer (sensitive)…" : askUserPending.options?.length ? "Or type your own answer…" : "Type your answer…"}
              className={cn(
                "w-full bg-transparent text-sm text-foreground",
                "placeholder:text-muted-foreground/40",
                "focus:outline-none",
              )}
            />
          ) : (
            <>
              {/* Attached image thumbnails */}
              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1.5">
                  {attachedImages.map((img, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={`Attached image ${i + 1}`}
                        className="h-14 w-14 rounded-md object-cover border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => setAttachedImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center h-4 w-4 rounded-full bg-destructive text-destructive-foreground"
                        aria-label="Remove image"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  revealBar();
                  // Auto-grow: reset to 1 line then expand to content, capped at ~4 lines
                  const el = e.target;
                  el.style.height = "1.5rem";
                  el.style.height = Math.min(el.scrollHeight, 96) + "px";
                  updateMentionState(e.target.value, e.target.selectionStart ?? 0);
                }}
                onKeyDown={handleKeyDown}
                onKeyUp={(e) => {
                  // Caret-only moves (arrow keys etc.) — keep popover state in sync
                  if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
                    const el = e.currentTarget;
                    updateMentionState(el.value, el.selectionStart ?? 0);
                  }
                }}
                onSelect={(e) => {
                  const el = e.currentTarget;
                  updateMentionState(el.value, el.selectionStart ?? 0);
                }}
                onBlur={() => {
                  // Close after a short delay so click on a suggestion still registers
                  setTimeout(() => setMentionState(null), 150);
                }}
                onPaste={handleImagePaste}
                onFocus={revealBar}
                placeholder={placeholder}
                rows={1}
                disabled={isStreaming && !askUserPending ? true : false}
                className={cn(
                  "w-full resize-none bg-transparent text-sm text-foreground overflow-y-auto",
                  "placeholder:text-muted-foreground/50",
                  "focus:outline-none",
                  "disabled:opacity-50",
                )}
                style={{ height: "1.5rem", maxHeight: "96px" }}
              />
              {mentionState && mentionSuggestions.length > 0 ? (
                <div
                  className={cn(
                    "absolute left-3 right-3 bottom-full mb-1 z-50",
                    "rounded-md border border-border bg-popover shadow-lg",
                    "max-h-56 overflow-y-auto py-1 text-sm",
                  )}
                  // Prevent the textarea blur from firing before our click handler
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1 font-mono">
                    Force tool · ↑↓ navigate · Enter to insert · Esc to cancel
                  </div>
                  {mentionSuggestions.map((s, i) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => insertMention(s)}
                      onMouseEnter={() => setMentionState((cur) => (cur ? { ...cur, index: i } : cur))}
                      className={cn(
                        "w-full text-left px-3 py-1.5 flex items-baseline gap-2 transition-colors",
                        i === mentionState.index ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                      )}
                    >
                      <span className="font-mono text-xs">#{s.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{s.short}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* ── Controls row (bottom) — [+] [Agent] [Model] ... spacer ... [Send/Stop] ── */}
        <div className="flex items-center gap-1.5 px-3 pb-2 pt-1">
          {/* + Attach button with context menu popover */}
          <Popover open={showRepoInput} onOpenChange={(open) => {
            setShowRepoInput(open);
            if (!open) setShowImportCode(false);
          }}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 w-7 p-0 shrink-0 transition-all duration-200",
                  showRepoInput
                    ? "text-primary rotate-45"
                    : repoUrl
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                )}
                disabled={isStreaming}
                title="Attach context"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={12}
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
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                    disabled={attachedImages.length >= MAX_IMAGES}
                    onClick={() => {
                      setShowRepoInput(false);
                      imageInputRef.current?.click();
                    }}
                  >
                    <ImagePlus className="h-4 w-4 text-muted-foreground" />
                    Attach image
                    {attachedImages.length > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">{attachedImages.length}/{MAX_IMAGES}</span>
                    )}
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
                    <h4 className="text-sm font-medium flex items-center gap-1.5">
                      <Code className="h-3.5 w-3.5" />
                      Import code
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <input
                      type="url"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/user/repo"
                      className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && repoUrl.trim()) {
                          e.preventDefault();
                          if (!isValidRepoUrl(repoUrl)) return;
                          setShowRepoInput(false);
                          setShowImportCode(false);
                          (inputRef.current as HTMLElement | null)?.focus();
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
                        <Button
                          size="sm"
                          className="h-6 text-[11px] px-2.5"
                          disabled={!isValidRepoUrl(repoUrl)}
                          onClick={() => {
                            setShowRepoInput(false);
                            setShowImportCode(false);
                            (inputRef.current as HTMLElement | null)?.focus();
                          }}
                        >
                          Attach
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Mode selector dropdown — always available */}
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
              {mode === "build" && <><Sparkles className="h-3 w-3" />Build</>}
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
                  {(() => {
                    // Static fallback when the API hasn't loaded yet.
                    const fallback: Array<{ value: StudioMode; label: string; icon: typeof Wand2; desc: string }> = [
                      { value: "agent", label: "Agent", icon: Wand2, desc: "Autonomous builder" },
                      { value: "ask", label: "Ask", icon: MessageCircleQuestion, desc: "Ask questions" },
                      { value: "plan", label: "Plan", icon: ClipboardList, desc: "Plan changes" },
                      { value: "build", label: "Build", icon: Sparkles, desc: "Plan & apply project changes" },
                    ];
                    // Map known agent names to icons; everything else gets Wand2.
                    const iconFor = (name: string): typeof Wand2 => {
                      if (name === "ask") return MessageCircleQuestion;
                      if (name === "plan") return ClipboardList;
                      if (name === "build" || name === "builder") return Sparkles;
                      return Wand2;
                    };
                    const dynamic: Array<{ value: StudioMode; label: string; icon: typeof Wand2; desc: string }> =
                      agentCatalog.length > 0
                        ? agentCatalog
                            // Only show entries that map to a known StudioMode for now —
                            // will expand StudioMode to accept arbitrary names.
                            .filter((a): a is AgentDropdownEntry & { name: StudioMode } =>
                              a.name === "agent" || a.name === "ask" || a.name === "plan" || a.name === "build",
                            )
                            .map((a) => ({
                              value: a.name,
                              label: a.displayName || a.name,
                              icon: iconFor(a.name),
                              desc: a.description,
                            }))
                        : fallback;
                    return dynamic.map((opt) => (
                      <button
                        key={opt.value}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                          mode === opt.value
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/50 text-foreground",
                        )}
                        onClick={() => {
                            setModePreference(opt.value);
                            setModeDropdownOpen(false);
                        }}
                        title={opt.desc}
                      >
                        <opt.icon className="h-3.5 w-3.5 shrink-0" />
                        <div className="flex flex-col">
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                        </div>
                      </button>
                    ));
                  })()}
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
                hasImages={attachedImages.length > 0}
              />
            </div>
          ) : null}

          {/* Spacer pushes send/stop to the right */}
          <div className="flex-1" />

          {/* History button removed — duplicate of the one in the chat panel header */}

          {/* Send / Stop */}
          {isStreaming && !askUserPending ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
              onClick={handleStop}
              title="Stop — halts the agent at the next safe checkpoint. Tokens already produced will still be charged."
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

      {/* Drop zone overlays during drag — ghost preview of target position */}
      {isDragging && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          {/* Translucent scrim */}
          <div className="absolute inset-0 bg-background/30 backdrop-blur-[1px]" />

          {/* Ghost preview — exact outline of where the bar will dock */}
          {dragTarget ? (
            <div
              className="absolute border-2 border-primary border-dashed rounded-xl bg-primary/10 backdrop-blur-sm transition-all duration-200 ease-out flex items-center justify-center"
              style={
                dragTarget === "bottom"
                  ? { bottom: 8, left: "50%", transform: "translateX(-50%)", width: "min(calc(100% - 2rem), 42rem)", height: 80 }
                  : dragTarget === "right"
                    ? { top: TOPBAR_HEIGHT + 8, right: 8, width: sideWidth, bottom: 8, borderRadius: 12 }
                    : { top: TOPBAR_HEIGHT + 8, left: sidebarPx + 8, width: sideWidth, bottom: 8, borderRadius: 12 }
              }
            >
              <div className="flex flex-col items-center gap-1.5 text-primary">
                <span className="text-lg">
                  {dragTarget === "bottom" ? "⬇" : dragTarget === "left" ? "⬅" : "➡"}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider opacity-80">
                  Dock {dragTarget}
                </span>
              </div>
            </div>
          ) : (
            /* Subtle edge hints when nothing targeted yet */
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground/50 font-medium">
                Drag to an edge to dock
              </span>
            </div>
          )}

          {/* Edge glow indicators */}
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 h-1 transition-all duration-200",
              dragTarget === "bottom" ? "bg-primary/60 h-1.5" : "bg-muted-foreground/15",
            )}
          />
          <div
            className={cn(
              "absolute right-0 w-1 transition-all duration-200",
              dragTarget === "right" ? "bg-primary/60 w-1.5" : "bg-muted-foreground/15",
            )}
            style={{ top: TOPBAR_HEIGHT, bottom: 0 }}
          />
          <div
            className={cn(
              "absolute w-1 transition-all duration-200",
              dragTarget === "left" ? "bg-primary/60 w-1.5" : "bg-muted-foreground/15",
            )}
            style={{ top: TOPBAR_HEIGHT, bottom: 0, left: sidebarPx }}
          />
        </div>
      )}

      {/* Context-aware quick action chips — bottom mode only, reserve space so bar doesn't shift */}
      {!isSideMode && (
        <div className={cn(
          "mt-1.5 flex flex-wrap justify-center gap-1.5 pointer-events-auto",
          (messages.length > 0 || isStreaming) && "invisible pointer-events-none",
        )}>
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
      )}


    </div>
  );
}
