/**
 * Organizations Routes (Org Resources)
 *
 * URL-based API pattern for organization resources (GitHub-style)
 * All routes at /api/orgs/:orgId/* return the specified organization's resources.
 * Uses /api/orgs/ (plural) to match GitHub API convention.
 *
 * @module server/routes/orgs
 */

import { gatewayService } from "@/modules/gateway";
import type { GatewayListItem, SafeGateway } from "@/modules/gateway/gateway.types";
import { createGatewaySchema } from "@/modules/gateway/gateway.validation";
import {
    createDeptSchema,
    departmentService,
    inviteMemberSchema,
    organizationService,
    updateMemberRoleSchema,
    updateOrgSchema,
    type MemberWithUser,
    type SafeDepartment,
    type SafeOrganization,
} from "@/modules/organization";
import { pluginService } from "@/modules/plugin";
import type { SafeUserPlugin } from "@/modules/plugin/plugin.types";
import {
    installPluginSchema,
    togglePluginSchema,
    updatePluginConfigSchema,
} from "@/modules/plugin/plugin.validation";
import {
    allocationService,
    resourceService,
    type OrgResourceStatus,
} from "@/modules/resource";
import { BadRequestError, ValidationError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { createServiceContext, type ServiceContext } from "@/shared/types/context";
import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { requireOrgAdmin, requireOrgMember, requireOrgOwner } from "../middleware/org-auth";
import { orgAlertsRouter } from "./org-alerts";
import { orgBillingRouter } from "./org-billing";
import { orgCreditsRouter } from "./org-credits";

export const orgsRouter = Router();

// All routes require authentication
orgsRouter.use(requireAuth);

// Mount org billing routes at /api/orgs/:orgId/billing/*
orgsRouter.use("/:orgId/billing", orgBillingRouter);

// Mount org credits routes at /api/orgs/:orgId/credits/*
orgsRouter.use("/:orgId/credits", orgCreditsRouter);

// Mount org alerts routes at /api/orgs/:orgId/alerts/* (Phase 6.9)
orgsRouter.use("/:orgId/alerts", orgAlertsRouter);

/**
 * Format Zod validation errors into a simple object
 */
function formatZodErrors(
  error: ZodError
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "general";
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }
  return errors;
}

/**
 * Extract and validate path parameter as string
 */
function getPathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}

/**
 * Helper to create organization ServiceContext from Express request
 * Creates context with explicit organizationId from URL param
 */
function getOrgContext(req: Request, orgId: string): ServiceContext {
  if (!req.user) {
    throw new BadRequestError("User not authenticated");
  }

  // Get org membership role if available (set by requireOrgMember middleware)
  const memberRole = req.orgMembership?.role;

  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
      activeContext: {
        type: 'organization',
        organizationId: orgId,
        orgRole: memberRole,
        // Plan could be fetched from org, but for now use user's plan
        plan: req.user.plan,
      },
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string | undefined,
      requestId: req.headers["x-request-id"] as string | undefined,
    }
  );
}

// ===========================================
// Organization Details Route
// ===========================================

/**
 * GET /api/orgs/:orgId
 *
 * Get organization details by ID
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {SafeOrganization} Organization details
 */
orgsRouter.get(
  "/:orgId",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const org = await organizationService.getById(ctx, orgId);

    res.json({
      success: true,
      data: org,
    });
  })
);

/**
 * PUT /api/orgs/:orgId
 *
 * Update organization details
 * Requires ORG_ADMIN role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @body {string} name - New organization name
 * @body {string} slug - New organization slug
 * @returns {SafeOrganization} Updated organization
 */
orgsRouter.put(
  "/:orgId",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeOrganization>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const parseResult = updateOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const org = await organizationService.update(ctx, orgId, parseResult.data);

    res.json({
      success: true,
      data: org,
    });
  })
);

