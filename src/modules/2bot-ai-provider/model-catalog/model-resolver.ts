/**
 * 2Bot AI Model Resolver
 *
 * This service resolves 2Bot AI model IDs to actual provider model IDs.
 * It handles provider selection based on configured strategies and
 * provider availability.
 *
 * @example
 * ```typescript
 * const modelResolver = new TwoBotAIModelResolver();
 *
 * // Resolve a 2Bot model to a provider model
 * const result = modelResolver.resolve('2bot-ai-text-pro');
 * console.log(result.provider); // 'anthropic'
 * console.log(result.providerModelId); // 'claude-sonnet-4-5-20251022'
 * ```
 */

import { isProviderConfigured } from '../provider-config';
import type {
    ModelResolutionRequest,
    ModelResolutionResult,
    ModelSelectionStrategy,
    Provider,
    ProviderModelOption,
    TwoBotAIModelId,
    TwoBotAIModelMapping,
} from './model-catalog.types';
import {
    TWOBOT_AI_MODEL_MAPPINGS,
    getEnabledProviderOptions,
} from './model-mappings';
import { TWOBOT_AI_MODELS } from './twobot-models';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when a 2Bot AI model cannot be resolved
 */
export class ModelResolutionError extends Error {
  constructor(
    message: string,
    public readonly twobotAIModelId: TwoBotAIModelId,
    public readonly reason: ModelResolutionErrorReason
  ) {
    super(message);
    this.name = 'ModelResolutionError';
  }
}

export type ModelResolutionErrorReason =
  | 'MODEL_NOT_FOUND'
  | 'NO_PROVIDERS_AVAILABLE'
  | 'NO_PROVIDERS_CONFIGURED'
  | 'MODEL_DEPRECATED'
  | 'MODEL_UNAVAILABLE'
  | 'PROVIDER_EXCLUDED';

// ============================================================================
// Round-Robin State Management
// ============================================================================

/**
 * In-memory state for round-robin strategy
 * Maps model IDs to their current provider index
 */
const roundRobinState: Map<TwoBotAIModelId, number> = new Map();

/**
 * Reset round-robin state (useful for testing)
 */
export function resetRoundRobinState(): void {
  roundRobinState.clear();
}

// ============================================================================
// Strategy Implementations
// ============================================================================

/**
 * Priority strategy: Select the provider with the lowest priority number
 */
function selectByPriority(
  options: ProviderModelOption[]
): ProviderModelOption | undefined {
  if (options.length === 0) return undefined;
  return [...options].sort((a, b) => a.priority - b.priority)[0];
}

/**
 * Round-robin strategy: Distribute requests evenly across providers
 */
function selectByRoundRobin(
  options: ProviderModelOption[],
  modelId: TwoBotAIModelId
): ProviderModelOption | undefined {
  if (options.length === 0) return undefined;

  const currentIndex = roundRobinState.get(modelId) ?? 0;
  const selected = options[currentIndex % options.length];

  // Update state for next request
  roundRobinState.set(modelId, (currentIndex + 1) % options.length);

  return selected;
}

/**
 * Weighted strategy: Select based on configured weights
 */
function selectByWeight(
  options: ProviderModelOption[]
): ProviderModelOption | undefined {
  if (options.length === 0) return undefined;

  // Calculate total weight
  const totalWeight = options.reduce((sum, opt) => sum + (opt.weight ?? 0), 0);
  if (totalWeight === 0) {
    // Fall back to priority if no weights configured
    return selectByPriority(options);
  }

  // Generate random number and select based on cumulative weights
  const random = Math.random() * totalWeight;
  let cumulative = 0;

  for (const option of options) {
    cumulative += option.weight ?? 0;
    if (random <= cumulative) {
      return option;
    }
  }

  // Fallback (should not reach here)
  return options[0];
}

/**
 * Lowest-cost strategy: Select the cheapest provider
 * Note: For now, this uses priority as a proxy for cost ranking
 * In the future, this should integrate with model-pricing.ts
 */
function selectByLowestCost(
  options: ProviderModelOption[]
): ProviderModelOption | undefined {
  // Currently uses priority as cost proxy
  // Lower priority = lower cost assumption
  return selectByPriority(options);
}

