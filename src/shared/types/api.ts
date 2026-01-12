// API-specific type definitions

import type { NextRequest } from "next/server";

/**
 * Authenticated request with user context
 */
export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    email: string;
  };
}

/**
 * API route handler context
 */
export interface RouteContext {
  params: Promise<Record<string, string>>;
}
