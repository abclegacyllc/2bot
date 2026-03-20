/**
 * Tier Auto-Curator
 *
 * Phase 3 (Option C): Automatically generates provider option arrays for each
 * 2Bot model by reading pricing tables and filtering models by tier cost ranges.
 *
 * This replaces manually curated arrays in model-mappings.ts for text, reasoning,
 * and image models. Voice/transcribe models remain manual (single-provider).
 *
 * When new models are added to the pricing tables (model-pricing.ts), they
 * automatically appear in the appropriate tiers without editing model-mappings.ts.
 */

import {
  getAllImageGenPricing,
  getAllTextGenPricing,
} from '../model-pricing';
import type { TwoBotAIProvider } from '../types';
import type {
  ModelSelectionStrategy,
  ProviderModelOption,
  TwoBotAIModelId,
  TwoBotAIModelMapping,
  TwoBotAIModelTier,
} from './model-catalog.types';
import { TWOBOT_AI_MODEL_TIERS } from './model-catalog.types';
import { TWOBOT_AI_MODELS } from './twobot-models';

// ============================================================================
// Provider Priority & Weight Defaults
// ============================================================================

/**
 * Default priority for each provider (lower = higher priority).
 *
 * Priority reflects reliability and cost-effectiveness:
 * - Anthropic: Best direct API with active key
 * - Together AI: Great prices, reliable
 * - OpenAI: Placeholder key, deprioritized
 * - Fireworks: Tertiary fallback
 * - OpenRouter: Last resort aggregator
 */
const PROVIDER_DEFAULTS: Record<TwoBotAIProvider, { priority: number; weight: number }> = {
  google: { priority: 1, weight: 0.6 },
  anthropic: { priority: 2, weight: 0.5 },
  together: { priority: 3, weight: 0.3 },
  openai: { priority: 4, weight: 0.5 },
  fireworks: { priority: 4, weight: 0.2 },
  openrouter: { priority: 5, weight: 0.1 },
};

// ============================================================================
// Reasoning Model Registry
// ============================================================================

/**
 * Models known to have extended thinking / reasoning capabilities.
 * Used to filter reasoning-suitable models for 2bot-ai-reasoning-* models.
 */
const REASONING_MODELS = new Set<string>([
  // OpenAI
  'o3-mini',
  // Anthropic — Claude 4+ supports extended thinking via API
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  // Together AI
  'Qwen/Qwen3-Next-80B-A3B-Thinking',
  'Qwen/Qwen3-235B-A22B-Thinking-2507',
  'moonshotai/Kimi-K2-Thinking',
  'deepseek-ai/DeepSeek-R1',
  // OpenRouter
  'google/gemini-2.5-flash-preview',
  'google/gemini-2.5-pro-preview',
  'google/gemini-3-pro-preview',
  'qwen/qwq-32b',
]);

// ============================================================================
// Code Generation Model Registry
// ============================================================================

/**
 * Models known to excel at code generation, function calling, and agent tasks.
 *
 * IMPORTANT: All models in this list MUST support tool/function calling.
 * The 2Bot agent requires tool-use capability to work correctly.
 * Models without tool calling will cause agent failures.
 *
 * Audit criteria:
 * 1. Model MUST support tool/function calling (verified)
 * 2. Provider adapter MUST implement tool-use (Together, OpenRouter, Anthropic, OpenAI — NOT Fireworks)
 * 3. One model per family (best performance/price ratio kept)
 *
 * Last audited: 2026-02
 */
