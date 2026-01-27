"use client";

/**
 * Usage Warning Banner Component
 *
 * Displays contextual warning banners based on usage percentage.
 * - 80%+: Yellow warning banner
 * - 95%+: Orange critical banner
 * - 100%: Red blocked banner
 *
 * @module components/quota/usage-warning-banner
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, X, Zap } from "lucide-react";

type WarningLevel = "warning" | "critical" | "blocked";

interface UsageWarningBannerProps {
  resource: string; // "executions", "gateways", etc.
  percentage: number;
  current?: number;
  limit?: number | null;
  resetsAt?: Date;
  onUpgrade?: () => void;
  onDismiss?: () => void;
  className?: string;
}

// Determine warning level from percentage
function getWarningLevel(percentage: number): WarningLevel | null {
  if (percentage >= 100) return "blocked";
  if (percentage >= 95) return "critical";
  if (percentage >= 80) return "warning";
  return null;
}

// Get styling based on level
function getLevelStyles(level: WarningLevel): {
  bg: string;
  border: string;
  text: string;
  icon: typeof AlertTriangle;
} {
  switch (level) {
    case "blocked":
      return {
        bg: "bg-red-50 dark:bg-red-950/30",
        border: "border-red-200 dark:border-red-800",
        text: "text-red-800 dark:text-red-200",
        icon: AlertCircle,
      };
    case "critical":
      return {
        bg: "bg-orange-50 dark:bg-orange-950/30",
        border: "border-orange-200 dark:border-orange-800",
        text: "text-orange-800 dark:text-orange-200",
        icon: AlertTriangle,
      };
    default:
      return {
        bg: "bg-yellow-50 dark:bg-yellow-950/30",
        border: "border-yellow-200 dark:border-yellow-800",
        text: "text-yellow-800 dark:text-yellow-200",
        icon: AlertTriangle,
      };
  }
}

// Format remaining time
function formatResetTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return `in ${diffDays} days`;
  return date.toLocaleDateString();
}

export function UsageWarningBanner({
  resource,
  percentage,
  current,
  limit,
  resetsAt,
  onUpgrade,
  onDismiss,
  className,
}: UsageWarningBannerProps) {
  const level = getWarningLevel(percentage);

  // Don't render if below warning threshold
  if (!level) return null;

  const styles = getLevelStyles(level);
  const Icon = styles.icon;

  // Build message based on level
  const getMessage = (): string => {
    switch (level) {
      case "blocked":
        return `🚫 ${resource} limit reached. ${resetsAt ? `Resets ${formatResetTime(resetsAt)}.` : ""} Upgrade to continue.`;
      case "critical":
        return `⚠️ Critical: Only ${100 - Math.round(percentage)}% of ${resource.toLowerCase()} remaining.`;
      default:
        return `You've used ${Math.round(percentage)}% of your monthly ${resource.toLowerCase()}.`;
    }
  };

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-lg border p-3",
        styles.bg,
        styles.border,
        className
      )}
      role="alert"
    >
      <Icon className={cn("h-5 w-5 shrink-0", styles.text)} />

      <div className={cn("flex-1 text-sm", styles.text)}>
        <p className="font-medium">{getMessage()}</p>
        {current !== undefined && limit !== undefined && limit !== null && (
          <p className="mt-0.5 text-xs opacity-80">
            {current.toLocaleString()} / {limit.toLocaleString()} used
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onUpgrade && (
          <Button
            size="sm"
            variant={level === "blocked" ? "default" : "outline"}
            onClick={onUpgrade}
            className="shrink-0"
          >
            <Zap className="mr-1 h-3 w-3" />
            Upgrade
          </Button>
        )}

        {onDismiss && level !== "blocked" && (
          <button
            onClick={onDismiss}
            className={cn(
              "rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10",
              styles.text
            )}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
