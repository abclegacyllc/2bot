/**
 * Cursor Routes
 *
 * API routes for the multi-worker cursor streaming system.
 *
 * @module server/routes/cursor
 */

import * as agentSessionService from "@/modules/2bot-ai-agent/agent-session.service";
import type { AgentSessionStatus } from "@/modules/2bot-ai-agent/agent.types";
import {
    listUserInvocableAgents,
    summarizeAgent,
    type AgentSummary,
} from "@/modules/cursor/agents";
import { pushCorrection, resolveUserAnswer, runWorkerStream, tryResolveUserAnswerCrossReplica, type WorkerStreamRequest } from "@/modules/cursor/cursor-worker-runner";
import { getSessionOwner, setCancelFlagRedis } from "@/modules/cursor/cursor-session-store";
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
const MAX_BUFFERED_EVENTS = 500;
const MAX_BUFFERED_SESSIONS = 500; // Cap total sessions in buffer to prevent memory growth
const BUFFER_TTL_MS = 10 * 60 * 1000; // 10 minutes

function bufferEvent(sessionId: string, eventId: number, data: unknown): void {
  let buffer = sessionEventBuffers.get(sessionId);
  if (!buffer) {
    // Evict oldest sessions if at capacity
    if (sessionEventBuffers.size >= MAX_BUFFERED_SESSIONS) {
      let oldestKey: string | null = null;
      let oldestExpiry = Infinity;
      for (const [key, buf] of sessionEventBuffers) {
        if (buf.expiresAt < oldestExpiry) {
          oldestExpiry = buf.expiresAt;
          oldestKey = key;
        }
      }
      if (oldestKey) sessionEventBuffers.delete(oldestKey);
    }
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
 * GET /api/cursor/agents
 *
 * Returns the catalog of agents the user can pick from in the studio
 * dropdown. Subagents (e.g. `explore`) are excluded — they are only
 * invokable as children of another agent.
 *
 * will extend this with per-user / per-org custom agents.
 */
cursorRouter.get(
  "/agents",
  asyncHandler(async (_req: Request, res: Response) => {
    const agents: AgentSummary[] = listUserInvocableAgents().map(summarizeAgent);
    res.json({ agents });
  }),
);

/**
 * GET /api/cursor/index-status
 *
 * Returns the semantic-index health for the user's active workspace.
 * Used by the studio bar's index indicator chip.
 */
cursorRouter.get(
  "/index-status",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { getBridgeClient } = await import("@/modules/cursor/cursor-bridge");
    const bridge = await getBridgeClient(
      req.user.id,
      (req.user as { organizationId?: string | null }).organizationId ?? null,
    ).catch(() => null);

    const workspaceId = bridge?.workspaceId;
    if (!workspaceId) {
      res.json({ ready: false, fileCount: 0, chunkCount: 0, lastIndexedAt: null });
      return;
    }

    const { getIndexStatus } = await import(
      "@/modules/cursor/code-indexer/workspace-embedding.service"
    );
    const status = await getIndexStatus(workspaceId);
    res.json(status);
  }),
);

/**
 * GET /api/cursor/plan/:chatThreadId
 *
 * Returns the persisted chat plan for the given thread, produced by the
 * Plan agent via `update_plan(summary)`. Used by the frontend "View Plan"
 * button to render the full markdown body.
 */
