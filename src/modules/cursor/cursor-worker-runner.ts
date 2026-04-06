/**
 * Cursor Worker Runner — Multi-Worker Agentic Loop
 *
 * Generic streaming agent loop that supports both Cursor Assistant and
 * Cursor Coder workers. Each worker has focused tools, system prompts,
 * and iteration limits. Workers can hand off to each other and ask
 * the user questions mid-stream.
 *
 * Architecture:
 *   POST /api/cursor/worker-stream
 *     → routeToWorker(message) picks initial worker
 *     → runWorkerStream() yields CursorAgentEvent
 *     → SSE → cursor-panel.tsx → mapAgentEventToActions() → cursor-provider
 *
 *   POST /api/cursor/worker-answer
 *     → resolveUserAnswer(sessionId, answer)
 *     → unblocks the paused generator
 *
 * @module modules/cursor/cursor-worker-runner
 */

import crypto from "crypto";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  checkSessionLimits,
  truncateToolOutput,
  validateToolCallArgs,
} from "@/modules/2bot-ai-agent/agent-safety";
import * as agentSessionService from "@/modules/2bot-ai-agent/agent-session.service";
import { canResolveTwoBotAIModel, twoBotAIProvider } from "@/modules/2bot-ai-provider";
import { withRetry } from "@/modules/2bot-ai-provider/retry.util";
import type { TextGenerationMessage, ToolDefinition } from "@/modules/2bot-ai-provider/types";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

import type { UIAction } from "@/components/cursor/cursor.types";
import type {
  CursorAgentEvent,
  ToolStartMeta,
} from "./cursor-agent.types";
import { getBridgeClient, withBridgeRetry } from "./cursor-bridge";
import { initSession as initFileTracking, readFileForBackup, trackFileAction } from "./cursor-file-actions";
import { getWorkerTools } from "./cursor-worker-tools";
import type { CursorWorkerType, WorkerPromptContext } from "./cursor-workers";
import {
  WORKER_META,
  buildAssistantSystemPrompt,
  buildCoderSystemPrompt,
  getAdaptiveWorkerMeta,
  routeToWorker,
} from "./cursor-workers";
import type { RepoAnalysis } from "./repo-analyzer.service";

const workerLog = logger.child({ module: "cursor", capability: "worker" });

// ===========================================
// Public Types
// ===========================================

/** Request to start a worker stream */
export interface WorkerStreamRequest {
  /** The user's message */
  message: string;
  /** User ID for billing + workspace access */
  userId: string;
  /** Org scope (null for personal) */
  organizationId: string | null;
  /** Optional: override worker type (skip heuristic) */
  workerType?: CursorWorkerType;
  /** Optional: plugin context for coding tasks */
  pluginSlug?: string;
  pluginName?: string;
  mode?: "create" | "edit" | "analyze-repo";
  /** Optional: AI model ID (defaults to "auto") */
  modelId?: string;
  /** Optional: GitHub repo URL to analyze and generate a plugin from */
  repoUrl?: string;
  /** Optional: branch to clone (defaults to default branch) */
  repoBranch?: string;
  /** Optional: user description of what they want from the repo */
  description?: string;
  /** Optional: workflow context for Studio AI operations */
  workflowContext?: WorkflowContext;
  /** Optional: studio mode — controls tool availability and prompt behavior */
  studioMode?: "agent" | "ask" | "plan";
  /** Optional: resume a suspended session. Message becomes the user's answer. */
  resumeSessionId?: string;
}

/** Workflow context passed from Studio via CursorStudioBar */
export interface WorkflowContext {
  workflowId: string;
  workflowName: string;
  triggerType: string;
  botName?: string;
  steps: Array<{
    id: string;
    order: number;
    name: string;
    pluginSlug: string;
    isEnabled: boolean;
    entryFile?: string;
  }>;
}

/**
 * State blob saved to DB when a session is suspended.
 * Contains everything needed to resume the agentic loop from where it left off.
 */
export interface SuspendedSessionState {
  // Worker context
  currentWorker: CursorWorkerType;
  handOffCount: number;
  handOffContext?: string;

  // Plugin context (mutable during session)
  pluginSlug?: string;
  pluginName?: string;
  pluginMode?: "create" | "edit";
  pluginDir: string;
  pluginId?: string;

  // Repo analysis (computed once, reused)
  repoAnalysis?: RepoAnalysis;
  repoCloneDir?: string;

  // Session metrics (accumulated)
  totalIterations: number;
  totalToolCalls: number;
  totalCreditsUsed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCallSequence: number;
  pausedMs: number;

  // File tracking
  writtenFiles: Record<string, string>;

  // For done event
  lastAssistantText?: string;

  // Original request params (needed for tool defs, model routing, etc.)
  studioMode?: "agent" | "ask" | "plan";
  hasWorkflowContext: boolean;
  workflowContext?: WorkflowContext;
  modelId?: string;
  repoUrl?: string;
}

// ===========================================
// Ask-User Answer Mechanism
// ===========================================

interface PendingAnswer {
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
  /** The userId that owns this session (defense-in-depth) */
  userId: string;
}

/** In-memory map of sessionId → pending answer resolver */
const pendingAnswers = new Map<string, PendingAnswer>();

/** Wait for the user to answer a question. Rejects after timeout. */
function waitForUserAnswer(sessionId: string, userId: string, timeoutMs = 600_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingAnswers.delete(sessionId);
      reject(new Error("User did not respond within the time limit"));
    }, timeoutMs);
    pendingAnswers.set(sessionId, { resolve, reject, timeout, userId });
  });
}

/**
 * Resolve a pending ask_user question with the user's answer.
 * Called from the POST /api/cursor/worker-answer route.
 */
export function resolveUserAnswer(sessionId: string, answer: string, userId?: string): boolean {
  const pending = pendingAnswers.get(sessionId);
  if (!pending) return false;

  // Defense-in-depth: verify the answering user owns this session
  if (userId && pending.userId !== userId) {
    workerLog.warn(
      { sessionId, expected: pending.userId, actual: userId },
      "Session ownership mismatch on worker-answer",
    );
    return false;
  }

  clearTimeout(pending.timeout);
  pending.resolve(answer);
  pendingAnswers.delete(sessionId);
  return true;
}

/** Cancel any pending answer (e.g., when the SSE connection closes) */
function cancelPendingAnswer(sessionId: string): void {
  const pending = pendingAnswers.get(sessionId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Session cancelled"));
    pendingAnswers.delete(sessionId);
  }
}

// ===========================================
// Plugin Context Extraction (from natural language)
// ===========================================

/**
 * Extract plugin slug, name, and mode from the user's message.
 *
 * When the frontend routes directly to Coder (e.g., "edit my echo-bot"),
 * the request won't have pluginSlug/mode. This heuristic extracts them
 * so the Coder gets the right system prompt (edit vs create workflow)
 * and knows which plugin directory to target.
 */
function extractPluginContext(message: string): {
  slug?: string;
  name?: string;
  mode?: "create" | "edit";
} {
  const lower = message.toLowerCase();

  // Detect mode from keywords
  let mode: "create" | "edit" | undefined;
  if (/\b(edit|change|modify|fix|improve|update|refactor|tweak|adjust|check|audit|review|analy[zs]e)\b/i.test(lower)) {
    mode = "edit";
  } else if (/\b(create|build|make|write|develop|new)\b.*\bplugin\b/i.test(lower)) {
    mode = "create";
  }

  // Try to extract a plugin name/slug
  // Patterns: "edit my echo-bot", "fix the weather-plugin", "improve quiz bot code",
  //           "edit echo-bot plugin", "my echo-bot plugin"
  let slug: string | undefined;
  let name: string | undefined;

  // "edit/fix/improve <name> plugin" or "edit plugin <name>"
  const namedMatch = message.match(
    /\b(?:edit|change|modify|fix|improve|update|check|audit|review|analy[zs]e|refactor)\b[\s]+(?:the\s+|my\s+)?([a-z0-9][\w-]*(?:\s+[a-z0-9][\w-]*){0,3})(?:\s+plugin)?/i
  );
  if (namedMatch?.[1]) {
    const raw = namedMatch[1].trim();
    // Don't match very generic words
    const generic = /^(a|the|my|this|that|some|all|code|plugin|plugins|it|bot)$/i;
    if (!generic.test(raw)) {
      name = raw;
      slug = raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    }
  }

  return { slug, name, mode };
}

// ===========================================
// Context Window Pruning
// ===========================================

/** Iteration threshold after which pruning kicks in */
const PRUNE_AFTER_ITERATION = 4;

/** Number of recent exchange pairs to keep intact */
const KEEP_RECENT_PAIRS = 2;

/**
 * Prune old messages to cap context window growth.
 *
 * After PRUNE_AFTER_ITERATION iterations, old tool results and assistant messages
 * are compressed into brief summaries. Keeps:
 * - messages[0]: system prompt (always)
 * - messages[1]: original user message (always)
 * - A rolling context summary of ALL old exchanges
 * - Last KEEP_RECENT_PAIRS exchange pairs intact (full detail)
 *
 * This is deterministic string processing — NO LLM call needed.
 */
function pruneMessages(
  messages: TextGenerationMessage[],
  keepRecent: number = KEEP_RECENT_PAIRS,
): TextGenerationMessage[] {
  // Need at least system + user + some history to prune
  if (messages.length <= 2 + keepRecent * 2) return messages;

  const system = messages[0]!;   // system prompt
  const userMsg = messages[1]!;  // original user message

  // Everything after the first two messages is the conversation
  const conversation = messages.slice(2);

  // Count exchange boundaries: each assistant message starts a new exchange
  // An exchange = 1 assistant message + N tool result messages after it
  const exchangeStarts: number[] = [];
  for (let i = 0; i < conversation.length; i++) {
    if (conversation[i]!.role === "assistant") {
      exchangeStarts.push(i);
    }
  }

  // If fewer exchanges than keepRecent, nothing to prune
  if (exchangeStarts.length <= keepRecent) return messages;

  // Split: old exchanges (to summarize) vs recent (to keep intact)
  const cutoffExchangeIdx = exchangeStarts.length - keepRecent;
  const cutoffMsgIdx = exchangeStarts[cutoffExchangeIdx]!;

  const oldMessages = conversation.slice(0, cutoffMsgIdx);
  const recentMessages = conversation.slice(cutoffMsgIdx);

  // Build a richer rolling summary that preserves decision context
  const summaryLines: string[] = [];
  const filesRead: string[] = [];
  const filesWritten: string[] = [];
  const toolsUsed = new Set<string>();
  const decisions: string[] = [];
  const userAnswers: string[] = [];

  for (const msg of oldMessages) {
    if (msg.role === "assistant") {
      // Capture key decisions and actions from assistant text (first 200 chars)
      const text = msg.content.trim();
      if (text.length > 0) {
        // Grab the substantive first sentence/paragraph
        const firstPara = text.split("\n\n")[0]?.slice(0, 200) || text.slice(0, 200);
        decisions.push(firstPara);
      }
    } else if (msg.role === "user") {
      // Tool results — extract tool name, files, and key outcomes
      const toolMatch = msg.content.match(/^\[(✅ TOOL RESULT|❌ TOOL ERROR|⚠️ SYSTEM ERROR):?\s*([^\]]*)\]/);
      if (toolMatch) {
        const toolName = toolMatch[2] || "unknown";
        toolsUsed.add(toolName);

        if (toolName === "read_file" || toolName === "get_file_outline" || toolName === "get_function") {
          // Extract the file path from the result
          const pathMatch = msg.content.match(/(?:read_file|get_file_outline|get_function)\]\s*\n?(.+?)[\n:]/);
          if (pathMatch) filesRead.push(pathMatch[1]!.trim().slice(0, 80));
        }
        if (toolName === "write_file" || toolName === "edit_file") {
          const pathMatch = msg.content.match(/(?:Written|Edited):?\s*(.+?)[\n\s]/);
          if (pathMatch) filesWritten.push(pathMatch[1]!.trim().slice(0, 80));
        }
      } else if (!msg.content.startsWith("[")) {
        // This is a user answer to ask_user
        const answer = msg.content.trim().slice(0, 150);
        if (answer) userAnswers.push(answer);
      }
    }
  }

  // Build a structured summary that's easy for ANY model to follow
  summaryLines.push(`[ROLLING CONTEXT — ${cutoffExchangeIdx} earlier exchanges compressed]`);
  summaryLines.push("");

  if (decisions.length > 0) {
    summaryLines.push("Actions taken so far:");
    // Keep the last N decisions (most relevant), trim old ones shorter
    const recentDecisions = decisions.slice(-6);
    for (const d of recentDecisions) {
      summaryLines.push(`• ${d}`);
    }
    summaryLines.push("");
  }

  if (userAnswers.length > 0) {
    summaryLines.push("User answers provided:");
    for (const a of userAnswers) {
      summaryLines.push(`• "${a}"`);
    }
    summaryLines.push("");
  }

  if (filesRead.length > 0) {
    summaryLines.push(`Files read: ${[...new Set(filesRead)].slice(0, 15).join(", ")}`);
  }
  if (filesWritten.length > 0) {
    summaryLines.push(`Files written/edited: ${[...new Set(filesWritten)].join(", ")}`);
  }
  if (toolsUsed.size > 0) {
    summaryLines.push(`Tools used: ${[...toolsUsed].join(", ")}`);
  }

  summaryLines.push("");
  summaryLines.push("IMPORTANT: Continue from where you left off. The user's original request is in the first message above. Do NOT re-ask questions the user already answered.");

  const summaryMsg: TextGenerationMessage = {
    role: "user",
    content: summaryLines.join("\n"),
  };

  return [system, userMsg, summaryMsg, ...recentMessages];
}

