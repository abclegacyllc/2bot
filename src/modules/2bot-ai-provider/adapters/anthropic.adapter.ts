/**
 * Anthropic Adapter for 2Bot AI
 *
 * Wraps Anthropic API for Claude text generation models.
 * Uses 2Bot's API keys (not user BYOK keys).
 *
 * @module modules/2bot-ai-provider/adapters/anthropic.adapter
 */

import { logger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import type {
    TextGenerationRequest,
    TextGenerationResponse,
    TextGenerationStreamChunk,
    ToolCallResult,
    ToolDefinition,
} from "../types";
import { TwoBotAIError } from "../types";

// ===========================================
// Anthropic Client Singleton
// ===========================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.TWOBOT_ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new TwoBotAIError(
        "2Bot Anthropic API key not configured",
        "PROVIDER_ERROR",
        500
      );
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ===========================================
// Model Mapping
// ===========================================

// Map friendly model names to actual Anthropic model IDs
// Note: Opus and Sonnet are DIFFERENT models with different capabilities/pricing
// - Opus: Most capable, most expensive (complex reasoning, research)
// - Sonnet: Balanced performance/cost (most tasks)
// - Haiku: Fastest, cheapest (simple tasks)
const MODEL_MAP: Record<string, string> = {
  // Claude 4.6 (newest generation)
  "claude-4.6-opus": "claude-opus-4-6",
  "claude-opus-4.6": "claude-opus-4-6",
  "claude-4.6-sonnet": "claude-sonnet-4-6",
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  // Claude 4.5 models (legacy, superseded by 4.6)
  "claude-4.5-opus": "claude-opus-4-5-20251101",
  "claude-opus-4.5": "claude-opus-4-5-20251101",
  "claude-4.5-sonnet": "claude-sonnet-4-5-20250929",
  "claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
  "claude-4.5-haiku": "claude-haiku-4-5-20251001",
  "claude-haiku-4.5": "claude-haiku-4-5-20251001",
  // Claude 4 models
  "claude-4-opus": "claude-opus-4-20250514",
  "claude-opus-4": "claude-opus-4-20250514",
  "claude-4-sonnet": "claude-sonnet-4-20250514",
  "claude-sonnet-4": "claude-sonnet-4-20250514",
  // Claude 3.5 models
  "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
  "claude-3.5-haiku": "claude-3-5-haiku-20241022",
  // Legacy Claude 3 models
  "claude-3-opus": "claude-3-opus-20240229",
  "claude-3-sonnet": "claude-3-sonnet-20240229",
  "claude-3-haiku": "claude-3-haiku-20240307",
};

function mapModelId(model: string): string {
  return MODEL_MAP[model] || model;
}

// ===========================================
// Message Formatting (Multimodal / Vision)
// ===========================================

/**
 * Convert TextGenerationMessage to Anthropic format, handling multimodal content (vision).
 * Anthropic uses a different image format than OpenAI:
 * - OpenAI: { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
 * - Anthropic: { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }
 */
function formatMessageForAnthropic(m: TextGenerationRequest["messages"][0]): {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }>;
} {
  // If message has multimodal parts, convert to Anthropic format
  if (m.parts && m.parts.length > 0) {
    const content = m.parts
      .map((part) => {
        if (part.type === "text") {
          return { type: "text" as const, text: part.text || "" };
        } else if (part.type === "image_url" && part.image_url) {
          // Parse data URL: "data:image/png;base64,iVBOR..." → media_type + data
          const url = part.image_url.url;
          const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/);
          if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2]) {
            return {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: dataUrlMatch[1],
                data: dataUrlMatch[2],
              },
            };
          }
          // If it's a regular URL (not base64), Anthropic also supports URL source
          // but base64 is more reliable. Log warning for non-base64 URLs.
          logger.warn({ url: url.substring(0, 50) }, "Non-base64 image URL sent to Anthropic - skipping");
          return { type: "text" as const, text: "[Image could not be processed]" };
        }
        return { type: "text" as const, text: "" };
      })
      .filter((p) => p.type === "text" ? p.text !== "" : true);

    return {
      role: m.role as "user" | "assistant",
      content,
    };
  }

  // Standard text message
  return {
    role: m.role as "user" | "assistant",
    content: m.content,
  };
}

