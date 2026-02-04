/**
 * DataClient - Tenant-Aware Database Access Layer
 *
 * Provides a thin abstraction over Prisma that automatically handles:
 * - Tenant filtering on queries (userId/organizationId)
 * - Future database routing for isolated tenants
 *
 * NOW: Thin wrapper around Prisma with automatic tenant filtering
 * FUTURE: Routes to correct database based on tenant isolation level
 *
 * @module shared/lib/data-client
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/prisma';

import type {
    ServiceContext,
    TenantContext,
    TenantFilter,
} from '../types/context';
import { createTenantContext } from '../types/context';

// ===========================================
// Connection Management
// ===========================================

/**
 * Connection pool for isolated databases (future)
 * Map<tenantId, PrismaClient>
 */
const connectionPool = new Map<string, PrismaClient>();

/**
 * Get or create a connection for an isolated tenant
 * FUTURE: Implement connection pooling per tenant
 * Note: Requires dynamic datasource support in production
 */
function getOrCreateConnection(tenantId: string, _databaseUrl: string): PrismaClient {
  if (!connectionPool.has(tenantId)) {
    // FUTURE: Use databaseUrl when Prisma supports dynamic datasources
    // For now, we log a warning and use the default connection
    console.warn(
      `[DataClient] Isolated database requested for ${tenantId} but dynamic datasources not yet implemented. Using default.`
    );
    connectionPool.set(tenantId, prisma);
  }
  return connectionPool.get(tenantId)!;
}

/**
 * Close connection for a tenant (cleanup)
 */
export async function closeTenantConnection(tenantId: string): Promise<void> {
  const client = connectionPool.get(tenantId);
  if (client && client !== prisma) {
    await client.$disconnect();
  }
  connectionPool.delete(tenantId);
}

/**
 * Close all tenant connections (shutdown)
 */
export async function closeAllTenantConnections(): Promise<void> {
  const promises = Array.from(connectionPool.entries())
    .filter(([_, client]) => client !== prisma)
    .map(([_, client]) => client.$disconnect());
  await Promise.all(promises);
  connectionPool.clear();
}

// ===========================================
// DataClient Class
// ===========================================

/**
 * DataClient - Tenant-aware database access
 *
 * Usage:
 * ```typescript
 * const db = getDataClient(ctx);
 * const gateways = await db.gateway.findMany(); // Auto-filtered!
 * ```
 */
export class DataClient {
  private ctx: TenantContext;
  private _prisma: PrismaClient;

  constructor(ctx: TenantContext) {
    this.ctx = ctx;
    this._prisma = this.resolveConnection();
  }

  /**
   * Resolve which database connection to use
   * NOW: Always returns global Prisma client
   * FUTURE: Route based on ctx.isolationLevel and ctx.databaseUrl
   */
  private resolveConnection(): PrismaClient {
    if (this.ctx.isIsolated() && this.ctx.databaseUrl) {
      return getOrCreateConnection(this.ctx.tenantId, this.ctx.databaseUrl);
    }
    return prisma;
  }

  /**
   * Get tenant filter for automatic WHERE clause injection
   */
  getTenantFilter(): TenantFilter {
    return this.ctx.getTenantFilter();
  }

  /**
   * Get ownership data for create operations
   * Use this when creating records to ensure proper ownership
   */
  getOwnership() {
    return {
      userId: this.ctx.userId,
      organizationId: this.ctx.organizationId ?? null,
    };
  }

  // ============================================================
  // Gateway Operations
  // ============================================================

  get gateway() {
    const filter = this.getTenantFilter();

    return {
      findMany: (args?: Parameters<typeof this._prisma.gateway.findMany>[0]) => {
        return this._prisma.gateway.findMany({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findFirst: (args?: Parameters<typeof this._prisma.gateway.findFirst>[0]) => {
        return this._prisma.gateway.findFirst({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findUnique: this._prisma.gateway.findUnique.bind(this._prisma.gateway),
      create: this._prisma.gateway.create.bind(this._prisma.gateway),
      update: this._prisma.gateway.update.bind(this._prisma.gateway),
      delete: this._prisma.gateway.delete.bind(this._prisma.gateway),
      count: (args?: Parameters<typeof this._prisma.gateway.count>[0]) => {
        return this._prisma.gateway.count({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
    };
  }

  // ============================================================
  // UserPlugin Operations
  // ============================================================

  get userPlugin() {
    const filter = this.getTenantFilter();

    return {
      findMany: (args?: Parameters<typeof this._prisma.userPlugin.findMany>[0]) => {
        return this._prisma.userPlugin.findMany({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findFirst: (args?: Parameters<typeof this._prisma.userPlugin.findFirst>[0]) => {
        return this._prisma.userPlugin.findFirst({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findUnique: this._prisma.userPlugin.findUnique.bind(this._prisma.userPlugin),
      create: this._prisma.userPlugin.create.bind(this._prisma.userPlugin),
      update: this._prisma.userPlugin.update.bind(this._prisma.userPlugin),
      delete: this._prisma.userPlugin.delete.bind(this._prisma.userPlugin),
      count: (args?: Parameters<typeof this._prisma.userPlugin.count>[0]) => {
        return this._prisma.userPlugin.count({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
    };
  }

  // ============================================================
  // CreditTransaction Operations
  // ============================================================

  get creditTransaction() {
    const filter = this.getTenantFilter();

    return {
      findMany: (args?: Parameters<typeof this._prisma.creditTransaction.findMany>[0]) => {
        return this._prisma.creditTransaction.findMany({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      create: this._prisma.creditTransaction.create.bind(this._prisma.creditTransaction),
      count: (args?: Parameters<typeof this._prisma.creditTransaction.count>[0]) => {
        return this._prisma.creditTransaction.count({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
    };
  }

  // ============================================================
  // Raw Prisma Access (for platform tables or complex queries)
  // ============================================================

  /**
   * Access raw Prisma client for platform tables
   * WARNING: No automatic tenant filtering - use with caution!
   */
  get $platform() {
    return prisma;
  }

  /**
   * Access the resolved Prisma client (for tenant's database)
   * WARNING: No automatic tenant filtering!
   */
  get $raw() {
    return this._prisma;
  }

  /**
   * Transaction support
   */
  async $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this._prisma.$transaction(fn);
  }

  /**
   * Get current tenant context
   */
  get context(): TenantContext {
    return this.ctx;
  }
}

// ===========================================
// Factory Functions
// ===========================================

/**
 * Get DataClient for a ServiceContext
 * This is the main entry point for services
 *
 * @example
 * ```typescript
 * async findByUser(ctx: ServiceContext): Promise<Gateway[]> {
 *   const db = getDataClient(ctx);
 *   return db.gateway.findMany(); // Filter auto-applied!
 * }
 * ```
 */
export function getDataClient(ctx: ServiceContext): DataClient {
  // Convert ServiceContext to TenantContext
  // FUTURE: Lookup isolation level from Organization or Plan
  const tenantCtx = createTenantContext(ctx);
  return new DataClient(tenantCtx);
}

/**
 * Get DataClient with explicit tenant context
 * Used when you need to specify scope or isolation level
 */
export function getDataClientWithContext(ctx: TenantContext): DataClient {
  return new DataClient(ctx);
}