// ===========================================
// Tool Start Meta Builder
// ===========================================

function buildToolStartMeta(toolName: string, args: Record<string, unknown>): ToolStartMeta {
  switch (toolName) {
    case "read_file":
      return { kind: "read_file", path: (args.path as string) || "" };
    case "write_file":
      return { kind: "write_file", path: (args.path as string) || "", bytes: ((args.content as string) || "").length };
    case "edit_file":
      return { kind: "edit_file", path: (args.path as string) || "", editCount: (Array.isArray(args.edits) ? args.edits.length : 0) };
    case "list_files":
      return { kind: "list_files", path: (args.path as string) || "/" };
    case "create_directory":
      return { kind: "create_directory", path: (args.path as string) || "" };
    case "delete_file":
      return { kind: "delete_file", path: (args.path as string) || "" };
    case "run_command":
      return { kind: "run_command", command: (args.command as string) || "" };
    case "search_files":
      return { kind: "search_files", pattern: (args.pattern as string) || "" };
    case "get_file_outline":
      return { kind: "read_file", path: (args.path as string) || "" };
    case "get_function":
      return { kind: "read_file", path: `${(args.path as string) || ""}:${(args.name as string) || ""}` };
    case "search_symbols":
      return { kind: "search_files", pattern: (args.pattern as string) || "" };
    case "list_gateways":
      return { kind: "list_gateways" };
    case "list_user_plugins":
      return { kind: "list_user_plugins" };
    case "create_plugin_record":
      return { kind: "create_plugin_record", name: (args.name as string) || "" };
    case "update_plugin_record":
      return { kind: "update_plugin_record", name: (args.name as string) || "" };
    case "restart_plugin":
      return { kind: "restart_plugin", slug: (args.slug as string) || "" };
    case "finish":
      return { kind: "finish", summary: (args.summary as string) || "" };
    case "check_credits":
      return { kind: "check_credits" };
    case "check_billing":
      return { kind: "check_billing" };
    case "check_usage":
      return { kind: "check_usage" };
    case "create_gateway":
      return { kind: "create_gateway", name: (args.name as string) || "" };
    case "delete_gateway":
      return { kind: "delete_gateway", name: (args.name as string) || (args.gatewayId as string) || "" };
    case "update_gateway":
      return { kind: "update_gateway", gatewayId: (args.gatewayId as string) || "" };
    case "install_plugin":
      return { kind: "install_plugin", slug: (args.slug as string) || "" };
    case "uninstall_plugin":
      return { kind: "uninstall_plugin", name: (args.name as string) || "" };
    case "toggle_plugin":
      return { kind: "toggle_plugin", name: (args.name as string) || "", enable: !!args.enable };
    case "start_workspace":
      return { kind: "start_workspace" };
    case "stop_workspace":
      return { kind: "stop_workspace" };
    case "restart_workspace":
      return { kind: "restart_workspace" };
    case "get_workspace_status":
      return { kind: "get_workspace_status" };
    case "navigate_page":
      return { kind: "navigate_page", path: (args.path as string) || "" };
    case "ask_user":
      return { kind: "ask_user", question: (args.question as string) || "" };
    case "hand_off_to_coder":
    case "hand_off_to_assistant":
      return {
        kind: "hand_off",
        targetWorker: toolName === "hand_off_to_coder" ? "coder" : "assistant",
        context: (args.task as string) || (args.context as string) || "",
      };
    case "view_plugin_config":
      return { kind: "view_plugin_config", name: (args.name as string) || (args.userPluginId as string) || "" };
    case "search_marketplace":
      return { kind: "search_marketplace", query: (args.query as string) || "" };
    case "get_gateway_metrics":
      return { kind: "get_gateway_metrics", gatewayId: (args.gatewayId as string) || "" };
    case "get_workspace_logs":
      return { kind: "get_workspace_logs" };
    case "get_workspace_metrics":
      return { kind: "get_workspace_metrics" };
    case "clone_plugin":
      return { kind: "clone_plugin", sourceSlug: (args.sourceSlug as string) || "", newSlug: (args.newSlug as string) || "" };
    default:
      return { kind: "unknown", tool: toolName };
  }
}

// ===========================================
// Backend-Driven UI Actions Builder
// ===========================================

/** Shorten a file path for display */
function shortenPath(filePath: string): string {
  return filePath.replace(/^plugins\/[^/]+\//, "");
}

/**
 * Build UIActions for a tool call. These are sent directly in the SSE event
 * so the frontend doesn't need a mapper. Falls back to empty array for tools
 * that only need a default toast (the mapper handles those).
 */
function buildToolUIActions(toolName: string, args: Record<string, unknown>): UIAction[] {
  switch (toolName) {
    // ── Workspace / Coder tools ─────────────────────
    case "read_file":
      return [
        { action: "navigate", path: "/workspace", label: `Reading ${shortenPath((args.path as string) || "")}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Reading ${shortenPath((args.path as string) || "")}`, gated: true, durationMs: 30_000 },
      ];
    case "write_file":
      return [
        { action: "navigate", path: "/workspace", label: `Writing ${shortenPath((args.path as string) || "")}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Writing ${shortenPath((args.path as string) || "")} (${((args.content as string) || "").length} bytes)`, gated: true, durationMs: 30_000 },
      ];
    case "edit_file":
      return [
        { action: "navigate", path: "/workspace", label: `Editing ${shortenPath((args.path as string) || "")}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Editing ${shortenPath((args.path as string) || "")} (${Array.isArray(args.edits) ? args.edits.length : 0} changes)`, gated: true, durationMs: 30_000 },
      ];
    case "list_files":
      return [
        { action: "navigate", path: "/workspace", label: "Scanning plugin files" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Listing ${(args.path as string) || "/"}`, gated: true, durationMs: 30_000 },
      ];
    case "create_directory":
      return [
        { action: "toast", message: `Creating directory ${shortenPath((args.path as string) || "")}`, variant: "info", durationMs: 1000 },
      ];
    case "delete_file":
      return [
        { action: "toast", message: `Deleting ${shortenPath((args.path as string) || "")}`, variant: "warning", durationMs: 1000 },
      ];
    case "run_command":
      return [
        { action: "navigate", path: "/workspace", label: "Running command" },
        { action: "pulse", target: "workspace-plugins-panel", label: `$ ${((args.command as string) || "").slice(0, 60)}`, gated: true, durationMs: 30_000 },
      ];
    case "search_files":
      return [
        { action: "navigate", path: "/workspace", label: "Searching code" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Searching for "${(args.pattern as string) || ""}"`, gated: true, durationMs: 30_000 },
      ];
    case "get_file_outline":
      return [
        { action: "navigate", path: "/workspace", label: "Analyzing structure" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Outline of ${shortenPath((args.path as string) || "")}`, gated: true, durationMs: 15_000 },
      ];
    case "get_function":
      return [
        { action: "navigate", path: "/workspace", label: `Extracting ${(args.name as string) || "function"}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Reading ${(args.name as string) || "function"} from ${shortenPath((args.path as string) || "")}`, gated: true, durationMs: 15_000 },
      ];
    case "search_symbols":
      return [
        { action: "navigate", path: "/workspace", label: "Searching symbols" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Finding symbols matching "${(args.pattern as string) || ""}"`, gated: true, durationMs: 30_000 },
      ];

    // ── Gateway tools ───────────────────────────────
    case "list_gateways":
      return [
        { action: "navigate", path: "/gateways", label: "Checking your gateways" },
        { action: "pulse", label: "Looking for a gateway to bind to", gated: true, durationMs: 30_000 },
      ];
    case "create_gateway":
      return [
        { action: "navigate", path: "/gateways", label: `Creating gateway: ${(args.name as string) || ""}` },
        { action: "pulse", label: `Creating "${(args.name as string) || ""}"`, gated: true, durationMs: 30_000 },
      ];
    case "delete_gateway":
      return [
        { action: "navigate", path: "/gateways", label: `Deleting gateway` },
        { action: "toast", message: `Deleting gateway "${(args.name as string) || (args.gatewayId as string) || ""}"`, variant: "warning", durationMs: 1500 },
      ];
    case "update_gateway":
      return [
        { action: "navigate", path: "/gateways", label: `Updating gateway` },
        { action: "pulse", label: `Updating gateway settings`, gated: true, durationMs: 30_000 },
      ];

    // ── Plugin tools ────────────────────────────────
    case "list_user_plugins":
      return [
        { action: "navigate", path: "/plugins", label: "Reviewing existing plugins" },
        { action: "pulse", label: "Checking installed plugins", gated: true, durationMs: 30_000 },
      ];
    case "create_plugin_record":
      return [
        { action: "toast", message: `Registering plugin: ${(args.name as string) || ""}`, variant: "info", durationMs: 2000 },
      ];
    case "update_plugin_record":
      return [
        { action: "toast", message: `Updating plugin metadata: ${(args.name as string) || "plugin"}`, variant: "info", durationMs: 2000 },
      ];
    case "restart_plugin":
      return [
        { action: "navigate", path: "/workspace", label: `Restarting ${(args.slug as string) || ""}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Restarting plugin: ${(args.slug as string) || ""}`, gated: true, durationMs: 30_000 },
      ];
    case "install_plugin":
      return [
        { action: "navigate", path: "/plugins", label: `Installing ${(args.slug as string) || ""}` },
        { action: "pulse", label: `Installing ${(args.slug as string) || ""}`, gated: true, durationMs: 30_000 },
      ];
    case "uninstall_plugin":
      return [
        { action: "navigate", path: "/plugins", label: `Uninstalling ${(args.name as string) || ""}` },
        { action: "toast", message: `Uninstalling "${(args.name as string) || ""}"`, variant: "warning", durationMs: 1500 },
      ];
    case "toggle_plugin": {
      const enable = !!args.enable;
      const name = (args.name as string) || "";
      return [
        { action: "navigate", path: "/plugins", label: `${enable ? "Starting" : "Stopping"} ${name}` },
        { action: "pulse", label: `${enable ? "Starting" : "Stopping"} ${name}`, gated: true, durationMs: 30_000 },
      ];
    }

    // ── Account / billing tools ─────────────────────
    case "check_credits":
      return [
        { action: "navigate", path: "/credits", label: "Checking your credits" },
        { action: "pulse", target: "credits-balance-card", label: "Your credit balance", gated: true, durationMs: 30_000 },
      ];
    case "check_billing":
      return [
        { action: "navigate", path: "/billing", label: "Checking billing info" },
        { action: "pulse", label: "Your billing overview", gated: true, durationMs: 30_000 },
      ];
    case "check_usage":
      return [
        { action: "navigate", path: "/usage", label: "Checking usage stats" },
        { action: "pulse", label: "Your usage statistics", gated: true, durationMs: 30_000 },
      ];

    // ── Workspace ───────────────────────────────────
    case "start_workspace":
      return [
        { action: "navigate", path: "/workspace", label: "Starting workspace" },
        { action: "pulse", target: "workspace-start-btn", label: "Starting your workspace", gated: true, durationMs: 30_000 },
      ];
    case "stop_workspace":
      return [
        { action: "navigate", path: "/workspace", label: "Stopping workspace" },
        { action: "pulse", target: "workspace-start-btn", label: "Stopping your workspace", gated: true, durationMs: 30_000 },
      ];
    case "restart_workspace":
      return [
        { action: "navigate", path: "/workspace", label: "Restarting workspace" },
        { action: "pulse", target: "workspace-start-btn", label: "Restarting your workspace", gated: true, durationMs: 30_000 },
      ];
    case "get_workspace_status":
      return [
        { action: "navigate", path: "/workspace", label: "Checking workspace status" },
        { action: "pulse", label: "Workspace status", gated: true, durationMs: 30_000 },
      ];
    case "get_workspace_logs":
      return [
        { action: "navigate", path: "/workspace", label: "Fetching workspace logs" },
        { action: "pulse", target: "workspace-plugins-panel", label: "Fetching workspace logs", gated: true, durationMs: 30_000 },
      ];
    case "get_workspace_metrics":
      return [
        { action: "navigate", path: "/workspace", label: "Checking workspace metrics" },
        { action: "pulse", label: "Workspace resource usage", gated: true, durationMs: 30_000 },
      ];
    case "navigate_page":
      return [
        { action: "navigate", path: (args.path as string) || "/", label: `Opening ${(args.path as string) || "/"}` },
      ];

    // ── Interaction tools ───────────────────────────
    case "ask_user":
    case "hand_off_to_coder":
    case "hand_off_to_assistant":
    case "finish":
      return []; // Handled by dedicated event types or mapper fallback

    // ── New platform tools ──────────────────────────
    case "check_gateway_status":
      return [
        { action: "navigate", path: "/gateways", label: "Checking gateway status" },
        { action: "pulse", label: "Checking gateway health", gated: true, durationMs: 30_000 },
      ];
    case "view_plugin_logs":
      return [
        { action: "navigate", path: "/workspace", label: "Viewing plugin logs" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Viewing logs for ${(args.pluginSlug as string) || "plugin"}`, gated: true, durationMs: 30_000 },
      ];
    case "list_templates":
      return [
        { action: "toast", message: "Browsing plugin templates…", variant: "info", durationMs: 1500 },
      ];
    case "explain_error":
      return [
        { action: "toast", message: "Analyzing error…", variant: "info", durationMs: 1500 },
      ];
    case "view_plugin_config":
      return [
        { action: "navigate", path: "/plugins", label: "Viewing plugin config" },
        { action: "pulse", label: `Checking plugin configuration`, gated: true, durationMs: 30_000 },
      ];
    case "search_marketplace":
      return [
        { action: "toast", message: `Searching marketplace for "${(args.query as string) || ""}"…`, variant: "info", durationMs: 1500 },
      ];
    case "get_gateway_metrics":
      return [
        { action: "navigate", path: "/gateways", label: "Fetching gateway metrics" },
        { action: "pulse", label: "Gateway metrics", gated: true, durationMs: 30_000 },
      ];
    case "clone_plugin":
      return [
        { action: "navigate", path: "/workspace", label: `Cloning plugin ${(args.sourceSlug as string) || ""}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Cloning ${(args.sourceSlug as string) || ""} → ${(args.newSlug as string) || ""}`, gated: true, durationMs: 30_000 },
      ];

    default:
      // No backend-driven actions — frontend mapper can handle as fallback
      return [];
  }
}

// ===========================================
// Tool Execution — Shared Platform Tools
// ===========================================

interface ToolExecResult {
  result: string;
  finished?: boolean;
  finishData?: { entry?: string; configSchema?: Record<string, unknown>; configDefaults?: Record<string, unknown>; summary?: string; pluginId?: string };
  handOff?: { workerType: CursorWorkerType; context: string; pluginSlug?: string; pluginName?: string; mode?: "create" | "edit" };
}

/** Execute platform tools shared by both workers */
async function executeSharedTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { userId: string; organizationId: string | null },
): Promise<ToolExecResult | null> {
  switch (toolName) {
    case "list_gateways": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const gateways = await gatewayService.findByUser(svcCtx);
        const summary = gateways.map((g) =>
          `- ${g.name} (${g.type}, ${g.status}) [ID: ${g.id}]`,
        ).join("\n");
        return { result: summary || "(no gateways configured)" };
      } catch (err) {
        return { result: `Error listing gateways: ${(err as Error).message}` };
      }
    }
    case "list_user_plugins": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const plugins = await pluginService.getUserPlugins(svcCtx);
        const summary = plugins.map((p) =>
          `- ${p.pluginName} (slug: ${p.pluginSlug}, enabled: ${p.isEnabled}) [pluginId: ${p.pluginId}, userPluginId: ${p.id}]`,
        ).join("\n");
        return { result: summary || "(no plugins installed)" };
      } catch (err) {
        return { result: `Error listing plugins: ${(err as Error).message}` };
      }
    }

    case "view_plugin_logs": {
      const pluginSlug = args.pluginSlug as string;
      if (!pluginSlug) return { result: "Error: pluginSlug is required." };
      try {
        const bridge = await getBridgeClient(ctx.userId, ctx.organizationId);
        if (!bridge) return { result: "Error: No running workspace. Start your workspace first." };
        const logs = await bridge.client.pluginLogs(`plugins/${pluginSlug}/index.js`);
        const logText = typeof logs === "string" ? logs : JSON.stringify(logs, null, 2);
        return { result: truncateToolOutput(logText || "(no logs available)") };
      } catch (err) {
        return { result: `Error fetching plugin logs: ${(err as Error).message}` };
      }
    }

    case "explain_error": {
      const errorText = args.error as string;
      if (!errorText) return { result: "Error: provide the error text to explain." };

      // Common error pattern map — deterministic, no AI call needed
      const explanations: Array<{ pattern: RegExp; explanation: string }> = [
        { pattern: /insufficient credits|credit balance/i, explanation: "You don't have enough credits for this operation. Go to Settings → Billing to add credits or upgrade your plan." },
        { pattern: /gateway.*not found|no gateway/i, explanation: "The gateway (bot connection) doesn't exist or hasn't been configured yet. Use the Gateways page to create one." },
        { pattern: /bot token.*invalid|401.*telegram/i, explanation: "Your Telegram bot token is invalid or expired. Create a new bot via @BotFather on Telegram and update the gateway." },
        { pattern: /workspace.*not running|no.*workspace/i, explanation: "Your development workspace isn't running. Go to the Dashboard and click 'Start Workspace'." },
        { pattern: /ECONNREFUSED|ECONNRESET|timeout/i, explanation: "A network connection failed. This is usually temporary — try again in a moment. If it persists, your workspace may need restarting." },
        { pattern: /plugin.*not found|no plugin/i, explanation: "The plugin doesn't exist or isn't installed. Check the Bots page for available plugins." },
        { pattern: /rate limit|429|too many requests/i, explanation: "You've hit an API rate limit. Wait a moment and try again. This is temporary." },
        { pattern: /permission denied|forbidden|403/i, explanation: "You don't have permission for this action. Check that you own this resource or have the right role in the organization." },
      ];

      for (const { pattern, explanation } of explanations) {
        if (pattern.test(errorText)) {
          return { result: `Explanation: ${explanation}\n\nOriginal error: ${errorText}` };
        }
      }

      return { result: `This error doesn't match a known pattern. The full error: "${errorText}". Try checking the workspace logs or asking for more details about what you were doing when it occurred.` };
    }

    case "view_plugin_config": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const userPlugins = await pluginService.getUserPlugins(svcCtx);
        const nameOrId = (args.name as string) || (args.userPluginId as string) || "";
        const match = userPlugins.find(
          (p) => p.id === nameOrId
            || p.pluginId === nameOrId
            || p.pluginName.toLowerCase().includes(nameOrId.toLowerCase())
            || p.pluginSlug === nameOrId.toLowerCase().replace(/\s+/g, "-"),
        );
        if (!match) return { result: `No plugin found matching "${nameOrId}"` };

        // Get full plugin details including config
        const detail = await pluginService.getUserPluginById(svcCtx, match.id);
        const d = detail as unknown as Record<string, unknown>;
        return {
          result: `Plugin: ${match.pluginName} (${match.pluginSlug})\nEnabled: ${match.isEnabled}\n` +
            `Config Schema: ${JSON.stringify(d.configSchema ?? {}, null, 2)}\n` +
            `Config Defaults: ${JSON.stringify(d.configDefaults ?? {}, null, 2)}\n` +
            `Current Config: ${JSON.stringify(d.config ?? {}, null, 2)}`,
        };
      } catch (err) {
        return { result: `Error viewing plugin config: ${(err as Error).message}` };
      }
    }

    default:
      return null; // Not a shared tool
  }
}

