/**
 * Smart Provider Router
 *
 * Cost-aware provider selection that replaces the fake `selectByLowestCost()`
 * in model-resolver.ts. Uses three data sources:
 *
 * 1. **provider-registry.ts** — which providers are configured
 * 2. **canonical-models.ts** — which models exist on multiple providers
 * 3. **model-pricing.ts** — credit costs for each provider's model ID
 *
 * Flow:
 * 1. Receive candidate ProviderModelOption[] from model-mappings.ts
 * 2. Filter to only configured providers
 * 3. For each option, check if it's a cross-provider (canonical) model
 * 4. If canonical → compare credit costs across all configured providers
 * 5. If not canonical → use single provider's cost
 * 6. Return cheapest available with full cost breakdown
 *
 * @module modules/2bot-ai-provider/smart-provider-router
 */

import { logger } from "@/lib/logger";
import {
  getCanonicalModelByProviderModelId,
  getCheapestProvider
} from "./model-catalog/canonical-models";
import type { ProviderModelOption, RoutingPreference } from "./model-catalog/model-catalog.types";
import {
  getImageGenerationPricing,
  getSpeechRecognitionPricing,
  getSpeechSynthesisPricing,
  getTextEmbeddingPricing,
  getTextGenerationPricing,
} from "./model-pricing";
import { isProviderConfigured } from "./provider-config";
import type { AICapability, TwoBotAIProvider } from "./types";

const log = logger.child({ module: "smart-provider-router" });

// ===========================================
// Types
// ===========================================

export interface SmartProviderSelection {
  /** Selected provider */
  provider: TwoBotAIProvider;
  /** The actual model ID to send to the provider's API */
  providerModelId: string;
  /** Credit cost for this selection */
  creditCost: {
    creditsPerInputToken?: number;
    creditsPerOutputToken?: number;
    creditsPerImage?: number;
    creditsPerChar?: number;
    creditsPerMinute?: number;
  };
  /** Why this provider was selected */
  reason: SmartSelectionReason;
  /** Other available providers with cost comparison */
  alternatives: SmartProviderAlternative[];
  /** Whether cross-provider comparison was used */
  isCrossProviderRouted: boolean;
  /** Canonical model ID if cross-provider, undefined otherwise */
  canonicalId?: string;
}

export type SmartSelectionReason =
  | "cheapest-available"   // Selected because it's the cheapest configured provider
  | "only-provider"        // Only one configured provider has this model
  | "priority-fallback"    // No pricing data; fell back to priority order
  | "single-provider";     // Model only exists on one provider (not canonical)

export interface SmartProviderAlternative {
  provider: TwoBotAIProvider;
  modelId: string;
  creditCost: {
    creditsPerInputToken?: number;
    creditsPerOutputToken?: number;
    creditsPerImage?: number;
  };
}

// ===========================================
// Smart Selection
// ===========================================

/**
 * Optional tier cost range for filtering models by cost bracket.
 * When provided, only models within the min/max cost range are considered.
 */
export interface TierCostRange {
  min: number;
  max: number;
}

/**
 * Select the cheapest available provider for a set of provider model options.
 *
 * This is the core function that replaces `selectByLowestCost()` in model-resolver.ts.
 *
 * @param options - Available provider model options (from model-mappings.ts)
 * @param capability - The AI capability being requested
 * @param tierCostRange - Optional min/max cost range to filter models by tier
 * @param routingPreference - User's quality preference for sorting within tier
 * @returns The smartest selection, or undefined if no providers are available
 */
