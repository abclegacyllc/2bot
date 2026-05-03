/**
 * Cursor Agent Streaming Event Types
 *
 * Events yielded by the Cursor Agent's async generator as it works.
 * The frontend maps these to real-time choreography actions so the
 * user sees exactly what the agent is doing — no fake timers.
 *
 * Event lifecycle:
 *   session_start → [iteration_start → thinking → tool_start → tool_result]* → done|error
 *
 * Multi-Worker lifecycle (new):
 *   worker_start → [tool_start → tool_result]* → worker_switch → worker_start → ... → done|error
 *   ask_user → (SSE pauses, waits for user reply) → tool_result → ...
 *
 * @module modules/cursor/cursor-agent.types
 */

import type { UIAction } from "@/components/cursor/cursor.types";
import type { CursorWorkerType } from "./cursor-workers";

// ===========================================
// Streaming Events (Backend → Frontend via SSE)
// ===========================================

/**
 * Union of all events the Cursor Agent can emit.
 * Sent as SSE `data:` lines, parsed on the frontend.
 */
export type CursorAgentEvent =
  | CursorAgentSessionStart
  | CursorAgentIterationStart
  | CursorAgentThinking
  | CursorAgentToolStart
  | CursorAgentToolResult
  | CursorAgentCodePreview
  | CursorAgentStatus
  | CursorAgentDone
  | CursorAgentError
  // Multi-worker events (new)
  | CursorWorkerStartEvent
  | CursorWorkerSwitchEvent
  | CursorAskUserEvent
  // Suspend/Resume (session persistence)
  | CursorAgentSuspendedEvent
  // File action tracking (undo support)
  | CursorFileActionEvent
  // Diff preview (edit_file inline diff)
  | CursorDiffPreviewEvent
  // Structured plan / TODO tracking
  | CursorTodoUpdateEvent
  // Terminal command confirmation (Allow / Skip)
  | CursorTerminalConfirmEvent
  // Terminal command output (shown inline in chat)
  | CursorTerminalOutputEvent
  // Model fallback notification (shown when selected model is unavailable)
  | CursorModelFallbackEvent
  // Model fallback confirmation (asks user before switching models)
  | CursorModelConfirmEvent
  // Post-completion hand-off buttons (declarative agents)
  | CursorAgentHandoffsEvent
  // Wave 2: structured BuildSpec produced by the AI builder agent
  | CursorAgentBuildSpecEvent;

// --- Individual event types ---

/** Session started — agent is initializing */
export interface CursorAgentSessionStart {
  type: "session_start";
  sessionId: string;
  mode: "create" | "edit" | "analyze-repo";
  pluginSlug: string;
  pluginName: string;
  uiActions?: UIAction[];
}

/** New AI iteration starting */
export interface CursorAgentIterationStart {
  type: "iteration_start";
  iteration: number;
  totalCreditsUsed: number;
  /** Max credits allowed for this session (varies by worker + plan + repo mode) */
  creditBudget?: number;
}

/** AI is reasoning (text content from the LLM before tool calls) */
export interface CursorAgentThinking {
  type: "thinking";
  text: string;
  /** Internal chain-of-thought from reasoning models (separate from visible text) */
  reasoning?: string;
}

/** Agent is about to execute a tool */
export interface CursorAgentToolStart {
  type: "tool_start";
  tool: string;
  /** Tool-specific metadata for UI display */
  meta: ToolStartMeta;
  /**
   * Backend-driven UI actions. When present, the frontend uses these
   * directly instead of the client-side event mapper. This decouples
   * animations from frontend layout — no mapper or data-ai-target changes
   * needed when pages/tools change.
   */
  uiActions?: UIAction[];
}

