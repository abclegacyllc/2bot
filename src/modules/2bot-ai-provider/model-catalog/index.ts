/**
 * 2Bot AI Model Catalog
 *
 * This module provides the model abstraction layer that hides underlying
 * AI providers (OpenAI, Anthropic, etc.) from users. Users interact with
 * 2Bot-branded models (e.g., "2bot-ai-text-pro") while the system handles
 * routing to the appropriate provider.
 *
 * @example
 * ```typescript
 * import {
 *   getTwoBotAIModel,
 *   getTwoBotAIModelMapping,
 *   isTwoBotAIModelId,
 * } from '@/modules/2bot-ai-provider/model-catalog';
 *
 * // Get model info
 * const model = getTwoBotAIModel('2bot-ai-text-pro');
 * console.log(model.displayName); // "2Bot AI Text Pro"
 *
 * // Get provider mapping
 * const mapping = getTwoBotAIModelMapping('2bot-ai-text-pro');
 * console.log(mapping.providerOptions); // Claude Sonnet, GPT-4o, etc.
 * ```
 */

// Types
export type {
    ModelResolutionRequest,
    ModelResolutionResult, ModelSelectionConfig, ModelSelectionStrategy, ProviderModelOption, TwoBotAIModel, TwoBotAIModelCatalog, TwoBotAIModelFeatures, TwoBotAIModelId, TwoBotAIModelInfo, TwoBotAIModelMapping, TwoBotAIModelTier,
    TwoBotAIModelTierInfo
} from './model-catalog.types';

// Constants
export {
    TWOBOT_AI_MODEL_TIERS,
    VALID_TWOBOT_AI_MODEL_IDS, isTwoBotAIModelId
} from './model-catalog.types';

// 2Bot Model Definitions
export {
    TWOBOT_AI_MODELS, getAvailableTwoBotAIModels, getTwoBotAIModel, getTwoBotAIModelsByCapability,
    getTwoBotAIModelsByTier, twoBotAIModelExists
} from './twobot-models';

// Model Mappings
export {
    TWOBOT_AI_MODEL_MAPPINGS, getDefaultStrategy, getEnabledProviderOptions,
    getPrimaryProviderOption, getTwoBotAIModelMapping, hasMultipleProviders
} from './model-mappings';

// Model Resolver
export {
    ModelResolutionError, TwoBotAIModelResolver, canResolveTwoBotAIModel,
    getResolvableTwoBotAIModels, resetRoundRobinState, resolveTwoBotAIModel,
    resolveTwoBotAIModelWithOptions, twoBotAIModelResolver, type ModelResolutionErrorReason
} from './model-resolver';

// Canonical Models (cross-provider identity map)
export {
    CANONICAL_MODELS, getCanonicalModelById, getCanonicalModelByProviderModelId, getCanonicalModelsByCapability,
    getCheapestProvider,
    getProvidersForCanonicalModel,
    isCrossProviderModel
} from './canonical-models';
export type { CanonicalModel, CheapestProviderResult } from './canonical-models';

// Tier Auto-Curator (Phase 3)
export {
    TIER_CURATION_RULES, autoGenerateMapping,
    autoGenerateProviderOptions,
    getTierCurationSummary,
    refreshAllTierAssignments
} from './tier-auto-curator';
export type { TierCurationRule } from './tier-auto-curator';

