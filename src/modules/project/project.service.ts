/**
 * Project Service
 *
 * A Project is the unit-of-app that groups Gateways, Workflows,
 * and UserPlugins under one logical product (BOT, WEB_APP, AUTOMATION,
 * HYBRID). Every (userId, organizationId) tuple has at most one default
 * project; new resources auto-attach to it when no project is specified.
 *
 * @module modules/project/project.service
 */

import type { Project, ProjectKind, ProjectStatus } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors";

import type {
    CreateProjectInput,
    LinkResourcesInput,
    ProjectOwnerFilter,
    UpdateProjectInput,
} from "./project.types";

const projectLogger = logger.child({ module: "project" });

// ===========================================
// Helpers
// ===========================================

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "project";
}

function ownerWhere(owner: ProjectOwnerFilter) {
  return {
    userId: owner.userId,
    organizationId: owner.organizationId ?? null,
  };
}

function assertOwnership(project: Project, owner: ProjectOwnerFilter): void {
  if (project.userId !== owner.userId) {
    throw new ForbiddenError("You do not have access to this project");
  }
  const projectOrg = project.organizationId ?? null;
  const ownerOrg = owner.organizationId ?? null;
  if (projectOrg !== ownerOrg) {
    throw new ForbiddenError("Project belongs to a different organization");
  }
}

// ===========================================
// Read
// ===========================================

export async function getProject(id: string, owner: ProjectOwnerFilter): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    throw new NotFoundError(`Project ${id} not found`);
  }
  assertOwnership(project, owner);
  return project;
}

export async function listProjects(
  owner: ProjectOwnerFilter,
  options: { status?: ProjectStatus; kind?: ProjectKind } = {},
): Promise<Project[]> {
  return prisma.project.findMany({
    where: {
      ...ownerWhere(owner),
      ...(options.status ? { status: options.status } : {}),
      ...(options.kind ? { kind: options.kind } : {}),
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

// ===========================================
// Default project (idempotent)
// ===========================================

export async function getDefaultProject(owner: ProjectOwnerFilter): Promise<Project | null> {
  return prisma.project.findFirst({
    where: { ...ownerWhere(owner), isDefault: true },
  });
}

/**
 * Returns the default project for (userId, organizationId), creating one
 * if it doesn't exist. Safe to call repeatedly — used during signup,
 * bootstrap, and as a fallback when API callers don't supply a projectId.
 */
export async function ensureDefaultProject(owner: ProjectOwnerFilter): Promise<Project> {
  const existing = await getDefaultProject(owner);
  if (existing) return existing;

  // Race-safe: rely on the (userId, organizationId, slug) unique constraint.
  try {
    const created = await prisma.project.create({
      data: {
        userId: owner.userId,
        organizationId: owner.organizationId ?? null,
        name: "Default",
        slug: "default",
        kind: "HYBRID",
        status: "ACTIVE",
        isDefault: true,
        description: "Default project. New resources attach here unless you pick another.",
      },
    });
    projectLogger.info({ projectId: created.id, userId: owner.userId }, "default project created");
    return created;
  } catch (err) {
    // Another caller raced us — re-fetch.
    const settled = await getDefaultProject(owner);
    if (settled) return settled;
    throw err;
  }
}

// ===========================================
// Create / Update / Archive
// ===========================================

export async function createProject(
  owner: ProjectOwnerFilter,
  input: CreateProjectInput,
): Promise<Project> {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError("Project name is required");
  }
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  if (!SLUG_RE.test(slug)) {
    throw new ValidationError(`Invalid project slug: ${slug}`);
  }

  // If creating the first project for this owner, make it default.
  const existing = await prisma.project.count({ where: ownerWhere(owner) });
  const isDefault = existing === 0 ? true : Boolean(input.isDefault);

  // If this one is being marked default, demote the previous default.
  return prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.project.updateMany({
        where: { ...ownerWhere(owner), isDefault: true },
        data: { isDefault: false },
      });
    }
    try {
      return await tx.project.create({
        data: {
          userId: owner.userId,
          organizationId: owner.organizationId ?? null,
          name: input.name.trim(),
          slug,
          description: input.description ?? null,
          kind: input.kind ?? "HYBRID",
          status: "ACTIVE",
          icon: input.icon ?? null,
          color: input.color ?? null,
          isDefault,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new ConflictError(`A project with slug "${slug}" already exists`);
      }
      throw err;
    }
  });
}

export async function updateProject(
  id: string,
  owner: ProjectOwnerFilter,
  input: UpdateProjectInput,
): Promise<Project> {
  const project = await getProject(id, owner);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    if (input.name.trim().length === 0) throw new ValidationError("Project name cannot be empty");
    data.name = input.name.trim();
  }
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (!SLUG_RE.test(slug)) throw new ValidationError(`Invalid project slug: ${slug}`);
    data.slug = slug;
  }
  if (input.description !== undefined) data.description = input.description;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.status !== undefined) data.status = input.status;
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.color !== undefined) data.color = input.color;

  // Default flag: if turning ON, demote others; if turning OFF on the only
  // default, refuse — there must always be exactly one default.
  if (input.isDefault === true && !project.isDefault) {
    return prisma.$transaction(async (tx) => {
      await tx.project.updateMany({
        where: { ...ownerWhere(owner), isDefault: true },
        data: { isDefault: false },
      });
      return tx.project.update({ where: { id }, data: { ...data, isDefault: true } });
    });
  }
  if (input.isDefault === false && project.isDefault) {
    throw new ValidationError(
      "Cannot un-default the only default project. Mark another project as default first.",
    );
  }

  try {
    return await prisma.project.update({ where: { id }, data });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new ConflictError("A project with this slug already exists");
    }
    throw err;
  }
}

export async function archiveProject(id: string, owner: ProjectOwnerFilter): Promise<Project> {
  const project = await getProject(id, owner);
  if (project.isDefault) {
    throw new ValidationError("Cannot archive the default project");
  }
  return prisma.project.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

// ===========================================
// Resource linking (gateways / workflows / userPlugins)
// ===========================================

/**
 * Attaches existing resources to a project. Each resource must already be
 * owned by the same (userId, organizationId) tuple as the project.
 */
export async function linkResources(
  projectId: string,
  owner: ProjectOwnerFilter,
  input: LinkResourcesInput,
): Promise<{ gateways: number; workflows: number; userPlugins: number }> {
  const project = await getProject(projectId, owner);

  const where = ownerWhere(owner);
  const result = { gateways: 0, workflows: 0, userPlugins: 0 };

  await prisma.$transaction(async (tx) => {
    if (input.gatewayIds && input.gatewayIds.length > 0) {
      const r = await tx.gateway.updateMany({
        where: { id: { in: input.gatewayIds }, ...where },
        data: { projectId: project.id },
      });
      result.gateways = r.count;
    }
    if (input.workflowIds && input.workflowIds.length > 0) {
      const r = await tx.workflow.updateMany({
        where: { id: { in: input.workflowIds }, ...where },
        data: { projectId: project.id },
      });
      result.workflows = r.count;
    }
    if (input.userPluginIds && input.userPluginIds.length > 0) {
      const r = await tx.userPlugin.updateMany({
        where: { id: { in: input.userPluginIds }, ...where },
        data: { projectId: project.id },
      });
      result.userPlugins = r.count;
    }
  });

  projectLogger.info({ projectId, owner, result }, "resources linked to project");
  return result;
}
