/**
 * Webhook Signature Replay Cache
 *
 * Prevents an attacker who captured a valid signed webhook payload from
 * re-submitting it. Each webhook handler computes a stable identifier for
 * the request (provider-specific: e.g. Stripe `event.id`, Telegram
 * `update_id`, Slack `v0:<ts>:<sig>`, Discord/WhatsApp full signature),
 * and calls `wasReplayed()` before any DB write or message dispatch.
 *
 * Implementation is a Redis `SET NX EX` atomic check-and-set. The first
 * call for a given key wins (returns `false`). All subsequent calls
 * within the TTL window return `true` and the handler should reject /
 * silently 200 the request (provider-specific).
 *
 * Failure mode: by default we fail-OPEN if Redis is unreachable so a
 * Redis hiccup does not take down all webhook processing. Set
 * `WEBHOOK_REPLAY_FAIL_CLOSED=true` to fail-CLOSED (treat Redis errors
 * as replay hits — strictest security posture).
 *
 * @module lib/webhook-replay-cache
 */

import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

const replayLogger = logger.child({ module: "webhook-replay-cache" });

const KEY_PREFIX = "webhook:replay:";
const DEFAULT_TTL_SEC = 86_400; // 24h — long enough to defeat replay, short enough to bound memory

const FAIL_CLOSED = process.env.WEBHOOK_REPLAY_FAIL_CLOSED === "true";

/**
 * Build a stable cache key from a provider name and a provider-specific
 * identifier. The identifier is hashed with SHA-256 so that long /
 * sensitive values (e.g. signatures) are not stored in plaintext.
 */
function buildKey(provider: string, identifier: string): string {
  const hash = createHash("sha256").update(`${provider}:${identifier}`).digest("hex");
  return `${KEY_PREFIX}${hash}`;
}

/**
 * Returns `true` if the (provider, identifier) pair has been seen
 * within the TTL window (replay), `false` if this is the first time
 * (and the key has now been stored).
 *
 * On Redis failure: returns `FAIL_CLOSED` (default `false` = allow).
 */
export async function wasReplayed(
  provider: string,
  identifier: string,
  ttlSec: number = DEFAULT_TTL_SEC,
): Promise<boolean> {
  if (!provider || !identifier) {
    // Caller bug — refuse to cache an empty key. Treat as not-replay so
    // the handler proceeds with its own validation.
    return false;
  }

  const key = buildKey(provider, identifier);

  try {
    // SET key value NX EX ttl — atomic; returns "OK" if set, null if key existed.
    const result = await redis.set(key, "1", "EX", ttlSec, "NX");
    if (result === "OK") {
      return false; // fresh
    }
    // Key already existed — replay.
    replayLogger.warn({ provider }, "Webhook replay detected");
    return true;
  } catch (err) {
    replayLogger.error(
      { provider, err: err instanceof Error ? err.message : String(err) },
      "Replay cache Redis error",
    );
    return FAIL_CLOSED;
  }
}

/**
 * Test/admin helper — explicitly clear a replay key. Not used in
 * normal request flow.
 */
export async function clearReplayKey(provider: string, identifier: string): Promise<void> {
  try {
    await redis.del(buildKey(provider, identifier));
  } catch (err) {
    replayLogger.error(
      { provider, err: err instanceof Error ? err.message : String(err) },
      "Failed to clear replay key",
    );
  }
}
