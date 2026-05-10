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
 * Wave 1.2: this middleware is now mounted **globally** at the top of
 * the main API router, so every authenticated request that carries the
 * header has its membership verified before any route handler runs.
 * Without that, routes that read `req.headers["x-organization-id"]`
 * directly were trusting a user-controlled value (IDOR risk).
 *
 * Behaviour:
 *   - No `x-organization-id` header → noop, request continues in
 *     personal scope.
 *   - Header present + unauthenticated request → silently noop. The
 *     header has no meaning without an authenticated user; we don't
 *     reject the request because public routes (e.g. `/auth/login`)
 *     may legitimately receive forged headers from clients we don't
 *     control.
 *   - Header present + authenticated request → membership is required.
 *     A 403 is raised if the user is not an active member of the
 *     supplied org. The membership is attached to `req.orgMembership`.
 *
 * Idempotent: running this twice on the same request (e.g. once
 * globally and once per-router) is safe — the second call hits the
 * same membership row.
 *
 * @throws {403} authenticated user is not an active member of the org
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

    // Public routes may receive a forged header. The membership check
    // is only meaningful when we know who the caller is — silently
    // ignore the header for unauthenticated requests so we don't
    // block legitimate public traffic.
    if (!req.user) {
      next();
      return;
    }

    const membership = await organizationService.requireMembership(req.user.id, orgId);
    req.orgMembership = membership;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Wave 1.2: safe accessor for the `x-organization-id` header.
 *
 * Routes that scope work by the header (project, workflow, project-resource,
 * project-version, cursor-buildspec) used to read it directly. That worked
 * only as long as the route also mounted `requireOrgHeaderMembership` —
 * forgetting the mount silently turned the route into an IDOR.
 *
 * This helper makes the membership check a hard precondition: it returns
 * `undefined` when the header is absent (personal scope), the verified
 * orgId when the membership middleware has run, and throws otherwise. The
 * exception is loud and obvious so a missing middleware mount fails the
 * request instead of becoming a silent escalation.
 *
 * Usage in a route handler:
 *
 *   const orgId = getValidatedOrgId(req);
 *   const owner = orgId
 *     ? { kind: "ORG", id: orgId }
 *     : { kind: "USER", id: req.user!.id };
 */
export function getValidatedOrgId(req: Request): string | undefined {
  const raw = req.headers["x-organization-id"];
  const orgId = typeof raw === "string" ? raw.trim() : "";
  if (!orgId) return undefined;

  if (!req.orgMembership) {
    // Either the route forgot to mount requireOrgHeaderMembership, or the
    // middleware ran before req.user was populated (i.e. mounted in the
    // wrong order). Refuse the request rather than trusting the header.
    throw new ForbiddenError(
      "Organization membership not verified for this request",
    );
  }

  return orgId;
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
