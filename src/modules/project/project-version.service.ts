/**
 * Project Version Service (Wave 1)
 *
 * Captures and manages immutable snapshots of a project's state. Each apply
 * creates a STAGING ProjectVersion; activate() promotes it to ACTIVE and
 * marks the previously-active version ROLLED_BACK. rollback() flips the
 * pointer back to a prior version and marks the current one ROLLED_BACK.
 *
 * Wave 1 scope: snapshot capture, activation, rollback metadata, listing.
 * Wave 2 (deferred): bridge `file.write` integration to restore plugin files.
 *
 * @module modules/project/project-version.service
 */

import { createHash } from "node:crypto";

import { ProjectVersionStatus } from "@prisma/client";

import { logger } from "@/lib/logger";
import { projectVersionsAppliedTotal } from "@/lib/metrics";
import { prisma } from "@/lib/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";

import type {
  CreateVersionInput,
  ProjectManifest,
  ProjectVersionOwner,
  ProjectVersionSummary,
} from "./project-version.types";

const versionLogger = logger.child({ module: "project-version" });

// ===========================================
// Helpers
// ===========================================

async function loadProjectOrThrow(projectId: string, owner: ProjectVersionOwner) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Project not found");
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

function hashContent(content: string | Buffer | null | undefined): string | null {
  if (content === null || content === undefined) return null;
  return createHash("sha256").update(content).digest("hex");
}

// ===========================================
// Snapshot capture
// ===========================================

/**
 * Walks all project resources and produces a manifest blob. Pure read —
 * does not mutate state.
 */
export async function captureManifest(projectId: string): Promise<ProjectManifest> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      gateways: true,
      userPlugins: { include: { plugin: { select: { slug: true, version: true } } } },
      workflows: {
        include: {
          steps: {
            orderBy: { order: "asc" },
            include: { plugin: { select: { slug: true } } },
          },
          edges: true,
          workflowGateways: true,
        },
      },
    },
  });
  if (!project) throw new NotFoundError("Project not found");

  const manifest: ProjectManifest = {
    version: 1,
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      kind: project.kind,
      icon: project.icon,
      color: project.color,
    },
    gateways: project.gateways.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      config: g.config ?? null,
      credentialsEncrypted: g.credentialsEnc ?? null,
    })),
    plugins: project.userPlugins.map((up) => ({
      userPluginId: up.id,
      pluginSlug: up.plugin.slug,
      pluginVersion: up.plugin.version ?? null,
      config: up.config ?? null,
      gatewayId: up.gatewayId ?? null,
      bundlePath: up.entryFile ?? null,
      entryFileHash: hashContent(up.entryFile),
    })),
    workflows: project.workflows.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      description: w.description,
      triggerType: w.triggerType,
      triggerConfig: w.triggerConfig ?? null,
      status: w.status,
      isEnabled: w.isEnabled,
      gateways: w.workflowGateways.map((wg) => ({
        gatewayId: wg.gatewayId,
        role: wg.role,
      })),
      steps: w.steps.map((s) => ({
        id: s.id,
        order: s.order,
        name: s.name ?? null,
        pluginSlug: s.plugin.slug,
        gatewayId: s.gatewayId ?? null,
        config: s.config ?? null,
        inputMapping: s.inputMapping ?? null,
        positionX: s.positionX ?? null,
        positionY: s.positionY ?? null,
      })),
      edges: w.edges.map((e) => ({
        id: e.id,
        fromStepId: e.sourceStepId,
        toStepId: e.targetStepId,
      })),
    })),
    capturedAt: new Date().toISOString(),
  };

  return manifest;
}

// ===========================================
// Public API
// ===========================================

/**
 * Creates a STAGING version with the captured manifest. Does not change
 * `Project.activeVersionId`.
 */
export async function createStagingVersion(
  owner: ProjectVersionOwner,
  projectId: string,
  input: CreateVersionInput = {},
): Promise<ProjectVersionSummary> {
  await loadProjectOrThrow(projectId, owner);

  const manifest = await captureManifest(projectId);

  const last = await prisma.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  try {
    const version = await prisma.projectVersion.create({
      data: {
        projectId,
        versionNumber,
        status: ProjectVersionStatus.STAGING,
        manifest: manifest as unknown as object,
        source: input.source ?? null,
        buildspecHash: input.buildspecHash ?? null,
        appliedBy: input.appliedBy ?? null,
      },
    });

    projectVersionsAppliedTotal.inc({ status: "staged" });
    versionLogger.info(
      { projectId, versionId: version.id, versionNumber },
      "Project version staged",
    );

    return toSummary(version);
  } catch (err) {
    projectVersionsAppliedTotal.inc({ status: "snapshot-failed" });
    versionLogger.error({ projectId, err }, "Failed to stage project version");
    throw err;
  }
}

