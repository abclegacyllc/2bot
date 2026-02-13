/**
 * Model Pricing - Single Source of Truth
 *
 * Centralized credit rates for all AI models.
 * This file is the ONLY place where pricing is defined.
 * Both model-discovery.service.ts and 2bot-ai-credit.service.ts
 * import from here to ensure consistency.
 *
 * Credits: $1 = 100 credits (1 credit = $0.01)
 *
 * Pricing strategy: 3x margin over API provider cost.
 * Formula: creditsPerToken = API_cost_per_token × 300
 *          creditsPerImage = API_cost_per_image × 300
 *
 * At $1 = 100 credits, a 3x margin means:
 *   - API cost $0.01 → we charge $0.03 → 3 credits
 *   - Revenue covers API cost + servers + development
 *
 * @module modules/2bot-ai-provider/model-pricing
 */

import type { AICapability } from "./types";

// ===========================================
// Pricing Types
// ===========================================

export interface TextGenerationModelPricing {
  creditsPerInputToken: number;   // Per input token
  creditsPerOutputToken: number;  // Per output token
}

export interface ImageGenerationModelPricing {
  creditsPerImage: number;   // Per image generated
}

export interface SpeechSynthesisModelPricing {
  creditsPerChar: number; // Per character
}

export interface SpeechRecognitionModelPricing {
  creditsPerMinute: number;  // Per minute of audio
}

export interface TextEmbeddingModelPricing {
  creditsPerInputToken: number;   // Per input token
}

export type ModelPricing = 
  | TextGenerationModelPricing 
  | ImageGenerationModelPricing 
  | SpeechSynthesisModelPricing 
  | SpeechRecognitionModelPricing 
  | TextEmbeddingModelPricing;

// ===========================================
// OpenAI Model Pricing
// ===========================================

export const OPENAI_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = {
  // GPT-4o Mini — API: $0.15/$0.60 per MTok
  "gpt-4o-mini": {
    creditsPerInputToken: 0.000045,
    creditsPerOutputToken: 0.00018,
  },
  // GPT-4o — API: $2.50/$10 per MTok
  "gpt-4o": {
    creditsPerInputToken: 0.00075,
    creditsPerOutputToken: 0.003,
  },
  // GPT-4 Turbo — API: $10/$30 per MTok
  "gpt-4-turbo": {
    creditsPerInputToken: 0.003,
    creditsPerOutputToken: 0.009,
  },
  // o1 — API: $15/$60 per MTok
  "o1": {
    creditsPerInputToken: 0.0045,
    creditsPerOutputToken: 0.018,
  },
  // o1-mini — API: $3/$12 per MTok
  "o1-mini": {
    creditsPerInputToken: 0.0009,
    creditsPerOutputToken: 0.0036,
  },
  // o3-mini — API: $1.10/$4.40 per MTok
  "o3-mini": {
    creditsPerInputToken: 0.00033,
    creditsPerOutputToken: 0.00132,
  },
  // o1-pro — API: $150/$600 per MTok
  "o1-pro": {
    creditsPerInputToken: 0.045,
    creditsPerOutputToken: 0.18,
  },
};

export const OPENAI_IMAGE_GENERATION_PRICING: Record<string, ImageGenerationModelPricing> = {
  // dall-e-3 — API: ~$0.04/image
  "dall-e-3": {
    creditsPerImage: 12,
  },
  // dall-e-3-hd — API: ~$0.08/image
  "dall-e-3-hd": {
    creditsPerImage: 24,
  },
  // dall-e-2 — API: ~$0.02/image
  "dall-e-2": {
    creditsPerImage: 6,
  },
};

export const OPENAI_SPEECH_SYNTHESIS_PRICING: Record<string, SpeechSynthesisModelPricing> = {
  // tts-1 — API: $15/1M chars = $0.000015/char
  "tts-1": {
    creditsPerChar: 0.0045,
  },
  // tts-1-hd — API: $30/1M chars = $0.00003/char
  "tts-1-hd": {
    creditsPerChar: 0.009,
  },
};

export const OPENAI_SPEECH_RECOGNITION_PRICING: Record<string, SpeechRecognitionModelPricing> = {
  // whisper-1 — API: $0.006/min
  "whisper-1": {
    creditsPerMinute: 1.8,
  },
};