// ===========================================
// Tool Execution — Assistant-Only Tools
// ===========================================

async function executeAssistantTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { userId: string; organizationId: string | null },
): Promise<ToolExecResult | null> {
  switch (toolName) {
    case "check_credits": {
      try {
        const { twoBotAICreditService } = await import("@/modules/credits/2bot-ai-credit.service");
        const balance = await twoBotAICreditService.getBalance(ctx.userId);
        return {
          result: `Credit balance: ${balance.balance} credits remaining (Monthly used: ${balance.monthlyUsed}, Plan limit: ${balance.planLimit})`,
        };
      } catch (err) {
        return { result: `Error checking credits: ${(err as Error).message}` };
      }
    }

    case "check_billing": {
      try {
        const { twoBotAICreditService } = await import("@/modules/credits/2bot-ai-credit.service");
        const balance = await twoBotAICreditService.getBalance(ctx.userId);
        // Get user plan info from DB
        const user = await prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { plan: true, email: true },
        });
        return {
          result: `Plan: ${user?.plan ?? "FREE"}, Credits: ${balance.balance} remaining, Monthly used: ${balance.monthlyUsed}, Plan limit: ${balance.planLimit}`,
        };
      } catch (err) {
        return { result: `Error checking billing: ${(err as Error).message}` };
      }
    }

    case "check_usage": {
      try {
        const { twoBotAICreditService } = await import("@/modules/credits/2bot-ai-credit.service");
        const balance = await twoBotAICreditService.getBalance(ctx.userId);
        return {
          result: `Usage: ${balance.monthlyUsed} credits used this period out of ${balance.planLimit} limit. Remaining: ${balance.balance}. Lifetime total: ${balance.lifetime}`,
        };
      } catch (err) {
        return { result: `Error checking usage: ${(err as Error).message}` };
      }
    }

    case "create_gateway": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const gwName = (args.name as string) || "My Bot";
        const gwType = ((args.type as string) || "TELEGRAM_BOT") as "TELEGRAM_BOT" | "DISCORD_BOT" | "SLACK_BOT" | "WHATSAPP_BOT";

        type CredentialTypes = import("@/modules/gateway/gateway.types").GatewayCredentials; // eslint-disable-line @typescript-eslint/consistent-type-imports
        let credentials: CredentialTypes;

        if (gwType === "TELEGRAM_BOT") {
          const botToken = args.botToken as string;
          if (!botToken) return { result: "Error: botToken is required. Use ask_user to collect it first." };
          credentials = { botToken };
        } else {
          credentials = {} as CredentialTypes;
        }

        const gateway = await gatewayService.create(svcCtx, {
          name: gwName,
          type: gwType,
          credentials,
        });

        return {
          result: `Gateway "${gateway.name}" (${gateway.type}) created successfully! [ID: ${gateway.id}, Status: ${gateway.status}]`,
        };
      } catch (err) {
        return { result: `Error creating gateway: ${(err as Error).message}` };
      }
    }

    case "delete_gateway": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const gatewayId = args.gatewayId as string | undefined;
        const gwName = args.name as string | undefined;

        if (gatewayId) {
          await gatewayService.delete(svcCtx, gatewayId);
          return { result: `Gateway ${gatewayId} deleted.` };
        } else if (gwName) {
          const gateways = await gatewayService.findByUser(svcCtx);
          const match = gateways.find((g) => g.name.toLowerCase().includes(gwName.toLowerCase()));
          if (!match) return { result: `No gateway found matching "${gwName}"` };
          await gatewayService.delete(svcCtx, match.id);
          return { result: `Gateway "${match.name}" deleted.` };
        }
        return { result: "Error: provide gatewayId or name to delete." };
      } catch (err) {
        return { result: `Error deleting gateway: ${(err as Error).message}` };
      }
    }

    case "install_plugin": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const slug = args.slug as string;
        let gatewayId = args.gatewayId as string | undefined;

        // Auto-select gateway if not provided
        if (!gatewayId) {
          const userGateways = await gatewayService.findByUser(svcCtx);
          if (userGateways.length > 0) {
            const telegram = userGateways.find((g) => g.type === "TELEGRAM_BOT" && g.status === "CONNECTED")
              || userGateways.find((g) => g.type === "TELEGRAM_BOT")
              || userGateways[0];
            gatewayId = telegram?.id;
          }
        }

        // Fuzzy-match slug
        const searchResults = await pluginService.getAvailablePlugins({ search: slug, userId: ctx.userId });
        let resolvedSlug = slug;
        if (searchResults.length > 0) {
          const exact = searchResults.find((p) => p.slug === slug);
          if (!exact && searchResults[0]) {
            resolvedSlug = searchResults[0].slug;
          }
        }

        const installed = await pluginService.installPlugin(svcCtx, {
          slug: resolvedSlug,
          gatewayId,
        });

        return {
          result: `Plugin "${installed.pluginName}" installed! [ID: ${installed.id}, slug: ${installed.pluginSlug}]`,
        };
      } catch (err) {
        return { result: `Error installing plugin: ${(err as Error).message}` };
      }
    }

    case "uninstall_plugin": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const pluginId = args.pluginId as string | undefined;
        const pluginName = args.name as string | undefined;

        if (pluginId) {
          await pluginService.deleteCustomPlugin(svcCtx, pluginId);
          return { result: `Plugin ${pluginId} deleted.` };
        } else if (pluginName) {
          const userPlugins = await pluginService.getUserPlugins(svcCtx);
          const match = userPlugins.find(
            (p) => p.pluginName.toLowerCase().includes(pluginName.toLowerCase())
              || p.pluginSlug === pluginName.toLowerCase().replace(/\s+/g, "-"),
          );
          if (!match) return { result: `No plugin found matching "${pluginName}"` };
          await pluginService.uninstallPlugin(svcCtx, match.id);
          return { result: `Plugin "${match.pluginName}" uninstalled.` };
        }
        return { result: "Error: provide pluginId or name to uninstall." };
      } catch (err) {
        return { result: `Error uninstalling plugin: ${(err as Error).message}` };
      }
    }

    case "toggle_plugin": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const name = args.name as string;
        const enable = args.enable as boolean;
        const userPlugins = await pluginService.getUserPlugins(svcCtx);
        const match = userPlugins.find(
          (p) => p.pluginName.toLowerCase().includes(name.toLowerCase())
            || p.pluginSlug === name.toLowerCase().replace(/\s+/g, "-"),
        );
        if (!match) return { result: `No plugin found matching "${name}"` };

        await pluginService.togglePlugin(svcCtx, match.id, enable);
        return { result: `Plugin "${match.pluginName}" ${enable ? "started" : "stopped"}.` };
      } catch (err) {
        return { result: `Error toggling plugin: ${(err as Error).message}` };
      }
    }

    case "start_workspace": {
      try {
        const { workspaceService } = await import("@/modules/workspace");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const wsStatus = await workspaceService.getStatus(svcCtx);
        if (!wsStatus) {
          const result = await workspaceService.createWorkspace(svcCtx);
          return {
            result: result.success
              ? `Workspace created and starting! [Container: ${result.containerId}]`
              : `Workspace creation issue: ${result.message}`,
          };
        } else if (wsStatus.status === "RUNNING") {
          return { result: "Workspace is already running." };
        } else {
          const result = await workspaceService.startWorkspace(svcCtx, wsStatus.id);
          return {
            result: result.success
              ? "Workspace started!"
              : `Error starting workspace: ${result.message}`,
          };
        }
      } catch (err) {
        return { result: `Error with workspace: ${(err as Error).message}` };
      }
    }

    case "check_gateway_status": {
      const gatewayId = args.gatewayId as string;
      if (!gatewayId) return { result: "Error: gatewayId is required. Use list_gateways first." };
      try {
        const { gatewayMonitor } = await import("@/modules/gateway");
        const result = await gatewayMonitor.testNewGateway(gatewayId);
        if (result.healthy) {
          return { result: `Gateway ${gatewayId} is healthy! Latency: ${result.latency ?? "N/A"}ms.` };
        } else {
          return { result: `Gateway ${gatewayId} is NOT healthy. Error: ${result.error ?? "Unknown error"}` };
        }
      } catch (err) {
        return { result: `Error checking gateway status: ${(err as Error).message}` };
      }
    }

    case "list_templates": {
      try {
        const { getTemplateList } = await import("@/modules/plugin/plugin-templates");
        let templates = getTemplateList();
        const category = args.category as string | undefined;
        if (category) {
          templates = templates.filter((t) =>
            t.category.toLowerCase().includes(category.toLowerCase())
          );
        }
        const summary = templates.map((t) =>
          `- ${t.name} [${t.id}] (${t.category}, ${t.difficulty ?? "beginner"}) — ${t.description}${t.requiredGateways?.length ? ` (requires: ${t.requiredGateways.join(", ")})` : ""}`,
        ).join("\n");
        return { result: summary || "(no templates found)" };
      } catch (err) {
        return { result: `Error listing templates: ${(err as Error).message}` };
      }
    }

    case "navigate_page": {
      // Navigation is handled on the frontend via the event.
      // We just return success so the LLM knows it worked.
      const path = (args.path as string) || "/";
      return { result: `Navigated to ${path}` };
    }

    case "stop_workspace": {
      try {
        const { workspaceService } = await import("@/modules/workspace");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const wsStatus = await workspaceService.getStatus(svcCtx);
        if (!wsStatus) return { result: "No workspace found." };
        if (wsStatus.status === "STOPPED") return { result: "Workspace is already stopped." };
        const result = await workspaceService.stopWorkspace(svcCtx, wsStatus.id);
        return { result: result.success ? "Workspace stopped." : `Error: ${result.message}` };
      } catch (err) {
        return { result: `Error stopping workspace: ${(err as Error).message}` };
      }
    }

    case "restart_workspace": {
      try {
        const { workspaceService } = await import("@/modules/workspace");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const wsStatus = await workspaceService.getStatus(svcCtx);
        if (!wsStatus) return { result: "No workspace found." };
        if (wsStatus.status !== "STOPPED") {
          await workspaceService.stopWorkspace(svcCtx, wsStatus.id);
        }
        const result = await workspaceService.startWorkspace(svcCtx, wsStatus.id);
        return { result: result.success ? "Workspace restarted!" : `Error: ${result.message}` };
      } catch (err) {
        return { result: `Error restarting workspace: ${(err as Error).message}` };
      }
    }

    case "get_workspace_status": {
      try {
        const { workspaceService } = await import("@/modules/workspace");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const wsStatus = await workspaceService.getStatus(svcCtx);
        if (!wsStatus) return { result: "No workspace found. The user hasn't created a workspace yet." };
        return {
          result: `Workspace: ${wsStatus.status} [ID: ${wsStatus.id}]` +
            (wsStatus.startedAt ? `, Started: ${wsStatus.startedAt}` : "") +
            `, RAM: ${wsStatus.resources.ramMb}MB, CPU: ${wsStatus.resources.cpuCores} cores` +
            `, Plugins running: ${wsStatus.runningPlugins.length}` +
            `, Health check fails: ${wsStatus.healthCheckFails}, Restarts: ${wsStatus.restartCount}`,
        };
      } catch (err) {
        return { result: `Error checking workspace status: ${(err as Error).message}` };
      }
    }

    case "update_gateway": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const gatewayId = args.gatewayId as string;
        if (!gatewayId) return { result: "Error: gatewayId is required. Use list_gateways first." };

        const updateData: { name?: string; credentials?: { botToken: string } } = {};
        if (args.name) updateData.name = args.name as string;
        if (args.botToken) updateData.credentials = { botToken: args.botToken as string };

        const updated = await gatewayService.update(svcCtx, gatewayId, updateData as Parameters<typeof gatewayService.update>[2]);
        return { result: `Gateway "${updated.name}" updated successfully.` };
      } catch (err) {
        return { result: `Error updating gateway: ${(err as Error).message}` };
      }
    }

    case "search_marketplace": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const query = (args.query as string) || "";
        const results = await pluginService.getAvailablePlugins({ search: query, userId: ctx.userId });
        const summary = results.map((p) =>
          `- ${p.name} [${p.slug}] — ${p.description || "No description"}`,
        ).join("\n");
        return { result: summary || `No plugins found for "${query}"` };
      } catch (err) {
        return { result: `Error searching marketplace: ${(err as Error).message}` };
      }
    }

    case "get_gateway_metrics": {
      const gatewayId = args.gatewayId as string;
      if (!gatewayId) return { result: "Error: gatewayId is required. Use list_gateways first." };
      try {
        const { gatewayMetricService } = await import("@/modules/gateway/gateway-metrics.service");
        const metrics = await gatewayMetricService.getMetrics(gatewayId, { days: 7 });
        if (metrics.length === 0) return { result: `No metrics recorded for gateway ${gatewayId} in the last 7 days.` };
        const summary = metrics.map((m) =>
          `[${m.period}] ${m.action}: ${m.successCount} ok, ${m.errorCount} errors, avg ${Math.round(m.avgDurationMs)}ms`,
        ).join("\n");
        return { result: `Gateway Metrics (last 7 days):\n${summary}` };
      } catch (err) {
        return { result: `Error fetching gateway metrics: ${(err as Error).message}` };
      }
    }

    case "get_workspace_logs": {
      try {
        const bridge = await getBridgeClient(ctx.userId, ctx.organizationId);
        if (!bridge) return { result: "Error: No running workspace. Start your workspace first." };
        const level = (args.level as string) || "info";
        const limit = Math.min((args.limit as number) || 50, 200);
        const logs = await bridge.client.send("system.logs", { level, limit });
        const logText = typeof logs === "string" ? logs : JSON.stringify(logs, null, 2);
        return { result: truncateToolOutput(logText || "(no logs available)") };
      } catch (err) {
        return { result: `Error fetching workspace logs: ${(err as Error).message}` };
      }
    }

    case "get_workspace_metrics": {
      try {
        const bridge = await getBridgeClient(ctx.userId, ctx.organizationId);
        if (!bridge) return { result: "Error: No running workspace. Start your workspace first." };
        const stats = await bridge.client.send("system.stats", {});
        const statsText = typeof stats === "string" ? stats : JSON.stringify(stats, null, 2);
        return { result: `Workspace Metrics:\n${statsText}` };
      } catch (err) {
        return { result: `Error fetching workspace metrics: ${(err as Error).message}` };
      }
    }

    case "hand_off_to_coder": {
      return {
        result: "Handing off to Cursor Coder...",
        handOff: {
          workerType: "coder",
          context: (args.task as string) || "",
          pluginSlug: args.pluginSlug as string | undefined,
          pluginName: args.pluginName as string | undefined,
          mode: args.mode as "create" | "edit" | undefined,
        },
      };
    }

    default:
      return null; // Not an assistant tool
  }
}

