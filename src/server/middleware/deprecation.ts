/**
 * Deprecation Middleware
 *
 * Middleware for marking endpoints as deprecated with proper logging
 * and HTTP headers. Helps migrate clients from old endpoints to new
 * URL-based patterns (GitHub-style).
 *
 * @module server/middleware/deprecation
 */

import { logger } from "@/lib/logger";
import type { NextFunction, Request, Response } from "express";

const deprecationLogger = logger.child({ module: "deprecation" });

/**
 * Create deprecation middleware for a route
 *
 * Adds deprecation warnings:
 * - Logs warning with old/new paths
 * - Sets Deprecation HTTP header
 * - Sets Link header with successor URL
 *
 * @param newPath - The new endpoint path (can include :params)
 * @param options - Additional options
 * @returns Express middleware
 *
 * @example
 * // Mark old endpoint as deprecated
 * router.get("/gateways", deprecated("/api/user/gateways or /api/orgs/:orgId/gateways"), ...);
 */
export function deprecated(
  newPath: string,
  options?: {
    /** When deprecation will be removed (ISO date string) */
    sunset?: string;
    /** Additional message for logs */
    message?: string;
  }
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Log deprecation warning
    deprecationLogger.warn(
      {
        oldPath: req.originalUrl,
        newPath,
        method: req.method,
        userId: req.user?.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        sunset: options?.sunset,
      },
      `Deprecated endpoint used: ${req.method} ${req.originalUrl} -> ${newPath}`
    );

    // Set Deprecation header (RFC 8594)
    res.set("Deprecation", "true");

    // Set Link header with successor (RFC 8288)
    res.set("Link", `<${newPath}>; rel="successor-version"`);

    // Set Sunset header if date provided (RFC 8594)
    if (options?.sunset) {
      res.set("Sunset", options.sunset);
    }

    // Add deprecation warning to response (non-blocking)
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      if (body && typeof body === "object" && "success" in body) {
        const response = body as Record<string, unknown>;
        response._deprecation = {
          warning: "This endpoint is deprecated",
          newEndpoint: newPath,
          ...(options?.sunset && { sunsetDate: options.sunset }),
          ...(options?.message && { message: options.message }),
        };
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Migration guide helper
 *
 * Returns information about old vs new endpoint patterns
 */
export const ENDPOINT_MIGRATIONS = {
  // Gateway routes
  "GET /api/gateways": {
    personal: "GET /api/user/gateways",
    organization: "GET /api/orgs/:orgId/gateways",
    description: "Gateway list - use /api/user/* for personal, /api/orgs/:orgId/* for organization",
  },

  // Plugin routes
  "GET /api/plugins/user/plugins": {
    personal: "GET /api/user/plugins",
    organization: "GET /api/orgs/:orgId/plugins",
    description: "User plugins - use URL-based routes instead of context-based",
  },

  // Quota routes
  "GET /api/quota/status": {
    personal: "GET /api/user/quota",
    organization: "GET /api/orgs/:orgId/quota",
    description: "Quota status - specify context in URL",
  },

  // Organization routes
  "GET /api/organizations/me": {
    replacement: "GET /api/user/organizations",
    description: "User's organizations - moved to /api/user/*",
  },

  // Department routes
  "GET /api/organizations/departments/:id": {
    replacement: "GET /api/orgs/:orgId/departments/:deptId",
    description: "Department by ID - include orgId in URL path",
  },
} as const;

/**
 * Get migration info for an endpoint
 */
export function getMigrationInfo(oldEndpoint: string): {
  newEndpoint: string;
  description: string;
} | null {
  const migration = ENDPOINT_MIGRATIONS[oldEndpoint as keyof typeof ENDPOINT_MIGRATIONS];
  if (!migration) return null;

  if ("replacement" in migration) {
    return {
      newEndpoint: migration.replacement,
      description: migration.description,
    };
  }

  return {
    newEndpoint: `${migration.personal} or ${migration.organization}`,
    description: migration.description,
  };
}
