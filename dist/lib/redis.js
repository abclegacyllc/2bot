"use strict";
/**
 * Shared Redis Client
 *
 * Singleton Redis client for consistent connection management across:
 * - Rate limiting
 * - Session caching (future)
 * - Queue management (future)
 *
 * @module lib/redis
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.closeRedis = closeRedis;
exports.isRedisReady = isRedisReady;
exports.getRedisStatus = getRedisStatus;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("./logger");
const redisLogger = logger_1.loggers.server;
// Redis connection configuration
const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        redisLogger.warn({ attempt: times, delay }, 'Redis retry attempt');
        return delay;
    },
    // Reconnect on error
    reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some(e => err.message.includes(e));
    },
};
// Create singleton Redis client
exports.redis = new ioredis_1.default(REDIS_CONFIG);
// Connection event handlers
exports.redis.on('connect', () => {
    redisLogger.info('Redis client connected');
});
exports.redis.on('ready', () => {
    redisLogger.info('Redis client ready');
});
exports.redis.on('error', (err) => {
    redisLogger.error({ err }, 'Redis client error');
});
exports.redis.on('close', () => {
    redisLogger.warn('Redis connection closed');
});
exports.redis.on('reconnecting', () => {
    redisLogger.info('Redis client reconnecting...');
});
/**
 * Gracefully close Redis connection
 * Call this during application shutdown
 */
async function closeRedis() {
    redisLogger.info('Closing Redis connection...');
    await exports.redis.quit();
    redisLogger.info('Redis connection closed');
}
/**
 * Check if Redis is connected and ready
 */
async function isRedisReady() {
    try {
        const result = await exports.redis.ping();
        return result === 'PONG';
    }
    catch {
        return false;
    }
}
/**
 * Get Redis connection status
 */
function getRedisStatus() {
    return exports.redis.status;
}
//# sourceMappingURL=redis.js.map