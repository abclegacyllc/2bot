"use client";

/**
 * Credits Balance Card
 *
 * Displays the current credit balance with visual indicators.
 * Used on both personal and organization credits pages.
 *
 * @module components/credits/credits-balance-card
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Coins, TrendingDown, TrendingUp } from "lucide-react";

export interface CreditsBalanceCardProps {
  balance: number;
  monthlyUsed: number;
  planLimit: number | null; // -1 or null = unlimited
  lifetime?: number;
  loading?: boolean;
  variant?: "personal" | "organization";
  className?: string;
}

/**
 * Format credits for display (e.g., 125000 -> "125K")
 */
function formatCredits(credits: number): string {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`;
  }
  if (credits >= 1_000) {
    return `${(credits / 1_000).toFixed(1)}K`;
  }
  return credits.toLocaleString();
}

export function CreditsBalanceCard({
  balance,
  monthlyUsed,
  planLimit,
  lifetime = 0,
  loading = false,
  variant = "personal",
  className,
}: CreditsBalanceCardProps) {
  if (loading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-2 w-full mb-2" />
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>
    );
  }

  const usagePercent = planLimit && planLimit > 0 ? Math.min((monthlyUsed / planLimit) * 100, 100) : 0;
  const isLowBalance = balance < 5000;
  const isNearLimit = usagePercent > 80;
  const isUnlimited = planLimit === null || planLimit === -1;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {variant === "organization" ? "Organization Credits" : "Credit Balance"}
        </CardTitle>
        <Coins className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {/* Main Balance */}
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-3xl font-bold",
              isLowBalance && "text-destructive"
            )}
          >
            {formatCredits(balance)}
          </span>
          <span className="text-sm text-muted-foreground">credits</span>
        </div>

        {/* Monthly Usage Progress */}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Monthly Usage</span>
            <span>
              {formatCredits(monthlyUsed)} / {isUnlimited ? "∞" : formatCredits(planLimit)}
            </span>
          </div>
          {!isUnlimited && (
            <Progress
              value={usagePercent}
              className={cn(
                "h-2",
                isNearLimit && "[&>div]:bg-amber-500",
                usagePercent >= 100 && "[&>div]:bg-destructive"
              )}
            />
          )}
        </div>

        {/* Stats Row */}
        <div className="mt-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span>Lifetime: {formatCredits(lifetime)}</span>
          </div>
          {isNearLimit && !isUnlimited && (
            <div className="flex items-center gap-1 text-amber-500">
              <TrendingDown className="h-3 w-3" />
              <span>Near limit</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
