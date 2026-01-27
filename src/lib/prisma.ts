import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

/**
 * Prisma client with lazy initialization
 * 
 * IMPORTANT: We use lazy initialization because this module may be imported
 * before dotenv loads environment variables. The connection string is read
 * when getPrisma() is first called, not at module load time.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function getConnectionString(): string {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error("❌ DATABASE_URL is not set! Using fallback (this may fail)");
    console.error("   Make sure dotenv is loaded before importing prisma");
    return "postgresql://postgres:postgres@localhost:5432/2bot_dev?schema=public";
  }
  return connStr;
}

function createPrismaClient(): PrismaClient {
  const connectionString = getConnectionString();
  
  // Debug log (only in development)
  if (process.env.NODE_ENV === "development") {
    console.log(`🔗 Prisma connecting to: ${connectionString.replace(/:[^:@]+@/, ':***@')}`);
  }
  
  const pool = globalForPrisma.pool ?? new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pool = pool;
  }

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
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

export default prisma;
