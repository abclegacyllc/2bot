/**
 * OpenRouter AI Adapter for 2Bot AI
 *
 * Wraps OpenRouter API for text generation (chat).
 * OpenRouter is a meta-aggregator that provides access to 300+ models
 * from multiple providers via a single OpenAI-compatible API.
 *
 * OpenRouter does NOT support image generation — only text/chat.
 *
 * Base URL: https://openrouter.ai/api/v1
 * Docs: https://openrouter.ai/docs
 *
 * @module modules/2bot-ai-provider/adapters/openrouter.adapter
 */

import { logger } from "@/lib/logger";
import OpenAI from "openai";
import type {
    TextGenerationRequest,
    TextGenerationResponse,
    TextGenerationStreamChunk,
    ToolCallResult,
    ToolDefinition,
} from "../types";
import { TwoBotAIError } from "../types";

// ===========================================
// OpenRouter Client Singleton
// ===========================================

let openrouterClient: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
  if (!openrouterClient) {
    const apiKey = process.env.TWOBOT_OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new TwoBotAIError(
        "2Bot OpenRouter API key not configured",
        "PROVIDER_ERROR",
        500
      );
    }
    openrouterClient = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://2bot.org",
        "X-Title": "2Bot AI",
      },
    });
  }
  return openrouterClient;
}

// ===========================================
// Message Formatting (OpenAI-compatible)
// ===========================================

/**
 * Convert TextGenerationMessage to OpenAI-compatible format for OpenRouter.
 */
function formatMessageForOpenRouter(m: TextGenerationRequest["messages"][0]): OpenAI.Chat.ChatCompletionMessageParam {
  // If message has parts (multimodal), convert to OpenAI-compatible format
  if (m.parts && m.parts.length > 0) {
    const content: OpenAI.Chat.ChatCompletionContentPart[] = m.parts.map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text || "" };
      } else if (part.type === "image_url" && part.image_url) {
        return {
          type: "image_url" as const,
          image_url: {
            url: part.image_url.url,
            detail: (part.image_url.detail || "auto") as "auto" | "low" | "high",
          },
        };
      }
      return { type: "text" as const, text: "" };
    });

    return { role: m.role, content } as OpenAI.Chat.ChatCompletionMessageParam;
  }

  // Standard text message
  return { role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam;
}

// ===========================================
// Tool Formatting (OpenAI-compatible)
// ===========================================

function formatToolsForOpenRouter(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

function formatToolChoiceForOpenRouter(
  toolChoice: TextGenerationRequest["toolChoice"]
): OpenAI.Chat.ChatCompletionToolChoiceOption | undefined {
  if (!toolChoice) return undefined;
  if (typeof toolChoice === "string") return toolChoice;
  return { type: "function", function: { name: toolChoice.name } };
}

function extractToolCalls(
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined
): ToolCallResult[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls
    .filter((tc) => tc.type === "function")
    .map((tc) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (tc as any).function as { name: string; arguments: string };
      return {
        id: tc.id,
        name: fn.name,
        arguments: JSON.parse(fn.arguments || "{}"),
      };
    });
}

function mapFinishReason(reason: string | null | undefined): TextGenerationResponse["finishReason"] {
  if (reason === "tool_calls") return "tool_use";
  return (reason as TextGenerationResponse["finishReason"]) ?? null;
}

// ===========================================
// Text Generation
// ===========================================

export async function openrouterTextGeneration(
  request: TextGenerationRequest
): Promise<TextGenerationResponse> {
  const client = getOpenRouterClient();
  const log = logger.child({ module: "2bot-ai-openrouter", capability: "text-generation" });

  const hasImages = request.messages.some((m) => m.parts?.some((p) => p.type === "image_url"));

  try {
    const createParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages: request.messages.map(formatMessageForOpenRouter),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: false,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForOpenRouter(request.tools);
      const toolChoice = formatToolChoiceForOpenRouter(request.toolChoice);
      if (toolChoice) createParams.tool_choice = toolChoice;
    }

    const response = await client.chat.completions.create(createParams);

    const choice = response.choices[0];
    const usage = response.usage;
    const toolCalls = extractToolCalls(choice?.message?.tool_calls);

    log.info(
      {
        model: request.model,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        hasImages,
        toolCallCount: toolCalls?.length ?? 0,
      },
      "OpenRouter text generation completed"
    );

    return {
      id: response.id,
      model: response.model,
      content: choice?.message?.content || "",
      finishReason: mapFinishReason(choice?.finish_reason),
      usage: {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      creditsUsed: 0,
      newBalance: 0,
      toolCalls,
    };
  } catch (error) {
    log.error({ error, model: request.model, hasImages }, "OpenRouter chat error");
    throw mapOpenRouterError(error);
  }
}

