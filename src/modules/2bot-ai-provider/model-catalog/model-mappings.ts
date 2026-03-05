/**
 * 2Bot Model to Provider Model Mappings
 *
 * Text, reasoning, and image models are AUTO-CURATED by tier-auto-curator.ts
 * based on the pricing tables in model-pricing.ts and tier cost ranges.
 *
 * Voice and transcribe models are MANUALLY curated (single-provider: OpenAI).
 *
 * When new models are added to model-pricing.ts, they automatically appear
 * in the appropriate tiers without editing this file.
 */

import type {
    ModelSelectionStrategy,
    ProviderModelOption,
    TwoBotAIModelId,
    TwoBotAIModelMapping,
} from './model-catalog.types';
import { refreshAllTierAssignments } from './tier-auto-curator';

// ============================================================================
// Manual Provider Options (Voice/Transcribe — OpenAI only)
// ============================================================================

const OPENAI_TTS1: ProviderModelOption = {
  provider: 'openai',
  modelId: 'tts-1',
  priority: 1,
  weight: 1.0,
  enabled: true,
};

const OPENAI_TTS1_HD: ProviderModelOption = {
  provider: 'openai',
  modelId: 'tts-1-hd',
  priority: 1,
  weight: 1.0,
  enabled: true,
};

const OPENAI_WHISPER: ProviderModelOption = {
  provider: 'openai',
  modelId: 'whisper-1',
  priority: 1,
  weight: 1.0,
  enabled: true,
};

// ============================================================================
// Manual Mappings (Voice/Transcribe)
// ============================================================================

const MANUAL_MAPPINGS: Partial<Record<TwoBotAIModelId, TwoBotAIModelMapping>> = {
  '2bot-ai-voice-pro': {
    twobotAIModelId: '2bot-ai-voice-pro',
    providerOptions: [OPENAI_TTS1],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 1,
    },
  },

  '2bot-ai-voice-ultra': {
    twobotAIModelId: '2bot-ai-voice-ultra',
    providerOptions: [OPENAI_TTS1_HD],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 1,
    },
  },

  '2bot-ai-transcribe-lite': {
    twobotAIModelId: '2bot-ai-transcribe-lite',
    providerOptions: [OPENAI_WHISPER],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 1,
    },
  },
};

// ============================================================================
// Combined Mappings (Auto-curated + Manual)
// ============================================================================

/**
 * Build the complete model mappings by merging auto-curated text/reasoning/image
 * mappings with manual voice/transcribe mappings.
 */
function buildModelMappings(): Record<TwoBotAIModelId, TwoBotAIModelMapping> {
  const autoCurated = refreshAllTierAssignments();
  return {
    ...autoCurated,
    ...MANUAL_MAPPINGS,
  } as Record<TwoBotAIModelId, TwoBotAIModelMapping>;
}

/**
 * Complete mapping of all 2Bot models to their provider options.
 *
 * Auto-curated models (text, reasoning, image) are generated from pricing
 * tables and tier cost ranges. Manual models (voice, transcribe) are
 * hardcoded above.
 */
export const TWOBOT_AI_MODEL_MAPPINGS: Record<TwoBotAIModelId, TwoBotAIModelMapping> = buildModelMappings();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the mapping for a 2Bot model
 */
export function getTwoBotAIModelMapping(
  twobotAIModelId: TwoBotAIModelId
): TwoBotAIModelMapping | undefined {
  return TWOBOT_AI_MODEL_MAPPINGS[twobotAIModelId];
}

/**
 * Get all enabled provider options for a 2Bot model
 */
export function getEnabledProviderOptions(
  twobotAIModelId: TwoBotAIModelId
): ProviderModelOption[] {
  const mapping = TWOBOT_AI_MODEL_MAPPINGS[twobotAIModelId];
  if (!mapping) return [];
  return mapping.providerOptions.filter((opt) => opt.enabled);
}

/**
 * Get the primary (highest priority) provider option for a 2Bot model
 */
export function getPrimaryProviderOption(
  twobotAIModelId: TwoBotAIModelId
): ProviderModelOption | undefined {
  const options = getEnabledProviderOptions(twobotAIModelId);
  if (options.length === 0) return undefined;
  return options.sort((a, b) => a.priority - b.priority)[0];
}

/**
 * Check if a 2Bot model has multiple provider options
 */
export function hasMultipleProviders(twobotAIModelId: TwoBotAIModelId): boolean {
  return getEnabledProviderOptions(twobotAIModelId).length > 1;
}

/**
 * Get the default selection strategy for a 2Bot model
 */
export function getDefaultStrategy(
  twobotAIModelId: TwoBotAIModelId
): ModelSelectionStrategy {
  const mapping = TWOBOT_AI_MODEL_MAPPINGS[twobotAIModelId];
  return mapping?.defaultStrategy ?? 'priority';
}
