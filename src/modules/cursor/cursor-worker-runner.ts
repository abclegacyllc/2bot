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
import { getRegistryEntry } from "@/modules/2bot-ai-provider/model-registry";
import { withRetry } from "@/modules/2bot-ai-provider/retry.util";
import type { TextGenerationMessage, ToolDefinition } from "@/modules/2bot-ai-provider/types";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

import type { UIAction } from "@/components/cursor/cursor.types";
import { executeMCPTool, initMCPServersForSession, teardownMCPServers } from "@/modules/mcp/mcp-session";
import {
    defaultConfigForRuntime,
    getAgent,
    getFallbackAgent,
    renderAgentPrompt,
    resolveAgentConfig,
    resolveAgentTools,
    type ResolvedAgentExecutionConfig,
} from "./agents";
import type {
    CursorAgentEvent,
    ToolStartMeta,
} from "./cursor-agent.types";
import { getBridgeClient, withBridgeRetry } from "./cursor-bridge";
import { initSession as initFileTracking, readFileForBackup, trackFileAction } from "./cursor-file-actions";
import {
    clearCorrectionsRedis,
    drainCorrectionsRedis,
    publishAnswerToOwner,
    pushCorrectionRedis,
    registerSession as registerSessionRedis,
    startAnswerSubscriber,
    touchSession as touchSessionRedis,
    unregisterSession as unregisterSessionRedis,
} from "./cursor-session-store";
import type { CursorWorkerType, WorkerPromptContext } from "./cursor-workers";
import {
    WORKER_META,
    getAdaptiveWorkerMeta,
    routeToWorker,
} from "./cursor-workers";
import { filterIgnored, loadGitignoreMatcher } from "./gitignore-matcher";
import type { RepoAnalysis } from "./repo-analyzer.service";
import { buildForceToolDirective, parseToolMentions } from "./tool-mention-parser";

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
  /**
   * Optional: declarative agent name (e.g. "agent" / "ask" / "plan").
   * When supplied, the agent's `runtime` and `studioMode` from its frontmatter
   * override `workerType` and `studioMode` if those are not also explicitly set.
   * Phase-1 integration: just maps onto the existing worker plumbing.
   */
  agentName?: string;
  /** Optional: resume a suspended session. Message becomes the user's answer. */
  resumeSessionId?: string;
  /** User's subscription plan (when unavailable, assume "free") */
  userPlan?: string;
  /**
   * Frontend chat thread ID (the activeSessionId from cursor-studio-bar).
   * Scopes agent memories to this chat session only — fresh chat = clean slate.
   */
  chatThreadId?: string;
  /**
   * Attached images to include in the first user message.
   * Format: array of { url: "data:image/...;base64,...", mimeType: "image/png" }.
   * Max 4 images; validated and stripped on the server before forwarding.
   */
  imageParts?: Array<{ url: string; mimeType: string }>;
  /**
   * Prior turns from the current chat session — serialized by the frontend before each send.
   * Injected between the system prompt and the current user message so the AI remembers
   * what was discussed earlier in this conversation.
   */
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  /**
   * User-configured per-session credit budget — set in the Cursor settings popover.
   * When supplied, overrides the per-runtime defaults baked into WORKER_META and the
   * agent frontmatter. Server clamps to [10, 500]; repo-clone sessions still get a
   * 500-credit floor regardless of override.
   */
  creditBudgetOverride?: number;
}

/** Workflow context passed from Studio via CursorStudioBar */
export interface WorkflowContext {
  workflowId: string;
  workflowName: string;
  triggerType: string;
  botName?: string;
  /** Gateway ID of the bot currently open in the Studio */
  gatewayId?: string;
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

  // Workflow tracking
  addedToWorkflow?: boolean;

  // For done event
  lastAssistantText?: string;

  // Original request params (needed for tool defs, model routing, etc.)
  studioMode?: "agent" | "ask" | "plan";
  hasWorkflowContext: boolean;
  workflowContext?: WorkflowContext;
  modelId?: string;
  repoUrl?: string;

  // Plan state (for smart resume)
  activePlanItems?: Array<{ id: string; title: string; status: "pending" | "in_progress" | "done" }>;

  /**
   * Per-session file-read cache snapshot — lets the agent resume without
   * paying to re-read every file it already saw. Hydrated on resume so the
   * cache survives the user's confirm pause (which can easily exceed 60 s).
   */
  fileReadCacheSnapshot?: Record<string, string>;

  /** Why the session was suspended — determines resume behavior */
  suspendReason?: "ask_user" | "credit_exhaustion" | "soft_stop";
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

/** In-memory correction queue — users can push mid-stream corrections while the agent runs */
const correctionQueues = new Map<string, string[]>();

/**
 * Push a user correction into the queue for a running session.
 * Called from POST /api/cursor/worker-correction.
 */
/**
 * Push a user correction into the queue for a running session.
 * Called from POST /api/cursor/worker-correction.
 *
 * Mirrors to Redis so cross-replica corrections work — the owning replica
 * picks them up via `drainCorrections`.
 */
export function pushCorrection(sessionId: string, correction: string): boolean {
  let queue = correctionQueues.get(sessionId);
  if (!queue) {
    queue = [];
    correctionQueues.set(sessionId, queue);
  }
  // Cap at 5 pending corrections to prevent abuse
  if (queue.length >= 5) return false;
  queue.push(correction);
  // Best-effort cross-replica mirror; ignore errors
  void pushCorrectionRedis(sessionId, correction);
  return true;
}

/** Drain all pending corrections for a session (local + cross-replica). */
async function drainCorrections(sessionId: string): Promise<string[]> {
  const queue = correctionQueues.get(sessionId);
  const local = queue && queue.length > 0 ? [...queue] : [];
  if (queue) queue.length = 0;
  const remote = await drainCorrectionsRedis(sessionId);
  // De-duplicate: a correction pushed locally is also mirrored to Redis;
  // when this replica owns the session, it sees both. Prefer local order.
  if (remote.length === 0) return local;
  if (local.length === 0) return remote;
  const seen = new Set(local);
  return [...local, ...remote.filter((c) => !seen.has(c))];
}

/** Clean up correction queue for a session (local + Redis). */
function cleanupCorrections(sessionId: string): void {
  correctionQueues.delete(sessionId);
  void clearCorrectionsRedis(sessionId);
}

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
/**
 * Resolve a pending ask_user question with the user's answer.
 * Called from the POST /api/cursor/worker-answer route.
 *
 * Cross-replica behavior: if this replica doesn't own the session, the
 * caller (route handler) should fall through to {@link tryResolveUserAnswerCrossReplica}.
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

/**
 * Cross-replica answer forwarding: when `resolveUserAnswer` returns false
 * because this replica doesn't own the session, publish the answer over
 * Redis to the replica that does. The owning replica's subscriber (set up
 * in {@link initCursorAnswerSubscriber}) calls `resolveUserAnswer` locally.
 *
 * @returns true if the answer was forwarded to a remote replica subscriber.
 */
export async function tryResolveUserAnswerCrossReplica(
  sessionId: string,
  answer: string,
  userId: string,
): Promise<boolean> {
  return publishAnswerToOwner({ sessionId, answer, userId });
}

// Wire the cross-replica answer subscriber once per process. Forwarded answers
// are dispatched into the local `pendingAnswers` map via `resolveUserAnswer`.
startAnswerSubscriber(({ sessionId, answer, userId }) =>
  resolveUserAnswer(sessionId, answer, userId),
);

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
const PRUNE_AFTER_ITERATION = 2;

/** Number of recent exchange pairs to keep intact */
const KEEP_RECENT_PAIRS = 3;

/** Chars threshold for compacting a read_file result that has already been consumed */
const READ_FILE_COMPACT_THRESHOLD = 800;

/** Max chars for the "smart digest" of a file (outline + key sections) */
const SMART_DIGEST_MAX_CHARS = 3000;

/**
 * Smart File Digest — structural summary instead of dumb char-truncation.
 *
 * When a file is too large for the context window, instead of chopping at N chars,
 * this produces:
 *   1. A structural outline (imports, classes, functions, exports) — ~200 tokens
 *   2. The first N lines of content (imports + initial code) — gives file context
 *   3. If there's budget left, includes the first few function bodies
 *
 * This is what Copilot/Cursor do — they show the LLM the *structure* of the file
 * so it knows what's there, then the LLM can use `get_function` to read specific
 * parts it needs.
 *
 * Falls back to simple truncation for binary/non-code files.
 */
function smartFileDigest(content: string, filePath: string, maxChars = SMART_DIGEST_MAX_CHARS): string {
  // For small files, just return as-is
  if (content.length <= maxChars) return content;

  const lines = content.split("\n");
  const totalLines = lines.length;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  // Non-code files: fall back to simple truncation (JSON, txt, md, etc.)
  const codeExts = new Set(["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "py", "pyw"]);
  if (!codeExts.has(ext)) {
    const truncated = content.substring(0, maxChars);
    return `${truncated}\n\n... [truncated — ${totalLines} lines total, ${content.length} chars. Use startLine/endLine to read specific sections.]`;
  }

  // Lazy-load the AST parser (only when we actually need it)
  let outline: string;
  try {
    // Use dynamic require to avoid top-level import overhead
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parser = require("@/modules/cursor/code-indexer/ast-parser");
    const lang = parser.detectLanguage(filePath);
    if (lang) {
      const fileOutline = parser.getFileOutline(content, lang);
      outline = parser.formatOutline(fileOutline);
    } else {
      outline = parser.getFallbackOutline(content, filePath);
    }
  } catch {
    // AST parser not available — use regex fallback
    outline = `[${ext}] ${totalLines} lines`;
  }

  const parts: string[] = [];

  // Part 1: Structural outline
  parts.push(`── Structure (${totalLines} lines, ${(content.length / 1024).toFixed(1)}KB) ──`);
  parts.push(outline);
  parts.push("");

  let usedChars = parts.join("\n").length;

  // Part 2: First N lines (imports, constants, initial setup)
  // These give the LLM context about dependencies and module structure
  const headerBudget = Math.min(Math.floor((maxChars - usedChars) * 0.4), 1200);
  if (headerBudget > 200) {
    parts.push("── File header ──");
    let headerChars = 0;
    const headerLines: string[] = [];
    for (let i = 0; i < lines.length && headerChars < headerBudget; i++) {
      const line = lines[i] ?? "";
      headerChars += line.length + 1;
      headerLines.push(line);
      // Stop after imports section (first non-import, non-empty, non-comment line after initial block)
      if (i > 5 && line.trim() && !line.trim().startsWith("import") && !line.trim().startsWith("from") &&
          !line.trim().startsWith("require") && !line.trim().startsWith("//") && !line.trim().startsWith("#") &&
          !line.trim().startsWith("const") && !line.trim().startsWith("export")) {
        break;
      }
    }
    parts.push(headerLines.join("\n"));
    parts.push("");
    usedChars = parts.join("\n").length;
  }

  // Part 3: Key function bodies (use remaining budget for the first few functions)
  const bodyBudget = maxChars - usedChars - 100; // reserve 100 chars for footer
  if (bodyBudget > 400) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const parser = require("@/modules/cursor/code-indexer/ast-parser");
      const lang = parser.detectLanguage(filePath);
      if (lang) {
        const fns = parser.extractFunctions(content, lang) as Array<{
          name: string; signature: string; body: string; startLine: number; endLine: number; isMethod: boolean;
        }>;
        // Pick exported / top-level functions first (most important)
        const topFns = fns.filter((f) => !f.isMethod).slice(0, 5);
        let bodyChars = 0;
        const included: string[] = [];
        for (const fn of topFns) {
          if (bodyChars + fn.body.length > bodyBudget) {
            // Include just the signature for remaining functions
            included.push(`L${fn.startLine}: ${fn.signature} { ... }`);
          } else {
            included.push(`L${fn.startLine}-${fn.endLine}:\n${fn.body}`);
            bodyChars += fn.body.length;
          }
        }
        if (included.length > 0) {
          parts.push("── Key functions ──");
          parts.push(included.join("\n\n"));
        }
      }
    } catch {
      // AST extraction failed — skip function bodies
    }
  }

  parts.push("");
  parts.push(`[Use read_file with startLine/endLine or get_function to read specific sections]`);

  return parts.join("\n");
}

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
  const codeSnippets: string[] = [];

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
          // Preserve a brief code snippet for context continuity
          if (toolName === "read_file" || toolName === "get_function") {
            const contentStart = msg.content.indexOf("\n", msg.content.indexOf("]"));
            if (contentStart > 0) {
              const snippet = msg.content.slice(contentStart + 1, contentStart + 501).trim();
              if (snippet) codeSnippets.push(`[${pathMatch?.[1]?.trim() ?? toolName}] ${snippet}`);
            }
          }
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

  if (codeSnippets.length > 0) {
    summaryLines.push("");
    summaryLines.push("Key code read earlier (abbreviated):");
    for (const s of codeSnippets.slice(-4)) {
      summaryLines.push(s.slice(0, 300));
    }
  }

  summaryLines.push("");
  summaryLines.push("IMPORTANT: Continue from where you left off. The user's original request is in the first message above. Do NOT re-ask questions the user already answered.");

  const summaryMsg: TextGenerationMessage = {
    role: "user",
    content: summaryLines.join("\n"),
  };

  return [system, userMsg, summaryMsg, ...recentMessages];
}

/**
 * Compact read_file / get_function results in the recent messages when the file
 * has subsequently been written or edited. The LLM already acted on that content,
 * so keeping only a brief summary saves significant tokens.
 *
 * Also compresses oversized tool results (list_files, run_command, search_files)
 * that are older than the most recent exchange pair.
 *
 * This runs BEFORE sending messages to the LLM — it modifies in place.
 */
function compactConsumedReads(messages: TextGenerationMessage[]): void {
  // Collect paths of files that were written/edited (most recent → earliest)
  const writtenPaths = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== "user") continue;
    const writeMatch = msg.content.match(/^\[✅ TOOL RESULT: (?:write_file|edit_file)\]\n(?:Written|Edited):?\s*(.+?)[\n\s]/);
    if (writeMatch) writtenPaths.add(writeMatch[1]!.trim());
  }

  // Find the start of the most recent exchange (last assistant message)
  let lastExchangeStart = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "assistant") {
      lastExchangeStart = i;
      break;
    }
  }

  // Process older messages (not in the most recent exchange)
  for (let i = 0; i < lastExchangeStart; i++) {
    const msg = messages[i]!;
    if (msg.role !== "user") continue;
    if (msg.content.length < READ_FILE_COMPACT_THRESHOLD) continue;

    // Compact consumed read_file results (file was read then written)
    if (writtenPaths.size > 0) {
      const readMatch = msg.content.match(/^\[✅ TOOL RESULT: (read_file|get_function)\]\n(?:\[Lines \d+-\d+ of \d+ total\]\n)?(.+?)[\n:]/);
      if (readMatch) {
        const readPath = readMatch[2]!.trim();
        if (writtenPaths.has(readPath)) {
          const firstLine = msg.content.split("\n")[0]!;
          const lineCount = (msg.content.match(/\n/g) || []).length;
          msg.content = `${firstLine}\n[content compacted — ${lineCount} lines were read, file was subsequently written/edited]`;
          continue;
        }
      }
    }

    // Compact oversized tool results from older exchanges (list_files, run_command, search_files)
    if (msg.content.length > 2000) {
      const toolMatch = msg.content.match(/^\[✅ TOOL RESULT: (list_files|run_command|search_files|get_outlines|workspace_summary)\]/);
      if (toolMatch) {
        const toolName = toolMatch[1]!;
        const firstLines = msg.content.split("\n").slice(0, 8).join("\n");
        const totalLines = (msg.content.match(/\n/g) || []).length;
        msg.content = `${firstLines}\n... [${toolName} output compacted from ${totalLines} lines — result was already processed in earlier steps]`;
      }
    }
  }
}

// ===========================================
// Granular Status Phase Mapper
// ===========================================

function toolNameToPhase(toolName: string): string | null {
  switch (toolName) {
    case "read_file":
    case "get_file_outline":
    case "get_function":
      return "Loading…";
    case "write_file":
      return "Writing…";
    case "edit_file":
      return "Editing…";
    case "run_command":
      return "Executing…";
    case "search_files":
    case "search_codebase":
    case "find_relevant_code":
    case "search_symbols":
    case "find_usages":
      return "Searching…";
    case "validate_plugin":
      return "Validating…";
    case "ensure_dependencies":
      return "Checking dependencies…";
    case "think":
      return "Evaluating…";
    case "update_plan":
      return "Planning…";
    case "restart_plugin":
      return "Restarting…";
    case "search_docs":
      return "Looking up docs…";
    case "list_files":
      return "Scanning…";
    case "list_gateways":
    case "list_user_plugins":
      return "Analyzing…";
    case "create_plugin_record":
      return "Registering…";
    default:
      return null;
  }
}

// ===========================================
// Tool Start Meta Builder
// ===========================================

function buildToolStartMeta(toolName: string, args: Record<string, unknown>): ToolStartMeta {
  switch (toolName) {
    case "read_file":
      return { kind: "read_file", path: (args.path as string) || "", startLine: args.startLine as number | undefined, endLine: args.endLine as number | undefined };
    case "write_file":
      return { kind: "write_file", path: (args.path as string) || "", bytes: ((args.content as string) || "").length };
    case "edit_file":
      return {
        kind: "edit_file",
        path: (args.path as string) || "",
        editCount: Array.isArray(args.edits) ? args.edits.length : 0,
        linesAdded: Array.isArray(args.edits)
          ? args.edits.reduce((sum: number, e: { newText?: string }) => sum + ((e.newText || "").split("\n").length), 0)
          : undefined,
        linesRemoved: Array.isArray(args.edits)
          ? args.edits.reduce((sum: number, e: { oldText?: string }) => sum + ((e.oldText || "").split("\n").length), 0)
          : undefined,
      };
    case "list_files":
      return { kind: "list_files", path: (args.path as string) || "/" };
    case "create_directory":
      return { kind: "create_directory", path: (args.path as string) || "" };
    case "delete_file":
      return { kind: "delete_file", path: (args.path as string) || "" };
    case "run_command":
      return { kind: "run_command", command: (args.command as string) || "" };
    case "search_files":
      return { kind: "search_files", pattern: (args.pattern as string) || "", filePattern: (args.filePattern as string) || undefined };
    case "get_file_outline":
      return { kind: "read_file", path: (args.path as string) || "" };
    case "get_function":
      return { kind: "read_file", path: `${(args.path as string) || ""}:${(args.name as string) || ""}` };
    case "search_symbols":
      return { kind: "search_files", pattern: (args.pattern as string) || "" };
    case "find_usages":
      return { kind: "find_usages", symbol: (args.symbol as string) || "" };
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
    case "update_plan": {
      const planItems = Array.isArray(args.items) ? args.items as Array<{ title?: string; status?: string }> : [];
      const inProgressItem = planItems.find((it) => it.status === "in_progress");
      const inProgressIdx = inProgressItem ? planItems.indexOf(inProgressItem) + 1 : undefined;
      return {
        kind: "update_plan",
        itemCount: planItems.length,
        currentStep: inProgressItem?.title,
        currentIndex: inProgressIdx,
      };
    }
    // ── Tools previously missing from meta builder (caused "Running unknown...") ──
    case "think":
      return { kind: "think", reasoning: (args.reasoning as string) || "" };
    case "file_stat":
      return { kind: "file_stat", path: (args.path as string) || "" };
    case "workspace_summary":
      return { kind: "workspace_summary" };
    case "get_outlines":
      return { kind: "get_outlines", fileCount: Array.isArray(args.paths) ? args.paths.length : 1 };
    case "validate_plugin":
      return { kind: "validate_plugin", slug: (args.pluginSlug as string) || (args.slug as string) || "" };
    case "ensure_dependencies":
      return { kind: "ensure_dependencies", slug: (args.pluginSlug as string) || "" };
    case "find_relevant_code":
      return { kind: "find_relevant_code", query: (args.query as string) || "" };
    case "search_docs":
      return { kind: "search_docs", query: (args.query as string) || "" };
    case "search_codebase":
      return { kind: "search_codebase", query: (args.query as string) || "" };
    case "view_plugin_logs":
      return { kind: "view_plugin_logs", slug: (args.pluginSlug as string) || (args.slug as string) || "" };
    case "explain_error":
      return { kind: "explain_error", error: ((args.error as string) || "").slice(0, 80) };
    case "check_gateway_status":
      return { kind: "check_gateway_status", gatewayId: (args.gatewayId as string) || "" };
    case "list_templates":
      return { kind: "list_templates" };
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
    case "read_file": {
      const rPath = shortenPath((args.path as string) || "");
      const lineHint = args.startLine ? ` lines ${args.startLine}–${args.endLine ?? args.startLine}` : "";
      return [
        { action: "navigate", path: "/workspace", label: `Reading ${rPath}${lineHint}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Reading \`${rPath}\`${lineHint}`, gated: true, durationMs: 30_000 },
      ];
    }
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
    case "find_usages":
      return [
        { action: "navigate", path: "/workspace", label: "Finding usages" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Finding usages of "${(args.symbol as string) || ""}"`, gated: true, durationMs: 30_000 },
      ];
    case "search_codebase":
      return [
        { action: "navigate", path: "/workspace", label: "Semantic codebase search" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Searching: "${(args.query as string) || ""}"`, gated: true, durationMs: 30_000 },
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

    case "fetch_url": {
      let displayHost = (args.url as string) || "URL";
      try { displayHost = new URL(args.url as string).hostname; } catch { /* keep raw */ }
      return [
        { action: "toast", message: `Fetching ${displayHost}…`, variant: "info", durationMs: 2000 },
      ];
    }

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
  /** Terminal command details for inline display (run_command / validate_plugin) */
  terminalOutput?: { command: string; output: string; exitCode: number; cwd?: string };
  /** File content preview for read_file / write_file (shown in expandable block) */
  snippet?: string;
  /** Diff patch for edit_file (shown in expandable block) */
  patch?: string;
}

/** Format an edit_file edits array as a simple +/- diff string */
function formatEditsAsDiff(edits: Array<{ search: string; replace: string }>): string {
  const MAX_EDITS = 5;
  const MAX_LINES = 8;
  const parts: string[] = [];
  for (let i = 0; i < Math.min(edits.length, MAX_EDITS); i++) {
    const edit = edits[i]!;
    if (edits.length > 1) parts.push(`@@ edit ${i + 1}/${edits.length} @@`);
    const removed = edit.search.split("\n");
    const added = edit.replace === "" ? [] : edit.replace.split("\n");
    for (const l of removed.slice(0, MAX_LINES)) parts.push(`-${l}`);
    if (removed.length > MAX_LINES) parts.push(`-… (${removed.length - MAX_LINES} more)`);
    for (const l of added.slice(0, MAX_LINES)) parts.push(`+${l}`);
    if (added.length > MAX_LINES) parts.push(`+… (${added.length - MAX_LINES} more)`);
  }
  if (edits.length > MAX_EDITS) parts.push(`@@ … and ${edits.length - MAX_EDITS} more edits @@`);
  return parts.join("\n").slice(0, 2500);
}

/** Execute platform tools shared by both workers */
async function executeSharedTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { userId: string; organizationId: string | null; userPlan?: string; chatThreadId?: string; sessionId?: string },
): Promise<ToolExecResult | null> {
  switch (toolName) {
    case "list_gateways": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
        const plugins = await pluginService.getUserPlugins(svcCtx);
        const summary = plugins.map((p) =>
          `- ${p.pluginName} (slug: ${p.pluginSlug}, enabled: ${p.isEnabled}, gateway: ${p.gatewayName ?? "none"}, entryFile: ${p.entryFile ?? "unknown"}) [pluginId: ${p.pluginId}, userPluginId: ${p.id}]`,
        ).join("\n");
        return { result: summary || "(no plugins installed)" };
      } catch (err) {
        return { result: `Error listing plugins: ${(err as Error).message}` };
      }
    }

    case "list_allowed_domains": {
      try {
        const { egressProxyService } = await import("@/modules/workspace/workspace-squid.service");
        const rows = await egressProxyService.getUserDomains(ctx.userId);
        if (!rows || rows.length === 0) {
          return { result: "(no user-allowed external domains — only system defaults like npm/github/telegram are reachable)" };
        }
        const summary = rows.map((r) => {
          const when = r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "";
          return `- ${r.domain}${when ? ` (added ${when})` : ""}${r.reason ? ` — ${r.reason}` : ""}`;
        }).join("\n");
        return { result: `Allowed external domains (${rows.length}):\n${summary}\n\nIf the domain you need is in this list, USE IT DIRECTLY — do not call request_domain_allowlist.` };
      } catch (err) {
        return { result: `Error listing allowed domains: ${(err as Error).message}` };
      }
    }

    case "view_plugin_logs": {
      const pluginSlug = args.pluginSlug as string;
      if (!pluginSlug) return { result: "Error: pluginSlug is required." };
      try {
        const bridge = await getBridgeClient(ctx.userId, ctx.organizationId);
        if (!bridge) return { result: "Error: No running workspace. Start your workspace first." };
        // Resolve actual entryFile from DB — gateway-bound plugins live at bots/{platform}/{gwId}/plugins/{slug}/
        let entryFile = `plugins/${pluginSlug}/index.js`;
        try {
          const { pluginService } = await import("@/modules/plugin");
          const { createServiceContext } = await import("@/shared/types/context");
          const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
          if (ctx.organizationId) (svcCtx as { organizationId?: string }).organizationId = ctx.organizationId;
          const allPlugins = await pluginService.getUserPlugins(svcCtx);
          const match = allPlugins.find((p) => p.pluginSlug === pluginSlug || p.pluginSlug === `custom-${pluginSlug}`);
          if (match?.entryFile) entryFile = match.entryFile;
        } catch { /* fallback to flat path */ }
        const logs = await bridge.client.pluginLogs(entryFile);
        // Normalize: bridge may return string OR an array of {timestamp, level, message} entries.
        // JSON-stringifying an array leaks brackets like "[" and "]" into the UI; instead format
        // each entry as a single line so the chat-side last-line preview shows real content.
        let logText: string;
        if (typeof logs === "string") {
          logText = logs;
        } else if (Array.isArray(logs)) {
          if (logs.length === 0) {
            logText = "(no logs yet)";
          } else {
            logText = logs.map((entry) => {
              if (typeof entry === "string") return entry;
              if (entry && typeof entry === "object") {
                const e = entry as { timestamp?: string; level?: string; message?: string; msg?: string };
                const ts = e.timestamp ? `[${e.timestamp}] ` : "";
                const lvl = e.level ? `${e.level.toUpperCase()} ` : "";
                const msg = e.message || e.msg || "";
                return `${ts}${lvl}${msg}`.trim();
              }
              return String(entry);
            }).filter(Boolean).join("\n");
          }
        } else {
          logText = JSON.stringify(logs);
        }
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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });

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

    case "fetch_url": {
      const url = (args.url as string) || "";
      const purpose = (args.purpose as string) || "";
      if (!url) return { result: "Error: url is required." };
      try {
        const { fetchUrl, checkSSRF } = await import("@/modules/cursor/cursor-fetch");
        // Full SSRF guard at execution time (defence-in-depth beyond validateToolCallArgs)
        const ssrfError = checkSSRF(url);
        if (ssrfError) return { result: `Blocked: ${ssrfError}` };

        workerLog.info({ url, purpose }, "fetch_url called");
        const fetched = await fetchUrl(url);
        const statusNote = fetched.statusCode !== 200 ? ` (HTTP ${fetched.statusCode})` : "";
        const truncatedNote = fetched.truncated ? "\n\n[Content truncated to 8000 characters]" : "";
        return {
          result: `[Fetched: ${url}${statusNote}]\n\n${fetched.content}${truncatedNote}`,
          snippet: fetched.content.slice(0, 500),
        };
      } catch (err) {
        return { result: `Error fetching URL: ${(err as Error).message}` };
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
  ctx: { userId: string; organizationId: string | null; userPlan?: string; chatThreadId?: string; sessionId?: string },
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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });

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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });

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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });

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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });

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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });

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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });

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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
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
        result: "Handing off to Agent...",
        handOff: {
          workerType: "coder",
          context: (args.task as string) || "",
          pluginSlug: args.pluginSlug as string | undefined,
          pluginName: args.pluginName as string | undefined,
          mode: args.mode as "create" | "edit" | undefined,
        },
      };
    }

    case "think": {
      const reasoning = (args.reasoning as string) || "";
      return { result: reasoning };
    }

    case "update_plan": {
      const rawItems = Array.isArray(args.items) ? args.items as Array<{ id?: string; title?: string; status?: string }> : [];
      const summary = typeof args.summary === "string" ? args.summary : undefined;
      const doneCount = rawItems.filter((it) => it.status === "done").length;
      const pendingItems = rawItems.filter((it) => it.status !== "done");

      // Persist plan to chat thread so the next agent run inherits it
      if (ctx.chatThreadId && (summary || rawItems.length > 0)) {
        try {
          const { upsertChatPlan } = await import("@/modules/cursor/cursor-plan.service");
          const normalizedItems = rawItems.map((it) => ({
            id: String(it.id ?? ""),
            title: String(it.title ?? ""),
            status: ((it.status === "done" ? "completed" : it.status === "in_progress" ? "in_progress" : "pending") as "pending" | "in_progress" | "completed"),
          }));
          await upsertChatPlan({
            userId: ctx.userId,
            chatThreadId: ctx.chatThreadId,
            ...(summary !== undefined ? { markdown: summary } : {}),
            items: normalizedItems,
            authorAgent: "assistant",
          });
        } catch {
          // Persistence is best-effort — never fail the tool call on a DB hiccup
        }
      }

      if (pendingItems.length === 0) return { result: `Plan updated. All ${rawItems.length} steps done.${summary ? " Plan body persisted." : ""} You may now call finish.` };
      const pendingTitles = pendingItems.slice(0, 5).map((it) => `- ${it.title ?? it.id ?? "(untitled)"}`).join("\n");
      return { result: `Plan updated. ${doneCount}/${rawItems.length} done.${summary ? " Plan body persisted." : ""} Still pending:\n${pendingTitles}${pendingItems.length > 5 ? `\n...and ${pendingItems.length - 5} more` : ""}\nDo NOT call finish until all steps are marked done.` };
    }

    case "write_memory": {
      const { writeMemory } = await import("@/modules/cursor/cursor-memory.service");
      const key = (args.key as string) || "";
      const content = (args.content as string) || "";
      const threadId = ctx.chatThreadId ?? ctx.sessionId ?? "default";
      const res = await writeMemory(ctx.userId, threadId, key, content);
      return { result: res.message };
    }

    case "read_memory": {
      const { getAgentMemories, getMemoryByKey } = await import("@/modules/cursor/cursor-memory.service");
      const key = args.key as string | undefined;
      const threadId = ctx.chatThreadId ?? ctx.sessionId ?? "default";
      if (key) {
        const content = await getMemoryByKey(ctx.userId, threadId, key);
        return { result: content ? `**${key}**:\n${content}` : `No memory found for key "${key}".` };
      }
      const memories = await getAgentMemories(ctx.userId, threadId);
      if (memories.length === 0) return { result: "No saved memories yet." };
      const list = memories.map((m) => `- **${m.key}**: ${m.content.slice(0, 100)}${m.content.length > 100 ? "..." : ""}`).join("\n");
      return { result: `${memories.length} saved memories:\n${list}` };
    }

    case "delete_memory": {
      const { deleteMemory } = await import("@/modules/cursor/cursor-memory.service");
      const key = (args.key as string) || "";
      const threadId = ctx.chatThreadId ?? ctx.sessionId ?? "default";
      const res = await deleteMemory(ctx.userId, threadId, key);
      return { result: res.message };
    }

    default:
      return null; // Not an assistant tool
  }
}

