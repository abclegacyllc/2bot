/**
 * 2Bot AI Provider Module
 *
 * 2Bot's own AI service using platform API keys.
 * Users pay with credits, not their own API keys.
 *
 * Features:
 * - Multi-modal: Chat, Image, TTS, STT
 * - Multi-provider: OpenAI, Anthropic
 * - Automatic credit deduction
 * - Streaming support
 * - Real API key validation (health checks)
 * - Dynamic model discovery from providers
 *
 * Also includes 2Bot AI usage tracking (metrics + credits).
 * This is separate from BYOK tracking in the gateway module.
 *
 * @module modules/2bot-ai-provider
 */

// Main provider
export { twoBotAIProvider } from "./2bot-ai.provider";

// AI Capabilities (Universal naming - single source of truth)
export {
    CAPABILITY_INFO, PROVIDER_CAPABILITIES, getCapabilitiesByCategory,
    getCapabilityInfo,
    getCommonCapabilities,
    isValidCapability, type AICapability,
    type AICapabilityCategory,
    type CapabilityInfo,
    type ProviderName
} from "./ai-capabilities";

// Model discovery
export {
    clearDiscoveryCache,
    discoverAllModels,
    discoverModelsForProvider,
    getDiscoveredModels,
    hasDiscoveredModels
} from "./model-discovery.service";

// Model registry (single source of truth for all model metadata)
export {
    CHAT_CAPS, EMBEDDING_CAPS, IMAGE_GEN_CAPS, MARGIN,
    MODEL_REGISTRY, SPEECH_REC_CAPS,
    SPEECH_SYNTH_CAPS,
    VISION_CAPS, creditPerChar,
    creditPerImage,
    creditPerInputToken,
    creditPerMinute,
    creditPerOutputToken, getProviderModelIds,
    getRegistryEntriesByCapability,
    getRegistryEntriesByProvider,
    getRegistryEntry, isRegisteredModel, registryToModelInfo, type ModelRegistryEntry,
    type ProviderCost
} from "./model-registry";

// Model pricing (single source of truth)
export {
    ANTHROPIC_TEXT_GENERATION_PRICING, FALLBACK_PRICING_BY_CAPABILITY, OPENAI_IMAGE_GENERATION_PRICING,
    OPENAI_SPEECH_RECOGNITION_PRICING,
    OPENAI_SPEECH_SYNTHESIS_PRICING, OPENAI_TEXT_EMBEDDING_PRICING, OPENAI_TEXT_GENERATION_PRICING, calculateCreditsForUsageByCapability, getModelPricingByCapability, type ImageGenerationModelPricing,
    type ModelPricing,
    type SpeechRecognitionModelPricing,
    type SpeechSynthesisModelPricing, type TextEmbeddingModelPricing, type TextGenerationModelPricing
} from "./model-pricing";

// Provider configuration
export {
    getAvailableFeatures,
    getProvidersStatus,
    invalidateModelCache
} from "./provider-config";

// Provider health checks
export {
    checkAllProviders,
    clearHealthCache,
    getCachedHealthStatus,
    initializeProviderHealth,
    isProviderHealthy,
    isProviderHealthyCached
} from "./provider-health.service";

// Model Health Tracker
export {
    clearModelHealthRecords,
    getModelHealthSummary,
    isModelHealthy,
    recordModelFailure,
    recordModelSuccess
} from "./model-health-tracker";

// Smart Model Router
export {
    classifyQueryComplexity,
    estimateSavings,
    getRecommendedModel,
    getSmartRoutingDecision,
    validateModelAvailable,
    type QueryComplexity,
    type SmartRoutingResult
} from "./model-router";

// Retry Utility
export {
    createRetryable,
    getRetryAfterMs,
    withRetry,
    type RetryOptions
} from "./retry.util";

// Types
export type {
    ImageGenerationRequest,
    ImageGenerationResponse, ImageQuality, ImageSize,
    ImageStyle,
    ModelInfo,
    SpeechRecognitionRequest,
    SpeechRecognitionResponse,
    SpeechSynthesisFormat,
    SpeechSynthesisRequest,
    SpeechSynthesisResponse,
    SpeechSynthesisVoice,
    TextGenerationMessage,
    TextGenerationRequest,
    TextGenerationResponse,
    TextGenerationStreamChunk,
    TwoBotAIErrorCode,
    TwoBotAIModel,
    TwoBotAIProvider
} from "./types";

export {
    TwoBotAIError
} from "./types";

// ===========================================
// 2Bot AI Usage Tracking (Metrics + Credits)
// ===========================================

// 2Bot AI Usage Service - Records usage with credits
export {
    getBillingPeriod,
    getCurrentBillingPeriod, twoBotAIUsageService, type RecordTwoBotUsageData, type TwoBotAIUsageData, type TwoBotAIUsageStats, type TwoBotImageGenerationUsageData,
    type TwoBotSpeechRecognitionUsageData,
    type TwoBotSpeechSynthesisUsageData, type TwoBotTextGenerationUsageData
} from "./2bot-ai-usage.service";

// ===========================================
// 2Bot AI Model Catalog (Abstraction Layer)
// ===========================================

// Model Catalog - 2Bot AI branded models
export {
    ModelResolutionError, TWOBOT_AI_MODELS, TWOBOT_AI_MODEL_MAPPINGS,
    // Constants
    TWOBOT_AI_MODEL_TIERS,
    // Model Resolver
    TwoBotAIModelResolver, VALID_TWOBOT_AI_MODEL_IDS, canResolveTwoBotAIModel,
    // Model getters
    getAvailableTwoBotAIModels, getDefaultStrategy, getEnabledProviderOptions,
    getPrimaryProviderOption, getResolvableTwoBotAIModels, getTwoBotAIModel,
    // Mapping getters
    getTwoBotAIModelMapping, getTwoBotAIModelsByCapability,
    getTwoBotAIModelsByTier, hasMultipleProviders,
    // Type guards
    isTwoBotAIModelId, resetRoundRobinState, resolveTwoBotAIModel,
    resolveTwoBotAIModelWithOptions, twoBotAIModelExists, twoBotAIModelResolver, type ModelResolutionErrorReason, type ModelResolutionRequest,
    type ModelResolutionResult, type ModelSelectionConfig, type ModelSelectionStrategy, type ProviderModelOption, type TwoBotAIModelCatalog, type TwoBotAIModel as TwoBotAIModelDefinition, type TwoBotAIModelFeatures,
    // Types
    type TwoBotAIModelId, type TwoBotAIModelInfo, type TwoBotAIModelMapping, type TwoBotAIModelTier,
    type TwoBotAIModelTierInfo
} from "./model-catalog";

