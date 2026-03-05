/**
 * 2Bot AI Routes
 *
 * API endpoints for 2Bot's AI service.
 * Uses platform API keys, users pay with credits.
 *
 * @module server/routes/2bot-ai
 */

import { logger } from "@/lib/logger";
import {
  agentService,
  clearSessionApprovals,
  getSessionActions,
  resolveApproval,
  restoreSession as restoreAgentSession,
  type AgentStreamEvent,
} from "@/modules/2bot-ai-agent";
import {
  checkAllProviders,
  classifyQueryComplexity,
  getAvailableFeatures,
  getCachedHealthStatus,
  getProvidersStatus,
  getRegistryEntry,
  getTwoBotAIModel,
  getTwoBotAIModelsByCapability,
  isTwoBotAIModelId,
  MODEL_REGISTRY,
  TwoBotAIError,
  twoBotAIProvider,
  type AICapability,
  type ImageQuality,
  type ImageSize,
  type ImageStyle,
  type SpeechSynthesisFormat,
  type SpeechSynthesisVoice,
  type TextGenerationMessage,
  type TwoBotAIModel,
  type TwoBotAIModelId,
  type TwoBotAIModelInfo
} from "@/modules/2bot-ai-provider";
import { isProviderConfigured } from "@/modules/2bot-ai-provider/provider-config";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { createServiceContext, type ServiceContext } from "@/shared/types/context";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
export const twoBotAIRouter = Router();

// Multer for file uploads (STT)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// Helper to get MIME type for audio formats
function getMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
  };
  return mimeTypes[format] || "audio/mpeg";
}

/**
 * Resolve a canonical registry model ID (e.g., "deepseek-v3") to the cheapest
 * configured provider's model ID (e.g., "deepseek-ai/DeepSeek-V3.1").
 * Returns undefined if the ID isn't a registry entry or has no configured providers.
 */
function resolveRegistryModelId(canonicalId: string): string | undefined {
  const entry = getRegistryEntry(canonicalId);
  if (!entry) return undefined;

  // Find cheapest configured provider
  let bestModelId: string | undefined;
  let bestCost = Infinity;

  for (const [provider, cost] of Object.entries(entry.providers) as Array<[string, { modelId: string; inputPer1M?: number; perImage?: number }]>) {
    if (!isProviderConfigured(provider as Parameters<typeof isProviderConfigured>[0])) continue;
    const effectiveCost = cost.inputPer1M ?? cost.perImage ?? 0;
    if (effectiveCost < bestCost) {
      bestCost = effectiveCost;
      bestModelId = cost.modelId;
    }
  }

  return bestModelId;
}

// All routes require authentication
twoBotAIRouter.use(requireAuth);

// ===========================================
// GET /api/2bot-ai/models
// ===========================================

interface ModelCapabilitiesResponse {
  inputTypes: string[];
  outputTypes: string[];
  reasoning?: string;
  speed?: string;
  creativity?: string;
  canGenerateImages?: boolean;
  canAnalyzeImages?: boolean;
  canTranscribeAudio?: boolean;
  canGenerateAudio?: boolean;
  supportsStreaming?: boolean;
  supportsFunctionCalling?: boolean;
  supportsJsonMode?: boolean;
}

interface ModelResponse {
  id: string;
  name: string;
  provider: string;
  capability: string;
  description: string;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
  creditsPerImage?: number;
  creditsPerChar?: number;
  creditsPerMinute?: number;
  maxTokens?: number;
  contextWindow?: number;
  isDefault?: boolean;
  tier?: number;
  badge?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  capabilities?: ModelCapabilitiesResponse;
}

interface ModelsResponse {
  models: ModelResponse[];
  features: {
    textGeneration: boolean;
    imageGeneration: boolean;
    imageAnalysis: boolean;
    speechSynthesis: boolean;
    speechRecognition: boolean;
  };
  providers: Array<{
    provider: string;
    configured: boolean;
    features: string[];
  }>;
}

/**
 * GET /api/2bot-ai/models
 *
 * Get available AI models with their capabilities
 * Only returns models from configured providers!
 *
 * @query {string} [capability] - Filter by capability (text-generation, image-generation, speech-synthesis, speech-recognition, text-embedding, image-understanding)
 */
