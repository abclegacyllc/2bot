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
import type { ModelCapabilities, ModelInfo, TwoBotAIProvider } from "./types";

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
  log.info({ provider, isValid }, "Provider validation status updated");
}

/**
 * Check if provider has been validated by health service
 */
export function isProviderValidated(provider: TwoBotAIProvider): boolean | undefined {
  return validatedProviders.get(provider);
}

// ===========================================
// Default Capabilities by Model Type
// ===========================================

const CHAT_MODEL_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["text"],
  supportsStreaming: true,
  supportsFunctionCalling: true,
  supportsJsonMode: true,
};

const VISION_MODEL_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["text", "image"],
  outputTypes: ["text"],
  canAnalyzeImages: true,
  supportsStreaming: true,
  supportsFunctionCalling: true,
  supportsJsonMode: true,
};

const IMAGE_GEN_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["image"],
  canGenerateImages: true,
  supportsStreaming: false,
};

const TTS_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["audio"],
  canGenerateAudio: true,
  supportsStreaming: true,
};

const STT_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["audio"],
  outputTypes: ["text"],
  canTranscribeAudio: true,
  supportsStreaming: false,
};

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
 * 1. If provider was validated by health service, use that result
 * 2. Otherwise, fall back to basic format check
 */
export function isProviderConfigured(provider: TwoBotAIProvider): boolean {
  // Check if health service has validated this provider
  const validated = isProviderValidated(provider);
  if (validated !== undefined) {
    return validated;
  }

  // Fall back to basic format check (before health service runs)
  switch (provider) {
    case "openai":
      const openaiKey = process.env.TWOBOT_OPENAI_API_KEY;
      const openaiValid = !!(openaiKey && openaiKey.startsWith("sk-") && openaiKey.length > 20);
      if (!openaiValid) {
        log.debug("OpenAI: No valid API key format detected (will verify with health check)");
      }
      return openaiValid;

    case "anthropic":
      const anthropicKey = process.env.TWOBOT_ANTHROPIC_API_KEY;
      const anthropicValid = !!(anthropicKey && anthropicKey.startsWith("sk-ant-") && anthropicKey.length > 20);
      if (!anthropicValid) {
        log.debug("Anthropic: No valid API key format detected (will verify with health check)");
      }
      return anthropicValid;

    default:
      return false;
  }
}

/**
 * Get list of all configured providers
 */
export function getConfiguredProviders(): TwoBotAIProvider[] {
  const providers: TwoBotAIProvider[] = [];

  if (isProviderConfigured("openai")) {
    providers.push("openai");
    log.info("OpenAI provider is configured and ready");
  } else {
    log.warn("OpenAI provider NOT configured - TWOBOT_OPENAI_API_KEY missing or invalid");
  }

  if (isProviderConfigured("anthropic")) {
    providers.push("anthropic");
    log.info("Anthropic provider is configured and ready");
  } else {
    log.warn("Anthropic provider NOT configured - TWOBOT_ANTHROPIC_API_KEY missing or invalid");
  }

  return providers;
}

// ===========================================
// Full Model Registry (All Possible Models)
// ===========================================

/**
 * Complete registry of all supported models.
 * Models are filtered at runtime based on which providers are configured.
 * Each model includes its capabilities for smart UI rendering.
 */
