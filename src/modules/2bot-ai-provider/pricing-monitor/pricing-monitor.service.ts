/**
 * Provider Price Monitor Service
 *
 * Core service that orchestrates the pricing audit across ALL model types:
 * chat, image, video, audio, embedding, transcribe, moderation, rerank.
 *
 * 1. Calls each registered ProviderFetcher to get live model data
 * 2. Compares against our model-pricing.ts entries (all pricing maps)
 * 3. Generates a PricingAuditReport with mismatches, new models, removed models
 *
 * Pricing units supported:
 * - per_mtok: text generation, embedding, moderation, rerank, audio
 * - per_image: image generation (DALL-E, FLUX, etc.)
 * - per_char: speech synthesis (TTS)
 * - per_minute: speech recognition (Whisper)
 *
 * @module modules/2bot-ai-provider/pricing-monitor/pricing-monitor.service
 */

import {
    ANTHROPIC_TEXT_GENERATION_PRICING,
    FIREWORKS_IMAGE_GENERATION_PRICING,
    FIREWORKS_TEXT_GENERATION_PRICING,
    OPENAI_IMAGE_GENERATION_PRICING,
    OPENAI_SPEECH_RECOGNITION_PRICING,
    OPENAI_SPEECH_SYNTHESIS_PRICING,
    OPENAI_TEXT_EMBEDDING_PRICING,
    OPENAI_TEXT_GENERATION_PRICING,
    OPENROUTER_TEXT_GENERATION_PRICING,
    TOGETHER_IMAGE_GENERATION_PRICING,
    TOGETHER_TEXT_EMBEDDING_PRICING,
    TOGETHER_TEXT_GENERATION_PRICING,
} from "../model-pricing";

import type {
    ModelType,
    PriceMismatch,
    PricingAuditReport,
    PricingUnit,
    ProviderAuditResult,
    ProviderFetcher,
    UnverifiableModelInfo,
    VerificationSource,
    VerifiedModelInfo,
} from "./pricing-monitor.types";

import {
    AnthropicFetcher,
    FireworksFetcher,
    OpenAIFetcher,
    OpenRouterFetcher,
    TogetherAIFetcher,
} from "./provider-fetchers";

import {
    buildWebPriceLookup,
    fetchTogetherAIWebPrices,
    findWebPriceForModel,
    type WebPriceEntry,
} from "./provider-fetchers/together-ai-web.fetcher";

import {
    buildFireworksWebPriceLookup,
    fetchFireworksWebPrices,
    findFireworksWebPriceForModel,
    type FireworksWebPriceEntry,
} from "./provider-fetchers/fireworks-web.fetcher";

// ===========================================
// Provider Registry (add new providers here)
// ===========================================

const PROVIDER_FETCHERS: ProviderFetcher[] = [
  new TogetherAIFetcher(),
  new AnthropicFetcher(),
  new OpenAIFetcher(),
  new FireworksFetcher(),
  new OpenRouterFetcher(),
];

// ===========================================
// Our Pricing Registry (what we compare against)
// ===========================================

interface OurModelEntry {
  modelId: string;
  providerId: string;
  type: ModelType;
  pricingUnit: PricingUnit;
  // per_mtok fields
  inputPerMTok?: number;
  outputPerMTok?: number;
  // per_image field
  perImage?: number;
  // per_char field
  perChar?: number;
  // per_minute field
  perMinute?: number;
}

/**
 * Build a flat list of ALL models in our model-pricing.ts
 * covering every pricing map: text gen, image gen, speech, embedding.
 *
 * Credits formula: creditsPerToken = $/MTok × 300 / 1,000,000
 * Reverse:         $/MTok = creditsPerToken × 1,000,000 / 300
 *
 * Image:    creditsPerImage = $/image × 300
 * Reverse:  $/image = creditsPerImage / 300
 *
 * Char:     creditsPerChar = $/char × 300
 * Reverse:  $/char = creditsPerChar / 300
 *
 * Minute:   creditsPerMinute = $/minute × 300
 * Reverse:  $/minute = creditsPerMinute / 300
 */