export function selectSmartProvider(
  options: ProviderModelOption[],
  capability: AICapability,
  tierCostRange?: TierCostRange,
  routingPreference?: RoutingPreference
): SmartProviderSelection | undefined {
  // 1. Filter to only configured providers
  let configuredOptions = options.filter((opt) =>
    isProviderConfigured(opt.provider)
  );

  if (configuredOptions.length === 0) {
    log.warn({ capability, totalOptions: options.length }, "No configured providers available");
    return undefined;
  }

  // 1.5. Apply tier cost guardrails — remove models outside the tier's cost bracket
  if (tierCostRange) {
    const withinBudget = configuredOptions.filter((opt) => {
      const creditCost = getModelCreditCost(opt.modelId, capability);
      if (!creditCost) return true; // Keep models without pricing data (will be handled downstream)
      const cost = computeComparableCost(creditCost, capability);
      return cost >= tierCostRange.min && cost <= tierCostRange.max;
    });

    if (withinBudget.length > 0) {
      log.debug(
        { capability, before: configuredOptions.length, after: withinBudget.length, tierCostRange },
        "Smart router: filtered by tier cost range"
      );
      configuredOptions = withinBudget;
    } else {
      log.warn(
        { capability, tierCostRange, totalOptions: configuredOptions.length },
        "Smart router: no models within tier cost range — using all configured options"
      );
    }
  }

  // 2. Check if any option is a cross-provider (canonical) model
  //    Try the first option — if it's canonical, all options for the same
  //    underlying model will be in the canonical map
  const firstOption = configuredOptions[0];
  if (!firstOption) return undefined;
  const canonical = getCanonicalModelByProviderModelId(firstOption.modelId);

  if (canonical) {
    // Cross-provider model — use canonical comparison
    return selectViaCrossProvider(canonical.canonicalId, configuredOptions, capability);
  }

  // 3. Not canonical — compare costs directly from pricing tables
  return selectViaPricingComparison(configuredOptions, capability, routingPreference);
}

/**
 * Cross-provider selection: same model on multiple providers.
 * Uses getCheapestProvider() from canonical-models.ts which compares
 * credit costs from model-pricing.ts.
 */
function selectViaCrossProvider(
  canonicalId: string,
  configuredOptions: ProviderModelOption[],
  capability: AICapability
): SmartProviderSelection | undefined {
  const cheapest = getCheapestProvider(canonicalId, isProviderConfigured);

  if (cheapest) {
    // Build alternatives list (exclude the selected one)
    const alternatives: SmartProviderAlternative[] = cheapest.allOptions
      .filter((opt) => opt.provider !== cheapest.provider || opt.modelId !== cheapest.modelId)
      .map((opt) => ({
        provider: opt.provider,
        modelId: opt.modelId,
        creditCost: {
          creditsPerInputToken: opt.creditsPerInputToken || undefined,
          creditsPerOutputToken: opt.creditsPerOutputToken || undefined,
          creditsPerImage: opt.creditsPerImage,
        },
      }));

    log.info(
      {
        canonicalId,
        selected: { provider: cheapest.provider, modelId: cheapest.modelId },
        reason: cheapest.reason,
        alternativeCount: alternatives.length,
      },
      "Smart router: cross-provider selection"
    );

    return {
      provider: cheapest.provider,
      providerModelId: cheapest.modelId,
      creditCost: {
        creditsPerInputToken: cheapest.creditsPerInputToken || undefined,
        creditsPerOutputToken: cheapest.creditsPerOutputToken || undefined,
        creditsPerImage: cheapest.creditsPerImage,
      },
      reason: cheapest.reason,
      alternatives,
      isCrossProviderRouted: true,
      canonicalId,
    };
  }

  // Canonical model exists but no configured provider has pricing data —
  // fall back to priority from the options list
  log.warn({ canonicalId }, "Cross-provider model found but no pricing data — falling back to priority");
  return selectByPriorityFallback(configuredOptions, capability);
}

/**
 * Direct pricing comparison for non-canonical models.
 * Each option is a different model — compare their credit costs directly.
 * Supports routing preference to sort by quality (most expensive), balanced (median), or cost (cheapest).
 */
