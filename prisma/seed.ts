import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcrypt";
import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";

import { getAllBuiltinPluginSeedData } from "../src/modules/plugin/handlers";

// Load environment variables BEFORE accessing them
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set!");
  console.error("   Please check your .env or .env.local file");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 12;

async function main() {
  // eslint-disable-next-line no-console
  console.log("🌱 Starting database seed...");
  // eslint-disable-next-line no-console
  console.log(`📍 Using database: ${DATABASE_URL?.replace(/:[^:@]+@/, ':***@') || 'Unknown'}`);

  // Clean existing data (for development only)
  // Order matters: delete dependents first to avoid FK constraint errors
  await prisma.workflowStepRun.deleteMany();
  await prisma.workflowRun.deleteMany();
  await prisma.workflowStep.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.userPlugin.deleteMany();
  await prisma.plugin.deleteMany();
  await prisma.aIUsage.deleteMany();
  await prisma.creditTransaction.deleteMany();
  await prisma.creditWallet.deleteMany();
  await prisma.memberAllocation.deleteMany();
  await prisma.deptAllocation.deleteMany();
  await prisma.departmentMember.deleteMany();
  await prisma.department.deleteMany();
  await prisma.orgInvite.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.alertHistory.deleteMany();
  await prisma.alertConfig.deleteMany();
  await prisma.usageHistory.deleteMany();
  await prisma.gateway.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.creditRate.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  // Hash default passwords
  const testPassword = await hash("12345678test", SALT_ROUNDS);
  const adminPassword = await hash("12345678admin", SALT_ROUNDS);

  // Create test user
  const testUser = await prisma.user.create({
    data: {
      email: "test@example.com",
      passwordHash: testPassword,
      name: "Test User",
      plan: "FREE",
    },
  });

  // eslint-disable-next-line no-console
  console.log("✅ Created test user:", testUser.email);

  // Create admin user
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@2bot.org",
      passwordHash: adminPassword,
      name: "Admin User",
      plan: "PRO",
      role: UserRole.ADMIN,
    },
  });

  // eslint-disable-next-line no-console
  console.log("✅ Created admin user:", adminUser.email);

  // ===========================================
  // Create Credit Wallets for seed users
  // ===========================================
  
  await prisma.creditWallet.create({
    data: {
      userId: testUser.id,
      balance: 15,           // FREE plan monthly allocation
      lifetime: 15,
      monthlyAllocation: 15, // FREE plan: 15 credits/month
      monthlyUsed: 0,
    },
  });
  // eslint-disable-next-line no-console
  console.log("✅ Created credit wallet for test user (FREE: 15 credits)");

  await prisma.creditWallet.create({
    data: {
      userId: adminUser.id,
      balance: 2000,           // PRO plan monthly allocation
      lifetime: 2000,
      monthlyAllocation: 2000, // PRO plan: 2000 credits/month
      monthlyUsed: 0,
    },
  });
  // eslint-disable-next-line no-console
  console.log("✅ Created credit wallet for admin user (PRO: 2000 credits)");

  // ===========================================
  // Seed Built-in Plugins (from handler definitions)
  // ===========================================
  
  // eslint-disable-next-line no-console
  console.log("\n📦 Seeding plugins...");

  const pluginSeeds = getAllBuiltinPluginSeedData();

  for (const seedData of pluginSeeds) {
    const plugin = await prisma.plugin.upsert({
      where: { slug: seedData.slug },
      update: seedData,
      create: seedData,
    });
    // eslint-disable-next-line no-console
    console.log(`✅ Seeded plugin: ${plugin.name}`);
  }

  // eslint-disable-next-line no-console
  console.log(`\n📦 Total plugins seeded: ${pluginSeeds.length}`);

  // eslint-disable-next-line no-console
  console.log("\n🎉 Database seeded successfully!");
  // eslint-disable-next-line no-console
  console.log("📝 Test credentials: test@example.com / 12345678test");
  // eslint-disable-next-line no-console
  console.log("📝 Admin credentials: admin@2bot.org / 12345678admin");
}

main()
  .catch((e) => {
     
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    // eslint-disable-next-line no-console
    console.log("👋 Database connection closed");
    process.exit(0);
  });
