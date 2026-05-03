/**
 * Workflow Routes
 *
 * REST API endpoints for workflow CRUD, steps, triggering, and run history.
 *
 * Routes:
 *   GET    /workflows              - List workflows
 *   POST   /workflows              - Create workflow
 *   GET    /workflows/:id          - Get workflow
 *   PATCH  /workflows/:id          - Update workflow
 *   DELETE /workflows/:id          - Delete workflow
 *   POST   /workflows/:id/steps    - Add step
 *   PATCH  /workflows/:id/steps/:stepId - Update step
 *   DELETE /workflows/:id/steps/:stepId - Delete step
 *   POST   /workflows/:id/preflight - Static validation (no execution)
 *   POST   /workflows/:id/trigger  - Trigger workflow manually (supports test modes)
 *   GET    /workflows/:id/runs     - List runs
 *   GET    /workflows/:id/runs/:runId - Get run detail
 *
 * @module server/routes/workflow
 */

import { executeWorkflow } from "@/modules/workflow/workflow.executor";
import { preflightWorkflow } from "@/modules/workflow/workflow.preflight";
import { getFix } from "@/modules/workflow/preflight-fix-registry";
import { workflowService } from "@/modules/workflow/workflow.service";
import {
    createWorkflowSchema,
    createWorkflowStepSchema,
    installPluginStepSchema,
    triggerWorkflowSchema,
    updateWorkflowSchema,
    updateWorkflowStepSchema,
    workflowListQuerySchema,
    workflowRunListQuerySchema,
} from "@/modules/workflow/workflow.validation";
import { BadRequestError, ValidationError } from "@/shared/errors";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const workflowRouter = Router();

// All routes require authentication
workflowRouter.use(requireAuth);

// ===========================================
// Helpers
// ===========================================

function getUserId(req: Request): string {
  if (!req.user) throw new BadRequestError("User not authenticated");
  return req.user.id;
}

function getOwner(req: Request) {
  const userId = getUserId(req);
  // Org context from header (optional)
  const organizationId = req.headers["x-organization-id"] as string | undefined;
  return { userId, organizationId: organizationId || undefined };
}

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}

function formatZodErrors(
  error: { issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.map((p) => String(p)).join(".") || "_root";
    if (!errors[path]) errors[path] = [];
    errors[path].push(issue.message);
  }
  return errors;
}

// ===========================================
// Workflow CRUD
// ===========================================

/**
 * GET /workflows
 * List workflows for the authenticated user
 */
workflowRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = workflowListQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ValidationError("Invalid query parameters", formatZodErrors(parseResult.error));
    }

    const result = await workflowService.listWorkflows(owner, parseResult.data);

    res.json({
      success: true,
      data: result.workflows,
      meta: {
        total: result.total,
        page: parseResult.data.page,
        limit: parseResult.data.limit,
      },
    });
  })
);

/**
 * POST /workflows
 * Create a new workflow
 */
workflowRouter.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = createWorkflowSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const workflow = await workflowService.createWorkflow(owner, parseResult.data);

    res.status(201).json({
      success: true,
      data: workflow,
    });
  })
);

/**
 * GET /workflows/:id
 * Get workflow by ID
 */
workflowRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const workflow = await workflowService.getWorkflow(owner, getParam(req, "id"));

    res.json({
      success: true,
      data: workflow,
    });
  })
);

/**
 * PATCH /workflows/:id
 * Update a workflow
 */
workflowRouter.patch(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = updateWorkflowSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const workflow = await workflowService.updateWorkflow(
      owner,
      getParam(req, "id"),
      parseResult.data
    );

    res.json({
      success: true,
      data: workflow,
    });
  })
);

/**
 * DELETE /workflows/:id
 * Delete a workflow
 */
workflowRouter.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    await workflowService.deleteWorkflow(owner, getParam(req, "id"));

    res.json({ success: true });
  })
);

// ===========================================
// Workflow Steps
// ===========================================

/**
 * POST /workflows/:id/steps/install-plugin
 * Install a marketplace plugin as a workflow step (unified operation).
 * Deploys template to container + creates step in one call.
 */
