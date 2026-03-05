/**
 * Dynamic Provider Configuration
 *
 * Detects which AI providers are configured and available.
 * Uses model-discovery.service.ts for dynamic model detection.
 *
 * Flow:
 * 1. On startup, discoverAllModels() queries provider APIs
 * 2. provider-health.service validates API keys with real calls
 * 3. getAvailableModels() returns only validated, discovered models
 *
 * @module modules/2bot-ai-provider/provider-config
 */

import { logger } from "@/lib/logger";
import { type AICapability } from "./ai-capabilities";
import { getDiscoveredModels, hasDiscoveredModels } from "./model-discovery.service";
import { getProviderModelIds, getRegistryEntriesByProvider, registryToModelInfo } from "./model-registry";
import {
  getAllProviders,
  getConfiguredProvidersForCapability,
  getProviderEntry,
  getProviderFeatures,
  isProviderKeyValid,
} from "./provider-registry";
import type { ModelInfo, TwoBotAIProvider } from "./types";

const log = logger.child({ module: "provider-config" });

// ===========================================
// Provider Validation Cache
// ===========================================

// Cache for validated providers (set by health service)
const validatedProviders = new Map<TwoBotAIProvider, boolean>();

/**
 * Mark a provider as validated (called by health service after real check)
 */
export function setProviderValidated(provider: TwoBotAIProvider, isValid: boolean): void {
  validatedProviders.set(provider, isValid);
  invalidateModelCache();
  log.info({ provider, isValid }, "Provider validation status updated");
}

/**
 * Check if provider has been validated by health service
 */
export function isProviderValidated(provider: TwoBotAIProvider): boolean | undefined {
  return validatedProviders.get(provider);
}

// ===========================================
// Environment-based Provider Detection
// ===========================================

/**
 * Check if a provider has a valid API key configured
 *
 * This does a basic format check for quick responses.
 * For real validation (actual API call), use provider-health.service.ts
 *
 * Logic:
 * 1. If provider was validated by health service, use that result (true/false)
 * 2. Otherwise, fall back to basic format check from provider-registry
 */
export function isProviderConfigured(provider: TwoBotAIProvider): boolean {
  // Check if health service has validated this provider
  const validated = isProviderValidated(provider);
  if (validated !== undefined) {
    return validated;
  }

  // Fall back to registry-based format check (prefix, length, placeholder detection)
  const entry = getProviderEntry(provider);
  if (!entry) return false;

  const valid = isProviderKeyValid(provider);
  if (!valid) {
    log.debug(`${entry.displayName}: API key missing, invalid format, or placeholder`);
  }
  return valid;
}

/**
 * Get list of all configured providers (derived from registry)
 */
export function getConfiguredProviders(): TwoBotAIProvider[] {
  const providers: TwoBotAIProvider[] = [];

  for (const provider of getAllProviders()) {
    const entry = getProviderEntry(provider);
    if (isProviderConfigured(provider)) {
      providers.push(provider);
      log.info(`${entry.displayName} provider is configured and ready`);
    } else {
      log.warn(`${entry.displayName} provider NOT configured - ${entry.envVar} missing or invalid`);
    }
  }

  return providers;
}

// ===========================================
// Model Cache (invalidated on provider/discovery changes)
// ===========================================

let cachedAllModels: ModelInfo[] | null = null;

/**
 * Invalidate the model cache.
 * Called automatically when provider validation status changes
 * or when model discovery completes.
 */
export function invalidateModelCache(): void {
  cachedAllModels = null;
}

/**
 * Build the full (unfiltered) model list with isDefault set.
 * Only called on cache miss.
 */
function buildModelList(): ModelInfo[] {
  let models: ModelInfo[];

  if (hasDiscoveredModels()) {
    models = getDiscoveredModels();
    log.debug({ count: models.length }, "Using dynamically discovered models");
  } else {
    // Fallback to static list (before discovery runs)
    const configuredProviders = getConfiguredProviders();
    if (configuredProviders.length === 0) {
      log.error("No AI providers configured! Check TWOBOT_OPENAI_API_KEY or TWOBOT_ANTHROPIC_API_KEY");
      return [];
    }
    models = configuredProviders.flatMap((provider) =>
      getRegistryEntriesByProvider(provider).map((e) => registryToModelInfo(e, provider)),
    );
    log.debug({ count: models.length }, "Using static model list (discovery not yet run)");
  }

  // Set default model (first available text-generation model, preferring cheaper)
  const chatModels = models.filter((m) =>
    m.capability === "text-generation" && !m.deprecated
  );
  if (chatModels.length > 0) {
    chatModels.sort((a, b) => (a.tier || 99) - (b.tier || 99));
    const defaultModelId = chatModels[0]?.id;
    if (defaultModelId) {
      models = models.map((m) => ({
        ...m,
        isDefault: m.id === defaultModelId,
      }));
    }
  }

  log.debug(
    {
      availableModels: models.map((m) => m.id),
      source: hasDiscoveredModels() ? "discovered" : "static",
    },
    "Available models (cache built)"
  );

  return models;
}

