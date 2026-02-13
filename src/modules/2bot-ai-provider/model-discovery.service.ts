/**
 * Model Discovery Service
 *
 * Dynamically discovers available models from AI providers.
 * Instead of hardcoding models, we fetch them from the provider APIs
 * and merge with our metadata (pricing, capabilities).
 *
 * OpenAI: Has /models API endpoint - we can query it directly
 * Anthropic: No models API - we maintain a registry synced with their docs
 *
 * @module modules/2bot-ai-provider/model-discovery.service
 */

import { logger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
    ANTHROPIC_TEXT_GENERATION_PRICING,
    OPENAI_IMAGE_GENERATION_PRICING,
    OPENAI_SPEECH_RECOGNITION_PRICING,
    OPENAI_SPEECH_SYNTHESIS_PRICING,
    OPENAI_TEXT_GENERATION_PRICING,
    TOGETHER_IMAGE_GENERATION_PRICING,
    TOGETHER_TEXT_EMBEDDING_PRICING,
    TOGETHER_TEXT_GENERATION_PRICING,
} from "./model-pricing";
import type { AICapability, ModelCapabilities, ModelInfo } from "./types";

const log = logger.child({ module: "model-discovery" });

/**
 * Type-safe pricing lookup — throws at startup if a model key is missing.
 */
function getPricing<T>(table: Record<string, T>, key: string): T {
  const entry = table[key];
  if (!entry) throw new Error(`Missing pricing entry for model: ${key}`);
  return entry;
}

// ===========================================

/**
 * Base capabilities for different model types
 */
const CHAT_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["text"],
  supportsStreaming: true,
  supportsFunctionCalling: true,
  supportsJsonMode: true,
};

const VISION_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["text", "image"],
  outputTypes: ["text"],
  canAnalyzeImages: true,
  supportsStreaming: true,
  supportsFunctionCalling: true,
  supportsJsonMode: true,
};

const IMAGE_GEN_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["image"],
  canGenerateImages: true,
  supportsStreaming: false,
};

const TTS_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["text"],
  outputTypes: ["audio"],
  canGenerateAudio: true,
  supportsStreaming: true,
};

const STT_CAPABILITIES: ModelCapabilities = {
  inputTypes: ["audio"],
  outputTypes: ["text"],
  canTranscribeAudio: true,
  supportsStreaming: false,
};

/**
 * Model metadata that we add to discovered models
 * This includes pricing (in credits) and UI display info
 */
interface ModelMetadata {
  displayName: string;
  description: string;
  /** AI capability (new universal naming) */
  capability: AICapability;
  tier: number; // 1 = cheapest, 3 = most expensive
  badge?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  capabilities: ModelCapabilities;
  // Pricing in credits (per token for chat, per image for image, etc.)
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
  creditsPerImage?: number;
  creditsPerChar?: number;
  creditsPerMinute?: number;
  maxTokens?: number;
  contextWindow?: number;
}

/**
 * OpenAI model metadata registry
 * Maps model ID patterns to our metadata
 * Pricing is imported from model-pricing.ts (single source of truth)
 */