twoBotAIRouter.get(
  "/models",
  asyncHandler(async (req: Request, res: Response<ApiResponse<ModelsResponse>>) => {
    const capability = req.query.capability as string | undefined;
    const models = twoBotAIProvider.getModels(capability as AICapability | undefined);
    const features = getAvailableFeatures();
    const providers = getProvidersStatus();

    res.json({
      success: true,
      data: {
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          capability: m.capability,
          description: m.description,
          creditsPerInputToken: m.creditsPerInputToken,
          creditsPerOutputToken: m.creditsPerOutputToken,
          creditsPerImage: m.creditsPerImage,
          creditsPerChar: m.creditsPerChar,
          creditsPerMinute: m.creditsPerMinute,
          maxTokens: m.maxTokens,
          contextWindow: m.contextWindow,
          isDefault: m.isDefault,
          tier: m.tier,
          badge: m.badge,
          deprecated: m.deprecated,
          deprecationMessage: m.deprecationMessage,
          capabilities: m.capabilities,
        })),
        features,
        providers: providers.map((p) => ({
          provider: p.provider,
          configured: p.configured,
          features: p.features,
        })),
      },
    });
  })
);

// ===========================================
// GET /api/2bot-ai/catalog
// ===========================================

interface TwoBotAIModelResponse {
  id: string;
  displayName: string;
  description: string;
  capability: string;
  tier: string;
  tierInfo: {
    displayName: string;
    description: string;
    badgeColor: string;
  };
  maxContextTokens: number;
  maxOutputTokens: number;
  isAvailable: boolean;
  features: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    jsonMode: boolean;
    systemMessage: boolean;
    multiTurn: boolean;
    reasoning: boolean;
    codeExecution: boolean;
  };
  tags: string[];
}

interface CatalogResponse {
  models: TwoBotAIModelResponse[];
  features: {
    textGeneration: boolean;
    imageGeneration: boolean;
    imageAnalysis: boolean;
    speechSynthesis: boolean;
    speechRecognition: boolean;
  };
}

/**
 * GET /api/2bot-ai/catalog
 *
 * Get available 2Bot AI models (user-facing, hides provider details)
 * This is the preferred endpoint for frontend model selection.
 *
 * @query {string} [capability] - Filter by capability (text-generation, image-generation, speech-synthesis, speech-recognition)
 */
twoBotAIRouter.get(
  "/catalog",
  asyncHandler(async (req: Request, res: Response<ApiResponse<CatalogResponse>>) => {
    const capability = req.query.capability as string | undefined;
    const models = twoBotAIProvider.getTwoBotAIModels(capability as AICapability | undefined);
    const features = getAvailableFeatures();

    res.json({
      success: true,
      data: {
        models: models.map((m: TwoBotAIModelInfo) => ({
          id: m.id,
          displayName: m.displayName,
          description: m.description,
          capability: m.capability,
          tier: m.tier,
          tierInfo: {
            displayName: m.tierInfo.displayName,
            description: m.tierInfo.description,
            badgeColor: m.tierInfo.badgeColor,
          },
          maxContextTokens: m.maxContextTokens,
          maxOutputTokens: m.maxOutputTokens,
          isAvailable: m.isAvailable,
          features: m.features,
          tags: m.tags,
        })),
        features,
      },
    });
  })
);

// ===========================================
// GET /api/2bot-ai/real-models
// ===========================================

interface RealModelResponse {
  id: string;
  displayName: string;
  author: string;
  capability: string;
  /** Price multiplier relative to baseline (1x = $3/M input). 0x = free tier. */
  priceMultiplier: number;
  providers: string[];
  isPreview?: boolean;
  deprecated?: boolean;
}

interface RealModelsResponse {
  models: RealModelResponse[];
}

/**
 * GET /api/2bot-ai/real-models
 *
 * Get real provider models from the model registry.
 * Returns actual model names (Claude Sonnet 4.6, GPT-4o, etc.)
 * with relative price multipliers for the frontend selector.
 *
 * @query {string} [capability] - Filter by capability (text-generation, image-generation, etc.)
 */
