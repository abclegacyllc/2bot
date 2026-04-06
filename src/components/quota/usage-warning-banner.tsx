"use client";

/**
 * Usage Warning Banner
 *
 * Displays a dismissable, colour-coded banner when any resource
 * approaches its plan limit:
 *   - 80 %+ → yellow "warning"
 *   - 95 %+ → orange "critical"
 *   - 100 % → red   "blocked"
 *
 * Render this inside the dashboard layout so it appears above page
 * content whenever a resource needs attention.
 *
 * @module components/quota/usage-warning-banner
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, X, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

export type WarningLevel = "warning" | "critical" | "blocked";

export interface UsageWarningBannerProps {
  /** Human-readable resource label, e.g. "workflow runs" */
  resource: string;
  /** 0–100+ usage percentage */
  percentage: number;
  current?: number;
  limit?: number | null;
  resetsAt?: Date;
  onUpgrade?: () => void;
  onDismiss?: () => void;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

export function getWarningLevel(percentage: number): WarningLevel | null {
  if (percentage >= 100) return "blocked";
  if (percentage >= 95) return "critical";
  if (percentage >= 80) return "warning";
  return null;
}

function getLevelStyles(level: WarningLevel) {
  switch (level) {
    case "blocked":
      return {
        bg: "bg-red-50 dark:bg-red-950/30",
        border: "border-red-200 dark:border-red-800",
        text: "text-red-800 dark:text-red-200",
        Icon: AlertCircle,
      };
    case "critical":
      return {
        bg: "bg-orange-50 dark:bg-orange-950/30",
        border: "border-orange-200 dark:border-orange-800",
        text: "text-orange-800 dark:text-orange-200",
        Icon: AlertTriangle,
      };
    default:
      return {
        bg: "bg-yellow-50 dark:bg-yellow-950/30",
        border: "border-yellow-200 dark:border-yellow-800",
        text: "text-yellow-800 dark:text-yellow-200",
        Icon: AlertTriangle,
      };
  }
}

function formatResetTime(date: Date): string {
  const diffDays = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return `in ${diffDays} days`;
  return date.toLocaleDateString();
}

// ─── Component ───────────────────────────────────────────────

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
  if (!level) return null;

  const { bg, border, text, Icon } = getLevelStyles(level);

  const message = (() => {
    switch (level) {
      case "blocked":
        return `${resource} limit reached.${resetsAt ? ` Resets ${formatResetTime(resetsAt)}.` : ""} Upgrade to continue.`;
      case "critical":
        return `Critical: only ${100 - Math.round(percentage)}% of ${resource.toLowerCase()} remaining.`;
      default:
        return `You've used ${Math.round(percentage)}% of your monthly ${resource.toLowerCase()}.`;
    }
  })();

  return (
    <div
      className={cn("relative flex items-center gap-3 rounded-lg border p-3", bg, border, className)}
      role="alert"
    >
      <Icon className={cn("h-5 w-5 shrink-0", text)} />

      <div className={cn("flex-1 text-sm", text)}>
        <p className="font-medium">{message}</p>
        {current !== undefined && limit !== null && limit !== undefined ? (
          <p className="mt-0.5 text-xs opacity-80">
            {current.toLocaleString()} / {limit.toLocaleString()} used
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {onUpgrade ? (
          <Button
            size="sm"
            variant={level === "blocked" ? "default" : "outline"}
            onClick={onUpgrade}
            className="shrink-0"
          >
            <Zap className="mr-1 h-3 w-3" />
            Upgrade
          </Button>
        ) : null}

        {onDismiss && level !== "blocked" ? (
          <button
            onClick={onDismiss}
            className={cn("rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10", text)}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
