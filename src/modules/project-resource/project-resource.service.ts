/**
 * ProjectResource Service (Path C)
 *
 * Polymorphic resource layer. Each Project owns N ProjectResources keyed by
 * kind (GATEWAY_BOT, HTTP_ROUTE, SCHEDULE, …). ships GATEWAY_BOT
 * only — every Gateway has a paired ProjectResource via the `gatewayId`
 * sidecar FK. Other kinds get sidecars in later phases.
 *
 * @module modules/project-resource/project-resource.service
 */

import { Prisma } from "@prisma/client";
import type {
  ProjectResource,
  ProjectResourceKind,
} from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";

import type {
  CreateHttpRouteResourceInput,
  CreateProjectResourceInput,
  HttpRouteSpec,
  ListProjectResourcesOptions,
  ProjectResourceOwnerFilter,
  UpdateHttpRouteSidecarInput,
  UpdateProjectResourceInput,
} from "./project-resource.types";

const log = logger.child({ module: "project-resource" });

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "resource"
  );
}

function assertOwnership(
  resource: ProjectResource,
  owner: ProjectResourceOwnerFilter,
): void {
  if (resource.userId !== owner.userId) {
    throw new ForbiddenError("You do not have access to this resource");
  }
  const resOrg = resource.organizationId ?? null;
  const ownerOrg = owner.organizationId ?? null;
  if (resOrg !== ownerOrg) {
    throw new ForbiddenError("Resource belongs to a different organization");
  }
}

async function loadProjectOrThrow(
  projectId: string,
  owner: ProjectResourceOwnerFilter,
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new NotFoundError(`Project ${projectId} not found`);
  }
  if (project.userId !== owner.userId) {
    throw new ForbiddenError("You do not have access to this project");
  }
  const projectOrg = project.organizationId ?? null;
  const ownerOrg = owner.organizationId ?? null;
  if (projectOrg !== ownerOrg) {
    throw new ForbiddenError("Project belongs to a different organization");
  }
  return project;
}

// ===========================================
// Read
// ===========================================

export async function listProjectResources(
  owner: ProjectResourceOwnerFilter,
  projectId: string,
  options: ListProjectResourcesOptions = {},
): Promise<ProjectResource[]> {
  await loadProjectOrThrow(projectId, owner);
  return prisma.projectResource.findMany({
    where: {
      projectId,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
}

export async function getProjectResource(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
): Promise<ProjectResource> {
  const resource = await prisma.projectResource.findUnique({
    where: { id: resourceId },
  });
  if (!resource) {
    throw new NotFoundError(`ProjectResource ${resourceId} not found`);
  }
  assertOwnership(resource, owner);
  return resource;
}

export async function getProjectResourceWithGateway(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
) {
  const resource = await prisma.projectResource.findUnique({
    where: { id: resourceId },
    include: { gateway: true, httpRoute: true },
  });
  if (!resource) {
    throw new NotFoundError(`ProjectResource ${resourceId} not found`);
  }
  assertOwnership(resource, owner);
  return resource;
}

// ===========================================
// Slug allocation
// ===========================================

async function allocateSlug(
  tx: Prisma.TransactionClient | typeof prisma,
  projectId: string,
  kind: ProjectResourceKind,
  desired: string,
): Promise<string> {
  let slug = slugify(desired);
  if (!SLUG_RE.test(slug)) {
    throw new ValidationError(`Invalid slug derived from name: ${desired}`);
  }
  // Append numeric suffix if needed.
  const base = slug;
  let attempt = 1;
  while (attempt < 100) {
    const existing = await tx.projectResource.findUnique({
      where: { projectId_kind_slug: { projectId, kind, slug } },
    });
    if (!existing) return slug;
    attempt += 1;
    slug = `${base}-${attempt}`.slice(0, 64);
  }
  throw new ConflictError("Could not allocate unique slug for resource");
}

// ===========================================
// Create / Update / Archive
// ===========================================

export async function createProjectResource(
  owner: ProjectResourceOwnerFilter,
  input: CreateProjectResourceInput,
  options: { tx?: Prisma.TransactionClient } = {},
): Promise<ProjectResource> {
  const project = await loadProjectOrThrow(input.projectId, owner);

  if (input.kind === "GATEWAY_BOT" && !input.gatewayId) {
    throw new ValidationError("GATEWAY_BOT resources require a gatewayId");
  }

  const client = options.tx ?? prisma;
  const slug = await allocateSlug(
    client,
    input.projectId,
    input.kind,
    input.slug ?? input.name,
  );

  try {
    const resource = await client.projectResource.create({
      data: {
        projectId: input.projectId,
        userId: project.userId,
        organizationId: project.organizationId,
        kind: input.kind,
        name: input.name,
        slug,
        status: input.status ?? "ACTIVE",
        config: (input.config ?? {}) as Prisma.InputJsonValue,
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        gatewayId: input.gatewayId ?? null,
      },
    });
    log.info(
      {
        resourceId: resource.id,
        projectId: project.id,
        kind: resource.kind,
        slug: resource.slug,
      },
      "ProjectResource created",
    );
    return resource;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new ConflictError(
        `ProjectResource with slug "${slug}" already exists in this project`,
      );
    }
    throw err;
  }
}

export async function updateProjectResource(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
  input: UpdateProjectResourceInput,
): Promise<ProjectResource> {
  const existing = await getProjectResource(owner, resourceId);

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    slug = await allocateSlug(prisma, existing.projectId, existing.kind, input.slug);
  }

  return prisma.projectResource.update({
    where: { id: resourceId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      slug,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.config !== undefined
        ? { config: input.config as Prisma.InputJsonValue }
        : {}),
      ...(input.metadata !== undefined
        ? {
            metadata:
              input.metadata === null
                ? Prisma.JsonNull
                : (input.metadata as Prisma.InputJsonValue),
          }
        : {}),
    },
  });
}

