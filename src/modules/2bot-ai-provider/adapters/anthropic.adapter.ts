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
  TextGenerationStreamChunk
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
  // Claude 4 models (latest)
  "claude-4-opus": "claude-opus-4-20250514",      // Fixed: opus → opus (not sonnet!)
  "claude-4-sonnet": "claude-sonnet-4-20250514",  // sonnet → sonnet
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
// Text Generation
// ===========================================

export async function anthropicTextGeneration(request: TextGenerationRequest): Promise<TextGenerationResponse> {
  const client = getAnthropicClient();
  const log = logger.child({ module: "2bot-ai-anthropic", capability: "text-generation" });

  try {
    // Extract system message if present
    const systemMessage = request.messages.find((m) => m.role === "system");
    const conversationMessages = request.messages.filter((m) => m.role !== "system");

    const response = await client.messages.create({
      model: mapModelId(request.model),
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    });

    const textBlock = response.content.find((c: { type: string }) => c.type === "text");
    const content = textBlock?.type === "text" ? (textBlock as { type: "text"; text: string }).text : "";

    log.info({
      model: request.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }, "Anthropic text generation completed");

    return {
      id: response.id,
      model: response.model,
      content,
      finishReason: response.stop_reason === "end_turn" ? "stop" : response.stop_reason as TextGenerationResponse["finishReason"],
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      creditsUsed: 0,
      newBalance: 0,
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

    const stream = await client.messages.stream({
      model: mapModelId(request.model),
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    });

    let messageId = "";
    let totalContent = "";

    for await (const event of stream) {
      if (event.type === "message_start") {
        messageId = event.message.id;
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          totalContent += delta.text;
          yield {
            id: messageId,
            delta: delta.text,
            finishReason: null,
          };
        }
      } else if (event.type === "message_stop") {
        yield {
          id: messageId,
          delta: "",
          finishReason: "stop",
        };
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
