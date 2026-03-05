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
          message: event.mode === "create"
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
          target: "plugins-list",
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
          target: "plugins-list",
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
          target: "plugins-list",
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
          message: `Passing to ${meta.targetWorker === "coder" ? "Cursor Coder" : "Cursor Assistant"}…`,
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

/** Shorten a file path for display (remove plugins/ prefix) */
function shortenPath(filePath: string): string {
  return filePath.replace(/^plugins\/[^/]+\//, "");
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
      return event.mode === "create"
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
      if (event.iteration <= 1) return "Thinking about the approach...";
      if (event.iteration === 2) return "Planning changes...";
      return `Working... (iteration ${event.iteration})`;

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
      return null; // Successful results are silent — next tool_start provides context

    case "code_preview":
      return `Writing ${event.file} (${event.totalBytes} bytes)`;

    case "status":
      return event.message;

    case "done":
      return null; // Handled separately

    case "error":
      return `\u274C ${event.message}`;

    default:
      return null;
  }
}

/** Human-readable description of a tool call */
function describeToolStart(meta: ToolStartMeta): string {
  switch (meta.kind) {
    case "read_file":
      return `\uD83D\uDCC4 Reading ${shortenPath(meta.path)}`;
    case "write_file":
      return `\u270D\uFE0F Writing ${shortenPath(meta.path)} (${meta.bytes} bytes)`;
    case "list_files":
      return `\uD83D\uDCC2 Scanning files in ${meta.path || "/"}`;
    case "create_directory":
      return `\uD83D\uDCC1 Creating directory ${shortenPath(meta.path)}`;
    case "delete_file":
      return `\uD83D\uDDD1\uFE0F Deleting ${shortenPath(meta.path)}`;
    case "run_command":
      return `\u25B6\uFE0F Running: ${meta.command.slice(0, 60)}`;
    case "search_files":
      return `\uD83D\uDD0D Searching for \"${meta.pattern}\"`;
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
      return `Passing to ${meta.targetWorker === "coder" ? "Cursor Coder" : "Cursor Assistant"}...`;
    default:
      return `Running ${meta.kind}...`;
  }
}
