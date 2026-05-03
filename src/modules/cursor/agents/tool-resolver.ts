/**
 * Agent Tool Resolver
 *
 * Translates an `AgentDefinition.toolNames` list into the runtime
 * `WorkerToolDefinition[]` shape used by the streaming runner. Wraps the
 * existing `getToolByName` lookup so the runner has a single seam for
 * "tools to expose this turn" regardless of whether the request came from
 * an agent or a legacy worker type.
 *
 * Workflow-context-aware additions (e.g. surfacing workflow-edit tools when
 * the user is editing a workflow) happen here so the runner does not need
 * to know about agent internals.
 *
 * @module modules/cursor/agents/tool-resolver
 */

import { getToolByName, type WorkerToolDefinition } from "../cursor-worker-tools";
import { expandToolList } from "./tool-bundles";
import type { AgentDefinition } from "./types";

export interface ResolveAgentToolsOptions {
  /** True when the user is editing a workflow in the Studio */
  hasWorkflowContext?: boolean;
}

/**
 * Resolve the concrete `WorkerToolDefinition[]` an agent should see this turn.
 *
 * Tools listed in the agent definition are looked up in the catalog. Unknown
 * tools are dropped (the loader has already validated builtins; user agents
 * may reference future tools).
 */
export function resolveAgentTools(
  agent: AgentDefinition,
  options: ResolveAgentToolsOptions = {},
): WorkerToolDefinition[] {
  const names: string[] = [...agent.toolNames];

  // When a workflow is open in the Studio, surface workflow-edit tools to
  // mutating agents that did not already opt in via a bundle / explicit name.
  // This mirrors the legacy behaviour of `getWorkerTools()` for the assistant.
  if (options.hasWorkflowContext && agent.frontmatter.runtime !== "coder") {
    const extras = expandToolList(["workflow-edit"]);
    for (const name of extras) {
      if (!names.includes(name)) names.push(name);
    }
  }

  const out: WorkerToolDefinition[] = [];
  for (const name of names) {
    const tool = getToolByName(name);
    if (tool) out.push(tool);
  }
  return out;
}
