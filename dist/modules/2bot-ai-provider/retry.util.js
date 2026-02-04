"use strict";
/**
 * Retry Utility for 2Bot AI
 *
 * Handles transient failures (rate limits, network errors) with
 * exponential backoff and jitter.
 *
 * @module modules/2bot-ai-provider/retry.util
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
exports.createRetryable = createRetryable;
exports.getRetryAfterMs = getRetryAfterMs;
const logger_1 = require("@/lib/logger");
const log = logger_1.logger.child({ module: "ai-retry" });
/**
 * Default retry options
 */
const DEFAULT_OPTIONS = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: true,
};
/**
 * Errors that are typically transient and worth retrying
 */
const TRANSIENT_ERROR_CODES = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EPIPE",
    "ENOTFOUND",
    "ENETUNREACH",
    "EAI_AGAIN",
]);
/**
 * HTTP status codes that are retryable
 */
const RETRYABLE_STATUS_CODES = new Set([
    408, // Request Timeout
    429, // Too Many Requests (rate limit)
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
]);
/**
 * Default function to determine if an error is retryable
 */
function defaultIsRetryable(error) {
    // Network errors
    if (error instanceof Error) {
        const errorCode = error.code;
        if (errorCode && TRANSIENT_ERROR_CODES.has(errorCode)) {
            return true;
        }
        // OpenAI SDK errors
        if ("status" in error) {
            const status = error.status;
            if (RETRYABLE_STATUS_CODES.has(status)) {
                return true;
            }
        }
        // Rate limit errors (from various SDKs)
        if (error.message.includes("rate limit") ||
            error.message.includes("Rate limit") ||
            error.message.includes("too many requests") ||
            error.message.includes("Too Many Requests")) {
            return true;
        }
        // Connection/timeout errors
        if (error.message.includes("timeout") ||
            error.message.includes("TIMEOUT") ||
            error.message.includes("Connection") ||
            error.message.includes("socket hang up")) {
            return true;
        }
    }
    return false;
}
/**
 * Calculate delay with optional jitter
 */
function calculateDelay(attempt, initialDelayMs, maxDelayMs, backoffMultiplier, jitter) {
    // Exponential backoff: delay = initialDelay * (multiplier ^ attempt)
    const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
    let delay = Math.min(exponentialDelay, maxDelayMs);
    // Add jitter (0-25% of delay) to prevent thundering herd
    if (jitter) {
        const jitterAmount = delay * 0.25 * Math.random();
        delay += jitterAmount;
    }
    return Math.round(delay);
}
/**
 * Sleep for a given duration
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Execute a function with retry logic
 *
 * @param fn - The async function to execute
 * @param options - Retry options
 * @returns The result of the function
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => openaiTextGeneration(request),
 *   {
 *     maxRetries: 3,
 *     operationName: "openai-text-generation",
 *   }
 * );
 * ```
 */
async function withRetry(fn, options = {}) {
    const { maxRetries = DEFAULT_OPTIONS.maxRetries, initialDelayMs = DEFAULT_OPTIONS.initialDelayMs, maxDelayMs = DEFAULT_OPTIONS.maxDelayMs, backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier, jitter = DEFAULT_OPTIONS.jitter, isRetryable = defaultIsRetryable, operationName = "operation", } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // If this was the last attempt, throw
            if (attempt >= maxRetries) {
                log.error({ error, attempt, maxRetries, operationName }, `${operationName} failed after ${maxRetries + 1} attempts`);
                throw error;
            }
            // Check if error is retryable
            if (!isRetryable(error)) {
                log.debug({ error, operationName }, `${operationName} failed with non-retryable error`);
                throw error;
            }
            // Calculate delay and wait
            const delay = calculateDelay(attempt, initialDelayMs, maxDelayMs, backoffMultiplier, jitter);
            log.warn({
                error: error instanceof Error ? error.message : String(error),
                attempt: attempt + 1,
                maxRetries: maxRetries + 1,
                delayMs: delay,
                operationName,
            }, `${operationName} failed, retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }
    // Should never reach here, but TypeScript needs this
    throw lastError;
}
/**
 * Create a retryable version of a function
 *
 * @param fn - The async function to wrap
 * @param options - Retry options
 * @returns A wrapped function that will retry on failure
 *
 * @example
 * ```typescript
 * const retryableTextGen = createRetryable(openaiTextGeneration, { maxRetries: 3 });
 * const result = await retryableTextGen(request);
 * ```
 */
function createRetryable(fn, options = {}) {
    return (...args) => withRetry(() => fn(...args), options);
}
/**
 * Get retry-after header value from an error (if available)
 * OpenAI and Anthropic include this in rate limit responses
 */
function getRetryAfterMs(error) {
    if (error instanceof Error && "headers" in error) {
        const headers = error.headers;
        if (headers) {
            const retryAfter = headers["retry-after"];
            if (retryAfter) {
                const seconds = parseInt(retryAfter, 10);
                if (!isNaN(seconds)) {
                    return seconds * 1000;
                }
            }
        }
    }
    return null;
}
//# sourceMappingURL=retry.util.js.map