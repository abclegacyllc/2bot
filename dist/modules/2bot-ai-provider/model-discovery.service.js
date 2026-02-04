"use strict";
/**
 * Model Discovery Service
 *
 * Dynamically discovers available models from AI providers.
 * Instead of hardcoding models, we fetch them from the provider APIs
 * and merge with our metadata (pricing, capabilities).
 *
 * OpenAI: Has /models API endpoint - we can query it directly
 * Anthropic: No models API - we maintain a registry synced with their docs
 *
 * @module modules/2bot-ai-provider/model-discovery.service
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverOpenAIModels = discoverOpenAIModels;
exports.discoverAnthropicModels = discoverAnthropicModels;
exports.discoverAllModels = discoverAllModels;
exports.getDiscoveredModels = getDiscoveredModels;
exports.clearDiscoveryCache = clearDiscoveryCache;
exports.hasDiscoveredModels = hasDiscoveredModels;
const logger_1 = require("@/lib/logger");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const openai_1 = __importDefault(require("openai"));
const model_pricing_1 = require("./model-pricing");
const log = logger_1.logger.child({ module: "model-discovery" });
// ===========================================
// Model Metadata Registry
// ===========================================
/**
 * Base capabilities for different model types
 */
const CHAT_CAPABILITIES = {
    inputTypes: ["text"],
    outputTypes: ["text"],
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJsonMode: true,
};
const VISION_CAPABILITIES = {
    inputTypes: ["text", "image"],
    outputTypes: ["text"],
    canAnalyzeImages: true,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJsonMode: true,
};
const IMAGE_GEN_CAPABILITIES = {
    inputTypes: ["text"],
    outputTypes: ["image"],
    canGenerateImages: true,
    supportsStreaming: false,
};
const TTS_CAPABILITIES = {
    inputTypes: ["text"],
    outputTypes: ["audio"],
    canGenerateAudio: true,
    supportsStreaming: true,
};
const STT_CAPABILITIES = {
    inputTypes: ["audio"],
    outputTypes: ["text"],
    canTranscribeAudio: true,
    supportsStreaming: false,
};
/**
 * OpenAI model metadata registry
 * Maps model ID patterns to our metadata
 * Pricing is imported from model-pricing.ts (single source of truth)
 */
