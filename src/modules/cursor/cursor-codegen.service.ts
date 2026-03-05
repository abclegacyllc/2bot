/**
 * Cursor Code Generation Service
 *
 * AI-powered plugin code generation + config schema detection.
 * Extracted from the 2bot-ai route to keep the cursor module self-contained.
 *
 * @module modules/cursor/cursor-codegen.service
 */

import { logger } from "@/lib/logger";
import { twoBotAIProvider } from "@/modules/2bot-ai-provider";

import type { GeneratedMultiFilePlugin, GeneratedPlugin } from "./cursor.types";

const genLog = logger.child({ module: "cursor", capability: "code-gen" });

// ===========================================
// Fallback Template
// ===========================================

export const FALLBACK_PLUGIN_CODE = `'use strict';

const sdk = require('/bridge-agent/plugin-sdk');

sdk.onEvent(async (event) => {
  if (event.type !== 'telegram.message') return;
  const msg = event.data?.message;
  if (!msg?.text) return;

  await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: msg.chat.id,
    text: 'Hello from ' + (process.env.PLUGIN_NAME || 'my plugin') + '!',
  });
});

console.log('[plugin] Ready — waiting for events');
`;

// ===========================================
// Code Generation
// ===========================================

/**
 * Generate plugin JavaScript code AND configSchema using the AI model.
 * Returns code + a JSON Schema config so the platform UI shows proper settings.
 */
