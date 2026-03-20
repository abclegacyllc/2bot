/**
 * Workflow Service
 *
 * CRUD operations for workflows and steps, with access control.
 * Handles create/read/update/delete and execution stat recording.
 *
 * @module modules/workflow/workflow.service
 */

import { Prisma } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";

import { pushWorkflowCache, removeWorkflowCache } from "./workflow-cache.service";
import type {
  CreateWorkflowRequest,
  CreateWorkflowStepRequest,
  InputMapping,
  StepCondition,
  StepErrorHandler,
  TriggerConfig,
  UpdateWorkflowRequest,
  UpdateWorkflowStepRequest,
  WorkflowDefinition,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowStepDefinition,
  WorkflowStepRunDetail,
} from "./workflow.types";

const workflowLogger = logger.child({ module: "workflow" });

// ===========================================
// Access helpers
// ===========================================

interface WorkflowOwnerFilter {
  userId: string;
  organizationId?: string | null;
}

function ownerFilter(owner: WorkflowOwnerFilter) {
  return {
    userId: owner.userId,
    ...(owner.organizationId
      ? { organizationId: owner.organizationId }
      : { organizationId: null }),
  };
}

// ===========================================
// Workflow CRUD
// ===========================================

/**
 * Create a new workflow.
 */
async function createWorkflow(
  owner: WorkflowOwnerFilter,
  data: CreateWorkflowRequest
): Promise<WorkflowDefinition> {
  // Check slug uniqueness within owner scope
  const existing = await prisma.workflow.findFirst({
    where: { ...ownerFilter(owner), slug: data.slug },
  });
  if (existing) {
    throw new ConflictError(`Workflow slug "${data.slug}" already exists`);
  }

  // Validate gateway mode if gateway-bound
  if (data.gatewayId) {
    const gateway = await prisma.gateway.findUnique({
      where: { id: data.gatewayId },
      select: { mode: true },
    });
    if (gateway && gateway.mode !== "workflow") {
      throw new ValidationError("Cannot create workflow on a plugin-mode bot", {
        gatewayId: ["Switch bot to workflow mode first"],
      });
    }
  }

  const workflow = await prisma.workflow.create({
    data: {
      userId: owner.userId,
      organizationId: owner.organizationId ?? null,
      name: data.name,
      description: data.description,
      slug: data.slug,
      scope: data.scope ?? "USER",
      triggerType: data.triggerType,
      triggerConfig: (data.triggerConfig ?? {}) as object,
      gatewayId: data.gatewayId,
    },
    include: {
      steps: { orderBy: { order: "asc" }, include: { plugin: true } },
    },
  });

  workflowLogger.info(
    { workflowId: workflow.id, userId: owner.userId, slug: data.slug },
    "Workflow created"
  );

  // Push cache to container (fire-and-forget)
  pushWorkflowCache(workflow.id, owner.userId, owner.organizationId ?? null);

  return toWorkflowDefinition(workflow);
}

/**
 * List workflows for an owner with optional filters.
 */
async function listWorkflows(
  owner: WorkflowOwnerFilter,
  opts: {
    status?: string;
    triggerType?: string;
    gatewayId?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}
): Promise<{ workflows: WorkflowDefinition[]; total: number }> {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { ...ownerFilter(owner) };

  if (opts.status) where.status = opts.status;
  if (opts.triggerType) where.triggerType = opts.triggerType;
  if (opts.gatewayId) where.gatewayId = opts.gatewayId;
  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: "insensitive" } },
      { description: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [workflows, total] = await Promise.all([
    prisma.workflow.findMany({
      where,
      include: {
        steps: { orderBy: { order: "asc" }, include: { plugin: true } },
      },
      orderBy: { [opts.sortBy ?? "createdAt"]: opts.sortOrder ?? "desc" },
      skip,
      take: limit,
    }),
    prisma.workflow.count({ where }),
  ]);

  return {
    workflows: workflows.map(toWorkflowDefinition),
    total,
  };
}

/**
 * Get a single workflow by ID. Verifies ownership.
 */
async function getWorkflow(
  owner: WorkflowOwnerFilter,
  workflowId: string
): Promise<WorkflowDefinition> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: { orderBy: { order: "asc" }, include: { plugin: true } },
    },
  });

  if (!workflow) throw new NotFoundError("Workflow not found");
  verifyOwner(workflow, owner);

  return toWorkflowDefinition(workflow);
}

/**
 * Update a workflow.
 */
