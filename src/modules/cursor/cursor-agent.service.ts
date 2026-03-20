/**
 * Cursor Agent Service — Streaming Agentic Loop
 *
 * The Cursor's own AI agent that creates and edits plugins autonomously.
 * Instead of a single-shot text generation, the agent iterates with tools:
 * reads files, writes code, runs syntax checks, creates DB records, and
 * restarts plugins — all while streaming real-time events to the frontend.
 *
 * The frontend maps these events to live choreography actions so the user
 * watches the Cursor actually work — navigate to pages, type code, verify
 * syntax, save plugins — with zero fake timers.
 *
 * Architecture:
 *   runCursorAgentStream() → yields CursorAgentEvent → SSE → cursor-panel.tsx
 *                                                           → mapAgentEventToActions()
 *                                                           → cursor-provider queue
 *
 * Features:
 * - **Streaming events**: Real-time progress via async generator
 * - **Platform tools**: list_gateways, list_user_plugins, create_plugin_record,
 *   update_plugin_record, restart_plugin — agent is fully self-sufficient
 * - **Workspace tools**: read/write/list/delete files, run commands, search
 * - **Safety**: All tool calls validated via agent-safety
 * - **Session tracking**: DB-persisted sessions with credit/token accounting
 * - **Code preview**: write_file emits code snippets for typing animation
 * - **Rollback**: File snapshots for edit failure recovery
 *
 * @module modules/cursor/cursor-agent.service
 */

import crypto from "crypto";

import { logger } from "@/lib/logger";
import {
    checkSessionLimits,
    truncateToolOutput,
    validateToolCallArgs,
} from "@/modules/2bot-ai-agent/agent-safety";
import * as agentSessionService from "@/modules/2bot-ai-agent/agent-session.service";
import { twoBotAIProvider } from "@/modules/2bot-ai-provider";
import type { TextGenerationMessage, ToolDefinition } from "@/modules/2bot-ai-provider/types";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

import type {
    CursorAgentEvent,
    ToolStartMeta,
} from "./cursor-agent.types";
import { getBridgeClient, withBridgeRetry } from "./cursor-bridge";

const agentLog = logger.child({ module: "cursor", capability: "agent" });

// ===========================================
// Types
// ===========================================

/** A single tool available to the agent */
interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/** A tool call the LLM wants to make */
interface AgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Result of the full agent run (non-streaming convenience wrapper) */
export interface AgentResult {
  /** Whether the agent completed successfully */
  success: boolean;
  /** Map of files written (relative path → content) */
  files: Record<string, string>;
  /** Entry file (relative path inside plugin dir) */
  entry: string;
  /** JSON Schema for plugin config (if generated) */
  configSchema: Record<string, unknown>;
  /** Default config values */
  configDefaults: Record<string, unknown>;
  /** Human-readable summary of what was done */
  summary: string;
  /** Plugin DB ID (set when create_plugin_record tool is used) */
  pluginId?: string;
  /** Gateway name the plugin was auto-bound to */
  gatewayName?: string;
  /** Session ID for audit trail */
  sessionId?: string;
  /** Total credits consumed */
  creditsUsed?: number;
}

/** Request to start a Cursor Agent session */
export interface CursorAgentRequest {
  /** Plugin slug (used for the directory name) */
  pluginSlug: string;
  /** Human-readable plugin name */
  pluginName: string;
  /** What to build or change */
  task: string;
  /** User ID for billing + workspace access */
  userId: string;
  /** Org scope (null for personal) */
  organizationId: string | null;
  /** Mode: create a new plugin, edit an existing one */
  mode: "create" | "edit";
  /** AI model ID (defaults to "auto") */
  modelId?: string;
}

// ===========================================
// Agent Session Config (cursor-specific limits)
// ===========================================

const CURSOR_AGENT_CONFIG = {
  maxIterations: 20,
  maxCreditsPerSession: 25,
  sessionTimeoutMs: 180_000, // 3 minutes
  toolExecutionTimeoutMs: 30_000, // 30s per tool
};

// ===========================================
// Tool Definitions
// ===========================================

