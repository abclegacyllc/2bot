/**
 * Vertex AI Adapter for 2Bot AI (Google Cloud)
 *
 * Uses Google Cloud's Vertex AI OpenAI-compatible endpoint.
 * Supports Gemini + Model Garden third-party models (Claude, Llama, Mistral, DeepSeek)
 * with full text, vision, tool calling, and image generation capabilities.
 *
 * Auth: Service account key JSON via TWOBOT_VERTEX_AI_SERVICE_ACCOUNT env var,
 * or Application Default Credentials (ADC) if running on GCP.
 *
 * Endpoint: https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/endpoints/openapi
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/call-gemini-using-openai-library
 * @module modules/2bot-ai-provider/adapters/vertex-ai.adapter
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
import { genLangTextGeneration, genLangTextGenerationStream } from "./google-genlang.adapter";

// ===========================================
// GenLang-Only Model Detection
// ===========================================

/**
 * Models only available via the Generative Language API (not Vertex AI OpenAI-compat).
 * These are routed to the GenLang adapter automatically.
 */
const GENLANG_ONLY_MODELS = new Set([
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-pro-preview-customtools",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview",
  "gemini-robotics-er-1.5-preview",
  "gemini-2.5-flash-image",
]);

function isGenLangModel(modelId: string): boolean {
  return GENLANG_ONLY_MODELS.has(modelId);
}

/** Claude models use Anthropic's Messages API via rawPredict, not OpenAI-compat */
function isClaudeModel(modelId: string): boolean {
  return modelId.startsWith("claude-");
}

// ===========================================
// Configuration
// ===========================================

const VERTEX_REGION = process.env.TWOBOT_VERTEX_AI_REGION || "us-central1";
const VERTEX_PROJECT = process.env.TWOBOT_VERTEX_AI_PROJECT;

// ===========================================
// Access Token Management
// ===========================================

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

/**
 * Get an access token for Vertex AI.
 * Uses a service account key JSON from env var, exchanging it for a short-lived token.
 * Falls back to ADC metadata server if running on GCP.
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const serviceAccountJson = process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    // Exchange service account key for access token via Google OAuth2
    const sa = JSON.parse(serviceAccountJson) as {
      client_email: string;
      private_key: string;
      token_uri?: string;
    };

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })).toString("base64url");

    const { createSign } = await import("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(sa.private_key, "base64url");

    const jwt = `${header}.${payload}.${signature}`;

    const tokenResponse = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
      throw new TwoBotAIError(
        "Failed to obtain Vertex AI access token",
        "PROVIDER_ERROR",
        500
      );
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      token: tokenData.access_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };
    return cachedToken.token;
  }

  // Fallback: ADC metadata server (when running on GCP)
  const metadataResponse = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5_000) }
  );

  if (!metadataResponse.ok) {
    throw new TwoBotAIError(
      "Vertex AI: No service account key and not running on GCP (ADC unavailable)",
      "PROVIDER_ERROR",
      500
    );
  }

  const metaData = (await metadataResponse.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: metaData.access_token,
    expiresAt: Date.now() + metaData.expires_in * 1000,
  };
  return cachedToken.token;
}

// ===========================================
// Per-Model Region Routing
// ===========================================

/**
 * Some Vertex AI models are only available in specific regions.
 * Maps model ID (as sent by registry's google.modelId) to its required region.
 * Models not listed here use the default VERTEX_REGION (us-central1).
 */
