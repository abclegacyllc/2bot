/**
 * Cursor Workers — Multi-Agent Worker Definitions
 *
 * Defines the two specialized workers that power the Cursor:
 *
 * 1. **Cursor Assistant** — Platform guide, navigator, general helper.
 *    Handles credits, billing, gateways, plugin install/uninstall,
 *    workspace management, page navigation, and general chat.
 *    When the user needs code work, hands off to Cursor Coder.
 *
 * 2. **Cursor Coder** — Senior plugin developer.
 *    Reads, writes, tests, reviews, and deploys plugin code.
 *    Has full workspace filesystem access and terminal.
 *    When the user needs platform help, hands back to Cursor Assistant.
 *
 * Both workers share the same SSE stream and chat panel —
 * the user sees a seamless experience with a header name change.
 *
 * @module modules/cursor/cursor-workers
 */

import type { RepoAnalysis } from "./repo-analyzer.service";

// ===========================================
// Worker Types
// ===========================================

/** The two specialized workers */
export type CursorWorkerType = "assistant" | "coder";

/** Display metadata for each worker */
export interface CursorWorkerMeta {
  /** Worker type key */
  type: CursorWorkerType;
  /** Display name shown in the panel header */
  displayName: string;
  /** Short description */
  description: string;
  /** Max LLM iterations before forced stop */
  maxIterations: number;
  /** Max credits per session */
  maxCreditsPerSession: number;
  /** Session timeout in ms */
  sessionTimeoutMs: number;
}

/** Context passed to the system prompt builder */
export interface WorkerPromptContext {
  /** The user's original message or task description */
  task: string;
  /** For Coder: plugin slug (directory name) */
  pluginSlug?: string;
  /** For Coder: human-readable plugin name */
  pluginName?: string;
  /** For Coder: create vs. edit mode */
  mode?: "create" | "edit" | "analyze-repo";
  /** Context passed from the handing-off worker */
  handOffContext?: string;
  /** Dynamic user state — injected at runtime */
  userState?: {
    plan?: string;
    credits?: number;
    gatewayCount?: number;
    pluginCount?: number;
    workspaceRunning?: boolean;
  };
  /** Repo analysis context — injected when creating a plugin from a GitHub repo */
  repoAnalysis?: RepoAnalysis;
  /** Directory where the repo was cloned (for coder to read source files) */
  repoCloneDir?: string;
  /** Summaries from recent prior sessions with this user */
  priorSessionSummaries?: string[];
  /** Auto-gathered context: file tree + outlines pre-fetched before first LLM call */
  autoContext?: {
    /** List of files in the plugin directory */
    fileTree: string[];
    /** File outlines (function/class signatures) keyed by relative path */
    outlines: Record<string, string>;
    /** package.json content if present */
    packageJson?: string;
    /** Full file contents for small plugins (≤10 files) — richer than outlines */
    fullFileContents?: Record<string, string>;
    /** README.md content if present */
    readme?: string;
  };
  /** Cross-session user preferences (coding style, patterns learned from prior sessions) */
  userPreferences?: string;
  /** Persistent agent memories — freeform notes the agent saved about this user's project */
  agentMemories?: string;
  /** Active chat plan — markdown body produced by the Plan agent via update_plan(summary) */
  chatPlan?: string;
  /**
   * Concrete tool names the active agent can invoke this turn — used by
   * skills to short-circuit advice that references tools the agent does
   * not have. Always populated when called from the agent runtime; may be
   * undefined for legacy code paths that bypass the renderer (in which
   * case skills should treat the absence as "all tools possibly present"
   * to preserve old behaviour).
   */
  toolNames?: ReadonlySet<string>;
  /** Workflow context — present when user is in Studio and interacting with a workflow */
  workflowContext?: {
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
    }>;
  };
}

// ===========================================
// Worker Metadata
// ===========================================