/**
 * Best-quality strategy: Select the highest quality provider
 * Uses reverse priority (higher priority number = higher quality)
 */
function selectByBestQuality(
  options: ProviderModelOption[]
): ProviderModelOption | undefined {
  if (options.length === 0) return undefined;
  // For best quality, we reverse the priority (assume lower priority = better quality)
  // Or we could use the first option as it's typically the best
  return [...options].sort((a, b) => a.priority - b.priority)[0];
}

/**
 * Select a provider option based on the given strategy
 */
function selectProviderByStrategy(
  options: ProviderModelOption[],
  strategy: ModelSelectionStrategy,
  modelId: TwoBotAIModelId
): ProviderModelOption | undefined {
  switch (strategy) {
    case 'priority':
    case 'failover': // Failover uses priority for initial selection
      return selectByPriority(options);

    case 'round-robin':
      return selectByRoundRobin(options, modelId);

    case 'weighted':
      return selectByWeight(options);

    case 'lowest-cost':
      return selectByLowestCost(options);

    case 'fastest':
      // For now, fastest uses priority (could integrate with latency metrics)
      return selectByPriority(options);

    case 'best-quality':
      return selectByBestQuality(options);

    default:
      return selectByPriority(options);
  }
}

// ============================================================================
// Model Resolver Class
// ============================================================================

/**
 * Resolves 2Bot AI model IDs to provider model configurations
 */
export class TwoBotAIModelResolver {
  /**
   * Resolve a 2Bot AI model to a provider model
   *
   * @param request - Resolution request with model ID and optional overrides
   * @returns Resolution result with provider model details
   * @throws ModelResolutionError if resolution fails
   */
  resolve(request: ModelResolutionRequest): ModelResolutionResult {
    const { twobotAIModelId, strategy, preferredProvider, excludeProviders } =
      request;

    // 1. Check if model exists
    const model = TWOBOT_AI_MODELS[twobotAIModelId];
    if (!model) {
      throw new ModelResolutionError(
        `Model '${twobotAIModelId}' not found in catalog`,
        twobotAIModelId,
        'MODEL_NOT_FOUND'
      );
    }

    // 2. Check if model is available
    if (!model.isAvailable) {
      throw new ModelResolutionError(
        `Model '${twobotAIModelId}' is currently unavailable`,
        twobotAIModelId,
        'MODEL_UNAVAILABLE'
      );
    }

    // 3. Check if model is deprecated
    if (model.isDeprecated) {
      const replacement = model.replacementModelId
        ? ` Use '${model.replacementModelId}' instead.`
        : '';
      throw new ModelResolutionError(
        `Model '${twobotAIModelId}' is deprecated.${replacement}`,
        twobotAIModelId,
        'MODEL_DEPRECATED'
      );
    }

    // 4. Get mapping
    const mapping = TWOBOT_AI_MODEL_MAPPINGS[twobotAIModelId];
    if (!mapping) {
      throw new ModelResolutionError(
        `No provider mappings found for model '${twobotAIModelId}'`,
        twobotAIModelId,
        'NO_PROVIDERS_AVAILABLE'
      );
    }

    // 5. Get available provider options
    let availableOptions = this.getAvailableProviderOptions(mapping);

    // 6. Apply exclusions if specified
    if (excludeProviders && excludeProviders.length > 0) {
      availableOptions = availableOptions.filter(
        (opt) => !excludeProviders.includes(opt.provider)
      );
    }

    // 7. Apply preferred provider hint
    if (preferredProvider) {
      const preferredOptions = availableOptions.filter(
        (opt) => opt.provider === preferredProvider
      );
      if (preferredOptions.length > 0) {
        // Move preferred provider to front
        availableOptions = [
          ...preferredOptions,
          ...availableOptions.filter((opt) => opt.provider !== preferredProvider),
        ];
      }
    }

    // 8. Check if any providers are available
    if (availableOptions.length === 0) {
      if (excludeProviders && excludeProviders.length > 0) {
        throw new ModelResolutionError(
          `All available providers for '${twobotAIModelId}' have been excluded`,
          twobotAIModelId,
          'PROVIDER_EXCLUDED'
        );
      }
      throw new ModelResolutionError(
        `No configured providers available for model '${twobotAIModelId}'`,
        twobotAIModelId,
        'NO_PROVIDERS_CONFIGURED'
      );
    }

    // 9. Select provider based on strategy
    const effectiveStrategy = strategy ?? mapping.defaultStrategy;
    const selected = selectProviderByStrategy(
      availableOptions,
      effectiveStrategy,
      twobotAIModelId
    );

    if (!selected) {
      throw new ModelResolutionError(
        `Failed to select provider for model '${twobotAIModelId}'`,
        twobotAIModelId,
        'NO_PROVIDERS_AVAILABLE'
      );
    }

    // 10. Build result
    const fallbackOptions = availableOptions.filter(
      (opt) =>
        opt.provider !== selected.provider || opt.modelId !== selected.modelId
    );

    return {
      providerModelId: selected.modelId,
      provider: selected.provider,
      twobotAIModelId,
      strategyUsed: effectiveStrategy,
      fallbackOptions,
    };
  }