workflowRouter.post(
  "/:id/steps/install-plugin",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = installPluginStepSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const step = await workflowService.installPluginStep(
      owner,
      getParam(req, "id"),
      parseResult.data
    );

    res.status(201).json({
      success: true,
      data: step,
    });
  })
);

/**
 * POST /workflows/:id/steps
 * Add a step to a workflow
 */
workflowRouter.post(
  "/:id/steps",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = createWorkflowStepSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const step = await workflowService.addStep(
      owner,
      getParam(req, "id"),
      parseResult.data
    );

    res.status(201).json({
      success: true,
      data: step,
    });
  })
);

/**
 * PATCH /workflows/:id/steps/:stepId
 * Update a workflow step
 */
workflowRouter.patch(
  "/:id/steps/:stepId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = updateWorkflowStepSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const step = await workflowService.updateStep(
      owner,
      getParam(req, "id"),
      getParam(req, "stepId"),
      parseResult.data
    );

    res.json({
      success: true,
      data: step,
    });
  })
);

/**
 * DELETE /workflows/:id/steps/:stepId
 * Delete a workflow step
 */
workflowRouter.delete(
  "/:id/steps/:stepId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    await workflowService.deleteStep(owner, getParam(req, "id"), getParam(req, "stepId"));

    res.json({ success: true });
  })
);

// ===========================================
// Edge CRUD (Graph connections)
// ===========================================

/**
 * POST /workflows/:id/edges
 * Add a connection (edge) between two nodes in the workflow graph.
 * sourceStepId=null means the edge comes from the trigger.
 */
workflowRouter.post(
  "/:id/edges",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const { sourceStepId, targetStepId, sourcePort, targetPort } = req.body;
    if (!targetStepId || typeof targetStepId !== "string") {
      throw new ValidationError("targetStepId is required");
    }
    const edge = await workflowService.addEdge(owner, getParam(req, "id"), {
      sourceStepId: sourceStepId ?? null,
      targetStepId,
      sourcePort,
      targetPort,
    });
    res.status(201).json({ success: true, data: edge });
  })
);

/**
 * DELETE /workflows/:id/edges/:edgeId
 * Delete a single edge from the workflow graph.
 */
workflowRouter.delete(
  "/:id/edges/:edgeId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    await workflowService.deleteEdge(owner, getParam(req, "id"), getParam(req, "edgeId"));
    res.json({ success: true });
  })
);

/**
 * PUT /workflows/:id/edges
 * Bulk replace all edges for a workflow (save entire graph layout).
 */
workflowRouter.put(
  "/:id/edges",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const { edges } = req.body;
    if (!Array.isArray(edges)) {
      throw new ValidationError("edges must be an array");
    }
    const result = await workflowService.replaceEdges(owner, getParam(req, "id"), edges);
    res.json({ success: true, data: result });
  })
);

// ===========================================
// Triggering
// ===========================================

/**
 * POST /workflows/:id/preflight
 *
 * Static-only validation of a workflow (no execution).
 *
 * Used by the Test button's Quick mode and as the first phase of Standard/Deep
 * test runs. Returns a structured PreflightReport including per-step plugin
 * file syntax checks (via the workspace bridge agent) when available.
 */
workflowRouter.post(
  "/:id/preflight",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const workflowId = getParam(req, "id");

    // Verify ownership (this loads the workflow; preflight loads it again with details)
    await workflowService.getWorkflow(owner, workflowId);

    const report = await preflightWorkflow(owner, workflowId);

    res.json({
      success: true,
      data: report,
    });
  })
);

/**
 * POST /workflows/:id/preflight/fix
 *
 * Applies a registered auto-fix task to repair a specific preflight problem.
 *
 * Body:
 *   - fixId   : ID of the registered PreflightFixTask
 *   - context : optional extra context (stepId, stepOrder, etc.)
 *
 * Response: { message, rerunPreflight }
 */
