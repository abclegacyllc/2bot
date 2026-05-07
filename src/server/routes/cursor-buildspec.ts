/**
 * Cursor BuildSpec Orchestrator Routes
 *
 * Apply layer for the unified Cursor chat experience. The Cursor Builder
 * agent emits a BuildSpec inside the chat stream; this router validates
 * and applies it. There is no separate "AI builder" surface — these
 * endpoints are the apply step of the same conversation.
 *
 *   POST /cursor/buildspec/validate      Validate a BuildSpec without mutating.
 *   POST /cursor/buildspec/apply         Validate + apply + smoke + activate.
 *                                        Synchronous; reply when finished.
 *   POST /cursor/buildspec/apply/async   Same, but returns a runId immediately
 *                                        and runs on the BuildSpec worker.
 *   GET  /cursor/buildspec/runs/:runId   Poll the status of an async apply.
 *   GET  /cursor/buildspec/runs          List recent async applies.
 *
 * Gated behind the `FEATURE_CURSOR_BUILDSPEC` flag (default "disabled").
 *
 * @module server/routes/cursor-buildspec
 */

import { Router, type NextFunction, type Request, type Response } from "express";
import { RateLimiterRes } from "rate-limiter-flexible";

import { rateLimitRejectionsTotal } from "@/lib/metrics";
import {
    createQueuedRun,
    getRunForOwner,
    listRunsForOwner,
} from "@/modules/cursor/buildspec/buildspec-run.service";
import { enqueueBuildSpecApply } from "@/modules/cursor/buildspec/buildspec-queue";
import {
    applyBuildSpec,
    validateBuildSpec,
} from "@/modules/cursor/buildspec/orchestrator.service";
import { BadRequestError, ForbiddenError, RateLimitError } from "@/shared/errors";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { requireOrgHeaderMembership } from "../middleware/org-auth";
import { createRateLimiter } from "../middleware/rate-limit";

export const cursorBuildspecRouter = Router();

// Feature flag gate (per-request to allow live toggling).
// Honour the legacy FEATURE_AI_BUILDER name during the rename so existing
// .env files keep working without a deploy-time change.
cursorBuildspecRouter.use((_req, _res, next) => {
  const raw =
    process.env.FEATURE_CURSOR_BUILDSPEC ??
    process.env.FEATURE_AI_BUILDER ??
    "disabled";
  if (raw.toLowerCase() === "disabled") {
    return next(
      new ForbiddenError(
        "Cursor BuildSpec orchestrator is disabled (FEATURE_CURSOR_BUILDSPEC=disabled)",
      ),
    );
  }
  return next();
});

cursorBuildspecRouter.use(requireAuth);
cursorBuildspecRouter.use(requireOrgHeaderMembership);

// hardening — per-user rate limit on the apply path
// (5 applies per minute per authenticated user). Validate is unbounded
// because it's a pure function with no side effects.
const applyLimiter = createRateLimiter({
  keyPrefix: "cursor-buildspec-apply",
  points: 5,
  duration: 60,
});

const applyRateLimit = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) throw new BadRequestError("User not authenticated");
  try {
    const result = await applyLimiter.consume(userId);
    res.setHeader("X-RateLimit-Limit", 5);
    res.setHeader("X-RateLimit-Remaining", result.remainingPoints);
    return next();
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      const retryAfter = Math.ceil(err.msBeforeNext / 1000);
      res.setHeader("Retry-After", retryAfter);
      rateLimitRejectionsTotal.inc({ route: "POST:/cursor/buildspec/apply", scope: "user" });
      throw new RateLimitError(
        `Too many BuildSpec apply attempts. Try again in ${retryAfter}s.`,
        retryAfter,
      );
    }
    // Redis outage — fail open with warning header (validate is still required)
    res.setHeader("X-RateLimit-Bypass", "redis-unavailable");
    return next();
  }
});

function getOwner(req: Request) {
  if (!req.user) throw new BadRequestError("User not authenticated");
  const orgHeader = req.headers["x-organization-id"];
  const organizationId = typeof orgHeader === "string" && orgHeader ? orgHeader : null;
  return { userId: req.user.id, organizationId };
}

/**
 * POST /cursor/buildspec/validate
 * Body: { spec: <raw BuildSpec> }
 * Returns: { ok: true } | { ok: false, errors: { path: string[] } }
 */