/**
 * DELETE /api/orgs/:orgId
 *
 * Delete organization
 * Requires ORG_OWNER role
 *
 * @param {string} orgId - Organization ID from URL
 */
orgsRouter.delete(
  "/:orgId",
  requireOrgOwner,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    await organizationService.delete(ctx, orgId);

    res.json({
      success: true,
      data: null,
    });
  })
);

// ===========================================
// Gateway Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/gateways
 *
 * List organization's gateways
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {GatewayListItem[]} Organization's gateways
 */
orgsRouter.get(
  "/:orgId/gateways",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<GatewayListItem[]>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const gateways = await gatewayService.findByUser(ctx);

    res.json({
      success: true,
      data: gateways,
    });
  })
);

/**
 * POST /api/orgs/:orgId/gateways
 *
 * Create a new gateway for the organization
 * Requires ORG_ADMIN role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @body {string} name - Gateway name
 * @body {GatewayType} type - Gateway type (TELEGRAM_BOT, AI, WEBHOOK)
 * @body {object} credentials - Type-specific credentials
 * @body {object} [config] - Optional type-specific config
 * @returns {SafeGateway} Created gateway
 */
orgsRouter.post(
  "/:orgId/gateways",
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeGateway>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const parseResult = createGatewaySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid gateway data", formatZodErrors(parseResult.error));
    }

    const gateway = await gatewayService.create(ctx, parseResult.data);

    res.status(201).json({
      success: true,
      data: gateway,
    });
  })
);

// ===========================================
// Plugin Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/plugins
 *
 * List organization's installed plugins
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {SafeUserPlugin[]} Organization's plugins
 */
orgsRouter.get(
  "/:orgId/plugins",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin[]>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const plugins = await pluginService.getUserPlugins(ctx);

    res.json({
      success: true,
      data: plugins,
    });
  })
);

/**
 * GET /api/orgs/:orgId/plugins/:pluginId
 *
 * Get a specific organization plugin by ID
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} pluginId - UserPlugin ID
 * @returns {SafeUserPlugin} Organization plugin details
 */
orgsRouter.get(
  "/:orgId/plugins/:pluginId",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const orgId = getPathParam(req, "orgId");
    const pluginId = getPathParam(req, "pluginId");
    const ctx = getOrgContext(req, orgId);

    const userPlugin = await pluginService.getUserPluginById(ctx, pluginId);

    res.json({
      success: true,
      data: userPlugin,
    });
  })
);

/**
 * POST /api/orgs/:orgId/plugins/install
 *
 * Install a plugin for the organization
 *
 * @param {string} orgId - Organization ID from URL
 * @body {string} slug - Slug of the plugin to install
 * @body {object} [config] - Plugin configuration
 * @body {string} [gatewayId] - Gateway to bind the plugin to
 * @returns {SafeUserPlugin} Installed plugin
 */
orgsRouter.post(
  "/:orgId/plugins/install",
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const parseResult = installPluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid install data", formatZodErrors(parseResult.error));
    }

    const userPlugin = await pluginService.installPlugin(ctx, parseResult.data);

    res.status(201).json({
      success: true,
      data: userPlugin,
    });
  })
);

/**
 * DELETE /api/orgs/:orgId/plugins/:pluginId
 *
 * Uninstall a plugin from the organization
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} pluginId - UserPlugin ID
 */
orgsRouter.delete(
  "/:orgId/plugins/:pluginId",
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const orgId = getPathParam(req, "orgId");
    const pluginId = getPathParam(req, "pluginId");
    const ctx = getOrgContext(req, orgId);

    await pluginService.uninstallPlugin(ctx, pluginId);

    res.json({
      success: true,
      data: null,
    });
  })
);

/**
 * PUT /api/orgs/:orgId/plugins/:pluginId/config
 *
 * Update organization plugin configuration
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} pluginId - UserPlugin ID
 * @body {object} config - New plugin configuration
 * @returns {SafeUserPlugin} Updated plugin
 */
