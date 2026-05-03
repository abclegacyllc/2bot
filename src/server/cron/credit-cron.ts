/**
 * Credit Cron Service
 *
 * Handles scheduled credit operations:
 * - Monthly auto-grants for PRO+ and ORG_STARTER+ plans
 * - Monthly reset of claim totals for daily-claim plans
 *
 * Runs on server startup and then checks hourly.
 * All operations are idempotent — safe to run multiple times.
 *
 * @module server/cron/credit-cron
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withDistributedLock } from "@/lib/redis-lock";
import { creditWalletService } from "@/modules/credits";

const log = logger.child({ module: "credit-cron" });

// Check interval: every 6 hours
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Distributed lock: only one replica runs each tick.
// TTL must exceed expected job duration but be shorter than the interval so a
// crashed replica's lock auto-expires before the next scheduled tick.
const LOCK_KEY = "cron:credit-monthly";
const LOCK_TTL_SECONDS = Math.floor((CHECK_INTERVAL_MS / 1000) * 0.9);

let cronTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Process all monthly credit grants and resets.
 * This is idempotent — each wallet tracks its own reset state.
 */
async function processMonthlyCredits(): Promise<void> {
  const now = new Date();
  log.info({ timestamp: now.toISOString() }, "Starting monthly credit processing");

  try {
    // Find all wallets that might need processing
    // We check all wallets — each method internally validates whether action is needed
    const wallets = await prisma.creditWallet.findMany({
      select: { id: true },
    });

    let monthlyGranted = 0;
    const dailyReset = 0;
    let errors = 0;

    for (const wallet of wallets) {
      try {
        // Try monthly grant (for PRO+, ORG_STARTER+ plans)
        const grantResult = await creditWalletService.grantMonthlyCredits(wallet.id);
        if (grantResult) {
          monthlyGranted++;
          log.info(
            { walletId: wallet.id, granted: grantResult.granted },
            "Monthly credit grant applied"
          );
        }

        // Try monthly reset for daily-claim plans
        await creditWalletService.processMonthlyResetForDailyClaim(wallet.id);
        // This is a lightweight check, we don't track count
      } catch (err) {
        errors++;
        log.error(
          { walletId: wallet.id, err },
          "Error processing wallet for monthly credits"
        );
      }
    }

    log.info(
      { totalWallets: wallets.length, monthlyGranted, dailyReset, errors },
      "Monthly credit processing complete"
    );
  } catch (err) {
    log.error({ err }, "Failed to run monthly credit processing");
  }
}

/**
 * Initialize credit cron.
 * Runs an initial check on startup, then schedules periodic checks.
 */
export function initializeCreditCron(): void {
  log.info("Initializing credit cron service");

  const runWithLock = () =>
    withDistributedLock(LOCK_KEY, LOCK_TTL_SECONDS, processMonthlyCredits).catch((err) => {
      log.error({ err }, "Monthly credit processing failed");
    });

  // Run initial check after a short delay (let server start up)
  setTimeout(() => void runWithLock(), 10_000);

  // Schedule periodic checks (lock ensures only one replica runs)
  cronTimer = setInterval(() => void runWithLock(), CHECK_INTERVAL_MS);

  log.info(
    { intervalMs: CHECK_INTERVAL_MS, intervalHours: CHECK_INTERVAL_MS / (60 * 60 * 1000) },
    "Credit cron service initialized"
  );
}

/**
 * Stop the credit cron (for graceful shutdown).
 */
export function stopCreditCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    log.info("Credit cron service stopped");
  }
}
