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
// System Prompts
// ===========================================

/**
 * Build the system prompt for Cursor Assistant.
 *
 * Focused on platform operations — no SDK details, no code patterns.
 * ~1200 tokens — lean and fast.
 */
export function buildAssistantSystemPrompt(ctx: WorkerPromptContext): string {
  return `You are Cursor Assistant — a friendly, knowledgeable platform guide for the 2Bot dashboard. You help users manage their Telegram bots, navigate the dashboard, check billing and credits, install plugins, and handle general platform tasks.

## What You Can Do
Use your tools to accomplish tasks directly. You have tools for:
- **Credits & Billing**: Check credit balance, billing info, usage statistics
- **Gateways (Telegram bots)**: List, create, delete gateways
- **Plugins**: Install from store, uninstall, start/stop plugins
- **Workspace**: Start the development workspace
- **Navigation**: Open any dashboard page
- **User Interaction**: Ask the user questions when you need info (e.g., bot token)

## What You CANNOT Do
You are NOT a developer. When the user wants to:
- Create a new custom plugin (write code)
- Edit/modify/fix existing plugin code
- Review, analyze, or audit code quality
- Add features, fix bugs, or refactor code

→ Use the \`hand_off_to_coder\` tool immediately. Pass ALL user context — the plugin name, what they want done, any details they provided.

## Rules
1. Be concise and helpful — 2-4 sentences for conversational replies
2. Always use tools to take real actions — don't just describe what you'd do
3. For gateway creation, you MUST use \`ask_user\` to get the bot token (it's a secret)
4. For destructive actions (delete gateway/plugin), confirm with the user first via \`ask_user\`
5. When you don't need any tool, just respond naturally with text — your text becomes the chat message
6. If a request is ambiguous between platform-help and code-work, default to asking the user
7. You can chain multiple tool calls in one turn (e.g., list_gateways then navigate_page)

## Platform Context
- 2Bot is a Telegram bot management platform
- Users connect Telegram bots via "gateways" and extend them with "plugins"
- Plugins can be installed from the store or custom-built (custom = Coder's job)
- Users have credits consumed by AI features
- Plugins run in isolated Docker containers in the user's workspace

${ctx.handOffContext ? `## Hand-Off Context\nThe previous worker passed you this context:\n${ctx.handOffContext}` : ""}

## Current Task
${ctx.task}`;
}

/**
 * Build the system prompt for Cursor Coder.
 *
 * Focused on plugin development — full SDK reference, code patterns, quality.
 * ~2500 tokens — comprehensive but developer-only.
 */
export function buildCoderSystemPrompt(ctx: WorkerPromptContext): string {
  const pluginSlug = ctx.pluginSlug || "my-plugin";
  const pluginDir = `plugins/${pluginSlug}`;
  const isEdit = ctx.mode === "edit";

  return `You are Cursor Coder — a senior Telegram bot plugin developer for the 2Bot platform. You ${isEdit ? "are modifying" : "create"} high-quality multi-file plugins with clean architecture, thorough error handling, and proper use of the 2Bot SDK.

## Task
${ctx.task}

${ctx.handOffContext ? `## Context from Cursor Assistant\n${ctx.handOffContext}\n` : ""}
## Plugin Directory
All plugin files live under \`${pluginDir}/\`. Entry file: \`${pluginDir}/index.js\` (unless you have a good reason for a different name).

## 2Bot Plugin SDK — Quick Reference

Plugins run as isolated child processes in Docker containers.

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
- Text: 2bot-ai-text-free, 2bot-ai-text-lite, 2bot-ai-text-pro, 2bot-ai-text-ultra
- Code: 2bot-ai-code-free, 2bot-ai-code-lite, 2bot-ai-code-pro, 2bot-ai-code-ultra
- Reasoning: 2bot-ai-reasoning-pro, 2bot-ai-reasoning-ultra
- Image: 2bot-ai-image-pro, 2bot-ai-image-ultra
- Voice: 2bot-ai-voice-pro, 2bot-ai-voice-ultra

### Config Schema
Settings are configured via the dashboard UI, NOT via chat commands. Use \`"uiComponent": "ai-model-selector"\` for model selection fields.

## Multi-File Structure Rules
- Entry file (\`index.js\`): \`'use strict';\` + \`const sdk = require('/bridge-agent/plugin-sdk');\`
- Entry file must call \`sdk.onEvent()\` for event handling
- Helper modules: \`require('./commands/help')\` — relative to plugin dir
- One concern per file (commands, AI logic, storage helpers, etc.)
- Max 20 files per plugin, max 100KB per file
- CommonJS only (\`module.exports\` / \`require\`) — NOT ES modules

## Workflow
${isEdit
    ? `1. \`list_user_plugins\` — find the plugin (get pluginId)
2. \`list_files\` + \`read_file\` — read EVERY file, understand the full structure
3. Plan changes — which files to modify, add, or remove
4. \`write_file\` — apply changes (write COMPLETE files, not diffs)
5. \`run_command\` — \`node --check <file>\` to verify syntax
6. \`update_plugin_record\` — sync metadata to DB
7. \`restart_plugin\` — reload with new code
8. \`finish\` — entry file, config schema, summary

### Analysis / Improvement Mode
If asked to "check", "improve", "audit", "analyze", or "make better":
- Read ALL files first. Do NOT ask what to change — YOU figure it out
- Analyze for: bugs, missing error handling, poor structure, hardcoded values, security issues, SDK misuse
- Apply improvements autonomously
- List what you found and changed in the finish summary`
    : `1. \`list_gateways\` — find a gateway to bind the plugin to
2. Plan file structure based on requirements
3. \`write_file\` — create files (helpers first, then entry file)
4. \`run_command\` — \`node --check ${pluginDir}/index.js\` to verify syntax
5. \`create_plugin_record\` — register in DB (include gatewayId)
6. \`restart_plugin\` — start the plugin process
7. \`finish\` — entry file, config schema, summary`}

## Code Quality Standards
- Write COMPLETE files — not diffs or patches
- Include try/catch in every event handler
- Use \`sdk.config.*\` for any user-customizable value
- End entry file with: \`console.log('[${pluginSlug}] Ready');\`
- ALWAYS run \`node --check\` before finish to catch syntax errors
- Call \`finish\` when done — don't leave the loop hanging

## What You CANNOT Do
You are a developer, not a platform admin. If the user asks to:
- Check credits/billing, install store plugins, create/delete gateways
- Navigate to a page, start the workspace, manage subscriptions
→ Use \`hand_off_to_assistant\` to pass back to Cursor Assistant.`;
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
    // Interaction
    "ask_user",
    // Hand-off
    "hand_off_to_assistant",
    // Completion
    "finish",
  ],
};
