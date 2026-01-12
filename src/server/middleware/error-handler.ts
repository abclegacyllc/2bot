import { loggers } from "@/lib/logger";
import { AppError, RateLimitError, ValidationError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

const isProduction = process.env.NODE_ENV === "production";
const serverLogger = loggers.server;

/**
 * Extract request info for error logging
 */
function getRequestInfo(req: Request): Record<string, unknown> {
  return {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.get("X-Request-ID") ?? req.headers["x-request-id"],
  };
}

/**
 * Global error handler middleware
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void => {
  const requestInfo = getRequestInfo(req);
  const isOperational = err instanceof AppError && err.isOperational;

  // Log error with appropriate level
  const logData = {
    error: {
      name: err.name,
      message: err.message,
      ...(err instanceof AppError && { code: err.code, statusCode: err.statusCode }),
      ...(!isProduction && { stack: err.stack }),
    },
    request: requestInfo,
  };

  if (isOperational) {
    serverLogger.warn(logData, `[${err.name}] ${err.message}`);
  } else {
    serverLogger.error(logData, `[${err.name}] ${err.message}`);
  }

  // Handle validation errors with field details
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        errors: err.errors,
        ...(!isProduction && { stack: err.stack }),
      },
    });
    return;
  }

  // Handle rate limit errors with retry-after header
  if (err instanceof RateLimitError) {
    if (err.retryAfter) {
      res.setHeader("Retry-After", err.retryAfter);
    }
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.retryAfter && { retryAfter: err.retryAfter }),
        ...(!isProduction && { stack: err.stack }),
      },
    });
    return;
  }

  // Handle known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
        ...(!isProduction && { stack: err.stack }),
      },
    });
    return;
  }

  // Handle SyntaxError (malformed JSON)
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
        ...(!isProduction && { stack: err.stack }),
      },
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isProduction ? "An unexpected error occurred" : err.message,
      ...(!isProduction && { stack: err.stack }),
    },
  });
};

/**
 * Not found handler (for unmatched routes)
 */
export const notFoundHandler = (req: Request, res: Response<ApiResponse>): void => {
  res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