const OPENAI_MODEL_METADATA: Record<string, ModelMetadata> = {
  // GPT-4o Mini - Fast & cheap
  "gpt-4o-mini": {
    displayName: "GPT-4o Mini",
    description: "Fast, affordable model for everyday tasks",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "medium", speed: "high", creativity: "medium" },
    creditsPerInputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "gpt-4o-mini").creditsPerInputToken,
    creditsPerOutputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "gpt-4o-mini").creditsPerOutputToken,
    maxTokens: 16384,
    contextWindow: 128000,
  },
  // GPT-4o - Most capable
  "gpt-4o": {
    displayName: "GPT-4o",
    description: "Most capable OpenAI model for complex tasks",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
    creditsPerInputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "gpt-4o").creditsPerInputToken,
    creditsPerOutputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "gpt-4o").creditsPerOutputToken,
    maxTokens: 16384,
    contextWindow: 128000,
  },
  // o1 - Reasoning model
  "o1": {
    displayName: "o1",
    description: "Advanced reasoning model for complex problems",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "medium" },
    creditsPerInputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "o1").creditsPerInputToken,
    creditsPerOutputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "o1").creditsPerOutputToken,
    maxTokens: 100000,
    contextWindow: 200000,
  },
  // o1-mini - Faster reasoning
  "o1-mini": {
    displayName: "o1 Mini",
    description: "Fast reasoning model, good for coding",
    capability: "text-generation",
    tier: 2,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "medium" },
    creditsPerInputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "o1-mini").creditsPerInputToken,
    creditsPerOutputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "o1-mini").creditsPerOutputToken,
    maxTokens: 65536,
    contextWindow: 128000,
  },
  // o3-mini - Latest reasoning
  "o3-mini": {
    displayName: "o3 Mini",
    description: "Latest reasoning model with improved performance",
    capability: "text-generation",
    tier: 2,
    badge: "NEW",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "highest", speed: "medium", creativity: "medium" },
    creditsPerInputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "o3-mini").creditsPerInputToken,
    creditsPerOutputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "o3-mini").creditsPerOutputToken,
    maxTokens: 100000,
    contextWindow: 200000,
  },
  // GPT-4 Turbo - Previous gen
  "gpt-4-turbo": {
    displayName: "GPT-4 Turbo",
    description: "Previous generation high-performance model",
    capability: "text-generation",
    tier: 3,
    deprecated: true,
    deprecationMessage: "Consider using GPT-4o for better performance",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
    creditsPerInputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "gpt-4-turbo").creditsPerInputToken,
    creditsPerOutputToken: getPricing(OPENAI_TEXT_GENERATION_PRICING, "gpt-4-turbo").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 128000,
  },
  // DALL-E 3
  "dall-e-3": {
    displayName: "DALL-E 3",
    description: "Generate stunning images from text",
    capability: "image-generation",
    tier: 1,
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(OPENAI_IMAGE_GENERATION_PRICING, "dall-e-3").creditsPerImage,
  },
  // TTS
  "tts-1": {
    displayName: "TTS Standard",
    description: "Text-to-speech, optimized for speed",
    capability: "speech-synthesis",
    tier: 1,
    capabilities: TTS_CAPABILITIES,
    creditsPerChar: getPricing(OPENAI_SPEECH_SYNTHESIS_PRICING, "tts-1").creditsPerChar,
  },
  "tts-1-hd": {
    displayName: "TTS HD",
    description: "Text-to-speech, optimized for quality",
    capability: "speech-synthesis",
    tier: 2,
    badge: "HD",
    capabilities: TTS_CAPABILITIES,
    creditsPerChar: getPricing(OPENAI_SPEECH_SYNTHESIS_PRICING, "tts-1-hd").creditsPerChar,
  },
  // Whisper
  "whisper-1": {
    displayName: "Whisper",
    description: "Transcribe audio to text",
    capability: "speech-recognition",
    tier: 1,
    capabilities: STT_CAPABILITIES,
    creditsPerMinute: getPricing(OPENAI_SPEECH_RECOGNITION_PRICING, "whisper-1").creditsPerMinute,
  },
};

/**
 * Anthropic model metadata registry
 * Based on https://docs.anthropic.com/en/docs/about-claude/models
 * Pricing is imported from model-pricing.ts (single source of truth)
 */
