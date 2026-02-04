/**
 * Model Pricing - Single Source of Truth
 *
 * Centralized credit rates for all AI models.
 * This file is the ONLY place where pricing is defined.
 * Both model-discovery.service.ts and 2bot-ai-credit.service.ts
 * import from here to ensure consistency.
 *
 * Credits are internal units: 1 credit ≈ $0.001 USD ($1 = 1,000 credits)
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
  // GPT-4o Mini - Fast & cheap
  "gpt-4o-mini": {
    creditsPerInputToken: 0.0000015,
    creditsPerOutputToken: 0.000006,
  },
  // GPT-4o - Most capable
  "gpt-4o": {
    creditsPerInputToken: 0.000025,
    creditsPerOutputToken: 0.0001,
  },
  // GPT-4 Turbo - Previous gen
  "gpt-4-turbo": {
    creditsPerInputToken: 0.0001,
    creditsPerOutputToken: 0.0003,
  },
  // o1 - Advanced reasoning
  "o1": {
    creditsPerInputToken: 0.00015,
    creditsPerOutputToken: 0.0006,
  },
  // o1-mini - Fast reasoning
  "o1-mini": {
    creditsPerInputToken: 0.00003,
    creditsPerOutputToken: 0.00012,
  },
  // o3-mini - Latest reasoning
  "o3-mini": {
    creditsPerInputToken: 0.000011,
    creditsPerOutputToken: 0.000044,
  },
};

export const OPENAI_IMAGE_GENERATION_PRICING: Record<string, ImageGenerationModelPricing> = {
  "dall-e-3": {
    creditsPerImage: 40,  // Standard quality
  },
  "dall-e-3-hd": {
    creditsPerImage: 80,  // HD quality
  },
  "dall-e-2": {
    creditsPerImage: 20,
  },
};

export const OPENAI_SPEECH_SYNTHESIS_PRICING: Record<string, SpeechSynthesisModelPricing> = {
  "tts-1": {
    creditsPerChar: 0.015,
  },
  "tts-1-hd": {
    creditsPerChar: 0.03,
  },
};

export const OPENAI_SPEECH_RECOGNITION_PRICING: Record<string, SpeechRecognitionModelPricing> = {
  "whisper-1": {
    creditsPerMinute: 6,
  },
};

export const OPENAI_TEXT_EMBEDDING_PRICING: Record<string, TextEmbeddingModelPricing> = {
  "text-embedding-3-small": {
    creditsPerInputToken: 0.0000002,
  },
  "text-embedding-3-large": {
    creditsPerInputToken: 0.0000013,
  },
};

// ===========================================
// Anthropic Model Pricing
// ===========================================

export const ANTHROPIC_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = {
  // Claude 4 / Sonnet 4
  "claude-sonnet-4-20250514": {
    creditsPerInputToken: 0.00003,
    creditsPerOutputToken: 0.00015,
  },
  // Claude Opus 4.5
  "claude-opus-4-20250514": {
    creditsPerInputToken: 0.00015,
    creditsPerOutputToken: 0.00075,
  },
  // Claude 3.5 Sonnet
  "claude-3-5-sonnet-20241022": {
    creditsPerInputToken: 0.00003,
    creditsPerOutputToken: 0.00015,
  },
  // Claude 3.5 Haiku
  "claude-3-5-haiku-20241022": {
    creditsPerInputToken: 0.000008,
    creditsPerOutputToken: 0.00004,
  },
  // Claude 3 Opus (legacy)
  "claude-3-opus-20240229": {
    creditsPerInputToken: 0.00015,
    creditsPerOutputToken: 0.00075,
  },
  // Claude 3 Haiku (legacy)
  "claude-3-haiku-20240307": {
    creditsPerInputToken: 0.0000025,
    creditsPerOutputToken: 0.0000125,
  },
};

// ===========================================
// Combined Lookup Functions
// ===========================================

/**
 * Get text generation model pricing by model ID
 */
export function getTextGenerationPricing(modelId: string): TextGenerationModelPricing | undefined {
  return OPENAI_TEXT_GENERATION_PRICING[modelId] || ANTHROPIC_TEXT_GENERATION_PRICING[modelId];
}

/**
 * Get image generation model pricing by model ID
 */
export function getImageGenerationPricing(modelId: string): ImageGenerationModelPricing | undefined {
  return OPENAI_IMAGE_GENERATION_PRICING[modelId];
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
  return OPENAI_TEXT_EMBEDDING_PRICING[modelId];
}

// ===========================================
// Fallback Pricing (for unknown models)
// ===========================================

/**
 * Fallback pricing by capability (new system)
 */
export const FALLBACK_PRICING_BY_CAPABILITY: Record<AICapability, ModelPricing> = {
  "text-generation": {
    creditsPerInputToken: 0.00002,
    creditsPerOutputToken: 0.00006,
  } as TextGenerationModelPricing,
  "image-understanding": {
    creditsPerInputToken: 0.00002,
    creditsPerOutputToken: 0.00006,
  } as TextGenerationModelPricing,
  "image-generation": {
    creditsPerImage: 50,
  } as ImageGenerationModelPricing,
  "speech-synthesis": {
    creditsPerChar: 0.015,
  } as SpeechSynthesisModelPricing,
  "speech-recognition": {
    creditsPerMinute: 6,
  } as SpeechRecognitionModelPricing,
  "text-embedding": {
    creditsPerInputToken: 0.000001,
  } as TextEmbeddingModelPricing,
  // Future capabilities - use text-generation as default
  "video-generation": { creditsPerInputToken: 0.0001, creditsPerOutputToken: 0.0003 } as TextGenerationModelPricing,
  "video-understanding": { creditsPerInputToken: 0.00005, creditsPerOutputToken: 0.00015 } as TextGenerationModelPricing,
  "code-generation": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 } as TextGenerationModelPricing,
  "code-execution": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 } as TextGenerationModelPricing,
  "tool-use": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 } as TextGenerationModelPricing,
  "web-browsing": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 } as TextGenerationModelPricing,
  "file-processing": { creditsPerInputToken: 0.00002, creditsPerOutputToken: 0.00006 } as TextGenerationModelPricing,
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