orgsRouter.put(
  "/:orgId/plugins/:pluginId/config",
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const orgId = getPathParam(req, "orgId");
    const pluginId = getPathParam(req, "pluginId");
    const ctx = getOrgContext(req, orgId);

    const parseResult = updatePluginConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid config data", formatZodErrors(parseResult.error));
    }

    const userPlugin = await pluginService.updatePluginConfig(ctx, pluginId, parseResult.data);

    res.json({
      success: true,
      data: userPlugin,
    });
  })
);

/**
 * POST /api/orgs/:orgId/plugins/:pluginId/toggle
 *
 * Enable or disable an organization plugin
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} pluginId - UserPlugin ID
 * @body {boolean} enabled - Enable or disable the plugin
 * @returns {SafeUserPlugin} Updated plugin
 */
orgsRouter.post(
  "/:orgId/plugins/:pluginId/toggle",
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const orgId = getPathParam(req, "orgId");
    const pluginId = getPathParam(req, "pluginId");
    const ctx = getOrgContext(req, orgId);

    const parseResult = togglePluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid toggle data", formatZodErrors(parseResult.error));
    }

    const userPlugin = await pluginService.togglePlugin(ctx, pluginId, parseResult.data.enabled);

    res.json({
      success: true,
      data: userPlugin,
    });
  })
);

// ===========================================
// Resource & Allocation Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/quota
 *
 * Get organization's resource status
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {OrgResourceStatus} Current resource status
 */
orgsRouter.get(
  "/:orgId/quota",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<OrgResourceStatus>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const quota = await resourceService.getOrgStatus(ctx, orgId);

    res.json({
      success: true,
      data: quota,
    });
  })
);

/**
 * GET /api/orgs/:orgId/allocations
 *
 * List all department allocations for an organization
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {DeptAllocationRecord[]} All department allocations
 */
orgsRouter.get(
  "/:orgId/allocations",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");

    const allocations = await allocationService.getOrgDeptAllocations(orgId);

    // Map to DeptAllocationRecord format for frontend
    const records = allocations.map(a => ({
      id: a.id,
      departmentId: a.departmentId,
      departmentName: a.department.name,
      maxGateways: a.maxGateways,
      maxWorkflows: a.maxWorkflows,
      maxPlugins: a.maxPlugins,
      creditBudget: a.creditBudget,
      maxRamMb: a.ramMb,
      maxCpuCores: a.cpuCores,
      maxStorageMb: a.storageMb,
      allocMode: a.mode,
    }));

    res.json({
      success: true,
      data: records,
    });
  })
);

/**
 * GET /api/orgs/:orgId/allocations/summary
 *
 * Get summary of org allocation usage
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {OrgAllocationSummary} Allocation summary
 */
orgsRouter.get(
  "/:orgId/allocations/summary",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    // Get org status which includes allocation summary
    const status = await resourceService.getOrgStatus(ctx, orgId);

    // Build summary from status
    const summary = {
      orgLimits: {
        maxGateways: status.automation.gateways.count.limit,
        maxWorkflows: status.automation.workflows.count.limit,
        maxPlugins: status.automation.plugins.count.limit,
        creditBudget: status.billing.credits.monthlyBudget,
        maxRamMb: status.workspace?.compute?.ram?.limit ?? null,
        maxCpuCores: status.workspace?.compute?.cpu?.limit ?? null,
        maxStorageMb: status.workspace?.storage?.allocation?.limit ?? null,
      },
      allocatedToDepts: status.allocations?.allocated ?? {
        gateways: 0,
        plugins: 0,
        workflows: 0,
        creditBudget: 0,
        ramMb: 0,
        cpuCores: 0,
        storageMb: 0,
      },
      unallocated: status.allocations?.unallocated ?? {
        gateways: null,
        plugins: null,
        workflows: null,
        creditBudget: null,
        ramMb: null,
        cpuCores: null,
        storageMb: null,
      },
      deptCount: status.allocations?.departmentCount ?? 0,
    };

    res.json({
      success: true,
      data: summary,
    });
  })
);

