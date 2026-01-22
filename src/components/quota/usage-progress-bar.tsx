"use client";

/**
 * Usage Progress Bar Component
 *
 * Displays a progress bar with color-coded warning levels.
 * Colors based on percentage:
 * - 0-79%: green
 * - 80-94%: yellow (warning)
 * - 95-99%: orange (critical)
 * - 100%: red (blocked)
 *
 * @module components/quota/usage-progress-bar
 */

import { cn } from "@/lib/utils";

type WarningLevel = "none" | "warning" | "critical" | "blocked";

export type ProgressBarSize = "sm" | "md" | "lg";

interface UsageProgressBarProps {
  label?: string;
  current: number;
  limit: number | null; // null = unlimited
  showPercentage?: boolean;
  size?: ProgressBarSize;
  className?: string;
}

// Get warning level from percentage
function getWarningLevel(current: number, limit: number | null): WarningLevel {
  if (limit === null || limit === -1 || limit === 0) return "none";
  const percentage = (current / limit) * 100;
  if (percentage >= 100) return "blocked";
  if (percentage >= 95) return "critical";
  if (percentage >= 80) return "warning";
  return "none";
}

// Get color classes based on warning level
function getColorClasses(level: WarningLevel): string {
  switch (level) {
    case "blocked":
      return "bg-red-500";
    case "critical":
      return "bg-orange-500";
    case "warning":
      return "bg-yellow-500";
    default:
      return "bg-green-500";
  }
}

// Get size classes
function getSizeClasses(size: "sm" | "md" | "lg"): {
  bar: string;
  text: string;
} {
  switch (size) {
    case "sm":
      return { bar: "h-1.5", text: "text-xs" };
    case "lg":
      return { bar: "h-4", text: "text-base" };
    default:
      return { bar: "h-2.5", text: "text-sm" };
  }
}

// Format number for display
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function UsageProgressBar({
  label,
  current,
  limit,
  showPercentage = true,
  size = "md",
  className,
}: UsageProgressBarProps) {
  const isUnlimited = limit === null || limit === -1;
  const percentage = isUnlimited ? 0 : Math.min(100, (current / limit) * 100);
  const warningLevel = getWarningLevel(current, limit);
  const sizeClasses = getSizeClasses(size);

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Label and value */}
      {(label || showPercentage) && (
        <div className={cn("flex items-center justify-between", sizeClasses.text)}>
          {label && <span className="font-medium text-foreground">{label}</span>}
          <span className="text-muted-foreground">
            {isUnlimited ? (
              <>
                {formatNumber(current)}{" "}
                <span className="text-green-600">/ Unlimited</span>
              </>
            ) : (
              <>
                {formatNumber(current)} / {formatNumber(limit)}
                {showPercentage && (
                  <span className="ml-1 text-muted-foreground/70">
                    ({Math.round(percentage)}%)
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-secondary",
          sizeClasses.bar
        )}
      >
        {isUnlimited ? (
          <div className="h-full w-full bg-green-200 dark:bg-green-900/30" />
        ) : (
          <div
            className={cn(
              "h-full transition-all duration-300 rounded-full",
              getColorClasses(warningLevel)
            )}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
    </div>
  );
}