  /**
   * Resolve a model ID directly (convenience method)
   */
  resolveModel(twobotAIModelId: TwoBotAIModelId): ModelResolutionResult {
    return this.resolve({ twobotAIModelId });
  }

  /**
   * Check if a 2Bot AI model can be resolved to at least one provider
   */
  canResolve(twobotAIModelId: TwoBotAIModelId): boolean {
    try {
      this.resolve({ twobotAIModelId });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all 2Bot AI models that can currently be resolved
   */
  getResolvableModels(): TwoBotAIModelId[] {
    return (Object.keys(TWOBOT_AI_MODELS) as TwoBotAIModelId[]).filter(
      (modelId) => this.canResolve(modelId)
    );
  }

  /**
   * Get available provider options for a mapping (checks provider configuration)
   */
  private getAvailableProviderOptions(
    mapping: TwoBotAIModelMapping
  ): ProviderModelOption[] {
    return getEnabledProviderOptions(mapping.twobotAIModelId).filter((option) =>
      isProviderConfigured(option.provider)
    );
  }

  /**
   * Try to resolve with failover support
   * Returns the first successful resolution, or throws if all fail
   */
  resolveWithFailover(
    twobotAIModelId: TwoBotAIModelId,
    excludeProviders: Provider[] = []
  ): ModelResolutionResult {
    return this.resolve({
      twobotAIModelId,
      strategy: 'failover',
      excludeProviders,
    });
  }

  /**
   * Get the next fallback provider after a failure
   */
  getNextFallback(
    previousResult: ModelResolutionResult
  ): ModelResolutionResult | null {
    const nextOption = previousResult.fallbackOptions[0];
    if (!nextOption) {
      return null;
    }

    const remainingFallbacks = previousResult.fallbackOptions.slice(1);

    return {
      providerModelId: nextOption.modelId,
      provider: nextOption.provider,
      twobotAIModelId: previousResult.twobotAIModelId,
      strategyUsed: 'failover',
      fallbackOptions: remainingFallbacks,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default model resolver instance
 */
export const twoBotAIModelResolver = new TwoBotAIModelResolver();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Resolve a 2Bot AI model to a provider model (uses default resolver)
 */
export function resolveTwoBotAIModel(
  twobotAIModelId: TwoBotAIModelId
): ModelResolutionResult {
  return twoBotAIModelResolver.resolveModel(twobotAIModelId);
}

/**
 * Resolve with full options (uses default resolver)
 */
export function resolveTwoBotAIModelWithOptions(
  request: ModelResolutionRequest
): ModelResolutionResult {
  return twoBotAIModelResolver.resolve(request);
}

/**
 * Check if a 2Bot AI model can be resolved (uses default resolver)
 */
export function canResolveTwoBotAIModel(
  twobotAIModelId: TwoBotAIModelId
): boolean {
  return twoBotAIModelResolver.canResolve(twobotAIModelId);
}

/**
 * Get all currently resolvable 2Bot AI models (uses default resolver)
 */
export function getResolvableTwoBotAIModels(): TwoBotAIModelId[] {
  return twoBotAIModelResolver.getResolvableModels();
}
