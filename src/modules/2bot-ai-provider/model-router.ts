/**
 * Smart Model Router
 *
 * Intelligently routes AI requests to the most cost-effective model.
 * Only uses models that are actually available (based on configured providers).
 *
 * Cost Savings Example:
 * - Simple greeting: Cheapest available model instead of expensive one
 * - Can save 30-90% on simple queries!
 *
 * Strategy (Score-Based):
 * - Uses a scoring system instead of simple pattern matching
 * - Considers: message length, conversation depth, technical keywords, code detection
 * - Score <= -1: simple, Score >= 2: complex, otherwise: medium
 *
 * @module modules/2bot-ai-provider/model-router
 */

import { logger } from "@/lib/logger";
import type { AICapability } from "./ai-capabilities";
import {
    getAvailableModels,
    getCheapestModel,
    getModelIfAvailable,
    isModelAvailable,
} from "./provider-config";
import type { ModelInfo, TextGenerationMessage } from "./types";

const log = logger.child({ module: "model-router" });

// Query complexity levels
export type QueryComplexity = "simple" | "medium" | "complex";

// ===========================================
// Scoring-Based Classification
// ===========================================

// Simple/greeting patterns (reduce score by -2)
const GREETING_PATTERNS = /^(hi|hello|hey|salom|привет|здравствуй|assalomu|good\s*(morning|afternoon|evening)|thanks|thank you|bye|goodbye|see you|rahmat|спасибо|пока|yes|no|ok|okay|sure|yep|nope|ha|yo'q|да|нет)[\s!?.]*$/i;

// Code detection patterns (increase score by +2)
const CODE_PATTERNS = /```[\s\S]*```|\b(function|class|const |let |var |def |import |export |async |await |return )\b/;

// Technical/complex keyword patterns (increase score by +2)
const TECHNICAL_PATTERNS = /\b(implement|debug|analyze|compare|explain how|architecture|algorithm|refactor|optimize|investigate|comprehensive|detailed|step.?by.?step)\b/i;

// Content generation patterns (increase score by +1)
const CONTENT_PATTERNS = /\b(write|create|generate)\s+(an?\s+)?(article|essay|report|document|paper|code|function|script)\b/i;

/**
 * Classify query complexity using a scoring system
 * More accurate than simple pattern matching
 *
 * Scoring Logic:
 * - Greetings/simple responses: -2
 * - Very short messages (<30 chars): -1
 * - Medium length (30-100 chars): 0
 * - Long messages (>200 chars): +1
 * - Very long messages (>500 chars): +2
 * - Conversation depth (>5 messages): +1
 * - Code detection: +2
 * - Technical keywords: +2
 * - Content generation keywords: +1
 * - Multiple questions: +1
 * - Images/multimodal: +3 (immediately complex)
 *
 * Final: score <= -1 → simple, score >= 2 → complex, else → medium
 */
export function classifyQueryComplexity(
  messages: TextGenerationMessage[]
): QueryComplexity {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) return "medium";

  const content = lastUserMessage.content;
  let score = 0;
  const factors: string[] = []; // For debug logging

  // 🖼️ Images = complex (multimodal requires more processing)
  if (lastUserMessage.parts?.some(p => p.type === "image_url")) {
    log.debug({ factors: ["images"] }, "Message contains images - classified as COMPLEX");
    return "complex";
  }

  // 👋 Greetings/simple responses = -2
  if (GREETING_PATTERNS.test(content.trim())) {
    score -= 2;
    factors.push("greeting(-2)");
  }

  // 📏 Length factors
  if (content.length < 30) {
    score -= 1;
    factors.push("short(<30)(-1)");
  } else if (content.length > 500) {
    score += 2;
    factors.push("veryLong(>500)(+2)");
  } else if (content.length > 200) {
    score += 1;
    factors.push("long(>200)(+1)");
  }

  // 💬 Conversation depth - more context = potentially more complex
  const userMessageCount = messages.filter(m => m.role === "user").length;
  if (userMessageCount > 5) {
    score += 1;
    factors.push("deepConversation(+1)");
  }

  // 💻 Code detection = +2
  if (CODE_PATTERNS.test(content)) {
    score += 2;
    factors.push("code(+2)");
  }

  // 🔬 Technical keywords = +2
  if (TECHNICAL_PATTERNS.test(content)) {
    score += 2;
    factors.push("technical(+2)");
  }

  // 📝 Content generation = +1
  if (CONTENT_PATTERNS.test(content)) {
    score += 1;
    factors.push("contentGen(+1)");
  }

  // ❓ Multiple questions = +1
  const questionCount = (content.match(/\?/g) || []).length;
  if (questionCount > 1) {
    score += 1;
    factors.push("multiQuestion(+1)");
  }

  // Classify based on final score
  let complexity: QueryComplexity;
  if (score <= -1) {
    complexity = "simple";
  } else if (score >= 2) {
    complexity = "complex";
  } else {
    complexity = "medium";
  }

  log.debug(
    { score, factors, complexity, contentLength: content.length },
    `Query classified as ${complexity.toUpperCase()}`
  );

  return complexity;
}

