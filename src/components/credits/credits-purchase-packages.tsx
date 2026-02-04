"use client";

/**
 * Credits Purchase Packages
 *
 * Grid of available credit packages for purchase.
 * Used on both personal and organization credits pages.
 *
 * @module components/credits/credits-purchase-packages
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  pricePerCredit?: number; // Computed if not provided
  popular?: boolean;
}

export interface CreditsPurchasePackagesProps {
  packages: CreditPackage[];
  loading?: boolean;
  purchasing?: string; // ID of package being purchased
  onPurchase?: (packageId: string) => void;
  variant?: "personal" | "organization";
  className?: string;
}

/**
 * Format credits for display
 */
function formatCredits(credits: number): string {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`;
  }
  if (credits >= 1_000) {
    return `${Math.round(credits / 1_000)}K`;
  }
  return credits.toLocaleString();
}

export function CreditsPurchasePackages({
  packages,
  loading = false,
  purchasing,
  onPurchase,
  variant = "personal",
  className,
}: CreditsPurchasePackagesProps) {
  if (loading) {
    return (
      <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-32" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-10 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
          No packages available
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}>
      {packages.map((pkg) => {
        const isPurchasing = purchasing === pkg.id;
        const pricePerCredit = pkg.pricePerCredit ?? pkg.price / pkg.credits;
        const firstPricePerCredit = packages[0]?.pricePerCredit ?? (packages[0]?.price ?? 0) / (packages[0]?.credits ?? 1);
        const savingsPercent =
          packages.length > 1 && firstPricePerCredit > 0
            ? Math.round(
                ((firstPricePerCredit - pricePerCredit) /
                  firstPricePerCredit) *
                  100
              )
            : 0;

        return (
          <Card
            key={pkg.id}
            className={cn(
              "relative transition-shadow hover:shadow-md",
              pkg.popular && "border-primary"
            )}
          >
            {pkg.popular && (
              <Badge className="absolute -top-2 right-4 gap-1">
                <Sparkles className="h-3 w-3" />
                Most Popular
              </Badge>
            )}

            <CardHeader>
              <CardTitle className="text-lg">{pkg.name}</CardTitle>
              <CardDescription>
                <span className="text-3xl font-bold text-foreground">
                  ${pkg.price}
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span>{formatCredits(pkg.credits)} credits</span>
              </div>
              {savingsPercent > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  <span>Save {savingsPercent}%</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                ${(pkg.price / pkg.credits * 1000).toFixed(2)} per 1K credits
              </p>
            </CardContent>

            <CardFooter>
              <Button
                className="w-full"
                variant={pkg.popular ? "default" : "outline"}
                onClick={() => onPurchase?.(pkg.id)}
                disabled={isPurchasing || !onPurchase}
              >
                {isPurchasing ? "Processing..." : "Buy Now"}
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
