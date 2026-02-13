/**
 * URL Configuration for 2Bot.org Subdomain Architecture
 * 
 * All services use *.2bot.org subdomains. The server is remote —
 * localhost is NEVER used by frontend or API redirect URLs.
 * Localhost ports are only used internally by nginx reverse proxy on the server.
 * 
 * Architecture (nginx internal proxy):
 *   api.2bot.org     → :3002 (production API)
 *   dev-api.2bot.org → :3006 (development/admin API)
 *   dash.2bot.org    → :3001 (dashboard)
 *   www.2bot.org     → :3000 (landing/marketing)
 *   dev.2bot.org     → :3005 (dev frontend)
 *   admin.2bot.org   → :3007 (admin panel)
 *   docs.2bot.org    → :3003 (documentation)
 *   support.2bot.org → :3008 (support dashboard)
 * 
 * @module shared/config/urls
 */

/**
 * Check if running in browser environment
 */
const isBrowser = typeof globalThis !== 'undefined' && 'window' in globalThis;

/**
 * Service URLs configuration
 * 
 * All URLs point to *.2bot.org subdomains.
 * Environment variables can override for custom domain deployments.
 */
export const URLS = {
  /** Production API: api.2bot.org (nginx → :3002) */
  api: process.env.NEXT_PUBLIC_API_URL || 'https://api.2bot.org',
  
  /** Dashboard: dash.2bot.org (nginx → :3001) */
  dashboard: process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://dash.2bot.org',
  
  /** Landing/Marketing: www.2bot.org (nginx → :3000) */
  main: process.env.NEXT_PUBLIC_APP_URL || 'https://www.2bot.org',
  
  /** Admin panel: admin.2bot.org (nginx → :3007) */
  admin: process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.2bot.org',
  
  /** Admin/Dev API: dev-api.2bot.org (nginx → :3006) */
  adminApi: process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://dev-api.2bot.org',
  
  /** Support dashboard: support.2bot.org (nginx → :3008) */
  support: process.env.NEXT_PUBLIC_SUPPORT_URL || 'https://support.2bot.org',
  
  /** Documentation: docs.2bot.org (nginx → :3003) */
  docs: process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.2bot.org',
  
  /** Dev frontend: dev.2bot.org (nginx → :3005) */
  dev: process.env.NEXT_PUBLIC_DEV_URL || 'https://dev.2bot.org',
} as const;

/**
 * Build API URL for a given path
 * 
 * Always uses api.2bot.org (production API).
 * 
 * @example
 * apiUrl('/user/gateways') → 'https://api.2bot.org/user/gateways'
 * 
 * @param path - API endpoint path (e.g., '/user/gateways')
 * @returns Full API URL
 */
export function apiUrl(path: string): string {
  const baseUrl = URLS.api.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Build Admin API URL for a given path
 * 
 * Admin API uses dev-api.2bot.org (not production api.2bot.org).
 * Admin routes are mounted under /admin prefix on the dev API server.
 * 
 * @example
 * adminApiUrl('/users') → 'https://dev-api.2bot.org/admin/users'
 * adminApiUrl('/stats') → 'https://dev-api.2bot.org/admin/stats'
 * 
 * @param path - API endpoint path (e.g., '/users', '/stats')
 * @returns Full Admin API URL with /admin prefix
 */
export function adminApiUrl(path: string): string {
  const baseUrl = URLS.adminApi.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}/admin${normalizedPath}`;
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
 * Check if running in production environment
 * @deprecated All environments use production subdomains now
 */
export function isEnterpriseMode(): boolean {
  return true;
}

/**
 * Get the current service based on hostname
 * Useful for analytics and logging
 */
export function getCurrentService(): keyof typeof URLS | 'unknown' {
  if (!isBrowser) return 'unknown';
  
  const win = (globalThis as Record<string, unknown>).window as { location: { hostname: string; port: string } };
  const hostname = win.location.hostname;
  
  if (hostname.includes('dash.')) return 'dashboard';
  if (hostname.includes('dev-api.')) return 'adminApi';
  if (hostname.includes('api.')) return 'api';
  if (hostname.includes('admin.')) return 'admin';
  if (hostname.includes('support.')) return 'support';
  if (hostname.includes('docs.')) return 'docs';
  if (hostname.includes('dev.')) return 'dev';
  return 'main';
}

/**
 * Subdomain to port mapping reference
 */
export const SUBDOMAIN_PORTS = {
  main: 3000,
  dashboard: 3001,
  api: 3002,
  docs: 3003,
  dev: 3005,
  admin: 3007,
  support: 3008,
} as const;

/**
 * Production subdomain mapping
 */
export const PRODUCTION_SUBDOMAINS = {
  dashboard: 'dash.2bot.org',
  api: 'api.2bot.org',
  main: 'www.2bot.org',
  admin: 'admin.2bot.org',
  support: 'support.2bot.org',
  docs: 'docs.2bot.org',
  dev: 'dev.2bot.org',
} as const;