const MODEL_REGION_MAP: Record<string, string> = {
  // Llama 4 — only in us-east5
  "llama-4-maverick-17b-128e-instruct-maas": "us-east5",
  "llama-4-scout-17b-16e-instruct-maas": "us-east5",
  // Claude — uses Anthropic Messages API via global region
  "claude-sonnet-4-6": "global",
  "claude-opus-4-6": "global",
  // Qwen — only in us-south1
  "qwen3-235b-a22b-instruct-2507-maas": "us-south1",
  "qwen3-coder-480b-a35b-instruct-maas": "us-south1",
  // DeepSeek V3.1 — only in us-west2
  "deepseek-v3.1-maas": "us-west2",
  // Llama 3.3 — us-central1
  "llama-3.3-70b-instruct-maas": "us-central1",
  // E5 embeddings — us-central1
  "multilingual-e5-large-instruct-maas": "us-central1",
  "multilingual-e5-small-maas": "us-central1",
  // Global endpoint models (Model Garden)
  "glm-5-maas": "global",
  "glm-4.7-maas": "global",
  "deepseek-v3.2-maas": "global",
  "deepseek-ocr-maas": "global",
  "kimi-k2-thinking-maas": "global",
  "minimax-m2-maas": "global",
  "qwen3-next-80b-a3b-instruct-maas": "global",
  "gpt-oss-120b-maas": "global",
};

/** Resolve the Vertex AI region for a given model ID */
function getModelRegion(modelId: string): string {
  return MODEL_REGION_MAP[modelId] || VERTEX_REGION;
}

// ===========================================
// OpenAI-Compatible Client
// ===========================================

async function getVertexClient(region?: string): Promise<OpenAI> {
  if (!VERTEX_PROJECT) {
    throw new TwoBotAIError(
      "TWOBOT_VERTEX_AI_PROJECT not configured",
      "PROVIDER_ERROR",
      500
    );
  }

  const token = await getAccessToken();
  const r = region || VERTEX_REGION;

  // "global" region uses a different URL format (no region prefix on hostname)
  const baseURL = r === "global"
    ? `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/global/endpoints/openapi`
    : `https://${r}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${r}/endpoints/openapi`;

  return new OpenAI({
    apiKey: token,
    baseURL,
    timeout: 30_000,
  });
}

// ===========================================
// Model ID Formatting (publisher/model)
// ===========================================

/**
 * Vertex AI's OpenAI-compatible endpoint requires model IDs in `publisher/model` format.
 * Registry stores plain model IDs — this maps them to the Vertex AI format.
 */
function toVertexModelId(modelId: string): string {
  // Already has publisher prefix
  if (modelId.includes("/")) return modelId;

  if (modelId.startsWith("gemini-")) return `google/${modelId}`;
  if (modelId.startsWith("claude-")) return `anthropic/${modelId}`;
  if (modelId.startsWith("llama-")) return `meta/${modelId}`;
  if (modelId.startsWith("mistral-") || modelId.startsWith("codestral-")) return `mistralai/${modelId}`;
  if (modelId.startsWith("deepseek-")) return `deepseek-ai/${modelId}`;
  if (modelId.startsWith("qwen")) return `qwen/${modelId}`;
  if (modelId.startsWith("glm-")) return `zai-org/${modelId}`;
  if (modelId.startsWith("kimi-")) return `moonshotai/${modelId}`;
  if (modelId.startsWith("minimax-")) return `minimaxai/${modelId}`;
  if (modelId.startsWith("gpt-oss-")) return `openai/${modelId}`;
  if (modelId.startsWith("multilingual-e5-")) return `intfloat/${modelId}`;

  // Fallback: pass through as-is
  return modelId;
}

// ===========================================
// Message Formatting (Multimodal)
// ===========================================

function formatMessage(m: TextGenerationRequest["messages"][0]): {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
      >;
} {
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
  return { role: m.role, content: m.content };
}

// ===========================================
// Tool Formatting (OpenAI-compatible)
// ===========================================

function formatTools(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

function formatToolChoice(toolChoice: TextGenerationRequest["toolChoice"]) {
  if (!toolChoice) return undefined;
  if (typeof toolChoice === "string") return toolChoice;
  return { type: "function" as const, function: { name: toolChoice.name } };
}

function extractToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> | undefined,
): ToolCallResult[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || "{}"),
  }));
}

