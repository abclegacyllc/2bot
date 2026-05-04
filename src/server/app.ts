import { loggers } from "@/lib/logger";
import { metricsHandler } from "@/lib/metrics";
import { initializeProviderHealth } from "@/modules/2bot-ai-provider/provider-health.service";
import { BUILTIN_PLUGINS } from "@/modules/plugin/handlers";
import { registerPlugin } from "@/modules/plugin/plugin.executor";
import { initializeScheduleTick } from "@/modules/project-resource/schedule-tick.service";
import { workflowService } from "@/modules/workflow/workflow.service";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { initializeBridgeTokenRotationCron } from "./cron/bridge-token-rotation-cron";
import { initializeCreditCron } from "./cron/credit-cron";
import { initializeHealthMonitorCron } from "./cron/health-monitor-cron";
import { initializePluginReconcileCron } from "./cron/plugin-reconcile-cron";
import { initializePricingMonitorCron } from "./cron/pricing-monitor-cron";
import { initializeRunRetentionCron } from "./cron/run-retention-cron";
import { corsOptions } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { metricsMiddleware } from "./middleware/metrics";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { pinoHttpMiddleware } from "./middleware/request-logger";
import { router } from "./routes";
import { internalRouter } from "./routes/internal";
import { internalCostRouter } from "./routes/internal-cost";
import stripeWebhookRouter from "./routes/stripe-webhook";

const serverLogger = loggers.server;

/**
 * API prefix for routes
 * 
 * Production-like development (no prefix)
 * 
 * Both development and production use the same URL structure:
 * - Dev:  localhost:3001/user/gateways
 * - Prod: api.2bot.org/user/gateways
 * 
 * This ensures dev/prod parity and catches issues early.
 * The API_PREFIX env var is kept for edge cases only.
 */
const API_PREFIX = process.env.API_PREFIX ?? "";

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

  // Prometheus metrics collection (must run for every request)
  app.use(metricsMiddleware);

  // Prometheus scrape endpoint. Mounted at root (no auth) — expose only on
  // the internal scrape network via nginx in production.
  app.get("/metrics", metricsHandler);

  // Rate limiting (apply early to protect all routes)
  app.use(rateLimitMiddleware());

  // Internal API routes (container → platform, no user auth)
  // Mounted before API routes so /internal/* is not caught by auth middleware.
  app.use("/internal", internalRouter);
  app.use("/internal/cost", internalCostRouter);

  // API routes
  // Support configurable prefix
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
  port: parseInt(process.env.SERVER_PORT || "3002", 10),
  host: process.env.SERVER_HOST || "0.0.0.0",
  apiPrefix: API_PREFIX,
};

/**
 * Start the Express server
 * Returns the server instance for graceful shutdown handling
 */
export function startServer(app: Express): ReturnType<Express['listen']> {
  const { port, host, apiPrefix } = SERVER_CONFIG;
  const healthPath = apiPrefix ? `${apiPrefix}/health` : "/health";

  const server = app.listen(port, host, () => {
    serverLogger.info({ port, host }, `🚀 Express API server running on http://${host}:${port}`);
    serverLogger.info(`   Health check: http://${host}:${port}${healthPath}`);
    if (!apiPrefix) {
      serverLogger.info(`   Enterprise mode: Routes at root (no /api prefix)`);
    }

    // Register built-in plugins for in-process execution
    for (const [slug, reg] of BUILTIN_PLUGINS) {
      registerPlugin(slug, reg.handler);
    }

    // Initialize AI provider health checks (blocks model serving until complete)
    initializeProviderHealth().then(() => {
      serverLogger.info("AI provider health checks complete — models ready to serve");
    }).catch((err) => {
      serverLogger.error({ err }, "Failed to initialize AI provider health checks");
    });

    // Initialize credit cron (monthly grants + daily claim resets)
    initializeCreditCron();

    // Initialize pricing monitor cron (daily provider price audit by default)
    initializePricingMonitorCron();

    // Initialize health monitor cron (periodic DB/Redis health checks + Telegram alerts)
    initializeHealthMonitorCron();

    // Initialize plugin reconcile cron (workspace ↔ DB ↔ workflow drift repair)
    initializePluginReconcileCron();

    // Initialize workflow run retention cron (deletes runs older than per-plan window)
    initializeRunRetentionCron();

    // Initialize bridge token rotation cron (rotates BRIDGE_AUTH_TOKEN daily)
    initializeBridgeTokenRotationCron();

    // Initialize SCHEDULE ProjectResource tick loop (Phase 7.4 — gated by
    // FEATURE_PROJECT_RESOURCES).
    initializeScheduleTick();

    // Clean up workflow runs orphaned by previous server instance
    workflowService.cleanupOrphanedRuns().catch((err) => {
      serverLogger.error({ err }, "Failed to clean up orphaned workflow runs");
    });

    // Run orphaned-run cleanup every 2 minutes (not just on startup)
    setInterval(() => {
      workflowService.cleanupOrphanedRuns().catch((err) => {
        serverLogger.error({ err }, "Scheduled orphaned run cleanup failed");
      });
    }, 2 * 60 * 1000);
  });

  return server;
}

// Export for use in custom server
export { createApp as default };
