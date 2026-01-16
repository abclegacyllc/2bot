/**
 * Organization Routes
 *
 * REST API endpoints for organization management (CRUD, members, invites)
 *
 * @module server/routes/organization
 */

import { Router, type Request, type Response } from "express";

import {
    addDeptMemberSchema,
    createDeptSchema,
    createOrgSchema,
    departmentService,
    deptQuotasSchema,
    inviteMemberSchema,
    memberQuotasSchema,
    organizationService,
    transferOwnershipSchema,
    updateDeptMemberSchema,
    updateDeptSchema,
    updateMemberRoleSchema,
    updateOrgSchema,
    type DeptMemberWithUser,
    type MemberWithUser,
    type OrgWithRole,
    type PendingInvite,
    type SafeDepartment,
    type SafeOrganization,
} from "@/modules/organization";
import { BadRequestError, ValidationError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { createServiceContext } from "@/shared/types/context";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const organizationRouter = Router();

/**
 * Helper to create ServiceContext from Express request
 */
function getServiceContext(req: Request) {
  if (!req.user) {
    throw new BadRequestError("User not authenticated");
  }

  // Use token payload if available (contains activeContext from JWT)
  if (req.tokenPayload) {
    return createServiceContext(
      {
        userId: req.tokenPayload.userId,
        role: req.tokenPayload.role,
        plan: req.tokenPayload.plan,
        activeContext: req.tokenPayload.activeContext,
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"] as string | undefined,
      }
    );
  }

  // Fallback: create personal context from user object (legacy support)
  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
      activeContext: {
        type: 'personal',
        plan: req.user.plan,
      },
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.headers["x-request-id"] as string | undefined,
    }
  );
}

/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(
  error: { issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.map((p) => String(p)).join(".") || "_root";
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

// ===========================================
// Organization CRUD
// ===========================================

/**
 * POST /api/organizations
 *
 * Create a new organization
 *
 * @body {string} name - Organization name
 * @body {string} slug - Unique slug for organization
 *
 * @returns {SafeOrganization} Created organization
 */
organizationRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeOrganization>>) => {
    const ctx = getServiceContext(req);

    const parseResult = createOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const org = await organizationService.create(ctx, parseResult.data);

    res.status(201).json({
      success: true,
      data: org,
    });
  })
);

/**
 * GET /api/organizations/:id
 *
 * Get organization by ID
 *
 * @param {string} id - Organization ID
 *
 * @returns {SafeOrganization} Organization details
 */
organizationRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeOrganization>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const org = await organizationService.getById(ctx, id);

    res.json({
      success: true,
      data: org,
    });
  })
);

/**
 * PUT /api/organizations/:id
 *
 * Update organization
 * Requires ADMIN+ role
 *
 * @param {string} id - Organization ID
 * @body {string} [name] - New name
 * @body {string} [slug] - New slug
 * @body {number} [maxMembers] - Max members limit
 *
 * @returns {SafeOrganization} Updated organization
 */
organizationRouter.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeOrganization>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const parseResult = updateOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const org = await organizationService.update(ctx, id, parseResult.data);

    res.json({
      success: true,
      data: org,
    });
  })
);

/**
 * DELETE /api/organizations/:id
 *
 * Delete organization
 * Requires OWNER role
 *
 * @param {string} id - Organization ID
 */
organizationRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    await organizationService.delete(ctx, id);

    res.json({
      success: true,
      data: null,
    });
  })
);

// ===========================================
// User Organizations (mounted at /api/organizations/me)
// ===========================================

/**
 * GET /api/organizations/me
 *
 * Get current user's organizations
 *
 * @returns {OrgWithRole[]} User's organizations with their roles
 */
organizationRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<OrgWithRole[]>>) => {
    if (!req.user) {
      throw new BadRequestError("User not authenticated");
    }

    const orgs = await organizationService.getUserOrganizations(req.user.id);

    res.json({
      success: true,
      data: orgs,
    });
  })
);

/**
 * GET /api/organizations/me/invites
 *
 * Get current user's pending invites
 *
 * @returns {PendingInvite[]} Pending organization invitations
 */
