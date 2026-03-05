/**
 * 2Bot AI Agent Types
 *
 * Core types for the agentic AI loop that connects 2Bot AI's
 * function calling capability to workspace containers via the bridge agent.
 *
 * Architecture:
 *   User Prompt → AI (with tools) → tool_use → Bridge Agent → tool_result → AI → ...
 *
 * @module modules/2bot-ai-agent/agent.types
 */

// ===========================================
// Tool Definition Types (sent to AI providers)
// ===========================================

/**
 * JSON Schema for tool parameters.
 * Follows the JSON Schema spec used by OpenAI and Anthropic function calling.
 */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: { type: string };
  default?: unknown;
}

/**
 * A tool definition that the AI can call.
 * Maps 1:1 to a bridge agent action or a composite of actions.
 */
export interface AgentToolDefinition {
  /** Tool name (used in AI function calling) */
  name: string;
  /** Human-readable description (helps AI decide when to use this tool) */
  description: string;
  /** JSON Schema for the tool's input parameters */
  parameters: ToolParameterSchema;
}

// ===========================================
// Tool Call Types (AI ↔ Provider communication)
// ===========================================

/**
 * A tool call requested by the AI model.
 * Returned in the AI response when finishReason === "tool_use".
 */
export interface AgentToolCall {
  /** Unique ID for this tool call (from the AI provider) */
  id: string;
  /** Tool name (matches AgentToolDefinition.name) */
  name: string;
  /** Parsed arguments (matches the tool's parameter schema) */
  arguments: Record<string, unknown>;
}

/**
 * Result of executing a tool call via the bridge agent.
 * Fed back to the AI as a tool_result message.
 */
export interface AgentToolResult {
  /** Matching tool call ID */
  toolCallId: string;
  /** Tool name (for logging/display) */
  toolName: string;
  /** Output from the bridge agent (string for display, or structured data) */
  output: string;
  /** Whether the tool execution failed */
  isError: boolean;
  /** Execution duration in milliseconds */
  durationMs: number;
}

// ===========================================
// Agent Session Types
// ===========================================

export type AgentSessionStatus =
  | "running"            // Actively processing iterations
  | "completed"          // Finished successfully (AI returned text, no more tool calls)
  | "awaiting_approval"  // Paused, waiting for user to approve a terminal command
  | "max_iterations"     // Hit iteration limit
  | "max_credits"        // Hit credit cap
  | "error"              // Failed with an error
  | "cancelled";         // User cancelled

/**
 * An agent session tracks the full lifecycle of an agent task.
 * One user prompt → multiple AI iterations → multiple tool calls → final response.
 */
export interface AgentSession {
  /** Unique session ID */
  id: string;
  /** User who started this session */
  userId: string;
  /** Organization context (for credit deduction) */
  organizationId?: string;
  /** Workspace this agent is operating on */
  workspaceId: string;
  /** Current status */
  status: AgentSessionStatus;
  /** Number of AI iterations completed */
  iterationCount: number;
  /** Total tool calls executed */
  toolCallCount: number;
  /** Total credits consumed across all iterations */
  totalCreditsUsed: number;
  /** Token usage across all iterations */
  totalTokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** All tool calls in this session (ordered) */
  toolCalls: AgentToolResult[];
  /** Final text response from the AI (populated when status === "completed") */
  finalResponse?: string;
  /** Error message (populated when status === "error") */
  error?: string;
  /** Timestamps */
  startedAt: Date;
  completedAt?: Date;
}

// ===========================================
// Agent Configuration
// ===========================================

/**
 * Configuration for an agent session.
 * Controls safety limits and behavior.
 */
export interface AgentConfig {
  /** Maximum number of AI iterations (tool_use → tool_result → AI cycles) */
  maxIterations: number;
  /** Maximum total credits that can be consumed in one session */
  maxCreditsPerSession: number;
  /** Maximum number of tool calls per single AI iteration */
  maxToolCallsPerIteration: number;
  /** Timeout for individual tool execution (ms) */
  toolExecutionTimeoutMs: number;
  /** Timeout for the entire agent session (ms) */
  sessionTimeoutMs: number;
}

/** Default agent configuration */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 25,
  maxCreditsPerSession: 50,
  maxToolCallsPerIteration: 10,
  toolExecutionTimeoutMs: 30_000,    // 30 seconds per tool
  sessionTimeoutMs: 300_000,         // 5 minutes total
};

// ===========================================
// Agent Request / Response
// ===========================================

/**
 * Request to start an agent session.
 */
export interface AgentRequest {
  /** User's prompt / task description */
  prompt: string;
  /** Conversation history (optional, for context) */
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  /** 2Bot AI model to use (must have functionCalling: true → Pro or Ultra tier) */
  model: string;
  /** Workspace ID to operate on */
  workspaceId: string;
  /** User ID */
  userId: string;
  /** Organization ID (for org-level credits) */
  organizationId?: string;
  /** Override default config */
  config?: Partial<AgentConfig>;
}

