/**
 * Workflow Run Retention Cron
 *
 * Deletes WorkflowRun rows older than the per-plan retention window so the
 * `workflow_runs` table does not grow unbounded. WorkflowStepRun rows are
 * removed automatically via ON DELETE CASCADE.
 *
 * Retention windows (configurable via env):
 *   FREE         → 30 days  (RUN_RETENTION_DAYS_FREE)
 *   STARTER      → 60 days  (RUN_RETENTION_DAYS_STARTER)
 *   PRO          → 90 days  (RUN_RETENTION_DAYS_PRO)
 *   BUSINESS     → 180 days (RUN_RETENTION_DAYS_BUSINESS)
 *   ENTERPRISE   → 365 days (RUN_RETENTION_DAYS_ENTERPRISE)
 *
 * Runs once a day under a distributed lock so only one replica deletes.
 *
 * @module server/cron/run-retention-cron
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withDistributedLock } from "@/lib/redis-lock";

const log = logger.child({ module: "run-retention-cron" });

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const LOCK_KEY = "cron:run-retention";
// 90% of the interval so a crashed replica's lock auto-expires before next tick.
const LOCK_TTL_SECONDS = Math.floor((CHECK_INTERVAL_MS / 1000) * 0.9);
const DELETE_BATCH_SIZE = parseInt(process.env.RUN_RETENTION_BATCH_SIZE || "5000", 10);

let cronTimer: ReturnType<typeof setInterval> | null = null;

interface PlanRetention {
  plan: string;
  days: number;
}

function getPlanRetentions(): PlanRetention[] {
  return [
    { plan: "FREE", days: parseInt(process.env.RUN_RETENTION_DAYS_FREE || "30", 10) },
    { plan: "STARTER", days: parseInt(process.env.RUN_RETENTION_DAYS_STARTER || "60", 10) },
    { plan: "PRO", days: parseInt(process.env.RUN_RETENTION_DAYS_PRO || "90", 10) },
    { plan: "BUSINESS", days: parseInt(process.env.RUN_RETENTION_DAYS_BUSINESS || "180", 10) },
    { plan: "ENTERPRISE", days: parseInt(process.env.RUN_RETENTION_DAYS_ENTERPRISE || "365", 10) },
  ];
}

/**
 * Delete runs owned by users on `plan` whose startedAt is older than `days`.
 * Batched to keep individual transactions small. Returns total deleted count.
 */
async function deleteOldRunsForPlan(plan: string, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;

  // Loop in batches so a single tick never holds a giant lock on workflow_runs.
  // Stop when a batch returns fewer rows than requested.
  // Use raw SQL with a subquery so we can LIMIT the delete.
  // workflows.userId is the owner; filter by user.plan = $plan.
  for (;;) {
    const result = await prisma.$executeRaw`
      DELETE FROM workflow_runs
      WHERE id IN (
        SELECT wr.id
        FROM workflow_runs wr
        JOIN workflows wf ON wf.id = wr.workflow_id
        JOIN users u ON u.id = wf.user_id
        WHERE u.plan = ${plan}::"PlanType"
          AND wr.started_at < ${cutoff}
        LIMIT ${DELETE_BATCH_SIZE}
      )
    `;

    totalDeleted += result;
    if (result < DELETE_BATCH_SIZE) break;
  }

  return totalDeleted;
}

async function runRetention(): Promise<void> {
  const start = Date.now();
  const plans = getPlanRetentions();
  const summary: Record<string, number> = {};
  let total = 0;

  for (const { plan, days } of plans) {
    try {
      const deleted = await deleteOldRunsForPlan(plan, days);
      summary[plan] = deleted;
      total += deleted;
      if (deleted > 0) {
        log.info({ plan, retentionDays: days, deleted }, "Retention sweep deleted old runs");
      }
    } catch (err) {
      log.error({ err, plan, retentionDays: days }, "Retention sweep failed for plan");
    }
  }

  log.info({ summary, total, durationMs: Date.now() - start }, "Run retention complete");
}

/**
 * Initialize the run retention cron (idempotent).
 * Each tick runs under a distributed lock so only one replica deletes.
 */
export function initializeRunRetentionCron(): void {
  if (cronTimer) {
    log.warn("Run retention cron already initialized");
    return;
  }

  log.info(
    { intervalHours: CHECK_INTERVAL_MS / 3600000, retentions: getPlanRetentions() },
    "Initializing run retention cron"
  );

  const runWithLock = () =>
    withDistributedLock(LOCK_KEY, LOCK_TTL_SECONDS, runRetention).catch((err) => {
      log.error({ err }, "Run retention sweep failed");
    });

  // Run once on startup (after a short delay) so a fresh deploy doesn't wait 24h.
  setTimeout(() => void runWithLock(), 30_000);

  cronTimer = setInterval(() => void runWithLock(), CHECK_INTERVAL_MS);
}

export function stopRunRetentionCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    log.info("Run retention cron stopped");
  }
}
