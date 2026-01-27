"use strict";
/**
 * Organization Types
 *
 * Type definitions for organization, membership, and department management.
 *
 * @module modules/organization/organization.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSafeOrganization = toSafeOrganization;
/**
 * Convert Organization to SafeOrganization
 */
function toSafeOrganization(org) {
    return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        maxSeats: org.maxSeats,
        usedSeats: org.usedSeats,
        poolRamMb: org.poolRamMb,
        poolCpuCores: org.poolCpuCores,
        poolStorageMb: org.poolStorageMb,
        memberCount: org._count.memberships,
        isActive: org.isActive,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
    };
}
// Context types have been moved to auth module (auth.types.ts)
// Use imports from @/modules/auth for ActiveContext, SwitchContextRequest, SwitchContextResponse
//# sourceMappingURL=organization.types.js.map