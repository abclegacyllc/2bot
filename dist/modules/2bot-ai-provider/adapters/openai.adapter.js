"use strict";
/**
 * OpenAI Adapter for 2Bot AI
 *
 * Wraps OpenAI API for chat, image, TTS, and STT.
 * Uses 2Bot's API keys (not user BYOK keys).
 *
 * @module modules/2bot-ai-provider/adapters/openai.adapter
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiTextGeneration = openaiTextGeneration;
exports.openaiTextGenerationStream = openaiTextGenerationStream;
exports.openaiImageGeneration = openaiImageGeneration;
exports.openaiSpeechSynthesis = openaiSpeechSynthesis;
exports.openaiSpeechRecognition = openaiSpeechRecognition;
const logger_1 = require("@/lib/logger");
const openai_1 = __importDefault(require("openai"));
const types_1 = require("../types");
// ===========================================
// OpenAI Client Singleton
// ===========================================
let openaiClient = null;
function getOpenAIClient() {
    if (!openaiClient) {
        const apiKey = process.env.TWOBOT_OPENAI_API_KEY;
        if (!apiKey) {
            throw new types_1.TwoBotAIError("2Bot OpenAI API key not configured", "PROVIDER_ERROR", 500);
        }
        openaiClient = new openai_1.default({ apiKey });
    }
    return openaiClient;
}
// ===========================================
// Chat Completion
// ===========================================
/**
 * Convert ChatMessage to OpenAI format, handling multimodal content (vision)
 */
function formatMessageForOpenAI(m) {
    // If message has parts (multimodal), convert to OpenAI format
    if (m.parts && m.parts.length > 0) {
        const content = m.parts.map((part) => {
            if (part.type === "text") {
                return { type: "text", text: part.text || "" };
            }
            else if (part.type === "image_url" && part.image_url) {
                return {
                    type: "image_url",
                    image_url: {
                        url: part.image_url.url,
                        detail: part.image_url.detail || "auto",
                    },
                };
            }
            // Fallback for unknown types
            return { type: "text", text: "" };
        });
        return {
            role: m.role,
            content,
            ...(m.name && { name: m.name }),
        };
    }
    // Standard text message
    return {
        role: m.role,
        content: m.content,
        ...(m.name && { name: m.name }),
    };
}
async function openaiTextGeneration(request) {
    const client = getOpenAIClient();
    const log = logger_1.logger.child({ module: "2bot-ai-openai", capability: "text-generation" });
    // Check if any message has images (for logging/debugging)
    const hasImages = request.messages.some((m) => m.parts?.some((p) => p.type === "image_url"));
    try {
        const response = await client.chat.completions.create({
            model: request.model,
            messages: request.messages.map(formatMessageForOpenAI),
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 4096,
            stream: false,
        });
        const choice = response.choices[0];
        const usage = response.usage;
        log.info({
            model: request.model,
            inputTokens: usage?.prompt_tokens,
            outputTokens: usage?.completion_tokens,
            hasImages,
        }, "OpenAI chat completed");
        return {
            id: response.id,
            model: response.model,
            content: choice?.message?.content || "",
            finishReason: choice?.finish_reason,
            usage: {
                inputTokens: usage?.prompt_tokens || 0,
                outputTokens: usage?.completion_tokens || 0,
                totalTokens: usage?.total_tokens || 0,
            },
            // Credits will be calculated and set by the provider
            creditsUsed: 0,
            newBalance: 0,
        };
    }
    catch (error) {
        log.error({ error, hasImages }, "OpenAI chat error");
        throw mapOpenAIError(error);
    }
}
/**
 * Streaming chat completion
 * Yields chunks as they arrive from OpenAI
 */