async function updateWorkflow(
  owner: WorkflowOwnerFilter,
  workflowId: string,
  data: UpdateWorkflowRequest
): Promise<WorkflowDefinition> {
  const existing = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!existing) throw new NotFoundError("Workflow not found");
  verifyOwner(existing, owner);

  // If slug changed, check uniqueness
  if (data.slug && data.slug !== existing.slug) {
    const conflict = await prisma.workflow.findFirst({
      where: { ...ownerFilter(owner), slug: data.slug, id: { not: workflowId } },
    });
    if (conflict) {
      throw new ConflictError(`Workflow slug "${data.slug}" already exists`);
    }
  }

  const workflow = await prisma.workflow.update({
    where: { id: workflowId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.slug !== undefined && { slug: data.slug }),
      ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
      ...(data.triggerConfig !== undefined && { triggerConfig: (data.triggerConfig ?? {}) as object }),
      ...(data.gatewayId !== undefined && { gatewayId: data.gatewayId }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
    },
    include: {
      steps: { orderBy: { order: "asc" }, include: { plugin: true } },
    },
  });

  workflowLogger.info({ workflowId, userId: owner.userId }, "Workflow updated");

  // Push updated cache to container (fire-and-forget)
  pushWorkflowCache(workflowId, owner.userId, owner.organizationId ?? null);

  return toWorkflowDefinition(workflow);
}

/**
 * Delete a workflow and all related steps/runs.
 */
async function deleteWorkflow(
  owner: WorkflowOwnerFilter,
  workflowId: string
): Promise<void> {
  const existing = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!existing) throw new NotFoundError("Workflow not found");
  verifyOwner(existing, owner);

  await prisma.workflow.delete({ where: { id: workflowId } });
  workflowLogger.info({ workflowId, userId: owner.userId }, "Workflow deleted");

  // Remove cache from container (fire-and-forget)
  removeWorkflowCache(workflowId, owner.userId, owner.organizationId ?? null);
}

// ===========================================
// Workflow Step CRUD
// ===========================================

/**
 * Add a step to a workflow.
 */
async function addStep(
  owner: WorkflowOwnerFilter,
  workflowId: string,
  data: CreateWorkflowStepRequest
): Promise<WorkflowStepDefinition> {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new NotFoundError("Workflow not found");
  verifyOwner(workflow, owner);

  const step = await prisma.workflowStep.create({
    data: {
      workflowId,
      order: data.order,
      name: data.name,
      pluginId: data.pluginId,
      inputMapping: (data.inputMapping ?? {}) as object,
      config: (data.config ?? {}) as object,
      gatewayId: data.gatewayId,
      condition: data.condition ? (data.condition as object) : undefined,
      onError: data.onError ?? "stop",
      maxRetries: data.maxRetries ?? 0,
    },
    include: { plugin: true },
  });

  workflowLogger.info(
    { workflowId, stepId: step.id, order: data.order },
    "Workflow step added"
  );

  // Push updated workflow cache (fire-and-forget)
  pushWorkflowCache(workflowId, owner.userId, owner.organizationId ?? null);

  return toStepDefinition(step);
}

/**
 * Update a workflow step.
 */