const AGENT_TOOLS: AgentTool[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file in the workspace. The path is relative to the workspace root (e.g. 'plugins/my-bot/index.js').",
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
  {
    name: "write_file",
    description:
      "Write or overwrite a file in the workspace. Directories are created automatically. The path is relative to the workspace root.",
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
  {
    name: "list_files",
    description:
      "List files and directories at a given path. Returns an array of file/directory names. Use recursive=true to list all nested files.",
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
  {
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
  {
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
  {
    name: "run_command",
    description:
      "Execute a shell command in the workspace and return stdout+stderr. " +
      "Use this for syntax checking (node --check file.js), running tests, " +
      "or any CLI operation. Commands run in the workspace root by default. " +
      "Destructive system commands are blocked.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "The shell command to execute (e.g., 'node --check plugins/my-bot/index.js', 'ls -la')",
        },
        cwd: {
          type: "string",
          description:
            "Working directory relative to workspace root (default: workspace root)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "search_files",
    description:
      "Search for text content across workspace files using grep. " +
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
            "File glob pattern to filter (e.g., '*.js', '*.{js,json}')",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 30)",
          default: 30,
        },
      },
      required: ["pattern"],
    },
  },

  // ── Platform tools (agent manages its own DB records) ─
  {
    name: "list_gateways",
    description:
      "List all gateways (Telegram bots, AI providers, custom gateways) the user has configured. " +
      "Returns gateway names, types, statuses, and IDs. Use this to find a gateway to bind the plugin to.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_user_plugins",
    description:
      "List all plugins the user currently has installed. " +
      "Returns plugin names, slugs, enabled status. Use this to check for name conflicts " +
      "or understand the existing plugin setup before creating/editing.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "create_plugin_record",
    description:
      "Create the plugin database record on the 2Bot platform. " +
      "Call this AFTER writing all plugin files to the workspace. " +
      "This registers the plugin in the system so it appears in the dashboard. " +
      "The code/files must already be written to the workspace by write_file.",
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
          description: "Plugin category (general, analytics, messaging, automation, moderation, utilities)",
          default: "general",
        },
      },
      required: ["name", "slug", "description", "entry"],
    },
  },
  {
    name: "update_plugin_record",
    description:
      "Update an existing custom plugin's metadata or code in the database. " +
      "Use this after editing plugin files to sync the DB record. " +
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
          description: "New single-file plugin code (optional, for single-file plugins)",
        },
        configSchema: {
          type: "object",
          description: "Updated config schema (optional)",
        },
      },
      required: ["pluginId"],
    },
  },
  {
    name: "restart_plugin",
    description:
      "Stop and restart a plugin process in the workspace container. " +
      "Call this after writing updated files so the plugin reloads with new code.",
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

  // ── Cursor-specific: finish tool ──────────────────────
  {
    name: "finish",
    description:
      "Signal that you are done. Provide the entry file path, config schema, and a summary of what was built/changed. " +
      "You MUST call this when your work is complete.",
    parameters: {
      type: "object",
      properties: {
        entry: {
          type: "string",
          description:
            "Entry file relative to the plugin directory (e.g. 'index.js')",
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
];

// ===========================================
// Tool Execution (with safety validation)
// ===========================================

/**
 * Execute a single agent tool call against the workspace container.
 * Validates inputs via agent-safety, then dispatches to the bridge.
 */
async function executeTool(
  client: BridgeClient,
  call: AgentToolCall,
  pluginDir: string,
  writtenFiles: Record<string, string>,
  ctx: { userId: string; organizationId: string | null },
): Promise<{ result: string; finished?: boolean; finishData?: Partial<AgentResult> }> {
  const args = call.arguments;

  // ── Safety validation (from agent-safety module) ─────
  // Map cursor tool names to the agent-safety validator names
  const safetyToolName = call.name === "list_files" ? "list_directory" : call.name;
  // finish is cursor-specific, skip safety check
  if (safetyToolName !== "finish") {
    const safetyError = validateToolCallArgs(safetyToolName, args);
    if (safetyError) {
      agentLog.warn(
        { tool: call.name, reason: safetyError },
        "Cursor agent tool call blocked by safety",
      );
      return { result: `Blocked: ${safetyError}` };
    }
  }

  switch (call.name) {
    case "read_file": {
      const path = args.path as string;
      try {
        const result = await withBridgeRetry(
          () => client.fileRead(path) as Promise<{ content?: string }>,
          `read_file:${path}`,
        );
        const content = result?.content ?? "(empty file)";
        return { result: truncateToolOutput(content) };
      } catch {
        return { result: `Error: file not found or not readable: ${path}` };
      }
    }

    case "write_file": {
      const path = args.path as string;
      const content = args.content as string;
      try {
        await withBridgeRetry(
          () => client.fileWrite(path, content, true),
          `write_file:${path}`,
        );
        // Track what was written (relative to plugin dir for the output)
        const relativePath = path.startsWith(pluginDir + "/")
          ? path.slice(pluginDir.length + 1)
          : path;
        writtenFiles[relativePath] = content;
        return { result: `Written: ${path} (${content.length} bytes)` };
      } catch (err) {
        return { result: `Error writing ${path}: ${(err as Error).message}` };
      }
    }

    case "list_files": {
      const path = (args.path as string) || "/";
      const recursive = (args.recursive as boolean) || false;
      try {
        const result = await withBridgeRetry(
          () => client.fileList(path, recursive),
          `list_files:${path}`,
        );
        return { result: truncateToolOutput(JSON.stringify(result, null, 2)) };
      } catch {
        return { result: `Error listing ${path}: directory not found` };
      }
    }

    case "create_directory": {
      const path = args.path as string;
      try {
        await withBridgeRetry(
          () => client.fileMkdir(path),
          `create_directory:${path}`,
        );
        return { result: `Created directory: ${path}` };
      } catch {
        return { result: `Error creating directory: ${path}` };
      }
    }

    case "delete_file": {
      const path = args.path as string;
      try {
        await withBridgeRetry(
          () => client.fileDelete(path),
          `delete_file:${path}`,
        );
        // Remove from tracked files
        const relativePath = path.startsWith(pluginDir + "/")
          ? path.slice(pluginDir.length + 1)
          : path;
        delete writtenFiles[relativePath];
        return { result: `Deleted: ${path}` };
      } catch {
        return { result: `Error deleting ${path}: file not found` };
      }
    }

    // ── New: Terminal command execution ─────────────────
    case "run_command": {
      const command = args.command as string;
      const cwd = (args.cwd as string) || undefined;
      try {
        // Execute via bridge agent terminal
        const result = await withBridgeRetry(
          () => client.send("terminal.create", {
            command,
            cwd,
            timeout: CURSOR_AGENT_CONFIG.toolExecutionTimeoutMs,
          }),
          `run_command:${command.slice(0, 50)}`,
        ) as { output?: string; exitCode?: number; error?: string };

        const output = result?.output ?? result?.error ?? "(no output)";
        const exitCode = result?.exitCode ?? -1;
        const prefix = exitCode === 0 ? "✅" : "❌";
        return { result: truncateToolOutput(`${prefix} Exit code: ${exitCode}\n${output}`) };
      } catch (err) {
        return { result: `Error running command: ${(err as Error).message}` };
      }
    }

    // ── New: File search via grep ──────────────────────
    case "search_files": {
      const pattern = args.pattern as string;
      const searchPath = (args.path as string) || ".";
      const maxResults = (args.maxResults as number) || 30;
      const filePattern = args.filePattern as string | undefined;

      // Build a grep command
      const escapedPattern = pattern.replace(/'/g, "'\\''");
      let grepCmd = `grep -rn -m ${maxResults} '${escapedPattern}' ${searchPath}`;
      if (filePattern) {
        grepCmd = `grep -rn --include='${filePattern}' -m ${maxResults} '${escapedPattern}' ${searchPath}`;
      }

      try {
        const result = await withBridgeRetry(
          () => client.send("terminal.create", {
            command: grepCmd,
            timeout: 15_000,
          }),
          `search_files:${pattern.slice(0, 30)}`,
        ) as { output?: string; exitCode?: number };

        const output = result?.output ?? "(no matches)";
        return { result: truncateToolOutput(output) };
      } catch {
        return { result: `Search error: could not execute grep for "${pattern}"` };
      }
    }

    // ── Cursor-specific: finish ────────────────────────
    case "finish": {
      return {
        result: "Agent finished.",
        finished: true,
        finishData: {
          entry: (args.entry as string) || "index.js",
          configSchema: (args.configSchema as Record<string, unknown>) || {},
          configDefaults: (args.configDefaults as Record<string, unknown>) || {},
          summary: (args.summary as string) || "Plugin files updated",
        },
      };
    }

    // ── Platform tools ─────────────────────────────────
    case "list_gateways": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
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
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const plugins = await pluginService.getUserPlugins(svcCtx);
        const summary = plugins.map((p) =>
          `- ${p.pluginName} (slug: ${p.pluginSlug}, enabled: ${p.isEnabled}) [pluginId: ${p.pluginId}, userPluginId: ${p.id}]`,
        ).join("\n");
        return { result: summary || "(no plugins installed)" };
      } catch (err) {
        return { result: `Error listing plugins: ${(err as Error).message}` };
      }
    }

    case "create_plugin_record": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        if (ctx.organizationId) {
          (svcCtx as { organizationId?: string }).organizationId = ctx.organizationId;
        }

        const pluginName = args.name as string;
        const pluginSlug = args.slug as string;
        const description = (args.description as string) || "Created by Cursor Agent";
        const entry = (args.entry as string) || "index.js";
        const configSchema = (args.configSchema as Record<string, unknown>) || {};
        const configDefaults = (args.configDefaults as Record<string, unknown>) || {};
        const gatewayId = args.gatewayId as string | undefined;
        const category = (args.category as string) || "general";

        const plugin = await pluginService.createCustomPlugin(svcCtx, {
          slug: pluginSlug,
          name: pluginName,
          description,
          files: writtenFiles,
          entry,
          category: category as "general" | "analytics" | "messaging" | "automation" | "moderation" | "utilities",
          requiredGateways: ["TELEGRAM_BOT"],
          gatewayId,
          configSchema: Object.keys(configSchema).length > 0 ? configSchema : undefined,
          config: Object.keys(configDefaults).length > 0 ? configDefaults : undefined,
        });

        return {
          result: `Plugin "${plugin.pluginName}" created successfully [ID: ${plugin.id}, slug: ${plugin.pluginSlug}]`,
          finishData: {
            pluginId: plugin.id,
          },
        };
      } catch (err) {
        return { result: `Error creating plugin record: ${(err as Error).message}` };
      }
    }

    case "update_plugin_record": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const pluginId = args.pluginId as string;
        const updateData: Record<string, unknown> = {};
        if (args.name) updateData.name = args.name;
        if (args.description) updateData.description = args.description;
        if (args.code) updateData.code = args.code;
        if (args.configSchema) updateData.configSchema = args.configSchema;

        await pluginService.updateCustomPlugin(svcCtx, pluginId, updateData as {
          code?: string; name?: string; description?: string;
          configSchema?: Record<string, unknown>;
        });

        return { result: `Plugin ${pluginId} updated successfully.` };
      } catch (err) {
        return { result: `Error updating plugin record: ${(err as Error).message}` };
      }
    }

    case "restart_plugin": {
      const slug = args.slug as string;
      const entry = (args.entry as string) || "index.js";
      const entryFile = `plugins/${slug}/${entry}`;

      try {
        // Stop existing process (may not be running)
        try {
          await client.send("plugin.stop", { file: entryFile });
        } catch { /* may not be running — fine */ }

        // Start new process
        await client.send("plugin.start", { file: entryFile });
        return { result: `Plugin "${slug}" restarted (entry: ${entryFile})` };
      } catch (err) {
        return { result: `Error restarting plugin: ${(err as Error).message}` };
      }
    }

    default:
      return { result: `Unknown tool: ${call.name}` };
  }
}