async function* openaiTextGenerationStream(request) {
    const client = getOpenAIClient();
    const log = logger_1.logger.child({ module: "2bot-ai-openai", capability: "text-generation" });
    try {
        const stream = await client.chat.completions.create({
            model: request.model,
            messages: request.messages.map(formatMessageForOpenAI),
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 4096,
            stream: true,
            stream_options: { include_usage: true },
        });
        let totalContent = "";
        let usage = { inputTokens: 0, outputTokens: 0 };
        for await (const chunk of stream) {
            const choice = chunk.choices[0];
            const delta = choice?.delta?.content || "";
            if (delta) {
                totalContent += delta;
                yield {
                    id: chunk.id,
                    delta,
                    finishReason: choice?.finish_reason,
                };
            }
            // Final chunk with usage
            if (chunk.usage) {
                usage = {
                    inputTokens: chunk.usage.prompt_tokens,
                    outputTokens: chunk.usage.completion_tokens,
                };
            }
        }
        log.info({
            model: request.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            contentLength: totalContent.length,
        }, "OpenAI stream completed");
        return usage;
    }
    catch (error) {
        log.error({ error }, "OpenAI stream error");
        throw mapOpenAIError(error);
    }
}
// ===========================================
// Image Generation
// ===========================================
async function openaiImageGeneration(request) {
    const client = getOpenAIClient();
    const log = logger_1.logger.child({ module: "2bot-ai-openai", capability: "image-generation" });
    try {
        const isHD = request.model === "dall-e-3-hd" || request.quality === "hd";
        const response = await client.images.generate({
            model: "dall-e-3",
            prompt: request.prompt,
            size: request.size ?? "1024x1024",
            quality: isHD ? "hd" : "standard",
            style: request.style ?? "vivid",
            n: 1, // DALL-E 3 only supports n=1
            response_format: "url",
        });
        const images = (response.data || []).map((img) => ({
            url: img.url,
            revisedPrompt: img.revised_prompt,
        }));
        log.info({
            model: request.model || "dall-e-3",
            imageCount: images.length,
            size: request.size,
            quality: isHD ? "hd" : "standard",
        }, "OpenAI image generated");
        return {
            id: `img_${Date.now()}`,
            images,
            model: isHD ? "dall-e-3-hd" : "dall-e-3",
            creditsUsed: 0,
            newBalance: 0,
        };
    }
    catch (error) {
        log.error({ error }, "OpenAI image error");
        throw mapOpenAIError(error);
    }
}
// ===========================================
// Text-to-Speech
// ===========================================
async function openaiSpeechSynthesis(request) {
    const client = getOpenAIClient();
    const log = logger_1.logger.child({ module: "2bot-ai-openai", capability: "speech-synthesis" });
    try {
        const response = await client.audio.speech.create({
            model: request.model ?? "tts-1",
            input: request.text,
            voice: request.voice ?? "alloy",
            response_format: request.format ?? "mp3",
            speed: request.speed ?? 1.0,
        });
        // Get audio as buffer
        const arrayBuffer = await response.arrayBuffer();
        const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
        log.info({
            model: request.model || "tts-1",
            characterCount: request.text.length,
            voice: request.voice || "alloy",
            format: request.format || "mp3",
        }, "OpenAI TTS completed");
        return {
            id: `tts_${Date.now()}`,
            audioUrl: "", // Would be set after upload to storage
            audioBase64,
            format: request.format ?? "mp3",
            characterCount: request.text.length,
            creditsUsed: 0,
            newBalance: 0,
        };
    }
    catch (error) {
        log.error({ error }, "OpenAI TTS error");
        throw mapOpenAIError(error);
    }
}
// ===========================================
// Speech-to-Text
// ===========================================
async function openaiSpeechRecognition(request) {
    const client = getOpenAIClient();
    const log = logger_1.logger.child({ module: "2bot-ai-openai", capability: "speech-recognition" });
    try {
        // Convert base64 to File if needed - use Uint8Array for compatibility
        let audioFile;
        if (typeof request.audio === "string") {
            const buffer = Buffer.from(request.audio, "base64");
            const uint8Array = new Uint8Array(buffer);
            const blob = new Blob([uint8Array], { type: "audio/webm" });
            audioFile = new File([blob], "audio.webm", { type: "audio/webm" });
        }
        else {
            const uint8Array = new Uint8Array(request.audio);
            const blob = new Blob([uint8Array], { type: "audio/webm" });
            audioFile = new File([blob], "audio.webm", { type: "audio/webm" });
        }
        const response = await client.audio.transcriptions.create({
            model: request.model ?? "whisper-1",
            file: audioFile,
            language: request.language,
            prompt: request.prompt,
            response_format: "verbose_json",
        });
        const duration = response.duration || 0;
        log.info({
            model: request.model || "whisper-1",
            duration,
            language: response.language,
            textLength: response.text.length,
        }, "OpenAI STT completed");
        return {
            id: `stt_${Date.now()}`,
            text: response.text,
            language: response.language,
            duration,
            creditsUsed: 0,
            newBalance: 0,
        };
    }
    catch (error) {
        log.error({ error }, "OpenAI STT error");
        throw mapOpenAIError(error);
    }
}
// ===========================================
// Error Mapping
// ===========================================
function mapOpenAIError(error) {
    if (error instanceof openai_1.default.APIError) {
        switch (error.status) {
            case 429:
                return new types_1.TwoBotAIError("Rate limit exceeded. Please try again later.", "RATE_LIMITED", 429);
            case 400:
                if (error.message.includes("content_policy")) {
                    return new types_1.TwoBotAIError("Content was filtered due to policy violations.", "CONTENT_FILTERED", 400);
                }
                return new types_1.TwoBotAIError(error.message || "Invalid request", "INVALID_REQUEST", 400);
            case 503:
                return new types_1.TwoBotAIError("Model temporarily unavailable. Please try again.", "MODEL_UNAVAILABLE", 503);
            default:
                return new types_1.TwoBotAIError(error.message || "OpenAI API error", "PROVIDER_ERROR", error.status || 500);
        }
    }
    if (error instanceof Error && error.name === "AbortError") {
        return new types_1.TwoBotAIError("Request timed out", "TIMEOUT", 408);
    }
    return new types_1.TwoBotAIError(error instanceof Error ? error.message : "Unknown error", "PROVIDER_ERROR", 500);
}
//# sourceMappingURL=openai.adapter.js.map