"use strict";
/**
 * Organization Service
 *
 * Handles organization CRUD, membership management, and invitations.
 *
 * @module modules/organization/organization.service
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const audit_1 = require("@/lib/audit");
const email_1 = require("@/lib/email");
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const org_plans_1 = require("@/shared/constants/org-plans");
const errors_1 = require("@/shared/errors");
const organization_types_1 = require("./organization.types");
const orgLogger = logger_1.logger.child({ module: "organization" });
/**
 * Convert ServiceContext to AuditContext
 */
function toAuditContext(ctx) {
    return {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
    };
}
/**
 * Role hierarchy for permission checks
 */
const ROLE_HIERARCHY = {
    ORG_OWNER: 4,
    ORG_ADMIN: 3,
    DEPT_MANAGER: 2,
    ORG_MEMBER: 1,
};
/**
 * Check if a role is at least as high as another
 */
function hasMinRole(userRole, minRole) {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}
// ===========================================
// Organization Service
// ===========================================
class OrganizationService {
    // ===========================================
    // Organization CRUD
    // ===========================================
    /**
     * Create a new organization
     * Creator becomes ORG_OWNER
     */
    async create(ctx, data) {
        orgLogger.debug({ userId: ctx.userId, slug: data.slug }, "Creating organization");
        // Check if slug is available
        const existing = await prisma_1.prisma.organization.findUnique({
            where: { slug: data.slug },
        });
        if (existing) {
            throw new errors_1.ConflictError("Organization slug already exists");
        }
        // Create organization with owner membership
        const org = await prisma_1.prisma.organization.create({
            data: {
                name: data.name,
                slug: data.slug,
                memberships: {
                    create: {
                        userId: ctx.userId,
                        role: "ORG_OWNER",
                        status: "ACTIVE",
                        joinedAt: new Date(),
                    },
                },
            },
            include: {
                _count: { select: { memberships: true } },
            },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "organization.create",
            resource: "organization",
            resourceId: org.id,
            metadata: { name: data.name, slug: data.slug },
        });
        orgLogger.info({ orgId: org.id, userId: ctx.userId }, "Organization created");
        return (0, organization_types_1.toSafeOrganization)(org);
    }
    /**
     * Get organization by ID
     * Only members can access
     */
    async getById(ctx, id) {
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id },
            include: {
                _count: { select: { memberships: true } },
            },
        });
        if (!org) {
            throw new errors_1.NotFoundError("Organization not found");
        }
        // Check membership (unless super admin)
        if (!ctx.isSuperAdmin()) {
            await this.requireMembership(ctx.userId, id);
        }
        return (0, organization_types_1.toSafeOrganization)(org);
    }
    /**
     * Get organization by slug
     */
    async getBySlug(ctx, slug) {
        const org = await prisma_1.prisma.organization.findUnique({
            where: { slug },
            include: {
                _count: { select: { memberships: true } },
            },
        });
        if (!org) {
            throw new errors_1.NotFoundError("Organization not found");
        }
        // Check membership (unless super admin)
        if (!ctx.isSuperAdmin()) {
            await this.requireMembership(ctx.userId, org.id);
        }
        return (0, organization_types_1.toSafeOrganization)(org);
    }
    /**
     * Update organization
     * Only ADMIN+ can update
     */
    async update(ctx, id, data) {
        // Check membership and role
        const membership = await this.requireMembership(ctx.userId, id, "ORG_ADMIN");
        // Check slug availability if changing
        if (data.slug) {
            const existing = await prisma_1.prisma.organization.findFirst({
                where: { slug: data.slug, id: { not: id } },
            });
            if (existing) {
                throw new errors_1.ConflictError("Organization slug already exists");
            }
        }
        const org = await prisma_1.prisma.organization.update({
            where: { id },
            data: {
                name: data.name,
                slug: data.slug,
            },
            include: {
                _count: { select: { memberships: true } },
            },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "organization.update",
            resource: "organization",
            resourceId: id,
            metadata: { ...data },
        });
        orgLogger.info({ orgId: id, userId: ctx.userId, role: membership.role }, "Organization updated");
        return (0, organization_types_1.toSafeOrganization)(org);
    }
    /**
     * Delete organization
     * Only OWNER can delete
     */
    async delete(ctx, id) {
        // Check membership and role
        await this.requireMembership(ctx.userId, id, "ORG_OWNER");
        await prisma_1.prisma.organization.delete({
            where: { id },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "organization.delete",
            resource: "organization",
            resourceId: id,
        });
        orgLogger.info({ orgId: id, userId: ctx.userId }, "Organization deleted");
    }
    // ===========================================
    // User Organizations
    // ===========================================
    /**
     * Get all organizations for a user
     */
    async getUserOrganizations(userId) {
        const memberships = await prisma_1.prisma.membership.findMany({
            where: {
                userId,
                status: "ACTIVE",
            },
            include: {
                organization: {
                    include: {
                        _count: { select: { memberships: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        return memberships.map((m) => ({
            id: m.organization.id,
            name: m.organization.name,
            slug: m.organization.slug,
            role: m.role,
            plan: m.organization.plan,
            memberCount: m.organization._count.memberships,
            isActive: m.organization.isActive,
            createdAt: m.organization.createdAt,
        }));
    }
    /**
     * Get pending invites for a user
     */
    async getUserPendingInvites(userId) {
        // First get user email
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        });
        if (!user) {
            return [];
        }
        // Find pending invites by email
        const invites = await prisma_1.prisma.membership.findMany({
            where: {
                userId,
                status: "INVITED",
            },
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                inviter: {
                    select: { email: true },
                },
            },
            orderBy: { invitedAt: "desc" },
        });
        return invites.map((i) => ({
            id: i.id,
            organizationId: i.organization.id,
            organizationName: i.organization.name,
            organizationSlug: i.organization.slug,
            role: i.role,
            invitedAt: i.invitedAt,
            inviterEmail: i.inviter?.email,
        }));
    }
    // ===========================================
    // Membership Management
    // ===========================================
    /**
     * Invite a member to organization
     * Only ADMIN+ can invite
     */
    async inviteMember(ctx, orgId, data) {
        // Check inviter's membership and role
        await this.requireMembership(ctx.userId, orgId, "ORG_ADMIN");
        // Get organization to check limits
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id: orgId },
            include: {
                _count: { select: { memberships: true } },
            },
        });
        if (!org) {
            throw new errors_1.NotFoundError("Organization not found");
        }
        // Check seat limit
        // Use org's maxSeats (from plan or purchased extras)
        const maxSeats = org.maxSeats;
        if (maxSeats !== -1 && org._count.memberships >= maxSeats) {
            throw new errors_1.ForbiddenError(`Seat limit reached (${maxSeats}). Upgrade your plan or purchase additional seats.`);
        }
        // Find user by email
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: data.email },
        });
        if (!user) {
            // User doesn't exist - create pending invite with unique token
            return this.createPendingInvite(ctx, orgId, org.name, data);
        }
        // Check if already a member
        const existing = await prisma_1.prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId: orgId,
                },
            },
        });
        if (existing) {
            if (existing.status === "ACTIVE") {
                throw new errors_1.ConflictError("User is already a member");
            }
            if (existing.status === "INVITED") {
                throw new errors_1.ConflictError("User has already been invited");
            }
            // If suspended, reactivate with new invite
        }
        // Create or update membership
        const membership = await prisma_1.prisma.membership.upsert({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId: orgId,
                },
            },
            create: {
                userId: user.id,
                organizationId: orgId,
                role: data.role ?? "ORG_MEMBER",
                status: "INVITED",
                invitedBy: ctx.userId,
                invitedAt: new Date(),
            },
            update: {
                role: data.role ?? "ORG_MEMBER",
                status: "INVITED",
                invitedBy: ctx.userId,
                invitedAt: new Date(),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
            },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "membership.invite",
            resource: "membership",
            resourceId: membership.id,
            metadata: {
                organizationId: orgId,
                invitedEmail: data.email,
                role: membership.role,
            },
        });
        // Send invitation email
        // Get inviter's name for the email
        const inviter = await prisma_1.prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { name: true, email: true },
        });
        const inviterName = inviter?.name || inviter?.email || "Someone";
        void (0, email_1.sendOrganizationInviteEmail)(data.email, org.name, inviterName, membership.role).catch((err) => {
            orgLogger.error({ err, email: data.email }, "Failed to send invite email");
        });
        orgLogger.info({ orgId, invitedEmail: data.email, role: membership.role }, "Member invited");
        return {
            id: membership.id,
            role: membership.role,
            status: membership.status,
            user: membership.user,
            invitedAt: membership.invitedAt,
            joinedAt: membership.joinedAt,
        };
    }
    /**
     * Create a pending invite for a user who hasn't registered yet
     * @private
     */
    async createPendingInvite(ctx, orgId, orgName, data) {
        // Check for existing pending invite
        const existingInvite = await prisma_1.prisma.orgInvite.findUnique({
            where: {
                organizationId_email: {
                    organizationId: orgId,
                    email: data.email,
                },
            },
        });
        if (existingInvite && existingInvite.expiresAt > new Date() && !existingInvite.usedAt) {
            throw new errors_1.ConflictError("An invitation has already been sent to this email");
        }
        // Generate secure invite token
        const token = crypto_1.default.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        // Create or update pending invite
        const invite = await prisma_1.prisma.orgInvite.upsert({
            where: {
                organizationId_email: {
                    organizationId: orgId,
                    email: data.email,
                },
            },
            create: {
                organizationId: orgId,
                email: data.email,
                role: data.role ?? "ORG_MEMBER",
                token,
                invitedBy: ctx.userId,
                expiresAt,
            },
            update: {
                role: data.role ?? "ORG_MEMBER",
                token,
                invitedBy: ctx.userId,
                expiresAt,
                usedAt: null,
            },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "orginvite.create",
            resource: "orginvite",
            resourceId: invite.id,
            metadata: {
                organizationId: orgId,
                invitedEmail: data.email,
                role: invite.role,
            },
        });
        // Get inviter's name for the email
        const inviter = await prisma_1.prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { name: true, email: true },
        });
        const inviterName = inviter?.name || inviter?.email || "Someone";
        // Send invite email with registration link
        void (0, email_1.sendPendingInviteEmail)(data.email, orgName, inviterName, invite.role, token).catch((err) => {
            orgLogger.error({ err, email: data.email }, "Failed to send pending invite email");
        });
        orgLogger.info({ orgId, invitedEmail: data.email, role: invite.role }, "Pending invite created for unregistered user");
        // Return a placeholder response that indicates pending status
        return {
            id: invite.id,
            role: invite.role,
            status: "INVITED",
            user: {
                id: "pending",
                name: null,
                email: data.email,
                image: null,
            },
            invitedAt: invite.createdAt,
            joinedAt: null,
        };
    }
    /**
     * Accept an invitation
     */
    async acceptInvite(ctx, membershipId) {
        const membership = await prisma_1.prisma.membership.findUnique({
            where: { id: membershipId },
            include: { organization: true },
        });
        if (!membership) {
            throw new errors_1.NotFoundError("Invitation not found");
        }
        // Verify user is the invitee
        if (membership.userId !== ctx.userId) {
            throw new errors_1.ForbiddenError("This invitation is not for you");
        }
        if (membership.status !== "INVITED") {
            throw new errors_1.ValidationError("Invitation is no longer valid", {
                status: [`Current status: ${membership.status}`],
            });
        }
        const updated = await prisma_1.prisma.membership.update({
            where: { id: membershipId },
            data: {
                status: "ACTIVE",
                joinedAt: new Date(),
            },
            include: { organization: true },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "membership.accept_invite",
            resource: "membership",
            resourceId: membershipId,
            metadata: {
                organizationId: membership.organizationId,
            },
        });
        orgLogger.info({ membershipId, orgId: membership.organizationId, userId: ctx.userId }, "Invitation accepted");
        return updated;
    }
    /**
     * Decline an invitation
     */
    async declineInvite(ctx, membershipId) {
        const membership = await prisma_1.prisma.membership.findUnique({
            where: { id: membershipId },
        });
        if (!membership) {
            throw new errors_1.NotFoundError("Invitation not found");
        }
        // Verify user is the invitee
        if (membership.userId !== ctx.userId) {
            throw new errors_1.ForbiddenError("This invitation is not for you");
        }
        if (membership.status !== "INVITED") {
            throw new errors_1.ValidationError("Invitation is no longer valid", {
                status: [`Current status: ${membership.status}`],
            });
        }
        await prisma_1.prisma.membership.delete({
            where: { id: membershipId },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "membership.decline_invite",
            resource: "membership",
            resourceId: membershipId,
        });
        orgLogger.info({ membershipId, orgId: membership.organizationId, userId: ctx.userId }, "Invitation declined");
    }
    /**
     * Remove a member from organization
     * ADMIN+ can remove members, but only OWNER can remove ADMIN
     */
    async removeMember(ctx, orgId, userId) {
        // Get requester's membership
        const requesterMembership = await this.requireMembership(ctx.userId, orgId, "ORG_ADMIN");
        // Get target membership
        const targetMembership = await prisma_1.prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: orgId,
                },
            },
        });
        if (!targetMembership) {
            throw new errors_1.NotFoundError("Member not found");
        }
        // Can't remove yourself (use leave instead)
        if (userId === ctx.userId) {
            throw new errors_1.ValidationError("Use leave organization instead", {});
        }
        // Can't remove OWNER
        if (targetMembership.role === "ORG_OWNER") {
            throw new errors_1.ForbiddenError("Cannot remove organization owner");
        }
        // Only OWNER can remove ADMIN
        if (targetMembership.role === "ORG_ADMIN" &&
            requesterMembership.role !== "ORG_OWNER") {
            throw new errors_1.ForbiddenError("Only owner can remove admins");
        }
        await prisma_1.prisma.membership.delete({
            where: { id: targetMembership.id },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "membership.remove",
            resource: "membership",
            resourceId: targetMembership.id,
            metadata: { orgId, removedUserId: userId },
        });
        orgLogger.info({ orgId, removedUserId: userId, removedBy: ctx.userId }, "Member removed");
    }
    /**
     * Update member role
     * Only OWNER can change roles
     */
    async updateMemberRole(ctx, orgId, userId, data) {
        // Only OWNER can change roles
        await this.requireMembership(ctx.userId, orgId, "ORG_OWNER");
        const membership = await prisma_1.prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: orgId,
                },
            },
        });
        if (!membership) {
            throw new errors_1.NotFoundError("Member not found");
        }
        // Can't change owner's role
        if (membership.role === "ORG_OWNER" && data.role !== "ORG_OWNER") {
            throw new errors_1.ForbiddenError("Cannot demote organization owner. Transfer ownership first.");
        }
        // Can't have multiple owners
        if (data.role === "ORG_OWNER" && membership.role !== "ORG_OWNER") {
            throw new errors_1.ValidationError("Use transfer ownership instead", {});
        }
        const updated = await prisma_1.prisma.membership.update({
            where: { id: membership.id },
            data: { role: data.role },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
            },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "membership.update_role",
            resource: "membership",
            resourceId: membership.id,
            metadata: {
                previousRole: membership.role,
                newRole: data.role,
            },
        });
        orgLogger.info({ orgId, userId, previousRole: membership.role, newRole: data.role }, "Member role updated");
        return {
            id: updated.id,
            role: updated.role,
            status: updated.status,
            user: updated.user,
            invitedAt: updated.invitedAt,
            joinedAt: updated.joinedAt,
        };
    }
    /**
     * Get membership by ID (without auth check)
     * Used by routes to look up userId from membershipId
     */
    async getMembershipById(membershipId, orgId) {
        const membership = await prisma_1.prisma.membership.findFirst({
            where: {
                id: membershipId,
                organizationId: orgId,
            },
            select: {
                userId: true,
                role: true,
            },
        });
        return membership;
    }
    /**
     * Get organization members
     * Only members can view
     */
    async getMembers(ctx, orgId, options) {
        // Check membership
        await this.requireMembership(ctx.userId, orgId);
        const members = await prisma_1.prisma.membership.findMany({
            where: {
                organizationId: orgId,
                ...(options?.status ? { status: options.status } : {}),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
            },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        });
        return members.map((m) => ({
            id: m.id,
            role: m.role,
            status: m.status,
            user: m.user,
            invitedAt: m.invitedAt,
            joinedAt: m.joinedAt,
        }));
    }
    /**
     * Leave organization
     * OWNER cannot leave (must transfer ownership first)
     */
    async leaveOrganization(ctx, orgId) {
        const membership = await prisma_1.prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: ctx.userId,
                    organizationId: orgId,
                },
            },
        });
        if (!membership) {
            throw new errors_1.NotFoundError("You are not a member of this organization");
        }
        if (membership.role === "ORG_OWNER") {
            throw new errors_1.ForbiddenError("Owner cannot leave organization. Transfer ownership first or delete the organization.");
        }
        await prisma_1.prisma.membership.delete({
            where: { id: membership.id },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "membership.leave",
            resource: "membership",
            resourceId: membership.id,
            metadata: { orgId },
        });
        orgLogger.info({ orgId, userId: ctx.userId }, "User left organization");
    }
    /**
     * Transfer ownership to another member
     * Only OWNER can transfer
     */
    async transferOwnership(ctx, orgId, newOwnerId) {
        // Verify current owner
        const currentOwner = await this.requireMembership(ctx.userId, orgId, "ORG_OWNER");
        // Get new owner's membership
        const newOwner = await prisma_1.prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: newOwnerId,
                    organizationId: orgId,
                },
            },
        });
        if (!newOwner) {
            throw new errors_1.NotFoundError("User is not a member of this organization");
        }
        if (newOwner.status !== "ACTIVE") {
            throw new errors_1.ValidationError("User must be an active member", {});
        }
        // Transfer in a transaction
        await prisma_1.prisma.$transaction([
            // Demote current owner to admin
            prisma_1.prisma.membership.update({
                where: { id: currentOwner.id },
                data: { role: "ORG_ADMIN" },
            }),
            // Promote new owner
            prisma_1.prisma.membership.update({
                where: { id: newOwner.id },
                data: { role: "ORG_OWNER" },
            }),
        ]);
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "organization.transfer_ownership",
            resource: "organization",
            resourceId: orgId,
            metadata: {
                previousOwner: ctx.userId,
                newOwner: newOwnerId,
            },
        });
        orgLogger.info({ orgId, previousOwner: ctx.userId, newOwner: newOwnerId }, "Ownership transferred");
    }
    // ===========================================
    // Validation Helpers
    // ===========================================
    /**
     * Check if user has membership in organization
     */
    async checkMembership(userId, orgId) {
        const membership = await prisma_1.prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: orgId,
                },
            },
            select: {
                id: true,
                role: true,
                status: true,
            },
        });
        return membership;
    }
    /**
     * Require active membership with minimum role
     * Throws if not met
     */
    async requireMembership(userId, orgId, minRole) {
        const membership = await this.checkMembership(userId, orgId);
        if (!membership) {
            throw new errors_1.ForbiddenError("You are not a member of this organization");
        }
        if (membership.status !== "ACTIVE") {
            throw new errors_1.ForbiddenError("Your membership is not active");
        }
        if (minRole && !hasMinRole(membership.role, minRole)) {
            throw new errors_1.ForbiddenError(`This action requires ${minRole.replace("ORG_", "").toLowerCase()} role or higher`);
        }
        return membership;
    }
    // ===========================================
    // Org Plan Helper Methods
    // ===========================================
    /**
     * Get org plan limits for an organization
     */
    getOrgPlanLimits(plan) {
        return (0, org_plans_1.getOrgPlanLimits)(plan);
    }
    /**
     * Check if org has at least the required plan
     */
    hasAtLeastPlan(orgPlan, requiredPlan) {
        return (0, org_plans_1.isAtLeastOrgPlan)(orgPlan, requiredPlan);
    }
    /**
     * Check if org can add more gateways
     */
    async canAddGateway(orgId) {
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id: orgId },
            include: { _count: { select: { gateways: true } } },
        });
        if (!org)
            throw new errors_1.NotFoundError("Organization not found");
        const limits = this.getOrgPlanLimits(org.plan);
        const current = org._count.gateways;
        const limit = limits.sharedGateways;
        return {
            allowed: !(0, org_plans_1.isOrgLimitExceeded)(current, limit),
            current,
            limit,
        };
    }
    /**
     * Check if org can add more workflows
     */
    async canAddWorkflow(orgId) {
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id: orgId },
            include: { _count: { select: { workflows: true } } },
        });
        if (!org)
            throw new errors_1.NotFoundError("Organization not found");
        const limits = this.getOrgPlanLimits(org.plan);
        const current = org._count.workflows;
        const limit = limits.sharedWorkflows;
        return {
            allowed: !(0, org_plans_1.isOrgLimitExceeded)(current, limit),
            current,
            limit,
        };
    }
    /**
     * Check if org can add more seats (members)
     */
    async canAddSeat(orgId) {
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id: orgId },
            include: { _count: { select: { memberships: true } } },
        });
        if (!org)
            throw new errors_1.NotFoundError("Organization not found");
        const current = org._count.memberships;
        const limit = org.maxSeats;
        return {
            allowed: limit === -1 || current < limit,
            current,
            limit,
        };
    }
    /**
     * Check if org has a specific feature enabled
     */
    async hasFeature(orgId, feature) {
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id: orgId },
            select: { plan: true },
        });
        if (!org)
            throw new errors_1.NotFoundError("Organization not found");
        const limits = this.getOrgPlanLimits(org.plan);
        return limits.features[feature];
    }
    /**
     * Get remaining AI tokens for this billing period
     * Note: AI token tracking will be implemented in Phase 6.8+ with ExecutionTracker
     */
    async getRemainingAiTokens(orgId) {
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id: orgId },
            select: { plan: true },
        });
        if (!org)
            throw new errors_1.NotFoundError("Organization not found");
        const limits = this.getOrgPlanLimits(org.plan);
        const limit = limits.sharedAiTokensPerMonth;
        // TODO: Implement actual AI token tracking in ExecutionTracker (Task 6.8.17)
        const used = 0;
        return {
            remaining: limit === -1 ? -1 : Math.max(0, limit - used),
            limit,
            used,
        };
    }
    /**
     * Get pending invite by token (public - no auth required)
     */
    async getInviteByToken(token) {
        const invite = await prisma_1.prisma.orgInvite.findUnique({
            where: { token },
            include: {
                organization: {
                    select: { name: true, slug: true },
                },
                inviter: {
                    select: { email: true },
                },
            },
        });
        if (!invite) {
            return null;
        }
        // Check if expired, already used, or declined
        if (invite.expiresAt < new Date() || invite.usedAt || invite.status === "DECLINED") {
            return null;
        }
        return {
            id: invite.id,
            email: invite.email,
            organizationName: invite.organization.name,
            organizationSlug: invite.organization.slug,
            role: invite.role,
            inviterEmail: invite.inviter.email,
            expiresAt: invite.expiresAt,
            status: invite.status,
        };
    }
    /**
     * Accept a pending invite by token (after registration)
     * Called after a user registers with the invite token
     */
    async acceptPendingInvite(ctx, token) {
        const invite = await prisma_1.prisma.orgInvite.findUnique({
            where: { token },
            include: { organization: true },
        });
        if (!invite) {
            throw new errors_1.NotFoundError("Invitation not found");
        }
        if (invite.expiresAt < new Date()) {
            throw new errors_1.ValidationError("Invitation has expired", {
                token: ["This invitation link has expired"],
            });
        }
        if (invite.usedAt) {
            throw new errors_1.ConflictError("This invitation has already been used");
        }
        // Verify the user's email matches the invite
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: ctx.userId },
        });
        if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
            throw new errors_1.ForbiddenError("This invitation is not for your email address");
        }
        // Check if already declined
        if (invite.status === "DECLINED") {
            throw new errors_1.ConflictError("This invitation has been declined");
        }
        // Create membership and mark invite as used in a transaction
        const membership = await prisma_1.prisma.$transaction(async (tx) => {
            // Mark invite as used and accepted
            await tx.orgInvite.update({
                where: { id: invite.id },
                data: {
                    usedAt: new Date(),
                    status: "ACCEPTED",
                },
            });
            // Create membership
            return tx.membership.create({
                data: {
                    userId: ctx.userId,
                    organizationId: invite.organizationId,
                    role: invite.role,
                    status: "ACTIVE",
                    invitedBy: invite.invitedBy,
                    invitedAt: invite.createdAt,
                    joinedAt: new Date(),
                },
                include: { organization: true },
            });
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "membership.accept_pending_invite",
            resource: "membership",
            resourceId: membership.id,
            metadata: {
                organizationId: invite.organizationId,
                inviteId: invite.id,
            },
        });
        orgLogger.info({ inviteId: invite.id, orgId: invite.organizationId, userId: ctx.userId }, "Pending invitation accepted");
        return membership;
    }
    /**
     * Decline a pending invite by token
     * Users can decline invitations even if not registered (public endpoint)
     */
    async declinePendingInvite(token, email) {
        const invite = await prisma_1.prisma.orgInvite.findUnique({
            where: { token },
            include: { organization: true },
        });
        if (!invite) {
            throw new errors_1.NotFoundError("Invitation not found");
        }
        if (invite.expiresAt < new Date()) {
            throw new errors_1.ValidationError("Invitation has expired", {
                token: ["This invitation link has expired"],
            });
        }
        if (invite.usedAt) {
            throw new errors_1.ConflictError("This invitation has already been used");
        }
        if (invite.status === "DECLINED") {
            throw new errors_1.ConflictError("This invitation has already been declined");
        }
        // If email is provided (for non-registered users), verify it matches
        if (email && email.toLowerCase() !== invite.email.toLowerCase()) {
            throw new errors_1.ForbiddenError("This invitation is not for your email address");
        }
        // Mark invite as declined
        await prisma_1.prisma.orgInvite.update({
            where: { id: invite.id },
            data: {
                status: "DECLINED",
                declinedAt: new Date(),
            },
        });
        orgLogger.info({ inviteId: invite.id, orgId: invite.organizationId, email: invite.email }, "Pending invitation declined");
        return { organizationName: invite.organization.name };
    }
    /**
     * Get pending and declined invitations for an organization
     */
    async getPendingInvites(ctx, orgId) {
        const MAX_RESEND_COUNT = 3;
        // Verify admin/owner access
        await this.requireMembership(ctx.userId, orgId, "ORG_ADMIN");
        const invites = await prisma_1.prisma.orgInvite.findMany({
            where: {
                organizationId: orgId,
                usedAt: null, // Not accepted
                OR: [
                    // Active pending invites
                    { status: "PENDING", expiresAt: { gt: new Date() } },
                    // Declined invites (show for 30 days)
                    {
                        status: "DECLINED",
                        declinedAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                    },
                ],
            },
            include: {
                inviter: {
                    select: { email: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        return invites.map((invite) => ({
            id: invite.id,
            email: invite.email,
            role: invite.role,
            invitedBy: invite.invitedBy,
            inviterEmail: invite.inviter.email,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt,
            resendCount: invite.resendCount,
            maxResends: MAX_RESEND_COUNT,
            status: invite.status,
            declinedAt: invite.declinedAt,
        }));
    }
    /**
     * Cancel/delete a pending invitation
     */
    async cancelInvite(ctx, orgId, inviteId) {
        // Verify admin/owner access
        await this.requireMembership(ctx.userId, orgId, "ORG_ADMIN");
        const invite = await prisma_1.prisma.orgInvite.findFirst({
            where: {
                id: inviteId,
                organizationId: orgId,
            },
        });
        if (!invite) {
            throw new errors_1.NotFoundError("Invitation not found");
        }
        await prisma_1.prisma.orgInvite.delete({
            where: { id: inviteId },
        });
        // Audit log
        void (0, audit_1.audit)(toAuditContext(ctx), {
            action: "org_invite.cancel",
            resource: "org_invite",
            resourceId: inviteId,
            metadata: {
                organizationId: orgId,
                email: invite.email,
            },
        });
        orgLogger.info({ inviteId, orgId, cancelledBy: ctx.userId }, "Organization invitation cancelled");
    }
    /**
     * Resend an invitation email (max 3 times)
     */
    async resendInvite(ctx, orgId, inviteId) {
        const MAX_RESEND_COUNT = 3;
        // Verify admin/owner access
        await this.requireMembership(ctx.userId, orgId, "ORG_ADMIN");
        const invite = await prisma_1.prisma.orgInvite.findFirst({
            where: {
                id: inviteId,
                organizationId: orgId,
                usedAt: null,
            },
            include: {
                organization: { select: { name: true } },
                inviter: { select: { name: true, email: true } },
            },
        });
        if (!invite) {
            throw new errors_1.NotFoundError("Invitation not found or already used");
        }
        // Check resend limit
        if (invite.resendCount >= MAX_RESEND_COUNT) {
            throw new errors_1.ValidationError(`Maximum resend limit (${MAX_RESEND_COUNT}) reached. Please cancel this invitation and create a new one.`);
        }
        // Update expiration and increment resend count
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await prisma_1.prisma.orgInvite.update({
            where: { id: inviteId },
            data: {
                expiresAt: newExpiresAt,
                resendCount: { increment: 1 },
                lastResentAt: new Date(),
            },
        });
        // Send invite email
        const result = await (0, email_1.sendOrganizationInviteEmail)(invite.email, invite.organization.name, invite.inviter.name || invite.inviter.email, invite.role);
        if (!result.success) {
            orgLogger.error({ inviteId, orgId, email: invite.email, error: result.error }, "Failed to send resend invitation email");
            throw new errors_1.ValidationError(`Failed to send email: ${result.error || "Unknown error"}`);
        }
        orgLogger.info({ inviteId, orgId, resentBy: ctx.userId, resendCount: invite.resendCount + 1 }, "Organization invitation resent");
    }
}
// Export singleton instance
exports.organizationService = new OrganizationService();
//# sourceMappingURL=organization.service.js.map