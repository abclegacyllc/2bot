/**
 * Declarative Agent System — Types
 *
 * Each agent is a single Markdown file with YAML frontmatter that defines
 * its identity, capabilities, tools, and post-completion handoffs.
 *
 * The system replaces hardcoded `assistant` / `coder` worker types with
 * a registry of `AgentDefinition` objects loaded from disk or DB.
 *
 * @module modules/cursor/agents/types
 */

import type { CursorWorkerType } from "../cursor-workers";

// ===========================================
// Frontmatter (raw, as read from .agent.md)
// ===========================================

/**
 * Raw frontmatter shape parsed from a `.agent.md` file.
 * All fields are optional — only `name` and `description` are required.
 */
export interface AgentFrontmatter {
  /** Stable agent identifier (lowercase, used in URLs and registry lookups) */
  name: string;
  /** Human-readable one-line description shown in the UI */
  description: string;
  /** Optional display name for the dropdown (defaults to `name` capitalized) */
  displayName?: string;
  /**
   * Optional one-line hint describing what argument / question to pass when
   * invoking this agent. Shown in the UI as placeholder text or surfaced to
   * a parent agent calling it as a subagent.
   *
   * @example "Describe WHAT you're looking for and desired thoroughness (quick/medium/thorough)"
   */
  argumentHint?: string;
  /**
   * Whether the user can pick this agent from the dropdown.
   * Subagents (e.g. Explore) are typically `false`.
   * Defaults to `true`.
   */
  userInvocable?: boolean;
  /**
   * Whether the orchestrator is allowed to auto-invoke this agent.
   * Set to `true` to require explicit user selection.
   * Defaults to `false` (orchestrator may auto-route).
   */
  disableModelInvocation?: boolean;
  /**
   * Capability bundles or individual tool names this agent can use.
   * Bundle names are expanded to tool name lists at load time.
   *
   * @example ["workspace-read", "code-intel", "ask_user", "finish"]
   */
  tools?: string[];
  /** Names of subagents this agent can invoke (e.g. ["explore"]) */
  agents?: string[];
  /** Optional list of preferred model identifiers (in priority order) */
  model?: string[];
  /** Post-completion hand-off buttons rendered after the agent finishes */
  handoffs?: AgentHandoff[];
  /**
   * Maps to the existing worker runtime under the hood.
   * - `coder`: full filesystem + plugin tools (default for "agent")
   * - `assistant`: platform-only tools (default for "ask"/"plan")
   *
   * This is a 2bot-specific bridge while the runner is still worker-typed.
   * will retire this in favor of pure agent-driven dispatch.
   */
  runtime?: CursorWorkerType;
  /**
   * Optional studio-mode hint that maps onto the existing
   * `request.studioMode` field. Used for prompt-shape adjustments.
   */
  studioMode?: "agent" | "ask" | "plan";

  // ── Agent-owned execution config ──
  // These let an agent declare its own runtime behavior so the runner
  // doesn't need to branch on `runtime: assistant|coder`. Falls back to
  // `WORKER_META[runtime]` when omitted.

  /**
   * Maximum credits this agent may consume in a single session before
   * the runner asks the user to extend the budget. Falls back to
   * `WORKER_META[runtime].maxCreditsPerSession` (assistant=10, coder=30).
   */
  maxCredits?: number;
  /**
   * Maximum loop iterations. Falls back to
   * `WORKER_META[runtime].maxIterations` (currently 100 for both).
   */
  maxIterations?: number;
  /**
   * Sampling temperature for LLM calls. Defaults: coder=0.2, assistant=0.4.
   */
  temperature?: number;
  /**
   * Whether the agent allows lite-routing (cheap model for tool-only turns).
   * Defaults: assistant=true, coder=false. Code-generation agents should
   * keep this off because lite models can fail on complex tool calls.
   */
  liteRouting?: boolean;
  /**
   * After this turn count, force the full model (no more lite-routing) even
   * if `liteRouting: true`. Defaults: coder=3, assistant=Infinity.
   */
  fullModelAfterTurn?: number;
  /**
   * Whether the agent needs a workspace container client (filesystem access).
   * Defaults: coder=true, assistant=false.
   */
  needsWorkspace?: boolean;
  /**
   * Whether the agent participates in the plugin-edit clone flow.
   * Defaults: coder=true, assistant=false.
   */
  pluginEdit?: boolean;
}

/** A single post-completion handoff button */
export interface AgentHandoff {
  /** Button label rendered in the chat UI */
  label: string;
  /** Target agent name to switch to when clicked */
  agent: string;
  /** Initial prompt to send to the target agent */
  prompt: string;
}

// ===========================================
// Resolved (after bundle expansion + skill resolution)
// ===========================================

/**
 * A fully resolved agent definition ready for the runner.
 * Bundle names in `tools` have been expanded to concrete tool names,
 * and the markdown body is stored separately from frontmatter.
 */
export interface AgentDefinition {
  /** Source of this agent (built-in / user-defined / org-defined) */
  source: "builtin" | "user" | "org" | "marketplace";
  /** Frontmatter (validated, defaults applied) */
  frontmatter: Required<
    Pick<AgentFrontmatter, "name" | "description">
  > &
    Omit<AgentFrontmatter, "name" | "description">;
  /** Concrete tool names after bundle expansion (deduped, ordered) */
  toolNames: string[];
  /**
   * Markdown system-prompt body. May contain `{{skill:id}}` placeholders
   * that are resolved at request time against `cursor-skills.ts`.
   */
  body: string;
}

// ===========================================
// Public API surface (for /api/cursor/agents)
// ===========================================

/** Lightweight metadata shipped to the frontend dropdown */
export interface AgentSummary {
  name: string;
  displayName: string;
  description: string;
  userInvocable: boolean;
  source: AgentDefinition["source"];
  /** Number of tools available to this agent (for UI hint) */
  toolCount: number;
}