export const OPENAI_TEXT_EMBEDDING_PRICING: Record<string, TextEmbeddingModelPricing> = {
  // text-embedding-3-small — API: $0.02/MTok
  "text-embedding-3-small": {
    creditsPerInputToken: 0.000006,
  },
  // text-embedding-3-large — API: $0.13/MTok
  "text-embedding-3-large": {
    creditsPerInputToken: 0.000039,
  },
};

// ===========================================
// Anthropic Model Pricing
// ===========================================

export const ANTHROPIC_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = {
  // Claude Opus 4.6 — API: $5/$25 per MTok (NEWEST, best value for premium)
  "claude-opus-4-6-20260131": {
    creditsPerInputToken: 0.0015,
    creditsPerOutputToken: 0.0075,
  },
  // Claude Sonnet 4.5 — API: $3/$15 per MTok (latest balanced model)
  "claude-sonnet-4-5-20251022": {
    creditsPerInputToken: 0.0009,
    creditsPerOutputToken: 0.0045,
  },
  // Claude Haiku 4.5 — API: $1/$5 per MTok (latest fast model)
  "claude-haiku-4-5-20251022": {
    creditsPerInputToken: 0.0003,
    creditsPerOutputToken: 0.0015,
  },
  // Claude Sonnet 4 — API: $3/$15 per MTok (previous gen, same price as 4.5)
  "claude-sonnet-4-20250514": {
    creditsPerInputToken: 0.0009,
    creditsPerOutputToken: 0.0045,
  },
  // Claude Opus 4 (DEPRECATED) — API: $15/$75 per MTok — Use Opus 4.6 instead (3x cheaper, better)
  "claude-opus-4-20250514": {
    creditsPerInputToken: 0.0045,
    creditsPerOutputToken: 0.0225,
  },
  // Claude 3.5 Sonnet (legacy) — API: $3/$15 per MTok
  "claude-3-5-sonnet-20241022": {
    creditsPerInputToken: 0.0009,
    creditsPerOutputToken: 0.0045,
  },
  // Claude 3.5 Haiku — API: $0.80/$4 per MTok
  "claude-3-5-haiku-20241022": {
    creditsPerInputToken: 0.00024,
    creditsPerOutputToken: 0.0012,
  },
  // Claude 3 Opus (DEPRECATED) — API: $15/$75 per MTok
  "claude-3-opus-20240229": {
    creditsPerInputToken: 0.0045,
    creditsPerOutputToken: 0.0225,
  },
  // Claude 3 Haiku (legacy) — API: $0.25/$1.25 per MTok
  "claude-3-haiku-20240307": {
    creditsPerInputToken: 0.000075,
    creditsPerOutputToken: 0.000375,
  },
};

// ===========================================
// Together AI Model Pricing
// ===========================================

