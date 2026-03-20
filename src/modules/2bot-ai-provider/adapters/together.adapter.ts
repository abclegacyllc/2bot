/**
 * Together AI Adapter for 2Bot AI
 *
 * Wraps Together AI API for text generation (chat) and image generation.
 * Together AI uses an OpenAI-compatible API, so the adapter is similar to OpenAI's.
 * Uses 2Bot's API keys (not user BYOK keys).
 *
 * @module modules/2bot-ai-provider/adapters/together.adapter
 */

import { logger } from "@/lib/logger";
import Together from "together-ai";
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
// Together AI Client Singleton
// ===========================================

let togetherClient: Together | null = null;

function getTogetherClient(): Together {
  if (!togetherClient) {
    const apiKey = process.env.TWOBOT_TOGETHER_API_KEY;
    if (!apiKey) {
      throw new TwoBotAIError(
        "2Bot Together AI API key not configured",
        "PROVIDER_ERROR",
        500
      );
    }
    togetherClient = new Together({ apiKey, timeout: 30_000 });
  }
  return togetherClient;
}

// ===========================================
// Message Formatting (OpenAI-compatible)
// ===========================================

/**
 * Convert TextGenerationMessage to Together AI format (OpenAI-compatible).
 * Together vision models accept the same multimodal format as OpenAI.
 */
function formatMessageForTogether(m: TextGenerationRequest["messages"][0]): {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }>;
} {
  // If message has parts (multimodal), convert to OpenAI-compatible format
  if (m.parts && m.parts.length > 0) {
    const content = m.parts.map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text || "" };
      } else if (part.type === "image_url" && part.image_url) {
        return {
          type: "image_url" as const,
          image_url: {
            url: part.image_url.url,
            detail: part.image_url.detail || "auto",
          },
        };
      }
      return { type: "text" as const, text: "" };
    });

    return { role: m.role, content };
  }

  // Standard text message
  return { role: m.role, content: m.content };
}

// ===========================================
// Tool Formatting (OpenAI-compatible)
// ===========================================

