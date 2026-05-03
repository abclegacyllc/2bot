/**
 * Agent Registry
 *
 * Loads all built-in agents at module init and exposes:
 *   - `getAgent(name)` — exact lookup
 *   - `listAgents()` — all loaded agents
 *   - `listUserInvocableAgents()` — for the dropdown
 *   - `loadCustomAgent(source, opts)` — for DB- or filesystem-backed user agents
 *
 * Built-in agent definitions live as TypeScript modules under `./builtin/`
 * so they ship with the compiled server bundle without any extra build step.
 * The same `loadAgent()` parser handles arbitrary `.agent.md` strings, which
 * is what user-defined and marketplace agents will use later.
 *
 * @module modules/cursor/agents/agent-registry
 */

import { ALL_TOOL_NAMES } from "../cursor-worker-tools";
import type { CursorWorkerType } from "../cursor-workers";
import { AgentLoadError, loadAgent, type LoadAgentOptions } from "./agent-loader";
import { AGENT_AGENT_MD } from "./builtin/agent";
import { ASK_AGENT_MD } from "./builtin/ask";
import { BUILDER_AGENT_MD } from "./builtin/builder";
import { EXPLORE_AGENT_MD } from "./builtin/explore";
import { LEGACY_ASSISTANT_AGENT_MD } from "./builtin/legacy-assistant";
import { PLAN_AGENT_MD } from "./builtin/plan";
import type { AgentDefinition, AgentSummary } from "./types";

// ===========================================
// Registry construction
// ===========================================

/**
 * Set of tool names known to the runtime tool catalog. Used to validate
 * that every agent's `tools:` references something real.
 */
const KNOWN_TOOLS: Set<string> = new Set(ALL_TOOL_NAMES);

const REGISTRY = new Map<string, AgentDefinition>();

function register(source: string): void {
  const def = loadAgent(source, { source: "builtin", knownTools: KNOWN_TOOLS });
  if (REGISTRY.has(def.frontmatter.name)) {
    throw new AgentLoadError(
      def.frontmatter.name,
      "duplicate agent name in built-in registry",
    );
  }
  REGISTRY.set(def.frontmatter.name, def);
}

// Register built-ins. Failures here are programmer errors and fail-fast at boot.
register(AGENT_AGENT_MD);
register(ASK_AGENT_MD);
register(PLAN_AGENT_MD);
register(BUILDER_AGENT_MD);
register(EXPLORE_AGENT_MD);
register(LEGACY_ASSISTANT_AGENT_MD);

// ===========================================
// Public API
// ===========================================

/** Get an agent by name (exact match). Returns `undefined` if not found. */
export function getAgent(name: string): AgentDefinition | undefined {
  return REGISTRY.get(name);
}

/** Get all loaded agents (built-in + any user-loaded). */
export function listAgents(): AgentDefinition[] {
  return Array.from(REGISTRY.values());
}

/** Agents visible in the user-facing dropdown. */
export function listUserInvocableAgents(): AgentDefinition[] {
  return listAgents().filter((a) => a.frontmatter.userInvocable !== false);
}

/** Lightweight summary used by `/api/cursor/agents`. */
export function summarizeAgent(def: AgentDefinition): AgentSummary {
  return {
    name: def.frontmatter.name,
    displayName: def.frontmatter.displayName ?? def.frontmatter.name,
    description: def.frontmatter.description,
    userInvocable: def.frontmatter.userInvocable !== false,
    source: def.source,
    toolCount: def.toolNames.length,
  };
}

/**
 * Load and register a custom agent from a `.agent.md` source string.
 * Used by (DB-backed user agents). Throws `AgentLoadError` on
 * malformed input. Replaces an existing entry with the same name.
 */
export function loadCustomAgent(
  source: string,
  options: Omit<LoadAgentOptions, "knownTools"> = {},
): AgentDefinition {
  const def = loadAgent(source, { ...options, knownTools: KNOWN_TOOLS });
  REGISTRY.set(def.frontmatter.name, def);
  return def;
}

/**
 * The default agent name to fall back to when none is specified.
 * Frontends should treat this as "Agent" in the dropdown.
 */
export const DEFAULT_AGENT_NAME = "agent";

/** Return the default agent definition or throw if it is missing. */
export function getDefaultAgent(): AgentDefinition {
  const def = REGISTRY.get(DEFAULT_AGENT_NAME);
  if (!def) {
    throw new Error(
      `Default agent "${DEFAULT_AGENT_NAME}" is not registered — registry boot failed`,
    );
  }
  return def;
}

/**
 * Return the synthesized fallback agent for a runtime when no explicit
 * `agentName` was supplied.
 *
 * - `coder`  → the default `agent` (full power)
 * - `assistant` → `legacy-assistant` (mirrors the historic assistant prompt)
 *
 * uses this so 100% of request paths flow through `renderAgentPrompt`
 * and `resolveAgentTools`. Once every caller passes `agentName` we can drop
 * the synthesized `legacy-assistant` agent entirely.
 */
export function getFallbackAgent(runtime: CursorWorkerType): AgentDefinition {
  if (runtime === "coder") return getDefaultAgent();
  const fallback = REGISTRY.get("legacy-assistant");
  if (!fallback) {
    throw new Error(
      "Fallback `legacy-assistant` agent is not registered — registry boot failed",
    );
  }
  return fallback;
}