workflowRouter.post(
  "/:id/preflight/fix",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);
    const workflowId = getParam(req, "id");

    // Verify ownership before applying any mutation
    await workflowService.getWorkflow(owner, workflowId);

    const { fixId, context = {} } = req.body as {
      fixId?: string;
      context?: Record<string, unknown>;
    };

    if (!fixId || typeof fixId !== "string") {
      throw new BadRequestError("fixId is required");
    }

    const task = getFix(fixId);
    if (!task) {
      throw new BadRequestError(`Unknown fix task: "${fixId}"`);
    }

    const result = await task.execute({ workflowId, ...context });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /workflows/:id/trigger
 * Manually trigger a workflow.
 *
 * Body fields:
 *   - params  : trigger payload (forwarded to the workflow as triggerData)
 *   - mode    : "quick" | "standard" | "deep" | "ai"
 *               • quick     → preflight only, no execution
 *               • standard  → preflight + dry-run + log capture (default Test)
 *               • deep      → preflight + live + log capture (real sends)
 *               • ai        → returns 400 (UI handles AI mode separately)
 *   - dryRun  : when set without mode, forces a dry-run live execution.
 *
 * For "quick" mode the response shape is `{ preflight: PreflightReport }`.
 * For execution modes the response shape is `{ runId, preflight? }`.
 */
workflowRouter.post(
  "/:id/trigger",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = triggerWorkflowSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const workflowId = getParam(req, "id");
    await workflowService.getWorkflow(owner, workflowId);

    const { mode, dryRun, params } = parseResult.data;

    // Mode "ai" is handled client-side via the Cursor agent; reject here
    if (mode === "ai") {
      throw new ValidationError(
        "AI test mode is handled by the Cursor agent — use the Studio AI panel.",
      );
    }

    // Mode "quick": preflight only, no execution
    if (mode === "quick") {
      const report = await preflightWorkflow(owner, workflowId);
      res.json({
        success: true,
        data: { preflight: report },
      });
      return;
    }

    // For standard / deep, run preflight first; if there are errors, return early
    // without consuming an execution slot. This prevents wasted gateway calls
    // when the workflow is misconfigured.
    let preflight = null as Awaited<ReturnType<typeof preflightWorkflow>> | null;
    if (mode === "standard" || mode === "deep") {
      preflight = await preflightWorkflow(owner, workflowId);
      if (!preflight.ok) {
        res.status(412).json({
          success: false,
          error: {
            code: "preflight_failed",
            message: "Preflight checks reported errors — fix them before running.",
          },
          data: { preflight },
        });
        return;
      }
    }

    // Determine effective execution options
    //   standard → dry-run + capture logs + allow draft (so users can test before activating)
    //   deep     → live + capture logs + allow draft
    //   default  → live (legacy behavior; honours `dryRun` flag)
    const isStandard = mode === "standard";
    const isDeep = mode === "deep";
    const effectiveDryRun = isStandard ? true : (isDeep ? false : (dryRun === true));
    const effectiveCapture = isStandard || isDeep;
    const effectiveAllowDraft = isStandard || isDeep;

    const runId = await executeWorkflow(
      workflowId,
      "manual",
      params ?? {},
      {
        dryRun: effectiveDryRun,
        captureLogs: effectiveCapture,
        allowDraft: effectiveAllowDraft,
      },
    );

    res.status(202).json({
      success: true,
      data: { runId, preflight },
    });
  })
);

// ===========================================
// Run History
// ===========================================

/**
 * GET /workflows/:id/runs
 * List runs for a workflow
 */
workflowRouter.get(
  "/:id/runs",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = workflowRunListQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ValidationError("Invalid query parameters", formatZodErrors(parseResult.error));
    }

    const result = await workflowService.listRuns(
      owner,
      getParam(req, "id"),
      parseResult.data
    );

    res.json({
      success: true,
      data: result.runs,
      meta: {
        total: result.total,
        page: parseResult.data.page,
        limit: parseResult.data.limit,
      },
    });
  })
);

/**
 * GET /workflows/:id/runs/:runId
 * Get detailed run result
 */
workflowRouter.get(
  "/:id/runs/:runId",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const detail = await workflowService.getRunDetail(
      owner,
      getParam(req, "id"),
      getParam(req, "runId")
    );

    res.json({
      success: true,
      data: detail,
    });
  })
);