/** Tool execution completed */
export interface CursorAgentToolResult {
  type: "tool_result";
  tool: string;
  success: boolean;
  /** Brief summary for UI display (NOT full output) */
  summary: string;
  /** Optional structured detail for enhanced UI (e.g. match count, line range) */
  resultDetail?: string;
  /** File content preview for read_file / write_file blocks */
  snippet?: string;
  /** Diff patch lines for edit_file blocks (formatted +/- lines) */
  patch?: string;
}

/** Code preview — emitted when write_file writes plugin code */
export interface CursorAgentCodePreview {
  type: "code_preview";
  /** File path relative to plugin dir */
  file: string;
  /** First ~500 chars of code for the typing animation */
  preview: string;
  /** Total bytes written */
  totalBytes: number;
}

/** Status message — generic progress update */
export interface CursorAgentStatus {
  type: "status";
  message: string;
}

/** Agent completed successfully */
export interface CursorAgentDone {
  type: "done";
  success: boolean;
  /**
   * Set when the session ended abnormally without the AI calling `finish`.
   * Values: "out_of_credits" | "consecutive_errors" | "broken_model" |
   *         "model_unavailable" | or a limit-error string.
   * When present, `success` is `false` and the frontend should show an
   * interrupted-session banner instead of a normal completion state.
   */
  stopReason?: string;
  sessionId: string;
  uiActions?: UIAction[];
  /** Plugin name created/edited */
  pluginName: string;
  pluginSlug: string;
  pluginId?: string;
  /** Summary of what was done */
  summary: string;
  /** Number of files created/modified */
  fileCount: number;
  /** Files that were written (relative paths) */
  filesWritten: string[];
  /** Total credits consumed */
  creditsUsed: number;
  /** The actual AI model used (provider model ID) */
  modelUsed?: string;
  /** Total duration in ms */
  durationMs: number;
  /** Entry file relative to plugin dir */
  entry: string;
  /** Was the plugin auto-bound to a gateway? */
  gatewayName?: string;
  /** Cumulative lines added across the session */
  totalLinesAdded?: number;
  /** Cumulative lines removed across the session */
  totalLinesRemoved?: number;
  /** Comma-separated file names (basenames only) for display */
  fileList?: string;
}

/** Agent failed */
export interface CursorAgentError {
  type: "error";
  message: string;
  sessionId?: string;
  /** Partial progress — files written before failure */
  filesWritten?: string[];
  creditsUsed?: number;
}

// ===========================================
// Multi-Worker Events (new)
// ===========================================

/** A specific worker has started running */
export interface CursorWorkerStartEvent {
  type: "worker_start";
  /** Which worker is now active */
  worker: CursorWorkerType;
  /** Display name (e.g. "Cursor Assistant", "Cursor Coder") */
  displayName: string;
  /** Session ID */
  sessionId: string;
  uiActions?: UIAction[];
}

/** Hand-off from one worker to another */
export interface CursorWorkerSwitchEvent {
  type: "worker_switch";
  /** Worker that's handing off */
  fromWorker: CursorWorkerType;
  /** Worker that will take over */
  toWorker: CursorWorkerType;
  /** Display name of the incoming worker */
  toDisplayName: string;
  /** Context passed to the new worker */
  context: string;
}

/** Worker is asking the user a question — SSE pauses until answer is received */
export interface CursorAskUserEvent {
  type: "ask_user";
  /** The question to display to the user */
  question: string;
  /** If true, the input should mask text (for secrets like bot tokens) */
  sensitive: boolean;
  /** Clickable answer options (last one is typically free-text) */
  options?: Array<{ label: string; value: string }>;
  /** Session ID (used to route the user's answer back) */
  sessionId: string;
  /**
   * True when the SSE stream is still open and the answer must be sent via
   * POST /cursor/worker-answer (resolveUserAnswer).  False / absent means the
   * session was suspended to DB and the answer resumes it as a new stream.
   */
  inFlight?: boolean;
}

/**
 * Session suspended — the AI needs a user answer but the stream closes.
 * The user can answer minutes, hours, or days later and resume the session.
 * Frontend should persist this state (e.g., localStorage) and offer a resume flow.
 */