const ANTHROPIC_MODEL_METADATA: Record<string, ModelMetadata> = {
  // Claude Opus 4.6 (newest, best value premium)
  "claude-opus-4-6-20260131": {
    displayName: "Claude Opus 4.6",
    description: "Most intelligent Claude model — 3x cheaper than Opus 4",
    capability: "text-generation",
    tier: 3,
    badge: "BEST",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "medium", creativity: "highest" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-opus-4-6-20260131").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-opus-4-6-20260131").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  // Claude Sonnet 4.5 (latest balanced)
  "claude-sonnet-4-5-20251022": {
    displayName: "Claude Sonnet 4.5",
    description: "Latest balanced model — best value for most tasks",
    capability: "text-generation",
    tier: 2,
    badge: "BEST",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "high", creativity: "highest" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-sonnet-4-5-20251022").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-sonnet-4-5-20251022").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  // Claude Haiku 4.5 (latest fast)
  "claude-haiku-4-5-20251022": {
    displayName: "Claude Haiku 4.5",
    description: "Latest fast model with improved intelligence",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "highest", creativity: "high" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-haiku-4-5-20251022").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-haiku-4-5-20251022").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  // Claude 3.5 Sonnet (Latest)
  "claude-3-5-sonnet-20241022": {
    displayName: "Claude 3.5 Sonnet",
    description: "Best balance of intelligence and speed",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "high", creativity: "high" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-sonnet-20241022").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-sonnet-20241022").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  "claude-3-5-sonnet-latest": {
    displayName: "Claude 3.5 Sonnet (Latest)",
    description: "Best balance of intelligence and speed",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "high", creativity: "high" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-sonnet-20241022").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-sonnet-20241022").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  // Claude 3.5 Haiku
  "claude-3-5-haiku-20241022": {
    displayName: "Claude 3.5 Haiku",
    description: "Fast and efficient for simple tasks",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-haiku-20241022").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-haiku-20241022").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  "claude-3-5-haiku-latest": {
    displayName: "Claude 3.5 Haiku (Latest)",
    description: "Fast and efficient for simple tasks",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-haiku-20241022").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-haiku-20241022").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  // Claude 3 Opus
  "claude-3-opus-20240229": {
    displayName: "Claude 3 Opus",
    description: "Previous gen most capable model",
    capability: "text-generation",
    tier: 3,
    deprecated: true,
    deprecationMessage: "Consider using Claude 3.5 Sonnet for better value",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "highest" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-opus-20240229").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-opus-20240229").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 200000,
  },
  "claude-3-opus-latest": {
    displayName: "Claude 3 Opus (Latest)",
    description: "Previous gen most capable model",
    capability: "text-generation",
    tier: 3,
    capabilities: { ...VISION_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "highest" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-opus-20240229").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-opus-20240229").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 200000,
  },
  // Claude 3 Sonnet
  "claude-3-sonnet-20240229": {
    displayName: "Claude 3 Sonnet",
    description: "Balanced performance (previous gen)",
    capability: "text-generation",
    tier: 2,
    deprecated: true,
    deprecationMessage: "Upgrade to Claude 3.5 Sonnet",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-sonnet-20241022").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-5-sonnet-20241022").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 200000,
  },
  // Claude 3 Haiku
  "claude-3-haiku-20240307": {
    displayName: "Claude 3 Haiku",
    description: "Fast and affordable (previous gen)",
    capability: "text-generation",
    tier: 1,
    capabilities: { ...VISION_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
    creditsPerInputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-haiku-20240307").creditsPerInputToken,
    creditsPerOutputToken: getPricing(ANTHROPIC_TEXT_GENERATION_PRICING, "claude-3-haiku-20240307").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 200000,
  },
};

// ===========================================
// Together AI Model Metadata Registry
// ===========================================

