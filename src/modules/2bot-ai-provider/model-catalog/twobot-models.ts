/**
 * 2Bot AI Model Definitions
 *
 * This file defines all available 2Bot-branded AI models.
 * Each model has a human-readable name and is mapped to provider models
 * in the model-mappings.ts file.
 */

import type {
    TwoBotAIModel,
    TwoBotAIModelFeatures,
    TwoBotAIModelId,
} from './model-catalog.types';

// ============================================================================
// Feature Presets (Common feature combinations)
// ============================================================================

const TEXT_LITE_FEATURES: TwoBotAIModelFeatures = {
  streaming: true,
  functionCalling: true,
  vision: true,  // Claude 3.5 Haiku & gpt-4o-mini both support vision
  jsonMode: true,
  systemMessage: true,
  multiTurn: true,
  reasoning: false,
  codeExecution: false,
};

const TEXT_PRO_FEATURES: TwoBotAIModelFeatures = {
  streaming: true,
  functionCalling: true,
  vision: true,
  jsonMode: true,
  systemMessage: true,
  multiTurn: true,
  reasoning: false,
  codeExecution: true,
};

const TEXT_ULTRA_FEATURES: TwoBotAIModelFeatures = {
  streaming: true,
  functionCalling: true,
  vision: true,
  jsonMode: true,
  systemMessage: true,
  multiTurn: true,
  reasoning: true,
  codeExecution: true,
};

const REASONING_PRO_FEATURES: TwoBotAIModelFeatures = {
  streaming: true,
  functionCalling: true,
  vision: true,  // Claude Sonnet 4 (primary provider) supports vision
  jsonMode: true,
  systemMessage: true,
  multiTurn: true,
  reasoning: true,
  codeExecution: true,
};

const REASONING_ULTRA_FEATURES: TwoBotAIModelFeatures = {
  streaming: true,
  functionCalling: true,
  vision: true,
  jsonMode: true,
  systemMessage: true,
  multiTurn: true,
  reasoning: true,
  codeExecution: true,
};

const IMAGE_FEATURES: TwoBotAIModelFeatures = {
  streaming: false,
  functionCalling: false,
  vision: false,
  jsonMode: false,
  systemMessage: false,
  multiTurn: false,
  reasoning: false,
  codeExecution: false,
};

const VOICE_FEATURES: TwoBotAIModelFeatures = {
  streaming: true,
  functionCalling: false,
  vision: false,
  jsonMode: false,
  systemMessage: false,
  multiTurn: false,
  reasoning: false,
  codeExecution: false,
};

const TRANSCRIBE_FEATURES: TwoBotAIModelFeatures = {
  streaming: false,
  functionCalling: false,
  vision: false,
  jsonMode: true,
  systemMessage: false,
  multiTurn: false,
  reasoning: false,
  codeExecution: false,
};

// ============================================================================
// 2Bot Model Definitions
// ============================================================================

/**
 * All 2Bot AI model definitions
 * 
 * 3-Tier System:
 * - lite: Fast and affordable for everyday tasks
 * - pro: Balanced performance and quality
 * - ultra: Maximum capability for demanding tasks
 */
