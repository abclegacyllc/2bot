/**
 * AI BuildSpec Orchestrator (Wave 1)
 *
 * Atomically applies a validated BuildSpec to the database in this order:
 *   1. Resolve / create the Project.
 *   2. Resolve / create Gateways (re-using gatewayService for credential
 *      encryption).
 *   3. Install marketplace plugins as UserPlugins (Wave 1: existing plugins
 *      only — code generation will arrive in Wave 2).
 *   4. Create Workflows (status: DRAFT) + WorkflowSteps + WorkflowEdges +
 *      WorkflowGateway link rows.
 *   5. Run smoke tests (preflight) on each requested workflow.
 *   6. On success: activate workflows that requested `activateOnSuccess`.
 *   7. On smoke failure: roll back everything created during this apply
 *      (gateways are rolled back too, to keep the apply atomic).
 *
 * Wave 1 limitations (documented in repo memory):
 *   • Does NOT write plugin source code to the bridge filesystem; only
 *     references existing Plugin rows (BUILTIN/MARKETPLACE/USER).
 *   • Smoke test == preflight only.
 *
 * @module modules/ai-builder/orchestrator.service
 */

import type { z } from "zod";

import { logger } from "@/lib/logger";
import {
    buildspecApplyTotal,
    buildspecSmokeFailuresTotal,
} from "@/lib/metrics";
import { prisma } from "@/lib/prisma";
import { gatewayService } from "@/modules/gateway/gateway.service";
import {
    gatewayTypeToPlatform,
    getPluginEntryPath,
    isDirectoryLayout,
} from "@/modules/plugin/plugin-deploy.service";
import {
    createHttpRouteResource,
    createScheduleResource,
    createSecretResource,
} from "@/modules/project-resource/project-resource.service";
import { ensureDefaultProject } from "@/modules/project/project.service";
import { createServiceContext } from "@/shared/types/context";

import { BuildSpecV1 } from "./buildspec.schema";
import type {
    BuildSpec,
    BuildSpecApplyOptions,
    BuildSpecApplyResult,
    BuildSpecOwner,
    BuildSpecSmokeResult,
    ValidatedBuildSpec,
} from "./buildspec.types";
import { runSmokeTests } from "./smoke-test.runner";

const builderLogger = logger.child({ module: "ai-builder" });

// ─────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────

export interface ValidationOk {
  ok: true;
  spec: ValidatedBuildSpec;
}
export interface ValidationFail {
  ok: false;
  errors: Record<string, string[]>;
}

/**
 * Validates a raw BuildSpec object against the zod schema.
 * Cross-references (gatewayRef, stepRef, etc.) are checked here.
 */