const TOGETHER_MODEL_METADATA: Record<string, ModelMetadata> = {
  // ---- FREE ----
  "togethercomputer/MoA-1": {
    displayName: "MoA-1",
    description: "Free mixture-of-agents ensemble model",
    capability: "text-generation",
    tier: 1,
    badge: "FREE",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "medium", speed: "medium", creativity: "medium" },
    creditsPerInputToken: 0,
    creditsPerOutputToken: 0,
    maxTokens: 4096,
    contextWindow: 32768,
  },
  "ServiceNow-AI/Apriel-1.6-15b-Thinker": {
    displayName: "Apriel 1.6 Thinker",
    description: "Free thinking model by ServiceNow",
    capability: "text-generation",
    tier: 1,
    badge: "FREE",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "medium" },
    creditsPerInputToken: 0,
    creditsPerOutputToken: 0,
    maxTokens: 4096,
    contextWindow: 32768,
  },
  // ---- LITE ----
  "google/gemma-3n-E4B-it": {
    displayName: "Gemma 3n E4B",
    description: "Google's efficient small model",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "google/gemma-3n-E4B-it").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "google/gemma-3n-E4B-it").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 32768,
  },
  "arcee-ai/trinity-mini": {
    displayName: "Trinity Mini",
    description: "Efficient small model by Arcee AI",
    capability: "text-generation",
    tier: 1,
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "arcee-ai/trinity-mini").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "arcee-ai/trinity-mini").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 32768,
  },
  "openai/gpt-oss-20b": {
    displayName: "GPT-OSS 20B",
    description: "OpenAI open-source 20B model",
    capability: "text-generation",
    tier: 1,
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "medium", speed: "high", creativity: "medium" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "openai/gpt-oss-20b").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "openai/gpt-oss-20b").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 32768,
  },
  "nvidia/NVIDIA-Nemotron-Nano-9B-v2": {
    displayName: "Nemotron Nano 9B",
    description: "NVIDIA's efficient 9B model",
    capability: "text-generation",
    tier: 1,
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "medium", speed: "high", creativity: "medium" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "nvidia/NVIDIA-Nemotron-Nano-9B-v2").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "nvidia/NVIDIA-Nemotron-Nano-9B-v2").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 32768,
  },
  "meta-llama/Llama-3.2-3B-Instruct-Turbo": {
    displayName: "Llama 3.2 3B Turbo",
    description: "Meta's fast lightweight model",
    capability: "text-generation",
    tier: 1,
    badge: "FAST",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "medium", speed: "highest", creativity: "medium" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "meta-llama/Llama-3.2-3B-Instruct-Turbo").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "meta-llama/Llama-3.2-3B-Instruct-Turbo").creditsPerOutputToken,
    maxTokens: 4096,
    contextWindow: 131072,
  },
  // ---- PRO ----
  "Qwen/Qwen3-Next-80B-A3B-Instruct": {
    displayName: "Qwen3 Next 80B",
    description: "Qwen's efficient MoE model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "high", speed: "high", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "Qwen/Qwen3-Next-80B-A3B-Instruct").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "Qwen/Qwen3-Next-80B-A3B-Instruct").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 32768,
  },
  "openai/gpt-oss-120b": {
    displayName: "GPT-OSS 120B",
    description: "OpenAI open-source 120B model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "openai/gpt-oss-120b").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "openai/gpt-oss-120b").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 32768,
  },
  "meta-llama/Llama-4-Scout-17B-16E-Instruct": {
    displayName: "Llama 4 Scout",
    description: "Meta's efficient scout model with 1M context and vision",
    capability: "text-generation",
    tier: 2,
    badge: "VISION",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "high", creativity: "medium" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "meta-llama/Llama-4-Scout-17B-16E-Instruct").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "meta-llama/Llama-4-Scout-17B-16E-Instruct").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 1048576,
  },
  "Qwen/Qwen3-VL-8B-Instruct": {
    displayName: "Qwen3 VL 8B",
    description: "Qwen's vision-language model",
    capability: "text-generation",
    tier: 2,
    badge: "VISION",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "high", creativity: "medium" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "Qwen/Qwen3-VL-8B-Instruct").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "Qwen/Qwen3-VL-8B-Instruct").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 32768,
  },
  "mistralai/Ministral-3-14B-Instruct-2512": {
    displayName: "Ministral 3 14B",
    description: "Mistral's balanced 14B model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "high", speed: "high", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "mistralai/Ministral-3-14B-Instruct-2512").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "mistralai/Ministral-3-14B-Instruct-2512").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 131072,
  },
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8": {
    displayName: "Llama 4 Maverick",
    description: "Meta's large MoE model with 1M context and vision",
    capability: "text-generation",
    tier: 2,
    badge: "VISION",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 1048576,
  },
  "Qwen/Qwen3-Coder-Next-FP8": {
    displayName: "Qwen3 Coder Next",
    description: "Qwen's code-specialized model",
    capability: "text-generation",
    tier: 2,
    badge: "CODE",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "medium" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "Qwen/Qwen3-Coder-Next-FP8").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "Qwen/Qwen3-Coder-Next-FP8").creditsPerOutputToken,
    maxTokens: 16384,
    contextWindow: 131072,
  },
  "moonshotai/Kimi-K2.5": {
    displayName: "Kimi K2.5",
    description: "Moonshot's multimodal model with vision",
    capability: "text-generation",
    tier: 2,
    badge: "VISION",
    capabilities: { ...VISION_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "moonshotai/Kimi-K2.5").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "moonshotai/Kimi-K2.5").creditsPerOutputToken,
    maxTokens: 8192,
    contextWindow: 131072,
  },
  "deepseek-ai/DeepSeek-V3.1": {
    displayName: "DeepSeek V3.1",
    description: "DeepSeek's powerful general model",
    capability: "text-generation",
    tier: 2,
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "high", speed: "medium", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "deepseek-ai/DeepSeek-V3.1").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "deepseek-ai/DeepSeek-V3.1").creditsPerOutputToken,
    maxTokens: 16384,
    contextWindow: 131072,
  },
  // ---- ULTRA (reasoning) ----
  "Qwen/Qwen3-235B-A22B-Thinking-2507": {
    displayName: "Qwen3 235B Thinking",
    description: "Qwen's largest reasoning MoE model",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "Qwen/Qwen3-235B-A22B-Thinking-2507").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "Qwen/Qwen3-235B-A22B-Thinking-2507").creditsPerOutputToken,
    maxTokens: 16384,
    contextWindow: 131072,
  },
  "moonshotai/Kimi-K2-Thinking": {
    displayName: "Kimi K2 Thinking",
    description: "Moonshot's advanced reasoning model",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "moonshotai/Kimi-K2-Thinking").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "moonshotai/Kimi-K2-Thinking").creditsPerOutputToken,
    maxTokens: 16384,
    contextWindow: 131072,
  },
  "deepcogito/cogito-v2-1-671b": {
    displayName: "Cogito V2.1 671B",
    description: "Deep Cogito's massive 671B model",
    capability: "text-generation",
    tier: 3,
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "highest" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "deepcogito/cogito-v2-1-671b").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "deepcogito/cogito-v2-1-671b").creditsPerOutputToken,
    maxTokens: 16384,
    contextWindow: 131072,
  },
  "deepseek-ai/DeepSeek-R1": {
    displayName: "DeepSeek R1",
    description: "DeepSeek's top reasoning model",
    capability: "text-generation",
    tier: 3,
    badge: "REASONING",
    capabilities: { ...CHAT_CAPABILITIES, reasoning: "highest", speed: "low", creativity: "high" },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "deepseek-ai/DeepSeek-R1").creditsPerInputToken,
    creditsPerOutputToken: getPricing(TOGETHER_TEXT_GENERATION_PRICING, "deepseek-ai/DeepSeek-R1").creditsPerOutputToken,
    maxTokens: 16384,
    contextWindow: 131072,
  },
  // ---- IMAGE GENERATION ----
  "black-forest-labs/FLUX.1-schnell": {
    displayName: "FLUX.1 Schnell",
    description: "Fast image generation",
    capability: "image-generation",
    tier: 1,
    badge: "FAST",
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "black-forest-labs/FLUX.1-schnell").creditsPerImage,
  },
  "black-forest-labs/FLUX.2-dev": {
    displayName: "FLUX.2 Dev",
    description: "FLUX 2 development model",
    capability: "image-generation",
    tier: 2,
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "black-forest-labs/FLUX.2-dev").creditsPerImage,
  },
  "black-forest-labs/FLUX.2-pro": {
    displayName: "FLUX.2 Pro",
    description: "FLUX 2 production-quality images",
    capability: "image-generation",
    tier: 3,
    badge: "BEST",
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "black-forest-labs/FLUX.2-pro").creditsPerImage,
  },
  "google/imagen-4.0-preview": {
    displayName: "Imagen 4.0 Preview",
    description: "Google Imagen 4 preview generation",
    capability: "image-generation",
    tier: 2,
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "google/imagen-4.0-preview").creditsPerImage,
  },
  "google/imagen-4.0-fast": {
    displayName: "Imagen 4.0 Fast",
    description: "Google Imagen 4 fast generation",
    capability: "image-generation",
    tier: 1,
    badge: "FAST",
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "google/imagen-4.0-fast").creditsPerImage,
  },
  "google/imagen-4.0-ultra": {
    displayName: "Imagen 4.0 Ultra",
    description: "Google Imagen 4 ultra quality",
    capability: "image-generation",
    tier: 3,
    badge: "HD",
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "google/imagen-4.0-ultra").creditsPerImage,
  },
  "ideogram/ideogram-3.0": {
    displayName: "Ideogram 3.0",
    description: "Ideogram's text-in-image specialist",
    capability: "image-generation",
    tier: 3,
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "ideogram/ideogram-3.0").creditsPerImage,
  },
  "ByteDance-Seed/Seedream-4.0": {
    displayName: "Seedream 4.0",
    description: "ByteDance Seedream image model",
    capability: "image-generation",
    tier: 2,
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "ByteDance-Seed/Seedream-4.0").creditsPerImage,
  },
  "stabilityai/stable-diffusion-3-medium": {
    displayName: "Stable Diffusion 3",
    description: "Stability AI's latest diffusion model",
    capability: "image-generation",
    tier: 2,
    capabilities: IMAGE_GEN_CAPABILITIES,
    creditsPerImage: getPricing(TOGETHER_IMAGE_GENERATION_PRICING, "stabilityai/stable-diffusion-3-medium").creditsPerImage,
  },
  // ---- EMBEDDING ----
  "BAAI/bge-large-en-v1.5": {
    displayName: "BGE Large EN",
    description: "BAAI general embedding model (large)",
    capability: "text-embedding",
    tier: 2,
    capabilities: { inputTypes: ["text"], outputTypes: ["text"], supportsStreaming: false },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_EMBEDDING_PRICING, "BAAI/bge-large-en-v1.5").creditsPerInputToken,
  },
  "BAAI/bge-base-en-v1.5": {
    displayName: "BGE Base EN",
    description: "BAAI general embedding model (base)",
    capability: "text-embedding",
    tier: 1,
    badge: "FAST",
    capabilities: { inputTypes: ["text"], outputTypes: ["text"], supportsStreaming: false },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_EMBEDDING_PRICING, "BAAI/bge-base-en-v1.5").creditsPerInputToken,
  },
  "Alibaba-NLP/gte-modernbert-base": {
    displayName: "GTE ModernBERT",
    description: "Alibaba GTE ModernBERT embedding model",
    capability: "text-embedding",
    tier: 2,
    capabilities: { inputTypes: ["text"], outputTypes: ["text"], supportsStreaming: false },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_EMBEDDING_PRICING, "Alibaba-NLP/gte-modernbert-base").creditsPerInputToken,
  },
  "intfloat/multilingual-e5-large-instruct": {
    displayName: "Multilingual E5 Large",
    description: "Multilingual E5 embedding model",
    capability: "text-embedding",
    tier: 2,
    capabilities: { inputTypes: ["text"], outputTypes: ["text"], supportsStreaming: false },
    creditsPerInputToken: getPricing(TOGETHER_TEXT_EMBEDDING_PRICING, "intfloat/multilingual-e5-large-instruct").creditsPerInputToken,
  },
};

