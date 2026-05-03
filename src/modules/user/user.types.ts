/**
 * User Module — Type Definitions
 *
 * Centralized types for user-related data passed between modules.
 *
 * @module modules/user/user.types
 */

import type { PlanType, User, UserRole } from "@prisma/client";

// Re-export Prisma types for convenience
export type { PlanType, User, UserRole };

/** Lightweight user context for system prompt injection and feature gating */
export interface UserContext {
  plan: string;
  credits?: number;
  gatewayCount: number;
  pluginCount: number;
  workspaceRunning: boolean;
}

/** User with plan information */
export interface UserWithPlan {
  id: string;
  plan: PlanType;
  email: string;
  name: string | null;
  aiRoutingPreference: string;
}