// ===========================================
// Tool Execution — Coder-Only Tools
// ===========================================

/**
 * Execute a shell command inside the workspace container via the bridge terminal.
 *
 * The bridge's `terminal.create` only opens a PTY — it does NOT accept a command
 * parameter. We follow the same script-based pattern as agent-executor.ts:
 *   1. Write a temp wrapper script via file.write
 *   2. Create a terminal session (gets sessionId)
 *   3. Send `bash <script>` via terminal.input
 *   4. Poll for the exit-code file to detect completion
 *   5. Read captured stdout/stderr
 *   6. Cleanup temp files + close terminal
 */
async function executeTerminalCommand(
  client: BridgeClient,
  command: string,
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ output: string; exitCode: number }> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const scriptId = `__cursor_cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Relative paths for bridge file API (bridge prepends /workspace/)
  const scriptRelPath = `.tmp/${scriptId}.sh`;
  const outputRelPath = `.tmp/${scriptId}.out`;
  const exitRelPath = `.tmp/${scriptId}.exit`;
  // Absolute paths for use inside container shell commands
  const scriptAbsPath = `/workspace/.tmp/${scriptId}.sh`;
  const outputAbsPath = `/workspace/.tmp/${scriptId}.out`;
  const exitAbsPath = `/workspace/.tmp/${scriptId}.exit`;

  const cdPrefix = opts.cwd
    ? `cd "${opts.cwd}" 2>/dev/null || { echo "Directory not found: ${opts.cwd}" > "${outputAbsPath}"; echo "1" > "${exitAbsPath}"; exit 1; }; `
    : "";
  const scriptContent = `#!/bin/bash\n${cdPrefix}(${command}) > "${outputAbsPath}" 2>&1\necho $? > "${exitAbsPath}"\n`;

  let sessionId: string | null = null;
  try {
    // 1. Write the wrapper script
    await client.fileWrite(scriptRelPath, scriptContent, true);

    // 2. Create terminal session (just opens a PTY — bash starts async)
    const termResult = await client.terminalCreate(200, 50) as { sessionId: string };
    sessionId = termResult.sessionId;

    // 3. CRITICAL: Wait for bash shell to initialize before sending input.
    //    pty.spawn('bash') returns immediately but bash needs ~200-500ms to
    //    load .bashrc and be ready to accept stdin. Without this delay,
    //    the command is sent before bash is ready and gets lost → 25s timeout.
    await new Promise((r) => setTimeout(r, 500));

    // 4. Send the command to execute
    client.terminalWrite(sessionId, `bash "${scriptAbsPath}"\n`);

    // 5. Poll for completion (exit-code file appears when done)
    const pollIntervalMs = 400;
    const startWait = Date.now();
    let exitCode = -1;

    while (Date.now() - startWait < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      try {
        const exitResult = await client.fileRead(exitRelPath) as { content?: string } | string;
        const raw = (typeof exitResult === "string" ? exitResult : exitResult?.content ?? "").trim();
        if (!raw) continue; // Empty file — not ready yet
        exitCode = parseInt(raw, 10);
        if (isNaN(exitCode)) exitCode = -1;
        break;
      } catch {
        // File doesn't exist yet — still running
      }
    }

    // 6. Read the output
    let output = "";
    try {
      const outResult = await client.fileRead(outputRelPath) as { content?: string } | string;
      output = typeof outResult === "string" ? outResult : outResult?.content ?? "";
    } catch {
      output = exitCode === -1 ? "(command timed out — no output captured)" : "(no output)";
    }

    return { output, exitCode };
  } finally {
    // 7. Cleanup: delete temp files + close terminal
    try {
      if (sessionId) {
        client.terminalWrite(sessionId, `rm -f "${scriptAbsPath}" "${outputAbsPath}" "${exitAbsPath}"\n`);
        // Small delay so rm command executes before terminal closes
        await new Promise((r) => setTimeout(r, 200));
        await client.terminalClose(sessionId);
      }
    } catch {
      // Cleanup failures are non-critical
    }
  }
}

/**
 * Session-scoped file read cache.
 * Key: `sessionId::filePath`, Value: { content, timestamp }.
 * Prevents re-reading the same file from the workspace container within
 * a single agent session, which saves both bridge round-trips AND context
 * tokens (the AI doesn't need to call read_file again after pruning).
 *
 * Entries expire after 15 min in case a write_file invalidates them.
 * The cache is also cleared for a specific path on write_file/edit_file/delete_file.
 *
 * The 15 min TTL is deliberate: the longest user pause is the chained
 * domain-allowlist confirm + credit-budget confirm (often 2-5 min). A 60 s TTL
 * caused every previously-read file to be re-read on resume, costing 30-40 %
 * of credits in long sessions. Invalidation on write keeps correctness.
 */
const fileReadCache = new Map<string, { content: string; ts: number }>();
const FILE_CACHE_TTL_MS = 15 * 60_000;

/** Serialize the cache entries belonging to a session for persistence. */
function snapshotFileReadCache(sessionId: string): Record<string, string> {
  const prefix = `${sessionId}::`;
  const out: Record<string, string> = {};
  for (const [key, entry] of fileReadCache) {
    if (key.startsWith(prefix)) {
      out[key.slice(prefix.length)] = entry.content;
    }
  }
  return out;
}

/** Re-hydrate a session's cache from a snapshot, re-stamping timestamps. */
function restoreFileReadCache(sessionId: string, snapshot: Record<string, string> | undefined): void {
  if (!snapshot) return;
  const ts = Date.now();
  for (const [path, content] of Object.entries(snapshot)) {
    fileReadCache.set(`${sessionId}::${path}`, { content, ts });
  }
}

/**
 * Periodic purge of stale entries in global Maps.
 * Prevents memory leaks from orphaned sessions (crash, unclean disconnect).
 * Runs every 2 minutes — lightweight scan.
 */
setInterval(() => {
  const now = Date.now();
  // Purge expired file read cache entries
  for (const [key, entry] of fileReadCache) {
    if (now - entry.ts > FILE_CACHE_TTL_MS) {
      fileReadCache.delete(key);
    }
  }
  // Purge correction queues older than 15 minutes (no active session should be that old without draining)
  // correctionQueues don't have timestamps, but we can cap total size
  if (correctionQueues.size > 200) {
    // Too many queues — likely leaked. Clear the oldest half.
    const keys = [...correctionQueues.keys()];
    for (let i = 0; i < Math.floor(keys.length / 2); i++) {
      correctionQueues.delete(keys[i]!);
    }
  }
}, 120_000);

function getCachedFileRead(sessionId: string, path: string): string | null {
  const key = `${sessionId}::${path}`;
  const entry = fileReadCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > FILE_CACHE_TTL_MS) {
    fileReadCache.delete(key);
    return null;
  }
  return entry.content;
}

function setCachedFileRead(sessionId: string, path: string, content: string): void {
  const key = `${sessionId}::${path}`;
  fileReadCache.set(key, { content, ts: Date.now() });
}

function invalidateCachedFile(sessionId: string, path: string): void {
  fileReadCache.delete(`${sessionId}::${path}`);
}

// =============================================================================
// edit_file fuzzy match locator
// =============================================================================

/**
 * Find the line in `file` whose content has the largest character-prefix
 * overlap with the (single-line head of) the agent's `search` string.
 * Used to give the AI a useful "you almost matched here" hint when an
 * `edit_file` search string fails to find an exact match — without forcing
 * a follow-up `read_file` call.
 *
 * Returns `null` when nothing remotely close exists.
 */
function locateClosestMatch(
  file: string,
  search: string,
): { line: number; score: number } | null {
  const target = search.split("\n")[0]?.trim() ?? "";
  if (target.length < 4) return null;
  const lines = file.split("\n");
  let bestLine = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0) continue;
    // Common prefix length, normalized by target length
    let common = 0;
    const max = Math.min(target.length, line.length);
    while (common < max && target.charCodeAt(common) === line.charCodeAt(common)) common++;
    // Boost when the target appears as a substring of the line
    const sub = common < 8 && line.includes(target.slice(0, Math.min(20, target.length)));
    const score = (common / target.length) + (sub ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestLine = i + 1;
    }
  }
  if (bestLine === -1 || bestScore < 0.25) return null;
  return { line: bestLine, score: bestScore };
}

/** Render ±N lines around a 1-based line number with line-number prefixes. */
function renderLineWindow(file: string, centerLine: number, radius: number): string {
  const lines = file.split("\n");
  const start = Math.max(1, centerLine - radius);
  const end = Math.min(lines.length, centerLine + radius);
  const width = String(end).length;
  const out: string[] = [];
  for (let i = start; i <= end; i++) {
    out.push(`${String(i).padStart(width, " ")}  ${lines[i - 1] ?? ""}`);
  }
  return out.join("\n");
}

/** Find every 1-based line number of an exact substring occurrence in the file. */
function findAllOccurrenceLines(file: string, needle: string, limit = 5): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let from = 0;
  while (out.length < limit) {
    const idx = file.indexOf(needle, from);
    if (idx === -1) break;
    out.push(file.slice(0, idx).split("\n").length);
    from = idx + needle.length;
  }
  return out;
}