async function updateStep(
  owner: WorkflowOwnerFilter,
  workflowId: string,
  stepId: string,
  data: UpdateWorkflowStepRequest
): Promise<WorkflowStepDefinition> {
  const step = await prisma.workflowStep.findUnique({
    where: { id: stepId },
    include: { workflow: true },
  });
  if (!step || step.workflowId !== workflowId) {
    throw new NotFoundError("Workflow step not found");
  }
  verifyOwner(step.workflow, owner);

  // Handle order change separately — requires atomic reorder due to
  // the unique(workflowId, order) constraint.
  if (data.order !== undefined && data.order !== step.order) {
    const newOrder = data.order;
    const oldOrder = step.order;

    await prisma.$transaction(async (tx) => {
      // Temporarily move the dragged step out of the way (use -1)
      await tx.workflowStep.update({
        where: { id: stepId },
        data: { order: -1 },
      });

      if (newOrder < oldOrder) {
        // Moving up: shift steps in [newOrder, oldOrder-1] down by 1
        await tx.$executeRawUnsafe(
          `UPDATE workflow_steps SET "order" = "order" + 1
           WHERE workflow_id = $1 AND "order" >= $2 AND "order" < $3`,
          workflowId,
          newOrder,
          oldOrder
        );
      } else {
        // Moving down: shift steps in [oldOrder+1, newOrder] up by 1
        await tx.$executeRawUnsafe(
          `UPDATE workflow_steps SET "order" = "order" - 1
           WHERE workflow_id = $1 AND "order" > $2 AND "order" <= $3`,
          workflowId,
          oldOrder,
          newOrder
        );
      }

      // Place the dragged step at the target position
      await tx.workflowStep.update({
        where: { id: stepId },
        data: { order: newOrder },
      });
    });
  }

  // Build update payload for non-order fields
  const updateData: Prisma.WorkflowStepUncheckedUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.pluginId !== undefined) updateData.pluginId = data.pluginId;
  if (data.inputMapping !== undefined) updateData.inputMapping = (data.inputMapping ?? {}) as object;
  if (data.config !== undefined) updateData.config = (data.config ?? {}) as object;
  if (data.gatewayId !== undefined) updateData.gatewayId = data.gatewayId ?? null;
  if (data.condition !== undefined) updateData.condition = data.condition ? (data.condition as object) : Prisma.JsonNull;
  if (data.onError !== undefined) updateData.onError = data.onError;
  if (data.maxRetries !== undefined) updateData.maxRetries = data.maxRetries;

  // Only run update if there are non-order fields to change
  const hasNonOrderUpdates = Object.keys(updateData).length > 0;

  const updated = hasNonOrderUpdates
    ? await prisma.workflowStep.update({
        where: { id: stepId },
        data: updateData,
        include: { plugin: true },
      })
    : await prisma.workflowStep.findUniqueOrThrow({
        where: { id: stepId },
        include: { plugin: true },
      });

  // Push updated workflow cache (fire-and-forget)
  pushWorkflowCache(workflowId, owner.userId, owner.organizationId ?? null);

  return toStepDefinition(updated);
}

/**
 * Delete a workflow step.
 */
async function deleteStep(
  owner: WorkflowOwnerFilter,
  workflowId: string,
  stepId: string
): Promise<void> {
  const step = await prisma.workflowStep.findUnique({
    where: { id: stepId },
    include: { workflow: true },
  });
  if (!step || step.workflowId !== workflowId) {
    throw new NotFoundError("Workflow step not found");
  }
  verifyOwner(step.workflow, owner);

  await prisma.workflowStep.delete({ where: { id: stepId } });
  workflowLogger.info({ workflowId, stepId }, "Workflow step deleted");

  // Push updated workflow cache (fire-and-forget)
  pushWorkflowCache(workflowId, owner.userId, owner.organizationId ?? null);
}

// ===========================================
// Workflow Runs
// ===========================================

/**
 * List runs for a workflow.
 */
async function listRuns(
  owner: WorkflowOwnerFilter,
  workflowId: string,
  opts: {
    status?: string;
    page?: number;
    limit?: number;
    sortOrder?: "asc" | "desc";
  } = {}
): Promise<{ runs: WorkflowRunSummary[]; total: number }> {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new NotFoundError("Workflow not found");
  verifyOwner(workflow, owner);

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { workflowId };
  if (opts.status) where.status = opts.status.toLowerCase();

  const [runs, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where,
      include: {
        workflow: { select: { name: true } },
        stepRuns: { select: { id: true, status: true } },
      },
      orderBy: { startedAt: opts.sortOrder ?? "desc" },
      skip,
      take: limit,
    }),
    prisma.workflowRun.count({ where }),
  ]);

  const totalSteps = workflow ? await prisma.workflowStep.count({ where: { workflowId } }) : 0;

  return {
    runs: runs.map((run) => ({
      id: run.id,
      workflowId: run.workflowId,
      workflowName: run.workflow.name,
      triggeredBy: run.triggeredBy,
      status: run.status.toUpperCase(),
      error: run.error ?? undefined,
      startedAt: run.startedAt,
      completedAt: run.completedAt ?? undefined,
      durationMs: run.durationMs ?? undefined,
      stepsCompleted: run.stepRuns.filter(
        (sr) => sr.status === "completed"
      ).length,
      totalSteps,
    })),
    total,
  };
}

/**
 * Get detailed run result with step-level data.
 */
