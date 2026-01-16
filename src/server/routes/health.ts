import { loggers } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isRedisReady } from "@/lib/redis";
import { APP_CONFIG } from "@/shared/constants";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/error-handler";

const healthLogger = loggers.server;

export const healthRouter = Router();

/**
 * Health check response types
 */
interface HealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  uptime: number;
}

interface ReadinessStatus extends HealthStatus {
  checks: {
    database: CheckResult;
    redis: CheckResult;
  };
}

interface CheckResult {
  status: "ok" | "error";
  latency?: number;
  error?: string;
}

/**
 * GET /api/health - Basic health check (liveness)
 * Returns quickly, only checks if the app is running
 */
healthRouter.get("/", (_req: Request, res: Response<ApiResponse<HealthStatus>>) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      version: APP_CONFIG.version,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

/**
 * GET /api/health/live - Liveness probe (Kubernetes)
 * Ultra-fast check, just confirms the process is alive
 */
healthRouter.get("/live", (_req: Request, res: Response<ApiResponse<{ status: string }>>) => {
  res.json({
    success: true,
    data: {
      status: "ok",
    },
  });
});

/**
 * GET /api/health/ready - Readiness probe
 * Checks database and Redis connections
 */
healthRouter.get(
  "/ready",
  asyncHandler(async (_req: Request, res: Response<ApiResponse<ReadinessStatus>>) => {
    const checks: ReadinessStatus["checks"] = {
      database: { status: "ok" },
      redis: { status: "ok" },
    };

    let overallStatus: "ok" | "degraded" | "unhealthy" = "ok";

    // Check database connection
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database.latency = Date.now() - dbStart;
    } catch (err) {
      checks.database.status = "error";
      checks.database.error = err instanceof Error ? err.message : "Unknown database error";
      overallStatus = "unhealthy";
      healthLogger.error({ err }, "Database health check failed");
    }

    // Check Redis connection using shared client
    const redisStart = Date.now();

    try {
      const isReady = await isRedisReady();
      if (!isReady) {
        throw new Error('Redis not ready');
      }
      checks.redis.latency = Date.now() - redisStart;
    } catch (err) {
      checks.redis.status = "error";
      checks.redis.error = err instanceof Error ? err.message : "Unknown Redis error";
      if (overallStatus === "ok") {
        overallStatus = "degraded";
      }
      healthLogger.error({ err }, "Redis health check failed");
    }

    const statusCode = overallStatus === "ok" ? 200 : overallStatus === "degraded" ? 200 : 503;

    res.status(statusCode).json({
      success: overallStatus !== "unhealthy",
      data: {
        status: overallStatus,
        version: APP_CONFIG.version,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
      },
    });
  })
);

/**
 * GET /api/health/detailed - Detailed health info (for debugging)
 * Only available in development
 */
if (process.env.NODE_ENV !== "production") {
  healthRouter.get(
    "/detailed",
    asyncHandler(async (_req: Request, res: Response<ApiResponse<Record<string, unknown>>>) => {
      const memoryUsage = process.memoryUsage();

      res.json({
        success: true,
        data: {
          status: "ok",
          version: APP_CONFIG.version,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: process.env.NODE_ENV,
          node: {
            version: process.version,
            platform: process.platform,
            arch: process.arch,
          },
          memory: {
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
          },
        },
      });
    })
  );
}