// ===========================================
// Tool Execution — Coder-Only Tools
// ===========================================

const TOOL_TIMEOUT_MS = 30_000;

async function executeCoderTool(
  toolName: string,
  args: Record<string, unknown>,
  client: BridgeClient,
  pluginDir: string,
  writtenFiles: Record<string, string>,
  ctx: { userId: string; organizationId: string | null; sessionId?: string },
): Promise<ToolExecResult | null> {
  switch (toolName) {
    case "read_file": {
      const path = args.path as string;
      try {
        const result = await withBridgeRetry(
          () => client.fileRead(path) as Promise<{ content?: string }>,
          `read_file:${path}`,
        );
        return { result: truncateToolOutput(result?.content ?? "(empty file)") };
      } catch {
        return { result: `Error: file not found or not readable: ${path}` };
      }
    }

    case "write_file": {
      const path = args.path as string;
      const content = args.content as string;
      try {
        // Backup before write for undo support
        const backup = ctx.sessionId ? await readFileForBackup(client, path) : null;
        await withBridgeRetry(() => client.fileWrite(path, content, true), `write_file:${path}`);
        const relativePath = path.startsWith(pluginDir + "/")
          ? path.slice(pluginDir.length + 1)
          : path;
        writtenFiles[relativePath] = content;
        // Track for undo
        if (ctx.sessionId) {
          trackFileAction(ctx.sessionId, {
            id: crypto.randomUUID(),
            type: backup?.content !== null ? "modified" : "created",
            path,
            originalContent: backup?.content ?? null,
            newContent: content.length > 500_000 ? content.substring(0, 500_000) : content,
            contentTruncated: backup?.truncated ?? false,
            toolCallId: `write_file:${relativePath}`,
            timestamp: new Date(),
          });
        }
        return { result: `Written: ${path} (${content.length} bytes)` };
      } catch (err) {
        return { result: `Error writing ${path}: ${(err as Error).message}` };
      }
    }

    case "edit_file": {
      const path = args.path as string;
      const edits = args.edits as Array<{ search: string; replace: string }>;
      if (!Array.isArray(edits) || edits.length === 0) {
        return { result: `Error: edits must be a non-empty array of {search, replace} objects` };
      }
      try {
        // Read current file content
        const readResult = await withBridgeRetry(() => client.fileRead(path), `edit_file_read:${path}`) as { content?: string };
        if (!readResult?.content && readResult?.content !== "") {
          return { result: `Error: file not found or not readable: ${path}` };
        }
        const originalContent = readResult.content;

        // Backup before edit for undo support
        const backup = ctx.sessionId ? { content: originalContent, truncated: originalContent.length > 500_000 } : null;

        // Apply edits sequentially
        let current = originalContent;
        const applied: string[] = [];
        for (let i = 0; i < edits.length; i++) {
          const edit = edits[i]!;
          const idx = current.indexOf(edit.search);
          if (idx === -1) {
            // Search text not found — provide helpful context
            const snippet = current.slice(0, 200).replace(/\n/g, "\\n");
            return {
              result: `Error in edit ${i + 1}/${edits.length}: search text not found in ${path}. `
                + `Search was ${edit.search.length} chars starting with "${edit.search.slice(0, 60)}...". `
                + `File starts with: "${snippet}..."`,
            };
          }
          // Check for ambiguous matches (search text appears multiple times)
          const secondIdx = current.indexOf(edit.search, idx + 1);
          if (secondIdx !== -1) {
            return {
              result: `Error in edit ${i + 1}/${edits.length}: search text found multiple times in ${path}. `
                + `Include more surrounding context to make the match unique.`,
            };
          }
          current = current.slice(0, idx) + edit.replace + current.slice(idx + edit.search.length);
          applied.push(`#${i + 1}: replaced ${edit.search.length} chars → ${edit.replace.length} chars`);
        }

        // Write modified content
        await withBridgeRetry(() => client.fileWrite(path, current, true), `edit_file:${path}`);
        const relativePath = path.startsWith(pluginDir + "/")
          ? path.slice(pluginDir.length + 1)
          : path;
        writtenFiles[relativePath] = current;

        // Track for undo
        if (ctx.sessionId && backup) {
          trackFileAction(ctx.sessionId, {
            id: crypto.randomUUID(),
            type: "modified",
            path,
            originalContent: backup.content.length > 500_000 ? backup.content.substring(0, 500_000) : backup.content,
            newContent: current.length > 500_000 ? current.substring(0, 500_000) : current,
            contentTruncated: backup.truncated,
            toolCallId: `edit_file:${relativePath}`,
            timestamp: new Date(),
          });
        }
        return { result: `Edited: ${path} (${edits.length} change${edits.length > 1 ? "s" : ""} applied). ${applied.join("; ")}` };
      } catch (err) {
        return { result: `Error editing ${path}: ${(err as Error).message}` };
      }
    }

    case "list_files": {
      const path = (args.path as string) || "/";
      const recursive = (args.recursive as boolean) || false;
      try {
        const result = await withBridgeRetry(() => client.fileList(path, recursive), `list_files:${path}`);
        return { result: truncateToolOutput(JSON.stringify(result, null, 2)) };
      } catch {
        return { result: `Error listing ${path}: directory not found` };
      }
    }

    case "create_directory": {
      const path = args.path as string;
      try {
        await withBridgeRetry(() => client.fileMkdir(path), `create_directory:${path}`);
        return { result: `Created directory: ${path}` };
      } catch {
        return { result: `Error creating directory: ${path}` };
      }
    }

    case "delete_file": {
      const path = args.path as string;
      try {
        // Backup before delete for undo support
        const backup = ctx.sessionId ? await readFileForBackup(client, path) : null;
        await withBridgeRetry(() => client.fileDelete(path), `delete_file:${path}`);
        const relativePath = path.startsWith(pluginDir + "/")
          ? path.slice(pluginDir.length + 1)
          : path;
        delete writtenFiles[relativePath];
        // Track for undo
        if (ctx.sessionId) {
          trackFileAction(ctx.sessionId, {
            id: crypto.randomUUID(),
            type: "deleted",
            path,
            originalContent: backup?.content ?? null,
            newContent: null,
            contentTruncated: backup?.truncated ?? false,
            toolCallId: `delete_file:${relativePath}`,
            timestamp: new Date(),
          });
        }
        return { result: `Deleted: ${path}` };
      } catch {
        return { result: `Error deleting ${path}: file not found` };
      }
    }

    case "run_command": {
      const command = args.command as string;
      const cwd = (args.cwd as string) || undefined;
      try {
        const result = await withBridgeRetry(
          () => client.send("terminal.create", {
            command,
            cwd,
            timeout: TOOL_TIMEOUT_MS,
          }),
          `run_command:${command.slice(0, 50)}`,
        ) as { output?: string; exitCode?: number; error?: string };
        const output = result?.output ?? result?.error ?? "(no output)";
        const exitCode = result?.exitCode ?? -1;
        const prefix = exitCode === 0 ? "✅" : "❌";
        return { result: truncateToolOutput(`${prefix} Exit code: ${exitCode}\n${output}`) };
      } catch (err) {
        return { result: `Error running command: ${(err as Error).message}` };
      }
    }

    case "search_files": {
      const pattern = args.pattern as string;
      const searchPath = (args.path as string) || ".";
      const maxResults = Math.min(Math.max(Math.floor((args.maxResults as number) || 50), 1), 200);
      const filePattern = args.filePattern as string | undefined;

      // Sanitize pattern — escape shell-special chars to prevent injection
      const sanitizedPattern = pattern.replace(/[`$\\!;|&><]/g, "\\$&");

      let grepCmd = `grep -rn --color=never`;

      if (filePattern) {
        // Sanitize file pattern too
        const sanitizedFilePattern = filePattern.replace(/[`$\\!;|&><]/g, "\\$&");
        grepCmd += ` --include="${sanitizedFilePattern}"`;
      }

      grepCmd += ` --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build`;
      grepCmd += ` "${sanitizedPattern}" "${searchPath}"`;
      grepCmd += ` | head -n ${maxResults}`;

      try {
        const result = await withBridgeRetry(
          () => client.send("terminal.create", { command: grepCmd, timeout: 15_000 }),
          `search_files:${pattern.slice(0, 30)}`,
        ) as { output?: string; exitCode?: number };
        return { result: truncateToolOutput(result?.output ?? "(no matches)") };
      } catch {
        return { result: `Search error: could not execute grep for "${pattern}"` };
      }
    }

    case "get_file_outline": {
      const filePath = args.path as string;
      try {
        const { detectLanguage, getFileOutline, formatOutline, getFallbackOutline } = await import(
          "@/modules/cursor/code-indexer/ast-parser"
        );
        const fileResult = await withBridgeRetry(
          () => client.fileRead(filePath),
          `get_file_outline:${filePath}`,
        ) as { content?: string } | null;
        const content = fileResult?.content ?? "";
        if (!content) return { result: `File is empty or not found: ${filePath}` };

        const lang = detectLanguage(filePath);
        if (!lang) {
          return { result: truncateToolOutput(getFallbackOutline(content, filePath)) };
        }
        const outline = getFileOutline(content, lang);
        return { result: truncateToolOutput(formatOutline(outline)) };
      } catch (err) {
        return { result: `Error reading outline: ${(err as Error).message}` };
      }
    }

    case "get_function": {
      const filePath = args.path as string;
      const funcName = args.name as string;
      try {
        const { detectLanguage, getFunction, extractFunctions } = await import(
          "@/modules/cursor/code-indexer/ast-parser"
        );
        const fileResult = await withBridgeRetry(
          () => client.fileRead(filePath),
          `get_function:${filePath}:${funcName}`,
        ) as { content?: string } | null;
        const content = fileResult?.content ?? "";
        if (!content) return { result: `File is empty or not found: ${filePath}` };

        const lang = detectLanguage(filePath);
        if (!lang) {
          return { result: `Unsupported language for AST parsing: ${filePath}. Use read_file instead.` };
        }

        const fn = getFunction(content, lang, funcName);
        if (fn) {
          return {
            result: truncateToolOutput(
              `[${filePath}:${fn.startLine}-${fn.endLine}]${fn.isMethod ? ` (method of ${fn.className})` : ""}\n${fn.body}`,
            ),
          };
        }

        // Fuzzy match: maybe they got the name slightly wrong
        const allFns = extractFunctions(content, lang);
        const fuzzyMatch = allFns.filter((f) => f.name.toLowerCase().includes(funcName.toLowerCase()));
        if (fuzzyMatch.length > 0) {
          const names = fuzzyMatch.map((f) => `  ${f.name} (L${f.startLine})`).join("\n");
          return { result: `Function "${funcName}" not found. Did you mean:\n${names}` };
        }

        return { result: `Function "${funcName}" not found in ${filePath}` };
      } catch (err) {
        return { result: `Error extracting function: ${(err as Error).message}` };
      }
    }

    case "search_symbols": {
      const pattern = (args.pattern as string).toLowerCase();
      const searchPath = (args.path as string) || ".";
      const symbolType = (args.type as string) || "all";
      try {
        const { detectLanguage, extractFunctions, extractClasses } = await import(
          "@/modules/cursor/code-indexer/ast-parser"
        );

        // List files in the search path
        const fileList = await withBridgeRetry(
          () => client.fileList(searchPath, true),
          `search_symbols:list:${searchPath}`,
        ) as Array<{ path: string; type: string }> | null;
        if (!fileList || fileList.length === 0) {
          return { result: `No files found in ${searchPath}` };
        }

        // Filter to parseable files
        const parseableFiles = fileList.filter(
          (f) => f.type === "file" && detectLanguage(f.path) !== null,
        );

        const matches: string[] = [];
        const MAX_FILES = 50; // Don't parse too many files
        const MAX_MATCHES = 30;
        const filesToScan = parseableFiles.slice(0, MAX_FILES);

        for (const file of filesToScan) {
          if (matches.length >= MAX_MATCHES) break;
          try {
            const fileResult = await withBridgeRetry(
              () => client.fileRead(file.path),
              `search_symbols:read:${file.path}`,
            ) as { content?: string } | null;
            const content = fileResult?.content;
            if (!content) continue;

            const lang = detectLanguage(file.path)!;

            if (symbolType === "all" || symbolType === "function") {
              const fns = extractFunctions(content, lang);
              for (const fn of fns) {
                if (fn.name.toLowerCase().includes(pattern)) {
                  matches.push(`[fn] ${file.path}:${fn.startLine} — ${fn.signature}`);
                  if (matches.length >= MAX_MATCHES) break;
                }
              }
            }

            if (symbolType === "all" || symbolType === "class") {
              const classes = extractClasses(content, lang);
              for (const cls of classes) {
                if (cls.name.toLowerCase().includes(pattern)) {
                  const methodList = cls.methods.map((m) => m.name).join(", ");
                  matches.push(`[cls] ${file.path}:${cls.startLine} — ${cls.name} { ${methodList} }`);
                  if (matches.length >= MAX_MATCHES) break;
                }
              }
            }
          } catch {
            // Skip files that fail to parse
          }
        }

        if (matches.length === 0) {
          return { result: `No symbols matching "${args.pattern}" found in ${searchPath} (scanned ${filesToScan.length} files)` };
        }
        return { result: truncateToolOutput(matches.join("\n")) };
      } catch (err) {
        return { result: `Error searching symbols: ${(err as Error).message}` };
      }
    }

    case "create_plugin_record": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        if (ctx.organizationId) {
          (svcCtx as { organizationId?: string }).organizationId = ctx.organizationId;
        }

        const pluginName = args.name as string;
        const pluginSlug = args.slug as string;
        const description = (args.description as string) || "Created by Cursor Coder";
        const entry = (args.entry as string) || "index.js";
        const configSchema = (args.configSchema as Record<string, unknown>) || {};
        const configDefaults = (args.configDefaults as Record<string, unknown>) || {};
        const gatewayId = args.gatewayId as string | undefined;
        const category = (args.category as string) || "general";

        const plugin = await pluginService.createCustomPlugin(svcCtx, {
          slug: pluginSlug,
          name: pluginName,
          description,
          files: writtenFiles,
          entry,
          category: category as "general" | "analytics" | "messaging" | "automation" | "moderation" | "utilities",
          requiredGateways: ["TELEGRAM_BOT"],
          gatewayId,
          configSchema: Object.keys(configSchema).length > 0 ? configSchema : undefined,
          config: Object.keys(configDefaults).length > 0 ? configDefaults : undefined,
        });

        return {
          result: `Plugin "${plugin.pluginName}" created! [ID: ${plugin.id}, slug: ${plugin.pluginSlug}]`,
          finishData: { pluginId: plugin.id },
        };
      } catch (err) {
        return { result: `Error creating plugin record: ${(err as Error).message}` };
      }
    }

    case "update_plugin_record": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const pluginId = args.pluginId as string;
        const updateData: Record<string, unknown> = {};
        if (args.name) updateData.name = args.name;
        if (args.description) updateData.description = args.description;
        if (args.code) updateData.code = args.code;
        if (args.configSchema) updateData.configSchema = args.configSchema;

        await pluginService.updateCustomPlugin(svcCtx, pluginId, updateData as {
          code?: string; name?: string; description?: string;
          configSchema?: Record<string, unknown>;
        });
        return { result: `Plugin ${pluginId} updated.` };
      } catch (err) {
        return { result: `Error updating plugin: ${(err as Error).message}` };
      }
    }

    case "restart_plugin": {
      const slug = args.slug as string;
      const entry = (args.entry as string) || "index.js";
      const entryFile = `plugins/${slug}/${entry}`;
      try {
        try { await client.send("plugin.stop", { file: entryFile }); } catch { /* may not be running */ }
        await client.send("plugin.start", { file: entryFile });

        // N7: Plugin feedback loop — wait briefly then check logs for startup errors
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const logsResult = await client.send("plugin.logs", { file: entryFile }) as { logs?: string };
          const tail = typeof logsResult?.logs === "string" ? logsResult.logs.slice(-500) : "";
          if (tail && /error|exception|fatal|ENOENT|SyntaxError/i.test(tail)) {
            return { result: `Plugin "${slug}" restarted but logs show errors:\n${tail}\nPlease review and fix the code.` };
          }
        } catch {
          // Logs check failed — proceed without feedback
        }

        return { result: `Plugin "${slug}" restarted successfully (entry: ${entryFile})` };
      } catch (err) {
        return { result: `Error restarting plugin: ${(err as Error).message}` };
      }
    }

    case "finish": {
      return {
        result: "Agent finished.",
        finished: true,
        finishData: {
          entry: (args.entry as string) || "index.js",
          configSchema: (args.configSchema as Record<string, unknown>) || {},
          configDefaults: (args.configDefaults as Record<string, unknown>) || {},
          summary: (args.summary as string) || "Work complete",
        },
      };
    }

    case "hand_off_to_assistant": {
      return {
        result: "Handing off to Cursor Assistant...",
        handOff: {
          workerType: "assistant",
          context: (args.context as string) || "",
        },
      };
    }

    case "clone_plugin": {
      const sourceSlug = args.sourceSlug as string;
      const newSlug = args.newSlug as string;
      const newName = args.newName as string || newSlug;
      if (!sourceSlug || !newSlug) return { result: "Error: sourceSlug and newSlug are required." };

      try {
        // Read all files from source plugin directory
        const sourceDir = `plugins/${sourceSlug}`;
        const destDir = `plugins/${newSlug}`;
        const files = await withBridgeRetry(() => client.fileList(sourceDir, true), `clone:list:${sourceSlug}`);
        const fileList = Array.isArray(files) ? files as Array<{ name: string; type: string }> : [];
        const fileNames = fileList.filter((f) => f.type === "file").map((f) => f.name);

        if (fileNames.length === 0) {
          return { result: `Error: No files found in ${sourceDir}. Is the source plugin a directory plugin?` };
        }

        // Create dest directory and copy files
        await withBridgeRetry(() => client.fileMkdir(destDir), `clone:mkdir:${newSlug}`);
        for (const fileName of fileNames) {
          const content = await withBridgeRetry(
            () => client.fileRead(`${sourceDir}/${fileName}`) as Promise<{ content?: string }>,
            `clone:read:${fileName}`,
          );
          await withBridgeRetry(
            () => client.fileWrite(`${destDir}/${fileName}`, content?.content ?? "", true),
            `clone:write:${fileName}`,
          );
        }

        return { result: `Cloned "${sourceSlug}" → "${newSlug}" (${fileNames.length} files copied to ${destDir}). Use create_plugin_record to register "${newName}" as a new plugin.` };
      } catch (err) {
        return { result: `Error cloning plugin: ${(err as Error).message}` };
      }
    }

    default:
      return null; // Not a coder tool
  }
}

