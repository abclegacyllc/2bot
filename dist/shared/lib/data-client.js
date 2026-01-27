"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataClient = void 0;
exports.closeTenantConnection = closeTenantConnection;
exports.closeAllTenantConnections = closeAllTenantConnections;
exports.getDataClient = getDataClient;
exports.getDataClientWithContext = getDataClientWithContext;
const prisma_1 = require("@/lib/prisma");
const context_1 = require("../types/context");
// ===========================================
// Connection Management
// ===========================================
/**
 * Connection pool for isolated databases (future)
 * Map<tenantId, PrismaClient>
 */
const connectionPool = new Map();
/**
 * Get or create a connection for an isolated tenant
 * FUTURE: Implement connection pooling per tenant
 * Note: Requires dynamic datasource support in production
 */
function getOrCreateConnection(tenantId, _databaseUrl) {
    if (!connectionPool.has(tenantId)) {
        // FUTURE: Use databaseUrl when Prisma supports dynamic datasources
        // For now, we log a warning and use the default connection
        console.warn(`[DataClient] Isolated database requested for ${tenantId} but dynamic datasources not yet implemented. Using default.`);
        connectionPool.set(tenantId, prisma_1.prisma);
    }
    return connectionPool.get(tenantId);
}
/**
 * Close connection for a tenant (cleanup)
 */
async function closeTenantConnection(tenantId) {
    const client = connectionPool.get(tenantId);
    if (client && client !== prisma_1.prisma) {
        await client.$disconnect();
    }
    connectionPool.delete(tenantId);
}
/**
 * Close all tenant connections (shutdown)
 */
async function closeAllTenantConnections() {
    const promises = Array.from(connectionPool.entries())
        .filter(([_, client]) => client !== prisma_1.prisma)
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
class DataClient {
    ctx;
    _prisma;
    constructor(ctx) {
        this.ctx = ctx;
        this._prisma = this.resolveConnection();
    }
    /**
     * Resolve which database connection to use
     * NOW: Always returns global Prisma client
     * FUTURE: Route based on ctx.isolationLevel and ctx.databaseUrl
     */
    resolveConnection() {
        if (this.ctx.isIsolated() && this.ctx.databaseUrl) {
            return getOrCreateConnection(this.ctx.tenantId, this.ctx.databaseUrl);
        }
        return prisma_1.prisma;
    }
    /**
     * Get tenant filter for automatic WHERE clause injection
     */
    getTenantFilter() {
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
            findMany: (args) => {
                return this._prisma.gateway.findMany({
                    ...args,
                    where: { ...filter, ...args?.where },
                });
            },
            findFirst: (args) => {
                return this._prisma.gateway.findFirst({
                    ...args,
                    where: { ...filter, ...args?.where },
                });
            },
            findUnique: this._prisma.gateway.findUnique.bind(this._prisma.gateway),
            create: this._prisma.gateway.create.bind(this._prisma.gateway),
            update: this._prisma.gateway.update.bind(this._prisma.gateway),
            delete: this._prisma.gateway.delete.bind(this._prisma.gateway),
            count: (args) => {
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
            findMany: (args) => {
                return this._prisma.userPlugin.findMany({
                    ...args,
                    where: { ...filter, ...args?.where },
                });
            },
            findFirst: (args) => {
                return this._prisma.userPlugin.findFirst({
                    ...args,
                    where: { ...filter, ...args?.where },
                });
            },
            findUnique: this._prisma.userPlugin.findUnique.bind(this._prisma.userPlugin),
            create: this._prisma.userPlugin.create.bind(this._prisma.userPlugin),
            update: this._prisma.userPlugin.update.bind(this._prisma.userPlugin),
            delete: this._prisma.userPlugin.delete.bind(this._prisma.userPlugin),
            count: (args) => {
                return this._prisma.userPlugin.count({
                    ...args,
                    where: { ...filter, ...args?.where },
                });
            },
        };
    }
    // ============================================================
    // CreditBalance Operations
    // ============================================================
    get creditBalance() {
        const filter = this.getTenantFilter();
        return {
            findMany: (args) => {
                return this._prisma.creditBalance.findMany({
                    ...args,
                    where: { ...filter, ...args?.where },
                });
            },
            findFirst: (args) => {
                return this._prisma.creditBalance.findFirst({
                    ...args,
                    where: { ...filter, ...args?.where },
                });
            },
            findUnique: this._prisma.creditBalance.findUnique.bind(this._prisma.creditBalance),
            upsert: this._prisma.creditBalance.upsert.bind(this._prisma.creditBalance),
            update: this._prisma.creditBalance.update.bind(this._prisma.creditBalance),
        };
    }
    // ============================================================
    // CreditTransaction Operations
    // ============================================================
    get creditTransaction() {
        const filter = this.getTenantFilter();
        return {
            findMany: (args) => {
                return this._prisma.creditTransaction.findMany({
                    ...args,
                    where: { ...filter, ...args?.where },
                });
            },
            create: this._prisma.creditTransaction.create.bind(this._prisma.creditTransaction),
            count: (args) => {
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
        return prisma_1.prisma;
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
    async $transaction(fn) {
        return this._prisma.$transaction(fn);
    }
    /**
     * Get current tenant context
     */
    get context() {
        return this.ctx;
    }
}
exports.DataClient = DataClient;
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
function getDataClient(ctx) {
    // Convert ServiceContext to TenantContext
    // FUTURE: Lookup isolation level from Organization or Plan
    const tenantCtx = (0, context_1.createTenantContext)(ctx);
    return new DataClient(tenantCtx);
}
/**
 * Get DataClient with explicit tenant context
 * Used when you need to specify scope or isolation level
 */
function getDataClientWithContext(ctx) {
    return new DataClient(ctx);
}
//# sourceMappingURL=data-client.js.map