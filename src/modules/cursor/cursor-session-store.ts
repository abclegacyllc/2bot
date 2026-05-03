/**
 * Cursor Session Store (Redis-backed)
 *
 * Multi-replica coordination for Cursor agent sessions:
 *
 *   1. Session ownership registry — maps `sessionId → replicaId` so any
 *      replica can verify ownership and route ask_user answers to the
 *      correct replica.
 *
 *   2. Correction queue — per-session list of mid-stream user corrections.
 *      Drained by the runner at each iteration.
 *
 *   3. Cross-replica answer pub/sub — when an answer arrives on a replica
 *      that doesn't own the session, it's forwarded over Redis to the
 *      owning replica's subscriber.
 *
 * Pendinganswer Promise resolvers MUST stay in-memory on the replica that
 * issued the question — they cannot be serialized. This module's only job
 * is to *route* the answer back to that replica.
 *
 * Failure mode: if Redis is unavailable, all helpers fall back to local-only
 * behavior. Single-replica deployments are unaffected.
 *
 * @module modules/cursor/cursor-session-store
 */

import crypto from "node:crypto";

import { logger } from "@/lib/logger";
import { redis, type RedisLikeClient } from "@/lib/redis";

const log = logger.child({ module: "cursor-session-store" });

/** Stable per-process replica ID — assigned once at module load. */
export const REPLICA_ID =
  process.env.REPLICA_ID || `replica-${crypto.randomBytes(6).toString("hex")}`;

/** Default session ownership TTL (refreshed on activity). */
const SESSION_TTL_SECONDS = 15 * 60; // 15 min

/** Default correction queue TTL. */
const CORRECTION_TTL_SECONDS = 30 * 60;

/** Redis key namespaces. */
const K_OWNER = (sessionId: string) => `cursor:sess:${sessionId}:owner`;
const K_CORRECTIONS = (sessionId: string) => `cursor:sess:${sessionId}:corrections`;
const CHAN_ANSWER = (replicaId: string) => `cursor:answer:${replicaId}`;

interface SessionOwner {
  userId: string;
  replicaId: string;
}

// ===========================================
// Session ownership
// ===========================================

/**
 * Mark this replica as the owner of `sessionId`.
 * TTL is refreshed by `touchSession()` while the worker stream is active.
 */
export async function registerSession(sessionId: string, userId: string): Promise<void> {
  try {
    const payload = JSON.stringify({ userId, replicaId: REPLICA_ID });
    await redis.set(K_OWNER(sessionId), payload, "EX", SESSION_TTL_SECONDS);
  } catch (err) {
    log.warn({ err, sessionId }, "Failed to register session owner — continuing local-only");
  }
}

/** Refresh ownership TTL — call periodically while session is active. */
export async function touchSession(sessionId: string): Promise<void> {
  try {
    await redis.expire(K_OWNER(sessionId), SESSION_TTL_SECONDS);
  } catch {
    // best-effort
  }
}

/** Remove this replica's ownership claim (session ended/cancelled). */
export async function unregisterSession(sessionId: string): Promise<void> {
  try {
    await redis.del(K_OWNER(sessionId), K_CORRECTIONS(sessionId));
  } catch {
    // best-effort
  }
}

/**
 * Look up the owner of `sessionId`.
 * Returns null if the session is unknown or Redis is unavailable.
 */