export const TWOBOT_AI_MODELS: Record<TwoBotAIModelId, TwoBotAIModel> = {
  // ==========================================================================
  // Text Generation Models
  // ==========================================================================

  '2bot-ai-text-lite': {
    id: '2bot-ai-text-lite',
    displayName: '2Bot AI Text Lite',
    description: 'Fast and cost-effective text generation for everyday tasks',
    capability: 'text-generation',
    tier: 'lite',
    maxContextTokens: 128000,
    maxOutputTokens: 16384,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-01-15'),
    features: TEXT_LITE_FEATURES,
    tags: ['fast', 'affordable', 'general-purpose'],
  },

  '2bot-ai-text-pro': {
    id: '2bot-ai-text-pro',
    displayName: '2Bot AI Text Pro',
    description: 'Balanced performance with vision and code capabilities',
    capability: 'text-generation',
    tier: 'pro',
    maxContextTokens: 200000,
    maxOutputTokens: 32768,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-06-01'),
    features: TEXT_PRO_FEATURES,
    tags: ['balanced', 'vision', 'code', 'recommended'],
  },

  '2bot-ai-text-ultra': {
    id: '2bot-ai-text-ultra',
    displayName: '2Bot AI Text Ultra',
    description: 'Maximum capability with advanced reasoning',
    capability: 'text-generation',
    tier: 'ultra',
    maxContextTokens: 200000,
    maxOutputTokens: 32768,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-09-01'),
    features: TEXT_ULTRA_FEATURES,
    tags: ['premium', 'reasoning', 'complex-tasks', 'highest-quality'],
  },

  // ==========================================================================
  // Reasoning Models
  // ==========================================================================

  '2bot-ai-reasoning-pro': {
    id: '2bot-ai-reasoning-pro',
    displayName: '2Bot AI Reasoning Pro',
    description: 'Extended thinking for problem-solving and analysis',
    capability: 'text-generation',
    tier: 'pro',
    maxContextTokens: 128000,
    maxOutputTokens: 65536,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-12-01'),
    features: REASONING_PRO_FEATURES,
    tags: ['reasoning', 'math', 'logic', 'coding'],
  },

  '2bot-ai-reasoning-ultra': {
    id: '2bot-ai-reasoning-ultra',
    displayName: '2Bot AI Reasoning Ultra',
    description: 'Advanced reasoning with maximum thinking depth',
    capability: 'text-generation',
    tier: 'ultra',
    maxContextTokens: 200000,
    maxOutputTokens: 65536,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2025-01-15'),
    features: REASONING_ULTRA_FEATURES,
    tags: ['reasoning', 'research', 'complex-analysis', 'deep-thinking'],
  },

  // ==========================================================================
  // Image Generation Models
  // ==========================================================================

  '2bot-ai-image-pro': {
    id: '2bot-ai-image-pro',
    displayName: '2Bot AI Image Pro',
    description: 'High-quality image generation from text descriptions',
    capability: 'image-generation',
    tier: 'pro',
    maxContextTokens: 4000,
    maxOutputTokens: 0,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-01-15'),
    features: IMAGE_FEATURES,
    tags: ['creative', 'artwork', 'design'],
  },

  '2bot-ai-image-ultra': {
    id: '2bot-ai-image-ultra',
    displayName: '2Bot AI Image Ultra',
    description: 'Premium HD image generation with larger sizes',
    capability: 'image-generation',
    tier: 'ultra',
    maxContextTokens: 4000,
    maxOutputTokens: 0,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-03-01'),
    features: IMAGE_FEATURES,
    tags: ['hd', 'professional', 'high-resolution'],
  },

  // ==========================================================================
  // Speech Synthesis (TTS) Models
  // ==========================================================================

  '2bot-ai-voice-pro': {
    id: '2bot-ai-voice-pro',
    displayName: '2Bot AI Voice Pro',
    description: 'Natural text-to-speech with multiple voice options',
    capability: 'speech-synthesis',
    tier: 'pro',
    maxContextTokens: 4096,
    maxOutputTokens: 0,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-01-15'),
    features: VOICE_FEATURES,
    tags: ['tts', 'audio', 'narration'],
  },

  '2bot-ai-voice-ultra': {
    id: '2bot-ai-voice-ultra',
    displayName: '2Bot AI Voice Ultra',
    description: 'High-definition voice synthesis with enhanced clarity',
    capability: 'speech-synthesis',
    tier: 'ultra',
    maxContextTokens: 4096,
    maxOutputTokens: 0,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-06-01'),
    features: VOICE_FEATURES,
    tags: ['tts', 'hd-audio', 'professional'],
  },

  // ==========================================================================
  // Speech Recognition (STT) Models
  // ==========================================================================

  '2bot-ai-transcribe-lite': {
    id: '2bot-ai-transcribe-lite',
    displayName: '2Bot AI Transcribe Lite',
    description: 'Accurate speech-to-text transcription with multi-language support',
    capability: 'speech-recognition',
    tier: 'lite',
    maxContextTokens: 0,
    maxOutputTokens: 0,
    isAvailable: true,
    isDeprecated: false,
    releasedAt: new Date('2024-01-15'),
    features: TRANSCRIBE_FEATURES,
    tags: ['stt', 'transcription', 'multilingual'],
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all available 2Bot models
 */
export function getAvailableTwoBotAIModels(): TwoBotAIModel[] {
  return Object.values(TWOBOT_AI_MODELS).filter((model) => model.isAvailable && !model.isDeprecated);
}

/**
 * Get 2Bot models by capability
 */
export function getTwoBotAIModelsByCapability(
  capability: TwoBotAIModel['capability']
): TwoBotAIModel[] {
  return Object.values(TWOBOT_AI_MODELS).filter(
    (model) => model.capability === capability && model.isAvailable && !model.isDeprecated
  );
}

/**
 * Get 2Bot models by tier
 */
export function getTwoBotAIModelsByTier(tier: TwoBotAIModel['tier']): TwoBotAIModel[] {
  return Object.values(TWOBOT_AI_MODELS).filter(
    (model) => model.tier === tier && model.isAvailable && !model.isDeprecated
  );
}

/**
 * Get a single 2Bot model by ID
 */
export function getTwoBotAIModel(id: TwoBotAIModelId): TwoBotAIModel | undefined {
  return TWOBOT_AI_MODELS[id];
}

/**
 * Check if a model ID exists
 */
export function twoBotAIModelExists(id: string): id is TwoBotAIModelId {
  return id in TWOBOT_AI_MODELS;
}