/**
 * Final response from a completed agent session.
 */
export interface AgentResponse {
  /** Session ID */
  sessionId: string;
  /** Final status */
  status: AgentSessionStatus;
  /** Final text response from AI */
  content: string;
  /** Total iterations used */
  iterationCount: number;
  /** Total tool calls executed */
  toolCallCount: number;
  /** Total credits consumed */
  totalCreditsUsed: number;
  /** Total token usage */
  totalTokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Summary of all tool calls (for UI display) */
  toolCallSummary: AgentToolResult[];
  /** Duration in milliseconds */
  durationMs: number;
}

// ===========================================
// SSE Stream Event Types (Server → Client)
// ===========================================

/**
 * SSE events streamed to the client during an agent session.
 * Each event is a JSON object sent as `data: {...}\n\n`.
 */
export type AgentStreamEvent =
  | AgentIterationStartEvent
  | AgentTextDeltaEvent
  | AgentToolUseStartEvent
  | AgentToolUseResultEvent
  | AgentFileActionEvent
  | AgentApprovalRequestEvent
  | AgentUIActionEvent
  | AgentDoneEvent
  | AgentErrorEvent;

export interface AgentIterationStartEvent {
  type: "iteration_start";
  iteration: number;
  /** Running totals at this point */
  creditsUsed: number;
  toolCallsCount: number;
}

export interface AgentTextDeltaEvent {
  type: "text_delta";
  delta: string;
}

export interface AgentToolUseStartEvent {
  type: "tool_use_start";
  toolCall: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
}

export interface AgentToolUseResultEvent {
  type: "tool_use_result";
  toolCallId: string;
  toolName: string;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface AgentDoneEvent {
  type: "done";
  sessionId: string;
  status: AgentSessionStatus;
  totalCreditsUsed: number;
  iterationCount: number;
  toolCallsCount: number;
  totalTokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
  durationMs: number;
}

export interface AgentErrorEvent {
  type: "error";
  error: string;
  code: string;
  /** Partial results if the session was in progress */
  sessionId?: string;
  iterationCount?: number;
  toolCallsCount?: number;
  creditsUsed?: number;
}

/**
 * SSE event: AI Visual Cursor action.
 * Tells the frontend to move the Cursor, highlight elements,
 * navigate pages, or request secrets.
 */
export interface AgentUIActionEvent {
  type: "ui_action";
  /** The UI action payload — matches UIAction type from cursor.types */
  payload: Record<string, unknown>;
}

// ===========================================
// AI Actions & Approval Types
// ===========================================

/**
 * Type of file modification performed by the agent.
 */
export type AgentFileActionType = "created" | "modified" | "deleted" | "renamed";

/**
 * A tracked file modification performed by the AI agent.
 * Stores before/after content for diff display and one-click restore.
 */
export interface AgentFileAction {
  /** Unique action ID */
  id: string;
  /** What kind of change */
  type: AgentFileActionType;
  /** File path that was affected */
  path: string;
  /** For renames: the new path */
  newPath?: string;
  /** Original file content before AI modification (null if file was created) */
  originalContent: string | null;
  /** New file content after AI modification (null if file was deleted) */
  newContent: string | null;
  /** Whether the original content was truncated (large files) */
  contentTruncated?: boolean;
  /** Matching tool call ID */
  toolCallId: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * SSE event: AI modified a file (non-blocking, for tracking).
 * Sent AFTER the modification is executed.
 */
export interface AgentFileActionEvent {
  type: "file_action";
  action: {
    id: string;
    type: AgentFileActionType;
    path: string;
    newPath?: string;
    /** First N lines of original content for diff display */
    originalPreview: string | null;
    /** First N lines of new content for diff display */
    newPreview: string | null;
    toolCallId: string;
  };
}

/**
 * SSE event: Agent wants to run a terminal command and needs approval.
 * Sent BEFORE execution — agent loop pauses until user responds.
 */
export interface AgentApprovalRequestEvent {
  type: "approval_request";
  /** Session ID (needed for the approve POST) */
  sessionId: string;
  /** Tool call ID (needed for the approve POST) */
  toolCallId: string;
  /** Tool name (run_command, install_package, git_clone) */
  toolName: string;
  /** Tool arguments (command string, package list, etc.) */
  input: Record<string, unknown>;
}

/**
 * Response from user for an approval request.
 */
export interface AgentApprovalResponse {
  approved: boolean;
}

/**
 * Result of restoring AI file actions from a session.
 */
export interface AgentRestoreResult {
  /** Number of files successfully restored */
  restoredCount: number;
  /** Number of files skipped due to conflicts */
  conflictCount: number;
  /** Details per file */
  details: Array<{
    actionId: string;
    path: string;
    type: AgentFileActionType;
    status: "restored" | "conflict" | "error";
    /** For conflicts: current content differs from what AI wrote */
    message?: string;
  }>;
}