export async function getSessionOwner(sessionId: string): Promise<SessionOwner | null> {
  try {
    const raw = await redis.get(K_OWNER(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionOwner;
  } catch (err) {
    log.warn({ err, sessionId }, "getSessionOwner failed");
    return null;
  }
}

// ===========================================
// Correction queue
// ===========================================

/**
 * Push a correction onto the session's queue.
 * Returns false if the queue is at capacity (5 items) to prevent abuse.
 */
export async function pushCorrectionRedis(sessionId: string, correction: string): Promise<boolean> {
  try {
    const len = await redis.llen(K_CORRECTIONS(sessionId));
    if (len >= 5) return false;
    await redis
      .multi()
      .rpush(K_CORRECTIONS(sessionId), correction)
      .expire(K_CORRECTIONS(sessionId), CORRECTION_TTL_SECONDS)
      .exec();
    return true;
  } catch (err) {
    log.warn({ err, sessionId }, "pushCorrectionRedis failed");
    return false;
  }
}

/** Drain (read + delete) all corrections for a session. */
export async function drainCorrectionsRedis(sessionId: string): Promise<string[]> {
  try {
    const key = K_CORRECTIONS(sessionId);
    const items = await redis.lrange(key, 0, -1);
    if (items.length > 0) {
      await redis.del(key);
    }
    return items;
  } catch (err) {
    log.warn({ err, sessionId }, "drainCorrectionsRedis failed");
    return [];
  }
}

/** Clear corrections without reading. */
export async function clearCorrectionsRedis(sessionId: string): Promise<void> {
  try {
    await redis.del(K_CORRECTIONS(sessionId));
  } catch {
    // best-effort
  }
}

// ===========================================
// Cross-replica answer pub/sub
// ===========================================

interface AnswerEnvelope {
  sessionId: string;
  answer: string;
  userId: string;
}

type AnswerHandler = (env: AnswerEnvelope) => boolean;

let subscriberClient: RedisLikeClient | null = null;
let localAnswerHandler: AnswerHandler | null = null;

/**
 * Subscribe this replica to incoming answer forwards.
 * Should be called once at server startup. The handler is invoked when
 * another replica publishes an answer for a session we own.
 */
export function startAnswerSubscriber(handler: AnswerHandler): void {
  if (subscriberClient) return; // already subscribed
  localAnswerHandler = handler;
  try {
    // Separate connection — ioredis blocks subscribers from issuing other commands
    subscriberClient = redis.duplicate();
    subscriberClient.on("error", (err) => {
      log.warn({ err }, "Cursor answer subscriber error");
    });
    subscriberClient.subscribe(CHAN_ANSWER(REPLICA_ID), (err) => {
      if (err) {
        log.warn({ err, replicaId: REPLICA_ID }, "Failed to subscribe to answer channel");
        return;
      }
      log.info({ replicaId: REPLICA_ID }, "Cursor answer subscriber active");
    });
    subscriberClient.on("message", (_channel: string, message: string) => {
      try {
        const env = JSON.parse(message) as AnswerEnvelope;
        if (localAnswerHandler) localAnswerHandler(env);
      } catch (err) {
        log.warn({ err }, "Malformed answer envelope");
      }
    });
  } catch (err) {
    log.warn({ err }, "Failed to start answer subscriber — multi-replica answer routing disabled");
    subscriberClient = null;
  }
}

/**
 * Publish an answer to the replica that owns `sessionId`.
 * Used by the worker-answer route when it can't resolve the session locally.
 *
 * @returns true if the answer was delivered to *some* subscriber (best-effort).
 */
export async function publishAnswerToOwner(env: AnswerEnvelope): Promise<boolean> {
  try {
    const owner = await getSessionOwner(env.sessionId);
    if (!owner) return false;
    if (owner.replicaId === REPLICA_ID) {
      // We own it — caller should resolve locally instead
      return false;
    }
    if (owner.userId !== env.userId) {
      log.warn(
        { sessionId: env.sessionId, expected: owner.userId, actual: env.userId },
        "Cross-replica answer rejected: ownership mismatch",
      );
      return false;
    }
    const delivered = await redis.publish(CHAN_ANSWER(owner.replicaId), JSON.stringify(env));
    return delivered > 0;
  } catch (err) {
    log.warn({ err, sessionId: env.sessionId }, "publishAnswerToOwner failed");
    return false;
  }
}

/** Tear down subscriber (graceful shutdown / tests). */
export async function stopAnswerSubscriber(): Promise<void> {
  if (subscriberClient) {
    try {
      await subscriberClient.quit();
    } catch {
      // best-effort
    }
    subscriberClient = null;
    localAnswerHandler = null;
  }
}
