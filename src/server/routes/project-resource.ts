/**
 * Project Resource Routes (Path C)
 *
 * REST endpoints for the polymorphic ProjectResource layer.
 *
 *   GET    /projects/:projectId/resources              List resources
 *   GET    /projects/:projectId/resources/:resourceId  Get resource (+sidecar)
 *   POST   /projects/:projectId/resources              Create resource
 *   PATCH  /projects/:projectId/resources/:resourceId  Update resource
 *   POST   /projects/:projectId/resources/:resourceId/archive  Archive
 *   DELETE /projects/:projectId/resources/:resourceId  Delete (non-GATEWAY_BOT only)
 *
 * ships GATEWAY_BOT only; create endpoint is exposed but rejects
 * non-GATEWAY_BOT kinds until later phases wire their sidecars.
 *
 * Behind FEATURE_PROJECT_RESOURCES env flag (default: disabled).
 *
 * @module server/routes/project-resource
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
    archiveProjectResource,
    createHttpRouteResource,
    createProjectResource,
    createScheduleResource,
    createSecretResource,
    deleteProjectResource,
    getProjectResourceWithGateway,
    listProjectResources,
    updateHttpRouteSidecar,
    updateProjectResource,
    updateScheduleSidecar,
    updateSecretSidecar,
} from "@/modules/project-resource/project-resource.service";
import { BadRequestError, ForbiddenError } from "@/shared/errors";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const projectResourceRouter = Router({ mergeParams: true });

// Feature-flag gate
projectResourceRouter.use((req, _res, next) => {
  const flag = process.env.FEATURE_PROJECT_RESOURCES ?? "disabled";
  if (flag === "disabled") {
    return next(new ForbiddenError("FEATURE_PROJECT_RESOURCES is disabled"));
  }
  next();
});

projectResourceRouter.use(requireAuth);

// ===========================================
// Helpers
// ===========================================

function getOwner(req: Request) {
  if (!req.user) throw new BadRequestError("User not authenticated");
  const orgHeader = req.headers["x-organization-id"];
  const organizationId =
    typeof orgHeader === "string" && orgHeader ? orgHeader : null;
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

const ResourceKindSchema = z.enum([
  "GATEWAY_BOT",
  "HTTP_ROUTE",
  "SCHEDULE",
  "SECRET",
  "EXTERNAL_API",
  "DATABASE",
  "KV_STORE",
  "OBJECT_STORE",
]);

const ResourceStatusSchema = z.enum(["ACTIVE", "PAUSED", "ERROR", "ARCHIVED"]);

const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "ANY",
]);

const HttpAuthModeSchema = z.enum(["NONE", "API_KEY", "HMAC", "BEARER_JWT"]);

const HttpRouteSpecSchema = z.object({
  method: HttpMethodSchema.optional(),
  path: z.string().min(1).max(512),
  targetUserPluginId: z.string().min(1).nullable().optional(),
  targetExport: z.string().min(1).max(128).nullable().optional(),
  authMode: HttpAuthModeSchema.optional(),
  authConfig: z.record(z.string(), z.unknown()).optional(),
  maxBodyKb: z.number().int().min(0).max(10_000).optional(),
  timeoutMs: z.number().int().min(100).max(60_000).optional(),
  corsOrigin: z.string().max(256).nullable().optional(),
  passthroughBody: z.boolean().optional(),
});

const ScheduleSpecSchema = z.object({
  cron: z.string().min(1).max(200),
  timezone: z.string().min(1).max(64).nullable().optional(),
  targetWorkflowId: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
});

const SECRET_KEY_RE = /^[A-Z0-9_]{1,128}$/;
const SecretSpecSchema = z.object({
  key: z.string().regex(SECRET_KEY_RE, "key must match [A-Z0-9_]{1,128}"),
  value: z.string().min(1).max(64 * 1024),
  description: z.string().max(500).nullable().optional(),
});
const SecretPatchSchema = z.object({
  key: z.string().regex(SECRET_KEY_RE).optional(),
  value: z.string().min(1).max(64 * 1024).optional(),
  description: z.string().max(500).nullable().optional(),
});

const ListQuerySchema = z.object({
  kind: ResourceKindSchema.optional(),
  status: ResourceStatusSchema.optional(),
});

const CreateBodySchema = z.object({
  kind: ResourceKindSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(64).optional(),
  status: ResourceStatusSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  gatewayId: z.string().min(1).optional(),
  /** Required when kind === 'HTTP_ROUTE'. */
  httpRoute: HttpRouteSpecSchema.optional(),
  /** Required when kind === 'SCHEDULE'. */
  schedule: ScheduleSpecSchema.optional(),
  /** Required when kind === 'SECRET'. */
  secret: SecretSpecSchema.optional(),
});

const UpdateBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(64).optional(),
  status: ResourceStatusSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** When set, also patches the HTTP_ROUTE sidecar (kind must be HTTP_ROUTE). */
  httpRoute: HttpRouteSpecSchema.partial().optional(),
  /** When set, also patches the SCHEDULE sidecar (kind must be SCHEDULE). */
  schedule: ScheduleSpecSchema.partial().optional(),
  /** When set, also patches the SECRET sidecar (kind must be SECRET). */
  secret: SecretPatchSchema.optional(),
});

// ===========================================
// Routes
// ===========================================

projectResourceRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const projectId = getParam(req, "projectId");
    const query = ListQuerySchema.parse(req.query ?? {});
    const resources = await listProjectResources(owner, projectId, query);
    res.json({
      success: true,
      data: resources,
      meta: { total: resources.length },
    });
  }),
);

projectResourceRouter.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const projectId = getParam(req, "projectId");
    const body = CreateBodySchema.parse(req.body ?? {});

    if (body.kind === "GATEWAY_BOT") {
      const resource = await createProjectResource(owner, {
        projectId,
        kind: body.kind,
        name: body.name,
        slug: body.slug,
        status: body.status,
        config: body.config,
        metadata: body.metadata ?? null,
        gatewayId: body.gatewayId ?? null,
      });
      res.status(201).json({ success: true, data: resource });
      return;
    }

    if (body.kind === "HTTP_ROUTE") {
      if (!body.httpRoute) {
        throw new BadRequestError("HTTP_ROUTE: body.httpRoute is required");
      }
      const resource = await createHttpRouteResource(owner, {
        projectId,
        name: body.name,
        slug: body.slug,
        status: body.status,
        metadata: body.metadata ?? null,
        httpRoute: body.httpRoute,
      });
      res.status(201).json({ success: true, data: resource });
      return;
    }

    if (body.kind === "SCHEDULE") {
      if (!body.schedule) {
        throw new BadRequestError("SCHEDULE: body.schedule is required");
      }
      const resource = await createScheduleResource(owner, {
        projectId,
        name: body.name,
        slug: body.slug,
        status: body.status,
        metadata: body.metadata ?? null,
        schedule: body.schedule,
      });
      res.status(201).json({ success: true, data: resource });
      return;
    }

    if (body.kind === "SECRET") {
      if (!body.secret) {
        throw new BadRequestError("SECRET: body.secret is required");
      }
      const resource = await createSecretResource(owner, {
        projectId,
        name: body.name,
        slug: body.slug,
        status: body.status,
        metadata: body.metadata ?? null,
        secret: body.secret,
      });
      res.status(201).json({ success: true, data: resource });
      return;
    }

    // Other kinds (EXTERNAL_API, DATABASE, KV_STORE, OBJECT_STORE)
    // are reserved enum values until their phases ship.
    throw new BadRequestError(
      `ProjectResource kind ${body.kind} is reserved for a later phase`,
    );
  }),
);

projectResourceRouter.get(
  "/:resourceId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const resourceId = getParam(req, "resourceId");
    const resource = await getProjectResourceWithGateway(owner, resourceId);
    res.json({ success: true, data: resource });
  }),
);

projectResourceRouter.patch(
  "/:resourceId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const resourceId = getParam(req, "resourceId");
    const body = UpdateBodySchema.parse(req.body ?? {});
    const resource = await updateProjectResource(owner, resourceId, {
      name: body.name,
      slug: body.slug,
      status: body.status,
      config: body.config,
      metadata: body.metadata ?? undefined,
    });
    if (body.httpRoute) {
      await updateHttpRouteSidecar(owner, resourceId, body.httpRoute);
    }
    if (body.schedule) {
      await updateScheduleSidecar(owner, resourceId, body.schedule);
    }
    if (body.secret) {
      await updateSecretSidecar(owner, resourceId, body.secret);
    }
    res.json({ success: true, data: resource });
  }),
);

projectResourceRouter.post(
  "/:resourceId/archive",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const resourceId = getParam(req, "resourceId");
    const resource = await archiveProjectResource(owner, resourceId);
    res.json({ success: true, data: resource });
  }),
);

projectResourceRouter.delete(
  "/:resourceId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const resourceId = getParam(req, "resourceId");
    await deleteProjectResource(owner, resourceId);
    res.status(204).end();
  }),
);
