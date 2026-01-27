"use strict";
/**
 * URL Configuration for Enterprise Subdomain Support
 *
 * Phase 6.9.1.2: Dual-mode URL configuration
 *
 * - Production: Defaults to enterprise subdomains (api.2bot.org, dash.2bot.org, etc.)
 * - Development: Defaults to localhost ports (3000, 3001, etc.)
 *
 * This module provides environment-based URL configuration for all 2bot services.
 * Supports both single-domain (legacy) and multi-subdomain (enterprise) deployments.
 *
 * @module shared/config/urls
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRODUCTION_SUBDOMAINS = exports.SUBDOMAIN_PORTS = exports.URLS = void 0;
exports.apiUrl = apiUrl;
exports.serviceUrl = serviceUrl;
exports.isEnterpriseMode = isEnterpriseMode;
exports.getCurrentService = getCurrentService;
/**
 * Check if we're in production mode
 *
 * IMPORTANT: Next.js requires direct access to process.env.NEXT_PUBLIC_*
 * for client-side code. Using a function to wrap it won't work.
 */
const isProduction = process.env.NODE_ENV === 'production';
/**
 * Check if running in browser environment
 */
const isBrowser = typeof window !== 'undefined';
/**
 * Service URLs configuration
 *
 * IMPORTANT: We must use process.env.NEXT_PUBLIC_* directly (not through a function)
 * because Next.js inlines these at build time by looking for literal references.
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
exports.URLS = {
    /**
     * API Server (Express :3001)
     * In enterprise mode: api.2bot.org
     * In single-domain mode: 2bot.org/api (via proxy)
     */
    api: process.env.NEXT_PUBLIC_API_URL ||
        (isProduction
            ? 'https://api.2bot.org'
            : 'http://localhost:3001'),
    /**
     * Dashboard (Next.js :3000)
     * Main application for authenticated users
     */
    dashboard: process.env.NEXT_PUBLIC_DASHBOARD_URL ||
        (isProduction
            ? 'https://dash.2bot.org'
            : 'http://localhost:3000'),
    /**
     * Main site (:3002)
     * Landing pages, marketing, public content
     */
    main: process.env.NEXT_PUBLIC_APP_URL ||
        (isProduction
            ? 'https://www.2bot.org'
            : 'http://localhost:3002'),
    /**
     * Admin panel (:3003)
     * Platform administration (ADMIN role only)
     */
    admin: process.env.NEXT_PUBLIC_ADMIN_URL ||
        (isProduction
            ? 'https://admin.2bot.org'
            : 'http://localhost:3003'),
    /**
     * Support team dashboard (:3004) - Phase 7
     * Customer support and ticket management
     */
    support: process.env.NEXT_PUBLIC_SUPPORT_URL ||
        (isProduction
            ? 'https://support.2bot.org'
            : 'http://localhost:3004'),
    /**
     * Public documentation (:3005)
     * API docs, guides, tutorials
     */
    docs: process.env.NEXT_PUBLIC_DOCS_URL ||
        (isProduction
            ? 'https://docs.2bot.org'
            : 'http://localhost:3005'),
    /**
     * Developer portal (:3006)
     * Marketplace publishing, analytics, SDK downloads
     */
    dev: process.env.NEXT_PUBLIC_DEV_URL ||
        (isProduction
            ? 'https://dev.2bot.org'
            : 'http://localhost:3006'),
};
/**
 * Build API URL for a given path
 *
 * Production-like development: Same URL structure in dev and prod.
 * Only the base URL differs (localhost:3001 vs api.2bot.org).
 *
 * @example
 * // Development:
 * apiUrl('/user/gateways') → 'http://localhost:3001/user/gateways'
 *
 * // Production:
 * apiUrl('/user/gateways') → 'https://api.2bot.org/user/gateways'
 *
 * @param path - API endpoint path (e.g., '/user/gateways')
 * @returns Full API URL
 */
function apiUrl(path) {
    const baseUrl = exports.URLS.api.replace(/\/$/, ''); // Remove trailing slash
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
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
function serviceUrl(service, path = '') {
    const baseUrl = exports.URLS[service];
    const normalizedPath = path.startsWith('/') ? path : path ? `/${path}` : '';
    return `${baseUrl}${normalizedPath}`;
}
/**
 * Check if running in production environment
 * @deprecated Use isProduction constant instead - no longer need "enterprise mode" distinction
 */
function isEnterpriseMode() {
    return isProduction;
}
/**
 * Get the current service based on hostname
 * Useful for analytics and logging
 */
function getCurrentService() {
    if (!isBrowser)
        return 'unknown';
    const win = globalThis.window;
    const hostname = win.location.hostname;
    if (hostname.includes('dash.'))
        return 'dashboard';
    if (hostname.includes('api.'))
        return 'api';
    if (hostname.includes('admin.'))
        return 'admin';
    if (hostname.includes('support.'))
        return 'support';
    if (hostname.includes('docs.'))
        return 'docs';
    if (hostname.includes('dev.'))
        return 'dev';
    if (hostname.includes('localhost')) {
        const port = win.location.port;
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
exports.SUBDOMAIN_PORTS = {
    dashboard: 3000,
    api: 3001,
    main: 3002,
    admin: 3003,
    support: 3004,
    docs: 3005,
    dev: 3006,
};
/**
 * Production subdomain mapping
 */
exports.PRODUCTION_SUBDOMAINS = {
    dashboard: 'dash.2bot.org',
    api: 'api.2bot.org',
    main: 'www.2bot.org',
    admin: 'admin.2bot.org',
    support: 'support.2bot.org',
    docs: 'docs.2bot.org',
    dev: 'dev.2bot.org',
};
//# sourceMappingURL=urls.js.map