const OPENAI_MODEL_METADATA = {
    // GPT-4o Mini - Fast & cheap
    "gpt-4o-mini": {
        displayName: "GPT-4o Mini",
        description: "Fast, affordable model for everyday tasks",
        capability: "text-generation",
        tier: 1,
        badge: "FAST",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "medium", speed: "high", creativity: "medium" },
        creditsPerInputToken: model_pricing_1.OPENAI_CHAT_PRICING["gpt-4o-mini"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.OPENAI_CHAT_PRICING["gpt-4o-mini"].creditsPerOutputToken,
        maxTokens: 16384,
        contextWindow: 128000,
    },
    // GPT-4o - Most capable
    "gpt-4o": {
        displayName: "GPT-4o",
        description: "Most capable OpenAI model for complex tasks",
        capability: "text-generation",
        tier: 2,
        capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
        creditsPerInputToken: model_pricing_1.OPENAI_CHAT_PRICING["gpt-4o"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.OPENAI_CHAT_PRICING["gpt-4o"].creditsPerOutputToken,
        maxTokens: 16384,
        contextWindow: 128000,
    },
    // o1 - Reasoning model
    "o1": {
        displayName: "o1",
        description: "Advanced reasoning model for complex problems",
        capability: "text-generation",
        tier: 3,
        badge: "REASONING",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "medium" },
        creditsPerInputToken: model_pricing_1.OPENAI_CHAT_PRICING["o1"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.OPENAI_CHAT_PRICING["o1"].creditsPerOutputToken,
        maxTokens: 100000,
        contextWindow: 200000,
    },
    // o1-mini - Faster reasoning
    "o1-mini": {
        displayName: "o1 Mini",
        description: "Fast reasoning model, good for coding",
        capability: "text-generation",
        tier: 2,
        badge: "REASONING",
        capabilities: { ...CHAT_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "medium" },
        creditsPerInputToken: model_pricing_1.OPENAI_CHAT_PRICING["o1-mini"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.OPENAI_CHAT_PRICING["o1-mini"].creditsPerOutputToken,
        maxTokens: 65536,
        contextWindow: 128000,
    },
    // o3-mini - Latest reasoning
    "o3-mini": {
        displayName: "o3 Mini",
        description: "Latest reasoning model with improved performance",
        capability: "text-generation",
        tier: 2,
        badge: "NEW",
        capabilities: { ...CHAT_CAPABILITIES, reasoning: "highest", speed: "medium", creativity: "medium" },
        creditsPerInputToken: model_pricing_1.OPENAI_CHAT_PRICING["o3-mini"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.OPENAI_CHAT_PRICING["o3-mini"].creditsPerOutputToken,
        maxTokens: 100000,
        contextWindow: 200000,
    },
    // GPT-4 Turbo - Previous gen
    "gpt-4-turbo": {
        displayName: "GPT-4 Turbo",
        description: "Previous generation high-performance model",
        capability: "text-generation",
        tier: 3,
        deprecated: true,
        deprecationMessage: "Consider using GPT-4o for better performance",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
        creditsPerInputToken: model_pricing_1.OPENAI_CHAT_PRICING["gpt-4-turbo"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.OPENAI_CHAT_PRICING["gpt-4-turbo"].creditsPerOutputToken,
        maxTokens: 4096,
        contextWindow: 128000,
    },
    // DALL-E 3
    "dall-e-3": {
        displayName: "DALL-E 3",
        description: "Generate stunning images from text",
        capability: "image-generation",
        tier: 1,
        capabilities: IMAGE_GEN_CAPABILITIES,
        creditsPerImage: model_pricing_1.OPENAI_IMAGE_PRICING["dall-e-3"].creditsPerImage,
    },
    // TTS
    "tts-1": {
        displayName: "TTS Standard",
        description: "Text-to-speech, optimized for speed",
        capability: "speech-synthesis",
        tier: 1,
        capabilities: TTS_CAPABILITIES,
        creditsPerChar: model_pricing_1.OPENAI_TTS_PRICING["tts-1"].creditsPerChar,
    },
    "tts-1-hd": {
        displayName: "TTS HD",
        description: "Text-to-speech, optimized for quality",
        capability: "speech-synthesis",
        tier: 2,
        badge: "HD",
        capabilities: TTS_CAPABILITIES,
        creditsPerChar: model_pricing_1.OPENAI_TTS_PRICING["tts-1-hd"].creditsPerChar,
    },
    // Whisper
    "whisper-1": {
        displayName: "Whisper",
        description: "Transcribe audio to text",
        capability: "speech-recognition",
        tier: 1,
        capabilities: STT_CAPABILITIES,
        creditsPerMinute: model_pricing_1.OPENAI_STT_PRICING["whisper-1"].creditsPerMinute,
    },
};
/**
 * Anthropic model metadata registry
 * Based on https://docs.anthropic.com/en/docs/about-claude/models
 * Pricing is imported from model-pricing.ts (single source of truth)
 */
const ANTHROPIC_MODEL_METADATA = {
    // Claude 4 Opus (claude-sonnet-4-20250514 is latest opus-class)
    "claude-sonnet-4-20250514": {
        displayName: "Claude Sonnet 4",
        description: "Most capable Claude model for complex analysis",
        capability: "text-generation",
        tier: 3,
        badge: "BEST",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "highest" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-sonnet-4-20250514"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-sonnet-4-20250514"].creditsPerOutputToken,
        maxTokens: 8192,
        contextWindow: 200000,
    },
    // Claude Opus 4.5
    "claude-opus-4-20250514": {
        displayName: "Claude Opus 4.5",
        description: "Most intelligent Claude model",
        capability: "text-generation",
        tier: 3,
        badge: "BEST",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "highest" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-opus-4-20250514"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-opus-4-20250514"].creditsPerOutputToken,
        maxTokens: 8192,
        contextWindow: 200000,
    },
    // Claude 3.5 Sonnet (Latest)
    "claude-3-5-sonnet-20241022": {
        displayName: "Claude 3.5 Sonnet",
        description: "Best balance of intelligence and speed",
        capability: "text-generation",
        tier: 2,
        capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "high", creativity: "high" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-sonnet-20241022"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-sonnet-20241022"].creditsPerOutputToken,
        maxTokens: 8192,
        contextWindow: 200000,
    },
    "claude-3-5-sonnet-latest": {
        displayName: "Claude 3.5 Sonnet (Latest)",
        description: "Best balance of intelligence and speed",
        capability: "text-generation",
        tier: 2,
        capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "high", creativity: "high" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-sonnet-20241022"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-sonnet-20241022"].creditsPerOutputToken,
        maxTokens: 8192,
        contextWindow: 200000,
    },
    // Claude 3.5 Haiku
    "claude-3-5-haiku-20241022": {
        displayName: "Claude 3.5 Haiku",
        description: "Fast and efficient for simple tasks",
        capability: "text-generation",
        tier: 1,
        badge: "FAST",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-haiku-20241022"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-haiku-20241022"].creditsPerOutputToken,
        maxTokens: 8192,
        contextWindow: 200000,
    },
    "claude-3-5-haiku-latest": {
        displayName: "Claude 3.5 Haiku (Latest)",
        description: "Fast and efficient for simple tasks",
        capability: "text-generation",
        tier: 1,
        badge: "FAST",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-haiku-20241022"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-haiku-20241022"].creditsPerOutputToken,
        maxTokens: 8192,
        contextWindow: 200000,
    },
    // Claude 3 Opus
    "claude-3-opus-20240229": {
        displayName: "Claude 3 Opus",
        description: "Previous gen most capable model",
        capability: "text-generation",
        tier: 3,
        deprecated: true,
        deprecationMessage: "Consider using Claude 3.5 Sonnet for better value",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "highest" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-opus-20240229"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-opus-20240229"].creditsPerOutputToken,
        maxTokens: 4096,
        contextWindow: 200000,
    },
    "claude-3-opus-latest": {
        displayName: "Claude 3 Opus (Latest)",
        description: "Previous gen most capable model",
        capability: "text-generation",
        tier: 3,
        capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "highest" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-opus-20240229"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-opus-20240229"].creditsPerOutputToken,
        maxTokens: 4096,
        contextWindow: 200000,
    },
    // Claude 3 Sonnet
    "claude-3-sonnet-20240229": {
        displayName: "Claude 3 Sonnet",
        description: "Balanced performance (previous gen)",
        capability: "text-generation",
        tier: 2,
        deprecated: true,
        deprecationMessage: "Upgrade to Claude 3.5 Sonnet",
        capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-sonnet-20241022"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-5-sonnet-20241022"].creditsPerOutputToken,
        maxTokens: 4096,
        contextWindow: 200000,
    },
    // Claude 3 Haiku
    "claude-3-haiku-20240307": {
        displayName: "Claude 3 Haiku",
        description: "Fast and affordable (previous gen)",
        capability: "text-generation",
        tier: 1,
        capabilities: { ...CHAT_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
        creditsPerInputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-haiku-20240307"].creditsPerInputToken,
        creditsPerOutputToken: model_pricing_1.ANTHROPIC_CHAT_PRICING["claude-3-haiku-20240307"].creditsPerOutputToken,
        maxTokens: 4096,
        contextWindow: 200000,
    },
};
// ===========================================
// OpenAI Model Discovery
// ===========================================
/**
 * Discover available models from OpenAI
 */
