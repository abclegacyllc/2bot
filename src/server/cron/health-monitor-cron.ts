/**
 * Server Health Monitor Cron
 *
 * Periodically checks all critical services and sends Telegram alerts
 * when something changes. Also polls Telegram for /status commands so
 * the admin can request a real-time status snapshot at any time.
 *
 * Services monitored:
 *   - Database (PostgreSQL)
 *   - Redis
 *   - API server self (HTTP /api/health/ready)
 *   - Next.js frontend (HTTP HEAD)
 *   - Admin panel (HTTP HEAD)
 *   - Memory usage (warns when heap > threshold)
 *
 * Telegram commands (reply only to SYSTEM_TELEGRAM_CHAT_ID):
 *   /status  — send current health snapshot immediately
 *
 * Configuration env vars:
 *   HEALTH_MONITOR_ENABLED=true|false       (default: true)
 *   HEALTH_MONITOR_INTERVAL_SECS=60         (default: 60)
 *   HEALTH_MONITOR_MEMORY_WARN_MB=512       (default: 512)
 *   SYSTEM_TELEGRAM_BOT_TOKEN               (shared system alert bot)
 *   SYSTEM_TELEGRAM_CHAT_ID                 (owner chat ID only)
 *
 * @module server/cron/health-monitor-cron
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isRedisReady } from "@/lib/redis";
import { APP_CONFIG } from "@/shared/constants";
import os from "os";

const log = logger.child({ module: "health-monitor-cron" });

const ENABLED = process.env.HEALTH_MONITOR_ENABLED !== "false";
const INTERVAL_SECS = Math.max(10, Number(process.env.HEALTH_MONITOR_INTERVAL_SECS || "60"));
const INTERVAL_MS = INTERVAL_SECS * 1000;
const INITIAL_DELAY_MS = 20 * 1000;
const MEMORY_WARN_MB = Number(process.env.HEALTH_MONITOR_MEMORY_WARN_MB || "512");

// URLs for HTTP probes — server-side so use internal localhost addresses
const API_PORT = parseInt(process.env.SERVER_PORT || "3002", 10);
const API_HEALTH_URL = `http://127.0.0.1:${API_PORT}/api/health/ready`;
const FRONTEND_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || "https://dash.2bot.org";
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.2bot.org";

// Single source of truth: shared system alert bot for all system notifications.
const TELEGRAM_BOT_TOKEN = process.env.SYSTEM_TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.SYSTEM_TELEGRAM_CHAT_ID || "";

// ─── State ──────────────────────────────────────────────────────────────────

type ServiceStatus = "ok" | "warn" | "error" | "unknown";

interface HealthState {
  database: ServiceStatus;
  redis: ServiceStatus;
  api: ServiceStatus;
  frontend: ServiceStatus;
  adminPanel: ServiceStatus;
  memoryMb: number;
  memoryStatus: ServiceStatus;
  uptimeSecs: number;
  overall: "ok" | "degraded" | "unhealthy" | "unknown";
  checkedAt: Date | null;
}

let previousState: HealthState = {
  database: "unknown",
  redis: "unknown",
  api: "unknown",
  frontend: "unknown",
  adminPanel: "unknown",
  memoryMb: 0,
  memoryStatus: "unknown",
  uptimeSecs: 0,
  overall: "unknown",
  checkedAt: null,
};

let isFirstCheck = true;
let cronTimer: ReturnType<typeof setInterval> | null = null;
let initialTimer: ReturnType<typeof setTimeout> | null = null;
/** Last Telegram update ID processed (for /status polling) */
let lastUpdateId = 0;

// ─── Telegram ────────────────────────────────────────────────────────────────

interface TelegramSendOptions {
  text: string;
  /** Inline keyboard button — label + URL */
  button?: { label: string; url: string };
}

