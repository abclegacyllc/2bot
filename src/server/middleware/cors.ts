import type { CorsOptions } from "cors";

/**
 * Allowed origins for CORS
 * 
 * Dual-mode CORS support
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
  `https://dash.${ROOT_DOMAIN}`,      // Dashboard (:3001)
  `https://api.${ROOT_DOMAIN}`,       // API (:3002)
  `https://admin.${ROOT_DOMAIN}`,     // Admin panel (:3007)
  `https://support.${ROOT_DOMAIN}`,   // Support team (:3008)
  `https://docs.${ROOT_DOMAIN}`,      // Documentation (:3003)
  `https://dev.${ROOT_DOMAIN}`,       // Dev frontend (:3005)
  `https://dev-api.${ROOT_DOMAIN}`,   // Dev API (:3006)
];

/**
 * Development origins (only in development mode)
 */
const developmentOrigins = [
  "http://localhost:3000",   // Landing/Main site
  "http://localhost:3001",   // Dashboard (Next.js prod)
  "http://localhost:3002",   // API (Express prod)
  "http://localhost:3003",   // Documentation
  "http://localhost:3005",   // Dev Frontend (Next.js)
  "http://localhost:3006",   // Dev API (Express)
  "http://localhost:3007",   // Admin panel
  "http://localhost:3008",   // Support team
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
 * Parse a comma-separated origin list from an env var.
 */
function parseOriginList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Additional origins from runtime env vars. CORS_ORIGINS applies to all
 * environments; DEV_ALLOWED_ORIGINS only applies outside production
 * (use it for tunnel URLs, codespaces, etc).
 */
function getAdditionalOrigins(): string[] {
  const extra = parseOriginList(process.env.CORS_ORIGINS);
  if (!isProduction) {
    extra.push(...parseOriginList(process.env.DEV_ALLOWED_ORIGINS));
  }
  return extra;
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
 *
 * Both production and development use a strict allow-list. To add an
 * extra dev origin (e.g. a tunneled URL), set DEV_ALLOWED_ORIGINS or
 * CORS_ORIGINS — never an unconditional allow-all.
 */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server).
    if (!origin) {
      callback(null, true);
      return;
    }

    const origins = getAllowedOrigins();
    if (origins.includes(origin)) {
      callback(null, true);
      return;
    }

    console.warn(`CORS blocked origin: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposedHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Deprecation", "Sunset", "Link"],
  maxAge: 86400, // 24 hours
};
