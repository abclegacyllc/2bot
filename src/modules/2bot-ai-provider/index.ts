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
    CAPABILITY_INFO,
    PROVIDER_CAPABILITIES,
    getCapabilitiesByCategory,
    getCapabilityInfo,
    getCommonCapabilities,
    isValidCapability,
    providerSupportsCapability,
    type AICapability,
    type AICapabilityCategory,
    type CapabilityInfo,
    type ProviderName
} from "./ai-capabilities";

// Model discovery
export {
    clearDiscoveryCache,
    discoverAllModels,
    discoverAnthropicModels,
    discoverOpenAIModels,
    getDiscoveredModels,
    hasDiscoveredModels
} from "./model-discovery.service";

// Model pricing (single source of truth)
export {
    ANTHROPIC_TEXT_GENERATION_PRICING,
    FALLBACK_PRICING_BY_CAPABILITY, OPENAI_IMAGE_GENERATION_PRICING,
    OPENAI_SPEECH_RECOGNITION_PRICING,
    OPENAI_SPEECH_SYNTHESIS_PRICING, OPENAI_TEXT_EMBEDDING_PRICING, OPENAI_TEXT_GENERATION_PRICING, calculateCreditsForUsageByCapability,
    getModelPricingByCapability, type ImageGenerationModelPricing,
    type ModelPricing,
    type SpeechRecognitionModelPricing,
    type SpeechSynthesisModelPricing, type TextEmbeddingModelPricing, type TextGenerationModelPricing
} from "./model-pricing";

// Provider configuration
export {
    getAvailableFeatures,
    getProvidersStatus
} from "./provider-config";

// Provider health checks
export {
    checkAllProviders,
    clearHealthCache,
    getCachedHealthStatus,
    initializeProviderHealth,
    isProviderHealthy
} from "./provider-health.service";

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

// 2Bot AI Metrics Service - Plan limits + analytics
export {
    twoBotAIMetricsService,
    type TwoBotCreditBreakdown,
    type TwoBotPlanLimitCheckResult,
    type TwoBotTokenBreakdown,
    type TwoBotTokenUsageResult
} from "./2bot-ai-metrics.service";

// ===========================================
// Multimodal Multi-Modal Chat (ChatGPT/Gemini-like)
// ===========================================

// Multimodal Chat Service - Single interface for ALL AI capabilities
export {
    detectCapabilities,
    getOrCreateConversation,
    multimodalChat,
    multimodalChatService,
    multimodalChatStream
} from "./multimodal-chat.service";

// Multimodal Chat Types
export type {
    AudioContentBlock,
    CodeContentBlock,
    ContentBlock,
    ContentBlockType,
    DetectedIntent,
    ErrorContentBlock,
    FileContentBlock,
    ImageContentBlock, MultimodalChatInput,
    MultimodalChatRequest,
    MultimodalChatResponse,
    MultimodalChatStreamChunk,
    MultimodalConversation,
    MultimodalMessage, TextContentBlock,
    ToolResultContentBlock,
    ToolUseContentBlock, VideoContentBlock
} from "./multimodal-chat.types";