// ===========================================
// Agent System Prompt
// ===========================================

function buildAgentSystemPrompt(pluginSlug: string, task: string, isEdit: boolean): string {
  const pluginDir = `plugins/${pluginSlug}`;

  return `You are a senior plugin developer for the 2Bot platform. You are ${isEdit ? "modifying" : "creating"} a multi-file plugin.

## Task
${task}

## Plugin Directory
All plugin files live under \`${pluginDir}/\`. The entry file should be at \`${pluginDir}/index.js\` unless you have a good reason to use a different name.

## 2Bot Plugin SDK — Quick Reference

Plugins run as isolated child processes in Docker containers. The SDK is the ONLY way to interact with the platform.

\`\`\`js
const sdk = require('/bridge-agent/plugin-sdk');
\`\`\`

### Key APIs
- \`sdk.onEvent(async (event) => { ... })\` — receive Telegram events
- \`sdk.gateway.execute(gatewayId, method, params)\` — send Telegram messages
- \`sdk.storage.get/set/delete/has/increment/keys\` — persistent key-value store
- \`sdk.config\` — user-configurable settings (set via dashboard UI)
- \`sdk.ai.chat({ messages, model, temperature, maxTokens })\` — AI text generation
- \`sdk.ai.generateImage({ prompt, model })\` — AI image generation
- \`sdk.ai.speak({ text, model, voice })\` — AI speech generation
- \`sdk.onInstall/onEnable/onDisable\` — lifecycle hooks

### Available AI Models
Use "auto" (default — cheapest available) or a specific real model ID from the model selector.
Legacy tier IDs (2bot-ai-text-pro, etc.) are still supported but real models are preferred.

### Config Schema
Settings are configured via the dashboard UI, NOT via chat commands. Use \`"uiComponent": "ai-model-selector"\` for model selection fields.

## Multi-File Structure Rules
- Entry file (\`index.js\`) must have \`'use strict';\` and \`const sdk = require('/bridge-agent/plugin-sdk');\`
- Entry file must call \`sdk.onEvent()\` for event handling
- Helper modules can be \`require('./commands/help')\` etc. — they're relative to the plugin dir
- Keep files focused: one concern per file (commands, AI logic, storage helpers, etc.)
- Max 20 files per plugin, max 100KB per file
- Always use CommonJS (\`module.exports\` / \`require\`) — NOT ES modules

## Available Tools
- **read_file** / **write_file** / **list_files** / **create_directory** / **delete_file** — workspace file operations
- **run_command** — execute shell commands (use for \`node --check file.js\` syntax verification!)
- **search_files** — grep across workspace files
- **list_gateways** — find gateways (Telegram bots, etc.) to bind the plugin to
- **list_user_plugins** — check existing plugins (name conflicts, discover IDs for editing)
- **create_plugin_record** — register the plugin in the database (call AFTER writing files)
- **update_plugin_record** — update an existing plugin's metadata in the database
- **restart_plugin** — stop and restart a plugin process so new code takes effect
- **finish** — MUST call when done to provide entry file, config schema, and summary

## Workflow
${isEdit
    ? `1. Use \`list_user_plugins\` to find the plugin you're editing (get the pluginId)
2. Use \`list_files\` and \`read_file\` to understand the FULL current plugin structure — read EVERY file, not just the entry file
3. Plan your changes — which files need to be modified, added, or removed
4. Use \`write_file\` to apply changes (write the COMPLETE file, not diffs)
5. Use \`run_command\` with \`node --check <file>\` to verify syntax
6. Use \`update_plugin_record\` to sync new metadata to the database
7. Use \`restart_plugin\` to reload the plugin with new code
8. Call \`finish\` with the entry file, config schema, and summary

### Analysis / Improvement Mode
If the task asks you to "check", "improve", "audit", "review", "analyze", or "make better" — this means:
- Read ALL files first. Do NOT ask the user what to change. YOU figure it out.
- Analyze the code for: bugs, missing error handling, poor structure, hardcoded values that should be config, missing features, security issues, performance problems, SDK misuse
- Then apply improvements autonomously — fix real issues, refactor messy code, add missing error handling, move hardcoded values to sdk.config, improve code organization
- In your \`finish\` summary, clearly list what you found and what you changed`
    : `1. Use \`list_gateways\` to find a gateway (Telegram bot) to bind the plugin to
2. Plan the file structure based on the task requirements
3. Create files with \`write_file\` — start with helper modules, then the entry file
4. Ensure the entry file (\`${pluginDir}/index.js\`) ties everything together
5. Use \`run_command\` with \`node --check ${pluginDir}/index.js\` to verify syntax
6. Use \`create_plugin_record\` to register the plugin in the database (include the gatewayId)
7. Use \`restart_plugin\` to start the plugin process
8. Call \`finish\` with the entry file, config schema, and summary`}

