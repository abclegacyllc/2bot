/**
 * Provider Price Monitor — Types
 *
 * Defines the interface contract for provider fetchers and audit reports.
 * Any new provider just needs to implement `ProviderFetcher`.
 *
 * Supports ALL model types: chat, image, video, audio, embedding,
 * transcribe, moderation, rerank, code, language.
 *
 * Pricing units: per_mtok (tokens), per_image, per_char, per_minute.
 *
 * @module modules/2bot-ai-provider/pricing-monitor/pricing-monitor.types
 */

// ===========================================
// Provider Fetcher Interface (future-proof)
// ===========================================

/**
 * Every provider fetcher must implement this interface.
 * To add a new provider (e.g., Google Vertex, Azure, Cohere):
 * 1. Create a file: `provider-fetchers/<name>.fetcher.ts`
 * 2. Export a class implementing `ProviderFetcher`
 * 3. Register it in `pricing-monitor.service.ts` → `PROVIDER_FETCHERS`
 */
export interface ProviderFetcher {
  /** Provider identifier (e.g., "together-ai", "anthropic", "openai") */
  readonly providerId: string;

  /** Human-friendly provider name */
  readonly providerName: string;

  /** Whether this provider's API returns pricing data */
  readonly supportsPricing: boolean;

  /** Whether this provider's API returns capability/feature data */
  readonly supportsCapabilities: boolean;

  /** Fetch all available models from the provider's API */
  fetchModels(): Promise<ProviderModelInfo[]>;
}

// ===========================================
// Pricing Units
// ===========================================

/** How a model is priced — determines which price fields are relevant */
export type PricingUnit = 'per_mtok' | 'per_image' | 'per_char' | 'per_minute';

// ===========================================
// Provider Model Data
// ===========================================

/** Standardized model info returned by any provider fetcher */
export interface ProviderModelInfo {
  /** Model ID as used by the provider API */
  modelId: string;

  /** Human-readable display name */
  displayName: string;

  /** Model type (chat, image, embedding, etc.) */
  type: ModelType;

  /** How the model is priced (determines which pricing field to use) */
  pricingUnit?: PricingUnit;

  /** Pricing per million tokens (for chat, embedding, moderation, rerank, audio) */
  pricing?: {
    inputPerMTok: number;
    outputPerMTok: number;
  };

  /** Image pricing (for image models) */
  imagePricing?: {
    perImage: number; // $/image
  };

  /** Per-character pricing (for TTS/speech synthesis) */
  charPricing?: {
    perChar: number; // $/char
  };

  /** Per-minute pricing (for speech recognition) */
  minutePricing?: {
    perMinute: number; // $/minute
  };

  /** Context window length */
  contextLength?: number;

  /** When the model was created/released */
  createdAt?: string;

  /** Raw capabilities from the provider */
  capabilities?: string[];
}

export type ModelType =
  | 'chat'
  | 'image'
  | 'embedding'
  | 'audio'
  | 'video'
  | 'transcribe'
  | 'moderation'
  | 'code'
  | 'rerank'
  | 'language'
  | 'unknown';

// ===========================================
// Audit Report
// ===========================================

/** Full audit report from comparing live provider data with our pricing */
export interface PricingAuditReport {
  /** When this audit was run */
  timestamp: string;

  /** Overall status */
  status: 'ok' | 'warnings' | 'critical';

  /** Summary counts */
  summary: {
    totalProviders: number;
    totalModelsChecked: number;
    priceMismatches: number;
    newModels: number;
    removedModels: number;
    errors: number;
  };

  /** Breakdown of new models by type */
  newModelsByType?: Record<string, number>;

  /** Per-provider results */
  providers: ProviderAuditResult[];
}

/** Audit result for a single provider */
export interface ProviderAuditResult {
  providerId: string;
  providerName: string;
  supportsPricing: boolean;
  supportsCapabilities: boolean;

  /** Did the API call succeed? */
  status: 'ok' | 'error';
  error?: string;

  /** Total models returned by provider API */
  totalModelsFromProvider: number;

  /** Models we track that were found in provider's API */
  matchedModels: number;

  /** Price mismatches (our price vs their current price) */
  priceMismatches: PriceMismatch[];

  /** Models the provider offers that we don't have in model-pricing.ts */
  newModels: NewModelInfo[];

  /** Models we have in model-pricing.ts but provider no longer lists */
  removedModels: RemovedModelInfo[];

  /** Models we track — successfully matched, no issues */
  verifiedModels: VerifiedModelInfo[];

  /** Models we track but can't verify pricing (provider API has no pricing data for this model type) */
  unverifiableModels: UnverifiableModelInfo[];
}

/** A price mismatch between our system and the provider */
export interface PriceMismatch {
  modelId: string;
  displayName?: string;
  type: ModelType;
  pricingUnit: PricingUnit;
  field: 'input' | 'output' | 'both' | 'price';
  our: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    perImage?: number;
    perChar?: number;
    perMinute?: number;
  };
  provider: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    perImage?: number;
    perChar?: number;
    perMinute?: number;
  };
  /** Percentage difference (positive = provider increased, negative = decreased) */
  diffPercent: number;
}

/** A model the provider offers that we don't track */
export interface NewModelInfo {
  modelId: string;
  displayName: string;
  type: ModelType;
  pricingUnit?: PricingUnit;
  pricing?: {
    inputPerMTok: number;
    outputPerMTok: number;
  };
  imagePricing?: {
    perImage: number;
  };
  contextLength?: number;
  /** Web-scraped price (when API has no pricing data) */
  webPrice?: string;
  /** Where the pricing data came from */
  pricingSource?: VerificationSource;
}

/** A model we track that the provider no longer lists */
export interface RemovedModelInfo {
  modelId: string;
  type: ModelType;
}

/** How a price was verified: API only, web scrape only, or both */
export type VerificationSource = 'api' | 'web' | 'api+web';

/** A model we track but can't verify because the provider API doesn't expose pricing for this model type */
export interface UnverifiableModelInfo {
  modelId: string;
  displayName?: string;
  type: ModelType;
  /** Our pricing unit (what we charge) */
  ourPricingUnit: PricingUnit;
  /** Our price (what we have in model-pricing.ts) */
  ourPrice: string;
  /** Why we can't verify */
  reason: string;
}

/** A model that matched and pricing is correct */
export interface VerifiedModelInfo {
  modelId: string;
  displayName?: string;
  type: ModelType;
  pricingUnit: PricingUnit;
  /** Token pricing (for per_mtok) */
  inputPerMTok?: number;
  outputPerMTok?: number;
  /** Image pricing (for per_image) */
  perImage?: number;
  /** Char pricing (for per_char) */
  perChar?: number;
  /** Minute pricing (for per_minute) */
  perMinute?: number;
  /** How this model's price was verified */
  verificationSource?: VerificationSource;
  /** Web-scraped price (for comparison display) */
  webPrice?: string;
}
