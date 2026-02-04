"use strict";
/**
 * Anthropic Adapter for 2Bot AI
 *
 * Wraps Anthropic API for Claude chat models.
 * Uses 2Bot's API keys (not user BYOK keys).
 *
 * @module modules/2bot-ai-provider/adapters/anthropic.adapter
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicTextGeneration = anthropicTextGeneration;
exports.anthropicTextGenerationStream = anthropicTextGenerationStream;
const logger_1 = require("@/lib/logger");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const types_1 = require("../types");
// ===========================================
// Anthropic Client Singleton
// ===========================================
let anthropicClient = null;
function getAnthropicClient() {
    if (!anthropicClient) {
        const apiKey = process.env.TWOBOT_ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new types_1.TwoBotAIError("2Bot Anthropic API key not configured", "PROVIDER_ERROR", 500);
        }
        anthropicClient = new sdk_1.default({ apiKey });
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
const MODEL_MAP = {
    // Claude 4 models (latest)
    "claude-4-opus": "claude-opus-4-20250514", // Fixed: opus → opus (not sonnet!)
    "claude-4-sonnet": "claude-sonnet-4-20250514", // sonnet → sonnet
    // Claude 3.5 models
    "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3.5-haiku": "claude-3-5-haiku-20241022",
    // Legacy Claude 3 models
    "claude-3-opus": "claude-3-opus-20240229",
    "claude-3-sonnet": "claude-3-sonnet-20240229",
    "claude-3-haiku": "claude-3-haiku-20240307",
};
function mapModelId(model) {
    return MODEL_MAP[model] || model;
}
// ===========================================
// Chat Completion
// ===========================================
async function anthropicTextGeneration(request) {
    const client = getAnthropicClient();
    const log = logger_1.logger.child({ module: "2bot-ai-anthropic", capability: "text-generation" });
    try {
        // Extract system message if present
        const systemMessage = request.messages.find((m) => m.role === "system");
        const conversationMessages = request.messages.filter((m) => m.role !== "system");
        const response = await client.messages.create({
            model: mapModelId(request.model),
            system: systemMessage?.content,
            messages: conversationMessages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.7,
        });
        const textBlock = response.content.find((c) => c.type === "text");
        const content = textBlock?.type === "text" ? textBlock.text : "";
        log.info({
            model: request.model,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
        }, "Anthropic chat completed");
        return {
            id: response.id,
            model: response.model,
            content,
            finishReason: response.stop_reason === "end_turn" ? "stop" : response.stop_reason,
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            },
            creditsUsed: 0,
            newBalance: 0,
        };
    }
    catch (error) {
        log.error({ error }, "Anthropic chat error");
        throw mapAnthropicError(error);
    }
}
/**
 * Streaming chat completion
 * Yields chunks as they arrive from Anthropic
 */
async function* anthropicTextGenerationStream(request) {
    const client = getAnthropicClient();
    const log = logger_1.logger.child({ module: "2bot-ai-anthropic", capability: "text-generation" });
    try {
        // Extract system message if present
        const systemMessage = request.messages.find((m) => m.role === "system");
        const conversationMessages = request.messages.filter((m) => m.role !== "system");
        const stream = await client.messages.stream({
            model: mapModelId(request.model),
            system: systemMessage?.content,
            messages: conversationMessages.map((m) => ({
                role: m.role,
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
            }
            else if (event.type === "content_block_delta") {
                const delta = event.delta;
                if (delta.type === "text_delta") {
                    totalContent += delta.text;
                    yield {
                        id: messageId,
                        delta: delta.text,
                        finishReason: null,
                    };
                }
            }
            else if (event.type === "message_stop") {
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
    }
    catch (error) {
        log.error({ error }, "Anthropic stream error");
        throw mapAnthropicError(error);
    }
}
// ===========================================
// Error Mapping
// ===========================================
function mapAnthropicError(error) {
    if (error instanceof sdk_1.default.APIError) {
        switch (error.status) {
            case 429:
                return new types_1.TwoBotAIError("Rate limit exceeded. Please try again later.", "RATE_LIMITED", 429);
            case 400:
                return new types_1.TwoBotAIError(error.message || "Invalid request", "INVALID_REQUEST", 400);
            case 529:
                return new types_1.TwoBotAIError("Anthropic is temporarily overloaded. Please try again.", "MODEL_UNAVAILABLE", 503);
            default:
                return new types_1.TwoBotAIError(error.message || "Anthropic API error", "PROVIDER_ERROR", error.status || 500);
        }
    }
    if (error instanceof Error && error.name === "AbortError") {
        return new types_1.TwoBotAIError("Request timed out", "TIMEOUT", 408);
    }
    return new types_1.TwoBotAIError(error instanceof Error ? error.message : "Unknown error", "PROVIDER_ERROR", 500);
}
//# sourceMappingURL=anthropic.adapter.js.map