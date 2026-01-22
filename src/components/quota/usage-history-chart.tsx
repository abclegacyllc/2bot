"use client";

/**
 * Usage History Chart Component
 *
 * Displays a bar chart of daily/weekly usage over time.
 * Uses Recharts for visualization.
 *
 * @module components/quota/usage-history-chart
 */

import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface UsageDataPoint {
  date: string;
  executions: number;
  label?: string;
}

interface UsageHistoryChartProps {
  data: UsageDataPoint[];
  limit?: number | null;
  period?: "daily" | "weekly" | "monthly";
  className?: string;
}

// Get max value for scaling
function getMaxValue(data: UsageDataPoint[], limit: number | null): number {
  const maxData = Math.max(...data.map((d) => d.executions));
  if (limit && limit > 0) {
    return Math.max(maxData, limit);
  }
  return maxData || 100;
}

// Format date label
function formatDate(date: string, period: "daily" | "weekly" | "monthly"): string {
  const d = new Date(date);
  if (period === "daily") {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  if (period === "weekly") {
    return `W${Math.ceil(d.getDate() / 7)}`;
  }
  return d.toLocaleDateString(undefined, { month: "short" });
}

// Format number for tooltip
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function UsageHistoryChart({
  data,
  limit,
  period = "daily",
  className,
}: UsageHistoryChartProps) {
  const maxValue = useMemo(() => getMaxValue(data, limit ?? null), [data, limit]);

  // Calculate limit line position
  const limitPercentage = useMemo(() => {
    if (!limit || limit <= 0 || limit > maxValue) return null;
    return (limit / maxValue) * 100;
  }, [limit, maxValue]);

  if (data.length === 0) {
    return (
      <div className={cn("flex h-48 items-center justify-center rounded-lg border bg-muted/30", className)}>
        <p className="text-sm text-muted-foreground">No usage data available</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">Usage History</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-primary" />
            <span>Executions</span>
          </div>
          {limitPercentage && (
            <div className="flex items-center gap-1">
              <div className="h-0.5 w-3 bg-red-500" />
              <span>Limit</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div className="relative h-48">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-muted-foreground pr-2 w-12">
          <span>{formatNumber(maxValue)}</span>
          <span>{formatNumber(maxValue / 2)}</span>
          <span>0</span>
        </div>

        {/* Chart area */}
        <div className="ml-14 h-full flex items-end gap-1 relative">
          {/* Limit line */}
          {limitPercentage && (
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed border-red-500/50"
              style={{ bottom: `${limitPercentage}%` }}
            >
              <span className="absolute -top-3 right-0 text-[10px] text-red-500 bg-card px-1">
                Limit
              </span>
            </div>
          )}

          {/* Bars */}
          {data.map((point, i) => {
            const height = maxValue > 0 ? (point.executions / maxValue) * 100 : 0;
            const isOverLimit = limit && point.executions > limit;

            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-end group"
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-popover border rounded-md px-2 py-1 text-xs shadow-md whitespace-nowrap">
                    <p className="font-medium">
                      {point.label || formatDate(point.date, period)}
                    </p>
                    <p className="text-muted-foreground">
                      {formatNumber(point.executions)} executions
                    </p>
                  </div>
                </div>

                {/* Bar */}
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    isOverLimit
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-primary hover:bg-primary/80"
                  )}
                  style={{ height: `${height}%`, minHeight: point.executions > 0 ? "4px" : "0" }}
                />
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="ml-14 flex mt-2">
          {data.map((point, i) => (
            <div key={i} className="flex-1 text-center text-xs text-muted-foreground">
              {point.label || formatDate(point.date, period)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Helper to generate sample/mock data for testing
export function generateMockUsageData(
  days: number = 7,
  avgExecutions: number = 100
): UsageDataPoint[] {
  const data: UsageDataPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Random variance around the average
    const variance = Math.random() * 0.6 - 0.3; // -30% to +30%
    const executions = Math.max(0, Math.round(avgExecutions * (1 + variance)));

    data.push({
      date: date.toISOString().split("T")[0] || "",
      executions,
    });
  }

  return data;
}