/**
 * Get model by tier from available models
 */
function getModelByTier(
  capability: AICapability,
  preferredTier: number,
  provider?: string
): ModelInfo | undefined {
  let models = getAvailableModels(capability);

  // Filter by provider if specified
  if (provider) {
    models = models.filter((m) => m.provider === provider);
  }

  if (models.length === 0) return undefined;

  // Sort by tier
  models.sort((a, b) => (a.tier || 99) - (b.tier || 99));

  // Find model closest to preferred tier
  for (const model of models) {
    if ((model.tier || 99) >= preferredTier) {
      return model;
    }
  }

  // If no model at preferred tier, return highest available
  return models[models.length - 1];
}

/**
 * Get recommended model based on query complexity
 * ONLY returns models that are actually available!
 *
 * @param requestedModel - The model user requested (may override routing)
 * @param messages - The conversation messages
 * @param allowDowngrade - Whether to allow downgrading to cheaper model
 * @returns The recommended model ID (guaranteed to be available)
 */
export function getRecommendedModel(
  requestedModel: string,
  messages: TextGenerationMessage[],
  allowDowngrade: boolean = true
): string {
  // First, check if requested model is available
  if (!isModelAvailable(requestedModel)) {
    // Requested model not available - find alternative
    const cheapest = getCheapestModel("text-generation");
    if (!cheapest) {
      log.error("No text-generation models available! Check API key configuration.");
      throw new Error("No AI models available. Please contact support.");
    }

    log.warn(
      { requestedModel, fallback: cheapest.id },
      "Requested model not available, using fallback"
    );
    return cheapest.id;
  }

  // If user explicitly requested a specific model and no downgrade, honor it
  if (!allowDowngrade) {
    return requestedModel;
  }

  // Get the requested model info
  const requestedModelInfo = getModelIfAvailable(requestedModel);
  if (!requestedModelInfo) {
    const cheapest = getCheapestModel("text-generation");
    return cheapest?.id || requestedModel;
  }

  // Determine provider from requested model
  const provider = requestedModelInfo.provider;

  // Classify query complexity
  const complexity = classifyQueryComplexity(messages);

  // Map complexity to tier
  const tierMap: Record<QueryComplexity, number> = {
    simple: 1,
    medium: 2,
    complex: 3,
  };
  const targetTier = tierMap[complexity];

  // Get recommended model for this complexity (from same provider)
  const recommendedModel = getModelByTier("text-generation", targetTier, provider);

  if (!recommendedModel) {
    // No model at target tier, use requested
    return requestedModel;
  }

  // Only downgrade, never upgrade beyond what user requested
  const requestedTier = requestedModelInfo.tier || 99;
  const recommendedTier = recommendedModel.tier || 99;

  if (recommendedTier <= requestedTier) {
    log.info(
      {
        requested: requestedModel,
        recommended: recommendedModel.id,
        complexity,
        savings:
          requestedModel !== recommendedModel.id
            ? "Using cheaper model!"
            : "Same model",
      },
      "Model routing decision"
    );
    return recommendedModel.id;
  }

  // User requested a cheaper model than we'd recommend - use their choice
  return requestedModel;
}

/**
 * Validate that a model is available before use
 * Throws error if not available with helpful message
 */
export function validateModelAvailable(modelId: string): ModelInfo {
  const model = getModelIfAvailable(modelId);

  if (!model) {
    const available = getAvailableModels("text-generation");
    const availableIds = available.map((m) => m.id).join(", ");

    throw new Error(
      `Model "${modelId}" is not available. ` +
        (available.length > 0
          ? `Available models: ${availableIds}`
          : "No AI models are configured. Please contact support.")
    );
  }

  return model;
}

/**
 * Smart routing result with detailed info for logging
 */
