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
 *   POST   /workflows/:id/trigger  - Trigger workflow manually
 *   GET    /workflows/:id/runs     - List runs
 *   GET    /workflows/:id/runs/:runId - Get run detail
 *
 * @module server/routes/workflow
 */

import { executeWorkflow } from "@/modules/workflow/workflow.executor";
import { workflowService } from "@/modules/workflow/workflow.service";
import {
    createWorkflowSchema,
    createWorkflowStepSchema,
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
// Triggering
// ===========================================

/**
 * POST /workflows/:id/trigger
 * Manually trigger a workflow
 */
workflowRouter.post(
  "/:id/trigger",
  asyncHandler(async (req: Request, res: Response) => {
    const owner = getOwner(req);

    const parseResult = triggerWorkflowSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    // Verify ownership before triggering
    const workflowId = getParam(req, "id");
    await workflowService.getWorkflow(owner, workflowId);

    const runId = await executeWorkflow(
      workflowId,
      "manual",
      parseResult.data.params ?? {}
    );

    res.status(202).json({
      success: true,
      data: { runId },
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
