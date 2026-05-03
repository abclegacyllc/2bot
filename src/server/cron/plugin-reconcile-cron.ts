/**
 * Plugin Reconciliation Cron
 *
 * Periodically walks every RUNNING workspace container and reconciles two
 * things that can drift between the workspace filesystem, the platform DB,
 * and workflow definitions:
 *
 *   1. **Discovery sweep** — for every connected container, run the same
 *      `discoverAndRegisterPlugins` flow used at workspace start so that
 *      plugin directories created via `git clone`, terminal, or external
 *      tooling get registered as `UserPlugin` rows even if no `fileWrite`
 *      RPC was emitted (e.g. tarball extracted by a script).
 *
 *   2. **Orphan WorkflowStep cleanup** — disable any enabled `WorkflowStep`
 *      whose catalog `Plugin` is no longer active, OR whose owning user has
 *      no matching `UserPlugin` installation. The step is auto-disabled
 *      with `lastError` set so the user sees why on the canvas.
 *
 * The job is idempotent and safe to run multiple times.
 *
 * Configuration env vars:
 *   PLUGIN_RECONCILE_ENABLED=true|false        (default: true)
 *   PLUGIN_RECONCILE_INTERVAL_HOURS=6          (default: 6)
 *
 * @module server/cron/plugin-reconcile-cron
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withDistributedLock } from "@/lib/redis-lock";
import { pluginWorkspaceSyncService } from "@/modules/plugin/plugin-workspace-sync.service";
import { bridgeClientManager } from "@/modules/workspace/bridge-client.service";

const log = logger.child({ module: "plugin-reconcile-cron" });

const ENABLED = process.env.PLUGIN_RECONCILE_ENABLED !== "false";
const INTERVAL_HOURS = Math.max(1, Number(process.env.PLUGIN_RECONCILE_INTERVAL_HOURS || "6"));
const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 60 * 1000; // wait 60s after boot

let cronTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export interface PluginReconcileStats {
  containersScanned: number;
  containersConnected: number;
  pluginsDiscovered: number;
  stepsAutoDisabled: number;
  errors: number;
  durationMs: number;
}

/**
 * Run a single reconciliation pass. Exposed for the admin "trigger now"
 * endpoint and for tests.
 */
export async function runPluginReconcile(): Promise<PluginReconcileStats> {
  if (isRunning) {
    log.warn("Reconcile already in progress — skipping overlap");
    return {
      containersScanned: 0,
      containersConnected: 0,
      pluginsDiscovered: 0,
      stepsAutoDisabled: 0,
      errors: 0,
      durationMs: 0,
    };
  }
  isRunning = true;
  const start = Date.now();

  const stats: PluginReconcileStats = {
    containersScanned: 0,
    containersConnected: 0,
    pluginsDiscovered: 0,
    stepsAutoDisabled: 0,
    errors: 0,
    durationMs: 0,
  };

  try {
    // ─── 1. Discovery sweep ──────────────────────────────────────────────
    const containers = await prisma.workspaceContainer.findMany({
      where: { status: "RUNNING" },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        user: { select: { plan: true } },
      },
    });
    stats.containersScanned = containers.length;

    for (const container of containers) {
      const client = bridgeClientManager.getExistingClient(container.id);
      if (!client) continue; // skip containers whose agent isn't connected
      stats.containersConnected += 1;

      try {
        const discovered = await pluginWorkspaceSyncService.discoverAndRegisterPlugins(
          client,
          container.userId,
          container.organizationId,
          log,
          container.user?.plan,
        );
        const newlyRegistered = discovered.filter((d) => d.action === "registered").length;
        stats.pluginsDiscovered += newlyRegistered;
        if (newlyRegistered > 0) {
          log.info(
            { containerId: container.id, userId: container.userId, count: newlyRegistered },
            "Discovered new plugins during reconcile",
          );
        }
      } catch (err) {
        stats.errors += 1;
        log.error(
          { err, containerId: container.id, userId: container.userId },
          "Discovery sweep failed for container",
        );
      }
    }

    // ─── 2. Orphan WorkflowStep cleanup ──────────────────────────────────
    // A step is "orphaned" when its catalog plugin is inactive, OR when the
    // workflow owner no longer has a UserPlugin for that catalog plugin.
    const enabledSteps = await prisma.workflowStep.findMany({
      where: { isEnabled: true },
      select: {
        id: true,
        pluginId: true,
        workflow: { select: { id: true, userId: true, organizationId: true } },
        plugin: { select: { id: true, isActive: true, slug: true } },
      },
    });

    for (const step of enabledSteps) {
      try {
        const reasons: string[] = [];

        if (!step.plugin || !step.plugin.isActive) {
          reasons.push(`catalog plugin ${step.pluginId} is inactive or missing`);
        } else {
          const install = await prisma.userPlugin.findFirst({
            where: {
              pluginId: step.pluginId,
              userId: step.workflow.userId,
              organizationId: step.workflow.organizationId ?? null,
            },
            select: { id: true },
          });
          if (!install) {
            reasons.push(
              `user has no installation of plugin ${step.plugin.slug} (${step.pluginId})`,
            );
          }
        }

        if (reasons.length === 0) continue;

        await prisma.workflowStep.update({
          where: { id: step.id },
          data: {
            isEnabled: false,
            lastError: `Auto-disabled by reconcile: ${reasons.join("; ")}`,
          },
        });
        stats.stepsAutoDisabled += 1;
        log.warn(
          {
            stepId: step.id,
            workflowId: step.workflow.id,
            pluginId: step.pluginId,
            reasons,
          },
          "Auto-disabled orphan workflow step",
        );
      } catch (err) {
        stats.errors += 1;
        log.error({ err, stepId: step.id }, "Failed to evaluate workflow step");
      }
    }

    // isStandalone consistency check removed — field no longer in schema

  } catch (err) {
    stats.errors += 1;
    log.error({ err }, "Plugin reconcile pass failed");
  } finally {
    stats.durationMs = Date.now() - start;
    isRunning = false;
  }

  log.info({ stats }, "Plugin reconcile pass complete");
  return stats;
}

/**
 * Initialize plugin reconcile cron. Runs an initial pass after a short
 * delay (so containers have time to reconnect after a server restart),
 * then schedules periodic passes.
 */
export function initializePluginReconcileCron(): void {
  if (!ENABLED) {
    log.info("Plugin reconcile cron disabled via env");
    return;
  }
  log.info(
    { intervalHours: INTERVAL_HOURS },
    "Initializing plugin reconcile cron",
  );

  const runWithLock = () =>
    withDistributedLock(
      "cron:plugin-reconcile",
      Math.floor((INTERVAL_MS / 1000) * 0.9),
      runPluginReconcile,
    ).catch((err) => {
      log.error({ err }, "Plugin reconcile pass failed");
    });

  setTimeout(() => void runWithLock(), INITIAL_DELAY_MS);
  cronTimer = setInterval(() => void runWithLock(), INTERVAL_MS);
}

/**
 * Stop the plugin reconcile cron (graceful shutdown).
 */
export function stopPluginReconcileCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    log.info("Plugin reconcile cron stopped");
  }
}
