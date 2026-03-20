/**
 * Model Discovery Service
 *
 * Dynamically discovers available models from AI providers.
 * Instead of hardcoding models, we fetch them from the provider APIs
 * and merge with our metadata from model-registry.ts (single source of truth).
 *
 * For providers with a validationUrl (Together, Fireworks, OpenRouter, and any future
 * OpenAI-compatible provider), the generic discoverer handles everything automatically.
 * Only OpenAI and Anthropic need custom discoverers due to their unique validation flows.
 *
 * Adding a new provider? Just set validationUrl in provider-registry.ts.
 * No code changes needed here unless the provider needs custom validation.
 *
 * @module modules/2bot-ai-provider/model-discovery.service
 */

import { logger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getRegistryEntriesByProvider, getRegistryEntry, registryToModelInfo } from "./model-registry";
import { invalidateModelCache } from "./provider-config";
import { getAllProviders, getProviderEntry } from "./provider-registry";
import type { ModelInfo, TwoBotAIProvider } from "./types";

const log = logger.child({ module: "model-discovery" });

// ===========================================
// Generic Provider Discovery
// ===========================================

/**
 * Generic model discovery for providers with a validationUrl.
 *
 * Flow:
 * 1. Check API key exists
 * 2. Hit validationUrl with Bearer token to validate the key
 * 3. Return all registry entries for this provider
 *
 * This handles Together AI, Fireworks AI, OpenRouter, and any future
 * OpenAI-compatible provider — no custom code needed.
 */
async function genericDiscover(provider: TwoBotAIProvider): Promise<ModelInfo[]> {
  const entry = getProviderEntry(provider);
  const apiKey = process.env[entry.envVar];
  if (!apiKey) {
    log.warn(`${entry.displayName} API key not set, skipping discovery`);
    return [];
  }

  try {
    if (entry.validationUrl) {
      const response = await fetch(entry.validationUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`${entry.displayName} API returned ${response.status}`);
      }
    }

    log.info(`${entry.displayName} API key validated`);

    // Return our curated model list from the registry
    const entries = getRegistryEntriesByProvider(provider);
    const discoveredModels: ModelInfo[] = entries.map((e) => registryToModelInfo(e, provider));

    log.info(
      { count: discoveredModels.length, models: discoveredModels.map((m) => m.id) },
      `Discovered ${entry.displayName} models`
    );

    return discoveredModels;
  } catch (error) {
    log.error({ error }, `Failed to discover ${entry.displayName} models`);
    return [];
  }
}

// ===========================================
// Custom Discovery Overrides
// ===========================================

/**
 * Custom discoverers for providers that need special validation logic.
 * Providers NOT listed here use the generic discoverer (via validationUrl).
 */
const CUSTOM_DISCOVERERS: Partial<Record<TwoBotAIProvider, () => Promise<ModelInfo[]>>> = {
  openai: discoverOpenAIModels,
  anthropic: discoverAnthropicModels,
  google: discoverGoogleAIModels,
};

// ===========================================
// OpenAI Model Discovery (Custom)
// ===========================================

/**
 * Discover available models from OpenAI's /v1/models API.
 * Queries the API, then matches each model ID against the registry.
 * Only returns models we have metadata for (skips embeddings, fine-tunes, etc.)
 */
async function discoverOpenAIModels(): Promise<ModelInfo[]> {
  const { envVar, displayName } = getProviderEntry("openai");
  const apiKey = process.env[envVar];
  if (!apiKey) {
    log.warn(`${displayName} API key not set, skipping discovery`);
    return [];
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 15000 });
    const response = await client.models.list();

    const discoveredModels: ModelInfo[] = [];
    const seenModels = new Set<string>();
    const openaiEntries = getRegistryEntriesByProvider("openai");

    for (const model of response.data) {
      const modelId = model.id;

      // Skip if already seen (duplicates)
      if (seenModels.has(modelId)) continue;
      seenModels.add(modelId);

      // Check if we have registry metadata for this model
      // Try exact match first, then prefix match
      let entry = getRegistryEntry(modelId);

      if (!entry) {
        // Try prefix matching (e.g., "gpt-4o-2024-05-13" matches "gpt-4o")
        for (const regEntry of openaiEntries) {
          if (modelId.startsWith(regEntry.id) || modelId === regEntry.id) {
            entry = regEntry;
            break;
          }
        }
      }

      // Skip models we don't have metadata for (embeddings, fine-tunes, etc.)
      if (!entry) {
        log.debug({ modelId }, "Skipping model without registry entry");
        continue;
      }

      // Skip deprecated models unless they're the only version
      if (entry.deprecated) {
        log.debug({ modelId }, "Including deprecated model");
      }

      discoveredModels.push(registryToModelInfo(entry, "openai"));
    }

    log.info(
      { count: discoveredModels.length, models: discoveredModels.map((m) => m.id) },
      "Discovered OpenAI models"
    );

    return discoveredModels;
  } catch (error) {
    log.error({ error }, "Failed to discover OpenAI models");
    return [];
  }
}

