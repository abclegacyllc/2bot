"use client";

/**
 * Credits Balance Display
 *
 * Compact display of current credit balance for header/navbar.
 * Shows balance and links to credits page.
 *
 * @module components/credits/credits-balance-display
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/shared/config/urls";
import { AlertTriangle, Coins } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface CreditsBalanceDisplayProps {
  className?: string;
  variant?: "default" | "compact";
}

export type { CreditsBalanceDisplayProps };

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

export function CreditsBalanceDisplay({
  className,
  variant = "default",
}: CreditsBalanceDisplayProps) {
  const { context, user, availableOrgs, token } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Determine if we're in org context
  const isOrgContext = context.type === "organization";
  const orgId = context.organizationId;
  const currentOrg = isOrgContext
    ? availableOrgs.find((o) => o.id === orgId)
    : null;
  const orgSlug = currentOrg?.slug || orgId || "";

  // Build credits page link
  const creditsLink = isOrgContext
    ? `/organizations/${orgSlug}/credits`
    : "/credits";

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!user || !token) return;

    try {
      setLoading(true);
      const endpoint = isOrgContext && orgId
        ? apiUrl(`/orgs/${orgId}/credits`)
        : apiUrl("/credits");

      const response = await fetch(endpoint, {
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBalance(data.data?.balance ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch credits balance:", err);
    } finally {
      setLoading(false);
    }
  }, [user, token, isOrgContext, orgId]);

  useEffect(() => {
    fetchBalance();
    // Refresh every 60 seconds
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  // Determine warning state (thresholds scaled for 1 credit = $0.001)
  const isLowBalance = balance !== null && balance < 50;
  const isCritical = balance !== null && balance < 10;

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 animate-pulse",
          className
        )}
      >
        <Coins className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">---</span>
      </div>
    );
  }

  if (balance === null) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={creditsLink}>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "gap-1.5 px-2 py-1 h-auto",
                isCritical && "text-destructive hover:text-destructive",
                isLowBalance && !isCritical && "text-yellow-500 hover:text-yellow-600",
                className
              )}
            >
              {isCritical ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Coins className="h-4 w-4" />
              )}
              <span className="text-sm font-medium">
                {formatCredits(balance)}
              </span>
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>
            {isOrgContext ? "Organization" : "Personal"} Credits:{" "}
            {balance.toLocaleString()}
          </p>
          {isCritical && (
            <p className="text-destructive text-xs">Credits critically low!</p>
          )}
          {isLowBalance && !isCritical && (
            <p className="text-yellow-500 text-xs">Credits running low</p>
          )}
          <p className="text-muted-foreground text-xs">Click to manage</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