// ===========================================
// OpenAI Model Discovery
// ===========================================

/**
 * Discover available models from OpenAI
 */
export async function discoverOpenAIModels(): Promise<ModelInfo[]> {
  const apiKey = process.env.TWOBOT_OPENAI_API_KEY;
  if (!apiKey) {
    log.warn("OpenAI API key not set, skipping discovery");
    return [];
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 15000 });
    const response = await client.models.list();

    const discoveredModels: ModelInfo[] = [];
    const seenModels = new Set<string>();

    for (const model of response.data) {
      const modelId = model.id;

      // Skip if already seen (duplicates)
      if (seenModels.has(modelId)) continue;
      seenModels.add(modelId);

      // Check if we have metadata for this model
      // Try exact match first, then prefix match
      let metadata = OPENAI_MODEL_METADATA[modelId];

      if (!metadata) {
        // Try prefix matching (e.g., "gpt-4o-2024-05-13" matches "gpt-4o")
        for (const [pattern, meta] of Object.entries(OPENAI_MODEL_METADATA)) {
          if (modelId.startsWith(pattern) || modelId === pattern) {
            metadata = meta;
            break;
          }
        }
      }

      // Skip models we don't have metadata for (embeddings, fine-tunes, etc.)
      if (!metadata) {
        log.debug({ modelId }, "Skipping model without metadata");
        continue;
      }

      // Skip deprecated models unless they're the only version
      if (metadata.deprecated) {
        log.debug({ modelId }, "Including deprecated model");
      }

      discoveredModels.push({
        id: modelId,
        name: metadata.displayName,
        provider: "openai",
        capability: metadata.capability,
        description: metadata.description,
        creditsPerInputToken: metadata.creditsPerInputToken,
        creditsPerOutputToken: metadata.creditsPerOutputToken,
        creditsPerImage: metadata.creditsPerImage,
        creditsPerChar: metadata.creditsPerChar,
        creditsPerMinute: metadata.creditsPerMinute,
        maxTokens: metadata.maxTokens,
        contextWindow: metadata.contextWindow,
        tier: metadata.tier,
        badge: metadata.badge,
        deprecated: metadata.deprecated,
        deprecationMessage: metadata.deprecationMessage,
        capabilities: metadata.capabilities,
      });
    }

    log.info(
      { count: discoveredModels.length, models: discoveredModels.map((m) => m.id) },
      "Discovered OpenAI models"
    );

    return discoveredModels;
  } catch (error) {
    log.error({ error }, "Failed to discover OpenAI models");
    return [];
  }
}