export const ALL_MODELS: ModelInfo[] = [
  // =====================================
  // OpenAI Chat Models
  // IDs must match OpenAI's actual model names
  // =====================================
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    capability: "text-generation",
    description: "Fast, affordable model for everyday tasks",
    creditsPerInputToken: 0.15,
    creditsPerOutputToken: 0.6,
    maxTokens: 16384,
    contextWindow: 128000,
    tier: 1,
    badge: "FAST",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "medium",
      speed: "high",
      creativity: "medium",
    },
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    capability: "text-generation",
    description: "Most capable OpenAI model for complex tasks",
    creditsPerInputToken: 2.5,
    creditsPerOutputToken: 10,
    maxTokens: 16384,
    contextWindow: 128000,
    tier: 2,
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "high",
      speed: "medium",
      creativity: "high",
    },
  },
  {
    id: "o3-mini",
    name: "o3 Mini",
    provider: "openai",
    capability: "text-generation",
    description: "Latest reasoning model with improved performance",
    creditsPerInputToken: 1.1,
    creditsPerOutputToken: 4.4,
    maxTokens: 100000,
    contextWindow: 200000,
    tier: 2,
    badge: "REASONING",
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "highest",
      speed: "medium",
      creativity: "medium",
    },
  },
  {
    id: "o1-mini",
    name: "o1 Mini",
    provider: "openai",
    capability: "text-generation",
    description: "Fast reasoning model, good for coding",
    creditsPerInputToken: 3,
    creditsPerOutputToken: 12,
    maxTokens: 65536,
    contextWindow: 128000,
    tier: 2,
    badge: "REASONING",
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "high",
      speed: "medium",
      creativity: "medium",
    },
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    capability: "text-generation",
    description: "Previous generation high-performance model",
    creditsPerInputToken: 10,
    creditsPerOutputToken: 30,
    maxTokens: 4096,
    contextWindow: 128000,
    tier: 3,
    deprecated: true,
    deprecationMessage: "Consider using GPT-4o for better performance",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "high",
      speed: "medium",
      creativity: "high",
    },
  },

  // =====================================
  // OpenAI Image Models
  // =====================================
  {
    id: "dall-e-3",
    name: "DALL-E 3",
    provider: "openai",
    capability: "image-generation",
    description: "Generate stunning images from text",
    creditsPerImage: 10000,
    tier: 1,
    capabilities: IMAGE_GEN_CAPABILITIES,
  },
  {
    id: "dall-e-3-hd",
    name: "DALL-E 3 HD",
    provider: "openai",
    capability: "image-generation",
    description: "Higher quality image generation",
    creditsPerImage: 20000,
    tier: 2,
    badge: "HD",
    capabilities: IMAGE_GEN_CAPABILITIES,
  },

  // =====================================
  // OpenAI TTS Models
  // =====================================
  {
    id: "tts-1",
    name: "TTS Standard",
    provider: "openai",
    capability: "speech-synthesis",
    description: "Text-to-speech, optimized for speed",
    creditsPerChar: 500,
    tier: 1,
    capabilities: TTS_CAPABILITIES,
  },
  {
    id: "tts-1-hd",
    name: "TTS HD",
    provider: "openai",
    capability: "speech-synthesis",
    description: "Text-to-speech, optimized for quality",
    creditsPerChar: 1000,
    tier: 2,
    badge: "HD",
    capabilities: TTS_CAPABILITIES,
  },

  // =====================================
  // OpenAI STT Models
  // =====================================
  {
    id: "whisper-1",
    name: "Whisper",
    provider: "openai",
    capability: "speech-recognition",
    description: "Transcribe audio to text",
    creditsPerMinute: 200,
    tier: 1,
    capabilities: STT_CAPABILITIES,
  },

  // =====================================
  // Anthropic Chat Models
  // IDs must match Anthropic's actual model names
  // =====================================
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    capability: "text-generation",
    description: "Fast and efficient for simple tasks",
    creditsPerInputToken: 0.8,
    creditsPerOutputToken: 4,
    maxTokens: 8192,
    contextWindow: 200000,
    tier: 1,
    badge: "FAST",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "medium",
      speed: "highest",
      creativity: "medium",
    },
  },
  {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    capability: "text-generation",
    description: "Fast and affordable (previous gen)",
    creditsPerInputToken: 0.25,
    creditsPerOutputToken: 1.25,
    maxTokens: 4096,
    contextWindow: 200000,
    tier: 1,
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "medium",
      speed: "highest",
      creativity: "medium",
    },
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    capability: "text-generation",
    description: "Best balance of intelligence and speed",
    creditsPerInputToken: 3,
    creditsPerOutputToken: 15,
    maxTokens: 8192,
    contextWindow: 200000,
    tier: 2,
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "high",
      speed: "high",
      creativity: "high",
    },
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    capability: "text-generation",
    description: "Most capable Claude model for complex analysis",
    creditsPerInputToken: 3,
    creditsPerOutputToken: 15,
    maxTokens: 8192,
    contextWindow: 200000,
    tier: 3,
    badge: "BEST",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "highest",
      speed: "low",
      creativity: "highest",
    },
  },
  {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    capability: "text-generation",
    description: "Most intelligent Claude model",
    creditsPerInputToken: 15,
    creditsPerOutputToken: 75,
    maxTokens: 8192,
    contextWindow: 200000,
    tier: 3,
    badge: "BEST",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "highest",
      speed: "low",
      creativity: "highest",
    },
  },
];

