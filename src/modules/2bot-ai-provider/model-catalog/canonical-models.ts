/**
 * Canonical Model Identity Map
 *
 * Maps the same underlying model across multiple providers.
 * This is the data layer the smart router uses to compare prices and
 * select the cheapest available provider for a given model.
 *
 * A "canonical model" is a model that exists on 2+ providers under
 * different IDs. For example, DeepSeek V3 is available on Together AI,
 * Fireworks AI, and OpenRouter — each with different pricing.
 *
 * AUTO-DERIVED from model-registry.ts — any entry with 2+ providers
 * is automatically a canonical model. No manual curation needed.
 *
 * @module modules/2bot-ai-provider/model-catalog/canonical-models
 */

import {
    getImageGenerationPricing,
    getTextGenerationPricing,
} from "../model-pricing";
import { MODEL_REGISTRY } from "../model-registry";
import type { AICapability, TwoBotAIProvider } from "../types";

// ===========================================
// Types
// ===========================================

/**
 * A model available on multiple providers under different IDs.
 */
export interface CanonicalModel {
  /** Stable identifier for this canonical model (e.g., "deepseek-v3") */
  canonicalId: string;
  /** Human-readable name */
  displayName: string;
  /** The AI capability this model provides */
  capability: AICapability;
  /** Provider → actual model ID mapping. Only includes providers that serve this model. */
  providerModelIds: Partial<Record<TwoBotAIProvider, string>>;
}

/**
 * Result of a cheapest-provider lookup.
 */
export interface CheapestProviderResult {
  provider: TwoBotAIProvider;
  modelId: string;
  /** API cost per million tokens (input) — 0 for non-token models */
  apiCostInputPerMTok: number;
  /** API cost per million tokens (output) — 0 for non-token models */
  apiCostOutputPerMTok: number;
  /** Credit cost per input token */
  creditsPerInputToken: number;
  /** Credit cost per output token */
  creditsPerOutputToken: number;
  /** Credit cost per image (for image models) */
  creditsPerImage?: number;
  /** Selection reason */
  reason: "cheapest-available" | "only-provider";
  /** All provider options with their costs (for logging/debugging) */
  allOptions: Array<{
    provider: TwoBotAIProvider;
    modelId: string;
    creditsPerInputToken: number;
    creditsPerOutputToken: number;
    creditsPerImage?: number;
  }>;
}

// ===========================================
// Canonical Model Registry (AUTO-DERIVED)
// ===========================================

/**
 * Auto-derive canonical models from MODEL_REGISTRY.
 *
 * Any registry entry with 2+ providers is automatically a canonical model.
 * Adding a new cross-provider model to model-registry.ts is all that's needed —
 * the canonical list, cheapest-provider selection, and smart routing all update automatically.
 */
function buildCanonicalModels(): CanonicalModel[] {
  return MODEL_REGISTRY
    .filter((entry) => Object.keys(entry.providers).length >= 2)
    .map((entry) => ({
      canonicalId: entry.id,
      displayName: entry.displayName,
      capability: entry.capability,
      providerModelIds: Object.fromEntries(
        Object.entries(entry.providers).map(([provider, cost]) => [provider, cost.modelId])
      ) as Partial<Record<TwoBotAIProvider, string>>,
    }));
}

export const CANONICAL_MODELS: CanonicalModel[] = buildCanonicalModels();

// ===========================================
// Lookup Helpers
// ===========================================

/**
 * Find the canonical model that contains a given provider model ID.
 * Returns undefined if the model isn't cross-provider.
 */
export function getCanonicalModelByProviderModelId(
  providerModelId: string
): CanonicalModel | undefined {
  return CANONICAL_MODELS.find((cm) =>
    Object.values(cm.providerModelIds).includes(providerModelId)
  );
}

/**
 * Find a canonical model by its stable canonical ID.
 */
export function getCanonicalModelById(
  canonicalId: string
): CanonicalModel | undefined {
  return CANONICAL_MODELS.find((cm) => cm.canonicalId === canonicalId);
}

