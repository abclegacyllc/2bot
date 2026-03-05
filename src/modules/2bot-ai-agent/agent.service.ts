/**
 * 2Bot AI Agent Service — The Agentic Loop
 *
 * Core service that orchestrates the AI agent's multi-step reasoning loop.
 * Connects AI function calling to workspace containers via the bridge agent.
 *
 * Loop architecture:
 *   1. User prompt → AI (with tool definitions)
 *   2. AI responds with tool_use → Execute tools via bridge agent
 *   3. Tool results → AI (sees what happened)
 *   4. Repeat until AI responds with text (done) or limits are hit
 *
 * Safety: Every iteration checks credit limits, iteration caps, and timeouts.
 * Credits: Each AI call is billed through the normal credit system.
 *
 * @module modules/2bot-ai-agent/agent.service
 */

import crypto from "crypto";

import { logger } from "@/lib/logger";
import { twoBotAIProvider } from "@/modules/2bot-ai-provider/2bot-ai.provider";
import type {
    TextGenerationMessage,
    TextGenerationRequest,
    TextGenerationResponse
} from "@/modules/2bot-ai-provider/types";
import type { ServiceContext } from "@/shared/types/context";

import * as agentActions from "./agent-actions";
import { clearSessionApprovals, requestApproval } from "./agent-approval";
import { executeToolCall, executeToolCallsBatch } from "./agent-executor";
import { checkSessionLimits, isFileModification, requiresApproval } from "./agent-safety";
import * as agentSessionService from "./agent-session.service";
import { AGENT_TOOLS } from "./agent-tools";
import type {
    AgentConfig,
    AgentFileAction,
    AgentRequest,
    AgentResponse,
    AgentSession,
    AgentStreamEvent,
    AgentToolCall,
    AgentToolResult,
    AgentUIActionEvent,
} from "./agent.types";
import { DEFAULT_AGENT_CONFIG } from "./agent.types";

const log = logger.child({ module: "2bot-ai-agent" });

// ===========================================
// UI Action Helpers
// ===========================================

/**
 * Build a ui_action SSE event that triggers a choreography on the frontend.
 *
 * The frontend `agent-chat.tsx` handler sees `_choreography` and looks up
 * the matching factory in CHOREOGRAPHY_FACTORIES to generate the full
 * visual step sequence.
 *
 * Usage (inside runAgentStream generator):
 * ```ts
 *   yield uiChoreography("create_custom_plugin", { name: "my-bot", code: "..." });
 * ```
 *
 * NOTE: Exported for future platform tools. Currently unused because
 * platform tools (create_gateway, install_plugin, etc.) are not yet
 * implemented. When they are, the agentic loop will yield these events
 * alongside tool results.
 */
export function uiChoreography(
  choreographyId: string,
  params: Record<string, unknown> = {},
): AgentUIActionEvent {
  return {
    type: "ui_action",
    payload: { _choreography: choreographyId, params },
  };
}

/**
 * Build a raw ui_action SSE event (single action, not a choreography).
 */
export function uiAction(action: Record<string, unknown>): AgentUIActionEvent {
  return { type: "ui_action", payload: action };
}

// ===========================================
// System Prompt for Agent Mode
// ===========================================

