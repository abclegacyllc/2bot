/**
 * Google Generative Language API Adapter
 *
 * For Gemini 3.x, Nano Banana, and other models only available on the
 * Generative Language API (not on Vertex AI OpenAI-compatible endpoint).
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Streaming: https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse
 *
 * Auth: Same service account as Vertex AI, but requires BOTH scopes:
 *   - https://www.googleapis.com/auth/generative-language
 *   - https://www.googleapis.com/auth/cloud-platform
 *
 * @module modules/2bot-ai-provider/adapters/google-genlang.adapter
 */

import { logger } from "@/lib/logger";
import type {
  TextGenerationRequest,
  TextGenerationResponse,
  TextGenerationStreamChunk,
  ToolCallResult,
  ToolDefinition,
} from "../types";
import { TwoBotAIError } from "../types";

// ===========================================
// Configuration
// ===========================================

const GENLANG_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// ===========================================
// Access Token (separate cache — different scopes than Vertex AI)
// ===========================================

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGenLangAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const serviceAccountJson = process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new TwoBotAIError(
      "TWOBOT_VERTEX_AI_SERVICE_ACCOUNT not configured",
      "PROVIDER_ERROR",
      500,
    );
  }

  const sa = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      // GenLang API requires generative-language scope (cloud-platform alone → 403)
      scope:
        "https://www.googleapis.com/auth/generative-language https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");

  const jwt = `${header}.${payload}.${signature}`;

  const tokenResponse = await fetch(
    sa.token_uri || "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!tokenResponse.ok) {
    throw new TwoBotAIError(
      "Failed to obtain GenLang access token",
      "PROVIDER_ERROR",
      500,
    );
  }

  const data = (await tokenResponse.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

// ===========================================
// GenLang API Types
// ===========================================

interface GenLangPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GenLangContent {
  role: "user" | "model";
  parts: GenLangPart[];
}

interface GenLangRequestBody {
  contents: GenLangContent[];
  systemInstruction?: { parts: GenLangPart[] };
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description: string;
      parameters?: Record<string, unknown>;
    }>;
  }>;
  toolConfig?: {
    functionCallingConfig: {
      mode: "AUTO" | "NONE" | "ANY";
      allowedFunctionNames?: string[];
    };
  };
}

// ===========================================
// Message Conversion (our types → GenLang)
// ===========================================

function convertMessages(messages: TextGenerationRequest["messages"]): {
  contents: GenLangContent[];
  systemInstruction?: { parts: GenLangPart[] };
} {
  const contents: GenLangContent[] = [];
  let systemInstruction: { parts: GenLangPart[] } | undefined;

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = { parts: [{ text: msg.content }] };
      continue;
    }

    if (msg.role === "assistant") {
      const parts: GenLangPart[] = [];
      if (msg.content) parts.push({ text: msg.content });
      contents.push({
        role: "model",
        parts: parts.length > 0 ? parts : [{ text: "" }],
      });
      continue;
    }

    // User message (including tool results wrapped as user messages)
    if (msg.parts && msg.parts.length > 0) {
      const parts: GenLangPart[] = msg.parts.map((p) => {
        if (p.type === "text") return { text: p.text || "" };
        if (p.type === "image_url" && p.image_url) {
          const url = p.image_url.url;
          if (url.startsWith("data:")) {
            const commaIdx = url.indexOf(",");
            const meta = url.slice(0, commaIdx);
            const data = url.slice(commaIdx + 1);
            const mimeType =
              meta.split(":")[1]?.split(";")[0] || "image/png";
            return { inlineData: { mimeType, data } };
          }
          return { text: `[Image: ${url}]` };
        }
        return { text: "" };
      });
      contents.push({ role: "user", parts });
    } else {
      contents.push({
        role: "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  return { contents, systemInstruction };
}

// ===========================================
// Tool Conversion
// ===========================================

function convertTools(
  tools: ToolDefinition[],
): GenLangRequestBody["tools"] {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      })),
    },
  ];
}

function convertToolChoice(
  choice: TextGenerationRequest["toolChoice"],
): GenLangRequestBody["toolConfig"] | undefined {
  if (!choice) return undefined;
  if (typeof choice === "string") {
    const modeMap: Record<string, "AUTO" | "NONE" | "ANY"> = {
      auto: "AUTO",
      none: "NONE",
      required: "ANY",
    };
    return {
      functionCallingConfig: { mode: modeMap[choice] || "AUTO" },
    };
  }
  return {
    functionCallingConfig: {
      mode: "ANY",
      allowedFunctionNames: [choice.name],
    },
  };
}