organizationRouter.get(
  "/me/invites",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<PendingInvite[]>>) => {
    if (!req.user) {
      throw new BadRequestError("User not authenticated");
    }

    const invites = await organizationService.getUserPendingInvites(req.user.id);

    res.json({
      success: true,
      data: invites,
    });
  })
);

// ===========================================
// Member Management
// ===========================================

/**
 * GET /api/organizations/:id/members
 *
 * List organization members
 *
 * @param {string} id - Organization ID
 * @query {string} [status] - Filter by status (ACTIVE, INVITED, SUSPENDED)
 *
 * @returns {MemberWithUser[]} Organization members
 */
organizationRouter.get(
  "/:id/members",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<MemberWithUser[]>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const status = req.query.status as "ACTIVE" | "INVITED" | "SUSPENDED" | undefined;

    const members = await organizationService.getMembers(ctx, id, { status });

    res.json({
      success: true,
      data: members,
    });
  })
);

/**
 * POST /api/organizations/:id/members/invite
 *
 * Invite a member to organization
 * Requires ADMIN+ role
 *
 * @param {string} id - Organization ID
 * @body {string} email - User email to invite
 * @body {string} role - Role to assign (ORG_ADMIN, DEPT_MANAGER, ORG_MEMBER)
 *
 * @returns {MemberWithUser} Created membership
 */
organizationRouter.post(
  "/:id/members/invite",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<MemberWithUser>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const parseResult = inviteMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const member = await organizationService.inviteMember(ctx, id, parseResult.data);

    res.status(201).json({
      success: true,
      data: member,
    });
  })
);

/**
 * DELETE /api/organizations/:id/members/:userId
 *
 * Remove a member from organization
 * Requires ADMIN+ role (OWNER to remove ADMIN)
 *
 * @param {string} id - Organization ID
 * @param {string} userId - User ID to remove
 */
organizationRouter.delete(
  "/:id/members/:userId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const userId = getPathParam(req, "userId");

    await organizationService.removeMember(ctx, id, userId);

    res.json({
      success: true,
      data: null,
    });
  })
);

/**
 * PUT /api/organizations/:id/members/:userId
 *
 * Update member role
 * Requires OWNER role
 *
 * @param {string} id - Organization ID
 * @param {string} userId - User ID to update
 * @body {string} role - New role
 *
 * @returns {MemberWithUser} Updated membership
 */
organizationRouter.put(
  "/:id/members/:userId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<MemberWithUser>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const userId = getPathParam(req, "userId");

    const parseResult = updateMemberRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const member = await organizationService.updateMemberRole(
      ctx,
      id,
      userId,
      parseResult.data
    );

    res.json({
      success: true,
      data: member,
    });
  })
);

/**
 * POST /api/organizations/:id/leave
 *
 * Leave an organization
 *
 * @param {string} id - Organization ID
 */
organizationRouter.post(
  "/:id/leave",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    await organizationService.leaveOrganization(ctx, id);

    res.json({
      success: true,
      data: null,
    });
  })
);

/**
 * POST /api/organizations/:id/transfer
 *
 * Transfer ownership to another member
 * Requires OWNER role
 *
 * @param {string} id - Organization ID
 * @body {string} newOwnerId - User ID of new owner
 */
organizationRouter.post(
  "/:id/transfer",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const parseResult = transferOwnershipSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    await organizationService.transferOwnership(ctx, id, parseResult.data.newOwnerId);

    res.json({
      success: true,
      data: null,
    });
  })
);

// ===========================================
// Invite Actions
// ===========================================

/**
 * POST /api/invites/:id/accept
 *
 * Accept an organization invitation
 *
 * @param {string} id - Membership ID
 */
organizationRouter.post(
  "/invites/:id/accept",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ organizationId: string }>>
  ) => {
    const ctx = getServiceContext(req);
    const membershipId = getPathParam(req, "id");

    const result = await organizationService.acceptInvite(ctx, membershipId);

    res.json({
      success: true,
      data: { organizationId: result.organizationId },
    });
  })
);

/**
 * POST /api/invites/:id/decline
 *
 * Decline an organization invitation
 *
 * @param {string} id - Membership ID
 */
