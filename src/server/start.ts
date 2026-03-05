#!/usr/bin/env tsx
/**
 * Standalone Express server entry point
 * Run with: npx tsx src/server/start.ts
 * Or via npm: npm run server
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables (same priority order as Next.js):
//   1. .env.local          — secrets (highest priority, gitignored)
//   2. .env.{NODE_ENV}     — mode-specific URLs (dev vs prod)
//   3. .env                — shared base defaults (lowest priority)
// dotenv won't overwrite vars already set, so order = priority.
const nodeEnv = process.env.NODE_ENV || "development";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), `.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { loggers } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { pluginIpcService } from "@/modules/plugin/plugin-ipc.service";
import { bridgeClientManager } from "@/modules/workspace";
import { bridgeLeaseService, SERVER_INSTANCE_ID } from "@/modules/workspace/bridge-lease.service";
import { containerLifecycleService } from "@/modules/workspace/container-lifecycle.service";
import { egressProxyService } from "@/modules/workspace/egress-proxy.service";
import { gatewayRouteService } from "@/modules/workspace/gateway-route.service";
import { workspaceMetricsService } from "@/modules/workspace/metrics.service";
import { createApp, startServer } from "./app";
import { initializeGatewayProviders } from "./init-providers";
import { initWorkspaceWebSocket } from "./ws/workspace-terminal";

const serverLogger = loggers.server;

// Initialize gateway providers before starting server
initializeGatewayProviders();

// Start bridge lease service (prevents dev+prod connection storm)
bridgeLeaseService.start();
serverLogger.info({ instanceId: SERVER_INSTANCE_ID }, 'Bridge lease service started — this server instance identified');

// Register Plugin IPC handler so workspace plugins can call storage/gateway APIs
bridgeClientManager.setIpcHandler((containerDbId, request) =>
  pluginIpcService.handleRequest(containerDbId, request),
);
serverLogger.info('Plugin IPC handler registered for workspace bridge clients');

const app = createApp();
const server = startServer(app);

// Initialize workspace terminal WebSocket handler (Phase 13)
initWorkspaceWebSocket(server);

// Start workspace lifecycle monitoring (health checks, auto-stop, restart recovery)
containerLifecycleService.start();

// Start workspace metrics collection (periodic resource usage polling)
workspaceMetricsService.start();

// Start egress proxy service (log parsing + proxy container management)
egressProxyService.start().catch(err => {
  serverLogger.warn({ error: err.message }, 'Egress proxy service failed to start — will retry on next cycle');
});

// Rebuild custom-gateway routes for any running containers (Phase A: direct delivery)
gatewayRouteService.rebuildRoutes().catch(err => {
  serverLogger.warn({ error: err.message }, 'Gateway route rebuild failed — fallback still active');
});

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
      // Stop workspace services and release bridge leases
      serverLogger.info("Stopping workspace services...");
      containerLifecycleService.stop();
      workspaceMetricsService.stop();
      egressProxyService.stop();
      await bridgeLeaseService.stop();
      serverLogger.info('Bridge leases released.');

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