/**
 * Promotes a STAGING version to ACTIVE. Marks any prior ACTIVE version
 * for this project as ROLLED_BACK. Atomic.
 */
export async function activateVersion(
  owner: ProjectVersionOwner,
  versionId: string,
): Promise<ProjectVersionSummary> {
  const version = await prisma.projectVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new NotFoundError("Project version not found");
  await loadProjectOrThrow(version.projectId, owner);

  if (version.status !== ProjectVersionStatus.STAGING) {
    throw new ValidationError(
      `Cannot activate a version in status ${version.status} (expected STAGING)`,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Demote any existing ACTIVE version for this project.
    await tx.projectVersion.updateMany({
      where: {
        projectId: version.projectId,
        status: ProjectVersionStatus.ACTIVE,
        id: { not: versionId },
      },
      data: {
        status: ProjectVersionStatus.ROLLED_BACK,
        rolledBackAt: new Date(),
        rollbackReason: "superseded",
      },
    });

    const promoted = await tx.projectVersion.update({
      where: { id: versionId },
      data: { status: ProjectVersionStatus.ACTIVE },
    });

    await tx.project.update({
      where: { id: version.projectId },
      data: { activeVersionId: versionId },
    });

    return promoted;
  });

  projectVersionsAppliedTotal.inc({ status: "activated" });
  versionLogger.info(
    { projectId: version.projectId, versionId },
    "Project version activated",
  );

  return toSummary(result);
}

/**
 * Rolls a project back to a previously-staged or active version.
 * Wave 1: flips DB pointer + marks current ACTIVE as ROLLED_BACK.
 * Wave 2 will additionally restore plugin files via bridge `file.write`.
 */
export async function rollbackToVersion(
  owner: ProjectVersionOwner,
  versionId: string,
  reason: string,
): Promise<ProjectVersionSummary> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError("Rollback reason is required");
  }

  const target = await prisma.projectVersion.findUnique({ where: { id: versionId } });
  if (!target) throw new NotFoundError("Project version not found");
  await loadProjectOrThrow(target.projectId, owner);

  if (target.status === ProjectVersionStatus.ACTIVE) {
    throw new ConflictError("Target version is already ACTIVE");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.projectVersion.updateMany({
      where: {
        projectId: target.projectId,
        status: ProjectVersionStatus.ACTIVE,
        id: { not: versionId },
      },
      data: {
        status: ProjectVersionStatus.ROLLED_BACK,
        rolledBackAt: new Date(),
        rollbackReason: reason,
      },
    });

    const restored = await tx.projectVersion.update({
      where: { id: versionId },
      data: { status: ProjectVersionStatus.ACTIVE },
    });

    await tx.project.update({
      where: { id: target.projectId },
      data: { activeVersionId: versionId },
    });

    return restored;
  });

  projectVersionsAppliedTotal.inc({ status: "rolled-back" });
  versionLogger.info(
    { projectId: target.projectId, versionId, reason },
    "Project version rolled back",
  );

  return toSummary(result);
}

/**
 * Lists versions for a project, newest first.
 */
export async function listVersions(
  owner: ProjectVersionOwner,
  projectId: string,
): Promise<ProjectVersionSummary[]> {
  await loadProjectOrThrow(projectId, owner);

  const rows = await prisma.projectVersion.findMany({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
  });

  return rows.map(toSummary);
}

/**
 * Gets a single version with its manifest.
 */
export async function getVersionWithManifest(
  owner: ProjectVersionOwner,
  versionId: string,
): Promise<ProjectVersionSummary & { manifest: ProjectManifest }> {
  const version = await prisma.projectVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new NotFoundError("Project version not found");
  await loadProjectOrThrow(version.projectId, owner);

  return {
    ...toSummary(version),
    manifest: version.manifest as unknown as ProjectManifest,
  };
}

// ===========================================
// Internal
// ===========================================

function toSummary(v: {
  id: string;
  projectId: string;
  versionNumber: number;
  status: ProjectVersionStatus;
  source: string | null;
  buildspecHash: string | null;
  appliedBy: string | null;
  createdAt: Date;
  rolledBackAt: Date | null;
  rollbackReason: string | null;
}): ProjectVersionSummary {
  return {
    id: v.id,
    projectId: v.projectId,
    versionNumber: v.versionNumber,
    status: v.status,
    source: v.source,
    buildspecHash: v.buildspecHash,
    appliedBy: v.appliedBy,
    createdAt: v.createdAt,
    rolledBackAt: v.rolledBackAt,
    rollbackReason: v.rollbackReason,
  };
}
