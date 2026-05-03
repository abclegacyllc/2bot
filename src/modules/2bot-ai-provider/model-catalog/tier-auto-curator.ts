/**
 * Tier Auto-Curator
 *
 * (Option C): Automatically generates provider option arrays for each
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
export const REASONING_MODELS = new Set<string>([
  // OpenAI
  'o3-mini',
  // Anthropic — Claude 4+ supports extended thinking via API
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  // Together AI
  'Qwen/Qwen3-235B-A22B-Thinking-2507',
  'moonshotai/Kimi-K2-Thinking',
  'deepseek-ai/DeepSeek-R1',
  // Google (GenLang)
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  // OpenRouter
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro-preview',
  'qwen/qwq-32b',
  'x-ai/grok-3-mini',
  // Vertex AI (Google)
  'grok-4.1-fast-reasoning',
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
 * Last audited: 2026-04
 */
export const CODE_GENERATION_MODELS = new Set<string>([
  // =====================================================================
  // Lite tier — cheap models good enough for code generation
  // =====================================================================
  // GPT-4.1 Nano — cheapest GPT-4.1, tools ✅ (OpenRouter)
  'openai/gpt-4.1-nano',
  // GPT-5 Nano — lightweight GPT-5, tools ✅ (OpenRouter)
  'openai/gpt-5-nano',
  // QwQ 32B — cheap reasoning model, tools ✅ (OpenRouter)
  'qwen/qwq-32b',
  // Qwen2.5 Coder 32B — dedicated coding model, tools ✅ (Together)
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  // DeepSeek V3.2 — excellent code, tools ✅ (OpenRouter + Vertex)
  'deepseek/deepseek-v3.2',
  'deepseek-v3.2-maas',
  // Llama 3.3 70B — strong code model, tools ✅ (Together + Fireworks + Vertex + OpenRouter)
  'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  'accounts/fireworks/models/llama-v3p3-70b-instruct',
  'llama-3.3-70b-instruct-maas',
  'meta-llama/llama-3.3-70b-instruct',
  // Llama 4 Scout — efficient MoE, tools ✅ (Together + Vertex + OpenRouter)
  'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  'llama-4-scout-17b-16e-instruct-maas',
  'meta-llama/llama-4-scout',

  // =====================================================================
  // Pro tier — strong models for reliable code generation
  // =====================================================================
  // GPT-4.1 Mini — strong mid-tier GPT-4.1, tools ✅ (OpenRouter)
  'openai/gpt-4.1-mini',
  // GPT-5 Mini — strong code, tools ✅ (OpenRouter)
  'openai/gpt-5-mini',
  // Mistral Medium 3.1 — balanced mid-range, tools ✅ (OpenRouter)
  'mistralai/mistral-medium-3.1',
  // Codestral 25.08 — dedicated Mistral coder, tools ✅ (OpenRouter)
  'mistralai/codestral-2508',
  // Codestral 2 — latest Mistral coder, tools ✅ (Vertex rawPredict)
  'codestral-2',
  // Grok 4.1 Fast NR — xAI fast code, tools ✅ (Vertex + OpenRouter)
  'grok-4.1-fast-non-reasoning',
  'x-ai/grok-4.1-fast',
  // Grok 4.1 Fast Reasoning — reasoning + code, tools ✅ (Vertex)
  'grok-4.1-fast-reasoning',
  // Grok Code — xAI dedicated code model, tools ✅ (OpenRouter)
  'x-ai/grok-code-fast-1',
  // Grok 3 Mini — cheap reasoning, tools ✅ (OpenRouter)
  'x-ai/grok-3-mini',
  // Qwen3 Coder Next — dedicated coding model, tools ✅ (Together)
  'Qwen/Qwen3-Coder-Next-FP8',
  // DeepSeek V3.1 — excellent code generation, tools ✅ (Together + Fireworks + Vertex)
  'deepseek-ai/DeepSeek-V3.1',
  'accounts/fireworks/models/deepseek-v3p1',
  'deepseek-v3.1-maas',
  // GLM 4.7 — strong code generation, tools ✅ (Together + Fireworks + Vertex + OpenRouter)
  'zai-org/GLM-4.7',
  'accounts/fireworks/models/glm-4p7',
  'glm-4.7-maas',
  'z-ai/glm-4.7',
  // Kimi K2 Thinking — reasoning + code, tools ✅ (Google + Together + OpenRouter)
  'kimi-k2-thinking-maas',
  'moonshotai/Kimi-K2-Thinking',
  'moonshotai/kimi-k2-thinking',
  // Kimi K2.5 — top code generation, tools ✅ (Together + Fireworks + OpenRouter)
  'moonshotai/Kimi-K2.5',
  'accounts/fireworks/models/kimi-k2p5',
  'moonshotai/kimi-k2.5',
  // Kimi K2 Instruct — high-capability coding, tools ✅ (Fireworks + OpenRouter)
  'accounts/fireworks/models/kimi-k2-instruct-0905',
  'moonshotai/kimi-k2-0905',
  // Gemini 2.5 Flash — fast code, tools ✅, reasoning ✅ (Vertex AI + OpenRouter)
  // NOTE: 'gemini-2.5-flash' is Vertex AI (NOT GenLang) — safe for high-volume use
  'gemini-2.5-flash',
  'google/gemini-2.5-flash',
  // Gemini 3 Flash — tools ✅ (OpenRouter only — GenLang ID excluded due to low quotas)
  // 'gemini-3-flash-preview' REMOVED — GenLang-only, low RPM limits cause rate-limit errors
  'google/gemini-3-flash-preview',
  // o3-mini — strong reasoning + tools ✅ (OpenAI)
  'o3-mini',
  // Llama 4 Maverick — strong MoE model, tools ✅ (Together + Vertex + OpenRouter)
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'llama-4-maverick-17b-128e-instruct-maas',
  'meta-llama/llama-4-maverick',
  // Qwen3 235B Instruct — large code-capable, tools ✅ (Together + Vertex + OpenRouter)
  'Qwen/Qwen3-235B-A22B-Instruct-2507-tput',
  'qwen3-235b-a22b-instruct-2507-maas',
  'qwen/qwen3-235b-a22b-instruct',

  // =====================================================================
  // Ultra tier — premium / flagship code models
  // =====================================================================
  // GPT-4.1 — premium GPT, tools ✅ (OpenRouter)
  'openai/gpt-4.1',
  // GPT-5 — top-tier code generation, tools ✅ (OpenRouter)
  'openai/gpt-5',
  // Gemini 2.5 Pro — strong reasoning + code, tools ✅ (Vertex AI + OpenRouter)
  // NOTE: 'gemini-2.5-pro' is Vertex AI (NOT GenLang) — safe for high-volume use
  'gemini-2.5-pro',
  'google/gemini-2.5-pro-preview',
  // 'gemini-3.1-pro-preview' REMOVED — GenLang-only, low RPM limits cause rate-limit errors
  // Claude Sonnet 4.6 — latest balanced, tools ✅, reasoning ✅ (Anthropic + Vertex)
  'claude-sonnet-4-6',
  // Claude Opus 4.6 — best-in-class code, tools ✅, reasoning ✅ (Anthropic + Vertex)
  'claude-opus-4-6',
  // Claude Opus 4.7 — latest Opus, tools ✅, reasoning ✅ (Anthropic + Vertex)
  'claude-opus-4-7',
  // Mistral Large — Mistral flagship, tools ✅ (OpenRouter)
  'mistralai/mistral-large-2411',
  // GLM 5 — ZAI flagship, tools ✅ (Together + Fireworks + Vertex + OpenRouter)
  'zai-org/GLM-5',
  'accounts/fireworks/models/glm-5',
  'glm-5-maas',
  'z-ai/glm-5',
  // Qwen3 Coder 480B — massive code-specialized, tools ✅ (Vertex)
  'qwen3-coder-480b-a35b-instruct-maas',
  // Qwen3.5 397B — Qwen flagship, tools ✅ (Together + OpenRouter)
  'Qwen/Qwen3.5-397B-A17B',
  'qwen/qwen3.5-397b-a17b',
  // Grok 4.20 — powerful xAI model, tools ✅ (Vertex + OpenRouter)
  'grok-4.20-non-reasoning',
  'x-ai/grok-4.20-beta',
  // Grok 4 — xAI ultra tier, tools ✅ (OpenRouter)
  'x-ai/grok-4',
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
  '2bot-ai-text-lite': {
    defaultStrategy: 'lowest-cost',
  },
  '2bot-ai-text-pro': {
    defaultStrategy: 'lowest-cost',
  },
  '2bot-ai-text-premium': {
    defaultStrategy: 'lowest-cost',
  },

  // ---- Reasoning models: require reasoning capability ----
  '2bot-ai-reasoning-pro': {
    defaultStrategy: 'lowest-cost',
    requireReasoning: true,
  },
  '2bot-ai-reasoning-premium': {
    defaultStrategy: 'lowest-cost',
    requireReasoning: true,
  },

  // ---- Image models: auto-curate by image cost range ----
  '2bot-ai-image-pro': {
    defaultStrategy: 'lowest-cost',
  },
  '2bot-ai-image-premium': {
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
  '2bot-ai-code-lite': {
    defaultStrategy: 'lowest-cost',
    maxPerProvider: 3,
  },
  '2bot-ai-code-pro': {
    defaultStrategy: 'lowest-cost',
    maxPerProvider: 3,
  },
  '2bot-ai-code-premium': {
    defaultStrategy: 'lowest-cost',
  },

  // ---- Voice/transcribe: manual only (OpenAI-only, single provider) ----
  '2bot-ai-voice-pro': { manualOnly: true },
  '2bot-ai-voice-premium': { manualOnly: true },
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
  // Exception: premium tier uses inclusive max (Infinity)
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
