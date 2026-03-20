"use client";

/**
 * Credits Usage Chart
 *
 * Bar chart showing credit usage over time using recharts.
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
import { formatCredits } from "@/shared/lib/format";
import { BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useState } from "react";

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
 * Pad a number to 2 digits
 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Format YYYY-MM-DD to "Mon D" label without timezone issues.
 */
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Fill in all calendar days for the period so the chart isn't sparse.
 * For the current month, fill up to today. For past months, fill the full month.
 */
function fillCalendarDays(data: DailyUsage[], period?: string): Array<{ date: string; label: string; credits: number }> {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-indexed

  if (period) {
    const [y, m] = period.split("-").map(Number);
    if (y && m) {
      year = y;
      month = m;
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const lastDay = isCurrentMonth ? now.getDate() : daysInMonth;

  const dataMap = new Map<string, number>();
  for (const d of data) {
    dataMap.set(d.date, d.credits);
  }

  const filled: Array<{ date: string; label: string; credits: number }> = [];
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
    filled.push({
      date: dateStr,
      label: formatDateLabel(dateStr),
      credits: dataMap.get(dateStr) || 0,
    });
  }

  return filled;
}

/**
 * Custom tooltip for the chart
 */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; credits: number } }> }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]!.payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="font-medium">{data.label}</div>
      <div className="text-muted-foreground">{formatCredits(data.credits)} credits</div>
    </div>
  );
}

/**
 * Read resolved CSS custom property colors from the DOM.
 * This ensures chart colors work with oklch/hsl/any format and respect theme changes.
 */
function useChartColors() {
  const [colors, setColors] = useState({
    chart1: "#3b82f6",    // blue-500 fallback
    muted: "#6b7280",     // gray-500 fallback
    mutedFg: "#9ca3af",   // gray-400 fallback
    border: "#374151",    // gray-700 fallback
  });

  useEffect(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const get = (prop: string) => style.getPropertyValue(prop).trim();

    // Read oklch values and resolve via a temp element
    const resolve = (varName: string, fallback: string): string => {
      const val = get(varName);
      if (!val) return fallback;

      const el = document.createElement("div");
      el.style.color = `oklch(${val})`;
      document.body.appendChild(el);
      const resolved = getComputedStyle(el).color;
      document.body.removeChild(el);
      return resolved || fallback;
    };

    setColors({
      chart1: resolve("--chart-1", "#3b82f6"),
      muted: resolve("--muted", "#6b7280"),
      mutedFg: resolve("--muted-foreground", "#9ca3af"),
      border: resolve("--border", "#374151"),
    });

    // Re-resolve on theme change
    const observer = new MutationObserver(() => {
      const s = getComputedStyle(document.documentElement);
      const r = (v: string, fb: string) => {
        const val = s.getPropertyValue(v).trim();
        if (!val) return fb;
        const el = document.createElement("div");
        el.style.color = `oklch(${val})`;
        document.body.appendChild(el);
        const res = getComputedStyle(el).color;
        document.body.removeChild(el);
        return res || fb;
      };
      setColors({
        chart1: r("--chart-1", "#3b82f6"),
        muted: r("--muted", "#6b7280"),
        mutedFg: r("--muted-foreground", "#9ca3af"),
        border: r("--border", "#374151"),
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

export function CreditsUsageChart({
  data,
  loading = false,
  period,
  onPeriodChange,
  className,
}: CreditsUsageChartProps) {
  const colors = useChartColors();

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
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalUsage = data.reduce((sum, d) => sum + d.credits, 0);
  const chartData = fillCalendarDays(data, period);
  const hasAnyUsage = chartData.some((d) => d.credits > 0);

  // Calculate tick interval for ~7 labels
  const tickInterval = chartData.length > 7 ? Math.ceil(chartData.length / 7) - 1 : 0;

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
        {onPeriodChange ? <Select value={period} onValueChange={onPeriodChange}>
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
          </Select> : null}
      </CardHeader>
      <CardContent>
        {!hasAnyUsage ? (
          <div className="flex h-[250px] items-center justify-center text-muted-foreground">
            No usage data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.chart1} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={colors.chart1} stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={colors.border}
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: colors.mutedFg }}
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fontSize: 11, fill: colors.mutedFg }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.muted, fillOpacity: 0.15 }} />
              <Bar
                dataKey="credits"
                fill="url(#barGradient)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
