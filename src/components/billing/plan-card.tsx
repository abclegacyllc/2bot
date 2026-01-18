"use client";

/**
 * Plan Card Component
 *
 * Reusable card component for displaying subscription plan details.
 *
 * @module components/billing/plan-card
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
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface PlanInfo {
  id: string;
  name: string;
  price: number;
  description: string;
  popular?: boolean;
  features: (string | PlanFeature)[];
}

interface PlanCardProps {
  plan: PlanInfo;
  current?: boolean;
  onSelect?: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function PlanCard({
  plan,
  current = false,
  onSelect,
  loading = false,
  disabled = false,
  className,
}: PlanCardProps) {
  // Normalize features to PlanFeature format
  const features: PlanFeature[] = plan.features.map((f) =>
    typeof f === "string" ? { text: f, included: true } : f
  );

  return (
    <Card
      className={cn(
        "relative border-slate-800 bg-slate-900/50 transition-all duration-200",
        plan.popular &&
          "border-purple-500 shadow-lg shadow-purple-500/20 scale-105 z-10",
        current && "bg-slate-800/50",
        className
      )}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-purple-600 text-white">Most Popular</Badge>
        </div>
      )}

      <CardHeader className="text-center pt-8">
        <CardTitle className="text-white text-xl">{plan.name}</CardTitle>
        <CardDescription className="text-slate-400">
          {plan.description}
        </CardDescription>
        <div className="mt-4">
          <span className="text-4xl font-bold text-white">${plan.price}</span>
          <span className="text-slate-400">/month</span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li
              key={index}
              className={cn(
                "flex items-center gap-3 text-sm",
                feature.included ? "text-slate-300" : "text-slate-500"
              )}
            >
              <Check
                className={cn(
                  "h-4 w-4 flex-shrink-0",
                  feature.included
                    ? plan.popular
                      ? "text-purple-400"
                      : "text-green-500"
                    : "text-slate-600"
                )}
              />
              {feature.text}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="pt-4">
        <Button
          className={cn(
            "w-full",
            plan.popular
              ? "bg-purple-600 hover:bg-purple-700"
              : current
                ? "bg-slate-700 cursor-not-allowed"
                : "bg-slate-800 hover:bg-slate-700"
          )}
          variant={current ? "outline" : "default"}
          disabled={current || loading || disabled}
          onClick={onSelect}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : current ? (
            "Current Plan"
          ) : (
            "Select Plan"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default PlanCard;
