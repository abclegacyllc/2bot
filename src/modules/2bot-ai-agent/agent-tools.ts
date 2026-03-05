/**
 * 2Bot AI Agent Tool Definitions
 *
 * Defines all tools available to the AI agent as JSON Schema objects.
 * Each tool maps directly to a bridge agent action (or composite of actions)
 * that can be executed inside the user's workspace container.
 *
 * These definitions are sent to the AI provider (OpenAI/Anthropic) as
 * the `tools` parameter in function calling requests.
 *
 * @module modules/2bot-ai-agent/agent-tools
 */

import type { AgentToolDefinition } from "./agent.types";

// ===========================================
// File System Tools
// ===========================================

const readFile: AgentToolDefinition = {
  name: "read_file",
  description:
    "Read the contents of a file from the workspace. Returns the file content as a string. " +
    "Use this to inspect source code, configuration files, or any text file.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Relative path to the file from the workspace root (e.g., 'src/index.ts', 'package.json')",
      },
    },
    required: ["path"],
  },
};

const writeFile: AgentToolDefinition = {
  name: "write_file",
  description:
    "Write content to a file in the workspace. Creates the file if it doesn't exist, " +
    "or overwrites it if it does. Parent directories are created automatically. " +
    "Use this to create new files or update existing ones.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Relative path to the file from the workspace root (e.g., 'src/utils.ts')",
      },
      content: {
        type: "string",
        description: "The full content to write to the file",
      },
      createDirs: {
        type: "boolean",
        description: "Create parent directories if they don't exist (default: true)",
        default: true,
      },
    },
    required: ["path", "content"],
  },
};

const listDirectory: AgentToolDefinition = {
  name: "list_directory",
  description:
    "List files and directories in a workspace directory. Returns an array of entries " +
    "with name, type (file/directory), and size. Use this to explore the project structure.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Relative path to the directory (e.g., 'src', '.' for root). Defaults to workspace root.",
        default: ".",
      },
      recursive: {
        type: "boolean",
        description: "List files recursively in subdirectories (default: false)",
        default: false,
      },
    },
    required: [],
  },
};

const deleteFile: AgentToolDefinition = {
  name: "delete_file",
  description:
    "Delete a file or empty directory from the workspace. " +
    "Use with caution — this action cannot be undone.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file or directory to delete",
      },
    },
    required: ["path"],
  },
};

const createDirectory: AgentToolDefinition = {
  name: "create_directory",
  description:
    "Create a directory in the workspace. Creates parent directories as needed " +
    "(like mkdir -p).",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path for the new directory (e.g., 'src/components/auth')",
      },
    },
    required: ["path"],
  },
};

const fileStat: AgentToolDefinition = {
  name: "file_stat",
  description:
    "Get metadata about a file or directory (size, permissions, modification time). " +
    "Use this to check if a file exists or inspect its properties.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file or directory",
      },
    },
    required: ["path"],
  },
};

const renameFile: AgentToolDefinition = {
  name: "rename_file",
  description:
    "Rename or move a file or directory within the workspace.",
  parameters: {
    type: "object",
    properties: {
      oldPath: {
        type: "string",
        description: "Current relative path of the file/directory",
      },
      newPath: {
        type: "string",
        description: "New relative path for the file/directory",
      },
    },
    required: ["oldPath", "newPath"],
  },
};

// ===========================================
// Terminal / Command Execution Tools
// ===========================================

const runCommand: AgentToolDefinition = {
  name: "run_command",
  description:
    "Execute a shell command in the workspace terminal and return the output. " +
    "Use this to run build commands, tests, linters, scripts, or any CLI tool. " +
    "The command runs in the workspace root directory by default. " +
    "Commands are executed in a sandboxed container environment. " +
    "Destructive system commands (rm -rf /, shutdown, etc.) are blocked.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description:
          "The shell command to execute (e.g., 'npm test', 'cat package.json', 'ls -la src/')",
      },
      cwd: {
        type: "string",
        description:
          "Working directory relative to workspace root (default: workspace root)",
      },
    },
    required: ["command"],
  },
};

// ===========================================
// Git Tools
// ===========================================