cursorRouter.get(
  "/plan/:chatThreadId",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const chatThreadId = req.params.chatThreadId;
    if (!chatThreadId || typeof chatThreadId !== "string") {
      throw new BadRequestError("chatThreadId is required");
    }

    const { getChatPlan } = await import("@/modules/cursor/cursor-plan.service");
    const plan = await getChatPlan(req.user.id, chatThreadId);
    if (!plan) {
      res.json({ plan: null });
      return;
    }
    res.json({
      plan: {
        markdown: plan.markdown,
        items: plan.items,
        authorAgent: plan.authorAgent,
        updatedAt: plan.updatedAt,
      },
    });
  }),
);

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
      workflowContext: body.workflowContext,
      studioMode: body.studioMode,
      agentName: body.agentName,
      resumeSessionId: body.resumeSessionId,
      userPlan: (req.user as { plan?: string }).plan,
      chatThreadId: body.chatThreadId,
      conversationHistory: body.conversationHistory,
    };

    // User-configured credit budget — clamp defensively (UI also clamps).
    if (typeof body.creditBudgetOverride === "number" && Number.isFinite(body.creditBudgetOverride)) {
      const clamped = Math.max(10, Math.min(500, Math.floor(body.creditBudgetOverride)));
      workerRequest.creditBudgetOverride = clamped;
    }

    // Validate and attach imageParts if present
    if (Array.isArray(body.imageParts) && body.imageParts.length > 0) {
      const MAX_IMAGES = 4;
      const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB per image
      const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
      const validated: Array<{ url: string; mimeType: string }> = [];
      for (const part of body.imageParts.slice(0, MAX_IMAGES)) {
        if (typeof part !== "object" || part === null) continue;
        const { url, mimeType } = part as { url?: unknown; mimeType?: unknown };
        if (typeof url !== "string" || typeof mimeType !== "string") continue;
        if (!ALLOWED_MIME.has(mimeType)) continue;
        // Verify it's a base64 data URL to prevent SSRF via external URLs
        if (!url.startsWith("data:image/")) continue;
        // Rough size check: base64 ≈ 4/3 × raw, so base64 length ≤ MAX_SIZE_BYTES * 1.4
        if (url.length > MAX_SIZE_BYTES * 1.4) continue;
        validated.push({ url, mimeType });
      }
      if (validated.length > 0) workerRequest.imageParts = validated;
    }

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
      let activeSessionId: string | null = null;

      for await (const event of stream) {
        eventId++;

        // Track the session ID from session_start / done / worker_start events
        const evtSessionId = (event as unknown as Record<string, unknown>).sessionId as string | undefined;
        if (evtSessionId) activeSessionId = evtSessionId;

        // Buffer ALL events for reconnect support (not just those with sessionId)
        if (activeSessionId) {
          bufferEvent(activeSessionId, eventId, event);
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
 * Provide an answer to a pending question (destructive action approval).
 * For ask_user questions, sessions are now suspended to DB — use
 * POST /worker-stream with resumeSessionId instead.
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

    // Try in-memory resolve first (for destructive-action approvals that still use Promises)
    const resolved = resolveUserAnswer(sessionId, answer, req.user.id);
    if (resolved) {
      res.json({ success: true, data: { message: "Answer received" } });
      return;
    }

    // Cross-replica fallback: in a multi-replica deployment, the answer may
    // have arrived on a replica that doesn't own this session. Forward it
    // over Redis pub/sub to the owning replica.
    const forwarded = await tryResolveUserAnswerCrossReplica(sessionId, answer, req.user.id);
    if (forwarded) {
      res.json({ success: true, data: { message: "Answer forwarded" } });
      return;
    }

    // Check if this is a suspended session — guide the client to use resume
    const session = await agentSessionService.getSessionForResume(sessionId);
    if (session && session.userId === req.user.id) {
      res.status(200).json({
        success: true,
        data: {
          message: "Session is suspended. Use POST /worker-stream with resumeSessionId to resume.",
          suspended: true,
          sessionId,
        },
      });
      return;
    }

    throw new BadRequestError("No pending question found for this session. It may have timed out or completed.");
  }),
);

/**
 * POST /api/cursor/worker-correction
 *
 * Push a mid-stream correction into a running session.
 * The runner picks them up at the start of the next iteration.
 *
 * Body: { sessionId: string; correction: string }
 */
cursorRouter.post(
  "/worker-correction",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { sessionId, correction } = req.body as { sessionId?: string; correction?: string };
    if (!sessionId || !correction || typeof correction !== "string") {
      throw new BadRequestError("sessionId and correction are required");
    }
    if (correction.length > 2000) {
      throw new BadRequestError("correction is too long (max 2000 chars)");
    }

    const pushed = pushCorrection(sessionId, correction.trim());
    if (!pushed) {
      throw new BadRequestError("Too many pending corrections — wait for the agent to process them");
    }

    res.json({ success: true, data: { message: "Correction queued" } });
  }),
);

/**
 * POST /api/cursor/worker-cancel
 *
 * User-initiated stop. Sets a cancel flag in Redis that the agent loop
 * polls between iterations and between sequential tool calls — so the
 * next billable LLM call does not fire and any in-flight tool chain bails
 * out at the next safe checkpoint.
 *
 * Distinct from closing the SSE connection: a closed connection keeps the
 * runner alive on the server (so the user can reconnect and resume).
 * Cancel actively halts the runner and stops billing.
 *
 * Auth: only the session owner can cancel their own session. We resolve
 * the session's userId from `getSessionOwner` and reject if it doesn't
 * match the authenticated user. Org membership is enforced upstream via
 * the same auth middleware that runs on /worker-stream.
 *
 * Body: { sessionId: string }
 *
 * Idempotent — repeated calls just refresh the flag's TTL.
 */
cursorRouter.post(
  "/worker-cancel",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId || typeof sessionId !== "string") {
      throw new BadRequestError("sessionId is required");
    }

    // Authorise: only the session's owning user can cancel it.
    const owner = await getSessionOwner(sessionId);
    if (owner && owner.userId !== req.user.id) {
      // Mirror the not-found shape rather than 403 to avoid leaking the
      // existence of someone else's session id.
      res.json({ success: true, data: { message: "No active session" } });
      return;
    }

    await setCancelFlagRedis(sessionId);
    res.json({ success: true, data: { message: "Cancel signal sent" } });
  }),
);

