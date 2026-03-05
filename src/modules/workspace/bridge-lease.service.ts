/**
 * Bridge Connection Lease Service
 *
 * Prevents multiple server instances (e.g., dev on port 3006 + prod on port 3002)
 * from simultaneously connecting to the same workspace bridge agent.
 *
 * The bridge agent only allows ONE platform connection at a time. When two servers
 * both try to connect, they enter a "connection storm" — each one evicts the other
 * in a rapid loop, dropping events and crashing plugins.
 *
 * Solution: Redis-based leases. Before connecting to a bridge, a server must acquire
 * a lease. The lease has a TTL (auto-expires if the server crashes) and is renewed
 * periodically. Only the lease holder is allowed to connect.
 *
 * Rules:
 *   1. First server to acquire a lease for a container wins.
 *   2. A server can only connect to bridges it holds leases for.
 *   3. Leases auto-expire after LEASE_TTL_SECONDS if not renewed (crash safety).
 *   4. On graceful shutdown, all leases are released immediately.
 *   5. A server can forcefully steal a lease if the holder is unreachable.
 *
 * @module modules/workspace/bridge-lease.service
 */

import crypto from 'crypto';

import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';

const log = logger.child({ module: 'workspace:bridge-lease' });

// ===========================================
// Configuration
// ===========================================

/** Lease TTL in seconds — auto-expires if server crashes without releasing */
const LEASE_TTL_SECONDS = 60;

/** Lease renewal interval — renew leases before they expire */
const LEASE_RENEW_INTERVAL_MS = 20_000; // 20s (renew at 1/3 of TTL)

/** Redis key prefix for bridge leases */
const LEASE_KEY_PREFIX = 'bridge:lease:';

// ===========================================
// Server Instance Identity
// ===========================================

/**
 * Unique identity for this server instance.
 * Composed of port + random suffix to handle restarts on the same port.
 */
const SERVER_PORT = process.env.SERVER_PORT || '3002';
const INSTANCE_NONCE = crypto.randomBytes(4).toString('hex');

/** Unique identifier for this server process */
export const SERVER_INSTANCE_ID = `server:${SERVER_PORT}:${INSTANCE_NONCE}:${process.pid}`;

// ===========================================
// Lease Service
// ===========================================

class BridgeLeaseService {
  /** Containers this instance holds leases for */
  private heldLeases: Set<string> = new Set();

  /** Renewal timer handle */
  private renewalTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether the service has been started */
  private started = false;