const gitStatus: AgentToolDefinition = {
  name: "git_status",
  description:
    "Get the current git status of the workspace (modified files, staged changes, " +
    "current branch, etc.). Use this before making commits or to understand " +
    "what has changed.",
  parameters: {
    type: "object",
    properties: {
      dir: {
        type: "string",
        description: "Directory to check (default: workspace root)",
      },
    },
    required: [],
  },
};

const gitClone: AgentToolDefinition = {
  name: "git_clone",
  description:
    "Clone a git repository into the workspace. Use this to set up a project " +
    "from a remote repository.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Git repository URL (e.g., 'https://github.com/user/repo.git')",
      },
      targetDir: {
        type: "string",
        description: "Target directory name (default: derived from repo URL)",
      },
      branch: {
        type: "string",
        description: "Branch to checkout (default: default branch)",
      },
      depth: {
        type: "number",
        description: "Shallow clone depth (e.g., 1 for latest commit only)",
      },
    },
    required: ["url"],
  },
};

// ===========================================
// Package Management Tools
// ===========================================

const installPackage: AgentToolDefinition = {
  name: "install_package",
  description:
    "Install npm packages in the workspace. Supports installing one or more " +
    "packages. Use this to add dependencies needed for development.",
  parameters: {
    type: "object",
    properties: {
      packages: {
        type: "array",
        description:
          "Package names to install (e.g., ['express', 'typescript']). " +
          "Empty array runs 'npm install' to install from package.json.",
        items: { type: "string" },
      },
      dev: {
        type: "boolean",
        description: "Install as dev dependency (--save-dev)",
        default: false,
      },
      cwd: {
        type: "string",
        description: "Working directory (default: workspace root)",
      },
    },
    required: [],
  },
};

const listPackages: AgentToolDefinition = {
  name: "list_packages",
  description:
    "List installed npm packages and their versions in the workspace.",
  parameters: {
    type: "object",
    properties: {
      cwd: {
        type: "string",
        description: "Working directory (default: workspace root)",
      },
    },
    required: [],
  },
};

// ===========================================
// Search Tools
// ===========================================

const searchFiles: AgentToolDefinition = {
  name: "search_files",
  description:
    "Search for text content across files in the workspace using grep. " +
    "Returns matching lines with file paths and line numbers. " +
    "Use this to find where functions, variables, or patterns are used.",
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
        description:
          "File glob pattern to filter (e.g., '*.ts', '*.{js,jsx}')",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 50)",
        default: 50,
      },
    },
    required: ["pattern"],
  },
};

// ===========================================
// System Tools
// ===========================================

const systemStats: AgentToolDefinition = {
  name: "system_stats",
  description:
    "Get system resource usage of the workspace container (CPU, memory, disk). " +
    "Use this to check available resources or diagnose performance issues.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
};

// ===========================================
// Platform Tools (operate on 2bot services, not workspace container)
// ===========================================

const createCustomPlugin: AgentToolDefinition = {
  name: "create_custom_plugin",
  description:
    "Create a new custom JavaScript plugin for the user's 2Bot workspace. " +
    "The plugin code runs inside the workspace container. " +
    "Specify a name, description, and the full JavaScript source code.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Plugin display name (e.g., 'Echo Bot', 'Task Scheduler')",
      },
      description: {
        type: "string",
        description: "Short description of what the plugin does",
      },
      code: {
        type: "string",
        description: "Full JavaScript source code for the plugin",
      },
      category: {
        type: "string",
        description: "Plugin category (general, analytics, messaging, automation, moderation, utilities)",
        default: "general",
      },
    },
    required: ["name", "description", "code"],
  },
};

const listUserPlugins: AgentToolDefinition = {
  name: "list_user_plugins",
  description:
    "List all plugins the user currently has installed, including custom and store plugins. " +
    "Returns plugin names, slugs, enabled status, and gateway bindings.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
};