function getOurModels(): OurModelEntry[] {
  const entries: OurModelEntry[] = [];
  const CREDITS_TO_DOLLARS_MTOK = 1_000_000 / 300;  // For per-token pricing
  const CREDITS_TO_DOLLARS = 1 / 300;                // For per-image, per-char, per-minute

  // ── Text Generation (per_mtok) ──

  for (const [modelId, pricing] of Object.entries(OPENAI_TEXT_GENERATION_PRICING)) {
    entries.push({
      modelId, providerId: "openai", type: "chat", pricingUnit: "per_mtok",
      inputPerMTok: pricing.creditsPerInputToken * CREDITS_TO_DOLLARS_MTOK,
      outputPerMTok: pricing.creditsPerOutputToken * CREDITS_TO_DOLLARS_MTOK,
    });
  }

  for (const [modelId, pricing] of Object.entries(ANTHROPIC_TEXT_GENERATION_PRICING)) {
    entries.push({
      modelId, providerId: "anthropic", type: "chat", pricingUnit: "per_mtok",
      inputPerMTok: pricing.creditsPerInputToken * CREDITS_TO_DOLLARS_MTOK,
      outputPerMTok: pricing.creditsPerOutputToken * CREDITS_TO_DOLLARS_MTOK,
    });
  }

  for (const [modelId, pricing] of Object.entries(TOGETHER_TEXT_GENERATION_PRICING)) {
    entries.push({
      modelId, providerId: "together-ai", type: "chat", pricingUnit: "per_mtok",
      inputPerMTok: pricing.creditsPerInputToken * CREDITS_TO_DOLLARS_MTOK,
      outputPerMTok: pricing.creditsPerOutputToken * CREDITS_TO_DOLLARS_MTOK,
    });
  }

  // ── Image Generation (per_image) ──

  for (const [modelId, pricing] of Object.entries(OPENAI_IMAGE_GENERATION_PRICING)) {
    entries.push({
      modelId, providerId: "openai", type: "image", pricingUnit: "per_image",
      perImage: pricing.creditsPerImage * CREDITS_TO_DOLLARS,
    });
  }

  for (const [modelId, pricing] of Object.entries(TOGETHER_IMAGE_GENERATION_PRICING)) {
    entries.push({
      modelId, providerId: "together-ai", type: "image", pricingUnit: "per_image",
      perImage: pricing.creditsPerImage * CREDITS_TO_DOLLARS,
    });
  }

  // ── Speech Synthesis (per_char) ──

  for (const [modelId, pricing] of Object.entries(OPENAI_SPEECH_SYNTHESIS_PRICING)) {
    entries.push({
      modelId, providerId: "openai", type: "audio", pricingUnit: "per_char",
      perChar: pricing.creditsPerChar * CREDITS_TO_DOLLARS,
    });
  }

  // ── Speech Recognition (per_minute) ──

  for (const [modelId, pricing] of Object.entries(OPENAI_SPEECH_RECOGNITION_PRICING)) {
    entries.push({
      modelId, providerId: "openai", type: "audio", pricingUnit: "per_minute",
      perMinute: pricing.creditsPerMinute * CREDITS_TO_DOLLARS,
    });
  }

  // ── Text Embedding (per_mtok) ──

  for (const [modelId, pricing] of Object.entries(OPENAI_TEXT_EMBEDDING_PRICING)) {
    entries.push({
      modelId, providerId: "openai", type: "embedding", pricingUnit: "per_mtok",
      inputPerMTok: pricing.creditsPerInputToken * CREDITS_TO_DOLLARS_MTOK,
      outputPerMTok: 0,
    });
  }

  for (const [modelId, pricing] of Object.entries(TOGETHER_TEXT_EMBEDDING_PRICING)) {
    entries.push({
      modelId, providerId: "together-ai", type: "embedding", pricingUnit: "per_mtok",
      inputPerMTok: pricing.creditsPerInputToken * CREDITS_TO_DOLLARS_MTOK,
      outputPerMTok: 0,
    });
  }

  // ── Fireworks AI Text Generation (per_mtok) ──

  for (const [modelId, pricing] of Object.entries(FIREWORKS_TEXT_GENERATION_PRICING)) {
    entries.push({
      modelId, providerId: "fireworks", type: "chat", pricingUnit: "per_mtok",
      inputPerMTok: pricing.creditsPerInputToken * CREDITS_TO_DOLLARS_MTOK,
      outputPerMTok: pricing.creditsPerOutputToken * CREDITS_TO_DOLLARS_MTOK,
    });
  }

  // ── Fireworks AI Image Generation (per_image) ──

  for (const [modelId, pricing] of Object.entries(FIREWORKS_IMAGE_GENERATION_PRICING)) {
    entries.push({
      modelId, providerId: "fireworks", type: "image", pricingUnit: "per_image",
      perImage: pricing.creditsPerImage * CREDITS_TO_DOLLARS,
    });
  }

  // ── OpenRouter Text Generation (per_mtok) ──

  for (const [modelId, pricing] of Object.entries(OPENROUTER_TEXT_GENERATION_PRICING)) {
    entries.push({
      modelId, providerId: "openrouter", type: "chat", pricingUnit: "per_mtok",
      inputPerMTok: pricing.creditsPerInputToken * CREDITS_TO_DOLLARS_MTOK,
      outputPerMTok: pricing.creditsPerOutputToken * CREDITS_TO_DOLLARS_MTOK,
    });
  }

  return entries;
}

/**
 * Get all model IDs from our pricing system for a given provider
 */