async function discoverOpenAIModels() {
    const apiKey = process.env.TWOBOT_OPENAI_API_KEY;
    if (!apiKey) {
        log.warn("OpenAI API key not set, skipping discovery");
        return [];
    }
    try {
        const client = new openai_1.default({ apiKey, timeout: 15000 });
        const response = await client.models.list();
        const discoveredModels = [];
        const seenModels = new Set();
        for (const model of response.data) {
            const modelId = model.id;
            // Skip if already seen (duplicates)
            if (seenModels.has(modelId))
                continue;
            seenModels.add(modelId);
            // Check if we have metadata for this model
            // Try exact match first, then prefix match
            let metadata = OPENAI_MODEL_METADATA[modelId];
            if (!metadata) {
                // Try prefix matching (e.g., "gpt-4o-2024-05-13" matches "gpt-4o")
                for (const [pattern, meta] of Object.entries(OPENAI_MODEL_METADATA)) {
                    if (modelId.startsWith(pattern) || modelId === pattern) {
                        metadata = meta;
                        break;
                    }
                }
            }
            // Skip models we don't have metadata for (embeddings, fine-tunes, etc.)
            if (!metadata) {
                log.debug({ modelId }, "Skipping model without metadata");
                continue;
            }
            // Skip deprecated models unless they're the only version
            if (metadata.deprecated) {
                log.debug({ modelId }, "Including deprecated model");
            }
            discoveredModels.push({
                id: modelId,
                name: metadata.displayName,
                provider: "openai",
                capability: metadata.capability,
                description: metadata.description,
                creditsPerInputToken: metadata.creditsPerInputToken,
                creditsPerOutputToken: metadata.creditsPerOutputToken,
                creditsPerImage: metadata.creditsPerImage,
                creditsPerChar: metadata.creditsPerChar,
                creditsPerMinute: metadata.creditsPerMinute,
                maxTokens: metadata.maxTokens,
                contextWindow: metadata.contextWindow,
                tier: metadata.tier,
                badge: metadata.badge,
                deprecated: metadata.deprecated,
                deprecationMessage: metadata.deprecationMessage,
                capabilities: metadata.capabilities,
            });
        }
        log.info({ count: discoveredModels.length, models: discoveredModels.map((m) => m.id) }, "Discovered OpenAI models");
        return discoveredModels;
    }
    catch (error) {
        log.error({ error }, "Failed to discover OpenAI models");
        return [];
    }
}
// ===========================================
// Anthropic Model Discovery
// ===========================================
/**
 * Discover available models from Anthropic
 *
 * Note: Anthropic doesn't have a models.list() API like OpenAI.
 * We validate the API key and return our known model list.
 * We test a cheap model to verify the key works.
 */