async function getRunDetail(
  owner: WorkflowOwnerFilter,
  workflowId: string,
  runId: string
): Promise<WorkflowRunDetail> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: {
      workflow: {
        select: { name: true, userId: true, organizationId: true },
      },
      stepRuns: { orderBy: { stepOrder: "asc" } },
    },
  });

  if (!run || run.workflowId !== workflowId) {
    throw new NotFoundError("Workflow run not found");
  }
  verifyOwner(
    { userId: run.workflow.userId, organizationId: run.workflow.organizationId },
    owner
  );

  const totalSteps = await prisma.workflowStep.count({ where: { workflowId } });

  // Load workflow steps to populate step names and plugin slugs
  const workflowSteps = await prisma.workflowStep.findMany({
    where: { workflowId },
    include: { plugin: { select: { slug: true } } },
    orderBy: { order: "asc" },
  });
  const stepMap = new Map(
    workflowSteps.map((s) => [s.order, { name: s.name, pluginSlug: s.plugin.slug }])
  );

  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflow.name,
    triggeredBy: run.triggeredBy,
    status: run.status.toUpperCase(),
    error: run.error ?? undefined,
    triggerData: run.triggerData ?? undefined,
    output: run.output ?? undefined,
    failedStepOrder: run.failedStepOrder ?? undefined,
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? undefined,
    durationMs: run.durationMs ?? undefined,
    stepsCompleted: run.stepRuns.filter(
      (sr) => sr.status === "completed"
    ).length,
    totalSteps,
    stepRuns: run.stepRuns.map((sr) => toStepRunDetail(sr, stepMap)),
  };
}

// ===========================================
// Execution recording (called by executor)
// ===========================================

/**
 * Create a WorkflowRun record. Returns the run ID.
 */
async function createRun(
  workflowId: string,
  triggeredBy: string,
  triggerData?: unknown
): Promise<string> {
  const run = await prisma.workflowRun.create({
    data: {
      workflowId,
      triggeredBy,
      triggerData: triggerData !== undefined ? (triggerData as object) : undefined,
      status: "running",
      startedAt: new Date(),
    },
  });
  return run.id;
}

/**
 * Create a WorkflowStepRun record.
 */
async function createStepRun(
  runId: string,
  stepOrder: number
): Promise<string> {
  const sr = await prisma.workflowStepRun.create({
    data: { runId, stepOrder, status: "running", startedAt: new Date() },
  });
  return sr.id;
}

/**
 * Mark a step run as completed.
 */
async function completeStepRun(
  stepRunId: string,
  output: unknown,
  durationMs: number
): Promise<void> {
  await prisma.workflowStepRun.update({
    where: { id: stepRunId },
    data: {
      status: "completed",
      output: output !== undefined ? (output as object) : undefined,
      completedAt: new Date(),
      durationMs,
    },
  });
}

/**
 * Mark a step run as failed.
 */
async function failStepRun(
  stepRunId: string,
  error: string,
  durationMs: number
): Promise<void> {
  await prisma.workflowStepRun.update({
    where: { id: stepRunId },
    data: {
      status: "failed",
      error,
      completedAt: new Date(),
      durationMs,
    },
  });
}

/**
 * Mark a step run as skipped (condition not met).
 */
async function skipStepRun(stepRunId: string): Promise<void> {
  await prisma.workflowStepRun.update({
    where: { id: stepRunId },
    data: { status: "skipped", completedAt: new Date() },
  });
}

/**
 * Complete a workflow run (success).
 */
async function completeRun(
  runId: string,
  output: unknown,
  durationMs: number
): Promise<void> {
  const run = await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      output: output !== undefined ? (output as object) : undefined,
      completedAt: new Date(),
      durationMs,
    },
  });

  // Update workflow stats
  await prisma.workflow.update({
    where: { id: run.workflowId },
    data: {
      executionCount: { increment: 1 },
      lastExecutedAt: new Date(),
      lastError: null,
    },
  });
}

/**
 * Fail a workflow run.
 */
async function failRun(
  runId: string,
  error: string,
  failedStepOrder: number | null,
  durationMs: number
): Promise<void> {
  const run = await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      error,
      failedStepOrder: failedStepOrder,
      completedAt: new Date(),
      durationMs,
    },
  });

  // Update workflow stats
  await prisma.workflow.update({
    where: { id: run.workflowId },
    data: {
      executionCount: { increment: 1 },
      lastExecutedAt: new Date(),
      lastError: error,
    },
  });
}

// ===========================================
// Internal helpers
// ===========================================

function verifyOwner(
  entity: { userId: string; organizationId?: string | null },
  owner: WorkflowOwnerFilter
) {
  if (entity.userId !== owner.userId) {
    throw new ForbiddenError("Access denied");
  }
  // If owner specifies org, the entity must also belong to that org
  if (owner.organizationId && entity.organizationId !== owner.organizationId) {
    throw new ForbiddenError("Access denied");
  }
}

