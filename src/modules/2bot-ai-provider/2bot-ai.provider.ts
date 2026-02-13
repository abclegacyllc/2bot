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

import { logger } from "@/lib/logger";
import { twoBotAICreditService } from "@/modules/credits";
import {
    anthropicTextGeneration,
    anthropicTextGenerationStream,
    openaiImageGeneration,
    openaiSpeechRecognition,
    openaiSpeechSynthesis,
    openaiTextGeneration,
    openaiTextGenerationStream,
    togetherImageGeneration,
    togetherTextGeneration,
    togetherTextGenerationStream,
} from "./adapters";
import { aiCacheService } from "./ai-cache.service";
import type { AICapability } from "./ai-capabilities";
import {
    getAvailableTwoBotAIModels,
    getTwoBotAIModel,
    getTwoBotAIModelsByCapability,
    isTwoBotAIModelId,
    resolveTwoBotAIModel,
    TWOBOT_AI_MODEL_TIERS,
    twoBotAIModelResolver,
    type ModelResolutionResult,
    type TwoBotAIModelId,
    type TwoBotAIModelInfo,
} from "./model-catalog";
import type { SmartRoutingResult } from "./model-router";
import { getSmartRoutingDecision, validateModelAvailable } from "./model-router";
import {
    getAvailableModels,
    getConfiguredProviders,
    getModelIfAvailable,
    getProvidersStatus,
    isProviderConfigured
} from "./provider-config";
import type {
    ImageGenerationRequest,
    ImageGenerationResponse,
    ModelInfo,
    SpeechRecognitionRequest,
    SpeechRecognitionResponse,
    SpeechSynthesisRequest,
    SpeechSynthesisResponse,
    TextGenerationRequest,
    TextGenerationResponse,
    TextGenerationStreamChunk,
    TwoBotAIModel,
    TwoBotAIProvider
} from "./types";
import { TwoBotAIError } from "./types";

// ===========================================
// Provider Service
// ===========================================

