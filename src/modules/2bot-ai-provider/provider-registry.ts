/**
 * Provider Registry - Single Source of Truth
 *
 * Centralizes ALL provider configuration in one place:
 * - API key env vars and format validation
 * - Capabilities each provider supports
 * - Adapter function mappings per capability
 * - Display names
 *
 * Adding a new provider? Just add one entry here.
 * Everything else (config checks, dispatch, status, features) derives from this registry.
 *
 * @module modules/2bot-ai-provider/provider-registry
 */

import type { AICapability } from "./ai-capabilities";
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  SpeechRecognitionRequest,
  SpeechRecognitionResponse,
  SpeechSynthesisRequest,
  SpeechSynthesisResponse,
  TextGenerationRequest,
  TextGenerationResponse,
  TextGenerationStreamChunk,
  TwoBotAIProvider,
} from "./types";

// ===========================================
// Adapter Function Types
// ===========================================

/** Adapter function signatures for each capability */
export interface ProviderAdapters {
  textGeneration?: (req: TextGenerationRequest) => Promise<TextGenerationResponse>;
  textGenerationStream?: (req: TextGenerationRequest) => AsyncGenerator<TextGenerationStreamChunk, { inputTokens: number; outputTokens: number }>;
  imageGeneration?: (req: ImageGenerationRequest) => Promise<ImageGenerationResponse>;
  speechSynthesis?: (req: SpeechSynthesisRequest) => Promise<SpeechSynthesisResponse>;
  speechRecognition?: (req: SpeechRecognitionRequest) => Promise<SpeechRecognitionResponse>;
}

// ===========================================
// Registry Entry
// ===========================================

export interface ProviderRegistryEntry {
  /** Provider identifier */
  provider: TwoBotAIProvider;
  /** Human-readable name */
  displayName: string;
  /** Environment variable name for the API key */
  envVar: string;
  /** Required key prefix (e.g., "sk-") or null if no prefix required */
  keyPrefix: string | null;
  /** Minimum valid key length */
  minKeyLength: number;
  /** Capabilities this provider supports (must have a corresponding adapter) */
  capabilities: AICapability[];
  /** Adapter functions for each supported capability */
  adapters: ProviderAdapters;
  /**
   * URL to hit for key validation during model discovery.
   * A GET request with `Authorization: Bearer <key>` is sent.
   * If set, the generic discoverer is used — no custom function needed.
   * If null, a custom discoverer must be registered in model-discovery.service.ts.
   */
  validationUrl: string | null;
}

// ===========================================
// Placeholder Detection (shared logic)
// ===========================================

const PLACEHOLDER_PATTERNS = [
  /^sk-your-/i,
  /^sk-xxx/i,
  /^sk-test/i,
  /^sk-placeholder/i,
  /^sk-fake/i,
  /^sk-example/i,
  /^sk-demo/i,
  /key-here$/i,
  /your.*key/i,
];

function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(key));
}

// ===========================================
// Adapter Imports (lazy — imported at module load)
// ===========================================

import {
  anthropicTextGeneration,
  anthropicTextGenerationStream,
  fireworksImageGeneration,
  fireworksTextGeneration,
  fireworksTextGenerationStream,
  openaiImageGeneration,
  openaiSpeechRecognition,
  openaiSpeechSynthesis,
  openaiTextGeneration,
  openaiTextGenerationStream,
  openrouterTextGeneration,
  openrouterTextGenerationStream,
  togetherImageGeneration,
  togetherTextGeneration,
  togetherTextGenerationStream,
} from "./adapters";

// ===========================================
// The Registry — Single Source of Truth
// ===========================================

/**
 * Provider Registry
 *
 * To add a new provider:
 * 1. Add its adapter file in ./adapters/
 * 2. Export adapter functions from ./adapters/index.ts
 * 3. Add an entry here with env var, key format, capabilities, and adapter mappings
 * That's it. All dispatch, config checks, status, and feature detection derive from this.
 */