## Important
- Write COMPLETE files — not diffs or patches
- Include error handling with try/catch in every event handler
- Use \`sdk.config.*\` for any value the user should be able to customize
- End the entry file with a ready log: \`console.log('[plugin] Ready');\`
- ALWAYS run \`node --check <entry_file>\` before calling finish to catch syntax errors
- Call \`finish\` when you're done — don't leave the loop hanging`;
}

// ===========================================
// Tool Metadata Helper
// ===========================================

/**
 * Build a ToolStartMeta object from a tool call for UI display.
 */
function buildToolStartMeta(call: AgentToolCall): ToolStartMeta {
  const args = call.arguments;
  switch (call.name) {
    case "read_file":
      return { kind: "read_file", path: (args.path as string) || "" };
    case "write_file":
      return { kind: "write_file", path: (args.path as string) || "", bytes: ((args.content as string) || "").length };
    case "list_files":
      return { kind: "list_files", path: (args.path as string) || "/" };
    case "create_directory":
      return { kind: "create_directory", path: (args.path as string) || "" };
    case "delete_file":
      return { kind: "delete_file", path: (args.path as string) || "" };
    case "run_command":
      return { kind: "run_command", command: (args.command as string) || "" };
    case "search_files":
      return { kind: "search_files", pattern: (args.pattern as string) || "" };
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
    default:
      return { kind: "unknown", tool: call.name };
  }
}

