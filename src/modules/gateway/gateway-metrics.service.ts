/**
 * Gateway Metrics Service (Phase 8)
 *
 * Records action execution counts per gateway, bucketed by daily period.
 * Uses upsert + increment for efficient fire-and-forget metric collection.
 *
 * @module modules/gateway/gateway-metrics.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const metricsLogger = logger.child({ module: "gateway-metrics" });

/**
 * Build a daily period key: "2026-02-09"
 */
function getDailyPeriod(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Metric row returned by getMetrics
 */
export interface MetricRow {
  action: string;
  period: string;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
}

/**
 * Dashboard summary for quick overview
 */
export interface MetricSummary {
  totalActions: number;
  totalErrors: number;
  successRate: number; // 0‒100
  topActions: Array<{ action: string; count: number }>;
  avgDurationMs: number;
}

class GatewayMetricService {
  /**
   * Record a successful action execution (fire-and-forget).
   *
   * Uses upsert + atomic increment to stay safe under concurrency.
   */
  async recordSuccess(
    gatewayId: string,
    action: string,
    durationMs: number
  ): Promise<void> {
    const period = getDailyPeriod();

    try {
      await prisma.gatewayMetric.upsert({
        where: {
          gatewayId_action_period: { gatewayId, action, period },
        },
        create: {
          gatewayId,
          action,
          period,
          successCount: 1,
          errorCount: 0,
          totalDurationMs: BigInt(durationMs),
        },
        update: {
          successCount: { increment: 1 },
          totalDurationMs: { increment: BigInt(durationMs) },
        },
      });
    } catch (error) {
      metricsLogger.error(
        { gatewayId, action, error: (error as Error).message },
        "Failed to record success metric"
      );
    }
  }

  /**
   * Record a failed action execution (fire-and-forget).
   */
  async recordError(
    gatewayId: string,
    action: string,
    durationMs: number
  ): Promise<void> {
    const period = getDailyPeriod();

    try {
      await prisma.gatewayMetric.upsert({
        where: {
          gatewayId_action_period: { gatewayId, action, period },
        },
        create: {
          gatewayId,
          action,
          period,
          successCount: 0,
          errorCount: 1,
          totalDurationMs: BigInt(durationMs),
        },
        update: {
          errorCount: { increment: 1 },
          totalDurationMs: { increment: BigInt(durationMs) },
        },
      });
    } catch (error) {
      metricsLogger.error(
        { gatewayId, action, error: (error as Error).message },
        "Failed to record error metric"
      );
    }
  }

  /**
   * Get metric rows for a gateway over a date range.
   */
  async getMetrics(
    gatewayId: string,
    opts: { days?: number; action?: string } = {}
  ): Promise<MetricRow[]> {
    const days = opts.days ?? 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = getDailyPeriod(since);

    const where: Record<string, unknown> = {
      gatewayId,
      period: { gte: sinceStr },
    };
    if (opts.action) {
      where.action = opts.action;
    }

    const rows = await prisma.gatewayMetric.findMany({
      where,
      orderBy: [{ period: "desc" }, { action: "asc" }],
    });

    return rows.map((r) => {
      const total = r.successCount + r.errorCount;
      return {
        action: r.action,
        period: r.period,
        successCount: r.successCount,
        errorCount: r.errorCount,
        avgDurationMs: total > 0 ? Number(r.totalDurationMs) / total : 0,
      };
    });
  }

  /**
   * Get a high-level dashboard summary for a gateway.
   */
  async getDashboardStats(gatewayId: string): Promise<MetricSummary> {
    // Aggregate all-time (or last 30d for performance)
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = getDailyPeriod(since);

    const rows = await prisma.gatewayMetric.findMany({
      where: {
        gatewayId,
        period: { gte: sinceStr },
      },
    });

    let totalActions = 0;
    let totalErrors = 0;
    let totalDuration = BigInt(0);
    const actionCounts: Record<string, number> = {};

    for (const r of rows) {
      totalActions += r.successCount + r.errorCount;
      totalErrors += r.errorCount;
      totalDuration += r.totalDurationMs;
      actionCounts[r.action] = (actionCounts[r.action] ?? 0) + r.successCount + r.errorCount;
    }

    const topActions = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    return {
      totalActions,
      totalErrors,
      successRate: totalActions > 0 ? Math.round(((totalActions - totalErrors) / totalActions) * 10000) / 100 : 100,
      topActions,
      avgDurationMs: totalActions > 0 ? Number(totalDuration) / totalActions : 0,
    };
  }
}

export const gatewayMetricService = new GatewayMetricService();
