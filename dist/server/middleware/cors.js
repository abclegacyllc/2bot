"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsOptions = void 0;
/**
 * Allowed origins for CORS
 *
 * Phase 6.9.1.1: Dual-mode CORS support
 * - Production: Only production origins (subdomains)
 * - Development: Includes localhost origins
 *
 * Supports both single-domain and multi-subdomain deployments.
 */
const isProduction = process.env.NODE_ENV === "production";
/**
 * Production origins (always included)
 */
const productionOrigins = [
    // Main Domain
    "https://2bot.org",
    "https://www.2bot.org",
    // Enterprise Subdomains
    "https://dash.2bot.org", // Dashboard (:3000)
    "https://api.2bot.org", // API (:3001) - for internal calls
    "https://admin.2bot.org", // Admin panel (:3003)
    "https://support.2bot.org", // Support team (:3004) - Phase 7
    "https://docs.2bot.org", // Documentation (:3005)
    "https://dev.2bot.org", // Developer portal (:3006)
];
/**
 * Development origins (only in development mode)
 */
const developmentOrigins = [
    "http://localhost:3000", // Dashboard (Next.js)
    "http://localhost:3001", // API (Express)
    "http://localhost:3002", // Main/Landing site
    "http://localhost:3003", // Admin panel
    "http://localhost:3004", // Support team (Phase 7)
    "http://localhost:3005", // Documentation
    "http://localhost:3006", // Developer portal
];
/**
 * Build allowed origins based on environment
 */
const allowedOrigins = [
    // Always include production origins
    ...productionOrigins,
    // Only include localhost in development
    ...(isProduction ? [] : developmentOrigins),
    // Environment-configured URLs (dynamic)
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_DASHBOARD_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
    process.env.NEXT_PUBLIC_SUPPORT_URL,
    process.env.NEXT_PUBLIC_DOCS_URL,
    process.env.NEXT_PUBLIC_DEV_URL,
].filter(Boolean);
/**
 * Parse CORS_ORIGINS environment variable (comma-separated list)
 * This allows runtime configuration without code changes
 */
function getAdditionalOrigins() {
    const corsOrigins = process.env.CORS_ORIGINS;
    if (!corsOrigins)
        return [];
    return corsOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
}
/**
 * Get all allowed origins (static + dynamic)
 */
function getAllowedOrigins() {
    return [...new Set([...allowedOrigins, ...getAdditionalOrigins()])];
}
/**
 * CORS configuration
 *
 * Supports:
 * - Static allowed origins (hardcoded for known domains)
 * - Environment variable configured origins
 * - CORS_ORIGINS runtime configuration (comma-separated)
 * - Development mode allows all origins
 */
exports.corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) {
            callback(null, true);
            return;
        }
        const origins = getAllowedOrigins();
        if (origins.includes(origin)) {
            callback(null, true);
        }
        else if (process.env.NODE_ENV === "development") {
            // Allow all origins in development
            callback(null, true);
        }
        else {
            console.log(`CORS blocked origin: ${origin}`);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Deprecation", "Sunset", "Link"],
    maxAge: 86400, // 24 hours
};
//# sourceMappingURL=cors.js.map