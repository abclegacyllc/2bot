/**
 * AI Gateway Provider
 *
 * Implements the GatewayProvider interface for AI API providers.
 * Uses native fetch for API calls to support OpenAI-compatible APIs.
 *
 * Supports:
 * - OpenAI (default)
 * - Any OpenAI-compatible API (Groq, DeepSeek, Mistral, etc.)
 * - Ollama (with custom baseUrl)
 *
 * @module modules/gateway/providers/ai.provider
 */

import { prisma } from "@/lib/prisma";
import type { GatewayType } from "@prisma/client";
import { byokUsageService } from "../ai-usage.service";
import type { GatewayAction } from "../gateway.registry";
import type { AICredentials, AIProvider as AIProviderType } from "../gateway.types";
import { AI_PROVIDERS } from "../gateway.types";
import {
    BaseGatewayProvider,
    InvalidCredentialsError,
    UnsupportedActionError,
} from "./base.provider";

// ===========================================
// AI API Types
// ===========================================

/**
 * Default API endpoints for supported providers
 */
const PROVIDER_BASE_URLS: Record<AIProviderType, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1", // Note: Anthropic has different API format
  deepseek: "https://api.deepseek.com/v1",
  grok: "https://api.x.ai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai", // OpenAI-compatible endpoint
  mistral: "https://api.mistral.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  ollama: "http://localhost:11434/v1", // Default local Ollama
};

/**
 * Default models for providers
 */
const DEFAULT_MODELS: Record<AIProviderType, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-20241022",
  deepseek: "deepseek-chat",
  grok: "grok-2-latest",
  gemini: "gemini-2.0-flash-exp",
  mistral: "mistral-large-latest",
  groq: "llama-3.3-70b-versatile",
  ollama: "llama3.2",
};

/**
 * OpenAI-compatible chat message
 */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Chat completion request
 */
interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Chat completion response (non-streaming)
 */
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Models list response
 */
interface ModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

/**
 * AI API Error response
 */
interface AIErrorResponse {
  error?: {
    message: string;
    type?: string;
    code?: string;
  };
}

// ===========================================
// Custom Errors
// ===========================================

/**
 * Error thrown when an AI API call fails
 */
export class AIApiError extends Error {
  constructor(
    public readonly provider: AIProviderType,
    public readonly statusCode: number,
    message: string,
    public readonly errorType?: string
  ) {
    super(`AI API error (${provider}, ${statusCode}): ${message}`);
    this.name = "AIApiError";
  }
}

// ===========================================
// Configuration
// ===========================================

/**
 * AI Gateway configuration (non-sensitive)
 */
interface AIGatewayConfig {
  defaultModel?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

// ===========================================
// Provider Implementation
// ===========================================

/**
 * AI Provider
 *
 * Supported actions:
 * - chat: Send a chat completion request
 * - listModels: List available models
 * - validateKey: Validate API key
 */
export class AIProvider extends BaseGatewayProvider<AICredentials, AIGatewayConfig> {
  readonly type: GatewayType = "AI";
  readonly name = "AI Provider";
  readonly description = "Connect AI providers (OpenAI, Anthropic, etc.) for text generation";

  /**
   * Credentials cache: gatewayId -> AICredentials
   */
  private credentialsCache: Map<string, AICredentials> = new Map();

  /**
   * Config cache: gatewayId -> AIGatewayConfig
   */
  private configCache: Map<string, AIGatewayConfig> = new Map();

  /**
   * Gateway to userId mapping for BYOK usage tracking
   */
  private gatewayUserMap: Map<string, string> = new Map();

  // ==========================================
  // Abstract Method Implementations
  // ==========================================

  /**
   * Get supported actions for this provider
   */
  getSupportedActions(): GatewayAction[] {
    return [
      {
        name: "chat",
        description: "Send a chat completion request",
        params: {
          messages: { type: "array", required: true, description: "Array of chat messages (role + content)" },
          model: { type: "string", required: false, description: "Model to use (optional, uses default)" },
          temperature: { type: "number", required: false, description: "Sampling temperature 0-2" },
          maxTokens: { type: "number", required: false, description: "Max tokens to generate" },
          systemPrompt: { type: "string", required: false, description: "System prompt to prepend" },
        },
        returns: "Chat completion response with generated text",
      },
      {
        name: "listModels",
        description: "List available models for this provider",
        returns: "List of available model IDs",
      },
      {
        name: "validateKey",
        description: "Validate the API key by making a test request",
        returns: "Validation result",
      },
    ];
  }

