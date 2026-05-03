/**
 * Capability Tool Bundles
 *
 * Maps short bundle names (used in `.agent.md` `tools:` arrays) to concrete
 * tool name lists. This keeps agent files readable and lets us evolve the
 * underlying tool catalog without rewriting every agent file.
 *
 * Bundles are *additive* — listing multiple bundles unions their tool sets.
 * Individual tool names may also appear directly in the `tools:` array
 * (e.g. for fine-grained additions or removals via the `!toolName` syntax).
 *
 * Single source of truth: tool names referenced here MUST exist in
 * `cursor-worker-tools.ts` `ALL_TOOLS`. The agent loader will warn at startup
 * if a bundle references an unknown tool.
 *
 * @module modules/cursor/agents/tool-bundles
 */

// ===========================================
// Bundle definitions
// ===========================================

/**
 * Read-only filesystem operations on the user's workspace.
 * Safe for ask / plan / explore modes.
 */
const WORKSPACE_READ = [
  "read_file",
  "list_files",
  "search_files",
  "file_stat",
  "workspace_summary",
] as const;

/** Mutating filesystem operations on the user's workspace */
const WORKSPACE_WRITE = [
  "write_file",
  "edit_file",
  "create_directory",
  "delete_file",
  "run_command",
] as const;

/** AST-aware code intelligence (read-only) */
const CODE_INTEL = [
  "get_file_outline",
  "get_outlines",
  "get_function",
  "search_symbols",
  "search_codebase",
  "find_relevant_code",
  "search_docs",
] as const;

/** Plugin lifecycle: create, update, validate, restart */
const PLUGIN_MGMT = [
  "create_plugin_record",
  "update_plugin_record",
  "restart_plugin",
  "clone_plugin",
  "validate_plugin",
  "ensure_dependencies",
  "view_plugin_config",
] as const;

/** Read-only platform queries (credits, gateways, plugins, templates) */
const PLATFORM_QUERY = [
  "check_credits",
  "check_billing",
  "check_usage",
  "list_gateways",
  "check_gateway_status",
  "list_user_plugins",
  "list_templates",
  "get_workspace_status",
] as const;

/** Mutating platform actions (gateways, install/uninstall, workspace lifecycle) */
const PLATFORM_MUTATE = [
  "create_gateway",
  "delete_gateway",
  "update_gateway",
  "install_plugin",
  "uninstall_plugin",
  "toggle_plugin",
  "start_workspace",
  "stop_workspace",
  "restart_workspace",
  "search_marketplace",
  // User-confirmed network allowlist additions (always pauses for approval)
  "request_domain_allowlist",
] as const;

/** Workflow-canvas mutations (Studio mode) */
const WORKFLOW_EDIT = [
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
] as const;

/** Diagnostics, logs, error-explanation (read-only) */
const DIAGNOSTICS = [
  "view_plugin_logs",
  "get_workspace_logs",
  "get_workspace_metrics",
  "get_gateway_metrics",
  "explain_error",
] as const;

/** Persistent agent memory (read + write) */
const MEMORY = ["write_memory", "read_memory", "delete_memory"] as const;

/** Read-only memory bundle (for ask mode) */
const MEMORY_READ = ["read_memory"] as const;

/** Direct-user interaction primitives (questions, plan tracking, completion) */
const INTERACTION = [
  "ask_user",
  "think",
  "update_plan",
  "finish",
  "fetch_url",
  "navigate_page",
] as const;

// ===========================================
// Registry
// ===========================================

/**
 * Map from bundle id → tool names. Bundle ids must be lowercase-kebab.
 * Order in the bundle is preserved when expanded (helps with prompt examples).
 */
export const TOOL_BUNDLES: Record<string, readonly string[]> = {
  "workspace-read": WORKSPACE_READ,
  "workspace-write": WORKSPACE_WRITE,
  "code-intel": CODE_INTEL,
  "plugin-mgmt": PLUGIN_MGMT,
  "platform-query": PLATFORM_QUERY,
  "platform-mutate": PLATFORM_MUTATE,
  "workflow-edit": WORKFLOW_EDIT,
  "diagnostics": DIAGNOSTICS,
  "memory": MEMORY,
  "memory-read": MEMORY_READ,
  "interaction": INTERACTION,
};

/** Names of all known capability bundles (for validation / UI hints) */
export const BUNDLE_NAMES = Object.keys(TOOL_BUNDLES);

// ===========================================
// Expansion
// ===========================================

/**
 * Expand a list of bundle names and/or raw tool names into a deduped
 * ordered list of tool names. Entries prefixed with `!` are exclusions
 * applied after the union.
 *
 * @example
 *   expandToolList(["workspace-read", "ask_user"])
 *   // → ["read_file", "list_files", "search_files", ..., "ask_user"]
 *
 *   expandToolList(["workspace-write", "!delete_file"])
 *   // → all workspace-write tools EXCEPT delete_file
 */
export function expandToolList(entries: string[]): string[] {
  const include: string[] = [];
  const exclude = new Set<string>();
  for (const entry of entries) {
    if (entry.startsWith("!")) {
      exclude.add(entry.slice(1));
      continue;
    }
    const bundle = TOOL_BUNDLES[entry];
    if (bundle) {
      for (const tool of bundle) include.push(tool);
    } else {
      // Treat as raw tool name; validation happens in the loader.
      include.push(entry);
    }
  }
  // Preserve insertion order while deduping
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tool of include) {
    if (exclude.has(tool) || seen.has(tool)) continue;
    seen.add(tool);
    result.push(tool);
  }
  return result;
}
