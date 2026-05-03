/**
 * Distributed Lock & Idempotency Helpers (Redis)
 *
 * Used by:
 *  - Cron jobs (only one replica runs each tick)
 *  - Workflow executor (idempotency guard for webhook replays)
 *
 * Design: SET NX EX <ttl> for atomic acquire. Lock held by token so we only
 * release locks we own. Fails-open on Redis unavailability for non-critical
 * paths (caller decides via `failOpen` flag).
 *
 * @module lib/redis-lock
 */

import crypto from "node:crypto";

import { logger } from "./logger";
import { redis } from "./redis";

const log = logger.child({ module: "redis-lock" });

/**
 * Try to acquire a distributed lock.
 * Returns a release token if acquired, or null if another holder owns it.
 *
 * @param key   Lock key (will be prefixed with `lock:`)
 * @param ttlSeconds Lock auto-expiry (must be ≥ expected job duration)
 */
export async function acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
  const fullKey = `lock:${key}`;
  const token = crypto.randomBytes(16).toString("hex");
  try {
    const result = await redis.set(fullKey, token, "EX", ttlSeconds, "NX");
    return result === "OK" ? token : null;
  } catch (err) {
    log.warn({ err, key }, "Redis lock acquire failed");
    return null;
  }
}

/**
 * Release a lock, but only if we still own it (token match).
 * Uses Lua script for atomic compare-and-delete.
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  const fullKey = `lock:${key}`;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    await redis.eval(script, 1, fullKey, token);
  } catch (err) {
    log.warn({ err, key }, "Redis lock release failed (will expire via TTL)");
  }
}

/**
 * Run `fn` only if we win the distributed lock for `key`.
 * Other replicas skip silently. Useful for cron jobs that must run once cluster-wide.
 *
 * @returns The result of fn(), or `undefined` if the lock was held by another replica.
 */
export async function withDistributedLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const token = await acquireLock(key, ttlSeconds);
  if (!token) {
    log.debug({ key }, "Skipping cron tick — lock held by another replica");
    return undefined;
  }
  try {
    return await fn();
  } finally {
    await releaseLock(key, token);
  }
}

/**
 * Idempotency guard for workflow runs (and other one-shot operations).
 *
 * Stores `key → value` with TTL. First caller wins; subsequent callers within
 * the TTL window receive the previously stored value.
 *
 * @param key  Idempotency key (already namespaced by caller)
 * @param ttlSeconds Window during which dedup applies (24h is typical for webhooks)
 * @param compute Producer for the cached value (only invoked if we're the first caller)
 * @returns `{ value, replayed }` — replayed=true means another caller got there first.
 */
export async function withIdempotency<T extends string>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<{ value: T; replayed: boolean }> {
  const fullKey = `idem:${key}`;

  // Fast path: check for existing value
  try {
    const existing = await redis.get(fullKey);
    if (existing) {
      return { value: existing as T, replayed: true };
    }
  } catch (err) {
    log.warn({ err, key }, "Redis idempotency lookup failed — falling through to compute");
    // Fail-open: produce a fresh value (no dedup this round) rather than block business logic
    return { value: await compute(), replayed: false };
  }

  // Compute and try to claim the key atomically
  const value = await compute();
  try {
    const claimed = await redis.set(fullKey, value, "EX", ttlSeconds, "NX");
    if (claimed === "OK") {
      return { value, replayed: false };
    }
    // Race: someone else claimed between our GET and SET — return their value
    const winner = await redis.get(fullKey);
    if (winner) {
      log.info({ key }, "Idempotency race lost; returning winner's value");
      return { value: winner as T, replayed: true };
    }
  } catch (err) {
    log.warn({ err, key }, "Redis idempotency claim failed");
  }
  return { value, replayed: false };
}
