"use client";

/**
 * Quota Usage Bar Component
 *
 * Displays a progress bar showing allocated vs total quota.
 * Used in the quota management page.
 *
 * @module components/organization/quota-usage-bar
 */

import { cn } from "@/lib/utils";

interface QuotaUsageBarProps {
  label: string;
  used: number;
  limit: number | null;
  remaining?: number | null;
  formatValue?: (value: number) => string;
  className?: string;
}

// Default number formatter
function defaultFormat(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

// Get progress color based on percentage
function getProgressColor(percentage: number): string {
  if (percentage >= 90) return "bg-red-500";
  if (percentage >= 75) return "bg-amber-500";
  if (percentage >= 50) return "bg-yellow-500";
  return "bg-primary";
}

export function QuotaUsageBar({
  label,
  used,
  limit,
  remaining,
  formatValue = defaultFormat,
  className,
}: QuotaUsageBarProps) {
  const isUnlimited = limit === null || limit === -1;
  const percentage = isUnlimited ? 0 : Math.min(100, (used / limit) * 100);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {isUnlimited ? (
            <span className="text-green-600">Unlimited</span>
          ) : (
            <>
              {formatValue(used)} / {formatValue(limit)}
            </>
          )}
        </span>
      </div>

      {!isUnlimited && (
        <div className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
          <div
            className={cn("h-full transition-all", getProgressColor(percentage))}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {remaining !== undefined && remaining !== null && (
        <p className="text-xs text-muted-foreground">
          {formatValue(remaining)} remaining
        </p>
      )}

      {isUnlimited && (
        <div className="h-2 bg-green-100 dark:bg-green-900/30 rounded-full" />
      )}
    </div>
  );
}