export async function archiveProjectResource(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
): Promise<ProjectResource> {
  await getProjectResource(owner, resourceId);
  return prisma.projectResource.update({
    where: { id: resourceId },
    data: { status: "ARCHIVED" },
  });
}

/**
 * Hard-delete. For GATEWAY_BOT resources this is normally driven by the
 * gateway's own delete cascade (FK onDelete: Cascade). Callers should
 * generally archive instead.
 */
export async function deleteProjectResource(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
): Promise<void> {
  const existing = await getProjectResource(owner, resourceId);
  if (existing.kind === "GATEWAY_BOT") {
    throw new ValidationError(
      "GATEWAY_BOT resources are deleted automatically when the gateway is deleted",
    );
  }
  await prisma.projectResource.delete({ where: { id: resourceId } });
}

// ===========================================
// Companion-write helpers (used by gateway.service)
// ===========================================

/**
 * Create the paired GATEWAY_BOT ProjectResource for a Gateway. Idempotent
 * — if one already exists for this gatewayId, returns it unchanged.
 *
 * Pass a transaction client to bind to the same transaction as the Gateway
 * insert. When `projectId` is null (legacy unattached gateway), this is a
 * no-op and returns null.
 */
export async function ensureGatewayResource(
  tx: Prisma.TransactionClient | typeof prisma,
  gateway: {
    id: string;
    name: string;
    userId: string;
    organizationId: string | null;
    projectId: string | null;
  },
): Promise<ProjectResource | null> {
  if (!gateway.projectId) return null;

  const existing = await tx.projectResource.findUnique({
    where: { gatewayId: gateway.id },
  });
  if (existing) return existing;

  const slug = await allocateSlug(tx, gateway.projectId, "GATEWAY_BOT", gateway.name);

  return tx.projectResource.create({
    data: {
      projectId: gateway.projectId,
      userId: gateway.userId,
      organizationId: gateway.organizationId,
      kind: "GATEWAY_BOT",
      name: gateway.name,
      slug,
      status: "ACTIVE",
      config: {},
      gatewayId: gateway.id,
    },
  });
}

// ===========================================
// HTTP_ROUTE (Path C)
// ===========================================

const HTTP_PATH_RE = /^\/[A-Za-z0-9\-._~/:*]*$/;
const HTTP_PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

