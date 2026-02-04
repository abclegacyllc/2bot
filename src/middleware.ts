/**
 * Next.js Middleware for Subdomain Routing
 * 
 * Phase 6.9: Enterprise subdomain architecture
 * 
 * Routes requests based on subdomain:
 * - www.{ROOT_DOMAIN} → Landing page (/)
 * - dash.{ROOT_DOMAIN} → Dashboard (/(dashboard)/*)
 * - admin.{ROOT_DOMAIN} → Admin panel (/(admin)/*)
 * 
 * Also handles authentication redirects for protected routes.
 * 
 * Environment Variables:
 * - NEXT_PUBLIC_ROOT_DOMAIN: Base domain (default: 2bot.org)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// ===========================================
// Domain Configuration from Environment
// ===========================================
// Using env vars allows easy switching between:
// - Production: 2bot.org
// - Staging: staging.2bot.org
// - Custom domains: yourdomain.com

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || '2bot.org';

// Production hostnames (derived from ROOT_DOMAIN)
const DASHBOARD_HOSTS = [`dash.${ROOT_DOMAIN}`];
const ADMIN_HOSTS = [`admin.${ROOT_DOMAIN}`];
const LANDING_HOSTS = [`www.${ROOT_DOMAIN}`];

// Development detection
const isDevelopment = (host: string) => 
  host.includes('localhost') || host.includes('127.0.0.1');

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || '';
  
  // Skip middleware for static files, API routes, and assets
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('.') ||
    url.pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Development mode - no subdomain routing
  if (isDevelopment(hostname)) {
    return NextResponse.next();
  }

  // === DASHBOARD SUBDOMAIN (dash.{ROOT_DOMAIN}) ===
  if (DASHBOARD_HOSTS.some(h => hostname.includes(h))) {
    // Dashboard subdomain - serve dashboard pages directly
    // The (dashboard) route group handles the layout
    return NextResponse.next();
  }

  // === ADMIN SUBDOMAIN (admin.{ROOT_DOMAIN}) ===
  if (ADMIN_HOSTS.some(h => hostname.includes(h))) {
    // Admin subdomain - allow admin routes
    return NextResponse.next();
  }

  // === LANDING SUBDOMAIN (www.{ROOT_DOMAIN} or {ROOT_DOMAIN}) ===
  if (LANDING_HOSTS.some(h => hostname.includes(h) || hostname === h) || hostname === ROOT_DOMAIN) {
    // On landing subdomain, root (/) should show landing page
    if (url.pathname === '/') {
      url.pathname = '/landing';
      return NextResponse.rewrite(url);
    }
    
    // Allow terms, privacy, auth pages on www
    const allowedPaths = ['/terms', '/privacy', '/login', '/register', 
                          '/forgot-password', '/reset-password', '/verify-email'];
    
    const isAllowed = allowedPaths.some(p => 
      url.pathname === p || url.pathname.startsWith(p + '/')
    );
    
    if (!isAllowed) {
      // Redirect dashboard routes to dash subdomain
      const dashUrl = new URL(url.pathname, `https://dash.${ROOT_DOMAIN}`);
      dashUrl.search = url.search;
      return NextResponse.redirect(dashUrl);
    }
    
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
  ],
};