twoBotAIRouter.get(
  "/real-models",
  asyncHandler(async (req: Request, res: Response<ApiResponse<RealModelsResponse>>) => {
    const capability = req.query.capability as string | undefined;

    // Baseline: $3/M input tokens ≈ Claude Sonnet 4.6 / GPT-4o level = 1x
    const BASELINE_INPUT_PER_1M = 3;

    const models: RealModelResponse[] = [];

    for (const entry of MODEL_REGISTRY) {
      if (capability && entry.capability !== capability) continue;
      if (entry.deprecated) continue;

      // Only include models that have at least one configured provider
      const configuredProviders = (Object.keys(entry.providers) as Array<keyof typeof entry.providers>)
        .filter((p) => isProviderConfigured(p));
      if (configuredProviders.length === 0) continue;

      // Compute price multiplier from cheapest configured provider
      let priceMultiplier = 1;
      const costs = configuredProviders
        .map((p) => entry.providers[p])
        .filter(Boolean);

      if (entry.capability === "text-generation") {
        const cheapestInput = Math.min(...costs.map((c) => c!.inputPer1M ?? Infinity));
        priceMultiplier = cheapestInput === Infinity ? 1 : Math.round((cheapestInput / BASELINE_INPUT_PER_1M) * 100) / 100;
      } else if (entry.capability === "image-generation") {
        const cheapestImage = Math.min(...costs.map((c) => c!.perImage ?? Infinity));
        // Image baseline: $0.04 per image
        priceMultiplier = cheapestImage === Infinity ? 1 : Math.round((cheapestImage / 0.04) * 100) / 100;
      }

      const isPreview = entry.displayName.includes("Preview") || entry.badge === "NEW";

      models.push({
        id: entry.id,
        displayName: entry.displayName,
        author: entry.author,
        capability: entry.capability,
        priceMultiplier,
        providers: configuredProviders,
        isPreview,
        deprecated: entry.deprecated,
      });
    }

    // Sort: cheapest first within each author group
    models.sort((a, b) => a.priceMultiplier - b.priceMultiplier);

    res.json({
      success: true,
      data: { models },
    });
  })
);

// ===========================================
// GET /api/2bot-ai/health
// ===========================================

interface HealthResponse {
  healthy: boolean;
  providers: Array<{
    provider: string;
    healthy: boolean;
    lastChecked: string | null;
    error?: string;
    latencyMs?: number;
  }>;
  message: string;
}

/**
 * GET /api/2bot-ai/health
 *
 * Check health of all AI providers
 * Makes REAL API calls to verify keys work
 *
 * @query {boolean} [refresh] - Force re-check (default: use cache)
 */
twoBotAIRouter.get(
  "/health",
  asyncHandler(async (req: Request, res: Response<ApiResponse<HealthResponse>>) => {
    const refresh = req.query.refresh === "true";
    const log = logger.child({ module: "2bot-ai", action: "health" });

    let results;
    if (refresh) {
      log.info("Running fresh provider health checks...");
      results = await checkAllProviders();
    } else {
      // Use cached results
      const cached = getCachedHealthStatus();
      if (cached.size === 0) {
        log.info("No cached health status, running checks...");
        results = await checkAllProviders();
      } else {
        results = Array.from(cached.values());
      }
    }

    const healthyCount = results.filter((r) => r.healthy).length;
    const allHealthy = healthyCount === results.length && healthyCount > 0;

    res.json({
      success: true,
      data: {
        healthy: healthyCount > 0, // At least one provider works
        providers: results.map((r) => ({
          provider: r.provider,
          healthy: r.healthy,
          lastChecked: r.lastChecked?.toISOString() || null,
          error: r.error,
          latencyMs: r.latencyMs,
        })),
        message: healthyCount === 0
          ? "No AI providers are available. Check your API keys."
          : allHealthy
            ? `All ${healthyCount} provider(s) are healthy`
            : `${healthyCount} of ${results.length} provider(s) healthy`,
      },
    });
  })
);

// ===========================================
// POST /api/2bot-ai/text-generation
// ===========================================

interface TextGenerationRequestBody {
  messages: TextGenerationMessage[];
  model?: TwoBotAIModel | TwoBotAIModelId; // Accepts both legacy and 2Bot AI model IDs
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  conversationId?: string;
  smartRouting?: boolean; // Enable cost-optimized model routing
  organizationId?: string; // Use org credits if in org context
}

interface TextGenerationResponseData {
  id: string;
  model: string;
  content: string;
  finishReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  creditsUsed: number;
  newBalance: number;
  /** The 2Bot AI model ID if a catalog model was used */
  twobotAIModel?: string;
  /** The resolved provider model (internal, for debugging) */
  resolvedModel?: string;
}

/**
 * POST /api/2bot-ai/text-generation
 *
 * Text generation with AI models
 *
 * @body {TextGenerationMessage[]} messages - Conversation messages
 * @body {string} [model] - Model to use. Can be:
 *   - 2Bot AI model ID (e.g., "2bot-ai-text-pro") - RECOMMENDED
 *   - Legacy provider model (e.g., "gpt-4o-mini") - for backward compatibility
 *   Default: "2bot-ai-text-lite"
 * @body {number} [temperature] - Creativity (0-2, default: 0.7)
 * @body {number} [maxTokens] - Max response tokens
 * @body {boolean} [stream] - Enable streaming response
 */
