"use strict";
/**
 * Organization Validation Schemas
 *
 * Zod schemas for validating organization-related requests.
 *
 * @module modules/organization/organization.validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.membersQuerySchema = exports.userIdParamSchema = exports.membershipIdParamSchema = exports.orgSlugParamSchema = exports.orgIdParamSchema = exports.transferOwnershipSchema = exports.updateMemberRoleSchema = exports.inviteMemberSchema = exports.updateOrgSchema = exports.createOrgSchema = exports.membershipStatusSchema = exports.orgRoleSchema = exports.orgSlugSchema = exports.orgNameSchema = void 0;
const zod_1 = require("zod");
// ===========================================
// Common Schemas
// ===========================================
/**
 * Organization name validation
 * 2-100 characters
 */
exports.orgNameSchema = zod_1.z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be at most 100 characters")
    .trim();
/**
 * Organization slug validation
 * URL-safe: 2-50 lowercase alphanumeric with hyphens
 */
exports.orgSlugSchema = zod_1.z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be at most 50 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens (e.g., my-company)");
/**
 * Organization role enum
 */
exports.orgRoleSchema = zod_1.z.enum([
    "ORG_OWNER",
    "ORG_ADMIN",
    "DEPT_MANAGER",
    "ORG_MEMBER",
]);
/**
 * Membership status enum
 */
exports.membershipStatusSchema = zod_1.z.enum([
    "INVITED",
    "ACTIVE",
    "SUSPENDED",
]);
// ===========================================
// Request Validation Schemas
// ===========================================
/**
 * Create organization request
 */
exports.createOrgSchema = zod_1.z.object({
    name: exports.orgNameSchema,
    slug: exports.orgSlugSchema,
});
/**
 * Update organization request
 */
exports.updateOrgSchema = zod_1.z.object({
    name: exports.orgNameSchema.optional(),
    slug: exports.orgSlugSchema.optional(),
    // Note: maxSeats is managed by plan/billing, not direct update
});
/**
 * Invite member request
 */
exports.inviteMemberSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email address"),
    role: exports.orgRoleSchema.optional().default("ORG_MEMBER"),
});
/**
 * Update member role request
 */
exports.updateMemberRoleSchema = zod_1.z.object({
    role: exports.orgRoleSchema,
});
// Note: switchContextSchema has been moved to auth.validation.ts
/**
 * Transfer ownership request
 */
exports.transferOwnershipSchema = zod_1.z.object({
    newOwnerId: zod_1.z.string().cuid("Invalid user ID"),
});
// ===========================================
// Path Parameter Schemas
// ===========================================
/**
 * Organization ID parameter
 */
exports.orgIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().cuid("Invalid organization ID"),
});
/**
 * Organization slug parameter
 */
exports.orgSlugParamSchema = zod_1.z.object({
    slug: exports.orgSlugSchema,
});
/**
 * Membership ID parameter
 */
exports.membershipIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().cuid("Invalid membership ID"),
});
/**
 * User ID parameter (for member operations)
 */
exports.userIdParamSchema = zod_1.z.object({
    userId: zod_1.z.string().cuid("Invalid user ID"),
});
// ===========================================
// Query Parameter Schemas
// ===========================================
/**
 * Members list query
 */
exports.membersQuerySchema = zod_1.z.object({
    status: exports.membershipStatusSchema.optional(),
});
//# sourceMappingURL=organization.validation.js.map