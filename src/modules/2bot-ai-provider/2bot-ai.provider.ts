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

import { logger, type Logger } from "@/lib/logger";
import { twoBotAICreditService } from "@/modules/credits";
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
import { recordModelFailure, recordModelSuccess } from "./model-health-tracker";
import type { SmartRoutingResult } from "./model-router";
import { getSmartRoutingDecision, validateModelAvailable } from "./model-router";
import {
  getAutoFallbackChain,
  getAvailableModels,
  getConfiguredProviders,
  getModelIfAvailable,
  getProvidersStatus,
  isProviderConfigured
} from "./provider-config";
import {
  getProviderAdapter,
  getProviderEntry,
} from "./provider-registry";
import { withRetry } from "./retry.util";
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
// Private Helpers — Shared Pipeline Steps
// ===========================================

/**
 * Result of the pre-call preparation phase (model resolution + routing).
 */
interface TextGenPrep {
  request: TextGenerationRequest;
  provider: TwoBotAIProvider;
  resolution: ModelResolutionResult | null;
  routingResult: SmartRoutingResult | null;
  originalModel: TwoBotAIModel;
  /** Ranked fallback models for "auto" mode (cheapest first, excluding the primary) */
  autoFallbackChain: ModelInfo[];
}

/**
 * Shared pre-call pipeline for textGeneration and textGenerationStream.
 * Resolves 2Bot model IDs, validates availability, applies smart routing,
 * and determines the target provider.
 */
function prepareTextGeneration(
  request: TextGenerationRequest,
  log: Logger,
  logSuffix = "",
): TextGenPrep {
  const originalModel = request.model;

  // 🔄 "auto" → cheapest available model for this capability (with fallback chain)
  let autoFallbackChain: ModelInfo[] = [];
  if (request.model === "auto") {
    const chain = getAutoFallbackChain("text-generation");
    if (chain.length === 0) {
      throw new TwoBotAIError("No text-generation models available", "MODEL_UNAVAILABLE", 503);
    }
    const cheapest = chain[0]!;
    autoFallbackChain = chain.slice(1); // remaining models for failover
    log.info({ resolvedModel: cheapest.id, fallbackCount: autoFallbackChain.length }, `⚡ Auto mode: using cheapest available model${logSuffix}`);
    request = { ...request, model: cheapest.id as TwoBotAIModel };
  }

  // 🔄 Resolve 2Bot AI model IDs to provider models (with failover support)
  let resolution: ModelResolutionResult | null = null;
  if (isTwoBotAIModelId(request.model as string)) {
    try {
      resolution = resolveTwoBotAIModel(request.model as TwoBotAIModelId, request.routingPreference);
      log.info({
        twobotModel: request.model,
        resolvedProvider: resolution.provider,
        resolvedModel: resolution.providerModelId,
        fallbackCount: resolution.fallbackOptions.length,
      }, `🔄 Resolved 2Bot AI model${logSuffix}`);
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

  // 🧠 Smart Model Routing — only for legacy provider models (not 2Bot catalog models)
  const smartRoutingEnabled = request.smartRouting !== false && !resolution;
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
      }, `🧠 Smart routing${logSuffix}: using cheaper model`);
      request = { ...request, model: routingResult.model as TwoBotAIModel };
    } else {
      log.debug({
        model: routingResult.model,
        complexity: routingResult.complexity,
        reason: routingResult.reason,
      }, "Smart routing: no change needed");
    }
  } else if (resolution) {
    log.debug({ model: originalModel }, "Smart routing skipped: model resolved via 2Bot catalog");
  } else {
    log.debug({ model: originalModel }, "Smart routing disabled, using selected model");
  }

  // Determine provider from the (possibly routed) model
  const modelInfo = getModelIfAvailable(request.model);
  if (!modelInfo) {
    throw new TwoBotAIError(
      `Model "${request.model}" is not available. Check API configuration.`,
      "MODEL_UNAVAILABLE",
      400
    );
  }

  return {
    request,
    provider: modelInfo.provider,
    resolution,
    routingResult,
    originalModel: originalModel as TwoBotAIModel,
    autoFallbackChain,
  };
}

