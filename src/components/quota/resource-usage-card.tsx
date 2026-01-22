"use client";

/**
 * Resource Usage Card Component
 *
 * Displays a single resource usage metric with icon, usage bar,
 * and optional reset date.
 *
 * @module components/quota/resource-usage-card
 */

import { cn } from "@/lib/utils";
import { UsageProgressBar, type ProgressBarSize } from "./usage-progress-bar";
import { LucideIcon } from "lucide-react";

interface ResourceUsageCardProps {
  icon: LucideIcon;
  label: string;
  current: number;
  limit: number | null; // null = unlimited
  unit?: string;
  resetsAt?: Date;
  showUpgrade?: boolean;
  onUpgrade?: () => void;
  size?: ProgressBarSize;
  className?: string;
}

// Format number with appropriate suffix
function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

// Format reset date
function formatResetDate(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Resets today";
  if (diffDays === 1) return "Resets tomorrow";
  if (diffDays <= 7) return `Resets in ${diffDays} days`;
  return `Resets ${date.toLocaleDateString()}`;
}

export function ResourceUsageCard({
  icon: Icon,
  label,
  current,
  limit,
  unit,
  resetsAt,
  showUpgrade,
  onUpgrade,
  size = "md",
  className,
}: ResourceUsageCardProps) {
  const isUnlimited = limit === null;
  const percentage = isUnlimited ? 0 : limit > 0 ? (current / limit) * 100 : 0;
  const isWarning = percentage >= 80;
  const isCritical = percentage >= 95;
  const isBlocked = percentage >= 100;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-colors",
        isBlocked && "border-red-200 dark:border-red-800",
        isCritical && !isBlocked && "border-orange-200 dark:border-orange-800",
        isWarning && !isCritical && "border-yellow-200 dark:border-yellow-800",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Icon and label */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              isBlocked
                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                : isCritical
                  ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                  : isWarning
                    ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-medium text-sm">{label}</h3>
            <p className="text-xs text-muted-foreground">
              {isUnlimited ? (
                <>
                  {formatNumber(current)} {unit || ""} used • Unlimited
                </>
              ) : (
                <>
                  {formatNumber(current)} / {formatNumber(limit)} {unit || ""}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Upgrade button for warning states */}
        {showUpgrade && isWarning && !isUnlimited && onUpgrade && (
          <button
            onClick={onUpgrade}
            className={cn(
              "text-xs font-medium hover:underline",
              isBlocked
                ? "text-red-600 dark:text-red-400"
                : isCritical
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-yellow-600 dark:text-yellow-400"
            )}
          >
            Upgrade
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        {isUnlimited ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 flex-1 rounded-full bg-primary/20">
              <div className="h-full w-0 rounded-full bg-primary" />
            </div>
            <span className="text-green-600 dark:text-green-400">∞</span>
          </div>
        ) : (
          <UsageProgressBar
            current={current}
            limit={limit}
            showPercentage={false}
            size={size}
          />
        )}
      </div>

      {/* Reset date */}
      {resetsAt && !isUnlimited && (
        <p className="mt-2 text-xs text-muted-foreground">
          {formatResetDate(resetsAt)}
        </p>
      )}
    </div>
  );
}
