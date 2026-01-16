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

import Redis from 'ioredis';

import { loggers } from './logger';

const redisLogger = loggers.server;

// Redis connection configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    redisLogger.warn({ attempt: times, delay }, 'Redis retry attempt');
    return delay;
  },
  // Reconnect on error
  reconnectOnError(err: Error) {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some(e => err.message.includes(e));
  },
};

// Create singleton Redis client
export const redis = new Redis(REDIS_CONFIG);

// Connection event handlers
redis.on('connect', () => {
  redisLogger.info('Redis client connected');
});

redis.on('ready', () => {
  redisLogger.info('Redis client ready');
});

redis.on('error', (err) => {
  redisLogger.error({ err }, 'Redis client error');
});

redis.on('close', () => {
  redisLogger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  redisLogger.info('Redis client reconnecting...');
});

/**
 * Gracefully close Redis connection
 * Call this during application shutdown
 */
export async function closeRedis(): Promise<void> {
  redisLogger.info('Closing Redis connection...');
  await redis.quit();
  redisLogger.info('Redis connection closed');
}

/**
 * Check if Redis is connected and ready
 */
export async function isRedisReady(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): string {
  return redis.status;
}
