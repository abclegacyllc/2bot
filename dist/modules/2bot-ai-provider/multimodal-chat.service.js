"use strict";
/**
 * Multimodal Multi-Modal Chat Service
 *
 * A single chat interface that can:
 * 1. Accept any type of input (text, images, audio, files)
 * 2. Auto-detect which capabilities are needed
 * 3. Route to appropriate AI models
 * 4. Return multimodal responses with any content type
 *
 * Similar to ChatGPT, Gemini, Manus multimodal experiences.
 *
 * @module modules/2bot-ai-provider/multimodal-chat.service
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.multimodalChatService = void 0;
exports.detectCapabilities = detectCapabilities;
exports.getOrCreateConversation = getOrCreateConversation;
exports.multimodalChat = multimodalChat;
exports.multimodalChatStream = multimodalChatStream;
const logger_1 = require("@/lib/logger");
const nanoid_1 = require("nanoid");
const _2bot_ai_provider_1 = require("./2bot-ai.provider");
const log = logger_1.logger.child({ module: "multimodal-chat" });
// ===========================================
// In-Memory Conversation Store (MVP)
// TODO: Move to database for persistence
// ===========================================
const conversations = new Map();
// ===========================================
// Capability Detection
// ===========================================
/**
 * Detect which capabilities are needed from user input
 */
function detectCapabilities(input) {
    const detected = [];
    let primaryCapability = "text-generation";
    let confidence = 0.5;
    // Check for image understanding (if images provided)
    if (input.images && input.images.length > 0) {
        detected.push("image-understanding");
        primaryCapability = "image-understanding";
        confidence = 0.9;
    }
    // Check for speech recognition (if audio provided)
    if (input.audio) {
        detected.push("speech-recognition");
        primaryCapability = "speech-recognition";
        confidence = 0.95;
    }
    // Check text for capability keywords
    if (input.text) {
        const text = input.text.toLowerCase();
        // Image generation patterns
        if (/\b(generate|create|make|draw|design|paint)\s+(an?\s+)?(image|picture|photo|illustration)/i.test(text) ||
            /\b(show\s+me|visualize)\b/i.test(text)) {
            detected.push("image-generation");
            if (!input.images) {
                primaryCapability = "image-generation";
                confidence = 0.85;
            }
        }
        // TTS patterns
        if (/\b(read\s+(this\s+)?(aloud|out\s*loud)|say\s+this|speak|text[\s-]*to[\s-]*speech|tts)\b/i.test(text)) {
            detected.push("speech-synthesis");
            primaryCapability = "speech-synthesis";
            confidence = 0.9;
        }
        // Video generation patterns
        if (/\b(generate|create|make)\s+(a\s+)?video\b/i.test(text)) {
            detected.push("video-generation");
            primaryCapability = "video-generation";
            confidence = 0.85;
        }
        // Code execution patterns
        if (/\b(run|execute|test)\s+(this\s+)?(code|script)\b/i.test(text)) {
            detected.push("code-execution");
        }
    }
    // If user explicitly requested capabilities, use those
    if (input.requestedCapabilities && input.requestedCapabilities.length > 0) {
        const [primary, ...secondary] = input.requestedCapabilities;
        return {
            primaryCapability: primary,
            secondaryCapabilities: secondary,
            confidence: 1.0,
            reasoning: "User explicitly requested capabilities",
        };
    }
    // Default to text generation if nothing else detected
    if (detected.length === 0) {
        detected.push("text-generation");
    }
    return {
        primaryCapability,
        secondaryCapabilities: detected.filter((c) => c !== primaryCapability),
        confidence,
        reasoning: `Detected from ${input.images ? "images, " : ""}${input.audio ? "audio, " : ""}text patterns`,
    };
}
// ===========================================
// Conversation Management
// ===========================================
/**
 * Get or create a conversation
 */
function getOrCreateConversation(conversationId, userId, organizationId) {
    if (conversationId && conversations.has(conversationId)) {
        return conversations.get(conversationId);
    }
    const newConversation = {
        id: conversationId || (0, nanoid_1.nanoid)(),
        userId,
        organizationId,
        messages: [],
        enabledCapabilities: [
            "text-generation",
            "image-generation",
            "image-understanding",
            "speech-synthesis",
            "speech-recognition",
        ],
        defaultModels: {
            "text-generation": "gpt-4o-mini",
            "image-generation": "dall-e-3",
            "speech-synthesis": "tts-1",
            "speech-recognition": "whisper-1",
        },
        totalCreditsUsed: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {
            autoDetectCapabilities: true,
            smartRouting: true,
        },
    };
    conversations.set(newConversation.id, newConversation);
    return newConversation;
}
// ===========================================
// Content Block Builders
// ===========================================
function createTextBlock(text) {
    return {
        type: "text",
        id: (0, nanoid_1.nanoid)(),
        text,
    };
}
function createImageBlock(source, url, options) {
    return {
        type: "image",
        id: (0, nanoid_1.nanoid)(),
        source,
        url,
        ...options,
    };
}
// ===========================================
// Main Multimodal Chat Function
// ===========================================
/**
 * Process a multimodal chat request
 *
 * This is the main entry point that:
 * 1. Detects capabilities needed
 * 2. Routes to appropriate handlers
 * 3. Combines results into multimodal response
 */
