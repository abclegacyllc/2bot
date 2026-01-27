"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const redis_1 = require("@/lib/redis");
const constants_1 = require("@/shared/constants");
const express_1 = require("express");
const error_handler_1 = require("../middleware/error-handler");
const healthLogger = logger_1.loggers.server;
exports.healthRouter = (0, express_1.Router)();
/**
 * GET /api/health - Basic health check (liveness)
 * Returns quickly, only checks if the app is running
 */
exports.healthRouter.get("/", (_req, res) => {
    res.json({
        success: true,
        data: {
            status: "ok",
            version: constants_1.APP_CONFIG.version,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        },
    });
});
/**
 * GET /api/health/live - Liveness probe (Kubernetes)
 * Ultra-fast check, just confirms the process is alive
 */
exports.healthRouter.get("/live", (_req, res) => {
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
exports.healthRouter.get("/ready", (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const checks = {
        database: { status: "ok" },
        redis: { status: "ok" },
    };
    let overallStatus = "ok";
    // Check database connection
    const dbStart = Date.now();
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        checks.database.latency = Date.now() - dbStart;
    }
    catch (err) {
        checks.database.status = "error";
        checks.database.error = err instanceof Error ? err.message : "Unknown database error";
        overallStatus = "unhealthy";
        healthLogger.error({ err }, "Database health check failed");
    }
    // Check Redis connection using shared client
    const redisStart = Date.now();
    try {
        const isReady = await (0, redis_1.isRedisReady)();
        if (!isReady) {
            throw new Error('Redis not ready');
        }
        checks.redis.latency = Date.now() - redisStart;
    }
    catch (err) {
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
            version: constants_1.APP_CONFIG.version,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks,
        },
    });
}));
/**
 * GET /api/health/detailed - Detailed health info (for debugging)
 * Only available in development
 */
if (process.env.NODE_ENV !== "production") {
    exports.healthRouter.get("/detailed", (0, error_handler_1.asyncHandler)(async (_req, res) => {
        const memoryUsage = process.memoryUsage();
        res.json({
            success: true,
            data: {
                status: "ok",
                version: constants_1.APP_CONFIG.version,
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
    }));
}
//# sourceMappingURL=health.js.map