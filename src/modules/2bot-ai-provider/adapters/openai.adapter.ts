/**
 * OpenAI Adapter for 2Bot AI
 *
 * Wraps OpenAI API for text generation, image generation, speech synthesis, and speech recognition.
 * Uses 2Bot's API keys (not user BYOK keys).
 *
 * @module modules/2bot-ai-provider/adapters/openai.adapter
 */

import { logger } from "@/lib/logger";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type {
    ImageGenerationRequest,
    ImageGenerationResponse,
    SpeechRecognitionRequest,
    SpeechRecognitionResponse,
    SpeechSynthesisRequest,
    SpeechSynthesisResponse,
    TextGenerationRequest,
    TextGenerationResponse,
    TextGenerationStreamChunk,
    ToolCallResult,
    ToolDefinition,
} from "../types";
import { TwoBotAIError } from "../types";

// ===========================================
// OpenAI Client Singleton
// ===========================================

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.TWOBOT_OPENAI_API_KEY;
    if (!apiKey) {
      throw new TwoBotAIError(
        "2Bot OpenAI API key not configured",
        "PROVIDER_ERROR",
        500
      );
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ===========================================
// Text Generation
// ===========================================

/**
 * Convert TextGenerationMessage to OpenAI format, handling multimodal content (vision)
 */
function formatMessageForOpenAI(m: TextGenerationRequest["messages"][0]): {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }>;
  name?: string;
} {
  // If message has parts (multimodal), convert to OpenAI format
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
      // Fallback for unknown types
      return { type: "text" as const, text: "" };
    });

    return {
      role: m.role,
      content,
      ...(m.name && { name: m.name }),
    };
  }

  // Standard text message
  return {
    role: m.role,
    content: m.content,
    ...(m.name && { name: m.name }),
  };
}

/**
 * Convert ToolDefinition[] to OpenAI function calling format.
 */
function formatToolsForOpenAI(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

/**
 * Convert tool_choice from 2Bot format to OpenAI format.
 */
function formatToolChoiceForOpenAI(
  toolChoice: TextGenerationRequest["toolChoice"]
): OpenAI.Chat.ChatCompletionToolChoiceOption | undefined {
  if (!toolChoice) return undefined;
  if (typeof toolChoice === "string") return toolChoice; // 'auto' | 'none' | 'required'
  return { type: "function", function: { name: toolChoice.name } };
}

/**
 * Extract tool calls from an OpenAI response choice.
 * Filters to function-type tool calls only (OpenAI SDK union includes custom tool calls).
 */
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

/**
 * Map OpenAI finish_reason to our finishReason (including tool_calls → tool_use).
 */
function mapFinishReason(reason: string | null | undefined): TextGenerationResponse["finishReason"] {
  if (reason === "tool_calls") return "tool_use";
  return (reason as TextGenerationResponse["finishReason"]) ?? null;
}

export async function openaiTextGeneration(request: TextGenerationRequest): Promise<TextGenerationResponse> {
  const client = getOpenAIClient();
  const log = logger.child({ module: "2bot-ai-openai", capability: "text-generation" });

  // Check if any message has images (for logging/debugging)
  const hasImages = request.messages.some((m) => m.parts?.some((p) => p.type === "image_url"));

  try {
    const createParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages: request.messages.map(formatMessageForOpenAI) as ChatCompletionMessageParam[],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: false,
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForOpenAI(request.tools);
      const toolChoice = formatToolChoiceForOpenAI(request.toolChoice);
      if (toolChoice) createParams.tool_choice = toolChoice;
    }

    const response = await client.chat.completions.create(createParams);

    const choice = response.choices[0];
    const usage = response.usage;
    const toolCalls = extractToolCalls(choice?.message?.tool_calls);

    log.info({
      model: request.model,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      hasImages,
      toolCallCount: toolCalls?.length ?? 0,
    }, "OpenAI text generation completed");

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
      // Credits will be calculated and set by the provider
      creditsUsed: 0,
      newBalance: 0,
      toolCalls,
    };
  } catch (error) {
    log.error({ error, hasImages }, "OpenAI chat error");
    throw mapOpenAIError(error);
  }
}

/**
 * Streaming text generation
 * Yields chunks as they arrive from OpenAI
 */
export async function* openaiTextGenerationStream(
  request: TextGenerationRequest
): AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }> {
  const client = getOpenAIClient();
  const log = logger.child({ module: "2bot-ai-openai", capability: "text-generation" });

  try {
    const createParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages: request.messages.map(formatMessageForOpenAI) as ChatCompletionMessageParam[],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      stream_options: { include_usage: true },
    };

    // Add tools if provided (function calling / agent mode)
    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatToolsForOpenAI(request.tools);
      const toolChoice = formatToolChoiceForOpenAI(request.toolChoice);
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

      // Emit finish_reason on final choice chunk (no delta, no tool_calls)
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

    log.info({
      model: request.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      contentLength: totalContent.length,
    }, "OpenAI stream completed");

    return usage;
  } catch (error) {
    log.error({ error }, "OpenAI stream error");
    throw mapOpenAIError(error);
  }
}

