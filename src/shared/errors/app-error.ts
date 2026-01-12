/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
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
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * 400 - Bad Request
 */
export class BadRequestError extends AppError {
  constructor(message: string = "Bad request", code: string = "BAD_REQUEST", details?: Record<string, unknown>) {
    super(message, code, 400, true, details);
  }
}

/**
 * 401 - Unauthorized / Authentication Error
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", code: string = "UNAUTHORIZED") {
    super(message, code, 401);
  }
}

/**
 * Alias for UnauthorizedError (authentication failed)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication failed", code: string = "AUTHENTICATION_FAILED") {
    super(message, code, 401);
  }
}

/**
 * 403 - Forbidden / Authorization Error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden", code: string = "FORBIDDEN") {
    super(message, code, 403);
  }
}

/**
 * Alias for ForbiddenError (authorization failed)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Access denied", code: string = "AUTHORIZATION_FAILED") {
    super(message, code, 403);
  }
}

/**
 * 404 - Not Found
 */
export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found", code: string = "NOT_FOUND") {
    super(message, code, 404);
  }
}

/**
 * 409 - Conflict
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource conflict", code: string = "CONFLICT") {
    super(message, code, 409);
  }
}

/**
 * 422 - Validation Error
 */
export class ValidationError extends AppError {
  public readonly errors: Record<string, string[]>;

  constructor(message: string = "Validation failed", errors: Record<string, string[]> = {}) {
    super(message, "VALIDATION_ERROR", 422, true, { errors });
    this.errors = errors;
  }

  override toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      errors: this.errors,
    };
  }
}

/**
 * 429 - Rate Limit
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = "Too many requests", retryAfter?: number) {
    super(message, "RATE_LIMIT_EXCEEDED", 429, true, retryAfter ? { retryAfter } : undefined);
    this.retryAfter = retryAfter;
  }
}

/**
 * 500 - Internal Server Error
 */
export class InternalError extends AppError {
  constructor(message: string = "Internal server error", code: string = "INTERNAL_ERROR") {
    super(message, code, 500, false);
  }
}

/**
 * 503 - Service Unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = "Service temporarily unavailable", code: string = "SERVICE_UNAVAILABLE") {
    super(message, code, 503);
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends AppError {
  constructor(message: string = "Database operation failed", code: string = "DATABASE_ERROR") {
    super(message, code, 500, false);
  }
}

/**
 * External service errors (Telegram API, AI providers, etc.)
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string = "External service error") {
    super(message, "EXTERNAL_SERVICE_ERROR", 502, true, { service });
    this.service = service;
  }
}