organizationRouter.post(
  "/invites/:id/decline",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getServiceContext(req);
    const membershipId = getPathParam(req, "id");

    await organizationService.declineInvite(ctx, membershipId);

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
 * GET /api/organizations/:id/departments
 *
 * List departments in organization
 *
 * @param {string} id - Organization ID
 * @query {boolean} [activeOnly] - Filter to active departments only
 *
 * @returns {SafeDepartment[]} Organization departments
 */
organizationRouter.get(
  "/:id/departments",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment[]>>) => {
    const ctx = getServiceContext(req);
    const orgId = getPathParam(req, "id");
    const activeOnly = req.query.activeOnly === "true";

    const departments = await departmentService.getOrgDepartments(ctx, orgId, { activeOnly });

    res.json({
      success: true,
      data: departments,
    });
  })
);

/**
 * POST /api/organizations/:id/departments
 *
 * Create a department
 * Requires ADMIN+ role
 *
 * @param {string} id - Organization ID
 * @body {string} name - Department name
 * @body {string} [description] - Department description
 *
 * @returns {SafeDepartment} Created department
 */
organizationRouter.post(
  "/:id/departments",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment>>) => {
    const ctx = getServiceContext(req);
    const orgId = getPathParam(req, "id");

    const parseResult = createDeptSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const dept = await departmentService.create(ctx, orgId, parseResult.data);

    res.status(201).json({
      success: true,
      data: dept,
    });
  })
);

/**
 * GET /api/departments/:id
 *
 * Get department by ID
 *
 * @param {string} id - Department ID
 *
 * @returns {SafeDepartment} Department details
 */
organizationRouter.get(
  "/departments/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const dept = await departmentService.getById(ctx, id);

    res.json({
      success: true,
      data: dept,
    });
  })
);

/**
 * PUT /api/departments/:id
 *
 * Update department
 * Requires ADMIN+ or DEPT_MANAGER role
 *
 * @param {string} id - Department ID
 * @body {string} [name] - New name
 * @body {string} [description] - New description
 * @body {boolean} [isActive] - Active status
 *
 * @returns {SafeDepartment} Updated department
 */
organizationRouter.put(
  "/departments/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const parseResult = updateDeptSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const dept = await departmentService.update(ctx, id, parseResult.data);

    res.json({
      success: true,
      data: dept,
    });
  })
);

/**
 * DELETE /api/departments/:id
 *
 * Delete department
 * Requires ADMIN+ role
 *
 * @param {string} id - Department ID
 */
organizationRouter.delete(
  "/departments/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    await departmentService.delete(ctx, id);

    res.json({
      success: true,
      data: null,
    });
  })
);

/**
 * PUT /api/departments/:id/quotas
 *
 * Set department quotas
 * Requires ADMIN+ role
 *
 * @param {string} id - Department ID
 * @body {number} [maxWorkflows] - Max workflows
 * @body {number} [maxPlugins] - Max plugins
 * @body {number} [maxApiCalls] - Max API calls per day
 * @body {number} [maxStorage] - Max storage in bytes
 *
 * @returns {SafeDepartment} Updated department
 */
organizationRouter.put(
  "/departments/:id/quotas",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const parseResult = deptQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const dept = await departmentService.setDeptQuotas(ctx, id, parseResult.data);

    res.json({
      success: true,
      data: dept,
    });
  })
);

// ===========================================
// Department Member Routes
// ===========================================

/**
 * GET /api/departments/:id/members
 *
 * List department members
 *
 * @param {string} id - Department ID
 *
 * @returns {DeptMemberWithUser[]} Department members
 */
organizationRouter.get(
  "/departments/:id/members",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<DeptMemberWithUser[]>>) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "id");

    const members = await departmentService.getMembers(ctx, deptId);

    res.json({
      success: true,
      data: members,
    });
  })
);

/**
 * POST /api/departments/:id/members
 *
 * Add member to department
 * Requires ADMIN+ or DEPT_MANAGER role
 *
 * @param {string} id - Department ID
 * @body {string} userId - User ID to add
 * @body {string} [role] - Role (MANAGER or MEMBER, default MEMBER)
 *
 * @returns {DeptMemberWithUser} Created department member
 */