function selectViaPricingComparison(
  options: ProviderModelOption[],
  capability: AICapability,
  routingPreference?: RoutingPreference
): SmartProviderSelection | undefined {
  // Build cost entries for each option
  const costed: Array<{
    option: ProviderModelOption;
    cost: number; // Comparable cost metric
    creditCost: SmartProviderSelection["creditCost"];
  }> = [];

  for (const opt of options) {
    const creditCost = getModelCreditCost(opt.modelId, capability);
    if (creditCost) {
      const cost = computeComparableCost(creditCost, capability);
      costed.push({ option: opt, cost, creditCost });
    }
  }

  if (costed.length === 0) {
    // No pricing data for any option — fall back to priority
    return selectByPriorityFallback(options, capability);
  }

  // Sort by cost ascending
  costed.sort((a, b) => a.cost - b.cost);

  // Apply routing preference to reorder within tier
  if (routingPreference === 'quality') {
    // Most expensive (= highest quality) first
    costed.reverse();
  } else if (routingPreference === 'balanced' && costed.length > 2) {
    // Pick median cost option as primary, keep rest in ascending order
    const midIdx = Math.floor(costed.length / 2);
    const mid = costed.splice(midIdx, 1)[0];
    if (mid) costed.unshift(mid);
  }
  // 'cost' or undefined = default ascending sort (cheapest first)

  const selected = costed[0];
  if (!selected) return undefined;
  const alternatives: SmartProviderAlternative[] = costed.slice(1).map((c) => ({
    provider: c.option.provider,
    modelId: c.option.modelId,
    creditCost: {
      creditsPerInputToken: c.creditCost.creditsPerInputToken,
      creditsPerOutputToken: c.creditCost.creditsPerOutputToken,
      creditsPerImage: c.creditCost.creditsPerImage,
    },
  }));

  const reason: SmartSelectionReason =
    costed.length === 1 ? "single-provider" : "cheapest-available";

  log.debug(
    {
      selected: { provider: selected.option.provider, modelId: selected.option.modelId },
      reason,
      alternativeCount: alternatives.length,
    },
    "Smart router: pricing comparison selection"
  );

  return {
    provider: selected.option.provider,
    providerModelId: selected.option.modelId,
    creditCost: selected.creditCost,
    reason,
    alternatives,
    isCrossProviderRouted: false,
  };
}

/**
 * Priority fallback: when no pricing data is available.
 * Uses the existing priority order from model-mappings.ts.
 */
function selectByPriorityFallback(
  options: ProviderModelOption[],
  _capability: AICapability
): SmartProviderSelection | undefined {
  if (options.length === 0) return undefined;

  const sorted = [...options].sort((a, b) => a.priority - b.priority);
  const selected = sorted[0];
  if (!selected) return undefined;

  log.debug(
    { provider: selected.provider, modelId: selected.modelId },
    "Smart router: priority fallback (no pricing data)"
  );

  return {
    provider: selected.provider,
    providerModelId: selected.modelId,
    creditCost: {},
    reason: "priority-fallback",
    alternatives: sorted.slice(1).map((opt) => ({
      provider: opt.provider,
      modelId: opt.modelId,
      creditCost: {},
    })),
    isCrossProviderRouted: false,
  };
}

// ===========================================
// Cost Helpers
// ===========================================

/**
 * Get credit cost for a model ID by looking up model-pricing.ts.
 */
function getModelCreditCost(
  modelId: string,
  capability: AICapability
): SmartProviderSelection["creditCost"] | undefined {
  switch (capability) {
    case "text-generation": {
      const pricing = getTextGenerationPricing(modelId);
      if (!pricing) return undefined;
      return {
        creditsPerInputToken: pricing.creditsPerInputToken,
        creditsPerOutputToken: pricing.creditsPerOutputToken,
      };
    }
    case "image-generation": {
      const pricing = getImageGenerationPricing(modelId);
      if (!pricing) return undefined;
      return { creditsPerImage: pricing.creditsPerImage };
    }
    case "speech-synthesis": {
      const pricing = getSpeechSynthesisPricing(modelId);
      if (!pricing) return undefined;
      return { creditsPerChar: pricing.creditsPerChar };
    }
    case "speech-recognition": {
      const pricing = getSpeechRecognitionPricing(modelId);
      if (!pricing) return undefined;
      return { creditsPerMinute: pricing.creditsPerMinute };
    }
    case "text-embedding": {
      const pricing = getTextEmbeddingPricing(modelId);
      if (!pricing) return undefined;
      return { creditsPerInputToken: pricing.creditsPerInputToken };
    }
    default:
      return undefined;
  }
}

/**
 * Compute a single comparable cost number for sorting.
 * For text models: sum of input + output credits per token.
 * For image models: credits per image.
 * For speech: credits per char or per minute.
 */
function computeComparableCost(
  creditCost: SmartProviderSelection["creditCost"],
  capability: AICapability
): number {
  switch (capability) {
    case "text-generation":
    case "text-embedding":
      return (creditCost.creditsPerInputToken ?? 0) + (creditCost.creditsPerOutputToken ?? 0);
    case "image-generation":
      return creditCost.creditsPerImage ?? Infinity;
    case "speech-synthesis":
      return creditCost.creditsPerChar ?? Infinity;
    case "speech-recognition":
      return creditCost.creditsPerMinute ?? Infinity;
    default:
      return Infinity;
  }
}