twoBotAIRouter.post(
  "/text-generation",
  asyncHandler(async (req: Request, res: Response<ApiResponse<TextGenerationResponseData>>) => {
    const log = logger.child({ module: "2bot-ai-route", capability: "text-generation" });
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const routingPreference = (req.user.aiRoutingPreference as 'quality' | 'balanced' | 'cost') || 'balanced';
    const body = req.body as TextGenerationRequestBody;

    // Validate messages
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new BadRequestError("Messages are required");
    }

    // Validate message format
    for (const msg of body.messages) {
      if (!msg.role || !["system", "user", "assistant"].includes(msg.role)) {
        throw new BadRequestError("Invalid message role");
      }
      if (typeof msg.content !== "string" || msg.content.length === 0) {
        throw new BadRequestError("Message content is required");
      }
    }

    // Inject 2Bot AI system prompt server-side (security: don't trust client system prompts)
    const SYSTEM_PROMPT = "You are 2Bot AI, a helpful and intelligent assistant for the 2Bot Automation Platform. You are NOT Claude, NOT GPT, and NOT any other specific model. You are simply 2Bot AI. Always identify yourself as 2Bot AI if asked.";
    const messagesWithSystem: TextGenerationMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...body.messages.filter((m: TextGenerationMessage) => m.role !== "system"),
    ];

    // Resolve model: Support both 2Bot AI model IDs, "auto", and legacy provider models
    let model: TwoBotAIModel;
    let twobotAIModelId: TwoBotAIModelId | undefined;
    let requestedModel = body.model || "2bot-ai-text-lite";

    // 🧠 Auto Mode: analyze query complexity and pick the right 2Bot tier
    // Simple queries → free (zero cost), medium → pro (balanced), complex → ultra (best)
    if (requestedModel === "auto") {
      const complexity = classifyQueryComplexity(messagesWithSystem);
      const complexityToTier: Record<string, string> = {
        simple: 'free',
        medium: 'pro',
        complex: 'ultra',
      };
      const targetTier = complexityToTier[complexity] || 'pro';

      // Find the text model for this tier
      const textModels = getTwoBotAIModelsByCapability('text-generation')
        .filter(m => m.id.startsWith('2bot-ai-text-'));
      const targetModel = textModels.find(m => m.tier === targetTier);

      if (targetModel) {
        requestedModel = targetModel.id;
        log.info({
          complexity,
          resolvedModel: requestedModel,
          tier: targetModel.tier,
        }, `🧠 Auto Mode: query=${complexity} → tier=${targetTier}`);
      } else {
        // Fallback: use any available text model, preferring pro
        const fallback = textModels.find(m => m.tier === 'pro') || textModels[0];
        requestedModel = fallback?.id || '2bot-ai-text-lite';
        log.warn({ complexity, targetTier, fallbackModel: requestedModel },
          "Auto Mode: target tier not available, using fallback");
      }

      // Disable legacy smart routing — Auto Mode already picked the right tier
      // The 2Bot model catalog handles provider selection within the tier
      body.smartRouting = false;
    }

    if (isTwoBotAIModelId(requestedModel)) {
      // 2Bot AI model ID — pass directly to provider methods
      // Provider handles resolution + automatic failover across providers internally
      twobotAIModelId = requestedModel;
      model = requestedModel as TwoBotAIModel;
      log.info({ twobotAIModel: requestedModel }, "Using 2Bot AI model (provider will resolve with failover)");
    } else {
      // Try canonical registry ID resolution (e.g., "deepseek-v3" → "deepseek-ai/DeepSeek-V3.1")
      const resolvedProviderModel = resolveRegistryModelId(requestedModel);
      if (resolvedProviderModel) {
        model = resolvedProviderModel as TwoBotAIModel;
        log.info({ canonicalId: requestedModel, resolvedModel: resolvedProviderModel }, "Resolved registry model to provider");
      } else {
        // Direct provider model ID — use as-is
        model = requestedModel as TwoBotAIModel;
      }
    }

    // Streaming response
    if (body.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      try {
        const generator = twoBotAIProvider.textGenerationStream({
          messages: messagesWithSystem,
          model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
          stream: true,
          userId,
          conversationId: body.conversationId,
          smartRouting: body.smartRouting,
          organizationId: body.organizationId,
          routingPreference,
          feature: "chat",
        });

        let result: IteratorResult<
          { id: string; delta: string; finishReason: string | null },
          TextGenerationResponseData
        >;

        while (!(result = await generator.next()).done) {
          const chunk = result.value;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        // Send final message with usage
        const finalResponse = result.value;
        res.write(`data: ${JSON.stringify({ 
          type: "done", 
          ...finalResponse,
          twobotAIModel: twobotAIModelId,
          resolvedModel: twobotAIModelId ? finalResponse.model : undefined,
        })}\n\n`);
        res.end();

        log.info({
          userId,
          model: finalResponse.model,
          twobotAIModel: twobotAIModelId,
          creditsUsed: finalResponse.creditsUsed,
        }, "2Bot AI chat stream completed");
      } catch (error) {
        const errorData = {
          type: "error",
          error: error instanceof TwoBotAIError ? error.message : "An error occurred",
          code: error instanceof TwoBotAIError ? error.code : "PROVIDER_ERROR",
        };
        res.write(`data: ${JSON.stringify(errorData)}\n\n`);
        res.end();
      }
      return;
    }

    // Non-streaming response
    try {
      const response = await twoBotAIProvider.textGeneration({
        messages: messagesWithSystem,
        model,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        stream: false,
        userId,
        conversationId: body.conversationId,
        smartRouting: body.smartRouting,
        organizationId: body.organizationId,
        routingPreference,
        feature: "chat",
      });

      res.json({
        success: true,
        data: {
          ...response,
          twobotAIModel: twobotAIModelId,
          resolvedModel: twobotAIModelId ? response.model : undefined,
        },
      });
    } catch (error) {
      if (error instanceof TwoBotAIError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }
      throw error;
    }
  })
);

