/**
 * Agent Event → UIAction Mapper
 *
 * Maps streaming CursorAgentEvent objects from the backend SSE endpoint
 * into UIAction sequences that the cursor-provider can enqueue for
 * real-time choreography.
 *
 * Instead of fake timers, the user watches the Cursor do real work:
 * - read_file/write_file → navigate to workspace → file panel animation
 * - run_command → navigate to workspace → show terminal output
 * - create_plugin_record → toast only (backend creates via API, no navigation)
 * - update_plugin_record → toast only (backend updates via API, no navigation)
 * - list_gateways → navigate to gateways page
 * - finish → success toast → done
 *
 * All plugin-related operations (file I/O, plugin record CRUD, install,
 * toggle, restart) navigate to /workspace — never /plugins — because
 * the workspace is where users see their code and plugin activity.
 *
 * @module components/cursor/agent-event-mapper
 */

import type { CursorAgentEvent, ToolStartMeta } from "@/modules/cursor/cursor-agent.types";
import type { UIAction } from "./cursor.types";

// ===========================================
// Mapper Function
// ===========================================

/**
 * Map a single agent event to zero or more UIActions.
 *
 * Returns an array because some events produce multiple UI steps
 * (e.g., tool_start:write_file produces nav + toast).
 * Returns empty array for events that don't need UI representation.
 */
