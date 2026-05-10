/**
 * Account Anonymizer Cron (Wave 2.2 closeout)
 *
 * Walks `users` for rows whose `deletion_scheduled_for` has elapsed and
 * `anonymized_at` is still null, calling `accountService.anonymizeUser`
 * for each. Runs daily under a distributed lock so only one replica
 * does the work.
 *
 * The anonymisation itself is idempotent (see `account.service.ts`),
 * so a crash mid-tick only means some rows get processed in the next
 * tick rather than the current one — no double-anonymisation risk.
 *
 * @module server/cron/account-anonymizer-cron
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withDistributedLock } from "@/lib/redis-lock";
import { accountService } from "@/modules/account";
import { auditActions } from "@/lib/audit";

const log = logger.child({ module: "account-anonymizer-cron" });

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const LOCK_KEY = "cron:account-anonymizer";
const LOCK_TTL_SECONDS = Math.floor((CHECK_INTERVAL_MS / 1000) * 0.9);
// Cap rows per tick so one bad day's worth of deletions doesn't run for
// hours. Anything left over picks up next tick.
const MAX_ROWS_PER_TICK = parseInt(
  process.env.ACCOUNT_ANONYMIZER_BATCH_SIZE || "500",
  10,
);

let cronTimer: ReturnType<typeof setInterval> | null = null;

async function runAnonymization(): Promise<void> {
  const start = Date.now();
  const cutoff = new Date(); // anything scheduled at or before "now" is due

  const due = await prisma.user.findMany({
    where: {
      deletionScheduledFor: { not: null, lte: cutoff },
      anonymizedAt: null,
    },
    select: { id: true },
    take: MAX_ROWS_PER_TICK,
    orderBy: { deletionScheduledFor: "asc" },
  });

  if (due.length === 0) {
    log.debug({ durationMs: Date.now() - start }, "No accounts due for anonymisation");
    return;
  }

  let succeeded = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      const out = await accountService.anonymizeUser(id);
      if (!out.alreadyAnonymized) {
        // Idempotency: only emit the audit event when we actually did
        // the work, not on the no-op path.
        void auditActions.accountAnonymized({ userId: id });
      }
      succeeded++;
    } catch (err) {
      failed++;
      log.error({ err, userId: id }, "Account anonymisation failed");
    }
  }

  log.info(
    { found: due.length, succeeded, failed, durationMs: Date.now() - start },
    "Account anonymisation tick complete",
  );
}

/**
 * Initialize the cron (idempotent). Safe to call from `startServer`.
 */
export function initializeAccountAnonymizerCron(): void {
  if (cronTimer) {
    log.warn("Account anonymizer cron already initialized");
    return;
  }

  log.info(
    { intervalHours: CHECK_INTERVAL_MS / 3600000, batchSize: MAX_ROWS_PER_TICK },
    "Initializing account anonymizer cron",
  );

  const runWithLock = () =>
    withDistributedLock(LOCK_KEY, LOCK_TTL_SECONDS, runAnonymization).catch((err) => {
      log.error({ err }, "Account anonymisation tick failed");
    });

  // Run once on startup (after a short delay) — useful when redeploying
  // after a long downtime, but the lock prevents thundering herd across
  // replicas.
  setTimeout(() => void runWithLock(), 60_000);

  cronTimer = setInterval(() => void runWithLock(), CHECK_INTERVAL_MS);
}

export function stopAccountAnonymizerCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    log.info("Account anonymizer cron stopped");
  }
}