// ===========================================
// Anthropic Model Discovery (Custom)
// ===========================================

/**
 * Discover available models from Anthropic.
 *
 * Note: Anthropic doesn't have a models.list() API like OpenAI.
 * We validate the API key and return our known model list from the registry.
 * We test a cheap model to verify the key works.
 */
async function discoverAnthropicModels(): Promise<ModelInfo[]> {
  const { envVar, displayName } = getProviderEntry("anthropic");
  const apiKey = process.env[envVar];
  if (!apiKey) {
    log.warn(`${displayName} API key not set, skipping discovery`);
    return [];
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 15000 });

    // Test the API key with a minimal request
    // Using claude-haiku-4-5 as it's the cheapest current model
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });

    log.info("Anthropic API key validated");

    // Return all known Anthropic models from the registry
    const entries = getRegistryEntriesByProvider("anthropic");
    const discoveredModels: ModelInfo[] = entries
      .filter((e) => !e.id.endsWith("-latest"))
      .map((e) => registryToModelInfo(e, "anthropic"));

    log.info(
      { count: discoveredModels.length, models: discoveredModels.map((m) => m.id) },
      "Discovered Anthropic models"
    );

    return discoveredModels;
  } catch (error) {
    log.error({ error }, "Failed to discover Anthropic models");
    return [];
  }
}

// ===========================================
// Google Vertex AI Model Discovery (Custom)
// ===========================================

/**
 * Known mappings from Vertex AI model IDs to our registry canonical IDs.
 * Vertex AI Model Garden hosts Gemini + third-party models (Claude, Llama, Mistral, etc.)
 *
 * Key: substring to match in Vertex AI's model name
 * Value: canonical model ID in our registry
 */
const _VERTEX_MODEL_MAP: Record<string, string> = {
  // Gemini native
  "gemini-2.5-flash": "google/gemini-2.5-flash-preview",
  "gemini-3-flash": "google/gemini-3-flash-preview",
  "gemini-2.5-pro": "google/gemini-2.5-pro-preview",
  "gemini-3-pro": "google/gemini-3-pro-preview",
  "gemma-3n": "google/gemma-3n-E4B-it",
  // Claude on Vertex AI (Model Garden)
  "claude-3-5-haiku": "claude-3-5-haiku-20241022",
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5": "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4-5": "claude-opus-4-5-20251101",
  "claude-opus-4-6": "claude-opus-4-6",
  // Llama on Vertex AI (Model Garden)
  "llama-4-maverick": "llama-4-maverick",
  "llama-4-scout": "llama-4-scout",
  "llama-3.3-70b": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "llama-3.2-3b": "meta-llama/Llama-3.2-3B-Instruct-Turbo",
  "llama-3.1-8b": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  // Mistral on Vertex AI (Model Garden)
  "mistral-large": "mistralai/mistral-large-2411",
  // DeepSeek on Vertex AI (Model Garden)
  "deepseek-r1": "deepseek-ai/DeepSeek-R1",
  "deepseek-v3": "deepseek-v3",
};

/**
 * Discover available models from Google Vertex AI.
 *
 * Since Vertex AI models list requires heavier API setup, we use a static
 * registry-based approach: return all models that have a `google` provider entry.
 * The health check already validates the credentials work.
 *
 * Third-party models available on Vertex AI Model Garden are pre-registered
 * in the model registry with their google provider modelIds.
 */
async function discoverGoogleAIModels(): Promise<ModelInfo[]> {
  const serviceAccount = process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT;
  const project = process.env.TWOBOT_VERTEX_AI_PROJECT;

  if (!serviceAccount || !project) {
    log.warn("Vertex AI credentials not configured, skipping discovery");
    return [];
  }

  // Return all models registered with the google provider
  const entries = getRegistryEntriesByProvider("google");
  const discoveredModels: ModelInfo[] = entries.map((e) => registryToModelInfo(e, "google"));

  log.info(
    { count: discoveredModels.length, models: discoveredModels.map((m) => m.id) },
    "Discovered Vertex AI models (Gemini + Model Garden third-party)",
  );

  return discoveredModels;
}

// ===========================================
// Unified Discovery Dispatch
// ===========================================

