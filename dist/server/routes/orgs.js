"use strict";
/**
 * Organizations Routes (Org Resources)
 *
 * URL-based API pattern for organization resources (GitHub-style)
 * All routes at /api/orgs/:orgId/* return the specified organization's resources.
 * Uses /api/orgs/ (plural) to match GitHub API convention.
 *
 * @module server/routes/orgs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgsRouter = void 0;
const gateway_1 = require("@/modules/gateway");
const organization_1 = require("@/modules/organization");
const plugin_1 = require("@/modules/plugin");
const plugin_validation_1 = require("@/modules/plugin/plugin.validation");
const quota_1 = require("@/modules/quota");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
const org_auth_1 = require("../middleware/org-auth");
const org_alerts_1 = require("./org-alerts");
const org_billing_1 = require("./org-billing");
exports.orgsRouter = (0, express_1.Router)();
// All routes require authentication
exports.orgsRouter.use(auth_1.requireAuth);
// Mount org billing routes at /api/orgs/:orgId/billing/*
exports.orgsRouter.use("/:orgId/billing", org_billing_1.orgBillingRouter);
// Mount org alerts routes at /api/orgs/:orgId/alerts/* (Phase 6.9)
exports.orgsRouter.use("/:orgId/alerts", org_alerts_1.orgAlertsRouter);
/**
 * Format Zod validation errors into a simple object
 */
function formatZodErrors(error) {
    const errors = {};
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
function getPathParam(req, name) {
    const value = req.params[name];
    if (typeof value !== "string" || !value) {
        throw new errors_1.BadRequestError(`Missing path parameter: ${name}`);
    }
    return value;
}
/**
 * Helper to create organization ServiceContext from Express request
 * Creates context with explicit organizationId from URL param
 */
function getOrgContext(req, orgId) {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    // Get org membership role if available (set by requireOrgMember middleware)
    const memberRole = req.orgMembership?.role;
    return (0, context_1.createServiceContext)({
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
    }, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"],
    });
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
exports.orgsRouter.get("/:orgId", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const org = await organization_1.organizationService.getById(ctx, orgId);
    res.json({
        success: true,
        data: org,
    });
}));
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
exports.orgsRouter.put("/:orgId", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const parseResult = organization_1.updateOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const org = await organization_1.organizationService.update(ctx, orgId, parseResult.data);
    res.json({
        success: true,
        data: org,
    });
}));
/**
 * DELETE /api/orgs/:orgId
 *
 * Delete organization
 * Requires ORG_OWNER role
 *
 * @param {string} orgId - Organization ID from URL
 */
exports.orgsRouter.delete("/:orgId", org_auth_1.requireOrgOwner, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    await organization_1.organizationService.delete(ctx, orgId);
    res.json({
        success: true,
        data: null,
    });
}));
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
exports.orgsRouter.get("/:orgId/gateways", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const gateways = await gateway_1.gatewayService.findByUser(ctx);
    res.json({
        success: true,
        data: gateways,
    });
}));
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
exports.orgsRouter.get("/:orgId/plugins", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const plugins = await plugin_1.pluginService.getUserPlugins(ctx);
    res.json({
        success: true,
        data: plugins,
    });
}));
/**
 * GET /api/orgs/:orgId/plugins/:pluginId
 *
 * Get a specific organization plugin by ID
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} pluginId - UserPlugin ID
 * @returns {SafeUserPlugin} Organization plugin details
 */
exports.orgsRouter.get("/:orgId/plugins/:pluginId", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const pluginId = getPathParam(req, "pluginId");
    const ctx = getOrgContext(req, orgId);
    const userPlugin = await plugin_1.pluginService.getUserPluginById(ctx, pluginId);
    res.json({
        success: true,
        data: userPlugin,
    });
}));
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
exports.orgsRouter.post("/:orgId/plugins/install", org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const parseResult = plugin_validation_1.installPluginSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Invalid install data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await plugin_1.pluginService.installPlugin(ctx, parseResult.data);
    res.status(201).json({
        success: true,
        data: userPlugin,
    });
}));
/**
 * DELETE /api/orgs/:orgId/plugins/:pluginId
 *
 * Uninstall a plugin from the organization
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} pluginId - UserPlugin ID
 */
