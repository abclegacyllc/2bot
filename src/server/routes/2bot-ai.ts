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
  checkAllProviders,
  getAvailableFeatures,
  getCachedHealthStatus,
  getProvidersStatus,
  TwoBotAIError,
  twoBotAIProvider,
  type AICapability,
  type ImageQuality,
  type ImageSize,
  type ImageStyle,
  type SpeechSynthesisFormat,
  type SpeechSynthesisVoice,
  type TextGenerationMessage,
  type TwoBotAIModel
} from "@/modules/2bot-ai-provider";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
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
  model?: TwoBotAIModel;
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
}

/**
 * POST /api/2bot-ai/text-generation
 *
 * Text generation with AI models
 *
 * @body {TextGenerationMessage[]} messages - Conversation messages
 * @body {string} [model] - Model to use (default: gpt-4o-mini)
 * @body {number} [temperature] - Creativity (0-2, default: 0.7)
 * @body {number} [maxTokens] - Max response tokens
 * @body {boolean} [stream] - Enable streaming response
 */
twoBotAIRouter.post(
  "/text-generation",
  asyncHandler(async (req: Request, res: Response<ApiResponse<TextGenerationResponseData>>) => {
    const log = logger.child({ module: "2bot-ai-route", capability: "text-generation" });
    const userId = req.user!.id;
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

    const model = body.model || "gpt-4o-mini";

    // Streaming response
    if (body.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      try {
        const generator = twoBotAIProvider.textGenerationStream({
          messages: body.messages,
          model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
          stream: true,
          userId,
          conversationId: body.conversationId,
          smartRouting: body.smartRouting,
          organizationId: body.organizationId,
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
        res.write(`data: ${JSON.stringify({ type: "done", ...finalResponse })}\n\n`);
        res.end();

        log.info({
          userId,
          model,
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
        messages: body.messages,
        model,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        stream: false,
        userId,
        conversationId: body.conversationId,
        smartRouting: body.smartRouting,
        organizationId: body.organizationId,
      });

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
// POST /api/2bot-ai/image-generation
// ===========================================

interface ImageGenerationRequestBody {
  prompt: string;
  model?: "dall-e-3" | "dall-e-3-hd";
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
    const userId = req.user!.id;
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
  model?: "tts-1" | "tts-1-hd";
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
    const userId = req.user!.id;
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
        model: body.model || "tts-1",
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
    const userId = req.user!.id;

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
        model: req.body?.model || "whisper-1",
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
