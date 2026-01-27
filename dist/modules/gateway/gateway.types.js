"use strict";
/**
 * Gateway Types
 *
 * Type definitions for the gateway system including credentials,
 * configuration, and request/response DTOs.
 *
 * @module modules/gateway/gateway.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_PROVIDERS = void 0;
exports.isTelegramBotCredentials = isTelegramBotCredentials;
exports.isAICredentials = isAICredentials;
exports.isWebhookCredentials = isWebhookCredentials;
/**
 * AI Provider metadata for UI/validation
 */
exports.AI_PROVIDERS = {
    openai: { name: "OpenAI", requiresBaseUrl: false },
    anthropic: { name: "Anthropic", requiresBaseUrl: false },
    deepseek: { name: "DeepSeek", requiresBaseUrl: false },
    grok: { name: "Grok (xAI)", requiresBaseUrl: false },
    gemini: { name: "Google Gemini", requiresBaseUrl: false },
    mistral: { name: "Mistral AI", requiresBaseUrl: false },
    groq: { name: "Groq", requiresBaseUrl: false },
    ollama: { name: "Ollama (Local)", requiresBaseUrl: true },
};
// ===========================================
// Type Guards
// ===========================================
/**
 * Check if credentials are for Telegram Bot
 */
function isTelegramBotCredentials(credentials) {
    return "botToken" in credentials;
}
/**
 * Check if credentials are for AI provider
 */
function isAICredentials(credentials) {
    return "provider" in credentials && "apiKey" in credentials;
}
/**
 * Check if credentials are for Webhook
 */
function isWebhookCredentials(credentials) {
    return "url" in credentials && !("provider" in credentials) && !("botToken" in credentials);
}
//# sourceMappingURL=gateway.types.js.map