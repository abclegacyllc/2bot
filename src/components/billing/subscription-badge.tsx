"use client";

/**
 * Subscription Badge Component
 *
 * Displays subscription plan badge and alerts for subscription status.
 * Used in dashboard header/sidebar to show current plan status.
 *
 * @module components/billing/subscription-badge
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, Building, Crown, Star, Zap } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

interface SubscriptionInfo {
  plan: string;
  status: "active" | "past_due" | "canceled" | "none";
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.subscription;
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const planIcons: Record<string, React.ElementType> = {
  FREE: Zap,
  STARTER: Zap,
  PRO: Star,
  BUSINESS: Building,
  ENTERPRISE: Crown,
};

const planColors: Record<string, string> = {
  FREE: "bg-slate-500",
  STARTER: "bg-blue-500",
  PRO: "bg-purple-500",
  BUSINESS: "bg-amber-500",
  ENTERPRISE: "bg-gradient-to-r from-purple-500 to-pink-500",
};

const statusColors: Record<string, string> = {
  active: "bg-green-500",
  past_due: "bg-yellow-500",
  canceled: "bg-red-500",
  none: "bg-slate-500",
};

/**
 * SubscriptionBadge
 *
 * Displays the current subscription plan as a badge.
 * Suitable for header/sidebar display.
 */
export function SubscriptionBadge({
  className,
  showStatus = false,
}: {
  className?: string;
  showStatus?: boolean;
}) {
  const { data: subscription } = useSWR<SubscriptionInfo>(
    "/api/billing/subscription",
    fetcher
  );

  if (!subscription) return null;

  const Icon = planIcons[subscription.plan] || Zap;
  const bgColor = planColors[subscription.plan] || planColors.FREE;

  return (
    <Badge
      className={cn(
        "text-white flex items-center gap-1",
        bgColor,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {subscription.plan}
      {showStatus && subscription.status !== "none" && (
        <span
          className={cn(
            "ml-1 h-2 w-2 rounded-full",
            statusColors[subscription.status]
          )}
        />
      )}
    </Badge>
  );
}

/**
 * SubscriptionStatusDot
 *
 * A small dot indicator for subscription status.
 */
export function SubscriptionStatusDot({ className }: { className?: string }) {
  const { data: subscription } = useSWR<SubscriptionInfo>(
    "/api/billing/subscription",
    fetcher
  );

  if (!subscription || subscription.status === "none") return null;

  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        statusColors[subscription.status],
        className
      )}
      title={`Status: ${subscription.status}`}
    />
  );
}

/**
 * SubscriptionAlert
 *
 * Displays alerts for problematic subscription states.
 * Shows:
 * - Past due payment warnings
 * - Subscription cancellation notices
 */
export function SubscriptionAlert({ className }: { className?: string }) {
  const { data: subscription } = useSWR<SubscriptionInfo>(
    "/api/billing/subscription",
    fetcher
  );

  if (!subscription) return null;

  const handleManageBilling = async () => {
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Failed to open billing portal:", error);
    }
  };

  // Past due payment alert
  if (subscription.status === "past_due") {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Payment Failed</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>
            Please update your payment method to continue using the service.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-4"
            onClick={handleManageBilling}
          >
            Update Payment
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Subscription ending alert
  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
    return (
      <Alert className={cn("border-yellow-500/50 bg-yellow-500/10", className)}>
        <AlertCircle className="h-4 w-4 text-yellow-500" />
        <AlertTitle className="text-yellow-500">Subscription Ending</AlertTitle>
        <AlertDescription className="text-yellow-400/80 flex items-center justify-between">
          <span>
            Your {subscription.plan} subscription will end on{" "}
            {formatDate(subscription.currentPeriodEnd)}.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-4 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
            onClick={handleManageBilling}
          >
            Resume
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

/**
 * UpgradeBanner
 *
 * A compact banner suggesting plan upgrade for free users.
 */
export function UpgradeBanner({ className }: { className?: string }) {
  const { data: subscription } = useSWR<SubscriptionInfo>(
    "/api/billing/subscription",
    fetcher
  );

  if (!subscription || subscription.plan !== "FREE") return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border border-purple-500/30 bg-purple-900/20 px-4 py-2",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        <Zap className="h-4 w-4 text-purple-400" />
        <span className="text-slate-300">
          Unlock more features with a paid plan
        </span>
      </div>
      <Link href="/dashboard/settings/billing/upgrade">
        <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
          Upgrade
        </Button>
      </Link>
    </div>
  );
}

export default SubscriptionBadge;