// ===========================================
// Streaming Agent Loop (async generator)
// ===========================================

/**
 * Run the Cursor Agent as a streaming async generator.
 *
 * Yields CursorAgentEvent objects as the agent works — each event
 * can be serialized to SSE and consumed by the frontend for real-time
 * choreography animation.
 *
 * @param request - CursorAgentRequest with slug, name, task, userId, etc.
 * @yields CursorAgentEvent — session_start, iteration_start, thinking,
 *         tool_start, tool_result, code_preview, status, done, error
 */
export async function* runCursorAgentStream(
  request: CursorAgentRequest,
): AsyncGenerator<CursorAgentEvent> {
  const {
    pluginSlug,
    pluginName,
    task,
    userId,
    organizationId,
    mode,
  } = request;

  const isEdit = mode === "edit";
  const pluginDir = `plugins/${pluginSlug}`;

  // ── Session setup ────────────────────────────────────
  const sessionId = crypto.randomUUID();
  const startedAt = new Date();
  let iterationCount = 0;
  let toolCallCount = 0;
  let totalCreditsUsed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  yield {
    type: "session_start" as const,
    sessionId,
    mode,
    pluginSlug,
    pluginName,
  };

  // Get bridge connection
  const bridge = await getBridgeClient(userId, organizationId);
  if (!bridge) {
    yield {
      type: "error" as const,
      message: "No running workspace found. Please start your workspace first.",
      sessionId,
      creditsUsed: 0,
    };
    return;
  }

  const { client, workspaceId } = bridge;

  const agentModel = request.modelId || "auto";

  // Persist session to database (fire-and-forget)
  agentSessionService.createSession({
    id: sessionId,
    userId,
    organizationId: organizationId ?? undefined,
    workspaceId,
    model: agentModel,
    prompt: `[cursor-agent] ${isEdit ? "edit" : "create"}: ${task.slice(0, 500)}`,
  });

  agentLog.info(
    {
      sessionId,
      userId,
      pluginSlug,
      isEdit,
      workspaceId,
      maxIterations: CURSOR_AGENT_CONFIG.maxIterations,
    },
    "🤖 Cursor agent session started",
  );

  yield { type: "status" as const, message: isEdit ? "Reading current plugin files…" : "Planning plugin structure…" };

  const systemPrompt = buildAgentSystemPrompt(pluginSlug, task, isEdit);
  const toolDefs: ToolDefinition[] = AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as ToolDefinition["parameters"],
  }));

  const messages: TextGenerationMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Seed message
  if (isEdit) {
    messages.push({
      role: "user",
      content: `Please ${task}. Start by listing and reading the current files in \`${pluginDir}/\` to understand the existing structure, then make the requested changes.`,
    });
  } else {
    messages.push({
      role: "user",
      content: `Please create a multi-file plugin. ${task}. Plan the file structure, then create each file using write_file. Files go under \`${pluginDir}/\`.`,
    });
  }

  const writtenFiles: Record<string, string> = {};
  let finishData: Partial<AgentResult> | undefined;
  let pluginId: string | undefined;

  // Context for platform tool calls
  const ctx = { userId, organizationId };

  // Snapshot existing files before editing so we can rollback on failure
  const originalFiles: Record<string, string> = {};
  if (isEdit) {
    try {
      const existing = await client.fileList(pluginDir, true) as Array<{ name: string; type: string }>;
      const files = (existing || []).filter((f) => f.type === "file");
      for (const f of files) {
        try {
          const content = await client.fileRead(`${pluginDir}/${f.name}`) as { content?: string };
          if (content?.content) {
            originalFiles[f.name] = content.content;
          }
        } catch { /* skip unreadable files */ }
      }
      agentLog.info({ sessionId, pluginSlug, snapshotCount: Object.keys(originalFiles).length }, "Captured file snapshot for rollback");
    } catch {
      agentLog.warn({ sessionId, pluginSlug }, "Could not snapshot existing files — rollback will not be available");
    }
  }

  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;
  let toolCallSequence = 0;

  try {
    for (let turn = 0; turn < CURSOR_AGENT_CONFIG.maxIterations; turn++) {
      // ── Safety check: session limits ───────────────────
      const limitError = checkSessionLimits(
        iterationCount,
        totalCreditsUsed,
        startedAt,
        CURSOR_AGENT_CONFIG,
      );

      if (limitError) {
        agentLog.warn(
          { sessionId, pluginSlug, reason: limitError },
          "⚠️ Cursor agent session limit reached",
        );
        yield { type: "status" as const, message: `Session limit reached: ${limitError}` };
        break;
      }

      iterationCount++;

      yield {
        type: "iteration_start" as const,
        iteration: iterationCount,
        totalCreditsUsed,
      };

      agentLog.info(
        { sessionId, userId, pluginSlug, turn, iterationCount, creditsUsed: totalCreditsUsed },
        "🔄 Cursor agent iteration",
      );

      try {
        const response = await twoBotAIProvider.textGeneration({
          messages,
          model: agentModel,
          temperature: 0.2,
          maxTokens: 4096,
          stream: false,
          userId,
          tools: toolDefs,
          toolChoice: "auto",
          feature: "cursor",
          capability: "code-generation",
        });

        // ── Track credits + tokens ───────────────────────
        totalCreditsUsed += response.creditsUsed ?? 0;
        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;

        const assistantContent = response.content || "";
        const toolCalls = response.toolCalls;

        // Emit thinking event if the LLM produced text
        if (assistantContent) {
          yield { type: "thinking" as const, text: assistantContent };
        }

        // If the LLM responds with text only (no tool calls), it's done
        if (!toolCalls || toolCalls.length === 0) {
          agentLog.info(
            { sessionId, pluginSlug, turn },
            "Agent responded with text only — treating as done",
          );
          break;
        }

        // Add assistant content to messages
        if (assistantContent) {
          messages.push({ role: "assistant", content: assistantContent });
        }

        // Execute each tool call and feed results back
        let finished = false;
        for (const tc of toolCalls) {
          // Emit tool_start event
          yield {
            type: "tool_start" as const,
            tool: tc.name,
            meta: buildToolStartMeta({ name: tc.name, arguments: tc.arguments }),
          };

          const toolResult = await executeTool(
            client,
            { name: tc.name, arguments: tc.arguments },
            pluginDir,
            writtenFiles,
            ctx,
          );

          toolCallCount++;

          const isError = toolResult.result.startsWith("Blocked:") || toolResult.result.startsWith("Error");

          // Emit tool_result event
          yield {
            type: "tool_result" as const,
            tool: tc.name,
            success: !isError,
            summary: toolResult.result.slice(0, 200),
          };

          // Emit code_preview on write_file
          if (tc.name === "write_file" && !isError) {
            const filePath = (tc.arguments.path as string) || "";
            const relativePath = filePath.startsWith(pluginDir + "/")
              ? filePath.slice(pluginDir.length + 1)
              : filePath;
            const content = (tc.arguments.content as string) || "";
            yield {
              type: "code_preview" as const,
              file: relativePath,
              preview: content.slice(0, 500),
              totalBytes: content.length,
            };
          }

          // Track plugin creation data
          if (tc.name === "create_plugin_record" && toolResult.finishData?.pluginId) {
            pluginId = toolResult.finishData.pluginId;
          }

          // Persist tool call to DB (fire-and-forget)
          agentSessionService.recordToolCall(
            sessionId,
            {
              toolCallId: tc.id ?? `tc-${toolCallSequence}`,
              toolName: tc.name,
              output: toolResult.result,
              isError,
              durationMs: 0,
            },
            tc.arguments,
            toolCallSequence,
          );
          toolCallSequence++;

          // Feed tool result back as a user message
          const statusPrefix = isError ? "❌ TOOL ERROR" : "✅ TOOL RESULT";
          messages.push({
            role: "user",
            content: `[${statusPrefix}: ${tc.name}]\n${toolResult.result}`,
          });

          if (toolResult.finished) {
            finished = true;
            finishData = toolResult.finishData;
          }
        }

        if (finished) break;

        // Reset consecutive error counter on successful turn
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        agentLog.error(
          { sessionId, pluginSlug, turn, consecutiveErrors, error: (err as Error).message },
          "Agent loop error",
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          agentLog.error({ sessionId, pluginSlug }, "Too many consecutive errors — aborting agent loop");
          break;
        }
        // Add error context so LLM can recover on next turn
        messages.push({
          role: "user",
          content: `[⚠️ SYSTEM ERROR] An error occurred: ${(err as Error).message}. Please try a different approach or adjust your last action.`,
        });
      }
    }
  } finally {
    // ── Persist session completion ──────────────────────
    const durationMs = Date.now() - startedAt.getTime();
    const status = finishData ? "completed" : (Object.keys(writtenFiles).length > 0 ? "completed" : "error");

    agentSessionService.completeSession({
      id: sessionId,
      status,
      iterationCount,
      toolCallCount,
      totalCreditsUsed,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      finalResponse: finishData?.summary,
      error: status === "error" ? "Agent failed to produce files" : undefined,
      durationMs,
    });

    agentLog.info(
      {
        sessionId,
        pluginSlug,
        status,
        iterations: iterationCount,
        toolCalls: toolCallCount,
        creditsUsed: totalCreditsUsed,
        durationMs,
        filesWritten: Object.keys(writtenFiles).length,
      },
      status === "error" ? "❌ Cursor agent session failed" : "✅ Cursor agent session completed",
    );
  }

  // ── Emit final event ─────────────────────────────────
  const durationMs = Date.now() - startedAt.getTime();
  const success = !!(finishData || Object.keys(writtenFiles).length > 0);

  if (success) {
    yield {
      type: "done" as const,
      success: true,
      sessionId,
      pluginName,
      pluginSlug,
      pluginId,
      summary: finishData?.summary || "Plugin files created/updated",
      fileCount: Object.keys(writtenFiles).length,
      filesWritten: Object.keys(writtenFiles),
      creditsUsed: totalCreditsUsed,
      durationMs,
      entry: finishData?.entry || "index.js",
    };
  } else {
    // Total failure — attempt rollback if we have original file snapshots
    if (isEdit && Object.keys(originalFiles).length > 0) {
      agentLog.info({ sessionId, pluginSlug, fileCount: Object.keys(originalFiles).length }, "Rolling back to original files");
      for (const [relPath, content] of Object.entries(originalFiles)) {
        try {
          await client.fileWrite(`${pluginDir}/${relPath}`, content, true);
        } catch {
          agentLog.warn({ sessionId, pluginSlug, file: relPath }, "Rollback write failed for file");
        }
      }
    }

    yield {
      type: "error" as const,
      message: "Agent failed to produce any files." +
        (isEdit && Object.keys(originalFiles).length > 0 ? " Original files have been restored." : ""),
      sessionId,
      filesWritten: Object.keys(writtenFiles),
      creditsUsed: totalCreditsUsed,
    };
  }
}