/**
 * Check that the user/org has enough credits for an estimated cost.
 * Throws TwoBotAIError if credits are insufficient.
 */
async function ensureCredits(
  userId: string,
  organizationId: string | undefined,
  estimatedCost: number,
): Promise<void> {
  if (organizationId) {
    const creditCheck = await twoBotAICreditService.checkOrgCredits(
      organizationId,
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
      userId,
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
}

/**
 * Safely deduct credits after a successful API call.
 * Logs errors but does not throw — the AI response was already sent/streamed.
 */
async function safeDeductCredits(
  organizationId: string | undefined,
  usageData: {
    userId: string;
    gatewayId: undefined;
    userPluginId?: string;
    capability: "text-generation" | "code-generation";
    model: string;
    source: "2bot";
    inputTokens: number;
    outputTokens: number;
    feature?: string;
    provider?: string;
  },
  log: Logger,
): Promise<{ creditsUsed: number; newBalance: number; walletType: string } | null> {
  try {
    return organizationId
      ? await twoBotAICreditService.deductOrgCredits(organizationId, usageData)
      : await twoBotAICreditService.deductPersonalCredits(usageData);
  } catch (error) {
    log.error({
      userId: usageData.userId,
      organizationId,
      model: usageData.model,
      inputTokens: usageData.inputTokens,
      outputTokens: usageData.outputTokens,
      error: error instanceof Error ? error.message : String(error),
    }, "Credit deduction failed after successful API call — revenue reconciliation needed");
    return null;
  }
}

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
    
    // Return all available models — isAvailable flag is the source of truth for catalog display.
    // Resolution failures are surfaced at inference time, not at discovery time.
    return models
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

    // Resolve model, validate, and apply smart routing
    const prep = prepareTextGeneration(request, log);
    request = prep.request;
    const { provider, resolution, routingResult, originalModel, autoFallbackChain } = prep;

    // 💾 Check cache + estimate credits in parallel (saves one sequential round-trip)
    const estimatedTokens = estimateTokens(request.messages);
    const [cachedResponse, estimatedCost] = await Promise.all([
      aiCacheService.get(originalModel, request.messages, request.conversationId),
      twoBotAICreditService.calculateCreditsByCapability(
        "text-generation",
        request.model,
        { inputTokens: estimatedTokens, outputTokens: estimatedTokens }
      ),
    ]);

    if (cachedResponse) {
      log.info({ model: request.model }, "Cache hit! Returning cached response (FREE)");
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

    // Ensure user has sufficient credits
    await ensureCredits(request.userId, request.organizationId, estimatedCost);

    // Make the request (with provider failover for 2Bot AI models)
    let response!: TextGenerationResponse;
    let usedProvider: TwoBotAIProvider = provider;
    const callProviderAdapter = async (p: TwoBotAIProvider, req: TextGenerationRequest): Promise<TextGenerationResponse> => {
      const adapter = getProviderAdapter(p, "textGeneration");
      if (!adapter) throw new TwoBotAIError(`Provider ${p} does not support text generation`, "PROVIDER_ERROR", 500);
      return withRetry(() => adapter(req), { maxRetries: 2, operationName: `${p}-text-generation` });
    };

    if (resolution) {
      let currentResolution: ModelResolutionResult | null = resolution;
      let currentProvider = provider;
      let currentModel = request.model;

      while (true) {
        try {
          response = await callProviderAdapter(currentProvider, { ...request, model: currentModel });
          recordModelSuccess(currentModel);
          request = { ...request, model: currentModel };
          usedProvider = currentProvider;
          break;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          recordModelFailure(currentModel, error.message);
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
          throw err;
        }
      }
    } else if (autoFallbackChain.length > 0) {
      // "auto" mode: try primary model, then failover through chain
      let currentProvider = provider;
      let currentModel = request.model;
      let lastError: Error | undefined;

      // Try primary model first
      try {
        response = await callProviderAdapter(currentProvider, request);
        recordModelSuccess(currentModel);
        usedProvider = currentProvider;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        recordModelFailure(currentModel, lastError.message);
        log.warn({ failedModel: currentModel, error: lastError.message }, "⚠️ Auto primary model failed, trying fallbacks");

        // Try each fallback in order
        let succeeded = false;
        for (const fallback of autoFallbackChain) {
          try {
            currentProvider = fallback.provider;
            currentModel = fallback.id;
            response = await callProviderAdapter(currentProvider, { ...request, model: currentModel });
            recordModelSuccess(currentModel);
            request = { ...request, model: currentModel };
            log.info({ fallbackModel: currentModel, fallbackProvider: currentProvider }, "✅ Auto fallback succeeded");
            usedProvider = currentProvider;
            succeeded = true;
            break;
          } catch (fallbackErr) {
            lastError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
            recordModelFailure(currentModel, lastError.message);
            log.warn({ failedModel: currentModel, error: lastError.message }, "⚠️ Auto fallback also failed");
          }
        }
        if (!succeeded) {
          throw lastError!;
        }
      }
    } else {
      response = await callProviderAdapter(provider, request);
    }

    // 💾 Cache the response
    if (process.env.AI_CACHE_ENABLED !== "false") {
      await aiCacheService.set(originalModel, request.messages, response.content, { conversationId: request.conversationId });
    }

    // Deduct credits
    const deduction = await safeDeductCredits(
      request.organizationId,
      {
        userId: request.userId,
        gatewayId: undefined,
        userPluginId: request.userPluginId,
        capability: (request.capability || "text-generation") as "text-generation" | "code-generation",
        model: request.model,
        source: "2bot",
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        feature: request.feature,
        provider: usedProvider,
      },
      log
    );
    if (deduction) {
      response.creditsUsed = deduction.creditsUsed;
      response.newBalance = deduction.newBalance;
    }

    log.info({
      userId: request.userId,
      model: request.model,
      originalModel: routingResult?.wasRouted ? originalModel : undefined,
      smartRouted: routingResult?.wasRouted || false,
      complexity: routingResult?.complexity,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      creditsUsed: response.creditsUsed,
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

    // Resolve model, validate, and apply smart routing
    const prep = prepareTextGeneration(request, log, " (stream)");
    request = prep.request;
    const { provider, resolution, originalModel, autoFallbackChain } = prep;

    // 💾 Check cache + estimate credits in parallel
    const estimatedTokens = estimateTokens(request.messages);
    const [cachedResponse, estimatedCost] = await Promise.all([
      process.env.AI_CACHE_ENABLED !== "false"
        ? aiCacheService.get(originalModel, request.messages, request.conversationId)
        : Promise.resolve(null),
      twoBotAICreditService.calculateCreditsByCapability(
        "text-generation",
        request.model,
        { inputTokens: estimatedTokens, outputTokens: estimatedTokens }
      ),
    ]);

    if (cachedResponse) {
      log.info({ model: request.model }, "Cache hit! Returning cached response (FREE)");
      yield { id: `cached_${Date.now()}`, delta: cachedResponse, finishReason: "stop" };

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

    // Ensure user has sufficient credits
    await ensureCredits(request.userId, request.organizationId, estimatedCost);

    // Stream the response (with provider failover for 2Bot AI models)
    let lastChunk: TextGenerationStreamChunk | undefined;
    let content = "";
    let usage!: { inputTokens: number; outputTokens: number };
    let usedProvider: TwoBotAIProvider = provider;

    if (resolution) {
      let currentResolution: ModelResolutionResult | null = resolution;
      let currentProvider = provider;
      let currentModel = request.model;
      let chunksYielded = false;

      while (true) {
        try {
          const streamAdapter = getProviderAdapter(currentProvider, "textGenerationStream");
          if (!streamAdapter) {
            throw new TwoBotAIError(`Provider ${currentProvider} does not support text generation streaming`, "PROVIDER_ERROR", 500);
          }
          const generator = streamAdapter({ ...request, model: currentModel });
          let result: IteratorResult<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }>;

          while (!(result = await generator.next()).done) {
            lastChunk = result.value;
            content += lastChunk.delta;
            chunksYielded = true;
            yield lastChunk;
          }

          usage = result.value;
          recordModelSuccess(currentModel);
          request = { ...request, model: currentModel };
          usedProvider = currentProvider;
          break;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          recordModelFailure(currentModel, error.message);

          // Can only failover if no chunks have been sent to the client yet
          if (!chunksYielded && currentResolution) {
            const next = twoBotAIModelResolver.getNextFallback(currentResolution);
            if (next) {
              log.warn({
                failedProvider: currentProvider,
                failedModel: currentModel,
                error: error.message,
                nextProvider: next.provider,
                nextModel: next.providerModelId,
                remainingFallbacks: next.fallbackOptions.length,
              }, "⚠️ Stream provider failed before data sent, trying fallback");
              currentResolution = next;
              currentProvider = next.provider as TwoBotAIProvider;
              currentModel = next.providerModelId as TwoBotAIModel;
              continue;
            }
          }
          throw err;
        }
      }
    } else if (autoFallbackChain.length > 0) {
      // "auto" mode streaming: try primary, then failover through chain (only before first chunk)
      const tryStreamModel = async function* (p: TwoBotAIProvider, model: TwoBotAIModel) {
        const streamAdapter = getProviderAdapter(p, "textGenerationStream");
        if (!streamAdapter) {
          throw new TwoBotAIError(`Provider ${p} does not support text generation streaming`, "PROVIDER_ERROR", 500);
        }
        const generator = streamAdapter({ ...request, model });
        let result: IteratorResult<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }>;
        while (!(result = await generator.next()).done) {
          yield { chunk: result.value, done: false as const };
        }
        yield { usage: result.value, done: true as const };
      };

      // Try primary model first
      let succeeded = false;
      const modelsToTry: Array<{ provider: TwoBotAIProvider; model: TwoBotAIModel }> = [
        { provider, model: request.model },
        ...autoFallbackChain.map((m) => ({ provider: m.provider, model: m.id })),
      ];

      for (const candidate of modelsToTry) {
        try {
          const stream = tryStreamModel(candidate.provider, candidate.model);
          for await (const frame of stream) {
            if (frame.done) {
              usage = frame.usage;
            } else {
              lastChunk = frame.chunk;
              content += lastChunk.delta;
              yield lastChunk;
            }
          }
          recordModelSuccess(candidate.model);
          request = { ...request, model: candidate.model };
          usedProvider = candidate.provider;
          succeeded = true;
          if (candidate.model !== modelsToTry[0]!.model) {
            log.info({ fallbackModel: candidate.model, fallbackProvider: candidate.provider }, "✅ Auto stream fallback succeeded");
          }
          break;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          recordModelFailure(candidate.model, error.message);
          // Can only failover if no chunks sent yet
          if (content.length > 0) {
            throw err; // Already sent data to client, can't switch
          }
          log.warn({ failedModel: candidate.model, error: error.message }, "⚠️ Auto stream model failed, trying next");
        }
      }
      if (!succeeded) {
        throw new TwoBotAIError("All available models failed. Please try again later.", "MODEL_UNAVAILABLE", 503);
      }
    } else {
      const streamAdapter = getProviderAdapter(provider, "textGenerationStream");
      if (!streamAdapter) {
        throw new TwoBotAIError(`Provider ${provider} does not support text generation streaming`, "PROVIDER_ERROR", 500);
      }
      const generator = streamAdapter(request);
      let result: IteratorResult<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }>;

      while (!(result = await generator.next()).done) {
        lastChunk = result.value;
        content += lastChunk.delta;
        yield lastChunk;
      }
      usage = result.value;
    }

    // 💾 Cache the full response
    if (process.env.AI_CACHE_ENABLED !== "false") {
      await aiCacheService.set(originalModel, request.messages, content, { conversationId: request.conversationId });
    }

    // Deduct credits
    const deduction = await safeDeductCredits(
      request.organizationId,
      {
        userId: request.userId,
        gatewayId: undefined,
        userPluginId: request.userPluginId,
        capability: (request.capability || "text-generation") as "text-generation" | "code-generation",
        model: request.model,
        source: "2bot",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        feature: request.feature,
        provider: usedProvider,
      },
      log
    );

    log.info({
      userId: request.userId,
      organizationId: request.organizationId,
      model: request.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      creditsUsed: deduction?.creditsUsed,
      walletType: deduction?.walletType,
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
      creditsUsed: deduction?.creditsUsed ?? 0,
      newBalance: deduction?.newBalance ?? 0,
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
    let resolution: ModelResolutionResult | null = null;
    let requestModel = request.model || "auto";

    // ⚡ "auto" → cheapest available image model (with fallback chain)
    let autoFallbackChain: ModelInfo[] = [];
    if (requestModel === "auto") {
      const chain = getAutoFallbackChain("image-generation");
      if (chain.length === 0) {
        throw new TwoBotAIError("No image generation models available", "MODEL_UNAVAILABLE", 503);
      }
      const cheapest = chain[0]!;
      autoFallbackChain = chain.slice(1);
      requestModel = cheapest.id;
      log.info({ resolvedModel: cheapest.id, fallbackCount: autoFallbackChain.length }, "⚡ Auto mode: using cheapest image model");
    }

    if (isTwoBotAIModelId(requestModel)) {
      // 2Bot model ID — use resolver to find best available provider
      try {
        resolution = resolveTwoBotAIModel(requestModel as TwoBotAIModelId, request.routingPreference);
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
      // Infer provider from model ID format
      if (requestModel.startsWith("accounts/fireworks/models/")) {
        provider = "fireworks";
        providerModelId = requestModel;
      } else if (requestModel.includes("/")) {
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

    // Generate image (with provider failover for 2Bot AI models)
    let response!: ImageGenerationResponse;

    const callImageAdapter = async (p: TwoBotAIProvider, modelId: string): Promise<ImageGenerationResponse> => {
      const imageAdapter = getProviderAdapter(p, "imageGeneration");
      if (!imageAdapter) {
        throw new TwoBotAIError(`Provider ${p} does not support image generation`, "PROVIDER_ERROR", 500);
      }
      return imageAdapter({ ...request, model: modelId });
    };

    if (resolution) {
      // 2Bot AI model: try with automatic failover across providers
      let currentResolution: ModelResolutionResult | null = resolution;
      let currentProvider = provider;
      let currentModel = providerModelId;

      while (true) {
        try {
          response = await callImageAdapter(currentProvider, currentModel);
          recordModelSuccess(currentModel);
          // Update for billing/logging
          providerModelId = currentModel;
          provider = currentProvider;
          break;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          recordModelFailure(currentModel, error.message);

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
              }, "⚠️ Image provider failed, trying fallback");
              currentResolution = next;
              currentProvider = next.provider as TwoBotAIProvider;
              currentModel = next.providerModelId;
              continue;
            }
          }

          // No more fallbacks — re-throw
          throw err;
        }
      }
    } else if (autoFallbackChain.length > 0) {
      // "auto" mode: try primary model, then failover through chain
      let lastError: Error | undefined;
      try {
        response = await callImageAdapter(provider, providerModelId);
        recordModelSuccess(providerModelId);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        recordModelFailure(providerModelId, lastError.message);
        log.warn({ failedModel: providerModelId, error: lastError.message }, "⚠️ Auto primary image model failed, trying fallbacks");

        let succeeded = false;
        for (const fallback of autoFallbackChain) {
          try {
            response = await callImageAdapter(fallback.provider, fallback.id);
            recordModelSuccess(fallback.id);
            providerModelId = fallback.id;
            provider = fallback.provider;
            log.info({ fallbackModel: fallback.id, fallbackProvider: fallback.provider }, "✅ Auto image fallback succeeded");
            succeeded = true;
            break;
          } catch (fallbackErr) {
            lastError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
            recordModelFailure(fallback.id, lastError.message);
            log.warn({ failedModel: fallback.id, error: lastError.message }, "⚠️ Auto image fallback also failed");
          }
        }
        if (!succeeded) {
          throw lastError!;
        }
      }
    } else {
      // Raw provider model: single attempt (existing behavior)
      response = await callImageAdapter(provider, providerModelId);
    }

    // Deduct credits based on context
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      userPluginId: request.userPluginId,
      capability: "image-generation" as const,
      model: providerModelId,
      source: "2bot" as const,
      imageCount: response.images.length,
      provider,
    };

    try {
      const deduction = request.organizationId
        ? await twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
        : await twoBotAICreditService.deductPersonalCredits(usageData);

      response.creditsUsed = deduction.creditsUsed;
      response.newBalance = deduction.newBalance;
    } catch (deductionError) {
      log.error({
        userId: request.userId,
        organizationId: request.organizationId,
        model: providerModelId,
        imageCount: response.images.length,
        error: deductionError instanceof Error ? deductionError.message : String(deductionError),
      }, "Credit deduction failed after image generation — revenue reconciliation needed");
    }

    log.info({
      userId: request.userId,
      organizationId: request.organizationId,
      twobotModel: requestModel,
      resolvedProvider: provider,
      resolvedModel: providerModelId,
      imageCount: response.images.length,
      creditsUsed: response.creditsUsed,
      walletType: request.organizationId ? "organization" : "personal",
    }, "2Bot AI image generated");

    return response;
  },

  /**
   * Speech synthesis (text-to-speech)
   * 
   * Uses model resolver to route to the best available provider.
   * Currently only OpenAI supports speech-synthesis.
   * If no speech-synthesis provider is configured, throws a clear error.
   */
  async speechSynthesis(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "speech-synthesis" });

    // Resolve 2Bot model ID to provider model
    let providerModelId: string;
    let provider: TwoBotAIProvider;
    let requestModel = request.model || "auto";

    // ⚡ "auto" → cheapest available voice model (with fallback chain)
    let autoFallbackChain: ModelInfo[] = [];
    if (requestModel === "auto") {
      const chain = getAutoFallbackChain("speech-synthesis");
      if (chain.length === 0) {
        throw new TwoBotAIError("No speech-synthesis models available", "MODEL_UNAVAILABLE", 503);
      }
      const cheapest = chain[0]!;
      autoFallbackChain = chain.slice(1);
      requestModel = cheapest.id;
      log.info({ resolvedModel: cheapest.id, fallbackCount: autoFallbackChain.length }, "⚡ Auto mode: using cheapest voice model");
    }

    if (isTwoBotAIModelId(requestModel)) {
      try {
        const resolution = resolveTwoBotAIModel(requestModel as TwoBotAIModelId);
        providerModelId = resolution.providerModelId;
        provider = resolution.provider;
        log.info({
          twobotModel: requestModel,
          resolvedProvider: provider,
          resolvedModel: providerModelId,
        }, "Speech-synthesis model resolved via catalog");
      } catch {
        throw new TwoBotAIError(
          "Text-to-speech is not currently available. No speech-synthesis provider is configured.",
          "MODEL_UNAVAILABLE",
          503
        );
      }
    } else {
      // Raw model ID — assume OpenAI for speech-synthesis models
      providerModelId = requestModel;
      provider = "openai";
      if (!isProviderConfigured("openai")) {
        throw new TwoBotAIError(
          "Text-to-speech is not currently available. No speech-synthesis provider is configured.",
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

    // Generate speech using the resolved provider model (with auto failover)
    let response!: SpeechSynthesisResponse;

    const callSpeechAdapter = async (p: TwoBotAIProvider, modelId: string): Promise<SpeechSynthesisResponse> => {
      const adapter = getProviderAdapter(p, "speechSynthesis");
      if (!adapter) {
        throw new TwoBotAIError(
          `Provider ${getProviderEntry(p).displayName} does not support speech synthesis`,
          "PROVIDER_ERROR",
          500
        );
      }
      return adapter({ ...request, model: modelId });
    };

    if (autoFallbackChain.length > 0) {
      // "auto" mode: try primary, then failover through chain
      let lastError: Error | undefined;
      try {
        response = await callSpeechAdapter(provider, providerModelId);
        recordModelSuccess(providerModelId);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        recordModelFailure(providerModelId, lastError.message);
        log.warn({ failedModel: providerModelId, error: lastError.message }, "⚠️ Auto primary speech model failed, trying fallbacks");

        let succeeded = false;
        for (const fallback of autoFallbackChain) {
          try {
            response = await callSpeechAdapter(fallback.provider, fallback.id);
            recordModelSuccess(fallback.id);
            providerModelId = fallback.id;
            provider = fallback.provider;
            log.info({ fallbackModel: fallback.id, fallbackProvider: fallback.provider }, "✅ Auto speech fallback succeeded");
            succeeded = true;
            break;
          } catch (fallbackErr) {
            lastError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
            recordModelFailure(fallback.id, lastError.message);
            log.warn({ failedModel: fallback.id, error: lastError.message }, "⚠️ Auto speech fallback also failed");
          }
        }
        if (!succeeded) {
          throw lastError!;
        }
      }
    } else {
      response = await callSpeechAdapter(provider, providerModelId);
    }

    // Deduct credits based on context
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      userPluginId: request.userPluginId,
      capability: "speech-synthesis" as const,
      model: providerModelId,
      source: "2bot" as const,
      characterCount: response.characterCount,
      provider,
    };

    try {
      const deduction = request.organizationId
        ? await twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
        : await twoBotAICreditService.deductPersonalCredits(usageData);

      response.creditsUsed = deduction.creditsUsed;
      response.newBalance = deduction.newBalance;
    } catch (deductionError) {
      log.error({
        userId: request.userId,
        organizationId: request.organizationId,
        model: providerModelId,
        characterCount: response.characterCount,
        error: deductionError instanceof Error ? deductionError.message : String(deductionError),
      }, "Credit deduction failed after speech-synthesis — revenue reconciliation needed");
    }

    log.info({
      userId: request.userId,
      organizationId: request.organizationId,
      twobotModel: requestModel,
      resolvedModel: providerModelId,
      characterCount: response.characterCount,
      creditsUsed: response.creditsUsed,
      walletType: request.organizationId ? "organization" : "personal",
    }, "2Bot AI speech-synthesis completed");

    return response;
  },

  /**
   * Speech recognition (speech-to-text)
   * 
   * Uses model resolver to route to the best available provider.
   * Currently only OpenAI supports speech-recognition (Whisper).
   * If no speech-recognition provider is configured, throws a clear error.
   */
  async speechRecognition(request: SpeechRecognitionRequest): Promise<SpeechRecognitionResponse> {
    const log = logger.child({ module: "2bot-ai-provider", capability: "speech-recognition" });

    // Resolve 2Bot model ID to provider model
    let providerModelId: string;
    let provider: TwoBotAIProvider;
    let requestModel = request.model || "auto";

    // ⚡ "auto" → cheapest available transcription model (with fallback chain)
    let autoFallbackChain: ModelInfo[] = [];
    if (requestModel === "auto") {
      const chain = getAutoFallbackChain("speech-recognition");
      if (chain.length === 0) {
        throw new TwoBotAIError("No speech-recognition models available", "MODEL_UNAVAILABLE", 503);
      }
      const cheapest = chain[0]!;
      autoFallbackChain = chain.slice(1);
      requestModel = cheapest.id;
      log.info({ resolvedModel: cheapest.id, fallbackCount: autoFallbackChain.length }, "⚡ Auto mode: using cheapest transcription model");
    }

    if (isTwoBotAIModelId(requestModel)) {
      try {
        const resolution = resolveTwoBotAIModel(requestModel as TwoBotAIModelId);
        providerModelId = resolution.providerModelId;
        provider = resolution.provider;
        log.info({
          twobotModel: requestModel,
          resolvedProvider: provider,
          resolvedModel: providerModelId,
        }, "Speech-recognition model resolved via catalog");
      } catch {
        throw new TwoBotAIError(
          "Speech-to-text is not currently available. No speech-recognition provider is configured.",
          "MODEL_UNAVAILABLE",
          503
        );
      }
    } else {
      // Raw model ID — assume OpenAI for speech-recognition models
      providerModelId = requestModel;
      provider = "openai";
      if (!isProviderConfigured("openai")) {
        throw new TwoBotAIError(
          "Speech-to-text is not currently available. No speech-recognition provider is configured.",
          "MODEL_UNAVAILABLE",
          503
        );
      }
    }

    // For speech-recognition, we can't estimate duration beforehand
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

    // Transcribe using the resolved provider model (with auto failover)
    let response!: SpeechRecognitionResponse;

    const callTranscribeAdapter = async (p: TwoBotAIProvider, modelId: string): Promise<SpeechRecognitionResponse> => {
      const adapter = getProviderAdapter(p, "speechRecognition");
      if (!adapter) {
        throw new TwoBotAIError(
          `Provider ${getProviderEntry(p).displayName} does not support speech recognition`,
          "PROVIDER_ERROR",
          500
        );
      }
      return adapter({ ...request, model: modelId });
    };

    if (autoFallbackChain.length > 0) {
      // "auto" mode: try primary, then failover through chain
      let lastError: Error | undefined;
      try {
        response = await callTranscribeAdapter(provider, providerModelId);
        recordModelSuccess(providerModelId);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        recordModelFailure(providerModelId, lastError.message);
        log.warn({ failedModel: providerModelId, error: lastError.message }, "⚠️ Auto primary transcription model failed, trying fallbacks");

        let succeeded = false;
        for (const fallback of autoFallbackChain) {
          try {
            response = await callTranscribeAdapter(fallback.provider, fallback.id);
            recordModelSuccess(fallback.id);
            providerModelId = fallback.id;
            provider = fallback.provider;
            log.info({ fallbackModel: fallback.id, fallbackProvider: fallback.provider }, "✅ Auto transcription fallback succeeded");
            succeeded = true;
            break;
          } catch (fallbackErr) {
            lastError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
            recordModelFailure(fallback.id, lastError.message);
            log.warn({ failedModel: fallback.id, error: lastError.message }, "⚠️ Auto transcription fallback also failed");
          }
        }
        if (!succeeded) {
          throw lastError!;
        }
      }
    } else {
      response = await callTranscribeAdapter(provider, providerModelId);
    }

    // Deduct credits based on actual duration
    const usageData = {
      userId: request.userId,
      gatewayId: undefined,
      userPluginId: request.userPluginId,
      capability: "speech-recognition" as const,
      model: providerModelId,
      source: "2bot" as const,
      audioSeconds: Math.ceil(response.duration),
      provider,
    };

    try {
      const deduction = request.organizationId
        ? await twoBotAICreditService.deductOrgCredits(request.organizationId, usageData)
        : await twoBotAICreditService.deductPersonalCredits(usageData);

      response.creditsUsed = deduction.creditsUsed;
      response.newBalance = deduction.newBalance;
    } catch (deductionError) {
      log.error({
        userId: request.userId,
        organizationId: request.organizationId,
        model: providerModelId,
        audioSeconds: Math.ceil(response.duration),
        error: deductionError instanceof Error ? deductionError.message : String(deductionError),
      }, "Credit deduction failed after speech-recognition — revenue reconciliation needed");
    }

    log.info({
      userId: request.userId,
      organizationId: request.organizationId,
      twobotModel: requestModel,
      resolvedModel: providerModelId,
      duration: response.duration,
      creditsUsed: response.creditsUsed,
      walletType: request.organizationId ? "organization" : "personal",
    }, "2Bot AI speech-recognition completed");

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
