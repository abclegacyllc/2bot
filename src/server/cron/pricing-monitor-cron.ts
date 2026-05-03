/**
 * Pricing Monitor Cron Service
 *
 * Runs the provider price audit automatically on a schedule.
 * Default cadence is once every 24 hours, configurable via:
 * - PRICING_MONITOR_AUTO_RUN=true|false
 * - PRICING_MONITOR_INTERVAL_HOURS=24
 *
 * @module server/cron/pricing-monitor-cron
 */

import { logger } from "@/lib/logger";
import { withDistributedLock } from "@/lib/redis-lock";
import { runPricingAudit } from "@/modules/2bot-ai-provider/pricing-monitor";

const log = logger.child({ module: "pricing-monitor-cron" });

const AUTO_RUN_ENABLED = process.env.PRICING_MONITOR_AUTO_RUN !== "false";
const INTERVAL_HOURS = Math.max(1, Number(process.env.PRICING_MONITOR_INTERVAL_HOURS || "24"));
const CHECK_INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 15 * 1000;

// Shared system alert bot — single source of truth for all system notifications.
// Separate from user-facing gateway bots.
const TELEGRAM_BOT_TOKEN = process.env.SYSTEM_TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.SYSTEM_TELEGRAM_CHAT_ID || "";
const NOTIFY_ON_CHANGES_ONLY = process.env.PRICING_MONITOR_NOTIFY_ON_CHANGES_ONLY !== "false";

let cronTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function sendTelegramText(text: string): Promise<void> {
  if (!TELEGRAM_CHAT_ID) return;

  if (!TELEGRAM_BOT_TOKEN) {
    log.warn("Pricing monitor Telegram chat configured, but TELEGRAM_BOT_TOKEN is missing");
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
  }
}

function buildTelegramSummary(report: Awaited<ReturnType<typeof runPricingAudit>>): string {
  const changed = report.meta?.changesDetectedFromPreviousRun;
  const mismatchProviders = report.providers
    .filter((provider) => provider.priceMismatches.length > 0)
    .slice(0, 4)
    .map((provider) => `• ${provider.providerName}: ${provider.priceMismatches.length} mismatches`)
    .join("\n");

  return [
    "📊 2Bot Price Monitor",
    changed ? "⚠️ Changes detected since the previous run" : "✅ Scheduled summary",
    "",
    `Status: ${report.status.toUpperCase()}`,
    `Checked: ${report.summary.totalModelsChecked} models across ${report.summary.totalProviders} providers`,
    `Mismatches: ${report.summary.priceMismatches}`,
    `New models: ${report.summary.newModels}`,
    `Removed models: ${report.summary.removedModels}`,
    `Errors: ${report.summary.errors}`,
    report.meta?.previousTimestamp ? `Previous run: ${report.meta.previousTimestamp}` : "",
    mismatchProviders ? "" : "",
    mismatchProviders ? "By provider:" : "",
    mismatchProviders,
  ].filter(Boolean).join("\n");
}

async function processPricingAudit(): Promise<void> {
  if (isRunning) {
    log.warn("Skipping pricing audit because a previous run is still in progress");
    return;
  }

  isRunning = true;
  try {
    const report = await runPricingAudit({
      runType: "scheduled",
      autoCheckEnabled: AUTO_RUN_ENABLED,
      autoCheckIntervalMs: CHECK_INTERVAL_MS,
      telegramNotificationsEnabled: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
      telegramChatConfigured: Boolean(TELEGRAM_CHAT_ID),
    });

    if (report.meta?.changesDetectedFromPreviousRun) {
      log.warn(
        {
          summary: report.summary,
          previousTimestamp: report.meta.previousTimestamp,
          currentTimestamp: report.timestamp,
        },
        "Pricing monitor detected changes since the previous scheduled run"
      );
    } else {
      log.info(
        { summary: report.summary, timestamp: report.timestamp },
        "Pricing monitor scheduled audit completed"
      );
    }

    const shouldNotifyTelegram = Boolean(TELEGRAM_CHAT_ID)
      && (report.meta?.changesDetectedFromPreviousRun || !NOTIFY_ON_CHANGES_ONLY);

    if (shouldNotifyTelegram) {
      try {
        await sendTelegramText(buildTelegramSummary(report));
        log.info({ chatConfigured: true }, "Pricing monitor Telegram notification sent");
      } catch (err) {
        log.error({ err }, "Pricing monitor Telegram notification failed");
      }
    }
  } catch (err) {
    log.error({ err }, "Scheduled pricing audit failed");

    if (TELEGRAM_CHAT_ID && !NOTIFY_ON_CHANGES_ONLY) {
      try {
        await sendTelegramText(`❌ 2Bot Price Monitor\n\nScheduled audit failed.\n\nError: ${err instanceof Error ? err.message : String(err)}`);
      } catch (notifyErr) {
        log.error({ err: notifyErr }, "Failed to send Telegram failure alert");
      }
    }
  } finally {
    isRunning = false;
  }
}

export function initializePricingMonitorCron(): void {
  if (!AUTO_RUN_ENABLED) {
    log.info("Pricing monitor cron is disabled by environment");
    return;
  }

  log.info(
    { intervalHours: INTERVAL_HOURS, intervalMs: CHECK_INTERVAL_MS },
    "Initializing pricing monitor cron service"
  );

  const runWithLock = () =>
    withDistributedLock(
      "cron:pricing-audit",
      Math.floor((CHECK_INTERVAL_MS / 1000) * 0.9),
      processPricingAudit,
    ).catch((err) => {
      log.error({ err }, "Pricing audit failed");
    });

  setTimeout(() => void runWithLock(), INITIAL_DELAY_MS);
  cronTimer = setInterval(() => void runWithLock(), CHECK_INTERVAL_MS);
}

export function stopPricingMonitorCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    log.info("Pricing monitor cron service stopped");
  }
}
