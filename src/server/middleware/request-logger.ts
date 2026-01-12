import { logger, loggers } from "@/lib/logger";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import pinoHttp from "pino-http";

const serverLogger = loggers.server;

/**
 * Pino HTTP middleware for structured request logging
 */
export const pinoHttpMiddleware = pinoHttp({
  logger,
  genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  // Skip logging for health checks in production
  autoLogging: {
    ignore: (req) => {
      return process.env.NODE_ENV === "production" && req.url === "/api/health";
    },
  },
  customProps: (req) => ({
    requestId: req.id,
    userAgent: req.headers["user-agent"],
    ip: req.headers["x-forwarded-for"] ?? req.socket.remoteAddress,
  }),
  // Redact sensitive headers
  redact: ["req.headers.authorization", "req.headers.cookie"],
});

/**
 * Simple request logging middleware (fallback/custom)
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Add request ID
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-ID", requestId);

  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    // Skip health check logs in production
    if (process.env.NODE_ENV === "production" && req.path === "/api/health") {
      return;
    }

    serverLogger.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        requestId,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
};