function validateHttpRouteSpec(spec: HttpRouteSpec): void {
  if (!spec.path || typeof spec.path !== "string") {
    throw new ValidationError("HTTP_ROUTE: path is required");
  }
  if (!spec.path.startsWith("/")) {
    throw new ValidationError("HTTP_ROUTE: path must start with '/'");
  }
  if (!HTTP_PATH_RE.test(spec.path)) {
    throw new ValidationError(
      "HTTP_ROUTE: path contains invalid characters (allowed: A-Z a-z 0-9 - . _ ~ / : *)",
    );
  }
  // Detect duplicate :param names.
  const seen = new Set<string>();
  for (const m of spec.path.matchAll(HTTP_PARAM_RE)) {
    const name = m[1];
    if (!name) continue;
    if (seen.has(name)) {
      throw new ValidationError(
        `HTTP_ROUTE: duplicate path parameter ":${name}"`,
      );
    }
    seen.add(name);
  }
  if (spec.timeoutMs !== undefined && (spec.timeoutMs < 100 || spec.timeoutMs > 60_000)) {
    throw new ValidationError("HTTP_ROUTE: timeoutMs must be between 100 and 60000");
  }
  if (spec.maxBodyKb !== undefined && (spec.maxBodyKb < 0 || spec.maxBodyKb > 10_000)) {
    throw new ValidationError("HTTP_ROUTE: maxBodyKb must be between 0 and 10000");
  }
  if (spec.authMode === "API_KEY") {
    const cfg = spec.authConfig ?? {};
    if (typeof (cfg as { apiKey?: unknown }).apiKey !== "string" || !(cfg as { apiKey: string }).apiKey) {
      throw new ValidationError("HTTP_ROUTE: authMode=API_KEY requires authConfig.apiKey");
    }
  }
  if (spec.authMode === "HMAC") {
    const cfg = spec.authConfig ?? {};
    if (typeof (cfg as { hmacSecret?: unknown }).hmacSecret !== "string" || !(cfg as { hmacSecret: string }).hmacSecret) {
      throw new ValidationError("HTTP_ROUTE: authMode=HMAC requires authConfig.hmacSecret");
    }
  }
}

async function assertTargetUserPluginOwned(
  tx: Prisma.TransactionClient | typeof prisma,
  owner: ProjectResourceOwnerFilter,
  projectId: string,
  targetUserPluginId: string | null | undefined,
): Promise<void> {
  if (!targetUserPluginId) return;
  const up = await tx.userPlugin.findUnique({ where: { id: targetUserPluginId } });
  if (!up) {
    throw new ValidationError(`HTTP_ROUTE: target UserPlugin ${targetUserPluginId} not found`);
  }
  if (up.userId !== owner.userId) {
    throw new ForbiddenError("HTTP_ROUTE: target UserPlugin not owned by caller");
  }
  const pluginOrg = up.organizationId ?? null;
  const ownerOrg = owner.organizationId ?? null;
  if (pluginOrg !== ownerOrg) {
    throw new ForbiddenError("HTTP_ROUTE: target UserPlugin in different organization");
  }
  // Allow targets that are unattached (projectId null) or attached to this project.
  if (up.projectId && up.projectId !== projectId) {
    throw new ValidationError(
      `HTTP_ROUTE: target UserPlugin belongs to a different project`,
    );
  }
}