export const twoBotAIProvider = {
  /**
   * Get available models (only from configured providers!)
   * @param capability - Filter by capability (text-generation, image-generation, speech-synthesis, speech-recognition, text-embedding, image-understanding)
   */
  getModels(capability?: AICapability): ModelInfo[] {
    return getAvailableModels(capability);
  },

  /**
   * Get model info by ID (only if available)
   */
  getModel(modelId: TwoBotAIModel): ModelInfo | undefined {
    return getModelIfAvailable(modelId);
  },

  /**
   * Get provider for a model
   */
  getProvider(modelId: TwoBotAIModel): TwoBotAIProvider {
    const model = getModelIfAvailable(modelId);
    if (!model) {
      throw new TwoBotAIError(
        `Model "${modelId}" is not available. Check API configuration.`,
        "MODEL_UNAVAILABLE",
        400
      );
    }
    return model.provider;
  },

  /**
   * Check if a provider is configured
   */
  isProviderReady(provider: TwoBotAIProvider): boolean {
    return isProviderConfigured(provider);
  },

  /**
   * Get status of all providers
   */
  getProvidersStatus() {
    return getProvidersStatus();
  },

  /**
   * Get configured providers list
   */
  getConfiguredProviders(): TwoBotAIProvider[] {
    return getConfiguredProviders();
  },

  // ===========================================
  // 2Bot AI Model Catalog (User-facing models)
  // ===========================================

  /**
   * Get available 2Bot AI models (user-facing, hides provider details)
   * @param capability - Filter by capability
   */
  getTwoBotAIModels(capability?: AICapability): TwoBotAIModelInfo[] {
    let models = getAvailableTwoBotAIModels();
    
    if (capability) {
      models = getTwoBotAIModelsByCapability(capability);
    }
    
    // Only return models that can be resolved to a configured provider
    return models
      .filter((model) => {
        try {
          resolveTwoBotAIModel(model.id);
          return true;
        } catch {
          return false;
        }
      })
      .map((model) => ({
        id: model.id,
        displayName: model.displayName,
        description: model.description,
        capability: model.capability,
        tier: model.tier,
        tierInfo: TWOBOT_AI_MODEL_TIERS[model.tier],
        maxContextTokens: model.maxContextTokens,
        maxOutputTokens: model.maxOutputTokens,
        isAvailable: model.isAvailable,
        features: model.features,
        tags: model.tags,
      }));
  },

  /**
   * Get a single 2Bot AI model by ID
   */
  getTwoBotAIModel(modelId: TwoBotAIModelId): TwoBotAIModelInfo | undefined {
    const model = getTwoBotAIModel(modelId);
    if (!model) return undefined;
    
    // Check if it can be resolved
    try {
      resolveTwoBotAIModel(modelId);
    } catch {
      return undefined;
    }
    
    return {
      id: model.id,
      displayName: model.displayName,
      description: model.description,
      capability: model.capability,
      tier: model.tier,
      tierInfo: TWOBOT_AI_MODEL_TIERS[model.tier],
      maxContextTokens: model.maxContextTokens,
      maxOutputTokens: model.maxOutputTokens,
      isAvailable: model.isAvailable,
      features: model.features,
      tags: model.tags,
    };
  },

  /**
   * Resolve a 2Bot AI model ID to provider details (internal use)
   */
  resolveModel(modelId: TwoBotAIModelId): ModelResolutionResult {
    return resolveTwoBotAIModel(modelId);
  },

  /**
   * Check if a model ID is a 2Bot AI model
   */
  isTwoBotAIModel(modelId: string): modelId is TwoBotAIModelId {
    return isTwoBotAIModelId(modelId);
  },

  /**
   * Text generation (non-streaming)
   */
  async textGeneration(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "text-generation" });

    // 🔄 Resolve 2Bot AI model IDs to provider models (with failover support)
    let resolution: ModelResolutionResult | null = null;
    if (isTwoBotAIModelId(request.model as string)) {
      try {
        resolution = resolveTwoBotAIModel(request.model as TwoBotAIModelId);
        log.info({
          twobotModel: request.model,
          resolvedProvider: resolution.provider,
          resolvedModel: resolution.providerModelId,
          fallbackCount: resolution.fallbackOptions.length,
        }, "🔄 Resolved 2Bot AI model to provider");
        request = { ...request, model: resolution.providerModelId as TwoBotAIModel };
      } catch (err) {
        throw new TwoBotAIError(
          `Cannot resolve model "${request.model}": ${err instanceof Error ? err.message : String(err)}`,
          "MODEL_UNAVAILABLE",
          400
        );
      }
    }

    // ✅ Validate model is available (throws if not)
    validateModelAvailable(request.model);
    
    // 🧠 Smart Model Routing - use cheaper model for simple queries
    // Only apply if smartRouting is enabled (default: true for backward compatibility)
    const smartRoutingEnabled = request.smartRouting !== false;
    const originalModel = request.model;
    let routingResult: SmartRoutingResult | null = null;
    
    if (smartRoutingEnabled) {
      routingResult = getSmartRoutingDecision(request.model, request.messages, true);
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
        request = { ...request, model: routingResult.model as TwoBotAIModel };
      } else {
        log.debug({
          model: routingResult.model,
          complexity: routingResult.complexity,
          reason: routingResult.reason,
        }, "Smart routing: no change needed");
      }
    } else {
      log.debug({ model: originalModel }, "Smart routing disabled, using selected model");
    }

    const provider = this.getProvider(request.model);

    // 💾 Check cache first - $0.00 if hit!
    const cachedResponse = await aiCacheService.get(request.model, request.messages);
    if (cachedResponse) {
      log.info({ model: request.model }, "Cache hit! Returning cached response (FREE)");
      // Get balance based on context (org or personal)
      const balance = request.organizationId 
        ? await twoBotAICreditService.getOrgBalance(request.organizationId)
        : await twoBotAICreditService.getPersonalBalance(request.userId);
      
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
    const estimatedCost = await twoBotAICreditService.calculateCreditsByCapability(
      "text-generation",
      request.model,
      {
        inputTokens: estimatedTokens,
        outputTokens: estimatedTokens, // Conservative estimate
      }
    );

    // Check credits based on context (org OR personal, NO fallback)
    if (request.organizationId) {
      // Organization context - use org wallet ONLY
      const creditCheck = await twoBotAICreditService.checkOrgCredits(
        request.organizationId,
        estimatedCost
      );
      
      if (!creditCheck) {
        throw new TwoBotAIError(
          "Organization wallet not found",
          "WALLET_NOT_FOUND",
          404
        );
      }
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient organization credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402,
          { required: estimatedCost, available: creditCheck.balance }
        );
      }
    } else {
      // Personal context - use personal wallet ONLY
      const creditCheck = await twoBotAICreditService.checkPersonalCredits(
        request.userId,
        estimatedCost
      );
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402,
          { required: estimatedCost, available: creditCheck.balance }
        );
      }
    }

    // Make the request (with provider failover for 2Bot AI models)
    let response: TextGenerationResponse;
    const callProviderAdapter = async (p: TwoBotAIProvider, req: TextGenerationRequest): Promise<TextGenerationResponse> => {
      if (p === "openai") return openaiTextGeneration(req);
      if (p === "together") return togetherTextGeneration(req);
      return anthropicTextGeneration(req);
    };

    if (resolution) {
      // 2Bot AI model: try with automatic failover across providers
      let currentResolution: ModelResolutionResult | null = resolution;
      let currentProvider = provider;
      let currentModel = request.model;

      while (true) {
        try {
          response = await callProviderAdapter(currentProvider, { ...request, model: currentModel });
          // Update request model to reflect actual model used (for billing/logging)
          request = { ...request, model: currentModel };
          break;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));

          // Try next fallback provider
          if (currentResolution) {
            const next = twoBotAIModelResolver.getNextFallback(currentResolution);
            if (next) {
              log.warn({
                failedProvider: currentProvider,
                failedModel: currentModel,
                error: error.message,
                nextProvider: next.provider,
                nextModel: next.providerModelId,
                remainingFallbacks: next.fallbackOptions.length,
              }, "⚠️ Provider failed, trying fallback");
              currentResolution = next;
              currentProvider = next.provider as TwoBotAIProvider;
              currentModel = next.providerModelId as TwoBotAIModel;
              continue;
            }
          }

          // No more fallbacks — re-throw
          throw err;
        }
      }
    } else {
      // Raw provider model: single attempt (existing behavior)
      response = await callProviderAdapter(provider, request);
    }

    // 💾 Cache the response for future requests (if enabled)
    // Respect privacy setting: AI_CACHE_ENABLED=false disables this
    if (process.env.AI_CACHE_ENABLED !== "false") {
      await aiCacheService.set(request.model, request.messages, response.content);
    }

    // Deduct credits based on context (org OR personal, NO fallback)
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      capability: "text-generation" as const,
      model: request.model,
      source: "2bot" as const,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    };

    const deduction = request.organizationId
      ? await twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
      : await twoBotAICreditService.deductPersonalCredits(usageData);

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
    }, "2Bot AI textGeneration completed");

    return response;
  },

  /**
   * Text generation (streaming)
   * Returns an async generator that yields chunks
   */
  async *textGenerationStream(
    request: TextGenerationRequest
  ): AsyncGenerator<TextGenerationStreamChunk, TextGenerationResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "text-generation" });

    // 🔄 Resolve 2Bot AI model IDs to provider models
    if (isTwoBotAIModelId(request.model as string)) {
      try {
        const resolution = resolveTwoBotAIModel(request.model as TwoBotAIModelId);
        log.info({
          twobotModel: request.model,
          resolvedProvider: resolution.provider,
          resolvedModel: resolution.providerModelId,
        }, "🔄 Resolved 2Bot AI model (stream)");
        request = { ...request, model: resolution.providerModelId as TwoBotAIModel };
      } catch (err) {
        throw new TwoBotAIError(
          `Cannot resolve model "${request.model}": ${err instanceof Error ? err.message : String(err)}`,
          "MODEL_UNAVAILABLE",
          400
        );
      }
    }

    // ✅ Validate model is available (throws if not)
    validateModelAvailable(request.model);

    // 🧠 Smart Model Routing - use cheaper model for simple queries (if enabled)
    const smartRoutingEnabled = request.smartRouting !== false;
    const _originalModel = request.model;
    let routingResult: SmartRoutingResult | null = null;
    
    if (smartRoutingEnabled) {
      routingResult = getSmartRoutingDecision(request.model, request.messages, true);
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
        request = { ...request, model: routingResult.model as TwoBotAIModel };
      }
    }

    const provider = this.getProvider(request.model);

    // 💾 Check cache first (if enabled)
    // NOTE: Streaming cache responses is slightly different, we emit one big chunk
    if (process.env.AI_CACHE_ENABLED !== "false") {
      const cachedResponse = await aiCacheService.get(request.model, request.messages);
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
          ? await twoBotAICreditService.getOrgBalance(request.organizationId)
          : await twoBotAICreditService.getPersonalBalance(request.userId);

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
    const estimatedCost = await twoBotAICreditService.calculateCreditsByCapability(
      "text-generation",
      request.model,
      {
        inputTokens: estimatedTokens,
        outputTokens: estimatedTokens,
      }
    );

    // Check credits based on context (org OR personal, NO fallback)
    if (request.organizationId) {
      const creditCheck = await twoBotAICreditService.checkOrgCredits(
        request.organizationId,
        estimatedCost
      );
      
      if (!creditCheck) {
        throw new TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
      }
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient organization credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402,
          { required: estimatedCost, available: creditCheck.balance }
        );
      }
    } else {
      const creditCheck = await twoBotAICreditService.checkPersonalCredits(
        request.userId,
        estimatedCost
      );
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402,
          { required: estimatedCost, available: creditCheck.balance }
        );
      }
    }

    // Stream the response
    let generator: AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }>;
    if (provider === "openai") {
      generator = openaiTextGenerationStream(request);
    } else if (provider === "together") {
      generator = togetherTextGenerationStream(request);
    } else {
      generator = anthropicTextGenerationStream(request);
    }

    let lastChunk: TextGenerationStreamChunk | undefined;
    let result: IteratorResult<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }>;
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
      capability: "text-generation" as const,
      model: request.model,
      source: "2bot" as const,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    };

    // 💾 Cache the full response (if enabled)
    if (process.env.AI_CACHE_ENABLED !== "false") {
      await aiCacheService.set(request.model, request.messages, content);
    }

    const deduction = request.organizationId
      ? await twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
      : await twoBotAICreditService.deductPersonalCredits(usageData);

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
   * 
   * Uses model resolver to route to the best available provider.
   * Supports 2Bot model IDs (e.g. '2bot-ai-image-pro') and raw provider model IDs.
   * Automatically falls back to available providers (e.g. Together FLUX when OpenAI is unavailable).
   */
  async imageGeneration(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "image-generation" });

    // Resolve 2Bot model ID to provider model, or use raw model ID
    let providerModelId: string;
    let provider: TwoBotAIProvider;
    const requestModel = request.model || "2bot-ai-image-pro";

    if (isTwoBotAIModelId(requestModel)) {
      // 2Bot model ID — use resolver to find best available provider
      try {
        const resolution = resolveTwoBotAIModel(requestModel as TwoBotAIModelId);
        providerModelId = resolution.providerModelId;
        provider = resolution.provider;
        log.info({
          twobotModel: requestModel,
          resolvedProvider: provider,
          resolvedModel: providerModelId,
          strategy: resolution.strategyUsed,
          fallbackCount: resolution.fallbackOptions.length,
        }, "Image model resolved via catalog");
      } catch (_error) {
        throw new TwoBotAIError(
          "No image generation providers are currently available. Please try again later.",
          "MODEL_UNAVAILABLE",
          503
        );
      }
    } else {
      // Raw provider model ID (e.g. "dall-e-3" or "black-forest-labs/FLUX.1-schnell")
      const isTogetherModel = requestModel.includes("/");
      if (isTogetherModel) {
        provider = "together";
        providerModelId = requestModel;
      } else {
        provider = "openai";
        providerModelId = requestModel;
      }
      // Verify the provider is configured
      if (!isProviderConfigured(provider)) {
        throw new TwoBotAIError(
          `Image generation with ${provider} is not currently available.`,
          "MODEL_UNAVAILABLE",
          503
        );
      }
    }

    // Calculate estimated credits using the resolved provider model
    const estimatedCost = await twoBotAICreditService.calculateCreditsByCapability(
      "image-generation",
      providerModelId,
      {
        imageCount: request.n || 1,
      }
    );

    // Check credits based on context (org OR personal, NO fallback)
    if (request.organizationId) {
      const creditCheck = await twoBotAICreditService.checkOrgCredits(
        request.organizationId,
        estimatedCost
      );
      
      if (!creditCheck) {
        throw new TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
      }
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient organization credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    } else {
      const creditCheck = await twoBotAICreditService.checkPersonalCredits(
        request.userId,
        estimatedCost
      );
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    }

    // Generate image - route to the resolved provider
    const providerRequest = { ...request, model: providerModelId };
    const response = provider === "together"
      ? await togetherImageGeneration(providerRequest)
      : await openaiImageGeneration(providerRequest);

    // Deduct credits based on context
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      capability: "image-generation" as const,
      model: providerModelId,
      source: "2bot" as const,
      imageCount: response.images.length,
    };

    const deduction = request.organizationId
      ? await twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
      : await twoBotAICreditService.deductPersonalCredits(usageData);

    response.creditsUsed = deduction.creditsUsed;
    response.newBalance = deduction.newBalance;

    log.info({
      userId: request.userId,
      organizationId: request.organizationId,
      twobotModel: requestModel,
      resolvedProvider: provider,
      resolvedModel: providerModelId,
      imageCount: response.images.length,
      creditsUsed: deduction.creditsUsed,
      walletType: deduction.walletType,
    }, "2Bot AI image generated");

    return response;
  },

  /**
   * Speech synthesis (text-to-speech)
   * 
   * Uses model resolver to route to the best available provider.
   * Currently only OpenAI supports TTS; Together AI does not offer TTS.
   * If no TTS provider is configured, throws a clear error.
   */
  async speechSynthesis(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "speech-synthesis" });

    // Resolve 2Bot model ID to provider model
    let providerModelId: string;
    let provider: TwoBotAIProvider;
    const requestModel = request.model || "2bot-ai-voice-pro";

    if (isTwoBotAIModelId(requestModel)) {
      try {
        const resolution = resolveTwoBotAIModel(requestModel as TwoBotAIModelId);
        providerModelId = resolution.providerModelId;
        provider = resolution.provider;
        log.info({
          twobotModel: requestModel,
          resolvedProvider: provider,
          resolvedModel: providerModelId,
        }, "TTS model resolved via catalog");
      } catch {
        throw new TwoBotAIError(
          "Text-to-speech is not currently available. No TTS provider is configured.",
          "MODEL_UNAVAILABLE",
          503
        );
      }
    } else {
      // Raw model ID — assume OpenAI for TTS models
      providerModelId = requestModel;
      provider = "openai";
      if (!isProviderConfigured("openai")) {
        throw new TwoBotAIError(
          "Text-to-speech is not currently available. No TTS provider is configured.",
          "MODEL_UNAVAILABLE",
          503
        );
      }
    }

    // Calculate estimated credits
    const estimatedCost = await twoBotAICreditService.calculateCreditsByCapability(
      "speech-synthesis",
      providerModelId,
      {
        characterCount: request.text.length,
      }
    );

    // Check credits based on context (org OR personal, NO fallback)
    if (request.organizationId) {
      const creditCheck = await twoBotAICreditService.checkOrgCredits(
        request.organizationId,
        estimatedCost
      );
      
      if (!creditCheck) {
        throw new TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
      }
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient organization credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    } else {
      const creditCheck = await twoBotAICreditService.checkPersonalCredits(
        request.userId,
        estimatedCost
      );
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    }

    // Generate TTS using the resolved provider model
    const providerRequest = { ...request, model: providerModelId };
    const response = await openaiSpeechSynthesis(providerRequest);

    // Deduct credits based on context
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      capability: "speech-synthesis" as const,
      model: providerModelId,
      source: "2bot" as const,
      characterCount: response.characterCount,
    };

    const deduction = request.organizationId
      ? await twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
      : await twoBotAICreditService.deductPersonalCredits(usageData);

    response.creditsUsed = deduction.creditsUsed;
    response.newBalance = deduction.newBalance;

    log.info({
      userId: request.userId,
      organizationId: request.organizationId,
      twobotModel: requestModel,
      resolvedModel: providerModelId,
      characterCount: response.characterCount,
      creditsUsed: deduction.creditsUsed,
      walletType: deduction.walletType,
    }, "2Bot AI TTS completed");

    return response;
  },

  /**
  /**
   * Speech recognition (speech-to-text)
   * 
   * Uses model resolver to route to the best available provider.
   * Currently only OpenAI supports STT (Whisper). Together AI STT not yet available.
   * If no STT provider is configured, throws a clear error.
   */
  async speechRecognition(request: SpeechRecognitionRequest): Promise<SpeechRecognitionResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "speech-recognition" });

    // Resolve 2Bot model ID to provider model
    let providerModelId: string;
    let provider: TwoBotAIProvider;
    const requestModel = request.model || "2bot-ai-transcribe-lite";

    if (isTwoBotAIModelId(requestModel)) {
      try {
        const resolution = resolveTwoBotAIModel(requestModel as TwoBotAIModelId);
        providerModelId = resolution.providerModelId;
        provider = resolution.provider;
        log.info({
          twobotModel: requestModel,
          resolvedProvider: provider,
          resolvedModel: providerModelId,
        }, "STT model resolved via catalog");
      } catch {
        throw new TwoBotAIError(
          "Speech-to-text is not currently available. No STT provider is configured.",
          "MODEL_UNAVAILABLE",
          503
        );
      }
    } else {
      // Raw model ID — assume OpenAI for STT models
      providerModelId = requestModel;
      provider = "openai";
      if (!isProviderConfigured("openai")) {
        throw new TwoBotAIError(
          "Speech-to-text is not currently available. No STT provider is configured.",
          "MODEL_UNAVAILABLE",
          503
        );
      }
    }

    // For STT, we can't estimate duration beforehand
    // Check minimum credits (1 minute worth)
    const minCost = await twoBotAICreditService.calculateCreditsByCapability(
      "speech-recognition",
      providerModelId,
      {
        audioSeconds: 60,
      }
    );

    // Check credits based on context (org OR personal, NO fallback)
    if (request.organizationId) {
      const creditCheck = await twoBotAICreditService.checkOrgCredits(
        request.organizationId,
        minCost
      );
      
      if (!creditCheck) {
        throw new TwoBotAIError("Organization wallet not found", "WALLET_NOT_FOUND", 404);
      }
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient organization credits. Minimum required: ${minCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    } else {
      const creditCheck = await twoBotAICreditService.checkPersonalCredits(
        request.userId,
        minCost
      );
      
      if (!creditCheck.hasCredits) {
        throw new TwoBotAIError(
          `Insufficient credits. Minimum required: ${minCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    }

    // Transcribe using the resolved provider model
    const providerRequest = { ...request, model: providerModelId };
    const response = await openaiSpeechRecognition(providerRequest);

    // Deduct credits based on actual duration
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      capability: "speech-recognition" as const,
      model: providerModelId,
      source: "2bot" as const,
      audioSeconds: Math.ceil(response.duration),
    };

    const deduction = request.organizationId
      ? await twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
      : await twoBotAICreditService.deductPersonalCredits(usageData);

    response.creditsUsed = deduction.creditsUsed;
    response.newBalance = deduction.newBalance;

    log.info({
      userId: request.userId,
      organizationId: request.organizationId,
      twobotModel: requestModel,
      resolvedModel: providerModelId,
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
function estimateTokens(messages: { content: string }[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(totalChars / 4);
}
