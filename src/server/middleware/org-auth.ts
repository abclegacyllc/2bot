/**
 * Organization Auth Middleware
 *
 * Middleware for validating organization membership and roles.
 * Used by /api/orgs/:orgId/* routes.
 *
 * @module server/middleware/org-auth
 */

import { organizationService } from "@/modules/organization";
import { BadRequestError, ForbiddenError } from "@/shared/errors";
import type { MembershipStatus, OrgRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

/**
 * Extend Express Request to include org membership info
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      orgMembership?: {
        id: string;
        role: OrgRole;
        status: MembershipStatus;
      };
    }
  }
}

/**
 * Extract orgId from URL params
 */
function getOrgId(req: Request): string {
  const orgId = req.params.orgId;
  if (typeof orgId !== "string" || !orgId) {
    throw new BadRequestError("Missing organization ID in URL");
  }
  return orgId;
}

/**
 * Middleware to validate org membership
 * 
 * Extracts orgId from URL params and validates user has active membership.
 * Attaches membership info to req.orgMembership.
 *
 * @throws {401} If user not authenticated
 * @throws {403} If user is not a member of the organization
 *
 * @example
 * router.get("/:orgId/gateways", requireOrgMember, handler);
 */
export async function requireOrgMember(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new ForbiddenError("Authentication required");
    }

    const orgId = getOrgId(req);
    const userId = req.user.id;

    // Check membership using organization service
    // This throws ForbiddenError if not a member
    const membership = await organizationService.requireMembership(userId, orgId);

    // Attach membership to request for downstream use
    req.orgMembership = membership;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require org admin role
 * 
 * Validates user is authenticated AND has ADMIN or OWNER role in the org.
 *
 * @throws {401} If user not authenticated
 * @throws {403} If user is not an admin of the organization
 *
 * @example
 * router.post("/:orgId/settings", requireOrgAdmin, handler);
 */
export async function requireOrgAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new ForbiddenError("Authentication required");
    }

    const orgId = getOrgId(req);
    const userId = req.user.id;

    // Check membership with ADMIN minimum role
    // This throws ForbiddenError if not admin
    const membership = await organizationService.requireMembership(
      userId,
      orgId,
      "ORG_ADMIN"
    );

    req.orgMembership = membership;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware that validates the optional `x-organization-id` header.
 *
 * Routes that use header-based org scoping (`/api/projects`, `/api/workflows`,
 * `/api/project-resources`, `/api/project-versions`, `/api/cursor/buildspec`) accept
 * an `x-organization-id` header to scope queries and writes to an organization.
 * Without this check a caller could pass any orgId, causing service-layer
 * writes (project creation, workflow apply, credit usage) to be tagged to an
 * organization the caller is not a member of.
 *
 * If the header is absent the request proceeds in personal scope.
 * If the header is present, active membership is required.
 *
 * @throws {403} If the user is not an active member of the supplied org
 */
export async function requireOrgHeaderMembership(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const raw = req.headers["x-organization-id"];
    const orgId = typeof raw === "string" ? raw.trim() : "";
    if (!orgId) {
      next();
      return;
    }

    if (!req.user) {
      throw new ForbiddenError("Authentication required");
    }

    const membership = await organizationService.requireMembership(req.user.id, orgId);
    req.orgMembership = membership;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require org owner role
 *
 * Validates user is authenticated AND is the OWNER of the org.
 *
 * @throws {401} If user not authenticated
 * @throws {403} If user is not the owner of the organization
 *
 * @example
 * router.delete("/:orgId", requireOrgOwner, handler);
 */
export async function requireOrgOwner(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new ForbiddenError("Authentication required");
    }

    const orgId = getOrgId(req);
    const userId = req.user.id;

    // Check membership with OWNER minimum role
    const membership = await organizationService.requireMembership(
      userId,
      orgId,
      "ORG_OWNER"
    );

    req.orgMembership = membership;

    next();
  } catch (error) {
    next(error);
  }
}
