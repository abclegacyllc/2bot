/**
 * Project Topology Cache
 *
 * Redis-backed cache wrapper around `getProjectTopology()`. Reads are
 * served from Redis when available; misses fall through to the underlying
 * service (which now hits a Postgres read replica when one is configured)
 * and the result is written back with a short TTL.
 *
 * Cache key shape: `topology:v1:{userId}:{orgId|none}:{projectId}`. The
 * tenant tuple is part of the key, so the same projectId across two
 * shadowed contexts can never collide. The leading `v1:` prefix lets us
 * roll the cache forward (bump to `v2:`) when the topology shape changes
 * without explicitly purging Redis.
 *
 * Failure mode: if Redis is unavailable (timeout, error, parse error), the
 * cache layer falls back to the DB transparently. Cache misses must NEVER
 * be the difference between a working and a broken endpoint.
 *
 * @module modules/project-resource/topology-cache
 */

import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

import { getProjectTopology, type ProjectTopology } from "./project-topology.service";
import type { ProjectResourceOwnerFilter } from "./project-resource.types";

const log = logger.child({ module: "topology-cache" });

const KEY_PREFIX = "topology:v1";

/**
 * Default TTL: 5 minutes. Topology rarely changes between reads from the
 * same user; on the rare mutation path callers invalidate explicitly so
 * stale entries don't survive past their causing change.
 */
const DEFAULT_TTL_SEC = parseInt(
  process.env.TOPOLOGY_CACHE_TTL_SEC ?? "300",
  10,
);

/**
 * Set to "disabled" via env to bypass the cache entirely (useful when
 * debugging stale-data issues; falls through to the DB on every call).
 */
function isCacheEnabled(): boolean {
  return (process.env.TOPOLOGY_CACHE ?? "enabled").toLowerCase() !== "disabled";
}

function buildCacheKey(
  owner: ProjectResourceOwnerFilter,
  projectId: string,
): string {
  const orgPart = owner.organizationId ?? "none";
  return `${KEY_PREFIX}:${owner.userId}:${orgPart}:${projectId}`;
}

/**
 * Cached read. Authorisation is enforced inside `getProjectTopology()`, so
 * we never serve a cached response across tenants — the cache key already
 * includes the (userId, orgId) tuple of the caller.
 */
export async function getCachedProjectTopology(
  owner: ProjectResourceOwnerFilter,
  projectId: string,
): Promise<ProjectTopology> {
  if (!isCacheEnabled()) {
    return getProjectTopology(owner, projectId);
  }

  const key = buildCacheKey(owner, projectId);

  // Read-through
  try {
    const raw = await redis.get(key);
    if (raw) {
      try {
        return JSON.parse(raw) as ProjectTopology;
      } catch (err) {
        log.warn({ err, key }, "Failed to parse cached topology — falling back");
      }
    }
  } catch (err) {
    log.warn({ err, key }, "Redis GET failed — falling back to DB");
  }

  // Miss / corrupt — load from DB
  const topology = await getProjectTopology(owner, projectId);

  // Write-back. We never block the caller on cache failures.
  try {
    await redis.set(key, JSON.stringify(topology), "EX", DEFAULT_TTL_SEC);
  } catch (err) {
    log.warn({ err, key }, "Redis SET failed — cache will be repopulated next read");
  }

  return topology;
}

/**
 * Invalidate the cache entry for a (project, owner) tuple. Call this from
 * mutation paths that change topology shape: ProjectResource create/update
 * /archive, Workflow create/delete, Gateway create/delete, UserPlugin
 * install/uninstall, etc.
 *
 * The owner tuple is part of the key so callers must pass it. When the
 * caller is a system process that doesn't have a single owner (e.g. a
 * gateway-cascade delete touched by an admin tool), use
 * `invalidateAllOwnersForProject()` instead.
 */
export async function invalidateTopologyCache(
  owner: ProjectResourceOwnerFilter,
  projectId: string,
): Promise<void> {
  if (!isCacheEnabled()) return;
  const key = buildCacheKey(owner, projectId);
  try {
    await redis.del(key);
  } catch (err) {
    // Worst case: stale entries until TTL. Don't crash the mutation.
    log.warn({ err, key }, "Redis DEL failed — relying on TTL expiry");
  }
}

/**
 * Best-effort wide invalidation by `projectId`. Uses a SCAN over the
 * `topology:v1:*:*:{projectId}` pattern. SCAN is cooperative — it does not
 * block the Redis main thread the way KEYS does — but in cluster mode the
 * scan is per-node so every shard is consulted.
 *
 * Use sparingly: this is the right tool for "project deleted, drop every
 * cached snapshot of it" but not for routine mutations (those should pass
 * the owner tuple to `invalidateTopologyCache`).
 */
export async function invalidateAllOwnersForProject(
  projectId: string,
): Promise<void> {
  if (!isCacheEnabled()) return;

  const matchPattern = `${KEY_PREFIX}:*:*:${projectId}`;

  try {
    // ioredis scanStream works for both single and cluster modes.
    // The `as { scanStream?: ... }` shim covers both Redis and Cluster types.
    const client = redis as unknown as {
      scanStream: (opts: { match: string; count: number }) => NodeJS.ReadableStream;
    };
    const stream = client.scanStream({ match: matchPattern, count: 200 });

    const matched: string[] = [];
    for await (const keys of stream as AsyncIterable<string[]>) {
      for (const k of keys) matched.push(k);
    }

    if (matched.length > 0) {
      // Best-effort: del a chunk at a time to bound the per-call payload.
      const chunkSize = 100;
      for (let i = 0; i < matched.length; i += chunkSize) {
        const chunk = matched.slice(i, i + chunkSize);
        await redis.del(...chunk);
      }
    }
  } catch (err) {
    log.warn(
      { err, projectId, matchPattern },
      "Wide topology cache invalidate failed — relying on TTL expiry",
    );
  }
}