function mapFinishReason(
  reason: string | null | undefined,
): TextGenerationResponse["finishReason"] {
  if (reason === "tool_calls") return "tool_use";
  return (reason as TextGenerationResponse["finishReason"]) ?? null;
}

// ===========================================
// Claude on Vertex AI (Anthropic Messages API)
// ===========================================

/**
 * Claude models on Vertex AI use the Anthropic Messages API via rawPredict.
 * URL: https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/anthropic/models/{MODEL}:rawPredict
 * Body: Anthropic Messages format with anthropic_version header.
 */
async function claudeVertexTextGeneration(
  request: TextGenerationRequest,
): Promise<TextGenerationResponse> {
  const log = logger.child({ adapter: "vertex-ai-claude", model: request.model });

  if (!VERTEX_PROJECT) {
    throw new TwoBotAIError("TWOBOT_VERTEX_AI_PROJECT not configured", "PROVIDER_ERROR", 500);
  }

  const token = await getAccessToken();
  const url = `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/global/publishers/anthropic/models/${request.model}:rawPredict`;

  // Convert messages: separate system from user/assistant
  const systemMessages = request.messages.filter((m) => m.role === "system");
  const chatMessages = request.messages.filter((m) => m.role !== "system");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    anthropic_version: "vertex-2023-10-16",
    messages: chatMessages.map((m) => ({
      role: m.role,
      content: m.parts && m.parts.length > 0
        ? m.parts.map((p) =>
            p.type === "image_url" && p.image_url
              ? { type: "image", source: { type: "url", url: p.image_url.url } }
              : { type: "text", text: p.text || "" }
          )
        : m.content,
    })),
    max_tokens: request.maxTokens ?? 8192,
    temperature: request.temperature ?? 0.7,
  };

  if (systemMessages.length > 0) {
    body.system = systemMessages.map((m) => m.content).join("\n");
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    log.error({ status: response.status, error: errorText }, "Claude Vertex AI error");
    throw new TwoBotAIError(
      `Claude Vertex AI error: ${response.status} — ${errorText.slice(0, 200)}`,
      "PROVIDER_ERROR",
      response.status,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await response.json()) as any;

  // Extract text content
  const textBlocks = (result.content || []).filter((b: { type: string }) => b.type === "text");
  const content = textBlocks.map((b: { text: string }) => b.text).join("");

  // Extract tool use
  const toolUseBlocks = (result.content || []).filter((b: { type: string }) => b.type === "tool_use");
  const toolCalls: ToolCallResult[] | undefined = toolUseBlocks.length > 0
    ? toolUseBlocks.map((b: { id: string; name: string; input: unknown }) => ({
        id: b.id,
        name: b.name,
        arguments: b.input as Record<string, unknown>,
      }))
    : undefined;

  log.info(
    {
      model: request.model,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      toolCallCount: toolCalls?.length ?? 0,
    },
    "Claude Vertex AI text generation completed",
  );

  return {
    id: result.id ?? `vertex-claude-${Date.now()}`,
    model: result.model ?? request.model,
    content,
    finishReason: result.stop_reason === "tool_use" ? "tool_use" : (result.stop_reason ?? "stop"),
    usage: {
      inputTokens: result.usage?.input_tokens || 0,
      outputTokens: result.usage?.output_tokens || 0,
      totalTokens: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
    },
    toolCalls,
    creditsUsed: 0,
    newBalance: 0,
  };
}

/**
 * Claude streaming via Vertex AI rawPredict with server-sent events.
 */
