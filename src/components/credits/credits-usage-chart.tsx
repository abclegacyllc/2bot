"use client";

/**
 * Credits Usage Chart
 *
 * Line/bar chart showing credit usage over time.
 * Used on both personal and organization credits pages.
 *
 * @module components/credits/credits-usage-chart
 */

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

export interface DailyUsage {
  date: string;
  credits: number;
}

export interface CreditsUsageChartProps {
  data: DailyUsage[];
  loading?: boolean;
  period?: string;
  onPeriodChange?: (period: string) => void;
  className?: string;
}

/**
 * Format credits for display
 */
function formatCredits(credits: number): string {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`;
  }
  if (credits >= 1_000) {
    return `${(credits / 1_000).toFixed(1)}K`;
  }
  return credits.toString();
}

/**
 * Simple bar chart implementation (can be replaced with recharts if needed)
 */
function SimpleBarChart({ data }: { data: DailyUsage[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-muted-foreground">
        No usage data for this period
      </div>
    );
  }

  const maxCredits = Math.max(...data.map((d) => d.credits), 1);

  return (
    <div className="flex h-[200px] items-end gap-1">
      {data.map((item, i) => {
        const height = (item.credits / maxCredits) * 100;
        const dateLabel = new Date(item.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        return (
          <div
            key={item.date}
            className="group relative flex flex-1 flex-col items-center"
          >
            {/* Bar */}
            <div
              className="w-full max-w-[40px] rounded-t bg-primary/80 transition-colors hover:bg-primary"
              style={{ height: `${Math.max(height, 2)}%` }}
            />
            {/* Label (show every few bars to avoid crowding) */}
            {i % Math.ceil(data.length / 7) === 0 && (
              <span className="mt-1 text-[10px] text-muted-foreground">
                {dateLabel}
              </span>
            )}
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 hidden rounded bg-popover px-2 py-1 text-xs shadow-md group-hover:block">
              <div className="font-medium">{formatCredits(item.credits)}</div>
              <div className="text-muted-foreground">{dateLabel}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CreditsUsageChart({
  data,
  loading = false,
  period,
  onPeriodChange,
  className,
}: CreditsUsageChartProps) {
  // Generate period options (last 6 months)
  const periodOptions = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    return { value, label };
  });

  if (loading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalUsage = data.reduce((sum, d) => sum + d.credits, 0);

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage Over Time
          </CardTitle>
          <CardDescription>
            Total this period: {formatCredits(totalUsage)} credits
          </CardDescription>
        </div>
        {onPeriodChange && (
          <Select value={period} onValueChange={onPeriodChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent>
        <SimpleBarChart data={data} />
      </CardContent>
    </Card>
  );
}
