"use strict";
/**
 * 2Bot AI Routes
 *
 * API endpoints for 2Bot's AI service.
 * Uses platform API keys, users pay with credits.
 *
 * @module server/routes/2bot-ai
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.twoBotAIRouter = void 0;
const logger_1 = require("@/lib/logger");
const _2bot_ai_provider_1 = require("@/modules/2bot-ai-provider");
const errors_1 = require("@/shared/errors");
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
exports.twoBotAIRouter = (0, express_1.Router)();
// Multer for file uploads (STT)
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});
// Helper to get MIME type for audio formats
function getMimeType(format) {
    const mimeTypes = {
        mp3: "audio/mpeg",
        opus: "audio/opus",
        aac: "audio/aac",
        flac: "audio/flac",
        wav: "audio/wav",
    };
    return mimeTypes[format] || "audio/mpeg";
}
// All routes require authentication
exports.twoBotAIRouter.use(auth_1.requireAuth);
/**
 * GET /api/2bot-ai/models
 *
 * Get available AI models with their capabilities
 * Only returns models from configured providers!
 *
 * @query {string} [capability] - Filter by capability (text-generation, image-generation, speech-synthesis, speech-recognition, text-embedding, image-understanding)
 */
exports.twoBotAIRouter.get("/models", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const capability = req.query.capability;
    const models = _2bot_ai_provider_1.twoBotAIProvider.getModels(capability);
    const features = (0, _2bot_ai_provider_1.getAvailableFeatures)();
    const providers = (0, _2bot_ai_provider_1.getProvidersStatus)();
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
}));
/**
 * GET /api/2bot-ai/health
 *
 * Check health of all AI providers
 * Makes REAL API calls to verify keys work
 *
 * @query {boolean} [refresh] - Force re-check (default: use cache)
 */
exports.twoBotAIRouter.get("/health", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const refresh = req.query.refresh === "true";
    const log = logger_1.logger.child({ module: "2bot-ai", action: "health" });
    let results;
    if (refresh) {
        log.info("Running fresh provider health checks...");
        results = await (0, _2bot_ai_provider_1.checkAllProviders)();
    }
    else {
        // Use cached results
        const cached = (0, _2bot_ai_provider_1.getCachedHealthStatus)();
        if (cached.size === 0) {
            log.info("No cached health status, running checks...");
            results = await (0, _2bot_ai_provider_1.checkAllProviders)();
        }
        else {
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
}));
/**
 * POST /api/2bot-ai/chat
 *
 * Chat completion with AI models
 *
 * @body {ChatMessage[]} messages - Conversation messages
 * @body {string} [model] - Model to use (default: gpt-4o-mini)
 * @body {number} [temperature] - Creativity (0-2, default: 0.7)
 * @body {number} [maxTokens] - Max response tokens
 * @body {boolean} [stream] - Enable streaming response
 */
