/**
 * Cursor Module
 *
 * Multi-worker AI cursor system for the Bot Studio.
 * Workers (Assistant + Coder) collaborate via tool-calling to
 * build, edit, and manage plugins on behalf of the user.
 *
 * @module modules/cursor
 */

export const CURSOR_MODULE = "cursor" as const;

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
export { getWorkerTools } from "./cursor-worker-tools";
export type { WorkerToolDefinition } from "./cursor-worker-tools";
export { WORKER_META, WORKER_TOOL_NAMES, buildAssistantSystemPrompt, buildCoderSystemPrompt, routeToWorker } from "./cursor-workers";
export type { CursorWorkerMeta, CursorWorkerType, WorkerPromptContext } from "./cursor-workers";

// Worker runner (multi-worker agentic loop)
export { resolveUserAnswer, runWorkerStream } from "./cursor-worker-runner";
export type { WorkerStreamRequest } from "./cursor-worker-runner";

// Repo analyzer
export { analyzeRepo } from "./repo-analyzer.service";
export type { RepoAnalysis } from "./repo-analyzer.service";

