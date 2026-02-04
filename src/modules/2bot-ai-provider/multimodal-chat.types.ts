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

import type { AICapability } from "./ai-capabilities";
import type { TwoBotAIModel } from "./types";

// ===========================================
// Multimodal Message Types
// ===========================================

/**
 * Content block types in a multimodal message
 * A single message can contain multiple content blocks
 */
export type ContentBlockType =
  | "text"           // Plain text
  | "image"          // Generated or uploaded image
  | "audio"          // Generated or uploaded audio
  | "video"          // Generated or uploaded video
  | "file"           // Uploaded file (PDF, etc.)
  | "code"           // Code block with language
  | "tool_use"       // Tool/function call
  | "tool_result"    // Tool/function result
  | "error";         // Error message

/**
 * Base content block
 */
interface BaseContentBlock {
  type: ContentBlockType;
  id?: string;  // Unique ID for this block
}

/**
 * Text content block
 */
export interface TextContentBlock extends BaseContentBlock {
  type: "text";
  text: string;
}

/**
 * Image content block (input or generated)
 */
export interface ImageContentBlock extends BaseContentBlock {
  type: "image";
  source: "generated" | "uploaded" | "url";
  url?: string;           // URL or data URI
  base64?: string;        // Base64 encoded data
  mimeType?: string;      // image/png, image/jpeg, etc.
  alt?: string;           // Alt text / description
  prompt?: string;        // Generation prompt (if generated)
  revisedPrompt?: string; // Revised prompt from AI
  width?: number;
  height?: number;
}

/**
 * Audio content block (input or generated)
 */
export interface AudioContentBlock extends BaseContentBlock {
  type: "audio";
  source: "generated" | "uploaded" | "url";
  url?: string;
  base64?: string;
  mimeType?: string;      // audio/mp3, audio/wav, etc.
  transcript?: string;    // Text transcript (from STT)
  durationSeconds?: number;
  voice?: string;         // Voice used (for TTS)
}

/**
 * Video content block (input or generated)
 */
export interface VideoContentBlock extends BaseContentBlock {
  type: "video";
  source: "generated" | "uploaded" | "url";
  url?: string;
  mimeType?: string;
  prompt?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
}

/**
 * File content block (for document processing)
 */
export interface FileContentBlock extends BaseContentBlock {
  type: "file";
  url?: string;
  base64?: string;
  mimeType: string;
  filename: string;
  sizeBytes?: number;
}

/**
 * Code content block
 */
export interface CodeContentBlock extends BaseContentBlock {
  type: "code";
  language: string;
  code: string;
  output?: string;        // Execution output (if executed)
  executionStatus?: "pending" | "running" | "success" | "error";
}

/**
 * Tool use content block (function calling)
 */
export interface ToolUseContentBlock extends BaseContentBlock {
  type: "tool_use";
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Tool result content block
 */
export interface ToolResultContentBlock extends BaseContentBlock {
  type: "tool_result";
  toolUseId: string;
  output: unknown;
  isError?: boolean;
}

/**
 * Error content block
 */
export interface ErrorContentBlock extends BaseContentBlock {
  type: "error";
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Union of all content block types
 */
export type ContentBlock =
  | TextContentBlock
  | ImageContentBlock
  | AudioContentBlock
  | VideoContentBlock
  | FileContentBlock
  | CodeContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock
  | ErrorContentBlock;

// ===========================================
// Multimodal Message
// ===========================================

/**
 * A multimodal chat message that can contain any type of content
 */
export interface MultimodalMessage {
  id: string;
  role: "user" | "assistant" | "system";
  
  /** Content blocks - a message can have multiple types */
  content: ContentBlock[];
  
  /** Capabilities used to generate this message */
  capabilitiesUsed?: AICapability[];
  
  /** Models used for generation */
  modelsUsed?: string[];
  
  /** Credits consumed by this message */
  creditsUsed?: number;
  
  /** Token usage (for text-based content) */
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  
  /** Timestamp */
  createdAt: Date;
  
  /** Processing status */
  status: "pending" | "streaming" | "complete" | "error";
  