async function* claudeVertexTextGenerationStream(
  request: TextGenerationRequest,
): AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }> {
  const log = logger.child({ adapter: "vertex-ai-claude", model: request.model });

  if (!VERTEX_PROJECT) {
    throw new TwoBotAIError("TWOBOT_VERTEX_AI_PROJECT not configured", "PROVIDER_ERROR", 500);
  }

  const token = await getAccessToken();
  const url = `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/global/publishers/anthropic/models/${request.model}:streamRawPredict`;

  const systemMessages = request.messages.filter((m) => m.role === "system");
  const chatMessages = request.messages.filter((m) => m.role !== "system");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    anthropic_version: "vertex-2023-10-16",
    messages: chatMessages.map((m) => ({
      role: m.role,
      content: m.parts && m.parts.length > 0
        ? m.parts.map((p) =>
            p.type === "image_url" && p.image_url
              ? { type: "image", source: { type: "url", url: p.image_url.url } }
              : { type: "text", text: p.text || "" }
          )
        : m.content,
    })),
    max_tokens: request.maxTokens ?? 8192,
    temperature: request.temperature ?? 0.7,
    stream: true,
  };

  if (systemMessages.length > 0) {
    body.system = systemMessages.map((m) => m.content).join("\n");
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    throw new TwoBotAIError(
      `Claude Vertex AI stream error: ${response.status} — ${errorText.slice(0, 200)}`,
      "PROVIDER_ERROR",
      response.status,
    );
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let currentId = "";

  const decoder = new TextDecoder();
  let buffer = "";

  // ReadableStream doesn't implement AsyncIterable in all runtimes
  const reader = response.body.getReader();
  const stream = {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    },
  };

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const event = JSON.parse(data) as any;

        if (event.type === "message_start") {
          currentId = event.message?.id || "";
          if (event.message?.usage) {
            inputTokens = event.message.usage.input_tokens || 0;
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta" && event.delta.text) {
            yield { id: currentId, delta: event.delta.text, finishReason: null };
          } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
            yield {
              id: currentId,
              delta: "",
              finishReason: null,
              toolUse: {
                index: event.index ?? 0,
                argumentsDelta: event.delta.partial_json,
              },
            };
          }
        } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          yield {
            id: currentId,
            delta: "",
            finishReason: null,
            toolUse: {
              index: event.index ?? 0,
              id: event.content_block.id,
              name: event.content_block.name,
            },
          };
        } else if (event.type === "message_delta") {
          if (event.usage) {
            outputTokens = event.usage.output_tokens || 0;
          }
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  yield { id: currentId, delta: "", finishReason: "stop" };

  log.info({ model: request.model, inputTokens, outputTokens }, "Claude Vertex AI streaming completed");

  return { inputTokens, outputTokens };
}

// ===========================================
// Text Generation
// ===========================================

export async function vertexTextGeneration(
  request: TextGenerationRequest
): Promise<TextGenerationResponse> {
  // Route GenLang-only models to the Generative Language API adapter
  if (isGenLangModel(request.model)) {
    return genLangTextGeneration(request);
  }

  // Route Claude models to Anthropic Messages API via rawPredict
  if (isClaudeModel(request.model)) {
    return claudeVertexTextGeneration(request);
  }

  const log = logger.child({ adapter: "vertex-ai", model: request.model });
  const region = getModelRegion(request.model);
  const client = await getVertexClient(region);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model: toVertexModelId(request.model),
      messages: request.messages.map(formatMessage),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 8192,
      stream: false,
    };

    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatTools(request.tools);
      const toolChoice = formatToolChoice(request.toolChoice);
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
        | Array<{ id: string; function: { name: string; arguments: string } }>
        | undefined,
    );

    log.info(
      {
        model: request.model,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        toolCallCount: toolCalls?.length ?? 0,
      },
      "Vertex AI text generation completed",
    );

    return {
      id: result.id ?? `vertex-${Date.now()}`,
      model: result.model ?? request.model,
      content: (message?.content as string) || "",
      finishReason: mapFinishReason(choice?.finish_reason as string | null | undefined),
      usage: {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      toolCalls,
      creditsUsed: 0,
      newBalance: 0,
    };
  } catch (err) {
    log.error({ error: err, model: request.model }, "Vertex AI text generation failed");
    if (err instanceof TwoBotAIError) throw err;
    const message = err instanceof Error ? err.message : "Vertex AI request failed";
    throw new TwoBotAIError(message, "PROVIDER_ERROR", 500);
  }
}

