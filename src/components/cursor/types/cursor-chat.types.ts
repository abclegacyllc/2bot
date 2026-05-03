/**
 * Shared types for the Cursor chat system.
 *
 * Used by both the CursorPanel (main dashboard) and CursorStudioBar (studio).
 *
 * @module components/cursor/types/cursor-chat.types
 */

import type { RealModelOption } from "@/components/shared/model-selector";
import type { CursorAgentEvent } from "@/modules/cursor/cursor-agent.types";
import type { CursorWorkerType } from "@/modules/cursor/cursor-workers";
import type { WorkerStreamClientRequest } from "../cursor-brain";

/** Unified chat message — used by both CursorPanel and CursorStudioBar */
/** A single content block in an assistant message's inline chain */
export type MessageBlock =
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; description: string; status: "running" | "done" | "error"; snippet?: string; patch?: string; fullPath?: string }
  | { kind: "group"; label: string; items: MessageBlock[]; collapsed?: boolean }
  | { kind: "status"; text: string }
  | { kind: "terminal"; command: string; output: string; exitCode: number; cwd?: string }
  | { kind: "confirm"; sessionId: string; command: string; resolved?: "allowed" | "skipped" }
  | {
      kind: "ask";
      sessionId: string;
      question: string;
      options?: Array<{ label: string; value: string }>;
      sensitive?: boolean;
      /** Set when the user picks an option — the block then renders a "answered" badge */
      resolved?: { value: string; label: string };
    }
  | {
      /**
       * BuildSpec block. Rendered with a summary of the
       * proposed project (counts of gateways/plugins/workflows) plus an
       * "Apply" button that POSTs the spec to `/api/ai-builder/apply`.
       */
      kind: "buildspec";
      /** Stable id so the block can transition status (idle → applying → applied/error). */
      id: string;
      /** The full BuildSpec object — opaque to the renderer, sent back on Apply. */
      spec: unknown;
      /** Optional summary text rendered above the resource counts. */
      summary?: string;
      /** Apply state machine. */
      status: "idle" | "applying" | "applied" | "rolled-back" | "error";
      /** Result returned from `/api/ai-builder/apply`, set on success or rollback. */
      result?: unknown;
      /** Error message, set when status === "error". */
      error?: string;
    };

export interface CursorChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Extra structured detail (e.g., gateway name, file stats) */
  detail?: string;
  /** Internal reasoning / chain-of-thought from reasoning models (used by Panel) */
  reasoning?: string;
  /** The AI model that produced this message (set on done) */
  modelUsed?: string;
  /** Credits consumed by this response (set on done) */
  creditsUsed?: number;
  status?: "thinking" | "working" | "success" | "error";
  timestamp: Date;
  /** Inline activity blocks (tool-call narrative chain) */
  blocks?: MessageBlock[];
  /** Attached repo (from Import Code) — shown as badge in user message bubble */
  attachment?: { type: "repo"; url: string; label: string };
  /** Attached images — shown as thumbnails in user message bubble */
  imageParts?: Array<{ url: string; mimeType: string }>;
  /**
   * Post-completion hand-off buttons (declarative agents).
   * When the agent finishes, the runner emits a `handoffs` SSE event
   * that the stream hook stores here. The chat surface renders these
   * as buttons under the final assistant message.
   */
  handoffs?: Array<{
    label: string;
    /** Target agent name (e.g. "agent", "ask", "plan") */
    agent: string;
    /** Initial prompt to send to the target agent when clicked */
    prompt: string;
  }>;
}

/** Activity feed item — tracks individual tool operations for progressive visibility */
export interface ActivityItem {
  id: string;
  kind: "tool" | "thinking" | "status";
  description: string;
  status: "running" | "done" | "error";
  errorDetail?: string;
  /** Iteration number for grouping */
  iteration?: number;
}

/** State for when the AI asks the user a question mid-stream */
export interface AskUserPending {
  sessionId: string;
  sensitive: boolean;
  question?: string;
  options?: Array<{ label: string; value: string }>;
  /** Whether the user toggled free-text input mode (Studio-only) */
  freetextActive?: boolean;
  /**
   * True when the SSE stream is still open (in-flight ask_user).
   * Answer must be sent via POST /cursor/worker-answer, NOT a new resumeSessionId stream.
   */
  inFlight?: boolean;
}