/**
 * DELETE /api/orgs/:orgId/allocations/:deptId
 *
 * Remove a department's allocation
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 */
orgsRouter.delete(
  "/:orgId/allocations/:deptId",
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const ctx = getOrgContext(req, orgId);

    await allocationService.removeDeptAllocation(ctx, deptId);

    res.json({
      success: true,
      data: null,
    });
  })
);

// ===========================================
// Department Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/departments
 *
 * List organization's departments
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {SafeDepartment[]} Organization's departments
 */
orgsRouter.get(
  "/:orgId/departments",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment[]>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const activeOnly = req.query.activeOnly === "true";
    const departments = await departmentService.getOrgDepartments(ctx, orgId, {
      activeOnly,
    });

    res.json({
      success: true,
      data: departments,
    });
  })
);

/**
 * POST /api/orgs/:orgId/departments
 *
 * Create a new department in the organization
 * Requires ORG_ADMIN role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @body {string} name - Department name
 * @body {string} description - Optional department description
 * @returns {SafeDepartment} Created department
 */
orgsRouter.post(
  "/:orgId/departments",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const parseResult = createDeptSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const department = await departmentService.create(ctx, orgId, parseResult.data);

    res.status(201).json({
      success: true,
      data: department,
    });
  })
);

/**
 * GET /api/orgs/:orgId/departments/:deptId
 *
 * Get department details
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @returns {SafeDepartment} Department details
 */
orgsRouter.get(
  "/:orgId/departments/:deptId",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment>>) => {
    const orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const ctx = getOrgContext(req, orgId);

    const department = await departmentService.getById(ctx, deptId);

    res.json({
      success: true,
      data: department,
    });
  })
);

/**
 * GET /api/orgs/:orgId/departments/:deptId/members
 *
 * Get department members
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @returns Department members with user info
 */
orgsRouter.get(
  "/:orgId/departments/:deptId/members",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const ctx = getOrgContext(req, orgId);

    const members = await departmentService.getMembers(ctx, deptId);

    res.json({
      success: true,
      data: members,
    });
  })
);

// ===========================================
// Department Allocation Routes (Phase 6.9 → Phase B)
// Renamed from "quotas" to "allocations" for 3-pool resource system
// ===========================================

/**
 * GET /api/orgs/:orgId/departments/:deptId/allocations
 *
 * Get department resource allocations
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @returns {DeptAllocationResponse | null} Department resource allocation
 */
orgsRouter.get(
  "/:orgId/departments/:deptId/allocations",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const deptId = getPathParam(req, "deptId");

    const allocation = await allocationService.getDeptAllocation(deptId);

    res.json({
      success: true,
      data: allocation,
    });
  })
);

/**
 * POST /api/orgs/:orgId/departments/:deptId/allocations
 *
 * Set or update department resource allocations
 * Requires ORG_ADMIN role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @body {SetDeptAllocationRequest} Resource allocation values
 * @returns {DeptAllocationResponse} Updated resource allocation
 */
orgsRouter.post(
  "/:orgId/departments/:deptId/allocations",
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const ctx = getOrgContext(req, orgId);

    await allocationService.setDeptAllocation(
      ctx,
      deptId,
      req.body
    );

    const allocation = await allocationService.getDeptAllocation(deptId);

    res.json({
      success: true,
      data: allocation,
    });
  })
);

// ===========================================
// Department Member Allocation Routes (Phase 6.9 → Phase B)
// Renamed from "quotas" to "allocations" for 3-pool resource system
// ===========================================

/**
 * GET /api/orgs/:orgId/departments/:deptId/members/:userId/allocations
 *
 * Get member resource allocations
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @param {string} userId - User ID from URL
 * @returns Member resource allocation
 */