// ===========================================
// Unified Tool Executor
// ===========================================

async function executeTool(
  workerType: CursorWorkerType,
  toolName: string,
  args: Record<string, unknown>,
  ctx: {
    userId: string;
    organizationId: string | null;
    client: BridgeClient | null;
    pluginDir: string;
    writtenFiles: Record<string, string>;
    workflowContext?: WorkflowContext;
    sessionId?: string;
  },
): Promise<ToolExecResult> {
  // Safety validation (skip hand_off, ask_user, finish, navigate)
  const skipSafety = ["hand_off_to_coder", "hand_off_to_assistant", "ask_user", "finish", "navigate_page"];
  if (!skipSafety.includes(toolName)) {
    const safetyToolName = toolName === "list_files" ? "list_directory" : toolName;
    const safetyError = validateToolCallArgs(safetyToolName, args);
    if (safetyError) {
      workerLog.warn({ tool: toolName, reason: safetyError }, "Worker tool call blocked by safety");
      return { result: `Blocked: ${safetyError}` };
    }
  }

  // Try shared tools first (list_gateways, list_user_plugins)
  const sharedResult = await executeSharedTool(toolName, args, ctx);
  if (sharedResult) return sharedResult;

  // Try workflow tools (when in studio mode)
  if (ctx.workflowContext) {
    const { executeWorkflowTool } = await import("./cursor-workflow-tools");
    const wfResult = await executeWorkflowTool(toolName, args, {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      workflowContext: ctx.workflowContext,
    });
    if (wfResult) return wfResult;
  }

  // Then try worker-specific tools
  if (workerType === "assistant") {
    const assistantResult = await executeAssistantTool(toolName, args, ctx);
    if (assistantResult) return assistantResult;
  }

  if (workerType === "coder") {
    if (!ctx.client) {
      return { result: "Error: No workspace connection. The workspace must be running for code operations." };
    }
    const coderResult = await executeCoderTool(toolName, args, ctx.client, ctx.pluginDir, ctx.writtenFiles, ctx);
    if (coderResult) return coderResult;
  }

  return { result: `Unknown tool: ${toolName}` };
}