const AGENT_SYSTEM_PROMPT = `You are a 2Bot AI platform operator. You have tools that let you DIRECTLY manage the user's platform resources — gateways, plugins, workspace, and credits. You also have workspace tools for file editing, shell commands, git, and packages.

## CRITICAL RULES

1. **ALWAYS USE TOOLS TO ACT.** When the user asks you to create, delete, update, or manage anything, use your tools to do it immediately. NEVER give step-by-step manual instructions for the user to follow.
2. **You are a worker, not an advisor.** Do the work. Don't explain how to do it.
3. **If you lack information to act, ask for it.** For example, if creating a Telegram gateway and you don't have the bot token, ask for it. Then proceed immediately once you have it.
4. **Report results, not plans.** After completing an action, say what you did (e.g., "Created gateway 'My Bot' — it's now connected."). Don't narrate steps as you go.

## Guidelines

1. **Think step by step internally** — but keep explanations brief to the user.
2. **Use tools to verify.** Read existing files before modifying them.
3. **Be precise with file edits.** Include complete file content — no placeholders.
4. **Handle errors gracefully.** If a tool call fails, try an alternative approach.
5. **Stay within scope.** Only modify resources related to the user's request.

## Platform Tools (operate on 2bot services)

### Read Tools
- **list_gateways** — List all gateways (Telegram bots, AI, custom gateways) with status.
- **list_user_plugins** — List all installed plugins with gateway bindings.
- **list_available_plugins** — Browse the plugin marketplace.
- **get_workspace_status** — Check workspace container status and resources.
- **check_credits** — Check credit balance and monthly usage.

### Write Tools
- **create_gateway** — Create a new gateway. For Telegram: provide name, type=TELEGRAM_BOT, and botToken. For AI: provide name, type=AI, provider, and apiKey. For Custom Gateway: provide name, type=CUSTOM_GATEWAY, and credentials.
- **delete_gateway** — Delete a gateway by ID.
- **update_gateway** — Update a gateway's name or credentials by ID.
- **create_custom_plugin** — Create a new custom plugin with name, description, and JavaScript code.
- **update_custom_plugin** — Update a custom plugin's code, name, or description by ID.
- **delete_custom_plugin** — Delete a custom plugin by ID.
- **install_plugin** — Install a store plugin by slug, optionally binding to a gateway.
- **uninstall_plugin** — Uninstall a plugin by user plugin ID.

### Common Workflows
- "Create a Telegram bot" → ask for bot token if not given → \`create_gateway(name, TELEGRAM_BOT, botToken)\`
- "Make a plugin" → \`create_custom_plugin(name, description, code)\`
- "Delete my bot" → \`list_gateways\` → find ID → \`delete_gateway(id)\`
- "What plugins do I have?" → \`list_user_plugins\`
- "Install echo bot" → \`list_available_plugins\` → find slug → \`install_plugin(slug)\`

## Workspace Tools (operate inside the container)

File operations (read, write, list, delete, rename), shell commands, git, and packages. All sandboxed to /workspace.

- Use relative paths (e.g., "plugins/my-plugin.js").
- Cannot access system files.
- Standard dirs: \`plugins/\`, \`data/\`, \`imports/\`.

## Safety

- Container is sandboxed. Destructive system commands are blocked.
- No internet access beyond git/npm registries.
- Never attempt to read system files, bridge files, or env variables.`;

// ===========================================
// Agent Service
// ===========================================