// ===========================================
// Anthropic Model Discovery
// ===========================================

/**
 * Discover available models from Anthropic
 *
 * Note: Anthropic doesn't have a models.list() API like OpenAI.
 * We validate the API key and return our known model list.
 * We test a cheap model to verify the key works.
 */
export async function discoverAnthropicModels(): Promise<ModelInfo[]> {
  const apiKey = process.env.TWOBOT_ANTHROPIC_API_KEY;
  if (!apiKey) {
    log.warn("Anthropic API key not set, skipping discovery");
    return [];
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 15000 });

    // Test the API key with a minimal request
    // Using claude-3-haiku as it's the cheapest
    await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });

    log.info("Anthropic API key validated");

    // Return all known Anthropic models
    const discoveredModels: ModelInfo[] = [];

    for (const [modelId, metadata] of Object.entries(ANTHROPIC_MODEL_METADATA)) {
      // Skip "latest" aliases to avoid duplicates in UI
      if (modelId.endsWith("-latest")) {
        continue;
      }

      discoveredModels.push({
        id: modelId,
        name: metadata.displayName,
        provider: "anthropic",
        capability: metadata.capability,
        description: metadata.description,
        creditsPerInputToken: metadata.creditsPerInputToken,
        creditsPerOutputToken: metadata.creditsPerOutputToken,
        maxTokens: metadata.maxTokens,
        contextWindow: metadata.contextWindow,
        tier: metadata.tier,
        badge: metadata.badge,
        deprecated: metadata.deprecated,
        deprecationMessage: metadata.deprecationMessage,
        capabilities: metadata.capabilities,
      });
    }

    log.info(
      { count: discoveredModels.length, models: discoveredModels.map((m) => m.id) },
      "Discovered Anthropic models"
    );

    return discoveredModels;
  } catch (error) {
    log.error({ error }, "Failed to discover Anthropic models");
    return [];
  }
}

