/**
 * 2Bot AI Agent Session Persistence Service
 *
 * Persists agent sessions and tool calls to PostgreSQL for:
 * - Billing audit trail (credit reconciliation)
 * - Usage history (user can review past sessions)
 * - Admin analytics (session patterns, tool usage)
 * - Debugging (inspect failed sessions after the fact)
 *
 * The agent service calls these methods at key lifecycle points:
 *   1. createSession() — when a new agent session starts
 *   2. recordToolCall() — after each tool execution
 *   3. completeSession() — when the session finishes (success or failure)
 *   4. getSession() / getUserSessions() — for history/admin queries
 *
 * @module modules/2bot-ai-agent/agent-session.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import type { AgentSessionStatus, AgentToolResult } from "./agent.types";

const log = logger.child({ module: "2bot-ai-agent:session" });

// ===========================================
// Session Lifecycle
// ===========================================

/**
 * Create a new agent session record in the database.
 * Called at the start of `runAgentStream()`.
 */
export async function createSession(params: {
  id: string;
  userId: string;
  organizationId?: string;
  workspaceId: string;
  model: string;
  prompt: string;
}): Promise<void> {
  try {
    await prisma.agentSession.create({
      data: {
        id: params.id,
        userId: params.userId,
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        model: params.model,
        prompt: params.prompt,
        status: "running",
      },
    });

    log.debug({ sessionId: params.id }, "Agent session created");
  } catch (error) {
    // Non-critical — don't fail the agent session if DB write fails
    log.error(
      { sessionId: params.id, error: (error as Error).message },
      "Failed to create agent session record",
    );
  }
}

/**
 * Record a tool call within a session.
 * Called after each tool execution completes.
 */
export async function recordToolCall(
  sessionId: string,
  result: AgentToolResult,
  input: Record<string, unknown>,
  sequence: number,
): Promise<void> {
  try {
    await prisma.agentToolCall.create({
      data: {
        sessionId,
        toolName: result.toolName,
        toolCallId: result.toolCallId,
        input: input as object,
        output: result.output,
        isError: result.isError,
        durationMs: result.durationMs,
        sequence,
      },
    });
  } catch (error) {
    // Non-critical — log and continue
    log.error(
      { sessionId, toolName: result.toolName, error: (error as Error).message },
      "Failed to record agent tool call",
    );
  }
}

/**
 * Record multiple tool calls in a batch (more efficient for parallel execution).
 */
export async function recordToolCallsBatch(
  sessionId: string,
  results: AgentToolResult[],
  inputs: Record<string, unknown>[],
  startSequence: number,
): Promise<void> {
  if (results.length === 0) return;

  try {
    await prisma.agentToolCall.createMany({
      data: results.map((result, i) => ({
        sessionId,
        toolName: result.toolName,
        toolCallId: result.toolCallId,
        input: (inputs[i] ?? {}) as object,
        output: result.output,
        isError: result.isError,
        durationMs: result.durationMs,
        sequence: startSequence + i,
      })),
    });
  } catch (error) {
    // Non-critical — log and continue
    log.error(
      { sessionId, count: results.length, error: (error as Error).message },
      "Failed to batch-record agent tool calls",
    );
  }
}

/**
 * Complete a session — update with final metrics and status.
 * Called when the agent loop finishes (success, error, or limit reached).
 */
export async function completeSession(params: {
  id: string;
  status: AgentSessionStatus;
  iterationCount: number;
  toolCallCount: number;
  totalCreditsUsed: number;
  inputTokens: number;
  outputTokens: number;
  finalResponse?: string;
  error?: string;
  durationMs: number;
}): Promise<void> {
  try {
    await prisma.agentSession.update({
      where: { id: params.id },
      data: {
        status: params.status,
        iterationCount: params.iterationCount,
        toolCallCount: params.toolCallCount,
        totalCreditsUsed: params.totalCreditsUsed,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        finalResponse: params.finalResponse,
        error: params.error,
        durationMs: params.durationMs,
        completedAt: new Date(),
      },
    });

    log.debug(
      { sessionId: params.id, status: params.status, durationMs: params.durationMs },
      "Agent session completed",
    );
  } catch (error) {
    log.error(
      { sessionId: params.id, error: (error as Error).message },
      "Failed to complete agent session record",
    );
  }
}

// ===========================================
// Query Methods
// ===========================================

/**
 * Get a session by ID (with tool calls).
 */
export async function getSession(sessionId: string) {
  return prisma.agentSession.findUnique({
    where: { id: sessionId },
    include: {
      toolCalls: {
        orderBy: { sequence: "asc" },
      },
    },
  });
}

/**
 * Get a user's agent session history (paginated).
 */
export async function getUserSessions(
  userId: string,
  options: {
    organizationId?: string;
    workspaceId?: string;
    status?: AgentSessionStatus;
    limit?: number;
    offset?: number;
  } = {},
) {
  const { organizationId, workspaceId, status, limit = 20, offset = 0 } = options;

  const where: Record<string, unknown> = { userId };
  if (organizationId) where.organizationId = organizationId;
  if (workspaceId) where.workspaceId = workspaceId;
  if (status) where.status = status;

  const [sessions, total] = await Promise.all([
    prisma.agentSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: { toolCalls: true },
        },
      },
    }),
    prisma.agentSession.count({ where }),
  ]);

  return { sessions, total };
}

/**
 * Get aggregate usage stats for a user or org.
 */
export async function getAgentUsageStats(
  userId: string,
  organizationId?: string,
  periodStart?: Date,
) {
  const where: Record<string, unknown> = { userId };
  if (organizationId) where.organizationId = organizationId;
  if (periodStart) where.startedAt = { gte: periodStart };

  const stats = await prisma.agentSession.aggregate({
    where,
    _count: true,
    _sum: {
      totalCreditsUsed: true,
      iterationCount: true,
      toolCallCount: true,
      inputTokens: true,
      outputTokens: true,
    },
    _avg: {
      durationMs: true,
      iterationCount: true,
    },
  });

  return {
    totalSessions: stats._count,
    totalCreditsUsed: stats._sum.totalCreditsUsed ?? 0,
    totalIterations: stats._sum.iterationCount ?? 0,
    totalToolCalls: stats._sum.toolCallCount ?? 0,
    totalInputTokens: stats._sum.inputTokens ?? 0,
    totalOutputTokens: stats._sum.outputTokens ?? 0,
    avgDurationMs: Math.round(stats._avg.durationMs ?? 0),
    avgIterations: Math.round((stats._avg.iterationCount ?? 0) * 10) / 10,
  };
}