export const PROVIDER_REGISTRY: Record<TwoBotAIProvider, ProviderRegistryEntry> = {
  openai: {
    provider: "openai",
    displayName: "OpenAI",
    envVar: "TWOBOT_OPENAI_API_KEY",
    keyPrefix: "sk-",
    minKeyLength: 20,
    capabilities: [
      "text-generation",
      "image-generation",
      "image-understanding",
      "speech-synthesis",
      "speech-recognition",
      "tool-use",
    ],
    adapters: {
      textGeneration: openaiTextGeneration,
      textGenerationStream: openaiTextGenerationStream,
      imageGeneration: openaiImageGeneration,
      speechSynthesis: openaiSpeechSynthesis,
      speechRecognition: openaiSpeechRecognition,
    },
    validationUrl: null, // Custom discoverer (matches API models against registry)
  },

  anthropic: {
    provider: "anthropic",
    displayName: "Anthropic",
    envVar: "TWOBOT_ANTHROPIC_API_KEY",
    keyPrefix: "sk-ant-",
    minKeyLength: 20,
    capabilities: [
      "text-generation",
      "image-understanding",
      "tool-use",
    ],
    adapters: {
      textGeneration: anthropicTextGeneration,
      textGenerationStream: anthropicTextGenerationStream,
    },
    validationUrl: null, // Custom discoverer (tests key with real API call)
  },

  together: {
    provider: "together",
    displayName: "Together AI",
    envVar: "TWOBOT_TOGETHER_API_KEY",
    keyPrefix: null,
    minKeyLength: 20,
    capabilities: [
      "text-generation",
      "text-embedding",
      "image-generation",
      "image-understanding",
      "tool-use",
    ],
    adapters: {
      textGeneration: togetherTextGeneration,
      textGenerationStream: togetherTextGenerationStream,
      imageGeneration: togetherImageGeneration,
    },
    validationUrl: "https://api.together.xyz/v1/models",
  },

  fireworks: {
    provider: "fireworks",
    displayName: "Fireworks AI",
    envVar: "TWOBOT_FIREWORKS_API_KEY",
    keyPrefix: null,
    minKeyLength: 10,
    capabilities: [
      "text-generation",
      "image-generation",
      "image-understanding",
      "tool-use",
    ],
    adapters: {
      textGeneration: fireworksTextGeneration,
      textGenerationStream: fireworksTextGenerationStream,
      imageGeneration: fireworksImageGeneration,
    },
    validationUrl: "https://api.fireworks.ai/inference/v1/models",
  },

  openrouter: {
    provider: "openrouter",
    displayName: "OpenRouter",
    envVar: "TWOBOT_OPENROUTER_API_KEY",
    keyPrefix: "sk-or-",
    minKeyLength: 20,
    capabilities: [
      "text-generation",
      "image-understanding",
      "tool-use",
    ],
    adapters: {
      textGeneration: openrouterTextGeneration,
      textGenerationStream: openrouterTextGenerationStream,
    },
    validationUrl: "https://openrouter.ai/api/v1/models",
  },
};

// ===========================================
// Registry Helpers
// ===========================================

/** Get all provider IDs */
export function getAllProviders(): TwoBotAIProvider[] {
  return Object.keys(PROVIDER_REGISTRY) as TwoBotAIProvider[];
}

/** Get registry entry for a provider */
export function getProviderEntry(provider: TwoBotAIProvider): ProviderRegistryEntry {
  return PROVIDER_REGISTRY[provider];
}

/**
 * Check if a provider's API key passes basic format validation.
 *
 * This does NOT call the API — it only checks env var presence, prefix, length,
 * and placeholder patterns. For real validation, use provider-health.service.ts.
 */
export function isProviderKeyValid(provider: TwoBotAIProvider): boolean {
  const entry = PROVIDER_REGISTRY[provider];
  if (!entry) return false;

  const key = process.env[entry.envVar];
  if (!key) return false;
  if (key.length < entry.minKeyLength) return false;
  if (entry.keyPrefix && !key.startsWith(entry.keyPrefix)) return false;
  if (isPlaceholderKey(key)) return false;

  return true;
}

/**
 * Get providers that support a specific capability.
 * Returns all providers with that capability declared (regardless of configuration).
 */
export function getProvidersForCapability(capability: AICapability): TwoBotAIProvider[] {
  return getAllProviders().filter((p) =>
    PROVIDER_REGISTRY[p].capabilities.includes(capability)
  );
}

/**
 * Get CONFIGURED providers that support a specific capability.
 * Requires an isConfigured check function (to avoid circular dependency with validation cache).
 */
export function getConfiguredProvidersForCapability(
  capability: AICapability,
  isConfigured: (provider: TwoBotAIProvider) => boolean
): TwoBotAIProvider[] {
  return getProvidersForCapability(capability).filter(isConfigured);
}

/**
 * Check if a provider supports a specific capability.
 */
export function providerSupportsCapability(
  provider: TwoBotAIProvider,
  capability: AICapability
): boolean {
  return PROVIDER_REGISTRY[provider]?.capabilities.includes(capability) ?? false;
}

/**
 * Get the adapter function for a provider + capability combination.
 * Returns undefined if the provider doesn't have that adapter.
 */
export function getProviderAdapter<K extends keyof ProviderAdapters>(
  provider: TwoBotAIProvider,
  adapterKey: K
): ProviderAdapters[K] | undefined {
  return PROVIDER_REGISTRY[provider]?.adapters[adapterKey];
}

/**
 * Get the features list for a provider (the capability strings it supports).
 * Used by getProvidersStatus.
 */
export function getProviderFeatures(provider: TwoBotAIProvider): string[] {
  return PROVIDER_REGISTRY[provider]?.capabilities ?? [];
}
