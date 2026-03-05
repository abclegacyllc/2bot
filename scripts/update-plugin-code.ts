/**
 * One-time script: Update built-in plugin code_bundle in the database
 * to use the new event-driven container templates.
 *
 * Usage: npx tsx scripts/update-plugin-code.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { Pool } from "pg";
import { PLUGIN_TEMPLATES } from "../src/modules/plugin/plugin-templates";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:2BotDevPg2026Secure@localhost:5432/2bot_production?schema=public";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Update analytics plugin code_bundle
  const analyticsTpl = PLUGIN_TEMPLATES.find((t) => t.id === "channel-analytics");
  if (analyticsTpl) {
    const result = await prisma.plugin.updateMany({
      where: { slug: "analytics" },
      data: { codeBundle: analyticsTpl.code },
    });
    console.log(`[analytics] Updated ${result.count} plugin(s) with code_bundle (${analyticsTpl.code.length} chars)`);
  } else {
    console.error("[analytics] Template 'channel-analytics' not found!");
  }

  // 2. Update echo bot plugin code_bundle (catalog)
  const echoBotTpl = PLUGIN_TEMPLATES.find((t) => t.id === "echo-bot");
  if (echoBotTpl) {
    const result = await prisma.plugin.updateMany({
      where: { slug: { contains: "echo-bot" } },
      data: { codeBundle: echoBotTpl.code },
    });
    console.log(`[echo-bot] Updated ${result.count} plugin(s) with code_bundle (${echoBotTpl.code.length} chars)`);

    // UserPlugin.codeBundle has been removed (Phase 2).
    // Plugin code now lives on the workspace container filesystem.
    // Only Plugin.codeBundle (catalog template) is updated above.
  }

  // 3. Summary
  const allPlugins = await prisma.plugin.findMany({
    select: { slug: true, name: true, codeBundle: true },
  });

  console.log("\n--- Plugin code_bundle summary ---");
  for (const p of allPlugins) {
    console.log(`  ${p.slug}: ${p.codeBundle ? `${p.codeBundle.length} chars` : "NULL (no code)"}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
