/**
 * BuildSpec Run Service
 *
 * Persistence layer for asynchronous BuildSpec applies. Rows are created at
 * enqueue time (status QUEUED), transitioned to RUNNING by the worker, and
 * finalised to APPLIED / ROLLED_BACK / VALIDATION_FAILED / FAILED with the
 * full BuildSpecApplyResult or exception narrative.
 *
 * Designed for ownership-scoped reads: callers always pass the (userId,
 * organizationId) tuple they were authenticated as, so the worker cannot
 * leak a run from one tenant to another even if the runId is guessed.
 *
 * @module modules/cursor/buildspec/buildspec-run.service
 */

import type { BuildSpecRun, BuildSpecRunStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/shared/errors";

import type {
    BuildSpecApplyOptions,
    BuildSpecApplyResult,
    BuildSpecOwner,
} from "./buildspec.types";

export type { BuildSpecRunStatus } from "@prisma/client";

/**
 * Subset returned to API clients. Strips JSON columns that may be large
 * (full spec / refMap) — callers that need them request them explicitly.
 */
export interface BuildSpecRunSummary {
  id: string;
  status: BuildSpecRunStatus;
  source: string;
  dryRun: boolean;
  rollbackOnSmokeFailure: boolean;
  projectId: string | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuildSpecRunDetail extends BuildSpecRunSummary {
  result: BuildSpecApplyResult | null;
}

function toSummary(run: BuildSpecRun): BuildSpecRunSummary {
  return {
    id: run.id,
    status: run.status,
    source: run.source,
    dryRun: run.dryRun,
    rollbackOnSmokeFailure: run.rollbackOnSmokeFailure,
    projectId: run.projectId,
    error: run.error,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function toDetail(run: BuildSpecRun): BuildSpecRunDetail {
  return {
    ...toSummary(run),
    result: (run.result as BuildSpecApplyResult | null) ?? null,
  };
}

export interface CreateBuildSpecRunInput {
  owner: BuildSpecOwner;
  spec: unknown;
  options?: BuildSpecApplyOptions;
}

export async function createQueuedRun(
  input: CreateBuildSpecRunInput,
): Promise<BuildSpecRunSummary> {
  const opts = input.options ?? {};
  const created = await prisma.buildSpecRun.create({
    data: {
      userId: input.owner.userId,
      organizationId: input.owner.organizationId ?? null,
      status: "QUEUED",
      source: opts.source ?? "api",
      dryRun: Boolean(opts.dryRun),
      rollbackOnSmokeFailure: opts.rollbackOnSmokeFailure ?? true,
      spec: input.spec as Prisma.InputJsonValue,
    },
  });
  return toSummary(created);
}

export async function markRunRunning(runId: string): Promise<void> {
  await prisma.buildSpecRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
}

/**
 * Map a BuildSpecApplyResult to the corresponding terminal run status.
 */
function statusForResult(result: BuildSpecApplyResult): BuildSpecRunStatus {
  switch (result.status) {
    case "applied":
      return "APPLIED";
    case "rolled-back":
      return "ROLLED_BACK";
    case "validation-failed":
      return "VALIDATION_FAILED";
  }
}

export async function completeRun(
  runId: string,
  result: BuildSpecApplyResult,
): Promise<void> {
  await prisma.buildSpecRun.update({
    where: { id: runId },
    data: {
      status: statusForResult(result),
      result: result as unknown as Prisma.InputJsonValue,
      projectId: result.projectId ?? null,
      completedAt: new Date(),
    },
  });
}

/**
 * Final state when applyBuildSpec threw. Captures the message but lets the
 * caller decide whether to rethrow for BullMQ retry semantics.
 */
export async function failRun(
  runId: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await prisma.buildSpecRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error: message,
      completedAt: new Date(),
    },
  });
}

/**
 * Owner-scoped read. Throws NotFoundError if the row exists but belongs to
 * a different tenant, deliberately mirroring "no such row" so we don't leak
 * existence cross-tenant.
 */
export async function getRunForOwner(
  runId: string,
  owner: BuildSpecOwner,
): Promise<BuildSpecRunDetail> {
  const run = await prisma.buildSpecRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError(`BuildSpec run ${runId} not found`);
  if (run.userId !== owner.userId) {
    throw new NotFoundError(`BuildSpec run ${runId} not found`);
  }
  const ownerOrg = owner.organizationId ?? null;
  if ((run.organizationId ?? null) !== ownerOrg) {
    throw new NotFoundError(`BuildSpec run ${runId} not found`);
  }
  return toDetail(run);
}

/**
 * Worker-side read. Used after a job pops to load the spec + options that
 * were captured at enqueue time. Intentionally NOT owner-scoped — the caller
 * is the worker, which then re-applies the original owner context.
 */
export async function getRunForWorker(runId: string): Promise<BuildSpecRun> {
  const run = await prisma.buildSpecRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError(`BuildSpec run ${runId} not found`);
  return run;
}

/**
 * Owner-scoped list, newest first. Bounded result count.
 */
export async function listRunsForOwner(
  owner: BuildSpecOwner,
  options: { limit?: number; status?: BuildSpecRunStatus } = {},
): Promise<BuildSpecRunSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = await prisma.buildSpecRun.findMany({
    where: {
      userId: owner.userId,
      organizationId: owner.organizationId ?? null,
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toSummary);
}
