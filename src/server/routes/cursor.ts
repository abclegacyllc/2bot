/**
 * Cursor Routes
 *
 * API routes for the multi-worker cursor streaming system.
 *
 * @module server/routes/cursor
 */

import * as agentSessionService from "@/modules/2bot-ai-agent/agent-session.service";
import type { AgentSessionStatus } from "@/modules/2bot-ai-agent/agent.types";
import { resolveUserAnswer, runWorkerStream, type WorkerStreamRequest } from "@/modules/cursor/cursor-worker-runner";
import { BadRequestError, RateLimitError } from "@/shared/errors";
import { Router, type Request, type Response } from "express";

import { RateLimiterRes } from 'rate-limiter-flexible';
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { createRateLimiter } from "../middleware/rate-limit";

export const cursorRouter = Router();

// All cursor routes require authentication
cursorRouter.use(requireAuth);

// ===========================================
// SSE Event Buffer for Reconnect Support
// ===========================================

interface BufferedEvent {
  id: number;
  data: unknown;
}

/** Per-session event buffer for SSE reconnect/resume */
const sessionEventBuffers = new Map<string, { events: BufferedEvent[]; expiresAt: number }>();
const MAX_BUFFERED_EVENTS = 100;
const BUFFER_TTL_MS = 5 * 60 * 1000; // 5 minutes

function bufferEvent(sessionId: string, eventId: number, data: unknown): void {
  let buffer = sessionEventBuffers.get(sessionId);
  if (!buffer) {
    buffer = { events: [], expiresAt: Date.now() + BUFFER_TTL_MS };
    sessionEventBuffers.set(sessionId, buffer);
  }
  buffer.events.push({ id: eventId, data });
  // Cap buffer size
  if (buffer.events.length > MAX_BUFFERED_EVENTS) {
    buffer.events = buffer.events.slice(-MAX_BUFFERED_EVENTS);
  }
}

/** Clean expired buffers periodically */
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, buffer] of sessionEventBuffers) {
    if (buffer.expiresAt < now) {
      sessionEventBuffers.delete(sessionId);
    }
  }
}, 60_000);

// Per-user rate limiter for worker-stream (5 streams per 60s)
const cursorWorkerStreamLimiter = createRateLimiter({
  keyPrefix: "cursor-worker-stream",
  points: 5,
  duration: 60,
  blockDuration: 120,
});

/**
 * POST /api/cursor/worker-stream
 *
 * Start a multi-worker streaming session.
 * The backend routes the message to the right worker (Assistant or Coder)
 * using a zero-cost heuristic. Workers can hand off to each other.
 *
 * Returns Server-Sent Events (SSE) with CursorAgentEvent payloads.
 *
 * Body: { message: string; pluginSlug?: string; pluginName?: string; mode?: "create"|"edit" }
 */
