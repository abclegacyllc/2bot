/**
 * Model Pricing — Derived from Model Registry
 *
 * All pricing is defined in model-registry.ts (single source of truth).
 * This file derives backward-compatible pricing maps from the registry
 * so consumers (tier-auto-curator, pricing-monitor, etc.) can continue
 * using the same per-provider pricing records.
 *
 * @module modules/2bot-ai-provider/model-pricing
 */

import {
    creditPerChar,
    creditPerImage,
    creditPerInputToken,
    creditPerMinute,
    creditPerOutputToken,
    getRegistryEntriesByProvider,
} from "./model-registry";
import { getAllProviders } from "./provider-registry";
import type { AICapability, TwoBotAIProvider } from "./types";

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
// Pricing Map Builders (derive from registry)
// ===========================================

function buildTextGenPricing(provider: TwoBotAIProvider): Record<string, TextGenerationModelPricing> {
  const result: Record<string, TextGenerationModelPricing> = {};
  for (const entry of getRegistryEntriesByProvider(provider, "text-generation")) {
    const cost = entry.providers[provider];
    if (cost?.inputPer1M !== undefined && cost.outputPer1M !== undefined) {
      result[cost.modelId] = {
        creditsPerInputToken: creditPerInputToken(cost.inputPer1M),
        creditsPerOutputToken: creditPerOutputToken(cost.outputPer1M),
      };
    }
  }
  return result;
}

function buildCodeGenPricing(provider: TwoBotAIProvider): Record<string, TextGenerationModelPricing> {
  const result: Record<string, TextGenerationModelPricing> = {};
  for (const entry of getRegistryEntriesByProvider(provider, "code-generation")) {
    const cost = entry.providers[provider];
    if (cost?.inputPer1M !== undefined && cost.outputPer1M !== undefined) {
      result[cost.modelId] = {
        creditsPerInputToken: creditPerInputToken(cost.inputPer1M),
        creditsPerOutputToken: creditPerOutputToken(cost.outputPer1M),
      };
    }
  }
  return result;
}

function buildImageGenPricing(provider: TwoBotAIProvider): Record<string, ImageGenerationModelPricing> {
  const result: Record<string, ImageGenerationModelPricing> = {};
  for (const entry of getRegistryEntriesByProvider(provider, "image-generation")) {
    const cost = entry.providers[provider];
    if (cost?.perImage !== undefined) {
      result[cost.modelId] = { creditsPerImage: creditPerImage(cost.perImage) };
    }
  }
  return result;
}

function buildSpeechSynthPricing(provider: TwoBotAIProvider): Record<string, SpeechSynthesisModelPricing> {
  const result: Record<string, SpeechSynthesisModelPricing> = {};
  for (const entry of getRegistryEntriesByProvider(provider, "speech-synthesis")) {
    const cost = entry.providers[provider];
    if (cost?.perCharM !== undefined) {
      result[cost.modelId] = { creditsPerChar: creditPerChar(cost.perCharM) };
    }
  }
  return result;
}

function buildSpeechRecPricing(provider: TwoBotAIProvider): Record<string, SpeechRecognitionModelPricing> {
  const result: Record<string, SpeechRecognitionModelPricing> = {};
  for (const entry of getRegistryEntriesByProvider(provider, "speech-recognition")) {
    const cost = entry.providers[provider];
    if (cost?.perMinute !== undefined) {
      result[cost.modelId] = { creditsPerMinute: creditPerMinute(cost.perMinute) };
    }
  }
  return result;
}

function buildEmbeddingPricing(provider: TwoBotAIProvider): Record<string, TextEmbeddingModelPricing> {
  const result: Record<string, TextEmbeddingModelPricing> = {};
  for (const entry of getRegistryEntriesByProvider(provider, "text-embedding")) {
    const cost = entry.providers[provider];
    if (cost?.inputPer1M !== undefined) {
      result[cost.modelId] = { creditsPerInputToken: creditPerInputToken(cost.inputPer1M) };
    }
  }
  return result;
}

// ===========================================
// Dynamic Per-Provider Pricing Maps
// ===========================================

/**
 * Dynamically build pricing maps for ALL registered providers.
 * When a new provider is added to provider-registry.ts, pricing maps
 * are generated automatically — no edits needed here.
 */
const ALL_TEXT_GEN_PRICING = new Map<TwoBotAIProvider, Record<string, TextGenerationModelPricing>>();
const ALL_CODE_GEN_PRICING = new Map<TwoBotAIProvider, Record<string, TextGenerationModelPricing>>();
const ALL_IMAGE_GEN_PRICING = new Map<TwoBotAIProvider, Record<string, ImageGenerationModelPricing>>();
const ALL_SPEECH_SYNTH_PRICING = new Map<TwoBotAIProvider, Record<string, SpeechSynthesisModelPricing>>();
const ALL_SPEECH_REC_PRICING = new Map<TwoBotAIProvider, Record<string, SpeechRecognitionModelPricing>>();
const ALL_EMBEDDING_PRICING = new Map<TwoBotAIProvider, Record<string, TextEmbeddingModelPricing>>();

