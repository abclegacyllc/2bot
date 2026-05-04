/**
 * Schedule tick service (Phase 7.4 — Path C)
 *
 * Polls the `schedules` table at a fixed cadence and fires any due rows by
 * calling `executeWorkflow()`. Mirrors the pattern used by
 * `src/server/cron/credit-cron.ts` and `pricing-monitor-cron.ts`:
 *   - `setInterval` driven, with an immediate first tick on startup
 *   - replica-safe via `withDistributedLock` (Redis SETNX)
 *   - idempotent: each fire updates `lastFiredAt` + recomputes `nextFireAt`
 *
 * Gated by `FEATURE_PROJECT_RESOURCES=enabled` — when the flag is off the
 * tick loop is never started.
 *
 * @module modules/project-resource/schedule-tick.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withDistributedLock } from "@/lib/redis-lock";
import { executeWorkflow } from "@/modules/workflow/workflow.executor";

import { computeNextFireAt } from "./project-resource.service";

const log = logger.child({ module: "schedule-tick" });

const TICK_INTERVAL_MS = Math.max(
  5_000,
  parseInt(process.env.SCHEDULE_TICK_INTERVAL_MS ?? "30000", 10),
);

const LOCK_KEY = "cron:schedule-resources";
const LOCK_TTL_SECONDS = Math.max(
  5,
  Math.floor((TICK_INTERVAL_MS / 1000) * 0.9),
);

let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

/**
 * Process all due schedules. Each row is processed independently — a single
 * failure does not abort the batch.
 *
 * Exported for unit tests.
 */
export async function processDueSchedules(now: Date = new Date()): Promise<{
  considered: number;
  fired: number;
  errors: number;
}> {
  const due = await prisma.schedule.findMany({
    where: {
      enabled: true,
      nextFireAt: { lte: now, not: null },
      resource: { status: "ACTIVE" },
    },
    include: { resource: true },
    take: 500,
  });

  let fired = 0;
  let errors = 0;
  for (const row of due) {
    try {
      const scheduledAt = row.nextFireAt ?? now;
      const nextFireAt = computeNextFireAt(row.cron, row.timezone, now);

      // Fire only when bound to a workflow. Unbound rows still advance their
      // schedule so they don't pile up indefinitely.
      if (row.targetWorkflowId) {
        const idempotencyKey = `schedule:${row.id}:${scheduledAt.toISOString()}`;
        try {
          const runId = await executeWorkflow(
            row.targetWorkflowId,
            "schedule",
            {
              scheduledAt: scheduledAt.toISOString(),
              cron: row.cron,
              timezone: row.timezone ?? "UTC",
              resourceId: row.resourceId,
              scheduleId: row.id,
            },
            {},
            idempotencyKey,
          );
          fired++;
          log.info(
            {
              scheduleId: row.id,
              resourceId: row.resourceId,
              workflowId: row.targetWorkflowId,
              runId,
              scheduledAt: scheduledAt.toISOString(),
            },
            "Schedule fired workflow run",
          );
        } catch (err) {
          errors++;
          log.error(
            {
              err,
              scheduleId: row.id,
              workflowId: row.targetWorkflowId,
            },
            "Schedule failed to fire workflow run",
          );
        }
      } else {
        log.warn(
          { scheduleId: row.id, resourceId: row.resourceId },
          "Schedule has no targetWorkflowId — skipping fire (advancing nextFireAt)",
        );
      }

      await prisma.schedule.update({
        where: { id: row.id },
        data: { lastFiredAt: now, nextFireAt },
      });
    } catch (err) {
      errors++;
      log.error(
        { err, scheduleId: row.id },
        "Unexpected error processing schedule row",
      );
    }
  }

  return { considered: due.length, fired, errors };
}

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    await withDistributedLock(LOCK_KEY, LOCK_TTL_SECONDS, async () => {
      const result = await processDueSchedules();
      if (result.considered > 0) {
        log.info(result, "Schedule tick complete");
      }
    });
  } catch (err) {
    log.error({ err }, "Schedule tick failed");
  } finally {
    tickInFlight = false;
  }
}

/**
 * Start the schedule tick loop. Idempotent — calling twice is a no-op.
 * Returns silently when `FEATURE_PROJECT_RESOURCES` is disabled.
 */
export function initializeScheduleTick(): void {
  const flag = (process.env.FEATURE_PROJECT_RESOURCES ?? "disabled").toLowerCase();
  if (flag !== "enabled") {
    log.info("Schedule tick disabled (FEATURE_PROJECT_RESOURCES != enabled)");
    return;
  }
  if (tickTimer) return;

  log.info(
    { intervalMs: TICK_INTERVAL_MS },
    "Starting schedule tick loop",
  );

  // Fire-and-forget initial tick after a short delay so server boot completes
  // before the first DB scan.
  setTimeout(() => {
    void tick();
  }, 5_000);

  tickTimer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
}

/**
 * Stop the schedule tick loop. Mainly used by tests.
 */
export function shutdownScheduleTick(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
