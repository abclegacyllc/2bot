/**
 * Cursor Routes
 *
 * Dedicated API routes for the visual cursor action system.
 * Thin route layer — delegates to cursorService for all logic.
 *
 * @module server/routes/cursor
 */

import { cursorService, type CursorActionBody } from "@/modules/cursor";
import { resolveUserAnswer, runWorkerStream, type WorkerStreamRequest } from "@/modules/cursor/cursor-worker-runner";
import { BadRequestError, RateLimitError } from "@/shared/errors";
import { createServiceContext } from "@/shared/types/context";
import { Router, type Request, type Response } from "express";

import { RateLimiterRes } from 'rate-limiter-flexible';
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { createRateLimiter } from "../middleware/rate-limit";

export const cursorRouter = Router();

// All cursor routes require authentication
cursorRouter.use(requireAuth);

// Per-user rate limiter for cursor-action (10 actions per 60s, block for 120s)
const cursorActionLimiter = createRateLimiter({
  keyPrefix: "cursor-action",
  points: 10,
  duration: 60,
  blockDuration: 120,
});

/**
 * POST /api/cursor/action
 *
 * Execute a real platform action on behalf of the Cursor.
 * The cursor brain collects parameters + secrets and sends them here.
 *
 * Supported actions:
 * - create_gateway: Create a new gateway
 * - delete_gateway: Delete a gateway by ID or name
 * - create_plugin: Create a custom plugin
 * - generate_plugin_code: Generate code only (no DB)
 * - install_plugin: Install a store plugin
 * - delete_plugin: Delete a custom plugin (by ID or name)
 * - start_plugin: Enable/start a user plugin by name
 * - stop_plugin: Stop/disable a user plugin by name
 * - start_workspace: Start (or create) the user's workspace
 * - design_plugin: Multi-turn conversation to design a plugin spec
 * - chat_with_cursor: General conversational chat
 * - classify_intent: LLM-based intent classification
 */
cursorRouter.post(
  "/action",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");

    // Per-user rate limiting — 10 actions per 60 seconds
    try {
      await cursorActionLimiter.consume(req.user.id);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        throw new RateLimitError("Too many cursor actions. Please slow down.", 60);
      }
      // Redis error — fail open
    }

    const ctx = createServiceContext(
      {
        userId: req.user.id,
        role: req.user.role,
        plan: req.user.plan,
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string | undefined,
        requestId: req.headers["x-request-id"] as string | undefined,
      },
    );

    const body = req.body as CursorActionBody;
    const responseData = await cursorService.executeAction(ctx, body);

    res.json(responseData);
  }),
);

// ═══════════════════════════════════════════════════════
// Multi-Worker Endpoints
// ═══════════════════════════════════════════════════════

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

    const workerRequest: WorkerStreamRequest = {
      message: body.message,
      userId: req.user.id,
      organizationId: (req.user as { organizationId?: string | null }).organizationId ?? null,
      pluginSlug: body.pluginSlug,
      pluginName: body.pluginName,
      mode: body.mode,
      modelId: body.modelId,
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
      for await (const event of stream) {
        if (closed) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
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