// ===========================================
// Image Generation
// ===========================================

export async function openaiImageGeneration(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  const client = getOpenAIClient();
  const log = logger.child({ module: "2bot-ai-openai", capability: "image-generation" });

  try {
    const isHD = request.model === "dall-e-3-hd" || request.quality === "hd";

    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: request.prompt,
      size: request.size ?? "1024x1024",
      quality: isHD ? "hd" : "standard",
      style: request.style ?? "vivid",
      n: 1, // DALL-E 3 only supports n=1
      response_format: "url",
    });

    const images = (response.data || []).map((img: { url?: string; revised_prompt?: string }) => ({
      url: img.url ?? "",
      revisedPrompt: img.revised_prompt,
    }));

    log.info({
      model: request.model || "dall-e-3",
      imageCount: images.length,
      size: request.size,
      quality: isHD ? "hd" : "standard",
    }, "OpenAI image generated");

    return {
      id: `img_${Date.now()}`,
      images,
      model: isHD ? "dall-e-3-hd" : "dall-e-3",
      creditsUsed: 0,
      newBalance: 0,
    };
  } catch (error) {
    log.error({ error }, "OpenAI image error");
    throw mapOpenAIError(error);
  }
}

// ===========================================
// Speech Synthesis
// ===========================================

export async function openaiSpeechSynthesis(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse> {
  const client = getOpenAIClient();
  const log = logger.child({ module: "2bot-ai-openai", capability: "speech-synthesis" });

  try {
    const response = await client.audio.speech.create({
      model: request.model ?? "tts-1",
      input: request.text,
      voice: request.voice ?? "alloy",
      response_format: request.format ?? "mp3",
      speed: request.speed ?? 1.0,
    });

    // Get audio as buffer
    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

    log.info({
      model: request.model || "tts-1",
      characterCount: request.text.length,
      voice: request.voice || "alloy",
      format: request.format || "mp3",
    }, "OpenAI TTS completed");

    return {
      id: `tts_${Date.now()}`,
      audioUrl: "", // Would be set after upload to storage
      audioBase64,
      format: request.format ?? "mp3",
      characterCount: request.text.length,
      creditsUsed: 0,
      newBalance: 0,
    };
  } catch (error) {
    log.error({ error }, "OpenAI TTS error");
    throw mapOpenAIError(error);
  }
}

// ===========================================
// Speech Recognition
// ===========================================

export async function openaiSpeechRecognition(request: SpeechRecognitionRequest): Promise<SpeechRecognitionResponse> {
  const client = getOpenAIClient();
  const log = logger.child({ module: "2bot-ai-openai", capability: "speech-recognition" });

  try {
    // Convert base64 to File if needed - use Uint8Array for compatibility
    let audioFile: File;
    if (typeof request.audio === "string") {
      const buffer = Buffer.from(request.audio, "base64");
      const uint8Array = new Uint8Array(buffer);
      const blob = new Blob([uint8Array], { type: "audio/webm" });
      audioFile = new File([blob], "audio.webm", { type: "audio/webm" });
    } else {
      const uint8Array = new Uint8Array(request.audio);
      const blob = new Blob([uint8Array], { type: "audio/webm" });
      audioFile = new File([blob], "audio.webm", { type: "audio/webm" });
    }

    const response = await client.audio.transcriptions.create({
      model: request.model ?? "whisper-1",
      file: audioFile,
      language: request.language,
      prompt: request.prompt,
      response_format: "verbose_json",
    });

    const duration = (response as { duration?: number }).duration || 0;

    log.info({
      model: request.model || "whisper-1",
      duration,
      language: response.language,
      textLength: response.text.length,
    }, "OpenAI STT completed");

    return {
      id: `stt_${Date.now()}`,
      text: response.text,
      language: response.language,
      duration,
      creditsUsed: 0,
      newBalance: 0,
    };
  } catch (error) {
    log.error({ error }, "OpenAI STT error");
    throw mapOpenAIError(error);
  }
}

// ===========================================
// Error Mapping
// ===========================================

function mapOpenAIError(error: unknown): TwoBotAIError {
  if (error instanceof OpenAI.APIError) {
    switch (error.status) {
      case 429:
        return new TwoBotAIError(
          "Rate limit exceeded. Please try again later.",
          "RATE_LIMITED",
          429
        );
      case 400:
        if (error.message.includes("content_policy")) {
          return new TwoBotAIError(
            "Content was filtered due to policy violations.",
            "CONTENT_FILTERED",
            400
          );
        }
        return new TwoBotAIError(
          error.message || "Invalid request",
          "INVALID_REQUEST",
          400
        );
      case 503:
        return new TwoBotAIError(
          "Model temporarily unavailable. Please try again.",
          "MODEL_UNAVAILABLE",
          503
        );
      default:
        return new TwoBotAIError(
          error.message || "OpenAI API error",
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