// ===========================================
// Streaming Text Generation
// ===========================================

export async function* openrouterTextGenerationStream(
  request: TextGenerationRequest
): AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }> {
  const client = getOpenRouterClient();
  const log = logger.child({ module: "2bot-ai-openrouter", capability: "text-generation" });

  try {
    const createParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages: request.messages.map(formatMessageForOpenRouter),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForOpenRouter(request.tools);
      const toolChoice = formatToolChoiceForOpenRouter(request.toolChoice);
      if (toolChoice) createParams.tool_choice = toolChoice;
    }

    const stream = await client.chat.completions.create(createParams);

    let totalContent = "";
    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = choice?.delta?.content || "";

      if (delta) {
        totalContent += delta;
        yield {
          id: chunk.id,
          delta,
          finishReason: mapFinishReason(choice?.finish_reason),
        };
      }

      // Stream tool call deltas
      const toolCallDeltas = choice?.delta?.tool_calls;
      if (toolCallDeltas && toolCallDeltas.length > 0) {
        for (const tc of toolCallDeltas) {
          yield {
            id: chunk.id,
            delta: "",
            finishReason: mapFinishReason(choice?.finish_reason),
            toolUse: {
              index: tc.index,
              id: tc.id,
              name: tc.function?.name,
              argumentsDelta: tc.function?.arguments,
            },
          };
        }
      }

      // Emit finish_reason on final choice chunk
      if (!delta && !toolCallDeltas && choice?.finish_reason) {
        yield {
          id: chunk.id,
          delta: "",
          finishReason: mapFinishReason(choice.finish_reason),
        };
      }

      // Final chunk with usage
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
    }

    // If OpenRouter doesn't return usage in stream, estimate from content
    if (usage.inputTokens === 0 && usage.outputTokens === 0) {
      usage.outputTokens = Math.ceil(totalContent.length / 4);
      usage.inputTokens = Math.ceil(
        request.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
      );
    }

    log.info(
      {
        model: request.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        contentLength: totalContent.length,
      },
      "OpenRouter stream completed"
    );

    return usage;
  } catch (error) {
    log.error({ error, model: request.model }, "OpenRouter stream error");
    throw mapOpenRouterError(error);
  }
}

// ===========================================
// Error Mapping
// ===========================================

function mapOpenRouterError(error: unknown): TwoBotAIError {
  if (error instanceof OpenAI.APIError) {
    const status = error.status || 500;
    const message = error.message || "";

    if (status === 429) {
      return new TwoBotAIError("Rate limit exceeded. Please try again later.", "RATE_LIMITED", 429);
    }
    if (status === 401 || status === 403) {
      return new TwoBotAIError("OpenRouter authentication failed. Check API key.", "PROVIDER_ERROR", 401);
    }
    if (status === 404) {
      return new TwoBotAIError("Model not available on OpenRouter.", "MODEL_UNAVAILABLE", 404);
    }
    if (status === 402) {
      return new TwoBotAIError("Insufficient OpenRouter credits.", "PROVIDER_ERROR", 402);
    }
    if (message.includes("content") && message.includes("policy")) {
      return new TwoBotAIError("Content was filtered due to policy violations.", "CONTENT_FILTERED", 400);
    }

    return new TwoBotAIError(message || "OpenRouter API error", "PROVIDER_ERROR", status);
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("timeout")) {
      return new TwoBotAIError("Request timed out", "TIMEOUT", 408);
    }
    return new TwoBotAIError(error.message || "OpenRouter API error", "PROVIDER_ERROR", 500);
  }

  return new TwoBotAIError("Unknown OpenRouter error", "PROVIDER_ERROR", 500);
}
