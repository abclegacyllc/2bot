/**
 * Admin API Guard Middleware
 * 
 * Restricts /admin/* API routes to only accept requests from admin.2bot.org.
 * This prevents any other frontend (dev.2bot.org, dash.2bot.org, etc.)
 * from calling admin API endpoints, even if they know the URL.
 * 
 * Security layers:
 * 1. Origin/Referer header check — only admin.2bot.org allowed
 * 2. Auth + role check — handled by requireAuth + requirePermission per route
 * 3. Nginx IP allowlist — configurable in nginx/2bot.conf (recommended)
 * 
 * @module server/middleware/admin-guard
 */

import { ForbiddenError } from "@/shared/errors";
import type { NextFunction, Request, Response } from "express";

/**
 * Allowed origins that can access admin API routes.
 * Only admin.2bot.org frontend should call these endpoints.
 */
const ALLOWED_ADMIN_ORIGINS = [
  'https://admin.2bot.org',
];

/**
 * In development, also allow localhost origins for testing
 */
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ADMIN_ORIGINS.push(
    'http://localhost:3007',
    'http://localhost:3005',  // dev frontend may need admin in dev
  );
}

/**
 * Check if a URL string matches any allowed admin origin
 */
function isAllowedAdminOrigin(url: string | undefined): boolean {
  if (!url) return false;
  return ALLOWED_ADMIN_ORIGINS.some(origin => url.startsWith(origin));
}

/**
 * Middleware that restricts access to admin API routes.
 * 
 * Checks the Origin header (for CORS requests) or Referer header
 * to ensure the request came from admin.2bot.org.
 * 
 * Usage in routes/index.ts:
 *   router.use("/admin", adminGuard, adminRouter);
 */
export function adminGuard(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // Check Origin first (set on CORS/fetch requests)
  if (isAllowedAdminOrigin(origin)) {
    return next();
  }

  // Fall back to Referer (set on same-origin navigations)
  if (isAllowedAdminOrigin(referer)) {
    return next();
  }

  // In development, be more permissive for curl/Postman/testing tools
  // (they won't have Origin or Referer headers)
  if (process.env.NODE_ENV !== 'production' && !origin && !referer) {
    return next();
  }

  throw new ForbiddenError(
    'Admin API access restricted. Requests must originate from admin.2bot.org'
  );
}