// ===========================================
// Model Selection per Worker
// ===========================================

/**
 * Smart model selection: use cheap lite model for tool-routing iterations,
 * full model only when generating substantial text/code output.
 *
 * This is the "Planner/Executor" pattern used by Cursor AI and GitHub Copilot:
 * - Routing decisions (which tool to call next) → cheap model
 * - Code generation / substantial replies → user's chosen model
 *
 * Output tokens cost 3-4× more than input, but routing iterations produce
 * minimal output (just tool call JSON), so the savings come from cheaper input rates.
 */
const LITE_ROUTING_MODEL = "2bot-ai-text-lite";

function getModelForWorker(
  _workerType: CursorWorkerType,
  requestModelId: string | undefined,
  useRoutingModel: boolean,
): string {
  // If no explicit model selected, always use auto (already cheapest)
  if (!requestModelId) return "auto";

  // For routing iterations (tool-only, no substantial text), use lite model
  // This saves 40-70% on input token costs for planning/routing turns
  // Falls back to user's model if lite can't resolve (e.g., no providers configured)
  if (useRoutingModel) {
    try {
      if (canResolveTwoBotAIModel(LITE_ROUTING_MODEL)) return LITE_ROUTING_MODEL;
    } catch { /* fallback to user model */ }
    return requestModelId;
  }

  // For code generation and substantive replies, use the user's chosen model
  return requestModelId;
}

// ===========================================
// Hand-off Context Builder
// ===========================================

/**
 * Build an enriched hand-off context that includes:
 * - The worker's stated task/context
 * - Files written so far
 * - Recent tool results from the conversation
 */
function buildHandOffContext(
  workerContext: string,
  writtenFiles: Record<string, string>,
  messages: TextGenerationMessage[],
): string {
  const parts: string[] = [];

  // 1. Worker's stated context
  if (workerContext) {
    parts.push(`Task: ${workerContext}`);
  }

  // 2. Files written so far
  const fileList = Object.keys(writtenFiles);
  if (fileList.length > 0) {
    parts.push(`Files written (${fileList.length}): ${fileList.join(", ")}`);
  }

  // 3. Last few tool results from conversation (skip system/user-message noise)
  const toolResults: string[] = [];
  for (let i = messages.length - 1; i >= 0 && toolResults.length < 5; i--) {
    const msg = messages[i];
    if (msg?.role === "user" && typeof msg.content === "string" && msg.content.startsWith("[✅ TOOL RESULT:")) {
      // Extract tool name and first line of result
      const firstLine = msg.content.split("\n")[0] ?? "";
      toolResults.unshift(firstLine);
    }
  }
  if (toolResults.length > 0) {
    parts.push(`Recent results:\n${toolResults.join("\n")}`);
  }

  return parts.join("\n\n");
}

// ===========================================
// Streaming Worker Loop (async generator)
// ===========================================

/**
 * Run the multi-worker streaming loop.
 *
 * Yields CursorAgentEvent objects as workers complete tasks.
 * Supports hand-off between workers and ask_user pauses.
 *
 * @param request - WorkerStreamRequest with message, userId, etc.
 * @yields CursorAgentEvent — worker_start, tool_start, tool_result,
 *         code_preview, worker_switch, ask_user, thinking, status, done, error
 */
