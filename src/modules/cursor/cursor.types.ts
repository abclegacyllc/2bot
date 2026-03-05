/**
 * Cursor Module — Type Definitions
 *
 * Server-side types for the cursor action system.
 *
 * @module modules/cursor/cursor.types
 */

/**
 * Request body for the POST /cursor/action endpoint.
 * The cursor brain (frontend) sends this to execute real platform actions.
 */
export interface CursorActionBody {
  action: string;
  name?: string;
  type?: string;
  slug?: string;
  secrets?: Record<string, string>;
  pluginId?: string;
  gatewayId?: string;
  description?: string;
  code?: string;
  category?: string;
  /** Raw text for LLM classification (classify_intent action) */
  text?: string;
  /** Conversation history for design_plugin / chat_with_cursor multi-turn flows */
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Rich spec from design_plugin conversation — used by create_plugin for better code gen */
  spec?: string;
  /** Edit instruction for edit_plugin — describes what to change in the existing code */
  instruction?: string;
  /** Whether to generate a multi-file (directory) plugin instead of single-file */
  multiFile?: boolean;
  /** File map for multi-file plugins — relative path → content */
  files?: Record<string, string>;
  /** Entry file for multi-file plugins (defaults to "index.js") */
  entry?: string;
}

/**
 * Result of AI-generated plugin code + config schema.
 */
export interface GeneratedPlugin {
  code: string;
  configSchema: Record<string, unknown>;
  configDefaults: Record<string, unknown>;
}

/**
 * Result of AI-generated multi-file plugin.
 * Each key in `files` is a relative path (e.g. "index.js", "commands/help.js").
 */
export interface GeneratedMultiFilePlugin {
  /** Map of relative file paths → file contents */
  files: Record<string, string>;
  /** Entry point relative to plugin directory (default: "index.js") */
  entry: string;
  /** JSON Schema for user-configurable settings */
  configSchema: Record<string, unknown>;
  /** Default values for config fields */
  configDefaults: Record<string, unknown>;
}