// ===========================================
// POST /api/2bot-ai/agent
// ===========================================

interface AgentRequestBody {
  /** User's task / prompt for the AI agent */
  prompt: string;
  /** Conversation history for context (optional) */
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  /** 2Bot AI model ID or provider model ID (must support function calling) */
  model?: TwoBotAIModel | TwoBotAIModelId;
  /** Workspace container ID the agent will operate on */
  workspaceId: string;
  /** Organization ID for org-level credits */
  organizationId?: string;
  /** Override agent config (optional) */
  config?: {
    maxIterations?: number;
    maxCreditsPerSession?: number;
    maxToolCallsPerIteration?: number;
    toolExecutionTimeoutMs?: number;
    sessionTimeoutMs?: number;
  };
}

/**
 * POST /api/2bot-ai/agent
 *
 * Start an AI agent session that can autonomously read/write files,
 * run commands, and interact with the workspace container.
 *
 * Streams SSE events back to the client:
 * - iteration_start: A new AI reasoning iteration began
 * - text_delta: Incremental text from the AI
 * - tool_use_start: AI is calling a tool
 * - tool_use_result: Tool execution result
 * - done: Agent session completed
 * - error: Agent session failed
 *
 * @body {string} prompt - Task description for the agent
 * @body {string} workspaceId - Workspace container ID
 * @body {string} [model] - Model to use (default: "2bot-ai-code-pro")
 * @body {Array} [conversationHistory] - Prior conversation for context
 * @body {string} [organizationId] - Org ID for org credit billing
 * @body {object} [config] - Override agent config (maxIterations, etc.)
 */