orgsRouter.get(
  "/:orgId/departments/:deptId/members/:userId/allocations",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const _orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");

    const allocation = await allocationService.getMemberAllocation(userId, deptId);

    res.json({
      success: true,
      data: allocation,
    });
  })
);

/**
 * POST /api/orgs/:orgId/departments/:deptId/members/:userId/allocations
 *
 * Set or update member resource allocations
 * Requires DEPT_MANAGER role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @param {string} userId - User ID from URL
 * @body {SetMemberAllocationRequest} Resource allocation values
 * @returns Updated resource allocation
 */
orgsRouter.post(
  "/:orgId/departments/:deptId/members/:userId/allocations",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");
    const ctx = getOrgContext(req, orgId);

    await allocationService.setMemberAllocation(
      ctx,
      userId,
      deptId,
      req.body
    );

    const allocation = await allocationService.getMemberAllocation(userId, deptId);

    res.json({
      success: true,
      data: allocation,
    });
  })
);

// ===========================================
// Member Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/members
 *
 * List organization members
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {MemberWithUser[]} Organization members with user info
 */
orgsRouter.get(
  "/:orgId/members",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<MemberWithUser[]>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const members = await organizationService.getMembers(ctx, orgId);

    res.json({
      success: true,
      data: members,
    });
  })
);

/**
 * POST /api/orgs/:orgId/members
 *
 * Invite a member to the organization
 * Requires ORG_ADMIN role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @body {string} email - Email of user to invite
 * @body {string} role - Role to assign (ORG_MEMBER, ORG_ADMIN, etc.)
 * @returns {MemberWithUser} Created membership
 */
orgsRouter.post(
  "/:orgId/members",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<MemberWithUser>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const parseResult = inviteMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const member = await organizationService.inviteMember(ctx, orgId, parseResult.data);

    res.status(201).json({
      success: true,
      data: member,
    });
  })
);

/**
 * PUT /api/orgs/:orgId/members/:memberId
 *
 * Update a member's role
 * Requires ORG_OWNER role
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} memberId - Membership ID from URL
 * @body {string} role - New role to assign
 * @returns {MemberWithUser} Updated membership
 */
orgsRouter.put(
  "/:orgId/members/:memberId",
  requireOrgOwner,
  asyncHandler(async (req: Request, res: Response<ApiResponse<MemberWithUser>>) => {
    const orgId = getPathParam(req, "orgId");
    const memberId = getPathParam(req, "memberId");
    const ctx = getOrgContext(req, orgId);

    // Look up the membership to get the userId
    const membership = await organizationService.getMembershipById(memberId, orgId);
    if (!membership) {
      throw new BadRequestError("Member not found");
    }

    const parseResult = updateMemberRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const updated = await organizationService.updateMemberRole(
      ctx,
      orgId,
      membership.userId,
      parseResult.data
    );

    res.json({
      success: true,
      data: updated,
    });
  })
);

/**
 * DELETE /api/orgs/:orgId/members/:memberId
 *
 * Remove a member from the organization
 * Requires ORG_ADMIN role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} memberId - Membership ID from URL
 */
orgsRouter.delete(
  "/:orgId/members/:memberId",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const orgId = getPathParam(req, "orgId");
    const memberId = getPathParam(req, "memberId");
    const ctx = getOrgContext(req, orgId);

    // Look up the membership to get the userId
    const membership = await organizationService.getMembershipById(memberId, orgId);
    if (!membership) {
      throw new BadRequestError("Member not found");
    }

    await organizationService.removeMember(ctx, orgId, membership.userId);

    res.json({
      success: true,
      data: null,
    });
  })
);

// ===========================================
// Usage Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/usage
 *
 * Get comprehensive organization usage data for dashboard
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {Object} Organization usage data with departments and members
 */
