"use strict";
/**
 * Organization Routes
 *
 * REST API endpoints for organization management (CRUD, members, invites)
 *
 * Note: Some routes are being migrated to URL-based patterns:
 * - /api/organizations/me → /api/user/organizations
 * - /api/organizations/departments/:id → /api/orgs/:orgId/departments/:deptId
 *
 * @module server/routes/organization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationRouter = void 0;
const express_1 = require("express");
const organization_1 = require("@/modules/organization");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const auth_1 = require("../middleware/auth");
const deprecation_1 = require("../middleware/deprecation");
const error_handler_1 = require("../middleware/error-handler");
exports.organizationRouter = (0, express_1.Router)();
/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 * This route is deprecated - use /api/user/organizations or /api/orgs/:orgId/*
 */
function getServiceContext(req) {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    // Phase 6.7: Token simplified - context determined by URL, not token
    return (0, context_1.createServiceContext)({
        userId: req.tokenPayload?.userId ?? req.user.id,
        role: req.tokenPayload?.role ?? req.user.role,
        plan: req.tokenPayload?.plan ?? req.user.plan,
    }, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"],
    }, 
    // Default to personal context for legacy routes
    { contextType: 'personal', effectivePlan: req.user.plan });
}
/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(error) {
    const errors = {};
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
function getPathParam(req, name) {
    const value = req.params[name];
    if (typeof value !== "string" || !value) {
        throw new errors_1.BadRequestError(`Missing path parameter: ${name}`);
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
exports.organizationRouter.post("/", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const parseResult = organization_1.createOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const org = await organization_1.organizationService.create(ctx, parseResult.data);
    res.status(201).json({
        success: true,
        data: org,
    });
}));
// ===========================================
// User Organizations (must be before /:id routes!)
// ===========================================
/**
 * GET /api/organizations/me
 *
 * Get current user's organizations
 *
 * @deprecated Use GET /api/user/organizations instead
 *
 * @returns {OrgWithRole[]} User's organizations with their roles
 */
exports.organizationRouter.get("/me", auth_1.requireAuth, (0, deprecation_1.deprecated)("/api/user/organizations", {
    message: "Use /api/user/organizations for listing your organizations",
}), (0, error_handler_1.asyncHandler)(async (req, res) => {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    const orgs = await organization_1.organizationService.getUserOrganizations(req.user.id);
    res.json({
        success: true,
        data: orgs,
    });
}));
/**
 * GET /api/organizations/me/invites
 *
 * Get current user's pending invites
 *
 * @returns {PendingInvite[]} Pending organization invitations
 */
exports.organizationRouter.get("/me/invites", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    const invites = await organization_1.organizationService.getUserPendingInvites(req.user.id);
    res.json({
        success: true,
        data: invites,
    });
}));
// ===========================================
// Organization by ID routes
// ===========================================
/**
 * GET /api/organizations/:id
 *
 * Get organization by ID
 *
 * @param {string} id - Organization ID
 *
 * @returns {SafeOrganization} Organization details
 */
exports.organizationRouter.get("/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const org = await organization_1.organizationService.getById(ctx, id);
    res.json({
        success: true,
        data: org,
    });
}));
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
exports.organizationRouter.put("/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const parseResult = organization_1.updateOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const org = await organization_1.organizationService.update(ctx, id, parseResult.data);
    res.json({
        success: true,
        data: org,
    });
}));
/**
 * DELETE /api/organizations/:id
 *
 * Delete organization
 * Requires OWNER role
 *
 * @param {string} id - Organization ID
 */
exports.organizationRouter.delete("/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    await organization_1.organizationService.delete(ctx, id);
    res.json({
        success: true,
        data: null,
    });
}));
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
exports.organizationRouter.get("/:id/members", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const status = req.query.status;
    const members = await organization_1.organizationService.getMembers(ctx, id, { status });
    res.json({
        success: true,
        data: members,
    });
}));
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
exports.organizationRouter.post("/:id/members/invite", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const parseResult = organization_1.inviteMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const member = await organization_1.organizationService.inviteMember(ctx, id, parseResult.data);
    res.status(201).json({
        success: true,
        data: member,
    });
}));
/**
 * DELETE /api/organizations/:id/members/:userId
 *
 * Remove a member from organization
 * Requires ADMIN+ role (OWNER to remove ADMIN)
 *
 * @param {string} id - Organization ID
 * @param {string} userId - User ID to remove
 */
