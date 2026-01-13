/**
 * Auth Module
 *
 * Exports all authentication-related components.
 *
 * @module modules/auth
 */

export const AUTH_MODULE = "auth" as const;

// Service
export { AuthError, AuthService, authService } from "./auth.service";
export type { AuthErrorCode, SessionMeta } from "./auth.service";

// Types
export * from "./auth.types";

// Validation schemas
export * from "./auth.validation";

// Placeholder - routes will be added in task 1.3.x
// export * from "./auth.routes";
