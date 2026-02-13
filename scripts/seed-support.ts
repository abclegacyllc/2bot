/**
 * Support System Seed Script
 * 
 * Standalone script to seed KB articles and quick issues.
 * Reads markdown files from docs/articles/ and imports them into the database.
 * 
 * SEPARATE from the main prisma/seed.ts — run independently:
 *   npx tsx scripts/seed-support.ts
 * 
 * Options:
 *   --clean    Delete existing KB articles and quick issues before seeding
 *   --articles Only seed articles (skip quick issues)
 *   --issues   Only seed quick issues (skip articles)
 * 
 * @module scripts/seed-support
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set!");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Parse CLI flags
const args = process.argv.slice(2);
const doClean = args.includes("--clean");
const onlyArticles = args.includes("--articles");
const onlyIssues = args.includes("--issues");

const ARTICLES_DIR = path.resolve(process.cwd(), "docs/articles");
const QUICK_ISSUES_FILE = path.resolve(ARTICLES_DIR, "quick-issues.json");

// ===========================================
// Frontmatter parser (simple YAML-like)
// ===========================================

interface ArticleFrontmatter {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
}

function parseFrontmatter(raw: string): { meta: ArticleFrontmatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("No frontmatter found");
  }

  const frontmatterBlock = match[1] ?? '';
  const content = (match[2] ?? '').trim();

  const meta: Record<string, string | string[]> = {};
  for (const line of frontmatterBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    // Parse array values: [tag1, tag2]
    if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim());
    } else {
      meta[key] = value;
    }
  }

  return {
    meta: meta as unknown as ArticleFrontmatter,
    content,
  };
}

// ===========================================
// Seed Articles
// ===========================================

async function seedArticles() {
  console.log("\n📚 Seeding KB Articles from docs/articles/...");

  // Find admin user to assign as author
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });

  if (!adminUser) {
    console.error("❌ No ADMIN user found. Create an admin user first.");
    process.exit(1);
  }
  console.log(`👤 Using author: ${adminUser.email}`);

  // Read all .md files (except README.md)
  const files = fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md");

  if (files.length === 0) {
    console.log("⚠️  No article files found in docs/articles/");
    return;
  }

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");
      const { meta, content } = parseFrontmatter(raw);

      if (!meta.slug || !meta.title || !meta.category) {
        console.log(`⚠️  Skipping ${file} — missing required frontmatter (slug, title, category)`);
        errors++;
        continue;
      }

      const articleData = {
        title: meta.title,
        content,
        excerpt: meta.excerpt || null,
        category: meta.category,
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        isPublished: true,
        publishedAt: new Date(),
        authorId: adminUser.id,
      };

      // Upsert: update if slug exists, create if not
      const existing = await prisma.kBArticle.findUnique({
        where: { slug: meta.slug },
      });

      if (existing) {
        await prisma.kBArticle.update({
          where: { slug: meta.slug },
          data: articleData,
        });
        console.log(`🔄 Updated: ${meta.title}`);
        updated++;
      } else {
        await prisma.kBArticle.create({
          data: { slug: meta.slug, ...articleData },
        });
        console.log(`✅ Created: ${meta.title}`);
        created++;
      }
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  console.log(`\n📚 Articles: ${created} created, ${updated} updated, ${errors} errors`);
}

// ===========================================
// Seed Quick Issues
// ===========================================

async function seedQuickIssues() {
  console.log("\n⚡ Seeding Quick Issues from docs/articles/quick-issues.json...");

  if (!fs.existsSync(QUICK_ISSUES_FILE)) {
    console.log("⚠️  quick-issues.json not found, skipping");
    return;
  }

  const raw = fs.readFileSync(QUICK_ISSUES_FILE, "utf-8");
  const issues = JSON.parse(raw) as Array<{
    title: string;
    description: string;
    suggestedType: string;
    suggestedCategory: string;
    articleSlug: string | null;
    icon: string;
    sortOrder: number;
  }>;

  let created = 0;
  let updated = 0;

  for (const issue of issues) {
    // Check if a quick issue with this title already exists
    const existing = await prisma.quickIssue.findFirst({
      where: { title: issue.title },
    });

    const data = {
      title: issue.title,
      description: issue.description,
      suggestedType: issue.suggestedType,
      suggestedCategory: issue.suggestedCategory,
      articleSlug: issue.articleSlug,
      icon: issue.icon,
      sortOrder: issue.sortOrder,
      isActive: true,
    };

    if (existing) {
      await prisma.quickIssue.update({
        where: { id: existing.id },
        data,
      });
      console.log(`🔄 Updated: ${issue.title}`);
      updated++;
    } else {
      await prisma.quickIssue.create({ data });
      console.log(`✅ Created: ${issue.title}`);
      created++;
    }
  }

  console.log(`\n⚡ Quick Issues: ${created} created, ${updated} updated`);
}

// ===========================================
// Clean
// ===========================================

async function clean() {
  console.log("🧹 Cleaning existing support data...");
  await prisma.quickIssue.deleteMany();
  await prisma.kBArticle.deleteMany();
  console.log("✅ Cleaned KB articles and quick issues");
}

// ===========================================
// Main
// ===========================================

async function main() {
  console.log("🌱 Support System Seed");
  console.log(`📍 Database: ${DATABASE_URL?.replace(/:[^:@]+@/, ":***@") || "Unknown"}`);

  if (doClean) {
    await clean();
  }

  if (!onlyIssues) {
    await seedArticles();
  }

  if (!onlyArticles) {
    await seedQuickIssues();
  }

  console.log("\n🎉 Support seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