  /** Metadata for UI/tracking */
  metadata?: Record<string, unknown>;
}

// ===========================================
// Conversation Types
// ===========================================

/**
 * A multimodal conversation/session
 */
export interface MultimodalConversation {
  id: string;
  userId: string;
  organizationId?: string;
  
  /** Conversation title (auto-generated or user-set) */
  title?: string;
  
  /** All messages in the conversation */
  messages: MultimodalMessage[];
  
  /** Enabled capabilities for this conversation */
  enabledCapabilities: AICapability[];
  
  /** Default models per capability */
  defaultModels: Partial<Record<AICapability, TwoBotAIModel>>;
  
  /** System prompt */
  systemPrompt?: string;
  
  /** Total credits used in this conversation */
  totalCreditsUsed: number;
  
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
  
  /** Settings */
  settings: ConversationSettings;
}

/**
 * Conversation settings
 */
export interface ConversationSettings {
  /** Auto-detect capabilities from user input */
  autoDetectCapabilities: boolean;
  
  /** Enable smart routing (cheaper models for simple queries) */
  smartRouting: boolean;
  
  /** Temperature for text generation */
  temperature?: number;
  
  /** Max tokens for responses */
  maxTokens?: number;
  
  /** Image generation defaults */
  imageDefaults?: {
    size?: "1024x1024" | "1792x1024" | "1024x1792";
    quality?: "standard" | "hd";
    style?: "vivid" | "natural";
  };
  
  /** TTS defaults */
  ttsDefaults?: {
    voice?: string;
    speed?: number;
  };
}

// ===========================================
// Request/Response Types
// ===========================================

/**
 * User input for the multimodal chat
 * Can request multiple capabilities in one message
 */
export interface MultimodalChatInput {
  /** Text message from user */
  text?: string;
  
  /** Images attached by user */
  images?: Array<{
    url?: string;
    base64?: string;
    mimeType?: string;
  }>;
  
  /** Audio attached by user (for STT) */
  audio?: {
    url?: string;
    base64?: string;
    mimeType?: string;
  };
  
  /** Files attached by user */
  files?: Array<{
    url?: string;
    base64?: string;
    mimeType: string;
    filename: string;
  }>;
  
  /** Explicit capability requests */
  requestedCapabilities?: AICapability[];
  
  /** Specific models to use */
  models?: Partial<Record<AICapability, TwoBotAIModel>>;
}

/**
 * Request to the multimodal chat service
 */
export interface MultimodalChatRequest {
  /** Conversation ID (creates new if not provided) */
  conversationId?: string;
  
  /** User input */
  input: MultimodalChatInput;
  
  /** User context */
  userId: string;
  organizationId?: string;
  
  /** Stream the response */
  stream?: boolean;
}

/**
 * Response from the multimodal chat service
 */
export interface MultimodalChatResponse {
  /** Conversation ID */
  conversationId: string;
  
  /** The assistant's response message */
  message: MultimodalMessage;
  
  /** Capabilities that were used */
  capabilitiesUsed: AICapability[];
  
  /** Total credits used for this response */
  creditsUsed: number;
  
  /** New credit balance */
  newBalance: number;
}

/**
 * Streaming chunk from multimodal chat
 */
export interface MultimodalChatStreamChunk {
  /** Type of content being streamed */
  type: "text" | "image" | "audio" | "status" | "done";
  
  /** For text streaming */
  textDelta?: string;
  
  /** For image/audio (sent when complete) */
  content?: ContentBlock;
  
  /** Status updates */
  status?: {
    capability: AICapability;
    stage: "started" | "processing" | "complete";
  };
  
  /** Final response (when type === "done") */
  response?: MultimodalChatResponse;
}

// ===========================================
// Capability Detection
// ===========================================

/**
 * Detected intent from user input
 */
export interface DetectedIntent {
  /** Primary capability needed */
  primaryCapability: AICapability;
  
  /** Secondary capabilities that might help */
  secondaryCapabilities: AICapability[];
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Reasoning for detection */
  reasoning?: string;
}

/**
 * Patterns for detecting capabilities from text
 */
export const CAPABILITY_DETECTION_PATTERNS: Record<AICapability, RegExp[]> = {
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