export const TOGETHER_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = {
  // FREE tier — API: $0/$0
  // MoA-1 removed from Together AI (2026-02)
  "ServiceNow-AI/Apriel-1.6-15b-Thinker": {
    creditsPerInputToken: 0,
    creditsPerOutputToken: 0,
  },
  // LITE tier
  // gemma-3n — API: $0.02/$0.04 per MTok
  "google/gemma-3n-E4B-it": {
    creditsPerInputToken: 0.000006,
    creditsPerOutputToken: 0.000012,
  },
  // trinity-mini — API: $0.045/$0.15 per MTok (verified via Together API 2026-02-11)
  "arcee-ai/trinity-mini": {
    creditsPerInputToken: 0.0000135,
    creditsPerOutputToken: 0.000045,
  },
  // gpt-oss-20b — API: $0.05/$0.20 per MTok (verified via Together API 2026-02-11)
  "openai/gpt-oss-20b": {
    creditsPerInputToken: 0.000015,
    creditsPerOutputToken: 0.00006,
  },
  // Nemotron — API: $0.06/$0.25 per MTok (verified via Together API 2026-02-11)
  "nvidia/NVIDIA-Nemotron-Nano-9B-v2": {
    creditsPerInputToken: 0.000018,
    creditsPerOutputToken: 0.000075,
  },
  // Llama-3.2-3B — API: $0.06/$0.06 per MTok
  "meta-llama/Llama-3.2-3B-Instruct-Turbo": {
    creditsPerInputToken: 0.000018,
    creditsPerOutputToken: 0.000018,
  },
  // PRO tier
  // Qwen3-Next — API: $0.15/$1.50 per MTok
  "Qwen/Qwen3-Next-80B-A3B-Instruct": {
    creditsPerInputToken: 0.000045,
    creditsPerOutputToken: 0.00045,
  },
  // gpt-oss-120b — API: $0.15/$0.60 per MTok
  "openai/gpt-oss-120b": {
    creditsPerInputToken: 0.000045,
    creditsPerOutputToken: 0.00018,
  },
  // Llama-4-Scout — API: $0.18/$0.59 per MTok
  "meta-llama/Llama-4-Scout-17B-16E-Instruct": {
    creditsPerInputToken: 0.000054,
    creditsPerOutputToken: 0.000177,
  },
  // Qwen3-VL-8B — API: $0.18/$0.68 per MTok
  "Qwen/Qwen3-VL-8B-Instruct": {
    creditsPerInputToken: 0.000054,
    creditsPerOutputToken: 0.000204,
  },
  // Ministral — API: $0.20/$0.20 per MTok
  "mistralai/Ministral-3-14B-Instruct-2512": {
    creditsPerInputToken: 0.00006,
    creditsPerOutputToken: 0.00006,
  },
  // Maverick — API: $0.27/$0.85 per MTok
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8": {
    creditsPerInputToken: 0.000081,
    creditsPerOutputToken: 0.000255,
  },
  // Qwen3-Coder — API: $0.50/$1.20 per MTok
  "Qwen/Qwen3-Coder-Next-FP8": {
    creditsPerInputToken: 0.00015,
    creditsPerOutputToken: 0.00036,
  },
  // Kimi-K2.5 — API: $0.50/$2.80 per MTok
  "moonshotai/Kimi-K2.5": {
    creditsPerInputToken: 0.00015,
    creditsPerOutputToken: 0.00084,
  },
  // DeepSeek-V3.1 — API: $0.60/$1.70 per MTok
  "deepseek-ai/DeepSeek-V3.1": {
    creditsPerInputToken: 0.00018,
    creditsPerOutputToken: 0.00051,
  },
  // ULTRA tier (reasoning)
  // Qwen3-Thinking — API: $0.65/$3.00 per MTok
  "Qwen/Qwen3-235B-A22B-Thinking-2507": {
    creditsPerInputToken: 0.000195,
    creditsPerOutputToken: 0.0009,
  },
  // Kimi-K2-Thinking — API: $1.20/$4.00 per MTok
  "moonshotai/Kimi-K2-Thinking": {
    creditsPerInputToken: 0.00036,
    creditsPerOutputToken: 0.0012,
  },
  // cogito-671b — API: $1.25/$1.25 per MTok
  "deepcogito/cogito-v2-1-671b": {
    creditsPerInputToken: 0.000375,
    creditsPerOutputToken: 0.000375,
  },
  // DeepSeek-R1 — API: $3.00/$7.00 per MTok
  "deepseek-ai/DeepSeek-R1": {
    creditsPerInputToken: 0.0009,
    creditsPerOutputToken: 0.0021,
  },
};

export const TOGETHER_IMAGE_GENERATION_PRICING: Record<string, ImageGenerationModelPricing> = {
  // FLUX.1-schnell — API: $0.003/image
  "black-forest-labs/FLUX.1-schnell": {
    creditsPerImage: 0.9,
  },
  // FLUX.2-dev — API: $0.025/image
  "black-forest-labs/FLUX.2-dev": {
    creditsPerImage: 7.5,
  },
  // FLUX.2-pro — API: $0.04/image
  "black-forest-labs/FLUX.2-pro": {
    creditsPerImage: 12,
  },
  // Imagen 4.0 Preview — API: $0.04/image (renamed 2026-02)
  "google/imagen-4.0-preview": {
    creditsPerImage: 12,
  },
  // Imagen 4.0 Fast — API: $0.02/image
  "google/imagen-4.0-fast": {
    creditsPerImage: 6,
  },
  // Imagen 4.0 Ultra — API: $0.08/image (renamed 2026-02)
  "google/imagen-4.0-ultra": {
    creditsPerImage: 24,
  },
  // Ideogram 3.0 — API: $0.08/image (renamed from ideogram-ai/ideogram-v3)
  "ideogram/ideogram-3.0": {
    creditsPerImage: 24,
  },
  // Seedream 4.0 — API: $0.05/image (renamed from seedream/seedream-4.0)
  "ByteDance-Seed/Seedream-4.0": {
    creditsPerImage: 15,
  },
  // Stable Diffusion 3 — API: $0.065/image (renamed with -medium suffix)
  "stabilityai/stable-diffusion-3-medium": {
    creditsPerImage: 19.5,
  },
};