// ===========================================
// Dynamic Model Access
// ===========================================

/**
 * Get only models from configured providers
 * Uses discovered models (dynamic) with fallback to ALL_MODELS (static)
 *
 * Priority:
 * 1. Use dynamically discovered models if available
 * 2. Fall back to static ALL_MODELS list
 *
 * @param capability - Filter by capability (text-generation, image-generation, speech-synthesis, speech-recognition, text-embedding, image-understanding)
 */
export function getAvailableModels(capability?: AICapability): ModelInfo[] {
  // Use discovered models if available
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
    models = ALL_MODELS.filter((m) => configuredProviders.includes(m.provider));
    log.debug({ count: models.length }, "Using static model list (discovery not yet run)");
  }

  // Filter by capability if specified
  if (capability) {
    models = models.filter((m) => m.capability === capability);
  }

  // Set default model (first available text-generation model, preferring cheaper)
  const chatModels = models.filter((m) =>
    m.capability === "text-generation" && !m.deprecated
  );
  if (chatModels.length > 0) {
    // Sort by tier (cheapest first) and mark first as default
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
    "Available models"
  );

  return models;
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
 * Check if image generation is available (requires OpenAI)
 */
export function isImageGenerationAvailable(): boolean {
  return isProviderConfigured("openai");
}

/**
 * Check if speech synthesis (text-to-speech) is available (requires OpenAI)
 */
export function isSpeechSynthesisAvailable(): boolean {
  return isProviderConfigured("openai");
}

/**
 * Check if speech recognition (speech-to-text) is available (requires OpenAI)
 */
export function isSpeechRecognitionAvailable(): boolean {
  return isProviderConfigured("openai");
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
 * Get available features based on configured providers
 */
export function getAvailableFeatures(): {
  textGeneration: boolean;
  imageGeneration: boolean;
  imageAnalysis: boolean;
  speechSynthesis: boolean;
  speechRecognition: boolean;
} {
  const hasOpenAI = isProviderConfigured("openai");
  const hasAnthropic = isProviderConfigured("anthropic");

  return {
    textGeneration: hasOpenAI || hasAnthropic,
    imageGeneration: hasOpenAI,
    imageAnalysis: hasOpenAI || hasAnthropic, // Both support vision
    speechSynthesis: hasOpenAI,
    speechRecognition: hasOpenAI,
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
 * Get status of all providers
 */
export function getProvidersStatus(): ProviderStatus[] {
  return [
    {
      provider: "openai",
      configured: isProviderConfigured("openai"),
      models: isProviderConfigured("openai")
        ? ALL_MODELS.filter((m) => m.provider === "openai").map((m) => m.id)
        : [],
      features: isProviderConfigured("openai")
        ? ["text-generation", "image-generation", "image-understanding", "speech-synthesis", "speech-recognition"]
        : [],
    },
    {
      provider: "anthropic",
      configured: isProviderConfigured("anthropic"),
      models: isProviderConfigured("anthropic")
        ? ALL_MODELS.filter((m) => m.provider === "anthropic").map((m) => m.id)
        : [],
      features: isProviderConfigured("anthropic") ? ["text-generation", "image-understanding"] : [],
    },
  ];
}
