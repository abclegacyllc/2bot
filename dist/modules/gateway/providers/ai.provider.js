"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiProvider = exports.AIProvider = exports.AIApiError = void 0;
const gateway_types_1 = require("../gateway.types");
const base_provider_1 = require("./base.provider");
// ===========================================
// AI API Types
// ===========================================
/**
 * Default API endpoints for supported providers
 */
const PROVIDER_BASE_URLS = {
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
const DEFAULT_MODELS = {
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-sonnet-20241022",
    deepseek: "deepseek-chat",
    grok: "grok-2-latest",
    gemini: "gemini-2.0-flash-exp",
    mistral: "mistral-large-latest",
    groq: "llama-3.3-70b-versatile",
    ollama: "llama3.2",
};
// ===========================================
// Custom Errors
// ===========================================
/**
 * Error thrown when an AI API call fails
 */
class AIApiError extends Error {
    provider;
    statusCode;
    errorType;
    constructor(provider, statusCode, message, errorType) {
        super(`AI API error (${provider}, ${statusCode}): ${message}`);
        this.provider = provider;
        this.statusCode = statusCode;
        this.errorType = errorType;
        this.name = "AIApiError";
    }
}
exports.AIApiError = AIApiError;
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
class AIProvider extends base_provider_1.BaseGatewayProvider {
    type = "AI";
    name = "AI Provider";
    description = "Connect AI providers (OpenAI, Anthropic, etc.) for text generation";
    /**
     * Credentials cache: gatewayId -> AICredentials
     */
    credentialsCache = new Map();
    /**
     * Config cache: gatewayId -> AIGatewayConfig
     */
    configCache = new Map();
    // ==========================================
    // Abstract Method Implementations
    // ==========================================
    /**
     * Get supported actions for this provider
     */
    getSupportedActions() {
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
    async doConnect(gatewayId, credentials, config) {
        this.log.debug({ gatewayId, provider: credentials.provider }, "Connecting to AI provider");
        // Validate API key by listing models or making a minimal request
        const validation = await this.doValidateCredentials(credentials);
        if (!validation.valid) {
            throw new base_provider_1.InvalidCredentialsError(this.type, validation.error || "Invalid API key");
        }
        // Cache credentials and config
        this.credentialsCache.set(gatewayId, credentials);
        if (config) {
            this.configCache.set(gatewayId, config);
        }
        this.log.info({ gatewayId, provider: credentials.provider }, "Connected to AI provider");
    }
    /**
     * Disconnect from AI provider
     * Clears cached credentials
     */
    async doDisconnect(gatewayId) {
        this.credentialsCache.delete(gatewayId);
        this.configCache.delete(gatewayId);
        this.log.debug({ gatewayId }, "Disconnected from AI provider");
    }
    /**
     * Validate AI credentials by making a test API call
     */
    async doValidateCredentials(credentials) {
        // Validate provider type
        if (!gateway_types_1.AI_PROVIDERS[credentials.provider]) {
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
            }
            catch (error) {
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
        }
        catch (error) {
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
    async doExecute(gatewayId, action, params) {
        const credentials = this.credentialsCache.get(gatewayId);
        if (!credentials) {
            throw new Error("Gateway not connected - credentials not found");
        }
        const config = this.configCache.get(gatewayId);
        const typedParams = params;
        switch (action) {
            case "chat":
                return this.executeChat(credentials, config, typedParams);
            case "listModels":
                return this.listModels(credentials);
            case "validateKey":
                return this.doValidateCredentials(credentials);
            default:
                throw new base_provider_1.UnsupportedActionError(action, this.type);
        }
    }
    /**
     * Check AI provider health
     */
    async doCheckHealth(gatewayId, credentials) {
        const start = Date.now();
        try {
            // Try listing models as a health check
            await this.listModels(credentials);
            return {
                healthy: true,
                latency: Date.now() - start,
            };
        }
        catch (error) {
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
    getBaseUrl(credentials) {
        return credentials.baseUrl || PROVIDER_BASE_URLS[credentials.provider];
    }
    /**
     * Get the default model for a provider
     */
    getDefaultModel(credentials, config) {
        return credentials.model || config?.defaultModel || DEFAULT_MODELS[credentials.provider];
    }
    /**
     * Make an API request to the AI provider
     */
    async callApi(credentials, endpoint, method = "GET", body) {
        const baseUrl = this.getBaseUrl(credentials);
        const url = `${baseUrl}${endpoint}`;
        const headers = {
            "Content-Type": "application/json",
        };
        // Different auth headers for different providers
        if (credentials.provider === "anthropic") {
            headers["x-api-key"] = credentials.apiKey;
            headers["anthropic-version"] = "2023-06-01";
        }
        else {
            headers["Authorization"] = `Bearer ${credentials.apiKey}`;
        }
        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(60000), // 60s timeout
        });
        const data = await response.json();
        if (!response.ok) {
            const errorData = data;
            throw new AIApiError(credentials.provider, response.status, errorData.error?.message || response.statusText, errorData.error?.type);
        }
        return data;
    }
    /**
     * List available models
     */
    async listModels(credentials) {
        // Anthropic doesn't have a models endpoint
        if (credentials.provider === "anthropic") {
            // Return static list for Anthropic
            return [
                "claude-3-5-sonnet-20241022",
                "claude-3-5-haiku-20241022",
                "claude-3-opus-20240229",
            ];
        }
        const response = await this.callApi(credentials, "/models", "GET");
        return response.data.map((m) => m.id);
    }
    /**
     * Execute a chat completion request
     */
    async executeChat(credentials, config, params) {
        // Build messages array
        const messages = [];
        // Add system prompt if configured
        const systemPrompt = params?.systemPrompt || config?.systemPrompt;
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        // Add user messages
        const inputMessages = params?.messages;
        if (!inputMessages || !Array.isArray(inputMessages)) {
            throw new Error("messages parameter is required and must be an array");
        }
        messages.push(...inputMessages);
        // Determine model
        const model = params?.model || this.getDefaultModel(credentials, config);
        // Build request
        const request = {
            model,
            messages,
            temperature: params?.temperature ?? config?.temperature,
            max_tokens: params?.maxTokens ?? config?.maxTokens,
            stream: false, // Non-streaming for now
        };
        // Remove undefined fields
        if (request.temperature === undefined)
            delete request.temperature;
        if (request.max_tokens === undefined)
            delete request.max_tokens;
        this.log.debug({ provider: credentials.provider, model, messageCount: messages.length }, "Sending chat completion request");
        // Anthropic uses a different endpoint
        if (credentials.provider === "anthropic") {
            return this.executeAnthropicChat(credentials, messages, request);
        }
        // OpenAI-compatible API
        const response = await this.callApi(credentials, "/chat/completions", "POST", request);
        this.log.debug({
            provider: credentials.provider,
            model: response.model,
            usage: response.usage,
        }, "Chat completion received");
        return response;
    }
    /**
     * Execute Anthropic chat (different API format)
     */
    async executeAnthropicChat(credentials, messages, request) {
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
        const response = await this.callApi(credentials, "/messages", "POST", anthropicRequest);
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
exports.AIProvider = AIProvider;
// ===========================================
// Singleton Instance
// ===========================================
/**
 * Singleton AI provider instance
 */
exports.aiProvider = new AIProvider();
//# sourceMappingURL=ai.provider.js.map