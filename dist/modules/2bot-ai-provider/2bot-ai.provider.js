"use strict";
/**
 * 2Bot AI Provider Service
 *
 * Main orchestrator for 2Bot's AI service.
 * Routes requests to appropriate providers (OpenAI, Anthropic).
 * Handles token checks and deductions.
 *
 * Features:
 * - Dynamic provider detection (only shows models from configured APIs)
 * - Semantic caching (saves 60-90% on repeated queries)
 * - Smart model routing (uses cheaper models for simple queries)
 * - Token management with plan limits
 * - Separate personal/org credit handling (NO fallback)
 *
 * This is 2Bot's own AI service (not BYOK).
 *
 * @module modules/2bot-ai-provider/2bot-ai.provider
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.twoBotAIProvider = void 0;
const logger_1 = require("@/lib/logger");
const credits_1 = require("@/modules/credits");
const adapters_1 = require("./adapters");
const ai_cache_service_1 = require("./ai-cache.service");
const model_router_1 = require("./model-router");
const provider_config_1 = require("./provider-config");
const types_1 = require("./types");
// ===========================================
// Provider Service
// ===========================================
exports.twoBotAIProvider = {
    /**
     * Get available models (only from configured providers!)
     * @param capability - Filter by capability (text-generation, image-generation, speech-synthesis, speech-recognition, text-embedding, image-understanding)
     */
    getModels(capability) {
        return (0, provider_config_1.getAvailableModels)(capability);
    },
    /**
     * Get model info by ID (only if available)
     */
    getModel(modelId) {
        return (0, provider_config_1.getModelIfAvailable)(modelId);
    },
    /**
     * Get provider for a model
     */
    getProvider(modelId) {
        const model = (0, provider_config_1.getModelIfAvailable)(modelId);
        if (!model) {
            throw new types_1.TwoBotAIError(`Model "${modelId}" is not available. Check API configuration.`, "MODEL_UNAVAILABLE", 400);
        }
        return model.provider;
    },
    /**
     * Check if a provider is configured
     */
    isProviderReady(provider) {
        return (0, provider_config_1.isProviderConfigured)(provider);
    },
    /**
     * Get status of all providers
     */
    getProvidersStatus() {
        return (0, provider_config_1.getProvidersStatus)();
    },
    /**
     * Get configured providers list
     */
    getConfiguredProviders() {
        return (0, provider_config_1.getConfiguredProviders)();
    },
    /**
     * Chat completion (non-streaming)
     */
    async chat(request) {
        const log = logger_1.logger.child({ module: "2bot-ai-provider", capability: "text-generation" });
        // ✅ Validate model is available (throws if not)
        (0, model_router_1.validateModelAvailable)(request.model);
        // 🧠 Smart Model Routing - use cheaper model for simple queries
        // Only apply if smartRouting is enabled (default: true for backward compatibility)
        const smartRoutingEnabled = request.smartRouting !== false;
        const originalModel = request.model;
        let routingResult = null;
        if (smartRoutingEnabled) {
            routingResult = (0, model_router_1.getSmartRoutingDecision)(request.model, request.messages, true);
            if (routingResult.wasRouted) {
                log.info({
                    originalModel: routingResult.originalModel,
                    routedModel: routingResult.model,
                    complexity: routingResult.complexity,
                    reason: routingResult.reason,
                    estimatedSavings: routingResult.estimatedSavingsPercent
                        ? `~${routingResult.estimatedSavingsPercent}%`
                        : undefined,
                }, "🧠 Smart routing: using cheaper model");
                request = { ...request, model: routingResult.model };
            }
            else {
                log.debug({
                    model: routingResult.model,
                    complexity: routingResult.complexity,
                    reason: routingResult.reason,
                }, "Smart routing: no change needed");
            }
        }
        else {
            log.debug({ model: originalModel }, "Smart routing disabled, using selected model");
        }
        const provider = this.getProvider(request.model);
        // 💾 Check cache first - $0.00 if hit!
        const cachedResponse = await ai_cache_service_1.aiCacheService.get(request.model, request.messages);
        if (cachedResponse) {
            log.info({ model: request.model }, "Cache hit! Returning cached response (FREE)");
            // Get balance based on context (org or personal)
            const balance = request.organizationId
                ? await credits_1.twoBotAICreditService.getOrgBalance(request.organizationId)
                : await credits_1.twoBotAICreditService.getPersonalBalance(request.userId);
            return {
                id: `cached_${Date.now()}`,
                model: request.model,
                content: cachedResponse,
                finishReason: "stop",
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                creditsUsed: 0, // FREE!
                newBalance: balance?.balance ?? 0,
                cached: true,
            };
        }
        // Calculate estimated credits
        const estimatedTokens = estimateTokens(request.messages);
        const estimatedCost = await credits_1.twoBotAICreditService.calculateCreditsByCapability("text-generation", request.model, {
            inputTokens: estimatedTokens,
            outputTokens: estimatedTokens, // Conservative estimate
        });
        // Check credits based on context (org OR personal, NO fallback)
        if (request.organizationId) {
            // Organization context - use org wallet ONLY
            const creditCheck = await credits_1.twoBotAICreditService.checkOrgCredits(request.organizationId, estimatedCost);
            if (!creditCheck) {
                throw new types_1.TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
            }
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402, { limit: creditCheck.planLimit, used: creditCheck.monthlyUsed });
                }
                throw new types_1.TwoBotAIError(`Insufficient organization credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402, { required: estimatedCost, available: creditCheck.balance });
            }
        }
        else {
            // Personal context - use personal wallet ONLY
            const creditCheck = await credits_1.twoBotAICreditService.checkPersonalCredits(request.userId, estimatedCost);
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402, { limit: creditCheck.planLimit, used: creditCheck.monthlyUsed });
                }
                throw new types_1.TwoBotAIError(`Insufficient credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402, { required: estimatedCost, available: creditCheck.balance });
            }
        }
        // Make the request
        let response;
        if (provider === "openai") {
            response = await (0, adapters_1.openaiTextGeneration)(request);
        }
        else {
            response = await (0, adapters_1.anthropicTextGeneration)(request);
        }
        // 💾 Cache the response for future requests (if enabled)
        // Respect privacy setting: AI_CACHE_ENABLED=false disables this
        if (process.env.AI_CACHE_ENABLED !== "false") {
            await ai_cache_service_1.aiCacheService.set(request.model, request.messages, response.content);
        }
        // Deduct credits based on context (org OR personal, NO fallback)
        const usageData = {
            userId: request.userId,
            gatewayId: undefined,
            capability: "text-generation",
            model: request.model,
            source: "2bot",
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
        };
        const deduction = request.organizationId
            ? await credits_1.twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
            : await credits_1.twoBotAICreditService.deductPersonalCredits(usageData);
        response.creditsUsed = deduction.creditsUsed;
        response.newBalance = deduction.newBalance;
        log.info({
            userId: request.userId,
            model: request.model,
            originalModel: routingResult?.wasRouted ? originalModel : undefined,
            smartRouted: routingResult?.wasRouted || false,
            complexity: routingResult?.complexity,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            creditsUsed: deduction.creditsUsed,
        }, "2Bot AI chat completed");
        return response;
    },
    /**
     * Chat completion (streaming)
     * Returns an async generator that yields chunks
     */
    async *chatStream(request) {
        const log = logger_1.logger.child({ module: "2bot-ai-provider", capability: "text-generation" });
        // ✅ Validate model is available (throws if not)
        (0, model_router_1.validateModelAvailable)(request.model);
        // 🧠 Smart Model Routing - use cheaper model for simple queries (if enabled)
        const smartRoutingEnabled = request.smartRouting !== false;
        const originalModel = request.model;
        let routingResult = null;
        if (smartRoutingEnabled) {
            routingResult = (0, model_router_1.getSmartRoutingDecision)(request.model, request.messages, true);
            if (routingResult.wasRouted) {
                log.info({
                    originalModel: routingResult.originalModel,
                    routedModel: routingResult.model,
                    complexity: routingResult.complexity,
                    reason: routingResult.reason,
                    estimatedSavings: routingResult.estimatedSavingsPercent
                        ? `~${routingResult.estimatedSavingsPercent}%`
                        : undefined,
                }, "🧠 Smart routing (stream): using cheaper model");
                request = { ...request, model: routingResult.model };
            }
        }
        const provider = this.getProvider(request.model);
        // 💾 Check cache first (if enabled)
        // NOTE: Streaming cache responses is slightly different, we emit one big chunk
        if (process.env.AI_CACHE_ENABLED !== "false") {
            const cachedResponse = await ai_cache_service_1.aiCacheService.get(request.model, request.messages);
            if (cachedResponse) {
                log.info({ model: request.model }, "Cache hit! Returning cached response (FREE)");
                // Return full content as a single chunk immediately
                yield {
                    id: `cached_${Date.now()}`,
                    delta: cachedResponse,
                    finishReason: "stop",
                };
                // Get balance for final stats
                const balance = request.organizationId
                    ? await credits_1.twoBotAICreditService.getOrgBalance(request.organizationId)
                    : await credits_1.twoBotAICreditService.getPersonalBalance(request.userId);
                return {
                    id: `cached_${Date.now()}`,
                    model: request.model,
                    content: cachedResponse,
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    creditsUsed: 0,
                    newBalance: balance?.balance ?? 0,
                    cached: true,
                };
            }
        }
        // Calculate estimated credits
        const estimatedTokens = estimateTokens(request.messages);
        const estimatedCost = await credits_1.twoBotAICreditService.calculateCreditsByCapability("text-generation", request.model, {
            inputTokens: estimatedTokens,
            outputTokens: estimatedTokens,
        });
        // Check credits based on context (org OR personal, NO fallback)
        if (request.organizationId) {
            const creditCheck = await credits_1.twoBotAICreditService.checkOrgCredits(request.organizationId, estimatedCost);
            if (!creditCheck) {
                throw new types_1.TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
            }
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402, { limit: creditCheck.planLimit, used: creditCheck.monthlyUsed });
                }
                throw new types_1.TwoBotAIError(`Insufficient organization credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402, { required: estimatedCost, available: creditCheck.balance });
            }
        }
        else {
            const creditCheck = await credits_1.twoBotAICreditService.checkPersonalCredits(request.userId, estimatedCost);
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402, { limit: creditCheck.planLimit, used: creditCheck.monthlyUsed });
                }
                throw new types_1.TwoBotAIError(`Insufficient credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402, { required: estimatedCost, available: creditCheck.balance });
            }
        }
        // Stream the response
        let generator;
        if (provider === "openai") {
            generator = (0, adapters_1.openaiTextGenerationStream)(request);
        }
        else {
            generator = (0, adapters_1.anthropicTextGenerationStream)(request);
        }
        let lastChunk;
        let result;
        let content = "";
        while (!(result = await generator.next()).done) {
            lastChunk = result.value;
            content += lastChunk.delta;
            yield lastChunk;
        }
        // Get final usage from generator return value
        const usage = result.value;
        // Deduct credits based on context (org OR personal, NO fallback)
        const usageData = {
            userId: request.userId,
            gatewayId: undefined,
            capability: "text-generation",
            model: request.model,
            source: "2bot",
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
        };
        // 💾 Cache the full response (if enabled)
        if (process.env.AI_CACHE_ENABLED !== "false") {
            await ai_cache_service_1.aiCacheService.set(request.model, request.messages, content);
        }
        const deduction = request.organizationId
            ? await credits_1.twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
            : await credits_1.twoBotAICreditService.deductPersonalCredits(usageData);
        log.info({
            userId: request.userId,
            organizationId: request.organizationId,
            model: request.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            creditsUsed: deduction.creditsUsed,
            walletType: deduction.walletType,
        }, "2Bot AI stream completed");
        return {
            id: lastChunk?.id || `chat_${Date.now()}`,
            model: request.model,
            content,
            finishReason: lastChunk?.finishReason || "stop",
            usage: {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.inputTokens + usage.outputTokens,
            },
            creditsUsed: deduction.creditsUsed,
            newBalance: deduction.newBalance,
        };
    },
    /**
     * Image generation
     */
    async image(request) {
        const log = logger_1.logger.child({ module: "2bot-ai-provider", capability: "image-generation" });
        const model = request.model || "dall-e-3";
        // ✅ Check if OpenAI is configured (image gen requires OpenAI)
        if (!(0, provider_config_1.isProviderConfigured)("openai")) {
            throw new types_1.TwoBotAIError("Image generation requires OpenAI API. This feature is not currently available.", "MODEL_UNAVAILABLE", 503);
        }
        // Calculate estimated credits
        const estimatedCost = await credits_1.twoBotAICreditService.calculateCreditsByCapability("image-generation", model, {
            imageCount: request.n || 1,
        });
        // Check credits based on context (org OR personal, NO fallback)
        if (request.organizationId) {
            const creditCheck = await credits_1.twoBotAICreditService.checkOrgCredits(request.organizationId, estimatedCost);
            if (!creditCheck) {
                throw new types_1.TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
            }
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402);
                }
                throw new types_1.TwoBotAIError(`Insufficient organization credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402);
            }
        }
        else {
            const creditCheck = await credits_1.twoBotAICreditService.checkPersonalCredits(request.userId, estimatedCost);
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402);
                }
                throw new types_1.TwoBotAIError(`Insufficient credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402);
            }
        }
        // Generate image
        const response = await (0, adapters_1.openaiImageGeneration)(request);
        // Deduct credits based on context
        const usageData = {
            userId: request.userId,
            gatewayId: undefined,
            capability: "image-generation",
            model: response.model,
            source: "2bot",
            imageCount: response.images.length,
        };
        const deduction = request.organizationId
            ? await credits_1.twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
            : await credits_1.twoBotAICreditService.deductPersonalCredits(usageData);
        response.creditsUsed = deduction.creditsUsed;
        response.newBalance = deduction.newBalance;
        log.info({
            userId: request.userId,
            organizationId: request.organizationId,
            model: response.model,
            imageCount: response.images.length,
            creditsUsed: deduction.creditsUsed,
            walletType: deduction.walletType,
        }, "2Bot AI image generated");
        return response;
    },
    /**
     * Text-to-speech
     */
    async tts(request) {
        const log = logger_1.logger.child({ module: "2bot-ai-provider", capability: "speech-synthesis" });
        const model = request.model || "tts-1";
        // ✅ Check if OpenAI is configured (TTS requires OpenAI)
        if (!(0, provider_config_1.isProviderConfigured)("openai")) {
            throw new types_1.TwoBotAIError("Text-to-speech requires OpenAI API. This feature is not currently available.", "MODEL_UNAVAILABLE", 503);
        }
        // Calculate estimated credits
        const estimatedCost = await credits_1.twoBotAICreditService.calculateCreditsByCapability("speech-synthesis", model, {
            characterCount: request.text.length,
        });
        // Check credits based on context (org OR personal, NO fallback)
        if (request.organizationId) {
            const creditCheck = await credits_1.twoBotAICreditService.checkOrgCredits(request.organizationId, estimatedCost);
            if (!creditCheck) {
                throw new types_1.TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
            }
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402);
                }
                throw new types_1.TwoBotAIError(`Insufficient organization credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402);
            }
        }
        else {
            const creditCheck = await credits_1.twoBotAICreditService.checkPersonalCredits(request.userId, estimatedCost);
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402);
                }
                throw new types_1.TwoBotAIError(`Insufficient credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402);
            }
        }
        // Generate TTS
        const response = await (0, adapters_1.openaiSpeechSynthesis)(request);
        // Deduct credits based on context
        const usageData = {
            userId: request.userId,
            gatewayId: undefined,
            capability: "speech-synthesis",
            model,
            source: "2bot",
            characterCount: response.characterCount,
        };
        const deduction = request.organizationId
            ? await credits_1.twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
            : await credits_1.twoBotAICreditService.deductPersonalCredits(usageData);
        response.creditsUsed = deduction.creditsUsed;
        response.newBalance = deduction.newBalance;
        log.info({
            userId: request.userId,
            organizationId: request.organizationId,
            model,
            characterCount: response.characterCount,
            creditsUsed: deduction.creditsUsed,
            walletType: deduction.walletType,
        }, "2Bot AI TTS completed");
        return response;
    },
    /**
     * Speech-to-text
     */
    async stt(request) {
        const log = logger_1.logger.child({ module: "2bot-ai-provider", capability: "speech-recognition" });
        const model = request.model || "whisper-1";
        // ✅ Check if OpenAI is configured (STT requires OpenAI)
        if (!(0, provider_config_1.isProviderConfigured)("openai")) {
            throw new types_1.TwoBotAIError("Speech-to-text requires OpenAI API. This feature is not currently available.", "MODEL_UNAVAILABLE", 503);
        }
        // For STT, we can't estimate duration beforehand
        // Check minimum credits (1 minute worth)
        const minCost = await credits_1.twoBotAICreditService.calculateCreditsByCapability("speech-recognition", model, {
            audioSeconds: 60,
        });
        // Check credits based on context (org OR personal, NO fallback)
        if (request.organizationId) {
            const creditCheck = await credits_1.twoBotAICreditService.checkOrgCredits(request.organizationId, minCost);
            if (!creditCheck) {
                throw new types_1.TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
            }
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402);
                }
                throw new types_1.TwoBotAIError(`Insufficient organization credits. Minimum required: ${minCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402);
            }
        }
        else {
            const creditCheck = await credits_1.twoBotAICreditService.checkPersonalCredits(request.userId, minCost);
            if (!creditCheck.hasCredits) {
                if (!creditCheck.withinPlanLimit) {
                    throw new types_1.TwoBotAIError(`Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`, "PLAN_LIMIT_EXCEEDED", 402);
                }
                throw new types_1.TwoBotAIError(`Insufficient credits. Minimum required: ${minCost}, Available: ${creditCheck.balance}`, "INSUFFICIENT_CREDITS", 402);
            }
        }
        // Transcribe
        const response = await (0, adapters_1.openaiSpeechRecognition)(request);
        // Deduct credits based on actual duration
        const usageData = {
            userId: request.userId,
            gatewayId: undefined,
            capability: "speech-recognition",
            model,
            source: "2bot",
            audioSeconds: Math.ceil(response.duration),
        };
        const deduction = request.organizationId
            ? await credits_1.twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
            : await credits_1.twoBotAICreditService.deductPersonalCredits(usageData);
        response.creditsUsed = deduction.creditsUsed;
        response.newBalance = deduction.newBalance;
        log.info({
            userId: request.userId,
            organizationId: request.organizationId,
            model,
            duration: response.duration,
            creditsUsed: deduction.creditsUsed,
            walletType: deduction.walletType,
        }, "2Bot AI STT completed");
        return response;
    },
};
// ===========================================
// Helpers
// ===========================================
/**
 * Rough token estimation for credit pre-check
 * Uses ~4 chars per token approximation
 */
function estimateTokens(messages) {
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
}
//# sourceMappingURL=2bot-ai.provider.js.map