twoBotAIRouter.post(
  "/agent",
  asyncHandler(async (req: Request, res: Response) => {
    const log = logger.child({ module: "2bot-ai-route", capability: "agent" });
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const body = req.body as AgentRequestBody;

    // --- Validate prompt ---
    if (!body.prompt || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      throw new BadRequestError("Prompt is required");
    }
    if (body.prompt.length > 50_000) {
      throw new BadRequestError("Prompt too long (max 50,000 characters)");
    }

    // --- Validate workspaceId ---
    if (!body.workspaceId || typeof body.workspaceId !== "string") {
      throw new BadRequestError("workspaceId is required");
    }

    // --- Resolve model ---
    const requestedModel = (body.model || "2bot-ai-code-pro") as string;
    let model: TwoBotAIModel;

    if (isTwoBotAIModelId(requestedModel)) {
      // Validate the 2Bot model supports function calling
      const modelInfo = getTwoBotAIModel(requestedModel);
      if (modelInfo && !modelInfo.features.functionCalling) {
        throw new BadRequestError(
          `Model "${requestedModel}" does not support function calling (required for agent mode). Use a Pro or Ultra tier model.`
        );
      }
      model = requestedModel as TwoBotAIModel;
    } else {
      // Try canonical registry ID resolution
      const resolvedProviderModel = resolveRegistryModelId(requestedModel);
      model = (resolvedProviderModel || requestedModel) as TwoBotAIModel;
    }

    // --- Validate conversation history ---
    if (body.conversationHistory) {
      if (!Array.isArray(body.conversationHistory)) {
        throw new BadRequestError("conversationHistory must be an array");
      }
      for (const msg of body.conversationHistory) {
        if (!msg.role || !["user", "assistant"].includes(msg.role)) {
          throw new BadRequestError("conversationHistory entries must have role 'user' or 'assistant'");
        }
        if (typeof msg.content !== "string") {
          throw new BadRequestError("conversationHistory entries must have string content");
        }
      }
    }

    // --- Build ServiceContext for workspace access ---
    const ctx: ServiceContext = body.organizationId
      ? createServiceContext(
          {
            userId: req.user.id,
            role: req.user.role,
            plan: req.user.plan,
          },
          {
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"] as string | undefined,
            requestId: req.headers["x-request-id"] as string | undefined,
          },
          {
            contextType: "organization",
            organizationId: body.organizationId,
          },
        )
      : createServiceContext(
          {
            userId: req.user.id,
            role: req.user.role,
            plan: req.user.plan,
            activeContext: {
              type: "personal",
              plan: req.user.plan,
            },
          },
          {
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"] as string | undefined,
            requestId: req.headers["x-request-id"] as string | undefined,
          },
        );

    log.info(
      {
        userId,
        workspaceId: body.workspaceId,
        model,
        hasHistory: !!body.conversationHistory?.length,
        orgContext: !!body.organizationId,
      },
      "🤖 Agent session requested",
    );

    // --- Set up SSE streaming ---
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    try {
      const agentStream = agentService.runAgentStream(
        {
          prompt: body.prompt.trim(),
          conversationHistory: body.conversationHistory,
          model: model as string,
          workspaceId: body.workspaceId,
          userId,
          organizationId: body.organizationId,
          config: body.config,
        },
        ctx,
      );

      // Stream each event to the client
      for await (const event of agentStream) {
        // Check if client disconnected
        if (res.writableEnded) {
          log.warn({ userId }, "Client disconnected during agent session");
          break;
        }

        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      // End the stream
      if (!res.writableEnded) {
        res.end();
      }

      log.info({ userId, workspaceId: body.workspaceId }, "🤖 Agent SSE stream ended");
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred";
      const code = error instanceof TwoBotAIError ? error.code : "AGENT_ERROR";

      log.error({ userId, error: message }, "❌ Agent session failed");

      // Clean up pending approvals on error
      clearSessionApprovals(body.workspaceId);

      // Send error event if stream is still open
      if (!res.writableEnded) {
        const errorEvent: AgentStreamEvent = {
          type: "error",
          error: message,
          code,
        };
        res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
        res.end();
      }
    }
  })
);

// ===========================================
// POST /api/2bot-ai/agent/approve
// ===========================================

interface AgentApproveBody {
  sessionId: string;
  toolCallId: string;
  approved: boolean;
}

/**
 * POST /api/2bot-ai/agent/approve
 *
 * Approve or reject a pending tool execution (terminal commands,
 * package installs, git clones). The agent loop pauses until this
 * endpoint is called.
 *
 * @body {string} sessionId - Agent session ID
 * @body {string} toolCallId - Tool call ID to approve/reject
 * @body {boolean} approved - true to approve, false to reject
 */
twoBotAIRouter.post(
  "/agent/approve",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const log2 = logger.child({ module: "2bot-ai-route", capability: "agent-approve" });
    if (!req.user) throw new BadRequestError("Not authenticated");

    const body = req.body as AgentApproveBody;

    if (!body.sessionId || typeof body.sessionId !== "string") {
      throw new BadRequestError("sessionId is required");
    }
    if (!body.toolCallId || typeof body.toolCallId !== "string") {
      throw new BadRequestError("toolCallId is required");
    }
    if (typeof body.approved !== "boolean") {
      throw new BadRequestError("approved must be a boolean");
    }

    const resolved = resolveApproval(body.sessionId, body.toolCallId, {
      approved: body.approved,
    });

    if (!resolved) {
      log2.warn(
        { sessionId: body.sessionId, toolCallId: body.toolCallId },
        "No pending approval found (may have timed out)",
      );
      const response: ApiResponse = {
        success: false,
        error: { code: "APPROVAL_NOT_FOUND", message: "No pending approval found — it may have timed out" },
      };
      res.status(404).json(response);
      return;
    }

    log2.info(
      { sessionId: body.sessionId, toolCallId: body.toolCallId, approved: body.approved },
      `Agent tool ${body.approved ? "approved" : "rejected"} by user`,
    );

    const response: ApiResponse = { success: true };
    res.json(response);
  }),
);

// ===========================================
// POST /api/2bot-ai/agent/restore
// ===========================================

interface AgentRestoreBody {
  sessionId: string;
  /** Optional: restore a single action by ID. If omitted, restores all. */
  actionId?: string;
  /** Force restore even if conflicts detected */
  force?: boolean;
}

