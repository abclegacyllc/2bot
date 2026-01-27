"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.notFoundHandler = exports.errorHandler = void 0;
const logger_1 = require("@/lib/logger");
const plan_limits_1 = require("@/lib/plan-limits");
const errors_1 = require("@/shared/errors");
const isProduction = process.env.NODE_ENV === "production";
const serverLogger = logger_1.loggers.server;
/**
 * Extract request info for error logging
 */
function getRequestInfo(req) {
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
const errorHandler = (err, req, res, _next) => {
    const requestInfo = getRequestInfo(req);
    const isOperational = err instanceof errors_1.AppError && err.isOperational;
    // Log error with appropriate level
    const logData = {
        error: {
            name: err.name,
            message: err.message,
            ...(err instanceof errors_1.AppError && { code: err.code, statusCode: err.statusCode }),
            ...(!isProduction && { stack: err.stack }),
        },
        request: requestInfo,
    };
    if (isOperational) {
        serverLogger.warn(logData, `[${err.name}] ${err.message}`);
    }
    else {
        serverLogger.error(logData, `[${err.name}] ${err.message}`);
    }
    // Handle validation errors with field details
    if (err instanceof errors_1.ValidationError) {
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
    if (err instanceof errors_1.RateLimitError) {
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
    // Handle plan limit errors with upgrade info
    if (err instanceof plan_limits_1.PlanLimitError) {
        res.status(403).json({
            success: false,
            error: {
                code: "PLAN_LIMIT_ERROR",
                message: err.message,
                details: {
                    resource: err.resource,
                    current: err.current,
                    max: err.max,
                    upgradeUrl: err.upgradeUrl,
                },
                ...(!isProduction && { stack: err.stack }),
            },
        });
        return;
    }
    // Handle known application errors
    if (err instanceof errors_1.AppError) {
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
exports.errorHandler = errorHandler;
/**
 * Not found handler (for unmatched routes)
 */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: "ROUTE_NOT_FOUND",
            message: `Cannot ${req.method} ${req.path}`,
        },
    });
};
exports.notFoundHandler = notFoundHandler;
/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=error-handler.js.map