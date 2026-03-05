/**
 * Workspace Metrics Service
 * 
 * Periodically polls resource usage from running containers via the bridge agent
 * and persists snapshots to the WorkspaceMetric table for time-series analysis.
 * 
 * Provides query APIs with time-range filtering for dashboards, admin views,
 * and usage billing.
 * 
 * @module modules/workspace/metrics.service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import { bridgeClientManager } from './bridge-client.service';

const log = logger.child({ module: 'workspace:metrics' });

// ===========================================
// Configuration
// ===========================================

/** How often to poll metrics from running containers (ms) */
const METRICS_POLL_INTERVAL = 60_000; // 1 minute

/** Maximum age for metrics records before cleanup (days) */
const METRICS_RETENTION_DAYS = 30;

/** Cleanup runs every N poll cycles */
const CLEANUP_EVERY_N_CYCLES = 60; // ~1 hour at 1-min polls

// ===========================================
// Types
// ===========================================

export interface MetricSnapshot {
  containerId: string;
  memoryUsedMb: number;
  memoryPercent: number;
  cpuPercent: number;
  diskUsedMb: number;
  diskPercent: number;
  runningPlugins: number;
  createdAt: Date;
}

export interface MetricsQuery {
  containerId: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

export interface MetricsSummary {
  containerId: string;
  period: { since: Date; until: Date };
  samples: number;
  memory: { avgMb: number; maxMb: number; avgPercent: number; maxPercent: number };
  cpu: { avgPercent: number; maxPercent: number };
  disk: { avgMb: number; maxMb: number; avgPercent: number; maxPercent: number };
}

// ===========================================
// Metrics Service
// ===========================================

class WorkspaceMetricsService {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private cycleCount = 0;

  // ===========================================
  // Lifecycle
  // ===========================================

  /**
   * Start periodic metrics collection
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    log.info('Workspace metrics service started');

    this.pollInterval = setInterval(() => {
      this.collectAll().catch(err => {
        log.error({ error: err.message }, 'Metrics collection cycle failed');
      });
    }, METRICS_POLL_INTERVAL);
  }

  /**
   * Stop periodic metrics collection
   */
  stop(): void {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    log.info('Workspace metrics service stopped');
  }

  // ===========================================
  // Collection
  // ===========================================

  /**
   * Collect metrics from all running containers
   */
  async collectAll(): Promise<void> {
    const containers = await prisma.workspaceContainer.findMany({
      where: { status: 'RUNNING' },
      select: {
        id: true,
        containerName: true,
        ramMb: true,
        storageMb: true,
      },
    });

    if (containers.length === 0) return;

    log.debug({ count: containers.length }, 'Collecting metrics from running containers');

    let collected = 0;

    for (const container of containers) {
      try {
        const client = bridgeClientManager.getExistingClient(container.id);
        if (!client) continue;

        const stats = await client.systemStats() as {
          memory?: { usedMb?: number; totalMb?: number; percent?: number };
          cpu?: { loadAvg?: number[] };
          disk?: { usedMb?: number; totalMb?: number; percent?: number };
          plugins?: { running?: number };
        };

        if (!stats) continue;

        await prisma.workspaceMetric.create({
          data: {
            containerId: container.id,
            memoryUsedMb: stats.memory?.usedMb ?? 0,
            memoryPercent: stats.memory?.percent ?? 0,
            cpuPercent: stats.cpu?.loadAvg?.[0] ?? 0,
            diskUsedMb: stats.disk?.usedMb ?? 0,
            diskPercent: stats.disk?.percent ?? 0,
            runningPlugins: stats.plugins?.running ?? 0,
          },
        });

        collected++;
      } catch (err) {
        log.debug({
          containerDbId: container.id,
          error: (err as Error).message,
        }, 'Failed to collect metrics for container');
      }
    }

    if (collected > 0) {
      log.debug({ collected, total: containers.length }, 'Metrics collected');
    }

    // Periodic cleanup
    this.cycleCount++;
    if (this.cycleCount >= CLEANUP_EVERY_N_CYCLES) {
      this.cycleCount = 0;
      this.cleanup().catch(err => {
        log.error({ error: err.message }, 'Metrics cleanup failed');
      });
    }
  }

