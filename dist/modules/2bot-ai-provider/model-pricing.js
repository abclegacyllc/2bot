"use strict";
/**
 * Model Pricing - Single Source of Truth
 *
 * Centralized credit rates for all AI models.
 * This file is the ONLY place where pricing is defined.
 * Both model-discovery.service.ts and 2bot-ai-credit.service.ts
 * import from here to ensure consistency.
 *
 * Credits are internal units: 1 credit ≈ $0.001 USD ($1 = 1,000 credits)
 *
 * @module modules/2bot-ai-provider/model-pricing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_PRICING_BY_CAPABILITY = exports.ANTHROPIC_CHAT_PRICING = exports.OPENAI_EMBEDDING_PRICING = exports.OPENAI_STT_PRICING = exports.OPENAI_TTS_PRICING = exports.OPENAI_IMAGE_PRICING = exports.OPENAI_CHAT_PRICING = void 0;
exports.getChatPricing = getChatPricing;
exports.getImagePricing = getImagePricing;
exports.getTTSPricing = getTTSPricing;
exports.getSTTPricing = getSTTPricing;
exports.getEmbeddingPricing = getEmbeddingPricing;
exports.getModelPricingByCapability = getModelPricingByCapability;
exports.calculateCreditsForUsageByCapability = calculateCreditsForUsageByCapability;
// ===========================================
// OpenAI Model Pricing
// ===========================================
exports.OPENAI_CHAT_PRICING = {
    // GPT-4o Mini - Fast & cheap
    "gpt-4o-mini": {
        creditsPerInputToken: 0.0000015,
        creditsPerOutputToken: 0.000006,
    },
    // GPT-4o - Most capable
    "gpt-4o": {
        creditsPerInputToken: 0.000025,
        creditsPerOutputToken: 0.0001,
    },
    // GPT-4 Turbo - Previous gen
    "gpt-4-turbo": {
        creditsPerInputToken: 0.0001,
        creditsPerOutputToken: 0.0003,
    },
    // o1 - Advanced reasoning
    "o1": {
        creditsPerInputToken: 0.00015,
        creditsPerOutputToken: 0.0006,
    },
    // o1-mini - Fast reasoning
    "o1-mini": {
        creditsPerInputToken: 0.00003,
        creditsPerOutputToken: 0.00012,
    },
    // o3-mini - Latest reasoning
    "o3-mini": {
        creditsPerInputToken: 0.000011,
        creditsPerOutputToken: 0.000044,
    },
};
exports.OPENAI_IMAGE_PRICING = {
    "dall-e-3": {
        creditsPerImage: 40, // Standard quality
    },
    "dall-e-3-hd": {
        creditsPerImage: 80, // HD quality
    },
    "dall-e-2": {
        creditsPerImage: 20,
    },
};
exports.OPENAI_TTS_PRICING = {
    "tts-1": {
        creditsPerChar: 0.015,
    },
    "tts-1-hd": {
        creditsPerChar: 0.03,
    },
};
exports.OPENAI_STT_PRICING = {
    "whisper-1": {
        creditsPerMinute: 6,
    },
};
exports.OPENAI_EMBEDDING_PRICING = {
    "text-embedding-3-small": {
        creditsPerInputToken: 0.0000002,
    },
    "text-embedding-3-large": {
        creditsPerInputToken: 0.0000013,
    },
};
// ===========================================
// Anthropic Model Pricing
// ===========================================
exports.ANTHROPIC_CHAT_PRICING = {
    // Claude 4 / Sonnet 4
    "claude-sonnet-4-20250514": {
        creditsPerInputToken: 0.00003,
        creditsPerOutputToken: 0.00015,
    },
    // Claude Opus 4.5
    "claude-opus-4-20250514": {
        creditsPerInputToken: 0.00015,
        creditsPerOutputToken: 0.00075,
    },
    // Claude 3.5 Sonnet
    "claude-3-5-sonnet-20241022": {
        creditsPerInputToken: 0.00003,
        creditsPerOutputToken: 0.00015,
    },
    // Claude 3.5 Haiku
    "claude-3-5-haiku-20241022": {
        creditsPerInputToken: 0.000008,
        creditsPerOutputToken: 0.00004,
    },
    // Claude 3 Opus (legacy)
    "claude-3-opus-20240229": {
        creditsPerInputToken: 0.00015,
        creditsPerOutputToken: 0.00075,
    },
    // Claude 3 Haiku (legacy)
    "claude-3-haiku-20240307": {
        creditsPerInputToken: 0.0000025,
        creditsPerOutputToken: 0.0000125,
    },
};
// ===========================================
// Combined Lookup Functions
// ===========================================
/**
 * Get chat model pricing by model ID
 */
