/**
 * Project Version Routes (Wave 1)
 *
 * REST endpoints for managing project version snapshots.
 *
 *   GET    /projects/:projectId/versions          List versions
 *   POST   /projects/:projectId/versions          Create STAGING snapshot
 *   GET    /projects/:projectId/versions/:id      Get version with manifest
 *   POST   /projects/:projectId/versions/:id/activate    Promote to ACTIVE
 *   POST   /projects/:projectId/versions/:id/rollback    Roll back to this version
 *
 * Behind FEATURE_PROJECT_VERSIONS env flag (default: disabled).
 *
 * @module server/routes/project-version
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
    activateVersion,
    createStagingVersion,
    getVersionWithManifest,
    listVersions,
    rollbackToVersion,
} from "@/modules/project/project-version.service";
import { BadRequestError, ForbiddenError } from "@/shared/errors";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { requireOrgHeaderMembership } from "../middleware/org-auth";

export const projectVersionRouter = Router({ mergeParams: true });

// Feature-flag gate (mirrors cursor-buildspec pattern)
projectVersionRouter.use((req, _res, next) => {
  const flag = process.env.FEATURE_PROJECT_VERSIONS ?? "disabled";
  if (flag === "disabled") {
    return next(new ForbiddenError("FEATURE_PROJECT_VERSIONS is disabled"));
  }
  next();
});

projectVersionRouter.use(requireAuth);
projectVersionRouter.use(requireOrgHeaderMembership);

// ===========================================
// Helpers
// ===========================================

function getOwner(req: Request) {
  if (!req.user) throw new BadRequestError("User not authenticated");
  const orgHeader = req.headers["x-organization-id"];
  const organizationId = typeof orgHeader === "string" && orgHeader ? orgHeader : null;
  return { userId: req.user.id, organizationId };
}

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new BadRequestError(`Missing route parameter: ${name}`);
  }
  return value;
}

// ===========================================
// Schemas
// ===========================================

const CreateVersionSchema = z.object({
  source: z.string().max(64).optional(),
  buildspecHash: z.string().max(128).optional(),
});

const RollbackSchema = z.object({
  reason: z.string().min(1).max(512),
});

// ===========================================
// Routes
// ===========================================

projectVersionRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const projectId = getParam(req, "projectId");
    const versions = await listVersions(owner, projectId);
    res.json({ success: true, data: versions, meta: { total: versions.length } });
  }),
);

projectVersionRouter.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const projectId = getParam(req, "projectId");
    const body = CreateVersionSchema.parse(req.body ?? {});
    const version = await createStagingVersion(owner, projectId, {
      ...body,
      appliedBy: owner.userId,
    });
    res.status(201).json({ success: true, data: version });
  }),
);

projectVersionRouter.get(
  "/:versionId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const versionId = getParam(req, "versionId");
    const version = await getVersionWithManifest(owner, versionId);
    res.json({ success: true, data: version });
  }),
);

projectVersionRouter.post(
  "/:versionId/activate",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const versionId = getParam(req, "versionId");
    const version = await activateVersion(owner, versionId);
    res.json({ success: true, data: version });
  }),
);

projectVersionRouter.post(
  "/:versionId/rollback",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const versionId = getParam(req, "versionId");
    const { reason } = RollbackSchema.parse(req.body ?? {});
    const version = await rollbackToVersion(owner, versionId, reason);
    res.json({ success: true, data: version });
  }),
);