  /**
   * Connect to AI provider
   * Validates the API key and caches credentials
   */
  protected async doConnect(
    gatewayId: string,
    credentials: AICredentials,
    config?: AIGatewayConfig
  ): Promise<void> {
    this.log.debug({ gatewayId, provider: credentials.provider }, "Connecting to AI provider");

    // Validate API key by listing models or making a minimal request
    const validation = await this.doValidateCredentials(credentials);
    if (!validation.valid) {
      throw new InvalidCredentialsError(this.type, validation.error || "Invalid API key");
    }

    // Cache credentials and config
    this.credentialsCache.set(gatewayId, credentials);
    if (config) {
      this.configCache.set(gatewayId, config);
    }

    // Fetch and cache userId for BYOK usage tracking
    try {
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: { userId: true },
      });
      if (gateway) {
        this.gatewayUserMap.set(gatewayId, gateway.userId);
      }
    } catch (error) {
      this.log.warn({ gatewayId, error }, "Failed to fetch gateway userId for usage tracking");
    }

    this.log.info(
      { gatewayId, provider: credentials.provider },
      "Connected to AI provider"
    );
  }

  /**
   * Disconnect from AI provider
   * Clears cached credentials
   */
  protected async doDisconnect(gatewayId: string): Promise<void> {
    this.credentialsCache.delete(gatewayId);
    this.configCache.delete(gatewayId);
    this.gatewayUserMap.delete(gatewayId);
    this.log.debug({ gatewayId }, "Disconnected from AI provider");
  }

  /**
   * Validate AI credentials by making a test API call
   */
  protected async doValidateCredentials(
    credentials: AICredentials
  ): Promise<{ valid: boolean; error?: string }> {
    // Validate provider type
    if (!AI_PROVIDERS[credentials.provider]) {
      return { valid: false, error: `Unknown provider: ${credentials.provider}` };
    }

    // Validate API key format (basic check)
    if (!credentials.apiKey || credentials.apiKey.length < 10) {
      return { valid: false, error: "API key is required and must be valid" };
    }

    // For Ollama, check if server is reachable
    if (credentials.provider === "ollama") {
      const baseUrl = credentials.baseUrl || PROVIDER_BASE_URLS.ollama;
      try {
        const response = await fetch(`${baseUrl}/models`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          return { valid: false, error: `Ollama server returned ${response.status}` };
        }
        return { valid: true };
      } catch (error) {
        return {
          valid: false,
          error: `Cannot reach Ollama server at ${baseUrl}`,
        };
      }
    }

    // For other providers, try listing models to validate key
    try {
      await this.listModels(credentials);
      return { valid: true };
    } catch (error) {
      if (error instanceof AIApiError) {
        if (error.statusCode === 401) {
          return { valid: false, error: "Invalid API key" };
        }
        return { valid: false, error: error.message };
      }
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Execute an action on the AI provider
   */
  protected async doExecute<TParams = unknown, TResult = unknown>(
    gatewayId: string,
    action: string,
    params: TParams
  ): Promise<TResult> {
    const credentials = this.credentialsCache.get(gatewayId);
    if (!credentials) {
      throw new Error("Gateway not connected - credentials not found");
    }

    const config = this.configCache.get(gatewayId);
    const typedParams = params as Record<string, unknown> | undefined;
    const userId = this.gatewayUserMap.get(gatewayId);

    switch (action) {
      case "chat":
        return this.executeChat(gatewayId, userId, credentials, config, typedParams) as Promise<TResult>;

      case "listModels":
        return this.listModels(credentials) as Promise<TResult>;

      case "validateKey":
        return this.doValidateCredentials(credentials) as Promise<TResult>;

      default:
        throw new UnsupportedActionError(action, this.type);
    }
  }

  /**
   * Check AI provider health
   */
  protected async doCheckHealth(
    gatewayId: string,
    credentials: AICredentials
  ): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = Date.now();

    try {
      // Try listing models as a health check
      await this.listModels(credentials);
      return {
        healthy: true,
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ==========================================
  // Private Methods
  // ==========================================

  /**
   * Get the base URL for a provider
   */
  private getBaseUrl(credentials: AICredentials): string {
    return credentials.baseUrl || PROVIDER_BASE_URLS[credentials.provider];
  }

  /**
   * Get the default model for a provider
   */
  private getDefaultModel(credentials: AICredentials, config?: AIGatewayConfig): string {
    return credentials.model || config?.defaultModel || DEFAULT_MODELS[credentials.provider];
  }

  /**
   * Make an API request to the AI provider
   */
  private async callApi<T>(
    credentials: AICredentials,
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: unknown
  ): Promise<T> {
    const baseUrl = this.getBaseUrl(credentials);
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Different auth headers for different providers
    if (credentials.provider === "anthropic") {
      headers["x-api-key"] = credentials.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${credentials.apiKey}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000), // 60s timeout
    });

    const data = await response.json() as T | AIErrorResponse;

    if (!response.ok) {
      const errorData = data as AIErrorResponse;
      throw new AIApiError(
        credentials.provider,
        response.status,
        errorData.error?.message || response.statusText,
        errorData.error?.type
      );
    }

    return data as T;
  }

  /**
   * List available models
   */
  private async listModels(credentials: AICredentials): Promise<string[]> {
    // Anthropic has /v1/models endpoint now
    if (credentials.provider === "anthropic") {
      const baseUrl = credentials.baseUrl || PROVIDER_BASE_URLS.anthropic;
      const response = await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          "x-api-key": credentials.apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as AIErrorResponse;
        throw new AIApiError(
          credentials.provider,
          response.status,
          errorData.error?.message || `HTTP ${response.status}`,
          errorData.error?.type
        );
      }

      const data = await response.json() as { data: Array<{ id: string }> };
      return data.data?.map((m) => m.id) || [];
    }

    const response = await this.callApi<ModelsResponse>(
      credentials,
      "/models",
      "GET"
    );

    return response.data.map((m) => m.id);
  }

  /**
   * Execute a chat completion request
   */
  private async executeChat(
    gatewayId: string,
    userId: string | undefined,
    credentials: AICredentials,
    config: AIGatewayConfig | undefined,
    params?: Record<string, unknown>
  ): Promise<ChatCompletionResponse> {
    // Build messages array
    const messages: ChatMessage[] = [];

    // Add system prompt if configured
    const systemPrompt = (params?.systemPrompt as string) || config?.systemPrompt;
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    // Add user messages
    const inputMessages = params?.messages as ChatMessage[] | undefined;
    if (!inputMessages || !Array.isArray(inputMessages)) {
      throw new Error("messages parameter is required and must be an array");
    }
    messages.push(...inputMessages);

    // Determine model
    const model =
      (params?.model as string) || this.getDefaultModel(credentials, config);

    // Build request
    const request: ChatCompletionRequest = {
      model,
      messages,
      temperature: (params?.temperature as number) ?? config?.temperature,
      max_tokens: (params?.maxTokens as number) ?? config?.maxTokens,
      stream: false, // Non-streaming for now
    };

    // Remove undefined fields
    if (request.temperature === undefined) delete request.temperature;
    if (request.max_tokens === undefined) delete request.max_tokens;

    this.log.debug(
      { provider: credentials.provider, model, messageCount: messages.length },
      "Sending chat completion request"
    );

    // Anthropic uses a different endpoint
    let response: ChatCompletionResponse;
    if (credentials.provider === "anthropic") {
      response = await this.executeAnthropicChat(credentials, messages, request);
    } else {
      // OpenAI-compatible API
      response = await this.callApi<ChatCompletionResponse>(
        credentials,
        "/chat/completions",
        "POST",
        request
      );
    }

    this.log.debug(
      {
        provider: credentials.provider,
        model: response.model,
        usage: response.usage,
      },
      "Chat completion received"
    );

    // Track BYOK usage if we have a userId
    if (userId && response.usage) {
      try {
        await byokUsageService.recordUsage({
          userId,
          capability: "text-generation",
          model: response.model || model,
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          gatewayId,
        });
        this.log.debug(
          { userId, gatewayId, tokens: response.usage.total_tokens },
          "BYOK usage tracked"
        );
      } catch (error) {
        // Don't fail the request if usage tracking fails
        this.log.warn({ userId, gatewayId, error }, "Failed to track BYOK usage");
      }
    }

    return response;
  }

  /**
   * Execute Anthropic chat (different API format)
   */
  private async executeAnthropicChat(
    credentials: AICredentials,
    messages: ChatMessage[],
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    // Anthropic API format is different
    // Convert OpenAI format to Anthropic format
    const systemMessage = messages.find((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");

    const anthropicRequest = {
      model: request.model,
      max_tokens: request.max_tokens || 4096, // Required for Anthropic
      system: systemMessage?.content,
      messages: userMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    };

    const response = await this.callApi<{
      id: string;
      type: string;
      model: string;
      content: Array<{ type: string; text: string }>;
      stop_reason: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
    }>(credentials, "/messages", "POST", anthropicRequest);

    // Convert Anthropic response to OpenAI format
    return {
      id: response.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response.content.map((c) => c.text).join(""),
          },
          finish_reason: response.stop_reason === "end_turn" ? "stop" : response.stop_reason,
        },
      ],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}

// ===========================================
// Singleton Instance
// ===========================================

/**
 * Singleton AI provider instance
 */
export const aiProvider = new AIProvider();
