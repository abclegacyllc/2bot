/**
 * Agent Execution Config Resolver
 *
 * Builds a fully-resolved `ResolvedAgentExecutionConfig` for the worker
 * runner from an `AgentDefinition`. The resolver folds frontmatter values
 * over runtime defaults so the runner can read every per-agent behavior
 * from a single object instead of branching on `workerType === "coder"`.
 *
 * Design principle: the agent's frontmatter is the single source of truth.
 * `runtime` survives only as a fallback bucket for legacy `WORKER_META`
 * defaults — once every agent declares its own values we can retire it.
 *
 * @module modules/cursor/agents/agent-config
 */

import { WORKER_META, type CursorWorkerType } from "../cursor-workers";
import type { AgentDefinition } from "./types";

// ===========================================
// Resolved execution config
// ===========================================

/**
 * Everything the worker runner needs to know about HOW to run an agent.
 *
 * The runner reads from this object instead of from `WORKER_META[workerType]`
 * or `if (workerType === "coder")` checks, so per-agent overrides land in
 * one place and there is no implicit coupling between an agent's runtime
 * tag and its execution behavior.
 */
export interface ResolvedAgentExecutionConfig {
  /** The runtime hint used for tool dispatch fallback (`assistant` | `coder`) */
  runtime: CursorWorkerType;
  /** Maximum credits allowed in a single session before "Continue?" prompt */
  maxCreditsPerSession: number;
  /** Maximum loop iterations */
  maxIterations: number;
  /** LLM sampling temperature */
  temperature: number;
  /** Allow lite-routing (cheap model) for tool-only iterations */
  allowLiteRouting: boolean;
  /** After this turn count, force the full model regardless of liteRouting */
  fullModelAfterTurn: number;
  /** Whether the agent needs an attached workspace container client */
  needsWorkspace: boolean;
  /** Whether the agent participates in the plugin-edit clone flow */
  pluginEdit: boolean;
}

// ===========================================
// Defaults per legacy runtime
// ===========================================

interface RuntimeDefaults {
  temperature: number;
  allowLiteRouting: boolean;
  fullModelAfterTurn: number;
  needsWorkspace: boolean;
  pluginEdit: boolean;
}

const RUNTIME_DEFAULTS: Record<CursorWorkerType, RuntimeDefaults> = {
  assistant: {
    temperature: 0.4,
    allowLiteRouting: true,
    fullModelAfterTurn: Number.POSITIVE_INFINITY,
    needsWorkspace: false,
    pluginEdit: false,
  },
  coder: {
    temperature: 0.2,
    allowLiteRouting: false,
    // Coder used to disable lite-routing entirely past turn 3 because lite
    // models can't reliably call write_file with large context. We preserve
    // that ceiling even when an agent opts back into lite-routing.
    fullModelAfterTurn: 3,
    needsWorkspace: true,
    pluginEdit: true,
  },
};

// ===========================================
// Resolver
// ===========================================

/**
 * Fold frontmatter overrides over the runtime defaults.
 *
 * Resolution order (per field): `frontmatter` ➜ `RUNTIME_DEFAULTS[runtime]`
 * ➜ `WORKER_META[runtime]` (for credits/iterations only).
 */
export function resolveAgentConfig(
  agent: AgentDefinition,
): ResolvedAgentExecutionConfig {
  const runtime: CursorWorkerType = agent.frontmatter.runtime ?? "assistant";
  const runtimeDefaults = RUNTIME_DEFAULTS[runtime];
  const meta = WORKER_META[runtime];
  const fm = agent.frontmatter;

  return {
    runtime,
    maxCreditsPerSession: fm.maxCredits ?? meta.maxCreditsPerSession,
    maxIterations: fm.maxIterations ?? meta.maxIterations,
    temperature: fm.temperature ?? runtimeDefaults.temperature,
    allowLiteRouting: fm.liteRouting ?? runtimeDefaults.allowLiteRouting,
    fullModelAfterTurn: fm.fullModelAfterTurn ?? runtimeDefaults.fullModelAfterTurn,
    needsWorkspace: fm.needsWorkspace ?? runtimeDefaults.needsWorkspace,
    pluginEdit: fm.pluginEdit ?? runtimeDefaults.pluginEdit,
  };
}

/**
 * Build a config for a runtime when no agent is in play (legacy code paths
 * that haven't migrated yet). Same shape, no overrides.
 */
export function defaultConfigForRuntime(
  runtime: CursorWorkerType,
): ResolvedAgentExecutionConfig {
  const runtimeDefaults = RUNTIME_DEFAULTS[runtime];
  const meta = WORKER_META[runtime];
  return {
    runtime,
    maxCreditsPerSession: meta.maxCreditsPerSession,
    maxIterations: meta.maxIterations,
    temperature: runtimeDefaults.temperature,
    allowLiteRouting: runtimeDefaults.allowLiteRouting,
    fullModelAfterTurn: runtimeDefaults.fullModelAfterTurn,
    needsWorkspace: runtimeDefaults.needsWorkspace,
    pluginEdit: runtimeDefaults.pluginEdit,
  };
}
