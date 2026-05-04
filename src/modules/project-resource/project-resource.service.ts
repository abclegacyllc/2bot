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

import type {
    ProjectResource,
    ProjectResourceKind,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { parseExpression as parseCron } from "cron-parser";

import { decrypt, encrypt } from "@/lib/encryption";
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
    CreateScheduleResourceInput,
    CreateSecretResourceInput,
    HttpRouteSpec,
    ListProjectResourcesOptions,
    ProjectResourceOwnerFilter,
    SafeSecret,
    ScheduleSpec,
    UpdateHttpRouteSidecarInput,
    UpdateProjectResourceInput,
    UpdateScheduleSidecarInput,
    UpdateSecretSidecarInput
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
    include: {
      gateway: true,
      httpRoute: true,
      schedule: true,
      // SECRET: deliberately omit valueEnc so the plaintext is never reachable
      // via the standard resource detail endpoint.
      secret: {
        select: {
          id: true,
          resourceId: true,
          key: true,
          description: true,
          version: true,
          lastRotatedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
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
  // Phase 7.3c: at most one target may be set; both null is allowed and
  // produces a 503 "unbound" response at dispatch time.
  if (spec.targetUserPluginId && spec.targetWorkflowId) {
    throw new ValidationError(
      "HTTP_ROUTE: targetUserPluginId and targetWorkflowId are mutually exclusive",
    );
  }
}

async function assertTargetWorkflowOwned(
  tx: Prisma.TransactionClient | typeof prisma,
  owner: ProjectResourceOwnerFilter,
  projectId: string,
  targetWorkflowId: string | null | undefined,
): Promise<void> {
  if (!targetWorkflowId) return;
  const wf = await tx.workflow.findUnique({ where: { id: targetWorkflowId } });
  if (!wf) {
    throw new ValidationError(`HTTP_ROUTE: target Workflow ${targetWorkflowId} not found`);
  }
  if (wf.userId !== owner.userId) {
    throw new ForbiddenError("HTTP_ROUTE: target Workflow not owned by caller");
  }
  const wfOrg = wf.organizationId ?? null;
  const ownerOrg = owner.organizationId ?? null;
  if (wfOrg !== ownerOrg) {
    throw new ForbiddenError("HTTP_ROUTE: target Workflow in different organization");
  }
  if (wf.projectId && wf.projectId !== projectId) {
    throw new ValidationError(
      "HTTP_ROUTE: target Workflow belongs to a different project",
    );
  }
  if (wf.triggerType !== "WEBHOOK") {
    throw new ValidationError(
      `HTTP_ROUTE: target Workflow must have triggerType=WEBHOOK (got ${wf.triggerType})`,
    );
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
    await assertTargetWorkflowOwned(
      tx,
      owner,
      project.id,
      input.httpRoute.targetWorkflowId,
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
        targetWorkflowId: input.httpRoute.targetWorkflowId ?? null,
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
      targetWorkflowId: patch.targetWorkflowId,
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
    await assertTargetWorkflowOwned(
      tx,
      owner,
      resource.projectId,
      patch.targetWorkflowId,
    );

    return tx.httpRoute.update({
      where: { resourceId },
      data: {
        ...(patch.method !== undefined ? { method: patch.method } : {}),
        ...(patch.path !== undefined ? { path: patch.path } : {}),
        ...(patch.targetUserPluginId !== undefined
          ? { targetUserPluginId: patch.targetUserPluginId }
          : {}),
        ...(patch.targetWorkflowId !== undefined
          ? { targetWorkflowId: patch.targetWorkflowId }
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

// ===========================================
// SCHEDULE (Path C — Phase 7.4)
// ===========================================

const TIMEZONE_RE = /^[A-Za-z]+(?:[_/][A-Za-z0-9_+-]+)*$/;

/**
 * Validate a `ScheduleSpec` (cron expression + optional timezone).
 *
 * Throws `ValidationError` on the first problem encountered.
 *
 * @internal exported for tests.
 */
export function validateScheduleSpec(spec: ScheduleSpec): void {
  if (!spec.cron || typeof spec.cron !== "string") {
    throw new ValidationError("SCHEDULE: cron expression is required");
  }
  const cron = spec.cron.trim();
  if (cron.length === 0 || cron.length > 200) {
    throw new ValidationError("SCHEDULE: cron expression length must be 1..200");
  }
  if (spec.timezone !== undefined && spec.timezone !== null) {
    if (typeof spec.timezone !== "string" || !TIMEZONE_RE.test(spec.timezone)) {
      throw new ValidationError("SCHEDULE: timezone must be an IANA name (e.g. UTC, America/New_York)");
    }
  }
  try {
    parseCron(cron, {
      tz: spec.timezone ?? undefined,
      currentDate: new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`SCHEDULE: invalid cron expression — ${msg}`);
  }
}

/**
 * Compute the next fire timestamp for a cron expression.
 *
 * @internal exported for tests.
 */
export function computeNextFireAt(
  cron: string,
  timezone: string | null | undefined,
  from: Date = new Date(),
): Date {
  const it = parseCron(cron, {
    tz: timezone ?? undefined,
    currentDate: from,
  });
  return it.next().toDate();
}

async function assertScheduleTargetWorkflowOwned(
  tx: Prisma.TransactionClient | typeof prisma,
  owner: ProjectResourceOwnerFilter,
  projectId: string,
  targetWorkflowId: string | null | undefined,
): Promise<void> {
  if (!targetWorkflowId) return;
  const wf = await tx.workflow.findUnique({ where: { id: targetWorkflowId } });
  if (!wf) {
    throw new ValidationError(`SCHEDULE: target Workflow ${targetWorkflowId} not found`);
  }
  if (wf.userId !== owner.userId) {
    throw new ForbiddenError("SCHEDULE: target Workflow not owned by caller");
  }
  const wfOrg = wf.organizationId ?? null;
  const ownerOrg = owner.organizationId ?? null;
  if (wfOrg !== ownerOrg) {
    throw new ForbiddenError("SCHEDULE: target Workflow in different organization");
  }
  if (wf.projectId && wf.projectId !== projectId) {
    throw new ValidationError(
      "SCHEDULE: target Workflow belongs to a different project",
    );
  }
}

export async function createScheduleResource(
  owner: ProjectResourceOwnerFilter,
  input: CreateScheduleResourceInput,
): Promise<ProjectResource> {
  const project = await loadProjectOrThrow(input.projectId, owner);
  validateScheduleSpec(input.schedule);

  return prisma.$transaction(async (tx) => {
    await assertScheduleTargetWorkflowOwned(
      tx,
      owner,
      project.id,
      input.schedule.targetWorkflowId,
    );

    const slug = await allocateSlug(
      tx,
      project.id,
      "SCHEDULE",
      input.slug ?? input.name,
    );

    const resource = await tx.projectResource.create({
      data: {
        projectId: project.id,
        userId: project.userId,
        organizationId: project.organizationId,
        kind: "SCHEDULE",
        name: input.name,
        slug,
        status: input.status ?? "ACTIVE",
        config: {},
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });

    const enabled = input.schedule.enabled ?? true;
    const nextFireAt = enabled
      ? computeNextFireAt(input.schedule.cron, input.schedule.timezone)
      : null;

    await tx.schedule.create({
      data: {
        resourceId: resource.id,
        cron: input.schedule.cron,
        timezone: input.schedule.timezone ?? null,
        targetWorkflowId: input.schedule.targetWorkflowId ?? null,
        enabled,
        nextFireAt,
      },
    });

    log.info(
      {
        resourceId: resource.id,
        projectId: project.id,
        cron: input.schedule.cron,
        timezone: input.schedule.timezone ?? "UTC",
        targetWorkflowId: input.schedule.targetWorkflowId ?? null,
      },
      "SCHEDULE resource created",
    );

    return resource;
  });
}

export async function updateScheduleSidecar(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
  patch: UpdateScheduleSidecarInput,
) {
  const resource = await getProjectResource(owner, resourceId);
  if (resource.kind !== "SCHEDULE") {
    throw new ValidationError(
      `Resource ${resourceId} is not a SCHEDULE (kind=${resource.kind})`,
    );
  }

  if (patch.cron !== undefined || patch.timezone !== undefined) {
    // Validate using the cron actually being persisted (existing or new).
    const existing = await prisma.schedule.findUnique({ where: { resourceId } });
    if (!existing) {
      throw new NotFoundError(`Schedule sidecar for ${resourceId} not found`);
    }
    validateScheduleSpec({
      cron: patch.cron ?? existing.cron,
      timezone: patch.timezone !== undefined ? patch.timezone : existing.timezone,
    });
  }

  return prisma.$transaction(async (tx) => {
    await assertScheduleTargetWorkflowOwned(
      tx,
      owner,
      resource.projectId,
      patch.targetWorkflowId,
    );

    const existing = await tx.schedule.findUnique({ where: { resourceId } });
    if (!existing) {
      throw new NotFoundError(`Schedule sidecar for ${resourceId} not found`);
    }

    // Recompute nextFireAt when any timing field changed or schedule is being re-enabled.
    const cronChanged = patch.cron !== undefined && patch.cron !== existing.cron;
    const tzChanged =
      patch.timezone !== undefined && (patch.timezone ?? null) !== (existing.timezone ?? null);
    const enabledChanged =
      patch.enabled !== undefined && patch.enabled !== existing.enabled;

    let nextFireAt: Date | null | undefined = undefined;
    const willBeEnabled = patch.enabled ?? existing.enabled;
    if (cronChanged || tzChanged || enabledChanged) {
      if (willBeEnabled) {
        nextFireAt = computeNextFireAt(
          patch.cron ?? existing.cron,
          patch.timezone !== undefined ? patch.timezone : existing.timezone,
        );
      } else {
        nextFireAt = null;
      }
    }

    return tx.schedule.update({
      where: { resourceId },
      data: {
        ...(patch.cron !== undefined ? { cron: patch.cron } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.targetWorkflowId !== undefined
          ? { targetWorkflowId: patch.targetWorkflowId }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(nextFireAt !== undefined ? { nextFireAt } : {}),
      },
    });
  });
}

// ===========================================
// SECRET (Path C — Phase 7.4)
// ===========================================

const SECRET_KEY_RE = /^[A-Z0-9_]{1,128}$/;

/**
 * Validate a `SecretSpec` (logical key + value).
 *
 * Throws `ValidationError` on the first problem encountered.
 *
 * @internal exported for tests.
 */
export function validateSecretSpec(
  spec: { key: string; value?: string; description?: string | null },
  options: { requireValue?: boolean } = {},
): void {
  if (!spec.key || typeof spec.key !== "string") {
    throw new ValidationError("SECRET: key is required");
  }
  if (!SECRET_KEY_RE.test(spec.key)) {
    throw new ValidationError(
      "SECRET: key must match ^[A-Z0-9_]{1,128}$ (uppercase letters, digits, underscore)",
    );
  }
  const requireValue = options.requireValue ?? true;
  if (requireValue) {
    if (typeof spec.value !== "string" || spec.value.length === 0) {
      throw new ValidationError("SECRET: value is required");
    }
  }
  if (spec.value !== undefined) {
    if (typeof spec.value !== "string") {
      throw new ValidationError("SECRET: value must be a string");
    }
    if (spec.value.length > 64 * 1024) {
      throw new ValidationError("SECRET: value must be at most 64KB");
    }
  }
  if (spec.description !== undefined && spec.description !== null) {
    if (typeof spec.description !== "string" || spec.description.length > 500) {
      throw new ValidationError("SECRET: description must be a string of <=500 chars");
    }
  }
}

export async function createSecretResource(
  owner: ProjectResourceOwnerFilter,
  input: CreateSecretResourceInput,
): Promise<ProjectResource> {
  const project = await loadProjectOrThrow(input.projectId, owner);
  validateSecretSpec(input.secret, { requireValue: true });

  return prisma.$transaction(async (tx) => {
    const slug = await allocateSlug(
      tx,
      project.id,
      "SECRET",
      input.slug ?? input.name,
    );

    const resource = await tx.projectResource.create({
      data: {
        projectId: project.id,
        userId: project.userId,
        organizationId: project.organizationId,
        kind: "SECRET",
        name: input.name,
        slug,
        status: input.status ?? "ACTIVE",
        config: {},
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });

    const valueEnc = encrypt(input.secret.value);

    await tx.secret.create({
      data: {
        resourceId: resource.id,
        key: input.secret.key,
        valueEnc,
        description: input.secret.description ?? null,
        version: 1,
      },
    });

    log.info(
      {
        resourceId: resource.id,
        projectId: project.id,
        secretKey: input.secret.key,
      },
      "SECRET resource created",
    );

    return resource;
  });
}

export async function updateSecretSidecar(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
  patch: UpdateSecretSidecarInput,
): Promise<SafeSecret> {
  const resource = await getProjectResource(owner, resourceId);
  if (resource.kind !== "SECRET") {
    throw new ValidationError(
      `Resource ${resourceId} is not a SECRET (kind=${resource.kind})`,
    );
  }
  if (patch.key !== undefined || patch.value !== undefined || patch.description !== undefined) {
    validateSecretSpec(
      { key: patch.key ?? "PLACEHOLDER_OK", value: patch.value, description: patch.description ?? null },
      { requireValue: false },
    );
  }
  // Re-validate the actual key when patching it (placeholder above is a no-op trick).
  if (patch.key !== undefined && !SECRET_KEY_RE.test(patch.key)) {
    throw new ValidationError(
      "SECRET: key must match ^[A-Z0-9_]{1,128}$ (uppercase letters, digits, underscore)",
    );
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.secret.findUnique({ where: { resourceId } });
    if (!existing) {
      throw new NotFoundError(`Secret sidecar for ${resourceId} not found`);
    }

    const data: Prisma.SecretUpdateInput = {};
    if (patch.key !== undefined) data.key = patch.key;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.value !== undefined) {
      data.valueEnc = encrypt(patch.value);
      data.version = { increment: 1 };
      data.lastRotatedAt = new Date();
    }

    const updated = await tx.secret.update({
      where: { resourceId },
      data,
      select: {
        id: true,
        resourceId: true,
        key: true,
        description: true,
        version: true,
        lastRotatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return updated;
  });
}

/**
 * Server-side accessor that returns the decrypted plaintext value of a SECRET
 * sidecar. Performs an ownership check via `getProjectResource()`.
 *
 * Callers (workflow executor, plugin runtime) MUST ensure they have a
 * legitimate need for the plaintext before invoking this — there is no HTTP
 * route that exposes its return value.
 */
export async function getDecryptedSecretValue(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
): Promise<string> {
  const resource = await getProjectResource(owner, resourceId);
  if (resource.kind !== "SECRET") {
    throw new ValidationError(
      `Resource ${resourceId} is not a SECRET (kind=${resource.kind})`,
    );
  }
  const row = await prisma.secret.findUnique({
    where: { resourceId },
    select: { valueEnc: true },
  });
  if (!row) {
    throw new NotFoundError(`Secret sidecar for ${resourceId} not found`);
  }
  return decrypt(row.valueEnc);
}

/**
 * Load all SECRET resources owned by `owner` for `projectId` and return their
 * decrypted values as a flat `Record<key, plaintext>`. Used by the workflow
 * executor at run-start so step `inputMapping` can reference
 * `${secrets.OPENAI_API_KEY}` etc.
 *
 * Returns an empty object when:
 *   - the project has no active SECRET resources
 *   - decryption of any individual row fails (logged at warn level — the run
 *     proceeds with that secret missing)
 *
 * SECURITY NOTE: callers receive plaintext. Do not log this map. Do not pass
 * it to plugin processes verbatim — always go through the template engine
 * which only inlines values for explicit `${secrets.<KEY>}` references.
 */
export async function loadProjectSecrets(
  owner: ProjectResourceOwnerFilter,
  projectId: string,
): Promise<Record<string, string>> {
  const rows = await prisma.projectResource.findMany({
    where: {
      projectId,
      kind: "SECRET",
      status: "ACTIVE",
      userId: owner.userId,
      organizationId: owner.organizationId ?? null,
    },
    select: {
      id: true,
      secret: { select: { key: true, valueEnc: true } },
    },
  });

  const out: Record<string, string> = {};
  for (const row of rows) {
    if (!row.secret) continue;
    try {
      out[row.secret.key] = decrypt(row.secret.valueEnc);
    } catch (err) {
      log.warn(
        { resourceId: row.id, error: (err as Error).message },
        "loadProjectSecrets: failed to decrypt secret — skipping",
      );
    }
  }
  return out;
}