export function validateBuildSpec(input: unknown): ValidationOk | ValidationFail {
  const parsed = BuildSpecV1.safeParse(input);
  if (parsed.success) {
    return { ok: true, spec: parsed.data };
  }
  return { ok: false, errors: formatZodErrors(parsed.error) };
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

// ─────────────────────────────────────────────────────────────────────
// Apply
// ─────────────────────────────────────────────────────────────────────

interface RollbackHandles {
  workflowIds: string[];
  userPluginIds: string[];
  gatewayIds: string[];
  /** ProjectResource ids created during apply (HTTP_ROUTE / SCHEDULE / SECRET). */
  resourceIds: string[];
  /** Project id is only added if we CREATED the project (not if we used an
   *  existing one). */
  createdProjectId?: string;
}

/**
 * Applies a BuildSpec atomically. Validates, then runs through the create
 * pipeline. If any step throws or smoke tests fail (when
 * rollbackOnSmokeFailure is true), every resource created during this call
 * is deleted in reverse-creation order.
 */
export async function applyBuildSpec(
  owner: BuildSpecOwner,
  rawSpec: unknown,
  options: BuildSpecApplyOptions = {},
): Promise<BuildSpecApplyResult> {
  const dryRun = options.dryRun ?? false;
  const rollbackOnSmokeFailure = options.rollbackOnSmokeFailure ?? true;
  const source = options.source ?? "api";

  // 1. Validate
  const v = validateBuildSpec(rawSpec);
  if (!v.ok) {
    buildspecApplyTotal.inc({ status: "validation-failed", source });
    return {
      status: "validation-failed",
      refMap: { gateways: {}, plugins: {}, workflows: {}, resources: {} },
      smokeResults: [],
      validationErrors: v.errors,
    };
  }
  const spec: ValidatedBuildSpec = v.spec;

  // Dry-run: stop here; nothing was mutated.
  if (dryRun) {
    return {
      status: "applied",
      refMap: { gateways: {}, plugins: {}, workflows: {}, resources: {} },
      smokeResults: [],
    };
  }

  const refMap: BuildSpecApplyResult["refMap"] = {
    gateways: {},
    plugins: {},
    workflows: {},
    resources: {},
  };
  const rollback: RollbackHandles = {
    workflowIds: [],
    userPluginIds: [],
    gatewayIds: [],
    resourceIds: [],
  };

  let projectId: string | undefined;

  try {
    // 2. Project
    projectId = await resolveProject(owner, spec, rollback);

    // 3. Gateways
    await resolveGateways(owner, spec, projectId, refMap, rollback);

    // 4. Plugin installs (UserPlugin rows)
    await resolvePluginInstalls(owner, spec, projectId, refMap, rollback);

    // 5. Workflows + steps + edges + workflow_gateways
    await resolveWorkflows(owner, spec, projectId, refMap, rollback);

    // 5b. ProjectResources (HTTP_ROUTE / SCHEDULE / SECRET).
    //     Runs AFTER workflows so that `targetWorkflowRef` and
    //     `targetPluginRef` resolve to real DB ids.
    await resolveResources(owner, spec, projectId, refMap, rollback);

    // 6. Smoke tests
    const smokeResults = await runSmokeTests(owner, spec, refMap.workflows);
    const anyFailed = smokeResults.some((r) => !r.ok);

    if (anyFailed) {
      buildspecSmokeFailuresTotal.inc({ reason: "preflight" });
      if (rollbackOnSmokeFailure) {
        await rollbackAll(rollback);
        buildspecApplyTotal.inc({ status: "rolled-back", source });
        return {
          status: "rolled-back",
          projectId: rollback.createdProjectId ? undefined : projectId,
          refMap: { gateways: {}, plugins: {}, workflows: {}, resources: {} },
          smokeResults,
          rollbackReason: "smoke-test-failed",
        };
      }
    }

    // 7. Activate workflows flagged for activateOnSuccess
    await activateWorkflows(spec, refMap.workflows);

    buildspecApplyTotal.inc({ status: "applied", source });
    builderLogger.info(
      { projectId, refMap, smokeResults: smokeResults.length },
      "BuildSpec applied",
    );
    return {
      status: "applied",
      projectId,
      refMap,
      smokeResults,
    };
  } catch (err) {
    builderLogger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "BuildSpec apply failed; rolling back",
    );
    buildspecSmokeFailuresTotal.inc({ reason: "exception" });
    await rollbackAll(rollback);
    buildspecApplyTotal.inc({ status: "rolled-back", source });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Step implementations
// ─────────────────────────────────────────────────────────────────────

async function resolveProject(
  owner: BuildSpecOwner,
  spec: ValidatedBuildSpec,
  rollback: RollbackHandles,
): Promise<string> {
  if (spec.project.existingId) {
    const existing = await prisma.project.findUnique({
      where: { id: spec.project.existingId },
    });
    if (!existing) {
      throw new Error(`Project ${spec.project.existingId} not found`);
    }
    if (existing.userId !== owner.userId) {
      throw new Error(`Project ${spec.project.existingId} not owned by caller`);
    }
    return existing.id;
  }

  // Compute slug
  const baseSlug = spec.project.slug ?? slugify(spec.project.name);
  // Ensure unique slug within (user, org) — fall back to "<slug>-<ts>".
  const slug = await uniqueProjectSlug(owner, baseSlug);

  // Make sure a default exists (so other resources have an anchor).
  await ensureDefaultProject({ userId: owner.userId, organizationId: owner.organizationId ?? null });

  const created = await prisma.project.create({
    data: {
      userId: owner.userId,
      organizationId: owner.organizationId ?? null,
      name: spec.project.name.trim(),
      slug,
      kind: spec.project.kind,
      description: spec.project.description ?? null,
      icon: spec.project.icon ?? null,
      color: spec.project.color ?? null,
      status: "ACTIVE",
      isDefault: false,
    },
  });
  rollback.createdProjectId = created.id;
  return created.id;
}

async function resolveGateways(
  owner: BuildSpecOwner,
  spec: ValidatedBuildSpec,
  projectId: string,
  refMap: BuildSpecApplyResult["refMap"],
  rollback: RollbackHandles,
): Promise<void> {
  const ctx = createServiceContext({
    userId: owner.userId,
    role: "MEMBER",
    plan: "FREE",
  });

  for (const gw of spec.gateways) {
    if (gw.source === "existing") {
      const found = await prisma.gateway.findUnique({ where: { id: gw.id } });
      if (!found) throw new Error(`Existing gateway ${gw.id} not found`);
      if (found.userId !== owner.userId) {
        throw new Error(`Gateway ${gw.id} not owned by caller`);
      }
      refMap.gateways[gw.ref] = found.id;
      // Attach to project if not already attached.
      if (found.projectId !== projectId) {
        await prisma.gateway.update({
          where: { id: found.id },
          data: { projectId },
        });
      }
      continue;
    }

    // source === "new"
    const created = await gatewayService.create(ctx, {
      name: gw.name,
      type: gw.type,
      // Cast: the schema accepts a permissive credential bag; gatewayService
      // will validate per-type at create time.
      credentials: gw.credentials as Parameters<typeof gatewayService.create>[1]["credentials"],
      config: gw.config as Parameters<typeof gatewayService.create>[1]["config"],
    });
    refMap.gateways[gw.ref] = created.id;
    rollback.gatewayIds.push(created.id);

    // Attach to project.
    await prisma.gateway.update({
      where: { id: created.id },
      data: { projectId },
    });
  }
}

async function resolvePluginInstalls(
  owner: BuildSpecOwner,
  spec: ValidatedBuildSpec,
  projectId: string,
  refMap: BuildSpecApplyResult["refMap"],
  rollback: RollbackHandles,
): Promise<void> {
  for (const inst of spec.plugins) {
    const plugin = await prisma.plugin.findUnique({
      where: { slug: inst.pluginSlug },
    });
    if (!plugin) {
      throw new Error(
        `Plugin "${inst.pluginSlug}" not found in marketplace; Wave 1 cannot create new plugin code`,
      );
    }

    const gatewayId = inst.gatewayRef
      ? refMap.gateways[inst.gatewayRef] ?? null
      : null;

    let entryFile: string | null = null;
    if (gatewayId) {
      const gw = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: { type: true },
      });
      const platform = gw ? gatewayTypeToPlatform(gw.type) : undefined;
      entryFile = getPluginEntryPath(gatewayId, plugin.slug, {
        platform,
        isDirectory: isDirectoryLayout(plugin.slug),
      });
    } else {
      entryFile = getPluginEntryPath(null, plugin.slug, {
        isDirectory: isDirectoryLayout(plugin.slug),
      });
    }

    // Use upsert by the (userId, pluginId, organizationId, gatewayId)
    // unique constraint to be idempotent when the AI re-applies a spec.
    const existing = await prisma.userPlugin.findFirst({
      where: {
        userId: owner.userId,
        pluginId: plugin.id,
        organizationId: owner.organizationId ?? null,
        gatewayId,
      },
    });

    if (existing) {
      await prisma.userPlugin.update({
        where: { id: existing.id },
        data: {
          projectId,
          config: (inst.config ?? existing.config) as object,
          entryFile,
          isEnabled: true,
        },
      });
      refMap.plugins[inst.ref] = existing.id;
      // Note: no rollback push — we did not create this row.
    } else {
      const created = await prisma.userPlugin.create({
        data: {
          userId: owner.userId,
          pluginId: plugin.id,
          organizationId: owner.organizationId ?? null,
          projectId,
          gatewayId,
          config: (inst.config ?? {}) as object,
          entryFile,
          isEnabled: true,
        },
      });
      refMap.plugins[inst.ref] = created.id;
      rollback.userPluginIds.push(created.id);
    }
  }
}

