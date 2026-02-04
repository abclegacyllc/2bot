import type { CorsOptions } from "cors";

/**
 * Allowed origins for CORS
 * 
 * Phase 6.9.1.1: Dual-mode CORS support
 * - Production: Only production origins (subdomains)
 * - Development: Includes localhost origins
 * 
 * Supports both single-domain and multi-subdomain deployments.
 * Uses ROOT_DOMAIN environment variable for flexibility.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Get root domain from environment (allows staging/custom domains)
 */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "2bot.org";

/**
 * Production origins (dynamically generated from ROOT_DOMAIN)
 */
const productionOrigins = [
  // Main Domain
  `https://${ROOT_DOMAIN}`,
  `https://www.${ROOT_DOMAIN}`,
  
  // Enterprise Subdomains
  `https://dash.${ROOT_DOMAIN}`,     // Dashboard (:3000)
  `https://api.${ROOT_DOMAIN}`,      // API (:3001) - for internal calls
  `https://admin.${ROOT_DOMAIN}`,    // Admin panel (:3003)
  `https://support.${ROOT_DOMAIN}`,  // Support team (:3004) - Phase 7
  `https://docs.${ROOT_DOMAIN}`,     // Documentation (:3005)
  `https://dev.${ROOT_DOMAIN}`,      // Developer portal (:3006)
];

/**
 * Development origins (only in development mode)
 */
const developmentOrigins = [
  "http://localhost:3000",   // Dashboard (Next.js)
  "http://localhost:3001",   // API (Express)
  "http://localhost:3002",   // Main/Landing site
  "http://localhost:3003",   // Admin panel
  "http://localhost:3004",   // Support team (Phase 7)
  "http://localhost:3005",   // Documentation
  "http://localhost:3006",   // Developer portal
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
].filter(Boolean) as string[];

/**
 * Parse CORS_ORIGINS environment variable (comma-separated list)
 * This allows runtime configuration without code changes
 */
function getAdditionalOrigins(): string[] {
  const corsOrigins = process.env.CORS_ORIGINS;
  if (!corsOrigins) return [];
  return corsOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
}

/**
 * Get all allowed origins (static + dynamic)
 */
function getAllowedOrigins(): string[] {
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
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    const origins = getAllowedOrigins();
    
    if (origins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV === "development") {
      // Allow all origins in development
      callback(null, true);
    } else {
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
