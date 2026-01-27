"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalServiceError = exports.DatabaseError = exports.ServiceUnavailableError = exports.InternalError = exports.RateLimitError = exports.ValidationError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.ForbiddenError = exports.AuthenticationError = exports.UnauthorizedError = exports.BadRequestError = exports.AppError = void 0;
/**
 * Base application error class
 */
class AppError extends Error {
    code;
    statusCode;
    isOperational;
    details;
    constructor(message, code, statusCode = 500, isOperational = true, details) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.details = details;
        // Maintains proper stack trace
        Error.captureStackTrace(this, this.constructor);
    }
    /**
     * Serialize error for API response
     */
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            ...(this.details && { details: this.details }),
        };
    }
}
exports.AppError = AppError;
/**
 * 400 - Bad Request
 */
class BadRequestError extends AppError {
    constructor(message = "Bad request", code = "BAD_REQUEST", details) {
        super(message, code, 400, true, details);
    }
}
exports.BadRequestError = BadRequestError;
/**
 * 401 - Unauthorized / Authentication Error
 */
class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
        super(message, code, 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
/**
 * Alias for UnauthorizedError (authentication failed)
 */
class AuthenticationError extends AppError {
    constructor(message = "Authentication failed", code = "AUTHENTICATION_FAILED") {
        super(message, code, 401);
    }
}
exports.AuthenticationError = AuthenticationError;
/**
 * 403 - Forbidden / Authorization Error
 */
class ForbiddenError extends AppError {
    constructor(message = "Forbidden", code = "FORBIDDEN") {
        super(message, code, 403);
    }
}
exports.ForbiddenError = ForbiddenError;
/**
 * Alias for ForbiddenError (authorization failed)
 */
class AuthorizationError extends AppError {
    constructor(message = "Access denied", code = "AUTHORIZATION_FAILED") {
        super(message, code, 403);
    }
}
exports.AuthorizationError = AuthorizationError;
/**
 * 404 - Not Found
 */
class NotFoundError extends AppError {
    constructor(message = "Resource not found", code = "NOT_FOUND") {
        super(message, code, 404);
    }
}
exports.NotFoundError = NotFoundError;
/**
 * 409 - Conflict
 */
class ConflictError extends AppError {
    constructor(message = "Resource conflict", code = "CONFLICT") {
        super(message, code, 409);
    }
}
exports.ConflictError = ConflictError;
/**
 * 422 - Validation Error
 */
class ValidationError extends AppError {
    errors;
    constructor(message = "Validation failed", errors = {}) {
        super(message, "VALIDATION_ERROR", 422, true, { errors });
        this.errors = errors;
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            errors: this.errors,
        };
    }
}
exports.ValidationError = ValidationError;
/**
 * 429 - Rate Limit
 */
class RateLimitError extends AppError {
    retryAfter;
    constructor(message = "Too many requests", retryAfter) {
        super(message, "RATE_LIMIT_EXCEEDED", 429, true, retryAfter ? { retryAfter } : undefined);
        this.retryAfter = retryAfter;
    }
}
exports.RateLimitError = RateLimitError;
/**
 * 500 - Internal Server Error
 */
class InternalError extends AppError {
    constructor(message = "Internal server error", code = "INTERNAL_ERROR") {
        super(message, code, 500, false);
    }
}
exports.InternalError = InternalError;
/**
 * 503 - Service Unavailable
 */
class ServiceUnavailableError extends AppError {
    constructor(message = "Service temporarily unavailable", code = "SERVICE_UNAVAILABLE") {
        super(message, code, 503);
    }
}
exports.ServiceUnavailableError = ServiceUnavailableError;
/**
 * Database-related errors
 */
class DatabaseError extends AppError {
    constructor(message = "Database operation failed", code = "DATABASE_ERROR") {
        super(message, code, 500, false);
    }
}
exports.DatabaseError = DatabaseError;
/**
 * External service errors (Telegram API, AI providers, etc.)
 */
class ExternalServiceError extends AppError {
    service;
    constructor(service, message = "External service error") {
        super(message, "EXTERNAL_SERVICE_ERROR", 502, true, { service });
        this.service = service;
    }
}
exports.ExternalServiceError = ExternalServiceError;
//# sourceMappingURL=app-error.js.map