async function resolveWorkflows(
  owner: BuildSpecOwner,
  spec: ValidatedBuildSpec,
  projectId: string,
  refMap: BuildSpecApplyResult["refMap"],
  rollback: RollbackHandles,
): Promise<void> {
  for (const wf of spec.workflows) {
    // Pick the trigger gateway (first link with role=trigger), if any.
    const triggerLink = wf.gateways.find((g) => g.role === "trigger");
    const triggerGatewayId = triggerLink
      ? refMap.gateways[triggerLink.gatewayRef] ?? null
      : null;

    // Slug uniqueness within (userId, organizationId).
    const slug = await uniqueWorkflowSlug(owner, wf.slug);

    const workflow = await prisma.workflow.create({
      data: {
        userId: owner.userId,
        organizationId: owner.organizationId ?? null,
        projectId,
        name: wf.name,
        slug,
        description: wf.description ?? null,
        triggerType: wf.triggerType,
        triggerConfig: (wf.triggerConfig ?? {}) as object,
        gatewayId: triggerGatewayId,
        status: "DRAFT",
        isEnabled: false,
      },
    });
    refMap.workflows[wf.ref] = workflow.id;
    rollback.workflowIds.push(workflow.id);

    // WorkflowGateway link rows.
    for (const link of wf.gateways) {
      const gid = refMap.gateways[link.gatewayRef];
      if (!gid) continue;
      await prisma.workflowGateway.upsert({
        where: {
          workflowId_gatewayId_role: {
            workflowId: workflow.id,
            gatewayId: gid,
            role: link.role,
          },
        },
        create: {
          workflowId: workflow.id,
          gatewayId: gid,
          role: link.role,
        },
        update: {},
      });
    }

    // Steps.
    const stepIdByRef: Record<string, string> = {};
    for (const step of wf.steps) {
      const plugin = await prisma.plugin.findUnique({
        where: { slug: step.pluginSlug },
        select: { id: true, slug: true, authorType: true },
      });
      if (!plugin) {
        throw new Error(
          `Workflow "${wf.ref}" step "${step.ref}" references unknown plugin slug "${step.pluginSlug}"`,
        );
      }
      const stepGatewayId = step.gatewayRef
        ? refMap.gateways[step.gatewayRef] ?? null
        : triggerGatewayId;

      let entryFile: string | null = null;
      if (stepGatewayId) {
        const gw = await prisma.gateway.findUnique({
          where: { id: stepGatewayId },
          select: { type: true },
        });
        const platform = gw ? gatewayTypeToPlatform(gw.type) : undefined;
        entryFile = getPluginEntryPath(stepGatewayId, plugin.slug, {
          platform,
          isDirectory: isDirectoryLayout(plugin.slug),
        });
      } else {
        entryFile = getPluginEntryPath(null, plugin.slug, {
          isDirectory: isDirectoryLayout(plugin.slug),
        });
      }

      const created = await prisma.workflowStep.create({
        data: {
          workflowId: workflow.id,
          order: step.order,
          name: step.name,
          pluginId: plugin.id,
          isEnabled: true,
          inputMapping: (step.inputMapping ?? {}) as object,
          config: (step.config ?? {}) as object,
          gatewayId: stepGatewayId,
          entryFile,
          positionX: step.positionX ?? 0,
          positionY: step.positionY ?? 0,
        },
      });
      stepIdByRef[step.ref] = created.id;
    }

    // Edges.
    for (const edge of wf.edges) {
      const sourceStepId = stepIdByRef[edge.fromStepRef];
      const targetStepId = stepIdByRef[edge.toStepRef];
      if (!sourceStepId || !targetStepId) continue;
      await prisma.workflowEdge.create({
        data: {
          workflowId: workflow.id,
          sourceStepId,
          targetStepId,
        },
      });
    }
  }
}