async function discoverAnthropicModels() {
    const apiKey = process.env.TWOBOT_ANTHROPIC_API_KEY;
    if (!apiKey) {
        log.warn("Anthropic API key not set, skipping discovery");
        return [];
    }
    try {
        const client = new sdk_1.default({ apiKey, timeout: 15000 });
        // Test the API key with a minimal request
        // Using claude-3-haiku as it's the cheapest
        await client.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
        });
        log.info("Anthropic API key validated");
        // Return all known Anthropic models
        const discoveredModels = [];
        for (const [modelId, metadata] of Object.entries(ANTHROPIC_MODEL_METADATA)) {
            // Skip "latest" aliases to avoid duplicates in UI
            if (modelId.endsWith("-latest")) {
                continue;
            }
            discoveredModels.push({
                id: modelId,
                name: metadata.displayName,
                provider: "anthropic",
                capability: metadata.capability,
                description: metadata.description,
                creditsPerInputToken: metadata.creditsPerInputToken,
                creditsPerOutputToken: metadata.creditsPerOutputToken,
                maxTokens: metadata.maxTokens,
                contextWindow: metadata.contextWindow,
                tier: metadata.tier,
                badge: metadata.badge,
                deprecated: metadata.deprecated,
                deprecationMessage: metadata.deprecationMessage,
                capabilities: metadata.capabilities,
            });
        }
        log.info({ count: discoveredModels.length, models: discoveredModels.map((m) => m.id) }, "Discovered Anthropic models");
        return discoveredModels;
    }
    catch (error) {
        log.error({ error }, "Failed to discover Anthropic models");
        return [];
    }
}
// ===========================================
// Combined Model Discovery
// ===========================================
// Cache for discovered models
let discoveredModelsCache = null;
let lastDiscoveryTime = null;
const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/**
 * Discover all available models from all providers
 */
