"use client";

/**
 * Plan Comparison Mini Component
 *
 * A compact side-by-side comparison of current plan vs
 * suggested upgrade, highlighting the key differences.
 *
 * @module components/quota/plan-comparison-mini
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import Link from "next/link";

interface PlanFeature {
  name: string;
  current: string | number | boolean | null;
  suggested: string | number | boolean | null;
  highlight?: boolean;
}

interface PlanComparisonMiniProps {
  currentPlan: string;
  suggestedPlan: string;
  currentPrice?: number;
  suggestedPrice?: number;
  billingPeriod?: "monthly" | "yearly";
  features: PlanFeature[];
  pricingUrl?: string;
  onUpgrade?: () => void;
  className?: string;
}

// Format feature value
function formatValue(value: string | number | boolean | null): React.ReactNode {
  if (value === null || value === undefined) return <X className="h-4 w-4 text-muted-foreground" />;
  if (value === true) return <Check className="h-4 w-4 text-green-500" />;
  if (value === false) return <X className="h-4 w-4 text-muted-foreground" />;
  if (typeof value === "number") {
    if (value === -1 || value === Infinity) return "Unlimited";
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return value.toLocaleString();
  }
  return value;
}

// Format price
function formatPrice(price: number, period: "monthly" | "yearly"): string {
  if (price === 0) return "Free";
  return `$${price}/${period === "yearly" ? "yr" : "mo"}`;
}

export function PlanComparisonMini({
  currentPlan,
  suggestedPlan,
  currentPrice = 0,
  suggestedPrice = 0,
  billingPeriod = "monthly",
  features,
  pricingUrl = "/billing",
  onUpgrade,
  className,
}: PlanComparisonMiniProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="grid grid-cols-[1fr,1fr,1fr] gap-0">
        <div className="p-4 bg-muted/30 border-b" />
        <div className="p-4 border-b border-l text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Current
          </p>
          <p className="mt-1 font-semibold">{currentPlan}</p>
          <p className="text-sm text-muted-foreground">
            {formatPrice(currentPrice, billingPeriod)}
          </p>
        </div>
        <div className="p-4 border-b border-l text-center bg-primary/5 relative">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2">
            <span className="bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded-b-md">
              Recommended
            </span>
          </div>
          <p className="text-xs text-primary uppercase tracking-wider mt-2">
            Upgrade
          </p>
          <p className="mt-1 font-semibold text-primary">{suggestedPlan}</p>
          <p className="text-sm text-muted-foreground">
            {formatPrice(suggestedPrice, billingPeriod)}
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="divide-y">
        {features.map((feature, i) => (
          <div
            key={i}
            className={cn(
              "grid grid-cols-[1fr,1fr,1fr] gap-0",
              feature.highlight && "bg-yellow-50/50 dark:bg-yellow-950/20"
            )}
          >
            <div className="p-3 text-sm flex items-center">
              {feature.name}
              {feature.highlight && (
                <Sparkles className="ml-1 h-3 w-3 text-yellow-500" />
              )}
            </div>
            <div className="p-3 border-l text-sm text-center flex items-center justify-center text-muted-foreground">
              {formatValue(feature.current)}
            </div>
            <div className="p-3 border-l text-sm text-center flex items-center justify-center font-medium bg-primary/5">
              {formatValue(feature.suggested)}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="p-4 border-t bg-muted/30">
        <Link href={pricingUrl}>
          <Button className="w-full" onClick={onUpgrade}>
            Upgrade to {suggestedPlan}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Cancel anytime • Pro-rated billing
        </p>
      </div>
    </div>
  );
}

// Helper to build features from plan limits
export function buildComparisonFeatures(
  currentLimits: Record<string, number | boolean | null>,
  suggestedLimits: Record<string, number | boolean | null>,
  highlightKeys: string[] = []
): PlanFeature[] {
  const featureNames: Record<string, string> = {
    executions: "Monthly Executions",
    gateways: "AI Gateways",
    plugins: "Plugins",
    workflows: "Workflows",
    team_members: "Team Members",
    storage_gb: "Storage (GB)",
    log_retention_days: "Log Retention",
    priority_support: "Priority Support",
    sso: "SSO / SAML",
    audit_logs: "Audit Logs",
    custom_domain: "Custom Domain",
  };

  return Object.keys(currentLimits)
    .filter((key) => featureNames[key])
    .map((key) => ({
      name: featureNames[key] || key,
      current: currentLimits[key] ?? null,
      suggested: suggestedLimits[key] ?? null,
      highlight: highlightKeys.includes(key),
    }));
}
