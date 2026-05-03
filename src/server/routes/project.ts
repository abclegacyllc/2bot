/**
 * Project Routes
 *
 * REST endpoints for managing Projects — the unit-of-app that groups
 * Gateways, Workflows, and UserPlugins.
 *
 *   GET    /projects                List projects
 *   POST   /projects                Create a project
 *   GET    /projects/default        Get-or-create the default project
 *   GET    /projects/:id            Get one project
 *   PATCH  /projects/:id            Update a project
 *   DELETE /projects/:id            Archive a project (soft delete)
 *   POST   /projects/:id/link       Link existing resources to a project
 *
 * @module server/routes/project
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
    archiveProject,
    createProject,
    ensureDefaultProject,
    getProject,
    linkResources,
    listProjects,
    updateProject,
} from "@/modules/project/project.service";
import { BadRequestError, ValidationError } from "@/shared/errors";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const projectRouter = Router();
projectRouter.use(requireAuth);

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
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}

function formatZodErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.map((p) => String(p)).join(".") || "_root";
    if (!errors[path]) errors[path] = [];
    errors[path].push(issue.message);
  }
  return errors;
}

// ===========================================
// Schemas
// ===========================================

const projectKindEnum = z.enum(["BOT", "WEB_APP", "AUTOMATION", "HYBRID"]);
const projectStatusEnum = z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]);

const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).nullable().optional(),
  kind: projectKindEnum.optional(),
  icon: z.string().max(64).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  isDefault: z.boolean().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).nullable().optional(),
  kind: projectKindEnum.optional(),
  status: projectStatusEnum.optional(),
  icon: z.string().max(64).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  isDefault: z.boolean().optional(),
});

const listQuerySchema = z.object({
  status: projectStatusEnum.optional(),
  kind: projectKindEnum.optional(),
});

const linkResourcesSchema = z
  .object({
    gatewayIds: z.array(z.string().min(1)).max(500).optional(),
    workflowIds: z.array(z.string().min(1)).max(500).optional(),
    userPluginIds: z.array(z.string().min(1)).max(500).optional(),
  })
  .refine(
    (v) => Boolean(v.gatewayIds?.length || v.workflowIds?.length || v.userPluginIds?.length),
    { message: "At least one of gatewayIds / workflowIds / userPluginIds is required" },
  );

// ===========================================
// Handlers
// ===========================================

projectRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid query parameters", formatZodErrors(parsed.error));
    }
    const projects = await listProjects(owner, parsed.data);
    res.json({ success: true, data: projects, meta: { total: projects.length } });
  }),
);

projectRouter.get(
  "/default",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const project = await ensureDefaultProject(owner);
    res.json({ success: true, data: project });
  }),
);

projectRouter.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", formatZodErrors(parsed.error));
    }
    const project = await createProject(owner, parsed.data);
    res.status(201).json({ success: true, data: project });
  }),
);

projectRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const id = getParam(req, "id");
    const project = await getProject(id, owner);
    res.json({ success: true, data: project });
  }),
);

projectRouter.patch(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const id = getParam(req, "id");
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", formatZodErrors(parsed.error));
    }
    const project = await updateProject(id, owner, parsed.data);
    res.json({ success: true, data: project });
  }),
);

projectRouter.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const id = getParam(req, "id");
    const project = await archiveProject(id, owner);
    res.json({ success: true, data: project });
  }),
);

projectRouter.post(
  "/:id/link",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const id = getParam(req, "id");
    const parsed = linkResourcesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", formatZodErrors(parsed.error));
    }
    const result = await linkResources(id, owner, parsed.data);
    res.json({ success: true, data: result });
  }),
);
