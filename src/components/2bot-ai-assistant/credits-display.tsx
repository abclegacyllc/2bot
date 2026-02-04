/**
 * 2Bot AI Assistant Widget - Credits Display
 *
 * Shows current credit usage or balance in the widget header.
 * 
 * Terminology:
 * - CREDITS: The universal currency for AI usage.
 * - TOKENS: Deprecated term, replaced by credits.
 *
 * @module components/2bot-ai-assistant/credits-display
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap } from "lucide-react";

interface CreditDisplayProps {
  used?: number;
  limit?: number;
  balance?: number | null; // For future credits
  loading?: boolean;
  compact?: boolean;
}

// Keep old interface for backward compatibility
export interface CreditsDisplayProps extends CreditDisplayProps {}

/**
 * Display credit usage (current) or balance (future)
 */
export function CreditsDisplay({ used = 0, limit = 0, balance, loading, compact }: CreditDisplayProps) {
  if (loading) {
    return <Skeleton className="h-6 w-20" />;
  }

  // Credit mode - show usage vs limit
  const formatted = formatCredits(used);
  // limit is often -1 for unlimited or 0 if not set.
  // If limit is -1, we show infinity symbol
  const limitFormatted = limit === -1 ? "∞" : formatCredits(limit);
  
  // Calculate percentage only if limit is valid and > 0
  const percentage = (limit === -1 || limit === 0) ? 0 : Math.min(100, (used / limit) * 100);
  
  // Visual states
  // If limit is -1 (unlimited), never show low/exceeded alerts based on usage
  const isLow = limit !== -1 && limit > 0 && percentage > 80;
  const isExceeded = limit !== -1 && limit > 0 && used >= limit;

  if (compact) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant={isExceeded ? "destructive" : isLow ? "outline" : "secondary"} 
              className="gap-1 cursor-help"
            >
              <Zap className="h-3 w-3" />
              {formatted}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              <span className="font-medium">{used.toLocaleString()}</span> / {limit === -1 ? "Unlimited" : limit.toLocaleString()} credits
            </p>
            {limit !== -1 && limit > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {Math.round(percentage)}% used this month
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Zap className="h-4 w-4 text-muted-foreground" />
      <span className={isExceeded ? "text-destructive" : isLow ? "text-yellow-600" : "text-muted-foreground"}>
        {formatted} / {limitFormatted} credits
      </span>
    </div>
  );
}

function formatCredits(credits: number): string {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`;
  }
  if (credits >= 1_000) {
    return `${(credits / 1_000).toFixed(1)}K`;
  }
  return credits.toString();
}

/**
 * @deprecated Use CreditsDisplay instead
 */
export const TokenDisplay = CreditsDisplay;
