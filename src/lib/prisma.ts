import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { readReplicas } from "@prisma/extension-read-replicas";
import { Pool } from "pg";

/**
 * Prisma client with lazy initialization
 * 
 * IMPORTANT: We use lazy initialization because this module may be imported
 * before dotenv loads environment variables. The connection string is read
 * when getPrisma() is first called, not at module load time.
 *
 * Read Replica Routing
 * --------------------------------
 * If `DATABASE_URL_REPLICA` is set (single URL, or comma-separated list of
 * URLs), the `@prisma/extension-read-replicas` extension is applied. The
 * extension auto-routes read operations (findFirst, findMany, count,
 * aggregate, groupBy, findRaw, aggregateRaw) to a randomly-picked replica
 * when not inside a transaction. Writes and transactions keep going to the
 * primary. No call-site changes are required to benefit from this.
 *
 * Optional explicit routing is also exposed: `prismaPrimary` always uses the
 * primary connection (use for read-after-write consistency), and
 * `prismaReplica` always uses a replica (use for analytics queries that you
 * want to keep off the primary even when the extension would otherwise hit
 * primary, e.g. inside a transaction).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
  replicaPools: Pool[] | undefined;
};

function getConnectionString(): string {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error("❌ DATABASE_URL is not set! Using fallback (this may fail)");
    console.error("   Make sure dotenv is loaded before importing prisma");
    return "postgresql://postgres:postgres@localhost:5432/2bot_production?schema=public";
  }
  return connStr;
}

function getReplicaConnectionStrings(): string[] {
  const raw = process.env.DATABASE_URL_REPLICA;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildPrismaClient(connectionString: string, poolMax: number): { client: PrismaClient; pool: Pool } {
  const pool = new Pool({ connectionString, max: poolMax });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  return { client, pool };
}

function createPrismaClient(): PrismaClient {
  const connectionString = getConnectionString();
  
  // Debug log (only in development)
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log(`🔗 Prisma connecting to: ${connectionString.replace(/:[^:@]+@/, ':***@')}`);
  }
  
  // Per-process pool size. Tune via DATABASE_POOL_MAX env var.
  // Multi-replica deployments should keep this small (5-10) and route through
  // PgBouncer (transaction mode) so total backend connections stay bounded.
  // Default kept at 25 for single-replica dev; lower in cluster prod.
  const poolMax = parseInt(process.env.DATABASE_POOL_MAX || "25", 10);

  const pool = globalForPrisma.pool ?? new Pool({ connectionString, max: poolMax });
  const adapter = new PrismaPg(pool);

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pool = pool;
  }

  const primary = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // wire replicas if any are configured.
  const replicaUrls = getReplicaConnectionStrings();
  if (replicaUrls.length === 0) {
    return primary;
  }

  // Replica pools are typically smaller; use DATABASE_REPLICA_POOL_MAX, default
  // to half the primary pool (rounded up) so total backend conns stay bounded.
  const replicaPoolMax = parseInt(
    process.env.DATABASE_REPLICA_POOL_MAX || String(Math.max(1, Math.ceil(poolMax / 2))),
    10,
  );
  const built = replicaUrls.map((url) => buildPrismaClient(url, replicaPoolMax));
  const replicas = built.map((b) => b.client);
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.replicaPools = built.map((b) => b.pool);
  }

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log(`🔗 Prisma read replicas configured: ${replicaUrls.length}`);
  }

  // The extension wraps the client; the resulting type adds $primary()/$replica()
  // but is not assignable to PrismaClient. Cast — runtime behaviour for all
  // existing callers is unchanged (auto-routing only re-targets reads).
  const extended = primary.$extends(readReplicas({ replicas }));
  return extended as unknown as PrismaClient;
}

/**
 * Get the Prisma client instance (lazy initialization)
 * Use this function instead of importing `prisma` directly if you need
 * to ensure environment variables are loaded first.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// For backwards compatibility - but prefer getPrisma() for new code
// This uses a getter to defer initialization
let _prismaInstance: PrismaClient | undefined;

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prismaInstance) {
      _prismaInstance = getPrisma();
    }
    return (_prismaInstance as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Explicit primary access.
 *
 * Use when you need read-after-write consistency and cannot tolerate replica
 * lag (e.g., reading a row immediately after creating it for the same
 * request). When no replicas are configured this is identical to `prisma`.
 *
 *   const fresh = await prismaPrimary.user.findUnique({ where: { id } });
 */
export const prismaPrimary = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prismaInstance) {
      _prismaInstance = getPrisma();
    }
    const inst = _prismaInstance as unknown as {
      $primary?: () => PrismaClient;
    } & Record<string | symbol, unknown>;
    const target = typeof inst.$primary === "function" ? inst.$primary() : (inst as unknown as PrismaClient);
    return (target as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Explicit replica access.
 *
 * Use for read-heavy analytical queries that must NOT hit the primary even
 * when the auto-routing would otherwise (e.g., when called inside a
 * transaction). Returns the primary client when no replicas are configured.
 *
 *   const stats = await prismaReplica.workflowRun.count({ ... });
 */
export const prismaReplica = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prismaInstance) {
      _prismaInstance = getPrisma();
    }
    const inst = _prismaInstance as unknown as {
      $replica?: () => PrismaClient;
    } & Record<string | symbol, unknown>;
    let target: PrismaClient;
    try {
      target = typeof inst.$replica === "function"
        ? inst.$replica()
        : (inst as unknown as PrismaClient);
    } catch {
      // $replica() throws inside a transaction — fall back to primary.
      target = inst as unknown as PrismaClient;
    }
    return (target as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default prisma;
