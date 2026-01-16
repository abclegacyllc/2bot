import type { OrgRole, PlanType, Session, User, UserRole } from "@prisma/client";

// Re-export Prisma types
export type { OrgRole, PlanType, Session, User, UserRole } from "@prisma/client";

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
 * Extended with role fields for Phase 1.5 architecture
 * Updated with active context for Phase 4 multi-org support
 */
export interface TokenPayload {
  userId: string;
  email: string;
  plan: PlanType;
  sessionId: string;
  
  // Role fields (Phase 1.5)
  role: UserRole;
  
  // Active context (Phase 4) - which context is currently active
  activeContext: ActiveContext;
  
  // Available organizations for context switcher
  availableOrgs: AvailableOrg[];
}

/**
 * Active context - what the user is currently operating as
 */
export interface ActiveContext {
  type: "personal" | "organization";
  organizationId?: string;
  orgRole?: OrgRole;
  plan: PlanType; // Effective plan (personal or org plan)
}

/**
 * Organization available for switching
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
    plan: PlanType;
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
