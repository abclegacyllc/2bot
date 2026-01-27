"use client";

/**
 * Upgrade Prompt Component
 *
 * Displays contextual upgrade suggestions based on the
 * resource limit that was hit. Shows relevant plan benefits
 * and a CTA to view pricing.
 *
 * @module components/quota/upgrade-prompt
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

type ResourceType =
  | "executions"
  | "gateways"
  | "plugins"
  | "workflows"
  | "storage"
  | "team_members";

interface UpgradePromptProps {
  resource: ResourceType;
  currentPlan?: string;
  suggestedPlan?: string;
  currentLimit?: number;
  suggestedLimit?: number | null; // null = unlimited
  pricingUrl?: string;
  onUpgrade?: () => void;
  variant?: "card" | "inline" | "compact";
  className?: string;
}

// Resource-specific messaging
const RESOURCE_MESSAGES: Record<
  ResourceType,
  { title: string; benefits: string[] }
> = {
  executions: {
    title: "Need more workflow executions?",
    benefits: [
      "Higher monthly execution limits",
      "Priority execution queue",
      "Advanced analytics",
    ],
  },
  gateways: {
    title: "Unlock more AI gateways",
    benefits: [
      "Connect more AI providers",
      "Load balancing across gateways",
      "Custom routing rules",
    ],
  },
  plugins: {
    title: "Expand your plugin library",
    benefits: [
      "Install unlimited plugins",
      "Access premium plugins",
      "Custom plugin development",
    ],
  },
  workflows: {
    title: "Build more workflows",
    benefits: [
      "Unlimited workflow creation",
      "Advanced workflow templates",
      "Workflow versioning",
    ],
  },
  storage: {
    title: "Need more storage?",
    benefits: [
      "Increased file storage",
      "Longer log retention",
      "Export capabilities",
    ],
  },
  team_members: {
    title: "Grow your team",
    benefits: [
      "Add more team members",
      "Role-based permissions",
      "Team collaboration tools",
    ],
  },
};

// Format limit for display
function formatLimit(limit: number | null | undefined): string {
  if (limit === null || limit === undefined) return "Unlimited";
  if (limit >= 1_000_000) return `${(limit / 1_000_000).toFixed(0)}M`;
  if (limit >= 1_000) return `${(limit / 1_000).toFixed(0)}K`;
  return limit.toString();
}

export function UpgradePrompt({
  resource,
  currentPlan = "Free",
  suggestedPlan,
  currentLimit,
  suggestedLimit,
  pricingUrl = "/billing",
  onUpgrade,
  variant = "card",
  className,
}: UpgradePromptProps) {
  const messages = RESOURCE_MESSAGES[resource];

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 p-3",
          className
        )}
      >
        <Zap className="h-5 w-5 text-primary" />
        <p className="flex-1 text-sm font-medium">{messages.title}</p>
        <Link href={pricingUrl}>
          <Button size="sm" onClick={onUpgrade}>
            Upgrade
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4",
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{messages.title}</p>
            <p className="text-sm text-muted-foreground">
              {suggestedPlan
                ? `Upgrade to ${suggestedPlan} for ${formatLimit(suggestedLimit)} ${resource.replace("_", " ")}`
                : `Upgrade for more ${resource.replace("_", " ")}`}
            </p>
          </div>
        </div>
        <Link href={pricingUrl}>
          <Button onClick={onUpgrade}>
            View Plans
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  // Card variant (default)
  return (
    <div
      className={cn(
        "rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
          <Zap className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{messages.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your {currentPlan} plan includes {formatLimit(currentLimit)}{" "}
            {resource.replace("_", " ")}.
            {suggestedPlan &&
              ` ${suggestedPlan} gives you ${formatLimit(suggestedLimit)}.`}
          </p>
        </div>
      </div>

      {/* Benefits */}
      <ul className="mt-4 space-y-2">
        {messages.benefits.map((benefit, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            {benefit}
          </li>
        ))}
      </ul>

      {/* Comparison if we have both limits */}
      {currentLimit !== undefined && suggestedLimit !== undefined && (
        <div className="mt-4 flex items-center gap-4 rounded-lg bg-muted/50 p-3">
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">{currentPlan}</p>
            <p className="text-lg font-bold">{formatLimit(currentLimit)}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1 text-center">
            <p className="text-xs text-primary">{suggestedPlan}</p>
            <p className="text-lg font-bold text-primary">
              {formatLimit(suggestedLimit)}
            </p>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-6 flex gap-3">
        <Link href={pricingUrl} className="flex-1">
          <Button className="w-full" onClick={onUpgrade}>
            <Sparkles className="mr-2 h-4 w-4" />
            View Upgrade Options
          </Button>
        </Link>
      </div>
    </div>
  );
}
