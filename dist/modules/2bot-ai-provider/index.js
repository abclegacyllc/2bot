"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.multimodalChatStream = exports.multimodalChatService = exports.multimodalChat = exports.getOrCreateConversation = exports.detectCapabilities = exports.twoBotAIMetricsService = exports.twoBotAIUsageService = exports.getCurrentBillingPeriod = exports.getBillingPeriod = exports.TwoBotAIError = exports.withRetry = exports.getRetryAfterMs = exports.createRetryable = exports.validateModelAvailable = exports.getSmartRoutingDecision = exports.getRecommendedModel = exports.estimateSavings = exports.classifyQueryComplexity = exports.isProviderHealthy = exports.initializeProviderHealth = exports.getCachedHealthStatus = exports.clearHealthCache = exports.checkAllProviders = exports.getProvidersStatus = exports.getAvailableFeatures = exports.getModelPricingByCapability = exports.calculateCreditsForUsageByCapability = exports.OPENAI_TTS_PRICING = exports.OPENAI_STT_PRICING = exports.OPENAI_IMAGE_PRICING = exports.OPENAI_EMBEDDING_PRICING = exports.OPENAI_CHAT_PRICING = exports.FALLBACK_PRICING_BY_CAPABILITY = exports.ANTHROPIC_CHAT_PRICING = exports.hasDiscoveredModels = exports.getDiscoveredModels = exports.discoverOpenAIModels = exports.discoverAnthropicModels = exports.discoverAllModels = exports.clearDiscoveryCache = exports.providerSupportsCapability = exports.isValidCapability = exports.getCommonCapabilities = exports.getCapabilityInfo = exports.getCapabilitiesByCategory = exports.PROVIDER_CAPABILITIES = exports.CAPABILITY_INFO = exports.twoBotAIProvider = void 0;
// Main provider
var _2bot_ai_provider_1 = require("./2bot-ai.provider");
Object.defineProperty(exports, "twoBotAIProvider", { enumerable: true, get: function () { return _2bot_ai_provider_1.twoBotAIProvider; } });
// AI Capabilities (Universal naming - single source of truth)
var ai_capabilities_1 = require("./ai-capabilities");
Object.defineProperty(exports, "CAPABILITY_INFO", { enumerable: true, get: function () { return ai_capabilities_1.CAPABILITY_INFO; } });
Object.defineProperty(exports, "PROVIDER_CAPABILITIES", { enumerable: true, get: function () { return ai_capabilities_1.PROVIDER_CAPABILITIES; } });
Object.defineProperty(exports, "getCapabilitiesByCategory", { enumerable: true, get: function () { return ai_capabilities_1.getCapabilitiesByCategory; } });
Object.defineProperty(exports, "getCapabilityInfo", { enumerable: true, get: function () { return ai_capabilities_1.getCapabilityInfo; } });
Object.defineProperty(exports, "getCommonCapabilities", { enumerable: true, get: function () { return ai_capabilities_1.getCommonCapabilities; } });
Object.defineProperty(exports, "isValidCapability", { enumerable: true, get: function () { return ai_capabilities_1.isValidCapability; } });
Object.defineProperty(exports, "providerSupportsCapability", { enumerable: true, get: function () { return ai_capabilities_1.providerSupportsCapability; } });
// Model discovery
var model_discovery_service_1 = require("./model-discovery.service");
Object.defineProperty(exports, "clearDiscoveryCache", { enumerable: true, get: function () { return model_discovery_service_1.clearDiscoveryCache; } });
Object.defineProperty(exports, "discoverAllModels", { enumerable: true, get: function () { return model_discovery_service_1.discoverAllModels; } });
Object.defineProperty(exports, "discoverAnthropicModels", { enumerable: true, get: function () { return model_discovery_service_1.discoverAnthropicModels; } });
Object.defineProperty(exports, "discoverOpenAIModels", { enumerable: true, get: function () { return model_discovery_service_1.discoverOpenAIModels; } });
Object.defineProperty(exports, "getDiscoveredModels", { enumerable: true, get: function () { return model_discovery_service_1.getDiscoveredModels; } });
Object.defineProperty(exports, "hasDiscoveredModels", { enumerable: true, get: function () { return model_discovery_service_1.hasDiscoveredModels; } });
// Model pricing (single source of truth)
var model_pricing_1 = require("./model-pricing");
Object.defineProperty(exports, "ANTHROPIC_CHAT_PRICING", { enumerable: true, get: function () { return model_pricing_1.ANTHROPIC_CHAT_PRICING; } });
Object.defineProperty(exports, "FALLBACK_PRICING_BY_CAPABILITY", { enumerable: true, get: function () { return model_pricing_1.FALLBACK_PRICING_BY_CAPABILITY; } });
Object.defineProperty(exports, "OPENAI_CHAT_PRICING", { enumerable: true, get: function () { return model_pricing_1.OPENAI_CHAT_PRICING; } });
Object.defineProperty(exports, "OPENAI_EMBEDDING_PRICING", { enumerable: true, get: function () { return model_pricing_1.OPENAI_EMBEDDING_PRICING; } });
Object.defineProperty(exports, "OPENAI_IMAGE_PRICING", { enumerable: true, get: function () { return model_pricing_1.OPENAI_IMAGE_PRICING; } });
Object.defineProperty(exports, "OPENAI_STT_PRICING", { enumerable: true, get: function () { return model_pricing_1.OPENAI_STT_PRICING; } });
Object.defineProperty(exports, "OPENAI_TTS_PRICING", { enumerable: true, get: function () { return model_pricing_1.OPENAI_TTS_PRICING; } });
Object.defineProperty(exports, "calculateCreditsForUsageByCapability", { enumerable: true, get: function () { return model_pricing_1.calculateCreditsForUsageByCapability; } });
Object.defineProperty(exports, "getModelPricingByCapability", { enumerable: true, get: function () { return model_pricing_1.getModelPricingByCapability; } });
// Provider configuration
var provider_config_1 = require("./provider-config");
Object.defineProperty(exports, "getAvailableFeatures", { enumerable: true, get: function () { return provider_config_1.getAvailableFeatures; } });
Object.defineProperty(exports, "getProvidersStatus", { enumerable: true, get: function () { return provider_config_1.getProvidersStatus; } });
// Provider health checks
var provider_health_service_1 = require("./provider-health.service");
Object.defineProperty(exports, "checkAllProviders", { enumerable: true, get: function () { return provider_health_service_1.checkAllProviders; } });
Object.defineProperty(exports, "clearHealthCache", { enumerable: true, get: function () { return provider_health_service_1.clearHealthCache; } });
Object.defineProperty(exports, "getCachedHealthStatus", { enumerable: true, get: function () { return provider_health_service_1.getCachedHealthStatus; } });
Object.defineProperty(exports, "initializeProviderHealth", { enumerable: true, get: function () { return provider_health_service_1.initializeProviderHealth; } });
Object.defineProperty(exports, "isProviderHealthy", { enumerable: true, get: function () { return provider_health_service_1.isProviderHealthy; } });
// Smart Model Router
var model_router_1 = require("./model-router");
Object.defineProperty(exports, "classifyQueryComplexity", { enumerable: true, get: function () { return model_router_1.classifyQueryComplexity; } });
Object.defineProperty(exports, "estimateSavings", { enumerable: true, get: function () { return model_router_1.estimateSavings; } });
Object.defineProperty(exports, "getRecommendedModel", { enumerable: true, get: function () { return model_router_1.getRecommendedModel; } });
Object.defineProperty(exports, "getSmartRoutingDecision", { enumerable: true, get: function () { return model_router_1.getSmartRoutingDecision; } });
Object.defineProperty(exports, "validateModelAvailable", { enumerable: true, get: function () { return model_router_1.validateModelAvailable; } });
// Retry Utility
var retry_util_1 = require("./retry.util");
Object.defineProperty(exports, "createRetryable", { enumerable: true, get: function () { return retry_util_1.createRetryable; } });
Object.defineProperty(exports, "getRetryAfterMs", { enumerable: true, get: function () { return retry_util_1.getRetryAfterMs; } });
Object.defineProperty(exports, "withRetry", { enumerable: true, get: function () { return retry_util_1.withRetry; } });
var types_1 = require("./types");
Object.defineProperty(exports, "TwoBotAIError", { enumerable: true, get: function () { return types_1.TwoBotAIError; } });
// ===========================================
// 2Bot AI Usage Tracking (Metrics + Credits)
// ===========================================
// 2Bot AI Usage Service - Records usage with credits
var _2bot_ai_usage_service_1 = require("./2bot-ai-usage.service");
Object.defineProperty(exports, "getBillingPeriod", { enumerable: true, get: function () { return _2bot_ai_usage_service_1.getBillingPeriod; } });
Object.defineProperty(exports, "getCurrentBillingPeriod", { enumerable: true, get: function () { return _2bot_ai_usage_service_1.getCurrentBillingPeriod; } });
Object.defineProperty(exports, "twoBotAIUsageService", { enumerable: true, get: function () { return _2bot_ai_usage_service_1.twoBotAIUsageService; } });
// 2Bot AI Metrics Service - Plan limits + analytics
var _2bot_ai_metrics_service_1 = require("./2bot-ai-metrics.service");
Object.defineProperty(exports, "twoBotAIMetricsService", { enumerable: true, get: function () { return _2bot_ai_metrics_service_1.twoBotAIMetricsService; } });
// ===========================================
// Multimodal Multi-Modal Chat (ChatGPT/Gemini-like)
// ===========================================
// Multimodal Chat Service - Single interface for ALL AI capabilities
var multimodal_chat_service_1 = require("./multimodal-chat.service");
Object.defineProperty(exports, "detectCapabilities", { enumerable: true, get: function () { return multimodal_chat_service_1.detectCapabilities; } });
Object.defineProperty(exports, "getOrCreateConversation", { enumerable: true, get: function () { return multimodal_chat_service_1.getOrCreateConversation; } });
Object.defineProperty(exports, "multimodalChat", { enumerable: true, get: function () { return multimodal_chat_service_1.multimodalChat; } });
Object.defineProperty(exports, "multimodalChatService", { enumerable: true, get: function () { return multimodal_chat_service_1.multimodalChatService; } });
Object.defineProperty(exports, "multimodalChatStream", { enumerable: true, get: function () { return multimodal_chat_service_1.multimodalChatStream; } });
//# sourceMappingURL=index.js.map