async function activateWorkflows(
  spec: ValidatedBuildSpec,
  workflowMap: Record<string, string>,
): Promise<void> {
  for (const wf of spec.workflows) {
    if (!wf.activateOnSuccess) continue;
    const id = workflowMap[wf.ref];
    if (!id) continue;
    await prisma.workflow.update({
      where: { id },
      data: { status: "ACTIVE", isEnabled: true },
    });
  }
}

/**
 * Apply ProjectResource rows declared in `spec.resources[]`.
 *
 * Runs after `resolveWorkflows` so that spec-local refs (`targetWorkflowRef`,
 * `targetPluginRef`) can be mapped to real DB ids via `refMap`. Each created
 * resource id is pushed onto `rollback.resourceIds` for atomic rollback;
 * deleting a ProjectResource cascades to its sidecar (HttpRoute / Schedule /
 * Secret) via the schema's `onDelete: Cascade` FK.
 */
async function resolveResources(
  owner: BuildSpecOwner,
  spec: ValidatedBuildSpec,
  projectId: string,
  refMap: BuildSpecApplyResult["refMap"],
  rollback: RollbackHandles,
): Promise<void> {
  if (spec.resources.length === 0) return;

  // Hard-fail if the runtime is gated off — creating HTTP_ROUTE / SCHEDULE
  // resources while `FEATURE_PROJECT_RESOURCES=disabled` would silently
  // produce dead routes (no nginx route, no cron tick) and confuse users.
  const flag = (process.env.FEATURE_PROJECT_RESOURCES ?? "disabled").toLowerCase();
  if (flag !== "enabled") {
    throw new Error(
      "ProjectResources (HTTP_ROUTE / SCHEDULE / SECRET) are disabled on this " +
        "deployment. Set FEATURE_PROJECT_RESOURCES=enabled to apply BuildSpecs " +
        "that declare a `resources[]` block.",
    );
  }

  for (const r of spec.resources) {
    if (r.kind === "HTTP_ROUTE") {
      const targetUserPluginId = r.httpRoute.targetPluginRef
        ? refMap.plugins[r.httpRoute.targetPluginRef] ?? null
        : null;
      const targetWorkflowId = r.httpRoute.targetWorkflowRef
        ? refMap.workflows[r.httpRoute.targetWorkflowRef] ?? null
        : null;
      const created = await createHttpRouteResource(owner, {
        projectId,
        name: r.name,
        slug: r.slug,
        httpRoute: {
          method: r.httpRoute.method,
          path: r.httpRoute.path,
          targetUserPluginId,
          targetWorkflowId,
          targetExport: r.httpRoute.targetExport ?? null,
          authMode: r.httpRoute.authMode,
          authConfig: r.httpRoute.authConfig,
          maxBodyKb: r.httpRoute.maxBodyKb,
          timeoutMs: r.httpRoute.timeoutMs,
          corsOrigin: r.httpRoute.corsOrigin ?? null,
          passthroughBody: r.httpRoute.passthroughBody,
        },
      });
      refMap.resources[r.ref] = created.id;
      rollback.resourceIds.push(created.id);
      continue;
    }

    if (r.kind === "SCHEDULE") {
      const targetWorkflowId = r.schedule.targetWorkflowRef
        ? refMap.workflows[r.schedule.targetWorkflowRef] ?? null
        : null;
      const created = await createScheduleResource(owner, {
        projectId,
        name: r.name,
        slug: r.slug,
        schedule: {
          cron: r.schedule.cron,
          timezone: r.schedule.timezone ?? null,
          targetWorkflowId,
          enabled: r.schedule.enabled,
        },
      });
      refMap.resources[r.ref] = created.id;
      rollback.resourceIds.push(created.id);
      continue;
    }

    if (r.kind === "SECRET") {
      const created = await createSecretResource(owner, {
        projectId,
        name: r.name,
        slug: r.slug,
        secret: {
          key: r.secret.key,
          value: r.secret.value,
          description: r.secret.description ?? null,
        },
      });
      refMap.resources[r.ref] = created.id;
      rollback.resourceIds.push(created.id);
      continue;
    }
  }
}