/**
 * POST /api/2bot-ai/agent/restore
 *
 * Undo AI file modifications from a session.
 * Restores files to their original state before the AI modified them.
 * Detects conflicts (if files were manually edited after AI changes).
 *
 * @body {string} sessionId - Agent session ID
 * @body {string} [actionId] - Specific action to undo (optional)
 * @body {boolean} [force] - Force restore even with conflicts
 */
twoBotAIRouter.post(
  "/agent/restore",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const log2 = logger.child({ module: "2bot-ai-route", capability: "agent-restore" });
    if (!req.user) throw new BadRequestError("Not authenticated");

    const body = req.body as AgentRestoreBody;

    if (!body.sessionId || typeof body.sessionId !== "string") {
      throw new BadRequestError("sessionId is required");
    }

    // Build service context
    const ctx: ServiceContext = createServiceContext(
      {
        userId: req.user.id,
        role: req.user.role,
        plan: req.user.plan,
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string | undefined,
        requestId: req.headers["x-request-id"] as string | undefined,
      },
    );

    // Check if session has any actions
    const actions = getSessionActions(body.sessionId);
    if (actions.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: { code: "NO_ACTIONS", message: "No AI actions found for this session" },
      };
      res.status(404).json(response);
      return;
    }

    log2.info(
      { sessionId: body.sessionId, actionCount: actions.length, force: body.force },
      "📝 Restoring AI actions",
    );

    const result = await restoreAgentSession(
      body.sessionId,
      ctx,
      body.force ?? false,
    );

    log2.info(
      {
        sessionId: body.sessionId,
        restored: result.restoredCount,
        conflicts: result.conflictCount,
      },
      "📝 Restore completed",
    );

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };
    res.json(response);
  }),
);

// ===========================================
// GET /api/2bot-ai/agent/actions
// ===========================================

/**
 * GET /api/2bot-ai/agent/actions?sessionId=xxx
 *
 * Get all tracked AI file actions for a session.
 * Returns the list of file modifications with before/after previews.
 */
twoBotAIRouter.get(
  "/agent/actions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      throw new BadRequestError("sessionId query parameter is required");
    }

    const actions = getSessionActions(sessionId);

    // Return actions with previews (strip full content for the API response)
    const actionSummaries = actions.map((a) => ({
      id: a.id,
      type: a.type,
      path: a.path,
      newPath: a.newPath,
      hasOriginalContent: a.originalContent !== null,
      hasNewContent: a.newContent !== null,
      contentTruncated: a.contentTruncated,
      toolCallId: a.toolCallId,
      timestamp: a.timestamp,
    }));

    const response: ApiResponse<typeof actionSummaries> = {
      success: true,
      data: actionSummaries,
    };
    res.json(response);
  }),
);

// ===========================================
// POST /api/2bot-ai/image-generation
// ===========================================

interface ImageGenerationRequestBody {
  prompt: string;
  /** 2Bot model ID (e.g. '2bot-ai-image-pro') or raw provider model ID */
  model?: string;
  size?: ImageSize;
  quality?: ImageQuality;
  style?: ImageStyle;
}

interface ImageGenerationResponseData {
  id: string;
  images: Array<{
    url: string;
    revisedPrompt?: string;
  }>;
  model: string;
  creditsUsed: number;
  newBalance: number;
}

/**
 * POST /api/2bot-ai/image-generation
 *
 * Generate images with DALL-E 3
 *
 * @body {string} prompt - Image description
 * @body {string} [model] - dall-e-3 or dall-e-3-hd
 * @body {string} [size] - 1024x1024, 1792x1024, 1024x1792
 * @body {string} [quality] - standard or hd
 * @body {string} [style] - vivid or natural
 */
twoBotAIRouter.post(
  "/image-generation",
  asyncHandler(async (req: Request, res: Response<ApiResponse<ImageGenerationResponseData>>) => {
    const log = logger.child({ module: "2bot-ai-route", capability: "image-generation" });
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const routingPreference = (req.user.aiRoutingPreference as 'quality' | 'balanced' | 'cost') || 'balanced';
    const body = req.body as ImageGenerationRequestBody;

    // Validate prompt
    if (!body.prompt || typeof body.prompt !== "string" || body.prompt.length === 0) {
      throw new BadRequestError("Prompt is required");
    }

    if (body.prompt.length > 4000) {
      throw new BadRequestError("Prompt too long (max 4000 characters)");
    }

    try {
      const response = await twoBotAIProvider.imageGeneration({
        prompt: body.prompt,
        model: body.model,
        size: body.size,
        quality: body.quality,
        style: body.style,
        userId,
        routingPreference,
      });

      log.info({
        userId,
        model: response.model,
        creditsUsed: response.creditsUsed,
      }, "2Bot AI image generated");

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      if (error instanceof TwoBotAIError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }
      throw error;
    }
  })
);