exports.organizationRouter.delete("/:id/members/:userId", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const userId = getPathParam(req, "userId");
    await organization_1.organizationService.removeMember(ctx, id, userId);
    res.json({
        success: true,
        data: null,
    });
}));
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
exports.organizationRouter.put("/:id/members/:userId", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const userId = getPathParam(req, "userId");
    const parseResult = organization_1.updateMemberRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const member = await organization_1.organizationService.updateMemberRole(ctx, id, userId, parseResult.data);
    res.json({
        success: true,
        data: member,
    });
}));
/**
 * POST /api/organizations/:id/leave
 *
 * Leave an organization
 *
 * @param {string} id - Organization ID
 */
exports.organizationRouter.post("/:id/leave", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    await organization_1.organizationService.leaveOrganization(ctx, id);
    res.json({
        success: true,
        data: null,
    });
}));
/**
 * POST /api/organizations/:id/transfer
 *
 * Transfer ownership to another member
 * Requires OWNER role
 *
 * @param {string} id - Organization ID
 * @body {string} newOwnerId - User ID of new owner
 */
exports.organizationRouter.post("/:id/transfer", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const parseResult = organization_1.transferOwnershipSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    await organization_1.organizationService.transferOwnership(ctx, id, parseResult.data.newOwnerId);
    res.json({
        success: true,
        data: null,
    });
}));
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
exports.organizationRouter.post("/invites/:id/accept", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const membershipId = getPathParam(req, "id");
    const result = await organization_1.organizationService.acceptInvite(ctx, membershipId);
    res.json({
        success: true,
        data: { organizationId: result.organizationId },
    });
}));
/**
 * POST /api/invites/:id/decline
 *
 * Decline an organization invitation
 *
 * @param {string} id - Membership ID
 */
exports.organizationRouter.post("/invites/:id/decline", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const membershipId = getPathParam(req, "id");
    await organization_1.organizationService.declineInvite(ctx, membershipId);
    res.json({
        success: true,
        data: null,
    });
}));
/**
 * GET /api/organizations/invites/token/:token
 *
 * Get pending invite details by token (public - no auth required)
 * Used to display invite info before user registers
 *
 * @param {string} token - Invite token
 */
exports.organizationRouter.get("/invites/token/:token", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const token = getPathParam(req, "token");
    const invite = await organization_1.organizationService.getInviteByToken(token);
    if (!invite) {
        res.status(404).json({
            success: false,
            error: "Invitation not found or has expired",
        });
        return;
    }
    res.json({
        success: true,
        data: invite,
    });
}));
/**
 * POST /api/organizations/invites/token/:token/accept
 *
 * Accept a pending invite after registration
 *
 * @param {string} token - Invite token
 */
exports.organizationRouter.post("/invites/token/:token/accept", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const token = getPathParam(req, "token");
    const membership = await organization_1.organizationService.acceptPendingInvite(ctx, token);
    res.json({
        success: true,
        data: membership,
    });
}));
/**
 * POST /api/organizations/invites/token/:token/decline
 *
 * Decline a pending invite (public - no auth required)
 * Allows invitees to decline without registering
 *
 * @param {string} token - Invite token
 * @body {string} [email] - Email to verify (optional, for non-registered users)
 */
exports.organizationRouter.post("/invites/token/:token/decline", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const token = getPathParam(req, "token");
    const email = req.body?.email;
    const result = await organization_1.organizationService.declinePendingInvite(token, email);
    res.json({
        success: true,
        data: result,
    });
}));
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
exports.organizationRouter.get("/:id/departments", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const orgId = getPathParam(req, "id");
    const activeOnly = req.query.activeOnly === "true";
    const departments = await organization_1.departmentService.getOrgDepartments(ctx, orgId, { activeOnly });
    res.json({
        success: true,
        data: departments,
    });
}));
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
exports.organizationRouter.post("/:id/departments", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const orgId = getPathParam(req, "id");
    const parseResult = organization_1.createDeptSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const dept = await organization_1.departmentService.create(ctx, orgId, parseResult.data);
    res.status(201).json({
        success: true,
        data: dept,
    });
}));
/**
 * GET /api/departments/:id
 *
 * Get department by ID
 *
 * @deprecated Use GET /api/orgs/:orgId/departments/:deptId instead
 *
 * @param {string} id - Department ID
 *
 * @returns {SafeDepartment} Department details
 */