export async function* runWorkerStream(
  request: WorkerStreamRequest,
): AsyncGenerator<CursorAgentEvent> {
  const {
    message,
    userId,
    organizationId,
  } = request;

  // ── Resume: load suspended session from DB ───────────
  let isResume = false;
  let resumeMessages: TextGenerationMessage[] | undefined;
  let resumeState: SuspendedSessionState | undefined;

  if (request.resumeSessionId) {
    const saved = await agentSessionService.getSessionForResume(request.resumeSessionId);
    if (!saved) {
      yield {
        type: "error" as const,
        message: "Could not resume session — it may have expired or already completed.",
      };
      return;
    }
    // Defense-in-depth: verify ownership
    if (saved.userId !== userId) {
      yield {
        type: "error" as const,
        message: "Session ownership mismatch.",
      };
      return;
    }
    resumeMessages = saved.messages as unknown as TextGenerationMessage[];
    resumeState = saved.suspendedState as unknown as SuspendedSessionState;
    isResume = true;

    // Mark session as running again (clears saved state from DB)
    await agentSessionService.resumeSession(saved.id);
  }

  // ── Session setup ────────────────────────────────────
  const sessionId = isResume ? request.resumeSessionId! : crypto.randomUUID();
  const startedAt = new Date();
  // N1: Session-scoped logger — all log lines automatically include sessionId + userId
  const slog = workerLog.child({ sessionId, userId });
  let totalCreditsUsed = isResume && resumeState ? resumeState.totalCreditsUsed : 0;
  let totalInputTokens = isResume && resumeState ? resumeState.totalInputTokens : 0;
  let totalOutputTokens = isResume && resumeState ? resumeState.totalOutputTokens : 0;
  let totalIterations = isResume && resumeState ? resumeState.totalIterations : 0;
  let totalToolCalls = isResume && resumeState ? resumeState.totalToolCalls : 0;
  let toolCallSequence = isResume && resumeState ? resumeState.toolCallSequence : 0;
  /** Accumulated time spent waiting for user answers — excluded from session timeout */
  let pausedMs = isResume && resumeState ? resumeState.pausedMs : 0;

  // Route to initial worker
  // If repoUrl is attached, always route to coder (repo analysis requires workspace + coder tools)
  const initialWorker = isResume && resumeState
    ? resumeState.currentWorker
    : (request.workerType
      || (request.repoUrl ? "coder" as CursorWorkerType : routeToWorker(message, { hasWorkflowContext: !!request.workflowContext })));

  slog.info(
    { initialWorker, message: message.slice(0, 100), isResume },
    isResume ? "🔄 Worker stream resumed" : "🤖 Worker stream started",
  );

  // Get bridge connection (may be null for assistant-only tasks)
  const bridge = await getBridgeClient(userId, organizationId);
  const client = bridge?.client ?? null;
  const workspaceId = bridge?.workspaceId;

  // Persist session to database (skip for resumed sessions — already exists)
  if (!isResume) {
    agentSessionService.createSession({
      id: sessionId,
      userId,
      organizationId: organizationId ?? undefined,
      workspaceId: workspaceId ?? "none",
      model: getModelForWorker(initialWorker, request.modelId, false),
      prompt: `[worker:${initialWorker}] ${message.slice(0, 500)}`,
    });
  }

  // Mutable state that persists across worker hand-offs
  const writtenFiles: Record<string, string> = isResume && resumeState
    ? { ...resumeState.writtenFiles }
    : {};

  // Initialize file action tracking for undo support
  initFileTracking(sessionId);

  // Repo analysis state (populated when repoUrl is provided)
  let repoAnalysis: RepoAnalysis | undefined = isResume && resumeState?.repoAnalysis
    ? resumeState.repoAnalysis as RepoAnalysis
    : undefined;
  let repoCloneDir: string | undefined = isResume && resumeState?.repoCloneDir
    ? resumeState.repoCloneDir
    : undefined;

  // If pluginSlug/mode weren't provided by the frontend, try to extract from message.
  // This enables direct-to-coder routing ("edit my echo-bot") to get edit-mode prompts.
  let pluginSlug = isResume && resumeState?.pluginSlug ? resumeState.pluginSlug : request.pluginSlug;
  let pluginName = isResume && resumeState?.pluginName ? resumeState.pluginName : request.pluginName;
  let pluginMode = isResume && resumeState?.pluginMode ? resumeState.pluginMode : request.mode;
  if (!isResume && (!pluginSlug || !pluginMode)) {
    const extracted = extractPluginContext(message);
    if (!pluginSlug && extracted.slug) pluginSlug = extracted.slug;
    if (!pluginName && extracted.name) pluginName = extracted.name;
    if (!pluginMode && extracted.mode) pluginMode = extracted.mode;
  }

  let pluginDir = isResume && resumeState?.pluginDir
    ? resumeState.pluginDir
    : (pluginSlug ? `plugins/${pluginSlug}` : "plugins");
  let pluginId: string | undefined = isResume && resumeState?.pluginId
    ? resumeState.pluginId
    : undefined;
  let finishSummary: string | undefined;
  let lastAssistantText: string | undefined = isResume && resumeState?.lastAssistantText
    ? resumeState.lastAssistantText
    : undefined;

  /** Set when the session is suspended (ask_user) — prevents finally cleanup */
  let sessionSuspended = false;

  // ── Repo Analysis: Clone & Analyze (if repoUrl provided, skip on resume) ──
  if (!isResume && request.repoUrl && !client) {
    // Workspace required for repo clone — fail early with clear message
    yield {
      type: "error" as const,
      message: "A running workspace is required to clone and analyze a repository. Please start your workspace first, then try again with the repo URL attached.",
      sessionId,
      creditsUsed: totalCreditsUsed,
    };
    return;
  }

  if (!isResume && request.repoUrl && client) {
    // Force coder mode for repo analysis
    if (!pluginMode) pluginMode = "create";

    // Derive repo name from URL
    const repoName = request.repoUrl
      .replace(/\.git$/, "")
      .split("/")
      .pop()
      ?.replace(/[^a-zA-Z0-9_-]/g, "-") || "cloned-repo";

    repoCloneDir = `imports/${repoName}`;
    if (!pluginSlug) pluginSlug = repoName;
    if (!pluginName) pluginName = repoName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    pluginDir = `plugins/${pluginSlug}`;

    yield { type: "status" as const, message: `Cloning repository...` };

    try {
      const cloneResult = await client.gitClone(request.repoUrl, {
        targetDir: repoCloneDir,
        branch: request.repoBranch,
        depth: 1,
      }) as { success: boolean; error?: string };

      if (!cloneResult?.success) {
        yield {
          type: "error" as const,
          message: `Failed to clone repository: ${cloneResult?.error || "Unknown error"}`,
          sessionId,
          creditsUsed: totalCreditsUsed,
        };
        return;
      }

      yield { type: "status" as const, message: "Repository cloned. Analyzing source code..." };

      // Lazy import to avoid circular deps
      const { analyzeRepo } = await import("./repo-analyzer.service");
      const result = await analyzeRepo(client, repoCloneDir, userId, request.repoUrl, request.modelId);
      repoAnalysis = result.analysis;
      totalCreditsUsed += result.creditsUsed;

      const featureSummary = repoAnalysis.features.length > 0
        ? repoAnalysis.features.slice(0, 5).join(", ")
        : "no specific features detected";

      yield {
        type: "status" as const,
        message: `Analyzed: ${repoAnalysis.purpose} (${repoAnalysis.language}, ${repoAnalysis.complexity}). Features: ${featureSummary}`,
      };

      slog.info(
        {
          language: repoAnalysis.language,
          complexity: repoAnalysis.complexity,
          featureCount: repoAnalysis.features.length,
          creditsUsed: result.creditsUsed,
        },
        "Repo analysis complete",
      );
    } catch (err) {
      yield {
        type: "error" as const,
        message: `Failed to analyze repository: ${(err as Error).message}`,
        sessionId,
        creditsUsed: totalCreditsUsed,
      };
      return;
    }
  }

  // Worker hand-off loop
  let currentWorker = initialWorker;
  let handOffContext: string | undefined = isResume && resumeState?.handOffContext
    ? resumeState.handOffContext
    : undefined;
  let handOffCount = isResume && resumeState ? resumeState.handOffCount : 0;
  const MAX_HAND_OFFS = 4; // Safety limit

  // On resume: inject the user's answer into the saved messages and skip prompt building
  let resumeMessagesReady: TextGenerationMessage[] | undefined;
  if (isResume && resumeMessages) {
    resumeMessagesReady = [
      ...resumeMessages,
      {
        role: "user" as const,
        content: `[✅ TOOL RESULT: ask_user]\nUser answered: ${message}`,
      },
    ];
  }

  try {
    while (handOffCount <= MAX_HAND_OFFS) {
      let workerMeta = WORKER_META[currentWorker];

      // ── Emit worker_start ──────────────────────────────
      yield {
        type: "worker_start" as const,
        worker: currentWorker,
        displayName: workerMeta.displayName,
        sessionId,
      };

      slog.info(
        { worker: currentWorker, handOffCount },
        `🔧 Worker started: ${workerMeta.displayName}`,
      );

      // ── Fetch lightweight user state for prompt context ──
      let userState: WorkerPromptContext["userState"];
      let priorSessionSummaries: string[] | undefined;
      try {
        const [user, gatewayCount, pluginCount, recentSessions] = await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            select: { plan: true },
          }),
          prisma.gateway.count({
            where: { userId, ...(organizationId ? { organizationId } : {}) },
          }),
          prisma.userPlugin.count({
            where: { userId },
          }),
          // Load recent completed sessions for conversation continuity
          handOffCount === 0 ? prisma.agentSession.findMany({
            where: { userId, status: "completed", finalResponse: { not: null } },
            orderBy: { startedAt: "desc" },
            take: 3,
            select: { finalResponse: true, startedAt: true, prompt: true },
          }) : Promise.resolve([]),
        ]);
        userState = {
          plan: user?.plan ?? "FREE",
          gatewayCount,
          pluginCount,
          workspaceRunning: !!client,
        };
        if (recentSessions.length > 0) {
          priorSessionSummaries = recentSessions
            .filter((s) => s.finalResponse)
            .map((s) => {
              const date = s.startedAt.toISOString().split("T")[0];
              const task = s.prompt?.replace(/^\[worker:\w+\]\s*/, "").slice(0, 80) ?? "";
              const result = s.finalResponse!.slice(0, 150);
              return `[${date}] ${task} → ${result}`;
            });
        }
        // N2: Adapt session limits based on user plan
        workerMeta = getAdaptiveWorkerMeta(currentWorker, userState.plan);

        // Repo analysis sessions need a higher credit budget:
        // AI analysis + multi-file plugin generation is inherently expensive
        const effectiveRepoUrl = isResume && resumeState?.repoUrl ? resumeState.repoUrl : request.repoUrl;
        if (effectiveRepoUrl && request.mode === "analyze-repo") {
          workerMeta = {
            ...workerMeta,
            maxCreditsPerSession: Math.max(workerMeta.maxCreditsPerSession, 200),
            maxIterations: Math.max(workerMeta.maxIterations, 40),
            sessionTimeoutMs: Math.max(workerMeta.sessionTimeoutMs, 480_000), // 8 min
          };
        }
      } catch {
        // Non-critical — proceed without user state
      }

      // ── Build system prompt ────────────────────────────
      const promptCtx: WorkerPromptContext = {
        task: request.description
          ? `${message}\n\nUser description: ${request.description}`
          : message,
        pluginSlug,
        pluginName,
        mode: pluginMode,
        handOffContext,
        userState,
        repoAnalysis,
        repoCloneDir,
        priorSessionSummaries,
        workflowContext: request.workflowContext,
      };

      let systemPrompt = currentWorker === "assistant"
        ? buildAssistantSystemPrompt(promptCtx)
        : buildCoderSystemPrompt(promptCtx);

      // ── Studio mode prompt adjustments ─────────────────
      if (request.studioMode === "ask") {
        systemPrompt += `\n\n## Mode: Ask
You are in ASK mode. The user wants a clear, helpful answer to their question.
- You have READ-ONLY diagnostic tools available — USE THEM to investigate before answering
- When the user asks about errors, failures, or problems: check logs, workspace status, and gateway status FIRST
- When the user asks about credits, billing, or usage: call the relevant check tool
- When the user asks about their bot/workflow: look up the gateway status, plugin config, and workspace logs
- Do NOT make changes — never create, update, delete, or restart anything
- Provide thorough, well-structured answers with SPECIFIC data from the tools you called
- If you find an issue, explain what's wrong and suggest what the user should do (they can switch to Agent mode to fix it)
- Reference specific features, tools, or concepts relevant to 2Bot
- If the user asks about their workflow/bot, use the workflow context above to give a specific answer`;
      } else if (request.studioMode === "plan") {
        systemPrompt += `\n\n## Mode: Plan
You are in PLAN mode. The user wants a step-by-step plan for changes.
- Do NOT execute any mutations — only READ data if needed to inform the plan
- Produce a numbered step-by-step plan describing exactly what changes to make
- For each step, explain WHAT it does, WHY it's needed, and WHICH tool/action would be used
- If the workflow context is available, reference specific steps by name/order
- End with a summary of expected outcome
- The user can switch to Agent mode to execute the plan`;
      }

      // ── Build tool definitions ─────────────────────────
      const effectiveStudioMode = isResume && resumeState?.studioMode
        ? resumeState.studioMode
        : request.studioMode;
      const effectiveHasWorkflowContext = isResume && resumeState
        ? resumeState.hasWorkflowContext
        : !!request.workflowContext;
      const workerTools = getWorkerTools(currentWorker, {
        hasWorkflowContext: effectiveHasWorkflowContext,
        studioMode: effectiveStudioMode,
      });
      const toolDefs: ToolDefinition[] = workerTools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as ToolDefinition["parameters"],
      }));

      // ── Initialize messages ────────────────────────────
      let messages: TextGenerationMessage[];

      if (resumeMessagesReady) {
        // On resume: use saved messages with user's answer already injected
        messages = resumeMessagesReady;
        resumeMessagesReady = undefined; // Only use for first iteration after resume
      } else {
        // Normal path: build from scratch
        // Enrich user message with attached repo URL if present (so the LLM knows about it)
        let userMessage = message;
        if (request.repoUrl && handOffCount === 0) {
          userMessage = `${message}\n\n[Attached repository: ${request.repoUrl}]`;
        }

        messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: handOffContext ? `${handOffContext}\n\nOriginal user message: ${userMessage}` : userMessage },
        ];
      }

      // If coder + no bridge, warn early
      if (currentWorker === "coder" && !client) {
        yield {
          type: "error" as const,
          message: "No running workspace found. Please start your workspace first.",
          sessionId,
          creditsUsed: totalCreditsUsed,
        };
        return;
      }

      // ── File snapshot for rollback (coder edit mode) ───
      const originalFiles: Record<string, string> = {};
      if (currentWorker === "coder" && pluginMode === "edit" && client && pluginSlug) {
        try {
          const existing = await client.fileList(pluginDir, true) as Array<{ name: string; type: string }>;
          const files = (existing || []).filter((f) => f.type === "file");
          for (const f of files) {
            try {
              const content = await client.fileRead(`${pluginDir}/${f.name}`) as { content?: string };
              if (content?.content) originalFiles[f.name] = content.content;
            } catch { /* skip */ }
          }
        } catch { /* no snapshot available */ }
      }

      // ── Agentic loop for this worker ───────────────────
      let workerFinished = false;
      let handOff: ToolExecResult["handOff"] | undefined;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 3;
      // Track whether last response was tool-only (no substantial text) for smart model routing
      let lastResponseWasToolOnly = false;

      for (let turn = 0; turn < workerMeta.maxIterations; turn++) {
        // Safety: session limits (exclude time spent waiting for user answers)
        const effectiveStart = new Date(startedAt.getTime() + pausedMs);
        const limitError = checkSessionLimits(
          totalIterations,
          totalCreditsUsed,
          effectiveStart,
          {
            maxIterations: workerMeta.maxIterations,
            maxCreditsPerSession: workerMeta.maxCreditsPerSession,
            sessionTimeoutMs: workerMeta.sessionTimeoutMs,
          },
        );
        if (limitError) {
          slog.warn({ worker: currentWorker, reason: limitError }, "Worker limit reached");
          const filesWritten = Object.keys(writtenFiles).length;
          const creditHint = limitError.toLowerCase().includes("credit")
            ? " Please add credits and try again."
            : "";
          finishSummary = filesWritten > 0
            ? `Session limit reached: ${limitError}.${creditHint} ${filesWritten} file(s) were saved successfully.`
            : `Session limit reached: ${limitError}.${creditHint}`;
          yield { type: "status" as const, message: finishSummary };
          break;
        }

        // Pre-check user credit balance before expensive AI call
        if (turn % 3 === 0) { // Check every 3rd iteration to avoid DB spam
          try {
            const { twoBotAICreditService } = await import("@/modules/credits/2bot-ai-credit.service");
            const balance = await twoBotAICreditService.getBalance(userId);
            if (balance.balance <= 0) {
              const filesWritten = Object.keys(writtenFiles).length;
              finishSummary = filesWritten > 0
                ? `You've run out of credits. ${filesWritten} file(s) were saved successfully. Please add credits to continue.`
                : "You've run out of credits. Please add credits to continue.";
              slog.warn({ balance: balance.balance }, "User credits exhausted — stopping session");
              yield { type: "status" as const, message: finishSummary };
              break;
            }
          } catch {
            // Non-critical — proceed without balance check
          }
        }

        totalIterations++;

        yield {
          type: "iteration_start" as const,
          iteration: totalIterations,
          totalCreditsUsed,
        };

        try {
          // Prune old messages to cap context window growth
          if (totalIterations > PRUNE_AFTER_ITERATION) {
            messages = pruneMessages(messages);
          }

          const response = await withRetry(
            () => twoBotAIProvider.textGeneration({
              messages,
              model: getModelForWorker(currentWorker, resumeState?.modelId || request.modelId, lastResponseWasToolOnly),
              temperature: currentWorker === "coder" ? 0.2 : 0.4,
              maxTokens: 4096,
              stream: false,
              userId,
              tools: toolDefs,
              toolChoice: "auto",
              feature: "cursor",
              capability: currentWorker === "coder" ? "code-generation" : undefined,
              traceId: sessionId,
            }),
            {
              maxRetries: 2,
              operationName: `cursor-${currentWorker}-ai-call`,
            },
          );

          totalCreditsUsed += response.creditsUsed ?? 0;
          totalInputTokens += response.usage.inputTokens;
          totalOutputTokens += response.usage.outputTokens;

          const assistantContent = response.content || "";
          const toolCalls = response.toolCalls;

          // Smart model routing: detect if this was a tool-routing-only response
          // If AI just called tools with minimal/no text, next iteration can use cheap model
          // If AI produced substantial text or called write_file (code generation), use full model
          const hasSubstantialText = assistantContent.length > 200;
          const hasWriteCall = toolCalls?.some((tc) =>
            tc.name === "write_file" || tc.name === "edit_file" || tc.name === "finish"
          );
          lastResponseWasToolOnly = !!(toolCalls && toolCalls.length > 0 && !hasSubstantialText && !hasWriteCall);

          if (assistantContent) {
            yield { type: "thinking" as const, text: assistantContent };
            if (currentWorker === "assistant") {
              lastAssistantText = assistantContent;
            }
          }

          // Text-only response (no tool calls) = worker is done talking
          if (!toolCalls || toolCalls.length === 0) {
            slog.info({ worker: currentWorker }, "Worker responded with text only — done");
            // For assistant: text response IS the answer
            if (currentWorker === "assistant") {
              workerFinished = true;
              finishSummary = assistantContent;
            }
            break;
          }

          if (assistantContent) {
            messages.push({ role: "assistant", content: assistantContent });
          }

          // Execute tool calls — parallel for read-only batches, sequential otherwise
          const READ_ONLY_TOOLS = new Set([
            "read_file", "list_files", "search_files",
            "list_gateways", "list_user_plugins",
            "check_credits", "check_billing", "check_usage",
            "check_gateway_status", "list_templates",
            "view_plugin_logs", "explain_error",
            "list_available_plugins",
          ]);
          const CONTROL_FLOW_TOOLS = new Set([
            "ask_user", "finish", "hand_off_to_coder", "hand_off_to_assistant",
          ]);

          const allReadOnly = toolCalls.every((tc) =>
            READ_ONLY_TOOLS.has(tc.name) && !CONTROL_FLOW_TOOLS.has(tc.name)
          );

          if (allReadOnly && toolCalls.length > 1) {
            // ── Parallel execution for read-only batch ───
            slog.debug(
              { toolCount: toolCalls.length },
              "Executing read-only tools in parallel",
            );

            // Emit all tool_start events
            for (const tc of toolCalls) {
              const toolArgs = tc.arguments as Record<string, unknown>;
              const uiActions = buildToolUIActions(tc.name, toolArgs);
              yield {
                type: "tool_start" as const,
                tool: tc.name,
                meta: buildToolStartMeta(tc.name, toolArgs),
                ...(uiActions.length > 0 ? { uiActions } : {}),
              };
            }

            // Execute all in parallel (with timing)
            const batchStart = Date.now();
            const results = await Promise.all(
              toolCalls.map((tc) =>
                executeTool(
                  currentWorker,
                  tc.name,
                  tc.arguments as Record<string, unknown>,
                  { userId, organizationId, client, pluginDir, writtenFiles, workflowContext: resumeState?.workflowContext || request.workflowContext, sessionId },
                )
              ),
            );
            const batchDurationMs = Date.now() - batchStart;

            // Process results and emit events
            for (let i = 0; i < toolCalls.length; i++) {
              const tc = toolCalls[i]!;
              const toolResult = results[i]!;
              const toolArgs = tc.arguments as Record<string, unknown>;

              totalToolCalls++;
              const isError = toolResult.result.startsWith("Blocked:") || toolResult.result.startsWith("Error");

              yield {
                type: "tool_result" as const,
                tool: tc.name,
                success: !isError,
                summary: toolResult.result.slice(0, 200),
              };

              agentSessionService.recordToolCall(
                sessionId,
                {
                  toolCallId: tc.id ?? `tc-${toolCallSequence}`,
                  toolName: tc.name,
                  output: toolResult.result,
                  isError,
                  durationMs: batchDurationMs,
                },
                toolArgs,
                toolCallSequence,
              );
              toolCallSequence++;

              const statusPrefix = isError ? "❌ TOOL ERROR" : "✅ TOOL RESULT";
              messages.push({
                role: "user",
                content: `[${statusPrefix}: ${tc.name}]\n${toolResult.result}`,
              });
            }
          } else {
          // ── Sequential execution (writes, control flow, or single tool) ───
          for (const tc of toolCalls) {
            const toolArgs = tc.arguments as Record<string, unknown>;

            // ── ask_user: suspend session, close stream ──
            // Instead of blocking with a Promise, we save full state to DB
            // and close the SSE stream. The user can answer minutes/hours/days
            // later, and a new stream will resume from the saved state.
            if (tc.name === "ask_user") {
              const question = (toolArgs.question as string) || "Could you clarify?";
              const sensitive = !!(toolArgs.sensitive as boolean);
              const options = Array.isArray(toolArgs.options)
                ? (toolArgs.options as Array<{ label: string; value: string }>)
                : undefined;

              // Build suspended state blob
              const suspendState: SuspendedSessionState = {
                currentWorker,
                handOffCount,
                handOffContext,
                pluginSlug,
                pluginName,
                pluginMode: pluginMode as "create" | "edit" | undefined,
                pluginDir,
                pluginId,
                repoAnalysis,
                repoCloneDir,
                totalIterations,
                totalToolCalls,
                totalCreditsUsed,
                totalInputTokens,
                totalOutputTokens,
                toolCallSequence,
                pausedMs,
                writtenFiles,
                lastAssistantText,
                studioMode: request.studioMode,
                hasWorkflowContext: !!request.workflowContext,
                workflowContext: request.workflowContext,
                modelId: request.modelId,
                repoUrl: request.repoUrl,
              };

              // Save state to DB
              await agentSessionService.suspendSession({
                id: sessionId,
                messages,
                suspendedState: suspendState as unknown as Record<string, unknown>,
                iterationCount: totalIterations,
                toolCallCount: totalToolCalls,
                totalCreditsUsed,
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
              });

              // Yield suspended event (frontend stores this + shows question UI)
              yield {
                type: "suspended" as const,
                sessionId,
                question,
                sensitive,
                options,
              };

              sessionSuspended = true;
              slog.info(
                { question: question.slice(0, 100), hasOptions: !!options },
                "Session suspended — waiting for user answer",
              );
              return; // End the generator — stream closes cleanly
            }

            // ── Destructive action approval ──────────────
            const DESTRUCTIVE_TOOLS = new Set(["delete_file", "delete_gateway", "uninstall_plugin"]);
            if (DESTRUCTIVE_TOOLS.has(tc.name)) {
              const target = (toolArgs.path as string) || (toolArgs.gatewayId as string) || (toolArgs.name as string) || (toolArgs.pluginId as string) || "this resource";
              yield {
                type: "ask_user" as const,
                question: `⚠️ Confirm destructive action: **${tc.name}** on "${target}". This cannot be undone. Proceed? (yes/no)`,
                sensitive: false,
                sessionId,
              };

              let approval: string;
              const approvalWaitStart = Date.now();
              try {
                approval = await waitForUserAnswer(sessionId, userId);
              } catch {
                pausedMs += Date.now() - approvalWaitStart;
                messages.push({
                  role: "user",
                  content: `[TOOL RESULT: ${tc.name}]\nUser did not confirm. Action cancelled.`,
                });
                continue;
              }
              pausedMs += Date.now() - approvalWaitStart;

              const approved = /^(y|yes|ok|confirm|proceed|sure|do it)/i.test(approval.trim());
              if (!approved) {
                messages.push({
                  role: "user",
                  content: `[TOOL RESULT: ${tc.name}]\nUser rejected the action. Do NOT retry — try a different approach or ask what they want instead.`,
                });
                slog.info({ tool: tc.name, target }, "Destructive action rejected by user");
                continue;
              }
              slog.info({ tool: tc.name, target }, "Destructive action approved by user");
            }

            // ── Regular tool execution ───────────────────
            {
              const uiActions = buildToolUIActions(tc.name, toolArgs);
              yield {
                type: "tool_start" as const,
                tool: tc.name,
                meta: buildToolStartMeta(tc.name, toolArgs),
                ...(uiActions.length > 0 ? { uiActions } : {}),
              };
            }

            const toolStartTs = Date.now();
            const toolResult = await executeTool(
              currentWorker,
              tc.name,
              toolArgs,
              { userId, organizationId, client, pluginDir, writtenFiles, workflowContext: resumeState?.workflowContext || request.workflowContext, sessionId },
            );
            const toolDurationMs = Date.now() - toolStartTs;

            totalToolCalls++;
            const isError = toolResult.result.startsWith("Blocked:") || toolResult.result.startsWith("Error");

            yield {
              type: "tool_result" as const,
              tool: tc.name,
              success: !isError,
              summary: toolResult.result.slice(0, 200),
            };

            // Emit code_preview on write_file
            if (tc.name === "write_file" && !isError) {
              const filePath = (toolArgs.path as string) || "";
              const relativePath = filePath.startsWith(pluginDir + "/")
                ? filePath.slice(pluginDir.length + 1)
                : filePath;
              const content = (toolArgs.content as string) || "";
              yield {
                type: "code_preview" as const,
                file: relativePath,
                preview: content.slice(0, 500),
                totalBytes: content.length,
              };
            }

            // Emit file_action for undo support (write_file, delete_file)
            if ((tc.name === "write_file" || tc.name === "delete_file") && !isError) {
              const filePath = (toolArgs.path as string) || "";
              const content = (toolArgs.content as string) || "";
              const relativePath = filePath.startsWith(pluginDir + "/")
                ? filePath.slice(pluginDir.length + 1)
                : filePath;
              yield {
                type: "file_action" as const,
                action: {
                  id: `${tc.name}:${relativePath}`,
                  type: tc.name === "delete_file" ? "deleted" as const : (writtenFiles[relativePath] ? "modified" as const : "created" as const),
                  path: filePath,
                  originalPreview: null,
                  newPreview: tc.name === "write_file" ? content.slice(0, 500) : null,
                  toolCallId: tc.id ?? `tc-${toolCallSequence}`,
                },
              };
            }

            // Track plugin creation
            if (tc.name === "create_plugin_record" && toolResult.finishData?.pluginId) {
              pluginId = toolResult.finishData.pluginId;
            }

            // Persist tool call
            agentSessionService.recordToolCall(
              sessionId,
              {
                toolCallId: tc.id ?? `tc-${toolCallSequence}`,
                toolName: tc.name,
                output: toolResult.result,
                isError,
                durationMs: toolDurationMs,
              },
              toolArgs,
              toolCallSequence,
            );
            toolCallSequence++;

            // Audit log for sensitive/destructive tool calls (fire-and-forget)
            const AUDITED_TOOLS = new Set([
              "delete_file", "delete_gateway", "uninstall_plugin",
              "create_gateway", "install_plugin", "create_plugin_record",
              "write_file", "run_command",
            ]);
            if (AUDITED_TOOLS.has(tc.name)) {
              import("@/lib/audit").then(({ auditActions }) => {
                auditActions.cursorToolExecuted(
                  { userId, organizationId: organizationId ?? undefined },
                  sessionId,
                  tc.name,
                  toolArgs,
                  { success: !isError, summary: toolResult.result.slice(0, 200) },
                );
              }).catch(() => {}); // Fire-and-forget
            }

            // Feed result back to LLM
            const statusPrefix = isError ? "❌ TOOL ERROR" : "✅ TOOL RESULT";
            messages.push({
              role: "user",
              content: `[${statusPrefix}: ${tc.name}]\n${toolResult.result}`,
            });

            // Handle finish
            if (toolResult.finished) {
              workerFinished = true;
              finishSummary = toolResult.finishData?.summary;
              break;
            }

            // Handle hand-off
            if (toolResult.handOff) {
              handOff = toolResult.handOff;
              break;
            }
          }
          } // end else (sequential execution)

          if (workerFinished || handOff) break;
          consecutiveErrors = 0;

        } catch (err) {
          consecutiveErrors++;
          const errorMsg = (err as Error).message || String(err);
          slog.error(
            { worker: currentWorker, turn, error: errorMsg, consecutiveErrors },
            "Worker loop error",
          );

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            yield {
              type: "status" as const,
              message: `Too many consecutive errors (${consecutiveErrors}). Stopping.`,
            };
            break;
          }

          // Provide actionable context to the LLM based on error type
          const errLower = errorMsg.toLowerCase();
          let recovery: string;
          if (errLower.includes("rate limit") || errLower.includes("429")) {
            recovery = "The AI provider is rate-limited. Waiting before retrying.";
          } else if (errLower.includes("timeout") || errLower.includes("econnreset")) {
            recovery = "Network timeout occurred. The request will be retried automatically.";
          } else if (errLower.includes("credit") || errLower.includes("insufficient")) {
            const filesWritten = Object.keys(writtenFiles).length;
            recovery = filesWritten > 0
              ? `Insufficient credits to continue. ${filesWritten} file(s) were saved. Please add credits and try again.`
              : "Insufficient credits to continue. Please add credits and try again.";
            finishSummary = recovery;
            yield { type: "status" as const, message: recovery };
            break; // Credits won't magically appear — stop immediately
          } else {
            recovery = `An error occurred: ${errorMsg}. Try a different approach or simpler tool call.`;
          }

          messages.push({
            role: "user",
            content: `[⚠️ SYSTEM ERROR] ${recovery}`,
          });
        }
      }

      // ── After worker loop ──────────────────────────────

      // Hand-off to another worker
      if (handOff) {
        yield {
          type: "worker_switch" as const,
          fromWorker: currentWorker,
          toWorker: handOff.workerType,
          toDisplayName: WORKER_META[handOff.workerType].displayName,
          context: handOff.context,
        };

        // Update mutable state from hand-off
        if (handOff.pluginSlug) {
          pluginSlug = handOff.pluginSlug;
          pluginDir = `plugins/${pluginSlug}`;
        }
        if (handOff.pluginName) pluginName = handOff.pluginName;
        if (handOff.mode) pluginMode = handOff.mode;

        currentWorker = handOff.workerType;
        handOffContext = buildHandOffContext(handOff.context, writtenFiles, messages);
        handOffCount++;
        handOff = undefined;
        continue; // Start next worker
      }

      // Worker finished (or ran out of iterations)
      break;
    }
  } finally {
    // Cancel any pending ask_user (destructive-action approvals still use in-memory Promise)
    cancelPendingAnswer(sessionId);

    if (sessionSuspended) {
      // Session was suspended (ask_user) — don't clean up, don't mark complete.
      // State is saved to DB; the user will resume later.
      slog.info(
        { iterations: totalIterations, creditsUsed: totalCreditsUsed },
        "⏸️ Worker stream suspended (state saved to DB)",
      );
    } else {
      // Normal completion — cleanup and persist

      // Cleanup cloned repo directory if it was created
      if (repoCloneDir && client) {
        try {
          await client.fileDelete(repoCloneDir);
          slog.debug({ repoCloneDir }, "Cleaned up cloned repo directory");
        } catch {
          slog.warn({ repoCloneDir }, "Failed to cleanup cloned repo directory");
        }
      }

      // Persist session completion
      const durationMs = Date.now() - startedAt.getTime();
      const status = finishSummary ? "completed" : (Object.keys(writtenFiles).length > 0 ? "completed" : "cancelled");

      agentSessionService.completeSession({
        id: sessionId,
        status,
        iterationCount: totalIterations,
        toolCallCount: totalToolCalls,
        totalCreditsUsed,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        finalResponse: finishSummary,
        durationMs,
      });

      slog.info(
        {
          iterations: totalIterations,
          toolCalls: totalToolCalls,
          creditsUsed: totalCreditsUsed,
          handOffs: handOffCount,
          durationMs,
          filesWritten: Object.keys(writtenFiles).length,
        },
        "✅ Worker stream completed",
      );
    }
  }

  // ── Emit final event (only for non-suspended sessions) ─
  if (!sessionSuspended) {
    const durationMs = Date.now() - startedAt.getTime();
    const hasFiles = Object.keys(writtenFiles).length > 0;

    yield {
      type: "done" as const,
      success: true,
      sessionId,
      pluginName: pluginName || "",
      pluginSlug: pluginSlug || "",
      pluginId,
      summary: finishSummary || lastAssistantText || (hasFiles ? "Files created/updated" : "Done"),
      fileCount: Object.keys(writtenFiles).length,
      filesWritten: Object.keys(writtenFiles),
      creditsUsed: totalCreditsUsed,
      durationMs,
      entry: "index.js",
    };
  }
}