function getChatPricing(modelId) {
    return exports.OPENAI_CHAT_PRICING[modelId] || exports.ANTHROPIC_CHAT_PRICING[modelId];
}
/**
 * Get image model pricing by model ID
 */
function getImagePricing(modelId) {
    return exports.OPENAI_IMAGE_PRICING[modelId];
}
/**
 * Get TTS model pricing by model ID
 */
function getTTSPricing(modelId) {
    return exports.OPENAI_TTS_PRICING[modelId];
}
/**
 * Get STT model pricing by model ID
 */
function getSTTPricing(modelId) {
    return exports.OPENAI_STT_PRICING[modelId];
}
/**
 * Get embedding model pricing by model ID
 */
function getEmbeddingPricing(modelId) {
    return exports.OPENAI_EMBEDDING_PRICING[modelId];
}
// ===========================================
// Fallback Pricing (for unknown models)
// ===========================================
/**
 * Fallback pricing by capability (new system)
 */
exports.FALLBACK_PRICING_BY_CAPABILITY = {
    "text-generation": {
        creditsPerInputToken: 0.00002,
        creditsPerOutputToken: 0.00006,
    },
    "image-understanding": {
        creditsPerInputToken: 0.00002,
        creditsPerOutputToken: 0.00006,
    },
    "image-generation": {
        creditsPerImage: 50,
    },
    "speech-synthesis": {
        creditsPerChar: 0.015,
    },
    "speech-recognition": {
        creditsPerMinute: 6,
    },
    "text-embedding": {
        creditsPerInputToken: 0.000001,
    },
    // Future capabilities - use text-generation as default
    "video-generation": { creditsPerInputToken: 0.0001, creditsPerOutputToken: 0.0003 },
    "video-understanding": { creditsPerInputToken: 0.00005, creditsPerOutputToken: 0.00015 },
    "code-generation": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 },
    "code-execution": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 },
    "tool-use": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 },
    "web-browsing": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 },
    "file-processing": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 },
};
/**
 * Get pricing for a model by capability
 * Falls back to default pricing if model not found
 */
function getModelPricingByCapability(capability, modelId) {
    switch (capability) {
        case "text-generation":
        case "image-understanding":
        case "code-generation":
            return getChatPricing(modelId) || exports.FALLBACK_PRICING_BY_CAPABILITY[capability];
        case "image-generation":
            return getImagePricing(modelId) || exports.FALLBACK_PRICING_BY_CAPABILITY["image-generation"];
        case "speech-synthesis":
            return getTTSPricing(modelId) || exports.FALLBACK_PRICING_BY_CAPABILITY["speech-synthesis"];
        case "speech-recognition":
            return getSTTPricing(modelId) || exports.FALLBACK_PRICING_BY_CAPABILITY["speech-recognition"];
        case "text-embedding":
            return getEmbeddingPricing(modelId) || exports.FALLBACK_PRICING_BY_CAPABILITY["text-embedding"];
        default:
            return exports.FALLBACK_PRICING_BY_CAPABILITY["text-generation"];
    }
}
/**
 * Calculate credits for usage by capability
 */
function calculateCreditsForUsageByCapability(capability, modelId, usage) {
    const pricing = getModelPricingByCapability(capability, modelId);
    let credits = 0;
    if (capability === "text-generation" || capability === "image-understanding" ||
        capability === "text-embedding" || capability === "code-generation") {
        const chatPricing = pricing;
        const inputCredits = (usage.inputTokens || 0) * chatPricing.creditsPerInputToken;
        const outputCredits = (usage.outputTokens || 0) * (chatPricing.creditsPerOutputToken || 0);
        credits = inputCredits + outputCredits;
    }
    else if (capability === "image-generation") {
        const imagePricing = pricing;
        credits = (usage.imageCount || 1) * imagePricing.creditsPerImage;
    }
    else if (capability === "speech-synthesis") {
        const ttsPricing = pricing;
        credits = (usage.characterCount || 0) * ttsPricing.creditsPerChar;
    }
    else if (capability === "speech-recognition") {
        const sttPricing = pricing;
        const minutes = (usage.audioSeconds || 0) / 60;
        credits = minutes * sttPricing.creditsPerMinute;
    }
    return credits; // Return precise float for accumulation
}
//# sourceMappingURL=model-pricing.js.map