const installPlugin: AgentToolDefinition = {
  name: "install_plugin",
  description:
    "Install a plugin from the 2Bot plugin catalog by its slug. " +
    "Optionally specify a gateway ID to bind the plugin to a gateway. " +
    "Use list_available_plugins first to find the plugin slug.",
  parameters: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "Plugin slug (e.g., 'echo-bot', 'ai-chat')",
      },
      gatewayId: {
        type: "string",
        description: "Optional gateway ID to bind the plugin to",
      },
    },
    required: ["slug"],
  },
};

const listAvailablePlugins: AgentToolDefinition = {
  name: "list_available_plugins",
  description:
    "List all plugins available in the 2Bot plugin catalog. " +
    "Returns plugin names, slugs, descriptions, categories, and whether they're already installed.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
};

const listGateways: AgentToolDefinition = {
  name: "list_gateways",
  description:
    "List all gateways (Telegram bots, AI providers, custom gateways) configured by the user. " +
    "Returns gateway names, types, statuses, and IDs.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
};

const getWorkspaceStatus: AgentToolDefinition = {
  name: "get_workspace_status",
  description:
    "Get the current workspace container status, including whether it's running, " +
    "resource usage, running plugins, and uptime. Use this to check if the workspace " +
    "is ready before performing operations.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
};

const checkCredits: AgentToolDefinition = {
  name: "check_credits",
  description:
    "Check the user's current credit balance, monthly usage, and plan limits. " +
    "Credits are used for AI operations and platform actions.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
};

// --- Write / mutate tools ---

const createGateway: AgentToolDefinition = {
  name: "create_gateway",
  description:
    "Create a new gateway (Telegram bot, AI provider, or custom gateway). " +
    "For Telegram bots, you MUST provide the botToken. " +
    "For AI providers, provide provider name and apiKey. " +
    "For custom gateways, provide the target url. " +
    "Always use this tool when the user asks to add a bot or gateway — never give manual instructions.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Display name for the gateway (e.g., 'My Telegram Bot')",
      },
      type: {
        type: "string",
        enum: ["TELEGRAM_BOT", "AI", "CUSTOM_GATEWAY"],
        description: "Gateway type",
      },
      botToken: {
        type: "string",
        description: "Telegram bot token (required for TELEGRAM_BOT type). Get from @BotFather.",
      },
      provider: {
        type: "string",
        description: "AI provider name (required for AI type, e.g., 'openai', 'anthropic')",
      },
      apiKey: {
        type: "string",
        description: "API key (required for AI type)",
      },
      url: {
        type: "string",
        description: "Target URL (required for CUSTOM_GATEWAY type)",
      },
      webhookSecret: {
        type: "string",
        description: "Signing secret (optional, for CUSTOM_GATEWAY type)",
      },
    },
    required: ["name", "type"],
  },
};

const deleteGateway: AgentToolDefinition = {
  name: "delete_gateway",
  description:
    "Delete a gateway by its ID. Use list_gateways first to find the gateway ID. " +
    "This permanently removes the gateway and all its connections.",
  parameters: {
    type: "object",
    properties: {
      gatewayId: {
        type: "string",
        description: "The gateway ID to delete",
      },
    },
    required: ["gatewayId"],
  },
};

const updateGateway: AgentToolDefinition = {
  name: "update_gateway",
  description:
    "Update an existing gateway's name, credentials, or configuration. " +
    "Use list_gateways first to find the gateway ID.",
  parameters: {
    type: "object",
    properties: {
      gatewayId: {
        type: "string",
        description: "The gateway ID to update",
      },
      name: {
        type: "string",
        description: "New display name (optional)",
      },
      botToken: {
        type: "string",
        description: "New Telegram bot token (for TELEGRAM_BOT gateways)",
      },
      apiKey: {
        type: "string",
        description: "New API key (for AI gateways)",
      },
      url: {
        type: "string",
        description: "New target URL (for CUSTOM_GATEWAY gateways)",
      },
    },
    required: ["gatewayId"],
  },
};

const updateCustomPlugin: AgentToolDefinition = {
  name: "update_custom_plugin",
  description:
    "Update an existing custom plugin's code, name, description, or category. " +
    "Use list_user_plugins first to find the plugin ID.",
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
        description: "New JavaScript source code (optional)",
      },
      category: {
        type: "string",
        description: "New category (optional)",
      },
    },
    required: ["pluginId"],
  },
};