async function sendTelegramMessage(opts: TelegramSendOptions): Promise<void> {
  if (!TELEGRAM_CHAT_ID || !TELEGRAM_BOT_TOKEN) return;

  const body: Record<string, unknown> = {
    chat_id: TELEGRAM_CHAT_ID,
    text: opts.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (opts.button) {
    body.reply_markup = {
      inline_keyboard: [[{ text: opts.button.label, url: opts.button.url }]],
    };
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Telegram sendMessage failed: ${response.status} ${await response.text()}`,
    );
  }
}

/** Poll for new Telegram updates and handle /status command */
async function pollTelegramCommands(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&limit=10&timeout=0&allowed_updates=["message"]`;
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json() as {
      ok: boolean;
      result: Array<{
        update_id: number;
        message?: {
          chat: { id: number };
          text?: string;
        };
      }>;
    };

    if (!data.ok || !data.result.length) return;

    for (const update of data.result) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);

      // Only respond to our owner chat ID — never to others
      const chatId = update.message?.chat.id;
      if (!chatId || String(chatId) !== String(TELEGRAM_CHAT_ID)) continue;

      const text = update.message?.text?.trim().toLowerCase();
      if (text === "/status" || text?.startsWith("/status@")) {
        log.info("Received /status command via Telegram");
        const snapshot = await checkHealth();
        await sendTelegramMessage({
          text: buildStatusMessage(snapshot, "📊 <b>Status (on-demand)</b>"),
          button: { label: "Open Admin Panel", url: `${ADMIN_URL}/admin/ai-health` },
        });
      }
    }
  } catch (err) {
    // Non-fatal — polling errors shouldn't stop health monitoring
    log.warn({ err }, "Health monitor: Telegram command poll failed");
  }
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function statusEmoji(s: ServiceStatus): string {
  if (s === "ok") return "✅";
  if (s === "warn") return "⚠️";
  if (s === "error") return "❌";
  return "❓";
}

function overallEmoji(s: HealthState["overall"]): string {
  if (s === "ok") return "✅";
  if (s === "degraded") return "⚠️";
  if (s === "unhealthy") return "🔴";
  return "❓";
}

function fmtUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function buildStatusMessage(state: HealthState, header: string): string {
  const now = new Date().toUTCString();
  const lines: string[] = [
    header,
    `Version: ${APP_CONFIG.version}  |  Uptime: ${fmtUptime(state.uptimeSecs)}\n`,
    `${statusEmoji(state.database)} <b>Database</b>: ${state.database}`,
    `${statusEmoji(state.redis)} <b>Redis</b>: ${state.redis}`,
    `${statusEmoji(state.api)} <b>API Server</b>: ${state.api}`,
    `${statusEmoji(state.frontend)} <b>Frontend</b>: ${state.frontend}`,
    `${statusEmoji(state.adminPanel)} <b>Admin Panel</b>: ${state.adminPanel}`,
    `${statusEmoji(state.memoryStatus)} <b>Memory</b>: ${state.memoryMb} MB heap`,
    `\nOverall: ${overallEmoji(state.overall)} <b>${state.overall.toUpperCase()}</b>`,
    `<i>${now}</i>`,
  ];
  return lines.join("\n");
}

function buildChangeNotification(
  current: HealthState,
  previous: HealthState,
  isFirst: boolean,
): string | null {
  if (isFirst) {
    return buildStatusMessage(current, "🚀 <b>2bot Server Started</b>");
  }

  const services = ["database", "redis", "api", "frontend", "adminPanel", "memoryStatus"] as const;
  const changed = services.some((k) => previous[k] !== current[k]);
  const overallChanged = previous.overall !== current.overall;

  if (!changed && !overallChanged) return null;

  // Build header based on transition
  let header: string;
  if (overallChanged && previous.overall !== "ok" && current.overall === "ok") {
    header = "✅ <b>Server Health Recovered</b>";
  } else if (overallChanged && current.overall !== "ok") {
    header = `${overallEmoji(current.overall)} <b>Server Health Alert</b>`;
  } else {
    header = `${overallEmoji(current.overall)} <b>Service Status Change</b>`;
  }

  const now = new Date().toUTCString();
  const lines: string[] = [
    header,
    `Version: ${APP_CONFIG.version}  |  Uptime: ${fmtUptime(current.uptimeSecs)}\n`,
  ];

  const labels: Record<typeof services[number], string> = {
    database: "Database",
    redis: "Redis",
    api: "API Server",
    frontend: "Frontend",
    adminPanel: "Admin Panel",
    memoryStatus: "Memory",
  };

  for (const key of services) {
    const prev = previous[key];
    const cur = current[key];
    const label = labels[key];
    const suffix = key === "memoryStatus" ? ` (${current.memoryMb} MB heap)` : "";
    if (prev !== cur && prev !== "unknown") {
      lines.push(`${statusEmoji(cur)} <b>${label}</b>: ${prev} → <b>${cur}</b>${suffix}`);
    } else {
      lines.push(`${statusEmoji(cur)} ${label}: ${cur}${suffix}`);
    }
  }

  lines.push(`\nOverall: ${overallEmoji(current.overall)} <b>${current.overall.toUpperCase()}</b>`);
  lines.push(`<i>${now}</i>`);

  return lines.join("\n");
}

// ─── HTTP Probe ──────────────────────────────────────────────────────────────

