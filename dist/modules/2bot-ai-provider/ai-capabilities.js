"use strict";
/**
 * AI Capabilities - Single Source of Truth
 *
 * Universal naming for AI capabilities that works across all providers:
 * - OpenAI (GPT, DALL-E, Whisper, TTS)
 * - Anthropic (Claude)
 * - Google (Gemini)
 * - Open Source (Llama, Mistral, Stable Diffusion)
 * - Future providers
 *
 * Naming Convention: {domain}-{action}
 * - domain: text, image, speech, video, code
 * - action: generation, understanding, embedding, etc.
 *
 * @module modules/2bot-ai-provider/ai-capabilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVIDER_CAPABILITIES = exports.CAPABILITY_INFO = void 0;
exports.getCapabilityInfo = getCapabilityInfo;
exports.getCapabilitiesByCategory = getCapabilitiesByCategory;
exports.getCommonCapabilities = getCommonCapabilities;
exports.isValidCapability = isValidCapability;
exports.providerSupportsCapability = providerSupportsCapability;
/**
 * Metadata for all capabilities
 */
exports.CAPABILITY_INFO = {
    "text-generation": {
        capability: "text-generation",
        displayName: "Text Generation",
        description: "Generate text responses, chat, and completions",
        category: "text",
        inputType: "text",
        outputType: "text",
        commonlySupported: true,
    },
    "text-embedding": {
        capability: "text-embedding",
        displayName: "Text Embedding",
        description: "Convert text to vector embeddings for search and similarity",
        category: "text",
        inputType: "text",
        outputType: "embedding",
        commonlySupported: true,
    },
    "image-generation": {
        capability: "image-generation",
        displayName: "Image Generation",
        description: "Create images from text descriptions",
        category: "image",
        inputType: "text",
        outputType: "image",
        commonlySupported: true,
    },
    "image-understanding": {
        capability: "image-understanding",
        displayName: "Image Understanding",
        description: "Analyze and describe images (vision)",
        category: "image",
        inputType: "image",
        outputType: "text",
        commonlySupported: true,
    },
    "speech-synthesis": {
        capability: "speech-synthesis",
        displayName: "Speech Synthesis",
        description: "Convert text to spoken audio (TTS)",
        category: "audio",
        inputType: "text",
        outputType: "audio",
        commonlySupported: true,
    },
    "speech-recognition": {
        capability: "speech-recognition",
        displayName: "Speech Recognition",
        description: "Convert spoken audio to text (STT/ASR)",
        category: "audio",
        inputType: "audio",
        outputType: "text",
        commonlySupported: true,
    },
    "video-generation": {
        capability: "video-generation",
        displayName: "Video Generation",
        description: "Create videos from text or images",
        category: "video",
        inputType: "mixed",
        outputType: "video",
        commonlySupported: false,
    },
    "video-understanding": {
        capability: "video-understanding",
        displayName: "Video Understanding",
        description: "Analyze and describe video content",
        category: "video",
        inputType: "video",
        outputType: "text",
        commonlySupported: false,
    },
    "code-generation": {
        capability: "code-generation",
        displayName: "Code Generation",
        description: "Generate and explain code",
        category: "code",
        inputType: "text",
        outputType: "text",
        commonlySupported: true,
    },
    "code-execution": {
        capability: "code-execution",
        displayName: "Code Execution",
        description: "Execute code in a sandboxed environment",
        category: "code",
        inputType: "text",
        outputType: "mixed",
        commonlySupported: false,
    },
    "tool-use": {
        capability: "tool-use",
        displayName: "Tool Use",
        description: "Call functions and use external tools",
        category: "agent",
        inputType: "text",
        outputType: "mixed",
        commonlySupported: true,
    },
    "web-browsing": {
        capability: "web-browsing",
        displayName: "Web Browsing",
        description: "Search and browse the web",
        category: "agent",
        inputType: "text",
        outputType: "text",
        commonlySupported: false,
    },
    "file-processing": {
        capability: "file-processing",
        displayName: "File Processing",
        description: "Parse and process documents and files",
        category: "agent",
        inputType: "file",
        outputType: "text",
        commonlySupported: false,
    },
};
// ===========================================
// Helper Functions
// ===========================================
/**
 * Get capability info
 * @param capability - AICapability
 * @returns CapabilityInfo
 */
function getCapabilityInfo(capability) {
    return exports.CAPABILITY_INFO[capability];
}
/**
 * Get all capabilities in a category
 * @param category - AICapabilityCategory
 * @returns Array of capabilities
 */
function getCapabilitiesByCategory(category) {
    return Object.entries(exports.CAPABILITY_INFO)
        .filter(([_, info]) => info.category === category)
        .map(([capability]) => capability);
}
/**
 * Get commonly supported capabilities
 * @returns Array of commonly supported capabilities
 */
function getCommonCapabilities() {
    return Object.entries(exports.CAPABILITY_INFO)
        .filter(([_, info]) => info.commonlySupported)
        .map(([capability]) => capability);
}
/**
 * Check if a capability is valid
 * @param capability - String to check
 * @returns boolean
 */
function isValidCapability(capability) {
    return capability in exports.CAPABILITY_INFO;
}
/**
 * Which capabilities each provider supports
 * This helps with routing and availability checks
 */
exports.PROVIDER_CAPABILITIES = {
    openai: [
        "text-generation",
        "text-embedding",
        "image-generation",
        "image-understanding",
        "speech-synthesis",
        "speech-recognition",
        "tool-use",
    ],
    anthropic: [
        "text-generation",
        "image-understanding",
        "tool-use",
    ],
    google: [
        "text-generation",
        "text-embedding",
        "image-generation",
        "image-understanding",
        "speech-synthesis",
        "speech-recognition",
        "tool-use",
    ],
    azure: [
        "text-generation",
        "text-embedding",
        "image-generation",
        "image-understanding",
        "speech-synthesis",
        "speech-recognition",
        "tool-use",
    ],
    huggingface: [
        "text-generation",
        "text-embedding",
        "image-generation",
        "image-understanding",
        "speech-synthesis",
        "speech-recognition",
    ],
    local: [
        "text-generation",
        "text-embedding",
        // Local models vary widely
    ],
};
/**
 * Check if a provider supports a capability
 * @param provider - Provider name
 * @param capability - AICapability
 * @returns boolean
 */
function providerSupportsCapability(provider, capability) {
    return exports.PROVIDER_CAPABILITIES[provider]?.includes(capability) ?? false;
}
//# sourceMappingURL=ai-capabilities.js.map