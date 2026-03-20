/**
 * Model Registry — Single Source of Truth
 *
 * Every AI model available in the platform is defined ONCE here.
 * Pricing is in human-readable USD per unit; credits are auto-computed.
 *
 * Adding a new model? Add one entry to this file. That's it.
 * Cross-provider models are a single entry with multiple providers.
 *
 * Dollar constants:
 *   $1 = 100 credits (1 credit = $0.01)
 *   Pricing strategy: 2× margin over API cost → MARGIN = 200
 *   Formula: creditsPerToken = (usdPer1M / 1 000 000) × 200
 *
 * @module modules/2bot-ai-provider/model-registry
 */

import type { AICapability, ModelCapabilities, ModelInfo, TwoBotAIProvider } from "./types";

// ===========================================
// Constants
// ===========================================

/** 2× margin: $1 = 100 credits, so API cost × 200 = credits */
export const MARGIN = 200;

// ===========================================
// Registry Types
// ===========================================

/** Per-provider pricing in USD (human-readable) */
export interface ProviderCost {
  /** Provider-specific model ID used in API calls */
  readonly modelId: string;
  /** USD per 1 M input tokens (text-gen / embedding) */
  readonly inputPer1M?: number;
  /** USD per 1 M output tokens (text-gen) */
  readonly outputPer1M?: number;
  /** USD per image generated */
  readonly perImage?: number;
  /** USD per 1 M characters (speech synthesis) */
  readonly perCharM?: number;
  /** USD per minute of audio (speech recognition) */
  readonly perMinute?: number;
  /** USD per second of video generated */
  readonly perSecond?: number;
}

export interface ModelRegistryEntry {
  readonly id: string;
  readonly displayName: string;
  /** Company / organization that created this model */
  readonly author: string;
  readonly description: string;
  readonly capability: AICapability;
  readonly tier: number;
  readonly badge?: string;
  readonly deprecated?: boolean;
  readonly deprecationMessage?: string;
  readonly capabilities: ModelCapabilities;
  readonly maxTokens?: number;
  readonly contextWindow?: number;
  /** Provider map — one entry per provider that serves this model */
  readonly providers: Partial<Record<TwoBotAIProvider, ProviderCost>>;
}

// ===========================================
// Credit Computation Helpers (USD → credits)
// ===========================================

/** USD/1M input tokens → credits per input token */
export function creditPerInputToken(inputPer1M: number): number {
  return (inputPer1M / 1_000_000) * MARGIN;
}

/** USD/1M output tokens → credits per output token */
export function creditPerOutputToken(outputPer1M: number): number {
  return (outputPer1M / 1_000_000) * MARGIN;
}

/** USD per image → credits per image */
export function creditPerImage(perImage: number): number {
  return perImage * MARGIN;
}

/** USD/1M characters → credits per character */
export function creditPerChar(perCharM: number): number {
  return (perCharM / 1_000_000) * MARGIN;
}

/** USD per minute → credits per minute */
export function creditPerMinute(perMin: number): number {
  return perMin * MARGIN;
}

/** USD per second of video → credits per second */
export function creditPerSecond(perSec: number): number {
  return perSec * MARGIN;
}

// ===========================================
// Capability Presets (defined ONCE)
// ===========================================

export const CHAT_CAPS: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["text"],
  supportsStreaming: true,
  supportsFunctionCalling: true,
  supportsJsonMode: true,
};

export const VISION_CAPS: ModelCapabilities = {
  inputTypes: ["text", "image"],
  outputTypes: ["text"],
  canAnalyzeImages: true,
  supportsStreaming: true,
  supportsFunctionCalling: true,
  supportsJsonMode: true,
};

export const IMAGE_GEN_CAPS: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["image"],
  canGenerateImages: true,
  supportsStreaming: false,
};

export const SPEECH_SYNTH_CAPS: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["audio"],
  canGenerateAudio: true,
  supportsStreaming: true,
};

export const SPEECH_REC_CAPS: ModelCapabilities = {
  inputTypes: ["audio"],
  outputTypes: ["text"],
  canTranscribeAudio: true,
  supportsStreaming: false,
};

export const EMBEDDING_CAPS: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["text"],
  supportsStreaming: false,
};

export const VIDEO_GEN_CAPS: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["video"],
  supportsStreaming: false,
};

export const CHAT_IMAGE_CAPS: ModelCapabilities = {
  inputTypes: ["text", "image"],
  outputTypes: ["text", "image"],
  canGenerateImages: true,
  canAnalyzeImages: true,
  supportsStreaming: true,
};

