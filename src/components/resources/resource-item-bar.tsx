"use client";

/**
 * Resource Item Bar Component
 * 
 * Displays a single resource metric with progress bar.
 * Handles CountQuota, UsageMetric, and AllocationQuota types.
 * 
 * Color coding:
 * - 0-79%: green (normal)
 * - 80-94%: yellow (warning)
 * - 95-99%: orange (critical)
 * - 100%+: red (blocked)
 * 
 * @module components/resources/resource-item-bar
 */

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type WarningLevel = "normal" | "warning" | "critical" | "blocked";

export interface ResourceItemBarProps {
  /** Icon to display */
  icon?: LucideIcon;
  /** Label for the resource */
  label: string;
  /** Current value */
  current: number;
  /** Limit value (null = unlimited) */
  limit: number | null;
  /** Unit suffix (e.g., "MB", "cores") */
  unit?: string;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Bar size */
  size?: "sm" | "md" | "lg";
  /** Additional class names */
  className?: string;
  /** Reset date for metrics */
  resetsAt?: string | null;
  /** Period for metrics */
  period?: "hourly" | "daily" | "monthly";
}

// Get warning level from percentage
function getWarningLevel(current: number, limit: number | null): WarningLevel {
  if (limit === null || limit === -1 || limit === 0) return "normal";
  const percentage = (current / limit) * 100;
  if (percentage >= 100) return "blocked";
  if (percentage >= 95) return "critical";
  if (percentage >= 80) return "warning";
  return "normal";
}

// Get color classes based on warning level
function getBarColorClass(level: WarningLevel): string {
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

function getTextColorClass(level: WarningLevel): string {
  switch (level) {
    case "blocked":
      return "text-red-500";
    case "critical":
      return "text-orange-500";
    case "warning":
      return "text-yellow-500";
    default:
      return "text-foreground";
  }
}

// Get size classes
function getSizeClasses(size: "sm" | "md" | "lg"): { bar: string; text: string } {
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
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

// Format reset date
function formatResetDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return "Resets today";
  if (diffDays === 1) return "Resets tomorrow";
  if (diffDays <= 7) return `Resets in ${diffDays} days`;
  return `Resets ${date.toLocaleDateString()}`;
}

export function ResourceItemBar({
  icon: Icon,
  label,
  current,
  limit,
  unit = "",
  showPercentage = true,
  size = "md",
  className,
  resetsAt,
  period,
}: ResourceItemBarProps) {
  const isUnlimited = limit === null || limit === -1;
  const percentage = isUnlimited ? 0 : Math.min(100, (current / limit) * 100);
  const warningLevel = getWarningLevel(current, limit);
  const sizeClasses = getSizeClasses(size);
  const resetText = formatResetDate(resetsAt);

  const displayLimit = isUnlimited 
    ? "Unlimited" 
    : `${formatNumber(limit)}${unit ? ` ${unit}` : ""}`;

  const displayCurrent = `${formatNumber(current)}${unit && !isUnlimited ? ` ${unit}` : ""}`;

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Label and value row */}
      <div className={cn("flex items-center justify-between", sizeClasses.text)}>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium text-foreground">{label}</span>
          {period && (
            <span className="text-xs text-muted-foreground">/{period}</span>
          )}
        </div>
        <span className={cn("tabular-nums", getTextColorClass(warningLevel))}>
          {displayCurrent} / {displayLimit}
          {showPercentage && !isUnlimited && (
            <span className="text-muted-foreground ml-1">
              ({Math.round(percentage)}%)
            </span>
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div className={cn("w-full bg-muted rounded-full overflow-hidden", sizeClasses.bar)}>
        <div
          className={cn(
            "h-full transition-all duration-300",
            isUnlimited ? "bg-green-500/30 w-0" : getBarColorClass(warningLevel)
          )}
          style={{ width: isUnlimited ? "0%" : `${Math.min(100, percentage)}%` }}
        />
      </div>

      {/* Reset text */}
      {resetText && (
        <p className="text-xs text-muted-foreground">{resetText}</p>
      )}
    </div>
  );
}