async function discoverAllModels(forceRefresh = false) {
    // Return cached if valid
    if (!forceRefresh &&
        discoveredModelsCache &&
        lastDiscoveryTime &&
        Date.now() - lastDiscoveryTime.getTime() < DISCOVERY_CACHE_TTL_MS) {
        log.debug("Returning cached discovered models");
        return discoveredModelsCache;
    }
    log.info("Discovering models from all providers...");
    const [openaiModels, anthropicModels] = await Promise.all([
        discoverOpenAIModels(),
        discoverAnthropicModels(),
    ]);
    const allModels = [...openaiModels, ...anthropicModels];
    // Sort by provider, then by tier
    allModels.sort((a, b) => {
        if (a.provider !== b.provider) {
            return a.provider.localeCompare(b.provider);
        }
        return (a.tier || 99) - (b.tier || 99);
    });
    // Set default model (cheapest chat model)
    const chatModels = allModels.filter((m) => m.capability === "text-generation" && !m.deprecated);
    if (chatModels.length > 0) {
        chatModels.sort((a, b) => (a.tier || 99) - (b.tier || 99));
        const defaultModelId = chatModels[0]?.id;
        if (defaultModelId) {
            const idx = allModels.findIndex((m) => m.id === defaultModelId);
            if (idx >= 0 && allModels[idx]) {
                const model = allModels[idx];
                allModels[idx] = {
                    id: model.id,
                    name: model.name,
                    provider: model.provider,
                    capability: model.capability,
                    description: model.description,
                    creditsPerInputToken: model.creditsPerInputToken,
                    creditsPerOutputToken: model.creditsPerOutputToken,
                    creditsPerImage: model.creditsPerImage,
                    creditsPerChar: model.creditsPerChar,
                    creditsPerMinute: model.creditsPerMinute,
                    maxTokens: model.maxTokens,
                    contextWindow: model.contextWindow,
                    tier: model.tier,
                    badge: model.badge,
                    deprecated: model.deprecated,
                    deprecationMessage: model.deprecationMessage,
                    capabilities: model.capabilities,
                    isDefault: true,
                };
            }
        }
    }
    // Cache results
    discoveredModelsCache = allModels;
    lastDiscoveryTime = new Date();
    log.info({
        total: allModels.length,
        openai: openaiModels.length,
        anthropic: anthropicModels.length,
    }, "Model discovery complete");
    return allModels;
}
/**
 * Get discovered models (from cache or discover)
 */
function getDiscoveredModels() {
    if (discoveredModelsCache) {
        return discoveredModelsCache;
    }
    // Return empty if not yet discovered - caller should await discoverAllModels
    return [];
}
/**
 * Clear the discovery cache
 */
function clearDiscoveryCache() {
    discoveredModelsCache = null;
    lastDiscoveryTime = null;
    log.info("Discovery cache cleared");
}
/**
 * Check if models have been discovered
 */
function hasDiscoveredModels() {
    return discoveredModelsCache !== null && discoveredModelsCache.length > 0;
}
//# sourceMappingURL=model-discovery.service.js.map