// ===========================================
// Together AI Model Discovery
// ===========================================

/**
 * Discover available models from Together AI
 *
 * Together AI has a /v1/models API endpoint.
 * We validate the API key and return our curated model list.
 */
export async function discoverTogetherModels(): Promise<ModelInfo[]> {
  const apiKey = process.env.TWOBOT_TOGETHER_API_KEY;
  if (!apiKey) {
    log.warn("Together AI API key not set, skipping discovery");
    return [];
  }

  try {
    // Validate the API key with a models.list call
    const response = await fetch("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Together API returned ${response.status}`);
    }

    log.info("Together AI API key validated");

    // Return our curated model list (not the full 125+ models from the API)
    const discoveredModels: ModelInfo[] = [];

    for (const [modelId, metadata] of Object.entries(TOGETHER_MODEL_METADATA)) {
      discoveredModels.push({
        id: modelId,
        name: metadata.displayName,
        provider: "together",
        capability: metadata.capability,
        description: metadata.description,
        creditsPerInputToken: metadata.creditsPerInputToken,
        creditsPerOutputToken: metadata.creditsPerOutputToken,
        creditsPerImage: metadata.creditsPerImage,
        creditsPerMinute: metadata.creditsPerMinute,
        maxTokens: metadata.maxTokens,
        contextWindow: metadata.contextWindow,
        tier: metadata.tier,
        badge: metadata.badge,
        deprecated: metadata.deprecated,
        deprecationMessage: metadata.deprecationMessage,
        capabilities: metadata.capabilities,
      });
    }

    log.info(
      { count: discoveredModels.length, models: discoveredModels.map((m) => m.id) },
      "Discovered Together AI models"
    );

    return discoveredModels;
  } catch (error) {
    log.error({ error }, "Failed to discover Together AI models");
    return [];
  }
}