// ===========================================
// Response Mapping
// ===========================================

function mapFinishReason(
  reason: string | undefined,
): TextGenerationResponse["finishReason"] {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
      return "content_filter";
    default:
      return null;
  }
}

// ===========================================
// Text Generation (non-streaming)
// ===========================================

export async function genLangTextGeneration(
  request: TextGenerationRequest,
): Promise<TextGenerationResponse> {
  const log = logger.child({ adapter: "google-genlang", model: request.model });
  const token = await getGenLangAccessToken();

  const { contents, systemInstruction } = convertMessages(request.messages);

  const body: GenLangRequestBody = {
    contents,
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 8192,
    },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (request.tools && request.tools.length > 0) {
    body.tools = convertTools(request.tools);
    const toolConfig = convertToolChoice(request.toolChoice);
    if (toolConfig) body.toolConfig = toolConfig;
  }

  const url = `${GENLANG_BASE_URL}/models/${request.model}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    log.error(
      { status: response.status, error: errText },
      "GenLang API error",
    );
    throw new TwoBotAIError(
      `GenLang API error: ${response.status}`,
      "PROVIDER_ERROR",
      response.status,
      { detail: errText },
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: GenLangPart[]; role?: string };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Extract text, tool calls, and images from response parts
  let textContent = "";
  const toolCalls: ToolCallResult[] = [];

  for (const part of parts) {
    if (part.text) textContent += part.text;
    if (part.functionCall) {
      toolCalls.push({
        id: `genlang-tc-${Date.now()}-${toolCalls.length}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args || {},
      });
    }
    // Gemini image models return inline images in the response
    if (part.inlineData) {
      textContent += `\n![Generated Image](data:${part.inlineData.mimeType};base64,${part.inlineData.data})`;
    }
  }

  const usage = data.usageMetadata || {};

  log.info(
    {
      model: request.model,
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      toolCallCount: toolCalls.length,
    },
    "GenLang text generation completed",
  );

  return {
    id: `genlang-${Date.now()}`,
    model: request.model,
    content: textContent,
    finishReason:
      toolCalls.length > 0
        ? "tool_use"
        : mapFinishReason(candidate?.finishReason),
    usage: {
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
    },
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    creditsUsed: 0,
    newBalance: 0,
  };
}

// ===========================================
// Text Generation (Streaming via SSE)
// ===========================================

export async function* genLangTextGenerationStream(
  request: TextGenerationRequest,
): AsyncGenerator<
  TextGenerationStreamChunk,
  { inputTokens: number; outputTokens: number }
> {
  const log = logger.child({ adapter: "google-genlang", model: request.model });
  const token = await getGenLangAccessToken();

  const { contents, systemInstruction } = convertMessages(request.messages);

  const body: GenLangRequestBody = {
    contents,
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 8192,
    },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (request.tools && request.tools.length > 0) {
    body.tools = convertTools(request.tools);
    const toolConfig = convertToolChoice(request.toolChoice);
    if (toolConfig) body.toolConfig = toolConfig;
  }

  const url = `${GENLANG_BASE_URL}/models/${request.model}:streamGenerateContent?alt=sse`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new TwoBotAIError(
      `GenLang streaming error: ${response.status}`,
      "PROVIDER_ERROR",
      response.status,
      { detail: errText },
    );
  }

  let inputTokens = 0;
  let outputTokens = 0;
  const streamId = `genlang-stream-${Date.now()}`;
  let toolCallIndex = 0;

  // Parse SSE stream
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        let chunk: {
          candidates?: Array<{
            content?: { parts?: GenLangPart[] };
            finishReason?: string;
          }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
        };
        try {
          chunk = JSON.parse(jsonStr);
        } catch {
          continue; // Skip malformed JSON
        }

        const candidate = chunk.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        for (const part of parts) {
          if (part.text) {
            yield {
              id: streamId,
              delta: part.text,
              finishReason: null,
            };
          }
          if (part.functionCall) {
            yield {
              id: streamId,
              delta: "",
              finishReason: null,
              toolUse: {
                index: toolCallIndex,
                id: `genlang-tc-${Date.now()}-${toolCallIndex}`,
                name: part.functionCall.name,
                argumentsDelta: JSON.stringify(
                  part.functionCall.args || {},
                ),
              },
            };
            toolCallIndex++;
          }
        }

        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount || 0;
          outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    id: streamId,
    delta: "",
    finishReason: toolCallIndex > 0 ? "tool_use" : "stop",
  };

  log.info(
    { model: request.model, inputTokens, outputTokens },
    "GenLang streaming completed",
  );

  return { inputTokens, outputTokens };
}
