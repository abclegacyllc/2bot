import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcrypt";
import { Pool } from "pg";

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
    },
  });

  // eslint-disable-next-line no-console
  console.log("✅ Created admin user:", adminUser.email);

  // eslint-disable-next-line no-console
  console.log("🎉 Database seeded successfully!");
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