async function multimodalChat(request) {
    const { input, userId, organizationId, conversationId } = request;
    log.info({ userId, hasText: !!input.text, hasImages: !!input.images?.length }, "Processing multimodal chat");
    // Get or create conversation
    const conversation = getOrCreateConversation(conversationId, userId, organizationId);
    // Detect capabilities
    const intent = detectCapabilities(input);
    log.info({ intent }, "Detected intent");
    // Create user message
    const userMessage = {
        id: (0, nanoid_1.nanoid)(),
        role: "user",
        content: [],
        createdAt: new Date(),
        status: "complete",
    };
    // Add user content blocks
    if (input.text) {
        userMessage.content.push(createTextBlock(input.text));
    }
    if (input.images) {
        for (const img of input.images) {
            userMessage.content.push(createImageBlock("uploaded", img.url || `data:${img.mimeType};base64,${img.base64}`));
        }
    }
    conversation.messages.push(userMessage);
    // Create assistant message
    const assistantMessage = {
        id: (0, nanoid_1.nanoid)(),
        role: "assistant",
        content: [],
        capabilitiesUsed: [],
        modelsUsed: [],
        creditsUsed: 0,
        createdAt: new Date(),
        status: "pending",
    };
    let totalCreditsUsed = 0;
    try {
        // Route to appropriate capability handlers
        switch (intent.primaryCapability) {
            case "text-generation":
            case "image-understanding": {
                // Use chat for text generation and vision
                const messages = buildChatMessages(conversation, input);
                const response = await _2bot_ai_provider_1.twoBotAIProvider.chat({
                    messages,
                    model: (conversation.defaultModels["text-generation"] || "gpt-4o-mini"),
                    userId,
                    organizationId,
                    conversationId: conversation.id,
                    smartRouting: conversation.settings.smartRouting,
                });
                assistantMessage.content.push(createTextBlock(response.content));
                assistantMessage.capabilitiesUsed?.push(intent.primaryCapability);
                assistantMessage.modelsUsed?.push(response.model);
                assistantMessage.tokenUsage = {
                    input: response.usage.inputTokens,
                    output: response.usage.outputTokens,
                    total: response.usage.totalTokens,
                };
                totalCreditsUsed += response.creditsUsed;
                break;
            }
            case "image-generation": {
                // Extract prompt from text
                const prompt = input.text || "A beautiful image";
                const response = await _2bot_ai_provider_1.twoBotAIProvider.image({
                    prompt,
                    model: "dall-e-3",
                    size: conversation.settings.imageDefaults?.size || "1024x1024",
                    quality: conversation.settings.imageDefaults?.quality || "standard",
                    style: conversation.settings.imageDefaults?.style || "vivid",
                    userId,
                    organizationId,
                });
                // Add generated images to response
                for (const img of response.images) {
                    assistantMessage.content.push(createImageBlock("generated", img.url, {
                        prompt,
                        revisedPrompt: img.revisedPrompt,
                    }));
                }
                // Add text explaining the generation
                if (response.images[0]?.revisedPrompt) {
                    assistantMessage.content.push(createTextBlock(`I generated an image based on your request. The prompt I used was: "${response.images[0].revisedPrompt}"`));
                }
                assistantMessage.capabilitiesUsed?.push("image-generation");
                assistantMessage.modelsUsed?.push(response.model);
                totalCreditsUsed += response.creditsUsed;
                break;
            }
            case "speech-synthesis": {
                // Extract text to speak
                const textToSpeak = input.text || "Hello, this is a test.";
                const response = await _2bot_ai_provider_1.twoBotAIProvider.tts({
                    text: textToSpeak,
                    model: "tts-1",
                    voice: conversation.settings.ttsDefaults?.voice || "alloy",
                    speed: conversation.settings.ttsDefaults?.speed || 1.0,
                    userId,
                    organizationId,
                });
                assistantMessage.content.push({
                    type: "audio",
                    id: (0, nanoid_1.nanoid)(),
                    source: "generated",
                    url: response.audioUrl,
                    base64: response.audioBase64,
                    mimeType: "audio/mp3",
                    transcript: textToSpeak,
                });
                assistantMessage.content.push(createTextBlock(`I've converted your text to speech. You can play it above.`));
                assistantMessage.capabilitiesUsed?.push("speech-synthesis");
                assistantMessage.modelsUsed?.push("tts-1");
                totalCreditsUsed += response.creditsUsed;
                break;
            }
            case "speech-recognition": {
                if (!input.audio) {
                    throw new Error("No audio provided for speech recognition");
                }
                // STT expects audio as Buffer or base64 string
                const audioData = input.audio.base64 || input.audio.url || "";
                const response = await _2bot_ai_provider_1.twoBotAIProvider.stt({
                    audio: audioData,
                    model: "whisper-1",
                    userId,
                    organizationId,
                });
                assistantMessage.content.push({
                    type: "audio",
                    id: (0, nanoid_1.nanoid)(),
                    source: "uploaded",
                    url: input.audio.url,
                    base64: input.audio.base64,
                    transcript: response.text,
                });
                assistantMessage.content.push(createTextBlock(`Here's the transcription of your audio:\n\n"${response.text}"`));
                assistantMessage.capabilitiesUsed?.push("speech-recognition");
                assistantMessage.modelsUsed?.push("whisper-1");
                totalCreditsUsed += response.creditsUsed;
                break;
            }
            case "video-generation": {
                // Video generation not yet available
                assistantMessage.content.push(createTextBlock("Video generation is coming soon! This capability will be available when providers like OpenAI Sora become publicly available."));
                assistantMessage.capabilitiesUsed?.push("video-generation");
                break;
            }
            default: {
                // Fallback to text generation
                const messages = buildChatMessages(conversation, input);
                const response = await _2bot_ai_provider_1.twoBotAIProvider.chat({
                    messages,
                    model: "gpt-4o-mini",
                    userId,
                    organizationId,
                });
                assistantMessage.content.push(createTextBlock(response.content));
                totalCreditsUsed += response.creditsUsed;
            }
        }
        // Handle secondary capabilities (e.g., generate image AND explain)
        // TODO: Implement chaining for multiple capabilities
        assistantMessage.creditsUsed = totalCreditsUsed;
        assistantMessage.status = "complete";
    }
    catch (error) {
        log.error({ error }, "Error in multimodal chat");
        assistantMessage.content.push({
            type: "error",
            id: (0, nanoid_1.nanoid)(),
            code: "PROCESSING_ERROR",
            message: error instanceof Error ? error.message : "An error occurred",
        });
        assistantMessage.status = "error";
    }
    // Add assistant message to conversation
    conversation.messages.push(assistantMessage);
    conversation.totalCreditsUsed += totalCreditsUsed;
    conversation.updatedAt = new Date();
    // Get actual balance from credit service
    let newBalance = 0;
    try {
        const { twoBotAICreditService } = await Promise.resolve().then(() => __importStar(require("@/modules/credits")));
        if (organizationId) {
            const balanceInfo = await twoBotAICreditService.getOrgBalance(organizationId);
            newBalance = balanceInfo?.balance ?? 0;
        }
        else {
            const balanceInfo = await twoBotAICreditService.getPersonalBalance(userId);
            newBalance = balanceInfo?.balance ?? 0;
        }
    }
    catch (err) {
        log.warn({ err }, "Failed to get balance after multimodal chat");
    }
    return {
        conversationId: conversation.id,
        message: assistantMessage,
        capabilitiesUsed: assistantMessage.capabilitiesUsed || [],
        creditsUsed: totalCreditsUsed,
        newBalance,
    };
}
/**
 * Build chat messages from conversation history
 */