export async function createHttpRouteResource(
  owner: ProjectResourceOwnerFilter,
  input: CreateHttpRouteResourceInput,
): Promise<ProjectResource> {
  const project = await loadProjectOrThrow(input.projectId, owner);
  validateHttpRouteSpec(input.httpRoute);

  return prisma.$transaction(async (tx) => {
    await assertTargetUserPluginOwned(
      tx,
      owner,
      project.id,
      input.httpRoute.targetUserPluginId,
    );

    const slug = await allocateSlug(
      tx,
      project.id,
      "HTTP_ROUTE",
      input.slug ?? input.name,
    );

    const resource = await tx.projectResource.create({
      data: {
        projectId: project.id,
        userId: project.userId,
        organizationId: project.organizationId,
        kind: "HTTP_ROUTE",
        name: input.name,
        slug,
        status: input.status ?? "ACTIVE",
        config: {},
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });

    await tx.httpRoute.create({
      data: {
        resourceId: resource.id,
        method: input.httpRoute.method ?? "ANY",
        path: input.httpRoute.path,
        targetUserPluginId: input.httpRoute.targetUserPluginId ?? null,
        targetExport: input.httpRoute.targetExport ?? null,
        authMode: input.httpRoute.authMode ?? "NONE",
        authConfig: (input.httpRoute.authConfig ?? {}) as Prisma.InputJsonValue,
        maxBodyKb: input.httpRoute.maxBodyKb ?? 0,
        timeoutMs: input.httpRoute.timeoutMs ?? 15000,
        corsOrigin: input.httpRoute.corsOrigin ?? null,
        passthroughBody: input.httpRoute.passthroughBody ?? true,
      },
    });

    log.info(
      {
        resourceId: resource.id,
        projectId: project.id,
        method: input.httpRoute.method ?? "ANY",
        path: input.httpRoute.path,
      },
      "HTTP_ROUTE resource created",
    );

    return resource;
  });
}

export async function updateHttpRouteSidecar(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
  patch: UpdateHttpRouteSidecarInput,
) {
  const resource = await getProjectResource(owner, resourceId);
  if (resource.kind !== "HTTP_ROUTE") {
    throw new ValidationError(
      `Resource ${resourceId} is not an HTTP_ROUTE (kind=${resource.kind})`,
    );
  }

  if (patch.path !== undefined || patch.method !== undefined) {
    validateHttpRouteSpec({
      method: patch.method,
      path: patch.path ?? "/",
      authMode: patch.authMode,
      authConfig: patch.authConfig,
      maxBodyKb: patch.maxBodyKb,
      timeoutMs: patch.timeoutMs,
      targetUserPluginId: patch.targetUserPluginId,
      targetExport: patch.targetExport,
    });
  }

  return prisma.$transaction(async (tx) => {
    await assertTargetUserPluginOwned(
      tx,
      owner,
      resource.projectId,
      patch.targetUserPluginId,
    );

    return tx.httpRoute.update({
      where: { resourceId },
      data: {
        ...(patch.method !== undefined ? { method: patch.method } : {}),
        ...(patch.path !== undefined ? { path: patch.path } : {}),
        ...(patch.targetUserPluginId !== undefined
          ? { targetUserPluginId: patch.targetUserPluginId }
          : {}),
        ...(patch.targetExport !== undefined
          ? { targetExport: patch.targetExport }
          : {}),
        ...(patch.authMode !== undefined ? { authMode: patch.authMode } : {}),
        ...(patch.authConfig !== undefined
          ? { authConfig: patch.authConfig as Prisma.InputJsonValue }
          : {}),
        ...(patch.maxBodyKb !== undefined ? { maxBodyKb: patch.maxBodyKb } : {}),
        ...(patch.timeoutMs !== undefined ? { timeoutMs: patch.timeoutMs } : {}),
        ...(patch.corsOrigin !== undefined
          ? { corsOrigin: patch.corsOrigin }
          : {}),
        ...(patch.passthroughBody !== undefined
          ? { passthroughBody: patch.passthroughBody }
          : {}),
      },
    });
  });
}

/**
 * Resolve an inbound request `(method, path)` to its matching HTTP_ROUTE
 * resource. Returns `null` when no route matches. Used by the dispatch
 * path .3b. Path matching is exact + literal here; pattern
 * matching with :params + * wildcards is the runtime layer's job.
 */
export async function findHttpRouteByPathExact(
  projectId: string,
  method: string,
  path: string,
) {
  const normalizedMethod = method.toUpperCase() as
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS"
    | "HEAD";

  return prisma.httpRoute.findFirst({
    where: {
      path,
      OR: [{ method: "ANY" }, { method: normalizedMethod }],
      resource: { projectId, status: "ACTIVE" },
    },
    include: { resource: true },
  });
}