function getOurModelIdsForProvider(providerId: string): Set<string> {
  const models = getOurModels().filter((m) => m.providerId === providerId);
  return new Set(models.map((m) => m.modelId));
}

// ===========================================
// Price Comparison Logic
// ===========================================

/** Tolerance for floating point comparison (0.1% — anything beyond this is a real mismatch) */
const PRICE_TOLERANCE = 0.001;

function pricesMatch(our: number, theirs: number): boolean {
  if (our === 0 && theirs === 0) return true;
  if (our === 0 || theirs === 0) return false;
  return Math.abs(our - theirs) / Math.max(our, theirs) < PRICE_TOLERANCE;
}

function percentDiff(our: number, theirs: number): number {
  if (our === 0) return theirs === 0 ? 0 : 100;
  return ((theirs - our) / our) * 100;
}

// ===========================================
// Fuzzy Model ID Matching
// ===========================================

/**
 * Strip trailing date suffixes (e.g., "-20251022") for base name matching.
 */
function stripDateSuffix(modelId: string): string {
  return modelId.replace(/-\d{8}$/, "");
}

/**
 * Try to find our model entry for a provider model ID.
 * Supports exact match, prefix match, base name match.
 */
function findOurModel(
  providerModelId: string,
  ourModelsMap: Map<string, OurModelEntry>
): OurModelEntry | undefined {
  const exact = ourModelsMap.get(providerModelId);
  if (exact) return exact;

  for (const [ourId, ourModel] of ourModelsMap) {
    if (ourId.startsWith(providerModelId + "-") || ourId.startsWith(providerModelId + "2")) {
      return ourModel;
    }
  }

  for (const [ourId, ourModel] of ourModelsMap) {
    if (providerModelId.startsWith(ourId) && /^(-v\d|-\d{8})/.test(providerModelId.slice(ourId.length))) {
      return ourModel;
    }
  }

  const providerBase = stripDateSuffix(providerModelId);
  for (const [ourId, ourModel] of ourModelsMap) {
    if (stripDateSuffix(ourId) === providerBase) {
      return ourModel;
    }
  }

  return undefined;
}

/**
 * Check if our model ID is covered by any provider model ID (reverse fuzzy)
 */
function providerIdMatchesAnyProvider(ourModelId: string, providerModelIds: Set<string>): boolean {
  if (providerModelIds.has(ourModelId)) return true;
  
  for (const provId of providerModelIds) {
    if (ourModelId.startsWith(provId + "-") || ourModelId.startsWith(provId + "2")) return true;
    if (provId.startsWith(ourModelId) && /^(-v\d|-\d{8})/.test(provId.slice(ourModelId.length))) return true;
  }
  
  const ourBase = stripDateSuffix(ourModelId);
  for (const provId of providerModelIds) {
    if (stripDateSuffix(provId) === ourBase) return true;
  }
  
  return false;
}

// ===========================================
// Multi-Type Price Comparison
// ===========================================

import type { ProviderModelInfo } from "./pricing-monitor.types";

/**
 * 3-way comparison result:
 * - 'verified': prices match between our system and provider API
 * - 'mismatch': prices differ
 * - 'no_provider_data': provider API doesn't expose pricing for this model type
 */
type CompareResult =
  | { status: 'verified' }
  | { status: 'mismatch'; mismatch: PriceMismatch }
  | { status: 'no_provider_data'; reason: string };

/**
 * Compare pricing between our model and the provider's model.
 * Handles different pricing units: per_mtok, per_image, per_char, per_minute.
 *
 * Returns a 3-way result: verified, mismatch, or no_provider_data.
 */
