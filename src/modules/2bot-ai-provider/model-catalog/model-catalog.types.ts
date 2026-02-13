/**
 * 2Bot AI Model Catalog Type Definitions
 *
 * This module defines the types for the 2Bot model abstraction layer.
 * Users interact with 2Bot-branded models (e.g., "2bot-ai-text-pro") while
 * the system routes to underlying provider models (OpenAI, Anthropic, etc.)
 */

import type { AICapability, TwoBotAIProvider } from '../types';

/**
 * Provider type alias for model catalog (re-exports TwoBotAIProvider)
 */
export type Provider = TwoBotAIProvider;

// ============================================================================
// Model Selection Strategies
// ============================================================================

/**
 * Strategy for selecting which provider model to use when multiple are available
 */
export type ModelSelectionStrategy =
  | 'priority' // Use provider order (first available wins)
  | 'round-robin' // Distribute load across providers
  | 'weighted' // Use weighted distribution based on defined weights
  | 'failover' // Use primary, fall back to secondary on failure
  | 'lowest-cost' // Select cheapest option at request time
  | 'fastest' // Select based on latency metrics
  | 'best-quality' // Select highest quality option;

/**
 * Configuration for model selection behavior
 */
export interface ModelSelectionConfig {
  strategy: ModelSelectionStrategy;
  /** For round-robin: tracks current position */
  currentIndex?: number;
  /** For weighted: provider weights (must sum to 1.0) */
  weights?: Record<Provider, number>;
  /** For failover: maximum retry attempts */
  maxRetries?: number;
  /** For fastest: latency threshold in ms before trying next */
  latencyThresholdMs?: number;
}

// ============================================================================
// Provider Model Mapping
// ============================================================================

/**
 * Represents a single provider's model that can fulfill a 2Bot model request
 */
export interface ProviderModelOption {
  /** The provider (openai, anthropic, etc.) */
  provider: Provider;
  /** The actual provider model ID (e.g., "gpt-4o", "claude-sonnet-4") */
  modelId: string;
  /** Priority order (lower = higher priority, used with 'priority' strategy) */
  priority: number;
  /** Weight for weighted distribution (0.0-1.0) */
  weight?: number;
  /** Whether this provider option is currently enabled */
  enabled: boolean;
  /** Optional: Override context window for this specific mapping */
  contextWindowOverride?: number;
  /** Optional: Provider-specific configuration */
  providerConfig?: Record<string, unknown>;
}

// ============================================================================
// 2Bot Model Tier System
// ============================================================================

/**
 * Tier levels for 2Bot models - affects pricing, capabilities, and plan access
 * 
 * Plan Access Matrix:
 * - FREE plan: lite only
 * - STARTER plan: lite, pro
 * - PRO+ plans: lite, pro, ultra
 */
export type TwoBotAIModelTier = 'lite' | 'pro' | 'ultra';

/**
 * Tier metadata for display and pricing multipliers
 */
export interface TwoBotAIModelTierInfo {
  tier: TwoBotAIModelTier;
  displayName: string;
  description: string;
  /** Badge color for UI display */
  badgeColor: 'gray' | 'blue' | 'gold';
  /** Base price multiplier relative to lite tier */
  priceMultiplier: number;
}

/**
 * Tier definitions with display information
 */
export const TWOBOT_AI_MODEL_TIERS: Record<TwoBotAIModelTier, TwoBotAIModelTierInfo> = {
  lite: {
    tier: 'lite',
    displayName: 'Lite',
    description: 'Fast and cost-effective',
    badgeColor: 'gray',
    priceMultiplier: 1.0,
  },
  pro: {
    tier: 'pro',
    displayName: 'Pro',
    description: 'Balanced performance and quality',
    badgeColor: 'blue',
    priceMultiplier: 2.0,
  },
  ultra: {
    tier: 'ultra',
    displayName: 'Ultra',
    description: 'Maximum capability and quality',
    badgeColor: 'gold',
    priceMultiplier: 4.0,
  },
};

// ============================================================================
// 2Bot Model Definition
// ============================================================================

/**
 * Core definition of a 2Bot-branded AI model
 */
export interface TwoBotAIModel {
  /** Unique 2Bot model identifier (e.g., "2bot-ai-text-pro") */
  id: TwoBotAIModelId;
  /** Human-readable name (e.g., "2Bot AI Text Pro") */
  displayName: string;
  /** Short description for UI display */
  description: string;
  /** The AI capability this model provides */
  capability: AICapability;
  /** Model tier for pricing and feature gating */
  tier: TwoBotAIModelTier;
  /** Maximum context window (tokens) - uses highest available provider */
  maxContextTokens: number;
  /** Maximum output tokens supported */
  maxOutputTokens: number;
  /** Whether the model is currently available */
  isAvailable: boolean;
  /** Whether this model is deprecated */
  isDeprecated: boolean;
  /** Deprecation message if applicable */
  deprecationMessage?: string;
  /** Suggested replacement model if deprecated */
  replacementModelId?: TwoBotAIModelId;
  /** Release date for sorting/display */
  releasedAt: Date;
  /** Feature flags for this model */
  features: TwoBotAIModelFeatures;
  /** Tags for filtering/search */
  tags: string[];
}

