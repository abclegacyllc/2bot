/**
 * Agent Module — Public Barrel
 *
 * @module modules/cursor/agents
 */

export {
    defaultConfigForRuntime, resolveAgentConfig, type ResolvedAgentExecutionConfig
} from "./agent-config";
export { AgentLoadError, loadAgent, type LoadAgentOptions } from "./agent-loader";
export {
    DEFAULT_AGENT_NAME,
    getAgent,
    getDefaultAgent,
    getFallbackAgent,
    listAgents,
    listUserInvocableAgents,
    loadCustomAgent,
    summarizeAgent
} from "./agent-registry";
export { renderAgentPrompt } from "./prompt-renderer";
export { BUNDLE_NAMES, expandToolList, TOOL_BUNDLES } from "./tool-bundles";
export { resolveAgentTools } from "./tool-resolver";
export type {
    AgentDefinition,
    AgentFrontmatter,
    AgentHandoff,
    AgentSummary
} from "./types";

