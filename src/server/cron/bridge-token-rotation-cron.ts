/**
 * Bridge Token Rotation Cron
 *
 * Periodically rotates the `BRIDGE_AUTH_TOKEN` for every RUNNING workspace
 * container. Rotation is online — no container restart required:
 *
 *   1. Generate a fresh 64-byte hex token.
 *   2. Send `system.rotate-token` to the bridge agent over its already-
 *      authenticated WebSocket. The agent swaps its in-memory token.
 *   3. Encrypt and persist the new token in the DB. Future reconnects use
 *      the new token automatically.
 *
 * Failure handling: if step 2 fails (bridge offline, timeout, error), we keep
 * the old token in the DB and log a warning. Next tick will retry.
 *
 * Distributed lock ensures only one replica rotates at a time.
 *
 * @module server/cron/bridge-token-rotation-cron
 */

import crypto from "crypto";

import { decryptIfEncrypted, encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withDistributedLock } from "@/lib/redis-lock";
import { bridgeClientManager } from "@/modules/workspace/bridge-client.service";
import { dockerService } from "@/modules/workspace/workspace-docker.service";
import { BRIDGE_AUTH_TOKEN_LENGTH } from "@/modules/workspace/workspace.constants";

const log = logger.child({ module: "bridge-token-rotation-cron" });

// Default 24h. Tunable via env so ops can dial it tighter for high-security tenants.
const ROTATION_INTERVAL_MS = parseInt(
  process.env.BRIDGE_TOKEN_ROTATION_INTERVAL_MS || `${24 * 60 * 60 * 1000}`,
  10
);
const LOCK_KEY = "cron:bridge-token-rotation";
// 90% of interval so a crashed replica's lock auto-expires before the next tick.
const LOCK_TTL_SECONDS = Math.floor((ROTATION_INTERVAL_MS / 1000) * 0.9);

let cronTimer: ReturnType<typeof setInterval> | null = null;

async function rotateOne(container: {
  id: string;
  containerId: string | null;
  bridgePort: number | null;
  bridgeAuthToken: string | null;
}): Promise<"rotated" | "skipped" | "failed"> {
  if (!container.containerId || !container.bridgePort || !container.bridgeAuthToken) {
    return "skipped";
  }

  const currentToken = decryptIfEncrypted(container.bridgeAuthToken);
  const newToken = crypto.randomBytes(BRIDGE_AUTH_TOKEN_LENGTH).toString("hex");

  try {
    const client = await bridgeClientManager.getClient(
      container.id,
      container.bridgePort,
      currentToken
    );

    await client.send("system.rotate-token", { token: newToken });

    // Bridge accepted the new token. Persist before any future reconnect picks
    // up the (now-stale) old token.
    await prisma.workspaceContainer.update({
      where: { id: container.id },
      data: { bridgeAuthToken: encrypt(newToken) },
    });

    log.info({ containerDbId: container.id }, "Bridge auth token rotated");
    return "rotated";
  } catch (err) {
    log.warn(
      { containerDbId: container.id, error: (err as Error).message },
      "Bridge token rotation failed — keeping current token"
    );
    return "failed";
  }
}

async function runRotation(): Promise<void> {
  // Avoid touching containers that aren't actually live in Docker.
  const containers = await prisma.workspaceContainer.findMany({
    where: { status: "RUNNING" },
    select: {
      id: true,
      containerId: true,
      bridgePort: true,
      bridgeAuthToken: true,
    },
  });

  if (containers.length === 0) {
    log.debug("No running containers — token rotation idle");
    return;
  }

  // Verify Docker actually shows them running. If a row is RUNNING in the DB
  // but the container is gone, skip.
  const summary = { rotated: 0, skipped: 0, failed: 0 };
  for (const c of containers) {
    if (!c.containerId) {
      summary.skipped++;
      continue;
    }
    try {
      const info = await dockerService.inspectContainer(c.containerId);
      if (!info.running) {
        summary.skipped++;
        continue;
      }
    } catch {
      summary.skipped++;
      continue;
    }

    const result = await rotateOne(c);
    summary[result]++;
  }

  log.info({ summary, total: containers.length }, "Bridge token rotation cycle complete");
}

export function initializeBridgeTokenRotationCron(): void {
  if (cronTimer) {
    log.warn("Bridge token rotation cron already initialized");
    return;
  }

  log.info(
    { intervalHours: ROTATION_INTERVAL_MS / 3600000 },
    "Initializing bridge token rotation cron"
  );

  const runWithLock = () =>
    withDistributedLock(LOCK_KEY, LOCK_TTL_SECONDS, runRotation).catch((err) => {
      log.error({ err }, "Bridge token rotation failed");
    });

  // Stagger startup so a fresh deploy doesn't immediately churn every container.
  setTimeout(() => void runWithLock(), 5 * 60_000);

  cronTimer = setInterval(() => void runWithLock(), ROTATION_INTERVAL_MS);
}

export function stopBridgeTokenRotationCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    log.info("Bridge token rotation cron stopped");
  }
}
