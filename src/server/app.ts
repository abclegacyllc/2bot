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
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors(corsOptions));

  // Stripe webhook needs raw body for signature verification
  // Must be registered BEFORE express.json()
  app.use(
    "/api/webhooks/stripe",
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
  app.use("/api", router);

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
};

/**
 * Start the Express server
 */
export function startServer(app: Express): void {
  const { port, host } = SERVER_CONFIG;

  app.listen(port, host, () => {
    serverLogger.info({ port, host }, `🚀 Express API server running on http://${host}:${port}`);
    serverLogger.info(`   Health check: http://${host}:${port}/api/health`);
  });
}

// Export for use in custom server
export { createApp as default };
