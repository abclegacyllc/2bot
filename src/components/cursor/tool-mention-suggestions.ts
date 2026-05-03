/**
 * Tool-mention suggestions for the chat input autocomplete.
 *
 * Curated list of the most useful tools users might want to force via the
 * `#tool` syntax. Mirrors the server-side ALL_TOOL_NAMES registry but keeps
 * the client bundle small and avoids importing server-only modules.
 *
 * Server validates mentions against the full registry, so unknown names
 * typed by the user are silently ignored — this list only drives the UI.
 *
 * @module components/cursor/tool-mention-suggestions
 */

export interface ToolSuggestion {
  name: string;
  short: string;
}

/**
 * Sorted by frequency of likely user invocation.
 * Keep this list focused — too many options is worse UX than too few.
 */
export const TOOL_SUGGESTIONS: readonly ToolSuggestion[] = [
  // Code exploration (most common force-target)
  { name: "search_codebase", short: "Semantic search across the workspace" },
  { name: "find_usages", short: "Find every place a symbol is used" },
  { name: "search_files", short: "Regex / text search across files" },
  { name: "search_symbols", short: "Find symbols by name (AST)" },
  { name: "list_files", short: "List directory contents" },
  { name: "read_file", short: "Read a file's contents" },
  { name: "get_outlines", short: "Extract symbol outlines from files" },

  // Editing
  { name: "write_file", short: "Create or overwrite a file" },
  { name: "edit_file", short: "Apply a precise edit to a file" },
  { name: "delete_file", short: "Delete a file (asks for confirmation)" },
  { name: "rename_file", short: "Rename or move a file" },

  // Execution
  { name: "run_command", short: "Run a shell command in the workspace" },
  { name: "install_package", short: "Install an npm package" },

  // Web / docs
  { name: "fetch_url", short: "Fetch a URL's contents" },
  { name: "search_docs", short: "Search platform documentation" },

  // Workflow / platform domain
  { name: "list_plugins", short: "List installed marketplace plugins" },
  { name: "validate_plugin", short: "Validate a plugin's manifest & code" },
  { name: "get_workspace_logs", short: "Read workspace runtime logs" },
  { name: "get_plugin_logs", short: "Read a specific plugin's logs" },

  // Planning / hand-off
  { name: "update_plan", short: "Update the structured plan / TODO list" },
  { name: "think", short: "Force the agent to reason out loud first" },
  { name: "ask_user", short: "Ask the user a clarifying question" },
  { name: "hand_off_to_coder", short: "Hand off the task to the coder worker" },
  { name: "finish", short: "Mark the task complete" },
];

/** Filter suggestions by a partial query (case-insensitive prefix or substring). */
export function filterToolSuggestions(query: string): ToolSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOL_SUGGESTIONS.slice(0, 8);
  // Prefix matches first, then substring matches, capped at 8
  const prefix: ToolSuggestion[] = [];
  const substr: ToolSuggestion[] = [];
  for (const t of TOOL_SUGGESTIONS) {
    const n = t.name.toLowerCase();
    if (n.startsWith(q)) prefix.push(t);
    else if (n.includes(q)) substr.push(t);
  }
  return [...prefix, ...substr].slice(0, 8);
}
