/**
 * Phase D migration — move USER-authored plugin code out of the business DB.
 *
 * For every `Plugin` where `authorType = 'USER'` and `codeBundle IS NOT NULL`:
 *   1. Look up the author's RUNNING workspace container and installation.
 *   2. Verify the entry file exists on the container filesystem.
 *   3. In `--apply` mode, populate `Plugin.manifest` with catalog metadata
 *      (if missing) and NULL out `Plugin.codeBundle` so the DB no longer
 *      stores user source code.
 *   4. Skip any plugin whose FS presence cannot be verified — those are
 *      reported so the user can be contacted / their container restored
 *      before the DB copy is discarded.
 *
 * Default mode is dry-run. Pass `--apply` to actually write.
 *
 * Usage:
 *   npx tsx scripts/migrate-user-plugins-to-container.ts         # dry run
 *   npx tsx scripts/migrate-user-plugins-to-container.ts --apply # live
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import "dotenv/config";
import { Pool } from "pg";
import { bridgeClientManager } from "../src/modules/workspace/bridge-client.service";
import { getPluginEntryPath, isDirectoryLayout } from "../src/modules/plugin/plugin-deploy.service";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:2BotDevPg2026Secure@localhost:5432/2bot_production?schema=public";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

interface Row {
  pluginId: string;
  slug: string;
  authorId: string | null;
  hasFile: boolean;
  entryFile: string;
  containerId: string | null;
  reason: string;
}

async function main() {
  console.log(`\n=== Phase D migration — mode: ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

  const userPlugins = await prisma.plugin.findMany({
    where: {
      authorType: "USER",
      codeBundle: { not: null },
    },
    select: {
      id: true,
      slug: true,
      authorId: true,
      codeBundle: true,
      manifest: true,
      name: true,
      description: true,
      category: true,
      tags: true,
      configSchema: true,
      requiredGateways: true,
      eventTypes: true,
      eventRole: true,
      conflictsWith: true,
      version: true,
    },
  });
  console.log(`Found ${userPlugins.length} USER plugin(s) with codeBundle set.`);

  const rows: Row[] = [];
  let migrated = 0;
  let skipped = 0;

  for (const plugin of userPlugins) {
    if (!plugin.authorId) {
      rows.push({
        pluginId: plugin.id,
        slug: plugin.slug,
        authorId: null,
        hasFile: false,
        entryFile: "",
        containerId: null,
        reason: "no author — skipping",
      });
      skipped++;
      continue;
    }

    // Find author's running container
    const container = await prisma.workspaceContainer.findFirst({
      where: { userId: plugin.authorId, status: "RUNNING" },
      select: { id: true },
    });

    if (!container) {
      rows.push({
        pluginId: plugin.id,
        slug: plugin.slug,
        authorId: plugin.authorId,
        hasFile: false,
        entryFile: "",
        containerId: null,
        reason: "author has no RUNNING container — cannot verify FS",
      });
      skipped++;
      continue;
    }

    const client = bridgeClientManager.getExistingClient(container.id);
    if (!client) {
      rows.push({
        pluginId: plugin.id,
        slug: plugin.slug,
        authorId: plugin.authorId,
        hasFile: false,
        entryFile: "",
        containerId: container.id,
        reason: "container bridge not connected",
      });
      skipped++;
      continue;
    }

    // Find the installation so we know the exact entry path used
    const install = await prisma.userPlugin.findFirst({
      where: { userId: plugin.authorId, pluginId: plugin.id },
      select: { entryFile: true, gatewayId: true },
    });
    const entryFile =
      install?.entryFile ??
      getPluginEntryPath(install?.gatewayId ?? null, plugin.slug, {
        isDirectory: isDirectoryLayout(plugin.slug),
      });

    let hasFile = false;
    try {
      await client.fileRead(entryFile);
      hasFile = true;
    } catch {
      hasFile = false;
    }

    if (!hasFile) {
      rows.push({
        pluginId: plugin.id,
        slug: plugin.slug,
        authorId: plugin.authorId,
        hasFile: false,
        entryFile,
        containerId: container.id,
        reason: `entry file '${entryFile}' not found on container FS — DB copy is the only source, keep it`,
      });
      skipped++;
      continue;
    }

    // Good candidate: FS has the file. Build manifest if missing and null out codeBundle.
    const manifestObj = (plugin.manifest as Record<string, unknown> | null) ?? {
      name: plugin.name,
      slug: plugin.slug,
      version: plugin.version,
      entry: entryFile.split("/").pop() ?? "index.js",
      description: plugin.description,
      category: plugin.category,
      tags: plugin.tags,
      requiredGateways: plugin.requiredGateways,
      configSchema: plugin.configSchema,
      eventTypes: plugin.eventTypes,
      eventRole: plugin.eventRole,
      conflictsWith: plugin.conflictsWith,
      files: [entryFile.split("/").pop() ?? "index.js"],
    };

    if (APPLY) {
      await prisma.plugin.update({
        where: { id: plugin.id },
        data: {
          codeBundle: null,
          manifest: manifestObj as Prisma.InputJsonValue,
        },
      });
    }

    rows.push({
      pluginId: plugin.id,
      slug: plugin.slug,
      authorId: plugin.authorId,
      hasFile: true,
      entryFile,
      containerId: container.id,
      reason: APPLY ? "migrated: codeBundle nulled, manifest set" : "would migrate",
    });
    migrated++;
  }

  console.log("\n--- Report ---");
  for (const r of rows) {
    const icon = r.hasFile ? "✓" : "✗";
    console.log(`${icon} ${r.slug.padEnd(40)} ${r.reason}`);
  }

  console.log("\n--- Summary ---");
  console.log(`Plugins inspected: ${userPlugins.length}`);
  console.log(`${APPLY ? "Migrated" : "Would migrate"}: ${migrated}`);
  console.log(`Skipped (FS unverified): ${skipped}`);
  if (!APPLY && migrated > 0) {
    console.log("\nRun again with --apply to perform the migration.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