// ===========================================
// Text Generation (Streaming)
// ===========================================

export async function* vertexTextGenerationStream(
  request: TextGenerationRequest
): AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }> {
  // Route GenLang-only models to the Generative Language API adapter
  if (isGenLangModel(request.model)) {
    return yield* genLangTextGenerationStream(request);
  }

  // Route Claude models to Anthropic Messages API via streamRawPredict
  if (isClaudeModel(request.model)) {
    return yield* claudeVertexTextGenerationStream(request);
  }

  const log = logger.child({ adapter: "vertex-ai", model: request.model });
  const region = getModelRegion(request.model);
  const client = await getVertexClient(region);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model: toVertexModelId(request.model),
      messages: request.messages.map(formatMessage),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 8192,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.tools && request.tools.length > 0) {
      createParams.tools = formatTools(request.tools);
      const toolChoice = formatToolChoice(request.toolChoice);
      if (toolChoice) createParams.tool_choice = toolChoice;
    }

    const stream = await client.chat.completions.create(createParams) as unknown as AsyncIterable<{ id: string; choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }>; usage?: { prompt_tokens: number; completion_tokens: number } }>;

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = (choice?.delta?.content as string) || "";

      if (delta) {
        yield {
          id: chunk.id,
          delta,
          finishReason: mapFinishReason(choice?.finish_reason),
        };
      }

      // Stream tool call deltas (OpenAI-compatible format)
      const toolCallDeltas = choice?.delta?.tool_calls as
        | Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
        | undefined;
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

      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    yield { id: "", delta: "", finishReason: "stop" };

    log.info(
      { model: request.model, inputTokens, outputTokens },
      "Vertex AI streaming completed",
    );

    return { inputTokens, outputTokens };
  } catch (err) {
    log.error({ error: err, model: request.model }, "Vertex AI streaming failed");
    if (err instanceof TwoBotAIError) throw err;
    const message = err instanceof Error ? err.message : "Vertex AI streaming request failed";
    throw new TwoBotAIError(message, "PROVIDER_ERROR", 500);
  }
}

// ===========================================
// Image Generation (Imagen via Vertex AI)
// ===========================================

export async function vertexImageGeneration(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const log = logger.child({ adapter: "vertex-ai", model: request.model });

  if (!VERTEX_PROJECT) {
    throw new TwoBotAIError("TWOBOT_VERTEX_AI_PROJECT not configured", "PROVIDER_ERROR", 500);
  }

  const token = await getAccessToken();

  // Vertex AI Imagen uses a REST endpoint, not OpenAI-compatible
  const url = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_REGION}/publishers/google/models/${request.model}:predict`;

  log.info("Vertex AI image generation request");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt: request.prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: request.size === "1792x1024" ? "16:9" : request.size === "1024x1792" ? "9:16" : "1:1",
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new TwoBotAIError(
      `Vertex AI image generation failed: ${response.status}`,
      "PROVIDER_ERROR",
      response.status,
      { detail: errText }
    );
  }

  const data = (await response.json()) as {
    predictions: Array<{ bytesBase64Encoded: string; mimeType: string }>;
  };

  const prediction = data.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) {
    throw new TwoBotAIError("Vertex AI returned no image data", "PROVIDER_ERROR", 500);
  }

  return {
    id: `vertex-img-${Date.now()}`,
    images: [{
      url: `data:${prediction.mimeType || "image/png"};base64,${prediction.bytesBase64Encoded}`,
      revisedPrompt: request.prompt,
    }],
    model: request.model || "imagen",
    creditsUsed: 0,
    newBalance: 0,
  };
}