exports.orgsRouter.delete("/:orgId/plugins/:pluginId", org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const pluginId = getPathParam(req, "pluginId");
    const ctx = getOrgContext(req, orgId);
    await plugin_1.pluginService.uninstallPlugin(ctx, pluginId);
    res.json({
        success: true,
        data: null,
    });
}));
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
exports.orgsRouter.put("/:orgId/plugins/:pluginId/config", org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const pluginId = getPathParam(req, "pluginId");
    const ctx = getOrgContext(req, orgId);
    const parseResult = plugin_validation_1.updatePluginConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Invalid config data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await plugin_1.pluginService.updatePluginConfig(ctx, pluginId, parseResult.data);
    res.json({
        success: true,
        data: userPlugin,
    });
}));
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
exports.orgsRouter.post("/:orgId/plugins/:pluginId/toggle", org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const pluginId = getPathParam(req, "pluginId");
    const ctx = getOrgContext(req, orgId);
    const parseResult = plugin_validation_1.togglePluginSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Invalid toggle data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await plugin_1.pluginService.togglePlugin(ctx, pluginId, parseResult.data.enabled);
    res.json({
        success: true,
        data: userPlugin,
    });
}));
// ===========================================
// Quota Routes
// ===========================================
/**
 * GET /api/orgs/:orgId/quota
 *
 * Get organization's quota status
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {QuotaStatus} Current quota usage and limits
 */
exports.orgsRouter.get("/:orgId/quota", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const quota = await quota_1.quotaService.getQuotaStatus(ctx);
    res.json({
        success: true,
        data: quota,
    });
}));
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
exports.orgsRouter.get("/:orgId/departments", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const activeOnly = req.query.activeOnly === "true";
    const departments = await organization_1.departmentService.getOrgDepartments(ctx, orgId, {
        activeOnly,
    });
    res.json({
        success: true,
        data: departments,
    });
}));
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
exports.orgsRouter.post("/:orgId/departments", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const parseResult = organization_1.createDeptSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const department = await organization_1.departmentService.create(ctx, orgId, parseResult.data);
    res.status(201).json({
        success: true,
        data: department,
    });
}));
/**
 * GET /api/orgs/:orgId/departments/:deptId
 *
 * Get department details
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @returns {SafeDepartment} Department details
 */
exports.orgsRouter.get("/:orgId/departments/:deptId", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const ctx = getOrgContext(req, orgId);
    const department = await organization_1.departmentService.getById(ctx, deptId);
    res.json({
        success: true,
        data: department,
    });
}));
// ===========================================
// Department Quota Allocation Routes (Phase 6.9)
// ===========================================
/**
 * GET /api/orgs/:orgId/departments/:deptId/quotas
 *
 * Get department quota allocations
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @returns {DeptAllocationResponse | null} Department quota allocation
 */
exports.orgsRouter.get("/:orgId/departments/:deptId/quotas", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const deptId = getPathParam(req, "deptId");
    const quotas = await quota_1.QuotaAllocationService.getDeptAllocation(deptId);
    res.json({
        success: true,
        data: quotas,
    });
}));
/**
 * POST /api/orgs/:orgId/departments/:deptId/quotas
 *
 * Set or update department quota allocations
 * Requires ORG_ADMIN role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @body {SetDeptAllocationRequest} Quota allocation values
 * @returns {DeptAllocationResponse} Updated quota allocation
 */