export interface CursorAgentSuspendedEvent {
  type: "suspended";
  /** Session ID (used to resume) */
  sessionId: string;
  /** The question the AI was asking */
  question: string;
  /** Clickable answer options */
  options?: Array<{ label: string; value: string }>;
  /** If true, the input should mask text (for secrets) */
  sensitive: boolean;
}

/** Diff preview — emitted after edit_file so the user sees what changed */
export interface CursorDiffPreviewEvent {
  type: "diff_preview";
  /** File path relative to plugin dir */
  file: string;
  /** Simple unified-diff-style patch (added/removed lines) */
  patch: string;
  /** Number of edits applied */
  editCount: number;
  /** Cumulative lines added across the whole session */
  totalAdded?: number;
  /** Cumulative lines removed across the whole session */
  totalRemoved?: number;
  /** Cumulative files changed across the whole session */
  totalFiles?: number;
}

/** Structured TODO / plan tracking — shown as a collapsible checklist */
export interface CursorTodoUpdateEvent {
  type: "todo_update";
  items: Array<{
    id: string;
    title: string;
    status: "pending" | "in_progress" | "done";
  }>;
  /** Optional human-readable markdown plan body persisted alongside the checklist. */
  planMarkdown?: string;
}

/** Terminal command confirmation — agent wants to run a command, user must approve */
export interface CursorTerminalConfirmEvent {
  type: "terminal_confirm";
  sessionId: string;
  command: string;
  cwd?: string;
  toolCallId: string;
}

/** Terminal command output — emitted after run_command / validate_plugin execution */
export interface CursorTerminalOutputEvent {
  type: "terminal_output";
  command: string;
  output: string;
  exitCode: number;
  cwd?: string;
}

/** File action tracked for undo — emitted after each write_file or delete_file */
export interface CursorFileActionEvent {
  type: "file_action";
  action: {
    id: string;
    type: "created" | "modified" | "deleted";
    path: string;
    /** First lines of original content (for diff preview) */
    originalPreview: string | null;
    /** First lines of new content (for diff preview) */
    newPreview: string | null;
    toolCallId: string;
  };
}

/** Notifies user that their selected model was unavailable and a fallback is being used */
export interface CursorModelFallbackEvent {
  type: "model_fallback";
  /** The model the user originally selected (display name) */
  requestedModel: string;
  /** The model actually being used (display name) */
  fallbackModel: string;
  /** Canonical model ID for updating the selector (e.g., "google/gemini-2.5-flash") */
  fallbackModelId?: string;
  /** Why the original model was unavailable */
  reason: string;
}

/** Asks user for consent before switching to a fallback model (keeps stream open) */
export interface CursorModelConfirmEvent {
  type: "model_confirm";
  /** Session ID (used to route the user's answer back) */
  sessionId: string;
  /** Display name of the model that failed */
  failedModel: string;
}

/**
 * Post-completion hand-off buttons.
 *
 * Emitted right before `done` for declarative agents that declare
 * `handoffs:` in their frontmatter. The frontend renders these as
 * buttons under the final assistant message; clicking sends a new
 * worker-stream request with the chosen agent + prompt.
 *
 * This replaces the old mid-stream `hand_off_to_coder` /
 * `hand_off_to_assistant` tools — the previous agent finishes cleanly,
 * the user explicitly opts in to the next agent.
 */
export interface CursorAgentHandoffsEvent {
  type: "handoffs";
  /** Source agent that finished */
  fromAgent: string;
  /** Buttons to render under the final assistant message */
  options: Array<{
    /** Button label */
    label: string;
    /** Target agent name (e.g. "agent", "ask", "plan") */
    agent: string;
    /** Initial prompt to send to the target agent */
    prompt: string;
  }>;
}