  // ===========================================
  // Query API
  // ===========================================

  /**
   * Get metrics for a container with time-range filtering
   */
  async getMetrics(query: MetricsQuery): Promise<MetricSnapshot[]> {
    const where: Record<string, unknown> = {
      containerId: query.containerId,
    };

    if (query.since || query.until) {
      const createdAt: Record<string, Date> = {};
      if (query.since) createdAt.gte = query.since;
      if (query.until) createdAt.lte = query.until;
      where.createdAt = createdAt;
    }

    const metrics = await prisma.workspaceMetric.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 60, // Default: last 60 samples (1 hour at 1-min intervals)
    });

    return metrics.map(m => ({
      containerId: m.containerId,
      memoryUsedMb: m.memoryUsedMb,
      memoryPercent: m.memoryPercent,
      cpuPercent: m.cpuPercent,
      diskUsedMb: m.diskUsedMb,
      diskPercent: m.diskPercent,
      runningPlugins: m.runningPlugins,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Get latest metric snapshot for a container
   */
  async getLatest(containerId: string): Promise<MetricSnapshot | null> {
    const metric = await prisma.workspaceMetric.findFirst({
      where: { containerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!metric) return null;

    return {
      containerId: metric.containerId,
      memoryUsedMb: metric.memoryUsedMb,
      memoryPercent: metric.memoryPercent,
      cpuPercent: metric.cpuPercent,
      diskUsedMb: metric.diskUsedMb,
      diskPercent: metric.diskPercent,
      runningPlugins: metric.runningPlugins,
      createdAt: metric.createdAt,
    };
  }

  /**
   * Get aggregated summary for a container over a time period
   */
  async getSummary(containerId: string, since?: Date, until?: Date): Promise<MetricsSummary | null> {
    const effectiveSince = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h
    const effectiveUntil = until ?? new Date();

    const metrics = await prisma.workspaceMetric.findMany({
      where: {
        containerId,
        createdAt: {
          gte: effectiveSince,
          lte: effectiveUntil,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (metrics.length === 0) return null;

    const n = metrics.length;

    const memoryMbs = metrics.map(m => m.memoryUsedMb);
    const memoryPcts = metrics.map(m => m.memoryPercent);
    const cpuPcts = metrics.map(m => m.cpuPercent);
    const diskMbs = metrics.map(m => m.diskUsedMb);
    const diskPcts = metrics.map(m => m.diskPercent);

    return {
      containerId,
      period: { since: effectiveSince, until: effectiveUntil },
      samples: n,
      memory: {
        avgMb: round(avg(memoryMbs)),
        maxMb: round(Math.max(...memoryMbs)),
        avgPercent: round(avg(memoryPcts)),
        maxPercent: round(Math.max(...memoryPcts)),
      },
      cpu: {
        avgPercent: round(avg(cpuPcts)),
        maxPercent: round(Math.max(...cpuPcts)),
      },
      disk: {
        avgMb: round(avg(diskMbs)),
        maxMb: round(Math.max(...diskMbs)),
        avgPercent: round(avg(diskPcts)),
        maxPercent: round(Math.max(...diskPcts)),
      },
    };
  }

  // ===========================================
  // Cleanup
  // ===========================================

  /**
   * Delete metrics older than retention period
   */
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.workspaceMetric.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      log.info({ deleted: result.count, retentionDays: METRICS_RETENTION_DAYS }, 'Old metrics cleaned up');
    }
  }
}

// ===========================================
// Helpers
// ===========================================

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round(n: number, decimals = 2): number {
  return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// ===========================================
// Singleton Export
// ===========================================

export const workspaceMetricsService = new WorkspaceMetricsService();
