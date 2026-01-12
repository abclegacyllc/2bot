import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5432/twobot?schema=public",
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // eslint-disable-next-line no-console
  console.log("🌱 Starting database seed...");

  // Clean existing data (for development only)
  await prisma.user.deleteMany();

  // Create test user
  const testUser = await prisma.user.create({
    data: {
      email: "test@example.com",
      name: "Test User",
    },
  });

  // eslint-disable-next-line no-console
  console.log("✅ Created test user:", testUser.email);

  // Create admin user
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@2bot.dev",
      name: "Admin User",
    },
  });

  // eslint-disable-next-line no-console
  console.log("✅ Created admin user:", adminUser.email);

  // eslint-disable-next-line no-console
  console.log("🎉 Database seeded successfully!");
}

main()
  .catch((e) => {
     
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
