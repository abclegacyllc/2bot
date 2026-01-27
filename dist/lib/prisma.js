"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.getPrisma = getPrisma;
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
/**
 * Prisma client with lazy initialization
 *
 * IMPORTANT: We use lazy initialization because this module may be imported
 * before dotenv loads environment variables. The connection string is read
 * when getPrisma() is first called, not at module load time.
 */
const globalForPrisma = globalThis;
function getConnectionString() {
    const connStr = process.env.DATABASE_URL;
    if (!connStr) {
        console.error("❌ DATABASE_URL is not set! Using fallback (this may fail)");
        console.error("   Make sure dotenv is loaded before importing prisma");
        return "postgresql://postgres:postgres@localhost:5432/2bot_dev?schema=public";
    }
    return connStr;
}
function createPrismaClient() {
    const connectionString = getConnectionString();
    // Debug log (only in development)
    if (process.env.NODE_ENV === "development") {
        console.log(`🔗 Prisma connecting to: ${connectionString.replace(/:[^:@]+@/, ':***@')}`);
    }
    const pool = globalForPrisma.pool ?? new pg_1.Pool({ connectionString });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    if (process.env.NODE_ENV !== "production") {
        globalForPrisma.pool = pool;
    }
    return new client_1.PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
}
/**
 * Get the Prisma client instance (lazy initialization)
 * Use this function instead of importing `prisma` directly if you need
 * to ensure environment variables are loaded first.
 */
function getPrisma() {
    if (!globalForPrisma.prisma) {
        globalForPrisma.prisma = createPrismaClient();
    }
    return globalForPrisma.prisma;
}
// For backwards compatibility - but prefer getPrisma() for new code
// This uses a getter to defer initialization
let _prismaInstance;
exports.prisma = new Proxy({}, {
    get(_target, prop) {
        if (!_prismaInstance) {
            _prismaInstance = getPrisma();
        }
        return _prismaInstance[prop];
    },
});
exports.default = exports.prisma;
//# sourceMappingURL=prisma.js.map