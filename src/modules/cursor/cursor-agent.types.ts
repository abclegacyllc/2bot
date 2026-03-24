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
  | CursorAskUserEvent;

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
}

/** AI is reasoning (text content from the LLM before tool calls) */
export interface CursorAgentThinking {
  type: "thinking";
  text: string;
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
  /** Total duration in ms */
  durationMs: number;
  /** Entry file relative to plugin dir */
  entry: string;
  /** Was the plugin auto-bound to a gateway? */
  gatewayName?: string;
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
  /** Session ID (used to route the user's answer back) */
  sessionId: string;
}

// ===========================================
// Tool Start Metadata (per-tool UI hints)
// ===========================================

export type ToolStartMeta =
  // ── Coder tools (workspace) ─────────────────────────
  | { kind: "read_file"; path: string }
  | { kind: "write_file"; path: string; bytes: number }
  | { kind: "list_files"; path: string }
  | { kind: "create_directory"; path: string }
  | { kind: "delete_file"; path: string }
  | { kind: "run_command"; command: string }
  | { kind: "search_files"; pattern: string }
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
  | { kind: "navigate_page"; path: string }
  // ── Shared interaction tools (new) ──────────────────
  | { kind: "ask_user"; question: string }
  | { kind: "hand_off"; targetWorker: string; context: string }
  // ── Fallback ────────────────────────────────────────
  | { kind: "unknown"; tool: string };