const CODE_GENERATION_MODELS = new Set<string>([
  // --- Free tier (cost 0–0.00005) ---
  // Gemma 3n — free model with tool calling support (Together)
  'google/gemma-3n-E4B-it',

  // --- Lite tier (cost 0.00005–0.0005) ---
  // GPT-OSS 20B — small, fast, tools ✅ (Together + OpenRouter)
  'openai/gpt-oss-20b',
  // Qwen3 8B — small code model, tools ✅ (Together)
  'Qwen/Qwen3-8B',
  // Llama 3.1 8B — small code-capable, tools ✅ (Together)
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  // Qwen2.5 Coder 32B — dedicated coding model, tools ✅ (Together)
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  // GPT-5 Nano — lightweight GPT-5, tools ✅ (OpenRouter)
  'openai/gpt-5-nano',
  // Llama 3.3 70B — strong medium code model, tools ✅ (Together)
  'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  // DeepSeek V3.2 — excellent code, tools ✅ (OpenRouter)
  'deepseek/deepseek-v3.2',

  // --- Pro tier (cost 0.0005–0.003) ---
  // Qwen3 Coder — dedicated coding model, tools ✅ (Together)
  'Qwen/Qwen3-Coder-Next-FP8',
  // GPT-5 Mini — strong code, tools ✅ (OpenRouter)
  'openai/gpt-5-mini',
  // DeepSeek V3.1 — excellent code generation, tools ✅ (Together + Fireworks)
  'deepseek-ai/DeepSeek-V3.1',
  'accounts/fireworks/models/deepseek-v3p1',
  // GLM 4.7 — strong code generation, tools ✅ (Together + Fireworks + OpenRouter)
  'zai-org/GLM-4.7',
  'accounts/fireworks/models/glm-4p7',
  // Gemini 2.5 Flash — fast & capable code, tools ✅ (OpenRouter)
  'google/gemini-2.5-flash-preview',
  // Kimi K2.5 — top code generation model, tools ✅ (Together + Fireworks + OpenRouter)
  'moonshotai/Kimi-K2.5',
  'accounts/fireworks/models/kimi-k2p5',
  // Gemini 3 Flash Preview — latest Gemini fast code, tools ✅ (OpenRouter)
  'google/gemini-3-flash-preview',
  // Qwen3 235B Instruct — large code-capable, tools ✅ (Together)
  'Qwen/Qwen3-235B-A22B-Instruct-2507-tput',
  // Kimi K2 Instruct — high-capability coding, tools ✅ (Together + Fireworks)
  'moonshotai/Kimi-K2-Instruct-0905',
  'accounts/fireworks/models/kimi-k2-instruct-0905',

  // --- Ultra tier (cost 0.003+) ---
  // GPT-5 — top-tier code generation, tools ✅ (OpenRouter)
  'openai/gpt-5',
  // Gemini 3 Pro Preview — latest Gemini Pro, tools ✅ (OpenRouter)
  'google/gemini-3-pro-preview',
  // Claude Sonnet 4.6 — latest balanced, tools ✅ (Anthropic)
  'claude-sonnet-4-6',
  // Claude Opus 4.6 — best-in-class code, tools ✅ (Anthropic)
  'claude-opus-4-6',
]);

// ============================================================================
// Excluded Model Registry
// ============================================================================

/**
 * Models globally excluded from auto-curation.
 * Reasons: deprecated, legacy, free-tier unreliable, non-API model IDs.
 */
const EXCLUDED_MODELS = new Set<string>([
  // Legacy Anthropic — superseded by Claude 4.6+ family
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20241022',
  'claude-opus-4-5-20251101',
  'claude-opus-4-1-20250805',
  'claude-opus-4-20250514',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250929', // superseded by claude-sonnet-4-6
  // Legacy OpenAI — superseded by newer models
  'gpt-4-turbo',
  'o1-mini',
  // Legacy Fireworks
  'accounts/fireworks/models/mixtral-8x22b-instruct',
  // Removed from Together AI
  'togethercomputer/MoA-1',
  // dall-e-3-hd is a pricing-only key, not a valid API model ID
  // (API uses "dall-e-3" with quality='hd' via providerConfig)
  'dall-e-3-hd',
  // Legacy image model
  'dall-e-2',
]);

// ============================================================================
// Per-Model Curation Rules
// ============================================================================

/**
 * Per-model overrides for auto-curation behavior.
 */
export interface TierCurationRule {
  /** If true, skip auto-curation entirely (use manual providerOptions) */
  manualOnly?: boolean;
  /** Override the default strategy */
  defaultStrategy?: ModelSelectionStrategy;
  /** Only include models flagged as reasoning-capable */
  requireReasoning?: boolean;
  /** Models to always include regardless of cost range */
  alwaysInclude?: Array<{
    provider: TwoBotAIProvider;
    modelId: string;
    priority?: number;
    weight?: number;
    providerConfig?: Record<string, unknown>;
  }>;
  /** Model IDs to always exclude from this specific 2Bot model */
  alwaysExclude?: string[];
  /** Maximum provider options to include per provider (default: 2) */
  maxPerProvider?: number;
  /** Maximum total provider options (default: 8) */
  maxOptions?: number;
}