organizationRouter.post(
  "/departments/:id/members",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<DeptMemberWithUser>>) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "id");

    const parseResult = addDeptMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const member = await departmentService.addMember(ctx, deptId, parseResult.data);

    res.status(201).json({
      success: true,
      data: member,
    });
  })
);

/**
 * DELETE /api/departments/:deptId/members/:userId
 *
 * Remove member from department
 * Requires ADMIN+ or DEPT_MANAGER role
 *
 * @param {string} deptId - Department ID
 * @param {string} userId - User ID to remove
 */
organizationRouter.delete(
  "/departments/:deptId/members/:userId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");

    await departmentService.removeMember(ctx, deptId, userId);

    res.json({
      success: true,
      data: null,
    });
  })
);

/**
 * PUT /api/departments/:deptId/members/:userId
 *
 * Update department member (role or quotas)
 * Requires ADMIN+ or DEPT_MANAGER role
 *
 * @param {string} deptId - Department ID
 * @param {string} userId - User ID to update
 * @body {string} [role] - New role
 * @body {number} [maxWorkflows] - Max workflows quota
 * @body {number} [maxPlugins] - Max plugins quota
 *
 * @returns {DeptMemberWithUser} Updated department member
 */
organizationRouter.put(
  "/departments/:deptId/members/:userId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<DeptMemberWithUser>>) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");

    const parseResult = updateDeptMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const member = await departmentService.updateMember(ctx, deptId, userId, parseResult.data);

    res.json({
      success: true,
      data: member,
    });
  })
);

/**
 * PUT /api/departments/:deptId/members/:userId/quotas
 *
 * Set member quotas
 * Requires ADMIN+ or DEPT_MANAGER role
 *
 * @param {string} deptId - Department ID
 * @param {string} userId - User ID
 * @body {number} [maxWorkflows] - Max workflows quota
 * @body {number} [maxPlugins] - Max plugins quota
 *
 * @returns {DeptMemberWithUser} Updated department member
 */
organizationRouter.put(
  "/departments/:deptId/members/:userId/quotas",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<DeptMemberWithUser>>) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");

    const parseResult = memberQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }

    const member = await departmentService.setMemberQuotas(ctx, deptId, userId, parseResult.data);

    res.json({
      success: true,
      data: member,
    });
  })
);

// ===========================================
// Emergency Stop Routes
// ===========================================

interface EmergencyStopResult {
  departmentPaused?: boolean;
  memberPaused?: boolean;
  workflowsPaused: number;
  memberWorkflowsPaused?: number;
}

/**
 * POST /api/departments/:id/emergency-stop
 *
 * Emergency stop department
 * Immediately disables department and pauses all workflows
 * Requires ADMIN+ role
 *
 * @param {string} id - Department ID
 *
 * @returns {EmergencyStopResult} Result of emergency stop operation
 */
organizationRouter.post(
  "/departments/:id/emergency-stop",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<EmergencyStopResult>>) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "id");

    const result = await departmentService.emergencyStopDepartment(ctx, deptId);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/departments/:deptId/members/:userId/emergency-stop
 *
 * Emergency stop department member
 * Immediately pauses all personal workflows for the member
 * Requires ADMIN+ or DEPT_MANAGER role
 *
 * @param {string} deptId - Department ID
 * @param {string} userId - User ID
 *
 * @returns {EmergencyStopResult} Result of emergency stop operation
 */
organizationRouter.post(
  "/departments/:deptId/members/:userId/emergency-stop",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<EmergencyStopResult>>) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");

    const result = await departmentService.emergencyStopMember(ctx, deptId, userId);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/departments/:id/resume
 *
 * Resume department after emergency stop
 * Re-activates the department (workflows remain paused)
 * Requires ADMIN+ role
 *
 * @param {string} id - Department ID
 */
organizationRouter.post(
  "/departments/:id/resume",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ resumed: boolean }>>) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "id");

    await departmentService.resumeDepartment(ctx, deptId);

    res.json({
      success: true,
      data: { resumed: true },
    });
  })
);
