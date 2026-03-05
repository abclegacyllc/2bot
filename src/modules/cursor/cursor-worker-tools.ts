/**
 * Cursor Worker Tools — Tool Definitions per Worker Type
 *
 * Each worker has a focused set of tools. Tool definitions follow the
 * JSON Schema pattern used by the LLM provider's function-calling API.
 *
 * - **Assistant Tools**: Platform operations (credits, gateways, plugins, navigation)
 * - **Coder Tools**: Workspace operations (files, terminal, plugin registry)
 * - **Shared Tools**: ask_user (both workers can ask the user questions)
 *
 * The tool execution handlers live in the worker runner (Phase 2).
 * This file only defines the schemas the LLM sees.
 *
 * @module modules/cursor/cursor-worker-tools
 */

import type { CursorWorkerType } from "./cursor-workers";
import { WORKER_TOOL_NAMES } from "./cursor-workers";

// ===========================================
// Tool Definition Type
// ===========================================

/** A tool definition that gets sent to the LLM */
export interface WorkerToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

// ===========================================
// All Tool Definitions (master registry)
// ===========================================

/**
 * Master registry of ALL tool definitions across both workers.
 * Each worker gets a filtered subset based on WORKER_TOOL_NAMES.
 */
const ALL_TOOLS: Record<string, WorkerToolDefinition> = {
  // ═══════════════════════════════════════════
  // ASSISTANT-ONLY TOOLS (platform operations)
  // ═══════════════════════════════════════════

  check_credits: {
    name: "check_credits",
    description:
      "Check the user's current credit balance. Returns the number of credits remaining " +
      "and the plan tier. Use this when the user asks about credits, balance, or how much they have left.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  check_billing: {
    name: "check_billing",
    description:
      "Check the user's billing information — subscription plan, next billing date, " +
      "payment method. Use when the user asks about billing, subscription, plan, or invoices.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  check_usage: {
    name: "check_usage",
    description:
      "Check the user's usage statistics — AI calls, storage, bandwidth consumption. " +
      "Use when the user asks about usage, stats, or consumption.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  create_gateway: {
    name: "create_gateway",
    description:
      "Create a new gateway (Telegram bot, AI provider, or custom gateway). " +
      "IMPORTANT: For Telegram bots, you MUST first use ask_user to collect the bot token " +
      "before calling this tool. The token is a secret the user gets from @BotFather.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Display name for the gateway (e.g. 'My Telegram Bot')",
        },
        type: {
          type: "string",
          enum: ["TELEGRAM_BOT", "AI", "CUSTOM_GATEWAY"],
          description: "Gateway type (default: TELEGRAM_BOT)",
        },
        botToken: {
          type: "string",
          description: "Telegram bot token (required for TELEGRAM_BOT type, collected via ask_user)",
        },
        apiKey: {
          type: "string",
          description: "API key (required for AI type, collected via ask_user)",
        },
      },
      required: ["name"],
    },
  },

  delete_gateway: {
    name: "delete_gateway",
    description:
      "Delete a gateway by name or ID. Use ask_user first to confirm the deletion " +
      "since this is irreversible.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Gateway name to delete (fuzzy-matched)",
        },
        gatewayId: {
          type: "string",
          description: "Gateway ID to delete (exact match, preferred over name)",
        },
      },
      required: [],
    },
  },

  install_plugin: {
    name: "install_plugin",
    description:
      "Install a plugin from the 2Bot plugin catalog. The plugin will be auto-linked " +
      "to the user's active gateway. Provide the plugin name or slug.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Plugin slug or name (e.g. 'echo-bot', 'weather-plugin'). Fuzzy-matched.",
        },
        gatewayId: {
          type: "string",
          description: "Optional: specific gateway ID to bind to (auto-selected if omitted)",
        },
      },
      required: ["slug"],
    },
  },

  uninstall_plugin: {
    name: "uninstall_plugin",
    description:
      "Uninstall/delete a plugin the user has installed. Confirm with ask_user first.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Plugin name to uninstall (fuzzy-matched)",
        },
        pluginId: {
          type: "string",
          description: "Plugin ID to uninstall (exact, preferred over name)",
        },
      },
      required: [],
    },
  },

  toggle_plugin: {
    name: "toggle_plugin",
    description:
      "Start or stop a plugin. Enable=true starts it, enable=false stops it.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Plugin name (fuzzy-matched)",
        },
        enable: {
          type: "boolean",
          description: "true to start, false to stop",
        },
      },
      required: ["name", "enable"],
    },
  },

  start_workspace: {
    name: "start_workspace",
    description:
      "Start the user's development workspace container. If no workspace exists, " +
      "creates one first. If already running, reports the status.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  navigate_page: {
    name: "navigate_page",
    description:
      "Navigate the dashboard to a specific page. Use this to show the user " +
      "relevant pages after completing an action (e.g., navigate to /gateways after creating one).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Dashboard route path. Available: /gateways, /plugins, " +
            "/workspace, /credits, /billing, /usage, /settings",
        },
        reason: {
          type: "string",
          description: "Brief reason for navigation (shown in UI)",
        },
      },
      required: ["path"],
    },
  },

  hand_off_to_coder: {
    name: "hand_off_to_coder",
    description:
      "Transfer the conversation to Cursor Coder for code-related work. " +
      "Use this when the user wants to create, edit, fix, improve, or analyze plugin code. " +
      "You MUST pass all relevant context — plugin name, what to do, any details the user provided. " +
      "The Coder will continue in the same chat.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "Full task description for the Coder. Include: what plugin, what to do, " +
            "any user requirements. Example: 'Create a plugin called Weather Bot that " +
            "sends daily weather forecasts to the group chat using the AI API'",
        },
        pluginSlug: {
          type: "string",
          description: "Plugin slug if editing existing (e.g. 'weather-bot'). Omit for new plugins.",
        },
        pluginName: {
          type: "string",
          description: "Human-readable plugin name (e.g. 'Weather Bot')",
        },
        mode: {
          type: "string",
          enum: ["create", "edit"],
          description: "Whether to create a new plugin or edit an existing one",
        },
      },
      required: ["task"],
    },
  },

  // ═══════════════════════════════════════════
  // CODER-ONLY TOOLS (workspace file operations)
  // These are carried over from the existing agent
  // ═══════════════════════════════════════════

  read_file: {
    name: "read_file",
    description:
      "Read the contents of a file in the workspace. The path is relative to the workspace root " +
      "(e.g. 'plugins/my-bot/index.js').",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path inside the workspace",
        },
      },
      required: ["path"],
    },
  },

  write_file: {
    name: "write_file",
    description:
      "Write or overwrite a file in the workspace. Directories are created automatically. " +
      "The path is relative to the workspace root.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path inside the workspace",
        },
        content: {
          type: "string",
          description: "The full file contents to write",
        },
      },
      required: ["path", "content"],
    },
  },

  list_files: {
    name: "list_files",
    description:
      "List files and directories at a given path. Returns an array of file/directory names. " +
      "Use recursive=true to list all nested files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory path (e.g. 'plugins/my-bot/')",
        },
        recursive: {
          type: "boolean",
          description: "Whether to list files recursively (default: false)",
        },
      },
      required: ["path"],
    },
  },

  create_directory: {
    name: "create_directory",
    description: "Create a directory in the workspace.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory path to create",
        },
      },
      required: ["path"],
    },
  },

  delete_file: {
    name: "delete_file",
    description: "Delete a file from the workspace.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path to delete",
        },
      },
      required: ["path"],
    },
  },

  run_command: {
    name: "run_command",
    description:
      "Execute a shell command in the workspace and return stdout+stderr. " +
      "Use this for syntax checking (node --check file.js), running tests, " +
      "or any CLI operation. Destructive system commands are blocked.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        cwd: {
          type: "string",
          description: "Working directory relative to workspace root (default: workspace root)",
        },
      },
      required: ["command"],
    },
  },

  search_files: {
    name: "search_files",
    description:
      "Search for text content across workspace files using grep. " +
      "Returns matching lines with file paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (text or regex)",
        },
        path: {
          type: "string",
          description: "Directory to search in (default: workspace root)",
          default: ".",
        },
        filePattern: {
          type: "string",
          description: "File glob pattern to filter (e.g., '*.js', '*.{js,json}')",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results (default: 30)",
          default: 30,
        },
      },
      required: ["pattern"],
    },
  },

  create_plugin_record: {
    name: "create_plugin_record",
    description:
      "Create the plugin database record on the 2Bot platform. " +
      "Call this AFTER writing all plugin files to the workspace.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Plugin display name (e.g., 'Quiz Bot')",
        },
        slug: {
          type: "string",
          description: "Plugin slug for the directory (e.g., 'quiz-bot')",
        },
        description: {
          type: "string",
          description: "Short description of what the plugin does",
        },
        entry: {
          type: "string",
          description: "Entry file relative to plugin directory (e.g., 'index.js')",
        },
        configSchema: {
          type: "object",
          description: "JSON Schema for user-configurable settings (or {} if none)",
        },
        configDefaults: {
          type: "object",
          description: "Default values for config fields (or {} if none)",
        },
        gatewayId: {
          type: "string",
          description: "Optional gateway ID to bind the plugin to (from list_gateways)",
        },
        category: {
          type: "string",
          description:
            "Plugin category (general, analytics, messaging, automation, moderation, utilities)",
          default: "general",
        },
      },
      required: ["name", "slug", "description", "entry"],
    },
  },

  update_plugin_record: {
    name: "update_plugin_record",
    description:
      "Update an existing custom plugin's metadata in the database. " +
      "Provide the pluginId from list_user_plugins.",
    parameters: {
      type: "object",
      properties: {
        pluginId: {
          type: "string",
          description: "The plugin ID to update",
        },
        name: {
          type: "string",
          description: "New plugin name (optional)",
        },
        description: {
          type: "string",
          description: "New description (optional)",
        },
        code: {
          type: "string",
          description: "New single-file plugin code (optional)",
        },
        configSchema: {
          type: "object",
          description: "Updated config schema (optional)",
        },
      },
      required: ["pluginId"],
    },
  },

  restart_plugin: {
    name: "restart_plugin",
    description:
      "Stop and restart a plugin process so new code takes effect.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Plugin slug (e.g., 'quiz-bot')",
        },
        entry: {
          type: "string",
          description: "Entry file relative to plugin directory (default: 'index.js')",
          default: "index.js",
        },
      },
      required: ["slug"],
    },
  },

  finish: {
    name: "finish",
    description:
      "Signal that you are done. Provide the entry file path, config schema, " +
      "and a summary of what was built/changed. You MUST call this when your work is complete.",
    parameters: {
      type: "object",
      properties: {
        entry: {
          type: "string",
          description: "Entry file relative to the plugin directory (e.g. 'index.js')",
        },
        configSchema: {
          type: "object",
          description: "JSON Schema for user-configurable settings (or {} if none)",
        },
        configDefaults: {
          type: "object",
          description: "Default values for config fields (or {} if none)",
        },
        summary: {
          type: "string",
          description: "Brief human-readable summary of what was done",
        },
      },
      required: ["entry", "summary"],
    },
  },

  hand_off_to_assistant: {
    name: "hand_off_to_assistant",
    description:
      "Transfer back to Cursor Assistant for platform operations. " +
      "Use when the user asks about credits, billing, gateways, plugin installation, " +
      "or other non-code tasks. Pass context about what you were doing.",
    parameters: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description:
            "Context to pass to the Assistant. Include what you just did and " +
            "what the user now needs. Example: 'I just finished creating the Weather Bot plugin. " +
            "The user now wants to check their credit balance.'",
        },
      },
      required: ["context"],
    },
  },

  // ═══════════════════════════════════════════
  // SHARED TOOLS (available to both workers)
  // ═══════════════════════════════════════════

  ask_user: {
    name: "ask_user",
    description:
      "Ask the user a question and wait for their response. " +
      "Use this when you genuinely need information from the user — " +
      "a bot token, a preference, confirmation for a destructive action, etc. " +
      "The user sees the question in the chat and types their answer.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user",
        },
        sensitive: {
          type: "boolean",
          description:
            "If true, the input field will mask the text (for secrets like API tokens). Default: false",
        },
      },
      required: ["question"],
    },
  },

  // Shared platform query tools (used by both workers)
  list_gateways: {
    name: "list_gateways",
    description:
      "List all gateways (Telegram bots, AI providers, custom gateways) the user has configured. " +
      "Returns gateway names, types, statuses, and IDs.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  list_user_plugins: {
    name: "list_user_plugins",
    description:
      "List all plugins the user currently has installed. " +
      "Returns plugin names, slugs, enabled status, and IDs.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ===========================================
// Tool Set Getter
// ===========================================

/**
 * Get the tool definitions for a specific worker type.
 * Filters ALL_TOOLS based on WORKER_TOOL_NAMES.
 */
export function getWorkerTools(workerType: CursorWorkerType): WorkerToolDefinition[] {
  const toolNames = WORKER_TOOL_NAMES[workerType];
  return toolNames
    .map((name) => ALL_TOOLS[name])
    .filter((t): t is WorkerToolDefinition => !!t);
}

/**
 * Get a single tool definition by name.
 */
export function getToolDefinition(name: string): WorkerToolDefinition | undefined {
  return ALL_TOOLS[name];
}

/**
 * Check if a tool name belongs to a specific worker.
 */
export function isWorkerTool(workerType: CursorWorkerType, toolName: string): boolean {
  return WORKER_TOOL_NAMES[workerType].includes(toolName);
}
