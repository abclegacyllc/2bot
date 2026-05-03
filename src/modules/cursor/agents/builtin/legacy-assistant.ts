/**
 * Built-in: Legacy Assistant — internal fallback for non-agent callers.
 *
 * Not user-invocable. Used by the runner when a request arrives without
 * an `agentName` and the legacy router picks the `assistant` runtime. The
 * body mirrors `composeWorkerPrompt("assistant", ctx)` from cursor-skills,
 * and the `tools:` mirror `WORKER_TOOL_NAMES.assistant` so behavior is
 * byte-identical to the legacy path.
 *
 * Once every caller is updated to send `agentName`, this fallback can be
 * deleted along with `routeToWorker()`.
 *
 * @module modules/cursor/agents/builtin/legacy-assistant
 */

export const LEGACY_ASSISTANT_AGENT_MD = `---
name: legacy-assistant
description: Internal fallback agent that mirrors the legacy assistant worker.
displayName: Assistant
userInvocable: false
disableModelInvocation: true
runtime: assistant
maxCredits: 10
maxIterations: 100
temperature: 0.4
liteRouting: true
needsWorkspace: false
pluginEdit: false
tools:
  - workspace-read
  - code-intel
  - platform-query
  - platform-mutate
  - workflow-edit
  - diagnostics
  - memory
  - interaction
---
{{skill:assistant-identity}}

{{skill:agent-autonomy}}

{{skill:assistant-capabilities}}

{{skill:assistant-rules}}

{{skill:diagnosis-lock}}

{{skill:silent-planning}}

{{skill:output-format}}

{{skill:error-recovery}}

{{skill:navigation-routes}}

{{skill:platform-context}}

{{skill:user-state}}

{{skill:prior-session-context}}

{{skill:user-preferences}}

{{skill:agent-memory}}

{{skill:current-task}}

{{skill:workflow-context}}
`;
