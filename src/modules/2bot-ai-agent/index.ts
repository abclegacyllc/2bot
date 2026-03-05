/**
 * 2Bot AI Agent Module
 *
 * Barrel export for the AI agent module.
 * The agent connects 2Bot AI's function calling capability
 * to workspace containers via the bridge agent protocol.
 *
 * @module modules/2bot-ai-agent
 */

// Types
export type {
    AgentApprovalRequestEvent,
    AgentApprovalResponse,
    AgentConfig,
    AgentDoneEvent,
    AgentErrorEvent,
    AgentFileAction,
    AgentFileActionEvent,
    AgentFileActionType,
    AgentIterationStartEvent,
    AgentRequest,
    AgentResponse,
    AgentRestoreResult,
    AgentSession,
    AgentSessionStatus,
    AgentStreamEvent,
    AgentTextDeltaEvent,
    AgentToolCall,
    AgentToolDefinition,
    AgentToolResult,
    AgentToolUseResultEvent,
    AgentToolUseStartEvent,
    ToolParameterProperty,
    ToolParameterSchema
} from "./agent.types";

export { DEFAULT_AGENT_CONFIG } from "./agent.types";

// Tool definitions
export {
    AGENT_TOOLS,
    COMPOSITE_TOOLS,
    TOOL_TO_BRIDGE_ACTION,
    formatToolsForAnthropic,
    formatToolsForOpenAI,
    getAgentTool,
    getAgentToolNames
} from "./agent-tools";

// Agent service (the agentic loop)
export { agentService } from "./agent.service";

// Agent executor (tool call dispatch)
export { executeToolCall, executeToolCallsBatch } from "./agent-executor";

// Agent safety (validation & limits)
export {
    checkSessionLimits,
    isFileModification,
    requiresApproval,
    truncateToolOutput,
    validateCommand,
    validateFileContent,
    validateFilePath,
    validateToolCallArgs
} from "./agent-safety";

// Agent session persistence (database)
export {
    completeSession,
    createSession,
    getAgentUsageStats,
    getSession,
    getUserSessions,
    recordToolCall,
    recordToolCallsBatch
} from "./agent-session.service";

// AI Actions tracker (file backup & restore)
export {
    clearSession as clearActionSession,
    generatePreview,
    getActiveSessionCount,
    getSessionActions,
    initSession as initActionSession,
    readFileForBackup,
    restoreSession,
    restoreSingleAction,
    trackFileAction
} from "./agent-actions";

// Approval store (terminal command approval)
export {
    clearSessionApprovals,
    hasPendingApproval,
    requestApproval,
    resolveApproval
} from "./agent-approval";