export const TOGETHER_TEXT_EMBEDDING_PRICING: Record<string, TextEmbeddingModelPricing> = {
  // m2-bert — REMOVED from Together AI (2026-02), keeping for historical billing
  // "togethercomputer/m2-bert-80M-2k-retrieval": creditsPerInputToken: 0.0000024,
  // "togethercomputer/m2-bert-80M-8k-retrieval": creditsPerInputToken: 0.0000024,
  // "togethercomputer/m2-bert-80M-32k-retrieval": creditsPerInputToken: 0.0000024,
  // bge-large — API: $0.016/MTok (verified via Together API 2026-02-12)
  "BAAI/bge-large-en-v1.5": {
    creditsPerInputToken: 0.0000048,
  },
  // UAE-Large — REMOVED from Together AI (2026-02), keeping for historical billing
  // "WhereIsAI/UAE-Large-V1": creditsPerInputToken: 0.0000015,
  // Alibaba GTE ModernBERT — API: $0.08/MTok (new 2026-02)
  "Alibaba-NLP/gte-modernbert-base": {
    creditsPerInputToken: 0.000024,
  },
  // bge-base — API: $0.008/MTok
  "BAAI/bge-base-en-v1.5": {
    creditsPerInputToken: 0.0000024,
  },
  // Multilingual E5 Large — API: $0.02/MTok
  "intfloat/multilingual-e5-large-instruct": {
    creditsPerInputToken: 0.000006,
  },
};

// ===========================================
// Combined Lookup Functions
// ===========================================

/**
 * Get text generation model pricing by model ID
 */
export function getTextGenerationPricing(modelId: string): TextGenerationModelPricing | undefined {
  return OPENAI_TEXT_GENERATION_PRICING[modelId] || ANTHROPIC_TEXT_GENERATION_PRICING[modelId] || TOGETHER_TEXT_GENERATION_PRICING[modelId];
}

/**
 * Get image generation model pricing by model ID
 */
export function getImageGenerationPricing(modelId: string): ImageGenerationModelPricing | undefined {
  return OPENAI_IMAGE_GENERATION_PRICING[modelId] || TOGETHER_IMAGE_GENERATION_PRICING[modelId];
}

/**
 * Get speech synthesis model pricing by model ID
 */
export function getSpeechSynthesisPricing(modelId: string): SpeechSynthesisModelPricing | undefined {
  return OPENAI_SPEECH_SYNTHESIS_PRICING[modelId];
}

/**
 * Get speech recognition model pricing by model ID
 */
export function getSpeechRecognitionPricing(modelId: string): SpeechRecognitionModelPricing | undefined {
  return OPENAI_SPEECH_RECOGNITION_PRICING[modelId];
}

/**
 * Get text embedding model pricing by model ID
 */
export function getTextEmbeddingPricing(modelId: string): TextEmbeddingModelPricing | undefined {
  return OPENAI_TEXT_EMBEDDING_PRICING[modelId] || TOGETHER_TEXT_EMBEDDING_PRICING[modelId];
}

// ===========================================
// Fallback Pricing (for unknown models)
// ===========================================

/**
 * Fallback pricing by capability (new system)
 */