/**
 * BuildSpec event.
 *
 * Emitted by the AI Builder agent when it has produced a complete BuildSpec
 * for the user to review. The frontend renders this as a structured block
 * with a summary (counts of gateways/plugins/workflows) and an "Apply" button
 * that POSTs the spec to `/api/ai-builder/apply`.
 *
 * The full spec is sent verbatim so the frontend can pass it back to apply
 * without any round-trip through SSE state.
 */
export interface CursorAgentBuildSpecEvent {
  type: "buildspec";
  /** Free-form BuildSpec object — validated server-side on apply. */
  spec: unknown;
  /** Optional human-readable explanation rendered above the summary. */
  summary?: string;
}

// ===========================================
// Tool Start Metadata (per-tool UI hints)
// ===========================================

export type ToolStartMeta =
  // ── Coder tools (workspace) ─────────────────────────
  | { kind: "read_file"; path: string; startLine?: number; endLine?: number }
  | { kind: "write_file"; path: string; bytes: number }
  | { kind: "edit_file"; path: string; editCount: number; linesAdded?: number; linesRemoved?: number }
  | { kind: "list_files"; path: string }
  | { kind: "create_directory"; path: string }
  | { kind: "delete_file"; path: string }
  | { kind: "run_command"; command: string }
  | { kind: "search_files"; pattern: string; filePattern?: string }
  | { kind: "find_usages"; symbol: string }
  // ── Shared platform query tools ─────────────────────
  | { kind: "list_gateways" }
  | { kind: "list_user_plugins" }
  // ── Coder plugin management tools ───────────────────
  | { kind: "create_plugin_record"; name: string }
  | { kind: "update_plugin_record"; name: string }
  | { kind: "restart_plugin"; slug: string }
  | { kind: "finish"; summary: string }
  // ── Assistant platform tools (new) ──────────────────
  | { kind: "check_credits" }
  | { kind: "check_billing" }
  | { kind: "check_usage" }
  | { kind: "create_gateway"; name: string }
  | { kind: "delete_gateway"; name: string }
  | { kind: "install_plugin"; slug: string }
  | { kind: "uninstall_plugin"; name: string }
  | { kind: "toggle_plugin"; name: string; enable: boolean }
  | { kind: "start_workspace" }
  | { kind: "stop_workspace" }
  | { kind: "restart_workspace" }
  | { kind: "get_workspace_status" }
  | { kind: "update_gateway"; gatewayId: string }
  | { kind: "view_plugin_config"; name: string }
  | { kind: "search_marketplace"; query: string }
  | { kind: "get_gateway_metrics"; gatewayId: string }
  | { kind: "get_workspace_logs" }
  | { kind: "get_workspace_metrics" }
  | { kind: "clone_plugin"; sourceSlug: string; newSlug: string }
  | { kind: "navigate_page"; path: string }
  // ── Shared interaction tools (new) ──────────────────
  | { kind: "ask_user"; question: string }
  | { kind: "hand_off"; targetWorker: string; context: string }
  // ── Semantic search & docs tools ─────────────────────
  | { kind: "find_relevant_code"; query: string }
  | { kind: "search_docs"; query: string }
  | { kind: "search_codebase"; query: string }
  // ── Plan / TODO tracking ─────────────────────────────
  | { kind: "update_plan"; itemCount: number; currentStep?: string; currentIndex?: number }
  // ── Tools that were missing (caused "Running unknown...") ──
  | { kind: "think"; reasoning: string }
  | { kind: "file_stat"; path: string }
  | { kind: "workspace_summary" }
  | { kind: "get_outlines"; fileCount: number }
  | { kind: "validate_plugin"; slug: string }
  | { kind: "ensure_dependencies"; slug: string }
  | { kind: "view_plugin_logs"; slug: string }
  | { kind: "explain_error"; error: string }
  | { kind: "check_gateway_status"; gatewayId: string }
  | { kind: "list_templates" }
  // ── Fallback ────────────────────────────────────────
  | { kind: "unknown"; tool: string };
