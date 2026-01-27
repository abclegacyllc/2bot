"use strict";
/**
 * Department Types
 *
 * Type definitions for department management.
 *
 * @module modules/organization/department.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSafeDepartment = toSafeDepartment;
/**
 * Convert Department to SafeDepartment
 */
function toSafeDepartment(dept) {
    return {
        id: dept.id,
        organizationId: dept.organizationId,
        name: dept.name,
        description: dept.description,
        maxWorkflows: dept.maxWorkflows,
        maxPlugins: dept.maxPlugins,
        maxApiCalls: dept.maxApiCalls,
        maxStorage: dept.maxStorage,
        memberCount: dept._count.members,
        workflowCount: dept._count.workflows,
        isActive: dept.isActive,
        createdAt: dept.createdAt,
        updatedAt: dept.updatedAt,
    };
}
//# sourceMappingURL=department.types.js.map