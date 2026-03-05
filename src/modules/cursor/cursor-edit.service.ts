/**
 * Cursor Edit Service
 *
 * AI-powered plugin code editing. Given existing plugin code and
 * an edit instruction, uses the LLM to produce modified code.
 *
 * Uses the same Plugin SDK reference as cursor-codegen.service.ts
 * but with a code-editing prompt instead of generation-from-scratch.
 *
 * @module modules/cursor/cursor-edit.service
 */

import { logger } from "@/lib/logger";
import { twoBotAIProvider } from "@/modules/2bot-ai-provider";

const editLog = logger.child({ module: "cursor", capability: "code-edit" });

/**
 * Result of an AI-powered code edit operation.
 */
export interface EditedPlugin {
  code: string;
  configSchema?: Record<string, unknown>;
  configDefaults?: Record<string, unknown>;
  summary: string; // Human-readable summary of what was changed
}

/**
 * Edit existing plugin code based on a natural language instruction.
 *
 * Sends the current code + edit instruction to the LLM. The LLM returns
 * the COMPLETE modified code (not a diff). Validates that the output
 * still uses the Plugin SDK correctly.
 *
 * @param currentCode - The existing plugin source code
 * @param instruction - What the user wants to change (natural language)
 * @param pluginName - Name of the plugin (for context)
 * @param userId - User ID for billing/tracking
 * @returns The modified code + summary of changes
 */
export async function editPluginCode(
  currentCode: string,
  instruction: string,
  pluginName: string,
  userId: string,
): Promise<EditedPlugin> {
  const editPrompt = `You are an expert code editor for the 2Bot platform. You will receive the CURRENT source code of a plugin and an edit instruction. Apply the requested changes and return the COMPLETE modified code.

## Edit Instruction
${instruction}

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

### Config Schema
Settings are configured via the dashboard UI, NOT via chat commands or inline keyboards.
Use \`"uiComponent": "ai-model-selector"\` for model selection fields.

## RULES
- Return the COMPLETE source code — not a diff or partial snippet
- Preserve ALL existing functionality unless the instruction explicitly asks to remove it
- Keep \`'use strict';\` and \`const sdk = require('/bridge-agent/plugin-sdk');\` at the top
- Keep \`sdk.onEvent()\` for event handling
- Keep \`sdk.gateway.execute(event.gatewayId, ...)\` for sending messages
- Keep all \`sdk.config\` references — don't hardcode values
- Include error handling with try/catch
- Keep the ready log at the end
- Only change what the instruction asks for — don't rewrite unrelated code
- If the instruction asks to add a feature, integrate it naturally with the existing code structure
- If the instruction asks to add configurable settings, update BOTH the code AND the configSchema

## OUTPUT FORMAT

Respond with ONLY a JSON object:
\`\`\`json
{
  "code": "...complete modified JavaScript code...",
  "configSchema": { ...updated JSON Schema if config changed, or null if unchanged... },
  "summary": "Brief description of what was changed"
}
\`\`\`

Respond with ONLY the JSON object. No markdown fences, no explanation.`;

  const response = await twoBotAIProvider.textGeneration({
    messages: [
      { role: "system", content: editPrompt },
      {
        role: "user",
        content: `Here is the current code of "${pluginName}":\n\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\nApply this edit: ${instruction}`,
      },
    ],
    model: "2bot-ai-code-pro",
    temperature: 0.2,
    maxTokens: 4096,
    stream: false,
    userId,
    feature: "cursor",
    capability: "code-generation",
  });

  let rawOutput = response.content.trim();

  // Strip markdown fences if LLM wraps the JSON
  if (rawOutput.startsWith("```")) {
    rawOutput = rawOutput.replace(/^```(?:json|javascript|js)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  // Parse structured JSON response
  try {
    const parsed = JSON.parse(rawOutput) as {
      code?: string;
      configSchema?: Record<string, unknown> | null;
      summary?: string;
    };

    if (parsed.code && typeof parsed.code === "string") {
      // Validate the code still uses the SDK
      if (parsed.code.includes("plugin-sdk") && (parsed.code.includes("sdk.onEvent") || parsed.code.includes("sdk.gateway"))) {
        editLog.info(
          { userId, pluginName, summaryLength: parsed.summary?.length },
          "AI edited plugin code successfully",
        );

        // Extract config defaults if configSchema was updated
        let configDefaults: Record<string, unknown> | undefined;
        if (parsed.configSchema && typeof parsed.configSchema === "object") {
          configDefaults = extractConfigDefaultsFromSchema(parsed.configSchema);
        }

        return {
          code: parsed.code,
          configSchema: parsed.configSchema ?? undefined,
          configDefaults,
          summary: parsed.summary || "Code updated",
        };
      }
    }
  } catch {
    editLog.warn({ userId, pluginName }, "AI edit output not valid JSON — attempting raw extraction");
  }

  // Fallback: if the LLM returned raw code instead of JSON, try to use it
  if (rawOutput.includes("plugin-sdk") && (rawOutput.includes("sdk.onEvent") || rawOutput.includes("sdk.gateway"))) {
    editLog.info({ userId, pluginName }, "AI returned raw code (no JSON wrapper) — using as-is");
    return {
      code: rawOutput,
      summary: "Code updated (raw output)",
    };
  }

  // If all parsing failed, return original code with an error summary
  editLog.warn({ userId, pluginName }, "AI code edit output invalid — returning original code unchanged");
  return {
    code: currentCode,
    summary: "Edit failed — code returned unchanged. Please try a more specific instruction.",
  };
}

/**
 * Extract default values from a configSchema's properties.
 */
function extractConfigDefaultsFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
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