export async function generatePluginCode(
  pluginName: string,
  description: string,
  userId: string,
  richSpec?: string,
): Promise<GeneratedPlugin> {
  // If we have a rich spec from the design conversation, use it for much better output
  const pluginDetails = richSpec
    ? `**Plugin Name:** ${pluginName}\n**Detailed Specification:**\n${richSpec}`
    : `**Plugin Name:** ${pluginName}\n**What it should do:** ${description}`;

  const codeGenPrompt = `You are an expert code generator for the 2Bot platform. Generate a complete, production-quality Node.js plugin WITH its configuration schema.

${pluginDetails}

## 2Bot Plugin SDK — EXACT API Reference

Plugins run as isolated child processes inside Docker containers. The SDK is the ONLY way to interact with the platform.

\`\`\`js
const sdk = require('/bridge-agent/plugin-sdk');
\`\`\`

### Event Handling (recommended pattern)
\`\`\`js
sdk.onEvent(async (event) => {
  // event.type = 'telegram.message' | 'telegram.callback' | 'telegram.inline_query' | etc.
  // event.data = full Telegram update object (see Telegram Bot API docs)
  // event.gatewayId = which gateway sent this event (MUST pass to gateway.execute)
  const msg = event.data?.message;
  // msg.text, msg.chat.id, msg.from.id, msg.from.first_name, etc.
});
\`\`\`

### Gateway API — send Telegram commands
\`\`\`js
await sdk.gateway.execute(gatewayId, 'sendMessage', { chat_id, text, parse_mode: 'HTML' });
await sdk.gateway.execute(gatewayId, 'sendPhoto', { chat_id, photo: url, caption });
await sdk.gateway.execute(gatewayId, 'sendMessage', {
  chat_id, text, reply_markup: JSON.stringify({
    inline_keyboard: [[{ text: 'Button', callback_data: 'action_1' }]]
  })
});
await sdk.gateway.execute(gatewayId, 'answerCallbackQuery', { callback_query_id, text });
await sdk.gateway.execute(gatewayId, 'editMessageText', { chat_id, message_id, text });
await sdk.gateway.execute(gatewayId, 'sendAudio', { chat_id, audio: url });
await sdk.gateway.execute(gatewayId, 'sendDocument', { chat_id, document: url });
\`\`\`

### Storage API — persistent key-value store (data survives restarts)
\`\`\`js
await sdk.storage.get(key);              // returns value or null
await sdk.storage.set(key, value, ttl?); // ttl in seconds, optional
await sdk.storage.delete(key);
await sdk.storage.has(key);              // returns boolean
await sdk.storage.increment(key, by?);   // atomic increment, returns new value
await sdk.storage.keys(pattern?);        // list keys matching glob pattern
\`\`\`

### Config — user-configurable settings (set via dashboard UI)
\`\`\`js
sdk.config  // object with the user's settings, defined by configSchema below
// Example: sdk.config.model, sdk.config.systemPrompt, sdk.config.maxHistory
\`\`\`

### Lifecycle Hooks
\`\`\`js
sdk.onInstall(async () => { /* runs once when plugin is first installed */ });
sdk.onEnable(async () => { /* runs when plugin is enabled/started */ });
sdk.onDisable(async () => { /* runs when plugin is stopped */ });
\`\`\`

### AI API — generate text, images, and speech (credits auto-deducted from user)
\`\`\`js
const result = await sdk.ai.chat({
  messages: [{ role: 'system', content: '...' }, { role: 'user', content: '...' }],
  model: sdk.config.model || '2bot-ai-text-pro',
  temperature: 0.7,
  maxTokens: 1000,
});
// result = { content, model, usage: { promptTokens, completionTokens }, creditsUsed }

const imgResult = await sdk.ai.generateImage({
  prompt: 'description',
  model: sdk.config.imageModel || '2bot-ai-image-pro',
  n: 1, size: '1024x1024',
});
// imgResult = { images: [{ url, revisedPrompt? }], model, creditsUsed }

const audioResult = await sdk.ai.speak({
  text: 'Hello', model: '2bot-ai-voice-pro', voice: 'alloy',
});
// audioResult = { audioUrl?, audioBase64?, format, characterCount, creditsUsed }
\`\`\`

Available AI models:
- Text: 2bot-ai-text-free, 2bot-ai-text-lite, 2bot-ai-text-pro, 2bot-ai-text-ultra
- Code: 2bot-ai-code-free, 2bot-ai-code-lite, 2bot-ai-code-pro, 2bot-ai-code-ultra
- Reasoning: 2bot-ai-reasoning-pro, 2bot-ai-reasoning-ultra
- Image: 2bot-ai-image-pro, 2bot-ai-image-ultra
- Voice: 2bot-ai-voice-pro, 2bot-ai-voice-ultra

## CRITICAL: Configuration Schema System

The 2Bot platform has a BUILT-IN configuration UI in the dashboard. Users configure plugins through a settings modal — NOT through chat commands or inline keyboard buttons.

You MUST generate a configSchema alongside the code. The configSchema defines what settings the user sees in the dashboard.

### configSchema format (JSON Schema)
\`\`\`json
{
  "type": "object",
  "properties": {
    "model": {
      "type": "string",
      "title": "AI Model",
      "description": "The AI model to use for generating responses",
      "default": "2bot-ai-text-pro",
      "uiComponent": "ai-model-selector",
      "enum": ["2bot-ai-text-free", "2bot-ai-text-lite", "2bot-ai-text-pro", "2bot-ai-text-ultra"]
    },
    "systemPrompt": {
      "type": "string",
      "title": "System Prompt",
      "description": "Instructions for the AI persona",
      "default": "You are a helpful assistant."
    },
    "maxHistory": {
      "type": "number",
      "title": "Conversation Memory",
      "description": "Number of past messages to remember (0 = no memory)",
      "minimum": 0,
      "maximum": 50,
      "default": 10
    }
  }
}
\`\`\`

Key rules for configSchema:
- Use \`"uiComponent": "ai-model-selector"\` for any AI model selection field — this renders a beautiful grouped dropdown
- Use \`"enum"\` to restrict which models are available (text models for chat, image models for image gen, etc.)
- Every configurable value MUST have a \`"default"\` — the plugin must work out of the box
- Use \`sdk.config.fieldName\` in the code to read the value

## Patterns for Common Features

### AI Chat Bot (correct pattern)
\`\`\`js
// Read ALL settings from sdk.config — NEVER hardcode
const model = sdk.config.model || '2bot-ai-text-pro';
const systemPrompt = sdk.config.systemPrompt || 'You are a helpful assistant.';
const maxHistory = sdk.config.maxHistory ?? 10;

const historyKey = \`chat:\${msg.chat.id}:history\`;
let history = await sdk.storage.get(historyKey) || [];
history.push({ role: 'user', content: msg.text });
if (history.length > maxHistory * 2) history = history.slice(-(maxHistory * 2));
const result = await sdk.ai.chat({
  messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-maxHistory)],
  model,
});
history.push({ role: 'assistant', content: result.content });
await sdk.storage.set(historyKey, history);
\`\`\`

### Command Router
\`\`\`js
const text = msg.text || '';
if (text.startsWith('/start')) { /* welcome */ }
else if (text.startsWith('/help')) { /* show commands */ }
else if (text.startsWith('/reset')) { /* clear state — e.g. delete chat history */ }
else { /* default handler — AI response or echo */ }
\`\`\`

## ABSOLUTE RULES
- MUST start with: \`'use strict';\` and \`const sdk = require('/bridge-agent/plugin-sdk');\`
- MUST use \`sdk.onEvent()\` for receiving Telegram events
- MUST use \`sdk.gateway.execute(event.gatewayId, ...)\` to send messages
- MUST use \`sdk.config.fieldName\` for ALL configurable values (model, prompts, thresholds, etc.)
- MUST include \`/start\` and \`/help\` command handlers
- NEVER build config/settings UIs inside the bot (no inline keyboard model selectors, no /config command, no storage-based user preferences for things that belong in config)
- NEVER hardcode AI model IDs in the code — always read from \`sdk.config.model\`
- NEVER hardcode system prompts — read from \`sdk.config.systemPrompt\`
- Use \`sdk.storage\` ONLY for runtime data (conversation history, counters, user state) — NOT for configuration
- Do NOT use require() for anything except the SDK
- Do NOT use polling loops, setTimeout loops, or setInterval
- Do NOT use ctx, bot, or telegraf patterns
- Include error handling with try/catch
- End with \`console.log('[${pluginName.toLowerCase().replace(/\s+/g, "-")}] Ready');\`
- Write complete code — NO placeholder comments

## OUTPUT FORMAT

You MUST respond with a JSON object containing two fields:
1. \`code\` — the complete JavaScript plugin code as a string
2. \`configSchema\` — the JSON Schema object defining user-configurable settings

Example output:
\`\`\`json
{
  "code": "'use strict';\\nconst sdk = require('/bridge-agent/plugin-sdk');\\n...",
  "configSchema": {
    "type": "object",
    "properties": {
      "model": { "type": "string", "title": "AI Model", "default": "2bot-ai-text-pro", "uiComponent": "ai-model-selector", "enum": ["2bot-ai-text-free", "2bot-ai-text-lite", "2bot-ai-text-pro", "2bot-ai-text-ultra"] }
    }
  }
}
\`\`\`

Respond with ONLY the JSON object. No markdown fences, no explanation.`;

  const codeResponse = await twoBotAIProvider.textGeneration({
    messages: [
      { role: "system", content: codeGenPrompt },
      { role: "user", content: `Generate the plugin code and configSchema for "${pluginName}" that does: ${description}` },
    ],
    model: "2bot-ai-code-pro",
    temperature: 0.3,
    maxTokens: 4096,
    stream: false,
    userId,
    feature: "cursor",
    capability: "code-generation",
  });

  let rawOutput = codeResponse.content.trim();
  // Strip markdown fences if LLM wraps the JSON
  if (rawOutput.startsWith("```")) {
    rawOutput = rawOutput.replace(/^```(?:json|javascript|js)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  // Try to parse as structured JSON { code, configSchema }
  try {
    const parsed = JSON.parse(rawOutput) as { code?: string; configSchema?: Record<string, unknown> };
    if (parsed.code && typeof parsed.code === "string") {
      const code = parsed.code;
      // Validate code uses SDK
      if (code.includes("plugin-sdk") && (code.includes("sdk.onEvent") || code.includes("sdk.gateway"))) {
        // Extract defaults from configSchema
        const configSchema = (parsed.configSchema && typeof parsed.configSchema === "object") ? parsed.configSchema : {};
        const configDefaults = extractConfigDefaults(configSchema);
        genLog.info({ userId, pluginName, hasSchema: !!parsed.configSchema }, "AI generated plugin code + configSchema");
        return { code, configSchema, configDefaults };
      }
    }
  } catch {
    // Not valid JSON — maybe LLM returned raw code. Try to use it.
    genLog.warn({ userId, pluginName }, "AI output not valid JSON — attempting to extract code");
  }

  // Fallback: treat the entire output as code (backward compat)
  const generatedCode = rawOutput;
  if (generatedCode.includes("plugin-sdk") && (generatedCode.includes("sdk.onEvent") || generatedCode.includes("sdk.gateway"))) {
    genLog.info({ userId, pluginName }, "AI generated plugin code (no configSchema)");
    // Auto-detect if it's an AI plugin and generate a basic configSchema
    const autoSchema = autoDetectConfigSchema(generatedCode);
    return { code: generatedCode, configSchema: autoSchema.schema, configDefaults: autoSchema.defaults };
  }

  genLog.warn({ userId, pluginName }, "AI code gen output invalid — using fallback");
  return { code: FALLBACK_PLUGIN_CODE, configSchema: {}, configDefaults: {} };
}

// ===========================================
// Multi-File Plugin Generation
// ===========================================

/**
 * Generate a multi-file (directory) plugin using the AI model.
 * The LLM outputs a JSON structure with multiple files, an entry point,
 * and a config schema. Used for complex plugins that need separation
 * of concerns across multiple files.
 *
 * @param pluginName - Human-readable plugin name
 * @param description - What the plugin should do
 * @param userId - User ID for billing
 * @param richSpec - Optional rich specification from design conversation
 * @returns Multi-file plugin with files map, entry, configSchema, configDefaults
 */
export async function generateMultiFilePlugin(
  pluginName: string,
  description: string,
  userId: string,
  richSpec?: string,
): Promise<GeneratedMultiFilePlugin> {
  const pluginDetails = richSpec
    ? `**Plugin Name:** ${pluginName}\n**Detailed Specification:**\n${richSpec}`
    : `**Plugin Name:** ${pluginName}\n**What it should do:** ${description}`;

  const multiFilePrompt = `You are an expert code generator for the 2Bot platform. Generate a MULTI-FILE plugin with proper file separation.

${pluginDetails}

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
- Text: 2bot-ai-text-free, 2bot-ai-text-lite, 2bot-ai-text-pro, 2bot-ai-text-ultra
- Code: 2bot-ai-code-free, 2bot-ai-code-lite, 2bot-ai-code-pro, 2bot-ai-code-ultra
- Reasoning: 2bot-ai-reasoning-pro, 2bot-ai-reasoning-ultra
- Image: 2bot-ai-image-pro, 2bot-ai-image-ultra
- Voice: 2bot-ai-voice-pro, 2bot-ai-voice-ultra

## Multi-File Structure Rules
- The entry file (\`index.js\`) MUST have \`'use strict';\` and \`const sdk = require('/bridge-agent/plugin-sdk');\`
- The entry file MUST call \`sdk.onEvent()\` for event handling
- Helper modules use CommonJS: \`module.exports\` / \`require('./module')\`
- Keep files focused: one concern per file (command router, AI logic, storage helpers, etc.)
- Max 20 files, max 100KB per file
- Always use CommonJS — NOT ES modules
- File paths are relative to the plugin directory

## Example Structure
\`\`\`
index.js          — entry point with sdk.onEvent(), requires other modules
commands.js       — command handler functions (/start, /help, etc.)
ai.js             — AI-related logic (chat, image gen, etc.)
storage.js        — storage helper functions
\`\`\`

## Config Schema
Settings are configured via the dashboard UI. Use \`"uiComponent": "ai-model-selector"\` for model fields.
Every configurable value MUST have a \`"default"\`.

## ABSOLUTE RULES
- Entry file MUST start with \`'use strict';\` and \`const sdk = require('/bridge-agent/plugin-sdk');\`
- MUST use \`sdk.onEvent()\` for receiving events in entry file
- MUST use \`sdk.gateway.execute(event.gatewayId, ...)\` to send messages
- MUST read config from \`sdk.config\` — never hardcode
- Helper modules export functions/objects, entry file imports them with \`require('./module')\`
- Include error handling with try/catch
- Entry file ends with: \`console.log('[plugin] Ready');\`

## OUTPUT FORMAT

Respond with ONLY a JSON object:
\`\`\`json
{
  "files": {
    "index.js": "'use strict';\\nconst sdk = require('/bridge-agent/plugin-sdk');\\n...",
    "commands.js": "'use strict';\\n...",
    "ai.js": "'use strict';\\n..."
  },
  "entry": "index.js",
  "configSchema": {
    "type": "object",
    "properties": { ... }
  }
}
\`\`\`

Respond with ONLY the JSON object. No markdown fences, no explanation.`;

  try {
    const response = await twoBotAIProvider.textGeneration({
      messages: [
        { role: "system", content: multiFilePrompt },
        {
          role: "user",
          content: `Generate a multi-file plugin for "${pluginName}": ${description}`,
        },
      ],
      model: "2bot-ai-code-pro",
      temperature: 0.3,
      maxTokens: 8192,
      stream: false,
      userId,
      feature: "cursor",
      capability: "code-generation",
    });

    let rawOutput = response.content.trim();
    if (rawOutput.startsWith("```")) {
      rawOutput = rawOutput
        .replace(/^```(?:json|javascript|js)?\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
    }

    const parsed = JSON.parse(rawOutput) as {
      files?: Record<string, string>;
      entry?: string;
      configSchema?: Record<string, unknown>;
    };

    if (parsed.files && typeof parsed.files === "object" && Object.keys(parsed.files).length > 0) {
      const entry = parsed.entry || "index.js";
      const files = parsed.files;

      // Validate entry file exists
      if (!files[entry]) {
        genLog.warn({ userId, pluginName, entry }, "Multi-file gen: entry file missing from output");
        // Move first file to entry if needed
        const firstKey = Object.keys(files)[0]!;
        if (firstKey !== entry && files[firstKey]) {
          files[entry] = files[firstKey]!;
          delete files[firstKey];
        }
      }

      // Validate entry file uses SDK
      const entryCode = files[entry] || "";
      if (!entryCode.includes("plugin-sdk")) {
        genLog.warn({ userId, pluginName }, "Multi-file gen: entry file missing SDK — adding import");
        files[entry] = `'use strict';\nconst sdk = require('/bridge-agent/plugin-sdk');\n\n${entryCode}`;
      }

      const configSchema = parsed.configSchema && typeof parsed.configSchema === "object" ? parsed.configSchema : {};
      const configDefaults = extractConfigDefaults(configSchema);

      genLog.info(
        { userId, pluginName, fileCount: Object.keys(files).length, entry },
        "AI generated multi-file plugin",
      );

      return { files, entry, configSchema, configDefaults };
    }
  } catch (err) {
    genLog.warn({ userId, pluginName, error: (err as Error).message }, "Multi-file gen failed");
  }

  // Fallback: generate single-file and wrap it
  genLog.info({ userId, pluginName }, "Multi-file gen fallback to single-file");
  const singleFile = await generatePluginCode(pluginName, description, userId, richSpec);
  return {
    files: { "index.js": singleFile.code },
    entry: "index.js",
    configSchema: singleFile.configSchema,
    configDefaults: singleFile.configDefaults,
  };
}

// ===========================================
// Config Schema Helpers
// ===========================================

/**
 * Extract default values from a JSON Schema configSchema.
 */
export function extractConfigDefaults(schema: Record<string, unknown>): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return defaults;
  for (const [key, prop] of Object.entries(props)) {
    if (prop.default !== undefined) {
      defaults[key] = prop.default;
    }
  }
  return defaults;
}

/**
 * Auto-detect configSchema from generated code when LLM doesn't provide one.
 * Looks for sdk.config.* usage patterns and sdk.ai.* calls.
 */
export function autoDetectConfigSchema(code: string): { schema: Record<string, unknown>; defaults: Record<string, unknown> } {
  const properties: Record<string, Record<string, unknown>> = {};
  const defaults: Record<string, unknown> = {};

  // Detect AI usage → add model selector
  if (code.includes("sdk.ai.chat")) {
    properties.model = {
      type: "string",
      title: "AI Model",
      description: "The AI model to use for text generation",
      default: "2bot-ai-text-pro",
      uiComponent: "ai-model-selector",
      enum: ["2bot-ai-text-free", "2bot-ai-text-lite", "2bot-ai-text-pro", "2bot-ai-text-ultra"],
    };
    defaults.model = "2bot-ai-text-pro";
  }
  if (code.includes("sdk.ai.generateImage")) {
    properties.imageModel = {
      type: "string",
      title: "Image Model",
      description: "The AI model to use for image generation",
      default: "2bot-ai-image-pro",
      uiComponent: "ai-model-selector",
      enum: ["2bot-ai-image-pro", "2bot-ai-image-ultra"],
    };
    defaults.imageModel = "2bot-ai-image-pro";
  }

  // Detect sdk.config.XYZ references
  const configRefs = code.matchAll(/sdk\.config\.(\w+)/g);
  for (const match of configRefs) {
    const key = match[1]!;
    if (properties[key]) continue; // already handled
    if (key === "model" || key === "imageModel") continue;

    // Infer type from usage context
    if (key === "systemPrompt" || key.toLowerCase().includes("prompt")) {
      properties[key] = { type: "string", title: humanize(key), description: `Configurable ${humanize(key).toLowerCase()}`, default: "" };
      defaults[key] = "";
    } else if (key === "maxHistory" || key.toLowerCase().includes("max") || key.toLowerCase().includes("limit")) {
      properties[key] = { type: "number", title: humanize(key), description: `Configurable ${humanize(key).toLowerCase()}`, default: 10, minimum: 0, maximum: 100 };
      defaults[key] = 10;
    } else {
      properties[key] = { type: "string", title: humanize(key), description: `Configurable ${humanize(key).toLowerCase()}`, default: "" };
      defaults[key] = "";
    }
  }

  if (Object.keys(properties).length === 0) {
    return { schema: {}, defaults: {} };
  }
  return { schema: { type: "object", properties }, defaults };
}

/** Convert camelCase to Human Readable */
export function humanize(str: string): string {
  return str.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}
