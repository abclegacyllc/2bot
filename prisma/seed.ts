import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcrypt";
import { Pool } from "pg";

import { getAllBuiltinPluginSeedData } from "../src/modules/plugin/handlers";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5432/twobot?schema=public",
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 12;

async function main() {
  // eslint-disable-next-line no-console
  console.log("🌱 Starting database seed...");

  // Clean existing data (for development only)
  await prisma.userPlugin.deleteMany();
  await prisma.plugin.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  // Hash default passwords
  const testPassword = await hash("test1234", SALT_ROUNDS);
  const adminPassword = await hash("admin1234", SALT_ROUNDS);

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
      email: "admin@2bot.dev",
      passwordHash: adminPassword,
      name: "Admin User",
      plan: "PRO",
      role: UserRole.ADMIN,
    },
  });

  // eslint-disable-next-line no-console
  console.log("✅ Created admin user:", adminUser.email);

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
  console.log("📝 Test credentials: test@example.com / test1234");
  // eslint-disable-next-line no-console
  console.log("📝 Admin credentials: admin@2bot.dev / admin1234");
}

main()
  .catch((e) => {
     
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
