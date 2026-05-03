/**
 * AI BuildSpec Orchestrator Routes (Wave 1)
 *
 *   POST /ai-builder/validate    Validate a BuildSpec without mutating.
 *   POST /ai-builder/apply       Validate, apply, smoke-test, activate-or-rollback.
 *
 * Gated behind the `FEATURE_AI_BUILDER` flag (default "disabled").
 *
 * @module server/routes/ai-builder
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { RateLimiterRes } from "rate-limiter-flexible";

import {
  applyBuildSpec,
  validateBuildSpec,
} from "@/modules/ai-builder/orchestrator.service";
import { rateLimitRejectionsTotal } from "@/lib/metrics";
import { BadRequestError, ForbiddenError, RateLimitError } from "@/shared/errors";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { createRateLimiter } from "../middleware/rate-limit";

export const aiBuilderRouter = Router();

// Feature flag gate (per-request to allow live toggling).
aiBuilderRouter.use((_req, _res, next) => {
  const flag = (process.env.FEATURE_AI_BUILDER ?? "disabled").toLowerCase();
  if (flag === "disabled") {
    return next(new ForbiddenError("AI BuildSpec orchestrator is disabled (FEATURE_AI_BUILDER=disabled)"));
  }
  return next();
});

aiBuilderRouter.use(requireAuth);

// hardening — per-user rate limit on the apply path
// (5 applies per minute per authenticated user). Validate is unbounded
// because it's a pure function with no side effects.
const applyLimiter = createRateLimiter({
  keyPrefix: "ai-builder-apply",
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
      rateLimitRejectionsTotal.inc({ route: "POST:/ai-builder/apply", scope: "user" });
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
 * POST /ai-builder/validate
 * Body: { spec: <raw BuildSpec> }
 * Returns: { ok: true } | { ok: false, errors: { path: string[] } }
 */
aiBuilderRouter.post(
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
 * POST /ai-builder/apply
 * Body: { spec, options?: { dryRun?, rollbackOnSmokeFailure?, source? } }
 * Returns: BuildSpecApplyResult
 */
aiBuilderRouter.post(
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