const deleteCustomPlugin: AgentToolDefinition = {
  name: "delete_custom_plugin",
  description:
    "Delete a custom plugin permanently. Only works for user-authored plugins (not built-in). " +
    "Removes all installations. Use list_user_plugins first to find the plugin ID.",
  parameters: {
    type: "object",
    properties: {
      pluginId: {
        type: "string",
        description: "The plugin ID to delete",
      },
    },
    required: ["pluginId"],
  },
};

const uninstallPlugin: AgentToolDefinition = {
  name: "uninstall_plugin",
  description:
    "Uninstall a plugin from the user's account. " +
    "Use list_user_plugins to find the user plugin installation ID.",
  parameters: {
    type: "object",
    properties: {
      userPluginId: {
        type: "string",
        description: "The user plugin installation ID to uninstall",
      },
    },
    required: ["userPluginId"],
  },
};

// ===========================================
// Tool Registry
// ===========================================

/**
 * All tools available to the AI agent.
 * Order matters for display in the UI.
 */
export const AGENT_TOOLS: AgentToolDefinition[] = [
  // File operations (most commonly used)
  readFile,
  writeFile,
  listDirectory,
  deleteFile,
  createDirectory,
  fileStat,
  renameFile,
  // Search
  searchFiles,
  // Terminal
  runCommand,
  // Git
  gitStatus,
  gitClone,
  // Packages
  installPackage,
  listPackages,
  // System
  systemStats,
  // Platform tools (operate on 2bot services directly)
  createCustomPlugin,
  listUserPlugins,
  installPlugin,
  listAvailablePlugins,
  listGateways,
  getWorkspaceStatus,
  checkCredits,
  // Platform write tools (mutate 2bot resources)
  createGateway,
  deleteGateway,
  updateGateway,
  updateCustomPlugin,
  deleteCustomPlugin,
  uninstallPlugin,
];

/**
 * Get a tool definition by name.
 */
export function getAgentTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

/**
 * Get all tool names.
 */
export function getAgentToolNames(): string[] {
  return AGENT_TOOLS.map((t) => t.name);
}

// ===========================================
// Bridge Action Mapping
// ===========================================

/**
 * Maps agent tool names to bridge agent actions.
 * Used by the agent executor to dispatch tool calls.
 */
export const TOOL_TO_BRIDGE_ACTION: Record<string, string> = {
  read_file: "file.read",
  write_file: "file.write",
  list_directory: "file.list",
  delete_file: "file.delete",
  create_directory: "file.mkdir",
  file_stat: "file.stat",
  rename_file: "file.rename",
  run_command: "terminal.create",  // Creates terminal + runs command
  git_status: "git.status",
  git_clone: "git.clone",
  install_package: "package.install",
  list_packages: "package.list",
  search_files: "file.list",  // Uses recursive file.list + grep via run_command
  system_stats: "system.stats",
};

/**
 * Tools that require special handling (not a simple bridge action dispatch).
 * These are handled with custom logic in the agent executor.
 */
export const COMPOSITE_TOOLS = new Set([
  "run_command",    // Creates terminal, sends command, waits for output
  "search_files",   // Runs grep via terminal command
]);

/**
 * Platform tools that call 2bot services directly (not the bridge agent).
 * These skip the workspace bridge and call platform service methods.
 */
export const PLATFORM_TOOLS = new Set([
  "create_custom_plugin",
  "list_user_plugins",
  "install_plugin",
  "list_available_plugins",
  "list_gateways",
  "get_workspace_status",
  "check_credits",
  "create_gateway",
  "delete_gateway",
  "update_gateway",
  "update_custom_plugin",
  "delete_custom_plugin",
  "uninstall_plugin",
]);

/**
 * Format tool definitions for OpenAI / OpenRouter / Together API format.
 * OpenAI uses: { type: "function", function: { name, description, parameters } }
 */
export function formatToolsForOpenAI(tools: AgentToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Format tool definitions for Anthropic API format.
 * Anthropic uses: { name, description, input_schema }
 */
export function formatToolsForAnthropic(tools: AgentToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}
