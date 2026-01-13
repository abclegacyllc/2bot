import type { PlanType, Session, User, UserRole, OrgRole } from "@prisma/client";

// Re-export Prisma types
export type { PlanType, Session, User, UserRole, OrgRole } from "@prisma/client";

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
 */
export interface TokenPayload {
  userId: string;
  email: string;
  plan: PlanType;
  sessionId: string;
  
  // Role fields (Phase 1.5)
  role: UserRole;
  organizationId?: string;
  orgRole?: OrgRole;
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