// ===========================================
// Model Registry (90 canonical entries)
// ===========================================

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = [
  // ========================================
  // Text Generation
  // ========================================
  // --- OpenAI ---
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    author: "OpenAI",
    description: "Fast, affordable model for everyday tasks",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VISION_CAPS, reasoning: "medium", speed: "high", creativity: "medium" },
    maxTokens: 16384,
    contextWindow: 128000,
    providers: {
      openai: { modelId: "gpt-4o-mini", inputPer1M: 0.15, outputPer1M: 0.6 },
    },
  },
  {
    id: "gpt-4o",
    displayName: "GPT-4o",
    author: "OpenAI",
    description: "Most capable OpenAI model for complex tasks",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "medium", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 128000,
    providers: {
      openai: { modelId: "gpt-4o", inputPer1M: 2.5, outputPer1M: 10 },
    },
  },
  {
    id: "o1-mini",
    displayName: "o1 Mini",
    author: "OpenAI",
    description: "Fast reasoning model, good for coding",
    capability: "text-generation",
    tier: 2,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "medium", creativity: "medium" },
    maxTokens: 65536,
    contextWindow: 128000,
    providers: {
      openai: { modelId: "o1-mini", inputPer1M: 1.1, outputPer1M: 4.4 },
    },
  },
  {
    id: "o3-mini",
    displayName: "o3 Mini",
    author: "OpenAI",
    description: "Latest reasoning model with improved performance",
    capability: "text-generation",
    tier: 2,
    badge: "REASONING",
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "medium" },
    maxTokens: 100000,
    contextWindow: 200000,
    providers: {
      openai: { modelId: "o3-mini", inputPer1M: 1.1, outputPer1M: 4.4 },
    },
  },

  // --- Anthropic ---
  {
    id: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    author: "Anthropic",
    description: "Latest fast model with improved intelligence",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "highest", creativity: "high" },
    maxTokens: 64000,
    contextWindow: 200000,
    providers: {
      anthropic: { modelId: "claude-haiku-4-5-20251001", inputPer1M: 1, outputPer1M: 5 },
      openrouter: { modelId: "anthropic/claude-haiku-4.5", inputPer1M: 1, outputPer1M: 5 },
    },
  },
  {
    id: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5",
    author: "Anthropic",
    description: "Balanced model (superseded by Sonnet 4.6)",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "high", creativity: "highest" },
    maxTokens: 64000,
    contextWindow: 200000,
    providers: {
      anthropic: { modelId: "claude-sonnet-4-5-20250929", inputPer1M: 3, outputPer1M: 15 },
      openrouter: { modelId: "anthropic/claude-sonnet-4.5", inputPer1M: 3, outputPer1M: 15 },
    },
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    author: "Anthropic",
    description: "Latest balanced model — best value for most tasks",
    capability: "text-generation",
    tier: 2,
    badge: "BEST",
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "high", creativity: "highest" },
    maxTokens: 128000,
    contextWindow: 1000000,
    providers: {
      google: { modelId: "claude-sonnet-4-6", inputPer1M: 3, outputPer1M: 15 },
      anthropic: { modelId: "claude-sonnet-4-6", inputPer1M: 3, outputPer1M: 15 },
      openrouter: { modelId: "anthropic/claude-sonnet-4.6", inputPer1M: 3, outputPer1M: 15 },
    },
  },
  {
    id: "claude-opus-4-5-20251101",
    displayName: "Claude Opus 4.5",
    author: "Anthropic",
    description: "Premium model with multimodal excellence",
    capability: "text-generation",
    tier: 3,
    badge: "BEST",
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 64000,
    contextWindow: 200000,
    providers: {
      anthropic: { modelId: "claude-opus-4-5-20251101", inputPer1M: 10, outputPer1M: 50 },
    },
  },
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    author: "Anthropic",
    description: "Most intelligent Claude model — 3x cheaper than Opus 4",
    capability: "text-generation",
    tier: 3,
    badge: "BEST",
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 128000,
    contextWindow: 1000000,
    providers: {
      google: { modelId: "claude-opus-4-6", inputPer1M: 5, outputPer1M: 25 },
      anthropic: { modelId: "claude-opus-4-6", inputPer1M: 5, outputPer1M: 25 },
      openrouter: { modelId: "anthropic/claude-opus-4.6", inputPer1M: 5, outputPer1M: 25 },
    },
  },
  // --- Multi-Provider ---
  {
    id: "deepseek-v3",
    displayName: "DeepSeek V3",
    author: "DeepSeek",
    description: "DeepSeek's powerful general model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "medium", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 163840,
    providers: {
      google: { modelId: "deepseek-v3.1-maas", inputPer1M: 0.4, outputPer1M: 1.2 },
      together: { modelId: "deepseek-ai/DeepSeek-V3.1", inputPer1M: 0.6, outputPer1M: 1.7 },
      fireworks: { modelId: "accounts/fireworks/models/deepseek-v3p1", inputPer1M: 0.2, outputPer1M: 0.6 },
      openrouter: { modelId: "deepseek/deepseek-chat-v3-0324", inputPer1M: 0.2, outputPer1M: 0.77 },
    },
  },
  {
    id: "llama-4-maverick",
    displayName: "Llama 4 Maverick",
    author: "Meta",
    description: "Meta's large MoE model with 1M context and vision",
    capability: "text-generation",
    tier: 2,
    badge: "VISION",
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "medium", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "llama-4-maverick-17b-128e-instruct-maas", inputPer1M: 0.2, outputPer1M: 0.6 },
      together: { modelId: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", inputPer1M: 0.27, outputPer1M: 0.85 },
      openrouter: { modelId: "meta-llama/llama-4-maverick", inputPer1M: 0.15, outputPer1M: 0.6 },
    },
  },
  {
    id: "llama-4-scout",
    displayName: "Llama 4 Scout",
    author: "Meta",
    description: "Meta's efficient scout model with 1M context and vision",
    capability: "text-generation",
    tier: 2,
    badge: "VISION",
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "high", creativity: "medium" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "llama-4-scout-17b-16e-instruct-maas", inputPer1M: 0.1, outputPer1M: 0.46 },
      together: { modelId: "meta-llama/Llama-4-Scout-17B-16E-Instruct", inputPer1M: 0.18, outputPer1M: 0.59 },
      openrouter: { modelId: "meta-llama/llama-4-scout", inputPer1M: 0.08, outputPer1M: 0.3 },
    },
  },
  {
    id: "meta/llama-3.3-70b",
    displayName: "Llama 3.3 70B",
    author: "Meta",
    description: "Meta's general-purpose 70B model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "medium", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 131072,
    providers: {
      google: { modelId: "llama-3.3-70b-instruct-maas", inputPer1M: 0.15, outputPer1M: 0.4 },
      together: { modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo", inputPer1M: 0.18, outputPer1M: 0.59 },
      fireworks: { modelId: "accounts/fireworks/models/llama-v3p3-70b-instruct", inputPer1M: 0.18, outputPer1M: 0.18 },
      openrouter: { modelId: "meta-llama/llama-3.3-70b-instruct", inputPer1M: 0.08, outputPer1M: 0.14 },
    },
  },
  {
    id: "gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    author: "OpenAI",
    description: "OpenAI open-source 20B model",
    capability: "text-generation",
    tier: 1,
    capabilities: { ...CHAT_CAPS, reasoning: "medium", speed: "high", creativity: "medium" },
    maxTokens: 4096,
    contextWindow: 131072,
    providers: {
      together: { modelId: "openai/gpt-oss-20b", inputPer1M: 0.05, outputPer1M: 0.2 },
      openrouter: { modelId: "openai/gpt-oss-20b", inputPer1M: 0.03, outputPer1M: 0.14 },
    },
  },
  {
    id: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    author: "OpenAI",
    description: "OpenAI open-source 120B reasoning model",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "low", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 131072,
    providers: {
      google: { modelId: "gpt-oss-120b-maas", inputPer1M: 1.5, outputPer1M: 5 },
    },
  },
  {
    id: "kimi-k2.5",
    displayName: "Kimi K2.5",
    author: "Moonshot AI",
    description: "Moonshot's multimodal model with vision",
    capability: "text-generation",
    tier: 2,
    badge: "VISION",
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "medium", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 262144,
    providers: {
      together: { modelId: "moonshotai/Kimi-K2.5", inputPer1M: 0.5, outputPer1M: 2.8 },
      fireworks: { modelId: "accounts/fireworks/models/kimi-k2p5", inputPer1M: 0.5, outputPer1M: 2.8 },
      openrouter: { modelId: "moonshotai/kimi-k2.5", inputPer1M: 0.45, outputPer1M: 2.2 },
    },
  },
  {
    id: "zai-org/GLM-5",
    displayName: "GLM 5",
    author: "Zhipu AI",
    description: "ZAI's flagship next-gen model",
    capability: "text-generation",
    tier: 3,
    badge: "NEW",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 16384,
    contextWindow: 202752,
    providers: {
      google: { modelId: "glm-5-maas", inputPer1M: 0.8, outputPer1M: 2.5 },
      together: { modelId: "zai-org/GLM-5", inputPer1M: 1, outputPer1M: 3.2 },
      fireworks: { modelId: "accounts/fireworks/models/glm-5", inputPer1M: 1, outputPer1M: 3.2 },
      openrouter: { modelId: "z-ai/glm-5", inputPer1M: 0.72, outputPer1M: 2.3 },
    },
  },
  {
    id: "zai-org/GLM-4.5-Air-FP8",
    displayName: "GLM 4.5 Air",
    author: "Zhipu AI",
    description: "ZAI's affordable efficient model",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...CHAT_CAPS, reasoning: "medium", speed: "high", creativity: "medium" },
    maxTokens: 8192,
    contextWindow: 131072,
    providers: {
      together: { modelId: "zai-org/GLM-4.5-Air-FP8", inputPer1M: 0.2, outputPer1M: 1.1 },
      openrouter: { modelId: "z-ai/glm-4.5-air", inputPer1M: 0.13, outputPer1M: 0.85 },
    },
  },
  {
    id: "MiniMaxAI/MiniMax-M2.5",
    displayName: "MiniMax M2.5",
    author: "MiniMax",
    description: "MiniMax's latest balanced model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "high", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 196608,
    providers: {
      together: { modelId: "MiniMaxAI/MiniMax-M2.5", inputPer1M: 0.3, outputPer1M: 1.2 },
      openrouter: { modelId: "minimax/minimax-m2.5", inputPer1M: 0.27, outputPer1M: 0.95 },
    },
  },
  {
    id: "minimaxai/minimax-m2",
    displayName: "MiniMax M2",
    author: "MiniMax",
    description: "MiniMax's reasoning model via Vertex AI",
    capability: "text-generation",
    tier: 2,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "medium", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 131072,
    providers: {
      google: { modelId: "minimax-m2-maas", inputPer1M: 0.5, outputPer1M: 2 },
    },
  },
  {
    id: "Qwen/Qwen3.5-397B-A17B",
    displayName: "Qwen3.5 397B",
    author: "Alibaba",
    description: "Qwen's latest flagship MoE model",
    capability: "text-generation",
    tier: 3,
    badge: "NEW",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 16384,
    contextWindow: 262144,
    providers: {
      together: { modelId: "Qwen/Qwen3.5-397B-A17B", inputPer1M: 0.6, outputPer1M: 3.6 },
      openrouter: { modelId: "qwen/qwen3.5-397b-a17b", inputPer1M: 0.39, outputPer1M: 2.34 },
    },
  },
  // --- Together AI ---
  {
    id: "ServiceNow-AI/Apriel-1.6-15b-Thinker",
    displayName: "Apriel 1.6 Thinker",
    author: "ServiceNow",
    description: "Free thinking model by ServiceNow",
    capability: "text-generation",
    tier: 1,
    badge: "FREE",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "medium", creativity: "medium" },
    maxTokens: 4096,
    contextWindow: 32768,
    providers: {
      together: { modelId: "ServiceNow-AI/Apriel-1.6-15b-Thinker", inputPer1M: 0, outputPer1M: 0 },
    },
  },

  {
    id: "google/gemma-3n-E4B-it",
    displayName: "Gemma 3n E4B",
    author: "Google",
    description: "Google's efficient small model",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VISION_CAPS, reasoning: "medium", speed: "highest", creativity: "medium" },
    maxTokens: 4096,
    contextWindow: 32768,
    providers: {
      together: { modelId: "google/gemma-3n-E4B-it", inputPer1M: 0.02, outputPer1M: 0.04 },
    },
  },


  {
    id: "Qwen/Qwen2.5-Coder-32B-Instruct",
    displayName: "Qwen2.5 Coder 32B",
    author: "Alibaba",
    description: "Qwen's code-specialized 32B model",
    capability: "text-generation",
    tier: 2,
    badge: "CODE",
    capabilities: { ...CHAT_CAPS },
    maxTokens: 8192,
    contextWindow: 131072,
    providers: {
      together: { modelId: "Qwen/Qwen2.5-Coder-32B-Instruct", inputPer1M: 0.12, outputPer1M: 0.12 },
    },
  },
  {
    id: "Qwen/Qwen3-235B-A22B-Instruct",
    displayName: "Qwen3 235B",
    author: "Alibaba",
    description: "Alibaba's largest instruct MoE model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "low", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 131072,
    providers: {
      google: { modelId: "qwen3-235b-a22b-instruct-2507-maas", inputPer1M: 0.8, outputPer1M: 2.4 },
      together: { modelId: "Qwen/Qwen3-235B-A22B-Instruct-2507-tput", inputPer1M: 0.2, outputPer1M: 0.6 },
      openrouter: { modelId: "qwen/qwen3-235b-a22b-instruct", inputPer1M: 0.15, outputPer1M: 0.6 },
    },
  },

  {
    id: "Qwen/Qwen3-Coder-Next-FP8",
    displayName: "Qwen3 Coder Next",
    author: "Alibaba",
    description: "Qwen's code-specialized model",
    capability: "text-generation",
    tier: 2,
    badge: "CODE",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "medium", creativity: "medium" },
    maxTokens: 16384,
    contextWindow: 131072,
    providers: {
      together: { modelId: "Qwen/Qwen3-Coder-Next-FP8", inputPer1M: 0.5, outputPer1M: 1.2 },
    },
  },
  {
    id: "Qwen/Qwen3-Next-80B-A3B-Instruct",
    displayName: "Qwen3 Next 80B",
    author: "Alibaba",
    description: "Qwen's efficient MoE model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "high", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 32768,
    providers: {
      google: { modelId: "qwen3-next-80b-a3b-instruct-maas", inputPer1M: 0.15, outputPer1M: 1.5 },
      together: { modelId: "Qwen/Qwen3-Next-80B-A3B-Instruct", inputPer1M: 0.15, outputPer1M: 1.5 },
    },
  },



  {
    id: "zai-org/GLM-4.7",
    displayName: "GLM 4.7",
    author: "Zhipu AI",
    description: "ZAI's large general-purpose model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "medium", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 202752,
    providers: {
      google: { modelId: "glm-4.7-maas", inputPer1M: 0.38, outputPer1M: 1.5 },
      together: { modelId: "zai-org/GLM-4.7", inputPer1M: 0.45, outputPer1M: 2 },
      fireworks: { modelId: "accounts/fireworks/models/glm-4p7", inputPer1M: 0.45, outputPer1M: 2 },
      openrouter: { modelId: "z-ai/glm-4.7", inputPer1M: 0.38, outputPer1M: 1.98 },
    },
  },
  {
    id: "Qwen/Qwen3-235B-A22B-Thinking-2507",
    displayName: "Qwen3 235B Thinking",
    author: "Alibaba",
    description: "Qwen's largest reasoning MoE model",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "low", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 131072,
    providers: {
      together: { modelId: "Qwen/Qwen3-235B-A22B-Thinking-2507", inputPer1M: 0.65, outputPer1M: 3 },
    },
  },
  {
    id: "Qwen/Qwen3-Next-80B-A3B-Thinking",
    displayName: "Qwen3 Next Thinking",
    author: "Alibaba",
    description: "Qwen's reasoning variant of the MoE model",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "medium", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 131072,
    providers: {
      together: { modelId: "Qwen/Qwen3-Next-80B-A3B-Thinking", inputPer1M: 0.15, outputPer1M: 1.5 },
    },
  },

  {
    id: "deepseek-ai/DeepSeek-R1",
    displayName: "DeepSeek R1",
    author: "DeepSeek",
    description: "DeepSeek's top reasoning model",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "low", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 163840,
    providers: {
      google: { modelId: "deepseek-r1-0528-maas", inputPer1M: 0.7, outputPer1M: 2.5 },
      together: { modelId: "deepseek-ai/DeepSeek-R1", inputPer1M: 3, outputPer1M: 7 },
      openrouter: { modelId: "deepseek/deepseek-r1", inputPer1M: 0.7, outputPer1M: 2.5 },
    },
  },
  {
    id: "deepseek-ai/deepseek-ocr",
    displayName: "DeepSeek OCR",
    author: "DeepSeek",
    description: "DeepSeek's vision-text OCR model",
    capability: "text-generation",
    tier: 2,
    badge: "VISION",
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "high", creativity: "low" },
    maxTokens: 8192,
    contextWindow: 131072,
    providers: {
      google: { modelId: "deepseek-ocr-maas", inputPer1M: 0.3, outputPer1M: 1 },
    },
  },
  {
    id: "moonshotai/Kimi-K2-Instruct-0905",
    displayName: "Kimi K2 Instruct",
    author: "Moonshot AI",
    description: "Moonshot's latest instruct model",
    capability: "text-generation",
    tier: 3,
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "low", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 262144,
    providers: {
      fireworks: { modelId: "accounts/fireworks/models/kimi-k2-instruct-0905", inputPer1M: 1, outputPer1M: 3 },
      openrouter: { modelId: "moonshotai/kimi-k2-0905", inputPer1M: 0.4, outputPer1M: 2 },
    },
  },
  {
    id: "moonshotai/Kimi-K2-Thinking",
    displayName: "Kimi K2 Thinking",
    author: "Moonshot AI",
    description: "Moonshot's advanced reasoning model",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "low", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 262144,
    providers: {
      google: { modelId: "kimi-k2-thinking-maas", inputPer1M: 0.6, outputPer1M: 2.5 },
      together: { modelId: "moonshotai/Kimi-K2-Thinking", inputPer1M: 1.2, outputPer1M: 4 },
      openrouter: { modelId: "moonshotai/kimi-k2-thinking", inputPer1M: 0.47, outputPer1M: 2 },
    },
  },

  // --- OpenRouter ---
  // --- xAI / Grok ---
  {
    id: "grok-4",
    displayName: "Grok 4",
    author: "xAI",
    description: "xAI's most capable model — top-tier reasoning",
    capability: "text-generation",
    tier: 3,
    badge: "BEST",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "low", creativity: "highest" },
    maxTokens: 128000,
    contextWindow: 256000,
    providers: {
      openrouter: { modelId: "x-ai/grok-4", inputPer1M: 3, outputPer1M: 15 },
    },
  },
  {
    id: "grok-4.20-beta",
    displayName: "Grok 4.20",
    author: "xAI",
    description: "xAI's latest agent-capable model with 2M context",
    capability: "text-generation",
    tier: 3,
    badge: "NEW",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 128000,
    contextWindow: 2000000,
    providers: {
      openrouter: { modelId: "x-ai/grok-4.20-beta", inputPer1M: 2, outputPer1M: 6 },
    },
  },
  {
    id: "grok-4-fast",
    displayName: "Grok 4 Fast",
    author: "xAI",
    description: "Fast Grok 4 variant with 2M context",
    capability: "text-generation",
    tier: 2,
    badge: "FAST",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "highest", creativity: "high" },
    maxTokens: 128000,
    contextWindow: 2000000,
    providers: {
      openrouter: { modelId: "x-ai/grok-4.1-fast", inputPer1M: 0.2, outputPer1M: 0.5 },
    },
  },
  {
    id: "grok-3-mini",
    displayName: "Grok 3 Mini",
    author: "xAI",
    description: "xAI's fast reasoning model — great value",
    capability: "text-generation",
    tier: 2,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "high", creativity: "medium" },
    maxTokens: 128000,
    contextWindow: 131072,
    providers: {
      openrouter: { modelId: "x-ai/grok-3-mini", inputPer1M: 0.3, outputPer1M: 0.5 },
    },
  },
  {
    id: "grok-code-fast-1",
    displayName: "Grok Code",
    author: "xAI",
    description: "xAI's code-specialized model",
    capability: "text-generation",
    tier: 2,
    badge: "CODE",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "high", creativity: "medium" },
    maxTokens: 128000,
    contextWindow: 256000,
    providers: {
      openrouter: { modelId: "x-ai/grok-code-fast-1", inputPer1M: 0.2, outputPer1M: 1.5 },
    },
  },
  // --- Microsoft ---
  {
    id: "microsoft/phi-4",
    displayName: "Phi-4",
    author: "Microsoft",
    description: "Microsoft's efficient small model — punches above its weight",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "highest", creativity: "medium" },
    maxTokens: 4096,
    contextWindow: 16384,
    providers: {
      openrouter: { modelId: "microsoft/phi-4", inputPer1M: 0.06, outputPer1M: 0.14 },
    },
  },
  // --- Mistral (new) ---
  {
    id: "codestral-2508",
    displayName: "Codestral",
    author: "Mistral AI",
    description: "Mistral's dedicated coding model — 256K context",
    capability: "text-generation",
    tier: 2,
    badge: "CODE",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "high", creativity: "medium" },
    maxTokens: 16384,
    contextWindow: 256000,
    providers: {
      openrouter: { modelId: "mistralai/codestral-2508", inputPer1M: 0.3, outputPer1M: 0.9 },
    },
  },
  {
    id: "mistral-small-3.2",
    displayName: "Mistral Small 3.2",
    author: "Mistral AI",
    description: "Very cheap and efficient — great budget choice",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...CHAT_CAPS, reasoning: "medium", speed: "highest", creativity: "medium" },
    maxTokens: 8192,
    contextWindow: 131072,
    providers: {
      openrouter: { modelId: "mistralai/mistral-small-3.2-24b-instruct", inputPer1M: 0.06, outputPer1M: 0.18 },
    },
  },
  {
    id: "mistral-medium-3.1",
    displayName: "Mistral Medium 3.1",
    author: "Mistral AI",
    description: "Mistral's balanced mid-range model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "high", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 131072,
    providers: {
      openrouter: { modelId: "mistralai/mistral-medium-3.1", inputPer1M: 0.4, outputPer1M: 2 },
    },
  },
  // --- Other OpenRouter models ---
  {
    id: "openai/gpt-4.1-nano",
    displayName: "GPT-4.1 Nano",
    author: "OpenAI",
    description: "OpenAI's efficient GPT-4.1 variant via OpenRouter",
    capability: "text-generation",
    tier: 1,
    capabilities: { ...VISION_CAPS, reasoning: "medium", speed: "highest", creativity: "medium" },
    maxTokens: 16384,
    contextWindow: 128000,
    providers: {
      openrouter: { modelId: "openai/gpt-4.1-nano", inputPer1M: 0.1, outputPer1M: 0.4 },
    },
  },
  {
    id: "openai/gpt-5-nano",
    displayName: "GPT-5 Nano",
    author: "OpenAI",
    description: "OpenAI's most efficient GPT-5 variant via OpenRouter",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VISION_CAPS, reasoning: "medium", speed: "highest", creativity: "medium" },
    maxTokens: 128000,
    contextWindow: 400000,
    providers: {
      openrouter: { modelId: "openai/gpt-5-nano", inputPer1M: 0.05, outputPer1M: 0.4 },
    },
  },
  {
    id: "qwen/qwq-32b",
    displayName: "QwQ 32B",
    author: "Alibaba",
    description: "Qwen's reasoning model via OpenRouter",
    capability: "text-generation",
    tier: 1,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "high", creativity: "medium" },
    maxTokens: 32768,
    contextWindow: 32768,
    providers: {
      openrouter: { modelId: "qwen/qwq-32b", inputPer1M: 0.15, outputPer1M: 0.4 },
    },
  },

  {
    id: "deepseek/deepseek-v3.2",
    displayName: "DeepSeek V3.2",
    author: "DeepSeek",
    description: "DeepSeek's latest V3.2 model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS, reasoning: "high", speed: "medium", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 163840,
    providers: {
      google: { modelId: "deepseek-v3.2-maas", inputPer1M: 0.3, outputPer1M: 0.5 },
      openrouter: { modelId: "deepseek/deepseek-v3.2", inputPer1M: 0.26, outputPer1M: 0.38 },
    },
  },
  {
    id: "google/gemini-2.5-flash-preview",
    displayName: "Gemini 2.5 Flash",
    author: "Google",
    description: "Google's fast Gemini model",
    capability: "text-generation",
    tier: 2,
    badge: "FAST",
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "highest", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-2.5-flash", inputPer1M: 0.15, outputPer1M: 0.6 },
      openrouter: { modelId: "google/gemini-2.5-flash", inputPer1M: 0.3, outputPer1M: 2.5 },
    },
  },
  {
    id: "google/gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    author: "Google",
    description: "Google's lightweight fast Gemini model — budget-friendly",
    capability: "text-generation",
    tier: 1,
    badge: "BUDGET",
    capabilities: { ...VISION_CAPS, reasoning: "medium", speed: "highest", creativity: "medium" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-2.5-flash-lite", inputPer1M: 0.075, outputPer1M: 0.3 },
    },
  },
  {
    id: "google/gemini-3-flash-preview",
    displayName: "Gemini 3 Flash",
    author: "Google",
    description: "Google's next-gen Gemini fast model",
    capability: "text-generation",
    tier: 2,
    badge: "NEW",
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "highest", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-3-flash-preview", inputPer1M: 0.5, outputPer1M: 3 },
      openrouter: { modelId: "google/gemini-3-flash-preview", inputPer1M: 0.5, outputPer1M: 3 },
    },
  },
  {
    id: "openai/gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
    author: "OpenAI",
    description: "OpenAI's balanced GPT-4.1 model via OpenRouter",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "high", creativity: "high" },
    maxTokens: 16384,
    contextWindow: 128000,
    providers: {
      openrouter: { modelId: "openai/gpt-4.1-mini", inputPer1M: 0.4, outputPer1M: 1.6 },
    },
  },
  {
    id: "openai/gpt-5-mini",
    displayName: "GPT-5 Mini",
    author: "OpenAI",
    description: "OpenAI's balanced GPT-5 model via OpenRouter",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...VISION_CAPS, reasoning: "high", speed: "high", creativity: "high" },
    maxTokens: 128000,
    contextWindow: 400000,
    providers: {
      openrouter: { modelId: "openai/gpt-5-mini", inputPer1M: 0.25, outputPer1M: 2 },
    },
  },
  {
    id: "google/gemini-2.5-pro-preview",
    displayName: "Gemini 2.5 Pro",
    author: "Google",
    description: "Google's capable Gemini model (superseded by 3 Pro)",
    capability: "text-generation",
    tier: 3,
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 16384,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-2.5-pro", inputPer1M: 1.25, outputPer1M: 5 },
      openrouter: { modelId: "google/gemini-2.5-pro-preview", inputPer1M: 1.25, outputPer1M: 10 },
    },
  },
  {
    id: "google/gemini-3-pro-preview",
    displayName: "Gemini 3 Pro",
    author: "Google",
    description: "Google's latest Gemini Pro model",
    capability: "text-generation",
    tier: 3,
    badge: "BEST",
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 16384,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-3-pro-preview", inputPer1M: 2, outputPer1M: 12 },
      openrouter: { modelId: "google/gemini-3-pro-preview", inputPer1M: 2, outputPer1M: 12 },
    },
  },
  // --- Gemini 3.1 (GenLang API only) ---
  {
    id: "google/gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro",
    author: "Google",
    description: "Google's latest Gemini 3.1 Pro — enhanced reasoning",
    capability: "text-generation",
    tier: 3,
    badge: "NEW",
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 16384,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-3.1-pro-preview", inputPer1M: 2.5, outputPer1M: 15 },
    },
  },
  {
    id: "google/gemini-3.1-flash-lite-preview",
    displayName: "Gemini 3.1 Flash Lite",
    author: "Google",
    description: "Google's budget Gemini 3.1 model — fast and cheap",
    capability: "text-generation",
    tier: 1,
    badge: "BUDGET",
    capabilities: { ...VISION_CAPS, reasoning: "medium", speed: "highest", creativity: "medium" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-3.1-flash-lite-preview", inputPer1M: 0.075, outputPer1M: 0.3 },
    },
  },
  // --- Gemini Image Models (text + image generation via chat) ---
  {
    id: "google/gemini-3-pro-image-preview",
    displayName: "Gemini 3 Pro Image",
    author: "Google",
    description: "Gemini 3 Pro with native image generation in chat",
    capability: "text-generation",
    tier: 3,
    badge: "IMAGE",
    capabilities: { ...CHAT_IMAGE_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-3-pro-image-preview", inputPer1M: 2, outputPer1M: 12 },
    },
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    displayName: "Gemini 3.1 Flash Image",
    author: "Google",
    description: "Gemini 3.1 Flash with native image generation in chat",
    capability: "text-generation",
    tier: 2,
    badge: "IMAGE",
    capabilities: { ...CHAT_IMAGE_CAPS, reasoning: "high", speed: "highest", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-3.1-flash-image-preview", inputPer1M: 0.5, outputPer1M: 3 },
    },
  },
  {
    id: "google/gemini-2.5-flash-image",
    displayName: "Gemini 2.5 Flash Image",
    author: "Google",
    description: "Gemini 2.5 Flash with native image generation in chat",
    capability: "text-generation",
    tier: 2,
    badge: "IMAGE",
    capabilities: { ...CHAT_IMAGE_CAPS, reasoning: "high", speed: "highest", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 1048576,
    providers: {
      google: { modelId: "gemini-2.5-flash-image", inputPer1M: 0.15, outputPer1M: 0.6 },
    },
  },
  // --- Nano Banana removed (experimental), Qwen3 235B merged above ---
  {
    id: "qwen/qwen3-coder-480b",
    displayName: "Qwen3 Coder 480B",
    author: "Alibaba",
    description: "Alibaba's massive code-specialized model via Vertex AI",
    capability: "text-generation",
    tier: 3,
    badge: "CODE",
    capabilities: { ...CHAT_CAPS, reasoning: "highest", speed: "low", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 131072,
    providers: {
      google: { modelId: "qwen3-coder-480b-a35b-instruct-maas", inputPer1M: 1, outputPer1M: 3 },
    },
  },
  {
    id: "mistralai/mistral-large-2411",
    displayName: "Mistral Large",
    author: "Mistral AI",
    description: "Mistral's flagship model via OpenRouter",
    capability: "text-generation",
    tier: 3,
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "high" },
    maxTokens: 8192,
    contextWindow: 131072,
    providers: {
      openrouter: { modelId: "mistralai/mistral-large-2411", inputPer1M: 2, outputPer1M: 6 },
    },
  },
  {
    id: "openai/gpt-4.1",
    displayName: "GPT-4.1",
    author: "OpenAI",
    description: "OpenAI's premium GPT-4.1 model via OpenRouter",
    capability: "text-generation",
    tier: 3,
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "high" },
    maxTokens: 32768,
    contextWindow: 1048576,
    providers: {
      openrouter: { modelId: "openai/gpt-4.1", inputPer1M: 2, outputPer1M: 8 },
    },
  },
  {
    id: "openai/gpt-5",
    displayName: "GPT-5",
    author: "OpenAI",
    description: "OpenAI's most capable model via OpenRouter",
    capability: "text-generation",
    tier: 3,
    badge: "BEST",
    capabilities: { ...VISION_CAPS, reasoning: "highest", speed: "medium", creativity: "highest" },
    maxTokens: 128000,
    contextWindow: 400000,
    providers: {
      openrouter: { modelId: "openai/gpt-5", inputPer1M: 1.25, outputPer1M: 10 },
    },
  },
  // ========================================
  // Image Generation
  // ========================================
  // --- OpenAI ---
  {
    id: "dall-e-3",
    displayName: "DALL-E 3",
    author: "OpenAI",
    description: "Generate stunning images from text",
    capability: "image-generation",
    tier: 1,
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      openai: { modelId: "dall-e-3", perImage: 0.04 },
    },
  },
  {
    id: "dall-e-2",
    displayName: "DALL-E 2",
    author: "OpenAI",
    description: "Previous generation image model, affordable",
    capability: "image-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPS },
    providers: {
      openai: { modelId: "dall-e-2", perImage: 0.02 },
    },
  },
  {
    id: "dall-e-3-hd",
    displayName: "DALL-E 3 HD",
    author: "OpenAI",
    description: "Higher quality image generation",
    capability: "image-generation",
    tier: 2,
    badge: "HD",
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      openai: { modelId: "dall-e-3-hd", perImage: 0.08 },
    },
  },
  // --- Multi-Provider ---
  {
    id: "flux-1-schnell",
    displayName: "FLUX.1 Schnell",
    author: "Black Forest Labs",
    description: "Fast image generation",
    capability: "image-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      together: { modelId: "black-forest-labs/FLUX.1-schnell", perImage: 0.003 },
      fireworks: { modelId: "accounts/fireworks/models/flux-1-schnell-fp8", perImage: 0.012 },
    },
  },
  {
    id: "flux-dev",
    displayName: "FLUX Dev",
    author: "Black Forest Labs",
    description: "FLUX 2 development model",
    capability: "image-generation",
    tier: 2,
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      together: { modelId: "black-forest-labs/FLUX.2-dev", perImage: 0.025 },
      fireworks: { modelId: "accounts/fireworks/models/flux-1-dev-fp8", perImage: 0.025 },
    },
  },
  // --- Together AI ---
  {
    id: "google/imagen-4.0-fast",
    displayName: "Imagen 4.0 Fast",
    author: "Google",
    description: "Google Imagen 4 fast generation",
    capability: "image-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      google: { modelId: "imagen-4.0-fast-generate-001", perImage: 0.02 },
      together: { modelId: "google/imagen-4.0-fast", perImage: 0.02 },
    },
  },
  {
    id: "ByteDance-Seed/Seedream-4.0",
    displayName: "Seedream 4.0",
    author: "ByteDance",
    description: "ByteDance Seedream image model",
    capability: "image-generation",
    tier: 2,
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      together: { modelId: "ByteDance-Seed/Seedream-4.0", perImage: 0.05 },
    },
  },
  {
    id: "google/imagen-4.0-preview",
    displayName: "Imagen 4.0",
    author: "Google",
    description: "Google Imagen 4 standard generation",
    capability: "image-generation",
    tier: 2,
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      google: { modelId: "imagen-4.0-generate-001", perImage: 0.04 },
      together: { modelId: "google/imagen-4.0-preview", perImage: 0.04 },
    },
  },
  {
    id: "stabilityai/stable-diffusion-3-medium",
    displayName: "Stable Diffusion 3",
    author: "Stability AI",
    description: "Stability AI's latest diffusion model",
    capability: "image-generation",
    tier: 2,
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      together: { modelId: "stabilityai/stable-diffusion-3-medium", perImage: 0.065 },
    },
  },
  {
    id: "black-forest-labs/FLUX.2-pro",
    displayName: "FLUX.2 Pro",
    author: "Black Forest Labs",
    description: "FLUX 2 production-quality images",
    capability: "image-generation",
    tier: 3,
    badge: "BEST",
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      together: { modelId: "black-forest-labs/FLUX.2-pro", perImage: 0.04 },
    },
  },
  {
    id: "google/imagen-4.0-ultra",
    displayName: "Imagen 4.0 Ultra",
    author: "Google",
    description: "Google Imagen 4 ultra quality",
    capability: "image-generation",
    tier: 3,
    badge: "HD",
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      google: { modelId: "imagen-4.0-ultra-generate-001", perImage: 0.08 },
      together: { modelId: "google/imagen-4.0-ultra", perImage: 0.08 },
    },
  },
  {
    id: "ideogram/ideogram-3.0",
    displayName: "Ideogram 3.0",
    author: "Ideogram",
    description: "Ideogram's text-in-image specialist",
    capability: "image-generation",
    tier: 3,
    capabilities: { ...IMAGE_GEN_CAPS },
    providers: {
      together: { modelId: "ideogram/ideogram-3.0", perImage: 0.08 },
    },
  },
  // ========================================
  // Video Generation
  // ========================================
  {
    id: "google/veo-2.0",
    displayName: "Veo 2.0",
    author: "Google",
    description: "Google's previous-gen video generation model",
    capability: "video-generation",
    tier: 1,
    capabilities: { ...VIDEO_GEN_CAPS },
    providers: {
      google: { modelId: "veo-2.0-generate-001", perSecond: 0.35 },
    },
  },
  {
    id: "google/veo-3.0-fast",
    displayName: "Veo 3.0 Fast",
    author: "Google",
    description: "Google's fast video generation",
    capability: "video-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VIDEO_GEN_CAPS },
    providers: {
      google: { modelId: "veo-3.0-fast-generate-001", perSecond: 0.25 },
    },
  },
  {
    id: "google/veo-3.0",
    displayName: "Veo 3.0",
    author: "Google",
    description: "Google's high-quality video generation",
    capability: "video-generation",
    tier: 2,
    capabilities: { ...VIDEO_GEN_CAPS },
    providers: {
      google: { modelId: "veo-3.0-generate-001", perSecond: 0.40 },
    },
  },
  {
    id: "google/veo-3.1-fast",
    displayName: "Veo 3.1 Fast",
    author: "Google",
    description: "Google's latest fast video generation",
    capability: "video-generation",
    tier: 2,
    badge: "NEW",
    capabilities: { ...VIDEO_GEN_CAPS },
    providers: {
      google: { modelId: "veo-3.1-fast-generate-preview", perSecond: 0.30 },
    },
  },
  {
    id: "google/veo-3.1",
    displayName: "Veo 3.1",
    author: "Google",
    description: "Google's best video generation model",
    capability: "video-generation",
    tier: 3,
    badge: "BEST",
    capabilities: { ...VIDEO_GEN_CAPS },
    providers: {
      google: { modelId: "veo-3.1-generate-001", perSecond: 0.50 },
    },
  },
  // ========================================
  // Speech Synthesis
  // ========================================
  {
    id: "tts-1",
    displayName: "TTS Standard",
    author: "OpenAI",
    description: "Text-to-speech, optimized for speed",
    capability: "speech-synthesis",
    tier: 1,
    capabilities: { ...SPEECH_SYNTH_CAPS },
    providers: {
      openai: { modelId: "tts-1", perCharM: 15 },
    },
  },
  {
    id: "tts-1-hd",
    displayName: "TTS HD",
    author: "OpenAI",
    description: "Text-to-speech, optimized for quality",
    capability: "speech-synthesis",
    tier: 2,
    badge: "HD",
    capabilities: { ...SPEECH_SYNTH_CAPS },
    providers: {
      openai: { modelId: "tts-1-hd", perCharM: 30 },
    },
  },
  // ========================================
  // Text Embedding
  // ========================================
  // --- OpenAI ---
  {
    id: "text-embedding-3-large",
    displayName: "Text Embedding 3 Large",
    author: "OpenAI",
    description: "High-quality text embedding model",
    capability: "text-embedding",
    tier: 2,
    capabilities: { ...EMBEDDING_CAPS },
    providers: {
      openai: { modelId: "text-embedding-3-large", inputPer1M: 0.13 },
    },
  },
  {
    id: "text-embedding-3-small",
    displayName: "Text Embedding 3 Small",
    author: "OpenAI",
    description: "Efficient text embedding model",
    capability: "text-embedding",
    tier: 2,
    badge: "FAST",
    capabilities: { ...EMBEDDING_CAPS },
    providers: {
      openai: { modelId: "text-embedding-3-small", inputPer1M: 0.02 },
    },
  },
  // --- Together AI ---
  {
    id: "BAAI/bge-base-en-v1.5",
    displayName: "BGE Base EN",
    author: "BAAI",
    description: "BAAI general embedding model (base)",
    capability: "text-embedding",
    tier: 1,
    badge: "FAST",
    capabilities: { ...EMBEDDING_CAPS },
    providers: {
      together: { modelId: "BAAI/bge-base-en-v1.5", inputPer1M: 0.008 },
    },
  },

  {
    id: "BAAI/bge-large-en-v1.5",
    displayName: "BGE Large EN",
    author: "BAAI",
    description: "BAAI general embedding model (large)",
    capability: "text-embedding",
    tier: 2,
    capabilities: { ...EMBEDDING_CAPS },
    providers: {
      together: { modelId: "BAAI/bge-large-en-v1.5", inputPer1M: 0.016 },
    },
  },
  // --- Google (Vertex AI) ---
  {
    id: "intfloat/e5-large",
    displayName: "E5 Large Multilingual",
    author: "intfloat",
    description: "Multilingual embedding model via Vertex AI (1024 dim)",
    capability: "text-embedding",
    tier: 2,
    capabilities: { ...EMBEDDING_CAPS },
    providers: {
      google: { modelId: "multilingual-e5-large-instruct-maas", inputPer1M: 0.1 },
    },
  },
  {
    id: "intfloat/e5-small",
    displayName: "E5 Small Multilingual",
    author: "intfloat",
    description: "Efficient multilingual embedding model via Vertex AI (384 dim)",
    capability: "text-embedding",
    tier: 1,
    badge: "FAST",
    capabilities: { ...EMBEDDING_CAPS },
    providers: {
      google: { modelId: "multilingual-e5-small-maas", inputPer1M: 0.05 },
    },
  },

] as const;

