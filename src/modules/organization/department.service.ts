/**
 * Department Service
 *
 * Handles department CRUD and member management within organizations.
 *
 * @module modules/organization/department.service
 */

import type { DepartmentRole } from "@prisma/client";

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
    AddDeptMemberRequest,
    CreateDeptRequest,
    DeptMemberWithUser,
    DeptQuotas,
    MemberQuotas,
    SafeDepartment,
    UpdateDeptMemberRequest,
    UpdateDeptRequest,
} from "./department.types";
import { toSafeDepartment } from "./department.types";
import { organizationService } from "./organization.service";

const deptLogger = logger.child({ module: "department" });

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

// ===========================================
// Department Service
// ===========================================

class DepartmentService {
  // ===========================================
  // Department CRUD
  // ===========================================

  /**
   * Create a new department
   * Only OWNER or ADMIN can create departments
   */
  async create(
    ctx: ServiceContext,
    orgId: string,
    data: CreateDeptRequest
  ): Promise<SafeDepartment> {
    // Check org membership and role
    await organizationService.requireMembership(ctx.userId, orgId, "ORG_ADMIN");

    // Check if department name already exists in org
    const existing = await prisma.department.findUnique({
      where: {
        organizationId_name: {
          organizationId: orgId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw new ConflictError("Department name already exists in this organization");
    }

    const dept = await prisma.department.create({
      data: {
        organizationId: orgId,
        name: data.name,
        description: data.description,
      },
      include: {
        _count: { select: { members: true, workflows: true } },
      },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "department.create",
      resource: "department",
      resourceId: dept.id,
      metadata: {
        organizationId: orgId,
        name: data.name,
      },
    });

    deptLogger.info(
      { deptId: dept.id, orgId, name: data.name },
      "Department created"
    );

    return toSafeDepartment(dept);
  }

  /**
   * Get department by ID
   * Only org members can view
   */
  async getById(ctx: ServiceContext, id: string): Promise<SafeDepartment> {
    const dept = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true, workflows: true } },
      },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Check org membership
    if (!ctx.isSuperAdmin()) {
      await organizationService.requireMembership(ctx.userId, dept.organizationId);
    }

    return toSafeDepartment(dept);
  }

  /**
   * Update department
   * Only OWNER, ADMIN, or DEPT_MANAGER can update
   */
  async update(
    ctx: ServiceContext,
    id: string,
    data: UpdateDeptRequest
  ): Promise<SafeDepartment> {
    const dept = await prisma.department.findUnique({
      where: { id },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Check permissions
    await this.requireManagePermission(ctx, id);

    // Check name uniqueness if changing
    if (data.name && data.name !== dept.name) {
      const existing = await prisma.department.findUnique({
        where: {
          organizationId_name: {
            organizationId: dept.organizationId,
            name: data.name,
          },
        },
      });
      if (existing) {
        throw new ConflictError("Department name already exists in this organization");
      }
    }

    const updated = await prisma.department.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
      },
      include: {
        _count: { select: { members: true, workflows: true } },
      },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "department.update",
      resource: "department",
      resourceId: id,
      metadata: { ...data },
    });

    deptLogger.info({ deptId: id, changes: data }, "Department updated");