exports.twoBotAIRouter.post("/chat", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const log = logger_1.logger.child({ module: "2bot-ai-route", capability: "text-generation" });
    const userId = req.user.id;
    const body = req.body;
    // Validate messages
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        throw new errors_1.BadRequestError("Messages are required");
    }
    // Validate message format
    for (const msg of body.messages) {
        if (!msg.role || !["system", "user", "assistant"].includes(msg.role)) {
            throw new errors_1.BadRequestError("Invalid message role");
        }
        if (typeof msg.content !== "string" || msg.content.length === 0) {
            throw new errors_1.BadRequestError("Message content is required");
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
            const generator = _2bot_ai_provider_1.twoBotAIProvider.chatStream({
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
            let result;
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
        }
        catch (error) {
            const errorData = {
                type: "error",
                error: error instanceof _2bot_ai_provider_1.TwoBotAIError ? error.message : "An error occurred",
                code: error instanceof _2bot_ai_provider_1.TwoBotAIError ? error.code : "PROVIDER_ERROR",
            };
            res.write(`data: ${JSON.stringify(errorData)}\n\n`);
            res.end();
        }
        return;
    }
    // Non-streaming response
    try {
        const response = await _2bot_ai_provider_1.twoBotAIProvider.chat({
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
    }
    catch (error) {
        if (error instanceof _2bot_ai_provider_1.TwoBotAIError) {
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
}));
/**
 * POST /api/2bot-ai/image
 *
 * Generate images with DALL-E 3
 *
 * @body {string} prompt - Image description
 * @body {string} [model] - dall-e-3 or dall-e-3-hd
 * @body {string} [size] - 1024x1024, 1792x1024, 1024x1792
 * @body {string} [quality] - standard or hd
 * @body {string} [style] - vivid or natural
 */
exports.twoBotAIRouter.post("/image", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const log = logger_1.logger.child({ module: "2bot-ai-route", capability: "image-generation" });
    const userId = req.user.id;
    const body = req.body;
    // Validate prompt
    if (!body.prompt || typeof body.prompt !== "string" || body.prompt.length === 0) {
        throw new errors_1.BadRequestError("Prompt is required");
    }
    if (body.prompt.length > 4000) {
        throw new errors_1.BadRequestError("Prompt too long (max 4000 characters)");
    }
    try {
        const response = await _2bot_ai_provider_1.twoBotAIProvider.image({
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
    }
    catch (error) {
        if (error instanceof _2bot_ai_provider_1.TwoBotAIError) {
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
}));
/**
 * POST /api/2bot-ai/tts
 *
 * Text-to-speech conversion
 *
 * @body {string} text - Text to convert
 * @body {string} [model] - tts-1 or tts-1-hd
 * @body {string} [voice] - alloy, echo, fable, onyx, nova, shimmer
 * @body {string} [format] - mp3, opus, aac, flac, wav
 * @body {number} [speed] - 0.25 to 4.0
 */
exports.twoBotAIRouter.post("/tts", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const log = logger_1.logger.child({ module: "2bot-ai-route", capability: "speech-synthesis" });
    const userId = req.user.id;
    const body = req.body;
    // Validate text
    if (!body.text || typeof body.text !== "string" || body.text.length === 0) {
        throw new errors_1.BadRequestError("Text is required");
    }
    if (body.text.length > 4096) {
        throw new errors_1.BadRequestError("Text too long (max 4096 characters)");
    }
    try {
        const response = await _2bot_ai_provider_1.twoBotAIProvider.tts({
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
    }
    catch (error) {
        if (error instanceof _2bot_ai_provider_1.TwoBotAIError) {
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
}));
/**
 * POST /api/2bot-ai/stt
 *
 * Speech-to-text transcription
 * Accepts either multipart/form-data with audio file or JSON with base64 audio
 *
 * @body {File} audio - Audio file (form-data) or base64 string (JSON)
 * @body {string} [model] - whisper-1
 * @body {string} [language] - ISO 639-1 code
 * @body {string} [prompt] - Context hint
 */
exports.twoBotAIRouter.post("/stt", upload.single("audio"), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const log = logger_1.logger.child({ module: "2bot-ai-route", capability: "speech-recognition" });
    const userId = req.user.id;
    let audioBase64;
    // Handle file upload (FormData)
    if (req.file) {
        audioBase64 = req.file.buffer.toString("base64");
    }
    // Handle JSON body with base64
    else if (req.body?.audio && typeof req.body.audio === "string") {
        audioBase64 = req.body.audio;
        // Check base64 size (rough limit ~25MB)
        if (audioBase64.length > 35_000_000) {
            throw new errors_1.BadRequestError("Audio file too large (max ~25MB)");
        }
    }
    else {
        throw new errors_1.BadRequestError("Audio data is required (file upload or base64)");
    }
    try {
        const response = await _2bot_ai_provider_1.twoBotAIProvider.stt({
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
    }
    catch (error) {
        if (error instanceof _2bot_ai_provider_1.TwoBotAIError) {
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
}));
//# sourceMappingURL=2bot-ai.js.map