/**
 * 2Bot AI Provider Types
 *
 * Shared types for the 2Bot AI service.
 * This is 2Bot's own AI service (not BYOK).
 *
 * @module modules/2bot-ai-provider/types
 */

// Import canonical AICapability from single source of truth
import type { AICapability } from "./ai-capabilities";
export type { AICapability } from "./ai-capabilities";

// ===========================================
// Model Types
// ===========================================

/**
 * Known model IDs (for type hints, not exhaustive)
 * Models are dynamically discovered, so this is just for common ones
 */
export type TwoBotAIModel =
  // OpenAI Chat
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "o1"
  | "o1-mini"
  | "o3-mini"
  // Anthropic Chat
  | "claude-sonnet-4-20250514"
  | "claude-opus-4-20250514"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-haiku-20241022"
  | "claude-3-opus-20240229"
  | "claude-3-haiku-20240307"
  // Image
  | "dall-e-3"
  // TTS
  | "tts-1"
  | "tts-1-hd"
  // STT
  | "whisper-1"
  // Allow any string for dynamically discovered models
  | (string & {});

export type TwoBotAIProvider = "openai" | "anthropic";

// ===========================================
// Model Capabilities - What each model can do
// ===========================================

/**
 * Input types a model can accept
 */
export type ModelInputType = "text" | "image" | "audio" | "file" | "video";

/**
 * Output types a model can produce
 */
export type ModelOutputType = "text" | "image" | "audio" | "embedding";

/**
 * Capability levels (like OpenAI shows)
 */
export type CapabilityLevel = "none" | "low" | "medium" | "high" | "highest";

/**
 * Model capabilities configuration
 */
export interface ModelCapabilities {
  // What this model accepts as input
  inputTypes: ModelInputType[];
  // What this model produces as output
  outputTypes: ModelOutputType[];
  // Feature levels
  reasoning?: CapabilityLevel;
  speed?: CapabilityLevel;
  creativity?: CapabilityLevel;
  // Special abilities
  canGenerateImages?: boolean;
  canAnalyzeImages?: boolean; // Vision
  canTranscribeAudio?: boolean;
  canGenerateAudio?: boolean;
  supportsStreaming?: boolean;
  supportsFunctionCalling?: boolean;
  supportsJsonMode?: boolean;
}

// ===========================================
// Text Generation Types
// ===========================================

export interface TextGenerationMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
  /** Optional multimodal content parts (for vision/image analysis) */
  parts?: TextGenerationMessageContent[];
}

/**
 * Multimodal message content (text + images)
 */
export interface TextGenerationMessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string; // Base64 or URL
    detail?: "auto" | "low" | "high";
  };
}

export interface TextGenerationRequest {
  messages: TextGenerationMessage[];
  model: TwoBotAIModel;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  userId: string;
  /** Organization ID for org-level credit deduction */
  organizationId?: string;
  conversationId?: string;
  /** Enable smart routing to use cheaper models for simple queries (default: true) */
  smartRouting?: boolean;
}

export interface TextGenerationResponse {
  id: string;
  model: string;
  content: string;
  finishReason: "stop" | "length" | "content_filter" | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  creditsUsed: number;
  newBalance: number;
  cached?: boolean; // True if response came from cache (cost: $0.00)
}

export interface TextGenerationStreamChunk {
  id: string;
  delta: string;
  finishReason: "stop" | "length" | "content_filter" | null;
}

// ===========================================
// Image Generation Types
// ===========================================

export type ImageSize = "1024x1024" | "1792x1024" | "1024x1792";
export type ImageQuality = "standard" | "hd";
export type ImageStyle = "vivid" | "natural";

export interface ImageGenerationRequest {
  prompt: string;
  model?: "dall-e-3" | "dall-e-3-hd";
  size?: ImageSize;
  quality?: ImageQuality;
  style?: ImageStyle;
  n?: number;
  userId: string;
  /** Organization ID for org-level credit deduction */
  organizationId?: string;
}

export interface ImageGenerationResponse {
  id: string;
  images: Array<{
    url: string;
    revisedPrompt?: string;
  }>;
  model: string;
  creditsUsed: number;
  newBalance: number;
}

// ===========================================
// Speech Synthesis (TTS) Types
// ===========================================

export type SpeechSynthesisVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
export type SpeechSynthesisFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export interface SpeechSynthesisRequest {
  text: string;
  model?: "tts-1" | "tts-1-hd";
  voice?: SpeechSynthesisVoice;
  format?: SpeechSynthesisFormat;
  speed?: number; // 0.25 to 4.0
  userId: string;
  /** Organization ID for org-level credit deduction */
  organizationId?: string;
}

export interface SpeechSynthesisResponse {
  id: string;
  audioUrl: string;
  audioBase64?: string;
  format: SpeechSynthesisFormat;
  characterCount: number;
  creditsUsed: number;
  newBalance: number;
}

// ===========================================
// Speech Recognition (STT) Types
// ===========================================

export interface SpeechRecognitionRequest {
  audio: Buffer | string; // Buffer or base64
  model?: "whisper-1";
  language?: string; // ISO 639-1 code
  prompt?: string; // Optional context
  userId: string;
  /** Organization ID for org-level credit deduction */
  organizationId?: string;
}

export interface SpeechRecognitionResponse {
  id: string;
  text: string;
  language?: string;
  duration: number; // seconds
  creditsUsed: number;
  newBalance: number;
}

// ===========================================
// Model Info (Enhanced with Capabilities)
// ===========================================

export interface ModelInfo {
  id: TwoBotAIModel;
  name: string;
  provider: TwoBotAIProvider;
  /** AI capability (universal naming) */
  capability: AICapability;
  description: string;
  // Pricing (credits per unit)
  creditsPerInputToken?: number; // Per token
  creditsPerOutputToken?: number; // Per token
  creditsPerImage?: number;
  creditsPerChar?: number;
  creditsPerMinute?: number;
  // Limits
  maxTokens?: number;
  contextWindow?: number;
  // UI hints
  isDefault?: boolean;
  tier?: number; // 1=cheapest, 2=mid, 3=premium
  // Model capabilities
  capabilities?: ModelCapabilities;
  // Badge/label for UI (e.g., "NEW", "FAST", "BEST")
  badge?: string;
  // Deprecation notice
  deprecated?: boolean;
  deprecationMessage?: string;
}

// ===========================================
// Error Types
// ===========================================

export class TwoBotAIError extends Error {
  constructor(
    message: string,
    public code: TwoBotAIErrorCode,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TwoBotAIError";
  }
}

export type TwoBotAIErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "PLAN_LIMIT_EXCEEDED"
  | "WALLET_NOT_FOUND"
  | "RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "CONTENT_FILTERED"
  | "INVALID_REQUEST"
  | "PROVIDER_ERROR"
  | "TIMEOUT";