// ===========================================
// Convenience Wrapper (non-streaming)
// ===========================================

/**
 * Run the agent loop and collect the result (non-streaming).
 *
 * This is a convenience wrapper around runCursorAgentStream that
 * collects all events and returns a single AgentResult. Used by
 * callers that don't need real-time streaming.
 */
export async function runAgentLoop(
  pluginSlug: string,
  task: string,
  userId: string,
  organizationId: string | null,
  isEdit = false,
): Promise<AgentResult> {
  const stream = runCursorAgentStream({
    pluginSlug,
    pluginName: pluginSlug, // fallback — caller can use CursorAgentRequest for richer name
    task,
    userId,
    organizationId,
    mode: isEdit ? "edit" : "create",
  });

  let result: AgentResult = {
    success: false,
    files: {},
    entry: "index.js",
    configSchema: {},
    configDefaults: {},
    summary: "Agent failed to produce any files.",
  };

  for await (const event of stream) {
    switch (event.type) {
      case "done":
        result = {
          success: event.success,
          files: {}, // files are tracked internally, not exposed via events
          entry: event.entry,
          configSchema: {},
          configDefaults: {},
          summary: event.summary,
          pluginId: event.pluginId,
          sessionId: event.sessionId,
          creditsUsed: event.creditsUsed,
        };
        break;
      case "error":
        result = {
          success: false,
          files: {},
          entry: "index.js",
          configSchema: {},
          configDefaults: {},
          summary: event.message,
          sessionId: event.sessionId,
          creditsUsed: event.creditsUsed,
        };
        break;
    }
  }

  return result;
}

/**
 * Restart a plugin after the agent has written files.
 * Stops the old process and starts the new one from the entry file.
 */
export async function restartPluginAfterAgent(
  pluginSlug: string,
  entry: string,
  userId: string,
  organizationId: string | null,
  env?: Record<string, string>,
): Promise<boolean> {
  const bridge = await getBridgeClient(userId, organizationId);
  if (!bridge) return false;

  const entryFile = `plugins/${pluginSlug}/${entry}`;

  try {
    // Stop existing process
    try {
      await bridge.client.send("plugin.stop", { file: entryFile });
    } catch {
      // May not be running — that's fine
    }

    // Start new process
    await bridge.client.send("plugin.start", { file: entryFile, env });
    agentLog.info({ pluginSlug, entryFile }, "Plugin restarted after agent edit");
    return true;
  } catch (err) {
    agentLog.warn(
      { pluginSlug, entryFile, error: (err as Error).message },
      "Failed to restart plugin after agent edit",
    );
    return false;
  }
}
