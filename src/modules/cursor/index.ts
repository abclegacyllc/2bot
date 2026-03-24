/**
 * Cursor Module
 *
 * Server-side module for the AI visual cursor action system.
 * Handles executing platform actions (create gateway, install plugin, etc.)
 * on behalf of the cursor brain (frontend).
 *
 * @module modules/cursor
 */

export const CURSOR_MODULE = "cursor" as const;

// Types
export type { CursorActionBody, GeneratedMultiFilePlugin, GeneratedPlugin } from "./cursor.types";

// Service
export { cursorService } from "./cursor.service";

// Code Generation
export {
    FALLBACK_PLUGIN_CODE,
    autoDetectConfigSchema,
    extractConfigDefaults,
    generateMultiFilePlugin,
    generatePluginCode,
    humanize
} from "./cursor-codegen.service";

// Code Editing
export { editPluginCode } from "./cursor-edit.service";
export type { EditedPlugin } from "./cursor-edit.service";

// Agent (multi-file tool loop)
export { restartPluginAfterAgent, runAgentLoop } from "./cursor-agent.service";
export type { AgentResult } from "./cursor-agent.service";

// Agent streaming event types
export type {
    CursorAgentCodePreview,
    CursorAgentDone,
    CursorAgentError, CursorAgentEvent, CursorAgentToolStart,
    CursorAskUserEvent,
    CursorWorkerStartEvent,
    CursorWorkerSwitchEvent,
    ToolStartMeta
} from "./cursor-agent.types";

// Multi-worker system
export { getToolDefinition, getWorkerTools, isWorkerTool } from "./cursor-worker-tools";
export type { WorkerToolDefinition } from "./cursor-worker-tools";
export { WORKER_META, WORKER_TOOL_NAMES, buildAssistantSystemPrompt, buildCoderSystemPrompt, routeToWorker } from "./cursor-workers";
export type { CursorWorkerMeta, CursorWorkerType, WorkerPromptContext } from "./cursor-workers";

// Worker runner (multi-worker agentic loop)
export { resolveUserAnswer, runWorkerStream } from "./cursor-worker-runner";
export type { WorkerStreamRequest } from "./cursor-worker-runner";

// Repo analyzer
export { analyzeRepo } from "./repo-analyzer.service";
export type { RepoAnalysis } from "./repo-analyzer.service";

