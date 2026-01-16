/**
 * Organization Validation Schemas
 *
 * Zod schemas for validating organization-related requests.
 *
 * @module modules/organization/organization.validation
 */

import { z } from "zod";

// ===========================================
// Common Schemas
// ===========================================

/**
 * Organization name validation
 * 2-100 characters
 */
export const orgNameSchema = z
  .string()
  .min(2, "Organization name must be at least 2 characters")
  .max(100, "Organization name must be at most 100 characters")
  .trim();

/**
 * Organization slug validation
 * URL-safe: 2-50 lowercase alphanumeric with hyphens
 */
export const orgSlugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(50, "Slug must be at most 50 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric with hyphens (e.g., my-company)"
  );

/**
 * Organization role enum
 */
export const orgRoleSchema = z.enum([
  "ORG_OWNER",
  "ORG_ADMIN",
  "DEPT_MANAGER",
  "ORG_MEMBER",
]);

/**
 * Membership status enum
 */
export const membershipStatusSchema = z.enum([
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
export const createOrgSchema = z.object({
  name: orgNameSchema,
  slug: orgSlugSchema,
});

/**
 * Update organization request
 */
export const updateOrgSchema = z.object({
  name: orgNameSchema.optional(),
  slug: orgSlugSchema.optional(),
  maxMembers: z.number().int().min(1).max(10000).nullable().optional(),
});

/**
 * Invite member request
 */
export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: orgRoleSchema.optional().default("ORG_MEMBER"),
});

/**
 * Update member role request
 */
export const updateMemberRoleSchema = z.object({
  role: orgRoleSchema,
});

// Note: switchContextSchema has been moved to auth.validation.ts

/**
 * Transfer ownership request
 */
export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().cuid("Invalid user ID"),
});

// ===========================================
// Path Parameter Schemas
// ===========================================

/**
 * Organization ID parameter
 */
export const orgIdParamSchema = z.object({
  id: z.string().cuid("Invalid organization ID"),
});

/**
 * Organization slug parameter
 */
export const orgSlugParamSchema = z.object({
  slug: orgSlugSchema,
});

/**
 * Membership ID parameter
 */
export const membershipIdParamSchema = z.object({
  id: z.string().cuid("Invalid membership ID"),
});

/**
 * User ID parameter (for member operations)
 */
export const userIdParamSchema = z.object({
  userId: z.string().cuid("Invalid user ID"),
});

// ===========================================
// Query Parameter Schemas
// ===========================================

/**
 * Members list query
 */
export const membersQuerySchema = z.object({
  status: membershipStatusSchema.optional(),
});

// ===========================================
// Type Exports
// ===========================================

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
export type MembersQueryInput = z.infer<typeof membersQuerySchema>;