export function mapAgentEventToActions(event: CursorAgentEvent): UIAction[] {
  switch (event.type) {
    case "session_start":
      return [
        {
          action: "toast",
          message: event.mode === "analyze-repo"
            ? `Analyzing repo & generating plugin…`
            : event.mode === "create"
              ? `Creating plugin: ${event.pluginName}…`
              : `Editing plugin: ${event.pluginName}…`,
          variant: "info",
          durationMs: 2000,
        },
      ];

    // ── Multi-worker events ──────────────────────────
    case "worker_start":
      return [
        {
          action: "toast",
          message: `${event.displayName} is on it…`,
          variant: "info",
          durationMs: 1500,
        },
      ];

    case "worker_switch":
      return [
        {
          action: "toast",
          message: `Passing to ${event.toDisplayName}…`,
          variant: "info",
          durationMs: 2000,
        },
      ];

    case "ask_user":
      // ask_user is handled directly by cursor-panel (shows question in chat)
      // No ghost cursor animation needed
      return [];

    case "iteration_start":
      // Only show UI feedback every few iterations to avoid noise
      if (event.iteration === 1) {
        return [
          {
            action: "toast",
            message: "Analyzing requirements…",
            variant: "info",
            durationMs: 1500,
          },
        ];
      }
      return [];

    case "thinking":
      // Show a brief toast with the first ~80 chars of AI reasoning
      // If the model used extended thinking (reasoning field), note it in the toast
      if (event.reasoning && event.reasoning.length > 50) {
        return [
          {
            action: "toast",
            message: "Reasoning deeply…",
            variant: "info",
            durationMs: 1500,
          },
        ];
      }
      if (event.text.length > 10) {
        return [
          {
            action: "toast",
            message: event.text.slice(0, 80) + (event.text.length > 80 ? "…" : ""),
            variant: "info",
            durationMs: 2000,
          },
        ];
      }
      return [];

    case "tool_start":
      return mapToolStartToActions(event.tool, event.meta);

    case "tool_result":
      // Brief feedback on tool completion
      if (!event.success) {
        return [
          {
            action: "toast",
            message: `Issue with ${formatToolName(event.tool)}: ${event.summary.slice(0, 60)}`,
            variant: "warning",
            durationMs: 2000,
          },
        ];
      }
      // Success results are usually silent — the next tool_start provides nav
      return [];

    case "code_preview":
      // Navigate to workspace — all file writing happens in the workspace container
      return [
        { action: "navigate", path: "/workspace", label: `Writing ${event.file}` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Writing ${event.file} (${event.totalBytes} bytes)`,
          durationMs: 1500,
        },
      ];

    case "diff_preview":
      return [
        {
          action: "toast",
          message: `Edited ${event.file} (${event.editCount} change${event.editCount > 1 ? "s" : ""})`,
          variant: "info",
          durationMs: 2000,
        },
      ];

    case "status":
      return [
        {
          action: "toast",
          message: event.message,
          variant: "info",
          durationMs: 2000,
        },
      ];

    case "done":
      if (event.success) {
        return [
          { action: "navigate", path: "/workspace", label: "Viewing your plugin" },
          {
            action: "toast",
            message: `${event.pluginName} — ${event.summary}`,
            variant: "success",
            durationMs: 3000,
          },
          {
            action: "done",
            label: `${event.pluginName} is ready! (${event.fileCount} files, ${(event.durationMs / 1000).toFixed(1)}s)`,
            success: true,
          },
        ];
      }
      return [
        {
          action: "done",
          label: event.summary || "Plugin creation failed",
          success: false,
        },
      ];

    case "error":
      return [
        {
          action: "toast",
          message: event.message,
          variant: "error",
          durationMs: 4000,
        },
        {
          action: "done",
          label: event.message,
          success: false,
        },
      ];

    case "todo_update":
    case "terminal_confirm":
    case "model_confirm":
    case "file_action":
      return []; // Handled directly by cursor-panel

    default:
      return [];
  }
}

// ===========================================
// Tool-Specific Action Mapping
// ===========================================

/**
 * Map a tool_start event to navigation + UI feedback actions.
 * This is the core of the real-time animation — each tool type
 * causes the cursor to navigate to the relevant part of the dashboard.
 */
function mapToolStartToActions(
  tool: string,
  meta: ToolStartMeta,
): UIAction[] {
  switch (meta.kind) {
    case "read_file":
      return [
        { action: "navigate", path: "/workspace", label: `Reading ${shortenPath(meta.path)}` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Reading ${shortenPath(meta.path)}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "write_file":
      return [
        { action: "navigate", path: "/workspace", label: `Writing ${shortenPath(meta.path)}` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Writing ${shortenPath(meta.path)} (${meta.bytes} bytes)`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "list_files":
      return [
        { action: "navigate", path: "/workspace", label: `Scanning plugin files` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Listing ${meta.path || "/"}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "create_directory":
      return [
        {
          action: "toast",
          message: `Creating directory ${shortenPath(meta.path)}`,
          variant: "info",
          durationMs: 1000,
        },
      ];

    case "delete_file":
      return [
        {
          action: "toast",
          message: `Deleting ${shortenPath(meta.path)}`,
          variant: "warning",
          durationMs: 1000,
        },
      ];

    case "run_command":
      return [
        { action: "navigate", path: "/workspace", label: "Running command" },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `$ ${meta.command.slice(0, 60)}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "search_files":
      return [
        { action: "navigate", path: "/workspace", label: `Searching code` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Searching for "${meta.pattern}"`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "find_usages":
      return [
        { action: "navigate", path: "/workspace", label: `Finding usages` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Finding usages of "${meta.symbol}"`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "list_gateways":
      return [
        { action: "navigate", path: "/gateways", label: "Checking your gateways" },
        {
          action: "highlight",
          target: "create-gateway-btn",
          label: "Looking for a gateway to bind to",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "list_user_plugins":
      return [
        { action: "navigate", path: "/plugins", label: "Reviewing existing plugins" },
        {
          action: "highlight",
          target: "plugin-store-list",
          label: "Checking installed plugins",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "create_plugin_record":
      // Backend creates the DB record via API — animation just shows a toast.
      // Do NOT navigate to /plugins or simulate the "Create Plugin" form,
      // because the backend already handles the creation. Navigating to
      // /plugins and animating the form would confuse the system into
      // thinking the user is manually creating a second plugin.
      return [
        {
          action: "toast",
          message: `Registering plugin: ${meta.name}`,
          variant: "info",
          durationMs: 2000,
        },
      ];

    case "update_plugin_record":
      // Backend updates the DB record via API — animation just shows a toast.
      // No navigation needed since the write_file + restart actions
      // already keep the cursor on /workspace.
      return [
        {
          action: "toast",
          message: `Updating plugin metadata: ${meta.name || "plugin"}`,
          variant: "info",
          durationMs: 2000,
        },
      ];

    case "restart_plugin":
      return [
        { action: "navigate", path: "/workspace", label: `Restarting ${meta.slug}` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Restarting plugin: ${meta.slug}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "finish":
      return [
        {
          action: "toast",
          message: meta.summary || "Finishing up…",
          variant: "success",
          durationMs: 2000,
        },
      ];

    // ── Assistant platform tools (new) ───────────────

    case "check_credits":
      return [
        { action: "navigate", path: "/credits", label: "Checking your credits" },
        {
          action: "highlight",
          target: "credits-balance-card",
          label: "Your credit balance",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "check_billing":
      return [
        { action: "navigate", path: "/billing", label: "Checking billing info" },
        {
          action: "highlight",
          target: "billing-overview",
          label: "Your billing overview",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "check_usage":
      return [
        { action: "navigate", path: "/usage", label: "Checking usage stats" },
        {
          action: "highlight",
          target: "usage-overview",
          label: "Your usage statistics",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "create_gateway":
      return [
        { action: "navigate", path: "/gateways", label: `Creating gateway: ${meta.name}` },
        {
          action: "highlight",
          target: "create-gateway-btn",
          label: `Creating "${meta.name}"`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "delete_gateway":
      return [
        { action: "navigate", path: "/gateways", label: `Deleting gateway: ${meta.name}` },
        {
          action: "toast",
          message: `Deleting gateway "${meta.name}"`,
          variant: "warning",
          durationMs: 1500,
        },
      ];

    case "install_plugin":
      return [
        { action: "navigate", path: "/plugins", label: `Installing ${meta.slug}` },
        {
          action: "highlight",
          target: "plugin-store-list",
          label: `Installing ${meta.slug}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "uninstall_plugin":
      return [
        { action: "navigate", path: "/plugins", label: `Uninstalling ${meta.name}` },
        {
          action: "toast",
          message: `Uninstalling "${meta.name}"`,
          variant: "warning",
          durationMs: 1500,
        },
      ];

    case "toggle_plugin":
      return [
        { action: "navigate", path: "/plugins", label: `${meta.enable ? "Starting" : "Stopping"} ${meta.name}` },
        {
          action: "highlight",
          target: "plugin-store-list",
          label: `${meta.enable ? "Starting" : "Stopping"} ${meta.name}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "start_workspace":
      return [
        { action: "navigate", path: "/workspace", label: "Starting workspace" },
        {
          action: "highlight",
          target: "workspace-start-btn",
          label: "Starting your workspace",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "stop_workspace":
      return [
        { action: "navigate", path: "/workspace", label: "Stopping workspace" },
        {
          action: "toast",
          message: "Stopping workspace…",
          variant: "warning",
          durationMs: 2000,
        },
      ];

    case "restart_workspace":
      return [
        { action: "navigate", path: "/workspace", label: "Restarting workspace" },
        {
          action: "toast",
          message: "Restarting workspace…",
          variant: "info",
          durationMs: 2000,
        },
      ];

    case "get_workspace_status":
      return [
        { action: "navigate", path: "/workspace", label: "Checking workspace status" },
        {
          action: "highlight",
          target: "workspace-status-badge",
          label: "Checking workspace status",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "update_gateway":
      return [
        { action: "navigate", path: "/gateways", label: "Updating gateway" },
        {
          action: "highlight",
          target: "create-gateway-btn",
          label: `Updating gateway ${meta.gatewayId}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "view_plugin_config":
      return [
        { action: "navigate", path: "/workspace", label: `Viewing config: ${meta.name}` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Plugin config: ${meta.name}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "search_marketplace":
      return [
        { action: "navigate", path: "/plugins", label: `Searching: ${meta.query}` },
        {
          action: "highlight",
          target: "plugin-store-list",
          label: `Searching marketplace: "${meta.query}"`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "get_gateway_metrics":
      return [
        { action: "navigate", path: "/gateways", label: "Checking gateway metrics" },
        {
          action: "highlight",
          target: "create-gateway-btn",
          label: `Metrics for gateway ${meta.gatewayId}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "get_workspace_logs":
      return [
        { action: "navigate", path: "/workspace", label: "Fetching workspace logs" },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: "Fetching workspace logs",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "get_workspace_metrics":
      return [
        { action: "navigate", path: "/workspace", label: "Checking workspace metrics" },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: "Workspace resource metrics",
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "clone_plugin":
      return [
        { action: "navigate", path: "/workspace", label: `Cloning ${meta.sourceSlug}` },
        {
          action: "highlight",
          target: "workspace-plugins-panel",
          label: `Cloning ${meta.sourceSlug} → ${meta.newSlug}`,
          durationMs: 30_000,
          gated: true,
        },
      ];

    case "navigate_page":
      return [
        { action: "navigate", path: meta.path, label: `Opening ${meta.path}` },
      ];

    case "ask_user":
      // Handled by cursor-panel directly — no ghost cursor action
      return [];

    case "hand_off":
      return [
        {
          action: "toast",
          message: `Passing to ${meta.targetWorker === "coder" ? "Agent" : "Assistant"}…`,
          variant: "info",
          durationMs: 1500,
        },
      ];

    case "unknown":
    default:
      return [
        {
          action: "toast",
          message: `Running ${formatToolName(tool)}…`,
          variant: "info",
          durationMs: 1000,
        },
      ];
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Shorten a file path for display in chat — return only the basename.
 * The full path is preserved separately on the tool block as `fullPath`
 * and shown as a tooltip on hover. Examples:
 *   "bots/telegram/cmlt.../plugins/x/utils/rates.js" → "rates.js"
 *   "src/shared/lib/data-client.ts"                  → "data-client.ts"
 *   "plugins/my-plugin/index.js"                    → "index.js"
 */
function shortenPath(filePath: string): string {
  if (!filePath) return filePath;
  // If the input has a trailing line range (e.g. "src/x.ts lines 1–100"),
  // preserve the range but shorten the path portion.
  const m = filePath.match(/^(.*?)(\s+lines\s+.+)$/i);
  if (m) {
    const base = m[1]!.trim();
    const idx = base.lastIndexOf("/");
    return (idx >= 0 ? base.slice(idx + 1) : base) + m[2];
  }
  const idx = filePath.lastIndexOf("/");
  return idx >= 0 ? filePath.slice(idx + 1) : filePath;
}

/**
 * Shorten a directory path for display — keep the last segment so it remains
 * meaningful (e.g. "bots/.../plugins/x/utils" → "utils"). Falls back to "/"
 * for the workspace root.
 */
function shortenDir(dirPath: string | undefined): string {
  if (!dirPath || dirPath === "/" || dirPath === ".") return "/";
  const stripped = dirPath.replace(/\/$/, "");
  const idx = stripped.lastIndexOf("/");
  return idx >= 0 ? stripped.slice(idx + 1) : stripped;
}

/** Format a tool name for human display */
function formatToolName(tool: string): string {
  return tool.replace(/_/g, " ");
}

// ===========================================
// Human-Readable Event Descriptions (for chat bubble)
// ===========================================

/**
 * Generate a short human-readable description of an agent event
 * for display inside the chat bubble. Returns null for events
 * that don't need chat representation.
 */
export function describeAgentEvent(event: CursorAgentEvent): string | null {
  switch (event.type) {
    case "session_start":
      return event.mode === "analyze-repo"
        ? "Analyzing repository & generating plugin..."
        : event.mode === "create"
          ? `Starting to build ${event.pluginName}...`
          : `Analyzing ${event.pluginName}...`;

    // ── Multi-worker events ──────────────────────────
    case "worker_start":
      return `${event.displayName} is on it...`;

    case "worker_switch":
      return `Passing to ${event.toDisplayName}...`;

    case "ask_user":
      return null; // Handled directly by cursor-panel

    case "iteration_start":
      if (event.iteration <= 1) return "Analyzing requirements...";
      if (event.iteration === 2) return "Planning approach...";
      if (event.iteration <= 6) return `Working... (step ${event.iteration})`;
      if (event.iteration <= 15) return `Building... (step ${event.iteration})`;
      return `Finalizing... (step ${event.iteration})`;

    case "thinking":
      // Only show substantial thinking text
      if (event.text.length > 20) {
        return event.text.slice(0, 100) + (event.text.length > 100 ? "..." : "");
      }
      return null;

    case "tool_start":
      return describeToolStart(event.meta);

    case "tool_result":
      if (!event.success) {
        return `\u26A0\uFE0F ${formatToolName(event.tool)}: ${event.summary.slice(0, 80)}`;
      }
      // Show enriched confirmations with result details
      if (event.tool === "search_files") {
        const detail = event.resultDetail || "";
        return `\uD83D\uDD0E Searched \u2014 ${detail || event.summary.slice(0, 60)}`;
      }
      if (event.tool === "read_file") {
        // resultDetail = "path/to/file.js lines X–Y"
        return `📖 Read \`${shortenPath(event.resultDetail ?? event.summary.slice(0, 60))}\``;
      }
      if (event.tool === "delete_file") {
        return `🗑️ Deleted: ${event.resultDetail ?? event.summary.slice(0, 60)}`;
      }
      if (event.tool === "edit_file" && event.resultDetail) {
        return `\u270F\uFE0F Edited ${event.resultDetail}`;
      }
      if (event.tool === "run_command") {
        return `\u2705 ${formatToolName(event.tool)}: ${event.summary.slice(0, 80)}`;
      }
      if (event.tool === "validate_plugin") {
        const detail = event.resultDetail || event.summary.slice(0, 80);
        return `\uD83D\uDD2C Validate: ${detail}`;
      }
      if (event.tool === "create_plugin_record") {
        return event.resultDetail
          ? `✅ Plugin registered (${event.resultDetail})`
          : `✅ Plugin registered successfully`;
      }
      if (event.tool === "restart_plugin") {
        return event.resultDetail && event.resultDetail !== "started ✓"
          ? `↻ Plugin restarted — ${event.resultDetail}`
          : `✅ Plugin restarted`;
      }
      if (event.resultDetail) {
        // Generic result detail display for all tools that provide it
        if (event.tool === "list_gateways") return `🔌 Gateways: ${event.resultDetail}`;
        if (event.tool === "list_user_plugins") return `🧩 Plugins: ${event.resultDetail}`;
        if (event.tool === "view_plugin_logs") return `📜 Logs: ${event.resultDetail}`;
        if (event.tool === "check_credits") return `💰 ${event.resultDetail}`;
        if (event.tool === "check_billing") return `📋 ${event.resultDetail}`;
        if (event.tool === "create_gateway") return `🔌 Gateway: ${event.resultDetail}`;
        if (event.tool === "install_plugin") return `📦 ${event.resultDetail}`;
        if (event.tool === "find_relevant_code") return `🔍 Code search: ${event.resultDetail}`;
        if (event.tool === "workspace_summary") return `📊 Workspace: ${event.resultDetail}`;
        if (event.tool === "file_stat") return `📄 ${event.resultDetail}`;
        if (event.tool === "list_files") return `📂 ${event.resultDetail}`;
        if (event.tool === "write_file") return `✍️ ${event.resultDetail}`;
      }
      return null; // Other successful results are silent — next tool_start provides context

    case "code_preview":
      return `Writing ${event.file} (${event.totalBytes} bytes)`;

    case "diff_preview":
      return `📝 Edited ${event.file} (${event.editCount} change${event.editCount > 1 ? "s" : ""})`;

    case "status":
      return event.message;

    case "done":
      return null; // Handled separately

    case "error":
      return `\u274C ${event.message}`;

    case "todo_update":
      return null; // Rendered as widget

    case "terminal_confirm":
      return `\u25B6\uFE0F Run command: ${event.command.slice(0, 80)}?`;

    case "model_confirm":
      return `⚠ ${event.failedModel} is unavailable — waiting for your decision`;

    case "file_action":
      return null; // Rendered as widget

    case "model_fallback":
      return `⚠ ${event.requestedModel} unavailable — switching to best available model`;

    default:
      return null;
  }
}

/** Human-readable description of a tool call */
function describeToolStart(meta: ToolStartMeta): string {
  switch (meta.kind) {
    case "read_file": {
      // Show present-tense while running — done state updates to "Read `file`, N lines" via updateLastToolBlock
      const lineRange = meta.startLine
        ? `, lines ${meta.startLine} to ${meta.endLine ?? meta.startLine}`
        : "";
      return `📖 Reading \`${shortenPath(meta.path)}\`${lineRange}…`;
    }
    case "write_file":
      return `\u270D\uFE0F Creating \`${shortenPath(meta.path)}\`\u2026`;
    case "edit_file": {
      // Present tense while running — done state updates to "Edited `file` +1 -2" via updateLastToolBlock
      return `\u270F\uFE0F Editing \`${shortenPath(meta.path)}\`\u2026`;
    }
    case "list_files":
      return `\uD83D\uDCC2 Scanning files in \`${shortenDir(meta.path) || "/"}\``;
    case "create_directory":
      return `\uD83D\uDCC1 Creating directory ${shortenPath(meta.path)}`;
    case "delete_file":
      return `\uD83D\uDDD1\uFE0F Deleting ${shortenPath(meta.path)}`;
    case "run_command":
      return `\u25B6\uFE0F Running: ${meta.command.slice(0, 60)}`;
    case "search_files": {
      const pat = meta.filePattern ? `\`${meta.filePattern}\`` : `"${meta.pattern}"`;
      return `\uD83D\uDD0D Searching for files matching ${pat}`;
    }
    case "find_usages":
      return `\uD83D\uDD17 Finding usages of \`${meta.symbol}\``;
    case "list_gateways":
      return "\uD83D\uDD0C Checking your gateways";
    case "list_user_plugins":
      return "\uD83E\uDDE9 Listing installed plugins";
    case "create_plugin_record":
      return `\uD83C\uDFD7\uFE0F Registering plugin: ${meta.name}`;
    case "update_plugin_record":
      return `\uD83D\uDD04 Updating plugin record: ${meta.name || "plugin"}`;
    case "restart_plugin":
      return `\u21BB Restarting ${meta.slug}`;
    case "finish":
      return "\u2705 Finishing up...";
    // ── Assistant tools ────────────────────────────────
    case "check_credits":
      return "\uD83D\uDCB0 Checking your credit balance";
    case "check_billing":
      return "\uD83D\uDCCB Checking billing info";
    case "check_usage":
      return "\uD83D\uDCCA Checking usage statistics";
    case "create_gateway":
      return `\uD83D\uDD0C Creating gateway: ${meta.name}`;
    case "delete_gateway":
      return `\uD83D\uDDD1\uFE0F Deleting gateway: ${meta.name}`;
    case "install_plugin":
      return `\uD83D\uDCE6 Installing plugin: ${meta.slug}`;
    case "uninstall_plugin":
      return `\uD83D\uDDD1\uFE0F Uninstalling: ${meta.name}`;
    case "toggle_plugin":
      return meta.enable
        ? `\u25B6\uFE0F Starting ${meta.name}`
        : `\u23F8\uFE0F Stopping ${meta.name}`;
    case "start_workspace":
      return "\uD83D\uDDA5\uFE0F Starting workspace";
    case "navigate_page":
      return `\uD83D\uDCC2 Opening ${meta.path}`;
    case "ask_user":
      return `💬 ${meta.question}`;
    case "hand_off":
      return `Passing to ${meta.targetWorker === "coder" ? "Agent" : "Assistant"}...`;
    case "find_relevant_code":
      return `\uD83D\uDD0D Searching code: ${meta.query.slice(0, 50)}`;
    case "search_docs":
      return `\uD83D\uDCD6 Looking up docs: ${meta.query.slice(0, 50)}`;
    case "update_plan":
      if (meta.currentStep && meta.currentIndex) {
        return `\u2630 Starting: ${meta.currentStep} (${meta.currentIndex}/${meta.itemCount})`;
      }
      return `\uD83D\uDCCB Updating plan (${meta.itemCount} steps)`;
    // ── Newly-mapped tools ──────────────────────────────
    case "think":
      return `\uD83E\uDDE0 Reasoning: ${meta.reasoning}`;
    case "file_stat":
      return `\uD83D\uDCC4 Checking ${shortenPath(meta.path)}`;
    case "workspace_summary":
      return "\uD83D\uDCCA Analyzing workspace structure";
    case "get_outlines":
      return `\uD83D\uDCC2 Reading outlines (${meta.fileCount} file${meta.fileCount !== 1 ? "s" : ""})`;
    case "validate_plugin":
      return `\u2705 Validating plugin: ${meta.slug}`;
    case "ensure_dependencies":
      return `\u{1F4E6} Installing deps for: ${meta.slug}`;
    case "view_plugin_logs":
      return `\uD83D\uDCDC Viewing logs: ${meta.slug}`;
    case "explain_error":
      return `\uD83D\uDCA1 Explaining error: ${meta.error.slice(0, 50)}`;
    case "check_gateway_status":
      return `\uD83D\uDD0C Checking gateway status${meta.gatewayId ? `: ${meta.gatewayId}` : ""}`;
    case "list_templates":
      return "\uD83D\uDCC3 Listing plugin templates";
    case "unknown":
      return `\uD83D\uDD27 Running ${meta.tool}...`;
    default:
      return `Running ${meta.kind}...`;
  }
}