// ===========================================
// POST /api/2bot-ai/speech-synthesis
// ===========================================

interface SpeechSynthesisRequestBody {
  text: string;
  /** 2Bot model ID (e.g. '2bot-ai-voice-pro') or raw provider model ID */
  model?: string;
  voice?: SpeechSynthesisVoice;
  format?: SpeechSynthesisFormat;
  speed?: number;
}

interface SpeechSynthesisResponseData {
  id: string;
  audioUrl: string;
  audioBase64?: string;
  format: string;
  characterCount: number;
  creditsUsed: number;
  newBalance: number;
}

/**
 * POST /api/2bot-ai/speech-synthesis
 *
 * Text-to-speech conversion
 *
 * @body {string} text - Text to convert
 * @body {string} [model] - tts-1 or tts-1-hd
 * @body {string} [voice] - alloy, echo, fable, onyx, nova, shimmer
 * @body {string} [format] - mp3, opus, aac, flac, wav
 * @body {number} [speed] - 0.25 to 4.0
 */
twoBotAIRouter.post(
  "/speech-synthesis",
  asyncHandler(async (req: Request, res: Response<ApiResponse<SpeechSynthesisResponseData>>) => {
    const log = logger.child({ module: "2bot-ai-route", capability: "speech-synthesis" });
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const body = req.body as SpeechSynthesisRequestBody;

    // Validate text
    if (!body.text || typeof body.text !== "string" || body.text.length === 0) {
      throw new BadRequestError("Text is required");
    }

    if (body.text.length > 4096) {
      throw new BadRequestError("Text too long (max 4096 characters)");
    }

    try {
      const response = await twoBotAIProvider.speechSynthesis({
        text: body.text,
        model: body.model,
        voice: body.voice,
        format: body.format,
        speed: body.speed,
        userId,
      });

      log.info({
        userId,
        model: body.model || "(default)",
        characterCount: response.characterCount,
        creditsUsed: response.creditsUsed,
      }, "2Bot AI TTS completed");

      // Convert base64 to data URL for easy playback
      const mimeType = getMimeType(response.format);
      const audioUrl = `data:${mimeType};base64,${response.audioBase64}`;

      res.json({
        success: true,
        data: {
          id: response.id,
          audioUrl,
          format: response.format,
          characterCount: response.characterCount,
          creditsUsed: response.creditsUsed,
          newBalance: response.newBalance,
        },
      });
    } catch (error) {
      if (error instanceof TwoBotAIError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }
      throw error;
    }
  })
);

// ===========================================
// POST /api/2bot-ai/speech-recognition
// ===========================================

interface SpeechRecognitionResponseData {
  id: string;
  text: string;
  language?: string;
  duration: number;
  creditsUsed: number;
  newBalance: number;
}

/**
 * POST /api/2bot-ai/speech-recognition
 *
 * Speech-to-text transcription
 * Accepts either multipart/form-data with audio file or JSON with base64 audio
 *
 * @body {File} audio - Audio file (form-data) or base64 string (JSON)
 * @body {string} [model] - whisper-1
 * @body {string} [language] - ISO 639-1 code
 * @body {string} [prompt] - Context hint
 */
twoBotAIRouter.post(
  "/speech-recognition",
  upload.single("audio"),
  asyncHandler(async (req: Request, res: Response<ApiResponse<SpeechRecognitionResponseData>>) => {
    const log = logger.child({ module: "2bot-ai-route", capability: "speech-recognition" });
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;

    let audioBase64: string;

    // Handle file upload (FormData)
    if (req.file) {
      audioBase64 = req.file.buffer.toString("base64");
    } 
    // Handle JSON body with base64
    else if (req.body?.audio && typeof req.body.audio === "string") {
      audioBase64 = req.body.audio;
      // Check base64 size (rough limit ~25MB)
      if (audioBase64.length > 35_000_000) {
        throw new BadRequestError("Audio file too large (max ~25MB)");
      }
    } else {
      throw new BadRequestError("Audio data is required (file upload or base64)");
    }

    try {
      const response = await twoBotAIProvider.speechRecognition({
        audio: audioBase64,
        model: req.body?.model,
        language: req.body?.language,
        prompt: req.body?.prompt,
        userId,
      });

      log.info({
        userId,
        model: req.body?.model || "(default)",
        duration: response.duration,
        creditsUsed: response.creditsUsed,
      }, "2Bot AI STT completed");

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      if (error instanceof TwoBotAIError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }
      throw error;
    }
  })
);
