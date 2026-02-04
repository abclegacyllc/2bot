"use strict";
/**
 * Multimodal Multi-Modal Chat Types
 *
 * Enables a single chat interface that supports ALL AI capabilities:
 * - Text generation (GPT, Claude)
 * - Image generation (DALL-E, Midjourney)
 * - Image understanding (Vision)
 * - Speech synthesis (TTS)
 * - Speech recognition (STT)
 * - Video generation (Sora, RunwayML) - future
 * - Code execution - future
 * - Tool use / Function calling - future
 *
 * Similar to ChatGPT, Gemini, and Manus multimodal chat experiences.
 *
 * @module modules/2bot-ai-provider/multimodal-chat.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAPABILITY_DETECTION_PATTERNS = void 0;
/**
 * Patterns for detecting capabilities from text
 */
exports.CAPABILITY_DETECTION_PATTERNS = {
    "image-generation": [
        /\b(generate|create|make|draw|design|paint)\s+(an?\s+)?(image|picture|photo|illustration|artwork|art)/i,
        /\b(show\s+me|visualize|imagine)\b/i,
        /\b(dall-?e|midjourney|stable\s*diffusion)\b/i,
    ],
    "image-understanding": [
        /\b(what('s|\s+is)\s+(in\s+)?this\s+(image|picture|photo))/i,
        /\b(describe|analyze|explain)\s+(this\s+)?(image|picture|photo)/i,
        /\b(can\s+you\s+see|look\s+at)\b/i,
    ],
    "speech-synthesis": [
        /\b(read\s+(this\s+)?(aloud|out\s*loud)|say\s+this|speak)\b/i,
        /\b(text[\s-]*to[\s-]*speech|tts|voice\s+over)\b/i,
        /\b(convert|turn)\s+.*\s+to\s+(audio|speech|voice)\b/i,
    ],
    "speech-recognition": [
        /\b(transcribe|what\s+did\s+.*\s+say|what's\s+being\s+said)\b/i,
        /\b(speech[\s-]*to[\s-]*text|stt)\b/i,
    ],
    "video-generation": [
        /\b(generate|create|make)\s+(a\s+)?video\b/i,
        /\b(sora|runway)\b/i,
    ],
    "code-generation": [
        /\b(write|create|generate)\s+(the\s+)?(code|script|function|class)\b/i,
        /\b(implement|code\s+this)\b/i,
    ],
    "code-execution": [
        /\b(run|execute|test)\s+(this\s+)?(code|script)\b/i,
    ],
    "text-generation": [
        // Default - matches most text requests
        /./,
    ],
    "text-embedding": [],
    "video-understanding": [],
    "tool-use": [],
    "web-browsing": [
        /\b(search|browse|look\s+up|find\s+online)\b/i,
    ],
    "file-processing": [
        /\b(read|parse|process|extract\s+from)\s+(this\s+)?(file|document|pdf)\b/i,
    ],
};
//# sourceMappingURL=multimodal-chat.types.js.map