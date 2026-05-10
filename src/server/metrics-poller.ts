/**
 * Metrics Poller (Wave 4.2)
 *
 * A handful of Prometheus metrics describe state that doesn't update
 * inline with request handling — BullMQ queue depth and the running
 * workspace count, for example. Polling them on a fixed cadence is
 * cheaper and simpler than instrumenting every state transition.
 *
 * The poller runs on every API replica; that's fine because the
 * gauges it sets are *snapshots*, not counters — Prometheus deduplicates
 * per scrape via the per-replica `instance` label, and dashboards `max()`
 * across replicas.
 *
 * Survives Redis or Prisma blips: each tick is wrapped in try/catch
 * and a failed tick just leaves the previous gauge value in place.
 *
 * @module server/metrics-poller
 */

import { logger } from "@/lib/logger";
import { queueDepthGauge, workspaceContainersGauge } from "@/lib/metrics";
import { prisma } from "@/lib/prisma";
import type { JobType } from "bullmq";

const log = logger.child({ module: "metrics-poller" });

const QUEUE_STATES: JobType[] = ["waiting", "active", "delayed", "failed", "completed"];

const POLL_INTERVAL_MS = parseInt(
  process.env.METRICS_POLL_INTERVAL_MS || "30000",
  10,
);

let timer: ReturnType<typeof setInterval> | null = null;

async function pollQueueDepth(): Promise<void> {
  // Honor the WORKFLOW_QUEUE_ENABLED gate — otherwise a fresh dev
  // server would try to spin up a Redis connection just to count zero.
  if ((process.env.WORKFLOW_QUEUE_ENABLED ?? "false").toLowerCase() !== "true") {
    return;
  }

  // Lazy import: workflow-queue boots a BullMQ Queue (and therefore a
  // Redis connection) the moment it's imported. Defer the import until
  // we actually intend to poll, so a process with the flag off never
  // touches Redis at all.
  let getWorkflowQueue: () => { getJobCounts: (...types: JobType[]) => Promise<Record<string, number>> };
  try {
    const mod = await import("@/modules/workflow/workflow-queue");
    getWorkflowQueue = mod.getWorkflowQueue;
  } catch (err) {
    log.debug({ err }, "workflow-queue module not available; skipping");
    return;
  }

  try {
    const q = getWorkflowQueue();
    const counts = await q.getJobCounts(...QUEUE_STATES);
    for (const [state, count] of Object.entries(counts)) {
      queueDepthGauge.set({ queue: "workflow-runs", state }, count);
    }
  } catch (err) {
    log.warn({ err }, "Queue-depth poll failed");
  }
}

async function pollWorkspaceCounts(): Promise<void> {
  try {
    const rows = await prisma.workspaceContainer.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    // Reset known statuses to 0 first so a status that disappears from
    // the result set (e.g. zero PROVISIONING containers) drops back to 0
    // instead of pinning at the last seen value.
    for (const status of ["RUNNING", "STOPPED", "ERROR", "PROVISIONING"]) {
      workspaceContainersGauge.set({ status: status.toLowerCase() }, 0);
    }
    for (const row of rows) {
      workspaceContainersGauge.set(
        { status: String(row.status).toLowerCase() },
        row._count._all,
      );
    }
  } catch (err) {
    log.warn({ err }, "Workspace count poll failed");
  }
}

async function tick(): Promise<void> {
  // Run both polls regardless of which one fails; failures already
  // log inside each.
  await Promise.allSettled([pollQueueDepth(), pollWorkspaceCounts()]);
}

export function startMetricsPoller(): void {
  if (timer) {
    log.warn("Metrics poller already started");
    return;
  }
  log.info({ intervalMs: POLL_INTERVAL_MS }, "Starting metrics poller");
  // Kick once shortly after start so dashboards have data without
  // waiting a full tick.
  setTimeout(() => void tick(), 5_000);
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
}

export function stopMetricsPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log.info("Metrics poller stopped");
  }
}