export const WORKER_META: Record<CursorWorkerType, CursorWorkerMeta> = {
  assistant: {
    type: "assistant",
    // `displayName` here is logs-only. User-facing chip pulls
    // displayName from `activeAgent.frontmatter.displayName` instead.
    displayName: "assistant-runtime",
    description: "Platform guide — manages gateways, plugins, billing, navigation",
    maxIterations: 100,     // High ceiling — credits are the real limit, not step count
    maxCreditsPerSession: 10,
    sessionTimeoutMs: 0,    // Unused — wall-clock timeout removed from checkSessionLimits
  },
  coder: {
    type: "coder",
    // see note above. User chip uses the agent's displayName.
    displayName: "coder-runtime",
    description: "Senior developer — creates, edits, tests, and deploys plugin code",
    maxIterations: 100,     // High ceiling — credits are the real limit, not step count
    maxCreditsPerSession: 30,
    sessionTimeoutMs: 0,    // Unused — wall-clock timeout removed from checkSessionLimits
  },
};

/**
 * Get worker meta for the given worker type.
 * Plan-based iteration multipliers removed — credits already differentiate plans
 * and a step count cap only blocks legitimate long-running tasks for free users
 * without providing any additional cost protection.
 */
export function getAdaptiveWorkerMeta(
  workerType: CursorWorkerType,
  plan?: string,
): CursorWorkerMeta {
  void plan; // plan no longer affects iteration limits
  return WORKER_META[workerType];
}

// ===========================================
// Frontend Router — Zero-Cost Heuristic
// ===========================================

/**
 * Instantly route a user message to the right worker.
 *
 * This is a **zero-cost heuristic** — no LLM call, no network.
 * The regex patterns detect code-related requests and route to Coder;
 * everything else goes to Assistant (who can still hand off to Coder
 * if the LLM determines it's needed).
 *
 * When workflowContext is present (Studio mode), workflow-related messages
 * are always routed to Assistant which has workflow mutation tools.
 *
 * This replaces the old `classifyCommand()` which cost 1 LLM call per message.
 */
export function routeToWorker(
  message: string,
  options?: { hasWorkflowContext?: boolean },
): CursorWorkerType {
  const lower = message.toLowerCase();

  // ── Workflow context → force Assistant for workflow ops ──
  if (options?.hasWorkflowContext) {
    if (/\b(step|trigger|workflow|test\s+it|run\s+it|enable|disable|reorder|move)\b/i.test(lower)) {
      return "assistant";
    }
  }

  // ── Code-related → Coder ────────────────────────────
  // "create/build/make/write/prepare a plugin"
  if (/\b(create|build|make|write|develop|prepare)\b.*\bplugin\b/i.test(lower)) return "coder";

  // "edit/change/modify/fix/improve/refactor plugin/code"
  if (/\b(edit|change|modify|fix|improve|update|refactor|tweak|adjust)\b.*\b(plugin|code)\b/i.test(lower)) return "coder";

  // "check/audit/review/analyze plugin/code"
  if (/\b(check|audit|review|analy[zs]e|inspect|look\s*at)\b.*\b(plugin|code|my\s+\w+\s+plugin)\b/i.test(lower)) return "coder";

  // "plugin that does..." (implied create)
  if (/\bplugin\s+that\s+(does|will|can|should|sends?|respond|handle)/i.test(lower)) return "coder";

  // "add a /command to..." or "add feature to..."
  if (/\b(add|remove)\b.+\b(to|from|in)\b.+\bplugin\b/i.test(lower)) return "coder";

  // "analyze repo" / "import from github" / "generate from repo"
  if (/\b(analy[zs]e|import|generate\s+from)\b.*\b(repo|github|repository)\b/i.test(lower)) return "coder";

  // ── Everything else → Assistant ─────────────────────
  // The Assistant LLM is smart enough to hand off to Coder if needed.
  return "assistant";
}

// ===========================================
// System Prompts (composed from skills)
// ===========================================

import { composeWorkerPrompt } from "./cursor-skills";

/**
 * Build the system prompt for Cursor Assistant.
 * Composed from modular skills defined in cursor-skills.ts.
 *
 * @deprecated the runner now resolves prompts via
 * `renderAgentPrompt(activeAgent, ctx)` from `./agents`. The synthesized
 * `legacy-assistant` agent (built from the same skill set) replaces this
 * function. Kept exported for backwards compatibility with external
 * callers; will be removed once no external imports remain.
 */
export function buildAssistantSystemPrompt(ctx: WorkerPromptContext): string {
  return composeWorkerPrompt("assistant", ctx);
}

/**
 * Build the system prompt for Cursor Coder.
 * Composed from modular skills defined in cursor-skills.ts.
 *
 * @deprecated superseded by the declarative `agent` built-in
 * resolved via `renderAgentPrompt`. See note on `buildAssistantSystemPrompt`.
 */
