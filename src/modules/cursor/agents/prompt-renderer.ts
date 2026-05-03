/**
 * Agent Prompt Renderer
 *
 * Resolves `{{skill:id}}` placeholders in an agent's markdown body against
 * the existing `cursor-skills.ts` registry. Skills receive the active
 * `WorkerPromptContext` and may return empty strings to opt out (e.g. the
 * workflow-context skill is a no-op when no workflow is open).
 *
 * Unknown skill ids are silently dropped (with a console.warn in dev) so a
 * stale skill reference does not break the agent.
 *
 * @module modules/cursor/agents/prompt-renderer
 */

import { getSkill } from "../cursor-skills";
import type { WorkerPromptContext } from "../cursor-workers";
import type { AgentDefinition } from "./types";

const PLACEHOLDER_RE = /\{\{\s*skill:([a-z0-9-]+)\s*\}\}/g;

/**
 * Render an agent's markdown body into a final system prompt by resolving
 * every `{{skill:id}}` placeholder. Adjacent blank lines are collapsed so
 * dropped placeholders do not leave large gaps in the prompt.
 */
export function renderAgentPrompt(
  agent: AgentDefinition,
  ctx: WorkerPromptContext,
): string {
  const resolved = agent.body.replace(PLACEHOLDER_RE, (_match, id: string) => {
    const skill = getSkill(id);
    if (!skill) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[agent:${agent.frontmatter.name}] unknown skill placeholder: {{skill:${id}}}`,
        );
      }
      return "";
    }
    const text = skill.build(ctx);
    return text ?? "";
  });
  // Collapse 3+ consecutive newlines (left behind by empty skills) to 2.
  return resolved.replace(/\n{3,}/g, "\n\n").trim();
}
