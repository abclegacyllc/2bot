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
 * Common placeholder patterns that look valid but aren't real keys
 */
const PLACEHOLDER_PATTERNS = [
  /^sk-your-/i,           // sk-your-openai-key-here
  /^sk-xxx/i,             // sk-xxxx
  /^sk-test/i,            // sk-test-key
  /^sk-placeholder/i,     // sk-placeholder
  /^sk-fake/i,            // sk-fake-key
  /^sk-example/i,         // sk-example-key
  /^sk-demo/i,            // sk-demo-key
  /key-here$/i,           // ends with key-here
  /your.*key/i,           // contains "your" and "key"
];

/**
 * Check if an API key looks like a placeholder
 */
function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Check if a provider has a valid API key configured
 *
 * This does a basic format check for quick responses.
 * For real validation (actual API call), use provider-health.service.ts
 *
 * Logic:
 * 1. If provider was validated by health service, use that result (true/false)
 * 2. Otherwise, fall back to basic format check WITH placeholder detection
 */
export function isProviderConfigured(provider: TwoBotAIProvider): boolean {
  // Check if health service has validated this provider
  const validated = isProviderValidated(provider);
  if (validated !== undefined) {
    // Health service has checked - use definitive result
    return validated;
  }

  // Fall back to basic format check (before health service runs)
  // BUT also detect placeholder keys to avoid false positives
  switch (provider) {
    case "openai": {
      const openaiKey = process.env.TWOBOT_OPENAI_API_KEY;
      if (!openaiKey) {
        log.debug("OpenAI: No API key set");
        return false;
      }
      if (!openaiKey.startsWith("sk-") || openaiKey.length < 20) {
        log.debug("OpenAI: Invalid API key format");
        return false;
      }
      if (isPlaceholderKey(openaiKey)) {
        log.warn("OpenAI: API key looks like a placeholder - will verify with health check");
        return false; // Don't trust placeholder keys
      }
      return true;
    }

    case "anthropic": {
      const anthropicKey = process.env.TWOBOT_ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        log.debug("Anthropic: No API key set");
        return false;
      }
      if (!anthropicKey.startsWith("sk-ant-") || anthropicKey.length < 20) {
        log.debug("Anthropic: Invalid API key format");
        return false;
      }
      if (isPlaceholderKey(anthropicKey)) {
        log.warn("Anthropic: API key looks like a placeholder - will verify with health check");
        return false; // Don't trust placeholder keys
      }
      return true;
    }

    case "together": {
      const togetherKey = process.env.TWOBOT_TOGETHER_API_KEY;
      if (!togetherKey) {
        log.debug("Together AI: No API key set");
        return false;
      }
      if (togetherKey.length < 20) {
        log.debug("Together AI: Invalid API key format");
        return false;
      }
      if (isPlaceholderKey(togetherKey)) {
        log.warn("Together AI: API key looks like a placeholder - will verify with health check");
        return false;
      }
      return true;
    }

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

  if (isProviderConfigured("together")) {
    providers.push("together");
    log.info("Together AI provider is configured and ready");
  } else {
    log.warn("Together AI provider NOT configured - TWOBOT_TOGETHER_API_KEY missing or invalid");
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
    creditsPerInputToken: 0.000045,
    creditsPerOutputToken: 0.00018,
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
    creditsPerInputToken: 0.00075,
    creditsPerOutputToken: 0.003,
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
    creditsPerInputToken: 0.00033,
    creditsPerOutputToken: 0.00132,
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
    creditsPerInputToken: 0.0009,
    creditsPerOutputToken: 0.0036,
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
    creditsPerInputToken: 0.003,
    creditsPerOutputToken: 0.009,
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
    creditsPerImage: 12,
    tier: 1,
    capabilities: IMAGE_GEN_CAPABILITIES,
  },
  {
    id: "dall-e-3-hd",
    name: "DALL-E 3 HD",
    provider: "openai",
    capability: "image-generation",
    description: "Higher quality image generation",
    creditsPerImage: 24,
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
    creditsPerChar: 0.0045,
    tier: 1,
    capabilities: TTS_CAPABILITIES,
  },
  {
    id: "tts-1-hd",
    name: "TTS HD",
    provider: "openai",
    capability: "speech-synthesis",
    description: "Text-to-speech, optimized for quality",
    creditsPerChar: 0.009,
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
    creditsPerMinute: 1.8,
    tier: 1,
    capabilities: STT_CAPABILITIES,
  },

  // =====================================
  // Anthropic Chat Models
  // IDs must match Anthropic's actual model names
  // =====================================

  // --- Latest Generation ---
  {
    id: "claude-opus-4-6-20260131",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    capability: "text-generation",
    description: "Most intelligent Claude model — 3x cheaper than Opus 4",
    creditsPerInputToken: 0.0015,
    creditsPerOutputToken: 0.0075,
    maxTokens: 8192,
    contextWindow: 200000,
    tier: 3,
    badge: "BEST",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "highest",
      speed: "medium",
      creativity: "highest",
    },
  },
  {
    id: "claude-sonnet-4-5-20251022",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    capability: "text-generation",
    description: "Latest balanced model — best value for most tasks",
    creditsPerInputToken: 0.0009,
    creditsPerOutputToken: 0.0045,
    maxTokens: 8192,
    contextWindow: 200000,
    tier: 2,
    badge: "BEST",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "highest",
      speed: "high",
      creativity: "highest",
    },
  },
  {
    id: "claude-haiku-4-5-20251022",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    capability: "text-generation",
    description: "Latest fast model with improved intelligence",
    creditsPerInputToken: 0.0003,
    creditsPerOutputToken: 0.0015,
    maxTokens: 8192,
    contextWindow: 200000,
    tier: 1,
    badge: "FAST",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "high",
      speed: "highest",
      creativity: "high",
    },
  },

  // --- Previous Generation (Haiku 3.5 kept as fallback) ---
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    capability: "text-generation",
    description: "Fast and efficient for simple tasks",
    creditsPerInputToken: 0.00024,
    creditsPerOutputToken: 0.0012,
    maxTokens: 8192,
    contextWindow: 200000,
    tier: 1,
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "medium",
      speed: "highest",
      creativity: "medium",
    },
  },

  // =====================================
  // Together AI Chat Models
  // =====================================
  {
    id: "togethercomputer/MoA-1",
    name: "MoA-1",
    provider: "together",
    capability: "text-generation",
    description: "Free mixture-of-agents ensemble model",
    creditsPerInputToken: 0,
    creditsPerOutputToken: 0,
    maxTokens: 4096,
    contextWindow: 32768,
    tier: 1,
    badge: "FREE",
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "medium",
      speed: "medium",
      creativity: "medium",
    },
  },
  {
    id: "google/gemma-3n-E4B-it",
    name: "Gemma 3n E4B",
    provider: "together",
    capability: "text-generation",
    description: "Google's efficient small model",
    creditsPerInputToken: 0.000006,
    creditsPerOutputToken: 0.000012,
    maxTokens: 4096,
    contextWindow: 32768,
    tier: 1,
    badge: "FAST",
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "medium",
      speed: "highest",
      creativity: "medium",
    },
  },
  {
    id: "meta-llama/Llama-3.2-3B-Instruct-Turbo",
    name: "Llama 3.2 3B Turbo",
    provider: "together",
    capability: "text-generation",
    description: "Meta's fast lightweight model",
    creditsPerInputToken: 0.000018,
    creditsPerOutputToken: 0.000018,
    maxTokens: 4096,
    contextWindow: 131072,
    tier: 1,
    badge: "FAST",
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "medium",
      speed: "highest",
      creativity: "medium",
    },
  },
  {
    id: "Qwen/Qwen3-Next-80B-A3B-Instruct",
    name: "Qwen3 Next 80B",
    provider: "together",
    capability: "text-generation",
    description: "Qwen's efficient MoE model",
    creditsPerInputToken: 0.000045,
    creditsPerOutputToken: 0.00045,
    maxTokens: 8192,
    contextWindow: 32768,
    tier: 2,
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "high",
      speed: "high",
      creativity: "high",
    },
  },
  {
    id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    name: "Llama 4 Maverick",
    provider: "together",
    capability: "text-generation",
    description: "Meta's large MoE model with 1M context and vision",
    creditsPerInputToken: 0.000081,
    creditsPerOutputToken: 0.000255,
    maxTokens: 8192,
    contextWindow: 1048576,
    tier: 2,
    badge: "VISION",
    capabilities: {
      ...VISION_MODEL_CAPABILITIES,
      reasoning: "high",
      speed: "medium",
      creativity: "high",
    },
  },
  {
    id: "deepseek-ai/DeepSeek-V3.1",
    name: "DeepSeek V3.1",
    provider: "together",
    capability: "text-generation",
    description: "DeepSeek's powerful general model",
    creditsPerInputToken: 0.00018,
    creditsPerOutputToken: 0.00051,
    maxTokens: 16384,
    contextWindow: 131072,
    tier: 2,
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "high",
      speed: "medium",
      creativity: "high",
    },
  },
  {
    id: "deepseek-ai/DeepSeek-R1",
    name: "DeepSeek R1",
    provider: "together",
    capability: "text-generation",
    description: "DeepSeek's top reasoning model",
    creditsPerInputToken: 0.0009,
    creditsPerOutputToken: 0.0021,
    maxTokens: 16384,
    contextWindow: 131072,
    tier: 3,
    badge: "REASONING",
    capabilities: {
      ...CHAT_MODEL_CAPABILITIES,
      reasoning: "highest",
      speed: "low",
      creativity: "high",
    },
  },

  // =====================================
  // Together AI Image Models
  // =====================================
  {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "FLUX.1 Schnell",
    provider: "together",
    capability: "image-generation",
    description: "Fast image generation",
    creditsPerImage: 0.9,
    tier: 1,
    badge: "FAST",
    capabilities: IMAGE_GEN_CAPABILITIES,
  },
  {
    id: "black-forest-labs/FLUX.2-pro",
    name: "FLUX.2 Pro",
    provider: "together",
    capability: "image-generation",
    description: "FLUX 2 production-quality images",
    creditsPerImage: 12,
    tier: 3,
    badge: "BEST",
    capabilities: IMAGE_GEN_CAPABILITIES,
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
 * Check if image generation is available (requires OpenAI or Together)
 */
export function isImageGenerationAvailable(): boolean {
  return isProviderConfigured("openai") || isProviderConfigured("together");
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
 * Get available features based on which 2Bot models can actually be resolved.
 * 
 * This checks the model resolver to see if at least one model for each capability
 * has a configured provider — much more accurate than just checking provider flags.
 * 
 * For example, if only Together AI is configured:
 * - imageGeneration = true (Together has FLUX models mapped)
 * - speechSynthesis = false (voice models only map to OpenAI)
 * - speechRecognition = false (transcribe models only map to OpenAI)
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
  const hasTogether = isProviderConfigured("together");

  // For text, image analysis: any provider works
  const hasTextProvider = hasOpenAI || hasAnthropic || hasTogether;

  // For image generation: check if image model mappings have a configured provider
  // Image models map to: OpenAI (DALL-E) and Together (FLUX)
  const hasImageProvider = hasOpenAI || hasTogether;

  // For speech synthesis: currently ONLY OpenAI has TTS adapters
  // Voice models (2bot-ai-voice-pro/ultra) only map to OpenAI TTS
  const hasTTSProvider = hasOpenAI;

  // For speech recognition: currently ONLY OpenAI has STT adapters (Whisper)
  // Transcribe model (2bot-ai-transcribe-lite) only maps to OpenAI Whisper
  const hasSTTProvider = hasOpenAI;

  return {
    textGeneration: hasTextProvider,
    imageGeneration: hasImageProvider,
    imageAnalysis: hasTextProvider, // Vision is available on all text providers
    speechSynthesis: hasTTSProvider,
    speechRecognition: hasSTTProvider,
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
    {
      provider: "together",
      configured: isProviderConfigured("together"),
      models: isProviderConfigured("together")
        ? ALL_MODELS.filter((m) => m.provider === "together").map((m) => m.id)
        : [],
      features: isProviderConfigured("together")
        ? ["text-generation", "text-embedding", "image-generation", "image-understanding"]
        : [],
    },
  ];
}