export interface SmartRoutingResult {
  /** The model to use for the request */
  model: string;
  /** Whether the model was changed from the original request */
  wasRouted: boolean;
  /** The original requested model */
  originalModel: string;
  /** The query complexity classification */
  complexity: QueryComplexity;
  /** Reason for the routing decision */
  reason: string;
  /** Estimated savings percentage (if routed to cheaper model) */
  estimatedSavingsPercent?: number;
}

/**
 * Get recommended model with detailed routing information
 * Use this for improved logging visibility
 */
export function getSmartRoutingDecision(
  requestedModel: string,
  messages: TextGenerationMessage[],
  allowDowngrade: boolean = true
): SmartRoutingResult {
  // First, check if requested model is available
  if (!isModelAvailable(requestedModel)) {
    const cheapest = getCheapestModel("text-generation");
    if (!cheapest) {
      throw new Error("No AI models available. Please contact support.");
    }
    return {
      model: cheapest.id,
      wasRouted: true,
      originalModel: requestedModel,
      complexity: "medium",
      reason: `Model "${requestedModel}" unavailable, using fallback`,
    };
  }

  // If no downgrade allowed, return as-is
  if (!allowDowngrade) {
    return {
      model: requestedModel,
      wasRouted: false,
      originalModel: requestedModel,
      complexity: classifyQueryComplexity(messages),
      reason: "Smart routing disabled",
    };
  }

  // Get model info
  const requestedModelInfo = getModelIfAvailable(requestedModel);
  if (!requestedModelInfo) {
    const cheapest = getCheapestModel("text-generation");
    return {
      model: cheapest?.id || requestedModel,
      wasRouted: true,
      originalModel: requestedModel,
      complexity: "medium",
      reason: "Model info unavailable, using fallback",
    };
  }

  const provider = requestedModelInfo.provider;
  const complexity = classifyQueryComplexity(messages);

  const tierMap: Record<QueryComplexity, number> = {
    simple: 1,
    medium: 2,
    complex: 3,
  };
  const targetTier = tierMap[complexity];

  const recommendedModel = getModelByTier("text-generation", targetTier, provider);

  if (!recommendedModel) {
    return {
      model: requestedModel,
      wasRouted: false,
      originalModel: requestedModel,
      complexity,
      reason: `No tier ${targetTier} model available`,
    };
  }

  const requestedTier = requestedModelInfo.tier || 99;
  const recommendedTier = recommendedModel.tier || 99;

  if (recommendedTier <= requestedTier && recommendedModel.id !== requestedModel) {
    // Calculate estimated savings
    const requestedCost = (requestedModelInfo.creditsPerInputToken || 1) + (requestedModelInfo.creditsPerOutputToken || 1);
    const routedCost = (recommendedModel.creditsPerInputToken || 1) + (recommendedModel.creditsPerOutputToken || 1);
    const savingsPercent = requestedCost > 0 ? Math.round(((requestedCost - routedCost) / requestedCost) * 100) : 0;

    return {
      model: recommendedModel.id,
      wasRouted: true,
      originalModel: requestedModel,
      complexity,
      reason: `Query classified as ${complexity} - using cheaper model`,
      estimatedSavingsPercent: savingsPercent > 0 ? savingsPercent : undefined,
    };
  }

  return {
    model: requestedModel,
    wasRouted: false,
    originalModel: requestedModel,
    complexity,
    reason: complexity === "complex" 
      ? "Complex query - using requested model"
      : "Requested model is already optimal for this complexity",
  };
}

/**
 * Estimate cost savings from model routing
 */
export function estimateSavings(
  originalModel: string,
  routedModel: string,
  inputTokens: number,
  outputTokens: number
): {
  originalCost: number;
  routedCost: number;
  savings: number;
  savingsPercent: number;
} {
  const original = getModelIfAvailable(originalModel);
  const routed = getModelIfAvailable(routedModel);

  if (!original || !routed) {
    return { originalCost: 0, routedCost: 0, savings: 0, savingsPercent: 0 };
  }

  // Use credits as proxy for cost
  const originalInputCost = (original.creditsPerInputToken || 1) * inputTokens;
  const originalOutputCost = (original.creditsPerOutputToken || 1) * outputTokens;
  const originalCost = originalInputCost + originalOutputCost;

  const routedInputCost = (routed.creditsPerInputToken || 1) * inputTokens;
  const routedOutputCost = (routed.creditsPerOutputToken || 1) * outputTokens;
  const routedCost = routedInputCost + routedOutputCost;

  const savings = originalCost - routedCost;
  const savingsPercent = originalCost > 0 ? (savings / originalCost) * 100 : 0;

  return { originalCost, routedCost, savings, savingsPercent };
}
