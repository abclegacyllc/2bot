import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "@prisma/client";
import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcrypt";
import dotenv from "dotenv";
import fs from "fs";
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
  console.log("🌱 Starting database seed...");
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
  console.log("✅ Created credit wallet for admin user (PRO: 2000 credits)");

  // ===========================================
  // Seed Built-in Plugins (from handler definitions)
  // ===========================================
  
  console.log("\n📦 Seeding plugins...");

  // Phase 1: Seed from builtin handler definitions (analytics — has server-side handler)
  const pluginSeeds = getAllBuiltinPluginSeedData();

  for (const seedData of pluginSeeds) {
    const plugin = await prisma.plugin.upsert({
      where: { slug: seedData.slug },
      update: seedData,
      create: seedData,
    });
    console.log(`✅ Seeded plugin (handler): ${plugin.name}`);
  }

  // Phase 2: Seed from marketplace filesystem manifests
  const marketplaceDir = path.resolve(process.cwd(), "marketplace", "plugins");
  let manifestCount = 0;

  if (fs.existsSync(marketplaceDir)) {
    const slugDirs = fs.readdirSync(marketplaceDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const slugDir of slugDirs) {
      const slug = slugDir.name;
      const slugPath = path.join(marketplaceDir, slug);

      // Find latest version
      const versions = fs.readdirSync(slugPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
        .reverse();

      if (versions.length === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const latestVersion = versions[0]!;
      const manifestPath = path.join(slugPath, latestVersion, "plugin.json");

      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const bundlePath = `plugins/${slug}/${latestVersion}`;

        // Skip if already seeded by handler (e.g. analytics)
        const existing = await prisma.plugin.findUnique({ where: { slug: manifest.slug } });
        if (existing) {
          // Update bundlePath if missing
          if (!existing.bundlePath) {
            await prisma.plugin.update({
              where: { slug: manifest.slug },
              data: { bundlePath },
            });
            console.log(`🔗 Updated bundlePath for: ${manifest.name}`);
          }
          continue;
        }

        const seedData: Prisma.PluginCreateInput = {
          slug: manifest.slug,
          name: manifest.name,
          description: manifest.description,
          version: manifest.version,
          category: manifest.category,
          requiredGateways: manifest.requiredGateways ?? [],
          configSchema: manifest.configSchema ?? {},
          tags: manifest.tags ?? [],
          icon: manifest.icon ?? null,
          isBuiltin: manifest.isBuiltin ?? true,
          bundlePath,
          eventTypes: manifest.eventTypes ?? [],
          eventRole: manifest.eventRole ?? "responder",
          authorType: "SYSTEM",
          isPublic: true,
          isActive: true,
        };

        const plugin = await prisma.plugin.create({ data: seedData });
        manifestCount++;
        console.log(`✅ Seeded plugin (manifest): ${plugin.name}`);
      } catch (err) {
        console.error(`❌ Failed to seed ${slug}:`, err);
      }
    }
  }

  console.log(`\n📦 Total plugins seeded: ${pluginSeeds.length} (handlers) + ${manifestCount} (manifests)`);

  // Update bundlePath for handler-seeded plugins that have marketplace bundles
  for (const seedData of pluginSeeds) {
    const slug = seedData.slug;
    // Map analytics handler slug to marketplace slug
    const marketplaceSlug = slug === "analytics" ? "channel-analytics" : slug;
    const bundleDir = path.join(marketplaceDir, marketplaceSlug);
    if (fs.existsSync(bundleDir)) {
      const versions = fs.readdirSync(bundleDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
        .reverse();
      if (versions.length > 0) {
        await prisma.plugin.update({
          where: { slug },
          data: { bundlePath: `plugins/${marketplaceSlug}/${versions[0]}` },
        });
      }
    }
  }

  console.log("\n🎉 Database seeded successfully!");
  console.log("📝 Test credentials: test@example.com / 12345678test");
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
    console.log("👋 Database connection closed");
    process.exit(0);
  });
