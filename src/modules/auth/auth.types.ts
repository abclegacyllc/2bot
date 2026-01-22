import type { OrgPlan, OrgRole, PlanType, Session, User, UserRole } from "@prisma/client";

// Re-export Prisma types
export type { OrgPlan, OrgRole, PlanType, Session, User, UserRole } from "@prisma/client";

/**
 * User without sensitive fields (for API responses)
 */
export type SafeUser = Omit<User, "passwordHash">;

/**
 * User with sessions (for admin views)
 */
export type UserWithSessions = User & {
  sessions: Session[];
};

/**
 * Session with user info
 */
export type SessionWithUser = Session & {
  user: SafeUser;
};

/**
 * JWT Token Payload
 * Simplified for Phase 6.7 architecture - context determined by URL, not token
 */
export interface TokenPayload {
  userId: string;
  email: string;
  plan: PlanType;      // User's personal plan
  sessionId: string;
  
  // Role fields (Phase 1.5) - platform role
  role: UserRole;
  
  // Phase 6.7: activeContext and availableOrgs REMOVED
  // - Context is determined by URL (/api/user/* vs /api/orgs/:orgId/*)
  // - Organizations are fetched via /api/user/organizations
}

/**
 * Active context - what the user is currently operating as
 * Phase 6.7: Now UI-only, not stored in token
 */
export interface ActiveContext {
  type: "personal" | "organization";
  organizationId?: string;
  organizationName?: string;
  orgRole?: OrgRole;
  plan: PlanType; // Effective plan (personal or org plan)
}

/**
 * Organization available for switching
 * Phase 6.7: Now fetched from API, not stored in token
 */
export interface AvailableOrg {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

/**
 * Request context for middleware (extended token payload)
 */
export interface RequestContext extends TokenPayload {
  permissions: string[];
}

/**
 * Auth Request DTOs
 */
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Context switching request (Phase 4)
 */
export interface SwitchContextRequest {
  contextType: "personal" | "organization";
  organizationId?: string; // Required if contextType === 'organization'
}

/**
 * Context switching response (Phase 4)
 */
export interface SwitchContextResponse {
  token: string;
  context: {
    type: "personal" | "organization";
    organizationId?: string;
    organizationName?: string;
    orgRole?: OrgRole;
    plan: PlanType | OrgPlan; // User plan (personal) or Org plan (organization)
  };
}

/**
 * Auth Response DTOs
 */
export interface AuthResponse {
  user: SafeUser;
  token: string;
  expiresAt: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  plan: PlanType;
  emailVerified: Date | null;
  image: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Auth context (for authenticated requests)
 */
export interface AuthContext {
  user: SafeUser;
  session: Session;
  token: string;
}