/**
 * Get all canonical models for a given capability.
 */
export function getCanonicalModelsByCapability(
  capability: AICapability
): CanonicalModel[] {
  return CANONICAL_MODELS.filter((cm) => cm.capability === capability);
}

/**
 * Check if a provider model ID belongs to a cross-provider (canonical) model.
 */
export function isCrossProviderModel(providerModelId: string): boolean {
  return getCanonicalModelByProviderModelId(providerModelId) !== undefined;
}

/**
 * Get all providers that serve a given canonical model.
 */
export function getProvidersForCanonicalModel(
  canonicalId: string
): TwoBotAIProvider[] {
  const cm = getCanonicalModelById(canonicalId);
  if (!cm) return [];
  return Object.keys(cm.providerModelIds) as TwoBotAIProvider[];
}

/**
 * Select the cheapest available provider for a canonical model.
 *
 * Compares credit costs from model-pricing.ts across all providers that
 * serve this model, filtered to only those that are currently configured.
 *
 * @param canonicalId - The canonical model ID (e.g., "deepseek-v3")
 * @param isConfigured - Function to check if a provider's API key is valid
 * @returns The cheapest available provider, or undefined if none are configured
 */
export function getCheapestProvider(
  canonicalId: string,
  isConfigured: (provider: TwoBotAIProvider) => boolean
): CheapestProviderResult | undefined {
  const cm = getCanonicalModelById(canonicalId);
  if (!cm) return undefined;

  const entries = Object.entries(cm.providerModelIds) as Array<
    [TwoBotAIProvider, string]
  >;

  // Build cost options for all providers
  const options: CheapestProviderResult["allOptions"] = [];

  for (const [provider, modelId] of entries) {
    if (!isConfigured(provider)) continue;

    if (cm.capability === "text-generation") {
      const pricing = getTextGenerationPricing(modelId);
      if (pricing) {
        options.push({
          provider,
          modelId,
          creditsPerInputToken: pricing.creditsPerInputToken,
          creditsPerOutputToken: pricing.creditsPerOutputToken,
        });
      }
    } else if (cm.capability === "image-generation") {
      const pricing = getImageGenerationPricing(modelId);
      if (pricing) {
        options.push({
          provider,
          modelId,
          creditsPerInputToken: 0,
          creditsPerOutputToken: 0,
          creditsPerImage: pricing.creditsPerImage,
        });
      }
    }
  }

  if (options.length === 0) return undefined;

  // Sort by cost: for text models, use (input + output) as proxy;
  // for image models, use creditsPerImage
  options.sort((a, b) => {
    if (cm.capability === "image-generation") {
      return (a.creditsPerImage ?? 0) - (b.creditsPerImage ?? 0);
    }
    const costA = a.creditsPerInputToken + a.creditsPerOutputToken;
    const costB = b.creditsPerInputToken + b.creditsPerOutputToken;
    return costA - costB;
  });

  const cheapest = options[0];
  if (!cheapest) return undefined;

  // Reverse-calculate API cost from credits (credits = API_cost × 300)
  // API cost per MTok = (creditsPerToken / 300) × 1_000_000
  const apiCostInputPerMTok =
    cm.capability === "text-generation"
      ? (cheapest.creditsPerInputToken / 300) * 1_000_000
      : 0;
  const apiCostOutputPerMTok =
    cm.capability === "text-generation"
      ? (cheapest.creditsPerOutputToken / 300) * 1_000_000
      : 0;

  return {
    provider: cheapest.provider,
    modelId: cheapest.modelId,
    apiCostInputPerMTok,
    apiCostOutputPerMTok,
    creditsPerInputToken: cheapest.creditsPerInputToken,
    creditsPerOutputToken: cheapest.creditsPerOutputToken,
    creditsPerImage: cheapest.creditsPerImage,
    reason: options.length === 1 ? "only-provider" : "cheapest-available",
    allOptions: options,
  };
}