  /**
   * Start the lease service — begins periodic renewal of held leases.
   * On startup, steals any stale leases from previous instances on the same port
   * (covers server restarts where the old process dies without releasing leases).
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    log.info({ instanceId: SERVER_INSTANCE_ID }, 'Bridge lease service started');

    // Steal stale leases from previous instances on the same port.
    // When server restarts, the new process gets a new nonce/PID, so it can't
    // reclaim leases from its predecessor. We detect same-port predecessors and
    // take over their leases since only one server can run per port.
    this.reclaimStaleLeases().catch(err => {
      log.warn({ error: err.message }, 'Failed to reclaim stale leases on startup');
    });

    this.renewalTimer = setInterval(() => {
      this.renewAll().catch(err => {
        log.error({ error: err.message }, 'Failed to renew bridge leases');
      });
    }, LEASE_RENEW_INTERVAL_MS);
  }

  /**
   * Stop the lease service and release all held leases.
   */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
      this.renewalTimer = null;
    }

    await this.releaseAll();
    log.info({ instanceId: SERVER_INSTANCE_ID }, 'Bridge lease service stopped — all leases released');
  }

  /**
   * Try to acquire a lease for a container's bridge connection.
   *
   * If the lease is held by another instance on the SAME port (e.g., a zombie
   * process from a previous server restart), we steal it — only one server can
   * run per port, so the old holder is guaranteed stale.
   *
   * @returns true if this instance now holds the lease, false if another instance holds it
   */
  async acquire(containerDbId: string): Promise<boolean> {
    const key = LEASE_KEY_PREFIX + containerDbId;

    // Atomic SET-if-not-exists with TTL
    const result = await redis.set(key, SERVER_INSTANCE_ID, 'EX', LEASE_TTL_SECONDS, 'NX');

    if (result === 'OK') {
      // We acquired the lease
      this.heldLeases.add(containerDbId);
      log.debug({ containerDbId, instanceId: SERVER_INSTANCE_ID }, 'Bridge lease acquired');
      return true;
    }

    // Someone else holds it — check if it's us (e.g., from a previous call)
    const holder = await redis.get(key);
    if (holder === SERVER_INSTANCE_ID) {
      // We already hold it — just refresh TTL
      await redis.expire(key, LEASE_TTL_SECONDS);
      this.heldLeases.add(containerDbId);
      return true;
    }

    // Check if the holder is a previous instance on the SAME port.
    // Format: "server:PORT:NONCE:PID" — if port matches but nonce/PID differ,
    // the holder is a zombie from a previous restart. Steal the lease.
    if (holder && this.isSamePortDifferentInstance(holder)) {
      log.warn(
        { containerDbId, staleHolder: holder, newHolder: SERVER_INSTANCE_ID },
        'Stealing bridge lease from stale same-port instance (server was restarted)'
      );
      await redis.set(key, SERVER_INSTANCE_ID, 'EX', LEASE_TTL_SECONDS);
      this.heldLeases.add(containerDbId);
      return true;
    }

    log.debug(
      { containerDbId, holder, thisInstance: SERVER_INSTANCE_ID },
      'Bridge lease held by another instance — skipping connection'
    );
    return false;
  }

  /**
   * Check if a lease holder is a different instance running on the same port.
   * This means it's a zombie from a previous server restart.
   */
  private isSamePortDifferentInstance(holder: string): boolean {
    // Both IDs follow format: "server:PORT:NONCE:PID"
    const holderParts = holder.split(':');
    const myParts = SERVER_INSTANCE_ID.split(':');
    // Same prefix ("server") and same port, but different nonce or PID
    return (
      holderParts[0] === 'server' &&
      myParts[0] === 'server' &&
      holderParts[1] === myParts[1] && // same port
      holder !== SERVER_INSTANCE_ID     // different instance
    );
  }

  /**
   * Check if this instance holds the lease for a container.
   */
  async holdsLease(containerDbId: string): Promise<boolean> {
    // Fast path: check local set first
    if (!this.heldLeases.has(containerDbId)) return false;

    // Verify in Redis (lease may have expired)
    const key = LEASE_KEY_PREFIX + containerDbId;
    const holder = await redis.get(key);

    if (holder === SERVER_INSTANCE_ID) {
      return true;
    }

    // Lease expired or stolen — remove from local set
    this.heldLeases.delete(containerDbId);
    return false;
  }

  /**
   * Check who holds the lease for a container (for debugging).
   */
  async getHolder(containerDbId: string): Promise<string | null> {
    const key = LEASE_KEY_PREFIX + containerDbId;
    return redis.get(key);
  }

  /**
   * Release the lease for a specific container.
   * Only releases if this instance is the current holder (prevents releasing someone else's lease).
   */
  async release(containerDbId: string): Promise<void> {
    const key = LEASE_KEY_PREFIX + containerDbId;

    // Atomic check-and-delete: only delete if we're the holder
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, key, SERVER_INSTANCE_ID);
    this.heldLeases.delete(containerDbId);

    log.debug({ containerDbId }, 'Bridge lease released');
  }

  /**
   * On startup, scan all bridge leases and steal any held by a previous instance
   * on the same port. This handles the case where `make stop` kills the parent
   * process but a child node process survives and keeps renewing its leases.
   *
   * Only steals from same-port instances — leases from other ports (e.g., prod
   * server on 3002 while dev is on 3006) are respected.
   */
  private async reclaimStaleLeases(): Promise<void> {
    const keys = await redis.keys(LEASE_KEY_PREFIX + '*');
    if (keys.length === 0) return;

    let reclaimed = 0;
    for (const key of keys) {
      const holder = await redis.get(key);
      if (holder && this.isSamePortDifferentInstance(holder)) {
        const containerDbId = key.slice(LEASE_KEY_PREFIX.length);
        log.info(
          { containerDbId, staleHolder: holder, newHolder: SERVER_INSTANCE_ID },
          'Reclaiming stale bridge lease from previous server instance'
        );
        await redis.set(key, SERVER_INSTANCE_ID, 'EX', LEASE_TTL_SECONDS);
        this.heldLeases.add(containerDbId);
        reclaimed++;
      }
    }

    if (reclaimed > 0) {
      log.info({ reclaimed }, 'Reclaimed stale bridge leases from previous server instance');
    }
  }

  /**
   * Release all leases held by this instance.
   * Called during graceful shutdown.
   */
  async releaseAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const containerDbId of this.heldLeases) {
      promises.push(this.release(containerDbId));
    }
    await Promise.allSettled(promises);
    this.heldLeases.clear();
  }

  /**
   * Renew all held leases (refresh TTL).
   */
  private async renewAll(): Promise<void> {
    if (this.heldLeases.size === 0) return;

    const pipeline = redis.pipeline();
    const toRemove: string[] = [];

    for (const containerDbId of this.heldLeases) {
      const key = LEASE_KEY_PREFIX + containerDbId;
      // Only renew if we're still the holder
      pipeline.eval(
        `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end`,
        1,
        key,
        SERVER_INSTANCE_ID,
        LEASE_TTL_SECONDS.toString()
      );
    }

    const results = await pipeline.exec();

    // Check which leases we lost
    let i = 0;
    for (const containerDbId of this.heldLeases) {
      const entry = results?.[i];
      if (entry) {
        const err = entry[0];
        const result = entry[1];
        if (err || result === 0) {
          toRemove.push(containerDbId);
          log.warn({ containerDbId }, 'Bridge lease lost during renewal — another instance may have taken it');
        }
      }
      i++;
    }

    for (const id of toRemove) {
      this.heldLeases.delete(id);
    }

    if (this.heldLeases.size > 0) {
      log.debug({ count: this.heldLeases.size }, 'Bridge leases renewed');
    }
  }

  /**
   * Get the number of leases held by this instance.
   */
  get leaseCount(): number {
    return this.heldLeases.size;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const bridgeLeaseService = new BridgeLeaseService();