/**
 * Per-model curation rules.
 *
 * Models not listed here use default auto-curation with cost-range filtering.
 */
export const TIER_CURATION_RULES: Partial<Record<TwoBotAIModelId, TierCurationRule>> = {
  // ---- Text models: auto-curate by cost range ----
  '2bot-ai-text-free': {
    defaultStrategy: 'priority',
    maxPerProvider: 1,
    maxOptions: 3,
  },
  '2bot-ai-text-lite': {
    defaultStrategy: 'lowest-cost',
  },
  '2bot-ai-text-pro': {
    defaultStrategy: 'lowest-cost',
  },
  '2bot-ai-text-ultra': {
    defaultStrategy: 'lowest-cost',
  },

  // ---- Reasoning models: require reasoning capability ----
  '2bot-ai-reasoning-pro': {
    defaultStrategy: 'lowest-cost',
    requireReasoning: true,
  },
  '2bot-ai-reasoning-ultra': {
    defaultStrategy: 'lowest-cost',
    requireReasoning: true,
  },

  // ---- Image models: auto-curate by image cost range ----
  '2bot-ai-image-pro': {
    defaultStrategy: 'lowest-cost',
  },
  '2bot-ai-image-ultra': {
    defaultStrategy: 'lowest-cost',
    // Exclude standard-quality dall-e-3; include HD via alwaysInclude
    alwaysExclude: ['dall-e-3'],
    alwaysInclude: [
      {
        provider: 'openai',
        modelId: 'dall-e-3',
        providerConfig: { quality: 'hd' },
      },
    ],
  },

  // ---- Code generation models: auto-curate code-capable models ----
  '2bot-ai-code-free': {
    defaultStrategy: 'priority',
    maxPerProvider: 1,
    maxOptions: 3,
  },
  '2bot-ai-code-lite': {
    defaultStrategy: 'lowest-cost',
    maxPerProvider: 3,
  },
  '2bot-ai-code-pro': {
    defaultStrategy: 'lowest-cost',
    maxPerProvider: 3,
  },
  '2bot-ai-code-ultra': {
    defaultStrategy: 'lowest-cost',
  },

  // ---- Voice/transcribe: manual only (OpenAI-only, single provider) ----
  '2bot-ai-voice-pro': { manualOnly: true },
  '2bot-ai-voice-ultra': { manualOnly: true },
  '2bot-ai-transcribe-lite': { manualOnly: true },
};

// ============================================================================
// Pricing Entry Collection
// ============================================================================

interface PricingEntry {
  provider: TwoBotAIProvider;
  modelId: string;
  comparableCost: number;
}

/**
 * Collect all text generation models with their comparable cost.
 * Comparable cost = creditsPerInputToken + creditsPerOutputToken.
 * Dynamically iterates ALL registered providers — no edits needed for new providers.
 */
function collectTextGenerationEntries(): PricingEntry[] {
  const entries: PricingEntry[] = [];

  for (const [provider, pricing] of getAllTextGenPricing()) {
    for (const [modelId, p] of Object.entries(pricing)) {
      if (EXCLUDED_MODELS.has(modelId)) continue;
      const cost = p.creditsPerInputToken + p.creditsPerOutputToken;
      entries.push({ provider, modelId, comparableCost: cost });
    }
  }

  return entries;
}

/**
 * Collect all image generation models with their comparable cost.
 * Comparable cost = creditsPerImage.
 * Dynamically iterates ALL registered providers — no edits needed for new providers.
 */
function collectImageGenerationEntries(): PricingEntry[] {
  const entries: PricingEntry[] = [];

  for (const [provider, pricing] of getAllImageGenPricing()) {
    for (const [modelId, p] of Object.entries(pricing)) {
      if (EXCLUDED_MODELS.has(modelId)) continue;
      entries.push({ provider, modelId, comparableCost: p.creditsPerImage });
    }
  }

  return entries;
}

// ============================================================================
// Auto-Generation Logic
// ============================================================================

