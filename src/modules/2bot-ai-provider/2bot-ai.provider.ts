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
} from "./adapters";
import { aiCacheService } from "./ai-cache.service";
import type { AICapability } from "./ai-capabilities";
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

  /**
   * Text generation (non-streaming)
   */
  async textGeneration(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "text-generation" });

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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402,
            { limit: creditCheck.planLimit, used: creditCheck.monthlyUsed }
          );
        }
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402,
            { limit: creditCheck.planLimit, used: creditCheck.monthlyUsed }
          );
        }
        throw new TwoBotAIError(
          `Insufficient credits. Required: ~${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402,
          { required: estimatedCost, available: creditCheck.balance }
        );
      }
    }

    // Make the request
    let response: TextGenerationResponse;
    if (provider === "openai") {
      response = await openaiTextGeneration(request);
    } else {
      response = await anthropicTextGeneration(request);
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

    // ✅ Validate model is available (throws if not)
    validateModelAvailable(request.model);

    // 🧠 Smart Model Routing - use cheaper model for simple queries (if enabled)
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402,
            { limit: creditCheck.planLimit, used: creditCheck.monthlyUsed }
          );
        }
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402,
            { limit: creditCheck.planLimit, used: creditCheck.monthlyUsed }
          );
        }
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
   */
  async imageGeneration(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "image-generation" });
    const model = request.model || "dall-e-3";

    // ✅ Check if OpenAI is configured (image gen requires OpenAI)
    if (!isProviderConfigured("openai")) {
      throw new TwoBotAIError(
        "Image generation requires OpenAI API. This feature is not currently available.",
        "MODEL_UNAVAILABLE",
        503
      );
    }

    // Calculate estimated credits
    const estimatedCost = await twoBotAICreditService.calculateCreditsByCapability(
      "image-generation",
      model,
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402
          );
        }
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402
          );
        }
        throw new TwoBotAIError(
          `Insufficient credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    }

    // Generate image
    const response = await openaiImageGeneration(request);

    // Deduct credits based on context
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      capability: "image-generation" as const,
      model: response.model,
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
      model: response.model,
      imageCount: response.images.length,
      creditsUsed: deduction.creditsUsed,
      walletType: deduction.walletType,
    }, "2Bot AI image generated");

    return response;
  },

  /**
   * Speech synthesis (text-to-speech)
   */
  async speechSynthesis(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "speech-synthesis" });
    const model = request.model || "tts-1";

    // ✅ Check if OpenAI is configured (TTS requires OpenAI)
    if (!isProviderConfigured("openai")) {
      throw new TwoBotAIError(
        "Text-to-speech requires OpenAI API. This feature is not currently available.",
        "MODEL_UNAVAILABLE",
        503
      );
    }

    // Calculate estimated credits
    const estimatedCost = await twoBotAICreditService.calculateCreditsByCapability(
      "speech-synthesis",
      model,
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402
          );
        }
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402
          );
        }
        throw new TwoBotAIError(
          `Insufficient credits. Required: ${estimatedCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    }

    // Generate TTS
    const response = await openaiSpeechSynthesis(request);

    // Deduct credits based on context
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      capability: "speech-synthesis" as const,
      model,
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
      model,
      characterCount: response.characterCount,
      creditsUsed: deduction.creditsUsed,
      walletType: deduction.walletType,
    }, "2Bot AI TTS completed");

    return response;
  },

  /**
   * Speech recognition (speech-to-text)
   */
  async speechRecognition(request: SpeechRecognitionRequest): Promise<SpeechRecognitionResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "speech-recognition" });
    const model = request.model || "whisper-1";

    // ✅ Check if OpenAI is configured (STT requires OpenAI)
    if (!isProviderConfigured("openai")) {
      throw new TwoBotAIError(
        "Speech-to-text requires OpenAI API. This feature is not currently available.",
        "MODEL_UNAVAILABLE",
        503
      );
    }

    // For STT, we can't estimate duration beforehand
    // Check minimum credits (1 minute worth)
    const minCost = await twoBotAICreditService.calculateCreditsByCapability(
      "speech-recognition",
      model,
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Organization monthly limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402
          );
        }
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
        if (!creditCheck.withinPlanLimit) {
          throw new TwoBotAIError(
            `Monthly credit limit reached. Limit: ${creditCheck.planLimit}, Used: ${creditCheck.monthlyUsed}`,
            "PLAN_LIMIT_EXCEEDED",
            402
          );
        }
        throw new TwoBotAIError(
          `Insufficient credits. Minimum required: ${minCost}, Available: ${creditCheck.balance}`,
          "INSUFFICIENT_CREDITS",
          402
        );
      }
    }

    // Transcribe
    const response = await openaiSpeechRecognition(request);

    // Deduct credits based on actual duration
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      capability: "speech-recognition" as const,
      model,
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
function estimateTokens(messages: { content: string }[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(totalChars / 4);
}