async function httpProbe(url: string, timeoutMs = 5000): Promise<ServiceStatus> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    return res.ok || res.status < 500 ? "ok" : "error";
  } catch {
    return "error";
  }
}

// ─── Health Check ────────────────────────────────────────────────────────────

async function checkHealth(): Promise<HealthState> {
  const state: HealthState = {
    database: "unknown",
    redis: "unknown",
    api: "unknown",
    frontend: "unknown",
    adminPanel: "unknown",
    memoryMb: 0,
    memoryStatus: "unknown",
    uptimeSecs: Math.round(process.uptime()),
    overall: "unknown",
    checkedAt: new Date(),
  };

  // Run all checks in parallel for speed
  const [dbResult, redisResult, apiResult, frontendResult, adminResult] = await Promise.allSettled([
    // Database
    prisma.$queryRaw`SELECT 1`.then(() => "ok" as ServiceStatus).catch(() => "error" as ServiceStatus),
    // Redis
    isRedisReady().then((ready) => (ready ? "ok" : "error") as ServiceStatus).catch(() => "error" as ServiceStatus),
    // API self-check (only available once server is running)
    httpProbe(API_HEALTH_URL),
    // Frontend (Next.js dashboard)
    httpProbe(FRONTEND_URL),
    // Admin panel
    httpProbe(ADMIN_URL),
  ]);

  state.database = dbResult.status === "fulfilled" ? dbResult.value : "error";
  state.redis = redisResult.status === "fulfilled" ? redisResult.value : "error";
  state.api = apiResult.status === "fulfilled" ? apiResult.value : "error";
  state.frontend = frontendResult.status === "fulfilled" ? frontendResult.value : "error";
  state.adminPanel = adminResult.status === "fulfilled" ? adminResult.value : "error";

  // Memory
  const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const totalMb = Math.round(os.totalmem() / 1024 / 1024);
  state.memoryMb = heapMb;
  state.memoryStatus = heapMb > MEMORY_WARN_MB ? "warn" : "ok";

  if (state.database === "error") {
    log.error("Health monitor: database check failed");
  }
  if (state.redis === "error") {
    log.warn("Health monitor: Redis not ready");
  }

  // Overall — database down = unhealthy, any other error = degraded
  const criticalFail = state.database === "error";
  const softFail =
    state.redis === "error" ||
    state.api === "error" ||
    state.frontend === "error" ||
    state.adminPanel === "error" ||
    state.memoryStatus === "warn";

  if (criticalFail) {
    state.overall = "unhealthy";
  } else if (softFail) {
    state.overall = "degraded";
  } else {
    state.overall = "ok";
  }

  log.debug({ heapMb, totalMb }, "Health monitor: memory snapshot");

  return state;
}

// ─── Main tick ───────────────────────────────────────────────────────────────

async function runHealthCheck(): Promise<void> {
  try {
    const current = await checkHealth();
    const notif = buildChangeNotification(current, previousState, isFirstCheck);

    log.info(
      {
        database: current.database,
        redis: current.redis,
        api: current.api,
        frontend: current.frontend,
        adminPanel: current.adminPanel,
        memoryMb: current.memoryMb,
        overall: current.overall,
        changed: notif !== null,
      },
      "Health monitor check complete",
    );

    if (notif && TELEGRAM_CHAT_ID && TELEGRAM_BOT_TOKEN) {
      try {
        await sendTelegramMessage({
          text: notif,
          button: { label: "📊 Open Admin Dashboard", url: `${ADMIN_URL}/admin/ai-health` },
        });
        log.info({ overall: current.overall }, "Health monitor Telegram alert sent");
      } catch (err) {
        log.error({ err }, "Health monitor Telegram alert failed");
      }
    }

    previousState = current;
    isFirstCheck = false;

    // Poll for /status commands each tick
    void pollTelegramCommands();
  } catch (err) {
    log.error({ err }, "Health monitor check error");
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export function initializeHealthMonitorCron(): void {
  if (!ENABLED) {
    log.info("Health monitor cron is disabled (HEALTH_MONITOR_ENABLED=false)");
    return;
  }

  log.info(
    {
      intervalSecs: INTERVAL_SECS,
      memoryWarnMb: MEMORY_WARN_MB,
      apiHealthUrl: API_HEALTH_URL,
      telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    },
    "Health monitor cron initialized",
  );

  initialTimer = setTimeout(() => {
    void runHealthCheck();
    cronTimer = setInterval(() => void runHealthCheck(), INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

export function stopHealthMonitorCron(): void {
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
  log.info("Health monitor cron stopped");
}