for (const provider of getAllProviders()) {
  const textGen = buildTextGenPricing(provider);
  if (Object.keys(textGen).length > 0) ALL_TEXT_GEN_PRICING.set(provider, textGen);

  const codeGen = buildCodeGenPricing(provider);
  if (Object.keys(codeGen).length > 0) ALL_CODE_GEN_PRICING.set(provider, codeGen);

  const imageGen = buildImageGenPricing(provider);
  if (Object.keys(imageGen).length > 0) ALL_IMAGE_GEN_PRICING.set(provider, imageGen);

  const speechSynth = buildSpeechSynthPricing(provider);
  if (Object.keys(speechSynth).length > 0) ALL_SPEECH_SYNTH_PRICING.set(provider, speechSynth);

  const speechRec = buildSpeechRecPricing(provider);
  if (Object.keys(speechRec).length > 0) ALL_SPEECH_REC_PRICING.set(provider, speechRec);

  const embedding = buildEmbeddingPricing(provider);
  if (Object.keys(embedding).length > 0) ALL_EMBEDDING_PRICING.set(provider, embedding);
}

// Backward-compatible named exports (derived from dynamic maps)
export const OPENAI_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = ALL_TEXT_GEN_PRICING.get("openai") ?? {};
export const ANTHROPIC_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = ALL_TEXT_GEN_PRICING.get("anthropic") ?? {};
export const TOGETHER_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = ALL_TEXT_GEN_PRICING.get("together") ?? {};
export const FIREWORKS_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = ALL_TEXT_GEN_PRICING.get("fireworks") ?? {};
export const OPENROUTER_TEXT_GENERATION_PRICING: Record<string, TextGenerationModelPricing> = ALL_TEXT_GEN_PRICING.get("openrouter") ?? {};

export const OPENAI_IMAGE_GENERATION_PRICING: Record<string, ImageGenerationModelPricing> = ALL_IMAGE_GEN_PRICING.get("openai") ?? {};
export const TOGETHER_IMAGE_GENERATION_PRICING: Record<string, ImageGenerationModelPricing> = ALL_IMAGE_GEN_PRICING.get("together") ?? {};
export const FIREWORKS_IMAGE_GENERATION_PRICING: Record<string, ImageGenerationModelPricing> = ALL_IMAGE_GEN_PRICING.get("fireworks") ?? {};

export const OPENAI_SPEECH_SYNTHESIS_PRICING: Record<string, SpeechSynthesisModelPricing> = ALL_SPEECH_SYNTH_PRICING.get("openai") ?? {};
export const OPENAI_SPEECH_RECOGNITION_PRICING: Record<string, SpeechRecognitionModelPricing> = ALL_SPEECH_REC_PRICING.get("openai") ?? {};

export const OPENAI_TEXT_EMBEDDING_PRICING: Record<string, TextEmbeddingModelPricing> = ALL_EMBEDDING_PRICING.get("openai") ?? {};
export const TOGETHER_TEXT_EMBEDDING_PRICING: Record<string, TextEmbeddingModelPricing> = ALL_EMBEDDING_PRICING.get("together") ?? {};

// ===========================================
// Dynamic Accessor — For new code
// ===========================================

/** Get the text generation pricing map for a specific provider */
export function getTextGenPricingForProvider(provider: TwoBotAIProvider): Record<string, TextGenerationModelPricing> {
  return ALL_TEXT_GEN_PRICING.get(provider) ?? {};
}

/** Get the image generation pricing map for a specific provider */
export function getImageGenPricingForProvider(provider: TwoBotAIProvider): Record<string, ImageGenerationModelPricing> {
  return ALL_IMAGE_GEN_PRICING.get(provider) ?? {};
}

/** Get ALL text generation pricing maps (provider → pricing record) */
export function getAllTextGenPricing(): Map<TwoBotAIProvider, Record<string, TextGenerationModelPricing>> {
  return ALL_TEXT_GEN_PRICING;
}

/** Get ALL image generation pricing maps (provider → pricing record) */
export function getAllImageGenPricing(): Map<TwoBotAIProvider, Record<string, ImageGenerationModelPricing>> {
  return ALL_IMAGE_GEN_PRICING;
}

// ===========================================
// Lookup Functions (dynamic — auto-searches all providers)
// ===========================================

export function getTextGenerationPricing(modelId: string): TextGenerationModelPricing | undefined {
  for (const pricing of ALL_TEXT_GEN_PRICING.values()) {
    if (pricing[modelId]) return pricing[modelId];
  }
  return undefined;
}

export function getCodeGenerationPricing(modelId: string): TextGenerationModelPricing | undefined {
  for (const pricing of ALL_CODE_GEN_PRICING.values()) {
    if (pricing[modelId]) return pricing[modelId];
  }
  return undefined;
}

export function getImageGenerationPricing(modelId: string): ImageGenerationModelPricing | undefined {
  for (const pricing of ALL_IMAGE_GEN_PRICING.values()) {
    if (pricing[modelId]) return pricing[modelId];
  }
  return undefined;
}

export function getSpeechSynthesisPricing(modelId: string): SpeechSynthesisModelPricing | undefined {
  for (const pricing of ALL_SPEECH_SYNTH_PRICING.values()) {
    if (pricing[modelId]) return pricing[modelId];
  }
  return undefined;
}

export function getSpeechRecognitionPricing(modelId: string): SpeechRecognitionModelPricing | undefined {
  for (const pricing of ALL_SPEECH_REC_PRICING.values()) {
    if (pricing[modelId]) return pricing[modelId];
  }
  return undefined;
}

export function getTextEmbeddingPricing(modelId: string): TextEmbeddingModelPricing | undefined {
  for (const pricing of ALL_EMBEDDING_PRICING.values()) {
    if (pricing[modelId]) return pricing[modelId];
  }
  return undefined;
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
      return getTextGenerationPricing(modelId) || FALLBACK_PRICING_BY_CAPABILITY[capability];
    case "code-generation":
      return getCodeGenerationPricing(modelId) || FALLBACK_PRICING_BY_CAPABILITY["code-generation"];
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
