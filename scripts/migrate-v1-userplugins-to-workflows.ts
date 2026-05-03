/**
 * Phase 6.1 — Auto-wrap legacy UserPlugin installs into ACTIVE workflows.
 *
 * Background: prior to Phase 6.1, gateway events reached UserPlugins via two
 * paths simultaneously:
 *   (a) the workflow engine (when an ACTIVE WorkflowStep referenced the plugin),
 *   (b) the legacy V1 dispatch (`handle*Webhook → routeEventToPlugins`),
 *       which scooped up any UserPlugin NOT covered by (a).
 *
 * Phase 6.1 retires path (b). For every UserPlugin that today only runs via
 * path (b), this script materialises a 1-step BOT_MESSAGE workflow so the
 * plugin keeps running once V1 dispatch is disabled.
 *
 * Default mode: dry-run. Pass `--apply` to write.
 *
 * Optional filter: `--user <userId>` — limits the scan to a single user
 * (useful for staged rollouts).
 *
 * Usage:
 *   npx tsx scripts/migrate-v1-userplugins-to-workflows.ts
 *   npx tsx scripts/migrate-v1-userplugins-to-workflows.ts --apply
 *   npx tsx scripts/migrate-v1-userplugins-to-workflows.ts --apply --user u_123
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:2BotDevPg2026Secure@localhost:5432/2bot_production?schema=public";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const userArgIdx = process.argv.indexOf("--user");
const USER_FILTER = userArgIdx !== -1 ? process.argv[userArgIdx + 1] : undefined;

interface ReportRow {
  userPluginId: string;
  userId: string;
  organizationId: string | null;
  gatewayId: string;
  pluginSlug: string;
  action: "wrap" | "skip-covered" | "skip-no-gateway" | "error";
  workflowId?: string;
  reason?: string;
}

function shortId(id: string): string {
  return id.slice(-6);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

async function main(): Promise<void> {
  console.log(
    `\n=== Phase 6.1 V1 → Workflow migration — mode: ${APPLY ? "APPLY" : "DRY-RUN"}${
      USER_FILTER ? ` — user: ${USER_FILTER}` : ""
    } ===\n`,
  );

  // Pull every enabled, gateway-bound UserPlugin in scope.
  const candidates = await prisma.userPlugin.findMany({
    where: {
      isEnabled: true,
      gatewayId: { not: null },
      ...(USER_FILTER ? { userId: USER_FILTER } : {}),
    },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      gatewayId: true,
      pluginId: true,
      config: true,
      entryFile: true,
      storageQuotaMb: true,
      plugin: { select: { slug: true, name: true } },
      gateway: { select: { name: true, type: true } },
    },
  });

  console.log(`Scanned ${candidates.length} enabled, gateway-bound UserPlugin(s).`);

  const report: ReportRow[] = [];
  let wrapped = 0;
  let skippedCovered = 0;
  let errored = 0;

  for (const up of candidates) {
    if (!up.gatewayId) {
      // Type-narrowing — the `where` guarantees this, but Prisma's types don't.
      report.push({
        userPluginId: up.id,
        userId: up.userId,
        organizationId: up.organizationId,
        gatewayId: "",
        pluginSlug: up.plugin.slug,
        action: "skip-no-gateway",
      });
      continue;
    }

    // Already covered by an ACTIVE workflow step bound to the same gateway?
    const covered = await prisma.workflowStep.findFirst({
      where: {
        pluginId: up.pluginId,
        isEnabled: true,
        workflow: {
          userId: up.userId,
          organizationId: up.organizationId ?? null,
          gatewayId: up.gatewayId,
          status: "ACTIVE",
          isEnabled: true,
        },
      },
      select: { id: true, workflowId: true },
    });

    if (covered) {
      skippedCovered++;
      report.push({
        userPluginId: up.id,
        userId: up.userId,
        organizationId: up.organizationId,
        gatewayId: up.gatewayId,
        pluginSlug: up.plugin.slug,
        action: "skip-covered",
        workflowId: covered.workflowId,
      });
      continue;
    }

    const baseSlug = `auto-${slugify(up.plugin.slug)}-${shortId(up.gatewayId)}`;
    const baseName = `${up.plugin.name} (auto)`;

    if (!APPLY) {
      report.push({
        userPluginId: up.id,
        userId: up.userId,
        organizationId: up.organizationId,
        gatewayId: up.gatewayId,
        pluginSlug: up.plugin.slug,
        action: "wrap",
        reason: `would create workflow "${baseName}" with slug "${baseSlug}"`,
      });
      wrapped++;
      continue;
    }

    // --apply: create workflow + step in a single transaction. Idempotent on
    // (userId, organizationId, slug) — falls back to alternate slug if taken.
    try {
      const workflowId = await prisma.$transaction(async (tx) => {
        let slug = baseSlug;
        const existing = await tx.workflow.findFirst({
          where: { userId: up.userId, organizationId: up.organizationId ?? null, slug },
          select: { id: true },
        });
        if (existing) {
          slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
        }

        const wf = await tx.workflow.create({
          data: {
            userId: up.userId,
            organizationId: up.organizationId ?? null,
            scope: "USER",
            name: baseName,
            description:
              "Auto-generated by Phase 6.1 migration to retire the legacy V1 dispatch path. Safe to rename.",
            slug,
            triggerType: "BOT_MESSAGE",
            triggerConfig: {},
            gatewayId: up.gatewayId,
            status: "ACTIVE",
            isEnabled: true,
          },
          select: { id: true },
        });

        await tx.workflowStep.create({
          data: {
            workflowId: wf.id,
            order: 0,
            name: up.plugin.name,
            pluginId: up.pluginId,
            isEnabled: true,
            inputMapping: {},
            config: (up.config as object) ?? {},
            gatewayId: up.gatewayId,
            entryFile: up.entryFile,
            storageQuotaMb: up.storageQuotaMb,
            userPluginId: up.id,
            onError: "stop",
          },
        });

        return wf.id;
      });

      wrapped++;
      report.push({
        userPluginId: up.id,
        userId: up.userId,
        organizationId: up.organizationId,
        gatewayId: up.gatewayId,
        pluginSlug: up.plugin.slug,
        action: "wrap",
        workflowId,
      });
    } catch (err) {
      errored++;
      report.push({
        userPluginId: up.id,
        userId: up.userId,
        organizationId: up.organizationId,
        gatewayId: up.gatewayId,
        pluginSlug: up.plugin.slug,
        action: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Report
  console.log("\n=== Summary ===");
  console.log(`  ${APPLY ? "Wrapped" : "Would wrap"}:   ${wrapped}`);
  console.log(`  Already covered: ${skippedCovered}`);
  console.log(`  Errors:          ${errored}`);
  console.log(`  Total scanned:   ${candidates.length}\n`);

  if (report.length > 0) {
    console.log("=== Per-row report ===");
    for (const r of report) {
      const tag = r.action.padEnd(14);
      const extra = r.workflowId
        ? ` → workflow=${r.workflowId}`
        : r.reason
          ? ` (${r.reason})`
          : "";
      console.log(
        `  [${tag}] user=${r.userId} org=${r.organizationId ?? "-"} gw=${r.gatewayId || "-"} plugin=${r.pluginSlug} up=${r.userPluginId}${extra}`,
      );
    }
  }

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write changes.");
  } else if (errored > 0) {
    console.log("\nCompleted WITH ERRORS — review the per-row report above.");
    process.exitCode = 1;
  } else {
    console.log("\nMigration complete.");
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
