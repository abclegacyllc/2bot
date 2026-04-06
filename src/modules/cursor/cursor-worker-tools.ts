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
import { ASK_MODE_TOOL_NAMES, WORKER_TOOL_NAMES, WORKFLOW_TOOL_NAMES } from "./cursor-workers";

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
      "Create a new gateway (Telegram bot, Discord bot, Slack bot, or WhatsApp bot). " +
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
          enum: ["TELEGRAM_BOT", "DISCORD_BOT", "SLACK_BOT", "WHATSAPP_BOT"],
          description: "Gateway type (default: TELEGRAM_BOT)",
        },
        botToken: {
          type: "string",
          description: "Telegram bot token (required for TELEGRAM_BOT type, collected via ask_user)",
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

  update_gateway: {
    name: "update_gateway",
    description:
      "Update an existing gateway's name or bot token. Use list_gateways to find " +
      "the gateway ID first. For Telegram bots, use ask_user to collect the new token.",
    parameters: {
      type: "object",
      properties: {
        gatewayId: {
          type: "string",
          description: "The ID of the gateway to update (from list_gateways)",
        },
        name: {
          type: "string",
          description: "New display name (optional)",
        },
        botToken: {
          type: "string",
          description: "New bot token for Telegram gateways (optional, collected via ask_user)",
        },
      },
      required: ["gatewayId"],
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

  stop_workspace: {
    name: "stop_workspace",
    description:
      "Stop the user's running workspace container. The workspace data is preserved " +
      "and can be started again later. Use ask_user to confirm before stopping.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  restart_workspace: {
    name: "restart_workspace",
    description:
      "Restart the user's workspace container (stop then start). Useful when the " +
      "workspace is unresponsive or to apply configuration changes.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  get_workspace_status: {
    name: "get_workspace_status",
    description:
      "Get the current status of the user's workspace — whether it's running, stopped, " +
      "or doesn't exist. Returns container ID, status, uptime, and resource usage.",
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
            "Dashboard route path. Main pages: /, /bots, " +
            "/workspace, /credits, /billing, /usage, /settings, /2bot-ai, " +
            "/organizations, /invites. " +
            "Sub-pages: /gateways/create, /gateways/<id>, /plugins/create, " +
            "/billing/upgrade, /billing/workspace. " +
            "Org routes: /organizations/<orgSlug>/bots, .../gateways, .../plugins, .../members, .../workspace, etc.",
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
  // WORKFLOW TOOLS (assistant-only, loaded when workflowContext is present)
  // ═══════════════════════════════════════════

  add_workflow_step: {
    name: "add_workflow_step",
    description:
      "Add a new plugin step to the current workflow. Specify the plugin ID, " +
      "desired order position (0-indexed), and optional name/config.",
    parameters: {
      type: "object",
      properties: {
        pluginId: {
          type: "string",
          description: "The ID of the plugin to add as a step (use list_available_plugins to find IDs).",
        },
        order: {
          type: "number",
          description: "Position in the step list (0-indexed). Existing steps at or after this position are shifted down.",
        },
        name: {
          type: "string",
          description: "Human-readable name for this step (optional, defaults to plugin name).",
        },
        config: {
          type: "object",
          description: "Optional plugin configuration key-value pairs.",
        },
      },
      required: ["pluginId", "order"],
    },
  },

  remove_workflow_step: {
    name: "remove_workflow_step",
    description:
      "Delete a step from the current workflow by its step ID.",
    parameters: {
      type: "object",
      properties: {
        stepId: {
          type: "string",
          description: "The ID of the step to remove.",
        },
      },
      required: ["stepId"],
    },
  },

  update_workflow_step: {
    name: "update_workflow_step",
    description:
      "Update an existing workflow step's configuration, name, or enabled state.",
    parameters: {
      type: "object",
      properties: {
        stepId: {
          type: "string",
          description: "The ID of the step to update.",
        },
        name: {
          type: "string",
          description: "New name for the step.",
        },
        config: {
          type: "object",
          description: "Updated plugin configuration key-value pairs.",
        },
        isEnabled: {
          type: "boolean",
          description: "Whether the step is enabled.",
        },
      },
      required: ["stepId"],
    },
  },

  reorder_workflow_step: {
    name: "reorder_workflow_step",
    description:
      "Move a workflow step to a new position (0-indexed). Other steps are shifted accordingly.",
    parameters: {
      type: "object",
      properties: {
        stepId: {
          type: "string",
          description: "The ID of the step to move.",
        },
        newOrder: {
          type: "number",
          description: "The new 0-indexed position for this step.",
        },
      },
      required: ["stepId", "newOrder"],
    },
  },

  toggle_workflow_step: {
    name: "toggle_workflow_step",
    description:
      "Enable or disable a workflow step without removing it.",
    parameters: {
      type: "object",
      properties: {
        stepId: {
          type: "string",
          description: "The ID of the step to toggle.",
        },
        isEnabled: {
          type: "boolean",
          description: "true to enable, false to disable.",
        },
      },
      required: ["stepId", "isEnabled"],
    },
  },

  update_workflow_trigger: {
    name: "update_workflow_trigger",
    description:
      "Change the workflow's trigger type (e.g. BOT_MESSAGE, TELEGRAM_MESSAGE, WEBHOOK).",
    parameters: {
      type: "object",
      properties: {
        triggerType: {
          type: "string",
          description: "The new trigger type (BOT_MESSAGE, TELEGRAM_MESSAGE, DISCORD_MESSAGE, SLACK_MESSAGE, WHATSAPP_MESSAGE, WEBHOOK, SCHEDULE, MANUAL).",
        },
        triggerConfig: {
          type: "object",
          description: "Optional trigger configuration (e.g. schedule cron, webhook path).",
        },
      },
      required: ["triggerType"],
    },
  },

  list_available_plugins: {
    name: "list_available_plugins",
    description:
      "List plugins that the user has installed and can be added as workflow steps. " +
      "Returns plugin ID, name, slug, and description. Use to find the right plugin to add.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional search keyword to filter plugins by name or description.",
        },
      },
      required: [],
    },
  },

  test_workflow: {
    name: "test_workflow",
    description:
      "Trigger a test execution of the current workflow. Returns the run ID for tracking.",
    parameters: {
      type: "object",
      properties: {
        params: {
          type: "object",
          description: "Optional test parameters to pass to the workflow trigger.",
        },
      },
      required: [],
    },
  },

  read_plugin_file: {
    name: "read_plugin_file",
    description:
      "Read a source file from a workflow step's plugin directory. Use the step's entryFile " +
      "from the workflow context to know the plugin's root. The path is relative to the " +
      "plugin directory (e.g. 'index.js', 'lib/prompt.ts').",
    parameters: {
      type: "object",
      properties: {
        stepId: {
          type: "string",
          description: "The workflow step ID whose plugin file to read.",
        },
        path: {
          type: "string",
          description: "File path relative to the plugin directory.",
        },
      },
      required: ["stepId", "path"],
    },
  },

  write_plugin_file: {
    name: "write_plugin_file",
    description:
      "Write or overwrite a source file in a workflow step's plugin directory. " +
      "Directories are created automatically. The path is relative to the plugin directory.",
    parameters: {
      type: "object",
      properties: {
        stepId: {
          type: "string",
          description: "The workflow step ID whose plugin file to write.",
        },
        path: {
          type: "string",
          description: "File path relative to the plugin directory.",
        },
        content: {
          type: "string",
          description: "The full file contents to write.",
        },
      },
      required: ["stepId", "path", "content"],
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
      "The path is relative to the workspace root. Use for NEW files or complete rewrites only. " +
      "For targeted changes to existing files, prefer edit_file (cheaper and faster).",
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

  edit_file: {
    name: "edit_file",
    description:
      "Edit an existing file by applying search/replace operations. Much cheaper than write_file " +
      "because you only send the changed parts. Each edit finds an exact text match and replaces it. " +
      "Use for targeted changes to existing files. For new files or complete rewrites, use write_file.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path inside the workspace",
        },
        edits: {
          type: "array",
          description: "Array of search/replace operations to apply in order",
          items: {
            type: "object",
            properties: {
              search: {
                type: "string",
                description: "Exact text to find in the file (must match exactly, including whitespace and indentation)",
              },
              replace: {
                type: "string",
                description: "Text to replace the search match with",
              },
            },
            required: ["search", "replace"],
          },
        },
      },
      required: ["path", "edits"],
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

  get_file_outline: {
    name: "get_file_outline",
    description:
      "Get a compact structural outline of a file showing imports, classes, methods, functions, " +
      "and exports — WITHOUT reading the full file contents. This is much cheaper than read_file " +
      "and should be your FIRST step when exploring unfamiliar files. " +
      "Use read_file only after you know which specific section you need.",
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

  get_function: {
    name: "get_function",
    description:
      "Extract a single function or method body by name from a file. " +
      "Returns just the function code with line numbers. " +
      "Much cheaper than reading the entire file when you only need one function.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path inside the workspace",
        },
        name: {
          type: "string",
          description: "Name of the function or method to extract",
        },
      },
      required: ["path", "name"],
    },
  },

  search_symbols: {
    name: "search_symbols",
    description:
      "Search for function, class, or method names across multiple files. " +
      "Returns matching symbol signatures with file paths and line numbers. " +
      "Faster and more precise than search_files for finding code definitions.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Symbol name or substring to search for (case-insensitive)",
        },
        path: {
          type: "string",
          description: "Directory to search in (default: workspace root)",
          default: ".",
        },
        type: {
          type: "string",
          description: "Filter by symbol type: 'function', 'class', or 'all' (default: 'all')",
          default: "all",
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
      "The user sees the question in the chat with clickable answer options.\n\n" +
      "IMPORTANT: Always provide `options` with 2-5 short, clear choices covering the most common answers. " +
      "The LAST option should always be { label: \"Other (type my own)\", value: \"__freetext__\" } so " +
      "the user can type a custom answer if none of the choices fit. " +
      "Keep option labels short (3-8 words). Keep the question concise (one sentence).",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "A concise question (one sentence) to ask the user",
        },
        options: {
          type: "array",
          description:
            "Clickable answer choices. Provide 2-5 options. " +
            "The last option MUST be { label: \"Other (type my own)\", value: \"__freetext__\" }.",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Short display label the user clicks (3-8 words)",
              },
              value: {
                type: "string",
                description: "Value sent back when selected (use \"__freetext__\" for the free-text option)",
              },
            },
            required: ["label", "value"],
          },
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

  // ── New platform tools ──────────────────────────────

  check_gateway_status: {
    name: "check_gateway_status",
    description:
      "Check the live health/connection status of a specific gateway. " +
      "Runs a real connectivity test (e.g. Telegram getMe). Useful when a user reports their bot is not working.",
    parameters: {
      type: "object",
      properties: {
        gatewayId: {
          type: "string",
          description: "The ID of the gateway to check. Use list_gateways first if not known.",
        },
      },
      required: ["gatewayId"],
    },
  },

  view_plugin_config: {
    name: "view_plugin_config",
    description:
      "View a plugin's current configuration, including its config schema, default values, " +
      "and user-set values. Useful for understanding what settings a plugin has and debugging config issues.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Plugin name (fuzzy-matched) or slug. Use list_user_plugins to find plugins first.",
        },
        userPluginId: {
          type: "string",
          description: "UserPlugin ID (exact match, preferred over name)",
        },
      },
      required: [],
    },
  },

  view_plugin_logs: {
    name: "view_plugin_logs",
    description:
      "View recent runtime logs for a plugin running in the user's workspace. " +
      "Useful for debugging plugin errors or checking if a plugin started successfully.",
    parameters: {
      type: "object",
      properties: {
        pluginSlug: {
          type: "string",
          description: "The slug of the plugin to get logs for (e.g. 'echo-bot').",
        },
      },
      required: ["pluginSlug"],
    },
  },

  list_templates: {
    name: "list_templates",
    description:
      "List all available bot plugin templates the user can use as a starting point. " +
      "Returns template names, descriptions, categories, difficulty levels, and required gateways.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional category filter (e.g. 'messaging', 'ai', 'utility').",
        },
      },
      required: [],
    },
  },

  explain_error: {
    name: "explain_error",
    description:
      "Explain a platform error message in plain language and suggest fixes. " +
      "Pass in any error text the user encountered.",
    parameters: {
      type: "object",
      properties: {
        error: {
          type: "string",
          description: "The error message or error text to explain.",
        },
      },
      required: ["error"],
    },
  },

  search_marketplace: {
    name: "search_marketplace",
    description:
      "Search the 2Bot plugin marketplace for available plugins by keyword or category. " +
      "Returns matching plugins with name, slug, description, and install status.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query — keyword, category, or description text to search for.",
        },
      },
      required: ["query"],
    },
  },

  get_gateway_metrics: {
    name: "get_gateway_metrics",
    description:
      "Get metrics for a specific gateway — message counts, error rates, uptime. " +
      "Use list_gateways first to get the gateway ID.",
    parameters: {
      type: "object",
      properties: {
        gatewayId: {
          type: "string",
          description: "The ID of the gateway to get metrics for.",
        },
      },
      required: ["gatewayId"],
    },
  },

  get_workspace_logs: {
    name: "get_workspace_logs",
    description:
      "Get recent logs from the user's workspace container. " +
      "Returns system logs, plugin stdout/stderr, and errors.",
    parameters: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["debug", "info", "warn", "error"],
          description: "Minimum log level to return (default: info)",
        },
        limit: {
          type: "number",
          description: "Maximum number of log lines to return (default: 50, max: 200)",
        },
      },
      required: [],
    },
  },

  get_workspace_metrics: {
    name: "get_workspace_metrics",
    description:
      "Get resource usage metrics for the user's workspace — CPU, memory, disk, uptime. " +
      "Useful for diagnosing performance issues or checking resource limits.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  clone_plugin: {
    name: "clone_plugin",
    description:
      "Clone/duplicate an existing plugin to create a new one based on its code. " +
      "Copies all files from the source plugin directory to a new directory with a new slug. " +
      "The new plugin is created as an independent copy.",
    parameters: {
      type: "object",
      properties: {
        sourceSlug: {
          type: "string",
          description: "Slug of the existing plugin to clone (e.g. 'echo-bot')",
        },
        newSlug: {
          type: "string",
          description: "Slug for the new cloned plugin (e.g. 'echo-bot-v2')",
        },
        newName: {
          type: "string",
          description: "Display name for the new plugin (e.g. 'Echo Bot V2')",
        },
      },
      required: ["sourceSlug", "newSlug", "newName"],
    },
  },
};