/**
 * Auto-generate ProviderModelOption[] for a 2Bot model based on:
 * - Its capability (text-generation, code-generation, image-generation)
 * - Its tier cost range from TWOBOT_AI_MODEL_TIERS (separate code thresholds)
 * - Per-model curation rules (reasoning filter, includes/excludes)
 *
 * Algorithm:
 * 1. Collect pricing entries for the capability
 * 2. Filter by tier cost range + reasoning/code requirement + excludes
 * 3. Sort by cost ascending (cheapest first per provider)
 * 4. Group by provider, keep first N per provider
 * 5. Add alwaysInclude entries
 * 6. Sort by priority (ascending), then cost (ascending)
 * 7. Cap at maxOptions
 */
export function autoGenerateProviderOptions(
  twobotAIModelId: TwoBotAIModelId
): ProviderModelOption[] {
  const model = TWOBOT_AI_MODELS[twobotAIModelId];
  if (!model) return [];

  const rule = TIER_CURATION_RULES[twobotAIModelId] ?? {};
  if (rule.manualOnly) return [];

  const tier = TWOBOT_AI_MODEL_TIERS[model.tier];
  const isTextCapability = model.capability === 'text-generation';
  const isCodeCapability = model.capability === 'code-generation';
  const isImageCapability = model.capability === 'image-generation';

  if (!isTextCapability && !isCodeCapability && !isImageCapability) return [];

  // Step 1: Collect pricing entries for the capability
  let entries: PricingEntry[];
  let minCost: number;
  let maxCost: number;

  if (isImageCapability) {
    entries = collectImageGenerationEntries();
    minCost = tier.minImageCostThreshold ?? 0;
    maxCost = tier.maxImageCostThreshold ?? Infinity;
  } else if (isCodeCapability) {
    // Code models use separate (shifted-lower) cost thresholds
    entries = collectTextGenerationEntries();
    minCost = tier.minCodeCostThreshold ?? tier.minCostThreshold;
    maxCost = tier.maxCodeCostThreshold ?? tier.maxCostThreshold;
  } else {
    entries = collectTextGenerationEntries();
    minCost = tier.minCostThreshold;
    maxCost = tier.maxCostThreshold;
  }

  // Step 2: Filter by cost range (non-overlapping: min inclusive, max exclusive)
  // Exception: ultra tier uses inclusive max (Infinity)
  let filtered = entries.filter(
    (e) => e.comparableCost >= minCost && (maxCost === Infinity ? true : e.comparableCost < maxCost)
  );

  // Filter by reasoning requirement
  if (rule.requireReasoning) {
    filtered = filtered.filter((e) => REASONING_MODELS.has(e.modelId));
  }

  // Filter by code-generation requirement (only code-capable models)
  if (isCodeCapability) {
    filtered = filtered.filter((e) => CODE_GENERATION_MODELS.has(e.modelId));
  }

  // Apply per-model excludes
  if (rule.alwaysExclude && rule.alwaysExclude.length > 0) {
    const excludeSet = new Set(rule.alwaysExclude);
    filtered = filtered.filter((e) => !excludeSet.has(e.modelId));
  }

  // Step 3: Sort by cost ascending BEFORE applying maxPerProvider
  // This ensures the cheapest models per provider are kept, not just first-registered
  filtered.sort((a, b) => a.comparableCost - b.comparableCost);

  // Step 4: Group by provider, keep first N per provider (now sorted by cost)
  const maxPerProvider = rule.maxPerProvider ?? 2;
  const providerCounts = new Map<TwoBotAIProvider, number>();
  const selectedEntries: PricingEntry[] = [];

  for (const entry of filtered) {
    const count = providerCounts.get(entry.provider) ?? 0;
    if (count < maxPerProvider) {
      selectedEntries.push(entry);
      providerCounts.set(entry.provider, count + 1);
    }
  }

  // Convert to ProviderModelOption[]
  const options: ProviderModelOption[] = selectedEntries.map((entry) => {
    const defaults = PROVIDER_DEFAULTS[entry.provider];
    return {
      provider: entry.provider,
      modelId: entry.modelId,
      priority: defaults.priority,
      weight: defaults.weight,
      enabled: true,
    };
  });

  // Step 4: Add alwaysInclude entries
  if (rule.alwaysInclude) {
    for (const include of rule.alwaysInclude) {
      // Check if already present (same provider + modelId + same providerConfig)
      const alreadyExists = options.some(
        (o) =>
          o.provider === include.provider &&
          o.modelId === include.modelId &&
          JSON.stringify(o.providerConfig) === JSON.stringify(include.providerConfig)
      );
      if (!alreadyExists) {
        const defaults = PROVIDER_DEFAULTS[include.provider];
        options.push({
          provider: include.provider,
          modelId: include.modelId,
          priority: include.priority ?? defaults.priority,
          weight: include.weight ?? defaults.weight,
          enabled: true,
          ...(include.providerConfig ? { providerConfig: include.providerConfig } : {}),
        });
      }
    }
  }

  // Step 5: Sort by priority (ascending), then by cost (ascending)
  const costMap = new Map(selectedEntries.map((e) => [`${e.provider}:${e.modelId}`, e.comparableCost]));
  options.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aCost = costMap.get(`${a.provider}:${a.modelId}`) ?? Infinity;
    const bCost = costMap.get(`${b.provider}:${b.modelId}`) ?? Infinity;
    return aCost - bCost;
  });

  // Step 6: Cap at maxOptions
  const maxOptions = rule.maxOptions ?? 8;
  return options.slice(0, maxOptions);
}