orgsRouter.get(
  "/:orgId/usage",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    // Get organization details
    const org = await organizationService.getById(ctx, orgId);
    
    // Get resource status (includes quota info)
    const resourceStatus = await resourceService.getOrgStatus(ctx, orgId);
    
    // Get all gateways
    const gateways = await gatewayService.findByUser(ctx);
    
    // Get departments
    const departments = await departmentService.getOrgDepartments(ctx, orgId);
    
    // Get members
    const members = await organizationService.getMembers(ctx, orgId);

    // Calculate reset date (first of next month)
    const now = new Date();
    const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Build department usage data
    const deptUsage = departments.map((dept) => ({
      id: dept.id,
      name: dept.name,
      executions: {
        current: 0, // Would be fetched from quota allocation service
        allocated: null as number | null,
      },
      members: dept.memberCount || 0,
    }));

    // Build member usage data
    const memberUsage = members.map((member) => ({
      id: member.user.id,
      name: member.user.name || member.user.email,
      email: member.user.email,
      avatarUrl: member.user.image,
      role: member.role,
      departmentName: undefined, // Would need to look up department
      executions: {
        current: 0, // Would be fetched from execution tracker
        allocated: null as number | null,
      },
    }));

    // Build daily history (mock for now - would use usage tracker)
    const dailyHistory: Array<{ date: string; executions: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0] || '';
      dailyHistory.push({
        date: dateStr,
        executions: Math.floor(Math.random() * 5000),
      });
    }

    const usage = {
      organization: {
        id: org.id,
        name: org.name,
        plan: {
          name: org.plan || 'Business',
          type: org.plan || 'BUSINESS',
        },
      },
      executions: {
        current: resourceStatus.billing.credits.usage.total.current || 0,
        limit: resourceStatus.billing.credits.usage.total.limit ?? null,
        resetsAt: resetsAt.toISOString(),
      },
      gateways: {
        current: gateways.length,
        limit: resourceStatus.automation.gateways.count.limit ?? null,
      },
      plugins: {
        current: resourceStatus.automation.plugins.count.used || 0,
        limit: resourceStatus.automation.plugins.count.limit ?? null,
      },
      workflows: {
        current: resourceStatus.automation.workflows.count.used || 0,
        limit: resourceStatus.automation.workflows.count.limit ?? null,
      },
      teamMembers: {
        current: members.length,
        limit: null, // Would need to get from plan limits
      },
      departments: deptUsage,
      members: memberUsage,
      dailyHistory,
    };

    res.json({
      success: true,
      data: usage,
    });
  })
);

// ===========================================
// Invitation Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/invites
 *
 * Get pending invitations for an organization
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {OrgInviteResponse[]} Pending invitations
 */
orgsRouter.get(
  "/:orgId/invites",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const invites = await organizationService.getPendingInvites(ctx, orgId);

    res.json({
      success: true,
      data: invites,
    });
  })
);

/**
 * DELETE /api/orgs/:orgId/invites/:inviteId
 *
 * Cancel a pending invitation
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} inviteId - Invite ID from URL
 */
orgsRouter.delete(
  "/:orgId/invites/:inviteId",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const inviteId = getPathParam(req, "inviteId");
    const ctx = getOrgContext(req, orgId);

    await organizationService.cancelInvite(ctx, orgId, inviteId);

    res.json({
      success: true,
      message: "Invitation cancelled successfully",
    });
  })
);

/**
 * POST /api/orgs/:orgId/invites/:inviteId/resend
 *
 * Resend an invitation email
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} inviteId - Invite ID from URL
 */
orgsRouter.post(
  "/:orgId/invites/:inviteId/resend",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, "orgId");
    const inviteId = getPathParam(req, "inviteId");
    const ctx = getOrgContext(req, orgId);

    await organizationService.resendInvite(ctx, orgId, inviteId);

    res.json({
      success: true,
      message: "Invitation resent successfully",
    });
  })
);