    return toSafeDepartment(updated);
  }

  /**
   * Delete department
   * Only OWNER or ADMIN can delete
   */
  async delete(ctx: ServiceContext, id: string): Promise<void> {
    const dept = await prisma.department.findUnique({
      where: { id },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Only org admin+ can delete
    await organizationService.requireMembership(
      ctx.userId,
      dept.organizationId,
      "ORG_ADMIN"
    );

    await prisma.department.delete({
      where: { id },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "department.delete",
      resource: "department",
      resourceId: id,
    });

    deptLogger.info({ deptId: id }, "Department deleted");
  }

  /**
   * List departments in organization
   */
  async getOrgDepartments(
    ctx: ServiceContext,
    orgId: string,
    options?: { activeOnly?: boolean }
  ): Promise<SafeDepartment[]> {
    // Check org membership
    await organizationService.requireMembership(ctx.userId, orgId);

    const departments = await prisma.department.findMany({
      where: {
        organizationId: orgId,
        ...(options?.activeOnly ? { isActive: true } : {}),
      },
      include: {
        _count: { select: { members: true, workflows: true } },
      },
      orderBy: { name: "asc" },
    });

    return departments.map(toSafeDepartment);
  }

  // ===========================================
  // Member Management
  // ===========================================

  /**
   * Add member to department
   * User must already be an org member
   */
  async addMember(
    ctx: ServiceContext,
    deptId: string,
    data: AddDeptMemberRequest
  ): Promise<DeptMemberWithUser> {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Check requester permissions
    await this.requireManagePermission(ctx, deptId);

    // Check if user is an org member
    const membership = await organizationService.checkMembership(
      data.userId,
      dept.organizationId
    );

    if (!membership || membership.status !== "ACTIVE") {
      throw new ValidationError("User must be an active organization member first", {
        userId: ["User is not an active organization member"],
      });
    }

    // Check if already a department member
    const existing = await prisma.departmentMember.findUnique({
      where: {
        userId_departmentId: {
          userId: data.userId,
          departmentId: deptId,
        },
      },
    });

    if (existing) {
      throw new ConflictError("User is already a member of this department");
    }

    const member = await prisma.departmentMember.create({
      data: {
        userId: data.userId,
        departmentId: deptId,
        membershipId: membership.id,
        role: data.role ?? "MEMBER",
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
      action: "department_member.add",
      resource: "department_member",
      resourceId: member.id,
      metadata: {
        departmentId: deptId,
        userId: data.userId,
        role: member.role,
      },
    });

    deptLogger.info(
      { deptId, userId: data.userId, role: member.role },
      "Member added to department"
    );

    return {
      id: member.id,
      role: member.role,
      maxWorkflows: member.maxWorkflows,
      maxPlugins: member.maxPlugins,
      user: member.user,
      createdAt: member.createdAt,
    };
  }

  /**
   * Remove member from department
   */
  async removeMember(
    ctx: ServiceContext,
    deptId: string,
    userId: string
  ): Promise<void> {
    // Check permissions
    await this.requireManagePermission(ctx, deptId);

    const member = await prisma.departmentMember.findUnique({
      where: {
        userId_departmentId: {
          userId,
          departmentId: deptId,
        },
      },
    });

    if (!member) {
      throw new NotFoundError("Member not found in department");
    }

    await prisma.departmentMember.delete({
      where: { id: member.id },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "department_member.remove",
      resource: "department_member",
      resourceId: member.id,
      metadata: { deptId, userId },
    });

    deptLogger.info({ deptId, userId }, "Member removed from department");
  }

  /**
   * Update member role or quotas
   */
  async updateMember(
    ctx: ServiceContext,
    deptId: string,
    userId: string,
    data: UpdateDeptMemberRequest
  ): Promise<DeptMemberWithUser> {
    // Check permissions
    await this.requireManagePermission(ctx, deptId);

    const member = await prisma.departmentMember.findUnique({
      where: {
        userId_departmentId: {
          userId,
          departmentId: deptId,
        },
      },
    });

    if (!member) {
      throw new NotFoundError("Member not found in department");
    }

    const updated = await prisma.departmentMember.update({
      where: { id: member.id },
      data: {
        role: data.role,
        maxWorkflows: data.maxWorkflows,
        maxPlugins: data.maxPlugins,
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
      action: "department_member.update",
      resource: "department_member",
      resourceId: member.id,
      metadata: { ...data },
    });

    deptLogger.info({ deptId, userId, changes: data }, "Department member updated");

    return {
      id: updated.id,
      role: updated.role,
      maxWorkflows: updated.maxWorkflows,
      maxPlugins: updated.maxPlugins,
      user: updated.user,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Get department members
   */
  async getMembers(
    ctx: ServiceContext,
    deptId: string
  ): Promise<DeptMemberWithUser[]> {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Check org membership
    await organizationService.requireMembership(ctx.userId, dept.organizationId);

    const members = await prisma.departmentMember.findMany({
      where: { departmentId: deptId },
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
      maxWorkflows: m.maxWorkflows,
      maxPlugins: m.maxPlugins,
      user: m.user,
      createdAt: m.createdAt,
    }));
  }

  // ===========================================
  // Quota Management
  // ===========================================

  /**
   * Set department quotas
   * Only OWNER or ADMIN can set quotas
   */
  async setDeptQuotas(
    ctx: ServiceContext,
    deptId: string,
    quotas: DeptQuotas
  ): Promise<SafeDepartment> {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Only org admin+ can set quotas
    await organizationService.requireMembership(
      ctx.userId,
      dept.organizationId,
      "ORG_ADMIN"
    );

    const updated = await prisma.department.update({
      where: { id: deptId },
      data: {
        maxWorkflows: quotas.maxWorkflows,
        maxPlugins: quotas.maxPlugins,
        maxApiCalls: quotas.maxApiCalls,
        maxStorage: quotas.maxStorage,
      },
      include: {
        _count: { select: { members: true, workflows: true } },
      },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "department.set_quotas",
      resource: "department",
      resourceId: deptId,
      metadata: { quotas },
    });

    deptLogger.info({ deptId, quotas }, "Department quotas updated");

    return toSafeDepartment(updated);
  }

  /**
   * Set member quotas
   * Manager can set quotas for their members
   */
  async setMemberQuotas(
    ctx: ServiceContext,
    deptId: string,
    userId: string,
    quotas: MemberQuotas
  ): Promise<DeptMemberWithUser> {
    // Check permissions
    await this.requireManagePermission(ctx, deptId);

    const member = await prisma.departmentMember.findUnique({
      where: {
        userId_departmentId: {
          userId,
          departmentId: deptId,
        },
      },
    });

    if (!member) {
      throw new NotFoundError("Member not found in department");
    }

    const updated = await prisma.departmentMember.update({
      where: { id: member.id },
      data: {
        maxWorkflows: quotas.maxWorkflows,
        maxPlugins: quotas.maxPlugins,
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
      action: "department_member.set_quotas",
      resource: "department_member",
      resourceId: member.id,
      metadata: { quotas },
    });

    deptLogger.info({ deptId, userId, quotas }, "Member quotas updated");

    return {
      id: updated.id,
      role: updated.role,
      maxWorkflows: updated.maxWorkflows,
      maxPlugins: updated.maxPlugins,
      user: updated.user,
      createdAt: updated.createdAt,
    };
  }

  // ===========================================
  // Emergency Stop
  // ===========================================

  /**
   * Emergency stop for department
   * Disables department and pauses all workflows
   * Only OWNER or ADMIN can perform this action
   */
  async emergencyStopDepartment(
    ctx: ServiceContext,
    deptId: string
  ): Promise<{
    departmentPaused: boolean;
    workflowsPaused: number;
    memberWorkflowsPaused: number;
  }> {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Only org admin+ can emergency stop a department
    await organizationService.requireMembership(
      ctx.userId,
      dept.organizationId,
      "ORG_ADMIN"
    );

    // 1. Set department.isActive = false
    await prisma.department.update({
      where: { id: deptId },
      data: { isActive: false },
    });

    // 2. Pause all department workflows
    const deptWorkflows = await prisma.workflow.updateMany({
      where: { departmentId: deptId },
      data: { status: "PAUSED" },
    });

    // 3. Get all department members
    const members = await prisma.departmentMember.findMany({
      where: { departmentId: deptId },
      select: { userId: true },
    });

    // 4. Pause all member personal (USER scope) workflows
    const memberWorkflows = await prisma.workflow.updateMany({
      where: {
        userId: { in: members.map((m) => m.userId) },
        scope: "USER",
      },
      data: { status: "PAUSED" },
    });

    // 5. Audit log
    void audit(toAuditContext(ctx), {
      action: "department.emergency_stop",
      resource: "department",
      resourceId: deptId,
      metadata: {
        workflowsPaused: deptWorkflows.count,
        memberWorkflowsPaused: memberWorkflows.count,
        membersAffected: members.length,
      },
    });

    deptLogger.warn(
      {
        deptId,
        workflowsPaused: deptWorkflows.count,
        memberWorkflowsPaused: memberWorkflows.count,
      },
      "Department emergency stopped"
    );

    return {
      departmentPaused: true,
      workflowsPaused: deptWorkflows.count,
      memberWorkflowsPaused: memberWorkflows.count,
    };
  }

  /**
   * Emergency stop for a specific employee
   * Pauses all personal workflows for the employee
   * Managers can stop members, Admin/Owner can stop anyone
   */
  async emergencyStopMember(
    ctx: ServiceContext,
    deptId: string,
    userId: string
  ): Promise<{
    memberPaused: boolean;
    workflowsPaused: number;
  }> {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Check if target is a department member
    const targetMember = await this.checkMembership(userId, deptId);
    if (!targetMember) {
      throw new NotFoundError("User is not a member of this department");
    }

    // Check requester permissions
    const orgMembership = await organizationService.checkMembership(
      ctx.userId,
      dept.organizationId
    );

    if (!orgMembership || orgMembership.status !== "ACTIVE") {
      throw new ForbiddenError("You are not a member of this organization");
    }

    // Org admin+ can always stop anyone
    const isOrgAdmin =
      orgMembership.role === "ORG_OWNER" || orgMembership.role === "ORG_ADMIN";

    if (!isOrgAdmin) {
      // Managers can only stop members, not other managers
      const requesterMember = await this.checkMembership(ctx.userId, deptId);
      if (!requesterMember || requesterMember.role !== "MANAGER") {
        throw new ForbiddenError("You don't have permission to stop this member");
      }
      if (targetMember.role === "MANAGER") {
        throw new ForbiddenError("Managers cannot stop other managers");
      }
    }

    // Pause all personal (USER scope) workflows for the member
    const result = await prisma.workflow.updateMany({
      where: {
        userId,
        scope: "USER",
      },
      data: { status: "PAUSED" },
    });

    // Audit log
    void audit(toAuditContext(ctx), {
      action: "department_member.emergency_stop",
      resource: "department_member",
      resourceId: targetMember.id,
      metadata: {
        targetUserId: userId,
        departmentId: deptId,
        workflowsPaused: result.count,
      },
    });

    deptLogger.warn(
      { deptId, userId, workflowsPaused: result.count },
      "Department member emergency stopped"
    );

    return {
      memberPaused: true,
      workflowsPaused: result.count,
    };
  }

  /**
   * Resume a department after emergency stop
   * Re-activates the department (workflows remain paused)
   */
  async resumeDepartment(ctx: ServiceContext, deptId: string): Promise<void> {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Only org admin+ can resume
    await organizationService.requireMembership(
      ctx.userId,
      dept.organizationId,
      "ORG_ADMIN"
    );

    await prisma.department.update({
      where: { id: deptId },
      data: { isActive: true },
    });

    void audit(toAuditContext(ctx), {
      action: "department.resume",
      resource: "department",
      resourceId: deptId,
    });

    deptLogger.info({ deptId }, "Department resumed");
  }

  // ===========================================
  // Validation Helpers
  // ===========================================

  /**
   * Check if user is a department member
   */
  async checkMembership(
    userId: string,
    deptId: string
  ): Promise<{ id: string; role: DepartmentRole } | null> {
    const member = await prisma.departmentMember.findUnique({
      where: {
        userId_departmentId: {
          userId,
          departmentId: deptId,
        },
      },
      select: {
        id: true,
        role: true,
      },
    });

    return member;
  }

  /**
   * Check if user is a department manager
   */
  async isManager(userId: string, deptId: string): Promise<boolean> {
    const member = await this.checkMembership(userId, deptId);
    return member?.role === "MANAGER";
  }

  /**
   * Require permission to manage department
   * Must be org admin+, or department manager
   */
  private async requireManagePermission(
    ctx: ServiceContext,
    deptId: string
  ): Promise<void> {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new NotFoundError("Department not found");
    }

    // Check org membership
    const orgMembership = await organizationService.checkMembership(
      ctx.userId,
      dept.organizationId
    );

    if (!orgMembership || orgMembership.status !== "ACTIVE") {
      throw new ForbiddenError("You are not a member of this organization");
    }

    // Org admin+ can always manage
    if (orgMembership.role === "ORG_OWNER" || orgMembership.role === "ORG_ADMIN") {
      return;
    }

    // Check if user is department manager
    const deptMembership = await this.checkMembership(ctx.userId, deptId);
    if (deptMembership?.role === "MANAGER") {
      return;
    }

    throw new ForbiddenError("You don't have permission to manage this department");
  }
}

// Export singleton instance
export const departmentService = new DepartmentService();
