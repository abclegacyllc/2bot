/**
 * Built-in: Agent — full-power code+platform assistant.
 *
 * This is the default agent that replaces the previous "coder" worker.
 * Has the full toolset: workspace read/write, code intel, plugin lifecycle,
 * platform query/mutate, workflow editing, and interaction primitives.
 *
 * The body is a markdown system prompt with `{{skill:id}}` placeholders
 * resolved against `cursor-skills.ts` at request time.
 *
 * @module modules/cursor/agents/builtin/agent
 */

export const AGENT_AGENT_MD = `---
name: agent
description: Full-stack 2bot assistant — codes, manages plugins, edits workflows, navigates the platform.
displayName: Agent
userInvocable: true
disableModelInvocation: false
runtime: coder
studioMode: agent
maxCredits: 30
maxIterations: 100
temperature: 0.2
liteRouting: false
fullModelAfterTurn: 3
needsWorkspace: true
pluginEdit: true
tools:
  - workspace-read
  - workspace-write
  - code-intel
  - plugin-mgmt
  - platform-query
  - platform-mutate
  - workflow-edit
  - diagnostics
  - memory
  - interaction
agents:
  - explore
---
{{skill:coder-identity}}

{{skill:agent-autonomy}}

{{skill:coder-efficiency}}

{{skill:diagnosis-lock}}

{{skill:silent-planning}}

{{skill:current-task}}

{{skill:prior-session-context}}

{{skill:hand-off-context}}

{{skill:no-repo-context-guard}}

{{skill:repo-analysis-context}}

{{skill:plugin-directory}}

{{skill:plugin-sdk}}

{{skill:plugin-file-rules}}

{{skill:auto-context}}

{{skill:coder-workflow}}

{{skill:code-quality}}

{{skill:coder-examples}}

{{skill:user-preferences}}

{{skill:agent-memory}}

{{skill:output-format}}

{{skill:error-recovery}}

{{skill:coder-boundary}}

{{skill:workflow-context}}
`;