// ===========================================
// Tool Formatting (Anthropic-specific)
// ===========================================

/**
 * Convert ToolDefinition[] to Anthropic tool format.
 * Anthropic uses { name, description, input_schema } instead of OpenAI's function wrapper.
 */
function formatToolsForAnthropic(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));
}

/**
 * Convert tool_choice from 2Bot format to Anthropic format.
 */
function formatToolChoiceForAnthropic(
  toolChoice: TextGenerationRequest["toolChoice"]
): Anthropic.MessageCreateParams["tool_choice"] | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "auto") return { type: "auto" };
  if (toolChoice === "none") return undefined; // Anthropic: just don't send tools
  if (toolChoice === "required") return { type: "any" };
  return { type: "tool", name: toolChoice.name };
}

/**
 * Extract tool calls from Anthropic response content blocks.
 */
function extractAnthropicToolCalls(
  content: Anthropic.ContentBlock[]
): ToolCallResult[] | undefined {
  const toolBlocks = content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (toolBlocks.length === 0) return undefined;
  return toolBlocks.map((block) => ({
    id: block.id,
    name: block.name,
    arguments: (block.input as Record<string, unknown>) || {},
  }));
}

/**
 * Map Anthropic stop_reason to our finishReason.
 */
function mapAnthropicFinishReason(
  reason: string | null | undefined
): TextGenerationResponse["finishReason"] {
  if (reason === "end_turn") return "stop";
  if (reason === "tool_use") return "tool_use";
  if (reason === "max_tokens") return "length";
  return (reason as TextGenerationResponse["finishReason"]) ?? null;
}

// ===========================================
// Text Generation
// ===========================================

export async function anthropicTextGeneration(request: TextGenerationRequest): Promise<TextGenerationResponse> {
  const client = getAnthropicClient();
  const log = logger.child({ module: "2bot-ai-anthropic", capability: "text-generation" });

  try {
    // Extract system message if present
    const systemMessage = request.messages.find((m) => m.role === "system");
    const conversationMessages = request.messages.filter((m) => m.role !== "system");

    // Check if any message has images (for logging)
    const hasImages = request.messages.some((m) => m.parts?.some((p) => p.type === "image_url"));

    const createParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: mapModelId(request.model),
      system: systemMessage?.content,
      messages: conversationMessages.map(formatMessageForAnthropic) as Anthropic.MessageParam[],
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForAnthropic(request.tools);
      const toolChoice = formatToolChoiceForAnthropic(request.toolChoice);
      if (toolChoice) createParams.tool_choice = toolChoice;
    }

    const response = await client.messages.create(createParams);

    const textBlock = response.content.find((c: { type: string }) => c.type === "text");
    const content = textBlock?.type === "text" ? (textBlock as { type: "text"; text: string }).text : "";
    const toolCalls = extractAnthropicToolCalls(response.content);

    log.info({
      model: request.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      hasImages,
      toolCallCount: toolCalls?.length ?? 0,
    }, "Anthropic text generation completed");

    return {
      id: response.id,
      model: response.model,
      content,
      finishReason: mapAnthropicFinishReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      creditsUsed: 0,
      newBalance: 0,
      toolCalls,
    };
  } catch (error) {
    log.error({ error }, "Anthropic chat error");
    throw mapAnthropicError(error);
  }
}

/**
 * Streaming text generation
 * Yields chunks as they arrive from Anthropic
 */
