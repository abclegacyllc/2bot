/**
 * 2Bot Model to Provider Model Mappings
 *
 * This file defines how each 2Bot model maps to underlying provider models.
 * When a user requests a 2Bot model (e.g., "2bot-ai-text-pro"), the system
 * resolves it to an actual provider model (e.g., "gpt-4o" or "claude-sonnet-4").
 */

import type {
    ModelSelectionStrategy,
    ProviderModelOption,
    TwoBotAIModelId,
    TwoBotAIModelMapping,
} from './model-catalog.types';

// ============================================================================
// Provider Model Options (Building blocks for mappings)
// ============================================================================

/**
 * OpenAI text generation models
 */
const OPENAI_GPT4O_MINI: ProviderModelOption = {
  provider: 'openai',
  modelId: 'gpt-4o-mini',
  priority: 3,  // OpenAI key is placeholder — deprioritized
  weight: 0.5,
  enabled: true,
};

const OPENAI_GPT4O: ProviderModelOption = {
  provider: 'openai',
  modelId: 'gpt-4o',
  priority: 3,  // OpenAI key is placeholder — deprioritized
  weight: 0.5,
  enabled: true,
};

const _OPENAI_GPT4O_2024_11_20: ProviderModelOption = {
  provider: 'openai',
  modelId: 'gpt-4o-2024-11-20',
  priority: 3,  // OpenAI key is placeholder — deprioritized
  weight: 0.3,
  enabled: true,
};

const OPENAI_O3_MINI: ProviderModelOption = {
  provider: 'openai',
  modelId: 'o3-mini',
  priority: 3,  // OpenAI key is placeholder — deprioritized
  weight: 0.6,
  enabled: true,
};

const OPENAI_O1: ProviderModelOption = {
  provider: 'openai',
  modelId: 'o1',
  priority: 3,  // OpenAI key is placeholder — deprioritized
  weight: 0.4,
  enabled: true,
};

const OPENAI_O1_PRO: ProviderModelOption = {
  provider: 'openai',
  modelId: 'o1-pro',
  priority: 3,  // OpenAI key is placeholder — deprioritized
  weight: 0.5,
  enabled: true,
};

/**
 * Anthropic text generation models
 */
// --- Latest Anthropic models (preferred) ---
const ANTHROPIC_CLAUDE_OPUS_46: ProviderModelOption = {
  provider: 'anthropic',
  modelId: 'claude-opus-4-6-20260131',
  priority: 1,  // Best premium model — 3x cheaper than old Opus 4
  weight: 0.5,
  enabled: true,
};

const ANTHROPIC_CLAUDE_SONNET_45: ProviderModelOption = {
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-5-20251022',
  priority: 1,  // Latest balanced model
  weight: 0.5,
  enabled: true,
};

const ANTHROPIC_CLAUDE_HAIKU_45: ProviderModelOption = {
  provider: 'anthropic',
  modelId: 'claude-haiku-4-5-20251022',
  priority: 1,  // Latest fast model
  weight: 0.5,
  enabled: true,
};

// --- Previous generation (kept as fallback for lite tier) ---
const ANTHROPIC_CLAUDE_HAIKU: ProviderModelOption = {
  provider: 'anthropic',
  modelId: 'claude-3-5-haiku-20241022',
  priority: 2,  // Fallback — prefer Haiku 4.5
  weight: 0.5,
  enabled: true,
};

/**
 * OpenAI image generation models
 */
const OPENAI_DALLE3: ProviderModelOption = {
  provider: 'openai',
  modelId: 'dall-e-3',
  priority: 3,  // OpenAI key is placeholder — deprioritized
  weight: 1.0,
  enabled: true,
};

const OPENAI_DALLE3_HD: ProviderModelOption = {
  provider: 'openai',
  modelId: 'dall-e-3',
  priority: 3,  // OpenAI key is placeholder — deprioritized
  weight: 1.0,
  enabled: true,
  providerConfig: { quality: 'hd' },
};

/**
 * OpenAI speech models
 */
const OPENAI_TTS1: ProviderModelOption = {
  provider: 'openai',
  modelId: 'tts-1',
  priority: 1,  // Only provider with TTS — keep as primary
  weight: 1.0,
  enabled: true,
};

const OPENAI_TTS1_HD: ProviderModelOption = {
  provider: 'openai',
  modelId: 'tts-1-hd',
  priority: 1,  // Only provider with TTS — keep as primary
  weight: 1.0,
  enabled: true,
};

const OPENAI_WHISPER: ProviderModelOption = {
  provider: 'openai',
  modelId: 'whisper-1',
  priority: 1,  // Only provider with STT — keep as primary
  weight: 1.0,
  enabled: true,
};

/**
 * Together AI text generation models
 */
const TOGETHER_GEMMA_3N: ProviderModelOption = {
  provider: 'together',
  modelId: 'google/gemma-3n-E4B-it',
  priority: 2,  // Together is secondary fallback
  weight: 0.3,
  enabled: true,
};