cursorBuildspecRouter.post(
  "/validate",
  asyncHandler(async (req: Request, res: Response) => {
    const spec = req.body?.spec;
    if (spec === undefined || spec === null) throw new BadRequestError("Missing 'spec' in request body");

    const result = validateBuildSpec(spec);
    if (result.ok) {
      res.json({ success: true, data: { ok: true } });
    } else {
      res.status(400).json({ success: false, data: { ok: false, errors: result.errors } });
    }
  }),
);

/**
 * POST /cursor/buildspec/apply
 * Body: { spec, options?: { dryRun?, rollbackOnSmokeFailure?, source? } }
 * Returns: BuildSpecApplyResult
 */
cursorBuildspecRouter.post(
  "/apply",
  applyRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const spec = req.body?.spec;
    if (spec === undefined || spec === null) throw new BadRequestError("Missing 'spec' in request body");

    const options = (req.body?.options ?? {}) as {
      dryRun?: boolean;
      rollbackOnSmokeFailure?: boolean;
      source?: string;
    };

    const result = await applyBuildSpec(owner, spec, {
      dryRun: Boolean(options.dryRun),
      rollbackOnSmokeFailure: options.rollbackOnSmokeFailure ?? true,
      source: typeof options.source === "string" ? options.source : "api",
    });

    const status = result.status === "applied" ? 200 : 400;
    res.status(status).json({ success: result.status === "applied", data: result });
  }),
);

/**
 * POST /cursor/buildspec/apply/async
 *
 * Same input as /apply but enqueues the work on the BuildSpec worker queue
 * and returns a runId immediately. Suitable for large specs whose
 * smoke-test phase would otherwise hold the request open past timeouts.
 *
 * Response: 202 Accepted, { runId, statusUrl }
 *
 * Poll the runId via GET /cursor/buildspec/runs/:runId until status is one of
 * APPLIED / ROLLED_BACK / VALIDATION_FAILED / FAILED.
 */
cursorBuildspecRouter.post(
  "/apply/async",
  applyRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const spec = req.body?.spec;
    if (spec === undefined || spec === null) {
      throw new BadRequestError("Missing 'spec' in request body");
    }

    const options = (req.body?.options ?? {}) as {
      dryRun?: boolean;
      rollbackOnSmokeFailure?: boolean;
      source?: string;
    };

    const run = await createQueuedRun({
      owner,
      spec,
      options: {
        dryRun: Boolean(options.dryRun),
        rollbackOnSmokeFailure: options.rollbackOnSmokeFailure ?? true,
        source: typeof options.source === "string" ? options.source : "api",
      },
    });

    await enqueueBuildSpecApply({ runId: run.id });

    res.status(202).json({
      success: true,
      data: {
        runId: run.id,
        status: run.status,
        statusUrl: `/api/cursor/buildspec/runs/${run.id}`,
      },
    });
  }),
);

/**
 * GET /cursor/buildspec/runs/:runId
 *
 * Owner-scoped status read. Returns the full BuildSpecApplyResult once the
 * run is terminal (status APPLIED / ROLLED_BACK / VALIDATION_FAILED / FAILED).
 * Returns 404 if the run id does not exist or belongs to another tenant
 * (membership is gated by requireOrgHeaderMembership for org scope).
 */
cursorBuildspecRouter.get(
  "/runs/:runId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const runId = req.params.runId;
    if (typeof runId !== "string" || !runId) {
      throw new BadRequestError("Missing runId");
    }
    const run = await getRunForOwner(runId, owner);
    res.json({ success: true, data: run });
  }),
);

/**
 * GET /cursor/buildspec/runs
 *
 * Owner-scoped list, newest first. Optional query: ?status=APPLIED|...,
 * ?limit=N (default 50, max 200).
 */
cursorBuildspecRouter.get(
  "/runs",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const limitRaw = req.query.limit;
    const statusRaw = req.query.status;
    const limit =
      typeof limitRaw === "string" && /^\d+$/.test(limitRaw)
        ? parseInt(limitRaw, 10)
        : undefined;
    const status =
      typeof statusRaw === "string" &&
      ["QUEUED", "RUNNING", "APPLIED", "ROLLED_BACK", "VALIDATION_FAILED", "FAILED"].includes(
        statusRaw,
      )
        ? (statusRaw as
            | "QUEUED"
            | "RUNNING"
            | "APPLIED"
            | "ROLLED_BACK"
            | "VALIDATION_FAILED"
            | "FAILED")
        : undefined;

    const rows = await listRunsForOwner(owner, { limit, status });
    res.json({ success: true, data: rows });
  }),
);
