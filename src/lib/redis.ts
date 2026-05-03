/**
 * Shared Redis Client
 *
 * Singleton Redis client for consistent connection management across:
 * - Rate limiting
 * - Session caching
 * - Queue management
 * - Webhook replay cache
 * - Idempotency
 *
 * HA Modes
 * --------------------
 * The client now supports three deployment modes via `REDIS_MODE`:
 *
 *   single   (default) — single-node ioredis client (development, small prod)
 *   sentinel           — Redis Sentinel HA: clients connect to N sentinels,
 *                        which report the current primary. Same single-key
 *                        semantics as single-node — multi-key ops work as-is.
 *                        Configure: REDIS_SENTINELS="host1:26379,host2:26379"
 *                                   REDIS_SENTINEL_NAME="mymaster"
 *   cluster            — Redis Cluster: keys are sharded across N primaries
 *                        by CRC16(key) % 16384. Multi-key ops require all
 *                        keys to map to the same hash slot — see audit notes.
 *                        Configure: REDIS_CLUSTER_NODES="host1:6379,host2:6379"
 *
 * Cluster-mode multi-key audit (current code):
 *   - Pipelines in `analytics.storage.ts` and `bridge-lease.service.ts` use
 *     keys derived from a single owner id — adopting hash tags such as
 *     `{userPluginId}:stats` would be required for cluster mode.
 *   - `redis.mget(...)` calls in `routes/plugin.ts` span multiple owner ids;
 *     in cluster mode they need to be sharded per-slot or replaced with
 *     parallel single-key GETs.
 *   - rate limiter / idempotency / webhook-replay-cache / cursor sessions
 *     all already use single-key SET/GET ops and are cluster-safe.
 *
 * @module lib/redis
 */

import Redis, { type Cluster, type ClusterOptions, type RedisOptions } from 'ioredis';

import { loggers } from './logger';

const redisLogger = loggers.server;

export type RedisMode = 'single' | 'sentinel' | 'cluster';
export type RedisLikeClient = Redis | Cluster;

function getMode(): RedisMode {
  const raw = (process.env.REDIS_MODE || 'single').toLowerCase();
  if (raw === 'sentinel' || raw === 'cluster' || raw === 'single') return raw;
  redisLogger.warn({ raw }, 'Unknown REDIS_MODE — falling back to "single"');
  return 'single';
}

function parseHostPortList(value: string | undefined): Array<{ host: string; port: number }> {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((e) => e.length > 0)
    .map((entry) => {
      const [host, portStr] = entry.split(':');
      const port = parseInt(portStr ?? '6379', 10);
      if (!host) throw new Error(`Invalid Redis node entry: "${entry}"`);
      return { host, port };
    });
}

function commonOptions(): Partial<RedisOptions> {
  return {
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      redisLogger.warn({ attempt: times, delay }, 'Redis retry attempt');
      return delay;
    },
    reconnectOnError(err: Error) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  };
}

/**
 * Build a Redis client (single, sentinel, or cluster) based on env config.
 * Exported for tests; the module-level `redis` singleton is the normal entry.
 */
export function createRedisClient(): RedisLikeClient {
  const mode = getMode();

  if (mode === 'cluster') {
    const nodes = parseHostPortList(process.env.REDIS_CLUSTER_NODES);
    if (nodes.length === 0) {
      throw new Error('REDIS_MODE=cluster requires REDIS_CLUSTER_NODES');
    }
    const opts: ClusterOptions = {
      redisOptions: {
        password: process.env.REDIS_PASSWORD || undefined,
      },
      slotsRefreshTimeout: 2000,
      enableReadyCheck: true,
    };
    redisLogger.info(
      { mode, nodes: nodes.length },
      'Initialising Redis Cluster client',
    );
    return new Redis.Cluster(nodes, opts);
  }

  if (mode === 'sentinel') {
    const sentinels = parseHostPortList(process.env.REDIS_SENTINELS);
    if (sentinels.length === 0) {
      throw new Error('REDIS_MODE=sentinel requires REDIS_SENTINELS');
    }
    const name = process.env.REDIS_SENTINEL_NAME;
    if (!name) {
      throw new Error('REDIS_MODE=sentinel requires REDIS_SENTINEL_NAME');
    }
    const opts: RedisOptions = {
      ...commonOptions(),
      sentinels,
      name,
      sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD || undefined,
    };
    redisLogger.info(
      { mode, sentinels: sentinels.length, name },
      'Initialising Redis Sentinel client',
    );
    return new Redis(opts);
  }

  const opts: RedisOptions = {
    ...commonOptions(),
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };
  return new Redis(opts);
}

// Create singleton Redis client
export const redis: RedisLikeClient = createRedisClient();

// Connection event handlers (work for both Redis and Cluster — Cluster
// emits the same lifecycle events).
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