async function rollbackAll(rb: RollbackHandles): Promise<void> {
  // Reverse-creation order. Workflows cascade to steps/edges/workflow_gateways
  // via FK on delete cascade. ProjectResources cascade to their sidecars
  // (HttpRoute / Schedule / Secret) via schema FKs. UserPlugins and gateways
  // are deleted explicitly.
  if (rb.resourceIds.length > 0) {
    await prisma.projectResource.deleteMany({
      where: { id: { in: rb.resourceIds } },
    });
  }
  if (rb.workflowIds.length > 0) {
    await prisma.workflow.deleteMany({ where: { id: { in: rb.workflowIds } } });
  }
  if (rb.userPluginIds.length > 0) {
    await prisma.userPlugin.deleteMany({ where: { id: { in: rb.userPluginIds } } });
  }
  if (rb.gatewayIds.length > 0) {
    await prisma.gateway.deleteMany({ where: { id: { in: rb.gatewayIds } } });
  }
  if (rb.createdProjectId) {
    await prisma.project.delete({ where: { id: rb.createdProjectId } }).catch(() => undefined);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "project"
  );
}

async function uniqueProjectSlug(owner: BuildSpecOwner, base: string): Promise<string> {
  const baseSlug = slugify(base);
  const existing = await prisma.project.findFirst({
    where: {
      userId: owner.userId,
      organizationId: owner.organizationId ?? null,
      slug: baseSlug,
    },
  });
  if (!existing) return baseSlug;
  return `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
}

async function uniqueWorkflowSlug(owner: BuildSpecOwner, base: string): Promise<string> {
  const baseSlug = slugify(base);
  const existing = await prisma.workflow.findFirst({
    where: {
      userId: owner.userId,
      organizationId: owner.organizationId ?? null,
      slug: baseSlug,
    },
  });
  if (!existing) return baseSlug;
  return `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
}

// ─────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────

export type { BuildSpec, BuildSpecApplyResult, BuildSpecOwner, BuildSpecSmokeResult };