/**
 * POST /api/cursor/terminal-approval
 *
 * Approve or skip a terminal command the agent wants to run.
 * The runner is waiting via waitForUserAnswer.
 *
 * Body: { sessionId: string; approved: boolean }
 */
cursorRouter.post(
  "/terminal-approval",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { sessionId, approved } = req.body as { sessionId?: string; approved?: boolean };
    if (!sessionId || typeof approved !== "boolean") {
      throw new BadRequestError("sessionId and approved (boolean) are required");
    }

    const { resolveUserAnswer, tryResolveUserAnswerCrossReplica } = await import("@/modules/cursor/cursor-worker-runner");
    const answer = approved ? "__terminal_allow__" : "__terminal_skip__";
    const resolved =
      resolveUserAnswer(sessionId, answer, req.user.id) ||
      (await tryResolveUserAnswerCrossReplica(sessionId, answer, req.user.id));
    if (!resolved) {
      // Session already finished or approval was already handled — not an error,
      // just a stale fire-and-forget call from the UI.
      res.json({ success: true, data: { message: "No pending confirmation (already resolved or session ended)" } });
      return;
    }

    res.json({ success: true, data: { message: approved ? "Command approved" : "Command skipped" } });
  }),
);

/**
 * POST /api/cursor/sessions/:id/revert-file
 *
 * Revert a single file to the content before the agent modified it.
 *
 * Body: { path: string; originalContent: string | null }
 */
cursorRouter.post(
  "/sessions/:id/revert-file",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { path: filePath, originalContent } = req.body as {
      path?: string;
      originalContent?: string | null;
    };
    if (!filePath || typeof filePath !== "string") {
      throw new BadRequestError("path is required");
    }

    // Validate path — must be under plugins/ to prevent directory traversal
    if (!filePath.startsWith("plugins/") && !filePath.match(/^plugins\//)) {
      throw new BadRequestError("path must be under plugins/");
    }

    const { getBridgeClient } = await import("@/modules/cursor/cursor-bridge");
    const bridge = await getBridgeClient(req.user.id, (req.user as { organizationId?: string | null }).organizationId ?? null);
    if (!bridge?.client) {
      throw new BadRequestError("No workspace connection. The workspace must be running to revert files.");
    }

    if (originalContent === null || originalContent === undefined) {
      // File was created by the agent — delete it to revert
      await bridge.client.fileDelete(filePath);
    } else {
      // File was modified — restore original content
      await bridge.client.fileWrite(filePath, originalContent);
    }

    res.json({ success: true, data: { message: `Reverted ${filePath}` } });
  }),
);

/**
 * POST /api/cursor/worker-restore
 *
 * Undo all file modifications from a Cursor Coder session.
 * Restores files to their pre-modification state with conflict detection.
 *
 * Body: { sessionId: string; force?: boolean }
 */
cursorRouter.post(
  "/worker-restore",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { sessionId, force } = req.body as { sessionId?: string; force?: boolean };
    if (!sessionId) {
      throw new BadRequestError("sessionId is required");
    }

    // Need a bridge client for file operations
    const { getBridgeClient } = await import("@/modules/cursor/cursor-bridge");
    const bridge = await getBridgeClient(req.user.id, (req.user as { organizationId?: string | null }).organizationId ?? null);
    if (!bridge?.client) {
      throw new BadRequestError("No workspace connection. The workspace must be running to restore files.");
    }

    const { restoreFileActions } = await import("@/modules/cursor");
    const result = await restoreFileActions(sessionId, bridge.client, !!force);

    res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/cursor/worker-actions
 *
 * Get tracked file actions for a Cursor session (for undo UI).
 *
 * Query: ?sessionId=X
 */
cursorRouter.get(
  "/worker-actions",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const sessionId = req.query.sessionId as string | undefined;
    if (!sessionId) {
      throw new BadRequestError("sessionId query parameter is required");
    }

    const { getSessionActions } = await import("@/modules/cursor");
    const actions = getSessionActions(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        actionCount: actions.length,
        actions: actions.map((a) => ({
          id: a.id,
          type: a.type,
          path: a.path,
          contentTruncated: a.contentTruncated,
          toolCallId: a.toolCallId,
          timestamp: a.timestamp,
        })),
      },
    });
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

/**
 * POST /api/cursor/sessions/:id/feedback
 *
 * Submit thumbs up/down feedback for a completed session.
 */
