/**
 * Organization Service
 *
 * Handles organization CRUD, membership management, and invitations.
 *
 * @module modules/organization/organization.service
 */

import type { MembershipStatus, OrgRole } from "@prisma/client";

import { audit, type AuditContext } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "@/shared/errors";
import type { ServiceContext } from "@/shared/types/context";

import type {
    CreateOrgRequest,
    InviteMemberRequest,
    MemberWithUser,
    MembershipWithOrg,
    OrgWithRole,
    PendingInvite,
    SafeOrganization,
    UpdateMemberRoleRequest,
    UpdateOrgRequest,
} from "./organization.types";
import { toSafeOrganization } from "./organization.types";

const orgLogger = logger.child({ module: "organization" });

/**
 * Convert ServiceContext to AuditContext
 */
function toAuditContext(ctx: ServiceContext): AuditContext {
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
const ROLE_HIERARCHY: Record<OrgRole, number> = {
  ORG_OWNER: 4,
  ORG_ADMIN: 3,
  DEPT_MANAGER: 2,
  ORG_MEMBER: 1,
};

/**
 * Check if a role is at least as high as another
 */
function hasMinRole(userRole: OrgRole, minRole: OrgRole): boolean {
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
  async create(
    ctx: ServiceContext,
    data: CreateOrgRequest
  ): Promise<SafeOrganization> {
    orgLogger.debug({ userId: ctx.userId, slug: data.slug }, "Creating organization");

    // Check if slug is available
    const existing = await prisma.organization.findUnique({
      where: { slug: data.slug },
    });

    if (existing) {
      throw new ConflictError("Organization slug already exists");
    }

    // Create organization with owner membership
    const org = await prisma.organization.create({
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
    void audit(toAuditContext(ctx), {
      action: "organization.create",
      resource: "organization",
      resourceId: org.id,
      metadata: { name: data.name, slug: data.slug },
    });

    orgLogger.info(
      { orgId: org.id, userId: ctx.userId },
      "Organization created"
    );

    return toSafeOrganization(org);
  }

  /**
   * Get organization by ID
   * Only members can access
   */
  async getById(ctx: ServiceContext, id: string): Promise<SafeOrganization> {
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { memberships: true } },
      },
    });

    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    // Check membership (unless super admin)
    if (!ctx.isSuperAdmin()) {
      await this.requireMembership(ctx.userId, id);
    }

    return toSafeOrganization(org);
  }

  /**
   * Get organization by slug
   */
  async getBySlug(ctx: ServiceContext, slug: string): Promise<SafeOrganization> {
    const org = await prisma.organization.findUnique({
      where: { slug },
      include: {
        _count: { select: { memberships: true } },
      },
    });

    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    // Check membership (unless super admin)
    if (!ctx.isSuperAdmin()) {
      await this.requireMembership(ctx.userId, org.id);
    }

    return toSafeOrganization(org);
  }

  /**
   * Update organization
   * Only ADMIN+ can update
   */
  async update(
    ctx: ServiceContext,
    id: string,
    data: UpdateOrgRequest
  ): Promise<SafeOrganization> {
    // Check membership and role
    const membership = await this.requireMembership(ctx.userId, id, "ORG_ADMIN");

    // Check slug availability if changing
    if (data.slug) {
      const existing = await prisma.organization.findFirst({
        where: { slug: data.slug, id: { not: id } },
      });
      if (existing) {
        throw new ConflictError("Organization slug already exists");
      }
    }

    const org = await prisma.organization.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        maxMembers: data.maxMembers,
      },
      include: {
        _count: { select: { memberships: true } },
      },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "organization.update",
      resource: "organization",
      resourceId: id,
      metadata: { ...data },
    });

    orgLogger.info(
      { orgId: id, userId: ctx.userId, role: membership.role },
      "Organization updated"
    );

    return toSafeOrganization(org);
  }

  /**
   * Delete organization
   * Only OWNER can delete
   */
  async delete(ctx: ServiceContext, id: string): Promise<void> {
    // Check membership and role
    await this.requireMembership(ctx.userId, id, "ORG_OWNER");

    await prisma.organization.delete({
      where: { id },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "organization.delete",
      resource: "organization",
      resourceId: id,
    });

    orgLogger.info(
      { orgId: id, userId: ctx.userId },
      "Organization deleted"
    );
  }

  // ===========================================
  // User Organizations
  // ===========================================

  /**
   * Get all organizations for a user
   */
  async getUserOrganizations(userId: string): Promise<OrgWithRole[]> {
    const memberships = await prisma.membership.findMany({
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
  async getUserPendingInvites(userId: string): Promise<PendingInvite[]> {
    // First get user email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      return [];
    }

    // Find pending invites by email
    const invites = await prisma.membership.findMany({
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
  async inviteMember(
    ctx: ServiceContext,
    orgId: string,
    data: InviteMemberRequest
  ): Promise<MemberWithUser> {
    // Check inviter's membership and role
    await this.requireMembership(ctx.userId, orgId, "ORG_ADMIN");

    // Get organization to check limits
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: { select: { memberships: true } },
      },
    });

    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    // Check member limit
    // Use org's maxMembers if set, otherwise allow unlimited
    const maxMembers = org.maxMembers;
    if (maxMembers !== null && maxMembers !== -1 && org._count.memberships >= maxMembers) {
      throw new ForbiddenError(
        `Member limit reached (${maxMembers}). Contact admin to increase limit.`
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      // TODO: In future, create pending invite and send email
      throw new NotFoundError("User not found. They must register first.");
    }

    // Check if already a member
    const existing = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: orgId,
        },
      },
    });

    if (existing) {
      if (existing.status === "ACTIVE") {
        throw new ConflictError("User is already a member");
      }
      if (existing.status === "INVITED") {
        throw new ConflictError("User has already been invited");
      }
      // If suspended, reactivate with new invite
    }

    // Create or update membership
    const membership = await prisma.membership.upsert({
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
    void audit(toAuditContext(ctx), {
      action: "membership.invite",
      resource: "membership",
      resourceId: membership.id,
      metadata: {
        organizationId: orgId,
        invitedEmail: data.email,
        role: membership.role,
      },
    });

    // TODO: Send invitation email

    orgLogger.info(
      { orgId, invitedEmail: data.email, role: membership.role },
      "Member invited"
    );

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
   * Accept an invitation
   */
  async acceptInvite(ctx: ServiceContext, membershipId: string): Promise<MembershipWithOrg> {
    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
      include: { organization: true },
    });

    if (!membership) {
      throw new NotFoundError("Invitation not found");
    }

    // Verify user is the invitee
    if (membership.userId !== ctx.userId) {
      throw new ForbiddenError("This invitation is not for you");
    }

    if (membership.status !== "INVITED") {
      throw new ValidationError("Invitation is no longer valid", {
        status: [`Current status: ${membership.status}`],
      });
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: "ACTIVE",
        joinedAt: new Date(),
      },
      include: { organization: true },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "membership.accept_invite",
      resource: "membership",
      resourceId: membershipId,
      metadata: {
        organizationId: membership.organizationId,
      },
    });

    orgLogger.info(
      { membershipId, orgId: membership.organizationId, userId: ctx.userId },
      "Invitation accepted"
    );

    return updated;
  }

  /**
   * Decline an invitation
   */
  async declineInvite(ctx: ServiceContext, membershipId: string): Promise<void> {
    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundError("Invitation not found");
    }

    // Verify user is the invitee
    if (membership.userId !== ctx.userId) {
      throw new ForbiddenError("This invitation is not for you");
    }

    if (membership.status !== "INVITED") {
      throw new ValidationError("Invitation is no longer valid", {
        status: [`Current status: ${membership.status}`],
      });
    }

    await prisma.membership.delete({
      where: { id: membershipId },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "membership.decline_invite",
      resource: "membership",
      resourceId: membershipId,
    });

    orgLogger.info(
      { membershipId, orgId: membership.organizationId, userId: ctx.userId },
      "Invitation declined"
    );
  }

  /**
   * Remove a member from organization
   * ADMIN+ can remove members, but only OWNER can remove ADMIN
   */
  async removeMember(
    ctx: ServiceContext,
    orgId: string,
    userId: string
  ): Promise<void> {
    // Get requester's membership
    const requesterMembership = await this.requireMembership(ctx.userId, orgId, "ORG_ADMIN");

    // Get target membership
    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });

    if (!targetMembership) {
      throw new NotFoundError("Member not found");
    }

    // Can't remove yourself (use leave instead)
    if (userId === ctx.userId) {
      throw new ValidationError("Use leave organization instead", {});
    }

    // Can't remove OWNER
    if (targetMembership.role === "ORG_OWNER") {
      throw new ForbiddenError("Cannot remove organization owner");
    }

    // Only OWNER can remove ADMIN
    if (
      targetMembership.role === "ORG_ADMIN" &&
      requesterMembership.role !== "ORG_OWNER"
    ) {
      throw new ForbiddenError("Only owner can remove admins");
    }

    await prisma.membership.delete({
      where: { id: targetMembership.id },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "membership.remove",
      resource: "membership",
      resourceId: targetMembership.id,
      metadata: { orgId, removedUserId: userId },
    });

    orgLogger.info(
      { orgId, removedUserId: userId, removedBy: ctx.userId },
      "Member removed"
    );
  }

  /**
   * Update member role
   * Only OWNER can change roles
   */
  async updateMemberRole(
    ctx: ServiceContext,
    orgId: string,
    userId: string,
    data: UpdateMemberRoleRequest
  ): Promise<MemberWithUser> {
    // Only OWNER can change roles
    await this.requireMembership(ctx.userId, orgId, "ORG_OWNER");

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError("Member not found");
    }

    // Can't change owner's role
    if (membership.role === "ORG_OWNER" && data.role !== "ORG_OWNER") {
      throw new ForbiddenError("Cannot demote organization owner. Transfer ownership first.");
    }

    // Can't have multiple owners
    if (data.role === "ORG_OWNER" && membership.role !== "ORG_OWNER") {
      throw new ValidationError("Use transfer ownership instead", {});
    }

    const updated = await prisma.membership.update({
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
    void audit(toAuditContext(ctx), {
      action: "membership.update_role",
      resource: "membership",
      resourceId: membership.id,
      metadata: {
        previousRole: membership.role,
        newRole: data.role,
      },
    });

    orgLogger.info(
      { orgId, userId, previousRole: membership.role, newRole: data.role },
      "Member role updated"
    );

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
   * Get organization members
   * Only members can view
   */
  async getMembers(
    ctx: ServiceContext,
    orgId: string,
    options?: { status?: MembershipStatus }
  ): Promise<MemberWithUser[]> {
    // Check membership
    await this.requireMembership(ctx.userId, orgId);

    const members = await prisma.membership.findMany({
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
  async leaveOrganization(ctx: ServiceContext, orgId: string): Promise<void> {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: ctx.userId,
          organizationId: orgId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError("You are not a member of this organization");
    }

    if (membership.role === "ORG_OWNER") {
      throw new ForbiddenError(
        "Owner cannot leave organization. Transfer ownership first or delete the organization."
      );
    }

    await prisma.membership.delete({
      where: { id: membership.id },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "membership.leave",
      resource: "membership",
      resourceId: membership.id,
      metadata: { orgId },
    });

    orgLogger.info(
      { orgId, userId: ctx.userId },
      "User left organization"
    );
  }

  /**
   * Transfer ownership to another member
   * Only OWNER can transfer
   */
  async transferOwnership(
    ctx: ServiceContext,
    orgId: string,
    newOwnerId: string
  ): Promise<void> {
    // Verify current owner
    const currentOwner = await this.requireMembership(ctx.userId, orgId, "ORG_OWNER");

    // Get new owner's membership
    const newOwner = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: newOwnerId,
          organizationId: orgId,
        },
      },
    });

    if (!newOwner) {
      throw new NotFoundError("User is not a member of this organization");
    }

    if (newOwner.status !== "ACTIVE") {
      throw new ValidationError("User must be an active member", {});
    }

    // Transfer in a transaction
    await prisma.$transaction([
      // Demote current owner to admin
      prisma.membership.update({
        where: { id: currentOwner.id },
        data: { role: "ORG_ADMIN" },
      }),
      // Promote new owner
      prisma.membership.update({
        where: { id: newOwner.id },
        data: { role: "ORG_OWNER" },
      }),
    ]);

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "organization.transfer_ownership",
      resource: "organization",
      resourceId: orgId,
      metadata: {
        previousOwner: ctx.userId,
        newOwner: newOwnerId,
      },
    });

    orgLogger.info(
      { orgId, previousOwner: ctx.userId, newOwner: newOwnerId },
      "Ownership transferred"
    );
  }

  // ===========================================
  // Validation Helpers
  // ===========================================

  /**
   * Check if user has membership in organization
   */
  async checkMembership(
    userId: string,
    orgId: string
  ): Promise<{ id: string; role: OrgRole; status: MembershipStatus } | null> {
    const membership = await prisma.membership.findUnique({
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
  async requireMembership(
    userId: string,
    orgId: string,
    minRole?: OrgRole
  ): Promise<{ id: string; role: OrgRole; status: MembershipStatus }> {
    const membership = await this.checkMembership(userId, orgId);

    if (!membership) {
      throw new ForbiddenError("You are not a member of this organization");
    }

    if (membership.status !== "ACTIVE") {
      throw new ForbiddenError("Your membership is not active");
    }

    if (minRole && !hasMinRole(membership.role, minRole)) {
      throw new ForbiddenError(
        `This action requires ${minRole.replace("ORG_", "").toLowerCase()} role or higher`
      );
    }

    return membership;
  }
}

// Export singleton instance
export const organizationService = new OrganizationService();