function formatToolsForTogether(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

function formatToolChoiceForTogether(
  toolChoice: TextGenerationRequest["toolChoice"]
) {
  if (!toolChoice) return undefined;
  if (typeof toolChoice === "string") return toolChoice;
  return { type: "function" as const, function: { name: toolChoice.name } };
}

function extractToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> | undefined
): ToolCallResult[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((tc) => ({
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

export async function togetherTextGeneration(
  request: TextGenerationRequest
): Promise<TextGenerationResponse> {
  const client = getTogetherClient();
  const log = logger.child({ module: "2bot-ai-together", capability: "text-generation" });

  const hasImages = request.messages.some((m) => m.parts?.some((p) => p.type === "image_url"));

  try {
    // Together SDK types don't expose tools on createParams, so we build
    // a plain object and cast through `unknown` at the call site.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model: request.model,
      messages: request.messages.map(formatMessageForTogether),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: false,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForTogether(request.tools);
      const toolChoice = formatToolChoiceForTogether(request.toolChoice);
      if (toolChoice) createParams.tool_choice = toolChoice;
    }

    const response = await client.chat.completions.create(createParams);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = response as any;
    const choice = result.choices?.[0];
    const message = choice?.message;
    const usage = result.usage;
    const toolCalls = extractToolCalls(
      message?.tool_calls as
        Array<{ id: string; function: { name: string; arguments: string } }> | undefined
    );

    log.info(
      {
        model: request.model,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        hasImages,
        toolCallCount: toolCalls?.length ?? 0,
      },
      "Together AI text generation completed"
    );

    return {
      id: result.id,
      model: result.model,
      content: (message?.content as string) || "",
      finishReason: mapFinishReason(choice?.finish_reason as string | null | undefined),
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
    log.error({ error, model: request.model, hasImages }, "Together AI chat error");
    throw mapTogetherError(error);
  }
}

// ===========================================
// Streaming Text Generation
// ===========================================

export async function* togetherTextGenerationStream(
  request: TextGenerationRequest
): AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }> {
  const client = getTogetherClient();
  const log = logger.child({ module: "2bot-ai-together", capability: "text-generation" });

  try {
    // Together SDK types don't expose tools/streaming params uniformly,
    // so we use a plain options object.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model: request.model,
      messages: request.messages.map(formatMessageForTogether),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForTogether(request.tools);
      const toolChoice = formatToolChoiceForTogether(request.toolChoice);
      if (toolChoice) createParams.tool_choice = toolChoice;
    }

    const stream = await client.chat.completions.create(createParams) as unknown as AsyncIterable<{ id: string; choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }>; usage?: { prompt_tokens: number; completion_tokens: number } }>;

    let totalContent = "";
    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = (choice?.delta?.content as string) || "";

      if (delta) {
        totalContent += delta;
        yield {
          id: chunk.id,
          delta,
          finishReason: mapFinishReason(choice?.finish_reason),
        };
      }

      // Stream tool call deltas (Together uses OpenAI-compatible format)
      const toolCallDeltas = choice?.delta?.tool_calls as
        Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined;
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

    // If Together doesn't return usage in stream, estimate from content
    if (usage.inputTokens === 0 && usage.outputTokens === 0) {
      // rough estimate: 1 token ≈ 4 chars
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
      "Together AI stream completed"
    );

    return usage;
  } catch (error) {
    log.error({ error, model: request.model }, "Together AI stream error");
    throw mapTogetherError(error);
  }
}

// ===========================================
// Image Generation (FLUX, Imagen, etc.)
// ===========================================

export async function togetherImageGeneration(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const client = getTogetherClient();
  const log = logger.child({ module: "2bot-ai-together", capability: "image-generation" });

  try {
    // Request base64 format so images are self-contained (no expiring URLs,
    // no provider branding leak, no CORS issues for preview/download).
    const response = await client.images.generate({
      model: request.model || "black-forest-labs/FLUX.1-schnell",
      prompt: request.prompt,
      width: parseImageDimension(request.size, "width"),
      height: parseImageDimension(request.size, "height"),
      n: request.n || 1,
      response_format: "base64",
      output_format: "png",
    });

    // Convert base64 responses to data URLs
    const images = (response.data || []).map((img) => ({
      url: `data:image/png;base64,${img.b64_json}`,
      revisedPrompt: undefined,
    }));

    log.info(
      {
        model: request.model,
        imageCount: images.length,
        size: request.size,
        quality: request.quality,
      },
      "Together AI image generated"
    );

    return {
      id: `img_together_${Date.now()}`,
      images,
      model: request.model || "black-forest-labs/FLUX.1-schnell",
      creditsUsed: 0,
      newBalance: 0,
    };
  } catch (error) {
    log.error({ error, model: request.model }, "Together AI image error");
    throw mapTogetherError(error);
  }
}

/**
 * Parse image size string (e.g., "1024x1024") to width/height
 */
function parseImageDimension(
  size: string | undefined,
  dimension: "width" | "height"
): number {
  if (!size) return 1024;
  const parts = size.split("x");
  if (dimension === "width") return parseInt(parts[0] ?? "1024") || 1024;
  return parseInt(parts[1] ?? parts[0] ?? "1024") || 1024;
}

// ===========================================
// Error Mapping
// ===========================================

function mapTogetherError(error: unknown): TwoBotAIError {
  if (error instanceof Error) {
    const message = error.message || "";

    // Rate limit
    if (message.includes("rate") || message.includes("429") || message.includes("too many")) {
      return new TwoBotAIError(
        "Rate limit exceeded. Please try again later.",
        "RATE_LIMITED",
        429
      );
    }

    // Auth
    if (message.includes("auth") || message.includes("401") || message.includes("unauthorized") || message.includes("invalid_api_key")) {
      return new TwoBotAIError(
        "Together AI authentication failed. Check API key.",
        "PROVIDER_ERROR",
        401
      );
    }

    // Content filter
    if (message.includes("content") && message.includes("policy")) {
      return new TwoBotAIError(
        "Content was filtered due to policy violations.",
        "CONTENT_FILTERED",
        400
      );
    }

    // Model not found / not available (including non-serverless models)
    if (message.includes("not found") || message.includes("does not exist") || message.includes("non-serverless") || message.includes("not available") || message.includes("model_not_available")) {
      return new TwoBotAIError(
        "This model is currently unavailable. Please try a different model.",
        "MODEL_UNAVAILABLE",
        404
      );
    }

    // Timeout
    if (error.name === "AbortError" || message.includes("timeout")) {
      return new TwoBotAIError("Request timed out", "TIMEOUT", 408);
    }

    return new TwoBotAIError(
      "An error occurred processing your request. Please try again.",
      "PROVIDER_ERROR",
      500
    );
  }

  return new TwoBotAIError(
    "An unexpected error occurred. Please try again.",
    "PROVIDER_ERROR",
    500
  );
}