cursorRouter.post(
  "/sessions/:id/feedback",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const sessionId = req.params.id as string;
    const { rating, comment } = req.body as { rating?: string; comment?: string };

    if (rating !== "positive" && rating !== "negative") {
      throw new BadRequestError("rating must be 'positive' or 'negative'");
    }

    await agentSessionService.submitFeedback(
      sessionId,
      req.user.id,
      rating,
      typeof comment === "string" ? comment : undefined,
    );

    res.json({ success: true });
  }),
);

// =============================================================================
// Container-Based Session Storage Routes
// =============================================================================

const SESSIONS_DIR = ".2bot/cursor-sessions";
const SESSIONS_INDEX = `${SESSIONS_DIR}/index.json`;
const MAX_CLOUD_SESSIONS = 200;

/**
 * POST /api/cursor/sessions/cloud/sync
 *
 * Save a completed session to the user's workspace container.
 * Writes the session JSON + updates the index file.
 */
cursorRouter.post(
  "/sessions/cloud/sync",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { session } = req.body as { session?: Record<string, unknown> };
    if (!session || typeof session.id !== "string") {
      throw new BadRequestError("session with id is required");
    }

    const { getBridgeClient } = await import("@/modules/cursor/cursor-bridge");
    const bridge = await getBridgeClient(
      req.user.id,
      (req.user as { organizationId?: string | null }).organizationId ?? null,
    );
    if (!bridge?.client) {
      throw new BadRequestError("No workspace connection — container must be running");
    }

    const sessionId = session.id as string;
    const safeName = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Write session file
    await bridge.client.fileWrite(
      `${SESSIONS_DIR}/${safeName}.json`,
      JSON.stringify(session, null, 2),
      true,
    );

    // Update index — read existing, append/update entry, trim to limit
    let index: Array<{
      id: string; userMessage: string; startedAt: string;
      status: string; summary: string | null;
    }> = [];
    try {
      const raw = await bridge.client.fileRead(SESSIONS_INDEX) as string;
      index = JSON.parse(raw);
    } catch {
      // Index doesn't exist yet — start fresh
    }

    // Remove existing entry for this session (if re-syncing)
    index = index.filter((e) => e.id !== sessionId);

    // Add new entry at the end
    index.push({
      id: sessionId,
      userMessage: typeof session.userMessage === "string"
        ? session.userMessage.slice(0, 200)
        : "",
      startedAt: typeof session.startedAt === "string" ? session.startedAt : new Date().toISOString(),
      status: typeof session.status === "string" ? session.status : "completed",
      summary: typeof session.summary === "string" ? session.summary.slice(0, 200) : null,
    });

    // Cap at MAX_CLOUD_SESSIONS (keep newest)
    if (index.length > MAX_CLOUD_SESSIONS) {
      const removed = index.splice(0, index.length - MAX_CLOUD_SESSIONS);
      // Best-effort cleanup of old session files
      for (const old of removed) {
        const oldName = old.id.replace(/[^a-zA-Z0-9_-]/g, "_");
        bridge.client.fileDelete(`${SESSIONS_DIR}/${oldName}.json`).catch(() => {});
      }
    }

    await bridge.client.fileWrite(SESSIONS_INDEX, JSON.stringify(index, null, 2), true);

    res.json({ success: true });
  }),
);

/**
 * GET /api/cursor/sessions/cloud
 *
 * List all sessions stored on the user's workspace container.
 * Returns the lightweight index (not full session data).
 */
cursorRouter.get(
  "/sessions/cloud",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const { getBridgeClient } = await import("@/modules/cursor/cursor-bridge");
    const bridge = await getBridgeClient(
      req.user.id,
      (req.user as { organizationId?: string | null }).organizationId ?? null,
    );
    if (!bridge?.client) {
      res.json({ success: true, data: { sessions: [] } });
      return;
    }

    try {
      const raw = await bridge.client.fileRead(SESSIONS_INDEX) as string;
      const index = JSON.parse(raw);
      res.json({ success: true, data: { sessions: Array.isArray(index) ? index : [] } });
    } catch {
      res.json({ success: true, data: { sessions: [] } });
    }
  }),
);

/**
 * GET /api/cursor/sessions/cloud/:id
 *
 * Fetch a single full session from the user's workspace container.
 */
cursorRouter.get(
  "/sessions/cloud/:id",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    const sessionId = req.params.id as string;
    const safeName = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");

    const { getBridgeClient } = await import("@/modules/cursor/cursor-bridge");
    const bridge = await getBridgeClient(
      req.user.id,
      (req.user as { organizationId?: string | null }).organizationId ?? null,
    );
    if (!bridge?.client) {
      throw new BadRequestError("No workspace connection — container must be running");
    }

    try {
      const raw = await bridge.client.fileRead(`${SESSIONS_DIR}/${safeName}.json`) as string;
      const session = JSON.parse(raw);
      res.json({ success: true, data: { session } });
    } catch {
      res.status(404).json({ success: false, error: "Session not found" });
    }
  }),
);