export function buildCoderSystemPrompt(ctx: WorkerPromptContext): string {
  return composeWorkerPrompt("coder", ctx);
}

// ===========================================
// Worker Tool Sets (tool name lists)
// ===========================================

/**
 * Tool names available to each worker type.
 * The actual tool definitions are in cursor-worker-tools.ts.
 */
export const WORKER_TOOL_NAMES: Record<CursorWorkerType, string[]> = {
  assistant: [
    // Platform query tools
    "check_credits",
    "check_billing",
    "check_usage",
    "list_gateways",
    "check_gateway_status",
    "list_user_plugins",
    "list_templates",
    // Platform action tools
    "create_gateway",
    "delete_gateway",
    "update_gateway",
    "install_plugin",
    "uninstall_plugin",
    "toggle_plugin",
    "start_workspace",
    "stop_workspace",
    "restart_workspace",
    "get_workspace_status",
    // Plugin config
    "view_plugin_config",
    // Marketplace
    "search_marketplace",
    // Metrics & logs
    "get_gateway_metrics",
    "get_workspace_logs",
    "get_workspace_metrics",
    // Navigation
    "navigate_page",
    // Interaction
    "ask_user",
    "request_domain_allowlist",
    "list_allowed_domains",
    // Diagnostics
    "explain_error",
    // Reasoning
    "think",
    // Plan tracking
    "update_plan",
    // Memory
    "write_memory",
    "read_memory",
    "delete_memory",
    // Web fetch
    "fetch_url",
    // Hand-off
    "hand_off_to_coder",
  ],
  coder: [
    // Workspace file tools
    "read_file",
    "write_file",
    "edit_file",
    "list_files",
    "create_directory",
    "delete_file",
    "run_command",
    "search_files",
    "file_stat",
    "workspace_summary",
    // AST-powered code intelligence tools
    "get_file_outline",
    "get_outlines",
    "get_function",
    "search_symbols",
    // Semantic codebase search
    "search_codebase",
    // Platform query tools (needed to find gateways/plugins)
    "list_gateways",
    "list_user_plugins",
    // Plugin management tools
    "create_plugin_record",
    "update_plugin_record",
    "restart_plugin",
    "clone_plugin",
    "validate_plugin",
    "ensure_dependencies",
    "find_relevant_code",
    "search_docs",
    // Plugin config
    "view_plugin_config",
    // Diagnostics
    "view_plugin_logs",
    "explain_error",
    // Interaction
    "ask_user",
    "request_domain_allowlist",
    "list_allowed_domains",
    // Reasoning
    "think",
    // Plan tracking
    "update_plan",
    // Memory
    "write_memory",
    "read_memory",
    "delete_memory",
    // Web fetch
    "fetch_url",
    // Hand-off
    "hand_off_to_assistant",
    // Completion
    "finish",
  ],
};

/** Workflow tools added to assistant when workflowContext is present */
export const WORKFLOW_TOOL_NAMES: string[] = [
  "add_workflow_step",
  "remove_workflow_step",
  "update_workflow_step",
  "reorder_workflow_step",
  "toggle_workflow_step",
  "update_workflow_trigger",
  "list_available_plugins",
  "test_workflow",
  "validate_workflow",
  "read_plugin_file",
  "write_plugin_file",
];

/**
 * Read-only / diagnostic tools for Ask mode.
 * Ask mode should be able to look things up and investigate, but never mutate.
 */
export const ASK_MODE_TOOL_NAMES: string[] = [
  // Platform queries
  "check_credits",
  "check_billing",
  "check_usage",
  "list_gateways",
  "check_gateway_status",
  "list_user_plugins",
  "get_workspace_status",
  // Plugin config (read-only)
  "view_plugin_config",
  // Diagnostics & logs
  "get_gateway_metrics",
  "get_workspace_logs",
  "get_workspace_metrics",
  "explain_error",
  // Workflow read-only (when context available)
  "list_available_plugins",
  "read_plugin_file",
  "validate_workflow",
  // File metadata (read-only)
  "file_stat",
  "workspace_summary",
  // Semantic codebase search (read-only in ask mode)
  "search_codebase",
  // Interaction
  "ask_user",
  // Memory (read-only in ask mode)
  "read_memory",
];
