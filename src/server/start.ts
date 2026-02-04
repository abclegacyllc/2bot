#!/usr/bin/env tsx
/**
 * Standalone Express server entry point
 * Run with: npx tsx src/server/start.ts
 * Or via npm: npm run server
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { loggers } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createApp, startServer } from "./app";
import { initializeGatewayProviders } from "./init-providers";

const serverLogger = loggers.server;

// Initialize gateway providers before starting server
initializeGatewayProviders();

const app = createApp();
const server = startServer(app);

// ===========================================
// Graceful Shutdown Handler
// ===========================================
// Handles SIGTERM (Docker/Kubernetes stop) and SIGINT (Ctrl+C)
// Ensures in-flight requests complete before shutdown
// Prevents data loss during deployments and restarts

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    serverLogger.warn({ signal }, "Shutdown already in progress, ignoring signal");
    return;
  }
  
  isShuttingDown = true;
  serverLogger.info({ signal }, "Received shutdown signal. Starting graceful shutdown...");

  // Give load balancer time to stop routing new requests (K8s preStop hook)
  const SHUTDOWN_DELAY = parseInt(process.env.SHUTDOWN_DELAY_MS || "5000", 10);
  
  serverLogger.info({ delayMs: SHUTDOWN_DELAY }, "Waiting for load balancer to drain...");
  await new Promise(resolve => setTimeout(resolve, SHUTDOWN_DELAY));

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      serverLogger.error({ error: err }, "Error during server close");
      process.exit(1);
    }

    serverLogger.info("HTTP server closed. No longer accepting connections.");

    try {
      // Disconnect database connections
      serverLogger.info("Disconnecting from database...");
      await prisma.$disconnect();
      serverLogger.info("Database connection closed.");

      serverLogger.info("Graceful shutdown complete. Exiting.");
      process.exit(0);
    } catch (disconnectError) {
      serverLogger.error({ error: disconnectError }, "Error during database disconnect");
      process.exit(1);
    }
  });

  // Force shutdown after timeout if graceful shutdown hangs
  const FORCE_SHUTDOWN_TIMEOUT = parseInt(process.env.FORCE_SHUTDOWN_TIMEOUT_MS || "30000", 10);
  
  setTimeout(() => {
    serverLogger.error(
      { timeoutMs: FORCE_SHUTDOWN_TIMEOUT },
      "Graceful shutdown timeout exceeded. Forcing exit."
    );
    process.exit(1);
  }, FORCE_SHUTDOWN_TIMEOUT);
};

// Register signal handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions and unhandled rejections
process.on("uncaughtException", (error) => {
  serverLogger.fatal({ error }, "Uncaught exception. Initiating shutdown...");
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  serverLogger.fatal({ reason, promise }, "Unhandled rejection. Initiating shutdown...");
  gracefulShutdown("unhandledRejection");
});