cursorRouter.post(
  "/worker-stream",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    try {
      await cursorWorkerStreamLimiter.consume(req.user.id);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        throw new RateLimitError("Too many requests. Please wait.", 60);
      }
      // Redis error — fail open
    }

    const body = req.body as Partial<WorkerStreamRequest>;
    if (!body.message) {
      throw new BadRequestError("Missing required field: message");
    }

    // Validate repoUrl if provided — must be HTTPS GitHub/GitLab URL
    if (body.repoUrl) {
      try {
        const url = new URL(body.repoUrl);
        if (url.protocol !== "https:") {
          throw new BadRequestError("repoUrl must use HTTPS");
        }
      } catch (e) {
        if (e instanceof BadRequestError) throw e;
        throw new BadRequestError("repoUrl must be a valid URL");
      }
    }

    const workerRequest: WorkerStreamRequest = {
      message: body.message,
      userId: req.user.id,
      organizationId: (req.user as { organizationId?: string | null }).organizationId ?? null,
      pluginSlug: body.pluginSlug,
      pluginName: body.pluginName,
      mode: body.mode,
      modelId: body.modelId,
      repoUrl: body.repoUrl,
      repoBranch: body.repoBranch,
      description: body.description,
    };

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Keepalive ping (important for ask_user pauses)
    const keepaliveTimer = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15_000);

    let closed = false;
    req.on("close", () => {
      closed = true;
      clearInterval(keepaliveTimer);
    });

    try {
      const stream = runWorkerStream(workerRequest);
      let eventId = 0;
      for await (const event of stream) {
        eventId++;

        // Buffer event for reconnect support
        const sessionId = (event as unknown as Record<string, unknown>).sessionId as string | undefined;
        if (sessionId) {
          bufferEvent(sessionId, eventId, event);
        }

        if (closed) continue; // Keep generator running to buffer events
        res.write(`id: ${eventId}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      if (!closed) {
        res.write(`data: ${JSON.stringify({ type: "error", message: (err as Error).message })}\n\n`);
      }
    } finally {
      clearInterval(keepaliveTimer);
      if (!closed) {
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  }),
);

/**
 * POST /api/cursor/worker-answer
 *
 * Provide an answer to a pending ask_user question.
 * The worker stream pauses when it asks the user a question via ask_user.
 * This endpoint resolves that pending question so the stream continues.
 *
 * Body: { sessionId: string; answer: string }
 */
cursorRouter.post(
  "/worker-answer",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { sessionId, answer } = req.body as { sessionId?: string; answer?: string };
    if (!sessionId || answer === undefined) {
      throw new BadRequestError("sessionId and answer are required");
    }

    const resolved = resolveUserAnswer(sessionId, answer, req.user.id);
    if (!resolved) {
      throw new BadRequestError("No pending question found for this session. It may have timed out.");
    }

    res.json({ success: true, data: { message: "Answer received" } });
  }),
);

/**
 * GET /api/cursor/worker-resume
 *
 * Resume a disconnected SSE stream by replaying missed events.
 * The client provides the sessionId and the last event ID it received.
 * Returns all buffered events after that ID.
 *
 * Query: ?sessionId=X&lastEventId=Y
 */
cursorRouter.get(
  "/worker-resume",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const sessionId = req.query.sessionId as string | undefined;
    const lastEventIdStr = req.query.lastEventId as string | undefined;

    if (!sessionId) {
      throw new BadRequestError("sessionId query parameter is required");
    }

    const lastEventId = lastEventIdStr ? parseInt(lastEventIdStr, 10) : 0;
    if (Number.isNaN(lastEventId)) {
      throw new BadRequestError("lastEventId must be a number");
    }

    const buffer = sessionEventBuffers.get(sessionId);
    if (!buffer) {
      res.json({ success: true, data: { events: [], complete: true } });
      return;
    }

    const missedEvents = buffer.events
      .filter((e) => e.id > lastEventId)
      .map((e) => ({ id: e.id, ...e.data as Record<string, unknown> }));

    // Check if the stream has completed (last event is "done" or "error")
    const lastEvent = buffer.events[buffer.events.length - 1];
    const lastEventType = lastEvent ? (lastEvent.data as Record<string, unknown>).type : undefined;
    const complete = lastEventType === "done" || lastEventType === "error";

    res.json({ success: true, data: { events: missedEvents, complete } });
  }),
);

// ═══════════════════════════════════════════════════════
// Session History Endpoints
// ═══════════════════════════════════════════════════════

/**
 * GET /api/cursor/sessions
 *
 * List authenticated user's cursor agent sessions (paginated).
 * Query: ?limit=20&offset=0&status=completed
 */
cursorRouter.get(
  "/sessions",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
    const status = req.query.status as string | undefined;

    const validStatuses = ["running", "completed", "error", "max_iterations", "max_credits", "cancelled", "awaiting_approval"];
    if (status && !validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }

    const result = await agentSessionService.getUserSessions(req.user.id, {
      organizationId: (req.user as { organizationId?: string | null }).organizationId ?? undefined,
      status: status as AgentSessionStatus | undefined,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        sessions: result.sessions.map((s) => ({
          id: s.id,
          model: s.model,
          status: s.status,
          prompt: s.prompt,
          finalResponse: s.finalResponse?.slice(0, 300),
          totalCreditsUsed: s.totalCreditsUsed,
          iterationCount: s.iterationCount,
          toolCallCount: s._count.toolCalls,
          durationMs: s.durationMs,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
        })),
        total: result.total,
        limit,
        offset,
      },
    });
  }),
);

/**
 * GET /api/cursor/sessions/:id
 *
 * Get a single session with its tool call history.
 */
cursorRouter.get(
  "/sessions/:id",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const sessionId = req.params.id as string;
    const session = await agentSessionService.getSession(sessionId);
    if (!session || session.userId !== req.user.id) {
      throw new BadRequestError("Session not found");
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        model: session.model,
        status: session.status,
        prompt: session.prompt,
        finalResponse: session.finalResponse,
        error: session.error,
        totalCreditsUsed: session.totalCreditsUsed,
        iterationCount: session.iterationCount,
        inputTokens: session.inputTokens,
        outputTokens: session.outputTokens,
        durationMs: session.durationMs,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        toolCalls: session.toolCalls.map((tc) => ({
          toolName: tc.toolName,
          isError: tc.isError,
          durationMs: tc.durationMs,
          sequence: tc.sequence,
          output: typeof tc.output === "string" ? tc.output.slice(0, 500) : tc.output,
          createdAt: tc.createdAt,
        })),
      },
    });
  }),
);