function comparePricing(
  ourModel: OurModelEntry,
  provModel: ProviderModelInfo
): CompareResult {
  const unit = ourModel.pricingUnit;

  if (unit === "per_mtok") {
    // Provider must have per_mtok pricing data to compare
    if (!provModel.pricing) {
      return { status: 'no_provider_data', reason: 'Provider API returns no token pricing for this model' };
    }
    if (provModel.pricing.inputPerMTok === 0 && provModel.pricing.outputPerMTok === 0) {
      // Legitimate free models: if our price is also $0, that's a verified match
      if ((ourModel.inputPerMTok || 0) === 0 && (ourModel.outputPerMTok || 0) === 0) {
        return { status: 'verified' };
      }
      return { status: 'no_provider_data', reason: 'Provider API returns $0 pricing (not exposed)' };
    }

    const inputMatch = pricesMatch(ourModel.inputPerMTok || 0, provModel.pricing.inputPerMTok);
    // Embedding models only have meaningful input pricing — skip output comparison
    const isEmbedding = provModel.type === "embedding" || !ourModel.outputPerMTok;
    const outputMatch = isEmbedding ? true : pricesMatch(ourModel.outputPerMTok || 0, provModel.pricing.outputPerMTok);

    if (!inputMatch || !outputMatch) {
      const maxInputDiff = Math.abs(percentDiff(ourModel.inputPerMTok || 0, provModel.pricing.inputPerMTok));
      const maxOutputDiff = Math.abs(percentDiff(ourModel.outputPerMTok || 0, provModel.pricing.outputPerMTok));
      return {
        status: 'mismatch',
        mismatch: {
          modelId: provModel.modelId,
          displayName: provModel.displayName,
          type: provModel.type,
          pricingUnit: "per_mtok",
          field: !inputMatch && !outputMatch ? "both" : !inputMatch ? "input" : "output",
          our: {
            inputPerMTok: round6(ourModel.inputPerMTok || 0),
            outputPerMTok: round6(ourModel.outputPerMTok || 0),
          },
          provider: {
            inputPerMTok: provModel.pricing.inputPerMTok,
            outputPerMTok: provModel.pricing.outputPerMTok,
          },
          diffPercent: Math.round(Math.max(maxInputDiff, maxOutputDiff) * 10) / 10,
        },
      };
    }
    return { status: 'verified' };
  }

  if (unit === "per_image") {
    if (!provModel.imagePricing) {
      return { status: 'no_provider_data', reason: 'Provider API returns no per-image pricing' };
    }
    if (!pricesMatch(ourModel.perImage || 0, provModel.imagePricing.perImage)) {
      return {
        status: 'mismatch',
        mismatch: {
          modelId: provModel.modelId,
          displayName: provModel.displayName,
          type: provModel.type,
          pricingUnit: "per_image",
          field: "price",
          our: { perImage: round6(ourModel.perImage || 0) },
          provider: { perImage: provModel.imagePricing.perImage },
          diffPercent: Math.round(percentDiff(ourModel.perImage || 0, provModel.imagePricing.perImage) * 10) / 10,
        },
      };
    }
    return { status: 'verified' };
  }

  // per_char, per_minute — provider has no data for these
  return { status: 'no_provider_data', reason: `Provider API has no ${unit} pricing data` };
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Build a VerifiedModelInfo from our model entry
 */
function buildVerifiedInfo(
  ourModel: OurModelEntry,
  provModel: ProviderModelInfo,
  source: VerificationSource = 'api',
  webPrice?: string
): VerifiedModelInfo {
  return {
    modelId: provModel.modelId,
    displayName: provModel.displayName,
    type: provModel.type,
    pricingUnit: ourModel.pricingUnit,
    inputPerMTok: ourModel.inputPerMTok !== undefined ? round6(ourModel.inputPerMTok) : undefined,
    outputPerMTok: ourModel.outputPerMTok !== undefined ? round6(ourModel.outputPerMTok) : undefined,
    perImage: ourModel.perImage !== undefined ? round6(ourModel.perImage) : undefined,
    perChar: ourModel.perChar !== undefined ? round6(ourModel.perChar) : undefined,
    perMinute: ourModel.perMinute !== undefined ? round6(ourModel.perMinute) : undefined,
    verificationSource: source,
    webPrice,
  };
}

/**
 * Build an UnverifiableModelInfo — we have pricing but can't verify against provider API
 */
function buildUnverifiableInfo(
  ourModel: OurModelEntry,
  provModel: ProviderModelInfo,
  reason: string
): UnverifiableModelInfo {
  let ourPrice = '';
  if (ourModel.pricingUnit === 'per_image') {
    ourPrice = `$${round6(ourModel.perImage || 0)}/image`;
  } else if (ourModel.pricingUnit === 'per_mtok') {
    ourPrice = `$${round6(ourModel.inputPerMTok || 0)}/$${round6(ourModel.outputPerMTok || 0)} /MTok`;
  } else if (ourModel.pricingUnit === 'per_char') {
    ourPrice = `$${round6(ourModel.perChar || 0)}/char`;
  } else if (ourModel.pricingUnit === 'per_minute') {
    ourPrice = `$${round6(ourModel.perMinute || 0)}/min`;
  }

  return {
    modelId: provModel.modelId,
    displayName: provModel.displayName,
    type: provModel.type,
    ourPricingUnit: ourModel.pricingUnit,
    ourPrice,
    reason,
  };
}

// ===========================================
// Core Audit Logic
// ===========================================


/**
 * Audit a single provider: compare their live data with our pricing
 */
async function auditProvider(fetcher: ProviderFetcher): Promise<ProviderAuditResult> {
  const result: ProviderAuditResult = {
    providerId: fetcher.providerId,
    providerName: fetcher.providerName,
    supportsPricing: fetcher.supportsPricing,
    supportsCapabilities: fetcher.supportsCapabilities,
    status: "ok",
    totalModelsFromProvider: 0,
    matchedModels: 0,
    priceMismatches: [],
    newModels: [],
    removedModels: [],
    verifiedModels: [],
    unverifiableModels: [],
  };

  try {
    const providerModels = await fetcher.fetchModels();
    result.totalModelsFromProvider = providerModels.length;

    const ourModelIds = getOurModelIdsForProvider(fetcher.providerId);
    const ourModels = getOurModels().filter((m) => m.providerId === fetcher.providerId);
    const ourModelsMap = new Map(ourModels.map((m) => [m.modelId, m]));

    const providerModelIds = new Set(providerModels.map((m) => m.modelId));

    // Check each provider model
    for (const provModel of providerModels) {
      const ourModel = findOurModel(provModel.modelId, ourModelsMap);

      if (!ourModel) {
        // Model exists at provider but not in our system
        result.newModels.push({
          modelId: provModel.modelId,
          displayName: provModel.displayName,
          type: provModel.type,
          pricingUnit: provModel.pricingUnit,
          pricing: provModel.pricing,
          imagePricing: provModel.imagePricing,
          contextLength: provModel.contextLength,
        });
        continue;
      }

      result.matchedModels++;

      // Compare pricing if provider supports it
      if (fetcher.supportsPricing) {
        const compareResult = comparePricing(ourModel, provModel);
        if (compareResult.status === 'mismatch') {
          result.priceMismatches.push(compareResult.mismatch);
        } else if (compareResult.status === 'verified') {
          result.verifiedModels.push(buildVerifiedInfo(ourModel, provModel, 'api'));
        } else {
          // Provider API doesn't expose pricing for this model type
          result.unverifiableModels.push(buildUnverifiableInfo(ourModel, provModel, compareResult.reason));
        }
      } else {
        // No pricing to compare — just mark as verified (model exists)
        result.verifiedModels.push(buildVerifiedInfo(ourModel, provModel));
      }
    }

    // Check for models WE have that the provider no longer lists
    for (const ourModelId of ourModelIds) {
      if (!providerModelIds.has(ourModelId) && !providerIdMatchesAnyProvider(ourModelId, providerModelIds)) {
        const ourModel = ourModelsMap.get(ourModelId);
        result.removedModels.push({
          modelId: ourModelId,
          type: ourModel?.type || "unknown",
        });
      }
    }
  } catch (err) {
    result.status = "error";
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ===========================================
// Web Price Merging
// ===========================================

/**
 * Compare our price against a web-scraped price for a model.
 * Returns true if the prices match within tolerance.
 */
function webPriceMatchesOurs(ourModel: OurModelEntry, webEntry: WebPriceEntry): boolean {
  const unit = ourModel.pricingUnit;

  if (unit === 'per_image' && (webEntry.pricingUnit === 'per_image')) {
    return pricesMatch(ourModel.perImage || 0, webEntry.price);
  }

  if (unit === 'per_mtok' && webEntry.pricingUnit === 'per_mtok') {
    // Web page only shows a single price (input) for embedding/moderation
    // Compare input price only
    return pricesMatch(ourModel.inputPerMTok || 0, webEntry.price);
  }

  // For per_char: web shows "per 1M Characters" ($65 = $65/1M chars)
  // Our system stores per_char. Convert: $65/1M chars = $0.000065/char
  if (unit === 'per_char' && webEntry.pricingUnit === 'per_char') {
    const webPerChar = webEntry.price / 1_000_000; // Convert from per-1M-chars to per-char
    return pricesMatch(ourModel.perChar || 0, webPerChar);
  }

  if (unit === 'per_minute' && webEntry.pricingUnit === 'per_minute') {
    return pricesMatch(ourModel.perMinute || 0, webEntry.price);
  }

  return false;
}

/**
 * Format a web price for display in the UI.
 */
function formatWebPrice(webEntry: WebPriceEntry): string {
  switch (webEntry.pricingUnit) {
    case 'per_image':  return `$${webEntry.price}/image`;
    case 'per_video':  return `$${webEntry.price}/video`;
    case 'per_mtok':   return `$${webEntry.price}/MTok`;
    case 'per_char':   return `$${webEntry.price}/1M chars`;
    case 'per_minute': return `$${webEntry.price}/min`;
    default:           return `$${webEntry.price}`;
  }
}

/**
 * Merge web pricing data into a Together AI audit result.
 *
 * For each model:
 * - If already verified by API → check web too → upgrade to "api+web" if web matches
 * - If unverifiable (API had no data) → check web → promote to "verified (web)" if web matches,
 *   or add a "web mismatch" if web price differs from ours
 * - If web has no entry → leave as-is
 */
function mergeWebPricing(
  result: ProviderAuditResult,
  webLookup: Map<string, WebPriceEntry>,
  allWebEntries: WebPriceEntry[],
  ourModelsMap: Map<string, OurModelEntry>
): void {
  // 1. Upgrade API-verified models to "api+web" if web also matches
  for (const verified of result.verifiedModels) {
    const webEntry = webLookup.get(verified.modelId);
    if (!webEntry) continue;

    const ourModel = ourModelsMap.get(verified.modelId);
    if (!ourModel) continue;

    if (webPriceMatchesOurs(ourModel, webEntry)) {
      verified.verificationSource = 'api+web';
      verified.webPrice = formatWebPrice(webEntry);
    }
    // If web doesn't match but API does, keep as 'api' (API is authoritative for supported types)
  }

  // 2. Try to verify/mismatch unverifiable models using web data
  const stillUnverifiable: UnverifiableModelInfo[] = [];

  for (const unverified of result.unverifiableModels) {
    const webEntry = webLookup.get(unverified.modelId);
    if (!webEntry) {
      // No web data either — stays unverifiable
      stillUnverifiable.push(unverified);
      continue;
    }

    const ourModel = ourModelsMap.get(unverified.modelId);
    if (!ourModel) {
      stillUnverifiable.push(unverified);
      continue;
    }

    if (webPriceMatchesOurs(ourModel, webEntry)) {
      // Web confirms our price! Promote to verified
      result.verifiedModels.push({
        modelId: unverified.modelId,
        displayName: unverified.displayName,
        type: unverified.type,
        pricingUnit: ourModel.pricingUnit,
        inputPerMTok: ourModel.inputPerMTok !== undefined ? round6(ourModel.inputPerMTok) : undefined,
        outputPerMTok: ourModel.outputPerMTok !== undefined ? round6(ourModel.outputPerMTok) : undefined,
        perImage: ourModel.perImage !== undefined ? round6(ourModel.perImage) : undefined,
        perChar: ourModel.perChar !== undefined ? round6(ourModel.perChar) : undefined,
        perMinute: ourModel.perMinute !== undefined ? round6(ourModel.perMinute) : undefined,
        verificationSource: 'web',
        webPrice: formatWebPrice(webEntry),
      });
    } else {
      // Web shows a different price than what we have — mismatch!
      const webPriceConverted = webEntry.pricingUnit === 'per_char'
        ? webEntry.price / 1_000_000  // Convert per-1M-chars to per-char
        : webEntry.price;

      result.priceMismatches.push({
        modelId: unverified.modelId,
        displayName: unverified.displayName,
        type: unverified.type,
        pricingUnit: ourModel.pricingUnit,
        field: 'price',
        our: {
          perImage: ourModel.perImage !== undefined ? round6(ourModel.perImage) : undefined,
          inputPerMTok: ourModel.inputPerMTok !== undefined ? round6(ourModel.inputPerMTok) : undefined,
          outputPerMTok: ourModel.outputPerMTok !== undefined ? round6(ourModel.outputPerMTok) : undefined,
          perChar: ourModel.perChar !== undefined ? round6(ourModel.perChar) : undefined,
          perMinute: ourModel.perMinute !== undefined ? round6(ourModel.perMinute) : undefined,
        },
        provider: {
          perImage: ourModel.pricingUnit === 'per_image' ? webPriceConverted : undefined,
          inputPerMTok: ourModel.pricingUnit === 'per_mtok' ? webPriceConverted : undefined,
          perChar: ourModel.pricingUnit === 'per_char' ? webPriceConverted : undefined,
          perMinute: ourModel.pricingUnit === 'per_minute' ? webPriceConverted : undefined,
        },
        diffPercent: Math.round(
          percentDiff(
            ourModel.perImage || ourModel.inputPerMTok || ourModel.perChar || ourModel.perMinute || 0,
            webPriceConverted
          ) * 10
        ) / 10,
      });
    }
  }

  result.unverifiableModels = stillUnverifiable;

  // 3. Enrich new models with web pricing data
  for (const newModel of result.newModels) {
    const webEntry = findWebPriceForModel(newModel.modelId, webLookup, allWebEntries);
    if (!webEntry) continue;

    newModel.webPrice = formatWebPrice(webEntry);

    // If API has pricing → api+web, if only web has pricing → web
    const hasApiPricing = !!(newModel.pricing?.inputPerMTok || newModel.pricing?.outputPerMTok || newModel.imagePricing?.perImage);
    newModel.pricingSource = hasApiPricing ? 'api+web' : 'web';
  }

  // 4. Update matched count to reflect web-verified promotions
  result.matchedModels = result.verifiedModels.length + result.priceMismatches.length + result.unverifiableModels.length;
}

// ===========================================
// Fireworks Web Price Merging
// ===========================================

/**
 * Merge Fireworks web pricing data into the Fireworks audit result.
 *
 * Since the Fireworks API returns NO pricing data, all our models will be
 * "unverifiable" by default. The web scraper can promote them to "verified (web)"
 * if the web price matches our price, or flag them as mismatches.
 *
 * Also enriches new models with web pricing data.
 */
function mergeFireworksWebPricing(
  result: ProviderAuditResult,
  webEntries: FireworksWebPriceEntry[]
): void {
  const webLookup = buildFireworksWebPriceLookup(webEntries);
  const ourModels = getOurModels().filter((m) => m.providerId === 'fireworks');
  const ourModelsMap = new Map(ourModels.map((m) => [m.modelId, m]));

  // 1. Try to verify unverifiable models using web data
  const stillUnverifiable: UnverifiableModelInfo[] = [];

  for (const unverified of result.unverifiableModels) {
    const webEntry = findFireworksWebPriceForModel(unverified.modelId, webLookup, webEntries);
    if (!webEntry || webEntry.isTier) {
      // No model-specific web data — stays unverifiable
      stillUnverifiable.push(unverified);
      continue;
    }

    const ourModel = ourModelsMap.get(unverified.modelId);
    if (!ourModel) {
      stillUnverifiable.push(unverified);
      continue;
    }

    // Compare our price with web price — only verify when units match
    const webInputMatch = ourModel.pricingUnit === 'per_mtok'
      ? pricesMatch(ourModel.inputPerMTok || 0, webEntry.inputPrice)
      : ourModel.pricingUnit === 'per_image' ? true : false;
    const webOutputMatch = ourModel.pricingUnit === 'per_mtok'
      ? pricesMatch(ourModel.outputPerMTok || 0, webEntry.outputPrice)
      : ourModel.pricingUnit === 'per_image' ? true : false;
    const webImageMatch = ourModel.pricingUnit === 'per_image'
      ? pricesMatch(ourModel.perImage || 0, webEntry.inputPrice)
      : ourModel.pricingUnit === 'per_mtok' ? true : false;

    if (webInputMatch && webOutputMatch && webImageMatch) {
      // Web confirms our price — promote to verified
      result.verifiedModels.push({
        modelId: unverified.modelId,
        displayName: unverified.displayName,
        type: unverified.type,
        pricingUnit: ourModel.pricingUnit,
        inputPerMTok: ourModel.inputPerMTok !== undefined ? round6(ourModel.inputPerMTok) : undefined,
        outputPerMTok: ourModel.outputPerMTok !== undefined ? round6(ourModel.outputPerMTok) : undefined,
        perImage: ourModel.perImage !== undefined ? round6(ourModel.perImage) : undefined,
        verificationSource: 'web',
        webPrice: ourModel.pricingUnit === 'per_mtok'
          ? `$${webEntry.inputPrice}/$${webEntry.outputPrice} /MTok`
          : `$${webEntry.inputPrice}/${webEntry.pricingUnit.replace('per_', '')}`,
      });
    } else {
      // Web shows different price — mismatch
      result.priceMismatches.push({
        modelId: unverified.modelId,
        displayName: unverified.displayName,
        type: unverified.type,
        pricingUnit: ourModel.pricingUnit,
        field: ourModel.pricingUnit === 'per_mtok'
          ? (!webInputMatch && !webOutputMatch ? 'both' : !webInputMatch ? 'input' : 'output')
          : 'price',
        our: {
          inputPerMTok: ourModel.inputPerMTok !== undefined ? round6(ourModel.inputPerMTok) : undefined,
          outputPerMTok: ourModel.outputPerMTok !== undefined ? round6(ourModel.outputPerMTok) : undefined,
          perImage: ourModel.perImage !== undefined ? round6(ourModel.perImage) : undefined,
        },
        provider: {
          inputPerMTok: ourModel.pricingUnit === 'per_mtok' ? webEntry.inputPrice : undefined,
          outputPerMTok: ourModel.pricingUnit === 'per_mtok' ? webEntry.outputPrice : undefined,
          perImage: ourModel.pricingUnit === 'per_image' ? webEntry.inputPrice : undefined,
        },
        diffPercent: Math.round(
          percentDiff(
            ourModel.inputPerMTok || ourModel.perImage || 0,
            webEntry.inputPrice
          ) * 10
        ) / 10,
      });
    }
  }

  result.unverifiableModels = stillUnverifiable;

  // 2. Enrich new models with web pricing data
  for (const newModel of result.newModels) {
    const webEntry = findFireworksWebPriceForModel(
      newModel.modelId,
      webLookup,
      webEntries
    );
    if (!webEntry || webEntry.isTier) continue;

    newModel.webPrice = webEntry.pricingUnit === 'per_mtok'
      ? `$${webEntry.inputPrice}/$${webEntry.outputPrice} /MTok`
      : `$${webEntry.inputPrice}/${webEntry.pricingUnit.replace('per_', '')}`;
    newModel.pricingSource = 'web';
  }

  // 3. Update matched count
  result.matchedModels = result.verifiedModels.length + result.priceMismatches.length + result.unverifiableModels.length;
}

// ===========================================
// Public API
// ===========================================

/** Cache for the last audit result */
let lastAuditReport: PricingAuditReport | null = null;

/**
 * Run a full pricing audit across all registered providers.
 * Compares live provider data against our model-pricing.ts.
 *
 * For Together AI: also scrapes the pricing webpage as a secondary source,
 * merging web-verified prices into the audit results.
 *
 * For Fireworks AI: also scrapes fireworks.ai/pricing for pricing data,
 * since the Fireworks API does not return pricing information.
 */
export async function runPricingAudit(): Promise<PricingAuditReport> {
  // Run API audits + web scrapes in parallel
  const [providerResults, webPricesResult, fireworksWebPricesResult] = await Promise.all([
    Promise.allSettled(PROVIDER_FETCHERS.map((fetcher) => auditProvider(fetcher))),
    fetchTogetherAIWebPrices().catch((err) => {
      console.warn('[pricing-monitor] Together AI web price fetch failed:', err instanceof Error ? err.message : err);
      return [] as WebPriceEntry[];
    }),
    fetchFireworksWebPrices().catch((err) => {
      console.warn('[pricing-monitor] Fireworks web price fetch failed:', err instanceof Error ? err.message : err);
      return [] as FireworksWebPriceEntry[];
    }),
  ]);

  const providers: ProviderAuditResult[] = providerResults.map((result, idx) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // Promise rejected — create error result
    const fetcher = PROVIDER_FETCHERS[idx] ?? { providerId: 'unknown', providerName: 'Unknown', supportsPricing: false, supportsCapabilities: false as const };
    return {
      providerId: fetcher.providerId,
      providerName: fetcher.providerName,
      supportsPricing: fetcher.supportsPricing,
      supportsCapabilities: fetcher.supportsCapabilities,
      status: "error" as const,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      totalModelsFromProvider: 0,
      matchedModels: 0,
      priceMismatches: [],
      newModels: [],
      removedModels: [],
      verifiedModels: [],
      unverifiableModels: [],
    };
  });

  // Merge web pricing into Together AI result
  if (webPricesResult.length > 0) {
    const togetherResult = providers.find((p) => p.providerId === 'together-ai');
    if (togetherResult && togetherResult.status === 'ok') {
      const webLookup = buildWebPriceLookup(webPricesResult);
      const ourModels = getOurModels().filter((m) => m.providerId === 'together-ai');
      const ourModelsMap = new Map(ourModels.map((m) => [m.modelId, m]));
      mergeWebPricing(togetherResult, webLookup, webPricesResult, ourModelsMap);
    }
  }

  // Merge web pricing into Fireworks AI result
  if (fireworksWebPricesResult.length > 0) {
    const fireworksResult = providers.find((p) => p.providerId === 'fireworks');
    if (fireworksResult && fireworksResult.status === 'ok') {
      mergeFireworksWebPricing(fireworksResult, fireworksWebPricesResult);
    }
  }

  const totalMismatches = providers.reduce((sum, p) => sum + p.priceMismatches.length, 0);
  const totalNew = providers.reduce((sum, p) => sum + p.newModels.length, 0);
  const totalRemoved = providers.reduce((sum, p) => sum + p.removedModels.length, 0);
  const totalErrors = providers.filter((p) => p.status === "error").length;
  const totalModels = providers.reduce((sum, p) => sum + p.matchedModels, 0);

  // Build breakdown of new models by type
  const newModelsByType: Record<string, number> = {};
  for (const p of providers) {
    for (const m of p.newModels) {
      newModelsByType[m.type] = (newModelsByType[m.type] || 0) + 1;
    }
  }

  let status: "ok" | "warnings" | "critical" = "ok";
  if (totalMismatches > 0) status = "critical";
  else if (totalNew > 0 || totalRemoved > 0 || totalErrors > 0) status = "warnings";

  const report: PricingAuditReport = {
    timestamp: new Date().toISOString(),
    status,
    summary: {
      totalProviders: providers.length,
      totalModelsChecked: totalModels,
      priceMismatches: totalMismatches,
      newModels: totalNew,
      removedModels: totalRemoved,
      errors: totalErrors,
    },
    newModelsByType,
    providers,
  };

  // Cache the result
  lastAuditReport = report;

  return report;
}

/**
 * Get the last cached audit report (if any).
 * Returns null if no audit has been run yet.
 */
export function getLastAuditReport(): PricingAuditReport | null {
  return lastAuditReport;
}

/**
 * Get the list of registered provider fetchers (for display purposes)
 */
export function getRegisteredProviders(): Array<{
  providerId: string;
  providerName: string;
  supportsPricing: boolean;
  supportsCapabilities: boolean;
}> {
  return PROVIDER_FETCHERS.map((f) => ({
    providerId: f.providerId,
    providerName: f.providerName,
    supportsPricing: f.supportsPricing,
    supportsCapabilities: f.supportsCapabilities,
  }));
}