async function executeCoderTool(
  toolName: string,
  args: Record<string, unknown>,
  client: BridgeClient,
  pluginDir: string,
  writtenFiles: Record<string, string>,
  ctx: { userId: string; organizationId: string | null; sessionId?: string; userPlan?: string; chatThreadId?: string; workspaceId?: string },
): Promise<ToolExecResult | null> {
  switch (toolName) {
    case "read_file": {
      const path = args.path as string;
      const startLine = args.startLine as number | undefined;
      const endLine = args.endLine as number | undefined;
      const sid = ctx.sessionId || "";
      try {
        // Check session file cache first (avoids re-reading after pruning)
        let fullContent = getCachedFileRead(sid, path);
        if (fullContent === null) {
          const result = await withBridgeRetry(
            () => client.fileRead(path) as Promise<{ content?: string }>,
            `read_file:${path}`,
          );
          fullContent = result?.content ?? "";
          if (fullContent) setCachedFileRead(sid, path, fullContent);
        }
        if (!fullContent) return { result: "(empty file)" };

        const lines = fullContent.split("\n");
        const totalLines = lines.length;

        if (startLine || endLine) {
          const start = Math.max(1, startLine ?? 1);
          const end = Math.min(totalLines, endLine ?? totalLines);
          const sliced = lines.slice(start - 1, end).join("\n");
          return {
            result: truncateToolOutput(`[Lines ${start}-${end} of ${totalLines} total]\n${sliced}`, 4000),
            snippet: sliced.split("\n").slice(0, 60).join("\n"),
          };
        }

        // Full file — if small enough, return as-is; otherwise use smart structural digest
        if (fullContent.length <= SMART_DIGEST_MAX_CHARS) {
          return { result: fullContent, snippet: fullContent.split("\n").slice(0, 60).join("\n") };
        }
        return { result: smartFileDigest(fullContent, path) };
      } catch {
        return { result: `Error: file not found or not readable: ${path}` };
      }
    }

    case "file_stat": {
      const path = args.path as string;
      try {
        const stat = await withBridgeRetry(
          () => client.send("file.stat" as Parameters<typeof client.send>[0], { path }) as Promise<{ size?: number; mtime?: string }>,
          `file_stat:${path}`,
        );
        // Read file to count lines (bridge stat doesn't include line count)
        let lineCount: number | undefined;
        try {
          const fileResult = await client.fileRead(path) as { content?: string };
          if (fileResult?.content) lineCount = fileResult.content.split("\n").length;
        } catch { /* non-critical */ }
        const parts = [
          `Path: ${path}`,
          `Exists: true`,
          stat.size !== undefined ? `Size: ${stat.size} bytes (${(stat.size / 1024).toFixed(1)}KB)` : null,
          lineCount !== undefined ? `Lines: ${lineCount}` : null,
          stat.mtime ? `Modified: ${stat.mtime}` : null,
        ].filter(Boolean);
        return { result: parts.join("\n") };
      } catch {
        return { result: `Path: ${path}\nExists: false` };
      }
    }

    case "workspace_summary": {
      try {
        const allFiles = await withBridgeRetry(
          () => client.fileList("/", true) as Promise<Array<{ name: string; type: string; size?: number }>>,
          "workspace_summary:list",
        );
        const files = (Array.isArray(allFiles) ? allFiles : []).filter((f) => f.type === "file");
        const dirs = (Array.isArray(allFiles) ? allFiles : []).filter((f) => f.type === "directory");
        const extCounts: Record<string, number> = {};
        let totalSize = 0;
        for (const f of files) {
          const ext = f.name.includes(".") ? "." + f.name.split(".").pop() : "(no ext)";
          extCounts[ext] = (extCounts[ext] || 0) + 1;
          if (f.size) totalSize += f.size;
        }
        const langBreakdown = Object.entries(extCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([ext, count]) => `  ${ext}: ${count} files`)
          .join("\n");
        const parts = [
          `Total files: ${files.length}`,
          `Total directories: ${dirs.length}`,
          totalSize > 0 ? `Total size: ${(totalSize / 1024).toFixed(1)}KB` : null,
          `\nLanguage breakdown:\n${langBreakdown}`,
        ].filter(Boolean);
        return { result: parts.join("\n") };
      } catch {
        return { result: "Error: could not scan workspace" };
      }
    }

    case "get_outlines": {
      const paths = (args.paths as string[] || []).slice(0, 10);
      if (paths.length === 0) return { result: "Error: paths array is empty" };
      try {
        const { detectLanguage, getFileOutline, formatOutline, getFallbackOutline } = await import(
          "@/modules/cursor/code-indexer/ast-parser"
        );
        const results: string[] = [];
        await Promise.all(paths.map(async (filePath) => {
          try {
            const fileResult = await withBridgeRetry(
              () => client.fileRead(filePath),
              `get_outlines:${filePath}`,
            ) as { content?: string } | null;
            const content = fileResult?.content ?? "";
            if (!content) { results.push(`**${filePath}:** (empty or not found)`); return; }
            const lang = detectLanguage(filePath);
            const outline = lang
              ? formatOutline(getFileOutline(content, lang))
              : getFallbackOutline(content, filePath);
            results.push(`**${filePath}:**\n${outline}`);
          } catch {
            results.push(`**${filePath}:** (error reading file)`);
          }
        }));
        return { result: truncateToolOutput(results.join("\n\n"), 6_000) };
      } catch (err) {
        return { result: `Error: ${(err as Error).message}` };
      }
    }

    case "write_file": {
      const path = args.path as string;
      const content = args.content as string;
      try {
        // Always check existence before writing — never silently overwrite
        const backup = await readFileForBackup(client, path);
        const wasExisting = backup.content !== null;
        if (wasExisting) {
          return {
            result: `Error: File already exists: \`${path}\`. ` +
              `Use \`edit_file\` to make targeted changes to existing files. ` +
              `If you need to inspect it first, use \`read_file\`. ` +
              `To replace the entire file, remove it first with \`delete_file\`.`,
          };
        }
        // New file — proceed with create
        if (ctx.sessionId) invalidateCachedFile(ctx.sessionId, path);
        await withBridgeRetry(() => client.fileWrite(path, content, true), `write_file:${path}`);
        const relativePath = path.startsWith(pluginDir + "/")
          ? path.slice(pluginDir.length + 1)
          : path;
        writtenFiles[relativePath] = content;
        // Track for undo
        if (ctx.sessionId) {
          trackFileAction(ctx.sessionId, {
            id: crypto.randomUUID(),
            type: "created",
            path,
            originalContent: null,
            newContent: content.length > 500_000 ? content.substring(0, 500_000) : content,
            contentTruncated: false,
            toolCallId: `write_file:${relativePath}`,
            timestamp: new Date(),
          });
        }
        // Fire-and-forget: index new file for semantic codebase search
        if (ctx.workspaceId) {
          void import("./code-indexer/workspace-embedding.service")
            .then(({ indexFile }) => indexFile(ctx.workspaceId!, path, content))
            .catch(() => {});
        }
        return { result: `Created: ${path} (${content.length} bytes)`, snippet: content.split("\n").slice(0, 60).join("\n") };
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
        // Invalidate read cache for this file
        if (ctx.sessionId) invalidateCachedFile(ctx.sessionId, path);
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
            // Search text not found — give a fuzzy locator + ±20 line window so
            // the AI can fix the search string WITHOUT calling read_file again.
            const closest = locateClosestMatch(current, edit.search);
            const headPreview = edit.search.split("\n")[0]?.slice(0, 80) ?? "";
            if (closest) {
              const window = renderLineWindow(current, closest.line, 20);
              return {
                result:
                  `Error in edit ${i + 1}/${edits.length}: search text not found in ${path}.\n` +
                  `Closest fuzzy match is at line ${closest.line} (score ${closest.score.toFixed(2)}).\n` +
                  `Search head was: "${headPreview}"\n\n` +
                  `--- File context (lines ${Math.max(1, closest.line - 20)}-${closest.line + 20}) ---\n${window}\n` +
                  `--- end ---\n\n` +
                  `Use this context to retry edit_file with a corrected search string. Do NOT call read_file.`,
              };
            }
            // Fallback when nothing comes close — show file head with line numbers.
            const head = renderLineWindow(current, 1, 30);
            return {
              result:
                `Error in edit ${i + 1}/${edits.length}: search text not found in ${path}.\n` +
                `No close fuzzy match found. Search head was: "${headPreview}"\n\n` +
                `--- File head (lines 1-30) ---\n${head}\n` +
                `--- end ---\n\n` +
                `Either the file has changed or the search anchor is wrong. Retry edit_file with a different anchor. Do NOT call read_file.`,
            };
          }
          // Check for ambiguous matches (search text appears multiple times)
          const secondIdx = current.indexOf(edit.search, idx + 1);
          if (secondIdx !== -1) {
            const occurrenceLines = findAllOccurrenceLines(current, edit.search, 5);
            const windows = occurrenceLines
              .map((ln) => `--- match at line ${ln} (lines ${Math.max(1, ln - 2)}-${ln + 2}) ---\n${renderLineWindow(current, ln, 2)}`)
              .join("\n\n");
            return {
              result:
                `Error in edit ${i + 1}/${edits.length}: search text matches ${occurrenceLines.length}+ locations in ${path}.\n` +
                `Lines: ${occurrenceLines.join(", ")}\n\n` +
                `${windows}\n\n` +
                `Pick ONE site and add a uniquifying anchor (a nearby line) to your search. Do NOT call read_file.`,
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
        // Fire-and-forget: re-index edited file for semantic codebase search
        if (ctx.workspaceId) {
          void import("./code-indexer/workspace-embedding.service")
            .then(({ indexFile }) => indexFile(ctx.workspaceId!, path, current))
            .catch(() => {});
        }
        return { result: `Edited: ${path} (${edits.length} change${edits.length > 1 ? "s" : ""} applied). ${applied.join("; ")}`, patch: formatEditsAsDiff(edits) };
      } catch (err) {
        return { result: `Error editing ${path}: ${(err as Error).message}` };
      }
    }

    case "list_files": {
      const path = (args.path as string) || "/";
      const recursive = (args.recursive as boolean) || false;
      try {
        const result = await withBridgeRetry(() => client.fileList(path, recursive), `list_files:${path}`) as Array<{ name: string; type: string; size?: number }>;
        const entries = Array.isArray(result) ? result : [];
        // Drop .gitignore-matched paths so the agent doesn't see node_modules, .next, etc.
        const ig = await loadGitignoreMatcher(client);
        const visible = filterIgnored(ig, path, entries);
        const hiddenCount = entries.length - visible.length;

        // Compact format: one line per entry with FULL path so agent can use directly in read_file
        const normalizedBase = (path === "/" || path === ".") ? "" : `${path.replace(/\/+$/, "")}/`;
        const lines = visible.map((e) => {
          const suffix = e.type === "directory" ? "/" : "";
          const size = e.size !== null && e.size !== undefined ? ` (${(e.size / 1024).toFixed(1)}KB)` : "";
          return `${normalizedBase}${e.name}${suffix}${size}`;
        });
        const footer = hiddenCount > 0 ? `\n(${hiddenCount} entr${hiddenCount === 1 ? "y" : "ies"} hidden by .gitignore)` : "";
        return { result: truncateToolOutput(lines.join("\n") + footer, 4000) };
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
        // Invalidate read cache for this file
        if (ctx.sessionId) invalidateCachedFile(ctx.sessionId, path);
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
        // Fire-and-forget: remove deleted file from codebase index
        if (ctx.workspaceId) {
          void import("./code-indexer/workspace-embedding.service")
            .then(({ invalidateFile }) => invalidateFile(ctx.workspaceId!, path))
            .catch(() => {});
        }
        return { result: `Deleted: ${path}` };
      } catch {
        return { result: `Error deleting ${path}: file not found` };
      }
    }

    case "run_command": {
      const command = args.command as string;
      const cwd = (args.cwd as string) || undefined;
      // Use a longer timeout for run_command — npm install / build commands can take 2+ minutes
      const RUN_COMMAND_TIMEOUT_MS = 120_000;
      try {
        const { output, exitCode } = await withBridgeRetry(
          () => executeTerminalCommand(client, command, { cwd, timeoutMs: RUN_COMMAND_TIMEOUT_MS }),
          `run_command:${command.slice(0, 50)}`,
        );
        const prefix = exitCode === 0 ? "✅" : "❌";
        return {
          result: truncateToolOutput(`${prefix} Exit code: ${exitCode}\n${output}`),
          terminalOutput: { command, output: output.slice(0, 2000), exitCode, cwd },
        };
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
      const sanitizedPattern = pattern.replace(/[`$\\!;|&><"]/g, "\\$&");

      let grepCmd = `grep -rn --color=never`;

      if (filePattern) {
        // Sanitize file pattern too
        const sanitizedFilePattern = filePattern.replace(/[`$\\!;|&><"]/g, "\\$&");
        grepCmd += ` --include="${sanitizedFilePattern}"`;
      }

      grepCmd += ` --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build`;
      grepCmd += ` "${sanitizedPattern}" "${searchPath}"`;
      grepCmd += ` | head -n ${maxResults}`;

      try {
        const { output: rawOutput } = await withBridgeRetry(
          () => executeTerminalCommand(client, grepCmd, { timeoutMs: 15_000 }),
          `search_files:${pattern.slice(0, 30)}`,
        );
        if (!rawOutput || rawOutput.trim() === "") return { result: "(no matches)" };

        // Parse grep output and group by file for AI-friendly summary
        const lines = rawOutput.split("\n").filter((l) => l.trim());
        const fileHits = new Map<string, number>();
        for (const line of lines) {
          const colonIdx = line.indexOf(":");
          if (colonIdx > 0) {
            const filePath = line.slice(0, colonIdx);
            fileHits.set(filePath, (fileHits.get(filePath) || 0) + 1);
          }
        }

        // Build smart summary header
        const sortedFiles = [...fileHits.entries()].sort((a, b) => b[1] - a[1]);
        const topFiles = sortedFiles.slice(0, 5);
        const summary = topFiles.map(([f, count]) => `  ${f} (${count} matches)`).join("\n");

        const output = truncateToolOutput(rawOutput);
        const guidance = topFiles.length > 0
          ? `\n\n--- Summary ---\n${lines.length} matches in ${fileHits.size} files. Top files:\n${summary}\n→ Next: call get_file_outline on top files to understand structure, then read_file for specific sections. Do NOT search again.`
          : "";
        return { result: output + guidance };
      } catch {
        return { result: `Search error: could not execute grep for "${pattern}"` };
      }
    }

    case "find_usages": {
      const symbol = (args.symbol as string) || "";
      const searchPath = (args.path as string) || ".";
      const maxResults = Math.min(Math.max(Math.floor((args.maxResults as number) || 50), 1), 200);
      const filePattern = args.filePattern as string | undefined;

      // Validate symbol — must be a plausible identifier (alphanumeric + _ + $)
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(symbol)) {
        return {
          result:
            `Invalid symbol "${symbol}". Must be a plain identifier (letters, digits, _, $). ` +
            `For free-text search use search_files instead.`,
        };
      }

      // Build word-boundary grep pattern. Use -w for word match.
      let grepCmd = `grep -rwn --color=never`;
      if (filePattern) {
        const sanitizedFilePattern = filePattern.replace(/[`$\\!;|&><"]/g, "\\$&");
        grepCmd += ` --include="${sanitizedFilePattern}"`;
      }
      grepCmd += ` --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build`;
      grepCmd += ` "${symbol}" "${searchPath}"`;
      // Pull a generous superset; we'll filter definitions out below.
      grepCmd += ` | head -n ${maxResults * 3}`;

      try {
        const { output: rawOutput } = await withBridgeRetry(
          () => executeTerminalCommand(client, grepCmd, { timeoutMs: 15_000 }),
          `find_usages:${symbol}`,
        );
        if (!rawOutput || rawOutput.trim() === "") {
          return { result: `(no usages found for "${symbol}" in ${searchPath})` };
        }

        const lines = rawOutput.split("\n").filter((l) => l.trim());

        // Definition heuristics — drop lines that look like the symbol's declaration
        const defPatterns: RegExp[] = [
          new RegExp(`\\bfunction\\s+${symbol}\\b`),
          new RegExp(`\\bfunction\\*\\s+${symbol}\\b`),
          new RegExp(`\\bclass\\s+${symbol}\\b`),
          new RegExp(`\\binterface\\s+${symbol}\\b`),
          new RegExp(`\\btype\\s+${symbol}\\b`),
          new RegExp(`\\benum\\s+${symbol}\\b`),
          new RegExp(`\\bdef\\s+${symbol}\\b`),
          new RegExp(`\\b(?:const|let|var)\\s+${symbol}\\b`),
          new RegExp(`^\\s*${symbol}\\s*[:=]\\s*(?:function|\\(|async)`),
          new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?${symbol}\\s*\\(`),
        ];

        type Hit = { file: string; line: number; snippet: string; isDef: boolean };
        const hits: Hit[] = [];
        for (const raw of lines) {
          // grep -n format: path:lineno:content
          const m = raw.match(/^([^:]+):(\d+):(.*)$/);
          if (!m) continue;
          const file = m[1] ?? "";
          const lineStr = m[2] ?? "0";
          const content = m[3] ?? "";
          if (!file) continue;
          const isDef = defPatterns.some((p) => p.test(content));
          hits.push({ file, line: parseInt(lineStr, 10), snippet: content.trim().slice(0, 160), isDef });
        }

        const usages = hits.filter((h) => !h.isDef).slice(0, maxResults);
        const defs = hits.filter((h) => h.isDef).slice(0, 3);

        if (usages.length === 0) {
          const defNote = defs.length > 0
            ? `\n\nDefinition(s) found:\n${defs.map((d) => `  ${d.file}:${d.line}`).join("\n")}`
            : "";
          return {
            result:
              `No usages of "${symbol}" found in ${searchPath} (only definitions matched).${defNote}\n` +
              `→ "${symbol}" appears unused, or callers live outside this scope.`,
          };
        }

        // Group by file
        const byFile = new Map<string, Hit[]>();
        for (const u of usages) {
          const arr = byFile.get(u.file) || [];
          arr.push(u);
          byFile.set(u.file, arr);
        }
        const sections: string[] = [];
        for (const [file, fileHits] of byFile.entries()) {
          const lineList = fileHits
            .map((h) => `  L${h.line}: ${h.snippet}`)
            .join("\n");
          sections.push(`${file} (${fileHits.length} usage${fileHits.length === 1 ? "" : "s"})\n${lineList}`);
        }

        const defNote = defs.length > 0 && defs[0]
          ? `\nDefinition: ${defs[0].file}:${defs[0].line}`
          : "";
        const summary =
          `Found ${usages.length} usage${usages.length === 1 ? "" : "s"} of "${symbol}" ` +
          `across ${byFile.size} file${byFile.size === 1 ? "" : "s"}.${defNote}`;

        return {
          result: truncateToolOutput(`${summary}\n\n${sections.join("\n\n")}`),
        };
      } catch {
        return { result: `Error finding usages of "${symbol}"` };
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

        // Drop .gitignore-matched paths so we don't waste time parsing dist/, node_modules/, etc.
        const ig = await loadGitignoreMatcher(client);
        const visibleFiles = parseableFiles.filter((f) => !ig.ignores(f.path.replace(/^\.?\/+/, "")));

        const matches: string[] = [];
        const MAX_FILES = 50; // Don't parse too many files
        const MAX_MATCHES = 30;
        const filesToScan = visibleFiles.slice(0, MAX_FILES);

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

    case "search_codebase": {
      const query = (args.query as string) || "";
      const topK = Math.min(Math.max(Math.floor((args.topK as number) || 5), 1), 20);

      if (!ctx.workspaceId) {
        return { result: "No workspace connected — cannot search codebase semantically." };
      }
      try {
        const { searchSimilar } = await import("./code-indexer/workspace-embedding.service");
        const results = await searchSimilar(ctx.workspaceId, query, topK);

        if (results.length === 0) {
          return {
            result:
              `No indexed code found for "${query}". ` +
              "Files are indexed automatically when written or edited in this session. " +
              "Try write_file or edit_file on the relevant files first.",
          };
        }

        const sections = results.map((r, i) => {
          const pct = (r.similarity * 100).toFixed(1);
          return `[${i + 1}] ${r.filePath}  (${pct}% match)\n\`\`\`\n${r.chunkText.slice(0, 600)}\n\`\`\``;
        });

        return {
          result: truncateToolOutput(
            `Found ${results.length} relevant section(s) for "${query}":\n\n${sections.join("\n\n")}`,
            8000,
          ),
        };
      } catch (err) {
        return { result: `Error searching codebase: ${(err as Error).message}` };
      }
    }

    case "create_plugin_record": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
        if (ctx.organizationId) {
          (svcCtx as { organizationId?: string }).organizationId = ctx.organizationId;
        }

        const pluginName = args.name as string;
        const pluginSlug = args.slug as string;
        const description = (args.description as string) || "Created by 2Bot Agent";
        const entry = (args.entry as string) || "index.js";
        const configSchema = (args.configSchema as Record<string, unknown>) || {};
        const configDefaults = (args.configDefaults as Record<string, unknown>) || {};
        const gatewayId = args.gatewayId as string | undefined;
        const category = (args.category as string) || "general";

        // If the Coder read (but didn't rewrite) existing plugin files this session,
        // writtenFiles will be empty or incomplete. Gather actual files from the container
        // so createCustomPlugin deploys them to the correct gateway path rather than
        // deploying an empty set (which leaves only plugin.json at the gateway path).
        const deployFiles = { ...writtenFiles };
        if (client && !deployFiles[entry]) {
          // Try the flat staging paths: plugins/{slug}/ and plugins/custom-*-{slug}/
          const candidateDirs = [`plugins/${pluginSlug}`, `plugins/custom-${ctx.userId.slice(0, 8)}-${pluginSlug}`];
          for (const dir of candidateDirs) {
            try {
              const listing = await withBridgeRetry(
                () => client.fileList(dir, true),
                `create_plugin_record:list:${dir}`,
              ) as Array<{ path: string; type: string; name: string }> | null;
              if (!listing || listing.length === 0) continue;
              const codeFiles = listing.filter(
                (f) => f.type !== "directory" &&
                  /\.(js|ts|json|md|txt|yaml|yml|cjs|mjs)$/i.test(f.name) &&
                  f.name !== "plugin.json", // exclude stale manifest — createCustomPlugin regenerates it
              );
              if (codeFiles.length === 0) continue;
              const reads = await Promise.allSettled(
                codeFiles.map(async (f) => {
                  const res = await withBridgeRetry(
                    () => client.fileRead(f.path),
                    `create_plugin_record:read:${f.path}`,
                  ) as { content?: string } | null;
                  const rel = f.path.startsWith(dir + "/") ? f.path.slice(dir.length + 1) : f.name;
                  return { rel, content: res?.content ?? "" };
                }),
              );
              for (const r of reads) {
                if (r.status === "fulfilled" && r.value.content) {
                  deployFiles[r.value.rel] = r.value.content;
                }
              }
              if (deployFiles[entry]) break; // found entry file — no need to check other dirs
            } catch { /* skip this candidate */ }
          }
        }

        const plugin = await pluginService.createCustomPlugin(svcCtx, {
          slug: pluginSlug,
          name: pluginName,
          description,
          files: Object.keys(deployFiles).length > 0 ? deployFiles : undefined,
          isDirectory: true, // always directory layout — ensures path is {slug}/{entry}, never {slug}.js
          entry,
          category: category as "general" | "analytics" | "messaging" | "automation" | "moderation" | "utilities",
          requiredGateways: ["TELEGRAM_BOT"],
          gatewayId,
          configSchema: Object.keys(configSchema).length > 0 ? configSchema : undefined,
          config: Object.keys(configDefaults).length > 0 ? configDefaults : undefined,
        });

        // If the plugin has a package.json, run npm install at the real gateway path.
        // The Coder writes files to plugins/{slug}/ (flat) but createCustomPlugin copies them to
        // bots/{platform}/{gwId}/plugins/{slug}/ — node_modules must be installed there.
        if (deployFiles["package.json"] && client) {
          try {
            const allPlugins = await pluginService.getUserPlugins(svcCtx);
            const match = allPlugins.find((p) => p.pluginSlug === plugin.pluginSlug);
            if (match?.entryFile) {
              const lastSlash = match.entryFile.lastIndexOf("/");
              const realPluginDir = lastSlash > 0 ? match.entryFile.substring(0, lastSlash) : `plugins/${plugin.pluginSlug}`;
              const npmCmd = `cd /workspace/${realPluginDir} && npm install --production 2>&1 | tail -30`;
              const npmResult = await executeTerminalCommand(client, npmCmd, { timeoutMs: 120_000 });
              if (npmResult.exitCode !== 0) {
                return {
                  result: `Plugin "${plugin.pluginName}" created [ID: ${plugin.pluginId}], but npm install failed at ${realPluginDir}:\n${npmResult.output}\nFix the package.json dependencies, then call restart_plugin.`,
                  finishData: { pluginId: plugin.pluginId },
                };
              }
            }
          } catch { /* non-critical — restart_plugin will fail clearly if deps are missing */ }
        }

        // Clean up staging directories so future sessions never read stale files.
        // The file manager hides top-level plugins/ from users but the AI bridge can still
        // see it, causing path confusion in edit sessions after the plugin is already deployed.
        if (client) {
          const stagingCandidates = [
            `plugins/${pluginSlug}`,
            `plugins/custom-${ctx.userId.slice(0, 8)}-${pluginSlug}`,
          ];
          for (const stagingDir of stagingCandidates) {
            try {
              const listing = await client.fileList(stagingDir, false) as Array<unknown> | null;
              if (listing && listing.length > 0) {
                await client.send("terminal.create" as Parameters<typeof client.send>[0], {
                  command: `rm -rf "/workspace/${stagingDir}"`,
                  timeout: 10_000,
                });
              }
            } catch { /* non-critical */ }
          }
        }

        // Compute the real plugin directory so the AI knows exactly where to write/edit files.
        const realEntryFile = plugin.entryFile ?? "";
        const lastSlashIdx = realEntryFile.lastIndexOf("/");
        const realPluginDir = lastSlashIdx > 0 ? realEntryFile.substring(0, lastSlashIdx) : `bots/telegram/${gatewayId ?? "unknown"}/plugins/${plugin.pluginSlug}`;

        return {
          result: `Plugin "${plugin.pluginName}" created! [ID: ${plugin.pluginId}, slug: ${plugin.pluginSlug}]\nReal plugin directory: ${realPluginDir}\nWrite ALL files directly to that path. Do NOT use any top-level plugins/ staging directory.`,
          // plugin.pluginId = catalog Plugin.id; plugin.id = UserPlugin.id (installation record)
          // The canvas needs catalog Plugin.id to create workflow steps
          finishData: { pluginId: plugin.pluginId },
        };
      } catch (err) {
        return { result: `Error creating plugin record: ${(err as Error).message}` };
      }
    }

    case "update_plugin_record": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });

        const pluginId = args.pluginId as string;

        // If gatewayId is provided, update the UserPlugin gateway binding
        if (args.gatewayId !== undefined) {
          const gatewayId = args.gatewayId as string;
          // list_user_plugins returns both pluginId and userPluginId — accept either
          const allPlugins = await pluginService.getUserPlugins(svcCtx);
          const match = allPlugins.find((p) => p.id === pluginId || p.pluginId === pluginId);
          if (!match) return { result: `No installed plugin found with ID "${pluginId}". Use list_user_plugins to find the correct userPluginId.` };

          await pluginService.updatePluginConfig(svcCtx, match.id, {
            // Omit config — preserve existing values; only update gateway binding
            gatewayId,
          });
          // Check if plugin still needs config (empty or missing required fields)
          const currentConfig = match.config as Record<string, unknown> | null ?? {};
          const configIsEmpty = Object.keys(currentConfig).length === 0;
          let result = `Plugin "${match.pluginName}" bound to gateway ${gatewayId}.`
            + (configIsEmpty ? " Note: plugin config is empty — remind the user to configure it (e.g. set botToken) before it will work." : "");

          // Also update non-gateway metadata if provided
          const metaData: Record<string, unknown> = {};
          if (args.name) metaData.name = args.name;
          if (args.description) metaData.description = args.description;
          if (args.configSchema) metaData.configSchema = args.configSchema;
          if (Object.keys(metaData).length > 0) {
            await pluginService.updateCustomPlugin(svcCtx, match.pluginId, metaData as { name?: string; description?: string; configSchema?: Record<string, unknown> });
            result += " Metadata updated.";
          }
          return { result };
        }

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
      // Resolve actual entryFile from DB — gateway-bound plugins live at bots/{platform}/{gwId}/plugins/{slug}/
      let entryFile = `plugins/${slug}/${entry}`;
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
        if (ctx.organizationId) (svcCtx as { organizationId?: string }).organizationId = ctx.organizationId;
        const allPlugins = await pluginService.getUserPlugins(svcCtx);
        const match = allPlugins.find((p) => p.pluginSlug === slug || p.pluginSlug === `custom-${slug}`);
        if (match?.entryFile) entryFile = match.entryFile;
      } catch { /* fallback to flat path */ }
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
        result: "Handing off to Assistant...",
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

    case "think": {
      const reasoning = (args.reasoning as string) || "";
      return { result: reasoning };
    }

    case "update_plan": {
      const rawItems = Array.isArray(args.items) ? args.items as Array<{ id?: string; title?: string; status?: string }> : [];
      const summary = typeof args.summary === "string" ? args.summary : undefined;
      const doneCount = rawItems.filter((it) => it.status === "done").length;
      const pendingItems = rawItems.filter((it) => it.status !== "done");

      if (ctx.chatThreadId && (summary || rawItems.length > 0)) {
        try {
          const { upsertChatPlan } = await import("@/modules/cursor/cursor-plan.service");
          const normalizedItems = rawItems.map((it) => ({
            id: String(it.id ?? ""),
            title: String(it.title ?? ""),
            status: ((it.status === "done" ? "completed" : it.status === "in_progress" ? "in_progress" : "pending") as "pending" | "in_progress" | "completed"),
          }));
          await upsertChatPlan({
            userId: ctx.userId,
            chatThreadId: ctx.chatThreadId,
            ...(summary !== undefined ? { markdown: summary } : {}),
            items: normalizedItems,
            authorAgent: "coder",
          });
        } catch {
          // Best-effort persistence
        }
      }

      if (pendingItems.length === 0) return { result: `Plan updated. All ${rawItems.length} steps done.${summary ? " Plan body persisted." : ""} You may now call finish.` };
      const pendingTitles = pendingItems.slice(0, 5).map((it) => `- ${it.title ?? it.id ?? "(untitled)"}`).join("\n");
      return { result: `Plan updated. ${doneCount}/${rawItems.length} done.${summary ? " Plan body persisted." : ""} Still pending:\n${pendingTitles}${pendingItems.length > 5 ? `\n...and ${pendingItems.length - 5} more` : ""}\nDo NOT call finish until all steps are marked done.` };
    }

    case "write_memory": {
      const { writeMemory } = await import("@/modules/cursor/cursor-memory.service");
      const key = (args.key as string) || "";
      const content = (args.content as string) || "";
      const threadId = ctx.chatThreadId ?? ctx.sessionId ?? "default";
      const res = await writeMemory(ctx.userId, threadId, key, content);
      return { result: res.message };
    }

    case "read_memory": {
      const { getAgentMemories, getMemoryByKey } = await import("@/modules/cursor/cursor-memory.service");
      const key = args.key as string | undefined;
      const threadId = ctx.chatThreadId ?? ctx.sessionId ?? "default";
      if (key) {
        const content = await getMemoryByKey(ctx.userId, threadId, key);
        return { result: content ? `**${key}**:\n${content}` : `No memory found for key "${key}".` };
      }
      const memories = await getAgentMemories(ctx.userId, threadId);
      if (memories.length === 0) return { result: "No saved memories yet." };
      const list = memories.map((m) => `- **${m.key}**: ${m.content.slice(0, 100)}${m.content.length > 100 ? "..." : ""}`).join("\n");
      return { result: `${memories.length} saved memories:\n${list}` };
    }

    case "delete_memory": {
      const { deleteMemory } = await import("@/modules/cursor/cursor-memory.service");
      const key = (args.key as string) || "";
      const threadId = ctx.chatThreadId ?? ctx.sessionId ?? "default";
      const res = await deleteMemory(ctx.userId, threadId, key);
      return { result: res.message };
    }

    case "validate_plugin": {
      const slug = args.pluginSlug as string;
      if (!slug) return { result: "Error: pluginSlug is required." };
      // Resolve actual entryFile from DB so edit-mode validations check the real file
      let entryPath = `plugins/${slug}/index.js`;
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
        if (ctx.organizationId) (svcCtx as { organizationId?: string }).organizationId = ctx.organizationId;
        const allPlugins = await pluginService.getUserPlugins(svcCtx);
        const match = allPlugins.find((p) => p.pluginSlug === slug || p.pluginSlug === `custom-${slug}`);
        if (match?.entryFile) entryPath = match.entryFile;
      } catch { /* fallback to flat path */ }

      // Combine syntax check + import test into a single terminal command
      // to avoid creating two separate PTY sessions (each costs ~1.5s overhead)
      const combinedCmd = [
        `echo "===SYNTAX==="`,
        `node --check ${entryPath} 2>&1 && echo "SYNTAX_OK" || echo "SYNTAX_FAIL"`,
        `echo "===IMPORT==="`,
        `node -e "try { require('./${entryPath}'); console.log('IMPORT_OK'); } catch(e) { console.error(e.message); process.exit(1); }" 2>&1 || echo "IMPORT_FAIL"`,
      ].join(" ; ");

      try {
        const result = await withBridgeRetry(
          () => executeTerminalCommand(client, combinedCmd, { timeoutMs: 15_000 }),
          `validate:${slug}`,
        );
        const output = result.output || "";
        const results: string[] = [];

        // Parse syntax check
        const syntaxSection = output.split("===IMPORT===")[0] || "";
        if (syntaxSection.includes("SYNTAX_OK")) {
          results.push("✅ Syntax check: PASSED");
        } else {
          const syntaxOutput = syntaxSection.replace("===SYNTAX===", "").replace("SYNTAX_FAIL", "").trim();
          results.push(`❌ Syntax check: FAILED\n${syntaxOutput.slice(0, 500)}`);
        }

        // Parse import test
        const importSection = output.split("===IMPORT===")[1] || "";
        if (importSection.includes("IMPORT_OK")) {
          results.push("✅ Import test: PASSED (module loads without errors)");
        } else {
          const importOutput = importSection.replace("IMPORT_FAIL", "").trim();
          results.push(`❌ Import test: FAILED\n${importOutput.slice(0, 500)}`);
        }

        return {
          result: results.join("\n\n"),
          terminalOutput: { command: `validate ${slug}`, output: results.join("\n"), exitCode: results.some(r => r.startsWith("❌")) ? 1 : 0 },
        };
      } catch (err) {
        return { result: `❌ Validation error: ${(err as Error).message}` };
      }
    }

    case "ensure_dependencies": {
      const slug = args.pluginSlug as string;
      const packages = (args.packages as string[]) || [];
      if (!slug) return { result: "Error: pluginSlug is required." };
      if (!packages.length) return { result: "No packages requested — nothing to install." };

      // Resolve the real plugin directory from DB entryFile
      let pluginDir = `plugins/${slug}`;
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
        if (ctx.organizationId) (svcCtx as { organizationId?: string }).organizationId = ctx.organizationId;
        const allPlugins = await pluginService.getUserPlugins(svcCtx);
        const match = allPlugins.find((p) => p.pluginSlug === slug || p.pluginSlug === `custom-${ctx.userId.slice(0, 8)}-${slug}` || p.pluginSlug === `custom-${slug}`);
        if (match?.entryFile) {
          const lastSlash = match.entryFile.lastIndexOf("/");
          if (lastSlash > 0) pluginDir = match.entryFile.substring(0, lastSlash);
        }
      } catch { /* fallback to staging dir */ }

      const absDir = `/workspace/${pluginDir}`;

      // Check which packages are already present to avoid redundant installs.
      // npm ls exits non-zero when a package is missing — we use that to filter.
      const checkCmd = packages
        .map((p) => {
          // Strip version range to get just the package name for the existence check
          const name = p.replace(/@[^@/]+$/, "");
          return `node -e "require.resolve('${name.replace(/'/g, "\\'")}'); process.stdout.write('${name.replace(/'/g, "\\'")}:ok\\n');" 2>/dev/null || echo "${name.replace(/'/g, "\\'")}:missing"`;
        })
        .join(" ; ");

      const checkFull = `cd ${absDir} && NODE_PATH=${absDir}/node_modules ${checkCmd}`;

      let missing: string[] = [...packages];
      try {
        const checkResult = await withBridgeRetry(
          () => executeTerminalCommand(client, checkFull, { timeoutMs: 15_000 }),
          `dep-check:${slug}`,
        );
        // Parse which packages are missing
        const output = checkResult.output || "";
        missing = packages.filter((p) => {
          const name = p.replace(/@[^@/]+$/, "");
          // If output contains "{name}:missing" it needs installing
          return output.includes(`${name}:missing`);
        });
      } catch {
        // If the check itself fails (dir doesn't exist yet), install all
        missing = [...packages];
      }

      if (missing.length === 0) {
        return {
          result: `✅ All dependencies already installed: ${packages.join(", ")} — no install needed.`,
        };
      }

      const alreadyHave = packages.filter((p) => !missing.includes(p));
      const installCmd = `cd ${absDir} && npm install --production ${missing.join(" ")} 2>&1 | tail -30`;

      try {
        const installResult = await withBridgeRetry(
          () => executeTerminalCommand(client, installCmd, { timeoutMs: 120_000 }),
          `dep-install:${slug}`,
        );
        const success = installResult.exitCode === 0;
        const lines: string[] = [];
        if (alreadyHave.length > 0) lines.push(`⏭️  Already installed (skipped): ${alreadyHave.join(", ")}`);
        if (success) {
          lines.push(`✅ Installed: ${missing.join(", ")}`);
        } else {
          lines.push(`Error: Install failed for: ${missing.join(", ")}\n${installResult.output.slice(0, 600)}`);
          lines.push("Fix package names/versions in package.json, then call ensure_dependencies again.");
        }
        return {
          result: lines.join("\n"),
          terminalOutput: { command: installCmd, output: installResult.output.slice(0, 2000), exitCode: installResult.exitCode ?? 0 },
        };
      } catch (err) {
        return { result: `Error: ensure_dependencies failed: ${(err as Error).message}` };
      }
    }

    case "find_relevant_code": {
      const query = (args.query as string) || "";
      const slug = (args.pluginSlug as string) || "";
      if (!query || !slug) return { result: "Error: query and pluginSlug are required." };
      if (!client) return { result: "Error: workspace not available." };

      // Resolve actual plugin directory from DB entryFile
      let resolvedPluginDir = `plugins/${slug}`;
      try {
        const { pluginService: ps } = await import("@/modules/plugin");
        const { createServiceContext: csc } = await import("@/shared/types/context");
        const svcCtx2 = csc({ userId: ctx.userId, role: "MEMBER", plan: (ctx.userPlan || "FREE") as "FREE" });
        if (ctx.organizationId) (svcCtx2 as { organizationId?: string }).organizationId = ctx.organizationId;
        const allPlugins2 = await ps.getUserPlugins(svcCtx2);
        const match2 = allPlugins2.find((p) => p.pluginSlug === slug || p.pluginSlug === `custom-${slug}`);
        if (match2?.entryFile) {
          const lastSlash = match2.entryFile.lastIndexOf("/");
          if (lastSlash > 0) resolvedPluginDir = match2.entryFile.substring(0, lastSlash);
        }
      } catch { /* fallback to flat path */ }
      try {
        // List all files in the plugin directory
        const listResult = await withBridgeRetry(
          () => client.fileList(resolvedPluginDir) as Promise<{ files?: Array<{ name: string; isDirectory: boolean; size?: number }> }>,
          `search:list:${slug}`,
        );
        const files = (listResult?.files || []).filter(
          (f) => !f.isDirectory && (f.name.endsWith(".js") || f.name.endsWith(".ts") || f.name.endsWith(".json")) && (f.size ?? 0) < 100_000,
        );
        if (files.length === 0) return { result: `No source files found in ${resolvedPluginDir}/` };

        // Read up to 8 files and score each against the query
        const terms = query.toLowerCase().split(/\s+/);
        const scored: Array<{ name: string; score: number; snippet: string }> = [];

        for (const f of files.slice(0, 8)) {
          try {
            const readResult = await withBridgeRetry(
              () => client.fileRead(`${resolvedPluginDir}/${f.name}`) as Promise<{ content?: string }>,
              `search:read:${f.name}`,
            );
            const content = readResult?.content || "";
            const lower = content.toLowerCase();
            let score = 0;
            for (const term of terms) {
              const occurrences = lower.split(term).length - 1;
              score += occurrences * 2;
              // Bonus for term in function names / exports
              if (lower.includes(`function ${term}`) || lower.includes(`${term}(`)) score += 5;
            }
            if (score > 0) {
              // Find best matching section (50-line window around highest term density)
              const lines = content.split("\n");
              let bestStart = 0;
              let bestScore = 0;
              for (let i = 0; i < lines.length; i += 10) {
                const window = lines.slice(i, i + 50).join("\n").toLowerCase();
                let ws = 0;
                for (const t of terms) ws += (window.split(t).length - 1);
                if (ws > bestScore) { bestScore = ws; bestStart = i; }
              }
              const snippet = lines.slice(bestStart, bestStart + 30).join("\n");
              scored.push({ name: f.name, score, snippet: snippet.slice(0, 1500) });
            }
          } catch {
            // Skip unreadable files
          }
        }

        if (scored.length === 0) return { result: `No code matching "${query}" found in ${resolvedPluginDir}/` };

        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, 3);
        const result = top.map((s) =>
          `### ${s.name} (relevance: ${s.score})\n\`\`\`\n${s.snippet}\n\`\`\``
        ).join("\n\n");

        const nextSteps = top.map((s) => `  get_function("${resolvedPluginDir}/${s.name}", "<functionName>")`).join("\n");
        return { result: `Found ${scored.length} matching file(s) for "${query}":\n\n${result}\n\n→ Next: read or edit the matched files directly. Do NOT search again.\n${nextSteps}` };
      } catch (err) {
        return { result: `Error searching code: ${(err as Error).message}` };
      }
    }

    case "search_docs": {
      const query = (args.query as string) || "";
      if (!query) return { result: "Error: query is required." };

      const { searchTelegramDocs } = await import("./telegram-api-reference");
      return { result: searchTelegramDocs(query) };
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
    userPlan?: string;
    chatThreadId?: string;
    workspaceId?: string;
  },
): Promise<ToolExecResult> {
  // Per-tool timeout: prevent any single tool call from hanging indefinitely.
  // run_command gets 150s here — 30s more than the inner executeTerminalCommand
  // timeout (120s), so the inner always resolves first and terminal_output is
  // always emitted before this outer guard could fire.
  // ensure_dependencies can take up to 15s (check) + 120s (npm install) + overhead
  const TOOL_TIMEOUT_MS = (toolName === "run_command" || toolName === "ensure_dependencies") ? 180_000 : 60_000;

  const executeWithTimeout = async (): Promise<ToolExecResult> => {
    return _executeToolInner(workerType, toolName, args, ctx);
  };

  try {
    return await Promise.race([
      executeWithTimeout(),
      new Promise<ToolExecResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    const msg = (err as Error).message || String(err);
    workerLog.warn({ tool: toolName, error: msg }, "Tool execution failed/timed out");
    return { result: `Error: ${msg}` };
  }
}

async function _executeToolInner(
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
    userPlan?: string;
    chatThreadId?: string;
  },
): Promise<ToolExecResult> {
  // Safety validation (skip hand_off, ask_user, finish, navigate)
  const skipSafety = ["hand_off_to_coder", "hand_off_to_assistant", "ask_user", "request_domain_allowlist", "finish", "navigate_page", "think", "validate_plugin", "find_relevant_code", "search_docs", "update_plan"];
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

  // Try MCP tools (per-user registered MCP servers)
  if (ctx.sessionId) {
    const mcpResult = await executeMCPTool(toolName, args, ctx.sessionId, ctx.client ?? null);
    if (mcpResult !== null) return { result: mcpResult };
  }

  // Common hallucinated tool names → suggest the real one
  const TOOL_NAME_HINTS: Record<string, string> = {
    workspace_logs: "get_workspace_logs",
    plugin_logs: "view_plugin_logs",
    get_plugin_logs: "view_plugin_logs",
    list_plugins: "list_user_plugins",
    list_files_in_dir: "list_files",
    read_dir: "list_files",
    list_dir: "list_files",
    grep: "search_files",
    grep_search: "search_files",
    semantic_search: "search_codebase",
  };
  const hint = TOOL_NAME_HINTS[toolName];
  return {
    result: hint
      ? `Error: Unknown tool "${toolName}". Did you mean "${hint}"? Use that tool name instead.`
      : `Error: Unknown tool "${toolName}". Check the tool list — this name is not registered.`,
  };
}

// ===========================================
// Model Selection per Worker
// ===========================================

/**
 * Smart model selection: use cheap lite model for tool-routing iterations,
 * full model only when generating substantial text/code output.
 *
 * Routing decisions (which tool to call next) use the lite model;
 * code generation and substantial replies use the user's chosen model.
 * Output tokens cost 3-4× more than input, but routing iterations produce
 * minimal output (just tool call JSON), so the savings come from cheaper input rates.
 *
 * IMPORTANT: Lite routing is ONLY used for the assistant worker.
 * The coder worker always uses the user's chosen model because:
 * - Lite models (gemini-2.5-flash-lite, etc.) degrade on tool calling with large context
 * - They produce text-only responses instead of write_file calls, causing premature exit
 * - The cost savings (~25 credits) aren't worth the broken plugin generation
 */
const LITE_ROUTING_MODEL = "2bot-ai-code-lite";

function getModelForWorker(
  workerType: CursorWorkerType,
  requestModelId: string | undefined,
  useRoutingModel: boolean,
  allowLiteRouting?: boolean,
): string {
  // If no explicit model selected, always use auto (already cheapest)
  if (!requestModelId) return "auto";

  // agent-driven lite-routing toggle. When the caller passes a
  // resolved config we trust it; otherwise fall back to the legacy rule
  // (coder=off, assistant=on).
  const liteAllowed = allowLiteRouting ?? workerType !== "coder";
  if (!liteAllowed) return requestModelId;

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

  // 3. Last few tool results from conversation — include actual content so the receiving
  // worker doesn't repeat reads/checks the sending worker already performed.
  const toolResults: string[] = [];
  for (let i = messages.length - 1; i >= 0 && toolResults.length < 6; i--) {
    const msg = messages[i];
    if (msg?.role === "user" && typeof msg.content === "string" && msg.content.startsWith("[✅ TOOL RESULT:")) {
      // Include tool name + first 400 chars of result so the coder knows the findings
      const snippet = msg.content.slice(0, 450);
      toolResults.unshift(snippet.includes("\n") ? snippet : snippet);
    }
  }
  if (toolResults.length > 0) {
    parts.push(`Findings from prior investigation (DO NOT repeat these checks):\n${toolResults.join("\n---\n")}`);
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
    userId,
    organizationId,
  } = request;

  // Parse `#tool` mentions out of the user's message. A valid mention forces
  // the AI to start with that tool on this turn (added to system prompt below).
  // Resume turns skip parsing — those carry "[✅ USER CHOSE TO CONTINUE]" etc.
  const rawMessage = request.message;
  const parsedMentions = !request.resumeSessionId && typeof rawMessage === "string"
    ? parseToolMentions(rawMessage)
    : { cleanedMessage: rawMessage, forceTool: null, allMentioned: [] as string[] };
  const message = parsedMentions.cleanedMessage || rawMessage;

  // ── Greeting short-circuit ───────────────────────────
  // If the user just sent a one-word greeting / acknowledgement, reply
  // directly without spinning up the full agent loop. Each LLM round-trip
  // on the routing model still costs ~10 credits, so 4 stray "hey"s = ~40
  // credits wasted. Cheap to bypass. We deliberately do NOT gate on
  // workflowContext/pluginSlug/repoUrl: a bare "hey" is a greeting
  // regardless of what's attached, and the cost of misfiring is just a
  // slightly less helpful reply ("hey, what do you need?"), versus the
  // cost of NOT firing being the LLM hallucinating a plan and burning
  // 60+ credits creating files the user never asked for.
  if (
    !request.resumeSessionId
    && typeof message === "string"
  ) {
    const trimmed = message.trim();
    if (
      trimmed.length > 0
      && trimmed.length < 25
      && !trimmed.includes("?")
      && /^(hi+|hey+|hello+|yo+|sup|ok+|okay|thanks?|thank you|cool|nice|great|👋|wassup|good morning|good afternoon|good evening)\b[\s.!,]*$/i.test(trimmed)
    ) {
      yield {
        type: "thinking" as const,
        text: "Hey — what would you like to build or change?",
      };
      yield {
        type: "done" as const,
        success: true,
        sessionId: crypto.randomUUID(),
        pluginName: "",
        pluginSlug: "",
        summary: "Hey — what would you like to build or change?",
        fileCount: 0,
        filesWritten: [],
        creditsUsed: 0,
        durationMs: 0,
        entry: "",
      };
      return;
    }
  }

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

    // Re-hydrate the file-read cache so the AI doesn't pay to re-read files
    // it already saw before the suspend. Cache entries get fresh timestamps.
    restoreFileReadCache(saved.id, resumeState?.fileReadCacheSnapshot);

    // Mark session as running again (clears saved state from DB)
    await agentSessionService.resumeSession(saved.id);
  }

  // ── Session setup ────────────────────────────────────
  const sessionId = isResume ? request.resumeSessionId! : crypto.randomUUID();
  // Register this replica as the owner so cross-replica answer routing works.
  // Best-effort — if Redis is down, single-replica behavior still works.
  void registerSessionRedis(sessionId, userId);
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
  /** Cumulative diff stats across the whole session */
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let totalFilesChanged = 0;
  /** The actual model name returned by the AI provider (for frontend display) */
  let lastModelUsed = "";
  const changedFilePaths = new Set<string>();

  // Route to initial worker
  // If repoUrl is attached, always route to coder (repo analysis requires workspace + coder tools)
  // If agentName is supplied, the agent's frontmatter takes precedence over the heuristic.
  // if agentName is missing but studioMode is set, map studioMode → agent of the same name
  // so legacy callers (raw API, suspend/resume) get the same declarative agent the dropdown sends.
  const requestedAgent = request.agentName
    ? getAgent(request.agentName)
    : request.studioMode
      ? getAgent(request.studioMode)
      : undefined;
  if (request.agentName && !requestedAgent) {
    slog.warn(
      { agentName: request.agentName },
      "⚠ Unknown agentName supplied — falling back to heuristic routing",
    );
  }
  const agentRuntime = requestedAgent?.frontmatter.runtime;
  const agentStudioMode = requestedAgent?.frontmatter.studioMode;
  // Apply agent-derived studio mode when the request did not set one explicitly.
  if (agentStudioMode && !request.studioMode) {
    request.studioMode = agentStudioMode;
  }
  const initialWorker = isResume && resumeState
    ? resumeState.currentWorker
    : (request.workerType
      || agentRuntime
      || (request.repoUrl ? "coder" as CursorWorkerType : routeToWorker(message, { hasWorkflowContext: !!request.workflowContext })));

  // Build the agent execution config once. Per-agent fields
  // (maxCredits, temperature, liteRouting…) live here so the loop reads
  // every per-agent behavior from one object instead of branching on
  // `currentWorker === "coder"`. When no declarative agent is supplied,
  // fall back to the runtime defaults that mirror the legacy WORKER_META.
  let agentConfig: ResolvedAgentExecutionConfig = requestedAgent
    ? resolveAgentConfig(requestedAgent)
    : defaultConfigForRuntime(initialWorker);

  // User-configured per-session credit budget (set in the Cursor settings popover).
  // This is the **single source of truth** for the "Credit budget reached" prompt —
  // it overrides the per-runtime defaults (assistant=10, coder=30) and any agent
  // frontmatter `maxCredits`. Repo-clone sessions still get a 500-credit floor.
  const userCreditBudget: number | undefined =
    typeof request.creditBudgetOverride === "number" && Number.isFinite(request.creditBudgetOverride)
      ? Math.max(10, Math.min(500, Math.floor(request.creditBudgetOverride)))
      : undefined;
  if (userCreditBudget !== undefined) {
    agentConfig = { ...agentConfig, maxCreditsPerSession: userCreditBudget };
  }

  // Resolve the *active* agent for this request — every prompt and
  // tool list now flows through the declarative agent path. When no explicit
  // `agentName` was supplied, synthesize a fallback agent matching the
  // legacy worker type (so byte-identical behavior is preserved).
  let activeAgent = requestedAgent ?? getFallbackAgent(initialWorker);

  slog.info(
    { initialWorker, message: message.slice(0, 100), isResume },
    isResume ? "🔄 Worker stream resumed" : "🤖 Worker stream started",
  );

  // Get bridge connection (may be null for assistant-only tasks)
  const bridge = await getBridgeClient(userId, organizationId);
  const client = bridge?.client ?? null;
  const workspaceId = bridge?.workspaceId;

  // ── MCP: Init servers for this session ──
  const { tools: mcpTools } = await initMCPServersForSession(
    sessionId,
    userId,
    organizationId ?? null,
    client,
  );

  // Persist session to database (skip for resumed sessions — already exists)
  if (!isResume) {
    agentSessionService.createSession({
      id: sessionId,
      userId,
      organizationId: organizationId ?? undefined,
      workspaceId: workspaceId ?? "none",
      model: getModelForWorker(initialWorker, request.modelId, false, agentConfig.allowLiteRouting),
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
  /** True once the coder has called add_workflow_step this session */
  let addedToWorkflow = isResume && resumeState?.addedToWorkflow === true ? true : false;
  /** Current plan items — updated each time the AI calls update_plan */
  let activePlanItems: Array<{ id: string; title: string; status: "pending" | "in_progress" | "done" }> =
    isResume && resumeState?.activePlanItems ? resumeState.activePlanItems : [];
  let finishSummary: string | undefined;
  /**
   * Set to a short reason string whenever the session ends without the AI
   * explicitly calling `finish` (credit/iteration limits, consecutive errors,
   * broken model, mid-loop break). The frontend uses this to distinguish a
   * normal completion from an interrupted one and show an appropriate notice.
   */
  let abnormalStopReason: string | undefined;
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
    // Gate: repo analysis requires a paid plan
    const plan = (request.userPlan || "free").toLowerCase();
    if (plan === "free" || plan === "starter") {
      yield {
        type: "error" as const,
        message: "Repository analysis requires a paid plan. Please upgrade to use this feature.",
      };
      return;
    }

    // Force/normalize coder mode for repo analysis
    if (!pluginMode || pluginMode === "analyze-repo") pluginMode = "create";

    // Detect if the user just wants a summary ("what is this?", "check this repo")
    // vs. actually wanting to build a plugin from it ("convert to 2bot", "create a plugin")
    const lowerMsg = message.toLowerCase();
    const wantsBuild = /\b(create|build|convert|generate|make|port|transform|clone|replicate|import)\b/.test(lowerMsg);
    const wantsInfoOnly = /\b(check|what|about|tell|describe|explain|analyze|review|look|overview|summary|summarize)\b/.test(lowerMsg) && !wantsBuild;

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
      // Clean up any existing clone directory to avoid "Directory already exists" errors
      // This happens when a previous clone attempt failed mid-way or the user retries
      try {
        const existingFiles = await client.fileList(repoCloneDir, false) as Array<{ name: string }> | null;
        if (existingFiles && existingFiles.length >= 0) {
          slog.debug({ repoCloneDir }, "Removing existing clone directory before re-clone");
          await client.send("terminal.create", {
            command: `rm -rf "${repoCloneDir}"`,
            timeout: 10_000,
          });
        }
      } catch {
        // Directory doesn't exist — that's fine, proceed with clone
      }

      const cloneResult = await client.gitClone(request.repoUrl, {
        targetDir: repoCloneDir,
        branch: request.repoBranch,
        depth: 1,
      }) as { success: boolean; error?: string };

      if (!cloneResult?.success) {
        const alreadyExists = cloneResult?.error?.includes("already exists");
        if (alreadyExists) {
          // Directory already cloned — reuse it instead of failing
          slog.info({ repoCloneDir }, "Repo directory already exists, reusing existing clone");
          yield { type: "status" as const, message: "Repository already cloned. Reusing existing copy..." };
        } else {
          yield {
            type: "error" as const,
            message: `Failed to clone repository: ${cloneResult?.error || "Unknown error"}`,
            sessionId,
            creditsUsed: totalCreditsUsed,
          };
          return;
        }
      } else {
        yield { type: "status" as const, message: "Repository cloned. Analyzing source code..." };
      }

      // Lazy import to avoid circular deps
      const { analyzeRepo } = await import("./repo-analyzer.service");
      // yield* forwards all status events from analyzeRepo to the frontend;
      // the generator's return value carries the final analysis result.
      const analyzeGen = analyzeRepo(client, repoCloneDir, userId, request.repoUrl, request.modelId, { lightweight: wantsInfoOnly });
      let analyzeNext = await analyzeGen.next();
      while (!analyzeNext.done) {
        yield analyzeNext.value;
        analyzeNext = await analyzeGen.next();
      }
      const result = analyzeNext.value;
      repoAnalysis = result.analysis;
      totalCreditsUsed += result.creditsUsed;
      lastModelUsed = result.modelUsed || lastModelUsed;
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

      // If user only wanted info (not a build), return the analysis directly
      // instead of entering the expensive coder agentic loop
      if (wantsInfoOnly) {
        const commands = repoAnalysis.commands.length > 0
          ? `\n**Commands:** ${repoAnalysis.commands.map((c) => `\`${c.command}\` — ${c.description}`).join(", ")}`
          : "";
        const apis = repoAnalysis.externalApis.length > 0
          ? `\n**External APIs:** ${repoAnalysis.externalApis.map((a) => a.name).join(", ")}`
          : "";
        const warnings = repoAnalysis.warnings.length > 0
          ? `\n**Notes:** ${repoAnalysis.warnings.join("; ")}`
          : "";

        const summary = [
          `**${repoAnalysis.purpose}**`,
          `Language: ${repoAnalysis.language}${repoAnalysis.framework ? ` (${repoAnalysis.framework})` : ""} | Complexity: ${repoAnalysis.complexity}`,
          repoAnalysis.features.length > 0 ? `**Features:** ${repoAnalysis.features.join(", ")}` : "",
          commands,
          apis,
          warnings,
          "",
          `*Want to create a 2Bot plugin from this repo? Just say "create a plugin from this repo".*`,
        ].filter(Boolean).join("\n");

        // Record session
        agentSessionService.completeSession({
          id: sessionId,
          status: "completed",
          totalCreditsUsed,
          toolCallCount: 0,
          iterationCount: 0,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          finalResponse: summary.slice(0, 500),
          durationMs: Date.now() - startedAt.getTime(),
        });

        // Clean up the clone directory since we only needed it for analysis
        if (client && repoCloneDir) {
          client.send("terminal.create", { command: `rm -rf "${repoCloneDir}"`, timeout: 10_000 }).catch(() => {});
        }

        yield {
          type: "done" as const,
          success: true,
          sessionId,
          pluginName: pluginName || repoName,
          pluginSlug: pluginSlug || repoName,
          summary,
          fileCount: 0,
          filesWritten: [],
          creditsUsed: totalCreditsUsed,
          modelUsed: lastModelUsed || undefined,
          durationMs: Date.now() - startedAt.getTime(),
          entry: "",
        };
        return;
      }
    } catch (err) {
      const errMsg = (err as Error).message || String(err);
      // If the clone directory already exists (from a previous session), reuse it
      if (errMsg.includes("already exists") || errMsg.includes("Directory already exists")) {
        slog.info({ repoCloneDir }, "Repo directory already exists (caught exception), reusing existing clone");
        yield { type: "status" as const, message: "Repository already cloned. Reusing existing copy..." };

        try {
          const { analyzeRepo } = await import("./repo-analyzer.service");
          const analyzeGen2 = analyzeRepo(client!, repoCloneDir, userId, request.repoUrl, request.modelId, { lightweight: wantsInfoOnly });
          let analyzeNext2 = await analyzeGen2.next();
          while (!analyzeNext2.done) {
            yield analyzeNext2.value;
            analyzeNext2 = await analyzeGen2.next();
          }
          const result = analyzeNext2.value;
          repoAnalysis = result.analysis;
          totalCreditsUsed += result.creditsUsed;
          lastModelUsed = result.modelUsed || lastModelUsed;
          const featureSummary = repoAnalysis.features.length > 0
            ? repoAnalysis.features.slice(0, 5).join(", ")
            : "no specific features detected";
          yield {
            type: "status" as const,
            message: `Analyzed: ${repoAnalysis.purpose} (${repoAnalysis.language}, ${repoAnalysis.complexity}). Features: ${featureSummary}`,
          };

          if (wantsInfoOnly) {
            const commands = repoAnalysis.commands.length > 0
              ? `\n**Commands:** ${repoAnalysis.commands.map((c) => `\`${c.command}\` — ${c.description}`).join(", ")}`
              : "";
            const apis = repoAnalysis.externalApis.length > 0
              ? `\n**External APIs:** ${repoAnalysis.externalApis.map((a) => a.name).join(", ")}`
              : "";
            const warnings = repoAnalysis.warnings.length > 0
              ? `\n**Notes:** ${repoAnalysis.warnings.join("; ")}`
              : "";
            const summary = [
              `**${repoAnalysis.purpose}**`,
              `Language: ${repoAnalysis.language}${repoAnalysis.framework ? ` (${repoAnalysis.framework})` : ""} | Complexity: ${repoAnalysis.complexity}`,
              repoAnalysis.features.length > 0 ? `**Features:** ${repoAnalysis.features.join(", ")}` : "",
              commands, apis, warnings,
              "",
              `*Want to create a 2Bot plugin from this repo? Just say "create a plugin from this repo".*`,
            ].filter(Boolean).join("\n");

            agentSessionService.completeSession({
              id: sessionId, status: "completed", totalCreditsUsed,
              toolCallCount: 0, iterationCount: 0,
              inputTokens: totalInputTokens, outputTokens: totalOutputTokens,
              finalResponse: summary.slice(0, 500),
              durationMs: Date.now() - startedAt.getTime(),
            });
            yield {
              type: "done" as const, success: true, sessionId,
              pluginName: pluginName || repoName, pluginSlug: pluginSlug || repoName,
              summary, fileCount: 0, filesWritten: [],
              creditsUsed: totalCreditsUsed,
              modelUsed: lastModelUsed || undefined,
              durationMs: Date.now() - startedAt.getTime(), entry: "",
            };
            return;
          }
        } catch (analyzeErr) {
          yield {
            type: "error" as const,
            message: `Failed to analyze repository: ${(analyzeErr as Error).message}`,
            sessionId,
            creditsUsed: totalCreditsUsed,
          };
          return;
        }
      } else {
        yield {
          type: "error" as const,
          message: `Failed to analyze repository: ${errMsg}`,
          sessionId,
          creditsUsed: totalCreditsUsed,
        };
        return;
      }
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
    let resumeUserContent: string;
    if (resumeState?.suspendReason === "soft_stop") {
      // Soft-stop resume: the AI was mid-task and stopped using tools.
      // Inject a strong nudge to resume with tool calls, not just text.
      const pendingList = (resumeState.activePlanItems ?? [])
        .filter((it) => it.status !== "done")
        .slice(0, 5)
        .map((it) => `• ${it.title}`)
        .join("\n");
      resumeUserContent =
        `[✅ USER CHOSE TO CONTINUE]\nUser said: ${message}\n\n` +
        `[SYSTEM] Resume the task immediately using tool calls. ` +
        (pendingList
          ? `The following plan steps are still pending:\n${pendingList}\n\n`
          : "") +
        `Do NOT describe what you will do — execute it directly with write_file, edit_file, and other tools.`;
    } else {
      resumeUserContent = `[✅ TOOL RESULT: ask_user]\nUser answered: ${message}`;
    }
    resumeMessagesReady = [
      ...resumeMessages,
      {
        role: "user" as const,
        content: resumeUserContent,
      },
    ];
  }

  // Credit-exhaustion resume: if user chose "Stop here", end gracefully
  if (isResume && resumeState?.suspendReason === "credit_exhaustion" && message.toLowerCase().trim() === "stop") {
    const filesWritten = Object.keys(writtenFiles).length;
    finishSummary = filesWritten > 0
      ? `Session stopped. ${filesWritten} file(s) were saved from the previous run.`
      : "Session stopped.";
    yield { type: "status" as const, message: finishSummary };
    // Skip the work loop — fall through to finally block which will persist completion
  }

  // Soft-stop resume: if user chose "Stop here", end gracefully
  if (isResume && resumeState?.suspendReason === "soft_stop" && message.toLowerCase().trim() === "stop here") {
    const filesWritten = Object.keys(writtenFiles).length;
    finishSummary = filesWritten > 0
      ? `Session stopped. ${filesWritten} file(s) were saved.`
      : "Session stopped.";
    yield { type: "status" as const, message: finishSummary };
    // Skip the work loop
  }

  try {
    // Only run the main work loop if the session wasn't stopped above
    if (!finishSummary) {
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
        const { userService } = await import("@/modules/user");
        const [ctx, recentSessions] = await Promise.all([
          userService.getUserContext(userId, organizationId, { checkWorkspace: false }),
          // Load recent completed sessions for conversation continuity
          // Fetch 8 candidates, score by relevance to current prompt, keep top 5
          handOffCount === 0 ? prisma.agentSession.findMany({
            where: {
              userId,
              status: "completed",
              finalResponse: { not: null },
              ...(workspaceId && workspaceId !== "none" ? { workspaceId } : {}),
            },
            orderBy: [{ startedAt: "desc" }],
            take: 8,
            select: { finalResponse: true, startedAt: true, prompt: true, feedback: true },
          }) : Promise.resolve([]),
        ]);
        userState = {
          plan: ctx.plan,
          credits: ctx.credits,
          gatewayCount: ctx.gatewayCount,
          pluginCount: ctx.pluginCount,
          workspaceRunning: !!client,
        };
        if (recentSessions.length > 0) {
          // Score sessions by relevance to current prompt + quality
          const promptWords = new Set(
            message.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3),
          );
          const scored = recentSessions
            .filter((s) => s.finalResponse)
            .map((s) => {
              const taskText = (s.prompt ?? "").toLowerCase();
              let score = 0;
              // Keyword overlap with current prompt
              for (const word of promptWords) {
                if (taskText.includes(word)) score += 2;
              }
              // Prefer sessions with positive feedback
              if (s.feedback === "positive") score += 3;
              // Recency bonus (last 24h gets +1)
              if (Date.now() - s.startedAt.getTime() < 86_400_000) score += 1;
              return { session: s, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

          priorSessionSummaries = scored.map(({ session: s }) => {
              const date = s.startedAt.toISOString().split("T")[0];
              const task = s.prompt?.replace(/^\[worker:\w+\]\s*/, "").slice(0, 80) ?? "";
              const result = s.finalResponse!.slice(0, 150);
              return `[${date}] ${task} → ${result}`;
            });
        }
        // N2: Adapt session limits based on user plan
        workerMeta = getAdaptiveWorkerMeta(currentWorker, userState.plan);
        // keep agentConfig credit budget in sync with the adaptive
        // (plan-tier) defaults when the agent did not pin it explicitly AND
        // the user did not supply a per-session override in their settings.
        if (!requestedAgent?.frontmatter.maxCredits && userCreditBudget === undefined) {
          agentConfig = {
            ...agentConfig,
            maxCreditsPerSession: workerMeta.maxCreditsPerSession,
          };
        }
        if (!requestedAgent?.frontmatter.maxIterations) {
          agentConfig = {
            ...agentConfig,
            maxIterations: workerMeta.maxIterations,
          };
        }

        // Repo-related sessions need a higher credit budget:
        // AI analysis + multi-file plugin generation is inherently expensive.
        // Complex Python→JS ports with 6+ source files routinely need 300-400 credits.
        const effectiveRepoUrl = isResume && resumeState?.repoUrl ? resumeState.repoUrl : request.repoUrl;
        if (effectiveRepoUrl) {
          // Repo sessions only need a higher credit budget — iteration limit is already
          // high (100) and wall-clock timeout is unused, so only credits need expanding.
          workerMeta = {
            ...workerMeta,
            maxCreditsPerSession: Math.max(workerMeta.maxCreditsPerSession, 500),
          };
          agentConfig = {
            ...agentConfig,
            maxCreditsPerSession: Math.max(agentConfig.maxCreditsPerSession, 500),
          };
        }

        // Credit-exhaustion resume: extend the budget cap so the user gets a
        // fresh allocation on top of what was already spent. Without this,
        // the soft budget guard would fire immediately after resuming.
        if (isResume && resumeState?.suspendReason === "credit_exhaustion") {
          const freshBudget = agentConfig.maxCreditsPerSession; // full allocation again
          // Round to keep the displayed budget free of float noise (e.g. 58.1937…).
          const newBudget = Math.round(totalCreditsUsed + freshBudget);
          workerMeta = {
            ...workerMeta,
            maxCreditsPerSession: newBudget,
            // maxIterations stays at 100 — no need to extend, already high enough
          };
          agentConfig = {
            ...agentConfig,
            maxCreditsPerSession: newBudget,
          };
          // Reset the per-call iteration counter so the loop's max-iteration
          // guard doesn't fire immediately on resume — the user paid for a
          // fresh budget AND a fresh iteration window.
          totalIterations = 0;
          slog.info(
            { previousCredits: totalCreditsUsed, newBudget: agentConfig.maxCreditsPerSession, freshAllocation: freshBudget },
            "🔄 Credit-exhaustion resume: extended budget with fresh allocation",
          );
        }
      } catch {
        // Non-critical — proceed without user state
      }

      // ── Auto-context gathering (coder only, first hand-off) ──
      let autoContext: WorkerPromptContext["autoContext"];
      if (currentWorker === "coder" && client && handOffCount === 0) {
        try {
          const contextDir = pluginSlug ? `plugins/${pluginSlug}` : "plugins";
          const files = await withBridgeRetry(
            () => client.fileList(contextDir, true) as Promise<Array<{ name: string; type: string }>>,
            `auto-ctx:list:${contextDir}`,
          );
          const fileList = Array.isArray(files) ? files : [];
          const fileTree = fileList.map((f) => `${f.type === "directory" ? "📁" : "📄"} ${f.name}`);

          const outlines: Record<string, string> = {};
          const fullFileContents: Record<string, string> = {};
          let packageJson: string | undefined;

          if (pluginSlug && fileList.length > 0) {
            // Read outlines for key files (max 10)
            const jsFiles = fileList
              .filter((f) => f.type === "file" && /\.(js|ts|mjs|cjs|json|md|sql)$/.test(f.name))
              .slice(0, 10);

            // Small plugin heuristic: ≤10 JS/TS source files → read full contents
            const srcFiles = jsFiles.filter((f) => f.name !== "package.json");
            const isSmallPlugin = srcFiles.length <= 10;

            const outlinePromises = jsFiles.map(async (f) => {
              const filePath = `plugins/${pluginSlug}/${f.name}`;
              try {
                if (f.name === "package.json") {
                  const result = await withBridgeRetry(
                    () => client.fileRead(filePath) as Promise<{ content?: string }>,
                    `auto-ctx:read:${f.name}`,
                  );
                  packageJson = result?.content?.slice(0, 2000);
                } else if (/\.(js|ts|mjs|cjs|md|sql)$/.test(f.name)) {
                  if (isSmallPlugin) {
                    // Small plugin — read full file contents for richer context
                    const result = await withBridgeRetry(
                      () => client.fileRead(filePath) as Promise<{ content?: string }>,
                      `auto-ctx:full:${f.name}`,
                    );
                    if (result?.content) fullFileContents[f.name] = result.content.slice(0, 6_000);
                  } else {
                    // Larger plugin — use outlines only (cost-saving)
                    const result = await withBridgeRetry(
                      () => client.send("code.outline" as Parameters<typeof client.send>[0], { path: filePath }) as Promise<{ outline?: string }>,
                      `auto-ctx:outline:${f.name}`,
                    );
                    if (result?.outline) outlines[f.name] = result.outline;
                  }
                }
              } catch {
                // Non-critical — skip this file
              }
            });
            await Promise.all(outlinePromises);
          }

          // Read README.md separately for larger plugins (small plugins already have it in fullFileContents)
          let readme: string | undefined;
          if (pluginSlug && !fullFileContents["README.md"] && !fullFileContents["readme.md"]) {
            const readmeFile = fileList.find((f) => f.type === "file" && /^readme\.md$/i.test(f.name));
            if (readmeFile) {
              try {
                const result = await withBridgeRetry(
                  () => client.fileRead(`plugins/${pluginSlug}/${readmeFile.name}`) as Promise<{ content?: string }>,
                  `auto-ctx:readme`,
                );
                if (result?.content) readme = result.content.slice(0, 3000);
              } catch { /* non-critical */ }
            }
          }

          if (fileTree.length > 0) {
            autoContext = {
              fileTree,
              outlines,
              packageJson,
              ...(Object.keys(fullFileContents).length > 0 ? { fullFileContents } : {}),
              ...(readme ? { readme } : {}),
            };
            slog.debug({ fileCount: fileTree.length, outlineCount: Object.keys(outlines).length }, "Auto-context gathered");
          }
        } catch {
          // Non-critical — proceed without auto-context
        }
      }

      // ── Load cross-session user preferences ─────────────
      let userPreferencesText: string | undefined;
      try {
        const prefsSvc = await import("./cursor-preferences.service");
        const prefs = await prefsSvc.getUserPreferences(userId);
        if (prefs) {
          userPreferencesText = prefs;
        }
      } catch {
        // Non-critical — proceed without preferences
      }

      // ── Load chat-thread-scoped agent memories ──────────
      let agentMemoriesText: string | undefined;
      if (request.chatThreadId) {
        try {
          const { getFormattedMemories } = await import("./cursor-memory.service");
          const memories = await getFormattedMemories(userId, request.chatThreadId);
          if (memories) {
            agentMemoriesText = memories;
          }
        } catch {
          // Non-critical — proceed without memories
        }
      }

      // ── Load persisted chat plan (produced by Plan agent) ──
      let chatPlanText: string | undefined;
      if (request.chatThreadId) {
        try {
          const { getChatPlan, formatChatPlanForPrompt } = await import("./cursor-plan.service");
          const plan = await getChatPlan(userId, request.chatThreadId);
          const rendered = formatChatPlanForPrompt(plan);
          if (rendered) chatPlanText = rendered;
        } catch {
          // Non-critical — proceed without plan
        }
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
        autoContext,
        userPreferences: userPreferencesText,
        agentMemories: agentMemoriesText,
        chatPlan: chatPlanText,
        workflowContext: request.workflowContext,
      };

      let systemPrompt = renderAgentPrompt(activeAgent, promptCtx);

      // ── Forced-tool directive (`#tool` mention) ───────
      // If the user typed `#search_codebase` or similar, append a short
      // directive telling the AI to start with that tool. Parsed once at
      // top of runWorkerStream; null on resume turns.
      if (parsedMentions.forceTool) {
        systemPrompt +=
          `\n\n${buildForceToolDirective(parsedMentions.forceTool, parsedMentions.allMentioned)}`;
      }

      // ── Studio mode prompt adjustments ─────────────────
      // Skip the append when the active agent's body already covers this mode
      // (the `ask` and `plan` built-in agents include their own mode block).
      const agentCoversMode = activeAgent.frontmatter.studioMode === request.studioMode;
      if (!agentCoversMode && request.studioMode === "ask") {
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
      } else if (!agentCoversMode && request.studioMode === "plan") {
        systemPrompt += `\n\n## Mode: Plan
You are in PLAN mode. The user wants a step-by-step plan for changes.
- Do NOT execute any mutations — only READ data if needed to inform the plan
- Produce a numbered step-by-step plan describing exactly what changes to make
- For each step, explain WHAT it does, WHY it's needed, and WHICH tool/action would be used
- If the workflow context is available, reference specific steps by name/order
- End with a summary of expected outcome
- The user can switch to Agent mode to execute the plan`;
      }

      // ── Inject repo context for follow-up messages ─────
      // When the user attached a repo in this session but this is not a fresh analyze-repo
      // request (e.g. "create a plugin from this repo" after analysis), inject the repo URL
      // and analysis summary so the AI doesn't ask again.
      const isFollowUpRepoMessage = request.repoUrl && request.mode !== "analyze-repo" && repoAnalysis;
      const isRepoContextOnly = request.repoUrl && request.mode !== "analyze-repo" && !repoAnalysis;
      if (isFollowUpRepoMessage && repoAnalysis) {
        systemPrompt += `\n\n## Attached Repository\nThe user has attached this repository: ${request.repoUrl}\n`
          + `Purpose: ${repoAnalysis.purpose}\n`
          + `Language: ${repoAnalysis.language}${repoAnalysis.framework ? ` (${repoAnalysis.framework})` : ""} | Complexity: ${repoAnalysis.complexity}\n`
          + `Features: ${repoAnalysis.features.slice(0, 6).join(", ")}\n`
          + `When the user says "this repo", "create a plugin from this repo", etc., use the above repository.`;
      } else if (isRepoContextOnly) {
        // Repo attached but not yet analyzed — just hint the AI about the URL
        systemPrompt += `\n\n## Attached Repository\nThe user has attached this repository: ${request.repoUrl}\nUse this as the target repo for any build/create/analyze requests.`;
      }

      // ── Build tool definitions ─────────────────────────
      const effectiveHasWorkflowContext = isResume && resumeState
        ? resumeState.hasWorkflowContext
        : !!request.workflowContext;
      const workerTools = resolveAgentTools(activeAgent, {
        hasWorkflowContext: effectiveHasWorkflowContext,
      });
      const toolDefs: ToolDefinition[] = workerTools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as ToolDefinition["parameters"],
      }));

      // Merge in MCP tools discovered at session init
      for (const mt of mcpTools) {
        toolDefs.push({
          name: mt.name,
          description: mt.description ?? "",
          parameters: (mt.inputSchema ?? { type: "object", properties: {} }) as ToolDefinition["parameters"],
        });
      }

      // ── Initialize messages ────────────────────────────
      let messages: TextGenerationMessage[];

      if (resumeMessagesReady) {
        // On resume: use saved messages with user's answer already injected
        messages = resumeMessagesReady;
        resumeMessagesReady = undefined; // Only use for first iteration after resume
      } else {
        // Normal path: build from scratch
        // Enrich user message with attached repo URL if present (so the LLM knows about it)
        // Always append for every message — the system prompt also carries context, but the
        // user-message annotation helps models that anchor on user turns more than system prompts.
        let userMessage = message;
        if (request.repoUrl) {
          userMessage = `${message}\n\n[Attached repository: ${request.repoUrl}]`;
        }

        // Inject prior conversation turns so the AI remembers the ongoing conversation.
        // Capped at 20 messages (10 exchanges) to keep token cost bounded.
        const historyMessages: TextGenerationMessage[] = (request.conversationHistory ?? [])
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }));

        // Detect continuation phrases — user asking the AI to resume incomplete work.
        // When we have conversation history and the message is just "continue" (or similar),
        // the AI must NOT start over — it must read the history, identify what was done,
        // and resume with tool calls immediately instead of re-reading everything from scratch.
        const CONTINUATION_PHRASES = new Set([
          "continue", "keep going", "go on", "proceed", "go ahead",
          "continue please", "please continue", "keep working", "resume",
          "continue working", "keep it going", "go", "next", "and?",
        ]);
        const isContinuation =
          currentWorker === "coder" &&
          historyMessages.length >= 2 &&
          CONTINUATION_PHRASES.has(message.toLowerCase().trim());

        if (isContinuation) {
          // Build a short summary of what the last assistant message said it was doing
          const lastAssistant = [...historyMessages].reverse().find((m) => m.role === "assistant");
          const priorCtx = lastAssistant
            ? `The last thing you were doing: "${lastAssistant.content.slice(0, 300).trim()}"`
            : "";
          userMessage =
            `[CONTINUATION] The user asked you to continue.\n` +
            (priorCtx ? `${priorCtx}\n\n` : "") +
            `[SYSTEM] DO NOT start over or re-read files you already examined. ` +
            `Review the conversation history above, identify exactly where you stopped, ` +
            `and resume the task immediately using tool calls (write_file, edit_file, etc.). ` +
            `If the task is complete, call finish. Do not just describe what you will do — do it now.`;
          slog.info({ priorCtxLen: priorCtx.length }, "Detected continuation phrase — injecting resume directive");
        }

        messages = [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          {
            role: "user",
            content: handOffContext ? `${handOffContext}\n\nOriginal user message: ${userMessage}` : userMessage,
            ...(request.imageParts && request.imageParts.length > 0
              ? {
                  parts: [
                    { type: "text" as const, text: handOffContext ? `${handOffContext}\n\nOriginal user message: ${userMessage}` : userMessage },
                    ...request.imageParts.map((img) => ({
                      type: "image_url" as const,
                      image_url: { url: img.url, detail: "auto" as const },
                    })),
                  ],
                }
              : {}),
          },
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
      // Consecutive tool-level error counter (e.g. list_files returns "Error listing...")
      let consecutiveToolErrors = 0;
      // Lower threshold so mutation retries fail fast (remove_workflow_step, uninstall_plugin etc.)
      const MAX_CONSECUTIVE_TOOL_ERRORS = 3;
      // Search loop detection — track recent search-type tool calls
      const recentSearchCalls: Array<{ tool: string; pattern: string }> = [];
      const SEARCH_TOOLS = new Set(["search_files", "find_relevant_code", "search_docs", "search_symbols"]);
      const MAX_CONSECUTIVE_SEARCHES = 3;
      const MAX_CONSECUTIVE_ERRORS = 3;
      // list_files loop detection — tracks how many times the same path is listed with no write progress
      const listFilesCallCounts = new Map<string, number>();
      const MAX_LIST_FILES_REPEATS = 3;
      // read_file loop detection — tracks how many times the same file+range is read with no write progress
      const readFileCallCounts = new Map<string, number>();
      const MAX_READ_FILE_REPEATS = 3;
      // view_plugin_logs loop detection — re-fetching the same plugin's logs without
      // taking action between calls is always a loop (saw 14× repeats in the wild).
      const viewLogsCallCounts = new Map<string, number>();
      const MAX_VIEW_LOGS_REPEATS = 2;
      // State-query loop detection — list_user_plugins / list_gateways / list_workflow_steps
      // These return deterministic results; repeating them without acting is always a loop.
      const stateQueryCallCounts = new Map<string, number>();
      const STATE_QUERY_TOOLS = new Set(["list_user_plugins", "list_gateways", "list_workflow_steps", "get_workflow", "list_allowed_domains"]);
      const MAX_STATE_QUERY_REPEATS = 2;
      // Cache of last successful STATE_QUERY result so repeated calls short-circuit instead of
      // hammering the DB and "resetting" the model's memory of paths/IDs it already had.
      // Invalidated only by mutations that actually change the queried state — file edits
      // (edit_file/write_file) do NOT invalidate plugin/gateway lists.
      const stateQueryResultCache = new Map<string, ToolExecResult>();
      // Map: state-query tool name → set of mutations that invalidate its cache
      const STATE_QUERY_INVALIDATORS: Record<string, Set<string>> = {
        list_user_plugins: new Set(["create_plugin_record", "install_plugin", "uninstall_plugin", "delete_plugin"]),
        list_allowed_domains: new Set(["request_domain_allowlist"]),
        list_gateways: new Set(["create_gateway", "delete_gateway", "update_gateway"]),
        list_workflow_steps: new Set(["add_workflow_step", "remove_workflow_step", "update_workflow_step"]),
        get_workflow: new Set(["add_workflow_step", "remove_workflow_step", "update_workflow_step", "update_workflow"]),
      };
      const stateQueryCacheKey = (toolName: string, args: Record<string, unknown>): string =>
        `${toolName}:${JSON.stringify(args)}`;
      const invalidateStateQueryCacheFor = (mutationToolName: string): void => {
        for (const [queryTool, invalidators] of Object.entries(STATE_QUERY_INVALIDATORS)) {
          if (invalidators.has(mutationToolName)) {
            for (const k of Array.from(stateQueryResultCache.keys())) {
              if (k.startsWith(`${queryTool}:`)) stateQueryResultCache.delete(k);
            }
          }
        }
      };
      /**
       * Wraps executeTool with state-query caching. If the tool is a STATE_QUERY and a cached
       * successful result exists, returns it instantly (avoiding DB hits and reinforcing that
       * the model already has this data). Caches successful state-query results for reuse.
       * Invalidates relevant cache entries when a state-mutating tool runs.
       */
      const executeToolCached = async (
        worker: CursorWorkerType,
        toolName: string,
        args: Record<string, unknown>,
      ): Promise<ToolExecResult> => {
        if (STATE_QUERY_TOOLS.has(toolName)) {
          const key = stateQueryCacheKey(toolName, args);
          const cached = stateQueryResultCache.get(key);
          if (cached) {
            return {
              ...cached,
              result: `[cached — same as previous call this session] ${cached.result}`,
            };
          }
        }
        const ctx = { userId, organizationId, client, pluginDir, writtenFiles, workflowContext: resumeState?.workflowContext || request.workflowContext, sessionId, userPlan: request.userPlan, chatThreadId: request.chatThreadId, workspaceId };
        const r = await executeTool(worker, toolName, args, ctx);
        const isError = r.result.startsWith("Blocked:") || r.result.startsWith("Error") || r.result.startsWith("❌");
        if (STATE_QUERY_TOOLS.has(toolName) && !isError) {
          stateQueryResultCache.set(stateQueryCacheKey(toolName, args), r);
        }
        if (!isError) invalidateStateQueryCacheFor(toolName);
        return r;
      };
      // Failed mutation tracking — same destructive tool failing repeatedly should stop immediately
      const failedMutationCounts = new Map<string, number>();
      const MUTATION_TOOLS = new Set(["remove_workflow_step", "uninstall_plugin", "delete_plugin", "delete_gateway", "delete_file"]);
      const MAX_MUTATION_FAILURES = 2;
      // Track whether last response was tool-only (no substantial text) for smart model routing
      let lastResponseWasToolOnly = false;
      // Track consecutive text-only responses to avoid infinite nudge loops
      let consecutiveTextOnlyReplies = 0;
      const MAX_TEXT_ONLY_NUDGES = 2;
      // Effective model ID — may be switched to "auto" on model unavailable errors
      let effectiveModelId = resumeState?.modelId || request.modelId;
      // Original user-selected model display name (for fallback notifications)
      const originalModelDisplay = (() => {
        if (!effectiveModelId || effectiveModelId === "auto") return null;
        const entry = getRegistryEntry(effectiveModelId);
        return entry?.displayName || effectiveModelId;
      })();
      /** Whether the user has been notified about a model fallback this session */
      let modelFallbackNotified = false;
      // Track last edited file path for forced verification — cleared after validation
      let unverifiedEditPath: string | null = null;
      // Diagnosis-lock: when the assistant's last text claimed it found the bug,
      // the next turn's tool batch must be a write. If it's all read-only,
      // we inject a one-shot system nudge to make the AI fix the bug instead
      // of reading more files. See `diagnosis-lock` skill in cursor-skills.ts.
      let diagnosisClaimedAtTurn = -1;
      const DIAGNOSIS_PATTERN = /(found it|i (?:see|found) the (?:issue|problem|bug)|the (?:problem|bug|issue) is|that['']?s why|root cause is)/i;

      for (let turn = 0; turn < agentConfig.maxIterations; turn++) {
        // Honor any abnormalStopReason set during a prior iteration (e.g. by
        // loop guards inside parallel/sequential tool dispatch paths).
        if (abnormalStopReason) {
          if (!finishSummary) finishSummary = `Stopped: ${abnormalStopReason}`;
          yield { type: "status" as const, message: finishSummary };
          break;
        }
        // Safety: session limits (exclude time spent waiting for user answers)
        const effectiveStart = new Date(startedAt.getTime() + pausedMs);
        const limitError = checkSessionLimits(
          totalIterations,
          totalCreditsUsed,
          effectiveStart,
          {
            maxIterations: agentConfig.maxIterations,
            maxCreditsPerSession: agentConfig.maxCreditsPerSession,
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
          abnormalStopReason = limitError;
          yield { type: "status" as const, message: finishSummary };
          break;
        }

        // Pre-check user credit balance before expensive AI call
        // Check every iteration but only hit DB every 3rd — use cached result in between
        if (turn % 3 === 0 || turn <= 1) {
          try {
            const { twoBotAICreditService } = await import("@/modules/credits/2bot-ai-credit.service");
            const balance = await twoBotAICreditService.getBalance(userId);
            if (balance.balance <= 0) {
              const filesWritten = Object.keys(writtenFiles).length;
              finishSummary = filesWritten > 0
                ? `You've run out of credits. ${filesWritten} file(s) were saved successfully. Please add credits to continue.`
                : "You've run out of credits. Please add credits to continue.";
              abnormalStopReason = "out_of_credits";
              slog.warn({ balance: balance.balance }, "User credits exhausted — stopping session");
              yield { type: "status" as const, message: finishSummary };
              break;
            }
          } catch {
            // Non-critical — proceed without balance check
          }
        }

        totalIterations++;

        // Check for mid-stream user corrections and inject them as messages
        const corrections = await drainCorrections(sessionId);
        if (corrections.length > 0) {
          const correctionText = corrections
            .map((c) => `[USER CORRECTION] ${c}`)
            .join("\n");
          messages.push({ role: "user", content: correctionText });
          slog.info({ corrections: corrections.length }, "Injected mid-stream corrections");
          yield {
            type: "status" as const,
            message: `Received ${corrections.length} correction${corrections.length > 1 ? "s" : ""} — adjusting...`,
          };
        }

        yield {
          type: "iteration_start" as const,
          iteration: totalIterations,
          totalCreditsUsed,
          creditBudget: agentConfig.maxCreditsPerSession,
        };

        try {
          // Prune old messages to cap context window growth
          if (totalIterations > PRUNE_AFTER_ITERATION) {
            yield { type: "status" as const, message: "Compacting context…" };
            messages = pruneMessages(messages);
          }

          // Compact read_file results for files that have since been written
          compactConsumedReads(messages);

          yield { type: "status" as const, message: totalIterations > 0 ? `Thinking... (step ${totalIterations + 1})` : "Thinking..." };

          const workerModel = getModelForWorker(currentWorker, effectiveModelId, lastResponseWasToolOnly, agentConfig.allowLiteRouting);
          const response = await withRetry(
            () => twoBotAIProvider.textGeneration({
              messages,
              model: workerModel,
              temperature: agentConfig.temperature,
              maxTokens: 4096,
              stream: false,
              userId,
              tools: toolDefs,
              toolChoice: "auto",
              feature: "cursor",
              capability: "code-generation",
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
          if (response.model) {
            // Only update displayed model for non-lite-routing calls
            // so the badge shows the user's chosen model, not the internal routing model
            if (workerModel !== LITE_ROUTING_MODEL) {
              const entry = getRegistryEntry(response.model);
              lastModelUsed = entry?.displayName || response.model;

              // Notify user once when a fallback model is being used
              if (!modelFallbackNotified && originalModelDisplay && lastModelUsed !== originalModelDisplay) {
                modelFallbackNotified = true;
                yield {
                  type: "model_fallback" as const,
                  requestedModel: originalModelDisplay,
                  fallbackModel: lastModelUsed,
                  fallbackModelId: entry?.id || response.model,
                  reason: "The selected model is currently unavailable",
                };
              }
            }
          }

          // Soft budget guard: after each LLM call, estimate whether
          // the NEXT iteration would overshoot the budget. Uses the actual cost
          // of THIS call as the best predictor (context only grows).
          {
            const thisCallCost = response.creditsUsed ?? 0;
            const avgCost = totalIterations > 0 ? totalCreditsUsed / totalIterations : thisCallCost;
            const estimatedNextCost = Math.max(avgCost, thisCallCost) * 1.3;
            const remaining = agentConfig.maxCreditsPerSession - totalCreditsUsed;
            if (totalIterations > 2 && remaining < estimatedNextCost && remaining < agentConfig.maxCreditsPerSession * 0.15) {
              const filesWritten = Object.keys(writtenFiles).length;
              slog.warn(
                { credits: totalCreditsUsed, remaining, estimated: estimatedNextCost, budget: agentConfig.maxCreditsPerSession },
                "Soft budget guard: not enough budget for next iteration — suspending for continuation",
              );

              const statusMsg = filesWritten > 0
                ? `Credit budget nearly exhausted (${Math.round(totalCreditsUsed)}/${agentConfig.maxCreditsPerSession}). ${filesWritten} file(s) saved so far. Click "Continue" to extend the budget and finish.`
                : `Credit budget nearly exhausted (${Math.round(totalCreditsUsed)}/${agentConfig.maxCreditsPerSession}). Click "Continue" to extend the budget, or dismiss to stop.`;
              yield { type: "status" as const, message: statusMsg };

              // ── Suspend session (like ask_user) so the user can continue ──
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
                activePlanItems: activePlanItems.length > 0 ? activePlanItems : undefined,
                addedToWorkflow: addedToWorkflow || undefined,
                studioMode: request.studioMode,
                hasWorkflowContext: !!request.workflowContext,
                workflowContext: request.workflowContext,
                modelId: request.modelId,
                repoUrl: request.repoUrl,
                fileReadCacheSnapshot: snapshotFileReadCache(sessionId),
                suspendReason: "credit_exhaustion",
              };

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

              const continueQuestion = filesWritten > 0
                ? `Credit budget reached (${Math.round(totalCreditsUsed)}/${agentConfig.maxCreditsPerSession} credits). ${filesWritten} file(s) saved so far — the work is incomplete. Would you like to continue with a fresh budget?`
                : `Credit budget reached (${Math.round(totalCreditsUsed)}/${agentConfig.maxCreditsPerSession} credits). Would you like to continue with a fresh budget?`;

              yield {
                type: "suspended" as const,
                sessionId,
                question: continueQuestion,
                sensitive: false,
                options: [
                  { label: "▶ Continue where I left off", value: "continue" },
                  { label: "Stop here", value: "stop" },
                ],
              };

              sessionSuspended = true;
              slog.info(
                { credits: totalCreditsUsed, filesWritten, budget: agentConfig.maxCreditsPerSession },
                "⏸️ Session suspended — credit budget exhausted, waiting for user to continue",
              );
              return; // End generator — stream closes cleanly
            }
          }

          const assistantContent = response.content || "";
          const toolCalls = response.toolCalls;

          // Smart model routing: detect if this was a tool-routing-only response
          // If AI just called tools with minimal/no text, next iteration can use cheap model
          // If AI produced substantial text or called write_file (code generation), use full model
          //
          // IMPORTANT: For coder worker, only use lite model during early read iterations.
          // Once context grows (turn >= 3), always use full model — lite models can't reliably
          // call write_file/create_plugin_record with large context and produce text-only instead.
          const hasSubstantialText = assistantContent.length > 200;
          const hasWriteCall = toolCalls?.some((tc) =>
            tc.name === "write_file" || tc.name === "edit_file" || tc.name === "finish"
          );
          if (turn >= agentConfig.fullModelAfterTurn) {
            // Past the agent's lite-routing ceiling — always use full model.
            // For the legacy coder runtime this is turn >= 3; for ask/plan it's Infinity.
            lastResponseWasToolOnly = false;
          } else {
            lastResponseWasToolOnly = !!(toolCalls && toolCalls.length > 0 && !hasSubstantialText && !hasWriteCall);
          }

          if (assistantContent || response.reasoning) {
            // Use assistantContent as primary text; fall back to reasoning for reasoning-only models
            const thinkingText = assistantContent || response.reasoning || "";
            yield { type: "thinking" as const, text: thinkingText, reasoning: response.reasoning };
            lastAssistantText = thinkingText;
          }

          // Text-only response (no tool calls)
          if (!toolCalls || toolCalls.length === 0) {
            // Detect broken model output: model is printing apology text instead
            // of calling tools (happens with models that lack tool-calling ability)
            const contentLower = assistantContent.toLowerCase();
            const isBrokenToolOutput =
              contentLower.includes("tool_code") ||
              contentLower.includes("i am unable to execute code") ||
              contentLower.includes("i am sorry, but i am unable") ||
              contentLower.includes("i cannot create files");
            if (isBrokenToolOutput) {
              slog.error(
                { worker: currentWorker, model: effectiveModelId, contentSnippet: assistantContent.slice(0, 200) },
                "Model is broken — outputting tool_code text instead of calling tools. Stopping.",
              );
              finishSummary = "The AI model is unable to call tools properly. Please try a different model.";
              abnormalStopReason = "broken_model";
              yield { type: "status" as const, message: finishSummary };
              break;
            }

            // For assistant: text response IS the answer — always done
            if (currentWorker === "assistant") {
              slog.info({ worker: currentWorker }, "Worker responded with text only — done");
              workerFinished = true;
              finishSummary = assistantContent || response.reasoning || "";
              break;
            }

            // For coder: text-only with 0 files written means the model described a plan
            // instead of executing it (common with lite models). Nudge it to use tools.
            // Also nudge when files ARE written but the AI explicitly says it will do more
            // (e.g. "Now I'll integrate it into index.js and begin porting...").
            const filesWritten = Object.keys(writtenFiles).length;
            consecutiveTextOnlyReplies++;

            // Detect if the AI's text indicates it plans to continue working
            const indicatesContinuation =
              contentLower.includes("now i'll") ||
              contentLower.includes("now i will") ||
              contentLower.includes("next, i'll") ||
              contentLower.includes("next i'll") ||
              contentLower.includes("next, i will") ||
              contentLower.includes("let me ") ||
              contentLower.includes("let me check") ||
              contentLower.includes("let me read") ||
              contentLower.includes("let me update") ||
              contentLower.includes("let me verify") ||
              contentLower.includes("let me write") ||
              contentLower.includes("i need to") ||
              contentLower.includes("i'll now") ||
              contentLower.includes("moving on to") ||
              contentLower.includes("continue with") ||
              contentLower.includes("begin porting") ||
              contentLower.includes("proceed to") ||
              contentLower.includes("let's create") ||
              contentLower.includes("let's write") ||
              contentLower.includes("let's add") ||
              contentLower.includes("let's update");

            // Check if plan items are still pending (means work is definitely not done)
            const hasPendingPlanItems =
              activePlanItems.length >= 3 &&
              activePlanItems.some((it) => it.status !== "done");

            const shouldNudge =
              (filesWritten === 0 && consecutiveTextOnlyReplies <= MAX_TEXT_ONLY_NUDGES) ||
              (indicatesContinuation && consecutiveTextOnlyReplies <= MAX_TEXT_ONLY_NUDGES + 1) ||
              (hasPendingPlanItems && consecutiveTextOnlyReplies <= MAX_TEXT_ONLY_NUDGES);

            if (shouldNudge) {
              slog.warn(
                { worker: currentWorker, nudge: consecutiveTextOnlyReplies, filesWritten, indicatesContinuation, hasPendingPlanItems },
                "Coder responded with text only — nudging to use tools",
              );
              // Force full model on next iteration (lite model failed to call tools)
              lastResponseWasToolOnly = false;
              // Inject the plan as context and nudge the model to execute
              messages.push({ role: "assistant", content: assistantContent });
              // Build a nudge that matches the actual task type (fix/edit vs create)
              const isEditMode = pluginMode === "edit" || handOffCount > 0;
              let nudgeContent: string;
              if (filesWritten > 0) {
                nudgeContent = "[SYSTEM] Good progress. Continue executing — use write_file, edit_file, and other tools to do the work you just described. Do not just describe what you will do; do it now.";
              } else if (isEditMode) {
                nudgeContent = "[SYSTEM] You have identified the issue. Now fix it — use edit_file (or write_file) to apply the changes directly. Do not just describe what you will do; do it now.";
              } else {
                nudgeContent = "[SYSTEM] Good plan. Now please execute it — use write_file and other tools to create the files. Do not just describe what you will do; do it now.";
              }
              messages.push({ role: "user", content: nudgeContent });
              yield { type: "status" as const, message: filesWritten > 0 ? "Continuing..." : "Applying fix..." };
              continue;
            }

            // Coder stopped responding with tool calls — log and explain to user why
            slog.info(
              { worker: currentWorker, filesWritten, nudges: consecutiveTextOnlyReplies, hasPendingPlanItems },
              "Worker responded with text only — done",
            );
            if (currentWorker === "coder" && hasPendingPlanItems) {
              // Plan has unfinished steps — soft-suspend so the user can resume with full context.
              // Unlike a plain break, this saves all session state (messages, writtenFiles,
              // activePlanItems) to the DB, allowing a proper resume via resumeSessionId.
              const pendingItems = activePlanItems.filter((it) => it.status !== "done");
              const pendingList = pendingItems.slice(0, 4).map((it) => `• ${it.title}`).join("\n");
              const pendingMore = pendingItems.length > 4 ? `\n...and ${pendingItems.length - 4} more` : "";
              const suspendQuestion = `Stopped mid-task — ${pendingItems.length} step${pendingItems.length === 1 ? "" : "s"} not completed:\n${pendingList}${pendingMore}\n\nWould you like me to continue?`;

              const softSuspendState: SuspendedSessionState = {
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
                activePlanItems: activePlanItems.length > 0 ? activePlanItems : undefined,
                addedToWorkflow: addedToWorkflow || undefined,
                studioMode: request.studioMode,
                hasWorkflowContext: !!request.workflowContext,
                workflowContext: request.workflowContext,
                modelId: request.modelId,
                repoUrl: request.repoUrl,
                fileReadCacheSnapshot: snapshotFileReadCache(sessionId),
                suspendReason: "soft_stop",
              };

              await agentSessionService.suspendSession({
                id: sessionId,
                messages,
                suspendedState: softSuspendState as unknown as Record<string, unknown>,
                iterationCount: totalIterations,
                toolCallCount: totalToolCalls,
                totalCreditsUsed,
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
              });

              yield {
                type: "suspended" as const,
                sessionId,
                question: suspendQuestion,
                sensitive: false,
                options: [
                  { label: "▶ Continue", value: "continue" },
                  { label: "Stop here", value: "stop" },
                ],
              };

              sessionSuspended = true;
              slog.info(
                { pendingSteps: pendingItems.length, filesWritten: Object.keys(writtenFiles).length },
                "⏸️ Session soft-suspended — plan incomplete, waiting for user to resume",
              );
              return; // End generator — stream closes cleanly
            }
            break;
          }

          // Reset text-only counter when model produces tool calls
          consecutiveTextOnlyReplies = 0;

          if (assistantContent) {
            messages.push({ role: "assistant", content: assistantContent });
          }

          // Diagnosis-lock detection: if the assistant just claimed it found
          // the bug, mark this turn so we can nudge if the next tool batch
          // is all read-only (i.e. it's still investigating instead of fixing).
          if (typeof assistantContent === "string" && DIAGNOSIS_PATTERN.test(assistantContent)) {
            diagnosisClaimedAtTurn = turn;
          }

          // Execute tool calls — parallel for read-only batches, sequential otherwise
          const READ_ONLY_TOOLS = new Set([
            "read_file", "list_files", "search_files",
            "list_gateways", "list_user_plugins", "list_allowed_domains",
            "check_credits", "check_billing", "check_usage",
            "check_gateway_status", "list_templates",
            "view_plugin_logs", "explain_error",
            "list_available_plugins",
            "think", "find_relevant_code", "search_docs",
            "update_plan", "read_memory",
          ]);
          const CONTROL_FLOW_TOOLS = new Set([
            "ask_user", "finish", "hand_off_to_coder", "hand_off_to_assistant",
          ]);

          const allReadOnly = toolCalls.every((tc) =>
            READ_ONLY_TOOLS.has(tc.name) && !CONTROL_FLOW_TOOLS.has(tc.name)
          );

          // Diagnosis-lock soft enforcement: if the *previous* assistant turn
          // declared a diagnosis and this turn is still all read-only, inject
          // a one-shot system nudge to push toward an edit_file/write_file.
          if (diagnosisClaimedAtTurn === turn - 1 && allReadOnly && toolCalls.length > 0) {
            messages.push({
              role: "user",
              content:
                "[SYSTEM NUDGE] You said you found the issue last turn. " +
                "Your next action must be a write — call edit_file, write_file, or delete_file " +
                "to actually apply the fix. Do not read more files.",
            });
            // Clear the marker so we only nudge once per diagnosis claim.
            diagnosisClaimedAtTurn = -1;
          }

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
                executeToolCached(
                  currentWorker,
                  tc.name,
                  tc.arguments as Record<string, unknown>,
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
              const isError = toolResult.result.startsWith("Blocked:") || toolResult.result.startsWith("Error")
                || toolResult.result.startsWith("❌");

              yield {
                type: "tool_result" as const,
                tool: tc.name,
                success: !isError,
                summary: toolResult.result.slice(0, 200),
                ...(toolResult.snippet ? { snippet: toolResult.snippet } : {}),
                ...(toolResult.patch ? { patch: toolResult.patch } : {}),
              };

              // Emit terminal_output for inline display (run_command, validate_plugin)
              if (toolResult.terminalOutput) {
                yield {
                  type: "terminal_output" as const,
                  command: toolResult.terminalOutput.command,
                  output: toolResult.terminalOutput.output,
                  exitCode: toolResult.terminalOutput.exitCode,
                  cwd: toolResult.terminalOutput.cwd,
                };
              }

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

              // ── Search loop detection ──
              if (SEARCH_TOOLS.has(tc.name)) {
                recentSearchCalls.push({ tool: tc.name, pattern: String(toolArgs.pattern || toolArgs.query || "") });
              } else {
                recentSearchCalls.length = 0; // Reset on non-search tool
              }

              // ── list_files loop detection ──
              if (tc.name === "list_files") {
                const listPath = String(toolArgs.path || ".");
                listFilesCallCounts.set(listPath, (listFilesCallCounts.get(listPath) || 0) + 1);
              } else if (!READ_ONLY_TOOLS.has(tc.name)) {
                listFilesCallCounts.clear(); // Reset on any write/mutation tool
              }

              // ── read_file loop detection ──
              if (tc.name === "read_file") {
                const readKey = `${String(toolArgs.path || "")}:${String(toolArgs.startLine || "")}`;
                readFileCallCounts.set(readKey, (readFileCallCounts.get(readKey) || 0) + 1);
              } else if (!READ_ONLY_TOOLS.has(tc.name)) {
                readFileCallCounts.clear(); // Reset on any write/mutation tool
              }

              // ── view_plugin_logs loop detection (per pluginSlug) ──
              if (tc.name === "view_plugin_logs") {
                const slugKey = String(toolArgs.pluginSlug || toolArgs.entryFile || "default");
                viewLogsCallCounts.set(slugKey, (viewLogsCallCounts.get(slugKey) || 0) + 1);
              } else if (!READ_ONLY_TOOLS.has(tc.name)) {
                viewLogsCallCounts.clear();
              }

              // ── State-query loop detection (list_user_plugins, list_gateways, etc.) ──
              if (STATE_QUERY_TOOLS.has(tc.name)) {
                stateQueryCallCounts.set(tc.name, (stateQueryCallCounts.get(tc.name) || 0) + 1);
              } else if (!READ_ONLY_TOOLS.has(tc.name)) {
                stateQueryCallCounts.clear(); // Reset when agent acts on something
              }

              // ── Failed mutation retry detection ──
              if (MUTATION_TOOLS.has(tc.name) && isError) {
                const mutKey = `${tc.name}:${JSON.stringify(toolArgs)}`;
                failedMutationCounts.set(mutKey, (failedMutationCounts.get(mutKey) || 0) + 1);
              } else if (MUTATION_TOOLS.has(tc.name) && !isError) {
                failedMutationCounts.clear(); // Successful mutation resets
              }

              // ── Sync activePlanItems when update_plan is called (parallel path) ──
              if (tc.name === "update_plan" && !isError) {
                const items = toolArgs.items as Array<{ id: string; title: string; status: "pending" | "in_progress" | "done" }> | undefined;
                if (Array.isArray(items)) {
                  activePlanItems = items.map((it) => ({
                    id: String(it.id),
                    title: String(it.title),
                    status: (["pending", "in_progress", "done"].includes(it.status) ? it.status : "pending") as "pending" | "in_progress" | "done",
                  }));
                }
              }

              // ── Track plugin creation (parallel path) ──
              if (tc.name === "create_plugin_record" && !isError && toolResult.finishData?.pluginId) {
                pluginId = toolResult.finishData.pluginId;
              }

              // ── Track workflow step addition (parallel path) ──
              if (tc.name === "add_workflow_step") {
                if (!isError) {
                  addedToWorkflow = true;
                } else if (toolResult.result?.toLowerCase().includes("already")) {
                  // Plugin is already in the workflow — treat as success so finish guard passes
                  addedToWorkflow = true;
                  slog.info({ pluginId }, "add_workflow_step reported already-in-workflow — marking addedToWorkflow=true");
                }
              }

              const statusPrefix = isError ? "❌ TOOL ERROR" : "✅ TOOL RESULT";
              messages.push({
                role: "user",
                content: `[${statusPrefix}: ${tc.name}]\n${toolResult.result}`,
              });
            }

            // ── Inject corrective message if too many consecutive searches ──
            if (recentSearchCalls.length >= MAX_CONSECUTIVE_SEARCHES) {
              messages.push({
                role: "user",
                content: `[⚠️ SYSTEM] You have called search tools ${recentSearchCalls.length} times in a row without reading or editing any files. STOP searching. Use get_file_outline or read_file on the files you already found, then proceed to implementation. Repeated searching wastes credits.`,
              });
              slog.warn({ count: recentSearchCalls.length, searches: recentSearchCalls }, "Search loop detected — injecting corrective prompt");
              recentSearchCalls.length = 0; // Reset after warning
            }

            // ── Inject corrective message if listing the same directory too many times ──
            for (const [listPath, count] of listFilesCallCounts.entries()) {
              if (count >= MAX_LIST_FILES_REPEATS) {
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] You have called list_files("${listPath}") ${count} times without making progress. STOP listing this directory. If you cannot find the files you need:\n- Try a different subdirectory you haven't explored yet\n- Use read_file with the full path on a file you already saw listed\n- If the user mentioned a repository but none is attached, call ask_user to request the GitHub URL\n- Do NOT call list_files on the same path again.`,
                });
                slog.warn({ listPath, count, worker: currentWorker }, "list_files loop detected — injecting corrective prompt");
                listFilesCallCounts.delete(listPath); // Reset after warning
              }
            }

            // ── Inject corrective message if reading the same file section too many times ──
            for (const [readKey, count] of readFileCallCounts.entries()) {
              if (count === MAX_READ_FILE_REPEATS || count === 5 || count === 8) {
                const filePath = readKey.split(":")[0] ?? readKey;
                const severity = count >= 8 ? "🛑 FINAL WARNING" : count >= 5 ? "⚠️ ESCALATING" : "⚠️ SYSTEM";
                messages.push({
                  role: "user",
                  content: `[${severity}] You have read "${filePath}" ${count} times without making any changes. STOP re-reading it. You already have this file's content — proceed to implement the fix:\n- Use edit_file or write_file to apply the change\n- If the file needs a different range, read a DIFFERENT section, not the same one\n- Do NOT call read_file on the same path+range again until you have made an edit.\n${count >= 8 ? "\nIf you call read_file on this same path+range one more time, the run will be aborted." : ""}`,
                });
                slog.warn({ filePath, count, worker: currentWorker }, "read_file loop detected — injecting corrective prompt");
              }
              if (count >= 10) {
                slog.error({ filePath: readKey, count, worker: currentWorker }, "read_file loop hard-stop — aborting run");
                abnormalStopReason = `Stuck in read_file loop on "${readKey.split(":")[0]}" (${count} repeats). Aborting to save credits.`;
              }
            }

            // ── State-query loop detection (parallel path) ──
            for (const [queryTool, count] of stateQueryCallCounts.entries()) {
              if (count >= MAX_STATE_QUERY_REPEATS) {
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] You have called "${queryTool}" ${count} times and received the same result each time. STOP calling it again — the result will not change. The current state is what it is. Act on the information you already have:\n- If the item you were looking for is NOT in the list, it does not exist — tell the user\n- If it IS in the list, use the ID/slug you received and proceed\n- Do NOT call "${queryTool}" again until you have performed a create/install/modify action.`,
                });
                slog.warn({ queryTool, count, worker: currentWorker }, "State-query loop detected — injecting corrective prompt");
                stateQueryCallCounts.delete(queryTool);
              }
            }

            // ── view_plugin_logs loop detection (parallel path) ──
            for (const [slugKey, count] of viewLogsCallCounts.entries()) {
              if (count >= MAX_VIEW_LOGS_REPEATS) {
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] You have called view_plugin_logs for "${slugKey}" ${count} times. STOP fetching logs. You have the logs you need — proceed:\n- If logs show an error, FIX it (edit code, restart plugin, etc.)\n- If logs are empty, the plugin produced no output — DO NOT keep checking; describe this to the user\n- If logs look normal, the plugin is working — report success to the user\n- Do NOT call view_plugin_logs again until you have made a change to the plugin.`,
                });
                slog.warn({ slugKey, count, worker: currentWorker }, "view_plugin_logs loop detected — injecting corrective prompt");
                viewLogsCallCounts.delete(slugKey);
              }
            }

            // ── Failed mutation retry detection (parallel path) ──
            for (const [mutKey, count] of failedMutationCounts.entries()) {
              if (count >= MAX_MUTATION_FAILURES) {
                const toolName = mutKey.split(":")[0] ?? mutKey;
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] "${toolName}" has failed ${count} times with the same arguments. STOP retrying it — retrying will not fix the error. Tell the user what happened and ask them what they would like to do instead.`,
                });
                slog.warn({ mutKey, count, worker: currentWorker }, "Failed mutation loop detected — injecting corrective prompt");
                failedMutationCounts.delete(mutKey);
              }
            }

            // ── Consecutive tool error detection (parallel batch) ──
            {
              const batchAllErrors = results.every((r) => r.result.startsWith("Error") || r.result.startsWith("Blocked:"));
              if (batchAllErrors) {
                consecutiveToolErrors += results.length;
              } else {
                consecutiveToolErrors = 0;
              }
              if (consecutiveToolErrors >= MAX_CONSECUTIVE_TOOL_ERRORS) {
                slog.warn({ consecutiveToolErrors, worker: currentWorker }, "Too many consecutive tool errors — workspace may be unreachable");
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] ${consecutiveToolErrors} consecutive tool calls have failed. The workspace or file system may be unreachable. STOP retrying. Report the issue to the user and explain what you were trying to do. Do NOT call list_files, create_directory, or read_file again — they will continue to fail.`,
                });
                consecutiveToolErrors = 0;
              }
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
                activePlanItems: activePlanItems.length > 0 ? activePlanItems : undefined,
                addedToWorkflow: addedToWorkflow || undefined,
                studioMode: request.studioMode,
                hasWorkflowContext: !!request.workflowContext,
                workflowContext: request.workflowContext,
                modelId: request.modelId,
                repoUrl: request.repoUrl,
                fileReadCacheSnapshot: snapshotFileReadCache(sessionId),
                suspendReason: "ask_user",
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
            // delete_file is handled below via terminal_confirm (inline Allow/Delete buttons).
            // delete_gateway and uninstall_plugin use an in-flight ask_user with options.
            const DESTRUCTIVE_TOOLS = new Set(["delete_gateway", "uninstall_plugin"]);
            if (DESTRUCTIVE_TOOLS.has(tc.name)) {
              const target = (toolArgs.gatewayId as string) || (toolArgs.name as string) || (toolArgs.pluginId as string) || "this resource";
              yield {
                type: "ask_user" as const,
                question: `⚠️ Confirm: **${tc.name}** on "${target}". This cannot be undone.`,
                sensitive: false,
                sessionId,
                inFlight: true,
                options: [
                  { label: "Yes, proceed", value: "yes" },
                  { label: "No, cancel", value: "no" },
                ],
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

            // ── Domain allowlist request (always pauses for explicit consent) ──
            // The agent asks "may I add these domains?" → user clicks Allow/Cancel
            // → on Allow we add each via egressProxyService with addedBy="ai-agent"
            // and a sessionId for admin auditing. On Cancel we tell the model not
            // to retry. The tool never bypasses confirmation — that's its whole job.
            if (tc.name === "request_domain_allowlist") {
              const rawDomains = Array.isArray(toolArgs.domains)
                ? (toolArgs.domains as unknown[])
                    .map((d) => (typeof d === "string" ? d.trim() : ""))
                    .filter((d): d is string => d.length > 0)
                : [];
              const domains = Array.from(new Set(rawDomains)).slice(0, 8);
              const reason = typeof toolArgs.reason === "string"
                ? (toolArgs.reason as string).trim()
                : "";

              if (domains.length === 0 || !reason) {
                messages.push({
                  role: "user",
                  content: `[TOOL ERROR: request_domain_allowlist]\nMust supply 1-8 \`domains\` (bare hostnames) and a non-empty \`reason\`. Try again with valid arguments or pick a different approach.`,
                });
                continue;
              }

              // ── Dedup against domains already approved earlier in this session.
              // Without this, the model can call the same tool again with the same
              // hosts and re-prompt the user, burning credits + creating UI noise.
              {
                const { egressProxyService } = await import("@/modules/workspace/workspace-squid.service");
                let existing: Array<{ domain: string }> = [];
                try {
                  existing = await egressProxyService.getUserDomains(userId);
                } catch {
                  // If the lookup fails we just fall through to the normal ask path.
                }
                const existingSet = new Set(existing.map((e) => e.domain.toLowerCase()));
                const stillNeeded = domains.filter((d) => !existingSet.has(d.toLowerCase()));
                const alreadyApproved = domains.filter((d) => existingSet.has(d.toLowerCase()));

                if (stillNeeded.length === 0) {
                  // 100% of requested domains were already approved → no user prompt needed.
                  messages.push({
                    role: "user",
                    content:
                      `[TOOL RESULT: request_domain_allowlist]\n` +
                      `All requested domains are ALREADY in the user allowlist (${alreadyApproved.join(", ")}). ` +
                      `Do NOT call this tool again for these hosts in this session — the proxy is already configured. ` +
                      `Continue with the actual task.`,
                  });
                  slog.info({ alreadyApproved, sessionId }, "request_domain_allowlist short-circuited (all approved)");
                  continue;
                }

                if (alreadyApproved.length > 0) {
                  // Trim the ask to only the new domains so we don't re-prompt for the rest.
                  domains.length = 0;
                  domains.push(...stillNeeded);
                  messages.push({
                    role: "user",
                    content:
                      `[INFO: request_domain_allowlist]\n` +
                      `Pre-approved (skipped): ${alreadyApproved.join(", ")}. ` +
                      `Asking user only for the new hosts: ${stillNeeded.join(", ")}.`,
                  });
                }
              }

              const bullet = domains.map((d) => `• \`${d}\``).join("\n");
              const question =
                `🌐 **Allow external domains?**\n\n` +
                `The agent wants to add the following hosts to your workspace network allowlist:\n\n${bullet}\n\n` +
                `**Reason:** ${reason}\n\n` +
                `Approving will let your plugins reach these hosts. The change is logged to the admin audit trail.`;

              yield {
                type: "ask_user" as const,
                question,
                sensitive: false,
                sessionId,
                inFlight: true,
                options: [
                  { label: "Allow all", value: "allow" },
                  { label: "Cancel", value: "cancel" },
                ],
              };

              let approval: string;
              const approvalWaitStart = Date.now();
              try {
                approval = await waitForUserAnswer(sessionId, userId);
              } catch {
                pausedMs += Date.now() - approvalWaitStart;
                messages.push({
                  role: "user",
                  content: `[TOOL RESULT: request_domain_allowlist]\nUser did not respond. Action cancelled — do NOT retry.`,
                });
                continue;
              }
              pausedMs += Date.now() - approvalWaitStart;

              if (approval.trim().toLowerCase() !== "allow") {
                messages.push({
                  role: "user",
                  content:
                    `[TOOL RESULT: request_domain_allowlist]\nUser declined. Do NOT call this tool again with the same domains. ` +
                    `Suggest an alternative (mock data, different provider, or ask the user how to proceed).`,
                });
                slog.info({ domains, sessionId }, "Domain allowlist request declined by user");
                continue;
              }

              // Approved — add each domain with provenance.
              const { egressProxyService } = await import("@/modules/workspace/workspace-squid.service");
              const added: string[] = [];
              const failed: Array<{ domain: string; error: string }> = [];
              for (const domain of domains) {
                try {
                  const r = await egressProxyService.addUserDomain(
                    userId,
                    domain,
                    reason,
                    { addedBy: "ai-agent", sessionId },
                  );
                  added.push(r.domain);
                } catch (err) {
                  failed.push({ domain, error: (err as Error).message });
                }
              }

              const summaryLines: string[] = [];
              if (added.length > 0) summaryLines.push(`Added: ${added.join(", ")}`);
              if (failed.length > 0) {
                summaryLines.push(
                  `Skipped: ${failed.map((f) => `${f.domain} (${f.error})`).join("; ")}`,
                );
              }
              const summary = summaryLines.join(" | ") || "No changes.";

              messages.push({
                role: "user",
                content:
                  `[TOOL RESULT: request_domain_allowlist]\n${summary}\n` +
                  `The proxy has been reloaded — your plugin can now reach the approved hosts. Continue with the task.`,
              });
              slog.info({ added, failed: failed.length, sessionId }, "Domain allowlist updated by ai-agent");
              continue;
            }

            // ── Regular tool execution ───────────────────
            // Emit granular status phase ("Reading…", "Editing…", etc.)
            {
              const phase = toolNameToPhase(tc.name);
              if (phase) {
                yield { type: "status" as const, message: phase };
              }
            }
            {
              const uiActions = buildToolUIActions(tc.name, toolArgs);
              yield {
                type: "tool_start" as const,
                tool: tc.name,
                meta: buildToolStartMeta(tc.name, toolArgs),
                ...(uiActions.length > 0 ? { uiActions } : {}),
              };
            }

            // ── File delete consent: pause for user approval before delete_file ──
            if (tc.name === "delete_file") {
              const filePath = (toolArgs.path as string) || "";
              yield {
                type: "terminal_confirm" as const,
                sessionId,
                command: `Delete file: ${filePath}`,
                toolCallId: tc.id ?? `tc-${toolCallSequence}`,
              };
              const deleteConfirmWaitStart = Date.now();
              let deleteApproved = true;
              try {
                const answer = await waitForUserAnswer(sessionId, userId, 300_000);
                deleteApproved = answer === "__terminal_allow__";
              } catch {
                deleteApproved = false;
              }
              pausedMs += Date.now() - deleteConfirmWaitStart;
              if (!deleteApproved) {
                totalToolCalls++;
                yield {
                  type: "tool_result" as const,
                  tool: tc.name,
                  success: true,
                  summary: "File deletion skipped by user.",
                };
                messages.push({
                  role: "user",
                  content: `[TOOL RESULT: ${tc.name}]\nFile deletion skipped by user.`,
                });
                slog.info({ filePath }, "File deletion skipped by user");
                continue;
              }
              slog.info({ filePath }, "File deletion approved by user");
            }

            // ── Terminal consent: pause for user approval before run_command ──
            if (tc.name === "run_command") {
              const command = (toolArgs.command as string) || "";
              const cwd = (toolArgs.cwd as string) || undefined;

              // Auto-approve safe read-only / validation commands (no user consent needed)
              const SAFE_COMMAND_PATTERNS = /^\s*(node\s+--check\s+\S+\.(?:js|ts|mjs|cjs)(?=\s|$)|node\s+-c\b|npx\s+eslint|npx\s+tsc|cat\s|head\s|tail\s|ls\s|wc\s|echo\s|pwd|grep\s|find\s|stat\s|file\s|npm\s+(ls|list|outdated|audit))/i;
              const isSafeCommand = SAFE_COMMAND_PATTERNS.test(command);

              if (!isSafeCommand) {
                yield {
                  type: "terminal_confirm" as const,
                  sessionId,
                  command,
                  cwd,
                  toolCallId: tc.id ?? `tc-${toolCallSequence}`,
                };
                // Wait for user to Allow or Skip (5-min timeout)
                // Track wait time so it doesn't count against the session budget
                const terminalConfirmWaitStart = Date.now();
                let terminalApproved = true;
                try {
                  const answer = await waitForUserAnswer(sessionId, userId, 300_000);
                  terminalApproved = answer === "__terminal_allow__";
                } catch {
                  terminalApproved = false; // Timeout → treat as skip
                }
                pausedMs += Date.now() - terminalConfirmWaitStart;
                if (!terminalApproved) {
                  totalToolCalls++;
                  yield {
                    type: "tool_result" as const,
                    tool: tc.name,
                    success: true,
                    summary: "Command skipped by user.",
                  };
                  messages.push({
                    role: "user",
                    content: `[TOOL RESULT: ${tc.name}]\nCommand skipped by user. Do NOT retry the same command — adapt your approach.`,
                  });
                  slog.info({ command }, "Terminal command skipped by user");
                  continue;
                }
                slog.info({ command }, "Terminal command approved by user");
              } else {
                slog.info({ command }, "Terminal command auto-approved (safe pattern)");
              }

              // Emit status so UI shows progress during command execution
              yield { type: "status" as const, message: `⏳ Executing: ${command.slice(0, 80)}…` };
            }

            const toolStartTs = Date.now();
            const toolResult = await executeToolCached(
              currentWorker,
              tc.name,
              toolArgs,
            );
            const toolDurationMs = Date.now() - toolStartTs;

            totalToolCalls++;
            const isError = toolResult.result.startsWith("Blocked:") || toolResult.result.startsWith("Error")
              || toolResult.result.startsWith("❌");

            // Strip the LLM-facing cache prefix before any UI extraction — it must NEVER
            // appear in chat (we keep it in the model payload to discourage re-calling).
            const cacheStripped = toolResult.result.replace(/^\[cached[^\]]*\]\s*/, "");
            const uiResultText = cacheStripped;

            // Build resultDetail for enriched UI display
            let resultDetail: string | undefined;
            if (!isError) {
              if (tc.name === "search_files") {
                // Extract match count from output like "15 matches in 4 files"
                const matchCount = (toolResult.result.match(/(\d+)\s+match/)?.[1]) || undefined;
                const fileCount = (toolResult.result.match(/in\s+(\d+)\s+files?/)?.[1]) || undefined;
                if (matchCount) {
                  resultDetail = `${matchCount} matches${fileCount ? ` in ${fileCount} files` : ""}`;
                } else if (toolResult.result.includes("(no matches)")) {
                  resultDetail = "0 matches";
                }
              } else if (tc.name === "read_file") {
                // Always show line range so user knows exactly what was read
                const lineCount = toolResult.result.split("\n").length;
                const filePath = (toolArgs.path as string) || "";
                if (toolArgs.startLine) {
                  const endLine = toolArgs.endLine || (Number(toolArgs.startLine) + lineCount - 1);
                  resultDetail = `${filePath} lines ${toolArgs.startLine}–${endLine}`;
                } else {
                  resultDetail = `${filePath} lines 1–${lineCount}`;
                }
              } else if (tc.name === "edit_file") {
                const edits = toolArgs.edits as Array<{ oldText?: string; newText?: string }> | undefined;
                if (Array.isArray(edits)) {
                  const added = edits.reduce((s, e) => s + ((e.newText || "").split("\n").length), 0);
                  const removed = edits.reduce((s, e) => s + ((e.oldText || "").split("\n").length), 0);
                  resultDetail = `+${added} -${removed}`;
                }
              } else if (tc.name === "list_files") {
                // Count entries returned
                const lines = toolResult.result.split("\n").filter(Boolean);
                resultDetail = lines.length > 0 ? `${lines.length} item${lines.length !== 1 ? "s" : ""}` : "empty";
              } else if (tc.name === "list_gateways") {
                // Count gateways and show their names
                const lines = uiResultText === "(no gateways configured)"
                  ? []
                  : uiResultText.split("\n").filter(Boolean);
                if (lines.length === 0) {
                  resultDetail = "none configured";
                } else {
                  const names = lines.slice(0, 3).map(l => l.replace(/^-\s*/, "").split(" (")[0]);
                  resultDetail = `${lines.length} found: ${names.join(", ")}${lines.length > 3 ? "…" : ""}`;
                }
              } else if (tc.name === "list_user_plugins") {
                const lines = uiResultText === "(no plugins installed)"
                  ? []
                  : uiResultText.split("\n").filter(Boolean);
                if (lines.length === 0) {
                  resultDetail = "none installed";
                } else {
                  // Format: "- Name (slug: ..., enabled: ..., gateway: GW) [...]"
                  const entries = lines.slice(0, 3).map(l => {
                    const name = l.replace(/^-\s*/, "").split(" (")[0];
                    const gwMatch = l.match(/gateway:\s*([^,)\]]+)/);
                    const gw = gwMatch?.[1]?.trim() ?? null;
                    return gw && gw !== "none" ? `${name} (${gw})` : name;
                  });
                  resultDetail = `${lines.length} plugin${lines.length !== 1 ? "s" : ""}: ${entries.join(", ")}${lines.length > 3 ? "…" : ""}`;
                }
              } else if (tc.name === "view_plugin_logs") {
                // Skip JSON-bracket / brace lines and any line that's just punctuation —
                // they leak through when the bridge returns structured-but-empty output
                // (e.g. "{ logs: [] }" stringified). Pick the most recent meaningful line.
                const isMeaningful = (line: string): boolean => {
                  const trimmed = line.trim();
                  if (!trimmed) return false;
                  // Drop bare JSON delimiters: ], }, [, {, ",", "]" with comma, etc.
                  if (/^[\[\]{}(),"\s]+$/.test(trimmed)) return false;
                  return true;
                };
                const logLines = toolResult.result.split("\n").map(l => l.trim()).filter(isMeaningful);
                if (logLines.length === 0) {
                  resultDetail = "no log entries";
                } else {
                  const lastLine = logLines[logLines.length - 1] ?? "";
                  const hasError = /error|fail|crash|exception/i.test(toolResult.result);
                  if (hasError) {
                    const errLine = logLines.find(l => /error|fail|crash|exception/i.test(l)) ?? lastLine;
                    resultDetail = `⚠ ${errLine.slice(0, 80)}`;
                  } else {
                    resultDetail = `${logLines.length} line${logLines.length !== 1 ? "s" : ""} · ${lastLine.slice(0, 60)}`;
                  }
                }
              } else if (tc.name === "get_workspace_status") {
                // Result like "Workspace: RUNNING [ID: ...], RAM: 512MB, ..."
                const statusMatch = toolResult.result.match(/Workspace:\s*(\w+)/);
                const pluginsMatch = toolResult.result.match(/Plugins running:\s*(\d+)/);
                if (statusMatch) {
                  const status = statusMatch[1];
                  resultDetail = pluginsMatch
                    ? `${status} · ${pluginsMatch[1]} plugin${pluginsMatch[1] === "1" ? "" : "s"} running`
                    : status;
                } else if (toolResult.result.includes("No workspace")) {
                  resultDetail = "no workspace";
                }
              } else if (tc.name === "start_workspace" || tc.name === "restart_workspace") {
                if (/already running/i.test(toolResult.result)) resultDetail = "already running";
                else if (/started|created and starting|restarted/i.test(toolResult.result)) resultDetail = "started";
              } else if (tc.name === "write_file") {
                // Result is always "Created: path (N bytes)" now (overwrites are blocked)
                const filePath = (toolArgs.path as string ?? "").split("/").pop() || (toolArgs.path as string);
                resultDetail = `Created: ${filePath}`;
              } else if (tc.name === "delete_file") {
                const filePath = (toolArgs.path as string ?? "").split("/").pop() || (toolArgs.path as string);
                resultDetail = filePath;
              } else if (tc.name === "create_gateway") {
                const idMatch = toolResult.result.match(/\[ID:\s*([^\]]+)\]/);
                resultDetail = idMatch ? `Created — ID: ${idMatch[1]}` : "Created";
              } else if (tc.name === "install_plugin") {
                const nameMatch = toolResult.result.match(/Plugin "([^"]+)" installed/);
                resultDetail = nameMatch ? `Installed: ${nameMatch[1]}` : "Installed";
              } else if (tc.name === "check_credits") {
                const balMatch = toolResult.result.match(/(\d+)\s+credits remaining/);
                resultDetail = balMatch ? `${balMatch[1]} credits remaining` : undefined;
              } else if (tc.name === "find_relevant_code") {
                const hitCount = (toolResult.result.match(/\n/g) || []).length;
                resultDetail = hitCount > 0 ? `${hitCount + 1} result${hitCount > 0 ? "s" : ""}` : "no results";
              } else if (tc.name === "workspace_summary") {
                const pluginMatch = toolResult.result.match(/(\d+)\s+plugin/);
                const fileMatch = toolResult.result.match(/(\d+)\s+file/);
                const parts = [];
                if (pluginMatch) parts.push(`${pluginMatch[1]} plugins`);
                if (fileMatch) parts.push(`${fileMatch[1]} files`);
                if (parts.length) resultDetail = parts.join(", ");
              } else if (tc.name === "file_stat") {
                const linesMatch = toolResult.result.match(/(\d+)\s+lines?/i);
                const bytesMatch = toolResult.result.match(/(\d+)\s+bytes?/i);
                if (linesMatch) resultDetail = `${linesMatch[1]} lines`;
                else if (bytesMatch) resultDetail = `${bytesMatch[1]} bytes`;
              } else if (tc.name === "validate_plugin") {
                const passed = toolResult.result.includes("PASSED") && !toolResult.result.includes("FAILED");
                resultDetail = passed ? "✅ PASSED" : "❌ FAILED";
              } else if (tc.name === "create_plugin_record") {
                const idMatch = toolResult.result.match(/\[ID:\s*([^\]]+)/);
                const slugMatch = toolResult.result.match(/slug:\s*([^\]]+)\]/);
                if (idMatch) resultDetail = `ID: ${idMatch[1]}${slugMatch ? `, slug: ${slugMatch[1]}` : ""}`;
              } else if (tc.name === "restart_plugin") {
                const hasError = /error|fail/i.test(toolResult.result);
                resultDetail = hasError ? "⚠ errors in logs" : "started ✓";
              }
            }

            yield {
              type: "tool_result" as const,
              tool: tc.name,
              success: !isError,
              summary: toolResult.result.slice(0, 200),
              ...(resultDetail ? { resultDetail } : {}),
              ...(toolResult.snippet ? { snippet: toolResult.snippet } : {}),
              ...(toolResult.patch ? { patch: toolResult.patch } : {}),
            };

            // Emit terminal_output for inline display (run_command, validate_plugin)
            if (toolResult.terminalOutput) {
              yield {
                type: "terminal_output" as const,
                command: toolResult.terminalOutput.command,
                output: toolResult.terminalOutput.output,
                exitCode: toolResult.terminalOutput.exitCode,
                cwd: toolResult.terminalOutput.cwd,
              };
            }

            // Emit todo_update event when update_plan is called
            if (tc.name === "update_plan" && !isError) {
              const items = toolArgs.items as Array<{ id: string; title: string; status: "pending" | "in_progress" | "done" }> | undefined;
              const planMarkdown = typeof toolArgs.summary === "string" && toolArgs.summary.length > 0 ? toolArgs.summary : undefined;
              if (Array.isArray(items)) {
                // Sync runner-state plan (used by finish guard)
                activePlanItems = items.map((it) => ({
                  id: String(it.id),
                  title: String(it.title),
                  status: (["pending", "in_progress", "done"].includes(it.status) ? it.status : "pending") as "pending" | "in_progress" | "done",
                }));
                yield {
                  type: "todo_update" as const,
                  items: activePlanItems,
                  ...(planMarkdown ? { planMarkdown } : {}),
                };
              }
            }

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

            // Emit file_action for undo support (write_file, edit_file, delete_file)
            if ((tc.name === "write_file" || tc.name === "edit_file" || tc.name === "delete_file") && !isError) {
              const filePath = (toolArgs.path as string) || "";
              const content = tc.name === "write_file" ? ((toolArgs.content as string) || "") : "";
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

            // Emit diff_preview after edit_file so the user sees what changed
            if (tc.name === "edit_file" && !isError) {
              const filePath = (toolArgs.path as string) || "";
              const relativePath = filePath.startsWith(pluginDir + "/")
                ? filePath.slice(pluginDir.length + 1)
                : filePath;
              const edits = toolArgs.edits as Array<{ search: string; replace: string }> | undefined;
              const editCount = Array.isArray(edits) ? edits.length : 0;
              // Build a simple unified-diff-style patch from the search/replace pairs
              let patch = `--- ${relativePath}\n+++ ${relativePath}\n`;
              if (Array.isArray(edits)) {
                for (const edit of edits.slice(0, 5)) {
                  const searchLines = (edit.search || "").split("\n").slice(0, 8);
                  const replaceLines = (edit.replace || "").split("\n").slice(0, 8);
                  for (const l of searchLines) patch += `- ${l}\n`;
                  for (const l of replaceLines) patch += `+ ${l}\n`;
                  if ((edit.search || "").split("\n").length > 8 || (edit.replace || "").split("\n").length > 8) {
                    patch += `  ... (truncated)\n`;
                  }
                }
              }
              // Track cumulative diff stats
              if (Array.isArray(edits)) {
                for (const edit of edits) {
                  totalLinesRemoved += (edit.search || "").split("\n").length;
                  totalLinesAdded += (edit.replace || "").split("\n").length;
                }
              }
              if (!changedFilePaths.has(filePath)) {
                changedFilePaths.add(filePath);
                totalFilesChanged++;
              }
              yield {
                type: "diff_preview" as const,
                file: relativePath,
                patch,
                editCount,
                totalAdded: totalLinesAdded,
                totalRemoved: totalLinesRemoved,
                totalFiles: totalFilesChanged,
              };
            }

            // Track cumulative diff stats for write_file
            if (tc.name === "write_file" && !isError) {
              const filePath = (toolArgs.path as string) || "";
              const content = (toolArgs.content as string) || "";
              totalLinesAdded += content.split("\n").length;
              if (!changedFilePaths.has(filePath)) {
                changedFilePaths.add(filePath);
                totalFilesChanged++;
              }
            }

            // Track plugin creation
            if (tc.name === "create_plugin_record" && toolResult.finishData?.pluginId) {
              pluginId = toolResult.finishData.pluginId;
            }

            // Track workflow step addition
            if (tc.name === "add_workflow_step") {
              if (!isError) {
                addedToWorkflow = true;
              } else if (toolResult.result?.toLowerCase().includes("already")) {
                // Plugin is already in the workflow — treat as success so finish guard passes
                addedToWorkflow = true;
                slog.info({ pluginId }, "add_workflow_step reported already-in-workflow — marking addedToWorkflow=true");
              }
              if (!isError) {
              // If plan items still pending, remind the AI to continue building
              const pendingAfterWorkflow = activePlanItems.filter((it) => it.status !== "done");
              if (activePlanItems.length >= 3 && pendingAfterWorkflow.length > 0) {
                const pendingList = pendingAfterWorkflow.slice(0, 5).map((it) => `- ${it.title}`).join("\n");
                messages.push({
                  role: "user",
                  content: `[ℹ️ SYSTEM] Plugin added to the workflow canvas. However, you still have ${pendingAfterWorkflow.length} unfinished plan step${pendingAfterWorkflow.length === 1 ? "" : "s"}:\n${pendingList}${pendingAfterWorkflow.length > 5 ? `\n...and ${pendingAfterWorkflow.length - 5} more` : ""}\n\nDo NOT call finish yet. Continue building these remaining steps.`,
                });
                slog.info({ pendingCount: pendingAfterWorkflow.length }, "add_workflow_step succeeded but plan has pending items — injecting continue prompt");
              }
              } // end if (!isError)
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
            let resultContent = `[${statusPrefix}: ${tc.name}]\n${toolResult.result}`;

            // ── Forced verification: track edits and inject reminder ──
            if ((tc.name === "write_file" || tc.name === "edit_file") && !isError && currentWorker === "coder") {
              unverifiedEditPath = (toolArgs.path as string) || null;
              resultContent += `\n\n⚠️ VERIFY: Run \`run_command\` with \`node --check ${unverifiedEditPath || "<file>"}\` or appropriate validation before proceeding.`;
            }
            // Clear verification flag when agent runs a validation command
            if (tc.name === "run_command" && !isError) {
              const cmd = (toolArgs.command as string) || "";
              if (/node\s+--check|validate_plugin|eslint|tsc|mypy|pytest|cargo\s+check/i.test(cmd)) {
                unverifiedEditPath = null;
              }
            }
            if (tc.name === "validate_plugin" && !isError) {
              unverifiedEditPath = null;
            }

            messages.push({ role: "user", content: resultContent });

            // ── Search loop detection (sequential path) ──
            if (SEARCH_TOOLS.has(tc.name)) {
              recentSearchCalls.push({ tool: tc.name, pattern: String(toolArgs.pattern || toolArgs.query || "") });
              if (recentSearchCalls.length >= MAX_CONSECUTIVE_SEARCHES) {
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] You have called search tools ${recentSearchCalls.length} times in a row without reading or editing any files. STOP searching. Use get_file_outline or read_file on the files you already found, then proceed to implementation. Repeated searching wastes credits.`,
                });
                slog.warn({ count: recentSearchCalls.length, searches: recentSearchCalls }, "Search loop detected — injecting corrective prompt");
                recentSearchCalls.length = 0;
              }
            } else {
              recentSearchCalls.length = 0;
            }

            // ── list_files loop detection (sequential path) ──
            if (tc.name === "list_files") {
              const listPath = String(toolArgs.path || ".");
              listFilesCallCounts.set(listPath, (listFilesCallCounts.get(listPath) || 0) + 1);
              const repeatCount = listFilesCallCounts.get(listPath)!;
              if (repeatCount >= MAX_LIST_FILES_REPEATS) {
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] You have called list_files("${listPath}") ${repeatCount} times without making progress. STOP listing this directory. If you cannot find the files you need:\n- Try a different subdirectory you haven't explored yet\n- Use read_file with the full path on a file you already saw listed\n- If the user mentioned a repository but none is attached, call ask_user to request the GitHub URL\n- Do NOT call list_files on the same path again.`,
                });
                slog.warn({ listPath, repeatCount, worker: currentWorker }, "list_files loop detected — injecting corrective prompt");
                listFilesCallCounts.delete(listPath);
              }
            } else if (!READ_ONLY_TOOLS.has(tc.name)) {
              listFilesCallCounts.clear(); // Reset on any write/mutation tool
            }

            // ── read_file loop detection (sequential path) ──
            if (tc.name === "read_file") {
              const readKey = `${String(toolArgs.path || "")}:${String(toolArgs.startLine || "")}`;
              readFileCallCounts.set(readKey, (readFileCallCounts.get(readKey) || 0) + 1);
              const repeatCount = readFileCallCounts.get(readKey)!;
              // Escalating warnings without resetting count: 3, 5, 8.
              // At 10+, hard-abort the run — the model is stuck.
              if (repeatCount === MAX_READ_FILE_REPEATS || repeatCount === 5 || repeatCount === 8) {
                const filePath = readKey.split(":")[0] ?? readKey;
                const severity = repeatCount >= 8 ? "🛑 FINAL WARNING" : repeatCount >= 5 ? "⚠️ ESCALATING" : "⚠️ SYSTEM";
                messages.push({
                  role: "user",
                  content: `[${severity}] You have read "${filePath}" ${repeatCount} times without making any changes. STOP re-reading it. You already have this file's content — proceed to implement the fix:\n- Use edit_file or write_file to apply the change\n- If the file needs a different range, read a DIFFERENT section, not the same one\n- Do NOT call read_file on the same path+range again until you have made an edit.\n${repeatCount >= 8 ? "\nIf you call read_file on this same path+range one more time, the run will be aborted." : ""}`,
                });
                slog.warn({ filePath, repeatCount, worker: currentWorker }, "read_file loop detected — injecting corrective prompt");
              }
              if (repeatCount >= 10) {
                slog.error({ filePath: readKey, repeatCount, worker: currentWorker }, "read_file loop hard-stop — aborting run");
                abnormalStopReason = `Stuck in read_file loop on "${readKey.split(":")[0]}" (${repeatCount} repeats). Aborting to save credits.`;
              }
            } else if (!READ_ONLY_TOOLS.has(tc.name)) {
              readFileCallCounts.clear(); // Reset on any write/mutation tool
            }

            // ── State-query loop detection (sequential path) ──
            if (STATE_QUERY_TOOLS.has(tc.name)) {
              stateQueryCallCounts.set(tc.name, (stateQueryCallCounts.get(tc.name) || 0) + 1);
              const sqCount = stateQueryCallCounts.get(tc.name)!;
              if (sqCount >= MAX_STATE_QUERY_REPEATS) {
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] You have called "${tc.name}" ${sqCount} times and received the same result each time. STOP calling it again — the result will not change. Act on the information you already have:\n- If the item you were looking for is NOT in the list, it does not exist — tell the user\n- If it IS in the list, use the ID/slug you received and proceed\n- Do NOT call "${tc.name}" again until you have performed a create/install/modify action.`,
                });
                slog.warn({ tool: tc.name, sqCount, worker: currentWorker }, "State-query loop detected — injecting corrective prompt");
                stateQueryCallCounts.delete(tc.name);
              }
            } else if (!READ_ONLY_TOOLS.has(tc.name)) {
              stateQueryCallCounts.clear(); // Reset when agent acts on something
            }

            // ── view_plugin_logs loop detection (sequential path) ──
            if (tc.name === "view_plugin_logs") {
              const slugKey = String(toolArgs.pluginSlug || toolArgs.entryFile || "default");
              viewLogsCallCounts.set(slugKey, (viewLogsCallCounts.get(slugKey) || 0) + 1);
              const vlCount = viewLogsCallCounts.get(slugKey)!;
              if (vlCount >= MAX_VIEW_LOGS_REPEATS) {
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] You have called view_plugin_logs for "${slugKey}" ${vlCount} times. STOP fetching logs. You have the logs you need — proceed:\n- If logs show an error, FIX it (edit code, restart plugin, etc.)\n- If logs are empty, the plugin produced no output — DO NOT keep checking; describe this to the user\n- If logs look normal, the plugin is working — report success to the user\n- Do NOT call view_plugin_logs again until you have made a change to the plugin.`,
                });
                slog.warn({ slugKey, vlCount, worker: currentWorker }, "view_plugin_logs loop detected — injecting corrective prompt");
                viewLogsCallCounts.delete(slugKey);
              }
            } else if (!READ_ONLY_TOOLS.has(tc.name)) {
              viewLogsCallCounts.clear();
            }

            // ── Failed mutation retry detection (sequential path) ──
            if (MUTATION_TOOLS.has(tc.name)) {
              if (isError) {
                const mutKey = `${tc.name}:${JSON.stringify(toolArgs)}`;
                failedMutationCounts.set(mutKey, (failedMutationCounts.get(mutKey) || 0) + 1);
                const mutCount = failedMutationCounts.get(mutKey)!;
                if (mutCount >= MAX_MUTATION_FAILURES) {
                  messages.push({
                    role: "user",
                    content: `[⚠️ SYSTEM] "${tc.name}" has failed ${mutCount} times with the same arguments. STOP retrying it — retrying will not fix the error. Tell the user clearly what happened and ask what they would like to do instead.`,
                  });
                  slog.warn({ tool: tc.name, mutCount, args: toolArgs, worker: currentWorker }, "Failed mutation loop detected — injecting corrective prompt");
                  failedMutationCounts.delete(mutKey);
                }
              } else {
                failedMutationCounts.clear(); // Successful mutation resets
              }
            }

            // ── Consecutive tool error detection (sequential path) ──
            if (isError) {
              consecutiveToolErrors++;
              if (consecutiveToolErrors >= MAX_CONSECUTIVE_TOOL_ERRORS) {
                slog.warn({ consecutiveToolErrors, worker: currentWorker, lastTool: tc.name }, "Too many consecutive tool errors — workspace may be unreachable");
                messages.push({
                  role: "user",
                  content: `[⚠️ SYSTEM] ${consecutiveToolErrors} consecutive tool calls have failed. The workspace or file system may be unreachable. STOP retrying the same operations. Report the issue to the user clearly: explain what you were trying to do and that the workspace tools are not responding. Do NOT call list_files, create_directory, or read_file again — they will continue to fail.`,
                });
                consecutiveToolErrors = 0;
              }
            } else {
              consecutiveToolErrors = 0;
            }

            // Handle finish — block if unverified edits remain or plugin not registered
            if (toolResult.finished) {
              if (unverifiedEditPath && currentWorker === "coder") {
                // Don't finish — inject warning and let agent verify first
                messages.push({
                  role: "user",
                  content: `[⚠️ BLOCKED] You have unverified file changes (${unverifiedEditPath}). Run \`node --check\` or appropriate validation before calling finish.`,
                });
                slog.info({ unverifiedEditPath }, "Finish blocked: unverified edits");
                // Don't break — let the loop continue so agent can verify
              } else if (
                currentWorker === "coder" &&
                pluginMode === "create" &&
                !pluginId &&
                Object.keys(writtenFiles).length > 0
              ) {
                // Plugin files written but not registered — block finish
                messages.push({
                  role: "user",
                  content: `[⚠️ BLOCKED] You wrote plugin files but never called create_plugin_record. The plugin won't appear until it's registered. Call create_plugin_record now with the correct slug, name, and entry file, then call finish again.`,
                });
                slog.info({ pluginSlug, filesWritten: Object.keys(writtenFiles).length }, "Finish blocked: plugin not registered");
              } else if (
                currentWorker === "coder" &&
                effectiveHasWorkflowContext &&
                pluginId &&
                !addedToWorkflow
              ) {
                // Plugin created/updated but not added to the active workflow canvas
                messages.push({
                  role: "user",
                  content: `[⚠️ BLOCKED] A workflow is active but you never called add_workflow_step to add the plugin to the canvas. Call add_workflow_step with pluginId "${pluginId}" and order 0 (or the appropriate position), then call finish again.`,
                });
                slog.info({ pluginId, pluginSlug }, "Finish blocked: plugin not added to workflow canvas");
              } else if (
                currentWorker === "coder" &&
                activePlanItems.length >= 3
              ) {
                // Check if there are uncompleted plan steps
                const pendingPlanItems = activePlanItems.filter((it) => it.status !== "done");
                if (pendingPlanItems.length > 0) {
                  const pendingList = pendingPlanItems.slice(0, 5).map((it) => `- ${it.title}`).join("\n");
                  messages.push({
                    role: "user",
                    content: `[⚠️ BLOCKED] You cannot finish yet — ${pendingPlanItems.length} plan step${pendingPlanItems.length === 1 ? "" : "s"} ${pendingPlanItems.length === 1 ? "is" : "are"} still pending:\n${pendingList}${pendingPlanItems.length > 5 ? `\n...and ${pendingPlanItems.length - 5} more` : ""}\n\nComplete these steps first, then call update_plan to mark them done, then call finish.`,
                  });
                  slog.info({ pendingCount: pendingPlanItems.length, worker: currentWorker }, "Finish blocked: pending plan items");
                } else {
                  workerFinished = true;
                  finishSummary = toolResult.finishData?.summary;
                  break;
                }
              } else {
                workerFinished = true;
                finishSummary = toolResult.finishData?.summary;
                break;
              }
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
          const errorMsg = (err as Error).message || String(err);
          const errLower = errorMsg.toLowerCase();

          // ── Rate-limit (429): back off without burning consecutive-error budget ──
          // Match common variants: "rate limit", "rate_limit", "ratelimit", "rate-limit",
          // bare HTTP 429, "too many requests", "throttle/throttling", "quota exceeded"
          const isRateLimitErr = (
            /rate[\s_-]?limit|429|too many requests|throttl|quota exceeded|overloaded/i.test(errorMsg)
          );
          if (isRateLimitErr) {
            slog.warn(
              { worker: currentWorker, turn, errorMsg: errorMsg.slice(0, 200), priorCount: consecutiveErrors },
              "Provider rate-limited (429); backing off 10 s before retry",
            );
            yield { type: "status" as const, message: "Provider rate-limited — waiting 10 seconds before retry…" };
            await new Promise<void>((r) => setTimeout(r, 10_000));
            messages.push({
              role: "user",
              content: "[⚠️ SYSTEM ERROR] The AI provider was temporarily rate-limited. Continue exactly where you left off — do NOT restart or repeat tool calls you already completed.",
            });
            // Reset consecutive errors — rate limits are transient infrastructure noise
            // and unrelated to any prior model/tool errors that may be in the count.
            consecutiveErrors = 0;
            // fall through to next loop iteration naturally
          } else {
          consecutiveErrors++;
          slog.error(
            { worker: currentWorker, turn, error: errorMsg, consecutiveErrors },
            "Worker loop error",
          );

          // Model unavailable → ask user before switching to fallback
          if (
            (errLower.includes("unavailable") || errLower.includes("not available") || errLower.includes("not found") || errLower.includes("404")) &&
            effectiveModelId !== "auto"
          ) {
            const failedModelName = originalModelDisplay ?? effectiveModelId ?? "unknown";
            slog.warn(
              { worker: currentWorker, failedModel: effectiveModelId },
              "Model unavailable — asking user before fallback",
            );

            // Ask user for consent before switching models (uses same mechanism as terminal_confirm)
            yield {
              type: "model_confirm" as const,
              sessionId,
              failedModel: failedModelName,
            };

            let userAccepted = false;
            try {
              const answer = await waitForUserAnswer(sessionId, userId, 300_000);
              userAccepted = answer === "__model_fallback_accept__";
            } catch {
              userAccepted = false; // Timeout → treat as cancel
            }

            if (userAccepted) {
              effectiveModelId = "auto";
              // Don't count this as a consecutive error since the user approved retry
              consecutiveErrors = Math.max(0, consecutiveErrors - 1);
            } else {
              finishSummary = `Stopped: ${failedModelName} is unavailable and fallback was declined.`;
              abnormalStopReason = "model_unavailable";
              yield { type: "status" as const, message: finishSummary };
              break;
            }
          }

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            finishSummary = `Stopped after ${consecutiveErrors} consecutive errors. The last error: ${errorMsg.slice(0, 200)}`;
            abnormalStopReason = "consecutive_errors";
            yield {
              type: "status" as const,
              message: `Too many consecutive errors (${consecutiveErrors}). Stopping.`,
            };
            break;
          }

          // Provide actionable context to the LLM based on error type
          let recovery: string;
          if (errLower.includes("timeout") || errLower.includes("econnreset")) {
            recovery = "Network timeout occurred. The request will be retried automatically.";
          } else if (errLower.includes("credit") || errLower.includes("insufficient")) {
            const filesWritten = Object.keys(writtenFiles).length;
            recovery = filesWritten > 0
              ? `Insufficient credits to continue. ${filesWritten} file(s) were saved. Please add credits and try again.`
              : "Insufficient credits to continue. Please add credits and try again.";
            finishSummary = recovery;
            yield { type: "status" as const, message: recovery };
            break; // Credits won't magically appear — stop immediately
          } else if (errLower.includes("unavailable") || errLower.includes("not available")) {
            recovery = "The selected model is temporarily unavailable. Retrying with a different model.";
          } else {
            recovery = `An error occurred: ${errorMsg}. Try a different approach or simpler tool call.`;
          }

          messages.push({
            role: "user",
            content: `[⚠️ SYSTEM ERROR] ${recovery}`,
          });
          } // end else (non-rate-limit errors)
        }
      }

      // ── After worker loop ──────────────────────────────

      // Hand-off to another worker
      if (handOff) {
        // derive the post-handoff display name from the fallback
        // agent for the target runtime. The legacy `Cursor Coder` /
        // `Cursor Assistant` strings are gone from user-visible events.
        const nextAgent = requestedAgent ?? getFallbackAgent(handOff.workerType);
        const toDisplayName = nextAgent.frontmatter.displayName
          ?? nextAgent.frontmatter.name;
        yield {
          type: "worker_switch" as const,
          fromWorker: currentWorker,
          toWorker: handOff.workerType,
          toDisplayName,
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
        // re-derive execution config so the new worker's defaults
        // (temperature, lite-routing, etc.) take effect. Per-agent overrides
        // come from the original request agent — when a request is bound to
        // a declarative agent we don't reset the agentConfig because the
        // agent owns the run end-to-end (legacy hand-offs are going away).
        if (!requestedAgent) {
          // Preserve any session-scoped credit/iteration bumps that already
          // landed on agentConfig (repo budget, resume credit grant).
          const fresh = defaultConfigForRuntime(currentWorker);
          agentConfig = {
            ...fresh,
            maxCreditsPerSession: agentConfig.maxCreditsPerSession,
            maxIterations: agentConfig.maxIterations,
          };
          // also swap the active agent so the new worker's prompt
          // body (assistant ↔ coder) takes effect from the next iteration.
          activeAgent = getFallbackAgent(currentWorker);
        }
        handOffContext = buildHandOffContext(handOff.context, writtenFiles, messages);
        handOffCount++;
        handOff = undefined;
        continue; // Start next worker
      }

      // Worker finished (or ran out of iterations)
      break;
    }
    } // end if (!finishSummary)
  } finally {
    // Cancel any pending ask_user (destructive-action approvals still use in-memory Promise)
    cancelPendingAnswer(sessionId);
    // Clean up correction queue
    cleanupCorrections(sessionId);
    // Release session ownership in Redis (kept while suspended so cross-replica
    // resume can find the session, otherwise drop immediately)
    if (!sessionSuspended) {
      void unregisterSessionRedis(sessionId);
    } else {
      void touchSessionRedis(sessionId);
    }
    // Clean up session file read cache
    for (const key of fileReadCache.keys()) {
      if (key.startsWith(`${sessionId}::`)) fileReadCache.delete(key);
    }

    // ── MCP: teardown servers ──
    if (!sessionSuspended) {
      await teardownMCPServers(sessionId, client).catch(() => {});
    }

    // Always clean up cloned repo directory (even on suspend — it's on the
    // workspace container's disk and can be re-cloned if the session resumes)
    if (repoCloneDir && client) {
      try {
        await client.fileDelete(repoCloneDir);
        slog.debug({ repoCloneDir }, "Cleaned up cloned repo directory");
      } catch {
        slog.warn({ repoCloneDir }, "Failed to cleanup cloned repo directory");
      }
    }

    if (sessionSuspended) {
      // Session was suspended (ask_user) — don't mark complete.
      // State is saved to DB; the user will resume later.
      slog.info(
        { iterations: totalIterations, creditsUsed: totalCreditsUsed },
        "⏸️ Worker stream suspended (state saved to DB)",
      );
    } else {
      // Normal completion — cleanup and persist

      // ── Workspace Plugin Discovery ──
      // Scan the workspace for plugin directories that aren't registered in DB.
      // This catches: AI forgot create_plugin_record, user uploaded files manually,
      // or any other case where files exist but DB record is missing.
      const hasClient = !!client;
      const filesCount = Object.keys(writtenFiles).length;
      slog.info({ hasClient, filesCount, pluginId }, "Plugin discovery check");
      if (client && filesCount > 0) {
        try {
          const { pluginWorkspaceSyncService } = await import("@/modules/plugin/plugin-workspace-sync.service");
          const discovered = await pluginWorkspaceSyncService.discoverAndRegisterPlugins(
            client, userId, organizationId, slog, request.userPlan,
          );
          if (discovered.length > 0 && !pluginId) {
            // If we got a match for the current plugin slug, use it
            // Use catalogPluginId (catalog Plugin.id) — NOT userPluginId (UserPlugin installation id)
            // because WorkflowStep.pluginId expects catalog Plugin.id
            const match = discovered.find(d => d.slug === pluginSlug);
            pluginId = match?.catalogPluginId ?? discovered[0]?.catalogPluginId;
          }
        } catch (err) {
          slog.warn({ error: (err as Error).message }, "Plugin discovery failed (non-fatal)");
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

      // ── Extract cross-session preferences (fire-and-forget) ──
      import("./cursor-preferences.service")
        .then((svc) =>
          svc.extractPreferencesFromSession(userId, {
            prompt: message,
            filesWritten: Object.keys(writtenFiles),
            pluginSlug: request.pluginSlug,
            mode: request.mode,
          }),
        )
        .catch(() => {});

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

    // Builder agent emits a `<buildspec>...</buildspec>` block
    // inside its finish summary. Extract it and yield a `buildspec` SSE event
    // so the chat surface can render an Apply card. Validation happens
    // client-side (POST /ai-builder/validate) before apply.
    if (requestedAgent?.frontmatter.name === "builder") {
      try {
        const { extractBuildSpec } = await import("./buildspec-extract");
        const extracted = extractBuildSpec(finishSummary || lastAssistantText);
        if (extracted) {
          yield {
            type: "buildspec" as const,
            spec: extracted.spec,
            summary: extracted.summary || undefined,
          };
        }
      } catch (err) {
        slog.warn({ err }, "buildspec extraction failed");
      }
    }

    // Emit declarative agent's post-completion handoff buttons.
    // Replaces the old mid-stream `hand_off_to_coder` / `hand_off_to_assistant`
    // tools — the agent finishes cleanly and the user opts in to the next agent.
    if (requestedAgent?.frontmatter.handoffs && requestedAgent.frontmatter.handoffs.length > 0) {
      yield {
        type: "handoffs" as const,
        fromAgent: requestedAgent.frontmatter.name,
        options: requestedAgent.frontmatter.handoffs.map((h) => ({
          label: h.label,
          agent: h.agent,
          prompt: h.prompt,
        })),
      };
    }

    yield {
      type: "done" as const,
      success: !abnormalStopReason,
      stopReason: abnormalStopReason,
      sessionId,
      pluginName: pluginName || "",
      pluginSlug: pluginSlug || "",
      pluginId,
      summary: finishSummary || lastAssistantText || (hasFiles ? "Files created/updated" : "Done"),
      fileCount: Object.keys(writtenFiles).length,
      filesWritten: Object.keys(writtenFiles),
      fileList: Object.keys(writtenFiles).map((f) => f.split("/").pop() || f).join(", "),
      creditsUsed: totalCreditsUsed,
      modelUsed: lastModelUsed || undefined,
      durationMs,
      entry: "index.js",
      totalLinesAdded,
      totalLinesRemoved,
    };
  }
}

// =============================================================================
// Test-only exports — internal helpers exposed for unit tests under
// `src/modules/cursor/__tests__`. Do NOT import these from production code.
// =============================================================================
export const __testables = {
  locateClosestMatch,
  renderLineWindow,
  findAllOccurrenceLines,
  snapshotFileReadCache,
  restoreFileReadCache,
  getCachedFileRead,
  setCachedFileRead,
  /** Greeting regex used by runWorkerStream's short-circuit. Mirror, not source. */
  greetingPattern: /^(hi+|hey+|hello+|yo+|sup|ok+|okay|thanks?|thank you|cool|nice|great|👋|wassup|good morning|good afternoon|good evening)\b[\s.!,]*$/i,
  /** Diagnosis claim pattern used in the main loop. Mirror, not source. */
  diagnosisPattern: /(found it|i (?:see|found) the (?:issue|problem|bug)|the (?:problem|bug|issue) is|that['']?s why|root cause is)/i,
};