// ===========================================
// Tool Set Getter
// ===========================================

/**
 * Get the tool definitions for a specific worker type.
 * Filters ALL_TOOLS based on WORKER_TOOL_NAMES.
 * When hasWorkflowContext is true, workflow mutation tools are added to the assistant.
 */
export function getWorkerTools(
  workerType: CursorWorkerType,
  options?: { hasWorkflowContext?: boolean; studioMode?: "agent" | "ask" | "plan" },
): WorkerToolDefinition[] {
  // Ask mode: read-only diagnostic tools — can investigate but not mutate
  if (options?.studioMode === "ask") {
    return ASK_MODE_TOOL_NAMES
      .map((name) => ALL_TOOLS[name])
      .filter((t): t is WorkerToolDefinition => !!t);
  }

  const toolNames = [...WORKER_TOOL_NAMES[workerType]];

  // Conditionally add workflow tools for assistant in studio mode
  if (workerType === "assistant" && options?.hasWorkflowContext) {
    // Plan mode: add workflow tools but only read-only ones
    if (options.studioMode === "plan") {
      toolNames.push("list_available_plugins");
    } else {
      toolNames.push(...WORKFLOW_TOOL_NAMES);
    }
  }

  return toolNames
    .map((name) => ALL_TOOLS[name])
    .filter((t): t is WorkerToolDefinition => !!t);
}
