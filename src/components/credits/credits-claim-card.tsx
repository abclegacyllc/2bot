"use client";

/**
 * Credits Claim Card
 *
 * Daily credit claim component for FREE and STARTER plans.
 * Shows claim button, countdown timer, and monthly progress.
 *
 * @module components/credits/credits-claim-card
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/shared/lib/format";
import { CheckCircle2, Clock, Gift, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

export interface ClaimStatus {
  canClaim: boolean;
  creditClaimType: "daily" | "monthly" | "none";
  dailyCreditClaim: number;
  monthlyClaimedTotal: number;
  monthlyClaimCap: number;
  nextClaimTime: string | null;
  lastClaimedAt: string | null;
  monthlyGrantDate: string | null;
  monthlyGrantAmount: number;
}

export interface CreditsClaimCardProps {
  claimStatus: ClaimStatus | null;
  loading?: boolean;
  claiming?: boolean;
  onClaim: () => Promise<void>;
  className?: string;
}

// ===========================================
// Countdown Hook
// ===========================================

function useCountdown(targetDate: string | null) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft(""); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    const target = new Date(targetDate).getTime();

    const update = () => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft("Available now!");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

// ===========================================
// Component
// ===========================================

export function CreditsClaimCard({
  claimStatus,
  loading = false,
  claiming = false,
  onClaim,
  className,
}: CreditsClaimCardProps) {
  const countdown = useCountdown(claimStatus?.nextClaimTime ?? null);
  const [justClaimed, setJustClaimed] = useState(false);

  const handleClaim = useCallback(async () => {
    try {
      await onClaim();
      setJustClaimed(true);
      setTimeout(() => setJustClaimed(false), 3000);
    } catch {
      // Error handled by parent
    }
  }, [onClaim]);

  // Don't render for monthly/none plans
  if (!loading && claimStatus && claimStatus.creditClaimType !== "daily") {
    return null;
  }

  if (loading || !claimStatus) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full mb-4" />
          <Skeleton className="h-2 w-full mb-2" />
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>
    );
  }

  const { canClaim, dailyCreditClaim, monthlyClaimedTotal, monthlyClaimCap } =
    claimStatus;

  const progressPercent =
    monthlyClaimCap > 0
      ? Math.min((monthlyClaimedTotal / monthlyClaimCap) * 100, 100)
      : 0;

  const capReached = monthlyClaimedTotal >= monthlyClaimCap;

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        canClaim && "ring-1 ring-primary/20 shadow-sm shadow-primary/5",
        className
      )}
    >
      {/* Subtle gradient for available claims */}
      {canClaim ? <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" /> : null}

      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Daily Reward</CardTitle>
        <Gift
          className={cn(
            "h-4 w-4",
            canClaim ? "text-primary" : "text-muted-foreground"
          )}
        />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Claim Button Area */}
        <div className="flex items-center gap-3">
          {justClaimed ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">
                +{dailyCreditClaim} credits claimed!
              </span>
            </div>
          ) : canClaim ? (
            <Button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full gap-2"
              size="lg"
            >
              {claiming ? (
                <>
                  <Sparkles className="h-4 w-4 animate-spin" />
                  Claiming...
                </>
              ) : (
                <>
                  <Gift className="h-4 w-4" />
                  Claim {dailyCreditClaim} Credits
                </>
              )}
            </Button>
          ) : capReached ? (
            <div className="flex items-center gap-2 text-muted-foreground w-full justify-center py-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">Monthly cap reached — resets next month</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground w-full justify-center py-2">
              <Clock className="h-4 w-4" />
              <span className="text-sm">
                Next claim in{" "}
                <span className="font-medium text-foreground">{countdown}</span>
              </span>
            </div>
          )}
        </div>

        {/* Monthly Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Monthly Progress</span>
            <span>
              {formatCredits(monthlyClaimedTotal)} /{" "}
              {formatCredits(monthlyClaimCap)}
            </span>
          </div>
          <Progress
            value={progressPercent}
            className={cn(
              "h-2",
              capReached && "[&>div]:bg-green-500"
            )}
          />
          <p className="text-[11px] text-muted-foreground">
            {dailyCreditClaim} credits per day · Claim daily to earn up to{" "}
            {formatCredits(monthlyClaimCap)} credits/month
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