/**
 * Discover models for a single provider.
 *
 * Uses the custom discoverer if registered (OpenAI, Anthropic),
 * otherwise falls back to the generic discoverer (uses validationUrl).
 *
 * Adding a new provider? If it has a standard /v1/models endpoint,
 * just set validationUrl in provider-registry.ts — no code needed here.
 */
export async function discoverModelsForProvider(provider: TwoBotAIProvider): Promise<ModelInfo[]> {
  const custom = CUSTOM_DISCOVERERS[provider];
  if (custom) {
    return custom();
  }
  // Generic discovery via validationUrl
  return genericDiscover(provider);
}

// ===========================================
// Combined Model Discovery
// ===========================================

// Cache for discovered models
let discoveredModelsCache: ModelInfo[] | null = null;
let lastDiscoveryTime: Date | null = null;
const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Discover all available models from all providers.
 * Driven by the provider registry — providers with validationUrl are
 * discovered automatically. Custom discoverers handle OpenAI and Anthropic.
 */
export async function discoverAllModels(forceRefresh = false): Promise<ModelInfo[]> {
  // Return cached if valid
  if (
    !forceRefresh &&
    discoveredModelsCache &&
    lastDiscoveryTime &&
    Date.now() - lastDiscoveryTime.getTime() < DISCOVERY_CACHE_TTL_MS
  ) {
    log.debug("Returning cached discovered models");
    return discoveredModelsCache;
  }

  const providers = getAllProviders();
  log.info({ providers }, "Discovering models from all providers...");

  // Discover from all registered providers in parallel
  const results = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      models: await discoverModelsForProvider(provider),
    }))
  );

  const allModels = results.flatMap((r) => r.models);

  // Provider priority (lower = preferred). Must match tier-auto-curator.ts.
  const PROVIDER_PRIORITY: Record<string, number> = {
    google: 1, anthropic: 2, together: 3, openai: 4, fireworks: 4, openrouter: 5,
  };

  // Sort by provider priority, then by tier
  allModels.sort((a, b) => {
    if (a.provider !== b.provider) {
      return (PROVIDER_PRIORITY[a.provider] ?? 99) - (PROVIDER_PRIORITY[b.provider] ?? 99);
    }
    return (a.tier || 99) - (b.tier || 99);
  });

  // Set default model (cheapest chat model)
  const chatModels = allModels.filter((m) => m.capability === "text-generation" && !m.deprecated);
  if (chatModels.length > 0) {
    chatModels.sort((a, b) => (a.tier || 99) - (b.tier || 99));
    const defaultModelId = chatModels[0]?.id;
    if (defaultModelId) {
      const idx = allModels.findIndex((m) => m.id === defaultModelId);
      const found = idx >= 0 ? allModels[idx] : undefined;
      if (found) {
        const model = found;
        allModels[idx] = {
          id: model.id,
          name: model.name,
          author: model.author,
          provider: model.provider,
          capability: model.capability,
          description: model.description,
          creditsPerInputToken: model.creditsPerInputToken,
          creditsPerOutputToken: model.creditsPerOutputToken,
          creditsPerImage: model.creditsPerImage,
          creditsPerChar: model.creditsPerChar,
          creditsPerMinute: model.creditsPerMinute,
          maxTokens: model.maxTokens,
          contextWindow: model.contextWindow,
          tier: model.tier,
          badge: model.badge,
          deprecated: model.deprecated,
          deprecationMessage: model.deprecationMessage,
          capabilities: model.capabilities,
          isDefault: true,
        };
      }
    }
  }

  // Cache results and invalidate the model cache in provider-config
  discoveredModelsCache = allModels;
  lastDiscoveryTime = new Date();
  invalidateModelCache();

  // Build per-provider counts dynamically from results
  const perProvider: Record<string, number> = {};
  for (const r of results) {
    perProvider[r.provider] = r.models.length;
  }

  log.info(
    { total: allModels.length, ...perProvider },
    "Model discovery complete"
  );

  return allModels;
}

/**
 * Get discovered models (from cache or discover)
 */
export function getDiscoveredModels(): ModelInfo[] {
  if (discoveredModelsCache) {
    return discoveredModelsCache;
  }
  // Return empty if not yet discovered - caller should await discoverAllModels
  return [];
}

/**
 * Clear the discovery cache
 */
export function clearDiscoveryCache(): void {
  discoveredModelsCache = null;
  lastDiscoveryTime = null;
  log.info("Discovery cache cleared");
}

/**
 * Check if models have been discovered
 */
export function hasDiscoveredModels(): boolean {
  return discoveredModelsCache !== null && discoveredModelsCache.length > 0;
}