const TOGETHER_LLAMA_32_3B: ProviderModelOption = {
  provider: 'together',
  modelId: 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
  priority: 2,  // Together is secondary fallback
  weight: 0.3,
  enabled: true,
};

const TOGETHER_QWEN3_NEXT: ProviderModelOption = {
  provider: 'together',
  modelId: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
  priority: 2,  // Together is secondary fallback
  weight: 0.3,
  enabled: true,
};

const TOGETHER_DEEPSEEK_V3: ProviderModelOption = {
  provider: 'together',
  modelId: 'deepseek-ai/DeepSeek-V3.1',
  priority: 2,  // Together is secondary fallback
  weight: 0.3,
  enabled: true,
};

const TOGETHER_DEEPSEEK_R1: ProviderModelOption = {
  provider: 'together',
  modelId: 'deepseek-ai/DeepSeek-R1',
  priority: 2,  // Together is secondary fallback
  weight: 0.3,
  enabled: true,
};

const TOGETHER_QWEN3_THINKING: ProviderModelOption = {
  provider: 'together',
  modelId: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
  priority: 2,  // Together is secondary fallback
  weight: 0.3,
  enabled: true,
};

const TOGETHER_COGITO_671B: ProviderModelOption = {
  provider: 'together',
  modelId: 'deepcogito/cogito-v2-1-671b',
  priority: 2,  // Together is secondary fallback
  weight: 0.3,
  enabled: true,
};

/**
 * Together AI image generation models
 */
const TOGETHER_FLUX_SCHNELL: ProviderModelOption = {
  provider: 'together',
  modelId: 'black-forest-labs/FLUX.1-schnell',
  priority: 1,  // Together is working primary for images
  weight: 0.4,
  enabled: true,
};

const TOGETHER_FLUX2_PRO: ProviderModelOption = {
  provider: 'together',
  modelId: 'black-forest-labs/FLUX.2-pro',
  priority: 1,  // Together is working primary for images
  weight: 0.4,
  enabled: true,
};

// ============================================================================
// 2Bot Model Mappings
// ============================================================================

/**
 * Complete mapping of all 2Bot models to their provider options
 * 
 * 3-Tier System:
 * - lite: Maps to fast/affordable models (gpt-4o-mini, haiku)
 * - pro: Maps to balanced models (gpt-4o, sonnet)
 * - ultra: Maps to premium models (opus, o1-pro)
 */
export const TWOBOT_AI_MODEL_MAPPINGS: Record<TwoBotAIModelId, TwoBotAIModelMapping> = {
  // ==========================================================================
  // Text Generation Mappings
  // ==========================================================================

  '2bot-ai-text-lite': {
    twobotAIModelId: '2bot-ai-text-lite',
    providerOptions: [ANTHROPIC_CLAUDE_HAIKU_45, OPENAI_GPT4O_MINI, ANTHROPIC_CLAUDE_HAIKU, TOGETHER_GEMMA_3N, TOGETHER_LLAMA_32_3B],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 2,
    },
  },

  '2bot-ai-text-pro': {
    twobotAIModelId: '2bot-ai-text-pro',
    providerOptions: [ANTHROPIC_CLAUDE_SONNET_45, OPENAI_GPT4O, TOGETHER_QWEN3_NEXT, TOGETHER_DEEPSEEK_V3],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 2,
    },
  },

  '2bot-ai-text-ultra': {
    twobotAIModelId: '2bot-ai-text-ultra',
    providerOptions: [ANTHROPIC_CLAUDE_OPUS_46, OPENAI_GPT4O, TOGETHER_DEEPSEEK_R1, TOGETHER_COGITO_671B],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 2,
    },
  },

  // ==========================================================================
  // Reasoning Mappings
  // ==========================================================================

  '2bot-ai-reasoning-pro': {
    twobotAIModelId: '2bot-ai-reasoning-pro',
    providerOptions: [OPENAI_O3_MINI, ANTHROPIC_CLAUDE_SONNET_45, TOGETHER_QWEN3_THINKING],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 2,
    },
  },

  '2bot-ai-reasoning-ultra': {
    twobotAIModelId: '2bot-ai-reasoning-ultra',
    providerOptions: [OPENAI_O1_PRO, OPENAI_O1, ANTHROPIC_CLAUDE_OPUS_46, TOGETHER_DEEPSEEK_R1],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 2,
    },
  },

  // ==========================================================================
  // Image Generation Mappings
  // ==========================================================================

  '2bot-ai-image-pro': {
    twobotAIModelId: '2bot-ai-image-pro',
    providerOptions: [OPENAI_DALLE3, TOGETHER_FLUX_SCHNELL],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 1,
    },
  },

  '2bot-ai-image-ultra': {
    twobotAIModelId: '2bot-ai-image-ultra',
    providerOptions: [OPENAI_DALLE3_HD, TOGETHER_FLUX2_PRO],
    defaultStrategy: 'priority',
    strategyConfig: {
      strategy: 'priority',
      maxRetries: 1,
    },
  },

  // ==========================================================================
  // Speech Synthesis Mappings
  // ==========================================================================

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

  // ==========================================================================
  // Speech Recognition Mappings
  // ==========================================================================

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