exports.organizationRouter.get("/departments/:id", auth_1.requireAuth, (0, deprecation_1.deprecated)("/api/orgs/:orgId/departments/:deptId", {
    message: "Include organization ID in the URL path for better API clarity",
}), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const dept = await organization_1.departmentService.getById(ctx, id);
    res.json({
        success: true,
        data: dept,
    });
}));
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
exports.organizationRouter.put("/departments/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const parseResult = organization_1.updateDeptSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const dept = await organization_1.departmentService.update(ctx, id, parseResult.data);
    res.json({
        success: true,
        data: dept,
    });
}));
/**
 * DELETE /api/departments/:id
 *
 * Delete department
 * Requires ADMIN+ role
 *
 * @param {string} id - Department ID
 */
exports.organizationRouter.delete("/departments/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    await organization_1.departmentService.delete(ctx, id);
    res.json({
        success: true,
        data: null,
    });
}));
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
exports.organizationRouter.put("/departments/:id/quotas", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const parseResult = organization_1.deptQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const dept = await organization_1.departmentService.setDeptQuotas(ctx, id, parseResult.data);
    res.json({
        success: true,
        data: dept,
    });
}));
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
exports.organizationRouter.get("/departments/:id/members", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "id");
    const members = await organization_1.departmentService.getMembers(ctx, deptId);
    res.json({
        success: true,
        data: members,
    });
}));
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
exports.organizationRouter.post("/departments/:id/members", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "id");
    const parseResult = organization_1.addDeptMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const member = await organization_1.departmentService.addMember(ctx, deptId, parseResult.data);
    res.status(201).json({
        success: true,
        data: member,
    });
}));
/**
 * DELETE /api/departments/:deptId/members/:userId
 *
 * Remove member from department
 * Requires ADMIN+ or DEPT_MANAGER role
 *
 * @param {string} deptId - Department ID
 * @param {string} userId - User ID to remove
 */
exports.organizationRouter.delete("/departments/:deptId/members/:userId", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");
    await organization_1.departmentService.removeMember(ctx, deptId, userId);
    res.json({
        success: true,
        data: null,
    });
}));
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
exports.organizationRouter.put("/departments/:deptId/members/:userId", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");
    const parseResult = organization_1.updateDeptMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const member = await organization_1.departmentService.updateMember(ctx, deptId, userId, parseResult.data);
    res.json({
        success: true,
        data: member,
    });
}));
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
exports.organizationRouter.put("/departments/:deptId/members/:userId/quotas", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");
    const parseResult = organization_1.memberQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const member = await organization_1.departmentService.setMemberQuotas(ctx, deptId, userId, parseResult.data);
    res.json({
        success: true,
        data: member,
    });
}));
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
exports.organizationRouter.post("/departments/:id/emergency-stop", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "id");
    const result = await organization_1.departmentService.emergencyStopDepartment(ctx, deptId);
    res.json({
        success: true,
        data: result,
    });
}));
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
exports.organizationRouter.post("/departments/:deptId/members/:userId/emergency-stop", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "deptId");
    const userId = getPathParam(req, "userId");
    const result = await organization_1.departmentService.emergencyStopMember(ctx, deptId, userId);
    res.json({
        success: true,
        data: result,
    });
}));
/**
 * POST /api/departments/:id/resume
 *
 * Resume department after emergency stop
 * Re-activates the department (workflows remain paused)
 * Requires ADMIN+ role
 *
 * @param {string} id - Department ID
 */
exports.organizationRouter.post("/departments/:id/resume", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const deptId = getPathParam(req, "id");
    await organization_1.departmentService.resumeDepartment(ctx, deptId);
    res.json({
        success: true,
        data: { resumed: true },
    });
}));
//# sourceMappingURL=organization.js.map