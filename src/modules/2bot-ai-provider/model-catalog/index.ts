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
  isTwoBotAIModelId, TWOBOT_AI_MODEL_TIERS,
  VALID_TWOBOT_AI_MODEL_IDS
} from './model-catalog.types';

// 2Bot Model Definitions
export {
  getAvailableTwoBotAIModels, getTwoBotAIModel, getTwoBotAIModelsByCapability,
  getTwoBotAIModelsByTier, TWOBOT_AI_MODELS, twoBotAIModelExists
} from './twobot-models';

// Model Mappings
export {
  getDefaultStrategy, getEnabledProviderOptions,
  getPrimaryProviderOption, getTwoBotAIModelMapping, hasMultipleProviders, TWOBOT_AI_MODEL_MAPPINGS
} from './model-mappings';

// Model Resolver
export {
  canResolveTwoBotAIModel,
  getResolvableTwoBotAIModels, ModelResolutionError, resetRoundRobinState, resolveTwoBotAIModel,
  resolveTwoBotAIModelWithOptions, TwoBotAIModelResolver,
  twoBotAIModelResolver, type ModelResolutionErrorReason
} from './model-resolver';