/**
 * Auto-generate the full TwoBotAIModelMapping for a 2Bot model.
 * Returns undefined if the model uses manual-only curation.
 */
export function autoGenerateMapping(
  twobotAIModelId: TwoBotAIModelId
): TwoBotAIModelMapping | undefined {
  const rule = TIER_CURATION_RULES[twobotAIModelId] ?? {};
  if (rule.manualOnly) return undefined;

  const options = autoGenerateProviderOptions(twobotAIModelId);
  if (options.length === 0) return undefined;

  const strategy = rule.defaultStrategy ?? 'lowest-cost';

  return {
    twobotAIModelId,
    providerOptions: options,
    defaultStrategy: strategy,
    strategyConfig: {
      strategy,
      maxRetries: 2,
    },
  };
}

/**
 * Refresh all auto-curated tier assignments.
 * Returns a record of auto-generated mappings.
 * Manual-only models (voice, transcribe) are NOT included.
 */
export function refreshAllTierAssignments(): Partial<Record<TwoBotAIModelId, TwoBotAIModelMapping>> {
  const mappings: Partial<Record<TwoBotAIModelId, TwoBotAIModelMapping>> = {};

  for (const twobotAIModelId of Object.keys(TWOBOT_AI_MODELS) as TwoBotAIModelId[]) {
    const mapping = autoGenerateMapping(twobotAIModelId);
    if (mapping) {
      mappings[twobotAIModelId] = mapping;
    }
  }

  return mappings;
}

// ============================================================================
// Debugging / Auditing Helpers
// ============================================================================

/**
 * Get a summary of auto-curated options per 2Bot model.
 * Useful for debugging and auditing tier assignments.
 */
export function getTierCurationSummary(): Record<
  string,
  {
    tier: TwoBotAIModelTier;
    capability: string;
    optionCount: number;
    providers: string[];
    models: string[];
    strategy: string;
  }
> {
  const summary: Record<string, {
    tier: TwoBotAIModelTier;
    capability: string;
    optionCount: number;
    providers: string[];
    models: string[];
    strategy: string;
  }> = {};

  for (const [id, model] of Object.entries(TWOBOT_AI_MODELS)) {
    const rule = TIER_CURATION_RULES[id as TwoBotAIModelId] ?? {};

    if (rule.manualOnly) {
      summary[id] = {
        tier: model.tier,
        capability: model.capability,
        optionCount: 0,
        providers: ['manual'],
        models: [],
        strategy: 'manual',
      };
      continue;
    }

    const options = autoGenerateProviderOptions(id as TwoBotAIModelId);
    const providers = [...new Set(options.map((o) => o.provider))];
    const models = options.map((o) => `${o.provider}/${o.modelId}`);

    summary[id] = {
      tier: model.tier,
      capability: model.capability,
      optionCount: options.length,
      providers,
      models,
      strategy: rule.defaultStrategy ?? 'lowest-cost',
    };
  }

  return summary;
}
