"use client";

/**
 * Credits Limit Warning
 *
 * Displays a warning banner when the user is approaching or has exceeded
 * their credit limit. Shows different states based on severity.
 *
 * @module components/credits/credits-limit-warning
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, XCircle } from "lucide-react";

export interface CreditsLimitWarningProps {
  currentBalance: number;
  monthlyUsed: number;
  monthlyLimit: number | null;
  onBuyCredits?: () => void;
  className?: string;
  dismissable?: boolean;
  onDismiss?: () => void;
}

type WarningLevel = "none" | "low" | "critical" | "exceeded";

function getWarningLevel(
  balance: number,
  used: number,
  limit: number | null
): WarningLevel {
  // Check balance first (thresholds scaled for 1 credit = $0.001)
  if (balance <= 0) {
    return "exceeded";
  }
  if (balance <= 10) {
    return "critical";
  }
  if (balance <= 50) {
    return "low";
  }

  // Check monthly limit if set
  if (limit !== null && limit > 0) {
    const usagePercentage = (used / limit) * 100;
    if (usagePercentage >= 100) {
      return "exceeded";
    }
    if (usagePercentage >= 90) {
      return "critical";
    }
    if (usagePercentage >= 75) {
      return "low";
    }
  }

  return "none";
}

const warningConfig = {
  none: null,
  low: {
    icon: AlertTriangle,
    variant: "default" as const,
    title: "Credits Running Low",
    description: (balance: number, used: number, limit: number | null) => {
      if (limit && used >= limit * 0.75) {
        return `You've used ${used.toLocaleString()} of your ${limit.toLocaleString()} monthly limit.`;
      }
      return `Your balance is ${balance.toLocaleString()} credits. Consider adding more to avoid interruption.`;
    },
    className: "border-yellow-500/50 bg-yellow-500/10",
  },
  critical: {
    icon: AlertCircle,
    variant: "default" as const,
    title: "Credits Almost Depleted",
    description: (balance: number, used: number, limit: number | null) => {
      if (limit && used >= limit * 0.9) {
        return `You've used ${used.toLocaleString()} of your ${limit.toLocaleString()} monthly limit. Service may be limited soon.`;
      }
      return `Only ${balance.toLocaleString()} credits remaining. Service will pause when credits run out.`;
    },
    className: "border-orange-500/50 bg-orange-500/10",
  },
  exceeded: {
    icon: XCircle,
    variant: "destructive" as const,
    title: "Credit Limit Reached",
    description: (balance: number, used: number, limit: number | null) => {
      if (balance <= 0) {
        return "Your credit balance is empty. Purchase credits to continue using services.";
      }
      if (limit && used >= limit) {
        return `You've reached your monthly limit of ${limit.toLocaleString()} credits. Purchase more or wait for reset.`;
      }
      return "Your credits are depleted. Purchase more to continue.";
    },
    className: "border-destructive/50 bg-destructive/10",
  },
};

export function CreditsLimitWarning({
  currentBalance,
  monthlyUsed,
  monthlyLimit,
  onBuyCredits,
  className,
  dismissable = false,
  onDismiss,
}: CreditsLimitWarningProps) {
  const level = getWarningLevel(currentBalance, monthlyUsed, monthlyLimit);

  if (level === "none") {
    return null;
  }

  const config = warningConfig[level];
  if (!config) {
    return null;
  }

  const Icon = config.icon;

  return (
    <Alert className={cn(config.className, className)} variant={config.variant}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>{config.title}</span>
        {dismissable && onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 -mr-2"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        )}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{config.description(currentBalance, monthlyUsed, monthlyLimit)}</span>
        {onBuyCredits && (
          <Button
            size="sm"
            variant={level === "exceeded" ? "default" : "outline"}
            onClick={onBuyCredits}
            className="shrink-0"
          >
            Buy Credits
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