exports.orgsRouter.post("/:orgId/departments/:deptId/quotas", org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const ctx = getOrgContext(req, orgId);
    const quotas = await quota_1.QuotaAllocationService.setDeptAllocation(ctx, deptId, req.body);
    res.json({
        success: true,
        data: quotas,
    });
}));
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
exports.orgsRouter.get("/:orgId/members", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const members = await organization_1.organizationService.getMembers(ctx, orgId);
    res.json({
        success: true,
        data: members,
    });
}));
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
exports.orgsRouter.post("/:orgId/members", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const parseResult = organization_1.inviteMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const member = await organization_1.organizationService.inviteMember(ctx, orgId, parseResult.data);
    res.status(201).json({
        success: true,
        data: member,
    });
}));
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
exports.orgsRouter.put("/:orgId/members/:memberId", org_auth_1.requireOrgOwner, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const memberId = getPathParam(req, "memberId");
    const ctx = getOrgContext(req, orgId);
    // Look up the membership to get the userId
    const membership = await organization_1.organizationService.getMembershipById(memberId, orgId);
    if (!membership) {
        throw new errors_1.BadRequestError("Member not found");
    }
    const parseResult = organization_1.updateMemberRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Validation failed", formatZodErrors(parseResult.error));
    }
    const updated = await organization_1.organizationService.updateMemberRole(ctx, orgId, membership.userId, parseResult.data);
    res.json({
        success: true,
        data: updated,
    });
}));
/**
 * DELETE /api/orgs/:orgId/members/:memberId
 *
 * Remove a member from the organization
 * Requires ORG_ADMIN role or higher
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} memberId - Membership ID from URL
 */
exports.orgsRouter.delete("/:orgId/members/:memberId", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const memberId = getPathParam(req, "memberId");
    const ctx = getOrgContext(req, orgId);
    // Look up the membership to get the userId
    const membership = await organization_1.organizationService.getMembershipById(memberId, orgId);
    if (!membership) {
        throw new errors_1.BadRequestError("Member not found");
    }
    await organization_1.organizationService.removeMember(ctx, orgId, membership.userId);
    res.json({
        success: true,
        data: null,
    });
}));
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
exports.orgsRouter.get("/:orgId/usage", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    // Get organization details
    const org = await organization_1.organizationService.getById(ctx, orgId);
    // Get quota status
    const quotaStatus = await quota_1.quotaService.getQuotaStatus(ctx);
    // Get all gateways
    const gateways = await gateway_1.gatewayService.findByUser(ctx);
    // Get departments
    const departments = await organization_1.departmentService.getOrgDepartments(ctx, orgId);
    // Get members
    const members = await organization_1.organizationService.getMembers(ctx, orgId);
    // Calculate reset date (first of next month)
    const now = new Date();
    const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    // Build department usage data
    const deptUsage = departments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        executions: {
            current: 0, // Would be fetched from quota allocation service
            allocated: null,
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
            allocated: null,
        },
    }));
    // Build daily history (mock for now - would use usage tracker)
    const dailyHistory = [];
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
            current: quotaStatus.apiCalls?.used || 0,
            limit: quotaStatus.apiCalls?.limit ?? null,
            resetsAt: resetsAt.toISOString(),
        },
        gateways: {
            current: gateways.length,
            limit: quotaStatus.gateways?.limit ?? null,
        },
        plugins: {
            current: quotaStatus.plugins?.used || 0,
            limit: quotaStatus.plugins?.limit ?? null,
        },
        workflows: {
            current: quotaStatus.workflows?.used || 0,
            limit: quotaStatus.workflows?.limit ?? null,
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
}));
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
exports.orgsRouter.get("/:orgId/invites", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);
    const invites = await organization_1.organizationService.getPendingInvites(ctx, orgId);
    res.json({
        success: true,
        data: invites,
    });
}));
/**
 * DELETE /api/orgs/:orgId/invites/:inviteId
 *
 * Cancel a pending invitation
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} inviteId - Invite ID from URL
 */
exports.orgsRouter.delete("/:orgId/invites/:inviteId", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const inviteId = getPathParam(req, "inviteId");
    const ctx = getOrgContext(req, orgId);
    await organization_1.organizationService.cancelInvite(ctx, orgId, inviteId);
    res.json({
        success: true,
        message: "Invitation cancelled successfully",
    });
}));
/**
 * POST /api/orgs/:orgId/invites/:inviteId/resend
 *
 * Resend an invitation email
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} inviteId - Invite ID from URL
 */
exports.orgsRouter.post("/:orgId/invites/:inviteId/resend", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, "orgId");
    const inviteId = getPathParam(req, "inviteId");
    const ctx = getOrgContext(req, orgId);
    await organization_1.organizationService.resendInvite(ctx, orgId, inviteId);
    res.json({
        success: true,
        message: "Invitation resent successfully",
    });
}));
//# sourceMappingURL=orgs.js.map