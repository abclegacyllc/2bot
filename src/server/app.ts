import { loggers } from "@/lib/logger";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { corsOptions } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { pinoHttpMiddleware } from "./middleware/request-logger";
import { router } from "./routes";
import stripeWebhookRouter from "./routes/stripe-webhook";

const serverLogger = loggers.server;

/**
 * API prefix for routes
 * 
 * Phase 6.7.5.3: Configurable API prefix
 * 
 * - Single-domain mode: API_PREFIX="/api" (default)
 *   Routes at: 2bot.org/api/user/gateways
 * 
 * - Enterprise subdomain mode: API_PREFIX=""
 *   Routes at: api.2bot.org/user/gateways
 * 
 * Set API_PREFIX="" in environment for subdomain deployment
 */
const API_PREFIX = process.env.API_PREFIX ?? "/api";

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors(corsOptions));

  // Stripe webhook needs raw body for signature verification
  // Must be registered BEFORE express.json()
  // Support both /api/webhooks/stripe and /webhooks/stripe (enterprise mode)
  const stripeWebhookPath = API_PREFIX ? `${API_PREFIX}/webhooks/stripe` : "/webhooks/stripe";
  app.use(
    stripeWebhookPath,
    express.raw({ type: "application/json" }),
    stripeWebhookRouter
  );

  // Body parsing
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Request logging with Pino
  app.use(pinoHttpMiddleware);

  // Rate limiting (apply early to protect all routes)
  app.use(rateLimitMiddleware());

  // API routes
  // Phase 6.7.5.3: Support configurable prefix
  // When API_PREFIX="" (enterprise), routes are at root
  // When API_PREFIX="/api" (default), routes are at /api
  if (API_PREFIX) {
    app.use(API_PREFIX, router);
  } else {
    app.use(router);
  }

  // Log configured prefix
  serverLogger.info({ apiPrefix: API_PREFIX || "(root)" }, "API routes configured");

  // Error handling (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Server configuration
 */
export const SERVER_CONFIG = {
  port: parseInt(process.env.SERVER_PORT || "3001", 10),
  host: process.env.SERVER_HOST || "0.0.0.0",
  apiPrefix: API_PREFIX,
};

/**
 * Start the Express server
 */
export function startServer(app: Express): void {
  const { port, host, apiPrefix } = SERVER_CONFIG;
  const healthPath = apiPrefix ? `${apiPrefix}/health` : "/health";

  app.listen(port, host, () => {
    serverLogger.info({ port, host }, `🚀 Express API server running on http://${host}:${port}`);
    serverLogger.info(`   Health check: http://${host}:${port}${healthPath}`);
    if (!apiPrefix) {
      serverLogger.info(`   Enterprise mode: Routes at root (no /api prefix)`);
    }
  });
}

// Export for use in custom server
export { createApp as default };
