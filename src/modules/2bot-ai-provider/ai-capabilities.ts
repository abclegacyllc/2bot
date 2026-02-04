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

// ===========================================
// Capability Types (Universal)
// ===========================================

/**
 * AI Capabilities - Universal naming that works across all providers
 *
 * This is the CANONICAL list of capabilities.
 * Use these for new code, APIs, and database storage.
 */
export type AICapability =
  // Text capabilities
  | "text-generation"      // Chat, completion (OpenAI chat, Anthropic messages)
  | "text-embedding"       // Vector embeddings (OpenAI embeddings, Cohere embed)

  // Image capabilities
  | "image-generation"     // Create images from text (DALL-E, Midjourney, SD)
  | "image-understanding"  // Analyze/describe images (GPT-4V, Claude Vision)

  // Audio/Speech capabilities
  | "speech-synthesis"     // Text-to-Speech / TTS (OpenAI TTS, ElevenLabs)
  | "speech-recognition"   // Speech-to-Text / STT / ASR (Whisper, Deepgram)

  // Video capabilities (future-ready)
  | "video-generation"     // Create videos (Sora, RunwayML)
  | "video-understanding"  // Analyze videos

  // Code capabilities (future-ready for specialized models)
  | "code-generation"      // Specialized code models (Codex, StarCoder)
  | "code-execution"       // Code interpreter, sandboxed execution

  // Agent capabilities (future-ready)
  | "tool-use"             // Function calling, MCP tools
  | "web-browsing"         // Web search, browsing
  | "file-processing";     // Document parsing, file manipulation

/**
 * Capability categories for grouping in UI
 */
export type AICapabilityCategory =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "code"
  | "agent";



// ===========================================
// Capability Metadata
// ===========================================

export interface CapabilityInfo {
  /** Canonical capability name */
  capability: AICapability;
  /** Human-readable display name */
  displayName: string;
  /** Short description */
  description: string;
  /** Category for grouping */
  category: AICapabilityCategory;
  /** Input type (what the capability accepts) */
  inputType: "text" | "image" | "audio" | "video" | "file" | "mixed";
  /** Output type (what the capability produces) */
  outputType: "text" | "image" | "audio" | "video" | "embedding" | "mixed";
  /** Whether this is commonly supported */
  commonlySupported: boolean;
}

/**
 * Metadata for all capabilities
 */
export const CAPABILITY_INFO: Record<AICapability, CapabilityInfo> = {
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
export function getCapabilityInfo(capability: AICapability): CapabilityInfo {
  return CAPABILITY_INFO[capability];
}

/**
 * Get all capabilities in a category
 * @param category - AICapabilityCategory
 * @returns Array of capabilities
 */
export function getCapabilitiesByCategory(category: AICapabilityCategory): AICapability[] {
  return Object.entries(CAPABILITY_INFO)
    .filter(([_, info]) => info.category === category)
    .map(([capability]) => capability as AICapability);
}

/**
 * Get commonly supported capabilities
 * @returns Array of commonly supported capabilities
 */
export function getCommonCapabilities(): AICapability[] {
  return Object.entries(CAPABILITY_INFO)
    .filter(([_, info]) => info.commonlySupported)
    .map(([capability]) => capability as AICapability);
}

/**
 * Check if a capability is valid
 * @param capability - String to check
 * @returns boolean
 */
export function isValidCapability(capability: string): capability is AICapability {
  return capability in CAPABILITY_INFO;
}

// ===========================================
// Provider Capability Support Matrix
// ===========================================

export type ProviderName = "openai" | "anthropic" | "google" | "azure" | "huggingface" | "local";

/**
 * Which capabilities each provider supports
 * This helps with routing and availability checks
 */
export const PROVIDER_CAPABILITIES: Record<ProviderName, AICapability[]> = {
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
export function providerSupportsCapability(
  provider: ProviderName,
  capability: AICapability
): boolean {
  return PROVIDER_CAPABILITIES[provider]?.includes(capability) ?? false;
}
