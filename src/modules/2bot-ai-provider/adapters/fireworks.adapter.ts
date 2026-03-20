/**
 * Fireworks AI Adapter for 2Bot AI
 *
 * Wraps Fireworks AI API for text generation (chat) and image generation.
 * Fireworks uses an OpenAI-compatible API, so we use the `openai` SDK
 * with a custom baseURL pointing to Fireworks.
 *
 * Base URL: https://api.fireworks.ai/inference/v1
 * Docs: https://docs.fireworks.ai/
 *
 * @module modules/2bot-ai-provider/adapters/fireworks.adapter
 */

import { logger } from "@/lib/logger";
import OpenAI from "openai";
import type {
    ImageGenerationRequest,
    ImageGenerationResponse,
    TextGenerationRequest,
    TextGenerationResponse,
    TextGenerationStreamChunk,
    ToolCallResult,
    ToolDefinition,
} from "../types";
import { TwoBotAIError } from "../types";

// ===========================================
// Fireworks AI Client Singleton
// ===========================================

let fireworksClient: OpenAI | null = null;

function getFireworksClient(): OpenAI {
  if (!fireworksClient) {
    const apiKey = process.env.TWOBOT_FIREWORKS_API_KEY;
    if (!apiKey) {
      throw new TwoBotAIError(
        "2Bot Fireworks AI API key not configured",
        "PROVIDER_ERROR",
        500
      );
    }
    fireworksClient = new OpenAI({
      apiKey,
      baseURL: "https://api.fireworks.ai/inference/v1",
      timeout: 30_000,
    });
  }
  return fireworksClient;
}

// ===========================================
// Message Formatting (OpenAI-compatible)
// ===========================================

/**
 * Convert TextGenerationMessage to OpenAI-compatible format for Fireworks.
 */
function formatMessageForFireworks(m: TextGenerationRequest["messages"][0]): OpenAI.Chat.ChatCompletionMessageParam {
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

function formatToolsForFireworks(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

function formatToolChoiceForFireworks(
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
    .map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || "{}"),
    }));
}

function mapFinishReason(reason: string | null | undefined): TextGenerationResponse["finishReason"] {
  if (reason === "tool_calls") return "tool_use";
  return (reason as TextGenerationResponse["finishReason"]) ?? null;
}

// ===========================================
// Text Generation
// ===========================================

export async function fireworksTextGeneration(
  request: TextGenerationRequest
): Promise<TextGenerationResponse> {
  const client = getFireworksClient();
  const log = logger.child({ module: "2bot-ai-fireworks", capability: "text-generation" });

  const hasImages = request.messages.some((m) => m.parts?.some((p) => p.type === "image_url"));

  try {
    const createParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages: request.messages.map(formatMessageForFireworks),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: false,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForFireworks(request.tools);
      const toolChoice = formatToolChoiceForFireworks(request.toolChoice);
      if (toolChoice) createParams.tool_choice = toolChoice;
    }

    const response = await client.chat.completions.create(createParams);

    const choice = response.choices[0];
    const usage = response.usage;

    log.info(
      {
        model: request.model,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        hasImages,
        hasTools: !!(request.tools && request.tools.length > 0),
        toolCallCount: choice?.message?.tool_calls?.length ?? 0,
      },
      "Fireworks AI text generation completed"
    );

    return {
      id: response.id,
      model: response.model,
      content: choice?.message?.content || "",
      toolCalls: extractToolCalls(choice?.message?.tool_calls),
      finishReason: mapFinishReason(choice?.finish_reason),
      usage: {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      creditsUsed: 0,
      newBalance: 0,
    };
  } catch (error) {
    log.error({ error, model: request.model, hasImages }, "Fireworks AI chat error");
    throw mapFireworksError(error);
  }
}

// ===========================================
// Streaming Text Generation
// ===========================================

export async function* fireworksTextGenerationStream(
  request: TextGenerationRequest
): AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }> {
  const client = getFireworksClient();
  const log = logger.child({ module: "2bot-ai-fireworks", capability: "text-generation" });

  try {
    const createParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages: request.messages.map(formatMessageForFireworks),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForFireworks(request.tools);
      const toolChoice = formatToolChoiceForFireworks(request.toolChoice);
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

      // Stream tool call deltas (OpenAI-compatible format)
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

    // If Fireworks doesn't return usage in stream, estimate from content
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
      "Fireworks AI stream completed"
    );

    return usage;
  } catch (error) {
    log.error({ error, model: request.model }, "Fireworks AI stream error");
    throw mapFireworksError(error);
  }
}

// ===========================================
// Image Generation (Stable Diffusion, FLUX via Fireworks)
// ===========================================

export async function fireworksImageGeneration(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const client = getFireworksClient();
  const log = logger.child({ module: "2bot-ai-fireworks", capability: "image-generation" });

  try {
    const response = await client.images.generate({
      model: request.model || "accounts/fireworks/models/flux-1-schnell-fp8",
      prompt: request.prompt,
      size: (request.size || "1024x1024") as "256x256" | "512x512" | "1024x1024" | "1792x1024" | "1024x1792",
      n: request.n || 1,
      response_format: "b64_json",
    });

    const images = (response.data || []).map((img) => ({
      url: img.b64_json ? `data:image/png;base64,${img.b64_json}` : img.url || "",
      revisedPrompt: img.revised_prompt,
    }));

    log.info(
      {
        model: request.model,
        imageCount: images.length,
        size: request.size,
      },
      "Fireworks AI image generated"
    );

    return {
      id: `img_fireworks_${Date.now()}`,
      images,
      model: request.model || "accounts/fireworks/models/flux-1-schnell-fp8",
      creditsUsed: 0,
      newBalance: 0,
    };
  } catch (error) {
    log.error({ error, model: request.model }, "Fireworks AI image error");
    throw mapFireworksError(error);
  }
}

// ===========================================
// Error Mapping
// ===========================================

function mapFireworksError(error: unknown): TwoBotAIError {
  if (error instanceof OpenAI.APIError) {
    const status = error.status || 500;
    const message = error.message || "";

    if (status === 429) {
      return new TwoBotAIError("Rate limit exceeded. Please try again later.", "RATE_LIMITED", 429);
    }
    if (status === 401 || status === 403) {
      return new TwoBotAIError("Fireworks AI authentication failed. Check API key.", "PROVIDER_ERROR", 401);
    }
    if (status === 404) {
      return new TwoBotAIError("Model not available on Fireworks AI.", "MODEL_UNAVAILABLE", 404);
    }
    if (message.includes("content") && message.includes("policy")) {
      return new TwoBotAIError("Content was filtered due to policy violations.", "CONTENT_FILTERED", 400);
    }

    return new TwoBotAIError(message || "Fireworks AI API error", "PROVIDER_ERROR", status);
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("timeout")) {
      return new TwoBotAIError("Request timed out", "TIMEOUT", 408);
    }
    return new TwoBotAIError(error.message || "Fireworks AI API error", "PROVIDER_ERROR", 500);
  }

  return new TwoBotAIError("Unknown Fireworks AI error", "PROVIDER_ERROR", 500);
}