export async function* anthropicTextGenerationStream(
  request: TextGenerationRequest
): AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }> {
  const client = getAnthropicClient();
  const log = logger.child({ module: "2bot-ai-anthropic", capability: "text-generation" });

  try {
    // Extract system message if present
    const systemMessage = request.messages.find((m) => m.role === "system");
    const conversationMessages = request.messages.filter((m) => m.role !== "system");

    const streamParams: Anthropic.MessageCreateParamsStreaming = {
      model: mapModelId(request.model),
      system: systemMessage?.content,
      messages: conversationMessages.map(formatMessageForAnthropic) as Anthropic.MessageParam[],
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      streamParams.tools = formatToolsForAnthropic(request.tools);
      const toolChoice = formatToolChoiceForAnthropic(request.toolChoice);
      if (toolChoice) streamParams.tool_choice = toolChoice;
    }

    const stream = await client.messages.stream(streamParams);

    let messageId = "";
    let totalContent = "";
    // Track tool use blocks being built during streaming
    let currentToolIndex = 0;
    let currentToolId = "";
    let currentToolName = "";

    for await (const event of stream) {
      if (event.type === "message_start") {
        messageId = event.message.id;
      } else if (event.type === "content_block_start") {
        // Text block start — nothing to emit yet
        if (event.content_block.type === "tool_use") {
          // A new tool use block is starting
          currentToolId = event.content_block.id;
          currentToolName = event.content_block.name;
          yield {
            id: messageId,
            delta: "",
            finishReason: null,
            toolUse: {
              index: currentToolIndex,
              id: currentToolId,
              name: currentToolName,
            },
          };
        }
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          totalContent += delta.text;
          yield {
            id: messageId,
            delta: delta.text,
            finishReason: null,
          };
        } else if (delta.type === "input_json_delta") {
          // Tool input arguments streaming
          yield {
            id: messageId,
            delta: "",
            finishReason: null,
            toolUse: {
              index: currentToolIndex,
              argumentsDelta: delta.partial_json,
            },
          };
        }
      } else if (event.type === "content_block_stop") {
        // If we were building a tool, increment the index for the next one
        if (currentToolId) {
          currentToolIndex++;
          currentToolId = "";
          currentToolName = "";
        }
      } else if (event.type === "message_delta") {
        // Contains stop_reason
        const stopReason = (event.delta as { stop_reason?: string }).stop_reason;
        if (stopReason) {
          yield {
            id: messageId,
            delta: "",
            finishReason: mapAnthropicFinishReason(stopReason),
          };
        }
      } else if (event.type === "message_stop") {
        // Stream is done — no additional yield needed, message_delta already sent finishReason
      }
    }

    // Get final message for usage
    const finalMessage = await stream.finalMessage();

    log.info({
      model: request.model,
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      contentLength: totalContent.length,
    }, "Anthropic stream completed");

    return {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };
  } catch (error) {
    log.error({ error }, "Anthropic stream error");
    throw mapAnthropicError(error);
  }
}

// ===========================================
// Error Mapping
// ===========================================

function mapAnthropicError(error: unknown): TwoBotAIError {
  if (error instanceof Anthropic.APIError) {
    switch (error.status) {
      case 429:
        return new TwoBotAIError(
          "Rate limit exceeded. Please try again later.",
          "RATE_LIMITED",
          429
        );
      case 400:
        return new TwoBotAIError(
          error.message || "Invalid request",
          "INVALID_REQUEST",
          400
        );
      case 529:
        return new TwoBotAIError(
          "Anthropic is temporarily overloaded. Please try again.",
          "MODEL_UNAVAILABLE",
          503
        );
      default:
        return new TwoBotAIError(
          error.message || "Anthropic API error",
          "PROVIDER_ERROR",
          error.status || 500
        );
    }
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new TwoBotAIError(
      "Request timed out",
      "TIMEOUT",
      408
    );
  }

  return new TwoBotAIError(
    error instanceof Error ? error.message : "Unknown error",
    "PROVIDER_ERROR",
    500
  );
}