// ===========================================
// Lookup Indexes (built once at module load)
// ===========================================

const _byId = new Map<string, ModelRegistryEntry>();
const _byProviderModelId = new Map<string, ModelRegistryEntry>();
const _byProvider = new Map<TwoBotAIProvider, ModelRegistryEntry[]>();
const _byProviderCapability = new Map<string, ModelRegistryEntry[]>();

for (const entry of MODEL_REGISTRY) {
  _byId.set(entry.id, entry);

  for (const [provider, cost] of Object.entries(entry.providers)) {
    _byProviderModelId.set(cost.modelId, entry);

    const prov = provider as TwoBotAIProvider;
    const provArr = _byProvider.get(prov) ?? [];
    provArr.push(entry);
    _byProvider.set(prov, provArr);

    const key = `${provider}:${entry.capability}`;
    const capArr = _byProviderCapability.get(key) ?? [];
    capArr.push(entry);
    _byProviderCapability.set(key, capArr);
  }
}

// ===========================================
// Lookup Functions
// ===========================================

/** Get a single registry entry by canonical ID or provider model ID */
export function getRegistryEntry(modelId: string): ModelRegistryEntry | undefined {
  return _byId.get(modelId) ?? _byProviderModelId.get(modelId);
}

/** Get all registry entries for a provider, optionally filtered by capability */
export function getRegistryEntriesByProvider(
  provider: TwoBotAIProvider,
  capability?: AICapability,
): ModelRegistryEntry[] {
  if (capability) {
    return _byProviderCapability.get(`${provider}:${capability}`) ?? [];
  }
  return _byProvider.get(provider) ?? [];
}