// ===========================================
// Dynamic Model Access
// ===========================================

/**
 * Get only models from configured providers.
 * Results are cached and invalidated automatically when provider
 * status or model discovery changes.
 *
 * @param capability - Optional filter by capability
 */
export function getAvailableModels(capability?: AICapability): ModelInfo[] {
  if (!cachedAllModels) {
    cachedAllModels = buildModelList();
  }

  return capability
    ? cachedAllModels.filter((m) => m.capability === capability)
    : cachedAllModels;
}

/**
 * Get cheapest available model for a given capability
 * @param capability - AI capability (text-generation, image-generation, etc.)
 */
export function getCheapestModel(capability: AICapability = "text-generation"): ModelInfo | undefined {
  const models = getAvailableModels(capability);
  if (models.length === 0) return undefined;

  // Sort by tier (lowest = cheapest)
  return models.sort((a, b) => (a.tier || 99) - (b.tier || 99))[0];
}

/**
 * Get default model (cheapest available text-generation model)
 */
export function getDefaultModel(): ModelInfo | undefined {
  return getAvailableModels("text-generation").find((m) => m.isDefault);
}

/**
 * Check if a specific model is available
 */
export function isModelAvailable(modelId: string): boolean {
  return getAvailableModels().some((m) => m.id === modelId);
}

/**
 * Get model info if available, undefined if not configured
 */
export function getModelIfAvailable(modelId: string): ModelInfo | undefined {
  return getAvailableModels().find((m) => m.id === modelId);
}

// ===========================================
// Feature Availability Helpers
// ===========================================

/**
 * Check if image generation is available (any configured provider with image-generation capability)
 */
export function isImageGenerationAvailable(): boolean {
  return getConfiguredProvidersForCapability("image-generation", isProviderConfigured).length > 0;
}

/**
 * Check if speech synthesis (text-to-speech) is available
 */
export function isSpeechSynthesisAvailable(): boolean {
  return getConfiguredProvidersForCapability("speech-synthesis", isProviderConfigured).length > 0;
}

/**
 * Check if speech recognition (speech-to-text) is available
 */
export function isSpeechRecognitionAvailable(): boolean {
  return getConfiguredProvidersForCapability("speech-recognition", isProviderConfigured).length > 0;
}

/**
 * Check if vision/image analysis is available for a model
 */
export function isVisionAvailable(modelId?: string): boolean {
  if (!modelId) {
    // Check if any available model supports vision
    return getAvailableModels("text-generation").some(
      (m) => m.capabilities?.canAnalyzeImages
    );
  }
  const model = getModelIfAvailable(modelId);
  return model?.capabilities?.canAnalyzeImages ?? false;
}

/**
 * Get available features based on which providers are configured.
 *
 * Derives everything from the provider registry — no hardcoded provider checks.
 * Adding a new provider with new capabilities automatically updates this.
 */
export function getAvailableFeatures(): {
  textGeneration: boolean;
  imageGeneration: boolean;
  imageAnalysis: boolean;
  speechSynthesis: boolean;
  speechRecognition: boolean;
} {
  const hasCapability = (cap: AICapability) =>
    getConfiguredProvidersForCapability(cap, isProviderConfigured).length > 0;

  return {
    textGeneration: hasCapability("text-generation"),
    imageGeneration: hasCapability("image-generation"),
    imageAnalysis: hasCapability("image-understanding"),
    speechSynthesis: hasCapability("speech-synthesis"),
    speechRecognition: hasCapability("speech-recognition"),
  };
}

// ===========================================
// Provider Status (for API endpoints)
// ===========================================

export interface ProviderStatus {
  provider: TwoBotAIProvider;
  configured: boolean;
  models: string[];
  features: string[];
}

/**
 * Get status of all providers (derived from registry)
 */
export function getProvidersStatus(): ProviderStatus[] {
  return getAllProviders().map((provider) => {
    const configured = isProviderConfigured(provider);
    return {
      provider,
      configured,
      models: configured
        ? getProviderModelIds(provider)
        : [],
      features: configured ? getProviderFeatures(provider) : [],
    };
  });
}