export const FALLBACK_PRICING_BY_CAPABILITY: Record<AICapability, ModelPricing> = {
  // Fallback uses GPT-4-turbo-level pricing (generous overcharge for unknown models)
  "text-generation": {
    creditsPerInputToken: 0.003,
    creditsPerOutputToken: 0.009,
  } as TextGenerationModelPricing,
  "image-understanding": {
    creditsPerInputToken: 0.003,
    creditsPerOutputToken: 0.009,
  } as TextGenerationModelPricing,
  "image-generation": {
    creditsPerImage: 15,
  } as ImageGenerationModelPricing,
  "speech-synthesis": {
    creditsPerChar: 0.0045,
  } as SpeechSynthesisModelPricing,
  "speech-recognition": {
    creditsPerMinute: 1.8,
  } as SpeechRecognitionModelPricing,
  "text-embedding": {
    creditsPerInputToken: 0.000039,
  } as TextEmbeddingModelPricing,
  // Future capabilities - use text-generation as default
  "video-generation": { creditsPerInputToken: 0.009, creditsPerOutputToken: 0.027 } as TextGenerationModelPricing,
  "video-understanding": { creditsPerInputToken: 0.003, creditsPerOutputToken: 0.009 } as TextGenerationModelPricing,
  "code-generation": { creditsPerInputToken: 0.003, creditsPerOutputToken: 0.009 } as TextGenerationModelPricing,
  "code-execution": { creditsPerInputToken: 0.003, creditsPerOutputToken: 0.009 } as TextGenerationModelPricing,
  "tool-use": { creditsPerInputToken: 0.003, creditsPerOutputToken: 0.009 } as TextGenerationModelPricing,
  "web-browsing": { creditsPerInputToken: 0.003, creditsPerOutputToken: 0.009 } as TextGenerationModelPricing,
  "file-processing": { creditsPerInputToken: 0.003, creditsPerOutputToken: 0.009 } as TextGenerationModelPricing,
  "rerank": { creditsPerInputToken: 0.000039 } as TextEmbeddingModelPricing,
  "moderation": { creditsPerInputToken: 0.000039 } as TextEmbeddingModelPricing,
};

/**
 * Get pricing for a model by capability
 * Falls back to default pricing if model not found
 */
export function getModelPricingByCapability(capability: AICapability, modelId: string): ModelPricing {
  switch (capability) {
    case "text-generation":
    case "image-understanding":
    case "code-generation":
      return getTextGenerationPricing(modelId) || FALLBACK_PRICING_BY_CAPABILITY[capability];
    case "image-generation":
      return getImageGenerationPricing(modelId) || FALLBACK_PRICING_BY_CAPABILITY["image-generation"];
    case "speech-synthesis":
      return getSpeechSynthesisPricing(modelId) || FALLBACK_PRICING_BY_CAPABILITY["speech-synthesis"];
    case "speech-recognition":
      return getSpeechRecognitionPricing(modelId) || FALLBACK_PRICING_BY_CAPABILITY["speech-recognition"];
    case "text-embedding":
      return getTextEmbeddingPricing(modelId) || FALLBACK_PRICING_BY_CAPABILITY["text-embedding"];
    default:
      return FALLBACK_PRICING_BY_CAPABILITY["text-generation"];
  }
}

/**
 * Calculate credits for usage by capability
 */
export function calculateCreditsForUsageByCapability(
  capability: AICapability,
  modelId: string,
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    imageCount?: number;
    characterCount?: number;
    audioSeconds?: number;
  }
): number {
  const pricing = getModelPricingByCapability(capability, modelId);
  let credits = 0;

  if (capability === "text-generation" || capability === "image-understanding" || 
      capability === "text-embedding" || capability === "code-generation") {
    const textGenPricing = pricing as TextGenerationModelPricing;
    const inputCredits = (usage.inputTokens || 0) * textGenPricing.creditsPerInputToken;
    const outputCredits = (usage.outputTokens || 0) * (textGenPricing.creditsPerOutputToken || 0);
    credits = inputCredits + outputCredits;
  } else if (capability === "image-generation") {
    const imageGenPricing = pricing as ImageGenerationModelPricing;
    credits = (usage.imageCount || 1) * imageGenPricing.creditsPerImage;
  } else if (capability === "speech-synthesis") {
    const speechSynthPricing = pricing as SpeechSynthesisModelPricing;
    credits = (usage.characterCount || 0) * speechSynthPricing.creditsPerChar;
  } else if (capability === "speech-recognition") {
    const speechRecPricing = pricing as SpeechRecognitionModelPricing;
    const minutes = (usage.audioSeconds || 0) / 60;
    credits = minutes * speechRecPricing.creditsPerMinute;
  }

  return credits; // Return precise float for accumulation
}