/** Get all registry entries matching a capability across all providers */
export function getRegistryEntriesByCapability(capability: AICapability): ModelRegistryEntry[] {
  return MODEL_REGISTRY.filter((m) => m.capability === capability);
}

/** Check if a model ID exists in the registry (canonical or provider model ID) */
export function isRegisteredModel(modelId: string): boolean {
  return _byId.has(modelId) || _byProviderModelId.has(modelId);
}

/** Get provider-specific model IDs for a given provider */
export function getProviderModelIds(provider: TwoBotAIProvider): string[] {
  return getRegistryEntriesByProvider(provider)
    .map((e) => e.providers[provider]?.modelId)
    .filter((id): id is string => id !== undefined);
}

// ===========================================
// Registry → ModelInfo Conversion
// ===========================================

/**
 * Convert a ModelRegistryEntry to a flat ModelInfo for a specific provider.
 * Uses the provider-specific model ID and computes credits from USD costs.
 */
export function registryToModelInfo(entry: ModelRegistryEntry, provider: TwoBotAIProvider): ModelInfo {
  const cost = entry.providers[provider];
  if (!cost) {
    throw new Error(`Registry entry "${entry.id}" has no provider "${provider}"`);
  }

  return {
    id: cost.modelId as ModelInfo["id"],
    name: entry.displayName,
    author: entry.author,
    provider,
    capability: entry.capability,
    description: entry.description,
    tier: entry.tier,
    badge: entry.badge,
    deprecated: entry.deprecated,
    deprecationMessage: entry.deprecationMessage,
    capabilities: entry.capabilities,
    maxTokens: entry.maxTokens,
    contextWindow: entry.contextWindow,
    creditsPerInputToken: cost.inputPer1M !== undefined ? creditPerInputToken(cost.inputPer1M) : undefined,
    creditsPerOutputToken: cost.outputPer1M !== undefined ? creditPerOutputToken(cost.outputPer1M) : undefined,
    creditsPerImage: cost.perImage !== undefined ? creditPerImage(cost.perImage) : undefined,
    creditsPerChar: cost.perCharM !== undefined ? creditPerChar(cost.perCharM) : undefined,
    creditsPerMinute: cost.perMinute !== undefined ? creditPerMinute(cost.perMinute) : undefined,
    creditsPerSecond: cost.perSecond !== undefined ? creditPerSecond(cost.perSecond) : undefined,
  };
}