/**
 * Map Prisma Workflow (with steps+plugin) to WorkflowDefinition response type.
 */
function toWorkflowDefinition(workflow: {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  scope: string;
  triggerType: string;
  triggerConfig: unknown;
  gatewayId: string | null;
  status: string;
  isEnabled: boolean;
  executionCount: number;
  lastExecutedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    id: string;
    order: number;
    name: string | null;
    pluginId: string;
    inputMapping: unknown;
    config: unknown;
    gatewayId: string | null;
    condition: unknown;
    onError: string;
    maxRetries: number;
    plugin: { slug: string; name: string };
  }>;
}): WorkflowDefinition {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? undefined,
    slug: workflow.slug,
    scope: workflow.scope as WorkflowDefinition["scope"],
    triggerType: workflow.triggerType as WorkflowDefinition["triggerType"],
    triggerConfig: (workflow.triggerConfig ?? {}) as TriggerConfig,
    gatewayId: workflow.gatewayId ?? undefined,
    status: workflow.status as WorkflowDefinition["status"],
    isEnabled: workflow.isEnabled,
    steps: workflow.steps.map(toStepDefinition),
    executionCount: workflow.executionCount,
    lastExecutedAt: workflow.lastExecutedAt ?? undefined,
    lastError: workflow.lastError ?? undefined,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}

function toStepDefinition(step: {
  id: string;
  order: number;
  name: string | null;
  pluginId: string;
  inputMapping: unknown;
  config: unknown;
  gatewayId: string | null;
  condition: unknown;
  onError: string;
  maxRetries: number;
  plugin: { slug: string; name: string };
}): WorkflowStepDefinition {
  return {
    id: step.id,
    order: step.order,
    name: step.name ?? undefined,
    pluginId: step.pluginId,
    pluginSlug: step.plugin.slug,
    pluginName: step.plugin.name,
    inputMapping: (step.inputMapping ?? {}) as InputMapping,
    config: (step.config ?? {}) as Record<string, unknown>,
    gatewayId: step.gatewayId ?? undefined,
    condition: step.condition
      ? (step.condition as StepCondition)
      : undefined,
    onError: step.onError as StepErrorHandler,
    maxRetries: step.maxRetries,
  };
}

function toStepRunDetail(
  sr: {
    id: string;
    stepOrder: number;
    status: string;
    input: unknown;
    output: unknown;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
  },
  stepMap?: Map<number, { name: string | null; pluginSlug: string }>
): WorkflowStepRunDetail {
  const stepInfo = stepMap?.get(sr.stepOrder);
  return {
    id: sr.id,
    stepOrder: sr.stepOrder,
    stepName: stepInfo?.name ?? undefined,
    pluginSlug: stepInfo?.pluginSlug ?? "",
    status: sr.status.toUpperCase(),
    input: sr.input ?? undefined,
    output: sr.output ?? undefined,
    error: sr.error ?? undefined,
    startedAt: sr.startedAt ?? undefined,
    completedAt: sr.completedAt ?? undefined,
    durationMs: sr.durationMs ?? undefined,
  };
}

// ===========================================
// Cleanup
// ===========================================

/** Max age (ms) for a run to be considered orphaned (10 minutes) */
const ORPHANED_RUN_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Mark stale "running" runs and step runs as failed.
 * Should be called once on server startup to clean up after crashes/restarts.
 */
async function cleanupOrphanedRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - ORPHANED_RUN_THRESHOLD_MS);

  // Fail orphaned step runs first
  await prisma.workflowStepRun.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      error: "Server restarted during execution",
      completedAt: new Date(),
    },
  });

  // Fail orphaned workflow runs
  const result = await prisma.workflowRun.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      error: "Server restarted during execution",
      completedAt: new Date(),
    },
  });

  if (result.count > 0) {
    workflowLogger.info(
      { count: result.count },
      "Cleaned up orphaned workflow runs from previous server instance"
    );
  }

  return result.count;
}

// ===========================================
// Exported service object
// ===========================================

export const workflowService = {
  // Workflow CRUD
  createWorkflow,
  listWorkflows,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,

  // Step CRUD
  addStep,
  updateStep,
  deleteStep,

  // Runs
  listRuns,
  getRunDetail,

  // Execution recording (used by executor)
  createRun,
  createStepRun,
  completeStepRun,
  failStepRun,
  skipStepRun,
  completeRun,
  failRun,

  // Maintenance
  cleanupOrphanedRuns,
};