function buildChatMessages(conversation, currentInput) {
    const messages = [];
    // Add system prompt if set
    if (conversation.systemPrompt) {
        messages.push({
            role: "system",
            content: conversation.systemPrompt,
        });
    }
    // Add conversation history (last N messages for context)
    const historyLimit = 20;
    const recentMessages = conversation.messages.slice(-historyLimit);
    for (const msg of recentMessages) {
        // Convert MultimodalMessage to ChatMessage
        const textContent = msg.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n");
        const imageBlocks = msg.content.filter((b) => b.type === "image");
        if (imageBlocks.length > 0) {
            // Multi-modal message with images
            messages.push({
                role: msg.role,
                content: textContent,
                parts: [
                    { type: "text", text: textContent },
                    ...imageBlocks.map((img) => ({
                        type: "image_url",
                        image_url: { url: img.url || "" },
                    })),
                ],
            });
        }
        else if (textContent) {
            messages.push({
                role: msg.role,
                content: textContent,
            });
        }
    }
    // Add current user input (if not already in history)
    if (currentInput.text) {
        const currentImages = currentInput.images || [];
        if (currentImages.length > 0) {
            messages.push({
                role: "user",
                content: currentInput.text,
                parts: [
                    { type: "text", text: currentInput.text },
                    ...currentImages.map((img) => ({
                        type: "image_url",
                        image_url: { url: img.url || `data:${img.mimeType};base64,${img.base64}` },
                    })),
                ],
            });
        }
        else {
            messages.push({
                role: "user",
                content: currentInput.text,
            });
        }
    }
    return messages;
}
/**
 * Stream a multimodal chat response
 * TODO: Implement streaming support
 */
async function* multimodalChatStream(request) {
    // For now, just yield the complete response
    const response = await multimodalChat(request);
    // Yield text content character by character (simulated streaming)
    for (const block of response.message.content) {
        if (block.type === "text") {
            yield {
                type: "text",
                textDelta: block.text,
            };
        }
        else {
            yield {
                type: block.type,
                content: block,
            };
        }
    }
    yield {
        type: "done",
        response,
    };
}
// ===========================================
// Exports
// ===========================================
exports.multimodalChatService = {
    chat: multimodalChat,
    chatStream: multimodalChatStream,
    detectCapabilities,
    getOrCreateConversation,
};
//# sourceMappingURL=multimodal-chat.service.js.map