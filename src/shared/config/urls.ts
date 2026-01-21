/**
 * URL Configuration for Enterprise Subdomain Support
 * 
 * Phase 6.7.5.2: Centralized URL configuration
 * 
 * This module provides environment-based URL configuration for all 2bot services.
 * Supports both single-domain (current) and multi-subdomain (enterprise) deployments.
 * 
 * @module shared/config/urls
 */

/**
 * Determine if we're running in a browser environment
 */
const isBrowser = typeof window !== 'undefined';

/**
 * Extended window interface for environment variables
 */
interface WindowWithEnv extends Window {
  __ENV__?: Record<string, string | undefined>;
}

/**
 * Get environment variable value (works in both Node.js and browser)
 */
function getEnvVar(name: string): string | undefined {
  if (isBrowser) {
    // In browser, only NEXT_PUBLIC_ vars are available
    const windowWithEnv = window as WindowWithEnv;
    return windowWithEnv.__ENV__?.[name];
  }
  return process.env[name];
}

/**
 * Check if we're in production mode
 */
function isProduction(): boolean {
  return getEnvVar('NODE_ENV') === 'production';
}

/**
 * Service URLs configuration
 * 
 * Port assignment:
 * - :3000 - Dashboard (Next.js main app)
 * - :3001 - API Server (Express)
 * - :3002 - Main/Landing site (static or minimal Next.js)
 * - :3003 - Admin panel
 * - :3004 - Support team dashboard (Phase 7)
 * - :3005 - Public documentation
 * - :3006 - Developer portal
 */
export const URLS = {
  /**
   * API Server (Express :3001)
   * In enterprise mode: api.2bot.org
   * In single-domain mode: 2bot.org/api (via proxy)
   */
  api: getEnvVar('NEXT_PUBLIC_API_URL') || 
       (isProduction() 
         ? 'https://api.2bot.org' 
         : 'http://localhost:3001'),
  
  /**
   * Dashboard (Next.js :3000)
   * Main application for authenticated users
   */
  dashboard: getEnvVar('NEXT_PUBLIC_DASHBOARD_URL') || 
             (isProduction() 
               ? 'https://dash.2bot.org' 
               : 'http://localhost:3000'),
  
  /**
   * Main site (:3002)
   * Landing pages, marketing, public content
   */
  main: getEnvVar('NEXT_PUBLIC_APP_URL') || 
        (isProduction() 
          ? 'https://2bot.org' 
          : 'http://localhost:3002'),
  
  /**
   * Admin panel (:3003)
   * Platform administration (ADMIN role only)
   */
  admin: getEnvVar('NEXT_PUBLIC_ADMIN_URL') || 
         (isProduction() 
           ? 'https://admin.2bot.org' 
           : 'http://localhost:3003'),
  
  /**
   * Support team dashboard (:3004) - Phase 7
   * Customer support and ticket management
   */
  support: getEnvVar('NEXT_PUBLIC_SUPPORT_URL') || 
           (isProduction() 
             ? 'https://support.2bot.org' 
             : 'http://localhost:3004'),
  
  /**
   * Public documentation (:3005)
   * API docs, guides, tutorials
   */
  docs: getEnvVar('NEXT_PUBLIC_DOCS_URL') || 
        (isProduction() 
          ? 'https://docs.2bot.org' 
          : 'http://localhost:3005'),
  
  /**
   * Developer portal (:3006)
   * Marketplace publishing, analytics, SDK downloads
   */
  dev: getEnvVar('NEXT_PUBLIC_DEV_URL') || 
       (isProduction() 
         ? 'https://dev.2bot.org' 
         : 'http://localhost:3006'),
} as const;

/**
 * Build API URL for a given path
 * 
 * @example
 * // In enterprise mode (api.2bot.org):
 * apiUrl('/user/gateways') → 'https://api.2bot.org/user/gateways'
 * 
 * // In single-domain mode with proxy:
 * apiUrl('/user/gateways') → 'http://localhost:3001/api/user/gateways'
 * 
 * @param path - API endpoint path (without /api prefix in enterprise mode)
 * @returns Full API URL
 */
export function apiUrl(path: string): string {
  const baseUrl = URLS.api;
  
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // In single-domain mode (localhost or non-api subdomain), add /api prefix
  const needsApiPrefix = baseUrl.includes('localhost') || 
                          (!baseUrl.includes('api.2bot.org') && !getEnvVar('ENTERPRISE_MODE'));
  
  if (needsApiPrefix) {
    return `${baseUrl}/api${normalizedPath}`;
  }
  
  // Enterprise mode: direct to api subdomain (no /api prefix needed)
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Build URL for a specific service
 * 
 * @example
 * serviceUrl('dashboard', '/settings') → 'https://dash.2bot.org/settings'
 * serviceUrl('admin', '/users') → 'https://admin.2bot.org/users'
 * 
 * @param service - Service name
 * @param path - Path within the service
 * @returns Full service URL
 */
export function serviceUrl(
  service: keyof typeof URLS,
  path: string = ''
): string {
  const baseUrl = URLS[service];
  const normalizedPath = path.startsWith('/') ? path : path ? `/${path}` : '';
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Check if running in enterprise subdomain mode
 */
export function isEnterpriseMode(): boolean {
  return Boolean(getEnvVar('ENTERPRISE_MODE')) || 
         Boolean(getEnvVar('NEXT_PUBLIC_API_URL')?.includes('api.2bot.org'));
}

/**
 * Get the current service based on hostname
 * Useful for analytics and logging
 */
export function getCurrentService(): keyof typeof URLS | 'unknown' {
  if (!isBrowser) return 'unknown';
  
  const hostname = window.location.hostname;
  
  if (hostname.includes('dash.')) return 'dashboard';
  if (hostname.includes('api.')) return 'api';
  if (hostname.includes('admin.')) return 'admin';
  if (hostname.includes('support.')) return 'support';
  if (hostname.includes('docs.')) return 'docs';
  if (hostname.includes('dev.')) return 'dev';
  if (hostname.includes('localhost')) {
    const port = window.location.port;
    switch (port) {
      case '3000': return 'dashboard';
      case '3001': return 'api';
      case '3002': return 'main';
      case '3003': return 'admin';
      case '3004': return 'support';
      case '3005': return 'docs';
      case '3006': return 'dev';
    }
  }
  return 'main';
}

/**
 * Subdomain to port mapping reference
 */
export const SUBDOMAIN_PORTS = {
  dashboard: 3000,
  api: 3001,
  main: 3002,
  admin: 3003,
  support: 3004,
  docs: 3005,
  dev: 3006,
} as const;

/**
 * Production subdomain mapping
 */
export const PRODUCTION_SUBDOMAINS = {
  dashboard: 'dash.2bot.org',
  api: 'api.2bot.org',
  main: '2bot.org',
  admin: 'admin.2bot.org',
  support: 'support.2bot.org',
  docs: 'docs.2bot.org',
  dev: 'dev.2bot.org',
} as const;