/**
 * Feature flags indicating model capabilities
 */
export interface TwoBotAIModelFeatures {
  /** Supports streaming responses */
  streaming: boolean;
  /** Supports function/tool calling */
  functionCalling: boolean;
  /** Supports vision/image input */
  vision: boolean;
  /** Supports JSON mode output */
  jsonMode: boolean;
  /** Supports system messages */
  systemMessage: boolean;
  /** Supports multi-turn conversations */
  multiTurn: boolean;
  /** Has extended thinking capabilities */
  reasoning: boolean;
  /** Supports code execution */
  codeExecution: boolean;
}

// ============================================================================
// 2Bot Model Mapping (Links 2Bot model to provider models)
// ============================================================================

/**
 * Maps a 2Bot model to its underlying provider models
 */
export interface TwoBotAIModelMapping {
  /** The 2Bot model ID */
  twobotAIModelId: TwoBotAIModelId;
  /** Available provider models that can fulfill this 2Bot model */
  providerOptions: ProviderModelOption[];
  /** Default selection strategy for this model */
  defaultStrategy: ModelSelectionStrategy;
  /** Strategy configuration */
  strategyConfig?: ModelSelectionConfig;
}

// ============================================================================
// 2Bot Model IDs (Type-safe model identifiers)
// ============================================================================

/**
 * All valid 2Bot AI model identifiers
 * Format: 2bot-ai-{capability}-{tier}
 * 
 * Tiers: lite, pro, ultra
 */
export type TwoBotAIModelId =
  // Text Generation Models
  | '2bot-ai-text-lite'
  | '2bot-ai-text-pro'
  | '2bot-ai-text-ultra'
  // Reasoning Models
  | '2bot-ai-reasoning-pro'
  | '2bot-ai-reasoning-ultra'
  // Image Generation Models
  | '2bot-ai-image-pro'
  | '2bot-ai-image-ultra'
  // Speech Synthesis Models
  | '2bot-ai-voice-pro'
  | '2bot-ai-voice-ultra'
  // Speech Recognition Models
  | '2bot-ai-transcribe-lite';

/**
 * Type guard to check if a string is a valid TwoBotAIModelId
 */
export function isTwoBotAIModelId(value: string): value is TwoBotAIModelId {
  return VALID_TWOBOT_AI_MODEL_IDS.includes(value as TwoBotAIModelId);
}

/**
 * Array of all valid 2Bot model IDs for runtime validation
 */
export const VALID_TWOBOT_AI_MODEL_IDS: TwoBotAIModelId[] = [
  '2bot-ai-text-lite',
  '2bot-ai-text-pro',
  '2bot-ai-text-ultra',
  '2bot-ai-reasoning-pro',
  '2bot-ai-reasoning-ultra',
  '2bot-ai-image-pro',
  '2bot-ai-image-ultra',
  '2bot-ai-voice-pro',
  '2bot-ai-voice-ultra',
  '2bot-ai-transcribe-lite',
];

// ============================================================================
// Model Catalog Types
// ============================================================================

/**
 * The complete model catalog containing all 2Bot models and their mappings
 */
export interface TwoBotAIModelCatalog {
  /** All 2Bot model definitions */
  models: Record<TwoBotAIModelId, TwoBotAIModel>;
  /** Mappings from 2Bot models to provider models */
  mappings: Record<TwoBotAIModelId, TwoBotAIModelMapping>;
  /** Catalog version for cache invalidation */
  version: string;
  /** Last updated timestamp */
  updatedAt: Date;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Model info returned to frontend (hides provider details)
 */
export interface TwoBotAIModelInfo {
  id: TwoBotAIModelId;
  displayName: string;
  description: string;
  capability: AICapability;
  tier: TwoBotAIModelTier;
  tierInfo: TwoBotAIModelTierInfo;
  maxContextTokens: number;
  maxOutputTokens: number;
  isAvailable: boolean;
  features: TwoBotAIModelFeatures;
  tags: string[];
  /** Estimated credits per 1K tokens (for text models) */
  estimatedCreditsPerKTokens?: number;
  /** Estimated credits per unit (for other capabilities) */
  estimatedCreditsPerUnit?: number;
}

/**
 * Request type for model resolution (internal use)
 */
export interface ModelResolutionRequest {
  twobotAIModelId: TwoBotAIModelId;
  /** Override the default strategy */
  strategy?: ModelSelectionStrategy;
  /** Preferred provider (hint, not guaranteed) */
  preferredProvider?: Provider;
  /** Exclude specific providers */
  excludeProviders?: Provider[];
}

/**
 * Result of model resolution (internal use)
 */
export interface ModelResolutionResult {
  /** The resolved provider model ID */
  providerModelId: string;
  /** The provider that will handle the request */
  provider: Provider;
  /** The original 2Bot model ID */
  twobotAIModelId: TwoBotAIModelId;
  /** Strategy used for resolution */
  strategyUsed: ModelSelectionStrategy;
  /** Other available options (for failover) */
  fallbackOptions: ProviderModelOption[];
}
