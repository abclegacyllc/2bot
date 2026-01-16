/**
 * Organization Types
 *
 * Type definitions for organization, membership, and department management.
 *
 * @module modules/organization/organization.types
 */

import type {
    Membership,
    MembershipStatus,
    Organization,
    OrgRole,
    PlanType,
} from "@prisma/client";

// Re-export Prisma types
export type {
    Membership, MembershipStatus, Organization, OrgRole, PlanType
} from "@prisma/client";

// ===========================================
// Organization Types
// ===========================================

/**
 * Organization with basic membership count
 */
export interface OrganizationWithMemberCount extends Organization {
  _count: {
    memberships: number;
  };
}

/**
 * Organization for user's org list (with their role)
 */
export interface OrgWithRole {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  plan: PlanType;
  memberCount: number;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Safe organization for API responses
 */
export interface SafeOrganization {
  id: string;
  name: string;
  slug: string;
  plan: PlanType;
  maxMembers: number | null;
  memberCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert Organization to SafeOrganization
 */
export function toSafeOrganization(
  org: OrganizationWithMemberCount
): SafeOrganization {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    maxMembers: org.maxMembers,
    memberCount: org._count.memberships,
    isActive: org.isActive,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}

// ===========================================
// Membership Types
// ===========================================

/**
 * Membership with user details
 */
export interface MemberWithUser {
  id: string;
  role: OrgRole;
  status: MembershipStatus;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  invitedAt: Date;
  joinedAt: Date | null;
}

/**
 * Membership with organization details
 */
export interface MembershipWithOrg extends Membership {
  organization: Organization;
}

/**
 * Pending invite for API response
 */
export interface PendingInvite {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
  invitedAt: Date;
  inviterEmail?: string;
}

// ===========================================
// Request DTOs
// ===========================================

/**
 * Create organization request
 */
export interface CreateOrgRequest {
  name: string;
  slug: string;
}

/**
 * Update organization request
 */
export interface UpdateOrgRequest {
  name?: string;
  slug?: string;
  maxMembers?: number | null;
}

/**
 * Invite member request
 */
export interface InviteMemberRequest {
  email: string;
  role?: OrgRole;
}

/**
 * Update member role request
 */
export interface UpdateMemberRoleRequest {
  role: OrgRole;
}

// Context types have been moved to auth module (auth.types.ts)
// Use imports from @/modules/auth for ActiveContext, SwitchContextRequest, SwitchContextResponse
