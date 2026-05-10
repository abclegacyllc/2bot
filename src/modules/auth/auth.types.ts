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
 * Simplified for architecture - context determined by URL, not token
 */
export interface TokenPayload {
  userId: string;
  email: string;
  plan: PlanType;      // User's personal plan
  sessionId: string;

  // Role fields - platform role
  role: UserRole;

  // Wave 2.1 — true when this token was issued *after* a successful TOTP
  // verification (or the user simply has no MFA enrolled). Routes that
  // require step-up auth check this flag.
  mfa?: boolean;

  // activeContext and availableOrgs REMOVED
  // - Context is determined by URL (/api/user/* vs /api/orgs/:orgId/*)
  // - Organizations are fetched via /api/user/organizations
}

/**
 * Wave 2.1 — short-lived bearer used between password-OK and TOTP-OK.
 *
 * Flow:
 *   1. POST /auth/login with email+password.
 *   2. If the user has MFA enabled, response is `{ mfaRequired: true,
 *      mfaToken, expiresAt }` instead of a normal session.
 *   3. Client posts mfaToken + 6-digit code to POST /auth/mfa/challenge
 *      to exchange it for a real session.
 *
 * The challenge token uses a different JWT audience so it cannot be
 * accidentally accepted by `verifyToken` and used as a real session.
 */
export interface MfaChallengePayload {
  userId: string;
  /** Pre-allocated session id; gets attached to a Session row only after challenge passes. */
  sessionId: string;
  /** Tags this token as a challenge — sanity check on top of audience. */
  scope: "mfa-challenge";
}

/**
 * Active context - what the user is currently operating as
 * Now UI-only, not stored in token
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
 * Now fetched from API, not stored in token
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
 * Context switching request
 */
export interface SwitchContextRequest {
  contextType: "personal" | "organization";
  organizationId?: string; // Required if contextType === 'organization'
}

/**
 * Context switching response
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

/**
 * Wave 2.1 — returned from POST /auth/login when the user has MFA enabled.
 * The client must call POST /auth/mfa/challenge with `mfaToken` plus a
 * 6-digit TOTP code (or a recovery code) to obtain a normal `AuthResponse`.
 */
export interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
  expiresAt: string;
}

/** Discriminated union returned by `authService.login`. */
export type LoginResult = AuthResponse | MfaChallengeResponse;

/** Type guard so route handlers can branch on the union. */
export function isMfaChallenge(result: LoginResult): result is MfaChallengeResponse {
  return (result as MfaChallengeResponse).mfaRequired === true;
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