/** Configuration for the useCursorStream hook */
export interface CursorStreamConfig {
  /** localStorage key for persisting messages */
  storageKey: string;
  /** localStorage key for model preference */
  modelStorageKey: string;
  /** localStorage key for suspended session state */
  suspendedStorageKey: string;
  /** Max messages to persist in localStorage (default: 30) */
  messageLimit?: number;
  /** Prefix for generated message IDs (default: "msg") */
  idPrefix?: string;
  /** Auth token for API calls (falls back to localStorage if omitted) */
  token?: string;
  /** Organization ID for org-context credit usage */
  organizationId?: string;
  /**
   * Callback fired for each SSE event AFTER the hook has applied shared state updates.
   * Components use this for their unique side-effects:
   * - Panel: cursor animations, sounds, session history, diff_preview, file_action, etc.
   * - Studio: fetchWorkflow after mutation tools
   */
  onWorkerEvent?: (event: CursorAgentEvent, assistantMsgId: string | null) => void;
}

/** Return type of the useCursorStream hook */
export interface CursorStreamReturn {
  // ── State ──
  messages: CursorChatMessage[];
  isStreaming: boolean;
  askUserPending: AskUserPending | null;
  setAskUserPending: React.Dispatch<React.SetStateAction<AskUserPending | null>>;
  activityLog: ActivityItem[];
  creditsUsed: number;
  currentIteration: number;
  creditBudget: number;
  activeWorker: { type: CursorWorkerType; displayName: string } | null;
  // ── Model ──
  selectedModel: string;
  realModels: RealModelOption[];
  handleModelChange: (modelId: string) => void;
  // ── Repo URL ──
  repoUrl: string;
  setRepoUrl: React.Dispatch<React.SetStateAction<string>>;
  showRepoInput: boolean;
  setShowRepoInput: React.Dispatch<React.SetStateAction<boolean>>;
  showImportCode: boolean;
  setShowImportCode: React.Dispatch<React.SetStateAction<boolean>>;
  /** Repo URL persisted for the whole chat session (survives across individual sends) */
  sessionRepoUrl: string;
  setSessionRepoUrl: (url: string) => void;
  // ── Message helpers ──
  addMessage: (msg: Omit<CursorChatMessage, "id" | "timestamp">) => string;
  updateMessage: (id: string, updates: Partial<CursorChatMessage>) => void;
  clearMessages: () => void;
  // ── Stream control ──
  executeStream: (request: Partial<WorkerStreamClientRequest> & { message: string }) => Promise<void>;
  submitAnswer: (answer: string, resumeSessionId: string, extraRequestFields?: Partial<WorkerStreamClientRequest>) => Promise<void>;
  cancelStream: () => void;
  sendCorrection: (sessionId: string, correction: string) => Promise<void>;
  retryFromMessage: (assistantMsgId: string, extraRequestFields?: Partial<WorkerStreamClientRequest>) => Promise<string | null>;
  editAndResend: (userMsgId: string, newContent: string, extraRequestFields?: Partial<WorkerStreamClientRequest>) => Promise<boolean>;
  /** Replay a raw SSE event through the handler (used by Panel reconnect logic) */
  replayEvents: (events: Array<Record<string, unknown>>, targetMsgId: string) => void;
  // ── Checkpoints ──
  checkpoints: import("../cursor-checkpoints").Checkpoint[];
  restoreToCheckpoint: (checkpointIndex: number) => { checkpoint: import("../cursor-checkpoints").Checkpoint; filesToRevert: import("../cursor-checkpoints").FileActionSnapshot[] } | null;
  trackFileAction: (action: import("../cursor-checkpoints").FileActionSnapshot) => void;
  resolveConfirmBlock: (msgId: string, sessionId: string, approved: boolean) => void;
  resolveAskBlock: (sessionId: string, value: string, label: string) => void;
  /**
   * patch the lifecycle status of a BuildSpec block so the
   * chat UI can reflect idle → applying → applied | rolled-back | error.
   */
  updateBuildSpecBlock: (
    blockId: string,
    patch: Partial<{
      status: "idle" | "applying" | "applied" | "rolled-back" | "error";
      result: unknown;
      error: string;
    }>,
  ) => void;
  // ── Conversation history (read-only for users) ──
  conversationSnapshots: import("../cursor-conversation-log").ConversationSnapshot[];
  fileActionCount: number;
}
