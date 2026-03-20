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
  mode?: "create" | "edit";
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
}

// ===========================================
// Worker Metadata
// ===========================================

export const WORKER_META: Record<CursorWorkerType, CursorWorkerMeta> = {
  assistant: {
    type: "assistant",
    displayName: "Cursor Assistant",
    description: "Platform guide — manages gateways, plugins, billing, navigation",
    maxIterations: 10,
    maxCreditsPerSession: 10,
    sessionTimeoutMs: 60_000, // 1 minute (simple operations)
  },
  coder: {
    type: "coder",
    displayName: "Cursor Coder",
    description: "Senior developer — creates, edits, tests, and deploys plugin code",
    maxIterations: 25,
    maxCreditsPerSession: 30,
    sessionTimeoutMs: 180_000, // 3 minutes (complex coding tasks)
  },
};

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
 * This replaces the old `classifyCommand()` which cost 1 LLM call per message.
 */
export function routeToWorker(message: string): CursorWorkerType {
  const lower = message.toLowerCase();

  // ── Code-related → Coder ────────────────────────────
  // "create/build/make/write a plugin"
  if (/\b(create|build|make|write|develop)\b.*\bplugin\b/i.test(lower)) return "coder";

  // "edit/change/modify/fix/improve/refactor plugin/code"
  if (/\b(edit|change|modify|fix|improve|update|refactor|tweak|adjust)\b.*\b(plugin|code)\b/i.test(lower)) return "coder";

  // "check/audit/review/analyze plugin/code"
  if (/\b(check|audit|review|analy[zs]e|inspect|look\s*at)\b.*\b(plugin|code|my\s+\w+\s+plugin)\b/i.test(lower)) return "coder";

  // "plugin that does..." (implied create)
  if (/\bplugin\s+that\s+(does|will|can|should|sends?|respond|handle)/i.test(lower)) return "coder";

  // "add a /command to..." or "add feature to..."
  if (/\b(add|remove)\b.+\b(to|from|in)\b.+\bplugin\b/i.test(lower)) return "coder";

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
 */
export function buildAssistantSystemPrompt(ctx: WorkerPromptContext): string {
  return composeWorkerPrompt("assistant", ctx);
}

/**
 * Build the system prompt for Cursor Coder.
 * Composed from modular skills defined in cursor-skills.ts.
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
    "install_plugin",
    "uninstall_plugin",
    "toggle_plugin",
    "start_workspace",
    // Navigation
    "navigate_page",
    // Interaction
    "ask_user",
    // Diagnostics
    "explain_error",
    // Hand-off
    "hand_off_to_coder",
  ],
  coder: [
    // Workspace file tools
    "read_file",
    "write_file",
    "list_files",
    "create_directory",
    "delete_file",
    "run_command",
    "search_files",
    // Platform query tools (needed to find gateways/plugins)
    "list_gateways",
    "list_user_plugins",
    // Plugin management tools
    "create_plugin_record",
    "update_plugin_record",
    "restart_plugin",
    // Diagnostics
    "view_plugin_logs",
    "explain_error",
    // Interaction
    "ask_user",
    // Hand-off
    "hand_off_to_assistant",
    // Completion
    "finish",
  ],
};