export const agentService = {
  /**
   * Run an agent session (non-streaming).
   * Returns the full response after all iterations complete.
   *
   * Use `runAgentStream()` for SSE streaming to the client.
   */
  async runAgent(
    request: AgentRequest,
    ctx: ServiceContext,
  ): Promise<AgentResponse> {
    const events: AgentStreamEvent[] = [];

    // Collect all events from the streaming version
    for await (const event of this.runAgentStream(request, ctx)) {
      events.push(event);
    }

    // Extract the final "done" event
    const doneEvent = events.find((e) => e.type === "done");
    const errorEvent = events.find((e) => e.type === "error");

    if (errorEvent && errorEvent.type === "error") {
      throw new Error(errorEvent.error);
    }

    if (!doneEvent || doneEvent.type !== "done") {
      throw new Error("Agent session ended without a done event");
    }

    // Collect all text deltas into the final content
    const textContent = events
      .filter((e) => e.type === "text_delta")
      .map((e) => (e as { delta: string }).delta)
      .join("");

    // Collect all tool results
    const toolResults = events
      .filter((e) => e.type === "tool_use_result")
      .map((e) => e as AgentToolResult & { type: string });

    return {
      sessionId: doneEvent.sessionId,
      status: doneEvent.status,
      content: textContent,
      iterationCount: doneEvent.iterationCount,
      toolCallCount: doneEvent.toolCallsCount,
      totalCreditsUsed: doneEvent.totalCreditsUsed,
      totalTokenUsage: doneEvent.totalTokenUsage,
      toolCallSummary: toolResults.map((r) => ({
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        output: r.output,
        isError: r.isError,
        durationMs: r.durationMs,
      })),
      durationMs: doneEvent.durationMs,
    };
  },

  /**
   * Run an agent session with streaming SSE events.
   *
   * Yields events as they happen:
   * - iteration_start: Beginning of a new AI iteration
   * - text_delta: Incremental text from the AI
   * - tool_use_start: AI is calling a tool
   * - tool_use_result: Tool execution result
   * - done: Session completed
   * - error: Session failed
   */
  async *runAgentStream(
    request: AgentRequest,
    ctx: ServiceContext,
  ): AsyncGenerator<AgentStreamEvent> {
    const sessionId = crypto.randomUUID();
    const config: AgentConfig = {
      ...DEFAULT_AGENT_CONFIG,
      ...request.config,
    };

    const session: AgentSession = {
      id: sessionId,
      userId: request.userId,
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      status: "running",
      iterationCount: 0,
      toolCallCount: 0,
      totalCreditsUsed: 0,
      totalTokenUsage: { inputTokens: 0, outputTokens: 0 },
      toolCalls: [],
      startedAt: new Date(),
    };

    log.info(
      {
        sessionId,
        userId: request.userId,
        workspaceId: request.workspaceId,
        model: request.model,
        maxIterations: config.maxIterations,
      },
      "🤖 Agent session started",
    );

    // Persist session to database (fire-and-forget — don't block the stream)
    agentSessionService.createSession({
      id: sessionId,
      userId: request.userId,
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      model: request.model,
      prompt: request.prompt,
    });

    // Initialize AI action tracking for this session
    agentActions.initSession(sessionId, request.workspaceId);

    // Running sequence counter for tool call ordering
    let toolCallSequence = 0;

    try {
      // Build initial messages
      const messages: TextGenerationMessage[] = [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
      ];

      // Add conversation history if provided
      if (request.conversationHistory) {
        for (const msg of request.conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Add the user's prompt
      messages.push({ role: "user", content: request.prompt });

      // Build tool definitions for the AI provider
      const toolDefinitions = AGENT_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      // ===========================================
      // The Agentic Loop
      // ===========================================
      while (true) {
        // Safety check: session limits
        const limitError = checkSessionLimits(
          session.iterationCount,
          session.totalCreditsUsed,
          session.startedAt,
          config,
        );

        if (limitError) {
          session.status =
            session.iterationCount >= config.maxIterations
              ? "max_iterations"
              : session.totalCreditsUsed >= config.maxCreditsPerSession
                ? "max_credits"
                : "error";

          log.warn(
            { sessionId, reason: limitError, status: session.status },
            "⚠️ Agent session limit reached",
          );

          const limitDurationMs = Date.now() - session.startedAt.getTime();

          // Persist limit-reached completion
          agentSessionService.completeSession({
            id: sessionId,
            status: session.status,
            iterationCount: session.iterationCount,
            toolCallCount: session.toolCallCount,
            totalCreditsUsed: session.totalCreditsUsed,
            inputTokens: session.totalTokenUsage.inputTokens,
            outputTokens: session.totalTokenUsage.outputTokens,
            error: limitError,
            durationMs: limitDurationMs,
          });

          yield {
            type: "done",
            sessionId,
            status: session.status,
            totalCreditsUsed: session.totalCreditsUsed,
            iterationCount: session.iterationCount,
            toolCallsCount: session.toolCallCount,
            totalTokenUsage: session.totalTokenUsage,
            durationMs: limitDurationMs,
          };
          return;
        }

        session.iterationCount++;

        // Emit iteration start
        yield {
          type: "iteration_start",
          iteration: session.iterationCount,
          creditsUsed: session.totalCreditsUsed,
          toolCallsCount: session.toolCallCount,
        };

        // Call the AI with tools
        let aiResponse: TextGenerationResponse;
        try {
          const aiRequest: TextGenerationRequest = {
            messages,
            model: request.model as TextGenerationRequest["model"],
            userId: request.userId,
            organizationId: request.organizationId,
            tools: toolDefinitions,
            toolChoice: "auto",
            // Disable smart routing for agent mode — we need the exact model
            // the user selected (must support function calling)
            smartRouting: false,
            feature: "agent",
            capability: "code-generation",
          };

          aiResponse = await twoBotAIProvider.textGeneration(aiRequest);
        } catch (aiError) {
          const message = aiError instanceof Error ? aiError.message : String(aiError);
          log.error({ sessionId, error: message }, "❌ AI call failed");

          session.status = "error";
          session.error = message;

          // Persist AI call failure
          agentSessionService.completeSession({
            id: sessionId,
            status: "error",
            iterationCount: session.iterationCount,
            toolCallCount: session.toolCallCount,
            totalCreditsUsed: session.totalCreditsUsed,
            inputTokens: session.totalTokenUsage.inputTokens,
            outputTokens: session.totalTokenUsage.outputTokens,
            error: message,
            durationMs: Date.now() - session.startedAt.getTime(),
          });

          yield {
            type: "error",
            error: message,
            code: "AI_CALL_FAILED",
            sessionId,
            iterationCount: session.iterationCount,
            toolCallsCount: session.toolCallCount,
            creditsUsed: session.totalCreditsUsed,
          };
          return;
        }

        // Track credits and tokens
        session.totalCreditsUsed += aiResponse.creditsUsed ?? 0;
        session.totalTokenUsage.inputTokens += aiResponse.usage.inputTokens;
        session.totalTokenUsage.outputTokens += aiResponse.usage.outputTokens;

        log.info(
          {
            sessionId,
            iteration: session.iterationCount,
            finishReason: aiResponse.finishReason,
            creditsUsed: aiResponse.creditsUsed,
            toolCallCount: aiResponse.toolCalls?.length ?? 0,
            inputTokens: aiResponse.usage.inputTokens,
            outputTokens: aiResponse.usage.outputTokens,
          },
          "🔄 Agent iteration completed",
        );

        // =====================================================
        // CASE 1: AI responded with text (no tool calls) → DONE
        // =====================================================
        if (aiResponse.finishReason !== "tool_use" || !aiResponse.toolCalls?.length) {
          // Emit the text content
          if (aiResponse.content) {
            yield { type: "text_delta", delta: aiResponse.content };
          }

          session.status = "completed";
          session.finalResponse = aiResponse.content;
          session.completedAt = new Date();

          const completedDurationMs = Date.now() - session.startedAt.getTime();

          log.info(
            {
              sessionId,
              iterations: session.iterationCount,
              totalCredits: session.totalCreditsUsed,
              totalToolCalls: session.toolCallCount,
            },
            "✅ Agent session completed",
          );

          // Persist successful completion
          agentSessionService.completeSession({
            id: sessionId,
            status: "completed",
            iterationCount: session.iterationCount,
            toolCallCount: session.toolCallCount,
            totalCreditsUsed: session.totalCreditsUsed,
            inputTokens: session.totalTokenUsage.inputTokens,
            outputTokens: session.totalTokenUsage.outputTokens,
            finalResponse: aiResponse.content,
            durationMs: completedDurationMs,
          });

          yield {
            type: "done",
            sessionId,
            status: "completed",
            totalCreditsUsed: session.totalCreditsUsed,
            iterationCount: session.iterationCount,
            toolCallsCount: session.toolCallCount,
            totalTokenUsage: session.totalTokenUsage,
            durationMs: completedDurationMs,
          };
          return;
        }

        // ==========================================================
        // CASE 2: AI wants to use tools → Execute → Feed results back
        // ==========================================================

        // If there's also text content (thinking/planning), emit it
        if (aiResponse.content) {
          yield { type: "text_delta", delta: aiResponse.content };
        }

        // Add the AI's response (with tool calls) to message history
        messages.push({
          role: "assistant",
          content: aiResponse.content || "",
        });

        // Convert provider tool calls to agent format
        const toolCalls: AgentToolCall[] = aiResponse.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        }));

        // Enforce per-iteration tool call limit
        const cappedToolCalls = toolCalls.slice(0, config.maxToolCallsPerIteration);

        // =====================================================
        // Split tool calls into 3 categories:
        //   1. File modifications → backup + execute + track
        //   2. Approval required → pause for user + execute/skip
        //   3. Read-only → execute immediately
        // =====================================================

        const fileModCalls = cappedToolCalls.filter((tc) => isFileModification(tc.name));
        const approvalCalls = cappedToolCalls.filter((tc) => requiresApproval(tc.name));
        const readOnlyCalls = cappedToolCalls.filter(
          (tc) => !isFileModification(tc.name) && !requiresApproval(tc.name),
        );

        const allResults: AgentToolResult[] = [];

        // --- Emit tool_use_start events for ALL tool calls ---
        for (const tc of cappedToolCalls) {
          yield {
            type: "tool_use_start",
            toolCall: {
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            },
          };
        }

        // --- 1. Execute read-only tools in parallel (no tracking needed) ---
        if (readOnlyCalls.length > 0) {
          const readResults = await executeToolCallsBatch(
            readOnlyCalls,
            request.workspaceId,
            ctx,
            config.toolExecutionTimeoutMs,
          );
          allResults.push(...readResults);
        }

        // --- 2. File modifications: backup → execute → track ---
        for (const tc of fileModCalls) {
          // Determine the action type and read original content for backup
          let actionType: AgentFileAction["type"];
          let originalContent: string | null = null;
          let newContent: string | null = null;
          let contentTruncated = false;

          switch (tc.name) {
            case "write_file": {
              const filePath = tc.arguments.path as string;
              const backup = await agentActions.readFileForBackup(request.workspaceId, filePath, ctx);
              originalContent = backup.content;
              contentTruncated = backup.truncated;
              actionType = originalContent === null ? "created" : "modified";
              newContent = tc.arguments.content as string;
              break;
            }
            case "delete_file": {
              const filePath = tc.arguments.path as string;
              const backup = await agentActions.readFileForBackup(request.workspaceId, filePath, ctx);
              originalContent = backup.content;
              contentTruncated = backup.truncated;
              actionType = "deleted";
              break;
            }
            case "rename_file": {
              actionType = "renamed";
              break;
            }
            default:
              actionType = "modified";
          }

          // Execute the tool call
          const result = await executeToolCall(
            tc,
            request.workspaceId,
            ctx,
            config.toolExecutionTimeoutMs,
          );
          allResults.push(result);

          // Track the action (only if execution succeeded)
          if (!result.isError) {
            const actionId = crypto.randomUUID();
            const fileAction: AgentFileAction = {
              id: actionId,
              type: actionType,
              path: tc.arguments.path as string ?? tc.arguments.oldPath as string,
              newPath: tc.name === "rename_file" ? tc.arguments.newPath as string : undefined,
              originalContent,
              newContent,
              contentTruncated,
              toolCallId: tc.id,
              timestamp: new Date(),
            };

            agentActions.trackFileAction(sessionId, fileAction);

            // Emit file_action event for frontend diff display
            yield {
              type: "file_action" as const,
              action: {
                id: actionId,
                type: actionType,
                path: fileAction.path,
                newPath: fileAction.newPath,
                originalPreview: agentActions.generatePreview(originalContent),
                newPreview: agentActions.generatePreview(newContent),
                toolCallId: tc.id,
              },
            };
          }
        }

        // --- 3. Approval-required tools: pause → wait → execute/skip ---
        for (const tc of approvalCalls) {
          // Emit approval request event (frontend shows Approve/Reject)
          yield {
            type: "approval_request" as const,
            sessionId,
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.arguments,
          };

          session.status = "awaiting_approval";

          // Wait for user response (auto-rejects after 30s)
          const approval = await requestApproval(sessionId, tc.id, tc.name);

          session.status = "running";

          if (approval.approved) {
            // User approved — execute the tool call
            const result = await executeToolCall(
              tc,
              request.workspaceId,
              ctx,
              config.toolExecutionTimeoutMs,
            );
            allResults.push(result);
          } else {
            // User rejected or timed out — skip with a message for the AI
            allResults.push({
              toolCallId: tc.id,
              toolName: tc.name,
              output: "⚠️ User rejected this action. The command was NOT executed. Please continue without this action or suggest an alternative approach.",
              isError: false,
              durationMs: 0,
            });
          }
        }

        // --- Track & persist all results ---
        session.toolCallCount += allResults.length;
        session.toolCalls.push(...allResults);

        // Persist tool calls to database
        const toolInputs = cappedToolCalls.map((tc) => tc.arguments);
        agentSessionService.recordToolCallsBatch(
          sessionId,
          allResults,
          toolInputs,
          toolCallSequence,
        );
        toolCallSequence += allResults.length;

        // Emit tool_use_result events
        for (const result of allResults) {
          yield {
            type: "tool_use_result",
            toolCallId: result.toolCallId,
            toolName: result.toolName,
            output: result.output,
            isError: result.isError,
            durationMs: result.durationMs,
          };
        }

        // Build tool result messages for the AI
        for (const result of allResults) {
          messages.push({
            role: "user",
            content: formatToolResultForAI(result),
          });
        }

        // Loop continues — AI will see the tool results and decide next action
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ sessionId, error: message }, "❌ Agent session failed");

      session.status = "error";
      session.error = message;

      // Clean up any pending approvals
      clearSessionApprovals(sessionId);

      // Persist unhandled error completion
      agentSessionService.completeSession({
        id: sessionId,
        status: "error",
        iterationCount: session.iterationCount,
        toolCallCount: session.toolCallCount,
        totalCreditsUsed: session.totalCreditsUsed,
        inputTokens: session.totalTokenUsage.inputTokens,
        outputTokens: session.totalTokenUsage.outputTokens,
        error: message,
        durationMs: Date.now() - session.startedAt.getTime(),
      });

      yield {
        type: "error",
        error: message,
        code: "AGENT_ERROR",
        sessionId,
        iterationCount: session.iterationCount,
        toolCallsCount: session.toolCallCount,
        creditsUsed: session.totalCreditsUsed,
      };
    }
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * Format a tool execution result as a message that the AI can understand.
 *
 * We use a structured format so the AI knows which tool produced which output.
 * This is appended to the messages array as a "user" message since the
 * non-streaming textGeneration API doesn't support tool result messages directly.
 *
 * Once provider adapters support native tool result messages (Phase 4+),
 * this can be updated to use the proper "tool" role.
 */
function formatToolResultForAI(result: AgentToolResult): string {
  const statusPrefix = result.isError ? "❌ TOOL ERROR" : "✅ TOOL RESULT";
  return `[${statusPrefix}: ${result.toolName} (${result.durationMs}ms)]\n${result.output}`;
}