// ===========================================
// Combined Model Discovery
// ===========================================

// Cache for discovered models
let discoveredModelsCache: ModelInfo[] | null = null;
let lastDiscoveryTime: Date | null = null;
const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Discover all available models from all providers
 */
export async function discoverAllModels(forceRefresh = false): Promise<ModelInfo[]> {
  // Return cached if valid
  if (
    !forceRefresh &&
    discoveredModelsCache &&
    lastDiscoveryTime &&
    Date.now() - lastDiscoveryTime.getTime() < DISCOVERY_CACHE_TTL_MS
  ) {
    log.debug("Returning cached discovered models");
    return discoveredModelsCache;
  }

  log.info("Discovering models from all providers...");

  const [openaiModels, anthropicModels, togetherModels] = await Promise.all([
    discoverOpenAIModels(),
    discoverAnthropicModels(),
    discoverTogetherModels(),
  ]);

  const allModels = [...openaiModels, ...anthropicModels, ...togetherModels];

  // Sort by provider, then by tier
  allModels.sort((a, b) => {
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    return (a.tier || 99) - (b.tier || 99);
  });

  // Set default model (cheapest chat model)
  const chatModels = allModels.filter((m) => m.capability === "text-generation" && !m.deprecated);
  if (chatModels.length > 0) {
    chatModels.sort((a, b) => (a.tier || 99) - (b.tier || 99));
    const defaultModelId = chatModels[0]?.id;
    if (defaultModelId) {
      const idx = allModels.findIndex((m) => m.id === defaultModelId);
      const found = idx >= 0 ? allModels[idx] : undefined;
      if (found) {
        const model = found;
        allModels[idx] = {
          id: model.id,
          name: model.name,
          provider: model.provider,
          capability: model.capability,
          description: model.description,
          creditsPerInputToken: model.creditsPerInputToken,
          creditsPerOutputToken: model.creditsPerOutputToken,
          creditsPerImage: model.creditsPerImage,
          creditsPerChar: model.creditsPerChar,
          creditsPerMinute: model.creditsPerMinute,
          maxTokens: model.maxTokens,
          contextWindow: model.contextWindow,
          tier: model.tier,
          badge: model.badge,
          deprecated: model.deprecated,
          deprecationMessage: model.deprecationMessage,
          capabilities: model.capabilities,
          isDefault: true,
        };
      }
    }
  }

  // Cache results
  discoveredModelsCache = allModels;
  lastDiscoveryTime = new Date();

  log.info(
    {
      total: allModels.length,
      openai: openaiModels.length,
      anthropic: anthropicModels.length,
      together: togetherModels.length,
    },
    "Model discovery complete"
  );

  return allModels;
}

/**
 * Get discovered models (from cache or discover)
 */
export function getDiscoveredModels(): ModelInfo[] {
  if (discoveredModelsCache) {
    return discoveredModelsCache;
  }
  // Return empty if not yet discovered - caller should await discoverAllModels
  return [];
}

/**
 * Clear the discovery cache
 */
export function clearDiscoveryCache(): void {
  discoveredModelsCache = null;
  lastDiscoveryTime = null;
  log.info("Discovery cache cleared");
}

/**
 * Check if models have been discovered
 */
export function hasDiscoveredModels(): boolean {
  return discoveredModelsCache !== null && discoveredModelsCache.length > 0;
}
